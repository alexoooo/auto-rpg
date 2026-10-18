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

/**
 * **A swing's bow**, into `out`: the path from `from` to `to` bent aside where it passes nearest the
 * bearing sole's middle `bearer`, so that it is `clear` m from it there. The bend is nothing at
 * either end, where the feet stand as they do, and rises to the pass as minimum jerk, so that the
 * path is as smooth as its way. A path over the sole bends to the swinging foot's own side, `side`
 * (unit, world x and z).
 */
export function swingBowToRef(from: Vector3, to: readonly [number, number], bearer: Vector3, clear: number, side: readonly [number, number], out: SwingBow): void {
  const dx = to[0] - from.x, dz = to[1] - from.z, d2 = dx * dx + dz * dz;
  out.aside[0] = 0; out.aside[1] = 0; out.at = 0.5;
  if (d2 < 1e-8) return;
  const u = Math.min(Math.max(((bearer.x - from.x) * dx + (bearer.z - from.z) * dz) / d2, 0), 1);
  const qx = from.x + u * dx - bearer.x, qz = from.z + u * dz - bearer.z, dist = hypot(qx, qz), need = clear - dist;
  if (need <= 0) return;
  out.at = Math.min(Math.max(u, BOW_END), 1 - BOW_END);
  if (dist > 1e-3) { out.aside[0] = qx / dist * need; out.aside[1] = qz / dist * need; } else { out.aside[0] = side[0] * need; out.aside[1] = side[1] * need; }
}

/**
 * **A swing's path**: the sole's middle from `from` to `to` by `u` of the way (`swingProgressToRef`),
 * lifted `lift` m by the quartic 16 tau^2 (1 - tau)^2 of `tau`, its share of the swing's `T` s, and
 * bowed `bow` aside, by minimum jerk of the way to the bow's peak and from it: into `point`, with
 * its velocity into `velocity` and its acceleration into `accel` from the way's rates `du` and
 * `ddu`, per second. `work` carries nothing between calls. The path keeps the height the foot left
 * at: a foot that leaves from its toes ends its time above the ground, and comes down from there
 * (a walk's swing presses on until its sole meets the ground); carried down to the ground by its
 * progress instead, a foot still pitched from its launch meets the ground with its toes before its
 * time and lands short.
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
