import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { ConstructCommand } from "../actions.ts";
import type { SavedConstruct } from "../codec.ts";
import type { Construct } from "../construct.ts";
import { ConstructLabBout, type ConstructLabStepSample } from "../lab-bout.ts";
import { CONSTRUCT_STUCK_WINDOW_STEPS } from "../lab-config.ts";
import { classifyConstructStuck, type ConstructActionProgressSample } from "../lab-report.ts";
import { constructEngagementReward, type ConstructLearningStage, type ConstructStageMetrics } from "./schedule.ts";
import { encodeConstructObservation, type ConstructGraphObservation } from "./observation.ts";
import { mirrorConstructCapabilities, mirrorConstructCommand, mirrorConstructControlGraph } from "./mirror.ts";
import { mirrorConstructObservation } from "./observation.ts";
import { clippedPpoSurrogate, fixedStepReturns } from "./ppo.ts";
import { decideConstructPolicy, scoreConstructPolicyCommand, seededConstructRandom,
  type ConstructPolicyDecision } from "./policy.ts";
import { CONSTRUCT_NETWORK_WEIGHT_COUNT, type ConstructNetworkWeights } from "./network.ts";
import { ConstructTeacherRecorder } from "./teacher.ts";
import { installedSensorsForBlueprint, jointSensorChannels } from "../sensors.ts";
import { WARDEN_SENSORS } from "../warden.ts";
import { constructInitialCondition } from "../matchup.ts";

export interface ConstructLearningJobSpec {
  readonly stage: Exclude<ConstructLearningStage, "authored">;
  readonly morphology: string;
  readonly mirrored: boolean;
  readonly steps: number;
  readonly candidate?: string;
  readonly controller?: "policy" | "authored";
  readonly opponent?: string;
  readonly scenarioKey?: string;
  readonly scenarioSeed?: number;
}

export interface ConstructLearningShardResult {
  readonly gradient: readonly number[];
  readonly metrics: ConstructStageMetrics & Readonly<{
    stage: Exclude<ConstructLearningStage, "authored">;
    morphology: string;
    score: number;
    loss: number;
    decisions: number;
    schedulerAdmissions: number;
    candidate: string;
    commandDigestRows: readonly string[];
  }>;
}

interface PolicyBoundary {
  readonly observation: ConstructGraphObservation;
  readonly capabilities: ReturnType<Construct["state"]["capabilities"]>;
  readonly decision: ConstructPolicyDecision;
}

const commandKey = (command: ConstructCommand): string => JSON.stringify(command.requests.map(({ request }) => ({
  action: request.action,
  parameters: request.parameters,
})));

const learningCommand = (command: ConstructCommand): ConstructCommand => Object.freeze({
  version: 1,
  requests: Object.freeze(command.requests.map(({ request }, sourceIndex) => Object.freeze({
    request,
    priority: 0,
    sourceIndex,
  }))),
});

/** Live graph adapter. IDs are joins only; every dynamic row comes from physical state or an installed sensor. */
export class ConstructLearningObservationAdapter {
  private readonly construct: Construct;
  private readonly saved: SavedConstruct;
  private readonly sensors: ReturnType<typeof installedSensorsForBlueprint>;

  constructor(construct: Construct, saved: SavedConstruct) {
    this.construct = construct;
    this.saved = saved;
    this.sensors = installedSensorsForBlueprint(saved.blueprint, WARDEN_SENSORS);
  }

