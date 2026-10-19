/**
 * **The swing leg**: what a leg is to a walk's plan. Its segments from the hip to the foot as a
 * pendulum about the hip (`SwingLeg`, `swingLegOf`), how long a swing needs for its hip's strength
 * (`swingSeconds`), how far its hip's range lets the foot reach (`withinReach`), and its reaction on
 * the body as a swing carries its links (`swingShiftToRef`).
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
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { acos, asin, atan2, cos, cosh, exp, hypot, sin, sinh } from "../math/real.ts";
import type { SwingGoal } from "./stance.ts";
import { swingPathToRef, swingPeak, swingProgressToRef, type SwingBow } from "./swing-path.ts";
import type { ReadJoint } from "../read-body.ts";

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
  /**
   * How far the thigh may lean from the vertical each way, rad, no more than level: ahead and
   * behind by the hip's flexion's range, out and in by its abduction's (`reachAt`).
   */
  readonly range: { readonly ahead: number; readonly behind: number; readonly out: number; readonly in: number };
  /**
   * The leg's links, for its reaction (`swingShiftToRef`): the thigh's and the shank's mass, their
   * mass centres' distance along them from their upper joint, m, and their moment of inertia
   * across them about that centre, kg m^2; the foot's mass and its centre from the ankle in the
   * reference pose, ahead and up, m.
   */
  readonly links: { readonly thigh: SwingLink; readonly shank: SwingLink; readonly foot: { readonly mass: number; readonly ahead: number; readonly up: number } };
}

/** A link of a swing leg (`SwingLeg.links`). */
interface SwingLink { readonly mass: number; readonly centre: number; readonly across: number }

