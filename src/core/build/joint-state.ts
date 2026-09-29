import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltJoint, BuiltSegment } from "./build-body.ts";

/**
 * **Where a joint is, in the engine's own coordinates.**
 *
 * Havok limits a 6-DoF constraint's angles as its ragdoll constraint measures them, as a swing and
 * a twist: the swing is the shortest turn taking the constraint's X to the child's, and b and c are
 * its rotation vector's parts along Y and Z; the twist a is the angle between the parent's Y and the
 * child's about the axis halfway between the two X's (`anglesOf`, `twistAbout`). A limit on a
 * freedom bounds its part of this (Node stand, two rods, one freedom limited to +-0.6 rad and
 * driven to 1.2, the other two asked up to 1.4 rad: every limited freedom stopped within 0.008 rad
 * of 0.6 so read, where the Euler angles Rx Ry Rz put it up to 1.03 rad off, and poses whose Euler
 * angles lay within the limit stuck). Read other ways, the swing's part as twice the arcsine of the
 * swing quaternion's stopped at 0.57 to 0.60, and the child's own turn about its X at 0.57 to 0.85.
 * A joint of two freedoms, Z locked, is this with c held at zero. A limit acts on these angles, so
 * a controller reads them too: ranges mean one thing to the solver, the body's readings and
 * whoever sets a goal. The swing is regular to a half turn, so a shoulder raised past a quarter
 * turn reads as well as one at its side.
 *
 * Havok's position motors hold a different measure, the Euler angles Rx(a) Ry(b) Rz(c) (held at
 * (-0.7, 0.6, -0.5) rad they read back so within 0.0005 rad); the core drives no position motor.
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
 * `axes`, as Havok's limits measure them (the module's note). The swing S is the shortest turn
 * taking X to the child's X, and (b, c) its rotation vector's parts along Y and Z; the child is
 * then turned about its own X by t, rotation = S Rx(t). With q's parts (w, x, y, z) along the axes,
 * w >= 0, and h = hypot(x, w): t = 2 atan2(x, w), and S = q Rx(t)^-1 has parts
 * (h, 0, (w y - x z) / h, (w z + x y) / h), whose vector part is sin(s / 2) along the swing's axis.
 * The twist a is t seen about the halfway axis (`twistAbout`). A swing of a half turn leaves the
 * twist undefined; it is read as none.
 */
export function anglesOf(rotation: Quaternion, axes: BuiltJoint["axes"], out: [number, number, number]): [number, number, number] {
  const flip = rotation.w < 0 ? -1 : 1, v = scratch.x.set(rotation.x, rotation.y, rotation.z);
  const w = flip * rotation.w, x = flip * along(v, axes.x), y = flip * along(v, axes.y), z = flip * along(v, axes.z);
  const h = Math.hypot(x, w);
  const [sw, sy, sz] = h < SWING_HALF_TURN ? [0, y, z] : [h, (w * y - x * z) / h, (w * z + x * y) / h];
  const sine = Math.hypot(sy, sz), swing = 2 * Math.atan2(sine, sw);
  const perSine = sine < SWING_HALF_TURN ? 2 : swing / sine;
  out[1] = perSine * sy;
  out[2] = perSine * sz;
  out[0] = h < SWING_HALF_TURN ? 0 : twistAbout(2 * Math.atan2(x, w), out[1], out[2], false);
  return out;
}

/**
 * **The twist about the halfway axis.** Havok measures a joint's twist about the axis halfway
 * between the parent's X and the child's, as the angle there between the parent's Y and the
 * child's, each laid flat on the plane square to it (Node stand, two rods, the twist limited to
 * +-0.6 rad and pressed against it at swings to 1.7 rad: this read 0.600 at each, the child's own
 * turn t 0.57 to 0.85). Seen from the halfway frame, the parent and the child each lean half the
 * swing, s / 2, about its axis n, and laying a vector of the plane square to X flat again scales its
 * part square to n by cos(s / 2) and keeps its part along n: L = cos(s / 2) I + (1 - cos(s / 2)) n n'
 * on the (Y, Z) plane. So a is the angle from L Y to L (cos t, sin t), and t is the direction of
 * L^-1 turned by a from L Y. With p = (b, c) and K = (1 - cos(s / 2)) / s^2, L = cos(s / 2) I + K p p',
 * and I - K p p' is L^-1 up to a positive factor. Returns a from t, or with `inverse` t from a.
 */
