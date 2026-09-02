import { pathToFileURL } from "node:url";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { Combat } from "../src/combat.ts";
import { Construct, constructProfileForBlueprint } from "../src/construct/construct.ts";
import { moduleAtContact } from "../src/construct/damage-target.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { constructSupportsSupportedLocomotion } from "../src/construct/assisted-locomotion.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { LAYER } from "../src/physics.ts";
import { stepPair } from "../src/fighter.ts";
import { SUPPORTED_LOCOMOTION_PORT_V1, unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const QUALIFICATION_CLEARANCE_SAMPLE_STEPS = Math.max(1, Math.round(CONFIG.world.physicsHz / 30));
const QUALIFICATION_ATTACKS = new Set(["sweep", "dual-cut", "fire", "cut-left", "bash", "cut"]);

/**
 * Qualification time has one authority: an integer elapsed tick divided by its declared rate.
 * Do not multiply by a cached reciprocal here. Those operations are mathematically equivalent,
 * but not bit-equivalent in JavaScript, and the strict evidence validator deliberately checks
 * the serialized seconds against `atStep / eventStepHz` without a tolerance.
 */
export function qualificationTimeAtStep(atStep, eventStepHz = CONFIG.world.physicsHz) {
  if (!Number.isInteger(atStep) || atStep < 0 || !Number.isInteger(eventStepHz) || eventStepHz <= 0) {
    throw new Error("qualification time requires a non-negative integer tick and positive integer rate");
  }
  return atStep / eventStepHz;
}

const signedDistanceToShape = (point, shape) => {
  if (shape.kind === "sphere") return point.length() - shape.radiusM;
  if (shape.kind === "box") {
    const half = Vector3.FromArray(shape.sizeM).scaleInPlace(0.5);
    const q = new Vector3(Math.abs(point.x) - half.x, Math.abs(point.y) - half.y,
      Math.abs(point.z) - half.z);
    return Math.hypot(Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0)) +
      Math.min(Math.max(q.x, q.y, q.z), 0);
  }
  if (shape.kind === "cylinder") {
    const radial = Math.hypot(point.x, point.z) - shape.radiusM;
    const axial = Math.abs(point.y) - shape.lengthM * 0.5;
    return Math.hypot(Math.max(radial, 0), Math.max(axial, 0)) + Math.min(Math.max(radial, axial), 0);
  }
  const halfSegment = Math.max(0, shape.lengthM * 0.5 - shape.radiusM);
  const segmentY = Math.max(-halfSegment, Math.min(halfSegment, point.y));
  return Math.hypot(point.x, point.y - segmentY, point.z) - shape.radiusM;
};

/** Deterministic collision-primitive samples; render shells never enter qualification evidence. */
const primitiveSurfaceSamples = (shape) => {
  if (shape.kind === "box") {
    const [x, y, z] = shape.sizeM.map((value) => value * 0.5);
    const samples = [];
    for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) for (const a of [-1, 0, 1]) {
      for (const b of [-1, 0, 1]) {
        const point = [a * x, b * y, 0];
        if (axis === 0) { point[0] = sign * x; point[1] = a * y; point[2] = b * z; }
        else if (axis === 1) { point[0] = a * x; point[1] = sign * y; point[2] = b * z; }
        else { point[0] = a * x; point[1] = b * y; point[2] = sign * z; }
        samples.push(new Vector3(...point));
      }
    }
    return samples;
  }
  const samples = [];
  const radius = shape.radiusM;
  const half = shape.kind === "sphere" ? 0 : shape.lengthM * 0.5;
  for (let ring = 0; ring < 12; ring += 1) {
    const angle = ring * Math.PI / 6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (shape.kind === "sphere") {
      samples.push(new Vector3(x, 0, z), new Vector3(x * Math.SQRT1_2,
        radius * Math.SQRT1_2, z * Math.SQRT1_2), new Vector3(x * Math.SQRT1_2,
        -radius * Math.SQRT1_2, z * Math.SQRT1_2));
    } else {
      samples.push(new Vector3(x, -half, z), new Vector3(x, 0, z), new Vector3(x, half, z));
    }
  }
  samples.push(new Vector3(0, shape.kind === "capsule" ? -half : -radius, 0),
    new Vector3(0, shape.kind === "capsule" ? half : radius, 0));
  return samples;
};

const semanticPairSpecs = (blueprintId) => blueprintId === "swordbearer-effigy"
  ? [{ semanticPair: "sword/core", moduleId: "effigy-sword", partId: "torso", actions: ["sweep"] }]
  : blueprintId === "twinblade-effigy" ? [
    { semanticPair: "left-sword/core", moduleId: "left-effigy-sword", partId: "torso", actions: ["dual-cut"] },
    { semanticPair: "right-sword/core", moduleId: "effigy-sword", partId: "torso", actions: ["dual-cut"] },
  ] : blueprintId === "arbalest-effigy" ? [
    { semanticPair: "launcher/torso", moduleId: "effigy-arbalest", partId: "torso", actions: ["fire"] },
    { semanticPair: "left-sword/torso", moduleId: "effigy-left-sword", partId: "torso",
      actions: ["cut-left"], requiredM: 0.025 },
  ] : blueprintId === "warden-crossbow" ? [
    { semanticPair: "launcher/core", moduleId: "dorsal-crossbow", partId: "core", actions: ["fire"] },
    { semanticPair: "shield/core", moduleId: "warden-shield", partId: "core", actions: ["bash"] },
  ] : blueprintId === "warden-sword" ? [
    { semanticPair: "dorsal-sword/core", moduleId: "dorsal-sword", partId: "core", actions: ["cut"] },
    { semanticPair: "shield/core", moduleId: "warden-shield", partId: "core", actions: ["bash"] },
  ] : [];

const liveSemanticClearance = (runtime, spec) => {
  const module = runtime.modules.get(spec.moduleId);
  const part = runtime.parts.get(spec.partId);
  if (!module || !part) return null;
  const moduleWorld = module.root.computeWorldMatrix(true);
  const inverseModule = Matrix.Invert(moduleWorld);
  const partWorld = part.node.computeWorldMatrix(true);
  const inversePart = Matrix.Invert(partWorld);
  if (module.spec.striker) {
    const hilt = moduleWorld.getTranslation();
    const tip = Vector3.TransformCoordinates(Vector3.FromArray(module.spec.striker.localTipM), moduleWorld);
    let minimum = Number.POSITIVE_INFINITY;
    // The mount and grip are allowed beside their carrier. The combat-bearing three quarters of
    // the live striker centreline is the semantic self-cut path, matching the controller fact.
    for (let index = 4; index <= 16; index += 1) {
      const local = Vector3.TransformCoordinates(Vector3.Lerp(hilt, tip, index / 16), inversePart);
      minimum = Math.min(minimum, signedDistanceToShape(local, part.spec.shape));
    }
    const authoredMargin = Math.max(part.spec.shell.visualClearanceM,
      ...module.spec.geometry.map(({ shell }) => shell.visualClearanceM));
    return Object.freeze({ ...spec, requiredM: spec.requiredM ?? authoredMargin, clearanceM: minimum });
  }
  const partSamples = primitiveSurfaceSamples(part.spec.shape);
  let minimum = Number.POSITIVE_INFINITY;
  for (const primitive of module.spec.geometry) {
    const primitiveFrame = Matrix.Compose(Vector3.One(), Quaternion.FromArray(primitive.frame.rotation),
      Vector3.FromArray(primitive.frame.positionM));
    const inversePrimitive = Matrix.Invert(primitiveFrame);
    for (const local of primitiveSurfaceSamples(primitive.shape)) {
      const inModule = Vector3.TransformCoordinates(local, primitiveFrame);
      const world = Vector3.TransformCoordinates(inModule, moduleWorld);
      minimum = Math.min(minimum, signedDistanceToShape(Vector3.TransformCoordinates(world, inversePart),
        part.spec.shape));
    }
    for (const local of partSamples) {
      const world = Vector3.TransformCoordinates(local, partWorld);
      const inModule = Vector3.TransformCoordinates(world, inverseModule);
      minimum = Math.min(minimum, signedDistanceToShape(Vector3.TransformCoordinates(inModule, inversePrimitive),
        primitive.shape));
    }
  }
  const authoredMargin = Math.max(part.spec.shell.visualClearanceM,
    ...module.spec.geometry.map(({ shell }) => shell.visualClearanceM));
  return Object.freeze({ ...spec, requiredM: spec.requiredM ?? authoredMargin, clearanceM: minimum });
};

export function constructWarriorWinner(constructVitality, warriorVitality) {
  if (!Number.isFinite(constructVitality) || !Number.isFinite(warriorVitality)) {
    throw new Error("construct-Warrior verdict requires finite vitality");
  }
  const constructDefeated = constructVitality <= 0;
  const warriorDefeated = warriorVitality <= 0;
  return constructDefeated === warriorDefeated ? "draw" : constructDefeated ? "warrior" : "construct";
}

export function constructStandingThresholds(profile = constructProfileForBlueprint(twinbladeSavedConstruct().blueprint)) {
  if (![profile.vitalHeight, profile.crownHeight].every(Number.isFinite) ||
    profile.vitalHeight <= 0 || profile.crownHeight <= profile.vitalHeight) {
    throw new Error("construct standing thresholds require a finite crown above a positive vital height");
  }
  return Object.freeze({ minimumRootUp: 0.72,
    minimumTorsoHeightM: profile.vitalHeight * 0.9,
    minimumHeadAboveTorsoM: (profile.crownHeight - profile.vitalHeight) * 0.5 });
}

export function isConstructStanding(sample, thresholds = constructStandingThresholds()) {
  return sample.rootUp > thresholds.minimumRootUp &&
    sample.torsoHeightM > thresholds.minimumTorsoHeightM &&
    sample.headAboveTorsoM > thresholds.minimumHeadAboveTorsoM;
}

export const CONSTRUCT_VERDICT_TAIL_STEPS = CONFIG.world.physicsHz * 3;
export const CONSTRUCT_ACTION_EVIDENCE = Object.freeze({ minimumStandingFraction: 0.5,
  minimumAdmissionSupportedFraction: 0.5, minimumEffectorTravelM: 0.01,
  minimumEffectorDirectedMotionM: 0.01, minimumSwordTargetSpanRad: 0.01 });

