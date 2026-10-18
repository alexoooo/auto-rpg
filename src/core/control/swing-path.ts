/** A swing's way along its path, by its progress in time (`swingProgressToRef`). */
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { hypot } from "../math/real.ts";

/**
 * The peak of a swing's acceleration along its path, as a multiple of the way over the time squared:
 * minimum jerk's 10 / sqrt(3), or with a `ramp` 4 / (1 - 2 ramp) (`swingProgressToRef`).
 */
export function swingPeak(ramp: number | undefined): number {
  return ramp === undefined ? 10 / Math.sqrt(3) : 4 / (1 - 2 * ramp);
}

/**
 * **A swing's progress** at `tau`, its share of the swing's time, into `out`: x the share of the
 * way, y its rate per share of the time, z that rate's. With no `ramp`, minimum jerk, 10 tau^3 -
 * 15 tau^4 + 6 tau^5 (Flash and Hogan 1985), whose acceleration peaks at 5.77 times the way over
 * the time squared. With one, the acceleration rises over `ramp` of the time, holds, and falls
 * over as much by the half, then the same mirrored: its peak 4 / (1 - 2 ramp), the least a
 * way at rest at both ends can have as `ramp` goes to 0, for a sharper start and stop.
 */
export function swingProgressToRef(tau: number, ramp: number | undefined, out: Vector3): Vector3 {
  if (tau >= 1) return out.set(1, 0, 0);
  if (ramp === undefined) return out.set(tau * tau * tau * (10 - 15 * tau + 6 * tau * tau), 30 * tau * tau * (1 - tau) * (1 - tau), 60 * tau * (1 - tau) * (1 - 2 * tau));
  const q = ramp, flip = tau > 0.5, u = flip ? 1 - tau : tau, top = 4 / (1 - 2 * q);
  let share: number, rate: number, accel: number;
  if (u < q) {
    accel = top * u / q; rate = top * u * u / (2 * q); share = top * u * u * u / (6 * q);
  } else if (u <= 0.5 - q) {
    const d = u - q;
    accel = top; rate = top * q / 2 + top * d; share = top * q * q / 6 + top * q / 2 * d + top * d * d / 2;
  } else {
    const d = 0.5 - 2 * q, r = top * q / 2 + top * d, at = top * q * q / 6 + top * q / 2 * d + top * d * d / 2, e = u - (0.5 - q);
    accel = top * (1 - e / q); rate = r + top * e - top * e * e / (2 * q); share = at + r * e + top * e * e / 2 - top * e * e * e / (6 * q);
  }
  return flip ? out.set(1 - share, rate, -accel) : out.set(share, rate, accel);
}

/**
 * How a swing's path bows clear of the bearing sole (`swingBowToRef`): `aside` how far, m, as the
 * world's (x, z), at `at` of the way, rising from nothing at either end as minimum jerk does.
 */
export interface SwingBow {
  readonly aside: [number, number];
  at: number;
}

/** How near either end of the way a bow's peak may be: nearer, the way to it is too short to bend smoothly. */
const BOW_END = 0.1;

/** How many points of the way, from `BOW_END` of it to as near its end, a bow reads against the bearing sole's box. */
const BOW_SAMPLES = 16;

/** Minimum jerk's share of a way at `s` of its time (`swingProgressToRef`). */
const eased = (s: number): number => s * s * s * (10 - 15 * s + 6 * s * s);

/**
 * How far a point of a swing's way at (`across`, `along`) from the bearing sole's middle, in the
 * box's frame, goes along the bow's bend to leave the box of half-width `clear` and half-length
 * `reach`: out through its side on the swinging foot's own side (`nc` of the bend across), or
 * through the end face the bend is toward (`end`, `na` of it along) if that is first. 0 outside.
 */
function wayOut(across: number, along: number, clear: number, reach: number, end: number, nc: number, na: number): number {
  if (across <= -clear || across >= clear || along <= -reach || along >= reach) return 0;
  const way = (clear - across) / nc;
  return na === 0 ? way : Math.min(way, (reach - end * along) / (end * na));
}

/**
 * **A swing's bow**, into `out`: the path from `from` to `to` bent aside where it passes through
 * the box about the bearing sole that the swinging sole's middle keeps out of (`clearAcross`,
 * `clearAlong`): `bearer` its middle, `front` and `heel` its ends' middles, `reach` the box's
 * half-length along the sole and `clear` its half-width across. The bend is nothing at either end,
 * where the feet stand as they do, and rises to its peak, at the middle of the way's run through
 * the box, as minimum jerk, so that the path is as smooth as its way. It bends out across to the
 * swinging foot's own side, `side` (unit, world x and z), when the landing is out there; else
 * toward the box's corner on that side at the end the landing is toward, so that a foot crossing
 * behind the bearing leg rounds its heel: by as much as takes every point of the way read in the
 * box out of it, each by the bend's share there, less what the way's ends lend the point between
 * them (`wayOut`). A foot that stands in the box, or lands on the sole's face, is in it by right,
 * where the bend is nothing: the bow owes only what the way between the ends adds, or a hair of
 * the landing's in the box asks a bend of metres.
 */
