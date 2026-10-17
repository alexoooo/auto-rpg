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
import { cosh, exp, hypot, sin, sinh } from "../math/real.ts";
import type { SwingGoal } from "./stance.ts";
import { centreOfToRef, turnOfToRef } from "./support.ts";
import { swingPathToRef, swingPeak, swingProgressToRef, type SwingBow } from "./swing-path.ts";

/** A leg as a pendulum about its hip: the segments from the hip joint to the ankle's child, on the straight leg. */
export interface SwingLeg {
  /** The hip to the ankle, straight, m. */
  readonly length: number;
  /** The leg's moment of inertia about its hip across the leg, kg m^2. */
  readonly aboutHip: number;
  /** The hip's peak torque, N m: the lesser of flexion's and extension's. */
  readonly torque: number;
  /** The hip's centre from the body's midline, m, to its own side. */
  readonly out: number;
  /**
   * How far the foot reaches from under the hip, m, by the hip's range from the vertical each way:
   * ahead and behind by its flexion's, out and in by its abduction's; the leg straight.
   */
  readonly reach: { readonly ahead: number; readonly behind: number; readonly out: number; readonly in: number };
}

/** `chain`'s leg (hip, knee, ankle) as a swing leg, from its specs in the reference pose. */
export function swingLegOf(chain: readonly BuiltJoint[]): SwingLeg {
  const [hip, , ankle] = chain;
  const h = hip!.spec.centre.value, a = ankle!.spec.centre.value;
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
  const span = (range: number, bind: number) => length * sin(Math.min(Math.max(range + bind, 0), Math.PI / 2));
  return {
    length, aboutHip: inertia + mass * centre * centre,
    torque: Math.min(flexion!.muscle.peakPositive.value, flexion!.muscle.peakNegative.value),
    out: Math.abs(h[0]),
    reach: {
      ahead: span(flexion!.max.value, flexion!.bind.value), behind: span(-flexion!.min.value, -flexion!.bind.value),
      out: span(abduction!.max.value, abduction!.bind.value), in: span(-abduction!.min.value, -abduction!.bind.value),
    },
  };
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
 * Whether `leg` reaches a step of (`dx`, `dz`) from the bearing sole's middle, world, facing with
 * right (`rx`, `rz`), `sign` +1 the right leg: the hip, midway between the soles as the foot lands and
 * `out` to its side, within its range's reach each way; and with `scale` the share of the step within
 * it, 1 if all of it.
 */
export function withinReach(leg: SwingLeg, dx: number, dz: number, rx: number, rz: number, sign: number): number {
  // The foot from the hip, ahead and out.
  const hx = dx / 2 - sign * leg.out * rx, hz = dz / 2 - sign * leg.out * rz;
  const ahead = -hx * rz + hz * rx, out = sign * (hx * rx + hz * rz);
  const ra = ahead >= 0 ? leg.reach.ahead : leg.reach.behind, ro = out >= 0 ? leg.reach.out : leg.reach.in;
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
