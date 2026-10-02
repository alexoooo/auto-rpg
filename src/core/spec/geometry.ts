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

/** A solid ball's moment of inertia about any axis through its centre, kg m2: 2/5 m r^2. */
export function ballMoment(mass: number, radius: number): number {
  return (2 / 5) * mass * radius * radius;
}
