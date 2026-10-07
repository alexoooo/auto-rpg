import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import poses from "../../../assets/research/posture-holds.json" with { type: "json" };
import { buildBody } from "../build/build-body.ts";
import { supportEntryReading } from "../control/support-entry.ts";
import { centreOfToRef } from "../control/support.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import { modelSpec, type HumanoidModel } from "../models.ts";
import { RECIPE_FIGHTER } from "../mind/config.ts";
import { createPolicyBody } from "../mind/direct.ts";
import { createMind } from "../mind/minds.ts";
import { STAND_ORDERS } from "../mind/orders.ts";
import { SUPPORT_ENTRY, supportEntryPolicy } from "../mind/rise/support-recovery.ts";
import { RISE } from "../mind/rise/stages.ts";
import { deepFreeze } from "../state.ts";
import { createWorld } from "../world.ts";

/** Development acquisition settings: `docs/reference/support-entry.md#fixture-and-acceptance`. */
const SETTINGS = deepFreeze({ seconds: 40, standSeconds: 1, fallSeconds: 3, impulsePerMass: 1.5,
  floor: { centre: [0, -.5, 0] as const, size: [20, 1, 20] as const },
  ...SUPPORT_ENTRY, acquireSeconds: 2, continueSeconds: 10,
  tolerance: .02, effortTolerance: .0001 });

/** Fall, acquire measured hand/shin support, and retain it under an independent policy. */
export function createSupportEntryProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: HumanoidModel; readonly direction: 0 | 1 | 2 | 3;
  readonly hz: number; readonly actuation: "symmetric" | "directional";
}) {
  const pose = poses.find((p) => p.model === config.model && p.id === "fours");
  if (!pose) throw new Error("no support entry witness for that body");
  if (![0, 1, 2, 3].includes(config.direction) || !Number.isSafeInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0) throw new Error("invalid support entry configuration");
  const configuration = deepFreeze({ ...config, task: "support-entry", protocol: 1, settings: SETTINGS,
    pose, recipe: RISE, engineRevision: engine.revision, held: "empty", pin: null,
    assists: { root: 0, weapon: false }, controller: "support-entry", bootstrapController: RECIPE_FIGHTER,
    sensing: "detached body observations", modelAccess: "actuator descriptions and initial reference frame" });
  const world = createWorld(scene, engine, { hz: config.hz, gravity: true, actuation: config.actuation });
  world.physics.addFixedBox(SETTINGS.floor.centre, SETTINGS.floor.size);
  const spec = modelSpec(config.model), built = buildBody(spec, world, { position: [0, 0, 0] });
  const boot = createMind(built, world, RECIPE_FIGHTER, { name: "fall-start", orders: () => STAND_ORDERS }).body;
  if (!("view" in boot)) throw new Error("fall bootstrap requires a fighter view");
  world.step(SETTINGS.standSeconds * config.hz);
  const direction = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]][config.direction]!;
  const mass = [...built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0), trunk = built.segments.get("middleTrunk")!;
  trunk.body.applyImpulse(new Vector3(direction[0], direction[1], direction[2]).scaleInPlace(mass * SETTINGS.impulsePerMass), centreOfToRef(trunk, new Vector3()));
  for (let step = 0; step < SETTINGS.fallSeconds * config.hz && !boot.view.down; step++) world.step();
  const fell = boot.view.down;
  boot.dispose();
  const reference = built.segments.get(SETTINGS.root)!.rest;
  const reading = { ...SETTINGS, reference: [reference.x, reference.y, reference.z, reference.w] as const };
  const body = createPolicyBody(built, world, (model) => {
    const entry = supportEntryPolicy(built, model);
    if (!entry) throw new Error("no support entry witness for that body");
    return entry.policy;
  });
  const state = { steps: 0, fell, supportedSteps: 0, peakSupportSteps: 0, quietSteps: 0, acquiredAt: -1,
    continuedSteps: 0, lostSupport: false, peakDrift: 0, peakEffortViolation: 0, reference: [] as number[][] };
  const after = world.afterStep(() => {
    state.steps++;
    const observation = body.observe(), measured = supportEntryReading(observation, reading);
    state.supportedSteps = measured.supported ? state.supportedSteps + 1 : 0;
    state.peakSupportSteps = Math.max(state.peakSupportSteps, state.supportedSteps);
    state.quietSteps = measured.supported && measured.still ? state.quietSteps + 1 : 0;
    if (state.acquiredAt < 0 && state.quietSteps >= SETTINGS.acquireSeconds * config.hz) {
      state.acquiredAt = state.steps; state.reference.push(...observation.segments.map((s) => [...s.position]));
    }
    if (state.acquiredAt >= 0) {
      state.continuedSteps = state.steps - state.acquiredAt;
      state.lostSupport ||= !measured.supported;
      for (let i = 0; i < observation.segments.length; i++) {
        const at = observation.segments[i]!.position, start = state.reference[i]!;
        const x = at[0] - start[0]!, y = at[1] - start[1]!, z = at[2] - start[2]!;
        state.peakDrift = Math.max(state.peakDrift, Math.sqrt(x * x + y * y + z * z));
      }
    }
    for (const j of observation.joints) state.peakEffortViolation = Math.max(state.peakEffortViolation, j.effort - j.positive, -j.effort - j.negative);
  });
  const complete = () => state.steps >= SETTINGS.seconds * config.hz || state.continuedSteps >= SETTINGS.continueSeconds * config.hz;
  const success = () => state.fell && state.continuedSteps >= SETTINGS.continueSeconds * config.hz && !state.lostSupport
    && state.peakDrift <= SETTINGS.tolerance && state.peakEffortViolation <= SETTINGS.effortTolerance
    && body.assist.meter.force === 0 && body.assist.meter.moment === 0;
  return { world, built, body, configuration, state: { body: body.state, task: state },
    get complete() { return complete(); },
    observe: () => ({ body: body.observe(), task: { ...structuredClone(state), complete: complete(), success: success() } }),
    dispose() { after.dispose(); body.dispose(); built.dispose(); world.dispose(); } };
}
