/**
 * **The core's Node stand**: one body built from a spec, on a ground, in its own Rapier world.
 *
 * A `NullEngine` and a `Scene` hold the nodes; the core's world (`createWorld`,
 * `src/core/world.ts`) steps Rapier, as the page does. The body is built through `buildBody` and
 * nothing else, so what the stand reads is what the spec states. Rapier's bodies never sleep here
 * (`src/core/engine/rapier.ts`).
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { loadRapier, PHYSICS_HZ } from "../../src/core/engine/rapier.ts";
import { createWorld } from "../../src/core/world.ts";
import { buildBody } from "../../src/core/build/build-body.ts";

/** Rapier, loaded. Each stand is a world of its own; worlds in one realm do not share state. */
export const freshRapier = loadRapier;

/**
 * A stand for `spec`. `gravity: false` builds a world without it, for reading a joint alone;
 * `ground: false` leaves the body in the air; `pinned` names a segment the stand holds still, as a
 * mannequin's stand holds its pelvis. `hz` runs physics and control at another rate than the
 * game's, as a finer reference; a figure read at one names it.
 */
export async function coreStand(spec, { gravity = true, ground = true, position = [0, 0, 0], pinned, hz = PHYSICS_HZ.value } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const world = createWorld(scene, await freshRapier(), { hz, gravity });
  const floor = ground ? world.physics.addGround([0, -0.5, 0], [20, 1, 20]) : null;
  const built = buildBody(spec, world, { position });
  if (pinned !== undefined) {
    const segment = built.segments.get(pinned);
    if (!segment) throw new Error(`no segment ${pinned} to pin`);
    segment.body.setFixed(true);
  }
  return {
    scene, world, built, floor,
    /** Take `n` of the world's steps. */
    step: (n = 1) => world.step(n),
    seconds: (s) => Math.round(s * hz),
    dispose() {
      built.dispose();
      world.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
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
    body.rigid.applyTorqueImpulse(axis.scale(impulse), true);
    stand.step(1);
    const w = body.angularVelocityToRef(Vector3.Zero());
    const along = Vector3.Dot(w, axis);
    return { along, across: w.subtract(axis.scale(along)).length() };
  } finally { stand.dispose(); }
}

/**
 * The child's rotation relative to its parent since the reference pose, in the body frame: the
 * rotation that, applied to the child in the reference pose with the parent held there, gives the
 * joint's present angle. Read from the nodes (H24). Babylon's `a.multiply(b)` applies b, then a.
 */
export function relativeRotation(joint) {
  const parentRest = restRotation(joint.parent.frame), childRest = restRotation(joint.child.frame);
  return parentRest.multiply(Quaternion.Inverse(joint.parent.node.rotationQuaternion))
    .multiply(joint.child.node.rotationQuaternion).multiply(Quaternion.Inverse(childRest));
}

const restRotation = (frame) => Quaternion.RotationQuaternionFromAxis(v(frame.x), v(frame.y), v(frame.z));
const v = (a) => new Vector3(a[0], a[1], a[2]);
