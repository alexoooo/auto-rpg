/**
 * **The swing leg**: what a leg is to a walk's plan. Its segments from the hip to the foot as a
 * pendulum about the hip (`SwingLeg`, `swingLegOf`), how long a swing needs for its hip's strength
 * (`swingSeconds`), how far its hip's range lets the foot reach (`withinReach`), the leg in the pose
 * it has now (`LegNow`, `legNowToRef`), and its reaction on the body (`swingShiftToRef`).
 *
 * The reaction: gravity gives no moment about the body's centre of mass, so every change of the
 * body's angular momentum about it is a moment the ground gives; a leg carried along a swing's path
 * changes that momentum as it is accelerated and braked. The pendulum the plan falls as
 * (`planAcross`) is then driven not from the sole's centre of pressure but from the centroidal
 * moment pivot (Popovic, Goswami and Herr 2005, "Ground reference points in legged locomotion",
 * IJRR): the centre of pressure moved by the moment over the body's weight, with
 * m x'' = (g / h) (x - p) + L'_z / (m h) and m z'' = (g / h) (z - p) - L'_x / (m h). The plan keeps
 * the centre of pressure where the sole has it and carries the pivot's shift, so that what it asks
 * of the sole is what the sole can give; the shift over the swing's time left is folded into where
 * the capture point and the centre of mass come to as the foot lands.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltJoint } from "../build/build-body.ts";
import { acos, asin, atan2, cos, cosh, exp, hypot, sin, sinh } from "../math/real.ts";
import type { SwingGoal } from "./stance.ts";
import { centreOfToRef, turnOfToRef } from "./support.ts";
import { swingPathToRef, swingPeak, swingProgressToRef, type SwingBow } from "./swing-path.ts";

/** A leg as a pendulum about its hip: the segments from the hip joint to the ankle's child, on the straight leg. */
export interface SwingLeg {
  /** The hip to the ankle, straight, m. */
  readonly length: number;
  /** The hip to the knee, and the knee to the ankle, m. */
  readonly thigh: number;
  readonly shank: number;
  /** The leg's moment of inertia about its hip across the leg, kg m^2. */
  readonly aboutHip: number;
  /** The hip's peak torque, N m: the lesser of flexion's and extension's. */
  readonly torque: number;
  /** The hip's centre from the body's midline, m, to its own side. */
  readonly out: number;
  /**
   * How far the thigh may lean from the vertical each way, rad, no more than level: ahead and
   * behind by the hip's flexion's range, out and in by its abduction's (`reachAt`).
   */
  readonly range: { readonly ahead: number; readonly behind: number; readonly out: number; readonly in: number };
}

/** `chain`'s leg (hip, knee, ankle) as a swing leg, from its specs in the reference pose. */
export function swingLegOf(chain: readonly BuiltJoint[]): SwingLeg {
  const [hip, knee, ankle] = chain;
  const h = hip!.spec.centre.value, k = knee!.spec.centre.value, a = ankle!.spec.centre.value;
  const ux = a[0] - h[0], uy = a[1] - h[1], uz = a[2] - h[2], length = hypot(ux, uy, uz);
  const along = (p: readonly number[]) => ((p[0]! - h[0]) * ux + (p[1]! - h[1]) * uy + (p[2]! - h[2]) * uz) / length;
  const parts = chain.map((joint) => joint.child);
  let mass = 0, moment = 0;
  for (const part of parts) {
    const m = part.spec.mass.value;
    mass += m;
    moment += m * along(part.spec.centreOfMass.value);
  }
  const centre = moment / mass;
  let inertia = 0;
  for (const part of parts) {
    const m = part.spec.mass.value, d = along(part.spec.centreOfMass.value) - centre, i = part.spec.inertia.value;
    // The segment's own inertia across the leg: of its principal moments, the largest (a long
    // segment's two across it are alike and the largest).
    inertia += Math.max(i[0], i[1], i[2]) + m * d * d;
  }
  // The hip's freedoms: flexion then abduction, each positive toward its name, its range from the
  // reference pose and the reference pose's angle from the vertical (`DofSpec.bind`).
  const [flexion, abduction] = hip!.spec.dofs;
  const lean = (range: number, bind: number) => Math.min(Math.max(range + bind, 0), Math.PI / 2);
  return {
    length, thigh: hypot(k[0] - h[0], k[1] - h[1], k[2] - h[2]), shank: hypot(a[0] - k[0], a[1] - k[1], a[2] - k[2]), aboutHip: inertia + mass * centre * centre,
    torque: Math.min(flexion!.muscle.peakPositive.value, flexion!.muscle.peakNegative.value),
    out: Math.abs(h[0]),
    range: {
      ahead: lean(flexion!.max.value, flexion!.bind.value), behind: lean(-flexion!.min.value, -flexion!.bind.value),
      out: lean(abduction!.max.value, abduction!.bind.value), in: lean(-abduction!.min.value, -abduction!.bind.value),
    },
  };
}

