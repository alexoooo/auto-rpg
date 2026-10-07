import { cbrt } from "../math/real.ts";
import type { Vec3 } from "./quantity.ts";

/**
 * Geometry a spec's rules need and cannot write in one line.
 */

/**
 * The radius of a capsule of overall length `length` (cap to cap) that holds `volume`:
 * pi r^2 (length - 2r) + 4/3 pi r^3 = volume, that is pi r^2 length - 2/3 pi r^3 = volume. The left
 * side rises with r up to r = length, so the root below length / 2 is unique; bisection finds it
 * to the last bit. A capsule that cannot hold the volume within that length is refused.
 */
export function capsuleRadius(volume: number, length: number): number {
  const held = (r: number) => Math.PI * r * r * length - (2 / 3) * Math.PI * r * r * r;
  let low = 0, high = length / 2;
  if (!(volume > 0 && length > 0) || held(high) < volume) {
    throw new Error(`no capsule ${length} m long holds ${volume} m3`);
  }
  while (high - low > Number.EPSILON * high) {
    const mid = (low + high) / 2;
    if (mid === low || mid === high) break;
    if (held(mid) < volume) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

/** The radius of a ball that holds `volume`, m: the cube root of 3 volume / (4 pi). */
export function ballRadius(volume: number): number {
  return cbrt(3 * volume / (4 * Math.PI));
}

/** A solid ball's moment of inertia about any axis through its centre, kg m2: 2/5 m r^2. */
export function ballMoment(mass: number, radius: number): number {
  return (2 / 5) * mass * radius * radius;
}

/** A solid cylinder's principal moments about its centre, kg m2, its axis along y: m (l^2 / 12 + r^2 / 4) across, m r^2 / 2 along. */
export function cylinderMoments(mass: number, length: number, radius: number): Vec3 {
  const across = mass * (length * length / 12 + radius * radius / 4);
  return [across, mass * radius * radius / 2, across];
}

/** A solid cuboid's principal moments about its centre, kg m2, on its edges' axes: m (b^2 + c^2) / 12 about each. */
export function cuboidMoments(mass: number, size: Vec3): Vec3 {
  const [x, y, z] = size;
  return [mass * (y * y + z * z) / 12, mass * (x * x + z * z) / 12, mass * (x * x + y * y) / 12];
}

/** One part's share of a whole by its weight among all the parts' weights: whole weight / the sum of the weights. */
export function massShare(whole: number, weight: number, weights: readonly number[]): number {
  return whole * weight / weights.reduce((sum, w) => sum + w, 0);
}
