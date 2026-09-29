import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltJoint, BuiltSegment } from "./build-body.ts";

/**
 * **Where a joint is, in the engine's own coordinates.**
 *
 * Havok measures a 6-DoF constraint's angles about the constraint's X, Y and Z, in an order that
 * depends on what is locked (Node stand, two rods, tilted axes, each freedom held at a target by a
 * stiff position motor):
 * - three freedoms: Rx(a) Ry(b) Rz(c), X fixed in the parent and Z carried by the child. Read back
 *   this way the target came to 0.0005 rad at (-0.7, 0.6, -0.5) rad, and no other order within
 *   0.29 rad;
 * - two, Z locked: Ry(b) Rx(a). Read as Rx Ry, (0.6, -0.3) held came back as (0.62, -0.25) with
 *   0.17 rad about the locked Z; read as Ry Rx it is within 0.0003 rad.
 * A limit acts on these angles, so a controller reads them too.
 *
 * A velocity motor does not drive these angles' rates. It drives the relative angular velocity's
 * component along its axis as fixed in the parent: driven at a target on each freedom of a
 * three-freedom joint with one freedom free, that component read the target to 0.001 rad/s,
 * the child-fixed axis was up to 0.16 rad/s off, and the angle rates up to 1.3 rad/s off (Node
 * stand, two rods, tilted axes). That component is also what the motor's torque about the axis does
 * work against, so it is a joint's speed here: the speed a muscle's force-velocity relation reads.
 *
 * Angles are read from the nodes' rotations (H24). Speeds are read from the bodies' angular
 * velocities, which the caller reads once per sub-step and hands in (H50). The change of the
 * relative rotation across a step is not the speed: after a motor's impulse Havok moves the
 * nodes behind the body's velocity. A rod given 6 rad/s by a saturated motor in one step had
 * 6.07 rad/s, while its rotation changed at 4.03, then 5.83, 5.92, reaching 5.98 after five
 * steps; given the same by an impulse, the two agree within a step (Node stand, 120 Hz). A
 * controller reading the lagging rate pushes on a joint that is already at speed.
 */

const scratch = {
  relative: new Quaternion(), inverse: new Quaternion(), t: new Quaternion(),
  z: new Vector3(), x: new Vector3(), w: new Vector3(), relativeSpin: new Vector3(),
};

/**
 * The child's rotation since the reference pose, relative to its parent, in the body frame: the
 * rotation that, applied to the child in the reference pose with the parent held there, gives the
 * joint as it stands. Babylon's `a.multiply(b)` applies b, then a.
 */
export function relativeRotationToRef(joint: BuiltJoint, out: Quaternion): Quaternion {
  const { parent, child } = joint;
  Quaternion.InverseToRef(parent.node.rotationQuaternion!, scratch.inverse);
  parent.rest.multiplyToRef(scratch.inverse, scratch.t);
  scratch.t.multiplyToRef(child.node.rotationQuaternion!, out);
  Quaternion.InverseToRef(child.rest, scratch.inverse);
  return out.multiplyToRef(scratch.inverse, out);
}

/** The two orders Havok composes a joint's angles in: see the module's note. */
export type AngleOrder = "xyz" | "yxz";

/**
 * The angles (a, b, c) of `rotation`, a relative rotation in the body frame, about the orthonormal
 * `axes`, composed in `order`:
 * - `xyz`, rotation = Rx(a) Ry(b) Rz(c): the child's Z lands on
 *   sin(b) X - cos(b) sin(a) Y + cos(b) cos(a) Z, and the parent's X, seen from the child, is
 *   cos(b) cos(c) X - cos(b) sin(c) Y + sin(b) Z;
 * - `yxz`, rotation = Ry(b) Rx(a) Rz(c): the child's Z lands on
 *   cos(a) sin(b) X - sin(a) Y + cos(a) cos(b) Z, and the child's X on
 *   (cos(b) X - sin(b) Z) cos(c) + (sin(a) sin(b) X + cos(a) Y + sin(a) cos(b) Z) sin(c).
 */
export function anglesOf(rotation: Quaternion, axes: BuiltJoint["axes"], order: AngleOrder,
  out: [number, number, number]): [number, number, number] {
  const { x, y, z } = axes;
  const zc = setTo(scratch.z, z).applyRotationQuaternionInPlace(rotation);
  switch (order) {
    case "xyz": {
      Quaternion.InverseToRef(rotation, scratch.inverse);
      const xp = setTo(scratch.x, x).applyRotationQuaternionInPlace(scratch.inverse);
      out[0] = Math.atan2(-along(zc, y), along(zc, z));
      out[1] = Math.asin(clamp(along(zc, x)));
      out[2] = Math.atan2(-along(xp, y), along(xp, x));
      return out;
    }
    case "yxz": {
      const a = Math.asin(clamp(-along(zc, y))), b = Math.atan2(along(zc, x), along(zc, z));
      const xc = setTo(scratch.x, x).applyRotationQuaternionInPlace(rotation);
      // The child's X against the two directions Rx(a) Ry(b) leaves in the plane square to its Z.
      const cosX: Vec3 = [Math.cos(b), 0, -Math.sin(b)];
      const sinX: Vec3 = [Math.sin(a) * Math.sin(b), Math.cos(a), Math.sin(a) * Math.cos(b)];
      const inFrame: Vec3 = [along(xc, x), along(xc, y), along(xc, z)];
      out[0] = a; out[1] = b;
      out[2] = Math.atan2(dot3(inFrame, sinX), dot3(inFrame, cosX));
      return out;
    }
    default: {
      const never: never = order;
      throw new Error(`unknown angle order ${String(never)}`);
    }
  }
}

