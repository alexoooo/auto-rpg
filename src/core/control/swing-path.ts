/** A swing's way along its path, by its progress in time (`swingProgressToRef`). */
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

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