export function twistAbout(angle: number, b: number, c: number, inverse: boolean): number {
  const s = Math.hypot(b, c), half = Math.cos(s / 2);
  // Near no swing K is its series, 1/8 - s^2/384.
  const K = s < SERIES_BELOW ? 1 / 8 - s * s / 384 : (1 - half) / (s * s);
  // L Y, the parent's Y laid flat.
  const uy = half + K * b * b, uz = K * b * c;
  if (!inverse) {
    const cy = Math.cos(angle), cz = Math.sin(angle), onto = K * (b * cy + c * cz);
    const vy = half * cy + onto * b, vz = half * cz + onto * c;
    return Math.atan2(uy * vz - uz * vy, uy * vy + uz * vz);
  }
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const ry = cos * uy - sin * uz, rz = sin * uy + cos * uz, onto = K * (b * ry + c * rz);
  return Math.atan2(rz - onto * c, ry - onto * b);
}

/** `anglesOf` undone: the rotation, body frame, of angles (a, b, c) about `axes`. */
export function rotationOfToRef(axes: BuiltJoint["axes"], a: number, b: number, c: number, out: Quaternion): Quaternion {
  const swing = Math.hypot(b, c), perAngle = swing < SWING_HALF_TURN ? 0.5 : Math.sin(swing / 2) / swing;
  const sw = Math.cos(swing / 2), sy = perAngle * b, sz = perAngle * c, t = twistAbout(a, b, c, true);
  const tw = Math.cos(t / 2), tx = Math.sin(t / 2);
  // S Rx(t) in the axes' parts: (sw tw, sw tx, tw sy + tx sz, tw sz - tx sy).
  const x = sw * tx, y = tw * sy + tx * sz, z = tw * sz - tx * sy, { x: X, y: Y, z: Z } = axes;
  return out.copyFromFloats(x * X[0] + y * Y[0] + z * Z[0], x * X[1] + y * Y[1] + z * Z[1], x * X[2] + y * Y[2] + z * Z[2], sw * tw);
}

/**
 * Below this the swing's sine, or the twist's share of a rotation (h in `anglesOf`), is taken for
 * none: a numeric floor, far under any angle a reading resolves.
 */
const SWING_HALF_TURN = 1e-12;

/** Each freedom's angle, in its own sense, from the reference pose: `out[k]` is `joint.dofs[k]`'s. */
export function jointAngles(joint: BuiltJoint, out: number[] = []): number[] {
  const angles = anglesOf(relativeRotationToRef(joint, scratch.relative), joint.axes, abc);
  joint.dofs.forEach((dof, k) => { out[k] = dof.sign * angles[k]!; });
  out.length = joint.dofs.length;
  return out;
}

const abc: [number, number, number] = [0, 0, 0];

/**
 * **How a joint turns as its angles change.** With rotation = S(b, c) Rx(t) (`anglesOf`), the
 * relative angular velocity is t' about S X, the child's X where the swing has put it, plus the
 * swing's own, J(b Y + c Z) (b' Y + c' Z), J the rotation vector's left Jacobian,
 * J(p) = I + (1 - cos s) / s^2 [p]x + (s - sin s) / s^3 [p]x^2 at s = |p|. Along the axes:
 *
 *     t' ( cos s,     c sin s / s,   -b sin s / s )
 *     b' ( -A c,      1 - B c^2,     B b c )
 *     c' ( A b,       B b c,         1 - B b^2 )
 *
 * with A = (1 - cos s) / s^2 and B = (s - sin s) / s^3; and t' is carried from the twist's and the
 * swing's rates through `twistAbout`, differenced by `TWIST_STEP` in each angle. A motor drives the
 * component along its own axis (the module's note), so freedom k's speed is sum over j of
 * `out[k][j]` times freedom j's rate, each freedom in its own sense. At no angles this is the
 * identity; a joint of two freedoms has c = 0 and reads the first two rows and columns.
 */
export function turningToRef(joint: BuiltJoint, angles: readonly number[], out: number[][]): number[][] {
  const { dofs } = joint, count = dofs.length, m = turningMatrix(havokAngles(joint, angles));
  out.length = count;
  for (let k = 0; k < count; k++) {
    const row = (out[k] ??= []);
    row.length = count;
    for (let j = 0; j < count; j++) row[j] = dofs[k]!.sign * dofs[j]!.sign * m[k]![j]!;
  }
  return out;
}

/** Each of `angles` (own senses) in Havok's sense, a locked freedom at zero. */
const havokAngles = (joint: BuiltJoint, angles: readonly number[]): [number, number, number] =>
  [0, 1, 2].map((k) => (k < joint.dofs.length ? joint.dofs[k]!.sign * angles[k]! : 0)) as [number, number, number];

