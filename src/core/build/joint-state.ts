import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltJoint, BuiltSegment } from "./build-body.ts";
import { tan, atan2 } from "../math/real.ts";

/**
 * **Where a joint is, in the engine's own coordinates.**
 *
 * Rapier's generic joint measures its angles on the joint's own axes, fixed in the parent: with
 * the relative rotation q = (w, x, y, z) of the child's joint frame in the parent's, w >= 0, the
 * angle about axis k is 2 atan2(q_k, w) (`recentered_angle` in its joint constraint builder,
 * 0.21.0), and a limit bounds that angle. A locked angular axis holds q_k at zero. The measure is
 * regular to a half turn on every axis and has a closed-form inverse: q_k = w tan(a_k / 2), w
 * normalizing (`rotationOfToRef`). A limit acts on these angles, so a controller reads them too:
 * ranges mean one thing to the solver, the body's readings and whoever sets a goal.
 *
 * A velocity motor drives the relative angular velocity's component along its axis as fixed in
 * the parent (the motor's row and the limit's are both the parent frame's axis), so that component
 * is a joint's speed here: the speed a muscle's force-velocity relation reads, and the one its
 * torque does work against.
 *
 * Angles are read from the nodes' `rotationQuaternion`, which the engine's step writes from the
 * bodies (`PhysicsWorld.step`), not from a world matrix, which Babylon caches per render id. Speeds
 * are read from the bodies' angular velocities, which the caller reads once per step and hands in:
 * each read crosses into the engine.
 */