const warriorPerceivesMountedThreat = (opponent) => Object.keys(opponent.hands ?? {}).length > 0 ||
  Object.keys(opponent.naturalAttacks ?? {}).length > 0 ||
  (opponent.effectors ?? []).some(({ weapon, lost }) =>
    (weapon === "sword" || weapon === "bow") && !lost);
const warriorPerceivesLauncher = (opponent) =>
  (opponent.effectors ?? []).some(({ weapon, lost }) => weapon === "bow" && !lost);

/** A verdict may finish its already-authored Action, but it may not start a new bout after the cap. */
export function shouldAdvanceConstructWarriorStep({ step, maxSteps, verdictAtStep = null,
  activeAction = null, maxTailSteps = CONSTRUCT_VERDICT_TAIL_STEPS }) {
  if (![step, maxSteps, maxTailSteps].every(Number.isInteger) || step < 0 || maxSteps <= 0 || maxTailSteps < 0) {
    throw new Error("construct-Warrior step bounds must be non-negative integers with a positive main cap");
  }
  if (verdictAtStep === null) return step < maxSteps;
  if (!Number.isInteger(verdictAtStep) || verdictAtStep < 0 || verdictAtStep > step) {
    throw new Error("construct-Warrior verdict step must be an elapsed step");
  }
  return activeAction === "dual-cut" && step - verdictAtStep < maxTailSteps;
}

/** Stop report-producing observers synchronously at the first fatal contact callback. */
export function stopCombatOnFatalTransition(before, after, firstCombat, secondCombat) {
  if (![before, after].every(Number.isFinite) || before < 0 || after < 0) {
    throw new Error("fatal combat transition requires finite non-negative vitality");
  }
  if (!(before > 0 && after <= 0)) return false;
  firstCombat.stop();
  secondCombat.stop();
  return true;
}

/** The defeated side no longer authors motors; the winner may finish its already-live Action. */
export function stopDefeatedConstructWarriorControl(construct, warrior) {
  const stopped = [];
  if (construct.vitality <= 0) { construct.stopFighting(); stopped.push("construct"); }
  if (warrior.vitality <= 0) { warrior.stopFighting(); stopped.push("warrior"); }
  return Object.freeze(stopped);
}

/** Capture compound-leaf identity while the report point and module transform are contemporaneous. */
export function captureConstructCombatEvent(sourceConstruct, event, context = {}) {
  const striker = sourceConstruct.strikers.find((candidate) => candidate.effectorId === event.effectorId);
  const sourceModuleId = event.report.projectile
    ? [...sourceConstruct.runtime.modules.values()].find(({ spec }) => spec.kind === "launcher")?.id ?? null
    : striker ? moduleAtContact(sourceConstruct.runtime, striker.body, event.report.point)?.id ?? null : null;
  const shotSerial = Number.isInteger(striker?.shotSerial) ? striker.shotSerial : null;
  return Object.freeze({ ...event, sourceModuleId, shotSerial,
    action: context.action ?? null, phase: context.phase ?? null, attempt: context.attempt ?? null,
    actionInstanceId: context.actionInstanceId ?? null,
    targetVitalityBefore: context.targetVitalityBefore ?? null,
    targetVitalityAfter: context.targetVitalityAfter ?? null });
}

const qualificationInstanceKey = ({ group, action }) => `${group}\0${action}`;

/**
 * Advance the attack-Action generation ledger in scheduler event order.
 *
 * The scheduler owns active state by group/action, not by group alone: a higher-priority Action
 * can start in a group before the displaced Action's cancellation is appended at end-of-step.
 * Refusal is never a terminal for an already-running generation; the scheduler emits a separate
 * cancellation when that generation is actually withdrawn. Keep this fold pure so those two
 * same-step edge cases can be mutation-tested without spending a Havok bout.
 */
export function advanceQualificationActionLifecycle(events, {
  activeInstances = new Map(), nextInstance = 0, pendingFireInstance = null,
} = {}) {
  if (!Array.isArray(events) || !(activeInstances instanceof Map) ||
      !Number.isInteger(nextInstance) || nextInstance < 0) {
    throw new Error("qualification Action lifecycle requires events, a generation map and a non-negative index");
  }
  const nextActive = new Map(activeInstances);
  const transitions = [];
  let next = nextInstance;
  let pendingFire = pendingFireInstance;
  let fireInstanceForStep = pendingFireInstance;
  for (const event of events) {
    const key = qualificationInstanceKey(event);
    if (event.kind === "started" && QUALIFICATION_ATTACKS.has(event.action)) {
      const actionInstanceId = `${event.action}:${event.group}:${next}`;
      next += 1;
      const instance = { action: event.action, group: event.group, actionInstanceId,
        weapon: event.action === "fire" ? "projectile" : event.action === "bash" ? "shield" : "sword",
        lastPhase: null };
      nextActive.set(key, instance);
      transitions.push(Object.freeze({ kind: "started", event, instance }));
      if (event.action === "fire") {
        pendingFire = instance;
        // A parameter-change cancellation can be followed by a replacement which looses on enter.
        // The newest started generation, rather than the cancelled predecessor, owns that launch.
        fireInstanceForStep = instance;
      }
    }
    if (["completed", "cancelled", "refused", "failed"].includes(event.kind) &&
        QUALIFICATION_ATTACKS.has(event.action)) {
      const active = event.kind === "refused" ? null : nextActive.get(key);
      const instance = active?.action === event.action ? active : null;
      transitions.push(Object.freeze({ kind: "terminal", event, instance }));
      if (instance?.action === "fire") fireInstanceForStep = instance;
      if (instance && nextActive.get(key) === instance) nextActive.delete(key);
    }
  }
  return Object.freeze({ activeInstances: nextActive, nextInstance: next,
    pendingFireInstance: pendingFire, fireInstanceForStep,
    transitions: Object.freeze(transitions) });
}

/** Resolve the generation which physically owns this solver step, including its terminal step. */
export function qualificationActionContext(action, activeRows, activeInstances, terminalTransitions) {
  const active = activeRows.find((row) => row.action === action);
  const live = active ? activeInstances.get(qualificationInstanceKey(active)) : null;
  if (live?.action === action) return Object.freeze({ instance: live, phase: active.phase });
  // A parameter replacement can leave more than one same-action terminal in one tick. The last
  // generation is the one whose controller stepped most recently and can have authored contact.
  for (let index = terminalTransitions.length - 1; index >= 0; index -= 1) {
    const terminal = terminalTransitions[index];
    if (terminal.event.action === action && terminal.instance?.action === action &&
        terminal.instance.lastPhase !== null) {
      return Object.freeze({ instance: terminal.instance, phase: terminal.instance.lastPhase });
    }
  }
  return null;
}

const sharedMaterials = (scene) => {
  const material = new StandardMaterial("construct-warrior.shared-material", scene);
  return Object.freeze({
    material,
    fighter: Object.freeze({ flesh: material, cloth: material, steel: material, leather: material,
      brass: material, hide: material, wood: material, arrowAccent: material }),
  });
};

/**
 * A real solver bout across the construct/humanoid control-surface boundary.
 *
 * This deliberately does not route through `measure.mjs`: that harness passes a humanoid Mind
 * object and never selects a Construct program, so a construct silently falls back to hold. The
 * explicit saved definition and `construct-program` selection here make the public scheduler the
 * only path from authored rules to Havok motors.
 */