/**
 * How far `leg`'s ankle reaches across the ground from under its hip one way, m, the hip `hip` over
 * the ankle, the leg no longer than `long` and its thigh leaning no more than `range` from the
 * vertical that way: the leg straight, sqrt(long^2 - hip^2), where that leans within the range;
 * else the leg straight at the range, or, where the knee `bends` (a trailing leg behind, at the
 * end of its step), the thigh at the range and the shank down from the knee to the ankle's depth,
 * which the knee's bend takes further back. 0 where the hip stands higher than the leg is long.
 */
function reachAt(leg: SwingLeg, range: number, bends: boolean, hip: number, long: number): number {
  if (hip >= long) return 0;
  if (acos(hip / long) <= range) return Math.sqrt(long * long - hip * hip);
  if (!bends) return long * sin(range);
  const drop = hip - leg.thigh * cos(range), span = leg.shank * leg.shank - drop * drop;
  return leg.thigh * sin(range) + Math.sqrt(Math.max(span, 0));
}

/**
 * The least time, s, a swing of `way` m needs of `leg`: the hip's torque for the path's peak
 * acceleration (`swingPeak`, the leg straight about the hip) within `effort` of its peak. For a
 * walk's steady step, where the foot's way is twice the step and the step is the pace over the
 * swing and the `transfer` before it, the time that is its own: T^2 = k (T + transfer).
 */
export function swingSeconds(leg: SwingLeg, pace: number, transfer: number, effort: number): number {
  const k = swingPeak(undefined) * 2 * pace * leg.aboutHip / (leg.length * effort * leg.torque);
  return (k + Math.sqrt(k * k + 4 * k * transfer)) / 2;
}

/**
 * The ankle from the hip, ahead and out along the facing (right (`rx`, `rz`)), m, of a leg whose
 * sole is at (`dx`, `dz`) from the bearing sole's middle, world, the body's centre at (`cx`, `cz`)
 * from it, `sign` +1 the right leg: the ankle `back` behind the sole's middle, the hip `out` from
 * the centre.
 */
function ankleFromHip(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, back: number): [number, number] {
  const hx = dx + back * rz - cx - sign * leg.out * rx, hz = dz - back * rx - cz - sign * leg.out * rz;
  return [-hx * rz + hz * rx, sign * (hx * rx + hz * rz)];
}

/**
 * How a landing leg's shank leans from the vertical as its foot lands, rad, ahead and out, the hip
 * `hip` over the ankle and the ankle where `ankleFromHip` (the same arguments) puts it: out, the
 * angle of the leg's line; ahead, the line's less the shank's angle from it, since the knee bends
 * ahead by what the line falls short of the leg's length (the sine rule on the thigh, the shank and
 * the line). What the foot lands turned by (`SwingGoal.lean`). With the hip above the ankle the
 * lean is within a half turn, which the landing's turn asks (`rotationOfToRef`); below it, none.
 */
export function landingLean(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, hip: number, back: number): [number, number] {
  // Hips not above the ankle (the body down, or no plan) lean nothing: the foot lands flat.
  if (!(hip > 0)) return [0, 0];
  const [ahead, out] = ankleFromHip(leg, dx, dz, cx, cz, rx, rz, sign, back), line = hypot(hip, ahead, out), t = leg.thigh, s = leg.shank;
  const knee = line < t + s && line > Math.abs(t - s) ? acos((t * t + s * s - line * line) / (2 * t * s)) : Math.PI;
  const bent = knee < Math.PI ? asin(Math.min(t * sin(knee) / line, 1)) : 0;
  return [atan2(ahead, hip) - bent, atan2(out, hip)];
}

/**
 * Whether `leg` reaches a sole at (`dx`, `dz`) from the bearing sole's middle, world, facing with
 * right (`rx`, `rz`), `sign` +1 the right leg: the hip, `out` to its side of the body's centre, which
 * is at (`cx`, `cz`) from the bearing sole's middle as the foot lands (midway between the soles in a
 * steady walk), with its ankle, `back` behind that sole's middle along the facing, within the
 * leg's reach (`reachAt`) with the hip `hip` over it and the leg no longer than `long` (hip to
 * ankle at the knee's least bend): within the ellipse of its reach ahead or behind and out or in.
 * The share of the hip's way to the ankle within it, 1 if all of it. A landing foot's sole is the
 * step, and the leg lands straight within its range; the bearing leg's is its own, at (0, 0),
 * where the body's centre has gone ahead of it by the landing, and its knee `bends` for the reach
 * behind.
 */
