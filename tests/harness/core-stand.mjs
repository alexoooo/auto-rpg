/**
 * **The core's Node stand**: one body built from a spec, on a ground, in its own Havok world.
 *
 * The recipe is AGENTS.md's: a `NullEngine`, a `Scene`, Havok from bytes, and each step a render id
 * and one fixed physics step. The body is built through `buildBody` and nothing else, so what the
 * stand reads is what the spec states.
 */
import { readFile } from "node:fs/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";
import { attachHavok, PHYSICS_HZ } from "../../src/core/engine/havok.ts";
import { buildBody } from "../../src/core/build/build-body.ts";

const wasmPath = new URL("../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

/** A Havok instance of its own. One arena per worker realm (AGENTS.md); run stands one at a time. */
export async function freshHavok() {
  return HavokPhysics({ wasmBinary: await readFile(wasmPath) });
}

/**
 * A stand for `spec`. `gravity: false` builds a world without it, for reading a joint alone;
 * `ground: false` leaves the body in the air.
 */
export async function coreStand(spec, { gravity = true, ground = true, position = [0, 0, 0] } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachHavok(scene, await freshHavok());
  if (!gravity) scene.getPhysicsEngine().setGravity(new Vector3(0, 0, 0));
  let floor = null;
  if (ground) {
    const node = new TransformNode("stand.ground", scene);
    node.position = new Vector3(0, -0.5, 0);
    node.rotationQuaternion = Quaternion.Identity();
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, scene);
    body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(20, 1, 20), scene);
    floor = { node, body };
  }
  const built = buildBody(spec, scene, { position });
  const stepMs = 1000 / PHYSICS_HZ.value;
  return {
    scene, built, floor,
    /** Advance `n` fixed steps. */
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        scene._renderId += 1;
        scene._advancePhysicsEngineStep(stepMs);
      }
    },
    seconds: (s) => Math.round(s * PHYSICS_HZ.value),
    dispose() {
      built.dispose();
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
    body.applyAngularImpulse(axis.scale(impulse));
    stand.step(1);
    const w = Vector3.Zero();
    body.getAngularVelocityToRef(w);
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
