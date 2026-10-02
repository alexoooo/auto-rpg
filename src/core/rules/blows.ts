import type { BuiltBody } from "../build/build-body.ts";
import type { ContactPair } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { watchTouches, type Part, type Touch, type TouchWatch } from "../touches.ts";
import type { World } from "../world.ts";
import type { Pool, Wound } from "./pool.ts";
import { blowDamage, type Rulebook } from "./rulebook.ts";
import { energyShares } from "./share.ts";

/**
 * **Blows between bodies**: what the Crypt and the Arena wound with. A blow has no striker. It is
 * a new touch (`watchTouches`, `src/core/touches.ts`) of any two segments of two sides' fighters,
 * lasting while the solver pushes on it: a hand pressed against a body lands once. Two bodies
 * that touch are read once, from the one of the fighter the watch was given first, so only a
 * body with a fighter of another side after its own has its contacts read.
 *
 * - **A blow has two sides** (`BlowSide`): the surfaces that met, the first built first, each
 *   with the share of the blow's energy it took. Which surfaces is the engine's reading: of the
 *   pairs of shapes the solver pushed on (`Touch.pairs`), the one it pushed on hardest, and
 *   whose each shape is (`Rigid.owners`): the segment's own, or an item it holds, which is one
 *   body with the segment (`BodySpec.held`).
 * - **The two surfaces share the energy by their compliance** (`energyShares`): a segment's
 *   surface is its spec's (`SegmentSpec.surface`), and an item that states none is rigid and takes
 *   none. So a fist takes its part of its own punch, what a club strikes takes the whole blow, and
 *   two items meeting are a clash, in which neither side takes any (`isClash`).
 * - **Its closing speed and its energy** are the touch's (`TouchWatch.priced`).
 * - **A side's damage** is `blowDamage` of its share of that energy. Every blow is blunt until
 *   the weapons that cut and pierce come, and a blunt blow is never clean, so it takes a part off
 *   only past empty by the rulebook's margin (`src/core/rules/pool.ts`). Both sides are wounded,
 *   the first then the second, even where the first's wound ends its fight: a blow is one event.
 * - A fighter whose pool has ended, and a part that has come off, neither wounds nor is wounded.
 */

/** A body in the fight: its side, its pool, and what it was built as. */
export interface Fighter {
  readonly id: string;
  /** Fighters of one side never wound each other. */
  readonly side: string;
  readonly built: BuiltBody;
  readonly pool: Pool;
}

/** One side of a blow: the surface that met the other's. */
export interface BlowSide {
  readonly fighter: string;
  readonly segment: string;
  /** The held item whose shape was touched, by name; null for the segment's own. */
  readonly item: string | null;
  /** The mass the contact meets on this side, kg. */
  readonly kg: number;
  /** The share of the blow's energy this side took, 0 to 1. */
  readonly share: number;
  /** Hit points, in the rulebook's unit: its share's worth. */
  readonly damage: number;
  /** What it did to this side's pool; null where it took no share. */
  readonly wound: Wound | null;
}

/** A blow: two surfaces of two sides' bodies that met, the side built first first. */
export interface LandedBlow {
  /** The world's clock when it landed, s. */
  readonly time: number;
  /** Where, world, m, and the normal, out of the first side into the second. */
  readonly point: Vec3;
  readonly normal: Vec3;
  /** The closing speed along the normal, m/s. */
  readonly closing: number;
  /** J. */
  readonly energy: number;
  readonly sides: readonly [BlowSide, BlowSide];
}

/** Whether `blow` wounded nobody: neither side took a share. */
export const isClash = (blow: LandedBlow): boolean => blow.sides.every((side) => side.share === 0);

/** The sides `blow` wounded. */
export const woundedIn = (blow: LandedBlow): readonly (BlowSide & { readonly wound: Wound })[] =>
  blow.sides.filter((side): side is BlowSide & { readonly wound: Wound } => side.wound !== null);

/** The pair of `pairs` the solver pushed on hardest, the first of equals: the surfaces a blow is read from. */
function strongest(pairs: readonly ContactPair[]): ContactPair {
  let best = pairs[0]!;
  for (const pair of pairs) if (pair.impulse > best.impulse) best = pair;
  return best;
}