export async function runConstructWarriorBout({
  saved = twinbladeSavedConstruct(),
  sensors = TWINBLADE_SENSORS,
  constructProfile = null,
  warriorPolicy = "duelist",
  warriorSeed = 0x51a7,
  constructSide = "left",
  separationM = CONFIG.fighter.separation,
  maxSteps = CONFIG.world.physicsHz * 20,
  warriorLoadout = Object.freeze({ primary: "sword", secondary: "buckler" }),
  stabilityShoves = Object.freeze([]),
  fixturePlacement = null,
} = {}) {
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) throw new Error("construct-Warrior maxSteps must be positive integer");
  if (constructSide !== "left" && constructSide !== "right") {
    throw new Error('construct-Warrior constructSide must be "left" or "right"');
  }
  if (!Array.isArray(stabilityShoves) || stabilityShoves.some(({ atStep, horizontalShoveNs }) =>
    !Number.isInteger(atStep) || atStep < 0 || !Array.isArray(horizontalShoveNs) ||
    horizontalShoveNs.length !== 2 || horizontalShoveNs.some((value) => !Number.isFinite(value)))) {
    throw new Error("construct-Warrior stability shoves require a non-negative step and two finite N s components");
  }
  const fixtureShoves = Object.freeze(stabilityShoves.map(({ atStep, horizontalShoveNs }) =>
    Object.freeze({ atStep, horizontalShoveNs: Object.freeze([...horizontalShoveNs]) })));
  if (fixturePlacement !== null) {
    const points = [fixturePlacement.construct, fixturePlacement.warrior];
    if (points.some((point) => !point || ![point.x, point.z, point.facing].every(Number.isFinite))) {
      throw new Error("construct-Warrior fixture placement requires finite construct and Warrior x/z/facing");
    }
    if (fixturePlacement.wall && (!['x', 'z'].includes(fixturePlacement.wall.axis) ||
        !Number.isFinite(fixturePlacement.wall.coordinate))) {
      throw new Error("construct-Warrior fixture wall requires axis x/z and a finite coordinate");
    }
  }
  const arena = await createConstructHeadlessArena();
  const materials = sharedMaterials(arena.scene);
  const resolvedConstructProfile = constructProfile ?? constructProfileForBlueprint(saved.blueprint);
  const definition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
    program: saved.program, sensors, profile: resolvedConstructProfile });
  const warriorDefinition = unitDefinition("warrior");
  const locomotionMode = constructSupportsSupportedLocomotion(saved.blueprint, saved.control) &&
    warriorDefinition.supportedLocomotionPort === SUPPORTED_LOCOMOTION_PORT_V1 ? "supported" : "legacy";
  const locomotionWorld = locomotionMode === "supported" ? flatSupportedWorldRegistry() : undefined;
  const constructOrigin = fixturePlacement
    ? new Vector3(fixturePlacement.construct.x, 0, fixturePlacement.construct.z)
    : constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separationM);
  const warriorOrigin = fixturePlacement
    ? new Vector3(fixturePlacement.warrior.x, 0, fixturePlacement.warrior.z)
    : constructSide === "left" ? new Vector3(0, 0, separationM) : Vector3.Zero();
  const constructFacing = fixturePlacement?.construct.facing ?? (constructSide === "left" ? 0 : Math.PI);
  const construct = new Construct({ scene: arena.scene, side: constructSide, origin: constructOrigin,
    facing: constructFacing,
    materials: materials.fighter, policyName: "construct-program", locomotionMode, locomotionWorld }, definition);
  let warrior;
  let constructCombat;
  let warriorCombat;
  const heldWallObservers = [];
  const constructReports = [];
  const warriorReports = [];
  let constructContactContext = Object.freeze({ action: null, phase: null, attempt: null });
  try {
    const warriorSide = constructSide === "left" ? "right" : "left";
    warrior = warriorDefinition.build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin,
      facing: fixturePlacement?.warrior.facing ?? (warriorSide === "left" ? 0 : Math.PI),
      materials: materials.fighter,
      policyName: warriorPolicy, policySeed: warriorSeed,
      loadout: warriorLoadout, locomotionMode, locomotionWorld });
    let steps = 0;
    const qualificationEvents = [];
    let qualificationSequence = 0;
    const qualificationEvent = (kind, fields = {}) => {
      const row = { sequence: qualificationSequence, atStep: steps,
        atS: qualificationTimeAtStep(steps), kind, ...fields };
      qualificationEvents.push(row);
      qualificationSequence += 1;
      return row;
    };
    const combatRefusalCounts = {
      ownerContactsRefused: 0,
      inactiveActionsRefused: 0,
      moduleAttributionRefused: 0,
    };
    const onConstructCombatRefusal = ({ reason, effectorId }) => {
      if (reason === "owner-contact") combatRefusalCounts.ownerContactsRefused += 1;
      else if (reason === "inactive-action") combatRefusalCounts.inactiveActionsRefused += 1;
      else combatRefusalCounts.moduleAttributionRefused += 1;
      qualificationEvent("combat-refusal", { reason, effectorId });
    };
    let activeQualificationInstances = new Map();
    const projectileInstances = new Map();
    const qualificationContactsAwaitingPosture = [];
    let nextQualificationInstance = 0;
    let qualificationContextForEffector = () => Object.freeze({});
    let lastWarriorVitality = warrior.vitality;
    constructCombat = new Combat(constructSide, construct.strikers, (event) => {
      const targetVitalityAfter = warrior.vitality;
      constructReports.push(captureConstructCombatEvent(construct, event, {
        ...constructContactContext, ...qualificationContextForEffector(event),
        targetVitalityBefore: lastWarriorVitality, targetVitalityAfter,
      }));
      const captured = constructReports.at(-1);
      const projectile = event.report.projectile;
      const identity = projectile ? Object.freeze({ owner: "construct",
        poolIndex: projectile.identity.poolIndex, shotSerial: projectile.identity.shotSerial }) : null;
      const projectileInstance = identity ? projectileInstances.get(
        `${identity.poolIndex}:${identity.shotSerial}`) : null;
      const actionInstanceId = projectileInstance?.actionInstanceId ?? captured.actionInstanceId;
      const evidenceKind = !event.blocked && captured.sourceModuleId && actionInstanceId
        ? "contact" : "combat-observation";
      const qualificationRow = qualificationEvent(evidenceKind, {
        ownerRelation: "opponent", sourceOwner: "construct",
        attribution: captured.sourceModuleId ? "verified" : "missing",
        sourceModuleId: captured.sourceModuleId,
        actionInstanceId: actionInstanceId ?? null,
        action: projectileInstance?.action ?? captured.action,
        phase: captured.phase,
        weapon: event.report.weapon === "arrow" ? "projectile"
          : event.effectorId === "warden-shield" ? "shield" : event.report.weapon,
        effectorId: event.effectorId,
        blocked: event.blocked,
        targetPartId: event.report.key,
        pathId: captured.phase ?? null,
        contactZone: projectile?.contactedZone === "head" ? "point" : projectile?.contactedZone ?? null,
        axial: projectile ? projectile.signedShaftAlignment > 0 : null,
        damage: event.report.damage,
        preArmourDamage: event.report.preArmourDamage,
        postArmourDamage: event.report.postArmourDamage,
        targetVitalityBefore: captured.targetVitalityBefore,
        targetVitalityAfter: captured.targetVitalityAfter,
        massKg: projectile?.massKg ?? null,
        arrivalSpeedMps: projectile?.arrivalSpeedMps ?? null,
        signedShaftAlignment: projectile?.signedShaftAlignment ?? null,
        penetrationEfficiency: projectile?.penetrationEfficiency ?? null,
        contactedZone: projectile?.contactedZone ?? null,
        usableEnergyJ: projectile?.usableEnergyJ ?? null,
        uncappedDamage: projectile?.uncappedDamage ?? null,
        ...(identity ? { projectile: identity } : {}),
        stabilityShove: event.report.stabilityShove ?? null,
      });
      qualificationContactsAwaitingPosture.push(qualificationRow);
      if (constructCombat && warriorCombat) {
        stopCombatOnFatalTransition(lastWarriorVitality, targetVitalityAfter, constructCombat, warriorCombat);
      }
      lastWarriorVitality = targetVitalityAfter;
    }, onConstructCombatRefusal);
    let lastConstructVitality = construct.vitality;
    warriorCombat = new Combat(warriorSide, warrior.strikers, (event) => {
      const targetVitalityAfter = construct.vitality;
      warriorReports.push(event);
      if (constructCombat && warriorCombat) {
        stopCombatOnFatalTransition(lastConstructVitality, targetVitalityAfter, constructCombat, warriorCombat);
      }
      lastConstructVitality = targetVitalityAfter;
    });
    constructCombat.attach(warrior);
    warriorCombat.attach(construct);
    const initialConstructRoot = construct.centre().clone();
    const initialWarriorRoot = warrior.centre().clone();
    const initialRangeM = Vector3.Distance(initialConstructRoot, initialWarriorRoot);

    const startedActions = new Set();
    const completedActions = new Set();
    const actionTimeline = [];
    const blockerTimeline = [];
    const controllerTimeline = [];
    const locomotionTimeline = [];
    const locomotionSteps = [];
    let lastLocomotionKey = "";
    let lastControllerPhase = "";
    let observedLauncherLooses = 0;
    let qualificationObservedLauncherLooses = 0;
    let pendingFireStart = null;
    let pendingFireQualificationInstance = null;
    let lastMotionEvidenceKey = "";
    let lastSupportEvidenceKey = "";
    let meleeOpportunityAvailable = false;
    let observedPostureLoss = false;
    let passiveIntervalStartS = null;
    const activeQualificationProgram = saved.program.rules.some(({ action }) => QUALIFICATION_ATTACKS.has(action));
    const maximumDwellS = saved.program.rules.reduce((maximum, { dwellS }) => Math.max(maximum, dwellS), 0);
    const maximumReloadS = saved.blueprint.modules.reduce((maximum, module) =>
      Math.max(maximum, module.reloadSeconds ?? 0), 0);
    // 0.56 s is the longest explicitly time-bounded chamber/commit/recover controller in the
    // registry. Reload and authored dwell are saved-body facts; the fixed step covers edge order.
    const qualificationPassiveIntervalLimitS = Math.max(0.56, maximumReloadS) + maximumDwellS + FIXED;
    const clearancePairs = semanticPairSpecs(saved.blueprint.id);
    const clearanceMinimum = new Map(clearancePairs.map(({ semanticPair }) =>
      [semanticPair, { clearanceM: Number.POSITIVE_INFINITY, sampledAtS: null, requiredM: null }]));
    const clearanceMinimumByInstance = new Map();
    const diagnosticClearanceMinimum = new Map(clearancePairs.map(({ semanticPair }) =>
      [semanticPair, { clearanceM: Number.POSITIVE_INFINITY, sampledAtStep: null, requiredM: null }]));
    const sampleArmedClearance = (instance, method) => {
      if (!instance || !construct.alive) return;
      for (const pair of clearancePairs) {
        if (!pair.actions.includes(instance.action)) continue;
        const module = construct.runtime.modules.get(pair.moduleId);
        const part = construct.runtime.parts.get(pair.partId);
        if (module?.socket.part.attached !== true || part?.attached !== true) continue;
        const sample = liveSemanticClearance(construct.runtime, pair);
        const prior = clearanceMinimum.get(pair.semanticPair);
        if (!sample || !prior) continue;
        if (sample.clearanceM < prior.clearanceM) clearanceMinimum.set(pair.semanticPair,
          { clearanceM: sample.clearanceM, requiredM: sample.requiredM,
            sampledAtS: qualificationTimeAtStep(steps) });
        const instanceKey = `${instance.actionInstanceId}\0${pair.semanticPair}`;
        const instanceMinimum = clearanceMinimumByInstance.get(instanceKey) ?? Number.POSITIVE_INFINITY;
        if (sample.clearanceM >= instanceMinimum) continue;
        clearanceMinimumByInstance.set(instanceKey, sample.clearanceM);
        qualificationEvent("self-clearance", { semanticPair: pair.semanticPair,
          clearanceM: sample.clearanceM, requiredM: sample.requiredM,
          action: instance.action, actionInstanceId: instance.actionInstanceId, method });
      }
    };
    let dualCutAttempt = 0;
    const dualMotorJoints = new Map();
    const dualMotorTargets = new Map();
    const dualEffectorTravel = new Map();
    const dualAttemptPosture = new Map();
    const selectedRules = new Set();
    const constructReportStanding = new Map();
    const lifecycle = { started: 0, completed: 0, cancelled: 0, refused: 0, failed: 0 };
    let minimumRangeM = Number.POSITIVE_INFINITY;
    let minimumRootUp = 1;
    let minimumTorsoHeightM = Number.POSITIVE_INFINITY;
    let minimumHeadAboveTorsoM = Number.POSITIVE_INFINITY;
    let currentStandingS = 0;
    let longestStandingS = 0;
    let firstPostureLossS = null;
    let firstSweepCompletedS = null;
    let firstConstructDamageS = null;
    let firstUprightConstructDamageS = null;
    let constructReportCursor = 0;
    let verdictAtStep = null;
    let verdictVitality = null;
    let activeAfterStep = null;
    let maximumPartSpeedMps = 0;
    let maximumConstructJointFrameErrorM = 0;
    let minimumHeldWallClearanceM = Number.POSITIVE_INFINITY;
    const minimumHeldWallClearanceByKindM = new Map();
    let maximumHeldWallPenetrationM = 0;
    const maximumHeldWallPenetrationByKindM = new Map();
    const heldKinds = new Set();
    const solverMeasurementStartStep = Math.ceil(CONFIG.world.physicsHz * 0.6);
    const wall = fixturePlacement?.wall ?? null;
    const held = [...construct.strikers, ...warrior.strikers]
      .filter(({ kind }) => kind === "sword" || kind === "shield" || kind === "buckler");
    const heldWorldContactsByKind = new Map();
    for (const { kind } of held) heldKinds.add(kind);
    for (const striker of held) {
      const observable = striker.body.getCollisionObservable();
      const observer = observable.add((event) => {
        if (steps < solverMeasurementStartStep || event.type === PhysicsEventType.COLLISION_FINISHED) return;
        const membership = event.collidedAgainst?.shape?.filterMembershipMask ?? 0;
        if ((membership & LAYER.WORLD) === 0) return;
        heldWorldContactsByKind.set(striker.kind, (heldWorldContactsByKind.get(striker.kind) ?? 0) + 1);
      });
      if (observer) heldWallObservers.push({ observable, observer });
    }
    const fixtureEnvelopeIntersectsWall = wall !== null && (() => {
      const candidate = fixturePlacement.warrior;
      const centreDistance = Math.abs(wall.coordinate - candidate[wall.axis]);
      return centreDistance <= warriorDefinition.reach + warriorDefinition.collisionRadius;
    })();
    const standingThresholds = constructStandingThresholds(resolvedConstructProfile);
    for (; shouldAdvanceConstructWarriorStep({ step: steps, maxSteps, verdictAtStep,
      activeAction: activeAfterStep }); steps += 1) {
      const clock = constructCombat.now;
      for (const { atStep, horizontalShoveNs } of fixtureShoves) {
        if (atStep === steps) construct.queueStabilityEvent({ horizontalShoveNs });
      }
      const left = constructSide === "left" ? construct : warrior;
      const right = constructSide === "left" ? warrior : construct;
      stepPair(left, right, FIXED, clock);
      const snapshot = construct.control.snapshot();
      const constructLocomotion = construct.locomotion?.diagnostic() ?? null;
      const warriorLocomotion = warrior.locomotion?.diagnostic() ?? null;
      const compactLocomotion = (diagnostic) => diagnostic === null ? null : Object.freeze({
        state: diagnostic.state.state, authority: diagnostic.authority,
        liveSupport: diagnostic.liveSupport, postureSupported: diagnostic.postureSupported,
        freshSupportBindings: diagnostic.freshSupportBindings,
        requested: diagnostic.requested, allowed: diagnostic.allowed,
      });
      locomotionSteps.push(Object.freeze({ atS: qualificationTimeAtStep(steps),
        construct: compactLocomotion(constructLocomotion), warrior: compactLocomotion(warriorLocomotion) }));
      const locomotionKey = JSON.stringify([constructLocomotion?.state.state,
        constructLocomotion?.authority, constructLocomotion?.liveSupport,
        constructLocomotion?.postureSupported, warriorLocomotion?.state.state,
        warriorLocomotion?.authority, warriorLocomotion?.liveSupport,
        warriorLocomotion?.postureSupported]);
      if (locomotionKey !== lastLocomotionKey) {
        const fighter = warrior.articulated;
        const pelvisRotation = fighter?.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const pelvisUp = Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
          pelvisRotation, new Vector3()), Vector3.Up());
        locomotionTimeline.push(Object.freeze({ atS: qualificationTimeAtStep(steps),
          construct: constructLocomotion, warrior: warriorLocomotion,
          warriorPhysical: fighter ? Object.freeze({ pelvisUp,
            torsoHeightAbovePelvisM: fighter.torso.mesh.position.y - fighter.pelvis.mesh.position.y,
            headHeightAboveTorsoM: fighter.head.mesh.position.y - fighter.torso.mesh.position.y }) : null }));
        lastLocomotionKey = locomotionKey;
      }
      if (snapshot.events.some(({ kind, action }) => kind === "started" && action === "dual-cut")) {
        dualCutAttempt += 1;
      }
      const atS = qualificationTimeAtStep(steps);
      const meleeAvailableNow = saved.blueprint.id === "arbalest-effigy" &&
        snapshot.facts["line-of-sight"] === true && Number.isFinite(snapshot.facts["opponent-range"]) &&
        snapshot.facts["opponent-range"] < 2.60;
      if (meleeAvailableNow && !meleeOpportunityAvailable) qualificationEvent("melee-opportunity",
        { rangeM: snapshot.facts["opponent-range"], weapon: "sword" });
      meleeOpportunityAvailable = meleeAvailableNow;
      const attackLane = (action) => action === "dual-cut"
        ? (snapshot.facts["opponent-blocker-present"] === true ? "shielded" : "unshielded") : null;
      const terminalQualificationEvents = [];
      // A launched projectile can belong to an Action which became terminal in this scheduler
      // step. Keep the last fire generation which actually stepped: an old terminal must not
      // erase a later replacement, while a completed firing generation still owns its loose.
      const lifecycleStep = advanceQualificationActionLifecycle(snapshot.events, {
        activeInstances: activeQualificationInstances, nextInstance: nextQualificationInstance,
        pendingFireInstance: pendingFireQualificationInstance,
      });
      activeQualificationInstances = lifecycleStep.activeInstances;
      nextQualificationInstance = lifecycleStep.nextInstance;
      pendingFireQualificationInstance = lifecycleStep.pendingFireInstance;
      const fireInstanceForThisStep = lifecycleStep.fireInstanceForStep;
      for (const transition of lifecycleStep.transitions) {
        const { event, instance } = transition;
        if (transition.kind === "started") {
          const actionInstanceId = instance.actionInstanceId;
          qualificationEvent("action-started", { action: event.action, actionInstanceId,
            weapon: instance.weapon });
          const active = snapshot.active.find((row) => qualificationInstanceKey(row) ===
            qualificationInstanceKey(instance));
          // A scheduler generation can start and immediately report complete when its controller
          // refuses to drive (for example an Arbalest cut whose live sight disappeared). That is
          // lifecycle evidence, but it never published a physical phase and therefore is not an
          // attack admission. Claim only a generation which survived into the active snapshot;
          // the phase loop below then supplies the independent physical-phase witness required by
          // the strict reconstruction.
          if (active && activeQualificationInstances.get(qualificationInstanceKey(active)) === instance) {
            const blockerOffset = snapshot.facts["opponent-blocker-local-x"] - snapshot.facts["opponent-local-x"];
            const leftFirst = snapshot.facts["opponent-blocker-present"] !== true || blockerOffset < 0;
            qualificationEvent("attack-admitted", { action: event.action, actionInstanceId,
              weapon: instance.weapon, physical: true, lane: attackLane(event.action),
              ...(event.action === "dual-cut" ? {
                firstEffectorId: leftFirst ? "left-effigy-sword" : "effigy-sword",
                secondEffectorId: leftFirst ? "effigy-sword" : "left-effigy-sword",
                admissionSupported: snapshot.facts["contact-left-foot"] === true ||
                  snapshot.facts["contact-right-foot"] === true,
                admissionUpright: snapshot.facts["core-upright"] === true,
              } : {}) });
            // A controller may complete before the next 30 Hz evidence tick. Sampling the live
            // collision primitives at admission gives even that generation its own physical row;
            // the terminal edge below catches any smaller clearance reached during its lifetime.
            sampleArmedClearance(instance, "live-authoritative-primitive-samples-lifecycle-edge");
          }
        } else terminalQualificationEvents.push({ event, instance });
      }
      for (const active of snapshot.active) {
        const instance = activeQualificationInstances.get(qualificationInstanceKey(active));
        if (!instance || instance.action !== active.action || !QUALIFICATION_ATTACKS.has(active.action) ||
            instance.lastPhase === active.phase) continue;
        instance.lastPhase = active.phase;
        qualificationEvent("action-phase", { action: active.action,
          actionInstanceId: instance.actionInstanceId, phase: active.phase });
      }
      const looseCountBeforeSolver = construct.launcherLooseCount();
      if (looseCountBeforeSolver > qualificationObservedLauncherLooses) {
        for (let serial = qualificationObservedLauncherLooses; serial < looseCountBeforeSolver; serial += 1) {
          const projectile = construct.strikers.find((striker) => striker.projectileImpact &&
            striker.shotSerial === serial);
          const instance = fireInstanceForThisStep;
          if (projectile && instance) {
            const identity = Object.freeze({ owner: "construct", poolIndex: projectile.projectilePoolIndex,
              shotSerial: serial });
            projectileInstances.set(`${identity.poolIndex}:${identity.shotSerial}`, instance);
            qualificationEvent("projectile-launched", { actionInstanceId: instance.actionInstanceId,
              projectile: identity });
          }
        }
        qualificationObservedLauncherLooses = looseCountBeforeSolver;
      }
      const commandedAttack = snapshot.active.find(({ action }) => action === "dual-cut" || action === "sweep");
      constructContactContext = Object.freeze({ action: commandedAttack?.action ?? null,
        phase: commandedAttack?.phase ?? null,
        attempt: commandedAttack?.action === "dual-cut" ? dualCutAttempt : null });
      qualificationContextForEffector = (event) => {
        if (event.report.projectile) {
          const projectile = event.report.projectile.identity;
          const instance = projectileInstances.get(`${projectile.poolIndex}:${projectile.shotSerial}`);
          return instance ? { action: instance.action, actionInstanceId: instance.actionInstanceId,
            phase: "flight" } : {};
        }
        const action = event.effectorId === "warden-shield" ? "bash"
          : event.effectorId === "dorsal-sword" ? "cut"
            : event.effectorId === "effigy-left-sword" && saved.blueprint.id === "arbalest-effigy"
              ? "cut-left" : saved.blueprint.id === "twinblade-effigy" ? "dual-cut" : "sweep";
        const context = qualificationActionContext(action, snapshot.active,
          activeQualificationInstances, terminalQualificationEvents);
        return context ? { action, actionInstanceId: context.instance.actionInstanceId,
          phase: context.phase } : { action };
      };
      // The scheduler has already removed terminal generations from `snapshot.active`, but the
      // primitives still hold the last solver-authored pose of that Action. Record it before this
      // tick's solver and before publishing the delayed terminal row. Contacts produced by the
      // solver remain ordered before the terminal exactly as they were before this audit existed.
      for (const { instance } of terminalQualificationEvents) {
        // A start which completed without ever entering an active snapshot authored no physical
        // phase. Its lifecycle terminal is honest, but the residual held pose is not an armed
        // Action primitive and cannot own either clearance or the solver contact below.
        if (instance && instance.lastPhase !== null) {
          sampleArmedClearance(instance, "live-authoritative-primitive-samples-lifecycle-edge");
        }
      }
      if (commandedAttack?.action === "dual-cut") {
        const joints = dualMotorJoints.get(dualCutAttempt) ?? new Set();
        const targets = dualMotorTargets.get(dualCutAttempt) ?? new Map();
        for (const target of snapshot.motorTargets) {
          const joint = target.joint.split(":")[0];
          joints.add(joint);
          const prior = targets.get(joint);
          targets.set(joint, { writes: (prior?.writes ?? 0) + 1,
            minimumAngleRad: Math.min(prior?.minimumAngleRad ?? Number.POSITIVE_INFINITY,
              target.angleRad),
            maximumAngleRad: Math.max(prior?.maximumAngleRad ?? Number.NEGATIVE_INFINITY,
              target.angleRad) });
        }
        dualMotorJoints.set(dualCutAttempt, joints);
        dualMotorTargets.set(dualCutAttempt, targets);
      }
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      if (steps >= solverMeasurementStartStep) {
        for (const part of construct.runtime.parts.values()) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, part.body.getLinearVelocity().length());
        }
        for (const limb of warrior.limbs) if (!limb.severed) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, limb.part.body.getLinearVelocity().length());
        }
        for (const striker of held) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, striker.body.getLinearVelocity().length());
          if (wall) {
            const coordinate = striker.tipPosition()[wall.axis];
            const signed = Math.sign(wall.coordinate) * (wall.coordinate - coordinate);
            const clearance = signed;
            const penetration = Math.max(0, -signed);
            minimumHeldWallClearanceM = Math.min(minimumHeldWallClearanceM, clearance);
            minimumHeldWallClearanceByKindM.set(striker.kind,
              Math.min(minimumHeldWallClearanceByKindM.get(striker.kind) ?? Number.POSITIVE_INFINITY, clearance));
            maximumHeldWallPenetrationM = Math.max(maximumHeldWallPenetrationM, penetration);
            maximumHeldWallPenetrationByKindM.set(striker.kind,
              Math.max(maximumHeldWallPenetrationByKindM.get(striker.kind) ?? 0, penetration));
          }
        }
        for (const joint of construct.runtime.joints.values()) {
          const frames = joint.liveFrames();
          maximumConstructJointFrameErrorM = Math.max(maximumConstructJointFrameErrorM,
            Vector3.Distance(frames.parent.position, frames.child.position));
        }
      }
      constructCombat.advance(FIXED);
      warriorCombat.advance(FIXED);
      // Combat callbacks above publish this tick's physical contacts. A completed Action remains
      // their authority through that solver step, so its terminal row follows them at the same
      // integer tick rather than making valid contact appear post-terminal.
      for (const { event, instance } of terminalQualificationEvents) {
        qualificationEvent(`action-${event.kind}`, { action: event.action,
          actionInstanceId: instance?.actionInstanceId ?? null, reason: event.reason ?? null });
        if (instance?.action === "fire" && pendingFireQualificationInstance === instance) {
          pendingFireQualificationInstance = null;
        }
      }
      minimumRangeM = Math.min(minimumRangeM, Vector3.Distance(construct.centre(), warrior.centre()));

      const torso = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
      const head = construct.runtime.parts.get("head")?.node;
      const rootUp = Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
        torso.rotationQuaternion ?? Quaternion.Identity(), new Vector3()), Vector3.Up());
      const headAboveTorsoM = head ? head.position.y - torso.position.y : Number.POSITIVE_INFINITY;
      minimumRootUp = Math.min(minimumRootUp, rootUp);
      minimumTorsoHeightM = Math.min(minimumTorsoHeightM, torso.position.y);
      minimumHeadAboveTorsoM = Math.min(minimumHeadAboveTorsoM, headAboveTorsoM);
      const standing = isConstructStanding({ rootUp, torsoHeightM: torso.position.y, headAboveTorsoM },
        standingThresholds);
      for (const row of qualificationContactsAwaitingPosture.splice(0)) row.standingAtStep = standing;
      currentStandingS = standing ? currentStandingS + FIXED : 0;
      longestStandingS = Math.max(longestStandingS, currentStandingS);
      if (!standing && firstPostureLossS === null) firstPostureLossS = qualificationTimeAtStep(steps);
      if (!standing) observedPostureLoss = true;

      const assembled = [...construct.runtime.parts.values()].every(({ attached }) => attached);
      const recovery = observedPostureLoss ? standing ? "recovered" : "pending" : "not-required";
      const supportKey = JSON.stringify([standing, assembled, recovery]);
      if (supportKey !== lastSupportEvidenceKey) {
        qualificationEvent("support", { standing, assembled, recovery });
        lastSupportEvidenceKey = supportKey;
      }

      const motionRows = [];
      for (const active of snapshot.active) {
        const request = snapshot.command.requests.find(({ request }) => request.action === active.action)?.request;
        if (active.action === "turn") {
          const yaw = request?.parameters.yaw;
          const localX = snapshot.facts["opponent-local-x"];
          motionRows.push({ request: "turn", correctSign: Number.isFinite(yaw) && Number.isFinite(localX) &&
            Math.sign(yaw) === Math.sign(localX) });
        } else if (active.action === "move" || active.action.startsWith("limp-") ||
            active.action.startsWith("crawl-without-")) {
          const forward = request?.parameters.forward;
          if (Number.isFinite(forward) && forward !== 0) motionRows.push({
            request: forward > 0 ? "close" : "retreat", correctSign: true,
          });
        }
      }
      const rangedActive = snapshot.active.some(({ action }) => action === "fire" || action === "track");
      if (rangedActive && !motionRows.length) motionRows.push({ request: "ranged-spacing",
        correctSign: snapshot.facts["line-of-sight"] === true,
        earned: snapshot.facts["line-of-sight"] === true && snapshot.facts["launcher-clear"] === true });
      const motionKey = JSON.stringify(motionRows);
      if (motionKey !== lastMotionEvidenceKey) {
        for (const row of motionRows) qualificationEvent("motion-request", row);
        lastMotionEvidenceKey = motionKey;
      }

      const qualificationVisible = snapshot.facts["line-of-sight"] === true;
      const qualificationRange = snapshot.facts["opponent-range"];
      const qualificationInRange = Number.isFinite(qualificationRange) && qualificationRange <=
        (saved.blueprint.modules.some(({ kind }) => kind === "launcher") ? 8 : resolvedConstructProfile.reach + 0.5);
      const physicalIntent = snapshot.active.some(({ action }) => QUALIFICATION_ATTACKS.has(action) ||
        action === "move" || action === "turn" || action === "track" || action === "recover" || action.startsWith("limp-") ||
        action.startsWith("crawl-without-"));
      const passiveNow = activeQualificationProgram && qualificationVisible && qualificationInRange && !physicalIntent;
      if (passiveNow && passiveIntervalStartS === null) passiveIntervalStartS = atS;
      if (!passiveNow && passiveIntervalStartS !== null) {
        qualificationEvent("passive-interval", { visible: true, inRange: true,
          durationS: atS - passiveIntervalStartS });
        passiveIntervalStartS = null;
      }

      if (steps % QUALIFICATION_CLEARANCE_SAMPLE_STEPS === 0) for (const pair of clearancePairs) {
        const sample = liveSemanticClearance(construct.runtime, pair);
        const diagnosticPrior = diagnosticClearanceMinimum.get(pair.semanticPair);
        if (sample && diagnosticPrior && sample.clearanceM < diagnosticPrior.clearanceM) {
          diagnosticClearanceMinimum.set(pair.semanticPair, { clearanceM: sample.clearanceM,
            requiredM: sample.requiredM, sampledAtStep: steps });
        }
        const active = snapshot.active.find(({ action }) => pair.actions.includes(action));
        const instance = active ? activeQualificationInstances.get(qualificationInstanceKey(active)) : null;
        if (sample && active && instance && instance.action === active.action) {
          sampleArmedClearance(instance, "live-authoritative-primitive-samples-30hz");
        }
      }

      if (commandedAttack?.action === "dual-cut") {
        const attemptPosture = dualAttemptPosture.get(dualCutAttempt) ?? {
          steps: 0, standingSteps: 0, admissionSupportedSteps: 0, minimumRootUp: Number.POSITIVE_INFINITY,
          minimumTorsoHeightM: Number.POSITIVE_INFINITY, minimumHeadAboveTorsoM: Number.POSITIVE_INFINITY,
        };
        attemptPosture.steps += 1;
        if (standing) attemptPosture.standingSteps += 1;
        if (snapshot.facts["contact-left-foot"] === true || snapshot.facts["contact-right-foot"] === true) {
          attemptPosture.admissionSupportedSteps += 1;
        }
        attemptPosture.minimumRootUp = Math.min(attemptPosture.minimumRootUp, rootUp);
        attemptPosture.minimumTorsoHeightM = Math.min(attemptPosture.minimumTorsoHeightM, torso.position.y);
        attemptPosture.minimumHeadAboveTorsoM = Math.min(attemptPosture.minimumHeadAboveTorsoM, headAboveTorsoM);
        dualAttemptPosture.set(dualCutAttempt, attemptPosture);
        let attemptTravel = dualEffectorTravel.get(dualCutAttempt);
        if (!attemptTravel) {
          attemptTravel = new Map();
          dualEffectorTravel.set(dualCutAttempt, attemptTravel);
        }
        for (const striker of construct.strikers.filter(({ kind }) => kind === "sword")) {
          const tip = striker.tipPosition();
          const prior = attemptTravel.get(striker.effectorId);
          const target = warrior.centre();
          const targetDistanceM = Vector3.Distance(tip, target);
          const closer = targetDistanceM < (prior?.minimumTargetDistanceM ?? Number.POSITIVE_INFINITY);
          attemptTravel.set(striker.effectorId, {
            start: prior?.start ?? tip.clone(), last: tip.clone(),
            startTargetDistanceM: prior?.startTargetDistanceM ?? targetDistanceM,
            travelM: (prior?.travelM ?? 0) + (prior ? Vector3.Distance(prior.last, tip) : 0),
            minimumTargetDistanceM: Math.min(prior?.minimumTargetDistanceM ?? Number.POSITIVE_INFINITY,
              targetDistanceM),
            closestTip: closer ? tip.clone() : prior.closestTip,
            closestTarget: closer ? target.clone() : prior.closestTarget,
          });
        }
      }

      const activeAttack = snapshot.active.find(({ action }) => action === "dual-cut" || action === "sweep");
      activeAfterStep = activeAttack?.action ?? null;
      const fact = snapshot.facts;
      const warriorThreatVisible = warriorPerceivesMountedThreat(warrior.view.opponent);
      const warriorLauncherVisible = warriorPerceivesLauncher(warrior.view.opponent);
      blockerTimeline.push(Object.freeze({ atS: qualificationTimeAtStep(steps),
        present: fact["opponent-blocker-present"],
        local: Object.freeze({ x: fact["opponent-blocker-local-x"],
          y: fact["opponent-blocker-local-y"], z: fact["opponent-blocker-local-z"] }),
        weaponLocalX: fact["opponent-weapon-local-x"],
        targetLocalX: fact["opponent-local-x"], rangeM: fact["opponent-range"],
        upright: fact["core-upright"], coreRollRad: fact["core-roll-rad"],
        corePitchRad: fact["core-pitch-rad"], lineOfSight: fact["line-of-sight"],
        admissionSupported: fact["contact-left-foot"] === true || fact["contact-right-foot"] === true,
        warriorThreatVisible, warriorLauncherVisible,
        action: activeAttack?.action ?? null, phase: activeAttack?.phase ?? null,
        attempt: activeAttack?.action === "dual-cut" ? dualCutAttempt : null,
        selectedRules: Object.freeze([...(snapshot.decision?.selectedRules ?? [])]) }));
      const controllerPhase = activeAttack ? `${activeAttack.action}/${activeAttack.phase}` : "none";
      if (controllerPhase !== lastControllerPhase) {
        controllerTimeline.push(Object.freeze({ atS: qualificationTimeAtStep(steps),
          action: activeAttack?.action ?? null, phase: activeAttack?.phase ?? null,
          attempt: activeAttack?.action === "dual-cut" ? dualCutAttempt : null }));
        lastControllerPhase = controllerPhase;
      }
      for (const id of snapshot.decision?.selectedRules ?? []) selectedRules.add(id);
      for (const event of snapshot.events) {
        if (event.kind in lifecycle) lifecycle[event.kind] += 1;
        if (event.kind in lifecycle) {
          const row = { atS: qualificationTimeAtStep(steps),
            rangeM: Vector3.Distance(construct.centre(), warrior.centre()), rootUp,
            torsoHeightM: torso.position.y, coreRollRad: fact["core-roll-rad"],
            corePitchRad: fact["core-pitch-rad"], kind: event.kind, action: event.action,
            reason: event.reason ?? null, attempt: event.action === "dual-cut" ? dualCutAttempt : null,
            shotSerial: null };
          if (event.action === "fire" && event.kind === "started") pendingFireStart = row;
          if (event.action === "fire" && event.kind === "completed") {
            const looseCount = construct.launcherLooseCount();
            if (looseCount === observedLauncherLooses + 1) {
              row.shotSerial = looseCount - 1;
              if (pendingFireStart) pendingFireStart.shotSerial = row.shotSerial;
              observedLauncherLooses = looseCount;
            }
            pendingFireStart = null;
          } else if (event.action === "fire" &&
              (event.kind === "cancelled" || event.kind === "failed" || event.kind === "refused")) {
            pendingFireStart = null;
          }
          actionTimeline.push(row);
        }
        if (event.kind === "started") startedActions.add(event.action);
        if (event.kind === "completed") {
          completedActions.add(event.action);
          if (event.action === "sweep" && firstSweepCompletedS === null) {
            firstSweepCompletedS = qualificationTimeAtStep(steps);
          }
        }
      }
      const newConstructReports = constructReports.slice(constructReportCursor);
      constructReportCursor = constructReports.length;
      for (const event of newConstructReports) constructReportStanding.set(event, standing);
      if (newConstructReports.some(({ report }) => report.damage > 0)) {
        if (firstConstructDamageS === null) firstConstructDamageS = qualificationTimeAtStep(steps);
        if (standing && firstUprightConstructDamageS === null) {
          firstUprightConstructDamageS = qualificationTimeAtStep(steps);
        }
      }
      if (verdictAtStep === null && (construct.vitality <= 0 || warrior.vitality <= 0)) {
        verdictAtStep = steps + 1;
        verdictVitality = Object.freeze({ construct: construct.vitality, warrior: warrior.vitality });
        // Collision observers remain installed for teardown, but the recovery tail cannot
        // change the already-decided winner or manufacture post-verdict evidence.
        constructCombat.stop();
        warriorCombat.stop();
        stopDefeatedConstructWarriorControl(construct, warrior);
      }
    }

    const qualificationEndS = qualificationTimeAtStep(steps);
    if (passiveIntervalStartS !== null) {
      qualificationEvent("passive-interval",
        { visible: true, inRange: true, durationS: qualificationEndS - passiveIntervalStartS });
      passiveIntervalStartS = null;
    }
    const passiveIntervals = qualificationEvents.filter(({ kind }) => kind === "passive-interval");
    qualificationEvent("passive-audit", { activeProgram: activeQualificationProgram,
      intervals: passiveIntervals.length, terminalFlushed: passiveIntervalStartS === null,
      maximumDurationS: passiveIntervals.reduce((maximum, { durationS }) =>
        Math.max(maximum, durationS), 0) });
    for (const pair of clearancePairs) {
      const observed = diagnosticClearanceMinimum.get(pair.semanticPair);
      if (!observed || !Number.isFinite(observed.clearanceM) || !Number.isFinite(observed.requiredM)) continue;
      qualificationEvent("self-clearance-diagnostic", { semanticPair: pair.semanticPair,
        clearanceM: observed.clearanceM, requiredM: observed.requiredM,
        sampledAtStep: observed.sampledAtStep, method: "whole-bout-live-authoritative-primitive-samples-30hz" });
    }
    const finalTorso = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
    const finalHead = construct.runtime.parts.get("head")?.node;
    const finalRootUp = Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
      finalTorso.rotationQuaternion ?? Quaternion.Identity(), new Vector3()), Vector3.Up());
    const finalStanding = isConstructStanding({ rootUp: finalRootUp, torsoHeightM: finalTorso.position.y,
      headAboveTorsoM: finalHead ? finalHead.position.y - finalTorso.position.y : Number.POSITIVE_INFINITY },
    standingThresholds);
    qualificationEvent("support", { standing: finalStanding,
      assembled: [...construct.runtime.parts.values()].every(({ attached }) => attached),
      recovery: observedPostureLoss ? finalStanding ? "recovered" : "pending" : "not-required" });
    qualificationEvent("combat-audit", combatRefusalCounts);

    // This is evidence, not a compatibility shim. Until Construct publishes mounted strikers in
    // BodyView, a Warrior can collide with and be hurt by the sword while its Mind sees no hand or
    // natural-attack threat. The report carries that limitation instead of laundering the bout as
    // a fair tactical comparison.
    const perceived = warrior.view.opponent;
    const perceivedEffectors = Object.freeze((perceived.effectors ?? []).map((effector) => Object.freeze({
      weapon: effector.weapon,
      anchor: Object.freeze({ x: effector.anchor.x, y: effector.anchor.y, z: effector.anchor.z }),
      tip: Object.freeze({ x: effector.tip.x, y: effector.tip.y, z: effector.tip.z }),
      tipVelocity: Object.freeze({ x: effector.tipVelocity.x, y: effector.tipVelocity.y, z: effector.tipVelocity.z }),
      reach: effector.reach,
      lost: effector.lost,
    })));
    const mountedThreatVisible = blockerTimeline.some(({ warriorThreatVisible }) =>
      warriorThreatVisible === true);
    const launcherVisible = blockerTimeline.some(({ warriorLauncherVisible }) =>
      warriorLauncherVisible === true);
    const finalVitality = verdictVitality ?? Object.freeze({ construct: construct.vitality, warrior: warrior.vitality });
    const winner = constructWarriorWinner(finalVitality.construct, finalVitality.warrior);
    const attachedWarriorParts = warrior.limbs.filter(({ severed }) => !severed)
      .map(({ key, part }) => Object.freeze({ key, x: part.mesh.position.x,
        y: part.mesh.position.y, z: part.mesh.position.z }));
    const warriorPelvisPosition = warrior.articulated?.pelvis.mesh.position ?? warrior.centre();
    const warriorPhysical = Object.freeze({
      pelvis: Object.freeze({ x: warriorPelvisPosition.x, y: warriorPelvisPosition.y,
        z: warriorPelvisPosition.z }),
      minimumAttachedY: Math.min(...attachedWarriorParts.map(({ y }) => y)),
      maximumAttachedY: Math.max(...attachedWarriorParts.map(({ y }) => y)),
      maximumAttachedDistanceFromPelvisM: Math.max(...attachedWarriorParts.map(({ x, y, z }) =>
        Math.hypot(x - warriorPelvisPosition.x, y - warriorPelvisPosition.y,
          z - warriorPelvisPosition.z))),
      attachedParts: Object.freeze(attachedWarriorParts),
    });
    const constructRoot = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
    const constructRootRotation = constructRoot.rotationQuaternion ?? Quaternion.Identity();
    const constructPhysical = Object.freeze({
      root: Object.freeze({ x: constructRoot.position.x, y: constructRoot.position.y,
        z: constructRoot.position.z }),
      rootUp: Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(constructRootRotation,
        new Vector3()), Vector3.Up()),
      minimumAttachedY: Math.min(...[...construct.runtime.parts.values()]
        .map(({ node }) => node.position.y)),
      maximumAttachedDistanceFromRootM: Math.max(...[...construct.runtime.parts.values()]
        .map(({ node }) => Vector3.Distance(node.position, constructRoot.position))),
    });
    const contactRows = (events) => Object.freeze(events.map((event) => {
      const { report, effectorId, blocked,
      sourceModuleId = null, action = null, phase = null, attempt = null, shotSerial = null,
        actionInstanceId = null,
        targetVitalityBefore = null, targetVitalityAfter = null } = event;
      return Object.freeze({
      atS: report.at, effectorId, blocked, weapon: report.weapon, limb: report.key, kind: report.kind,
      speedMps: report.speed, edgeAlignment: report.edgeAlignment, damage: report.damage,
      sourceModuleId, action, phase, attempt, shotSerial, actionInstanceId,
      preArmourDamage: report.preArmourDamage, postArmourDamage: report.postArmourDamage,
      projectile: report.projectile ?? null, stabilityShove: report.stabilityShove ?? null,
      targetVitalityBefore, targetVitalityAfter,
      standingAtStep: constructReportStanding.get(event) ?? null,
      point: Object.freeze({ x: report.point.x, y: report.point.y, z: report.point.z }),
      });
    }));
    const swordDamageScales = Object.freeze(construct.strikers.filter(({ kind }) => kind === "sword")
      .map(({ effectorId, damageScale = 1 }) => Object.freeze({ effectorId, damageScale }))
      .sort((left, right) => left.effectorId.localeCompare(right.effectorId)));
    const resources = construct.state.hardware().resources;
    const magazine = saved.blueprint.modules.find(({ kind }) => kind === "magazine");
    const launcherEvidence = Object.freeze(saved.blueprint.modules.filter(({ kind }) => kind === "launcher")
      .map((module) => Object.freeze({ moduleId: module.id,
        poolSize: module.projectile?.poolSize ?? null,
        projectileMassKg: module.projectile?.massKg ?? null,
        projectileRadiusM: module.projectile?.radiusM ?? null,
        projectileLengthM: module.projectile?.lengthM ?? null,
        muzzleSpeedMps: module.projectile?.muzzleSpeedMps ?? null,
        penetrationEfficiency: module.projectile?.penetrationEfficiency ?? null,
        reloadSeconds: module.reloadSeconds ?? null,
        maxHeatJ: module.maxHeatJ ?? null,
        coolingW: module.coolingW ?? null,
        heatPerShotJ: module.heatPerShotJ ?? null,
        energyPerShotJ: module.energyPerShotJ ?? null,
        magazineId: magazine?.id ?? null,
        initialAmmunition: magazine?.ammunition ?? null,
        remainingAmmunition: magazine ? resources.ammunition[magazine.id] ?? null : null })));
    return Object.freeze({
      version: 4,
      physics: "real-havok-fixed-240hz",
      construct: Object.freeze({ blueprintId: saved.blueprint.id, programId: saved.program.id,
        side: constructSide, vitality: finalVitality.construct,
        damage: constructReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      warrior: Object.freeze({ policy: warriorPolicy, seed: warriorSeed, vitality: finalVitality.warrior,
        damage: warriorReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      steps,
      simulatedSeconds: qualificationTimeAtStep(steps),
      qualificationEventStepHz: CONFIG.world.physicsHz,
      verdictAtStep,
      verdictAtS: verdictAtStep === null ? null : qualificationTimeAtStep(verdictAtStep),
      postVerdictTailS: verdictAtStep === null ? 0 : qualificationTimeAtStep(steps - verdictAtStep),
      qualificationPassiveIntervalLimitS,
      minimumSelfClearanceM: (() => {
        const values = [...clearanceMinimum.values()].map(({ clearanceM }) => clearanceM);
        return values.length && values.every(Number.isFinite) ? Math.min(...values) : null;
      })(),
      diagnosticMinimumSelfClearanceM: (() => {
        const values = [...diagnosticClearanceMinimum.values()].map(({ clearanceM }) => clearanceM);
        return values.length && values.every(Number.isFinite) ? Math.min(...values) : null;
      })(),
      qualificationEvents: Object.freeze(qualificationEvents.map((row) => Object.freeze(row))),
      winner,
      warriorPhysical,
      constructPhysical,
      stabilityShoves: fixtureShoves,
      fixturePlacement: fixturePlacement === null ? null : Object.freeze({
        construct: Object.freeze({ ...fixturePlacement.construct }),
        warrior: Object.freeze({ ...fixturePlacement.warrior }),
        wall: fixturePlacement.wall ? Object.freeze({ ...fixturePlacement.wall }) : null,
      }),
      solver: Object.freeze({ measurementStartS: qualificationTimeAtStep(solverMeasurementStartStep),
        fixtureEnvelopeIntersectsWall, maximumPartSpeedMps, maximumConstructJointFrameErrorM,
        minimumHeldWallClearanceM: Number.isFinite(minimumHeldWallClearanceM)
          ? minimumHeldWallClearanceM : null,
        minimumHeldWallClearanceByKindM: Object.freeze(Object.fromEntries(
          [...minimumHeldWallClearanceByKindM].sort(([left], [right]) => left.localeCompare(right)))),
        maximumHeldWallPenetrationM,
        maximumHeldWallPenetrationByKindM: Object.freeze(Object.fromEntries(
          [...maximumHeldWallPenetrationByKindM].sort(([left], [right]) => left.localeCompare(right)))),
        heldWorldContactsByKind: Object.freeze(Object.fromEntries(
          [...heldWorldContactsByKind].sort(([left], [right]) => left.localeCompare(right)))),
        heldKinds: Object.freeze([...heldKinds].sort()) }),
      swordDamageScales,
      launcherEvidence,
      locomotion: Object.freeze({ mode: locomotionMode, initialRangeM,
        finalRangeM: Vector3.Distance(construct.centre(), warrior.centre()),
        constructRootDisplacementM: Vector3.Distance(initialConstructRoot, construct.centre()),
        warriorRootDisplacementM: Vector3.Distance(initialWarriorRoot, warrior.centre()),
        constructSupportState: construct.locomotion?.state ?? null,
        warriorSupportState: warrior.locomotion?.state ?? null,
        constructDiagnostic: construct.locomotion?.diagnostic() ?? null,
        warriorDiagnostic: warrior.locomotion?.diagnostic() ?? null }),
      locomotionTimeline: Object.freeze(locomotionTimeline),
      locomotionSteps: Object.freeze(locomotionSteps),
      minimumRangeM,
      startedActions: Object.freeze([...startedActions].sort()),
      completedActions: Object.freeze([...completedActions].sort()),
      actionTimeline: Object.freeze(actionTimeline.map((row) => Object.freeze(row))),
      blockerTimeline: Object.freeze(blockerTimeline),
      controllerTimeline: Object.freeze(controllerTimeline),
      dualMotorJoints: Object.freeze([...dualMotorJoints].map(([attempt, joints]) => Object.freeze({
        attempt, joints: Object.freeze([...joints].sort()),
        targets: Object.freeze([...(dualMotorTargets.get(attempt) ?? new Map())]
          .map(([joint, row]) => Object.freeze({ joint, writes: row.writes,
            minimumAngleRad: row.minimumAngleRad, maximumAngleRad: row.maximumAngleRad }))
          .sort((left, right) => left.joint.localeCompare(right.joint))),
      }))),
      dualEffectorTravel: Object.freeze([...dualEffectorTravel].map(([attempt, effectors]) => Object.freeze({
        attempt, effectors: Object.freeze([...effectors].map(([effectorId, row]) => Object.freeze({
          effectorId, travelM: row.travelM, minimumTargetDistanceM: row.minimumTargetDistanceM,
          startTargetDistanceM: row.startTargetDistanceM,
          startToClosestApproachM: row.startTargetDistanceM - row.minimumTargetDistanceM,
          displacementM: Vector3.Distance(row.start, row.last),
          closestDelta: Object.freeze({ x: row.closestTip.x - row.closestTarget.x,
            y: row.closestTip.y - row.closestTarget.y, z: row.closestTip.z - row.closestTarget.z }),
        }))),
      }))),
      dualAttemptPosture: Object.freeze([...dualAttemptPosture].map(([attempt, row]) => Object.freeze({
        attempt, activeS: qualificationTimeAtStep(row.steps), standingFraction: row.standingSteps / row.steps,
        admissionSupportedFraction: row.admissionSupportedSteps / row.steps, minimumRootUp: row.minimumRootUp,
        minimumTorsoHeightM: row.minimumTorsoHeightM,
        minimumHeadAboveTorsoM: row.minimumHeadAboveTorsoM,
      }))),
      selectedRules: Object.freeze([...selectedRules].sort()),
      lifecycle: Object.freeze(lifecycle),
      posture: Object.freeze({ minimumRootUp, minimumTorsoHeightM, minimumHeadAboveTorsoM,
        longestStandingS, firstPostureLossS, thresholds: standingThresholds }),
      firstSweepCompletedS,
      firstConstructDamageS,
      firstUprightConstructDamageS,
      damagingEffectors: Object.freeze([...new Set(constructReports
        .filter(({ report }) => report.damage > 0).map(({ effectorId }) => effectorId))].sort()),
      constructContacts: contactRows(constructReports),
      warriorContacts: contactRows(warriorReports),
      mountedThreatVisibleToWarriorMind: mountedThreatVisible,
      launcherVisibleToWarriorMind: launcherVisible,
      perceivedEffectors,
    });
  } finally {
    for (const { observable, observer } of heldWallObservers) observable.remove(observer);
    warriorCombat?.dispose();
    constructCombat?.dispose();
    warrior?.dispose();
    construct.dispose();
    materials.material.dispose(false, false);
    arena.dispose();
  }
}

export function assertConstructWarriorEvidence(report) {
  const failures = [];
  const timeline = Array.isArray(report.actionTimeline) ? report.actionTimeline : [];
  const blockerTimeline = Array.isArray(report.blockerTimeline) ? report.blockerTimeline : [];
  const contacts = Array.isArray(report.constructContacts) ? report.constructContacts : [];
  const finite = (...values) => values.every(Number.isFinite);
  const sameTime = (left, right) => finite(left, right) && Math.abs(left - right) <= 1e-9;
  const sameStrings = (actual, expected) => Array.isArray(actual) &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
  if (report.physics !== "real-havok-fixed-240hz") failures.push("physics was not real fixed-step Havok");
  const requiredStandingS = Math.min(19, report.simulatedSeconds * 0.95);
  if (!(report.simulatedSeconds > 0)) failures.push("bout did not advance physical time");
  if (report.posture.longestStandingS < requiredStandingS) {
    failures.push(`standing lasted only ${report.posture.longestStandingS} s of ${report.simulatedSeconds} s`);
  }
  const expectedScales = [{ effectorId: "effigy-sword", damageScale: 1.15 },
    { effectorId: "left-effigy-sword", damageScale: 1.15 }];
  if (JSON.stringify(report.swordDamageScales) !== JSON.stringify(expectedScales)) {
    failures.push("runtime Twinblade swords were not the exact ordinary 1.15 damage-scale pair");
  }
  const detailedStarted = [...new Set(timeline.filter(({ kind }) => kind === "started")
    .map(({ action }) => action))].sort();
  const detailedCompleted = [...new Set(timeline.filter(({ kind }) => kind === "completed")
    .map(({ action }) => action))].sort();
  const detailedDamaging = [...new Set(contacts.filter(({ damage }) => Number.isFinite(damage) && damage > 0)
    .map(({ effectorId }) => effectorId))].sort();
  if (!sameStrings(report.startedActions, detailedStarted)) failures.push("startedActions contradicted the timeline");
  if (!sameStrings(report.completedActions, detailedCompleted)) failures.push("completedActions contradicted the timeline");
  if (!sameStrings(report.damagingEffectors, detailedDamaging)) failures.push("damagingEffectors contradicted contacts");
  const firstDamage = contacts.filter(({ damage, atS }) => damage > 0 && finite(damage, atS))
    .reduce((first, { atS }) => Math.min(first, atS), Number.POSITIVE_INFINITY);
  const firstUprightDamage = contacts.filter(({ damage, atS, standingAtStep }) =>
    damage > 0 && standingAtStep === true && finite(damage, atS))
    .reduce((first, { atS }) => Math.min(first, atS), Number.POSITIVE_INFINITY);
  if (!sameTime(report.firstConstructDamageS, firstDamage)) failures.push("firstConstructDamageS contradicted contacts");
  if (!sameTime(report.firstUprightConstructDamageS, firstUprightDamage)) {
    failures.push("firstUprightConstructDamageS contradicted contact posture");
  }
  const detailedMountedThreatVisible = blockerTimeline.some(({ warriorThreatVisible }) =>
    warriorThreatVisible === true);
  if (report.mountedThreatVisibleToWarriorMind !== detailedMountedThreatVisible) {
    failures.push("mounted threat visibility contradicted the time-local perception timeline");
  }
  const detailedLifecycle = { started: 0, completed: 0, cancelled: 0, refused: 0, failed: 0 };
  for (const row of timeline) if (row.kind in detailedLifecycle) detailedLifecycle[row.kind] += 1;
  if (!report.lifecycle || Object.keys(detailedLifecycle).some((kind) => report.lifecycle[kind] !== detailedLifecycle[kind])) {
    failures.push("lifecycle summary contradicted the timeline");
  }
  if (timeline.some(({ action, kind }) => action === "dual-cut" &&
    (kind === "cancelled" || kind === "refused" || kind === "failed"))) {
    failures.push("dual-cut was cancelled, refused, or failed");
  }
  const startedAttempts = timeline.filter(({ kind, action, attempt, atS }) => kind === "started" &&
    action === "dual-cut" && Number.isInteger(attempt) && Number.isFinite(atS));
  const requiredMotors = ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch",
    "left-hip", "left-knee", "left-ankle", "left-sole", "right-hip", "right-knee", "right-ankle", "right-sole"];
  const qualifiedAttempt = startedAttempts.find((started) => {
    const attempt = started.attempt;
    const completed = timeline.find((row) => row.kind === "completed" && row.action === "dual-cut" &&
      row.attempt === attempt && Number.isFinite(row.atS));
    const blocker = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "chamber" && row.present === true && sameTime(row.atS, started.atS));
    if (!completed || !blocker || !finite(blocker.local?.x, blocker.targetLocalX) ||
        Math.abs(blocker.local.x - blocker.targetLocalX) < 0.02) return false;
    const firstCutterModule = blocker.local.x - blocker.targetLocalX < 0
      ? "left-effigy-sword" : "effigy-sword";
    const secondCutterModule = firstCutterModule === "left-effigy-sword"
      ? "effigy-sword" : "left-effigy-sword";
    const firstCut = contacts.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "first-cut" && !row.blocked && row.limb === "torso" && row.kind === "cut" &&
      row.damage > 0 && row.effectorId === firstCutterModule && row.sourceModuleId === firstCutterModule &&
      row.standingAtStep === true && finite(row.atS, row.damage,
        row.targetVitalityBefore, row.targetVitalityAfter) &&
      row.targetVitalityBefore > row.targetVitalityAfter && row.targetVitalityAfter > 0 &&
      row.atS > started.atS);
    const secondCut = contacts.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "second-cut" && !row.blocked && row.limb === "torso" && row.kind === "cut" &&
      row.damage > 0 && row.effectorId === secondCutterModule && row.sourceModuleId === secondCutterModule &&
      row.standingAtStep === true && finite(row.atS, row.damage,
        row.targetVitalityBefore, row.targetVitalityAfter) &&
      row.targetVitalityBefore > 0 && row.targetVitalityAfter <= 0 &&
      (!firstCut || row.atS > firstCut.atS));
    const firstCutIndex = contacts.indexOf(firstCut);
    const secondCutIndex = contacts.indexOf(secondCut);
    const interveningDamage = firstCutIndex >= 0 && secondCutIndex > firstCutIndex &&
      contacts.slice(firstCutIndex + 1, secondCutIndex).some(({ damage }) =>
        Number.isFinite(damage) && damage > 0);
    if (!firstCut || !secondCut || !(completed.atS > secondCut.atS) ||
        firstCutIndex < 0 || secondCutIndex <= firstCutIndex || interveningDamage ||
        !sameTime(firstCut.targetVitalityAfter, secondCut.targetVitalityBefore) ||
        !sameTime(report.verdictAtS, secondCut.atS + FIXED) || !(report.postVerdictTailS > 0) ||
        completed.atS < report.verdictAtS) return false;
    const firstCutFrame = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "first-cut" && sameTime(row.atS, firstCut.atS));
    const secondCutFrame = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "second-cut" && sameTime(row.atS, secondCut.atS));
    if (blocker.admissionSupported !== true || blocker.upright !== true ||
        blocker.warriorThreatVisible !== true || firstCutFrame?.warriorThreatVisible !== true ||
        secondCutFrame?.warriorThreatVisible !== true ||
        firstCutFrame?.admissionSupported !== true || secondCutFrame?.admissionSupported !== true) return false;
    const motorRow = report.dualMotorJoints.find((row) => row.attempt === attempt);
    const posture = report.dualAttemptPosture.find((row) => row.attempt === attempt);
    if (!posture || !finite(posture.activeS, posture.standingFraction, posture.admissionSupportedFraction,
      posture.minimumRootUp, posture.minimumTorsoHeightM, posture.minimumHeadAboveTorsoM) ||
      posture.activeS <= 0 || posture.standingFraction < CONSTRUCT_ACTION_EVIDENCE.minimumStandingFraction ||
      posture.admissionSupportedFraction < CONSTRUCT_ACTION_EVIDENCE.minimumAdmissionSupportedFraction) return false;
    const travel = report.dualEffectorTravel.find((row) => row.attempt === attempt);
    if (!travel || travel.effectors.length !== 2) return false;
    const expectedEffectors = ["effigy-sword", "left-effigy-sword"];
    if (!sameStrings(travel.effectors.map(({ effectorId }) => effectorId), expectedEffectors) ||
      travel.effectors.some((row) => !finite(row.travelM, row.minimumTargetDistanceM,
        row.startTargetDistanceM, row.startToClosestApproachM, row.displacementM,
        row.closestDelta?.x, row.closestDelta?.y, row.closestDelta?.z) ||
        row.travelM < CONSTRUCT_ACTION_EVIDENCE.minimumEffectorTravelM ||
        Math.max(row.displacementM, row.startToClosestApproachM) <
          CONSTRUCT_ACTION_EVIDENCE.minimumEffectorDirectedMotionM)) return false;
    const swordTargets = Array.isArray(motorRow?.targets) ? motorRow.targets.filter(({ joint }) =>
      ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch"].includes(joint)) : [];
    return requiredMotors.every((joint) => motorRow?.joints.includes(joint)) &&
      swordTargets.length === 4 && swordTargets.every((row) => finite(row.writes,
        row.minimumAngleRad, row.maximumAngleRad) && row.writes >= 2 &&
        row.maximumAngleRad - row.minimumAngleRad >= CONSTRUCT_ACTION_EVIDENCE.minimumSwordTargetSpanRad);
  });
  if (!qualifiedAttempt) {
    failures.push("no one started-frame-qualified dual-cut landed two ordered opposite torso cuts, killed, and completed");
  }
  const detailedWinner = finite(report.construct?.vitality, report.warrior?.vitality)
    ? constructWarriorWinner(report.construct.vitality, report.warrior.vitality) : null;
  if (report.winner !== detailedWinner) failures.push("winner contradicted final vitality");
  if (report.winner !== "construct" || report.warrior?.vitality > 0) {
    failures.push(`construct did not defeat the Warrior (winner ${report.winner}, vitality ${report.warrior.vitality})`);
  }
  if (contacts.some(({ atS }) => Number.isFinite(atS) && Number.isFinite(report.verdictAtS) &&
    atS >= report.verdictAtS)) failures.push("post-verdict construct combat report was recorded");
  if (timeline.some(({ kind, atS }) => kind === "started" && Number.isFinite(atS) &&
    Number.isFinite(report.verdictAtS) && atS >= report.verdictAtS)) {
    failures.push("a new Action started during the post-verdict completion tail");
  }
  if (!report.mountedThreatVisibleToWarriorMind) failures.push("the Warrior Mind could not perceive the mounted sword");
  if (failures.length) throw new Error(`construct-Warrior evidence failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runConstructWarriorBout();
  assertConstructWarriorEvidence(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
