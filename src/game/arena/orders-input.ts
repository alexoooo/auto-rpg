import type { Vec3 } from "../../core/quantity.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import { surfaceEntry } from "../../skills/perception/openings.ts";

/**
 * Where a ray from `origin` along `direction` crosses the level plane at `height`, or null if it
 * never comes down to it. The plane is at the ordered body's centre of mass, not the ground: a
 * pointer over a body's chest, read on the ground, lands metres behind it.
 */
export function aimPoint(origin: Vec3, direction: Vec3, height: number): Vec3 | null {
  const t = (height - origin[1]) / direction[1];
  return direction[1] < 0 && t > 0 ? [origin[0] + t * direction[0], height, origin[2] + t * direction[2]] : null;
}

/** The nearest sensed anatomical surface along a finite ray; decorative meshes have no authority. */
export function rayTarget(senses: Senses, origin: Vec3, direction: Vec3, length: number): { readonly foe: string; readonly region: string } | null {
  const to: Vec3 = [origin[0] + direction[0] * length, origin[1] + direction[1] * length, origin[2] + direction[2] * length];
  let distance = Infinity, target: { foe: string; region: string } | null = null;
  for (const foe of senses.others) {
    if (foe.out || foe.side === senses.side) continue;
    for (const part of foe.spec.segments) {
      const hit = surfaceEntry(foe, part.name, origin, to);
      if (!hit) continue;
      const squared = hit.at.reduce((sum, value, i) => sum + (value - origin[i]!) * (value - origin[i]!), 0);
      if (squared < distance) { distance = squared; target = { foe: foe.id, region: part.name }; }
    }
  }
  return target;
}