export interface BlowWatch {
  /**
   * Every blow and clash so far, in the order they landed: the state's list. A blow is frozen as
   * it lands, so one a listener was handed is a record no load writes into.
   */
  readonly blows: readonly LandedBlow[];
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  dispose(): void;
}

/** **What a blow watch remembers.** */
interface BlowState {
  /** Its touch watch's memory: the touches under way, and each body as the last step left it. */
  readonly touches: object;
  readonly blows: LandedBlow[];
}

/**
 * Read the blows among `fighters` in `world` under `rules`; `onBlow` hears each as it lands. A
 * fighter with a segment that states no surface, or one not in N/m, is refused.
 */
export function watchBlows(world: World, fighters: readonly Fighter[], rules: Rulebook, onBlow?: (blow: LandedBlow) => void): BlowWatch {
  const blows: LandedBlow[] = [];
  const place = new Map(fighters.map((fighter, at) => [fighter, at]));
  for (const fighter of fighters) {
    for (const segment of fighter.built.segments.values()) {
      for (const surface of [segment.spec.surface, ...segment.rigid.owners.flatMap((owner) => owner.kind === "held" && owner.held.item.surface ? [owner.held.item.surface] : [])]) {
        if (surface?.stiffness?.unit !== "N/m") throw new Error(`${fighter.id}'s ${segment.spec.name} states no surface in N/m: a blow has nothing to share by`);
      }
    }
  }
  /** Whether `part` can meet in a blow: its fighter's fight has not ended and the part is on. */
  const inFight = ({ body, segment }: Part<Fighter>): boolean => body.pool.ending() === null && body.pool.attached(segment.spec.name);
  /** Whose `part`'s shape `shape` is: the held item's name, or null for the segment's own; and its stiffness, N/m, null where rigid. */
  const surfaceOf = ({ segment }: Part<Fighter>, shape: number): { readonly item: string | null; readonly stiffness: number | null } => {
    const owner = segment.rigid.owners[shape]!;
    switch (owner.kind) {
      case "segment": return { item: null, stiffness: segment.spec.surface.stiffness.value };
      case "held": return { item: owner.held.item.name, stiffness: owner.held.item.surface?.stiffness.value ?? null };
      default: {
        const never: never = owner;
        throw new Error(`unknown shape owner ${JSON.stringify(never)}`);
      }
    }
  };
  const touches: TouchWatch<Fighter> = watchTouches(world, fighters, {
    // A touch is read from the earlier of its two: only a fighter with one of another side after it has one to read.
    reads: (fighter) => fighters.some((other, k) => k > place.get(fighter)! && other.side !== fighter.side),
    lasts: "pushed",
    // Each pair of bodies is read once, from the one given first; a blow earlier in the step may have ended either's fight.
    counts: (first, second) => second !== null && second.body.side !== first.body.side && place.get(second.body)! > place.get(first.body)!
      && inFight(first) && inFight(second),
  }, (touch: Touch<Fighter>) => {
    const first = touch.of, second = touch.on!;
    const { ofKg, onKg, energy } = touches.priced(touch), kg = [ofKg, onKg] as const;
    const pair = strongest(touch.pairs);
    const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)] as const;
    const shares = energyShares(surfaces.map((surface) => surface.stiffness));
    const side = (part: Part<Fighter>, k: 0 | 1): BlowSide => {
      const name = part.segment.spec.name, share = shares[k]!, damage = share > 0 ? blowDamage(rules, "blunt", share * energy) : 0;
      const wound = share > 0 ? part.body.pool.wound({ part: name, damage, clean: false }) : null;
      return { fighter: part.body.id, segment: name, item: surfaces[k].item, kg: kg[k], share, damage, wound };
    };
    // The touch names the fighters, which are no record: the blow takes its numbers and their names.
    const blow: LandedBlow = deepFreeze({
      time: touch.time, point: touch.point, normal: touch.normal, closing: touch.closing, energy,
      sides: [side(first, 0), side(second, 1)] as const,
    });
    blows.push(blow);
    onBlow?.(blow);
  });
  const state: BlowState = { touches: touches.state, blows };
  return { state, get blows() { return state.blows; }, dispose: () => touches.dispose() };
}
