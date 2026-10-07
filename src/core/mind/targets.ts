import { atan2, hypot } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { nearSurface } from "./openings.ts";
import type { BodySense, Senses } from "./senses.ts";

/**
 * **The nearest body of another side** to `from`, across the ground, the first of equals in the
 * senses' order: `standing` takes only one still in the fight; `standing-first` takes one that is
 * out only when none stands.
 */
export function nearestFoe(senses: Senses, from: { readonly x: number; readonly z: number }, rule: "standing" | "standing-first"): BodySense | null {
  let foe: BodySense | null = null, near = Infinity;
  for (const other of senses.others) {
    if (other.side === senses.side) continue;
    switch (rule) {
      case "standing": if (other.out) continue; break;
      case "standing-first": break;
      default: { const never: never = rule; throw new Error(`no foe rule ${JSON.stringify(never)}`); }
    }
    const d = hypot(other.centre.x - from.x, other.centre.z - from.z);
    if (foe === null || (foe.out && !other.out) || (foe.out === other.out && d < near)) { foe = other; near = d; }
  }
  return foe;
}

/**
 * **The nearest point of a standing foe's surface** to `from` that `accept` takes, of every
 * segment of every one, with its squared distance; null where there is none.
 */
export function nearestSurface(senses: Senses, from: Vec3, accept: (at: Vec3) => boolean): { readonly at: Vec3; readonly squared: number } | null {
  let best: Vec3 | null = null, nearest = Infinity;
  for (const foe of senses.others) {
    if (foe.out || foe.side === senses.side) continue;
    for (const segment of foe.spec.segments) {
      const at = nearSurface(foe, segment.name, from);
      if (!at || !accept(at)) continue;
      const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2], squared = dx * dx + dy * dy + dz * dz;
      if (squared < nearest) { best = at; nearest = squared; }
    }
  }
  return best ? { at: best, squared: nearest } : null;
}

/** **The way a foe lies**: the heading of its long axis, from its base to its high mark (`BodySpec.marks`), rad about up. */
export function lyingAxis(foe: BodySense): number {
  const h = foe.segments.get(foe.spec.marks.high)!.centre, p = foe.segments.get(foe.spec.marks.base)?.centre ?? foe.centre;
  return atan2(h.x - p.x, h.z - p.z);
}