  observe(_dt: number): ConstructGraphObservation {
    const angles: Record<string, number> = {};
    const speeds: Record<string, number> = {};
    for (const joint of this.saved.blueprint.joints) {
      for (const channel of jointSensorChannels(joint)) {
        angles[channel.angle] = this.construct.control.sensors.read(channel.angle).value as number;
        speeds[channel.speed] = this.construct.control.sensors.read(channel.speed).value as number;
      }
    }
    const sensors = this.sensors.filter((sensor) => this.construct.control.sensors.has(sensor.id))
      .map((sensor) => this.construct.control.sensors.read(sensor.id));
    const core = this.construct.runtime.part(this.saved.blueprint.rootPart);
    const inverse = Quaternion.Inverse(core.node.rotationQuaternion ?? Quaternion.Identity());
    const relativePosition: Record<string, readonly [number, number, number]> = {};
    const linearVelocity: Record<string, readonly [number, number, number]> = {};
    const angularVelocity: Record<string, readonly [number, number, number]> = {};
    const localForward: Record<string, readonly [number, number, number]> = {};
    const localUp: Record<string, readonly [number, number, number]> = {};
    for (const part of this.construct.runtime.parts.values()) {
      const position = part.node.position.subtract(core.node.position).rotateByQuaternionToRef(inverse, new Vector3());
      const linear = part.body.getLinearVelocity().rotateByQuaternionToRef(inverse, new Vector3());
      const angular = part.body.getAngularVelocity().rotateByQuaternionToRef(inverse, new Vector3());
      const relativeRotation = inverse.multiply(part.node.rotationQuaternion ?? Quaternion.Identity()).normalize();
      const forward = Vector3.Forward().rotateByQuaternionToRef(relativeRotation, new Vector3());
      const up = Vector3.Up().rotateByQuaternionToRef(relativeRotation, new Vector3());
      relativePosition[part.id] = [position.x, position.y, position.z];
      linearVelocity[part.id] = [linear.x, linear.y, linear.z];
      angularVelocity[part.id] = [angular.x, angular.y, angular.z];
      localForward[part.id] = [forward.x, forward.y, forward.z];
      localUp[part.id] = [up.x, up.y, up.z];
    }
    const hardware = this.construct.state.hardware();
    const power = this.saved.blueprint.modules.find((module) => module.kind === "power-core");
    const launcher = this.saved.blueprint.modules.find((module) => module.kind === "launcher");
    const ammunitionFraction = Object.freeze(Object.fromEntries(this.saved.blueprint.modules
      .filter((module) => module.kind === "magazine")
      .map((module) => [module.id, (hardware.resources.ammunition[module.id] ?? 0) / (module.ammunition as number)])));
    const facts = this.construct.control.snapshot().facts;
    return encodeConstructObservation(this.saved.blueprint, this.saved.control, this.sensors, {
      partHealth: Object.freeze(Object.fromEntries(this.saved.blueprint.parts.map(({ id }) =>
        [id, this.construct.state.partHealth(id)]))),
      attachedParts: new Set([...this.construct.runtime.parts.values()].filter(({ attached }) => attached).map(({ id }) => id)),
      jointIntegrity: Object.freeze(Object.fromEntries(this.saved.blueprint.joints.map(({ id }) =>
        [id, this.construct.state.jointIntegrity(id)]))),
      jointAngleRad: Object.freeze(angles),
      jointSpeedRadS: Object.freeze(speeds),
      installedModules: this.construct.state.damage.installedModules(),
      sensors,
      capabilities: this.construct.state.capabilities(this.saved.control),
      partRelativePositionM: Object.freeze(relativePosition),
      partLinearVelocityMps: Object.freeze(linearVelocity),
      partAngularVelocityRadS: Object.freeze(angularVelocity),
      partLocalForward: Object.freeze(localForward),
      partLocalUp: Object.freeze(localUp),
      moduleHealth: Object.freeze(Object.fromEntries(this.saved.blueprint.modules.map(({ id }) =>
        [id, this.construct.state.moduleHealth(id)]))),
      moduleContact: new Set(this.saved.blueprint.modules.filter(({ id }) => facts[`contact:${id}`] === true).map(({ id }) => id)),
      resourceChargeFraction: power ? hardware.resources.chargeJ / (power.capacityJ as number) : 0,
      resourceHeatFraction: launcher ? hardware.resources.heatJ / (launcher.maxHeatJ as number) : 0,
      ammunitionFraction,
      activeActions: new Set(this.construct.control.snapshot().active.map(({ action, group }) => `${action}/${group}`)),
    });
  }
}

export function installConstructGraphPolicy(
  construct: Construct,
  saved: SavedConstruct,
  weights: ConstructNetworkWeights,
  seed: number,
  decisionEverySteps = 24,
  mirrored = false,
): readonly PolicyBoundary[] {
  if (!Number.isSafeInteger(decisionEverySteps) || decisionEverySteps <= 0) {
    throw new Error("construct policy decision cadence must be a positive integer");
  }
  const adapter = new ConstructLearningObservationAdapter(construct, saved);
  const policyControl = mirrored ? mirrorConstructControlGraph(saved.control, saved.blueprint) : saved.control;
  const random = seededConstructRandom(seed);
  const boundaries: PolicyBoundary[] = [];
  let step = 0;
  let command: ConstructCommand = Object.freeze({ version: 1, requests: Object.freeze([]) });
  construct.control.installCommandSource("construct-graph-policy", (dt) => {
    if (step % decisionEverySteps === 0) {
      const physicalObservation = adapter.observe(dt);
      const physicalCapabilities = construct.state.capabilities(saved.control);
      const observation = mirrored ? mirrorConstructObservation(physicalObservation) : physicalObservation;
      const capabilities = mirrored ? mirrorConstructCapabilities(physicalCapabilities, saved.control, saved.blueprint) :
        physicalCapabilities;
      const decision = decideConstructPolicy(observation, policyControl, capabilities, weights,
        { stochastic: true, random });
      command = mirrored ? mirrorConstructCommand(decision.command, saved.control, saved.blueprint) : decision.command;
      boundaries.push(Object.freeze({ observation, capabilities, decision }));
    }
    step += 1;
    return command;
  });
  return boundaries;
}

