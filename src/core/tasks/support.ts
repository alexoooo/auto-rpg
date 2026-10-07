import type { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../build/build-body.ts";
import { supportTransition } from "../control/support-transition.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import type { Side } from "../human/landmarks.ts";
import { modelSpec, type HumanoidModel } from "../models.ts";
import { createMotionBody } from "../mind/motion.ts";
import { deepFreeze } from "../state.ts";
import { createWorld } from "../world.ts";

/** Upright support experiment inputs, numeric settings (`docs/reference/support-transition.md`). */
const SETTINGS = deepFreeze({ lower: 0.04, lift: 0.04, placementMargin: 0.002, centreGain: 0.7,
  seconds: 0.25, rootWeight: 1, pointWeight: 3, rotationWeight: 1, minimumTransfer: 1,
  centreTolerance: 0.01, unloadFraction: 0.05, speedTolerance: 0.03, liftTolerance: 0.008,
  placementTolerance: 0.004, rotationTolerance: 0.00001, holdSeconds: 0.25,
  knee: 0.6, jointSeconds: 0.3, legWeight: 0.02, otherWeight: 0.1, effortCost: 1e-6,
  continueSeconds: 1, capacity: 2, floor: { centre: [0, -0.5, 0] as const, size: [20, 1, 20] as const },
  contact: { maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 } });

/** Shared physical fixture: unload either foot, lift, place and regain two-foot support. */
export function createSupportProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: HumanoidModel; readonly side: Side; readonly hz: number; readonly liftOffset: number;
  readonly actuation: "symmetric" | "directional";
}) {
  if ((config.side !== "left" && config.side !== "right") || !Number.isSafeInteger(config.hz) || config.hz < 120
    || config.hz % 120 !== 0 || !Number.isFinite(config.liftOffset) || SETTINGS.lift + config.liftOffset <= 0) throw new Error("invalid support fixture configuration");
  const configuration = deepFreeze({ ...config, task: "support-transition", protocol: 1, settings: SETTINGS,
    engineRevision: engine.revision, gravity: true, pin: null, assists: { root: 0, weapon: false }, held: "empty" });
  const world = createWorld(scene, engine, { hz: config.hz, gravity: true, actuation: config.actuation });
  world.physics.addFixedBox(SETTINGS.floor.centre, SETTINGS.floor.size);
  const built = buildBody(modelSpec(config.model), world, { position: [0, 0, 0] });
  let policy!: ReturnType<typeof supportTransition>;
  const body = createMotionBody(built, world, (model) => {
    const joints = model.channels.map((c) => ({ channel: c.name,
      angle: Math.max(c.min, Math.min(c.max, /knee/.test(c.name) ? SETTINGS.knee : 0)), rate: 0, acceleration: 0,
      seconds: SETTINGS.jointSeconds, weight: /hip|knee|ankle/.test(c.name) ? SETTINGS.legWeight : SETTINGS.otherWeight }));
    policy = supportTransition({ ...SETTINGS, lift: SETTINGS.lift + config.liftOffset, root: "lowerTrunk",
      moving: `foot.${config.side}`, support: `foot.${config.side === "left" ? "right" : "left"}`, joints });
    return policy;
  }, { items: [], grants: [], fixed: [], capacity: SETTINGS.capacity, effortCost: SETTINGS.effortCost, contact: SETTINGS.contact });
  const state = { steps: 0, fell: false, completedAt: -1, continuedSteps: 0, peakLift: 0, flightSteps: 0,
    returnError: 0, rejectedSteps: 0, peakTension: 0, peakFrictionViolation: 0 };
  const after = world.afterStep(() => {
    state.steps++;
    const observation = body.observe(), foot = observation.segments.find((s) => s.name === `foot.${config.side}`)!;
    state.fell ||= observation.down;
    const initial = policy.state.initial;
    if (initial) {
      const dx = foot.position[0] - initial.foot[0], dy = foot.position[1] - initial.foot[1], dz = foot.position[2] - initial.foot[2];
      state.peakLift = Math.max(state.peakLift, dy); state.returnError = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dy > (SETTINGS.lift + config.liftOffset) / 2 && !observation.contacts.some((c) => c.segment === foot.name && c.fixed !== null && c.impulse > 0)) state.flightSteps++;
    }
    if (policy.state.phase === "complete" && state.completedAt < 0) state.completedAt = state.steps;
    if (state.completedAt >= 0 && !observation.down) state.continuedSteps++;
    const report = body.report().contact!;
    if (report.status === "rejected") state.rejectedSteps++;
    state.peakTension = Math.max(state.peakTension, report.tension);
    state.peakFrictionViolation = Math.max(state.peakFrictionViolation, report.frictionViolation);
  });
  return { world, built, body, configuration, state: { body: body.state, task: state },
    get complete() { return state.completedAt >= 0 && state.steps - state.completedAt >= SETTINGS.continueSeconds * config.hz; },
    observe: () => ({ task: { ...state, phase: policy.state.phase, transitions: policy.state.transitions.map((t) => ({ ...t })) }, body: body.observe() }),
    dispose() { after.dispose(); body.dispose(); built.dispose(); world.dispose(); } };
}