/** The order Havok composes `joint`'s angles in: two freedoms lock Z and turn Y outermost. */
export const angleOrder = (joint: BuiltJoint): AngleOrder => (joint.dofs.length === 2 ? "yxz" : "xyz");

/** Each freedom's angle, in its own sense, from the reference pose: `out[k]` is `joint.dofs[k]`'s. */
export function jointAngles(joint: BuiltJoint, out: number[] = []): number[] {
  const angles = anglesOf(relativeRotationToRef(joint, scratch.relative), joint.axes, angleOrder(joint), abc);
  joint.dofs.forEach((dof, k) => { out[k] = dof.sign * angles[k]!; });
  out.length = joint.dofs.length;
  return out;
}

const abc: [number, number, number] = [0, 0, 0];

/**
 * **How a joint turns as its angles change.** Composed as `anglesOf` says, the relative angular
 * velocity is each angle's rate about the axis that angle turns about where it stands:
 * - `xyz`: a' about X, b' about Rx(a) Y = (0, cos a, sin a), c' about Rx(a) Ry(b) Z =
 *   (sin b, -sin a cos b, cos a cos b);
 * - `yxz`: b' about Y, a' about Ry(b) X = (cos b, 0, -sin b), and c, locked, not at all.
 * A motor drives the component along its own axis (the module's note), so freedom k's speed is
 * sum over j of `out[k][j]` times freedom j's rate, each freedom in its own sense. At no angles this
 * is the identity; at a shoulder flexed past a quarter turn the second freedom's axis has turned
 * past square to where its motor pushes, and a push on its motor turns its angle backward.
 */
export function turningToRef(joint: BuiltJoint, angles: readonly number[], out: number[][]): number[][] {
  const { dofs } = joint, count = dofs.length;
  const a = dofs[0]!.sign * angles[0]!, b = count > 1 ? dofs[1]!.sign * angles[1]! : 0;
  const cosA = Math.cos(a), sinA = Math.sin(a), cosB = Math.cos(b), sinB = Math.sin(b);
  // Column j, row k: the axis freedom j turns about, along freedom k's (Havok's senses).
  const along = angleOrder(joint) === "xyz"
    ? (k: number, j: number) => j === 0 ? (k === 0 ? 1 : 0)
      : j === 1 ? [0, cosA, sinA][k]! : [sinB, -sinA * cosB, cosA * cosB][k]!
    : (k: number, j: number) => j === 0 ? [cosB, 0][k]! : [0, 1][k]!;
  out.length = count;
  for (let k = 0; k < count; k++) {
    const row = (out[k] ??= []);
    row.length = count;
    for (let j = 0; j < count; j++) row[j] = dofs[k]!.sign * dofs[j]!.sign * along(k, j);
  }
  return out;
}

/**
 * Each freedom's angle rate (rad/s, its own sense) from its speeds, at `angles`: `turningToRef`
 * undone. Where the second angle is a quarter turn (xyz) or the first's outer turn is (yxz), two
 * freedoms turn about one axis and their rates are not separate; there the cosine is read as
 * `GIMBAL_COSINE`, not zero, which bounds the rates rather than choosing them.
 */
export function ratesToRef(joint: BuiltJoint, angles: readonly number[], speeds: readonly number[], out: number[]): number[] {
  const { dofs } = joint, count = dofs.length;
  const s0 = dofs[0]!.sign, s1 = count > 1 ? dofs[1]!.sign : 1, s2 = count > 2 ? dofs[2]!.sign : 1;
  const a = s0 * angles[0]!, b = count > 1 ? s1 * angles[1]! : 0;
  const cosB = Math.cos(b), held = Math.abs(cosB) < GIMBAL_COSINE ? (cosB < 0 ? -GIMBAL_COSINE : GIMBAL_COSINE) : cosB;
  out.length = count;
  if (count === 1) out[0] = speeds[0]!;
  else if (angleOrder(joint) === "yxz") {
    out[0] = s0 * (s0 * speeds[0]! / held);
    out[1] = speeds[1]!;
  } else {
    const wx = s0 * speeds[0]!, wy = s1 * speeds[1]!, wz = s2 * speeds[2]!;
    const c = (-Math.sin(a) * wy + Math.cos(a) * wz) / held;
    out[0] = s0 * (wx - Math.sin(b) * c);
    out[1] = s1 * (Math.cos(a) * wy + Math.sin(a) * wz);
    out[2] = s2 * c;
  }
  return out;
}

