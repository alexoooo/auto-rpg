import type { Scene } from "@babylonjs/core/scene.js";
import poses from "../../../assets/research/posture-holds.json" with { type: "json" };
import { buildBody } from "../build/build-body.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import { modelSpec, type HumanoidModel as BodyModel } from "../models.ts";
import { checkedAction, type ActuatorAction } from "../mind/actions.ts";
import { createDirectBody, createPolicyBody } from "../mind/direct.ts";
import { deepFreeze } from "../state.ts";
import { createWorld } from "../world.ts";

/** Installed-pose fixture settings: `docs/reference/posture-hold.md#fixture-and-acceptance`. */
const SETTINGS = deepFreeze({ seconds: 10, tolerance: .02, effortTolerance: .0001,
  floor: { centre: [0, -.5, 0] as const, size: [20, 1, 20] as const } });

/** Hold a declared physical start through the independent observation/action controller. */
export function createPostureHoldProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: BodyModel; readonly posture: "fours" | "half-kneel" | "squat";
  readonly hz: number; readonly actuation: "symmetric" | "directional";
  readonly servoSeconds: number; readonly speed: number; readonly activation: number;
  readonly controller?: "direct" | "actuator";
}) {
  const controller = config.controller ?? "direct";
  const pose = poses.find((p) => p.id === config.posture && p.model === config.model);
  if (!pose) throw new Error("no installed posture for that body");
  if (!Number.isSafeInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0
    || ![config.servoSeconds, config.speed].every((v) => v > 0 && Number.isFinite(v))
    || !(config.activation >= 0 && config.activation <= 1)
    || (controller !== "direct" && controller !== "actuator")) throw new Error("invalid posture hold configuration");
  const spec = modelSpec(config.model);
  const configuration = deepFreeze({ ...config, task: "posture-hold", protocol: 1, settings: SETTINGS, pose,
    ...(controller === "actuator" ? { anatomy: JSON.parse(JSON.stringify(spec, (key, value) => key === "provenance" ? undefined : value)) as object } : {}),
    engineRevision: engine.revision, gravity: true, pin: null, assists: { root: 0, weapon: false }, held: "empty",
    controller, sensing: "detached body observations", modelAccess: "actuator descriptions" });
  const world = createWorld(scene, engine, { hz: config.hz, gravity: true, actuation: config.actuation });
  world.physics.addFixedBox(SETTINGS.floor.centre, SETTINGS.floor.size);
  const built = buildBody(spec, world, pose.placement as unknown as Parameters<typeof buildBody>[2]);
  const targets = Object.fromEntries([...built.joints].flatMap(([name, joint]) => joint.dofs.map((dof, i) =>
    [`${name} ${dof.spec.positive}`, (pose.placement.joints as Record<string, number[]>)[name]![i]!] as const)));
  const command = { action: deepFreeze({ kind: "torque", torque: Object.keys(targets).map(() => 0) }) as ActuatorAction };
  let actuators: Parameters<Parameters<typeof createPolicyBody>[2]>[0] | null = null;
  const body = (() => {
    switch (controller) {
      case "direct": return createDirectBody(built, world, { kind: "direct", targets, seconds: config.servoSeconds, speed: config.speed, activation: config.activation });
      case "actuator": return createPolicyBody(built, world, (model) => {
        actuators = model;
        return { name: "external-posture", state: command, step: () => command.action };
      });
      default: { const never: never = controller; throw new Error(`unknown posture controller ${never}`); }
    }
  })();
  const initial = deepFreeze(body.observe().segments.map((s) => ({ name: s.name, position: [...s.position] })));
  const state = { steps: 0, peakDrift: 0, finalDrift: 0, peakAngleError: 0, peakEffort: 0, peakEffortViolation: 0, contactSteps: 0 };
  const after = world.afterStep(() => {
    state.steps++; const observation = body.observe();
    state.finalDrift = 0;
    for (let i = 0; i < observation.segments.length; i++) {
      const now = observation.segments[i]!.position, start = initial[i]!.position;
      const dx = now[0] - start[0]!, dy = now[1] - start[1]!, dz = now[2] - start[2]!;
      state.finalDrift = Math.max(state.finalDrift, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    state.peakDrift = Math.max(state.peakDrift, state.finalDrift);
    for (const joint of observation.joints) {
      state.peakAngleError = Math.max(state.peakAngleError, Math.abs(joint.angle - targets[joint.name]!));
      state.peakEffort = Math.max(state.peakEffort, Math.abs(joint.effort));
      state.peakEffortViolation = Math.max(state.peakEffortViolation, joint.effort - joint.positive, -joint.effort - joint.negative);
    }
    if (observation.contacts.some((c) => c.fixed !== null && c.impulse > 0)) state.contactSteps++;
  });
  const complete = () => state.steps >= SETTINGS.seconds * config.hz;
  const success = () => complete() && state.peakDrift <= SETTINGS.tolerance && state.peakEffortViolation <= SETTINGS.effortTolerance
    && state.contactSteps > 0 && body.assist.meter.force === 0 && body.assist.meter.moment === 0;
  const check = (action: ActuatorAction) => {
    if (controller !== "actuator") throw new Error("direct posture hold does not accept external actions");
    return checkedAction(action, Object.keys(targets).length);
  };
  return { world, built, body, configuration, get actuators() { return actuators; }, state: { body: body.state, task: state },
    check,
    act(action: ActuatorAction) { command.action = check(action); },
    get complete() { return complete(); },
    observe: () => ({ task: { ...state, complete: complete(), success: success() }, body: body.observe() }),
    evaluate: () => ({ metrics: { ...state }, terminated: complete() ? success() ? "held" : "hold-failed" : null,
      invalid: Object.values(state).every(Number.isFinite) ? null : "non-finite posture motion" }),
    dispose() { after.dispose(); body.dispose(); built.dispose(); world.dispose(); } };
}