const perturbation = (seed: number): readonly number[] => {
  let state = seed >>> 0;
  return Object.freeze(Array.from({ length: CONSTRUCT_NETWORK_WEIGHT_COUNT }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state & 1) === 0 ? -1 : 1;
  }));
};

const shifted = (weights: ConstructNetworkWeights, direction: readonly number[], amount: number): ConstructNetworkWeights =>
  Object.freeze({ values: Object.freeze(weights.values.map((value, index) => value + direction[index] * amount)) });

const spsaGradient = (plus: number, minus: number, direction: readonly number[], epsilon: number): readonly number[] => {
  const scale = (plus - minus) / (2 * epsilon);
  if (!Number.isFinite(scale)) throw new Error("construct learning objective produced a non-finite gradient scale");
  return Object.freeze(direction.map((sign) => scale * sign));
};

export const constructPpoLoss = (rows: readonly PolicyBoundary[], control: SavedConstruct["control"],
  weights: ConstructNetworkWeights, returns: readonly number[]): number => {
  if (!rows.length) return 100;
  let policyObjective = 0;
  let valueLoss = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rescored = scoreConstructPolicyCommand(row.observation, control, row.capabilities, weights, row.decision.command);
    const advantage = returns[index] - row.decision.value;
    policyObjective += clippedPpoSurrogate(row.decision.logProbability, rescored.logProbability, advantage);
    const valueError = rescored.value - returns[index];
    valueLoss += 0.5 * valueError * valueError;
  }
  // The policy and value heads share the graph encoder, but each must own a measured term.
  // Omitting this term let SPSA assign policy noise to value-only weights while never fitting
  // the fixed-step return the value head is meant to predict.
  return (-policyObjective + 0.5 * valueLoss) / rows.length;
};

const finiteCommand = (command: ConstructCommand): boolean => command.requests.every(({ request }) =>
  Object.values(request.parameters).every((value) => typeof value !== "number" || Number.isFinite(value)));