/** The least cosine `ratesToRef` and `motionAxesToRef` divide by: a quarter turn short by a millionth of a radian. */
export const GIMBAL_COSINE = 1e-6;

/**
 * The axis, body frame, that each freedom's speed turns the child about: the relative angular
 * velocity is the sum over the freedoms of speed times axis. With one or three freedoms these are
 * the freedoms' own axes. With two (`yxz`, Z locked) the second's is Y, and the first's is
 * X - tan(b) Z: the first angle turns the child about Ry(b) X = (cos b, 0, -sin b), whose part
 * along X is what its motor drives.
 */
export function motionAxesToRef(joint: BuiltJoint, angles: readonly number[], out: Vec3[]): Vec3[] {
  const { dofs, axes } = joint;
  out.length = dofs.length;
  dofs.forEach((dof, k) => { out[k] = signed([axes.x, axes.y, axes.z][k]!, dof.sign); });
  if (angleOrder(joint) === "yxz") {
    const b = dofs[1]!.sign * angles[1]!, cosB = Math.cos(b);
    const held = Math.abs(cosB) < GIMBAL_COSINE ? (cosB < 0 ? -GIMBAL_COSINE : GIMBAL_COSINE) : cosB;
    const tan = Math.sin(b) / held, s = dofs[0]!.sign;
    out[0] = [s * (axes.x[0] - tan * axes.z[0]), s * (axes.x[1] - tan * axes.z[1]), s * (axes.x[2] - tan * axes.z[2])];
  }
  return out;
}
const setTo = (v: Vector3, a: Vec3): Vector3 => v.set(a[0], a[1], a[2]);
const along = (v: Vector3, a: Vec3): number => v.x * a[0] + v.y * a[1] + v.z * a[2];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (s: number): number => Math.max(-1, Math.min(1, s));

/** A joint's angles and speeds, one entry per freedom in its own sense, kept current by `update`. */
export interface JointTracker {
  readonly joint: BuiltJoint;
  /** Each freedom's angle from the reference pose (rad), in Havok's measure. */
  readonly angles: number[];
  /** Each freedom's speed (rad/s): the relative angular velocity along its parent-fixed axis. */
  readonly speeds: number[];
  /** Each freedom's angle rate (rad/s), from the speeds (`ratesToRef`). */
  readonly rates: number[];
  /** How the joint turns at its angles (`turningToRef`): `turning[k][j]`, freedom k's speed per unit of j's rate. */
  readonly turning: number[][];
  /** Reads the joint as it stands, given each segment's angular velocity (world frame, rad/s). */
  update(angularVelocity: (segment: BuiltSegment) => Vector3): void;
  /**
   * `world`, a world-frame vector about the joint (an angular velocity, or an impulse the
   * constraint applied), along each freedom's parent-fixed axis in its own sense, into `out`.
   */
  project(world: Vector3, out: number[]): number[];
}

/**
 * The relative rotation is `P0 P^-1 C C0^-1` (`relativeRotationToRef`), so its rate is
 * `P0 P^-1 (wc - wp)` applied on the left: the relative angular velocity turned into the body frame.
 */
export function jointTracker(joint: BuiltJoint): JointTracker {
  const angles = jointAngles(joint, []);
  const speeds = joint.dofs.map(() => 0), rates = joint.dofs.map(() => 0);
  const turning = turningToRef(joint, angles, []);
  const axes = joint.dofs.map((dof, k) => signed([joint.axes.x, joint.axes.y, joint.axes.z][k]!, dof.sign));
  const tracker: JointTracker = {
    joint, angles, speeds, rates, turning,
    update(angularVelocity) {
      tracker.project(angularVelocity(joint.child).subtractToRef(angularVelocity(joint.parent), scratch.relativeSpin), speeds);
      jointAngles(joint, angles);
      turningToRef(joint, angles, turning);
      ratesToRef(joint, angles, speeds, rates);
    },
    project(world, out) {
      Quaternion.InverseToRef(joint.parent.node.rotationQuaternion!, scratch.inverse);
      joint.parent.rest.multiplyToRef(scratch.inverse, scratch.t);
      world.applyRotationQuaternionToRef(scratch.t, scratch.w);
      axes.forEach((axis, k) => { out[k] = along(scratch.w, axis); });
      out.length = axes.length;
      return out;
    },
  };
  return tracker;
}

const signed = (a: Vec3, sign: number): Vec3 => [a[0] * sign, a[1] * sign, a[2] * sign];
