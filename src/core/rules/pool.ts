import type { BodySpec, ShapeSpec } from "../spec/body.ts";
import { cbrt, square } from "../math/real.ts";
import { derive, type Quantity, type Vec3 } from "../spec/quantity.ts";
import type { Rulebook } from "./rulebook.ts";

/**
 * **One pool of hit points per body** (the owner's decision, `owner-hp-pool` in
 * `src/core/sources.ts`), spread over its segments, which are its parts.
 *
 * - **A part's share** is its cross-section's (`owner-part-hp-split`): its mass to the
 *   two-thirds, over the sum of the same over the body, times the body's hit points
 *   (`partHitPoints`). The two-thirds power is the square of the cube root, which every
 *   JavaScript engine computes alike, where a power is each engine's own. For the Warrior's 6: head 0.45, upper trunk 0.78, thigh 0.72, forearm 0.17,
 *   hand 0.09.
 * - **A blow** lands on one part, which absorbs at most what it has left.
 * - **It takes the part off** if it empties it and was clean (the weapon's bar, which the scoring
 *   decides), or went on past empty by the rulebook's `severMargin` of the part's full hit
 *   points, whatever it was. A part the spec names `whole` never comes off. What comes off takes
 *   every part beyond it, and the hit points they hold leave the pool with them.
 * - **A contained wound** (a point's) stays in the struck part: what the part has not left is
 *   dropped, and the part stays on.
 * - **The excess walks the attached parts** from the struck part, nearest first and, at each
 *   part, inward before outward: its parent, then its children in the spec's order. Each absorbs
 *   what it has left, and an empty part passes the rest on. Only the struck part can come off.
 * - **The body dies** when a vital part (its head) comes off -- ending `severed` -- or when the
 *   attached parts hold nothing -- `exhausted` -- or when a vital part is emptied with hit points
 *   left elsewhere -- `fatal`. A blow that spends the whole pool empties the head with it, and
 *   reads `exhausted`, not `fatal`. The first ending stands.
 *
 * The bar a page shows is the attached hit points over the parts' full ones, summed as the attached
 * are: a whole body's is 1 exactly, so two whole bodies are even.
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
  /** A wound that stays in the struck part (a point's, `pointWound`): it takes no more than the part has, never takes it off, and does not walk. */
  readonly contained?: true;
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
  /** The attached hit points over every part's full ones: 1 whole, 0 spent. */
  bar(): number;
  ending(): Ending | null;
  wound(blow: Blow): Wound;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
}

/** **What a pool remembers**: each part's hit points, the parts still attached, and how the fight ended, once it has. */
interface PoolState {
  readonly hp: Map<string, number>;
  readonly attached: Set<string>;
  ending: Ending | null;
}

/** Each segment's full hit points: its cross-section's share of the body's. */
export function partHitPoints(spec: BodySpec): ReadonlyMap<string, Quantity<number>> {
  const masses = spec.segments.map((segment) => segment.mass);
  return new Map(spec.segments.map((segment) => [segment.name,
    derive("HP", "a part's hit points: the body's, times its mass to the two-thirds over the sum of the same over the body",
      [spec.wounds.hp, segment.mass, ...masses],
      (hp, own, ...all) => hp * square(cbrt(own)) / all.reduce((sum, m) => sum + square(cbrt(m)), 0))]));
}

/** Power iterations that settle a 3 by 3 covariance's leading axis (`leastWidth`). */
const ITERATIONS = 64;

/** The unit axis `matrix` (3 by 3, symmetric, row-major) stretches most, by power iteration from its largest column; null where it stretches none. */
function leadingAxis(matrix: readonly number[]): Vec3 | null {
  let best = -1, v: number[] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const column = [matrix[c]!, matrix[3 + c]!, matrix[6 + c]!], n = column[0]! * column[0]! + column[1]! * column[1]! + column[2]! * column[2]!;
    if (n > best) { best = n; v = column; }
  }
  if (!(best > 0)) return null;
  for (let i = 0; i < ITERATIONS; i++) {
    const w = [0, 1, 2].map((r) => matrix[3 * r]! * v[0]! + matrix[3 * r + 1]! * v[1]! + matrix[3 * r + 2]! * v[2]!);
    const n = Math.sqrt(w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]!);
    if (!(n > 0)) break;
    v = w.map((x) => x / n);
  }
  const n = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n];
}

/**
 * **A shape's least width**, m: a capsule's or a sphere's diameter, a box's least side, and a
 * hull's extent along the axis its points spread along least (the third of their covariance's
 * principal axes, normal to the first two); a hull of points on a line or one point has none.
 */
export function leastWidth(shape: ShapeSpec): number {
  switch (shape.kind) {
    case "capsule": case "sphere": return 2 * shape.radius.value;
    case "box": return Math.min(...shape.size.value);
    case "hull": {
      const points = shape.points.map((p) => p.value), mean = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k]!, 0) / points.length);
      const covariance = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => points.reduce((sum, p) => sum + (p[r]! - mean[r]!) * (p[c]! - mean[c]!), 0)));
      const first = leadingAxis(covariance);
      if (!first) return 0;
      const spread = [0, 1, 2].reduce((sum, k) => sum + first[k]! * [0, 1, 2].reduce((t, j) => t + covariance[3 * k + j]! * first[j]!, 0), 0);
      const deflated = covariance.map((x, i) => x - spread * first[Math.floor(i / 3)]! * first[i % 3]!);
      const second = leadingAxis(deflated);
      if (!second) return 0;
      const third = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
      const n = Math.sqrt(third[0]! * third[0]! + third[1]! * third[1]! + third[2]! * third[2]!);
      const along = points.map((p) => (p[0] * third[0]! + p[1] * third[1]! + p[2] * third[2]!) / n);
      return Math.max(...along) - Math.min(...along);
    }
    default: { const never: never = shape; throw new Error(`no width for ${JSON.stringify(never)}`); }
  }
}

