import type { BodySpec } from "../spec/body.ts";
import { derive, type Quantity } from "../spec/quantity.ts";
import type { Rulebook } from "./rulebook.ts";

/**
 * **One pool of hit points per body** (the owner's decision, `owner-hp-pool` in
 * `src/core/sources.ts`), spread over its segments, which are its parts.
 *
 * - **A part's share** is its cross-section's (`owner-part-hp-split`): its mass to the
 *   two-thirds, over the sum of the same over the body, times the body's hit points
 *   (`partHitPoints`). For the Warrior's 6: head 0.45, upper trunk 0.78, thigh 0.72, forearm 0.17,
 *   hand 0.09.
 * - **A blow** lands on one part, which absorbs at most what it has left.
 * - **It takes the part off** if it empties it and was clean (the weapon's bar, which the scoring
 *   decides), or went on past empty by the rulebook's `severMargin` of the part's full hit
 *   points, whatever it was. A part the spec names `whole` never comes off. What comes off takes
 *   every part beyond it, and the hit points they hold leave the pool with them.
 * - **The excess walks the attached parts** from the struck part, nearest first and, at each
 *   part, inward before outward: its parent, then its children in the spec's order. Each absorbs
 *   what it has left, and an empty part passes the rest on. Only the struck part can come off.
 * - **The body dies** when a vital part (its head) comes off -- ending `severed` -- or when the
 *   attached parts hold nothing -- `exhausted` -- or when a vital part is emptied with hit points
 *   left elsewhere -- `fatal`. A blow that spends the whole pool empties the head with it, and
 *   reads `exhausted`, not `fatal`. The first ending stands.
 *
 * The bar a page shows is the attached hit points over the body's.
 */

/**
 * How a fight ends: a vital part emptied (`fatal`) or taken off (`severed`), the pool emptied
 * (`exhausted`), or the clock (`time`, the bout's to say).
 */
export type Ending = "fatal" | "severed" | "exhausted" | "time";

interface Blow {
  /** The segment struck. */
  readonly part: string;
  /** Hit points the blow does, in the rulebook's unit. */
  readonly damage: number;
  /** Whether it clears its weapon's bar, so that it takes off a part it empties. */
  readonly clean: boolean;
}

/** What one blow did. */
export interface Wound {
  /** Hit points each part lost to it, in the order the blow reached them. */
  readonly taken: readonly { readonly part: string; readonly hp: number }[];
  /** The part it took off, then every part that went with it; empty if none came off. */
  readonly severed: readonly string[];
  /** Hit points that left the pool with the parts it took off. */
  readonly lost: number;
  /** Damage left over with every attached part empty. */
  readonly spent: number;
  /** How the fight ended, if it has; the first ending stands. */
  readonly ending: Ending | null;
}

export interface Pool {
  /** The body's hit points. */
  readonly total: number;
  max(part: string): number;
  hp(part: string): number;
  attached(part: string): boolean;
  /** Hit points in the parts still attached. */
  attachedHp(): number;
  /** The attached hit points over the body's: 1 whole, 0 spent. */
  bar(): number;
  ending(): Ending | null;
  wound(blow: Blow): Wound;
}

/** Each segment's full hit points: its cross-section's share of the body's. */
export function partHitPoints(spec: BodySpec): ReadonlyMap<string, Quantity<number>> {
  const masses = spec.segments.map((segment) => segment.mass);
  return new Map(spec.segments.map((segment) => [segment.name,
    derive("HP", "a part's hit points: the body's, times its mass to the two-thirds over the sum of the same over the body",
      [spec.wounds.hp, segment.mass, ...masses],
      (hp, own, ...all) => hp * own ** (2 / 3) / all.reduce((sum, m) => sum + m ** (2 / 3), 0))]));
}

/** A fresh pool for a body built from `spec`, under `rules`. */
export function createPool(spec: BodySpec, rules: Rulebook): Pool {
  const shares = partHitPoints(spec);
  const names = spec.segments.map((segment) => segment.name);
  const max = new Map([...shares].map(([name, q]) => [name, q.value]));
  const hp = new Map(max);
  const attached = new Set(names);
  const parent = new Map<string, string>(), children = new Map<string, string[]>(names.map((name) => [name, []]));
  for (const joint of spec.joints) {
    parent.set(joint.child, joint.parent);
    children.get(joint.parent)!.push(joint.child);
  }
  const vital = spec.wounds.vital, whole = new Set(spec.wounds.whole);
  for (const name of [...vital, ...whole]) if (!attached.has(name)) throw new Error(`${spec.model} has no segment ${name} to wound`);
  const total = spec.wounds.hp.value;
  // Sums of the parts' shares differ from the total in the last bit; below this the pool is empty.
  const empty = total * Number.EPSILON * names.length;
  let ending: Ending | null = null;

  const part = (name: string): string => {
    if (!max.has(name)) throw new Error(`${spec.model} has no part ${name}`);
    return name;
  };
  const attachedHp = (): number => names.reduce((sum, name) => sum + (attached.has(name) ? hp.get(name)! : 0), 0);
  /** `name` and every attached part beyond it, outward. */
  const beyond = (name: string): string[] => [name, ...children.get(name)!.filter((c) => attached.has(c)).flatMap(beyond)];
  /** The attached parts from `from` outward, nearest first; at each, its parent before its children. */
  const walk = (from: string): string[] => {
    const order: string[] = [], seen = new Set([from]), queue = [from];
    while (queue.length) {
      const at = queue.shift()!, up = parent.get(at);
      for (const next of [...(up === undefined ? [] : [up]), ...children.get(at)!]) {
        if (seen.has(next) || !attached.has(next)) continue;
        seen.add(next);
        order.push(next);
        queue.push(next);
      }
    }
    return order;
  };
  const judge = (): Ending | null => {
    if (vital.some((name) => !attached.has(name))) return "severed";
    if (attachedHp() <= empty) return "exhausted";
    return vital.some((name) => hp.get(name)! <= empty) ? "fatal" : null;
  };

  return {
    total,
    max: (name) => max.get(part(name))!,
    hp: (name) => hp.get(part(name))!,
    attached: (name) => attached.has(part(name)),
    attachedHp,
    bar: () => attachedHp() / total,
    ending: () => ending,
    wound({ part: struck, damage, clean }) {
      part(struck);
      if (!attached.has(struck) || !(damage > 0)) return { taken: [], severed: [], lost: 0, spent: 0, ending };
      const taken: { part: string; hp: number }[] = [];
      const absorb = (name: string, arriving: number): number => {
        // A part left holding no more than the pool's rounding is empty.
        const has = hp.get(name)!, take = has - arriving <= empty ? has : arriving;
        if (take > 0) {
          hp.set(name, has - take);
          taken.push({ part: name, hp: take });
        }
        return arriving - take;
      };
      const had = hp.get(struck)!;
      let excess = absorb(struck, damage);
      let severed: string[] = [], lost = 0;
      const emptied = hp.get(struck)! <= empty;
      if (emptied && !whole.has(struck) && (clean || damage - had >= rules.severMargin.value * max.get(struck)!)) {
        severed = beyond(struck);
        for (const name of severed) {
          lost += hp.get(name)!;
          attached.delete(name);
        }
      }
      for (const name of walk(struck)) {
        if (!(excess > 0)) break;
        excess = absorb(name, excess);
      }
      ending ??= judge();
      return { taken, severed, lost, spent: Math.max(0, excess), ending };
    },
  };
}