/** The table in `turningToRef`'s note at angles (a, b, c), Havok's senses: row k the axis, column j the angle. */
function turningMatrix([a, b, c]: readonly [number, number, number]): number[][] {
  const s = Math.hypot(b, c), small = s < SERIES_BELOW;
  // Near no swing the ratios are their series: sin s / s = 1 - s^2/6, A = 1/2 - s^2/24, B = 1/6 - s^2/120.
  const S = small ? 1 - s * s / 6 : Math.sin(s) / s;
  const A = small ? 0.5 - s * s / 24 : (1 - Math.cos(s)) / (s * s);
  const B = small ? 1 / 6 - s * s / 120 : (s - Math.sin(s)) / (s * s * s);
  const own = [Math.cos(s), S * c, -S * b];
  const t = (da: number, db: number, dc: number) => twistAbout(a + da, b + db, c + dc, true);
  const h = TWIST_STEP;
  const rise = [(t(h, 0, 0) - t(-h, 0, 0)) / (2 * h), (t(0, h, 0) - t(0, -h, 0)) / (2 * h), (t(0, 0, h) - t(0, 0, -h)) / (2 * h)];
  const swing = [[0, -A * c, A * b], [0, 1 - B * c * c, B * b * c], [0, B * b * c, 1 - B * b * b]];
  return swing.map((row, k) => row.map((v, j) => v + own[k]! * rise[j]!));
}

/** Below this swing (rad) the ratios take their series, whose next terms are under 1e-12. */
const SERIES_BELOW = 1e-3;

/** The angle (rad) `turningMatrix` differences the twist by: a numeric setting, its error some 1e-10. */
const TWIST_STEP = 1e-6;

/**
 * Each freedom's angle rate (rad/s, its own sense) from its speeds, at `angles`: `turningToRef`
 * undone. Where two freedoms turn about one axis their rates are not separate -- a joint of two
 * whose swing is a quarter turn, or of three whose swing is a half turn -- and the turning's
 * determinant is read as `GIMBAL_COSINE`, not zero, which bounds the rates rather than choosing them.
 */
export function ratesToRef(joint: BuiltJoint, angles: readonly number[], speeds: readonly number[], out: number[]): number[] {
  const count = joint.dofs.length, m = turningToRef(joint, angles, scratch.turning);
  out.length = count;
  if (count === 1) out[0] = speeds[0]! / held(m[0]![0]!);
  else if (count === 2) {
    const det = held(m[0]![0]! * m[1]![1]! - m[0]![1]! * m[1]![0]!);
    out[0] = (speeds[0]! * m[1]![1]! - m[0]![1]! * speeds[1]!) / det;
    out[1] = (m[0]![0]! * speeds[1]! - speeds[0]! * m[1]![0]!) / det;
  } else {
    const det = held(determinant(m));
    for (let j = 0; j < 3; j++) out[j] = determinant(m.map((row, k) => row.map((v, i) => (i === j ? speeds[k]! : v)))) / det;
  }
  return out;
}

const held = (x: number): number => Math.abs(x) < GIMBAL_COSINE ? (x < 0 ? -GIMBAL_COSINE : GIMBAL_COSINE) : x;
const determinant = (m: number[][]): number => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!)
  - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);

/** The least cosine or determinant `ratesToRef` and `motionAxesToRef` divide by: a millionth. */
export const GIMBAL_COSINE = 1e-6;

/**
 * The axis, body frame, that each freedom's speed turns the child about: the relative angular
 * velocity is the sum over the freedoms of speed times axis. With one or three freedoms these are
 * the freedoms' own axes. With two (Z locked) the second's is Y, and the first's is
 * X - tan(b) Z: the first angle turns the child about Ry(b) X = (cos b, 0, -sin b), whose part
 * along X is what its motor drives.
 */
export function motionAxesToRef(joint: BuiltJoint, angles: readonly number[], out: Vec3[]): Vec3[] {
  const { dofs, axes } = joint;
  out.length = dofs.length;
  dofs.forEach((dof, k) => { out[k] = signed([axes.x, axes.y, axes.z][k]!, dof.sign); });
  if (dofs.length === 2) {
    const b = dofs[1]!.sign * angles[1]!, cosB = Math.cos(b);
    const held = Math.abs(cosB) < GIMBAL_COSINE ? (cosB < 0 ? -GIMBAL_COSINE : GIMBAL_COSINE) : cosB;
    const tan = Math.sin(b) / held, s = dofs[0]!.sign;
    out[0] = [s * (axes.x[0] - tan * axes.z[0]), s * (axes.x[1] - tan * axes.z[1]), s * (axes.x[2] - tan * axes.z[2])];
  }
  return out;
}
const along = (v: Vector3, a: Vec3): number => v.x * a[0] + v.y * a[1] + v.z * a[2];

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