/** **Each segment's thickness**, m: its collider's least width (`leastWidth`), how deep a point goes through it (`pointWound`). */
export function partThickness(spec: BodySpec): ReadonlyMap<string, Quantity<number>> {
  return new Map(spec.segments.map((segment) => {
    const shape = segment.shape, inputs: readonly Quantity[] = shape.kind === "hull" ? shape.points : shape.kind === "box" ? [shape.size] : [shape.radius];
    return [segment.name, derive("m", "a part's thickness: its collider's least width", inputs, () => leastWidth(shape))];
  }));
}

/** A fresh pool for a body built from `spec`, under `rules`. */
export function createPool(spec: BodySpec, rules: Rulebook): Pool {
  const shares = partHitPoints(spec);
  const names = spec.segments.map((segment) => segment.name);
  const max = new Map([...shares].map(([name, q]) => [name, q.value]));
  const state: PoolState = { hp: new Map(max), attached: new Set(names), ending: null };
  const parent = new Map<string, string>(), children = new Map<string, string[]>(names.map((name) => [name, []]));
  for (const joint of spec.joints) {
    parent.set(joint.child, joint.parent);
    children.get(joint.parent)!.push(joint.child);
  }
  const vital = spec.wounds.vital, whole = new Set(spec.wounds.whole);
  for (const name of [...vital, ...whole]) if (!max.has(name)) throw new Error(`${spec.model} has no segment ${name} to wound`);
  const total = spec.wounds.hp.value;
  // Sums of the parts' shares differ from the total in the last bit; below this the pool is empty.
  const empty = total * Number.EPSILON * names.length;
  /** Every part's full hit points, summed as `attachedHp` sums: the total, but for its last bit. */
  const full = names.reduce((sum, name) => sum + max.get(name)!, 0);

  const part = (name: string): string => {
    if (!max.has(name)) throw new Error(`${spec.model} has no part ${name}`);
    return name;
  };
  const attachedHp = (): number => names.reduce((sum, name) => sum + (state.attached.has(name) ? state.hp.get(name)! : 0), 0);
  /** `name` and every attached part beyond it, outward. */
  const beyond = (name: string): string[] => [name, ...children.get(name)!.filter((c) => state.attached.has(c)).flatMap(beyond)];
  /** The attached parts from `from` outward, nearest first; at each, its parent before its children. */
  const walk = (from: string): string[] => {
    const order: string[] = [], seen = new Set([from]), queue = [from];
    while (queue.length) {
      const at = queue.shift()!, up = parent.get(at);
      for (const next of [...(up === undefined ? [] : [up]), ...children.get(at)!]) {
        if (seen.has(next) || !state.attached.has(next)) continue;
        seen.add(next);
        order.push(next);
        queue.push(next);
      }
    }
    return order;
  };
  const judge = (): Ending | null => {
    if (vital.some((name) => !state.attached.has(name))) return "severed";
    if (attachedHp() <= empty) return "exhausted";
    return vital.some((name) => state.hp.get(name)! <= empty) ? "fatal" : null;
  };

  return {
    total, state,
    max: (name) => max.get(part(name))!,
    hp: (name) => state.hp.get(part(name))!,
    attached: (name) => state.attached.has(part(name)),
    attachedHp,
    bar: () => attachedHp() / full,
    ending: () => state.ending,
    wound({ part: struck, damage, clean, contained }) {
      part(struck);
      if (!state.attached.has(struck) || !(damage > 0)) return { taken: [], severed: [], lost: 0, spent: 0, ending: state.ending };
      const taken: { part: string; hp: number }[] = [];
      const absorb = (name: string, arriving: number): number => {
        // A part left holding no more than the pool's rounding is empty.
        const has = state.hp.get(name)!, take = has - arriving <= empty ? has : arriving;
        if (take > 0) {
          state.hp.set(name, has - take);
          taken.push({ part: name, hp: take });
        }
        return arriving - take;
      };
      const had = state.hp.get(struck)!;
      let excess = absorb(struck, damage);
      let severed: string[] = [], lost = 0;
      const emptied = state.hp.get(struck)! <= empty;
      if (contained) excess = 0;
      else if (emptied && !whole.has(struck) && (clean || damage - had >= rules.severMargin.value * max.get(struck)!)) {
        severed = beyond(struck);
        for (const name of severed) {
          lost += state.hp.get(name)!;
          state.attached.delete(name);
        }
      }
      for (const name of walk(struck)) {
        if (!(excess > 0)) break;
        excess = absorb(name, excess);
      }
      state.ending ??= judge();
      return { taken, severed, lost, spent: Math.max(0, excess), ending: state.ending };
    },
  };
}
