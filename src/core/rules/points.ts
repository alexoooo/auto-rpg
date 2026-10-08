import type { Vec3 } from "../spec/quantity.ts";

/** A point pierces only into its declared forward cone; side and reverse contacts are blunt. */
export function pointsInto(direction: Vec3, normal: Vec3, alignment: number): boolean {
  const d = direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2];
  const n = normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2];
  return d > 0 && n > 0 && (direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]) / Math.sqrt(d * n) >= alignment;
}