export function withinReach(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, hip: number, long: number, back: number, bends: boolean): number {
  const [ahead, out] = ankleFromHip(leg, dx, dz, cx, cz, rx, rz, sign, back);
  const ra = ahead >= 0 ? reachAt(leg, leg.range.ahead, false, hip, long) : reachAt(leg, leg.range.behind, bends, hip, long);
  const ro = reachAt(leg, out >= 0 ? leg.range.out : leg.range.in, false, hip, long);
  if (ra <= 0 || ro <= 0) return 0;
  const far = (ahead / ra) * (ahead / ra) + (out / ro) * (out / ro);
  return far > 1 ? 1 / Math.sqrt(far) : 1;
}

/**
 * **A leg in the pose it has now**: its mass, its mass centre, world, and its inertia about that
 * centre on the world's axes (xx, yy, zz, xy, xz, yz), kg m^2, as its segments are. A swing's
 * reaction is the leg's as it is: bent at the knee the foot is near the hip, and a swing moves far
 * less of the body than the straight leg would. `work` carries nothing between calls.
 */
export interface LegNow {
  mass: number;
  readonly centre: Vector3;
  readonly tensor: Float64Array;
  readonly work: { readonly at: Vector3; readonly axis: Vector3; readonly turn: Quaternion; readonly axes: Float64Array };
}

/** A `LegNow` to read legs into. */
export const makeLegNow = (): LegNow =>
  ({ mass: 0, centre: new Vector3(), tensor: new Float64Array(6), work: { at: new Vector3(), axis: new Vector3(), turn: new Quaternion(), axes: new Float64Array(9) } });

/**
 * `chain`'s leg (hip, knee, ankle: its segments their children) as it is now, into `out`: each
 * segment's rigid tensor turned onto the world's axes by the segment's turn, and its mass at its
 * centre's offset from the leg's, m (|d|^2 E - d d').
 */
export function legNowToRef(chain: readonly BuiltJoint[], out: LegNow): void {
  const { centre, tensor, work: { at, axis, turn, axes } } = out;
  let mass = 0;
  centre.setAll(0);
  for (const joint of chain) {
    const part = joint.child, m = part.rigid.mass;
    mass += m;
    centre.addInPlace(centreOfToRef(part, at).scaleInPlace(m));
  }
  centre.scaleInPlace(1 / mass);
  out.mass = mass;
  tensor.fill(0);
  for (const joint of chain) {
    const part = joint.child, m = part.rigid.mass, t = part.rigid.tensor, frame = part.frame;
    turnOfToRef(part, turn);
    // The segment frame's axes, world: columns of A, so that the tensor on the world's axes is A T A'.
    for (let k = 0; k < 3; k++) {
      const a = k === 0 ? frame.x : k === 1 ? frame.y : frame.z;
      axis.set(a[0], a[1], a[2]).applyRotationQuaternionToRef(turn, axis);
      axes[k] = axis.x; axes[3 + k] = axis.y; axes[6 + k] = axis.z;
    }
    // T's rows, by index into its six.
    const T = (j: number, k: number): number => j === k ? t[j]! : j + k === 1 ? t[3]! : j + k === 2 ? t[4]! : t[5]!;
    for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) {
      let sum = 0;
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) sum += axes[3 * i + p]! * T(p, q) * axes[3 * j + q]!;
      tensor[i === j ? i : i + j === 1 ? 3 : i + j === 2 ? 4 : 5] += sum;
    }
    centreOfToRef(part, at).subtractInPlace(centre);
    const dd = at.x * at.x + at.y * at.y + at.z * at.z;
    tensor[0] += m * (dd - at.x * at.x); tensor[1] += m * (dd - at.y * at.y); tensor[2] += m * (dd - at.z * at.z);
    tensor[3] -= m * at.x * at.y; tensor[4] -= m * at.x * at.z; tensor[5] -= m * at.y * at.z;
  }
}

/** How many intervals the swing's time left is integrated over (Simpson's rule): a numeric setting. */
const INTERVALS = 8;

/**
 * **The swing's pivot shift**, into `out`: the centroidal moment pivot's offset from the centre of
 * pressure now (`out.now`, x and z), and its weighted integrals over the swing's time left, by the
 * capture point's kernel (`out.capture`: w ∫ e^(w (T - s)) c(s) ds) and the centre of mass's
 * (`out.centre`: w ∫ sinh(w (T - s)) c(s) ds), so that as the foot lands the capture point is at
 * e^(w T) xi - p (e^(w T) - 1) - capture and the centre of mass at p + (x - p) cosh(w T) + (u / w)
 * sinh(w T) - centre.
 *
 * `leg` is the swinging leg as it is now, held so over the time left, `hip` its hip's place and
 * `centre` the body's centre of mass, world; `swing` the step on its path (`swingPathToRef`, bowed
 * `bow`), with `from` where the foot's sole's middle left the ground and `time` how long it has
 * swung; `place` the pivot the plan last fell about and `plan`, `velocity` the plan's centre of
 * mass; `w` the pendulum's rate, `weight` the body's weight, N. `progress`, `point`, `rate` and
 * `accel` carry nothing between calls.
 */
