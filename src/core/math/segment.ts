import type { Vec3 } from "../quantity.ts";

/** `x` clipped to [0, 1]. */
const clip = (x: number): number => Math.max(0, Math.min(1, x));

/** The squared length of `w + u s - v t`, by components: the gap between two segments' points at `s` and `t`. */
function gapSquared(wx: number, wy: number, wz: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, s: number, t: number): number {
  const qx = wx + ux * s - vx * t, qy = wy + uy * s - vy * t, qz = wz + uz * s - vz * t;
  return qx * qx + qy * qy + qz * qz;
}

/**
 * Exact squared distance between two finite segments, including degenerate and parallel ones. It
 * runs for every candidate blow against every guarding limb each control step, so it works in
 * numbers alone and allocates nothing.
 */
export function segmentDistanceSquared(start: Vec3, end: Vec3, otherStart: Vec3, otherEnd: Vec3): number {
  const ux = end[0] - start[0], uy = end[1] - start[1], uz = end[2] - start[2];
  const vx = otherEnd[0] - otherStart[0], vy = otherEnd[1] - otherStart[1], vz = otherEnd[2] - otherStart[2];
  const wx = start[0] - otherStart[0], wy = start[1] - otherStart[1], wz = start[2] - otherStart[2];
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  let best = Math.min(gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, 0, c ? clip(e / c) : 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, 1, c ? clip((e + b) / c) : 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, a ? clip(-d / a) : 0, 0),
    gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, a ? clip((b - d) / a) : 0, 1));
  const determinant = a * c - b * b;
  if (determinant > 0) {
    const s = (b * e - c * d) / determinant, t = (a * e - b * d) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) best = Math.min(best, gapSquared(wx, wy, wz, ux, uy, uz, vx, vy, vz, s, t));
  }
  return best;
}