export function swingBowToRef(from: Vector3, to: readonly [number, number], bearer: Vector3, front: Vector3, heel: Vector3, reach: number, clear: number,
  side: readonly [number, number], out: SwingBow): void {
  const dx = to[0] - from.x, dz = to[1] - from.z, lx = front.x - heel.x, lz = front.z - heel.z, long = hypot(lx, lz);
  out.aside[0] = 0; out.aside[1] = 0; out.at = 0.5;
  if (long < 1e-6) return;
  const ax = lx / long, az = lz / long;
  let cx = az, cz = -ax;
  if (cx * side[0] + cz * side[1] < 0) { cx = -cx; cz = -cz; }
  const tx = to[0] - bearer.x, tz = to[1] - bearer.z, end = tx * cx + tz * cz >= clear ? 0 : tx * ax + tz * az < 0 ? -1 : 1;
  const nc = end === 0 ? 1 : clear / hypot(clear, reach), na = end === 0 ? 0 : end * reach / hypot(clear, reach);
  const fx = from.x - bearer.x, fz = from.z - bearer.z;
  const lent = wayOut(fx * cx + fz * cz, fx * ax + fz * az, clear, reach, end, nc, na), lands = wayOut(tx * cx + tz * cz, tx * ax + tz * az, clear, reach, end, nc, na);
  const step = (1 - 2 * BOW_END) / (BOW_SAMPLES - 1);
  let first = -1, last = -1;
  for (let k = 0; k < BOW_SAMPLES; k++) {
    const u = BOW_END + step * k, px = fx + dx * u, pz = fz + dz * u;
    if (wayOut(px * cx + pz * cz, px * ax + pz * az, clear, reach, end, nc, na) <= lent * (1 - u) + lands * u) continue;
    if (first < 0) first = k;
    last = k;
  }
  if (first < 0) return;
  const at = BOW_END + step * (first + last) / 2;
  let most = 0;
  for (let k = first; k <= last; k++) {
    const u = BOW_END + step * k, px = fx + dx * u, pz = fz + dz * u;
    const owed = wayOut(px * cx + pz * cz, px * ax + pz * az, clear, reach, end, nc, na) - lent * (1 - u) - lands * u;
    if (owed <= 0) continue;
    const bend = owed / eased(u <= at ? u / at : (1 - u) / (1 - at));
    if (bend > most) most = bend;
  }
  out.at = at;
  out.aside[0] = (cx * nc + ax * na) * most; out.aside[1] = (cz * nc + az * na) * most;
}

/**
 * **A swing's path**: the sole's middle from `from` to `to` by `u` of the way (`swingProgressToRef`),
 * lifted `lift` m by the quartic 16 tau^2 (1 - tau)^2 of `tau`, its share of the swing's `T` s, and
 * bowed `bow` aside, by minimum jerk of the way to the bow's peak and from it: into `point`, with
 * its velocity into `velocity` and its acceleration into `accel` from the way's rates `du` and
 * `ddu`, per second. `work` carries nothing between calls. The path keeps the height the foot left
 * at; the swing carries its sole's lowest corner from there to the ground (`swingFoot`).
 */
export function swingPathToRef(from: Vector3, to: readonly [number, number], lift: number, bow: SwingBow, tau: number, T: number, u: number, du: number, ddu: number,
  point: Vector3, velocity: Vector3, accel: Vector3, work: Vector3): void {
  const dx = to[0] - from.x, dz = to[1] - from.z;
  const bump = 16 * tau * tau * (1 - tau) * (1 - tau), dbump = 32 * tau * (1 - tau) * (1 - 2 * tau) / T, ddbump = tau < 1 ? 32 * (1 - 6 * tau + 6 * tau * tau) / (T * T) : 0;
  // The bow's share of its height, by the way's share of the way to its peak or from it, and that share's rates by u.
  const rising = u <= bow.at, span = rising ? bow.at : 1 - bow.at, s = rising ? u / span : (1 - u) / span;
  swingProgressToRef(s, undefined, work);
  const q = work.x, dq = (rising ? 1 : -1) * work.y / span, ddq = work.z / (span * span);
  const [bx, bz] = bow.aside, ddb = ddq * du * du + dq * ddu;
  point.set(from.x + dx * u + bx * q, from.y + lift * bump, from.z + dz * u + bz * q);
  velocity.set(dx * du + bx * dq * du, lift * dbump, dz * du + bz * dq * du);
  accel.set(dx * ddu + bx * ddb, lift * ddbump, dz * ddu + bz * ddb);
}
