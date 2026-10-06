import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";

/** Target geometry in the standing heading; the same window gates engagement and release. */
export function targetWindow(head: Vec3, heading: number, target: Vec3,
  range: { readonly reach: number; readonly along: readonly [number, number] }, across: number) {
  const dx = target[0] - head[0], dz = target[2] - head[2], fx = sin(heading), fz = cos(heading);
  const ahead = dx * fx + dz * fz, aside = dx * fz - dz * fx;
  const off = ahead - range.reach;
  return { distance: hypot(dx, dz), bearing: atan2(dx, dz), ahead, aside, off,
    inside: ahead > 0 && range.along[0] <= off && off <= range.along[1] && Math.abs(aside) <= across };
}
