/**
 * **The core's Node stand**: one body built from a spec, on a ground, in its own Havok world.
 *
 * The recipe is AGENTS.md's: a `NullEngine`, a `Scene` and Havok from bytes, stepped by the core's
 * world (`createWorld`, `src/core/world.ts`), as the page is. The body is built through
 * `buildBody` and nothing else, so what the stand reads is what the spec states. Every segment is kept awake: a sleeping body reads a perfect
 * zero (H08).
 *
 * Holding a pose is the stand's, not the core's: `holdReferencePose` brakes every freedom at a
 * muscle's isometric peak. It is a test instrument until the muscle actuator (stage 2 of the plan)
 * drives the joints.
 */
import { readFile } from "node:fs/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsActivationControl, PhysicsConstraintMotorType, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";
import { PHYSICS_HZ } from "../../src/core/engine/havok.ts";
import { createWorld } from "../../src/core/world.ts";
import { buildBody } from "../../src/core/build/build-body.ts";

const wasmPath = new URL("../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

/** A Havok instance of its own. One arena per worker realm (AGENTS.md); run stands one at a time. */
export async function freshHavok() {
  return HavokPhysics({ wasmBinary: await readFile(wasmPath) });
}

/**
 * A stand for `spec`. `gravity: false` builds a world without it, for reading a joint alone;
 * `ground: false` leaves the body in the air; `pinned` names a segment the stand holds still, as a
 * mannequin's stand holds its pelvis. `hz` runs physics and control at another rate than the
 * game's, as a finer reference; a figure read at one names it.
 */
export async function coreStand(spec, { gravity = true, ground = true, position = [0, 0, 0], pinned, hz = PHYSICS_HZ.value } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const world = createWorld(scene, await freshHavok(), { hz, gravity });
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
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  for (const segment of built.segments.values()) plugin.setActivationControl(segment.body, PhysicsActivationControl.ALWAYS_ACTIVE);
  if (pinned !== undefined) {
    const segment = built.segments.get(pinned);
    if (!segment) throw new Error(`no segment ${pinned} to pin`);
    segment.body.setMotionType(PhysicsMotionType.STATIC);
  }
  return {
    scene, world, built, floor,
    /** Take `n` of the world's steps. */
    step: (n = 1) => world.step(n),
    seconds: (s) => Math.round(s * hz),
    dispose() {
      world.dispose();
      built.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

/**
 * Brake every freedom of `built` where it stands: a velocity motor asking for no motion, whose
 * ceiling is `ceiling(dof)`, by default the freedom's weaker isometric peak. A motor's ceiling is
 * one number for both senses, so the weaker peak is what the muscle can hold whichever way it is
 * loaded.
 *
 * A brake has no memory of where it started, so what the solver lets through it keeps. It holds a
 * body on a stand (`pinned`); it does not balance one on its feet (plan, stage 1, "Found while
 * building").
 */
export function holdReferencePose(built, ceiling = weakerPeak) {
  for (const joint of built.joints.values()) {
    for (const dof of joint.dofs) {
      joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.VELOCITY);
      joint.constraint.setAxisMotorTarget(dof.axis, 0);
      joint.constraint.setAxisMotorMaxForce(dof.axis, ceiling(dof));
    }
  }
}

const weakerPeak = (dof) => Math.min(dof.spec.muscle.peakPositive.value, dof.spec.muscle.peakNegative.value);

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
