import { atan2, hypot } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { nearSurface } from "./openings.ts";
import type { Orders } from "./orders.ts";
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

/** A point of a surface, and its squared distance from where it was sought. */
interface Surface { readonly at: Vec3; readonly squared: number }

/** **The nearest point of `foe`'s surface** to `from` that `accept` takes, of every segment, if nearer than `best`; `best` otherwise. */
export function surfaceOn(foe: BodySense, from: Vec3, accept: (at: Vec3) => boolean, best: Surface | null = null): Surface | null {
  for (const segment of foe.spec.segments) {
    const at = nearSurface(foe, segment.name, from);
    if (!at || !accept(at)) continue;
    const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2], squared = dx * dx + dy * dy + dz * dz;
    if (squared < (best?.squared ?? Infinity)) best = { at, squared };
  }
  return best;
}

/**
 * **The nearest point of a standing foe's surface** to `from` that `accept` takes, of every
 * segment of every one, with its squared distance; null where there is none.
 */
export function nearestSurface(senses: Senses, from: Vec3, accept: (at: Vec3) => boolean): Surface | null {
  let best: Surface | null = null;
  for (const foe of senses.others) if (!foe.out && foe.side !== senses.side) best = surfaceOn(foe, from, accept, best);
  return best;
}

/** A foe's high mark (`BodySpec.marks`): the centre of the part a fighter given the foe attacks. */
export function highMark(foe: BodySense): Vec3 {
  const at = foe.segments.get(foe.spec.marks.high)!.centre;
  return [at.x, at.y, at.z];
}

/**
 * **Orders with their foe found**: where they name a foe (`Orders.foe`), they attack the point
 * `aim` chooses on it as `senses` show it, and nothing where it is not sensed or `aim` finds none.
 */
export function aimedOrders(orders: Orders | null, senses: Senses, aim: (foe: BodySense) => Vec3 | null): Orders | null {
  if (orders?.foe === undefined) return orders;
  const foe = senses.others.find((other) => other.id === orders.foe);
  return { move: orders.move, face: orders.face, attack: foe ? aim(foe) : null };
}

/** **The way a foe lies**: the heading of its long axis, from its base to its high mark (`BodySpec.marks`), rad about up. */
export function lyingAxis(foe: BodySense): number {
  const h = foe.segments.get(foe.spec.marks.high)!.centre, p = foe.segments.get(foe.spec.marks.base)?.centre ?? foe.centre;
  return atan2(h.x - p.x, h.z - p.z);
}
