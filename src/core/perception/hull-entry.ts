import type { Vec3 } from "../spec/quantity.ts";

/**
 * First entry of a finite ray into outward convex planes; an internal start has no exposed entry.
 * It runs for every candidate face each control step, so it works in numbers, not vectors: a
 * plane's distance and speed are `dot`'s sums in its order.
 */
export function hullEntry(planes: readonly { readonly normal: Vec3; readonly offset: number }[], from: Vec3, to: Vec3): Vec3 | null {
  const f0 = from[0], f1 = from[1], f2 = from[2], d0 = to[0] - f0, d1 = to[1] - f1, d2 = to[2] - f2;
  let enter = 0, leave = 1, outside = false;
  for (let k = 0; k < planes.length; k++) {
    const plane = planes[k]!, normal = plane.normal, n0 = normal[0], n1 = normal[1], n2 = normal[2];
    const distance = plane.offset - (n0 * f0 + n1 * f1 + n2 * f2), speed = n0 * d0 + n1 * d1 + n2 * d2;
    if (distance < 0) outside = true;
    if (speed === 0) { if (distance < 0) return null; }
    else if (speed < 0) enter = Math.max(enter, distance / speed);
    else leave = Math.min(leave, distance / speed);
    if (enter > leave) return null;
  }
  return outside ? [f0 + d0 * enter, f1 + d1 * enter, f2 + d2 * enter] : null;
}