const scratch = {
  relative: new Quaternion(), inverse: new Quaternion(), t: new Quaternion(), turning: [] as number[][],
  x: new Vector3(), w: new Vector3(), relativeSpin: new Vector3(),
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

/**
 * The angles (a, b, c) of `rotation`, a relative rotation in the body frame, about the orthonormal
 * `axes`, as Rapier's limits measure them (the module's note): with q's parts (w, x, y, z) along the
 * axes, w >= 0, each is 2 atan2(q_k, w). A half turn (w = 0) reads as plus or minus a half turn on
 * the axes it turns about.
 */
export function anglesOf(rotation: Quaternion, axes: BuiltJoint["axes"], out: [number, number, number]): [number, number, number] {
  const flip = rotation.w < 0 ? -1 : 1, v = scratch.x.set(rotation.x, rotation.y, rotation.z), w = flip * rotation.w;
  out[0] = 2 * atan2(flip * along(v, axes.x), w);
  out[1] = 2 * atan2(flip * along(v, axes.y), w);
  out[2] = 2 * atan2(flip * along(v, axes.z), w);
  return out;
}

/**
 * `anglesOf` undone: the rotation, body frame, of angles (a, b, c) about `axes`. With t_k =
 * tan(a_k / 2), q = (1, t) / |(1, t)|. Angles of a half turn or more have no such rotation (the
 * measure reads within a half turn) and are refused.
 */
export function rotationOfToRef(axes: BuiltJoint["axes"], a: number, b: number, c: number, out: Quaternion): Quaternion {
  if (!(Math.abs(a) < Math.PI && Math.abs(b) < Math.PI && Math.abs(c) < Math.PI)) throw new Error(`angles (${a}, ${b}, ${c}) reach a half turn`);
  const tx = tan(a / 2), ty = tan(b / 2), tz = tan(c / 2), w = 1 / Math.sqrt(1 + tx * tx + ty * ty + tz * tz);
  const x = w * tx, y = w * ty, z = w * tz, { x: X, y: Y, z: Z } = axes;
  return out.copyFromFloats(x * X[0] + y * Y[0] + z * Z[0], x * X[1] + y * Y[1] + z * Z[1], x * X[2] + y * Y[2] + z * Z[2], w);
}

/** Each freedom's angle, in its own sense, from the reference pose: `out[k]` is `joint.dofs[k]`'s. */
export function jointAngles(joint: BuiltJoint, out: number[] = []): number[] {
  const angles = anglesOf(relativeRotationToRef(joint, scratch.relative), joint.axes, abc);
  const { dofs } = joint;
  for (let k = 0; k < dofs.length; k++) out[k] = dofs[k]!.sign * angles[k]!;
  out.length = dofs.length;
  return out;
}

const abc: [number, number, number] = [0, 0, 0];

/**
 * **How a joint turns as its angles change.** With t_k = tan(a_k / 2) and q = w (1, t), the
 * relative angular velocity along the axes (q' = w q / 2 applied on the left) is
 *
 *     w = 2 w^2 (t' + t x t'),  t'_j = (1 + t_j^2) a'_j / 2,
 *
 * so freedom k's speed per unit of freedom j's rate is w^2 (E + [t]x)[k][j] (1 + t_j^2), [t]x the
 * cross-product matrix of t. A locked axis has t at zero, so a joint of fewer freedoms reads the
 * leading rows and columns: of two, the diagonal w^2 (1 + t_k^2). At no angles this is the identity.
 */
export function turningToRef(joint: BuiltJoint, angles: readonly number[], out: number[][]): number[][] {
  const { dofs } = joint, count = dofs.length;
  const x = halfTan(joint, angles, 0), y = halfTan(joint, angles, 1), z = halfTan(joint, angles, 2);
  const w2 = 1 / (1 + x * x + y * y + z * z);
  out.length = count;
  for (let k = 0; k < count; k++) {
    const row = (out[k] ??= []);
    row.length = count;
    for (let j = 0; j < count; j++) {
      // E + [t]x, row k the axis, column j the angle.
      const v = k === j ? 1 : k === 0 ? (j === 1 ? -z : y) : k === 1 ? (j === 0 ? z : -x) : (j === 0 ? -y : x);
      const t = j === 0 ? x : j === 1 ? y : z;
      row[j] = dofs[k]!.sign * dofs[j]!.sign * (w2 * v * (1 + t * t));
    }
  }
  return out;
}

/** tan(a_k / 2) of freedom `k`'s angle in `angles` (own senses) in the engine's sense, a locked freedom's at zero. */
function halfTan(joint: BuiltJoint, angles: readonly number[], k: number): number {
  return tan((k < joint.dofs.length ? joint.dofs[k]!.sign * angles[k]! : 0) / 2);
}

/**
 * Each freedom's angle rate (rad/s, its own sense) from its speeds, at `angles`: `turningToRef`
 * undone. (E + [t]x)^-1 = (E - [t]x + t t') / (1 + |t|^2), so a'_j = ((E - [t]x + t t') w)_j /
 * (1 + t_j^2), which is regular short of a half turn. A joint of fewer freedoms has t zero on its
 * locked axes, and of two turns about Z as its lock asks (`motionAxesToRef`).
 */
export function ratesToRef(joint: BuiltJoint, angles: readonly number[], speeds: readonly number[], out: number[]): number[] {
  const { dofs } = joint, count = dofs.length;
  const x = halfTan(joint, angles, 0), y = halfTan(joint, angles, 1), z = halfTan(joint, angles, 2);
  const u0 = 0 < count ? dofs[0]!.sign * speeds[0]! : 0, u1 = 1 < count ? dofs[1]!.sign * speeds[1]! : 0;
  // Two freedoms: the lock on Z turns the child about Z too (`motionAxesToRef`).
  const u2 = count === 2 ? u1 * x - u0 * y : 2 < count ? dofs[2]!.sign * speeds[2]! : 0;
  out.length = count;
  for (let k = 0; k < count; k++) {
    // Row k of E - [t]x + t t'.
    const r0 = k === 0 ? 1 + x * x : k === 1 ? -z + y * x : y + z * x;
    const r1 = k === 0 ? z + x * y : k === 1 ? 1 + y * y : -x + z * y;
    const r2 = k === 0 ? -y + x * z : k === 1 ? x + y * z : 1 + z * z;
    const t = k === 0 ? x : k === 1 ? y : z;
    out[k] = dofs[k]!.sign * (r0 * u0 + r1 * u1 + r2 * u2) / (1 + t * t);
  }
  return out;
}

/**
 * Angle acceleration with the parent-axis motor speeds held constant: dG/dt u, where
 * `ratesToRef` is a' = G(a) u. For t = tan(a/2), t' = (u - t x u + t (t·u))/2.
 * A two-axis joint also has u_z = t_x u_y - t_y u_x; its derivative belongs to this bias.
 * Thus an angle-acceleration goal subtracts this term as well as G times the dynamics' bias.
 */
export function rateBiasToRef(joint: BuiltJoint, angles: readonly number[], speeds: readonly number[], out: number[]): number[] {
  const count = joint.dofs.length; out.length = count;
  if (count < 2) { if (count === 1) out[0] = 0; return out; }
  const x = halfTan(joint, angles, 0), y = halfTan(joint, angles, 1), z = halfTan(joint, angles, 2);
  const u = joint.dofs[0]!.sign * speeds[0]!, v = joint.dofs[1]!.sign * speeds[1]!;
  const w = count === 2 ? x * v - y * u : joint.dofs[2]!.sign * speeds[2]!;
  const along = x * u + y * v + z * w;
  const nx = u + z * v - y * w + x * along, ny = v + x * w - z * u + y * along, nz = w + y * u - x * v + z * along;
  const dx = nx / 2, dy = ny / 2, dz = count === 2 ? 0 : nz / 2, dw = count === 2 ? dx * v - dy * u : 0;
  const change = dx * u + dy * v + dz * w + z * dw;
  const dnx = dz * v - dy * w - y * dw + dx * along + x * change;
  const dny = dx * w + x * dw - dz * u + dy * along + y * change;
  out[0] = joint.dofs[0]!.sign * (dnx - nx * 2 * x * dx / (1 + x * x)) / (1 + x * x);
  out[1] = joint.dofs[1]!.sign * (dny - ny * 2 * y * dy / (1 + y * y)) / (1 + y * y);
  if (count === 3) {
    const dnz = dw + dy * u - dx * v + dz * along + z * change;
    out[2] = joint.dofs[2]!.sign * (dnz - nz * 2 * z * dz / (1 + z * z)) / (1 + z * z);
  }
  return out;
}

/**
 * The axis, body frame, that each freedom's speed turns the child about: the relative angular
 * velocity is the sum over the freedoms of speed times axis. With one or three freedoms these are
 * the freedoms' own axes. With two, Z is locked at q_z = 0, which asks w w_z = w_y x - w_x y of
 * the angular velocity: the first freedom's speed turns the child about X - tan(b / 2) Z and the
 * second's about Y + tan(a / 2) Z. As the angles turn, these axes lean along Z at rates whose sum
 * over the speeds cancels, so a joint's axes add nothing to the motion's bias (`dynamics.ts`).
 */
export function motionAxesToRef(joint: BuiltJoint, angles: readonly number[], out: [number, number, number][]): [number, number, number][] {
  const { dofs, axes } = joint;
  out.length = dofs.length;
  if (dofs.length === 2) {
    const leanX = -halfTan(joint, angles, 1), leanY = halfTan(joint, angles, 0);
    const sx = dofs[0]!.sign, sy = dofs[1]!.sign, Z = axes.z;
    setTo(out, 0, sx * (axes.x[0] + leanX * Z[0]), sx * (axes.x[1] + leanX * Z[1]), sx * (axes.x[2] + leanX * Z[2]));
    setTo(out, 1, sy * (axes.y[0] + leanY * Z[0]), sy * (axes.y[1] + leanY * Z[1]), sy * (axes.y[2] + leanY * Z[2]));
    return out;
  }
  for (let k = 0; k < dofs.length; k++) {
    const a = k === 0 ? axes.x : k === 1 ? axes.y : axes.z, sign = dofs[k]!.sign;
    setTo(out, k, a[0] * sign, a[1] * sign, a[2] * sign);
  }
  return out;
}

/** `out[k]` set to (x, y, z), made where it is missing. */
function setTo(out: [number, number, number][], k: number, x: number, y: number, z: number): void {
  const v = (out[k] ??= [0, 0, 0]);
  v[0] = x; v[1] = y; v[2] = z;
}
const along = (v: Vector3, a: Vec3): number => v.x * a[0] + v.y * a[1] + v.z * a[2];

/** A joint's angles and speeds, one entry per freedom in its own sense, kept current by `update`. */
export interface JointTracker {
  readonly joint: BuiltJoint;
  /** Each freedom's angle from the reference pose (rad), in the engine's measure. */
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
      for (let k = 0; k < axes.length; k++) out[k] = along(scratch.w, axes[k]!);
      out.length = axes.length;
      return out;
    },
  };
  return tracker;
}

const signed = (a: Vec3, sign: number): Vec3 => [a[0] * sign, a[1] * sign, a[2] * sign];