/** One physical shard. BC labels and PPO trajectories both come from ConstructLabBout. */
export function runConstructLearningShard(
  scene: Scene,
  job: Readonly<{ index: number; seed: number; spec: ConstructLearningJobSpec }>,
  candidate: SavedConstruct,
  opponent: SavedConstruct,
  weights: ConstructNetworkWeights,
): ConstructLearningShardResult {
  const rolloutSeed = job.spec.scenarioSeed ?? job.seed;
  const policySide = job.spec.mirrored ? "right" : "left";
  const bout = new ConstructLabBout(scene, job.spec.mirrored ? opponent : candidate,
    job.spec.mirrored ? candidate : opponent, WARDEN_SENSORS, 3.8, 0,
    constructInitialCondition(rolloutSeed, job.spec.mirrored));
  const candidateSide = policySide;
  const candidateSaved = candidate;
  const candidateBody = bout.construct(candidateSide);
  const adapter = new ConstructLearningObservationAdapter(candidateBody, candidateSaved);
  const teacher = new ConstructTeacherRecorder();
  const teacherCapabilities: ReturnType<Construct["state"]["capabilities"]>[] = [];
  const policyControl = job.spec.mirrored ? mirrorConstructControlGraph(candidateSaved.control, candidateSaved.blueprint) :
    candidateSaved.control;
  const authoredEvaluation = job.spec.controller === "authored";
  const policyRows = job.spec.stage === "behavior-cloning" || authoredEvaluation ? [] : installConstructGraphPolicy(
    candidateBody, candidateSaved, weights, rolloutSeed, 24, job.spec.mirrored);
  let lastTeacher = "";
  let admissions = 0;
  let refusals = 0;
  let finite = 0;
  let commands = 0;
  let requestedActions = 0;
  let unsupportedActions = 0;
  let lifecycleFailures = 0;
  let mirrorApplications = 0;
  let saturatedSteps = 0;
  let selfCollisionCount = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let final: ConstructLabStepSample | null = null;
  const groups = new Set<string>();
  const progress: ConstructActionProgressSample[] = [];
  const ownBodies = new Set([...candidateBody.runtime.parts.values()].map(({ body }) => body));
  const selfObservers = [...ownBodies].map((body) => {
    body.setCollisionCallbackEnabled(true);
    const observer = body.getCollisionObservable().add((event) => {
      if (event.type === PhysicsEventType.COLLISION_STARTED && ownBodies.has(event.collidedAgainst)) selfCollisionCount += 1;
    });
    return { body, observer };
  });
  try {
    for (let step = 0; step < job.spec.steps; step += 1) {
      final = bout.step(1 / 240);
      const own = final[candidateSide];
      const other = final[candidateSide === "left" ? "right" : "left"];
      damageDealt += own.combat.reduce((sum, event) => sum + event.report.damage, 0);
      damageTaken += other.combat.reduce((sum, event) => sum + event.report.damage, 0);
      admissions += own.snapshot.events.filter(({ kind }) => kind === "admitted").length;
      refusals += own.snapshot.events.filter(({ kind }) => kind === "refused").length;
      lifecycleFailures += own.snapshot.events.filter(({ kind }) => kind === "failed").length;
      commands += 1;
      if (finiteCommand(own.snapshot.command)) finite += 1;
      for (const request of own.snapshot.command.requests) {
        const action = candidateSaved.control.actions.find(({ id }) => id === request.request.action);
        requestedActions += 1;
        if (!action) unsupportedActions += 1;
        if (action) groups.add(action.group);
      }
      const available = new Set(own.snapshot.capabilities.filter(({ available }) => available)
        .map(({ action, group }) => `${action}/${group}`));
      for (const active of own.snapshot.active) progress.push(Object.freeze({
        step,
        side: candidateSide,
        action: active.action,
        group: active.group,
        phase: active.phase,
        progress: active.progress,
        epsilon: active.epsilon,
        capabilityAvailable: available.has(`${active.action}/${active.group}`),
      }));
      const activeGroups = new Set(own.snapshot.active.map(({ group }) => group));
      const atLimit = candidateSaved.control.groups.filter(({ id }) => activeGroups.has(id)).some((group) =>
        group.joints.some((id) => {
          const joint = candidateSaved.blueprint.joints.find((row) => row.id === id);
          if (!joint) return false;
          const channels = new Map(jointSensorChannels(joint).map((channel) => [channel.axis, channel]));
          return joint.angularAxes.some((axis) => {
            const channel = channels.get(axis.id); const angle = channel ? own.snapshot.facts[channel.angle] : undefined;
            return typeof angle === "number" &&
              (Math.abs(angle - axis.minRad) <= 0.01 || Math.abs(angle - axis.maxRad) <= 0.01);
          });
        }));
      if (atLimit) saturatedSteps += 1;
      if (job.spec.stage === "behavior-cloning") {
        const physical = learningCommand(own.snapshot.command);
        const normalized = job.spec.mirrored ? (mirrorApplications += 1,
          mirrorConstructCommand(physical, candidateSaved.control, candidateSaved.blueprint)) : physical;
        const signature = commandKey(normalized);
        if (signature !== lastTeacher) {
          const physicalObservation = adapter.observe(1 / 240);
          const observation = job.spec.mirrored ? (mirrorApplications += 1,
            mirrorConstructObservation(physicalObservation)) : physicalObservation;
          const physicalCapabilities = candidateBody.state.capabilities(candidateSaved.control);
          const capabilities = job.spec.mirrored ? mirrorConstructCapabilities(physicalCapabilities,
            candidateSaved.control, candidateSaved.blueprint) : physicalCapabilities;
          const recorded = teacher.observe(observation, normalized);
          if (recorded) teacherCapabilities.push(capabilities);
          lastTeacher = signature;
        }
      }
      if (own.vitality <= 0 || other.vitality <= 0) break;
    }
    const victory = final !== null && final[candidateSide === "left" ? "right" : "left"].vitality <= 0 &&
      final[candidateSide].vitality > 0;
    const draw = final !== null && final.left.vitality > 0 && final.right.vitality > 0;
    const timeCap = draw;
    const reward = constructEngagementReward({ victory, draw, timeCap, damageDealt, damageTaken });
    const direction = perturbation(rolloutSeed ^ 0x9e3779b9);
    const epsilon = 0.001;
    let loss = 0;
    let gradient: readonly number[];
    let agreement = 1;
    if (job.spec.stage === "behavior-cloning") {
      const rows = teacher.rows;
      const bcLoss = (at: ConstructNetworkWeights): number => {
        if (!rows.length) return 100;
        let total = 0;
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const capabilities = teacherCapabilities[index];
          const scored = scoreConstructPolicyCommand(row.observation, policyControl, capabilities, at,
            Object.freeze({ version: 1, requests: row.requests.map(({ action, parameters }, sourceIndex) => ({
              request: { action, parameters }, priority: 0, sourceIndex,
            })) }));
          total += Number.isFinite(scored.logProbability) ? -scored.logProbability : 100;
        }
        return total / rows.length;
      };
      const plus = bcLoss(shifted(weights, direction, epsilon));
      const minus = bcLoss(shifted(weights, direction, -epsilon));
      loss = bcLoss(weights);
      gradient = spsaGradient(plus, minus, direction, epsilon);
      const matches = rows.filter((row, index) => {
        const capabilities = teacherCapabilities[index];
        const decision = decideConstructPolicy(row.observation, policyControl, capabilities, weights);
        return commandKey(decision.command) === commandKey({ version: 1, requests: row.requests.map(
          ({ action, parameters }, sourceIndex) => ({ request: { action, parameters }, priority: 0, sourceIndex })) });
      }).length;
      agreement = rows.length ? matches / rows.length : 0;
    } else if (job.spec.stage === "ppo") {
      const returns = fixedStepReturns(policyRows.map(() => 0), reward, 0.99);
      const plus = constructPpoLoss(policyRows, policyControl, shifted(weights, direction, epsilon), returns);
      const minus = constructPpoLoss(policyRows, policyControl, shifted(weights, direction, -epsilon), returns);
      loss = constructPpoLoss(policyRows, policyControl, weights, returns);
      gradient = spsaGradient(plus, minus, direction, epsilon);
    } else {
      loss = 0;
      gradient = Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0));
    }
    const stuck = classifyConstructStuck(progress, CONSTRUCT_STUCK_WINDOW_STEPS);
    const stuckSteps = stuck.reduce((sum, interval) => sum + interval.lastStep - interval.firstStep + 1, 0);
    const metrics = Object.freeze({
      stage: job.spec.stage,
      morphology: job.spec.morphology,
      score: reward,
      loss,
      decisions: job.spec.stage === "behavior-cloning" ? teacher.rows.length : policyRows.length,
      schedulerAdmissions: admissions,
      candidate: job.spec.candidate ?? "evolving",
      commandDigestRows: Object.freeze((job.spec.stage === "behavior-cloning" ? teacher.rows.map((row) =>
        JSON.stringify(row.requests)) : authoredEvaluation ? [commandKey(final?.[candidateSide].snapshot.command ??
          { version: 1, requests: [] })] : policyRows.map((row) => commandKey(row.decision.command)))),
      morphologyCells: 1,
      deadMorphologyCells: admissions > 0 ? 0 : 1,
      actionGroupsSeen: groups.size,
      unsupportedRate: requestedActions > 0 ? unsupportedActions / requestedActions : 0,
      refusalRate: admissions + refusals > 0 ? refusals / (admissions + refusals) : 0,
      finiteCommandRate: commands > 0 ? finite / commands : 0,
      lifecycleFailureCount: lifecycleFailures,
      stuckRate: final ? stuckSteps / (final.step + 1) : 1,
      meanDamage: damageDealt,
      timeCapRate: timeCap ? 1 : 0,
      imitationAgreement: agreement,
      motorSaturationRate: final ? saturatedSteps / (final.step + 1) : 1,
      selfCollisionCount,
      victoryRate: victory ? 1 : 0,
      mirrorApplications: job.spec.stage === "behavior-cloning" ? mirrorApplications :
        (job.spec.mirrored ? policyRows.length * 2 : 0),
    });
    if (!Number.isFinite(loss) || gradient.some((value) => !Number.isFinite(value))) {
      throw new Error("construct physical learning shard produced non-finite loss or gradient");
    }
    return Object.freeze({ gradient, metrics });
  } finally {
    for (const { body, observer } of selfObservers) if (observer) body.getCollisionObservable().remove(observer);
    bout.dispose();
  }
}
