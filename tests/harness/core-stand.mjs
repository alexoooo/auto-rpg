/**
 * **The core's Node stand**: one body built from a spec, on a ground, in a world of its own on the
 * engine `CORE_ENGINE` names (Rapier unless named: `CORE_ENGINE=<name> npm test`).
 *
 * The core's world (`createWorld`, `src/core/world/world.ts`) steps the engine, as the page does. The body is built through `buildBody`
 * and nothing else, so what the stand reads is what the spec states. Bodies never sleep: the
 * engine contract says so (`src/core/physics/engine.ts`).
 */
import "./preload-data.mjs";
import { Vector3, Quaternion } from "../../src/core/math/vector.ts";
import { isEngineName, loadEngine } from "../../src/core/physics/engines.ts";
import { PHYSICS_HZ } from "../../src/core/world/world.ts";
import { createWorld } from "../../src/core/world/world.ts";
import { buildBody } from "../../src/core/bodies/build/build-body.ts";
import { poseAngles } from "../../src/control/kinematics.ts";
import { loadState, saveState } from "../../src/core/state.ts";

/** Published reference batteries use parent-axis Rapier; gameplay gates request their engine explicitly. */
export const CORE_ENGINE = process.env.CORE_ENGINE || "rapier";
if (!isEngineName(CORE_ENGINE)) throw new Error(`CORE_ENGINE names no engine: ${CORE_ENGINE}`);
/** The stand's engine, loaded. Each stand is a world of its own; worlds in one realm do not share state. */
export const freshEngine = (name = CORE_ENGINE) => loadEngine(name);

/**
 * A stand for `spec`. `gravity: false` builds a world without it, for reading a joint alone;
 * `ground: false` leaves the body in the air; `pinned` names a segment the stand holds still, as a
 * mannequin's stand holds its pelvis; `posture` (a `Pose`) builds it standing in that posture, as a
 * fighter is built in the guard its skills hold (`poseAngles`), in place of `joints`. `groundSize`
 * is the ground's side, m (the lab's is 40). `hz` runs physics and control at another rate than the
 * game's, as a finer reference; a figure read at one names it.
 */
export async function coreStand(spec, { gravity = true, ground = true, position = [0, 0, 0], rotation, joints, posture, pinned, groundSize = 20, hz = PHYSICS_HZ.value, actuation, delay, engine: engineName = CORE_ENGINE } = {}) {
  const world = createWorld(await freshEngine(engineName), { hz, gravity, actuation, delay });
  const floor = ground ? world.physics.addFixedBox([0, -0.5, 0], [groundSize, 1, groundSize]) : null;
  const built = buildBody(spec, world, { position, rotation, joints: posture ? poseAngles(spec, posture) : joints });
  if (pinned !== undefined) {
    const segment = built.segments.get(pinned);
    if (!segment) throw new Error(`no segment ${pinned} to pin`);
    segment.body.setFixed(true);
  }
  return {
    world, built, floor,
    /** Take `n` of the world's steps. */
    step: (n = 1) => world.step(n),
    seconds: (s) => Math.round(s * hz),
    dispose() {
      built.dispose();
      world.dispose();
    },
  };
}

/**
 * A stand at a step, whole: the physics' bytes, and the world's state with `states`', a record of
 * the states of whatever stands in it (`{ body: body.state }`).
 */
export const saveStand = (world, states) => ({ physics: world.physics.save(), state: saveState({ world: world.state, ...states }) });

/** Put a stand where `saved` (a `saveStand` of a stand built alike) left one: the next step is the step that followed the save. */
export function loadStand(world, states, saved) {
  world.physics.load(saved.physics);
  loadState({ world: world.state, ...states }, saved.state);
  world.loaded();
}

/**
 * Spin segment `name` of `spec` by an angular impulse of `impulse` about its frame's `axisName`,
 * weightless and in the air, for one step: the answer is how fast it then turns about that axis,
 * and how fast about any other. Build the segment alone (`joints: []`) to read its own inertia.
 */
export async function spinOnce(spec, name, axisName, impulse) {
  const stand = await coreStand(spec, { gravity: false, ground: false });
  try {
    const { body, frame } = stand.built.segments.get(name);
    const axis = new Vector3(...frame[axisName]);
    body.applyTorqueImpulse(axis.scale(impulse));
    stand.step(1);
    const w = body.angularVelocityToRef(new Vector3());
    const along = Vector3.Dot(w, axis);
    return { along, across: w.subtract(axis.scale(along)).length() };
  } finally { stand.dispose(); }
}

/**
 * The child's rotation relative to its parent since the reference pose, in the body frame: the
 * rotation that, applied to the child in the reference pose with the parent held there, gives the
 * joint's present angle, read from the segments' poses. `a.multiply(b)` applies b, then a.
 */
export function relativeRotation(joint) {
  const parentRest = restRotation(joint.parent.frame), childRest = restRotation(joint.child.frame);
  return parentRest.multiply(Quaternion.Inverse(joint.parent.pose.rotation))
    .multiply(joint.child.pose.rotation).multiply(Quaternion.Inverse(childRest));
}

const restRotation = (frame) => Quaternion.RotationQuaternionFromAxis(v(frame.x), v(frame.y), v(frame.z));
const v = (a) => new Vector3(a[0], a[1], a[2]);