/** `chain`'s leg (hip, knee, ankle) as a swing leg, from its specs in the reference pose. */
export function swingLegOf(chain: readonly ReadJoint[]): SwingLeg {
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
  const link = (part: (typeof parts)[number], p: readonly number[], q: readonly number[]): SwingLink => {
    const c = part.spec.centreOfMass.value, i = part.spec.inertia.value, dx = q[0]! - p[0]!, dy = q[1]! - p[1]!, dz = q[2]! - p[2]!;
    return { mass: part.spec.mass.value, centre: ((c[0] - p[0]!) * dx + (c[1] - p[1]!) * dy + (c[2] - p[2]!) * dz) / hypot(dx, dy, dz), across: Math.max(i[0], i[1], i[2]) };
  };
  const foot = parts[2]!.spec, fc = foot.centreOfMass.value;
  return {
    length, thigh: hypot(k[0] - h[0], k[1] - h[1], k[2] - h[2]), shank: hypot(a[0] - k[0], a[1] - k[1], a[2] - k[2]), aboutHip: inertia + mass * centre * centre,
    torque: Math.min(flexion!.muscle.peakPositive.value, flexion!.muscle.peakNegative.value),
    range: {
      ahead: lean(flexion!.max.value, flexion!.bind.value), behind: lean(-flexion!.min.value, -flexion!.bind.value),
      out: lean(abduction!.max.value, abduction!.bind.value), in: lean(-abduction!.min.value, -abduction!.bind.value),
    },
    links: { thigh: link(parts[0]!, h, k), shank: link(parts[1]!, k, a), foot: { mass: foot.mass.value, ahead: fc[2] - a[2], up: fc[1] - a[1] } },
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

/** The least time, s, a single swing of `way` m needs of `leg`, as `swingSeconds` reckons it: T^2 = swingPeak way aboutHip / (length effort torque). */
export function swingWaySeconds(leg: SwingLeg, way: number, effort: number): number {
  return Math.sqrt(swingPeak(undefined) * way * leg.aboutHip / (leg.length * effort * leg.torque));
}

/**
 * The ankle from the hip, ahead and out along the facing (right (`rx`, `rz`)), m, of a leg whose
 * sole is at (`dx`, `dz`) from the bearing sole's middle, world, the body's centre at (`cx`, `cz`)
 * from it, `sign` +1 the right leg: the ankle `back` behind the sole's middle, the hip at `hip`
 * (x, z) from the centre, world, where the body carries it (`FootMemory.hip`).
 */
function ankleFromHip(dx: number, dz: number, cx: number, cz: number, hip: Vector3, rx: number, rz: number, sign: number, back: number): [number, number] {
  const hx = dx + back * rz - cx - hip.x, hz = dz - back * rx - cz - hip.z;
  return [-hx * rz + hz * rx, sign * (hx * rx + hz * rz)];
}

/**
 * How a landing leg's shank leans from the vertical as its foot lands, rad, ahead and out, the hip
 * `hip` over the ankle, `at` from the body's centre, and the ankle where `ankleFromHip` (the same
 * arguments) puts it: out, the
 * angle of the leg's line; ahead, the line's less the shank's angle from it, since the knee bends
 * ahead by what the line falls short of the leg's length (the sine rule on the thigh, the shank and
 * the line). What the foot lands turned by (`SwingGoal.lean`). With the hip above the ankle the
 * lean is within a half turn, which the landing's turn asks (`rotationOfToRef`); below it, none.
 */
export function landingLean(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, at: Vector3, rx: number, rz: number, sign: number, hip: number, back: number): [number, number] {
  // Hips not above the ankle (the body down, or no plan) lean nothing: the foot lands flat.
  if (!(hip > 0)) return [0, 0];
  const [ahead, out] = ankleFromHip(dx, dz, cx, cz, at, rx, rz, sign, back), line = hypot(hip, ahead, out), t = leg.thigh, s = leg.shank;
  const knee = line < t + s && line > Math.abs(t - s) ? acos((t * t + s * s - line * line) / (2 * t * s)) : Math.PI;
  const bent = knee < Math.PI ? asin(Math.min(t * sin(knee) / line, 1)) : 0;
  return [atan2(ahead, hip) - bent, atan2(out, hip)];
}

/**
 * The share of the hip's way to an ankle `ahead` and `out` of it, m, that `leg` reaches, 1 if all
 * of it: within the ellipse of its reach (`reachAt`) ahead or behind and out or in, with the hip
 * `hip` over the ankle and the leg no longer than `long` (hip to ankle at the knee's least bend).
 * The leg reaches straight within its hip's range; behind, where the hip's range stops the thigh,
 * its knee bends for the rest if it `bends`.
 */
function shareOfReach(leg: SwingLeg, ahead: number, out: number, hip: number, long: number, bends: boolean): number {
  const ra = ahead >= 0 ? reachAt(leg, leg.range.ahead, false, hip, long) : reachAt(leg, leg.range.behind, bends, hip, long);
  const ro = reachAt(leg, out >= 0 ? leg.range.out : leg.range.in, false, hip, long);
  if (ra <= 0 || ro <= 0) return 0;
  const far = (ahead / ra) * (ahead / ra) + (out / ro) * (out / ro);
  return far > 1 ? 1 / Math.sqrt(far) : 1;
}

/**
 * Whether `leg` reaches a sole at (`dx`, `dz`) from the bearing sole's middle, world, facing with
 * right (`rx`, `rz`), `sign` +1 the right leg: the hip, `at` from the body's centre as the body
 * carries it, the centre at (`cx`, `cz`) from the bearing sole's middle as the foot lands (midway
 * between the soles in a steady walk), with its ankle, `back` behind that sole's middle along the
 * facing, within the leg's reach with the hip `hip` over it and the leg no longer than `long`
 * (`shareOfReach`). The share of the hip's way to the ankle within it, 1 if all of it. The
 * bearing leg's sole is its own, at (0, 0), where the body's centre has gone ahead of it by the
 * landing.
 */
export function withinReach(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, at: Vector3, rx: number, rz: number, sign: number, hip: number, long: number, back: number): number {
  const [ahead, out] = ankleFromHip(dx, dz, cx, cz, at, rx, rz, sign, back);
  return shareOfReach(leg, ahead, out, hip, long, true);
}

/**
 * Where `leg` lands a sole asked at (`dx`, `dz`) from the bearing sole's middle, world, the rest as
 * `withinReach`, and whether it lands it there: there, if its ankle is within `reserve` of the
 * leg's reach from its hip, its knee bending behind for it if it `bends`; else with the ankle drawn in toward the hip along the hip's way to it
 * by the share the leg reaches. A step out of reach shortens toward under the hip, where the leg
 * hangs, and keeps its way from it: drawn toward the bearing sole instead, a long step back or
 * ahead lost its width too, and the body it was to catch fell past the landing to the side.
 */
export function reachableSole(leg: SwingLeg, dx: number, dz: number, cx: number, cz: number, at: Vector3, rx: number, rz: number, sign: number, hip: number, long: number, back: number, reserve: number, bends: boolean): [number, number, boolean] {
  const [ahead, out] = ankleFromHip(dx, dz, cx, cz, at, rx, rz, sign, back);
  const share = shareOfReach(leg, ahead / reserve, out / reserve, hip, long, bends);
  if (share >= 1) return [dx, dz, true];
  // The hip's way to the ankle, world (`ankleFromHip`), drawn in by the share.
  const hx = dx + back * rz - cx - at.x, hz = dz - back * rx - cz - at.z;
  return [dx - (1 - share) * hx, dz - (1 - share) * hz, false];
}

/** How many intervals the swing's time left is integrated over (Simpson's rule): a numeric setting. */
const INTERVALS = 8;
/**
 * The time, s, a leg's pose is differenced over for its links' velocities, and the time its
 * angular momentum is differenced over for its rate now: numeric settings.
 */
const DELTA = 1e-3, NOW = 5e-3;

/** What `swingShiftToRef` works in: a leg's pose at a time and `DELTA` after, and its angular momentum at each of the samples and at `NOW`. Carries nothing between calls. */
export interface SwingShiftWork { readonly pose: Float64Array; readonly momentum: Float64Array }

/** A `SwingShiftWork`. */
export const makeSwingShiftWork = (): SwingShiftWork => ({ pose: new Float64Array(18), momentum: new Float64Array(3 * (INTERVALS + 2)) });

/**
 * **The swing's pivot shift**, into `out`: the centroidal moment pivot's offset from the centre of
 * pressure now (`out.now`, x and z), and its weighted integrals over the swing's time left, by the
 * capture point's kernel (`out.capture`: w ∫ e^(w (T - s)) c(s) ds) and the centre of mass's
 * (`out.centre`: w ∫ sinh(w (T - s)) c(s) ds), so that as the foot lands the capture point is at
 * e^(w T) xi - p (e^(w T) - 1) - capture and the centre of mass at p + (x - p) cosh(w T) + (u / w)
 * sinh(w T) - centre.
 *
 * The leg is its two links and its foot (`SwingLeg.links`) as the swing will carry them: its hip
 * `hip` where it is, world, carried with the plan's centre of mass falling about `place` from
 * `plan` at `velocity`; its ankle `ankle` over and `back` behind the sole's middle along the
 * facing `heading`, the middle on the step's path (`swingPathToRef`, bowed `bow`, from `from`
 * where it left the ground, `time` s swung); and its knee where the two links meet, bent ahead
 * along the facing. Its angular momentum about the body's centre of mass, there at `centre`'s
 * height, is taken at each point of the time left, and the integrals of its rate are those of the
 * momentum itself by parts: w ∫ e^(w (T - s)) L' ds = w (L(T) - e^(w T) L(0) + w ∫ e^(w (T - s)) L ds),
 * and w ∫ sinh(w (T - s)) L' ds = w (w ∫ cosh(w (T - s)) L ds - sinh(w T) L(0)). The thigh swings
 * further than the hip's line to the foot as the knee bends and straightens, and moves the most
 * of the leg's mass: a leg taken as rigid along that line reacts with about half of it.
 * `w` is the pendulum's rate, `weight` the body's weight, N. `progress`, `point`, `rate`, `accel`
 * and `work` carry nothing between calls.
 */
export function swingShiftToRef(leg: SwingLeg, ankle: number, back: number, heading: number, hip: Vector3, centre: Vector3, swing: SwingGoal, bow: SwingBow,
  from: Vector3, time: number, place: Vector3, plan: Vector3, velocity: Vector3, w: number, weight: number, progress: Vector3, point: Vector3, rate: Vector3,
  accel: Vector3, work: SwingShiftWork, out: SwingShift): void {
  const T = swing.seconds, left = Math.max(T - time, 0), h = INTERVALS, dt = left / h, { pose, momentum: L } = work;
  const fx = sin(heading), fz = cos(heading), { thigh, shank, foot } = leg.links;
  // The leg's hip, knee and ankle s after now, into pose at o.
  const poseAt = (s: number, o: number): void => {
    const tau = Math.min(1, (time + s) / T);
    swingProgressToRef(tau, swing.ramp, progress);
    swingPathToRef(from, swing.to, swing.lift, bow, tau, T, progress.x, progress.y / T, progress.z / (T * T), point, rate, accel, progress);
    const ch = cosh(w * s), sh = sinh(w * s);
    const Hx = hip.x + place.x + (plan.x - place.x) * ch + velocity.x / w * sh - plan.x, Hy = hip.y;
    const Hz = hip.z + place.z + (plan.z - place.z) * ch + velocity.z / w * sh - plan.z;
    const Ax = point.x - back * fx, Ay = point.y + ankle, Az = point.z - back * fz;
    const dx = Ax - Hx, dy = Ay - Hy, dz = Az - Hz, l = Math.sqrt(dx * dx + dy * dy + dz * dz), t = leg.thigh, k = leg.shank;
    let Kx: number, Ky: number, Kz: number;
    if (l >= t + k) { Kx = Hx + dx * t / (t + k); Ky = Hy + dy * t / (t + k); Kz = Hz + dz * t / (t + k); }
    else {
      // The knee a along the hip's line to the ankle and b off it, toward the facing.
      const a = (t * t - k * k + l * l) / (2 * l), b = Math.sqrt(Math.max(t * t - a * a, 0));
      const ux = dx / l, uy = dy / l, uz = dz / l, along = fx * ux + fz * uz;
      let nx = fx - along * ux, ny = -along * uy, nz = fz - along * uz;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; }
      Kx = Hx + ux * a + nx * b; Ky = Hy + uy * a + ny * b; Kz = Hz + uz * a + nz * b;
    }
    pose[o] = Hx; pose[o + 1] = Hy; pose[o + 2] = Hz; pose[o + 3] = Kx; pose[o + 4] = Ky; pose[o + 5] = Kz; pose[o + 6] = Ax; pose[o + 7] = Ay; pose[o + 8] = Az;
  };
  // The leg's angular momentum about the body's centre of mass s after now, into L at o.
  const momentumAt = (s: number, o: number): void => {
    poseAt(s, 0);
    poseAt(s + DELTA, 9);
    const ch = cosh(w * s), sh = sinh(w * s);
    const Cx = place.x + (plan.x - place.x) * ch + velocity.x / w * sh, Cz = place.z + (plan.z - place.z) * ch + velocity.z / w * sh;
    const Vx = (plan.x - place.x) * w * sh + velocity.x * ch, Vz = (plan.z - place.z) * w * sh + velocity.z * ch;
    let lx = 0, ly = 0, lz = 0;
    // A mass m at the share f of the way from pose point i to j and (ox, oy, oz) on, its place
    // from the centre of mass and its velocity from the centre's.
    const mass = (m: number, i: number, j: number, f: number, ox: number, oy: number, oz: number): void => {
      const px = pose[i]! + (pose[j]! - pose[i]!) * f + ox, py = pose[i + 1]! + (pose[j + 1]! - pose[i + 1]!) * f + oy, pz = pose[i + 2]! + (pose[j + 2]! - pose[i + 2]!) * f + oz;
      const qx = pose[9 + i]! + (pose[9 + j]! - pose[9 + i]!) * f + ox, qy = pose[10 + i]! + (pose[10 + j]! - pose[10 + i]!) * f + oy, qz = pose[11 + i]! + (pose[11 + j]! - pose[11 + i]!) * f + oz;
      const rx = px - Cx, ry = py - centre.y, rz = pz - Cz, vx = (qx - px) / DELTA - Vx, vy = (qy - py) / DELTA, vz = (qz - pz) / DELTA - Vz;
      lx += m * (ry * vz - rz * vy); ly += m * (rz * vx - rx * vz); lz += m * (rx * vy - ry * vx);
    };
    // A link's spin across it, from pose point i to j: u x u' of its direction u.
    const spin = (across: number, i: number, j: number): void => {
      const ax = pose[j]! - pose[i]!, ay = pose[j + 1]! - pose[i + 1]!, az = pose[j + 2]! - pose[i + 2]!, al = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = pose[9 + j]! - pose[9 + i]!, by = pose[10 + j]! - pose[10 + i]!, bz = pose[11 + j]! - pose[11 + i]!, bl = Math.sqrt(bx * bx + by * by + bz * bz);
      const u0 = ax / al, u1 = ay / al, u2 = az / al, d0 = (bx / bl - u0) / DELTA, d1 = (by / bl - u1) / DELTA, d2 = (bz / bl - u2) / DELTA;
      lx += across * (u1 * d2 - u2 * d1); ly += across * (u2 * d0 - u0 * d2); lz += across * (u0 * d1 - u1 * d0);
    };
    mass(thigh.mass, 0, 3, thigh.centre / leg.thigh, 0, 0, 0);
    mass(shank.mass, 3, 6, shank.centre / leg.shank, 0, 0, 0);
    mass(foot.mass, 6, 6, 0, fx * foot.ahead, foot.up, fz * foot.ahead);
    spin(thigh.across, 0, 3);
    spin(shank.across, 3, 6);
    L[o] = lx; L[o + 1] = ly; L[o + 2] = lz;
  };
  for (let k = 0; k <= h; k++) momentumAt(k * dt, 3 * k);
  const n = 3 * (h + 1);
  momentumAt(NOW, n);
  out.now[0] = -(L[n + 2]! - L[2]!) / NOW / weight; out.now[1] = (L[n]! - L[0]!) / NOW / weight;
  let ex = 0, ez = 0, cx = 0, cz = 0;
  for (let k = 0; k <= h; k++) {
    // Simpson's weights 1, 4, 2, 4, ..., 1 over dt / 3.
    const sw = (k === 0 || k === h ? 1 : k % 2 === 1 ? 4 : 2) * dt / 3, e = exp(w * (left - k * dt)), c = cosh(w * (left - k * dt));
    ex += sw * e * L[3 * k]!; ez += sw * e * L[3 * k + 2]!;
    cx += sw * c * L[3 * k]!; cz += sw * c * L[3 * k + 2]!;
  }
  const grow = exp(w * left), sh = sinh(w * left), e = 3 * h;
  out.capture[0] = -w * (L[e + 2]! - grow * L[2]! + w * ez) / weight; out.capture[1] = w * (L[e]! - grow * L[0]! + w * ex) / weight;
  out.centre[0] = -w * (w * cz - sh * L[2]!) / weight; out.centre[1] = w * (w * cx - sh * L[0]!) / weight;
}

/** What `swingShiftToRef` finds, each x then z. */
export interface SwingShift {
  readonly now: [number, number];
  readonly capture: [number, number];
  readonly centre: [number, number];
}