export function swingShiftToRef(leg: LegNow, hip: Vector3, centre: Vector3, swing: SwingGoal, bow: SwingBow, from: Vector3, time: number,
  place: Vector3, plan: Vector3, velocity: Vector3, w: number, weight: number, progress: Vector3, point: Vector3, rate: Vector3, accel: Vector3, out: SwingShift): void {
  const T = swing.seconds, left = Math.max(T - time, 0), h = INTERVALS, dt = left / h;
  // The leg's mass centre from the hip, and the hip from the body's centre of mass, now; the leg's
  // inertia about its mass centre.
  const qx = leg.centre.x - hip.x, qy = leg.centre.y - hip.y, qz = leg.centre.z - hip.z, m = leg.mass;
  const hx = hip.x - centre.x, hy = hip.y - centre.y, hz = hip.z - centre.z;
  const Ixx = leg.tensor[0]!, Izz = leg.tensor[2]!, Ixy = leg.tensor[3]!, Ixz = leg.tensor[4]!, Iyz = leg.tensor[5]!;
  let cx = 0, cz = 0, xx = 0, xz = 0, nowX = 0, nowZ = 0;
  for (let k = 0; k <= h; k++) {
    const s = k * dt, t = time + s, tau = Math.min(1, t / T);
    // The foot's sole's middle on its path, and its acceleration.
    swingProgressToRef(tau, swing.ramp, progress);
    swingPathToRef(from, swing.to, swing.lift, bow, tau, T, progress.x, progress.y / T, progress.z / (T * T), point, rate, accel, progress);
    const px = point.x, py = point.y, pz = point.z, afx = accel.x, afy = accel.y, afz = accel.z;
    // The plan's centre of mass falling about the place for s, and the hip with it.
    const ch = cosh(w * s), sh = sinh(w * s);
    const ox = place.x + (plan.x - place.x) * ch + velocity.x / w * sh, oz = place.z + (plan.z - place.z) * ch + velocity.z / w * sh;
    const ahx = w * w * (ox - place.x), ahz = w * w * (oz - place.z);
    const hipX = hip.x + ox - plan.x, hipZ = hip.z + oz - plan.z;
    // The foot from the hip, the foot's acceleration relative to the hip, and the leg's angular acceleration r x a / |r|^2.
    const rx = px - hipX, ry = py - hip.y, rz = pz - hipZ, r2 = rx * rx + ry * ry + rz * rz;
    const ax = afx - ahx, ay = afy, az = afz - ahz;
    const alx = (ry * az - rz * ay) / r2, aly = (rz * ax - rx * az) / r2, alz = (rx * ay - ry * ax) / r2;
    // The leg turning about its hip: its mass centre's acceleration alpha x q, and that centre from the body's.
    const bx = aly * qz - alz * qy, by = alz * qx - alx * qz, bz = alx * qy - aly * qx;
    const lx = hx + qx, ly = hy + qy, lz = hz + qz;
    // L' = I alpha + m (l x b): the leg's angular momentum about the body's centre of mass, its rate.
    const Lx = Ixx * alx + Ixy * aly + Ixz * alz + m * (ly * bz - lz * by);
    const Lz = Ixz * alx + Iyz * aly + Izz * alz + m * (lx * by - ly * bx);
    // The pivot's shift from the centre of pressure: (-L'_z, L'_x) over the weight.
    const sx = -Lz / weight, sz = Lx / weight;
    if (k === 0) { nowX = sx; nowZ = sz; }
    // Simpson's weights 1, 4, 2, 4, ..., 1 over dt / 3.
    const sw = (k === 0 || k === h ? 1 : k % 2 === 1 ? 4 : 2) * dt / 3;
    const e = exp(w * (left - s)), g = sinh(w * (left - s));
    cx += sw * e * sx; cz += sw * e * sz;
    xx += sw * g * sx; xz += sw * g * sz;
  }
  out.now[0] = nowX; out.now[1] = nowZ;
  out.capture[0] = w * cx; out.capture[1] = w * cz;
  out.centre[0] = w * xx; out.centre[1] = w * xz;
}

/** What `swingShiftToRef` finds, each x then z. */
export interface SwingShift {
  readonly now: [number, number];
  readonly capture: [number, number];
  readonly centre: [number, number];
}
