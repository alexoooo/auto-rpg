import type { Vec3 } from "./quantity.ts";
import { atan2, hypot } from "../math/real.ts";

/**
 * The vector arithmetic a spec's rules are written in, on plain `Vec3` tuples, so a rule states
 * its formula without reaching for an engine type or writing a component index.
 */
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3): number => hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3, b: Vec3): number => length(sub(b, a));
/** The point `t` of the way from `a` to `b`. */
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export const midpoint = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 1 / 2);

export function normalize(a: Vec3): Vec3 {
  const n = length(a);
  if (!(n > 0)) throw new Error("cannot normalize a zero vector");
  return scale(a, 1 / n);
}

/** `a` with its component along the unit vector `along` removed, normalized. */
export const orthogonalTo = (a: Vec3, along: Vec3): Vec3 => normalize(sub(a, scale(along, dot(a, along))));

/**
 * The signed angle about the unit `axis` from `from` to `to`, each projected onto the plane square
 * to it: positive in the sense that turns `from` toward `cross(axis, from)`, the sense a positive
 * rotation about `axis` has.
 */
export function angleAbout(axis: Vec3, from: Vec3, to: Vec3): number {
  const f = orthogonalTo(from, axis), t = orthogonalTo(to, axis);
  return atan2(dot(cross(f, t), axis), dot(f, t));
}
