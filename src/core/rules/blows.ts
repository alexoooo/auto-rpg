import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { turnOfToRef } from "../control/support.ts";
import { heldFrame } from "../build/rigid.ts";
import { pointsInto } from "./points.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { ContactPair } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { watchTouches, type Part, type Touch, type TouchWatch } from "../touches.ts";
import type { World } from "../world.ts";
import type { Pool, Wound } from "./pool.ts";
import { blowDamage, type Mechanism, type Rulebook } from "./rulebook.ts";
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
 *   pairs of shapes the solver pushed on (`Touch.pairs`), the one it pushed on hardest for a rigid impact, and
 *   whose each shape is (`Rigid.owners`): the segment's own, a natural contact region, or an item it holds, which is one
 *   body with the segment (`BodySpec.held`).
 * - **The two surfaces share the energy by their compliance** (`energyShares`): a segment's
 *   surface is its spec's (`SegmentSpec.surface`), and an item that states none is rigid and takes
 *   none. So a fist takes its part of its own punch, what a club strikes takes the whole blow, and
 *   two items meeting are a clash, in which neither side takes any (`isClash`).
 * - **Its closing speed and its energy** are the touch's (`TouchWatch.priced`) for rigid contacts.
 *   Admitted point layers instead accumulate signed solver reaction work in the world: teeth on
 *   one opposing segment form one episode, priced once at release, retaining every pair's
 *   compliance and point contribution, with unloading subtracted.
 * - **A side's damage** is `blowDamage` of its share of that energy, priced by the opposing
 *   surface: a stated point facing into the contact normal pierces; sides and backs stay blunt.
 *   Neither is a clean sever, so it takes a part off only past empty by the rulebook's margin (`src/core/rules/pool.ts`). Both sides are wounded,
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
  /** The anatomical contact region, where the segment states a separate collider. */
  readonly region?: string;
  /** Absent for blunt contact; a point on the opposing surface prices this wound. */
  readonly mechanism?: Mechanism;
  /** The mass the contact meets on this side, kg. */
  readonly kg: number;
  /** The share of the blow's energy this side took, 0 to 1. */
  readonly share: number;
  /** Hit points, in the rulebook's unit: its share's worth. */
  readonly damage: number;
  /** The point-priced portion of a material episode's damage, before pool limits. */
  readonly pointDamage?: number;
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
  /** Incoming rigid closing speed, or a material episode's peak post-solver closing speed, m/s. */
  readonly closing: number;
  /** J. */
  readonly energy: number;
  /** Dissipated compliant contact work, priced instead of an impact estimate. */
  readonly work?: number;
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
      for (const surface of [segment.spec.surface, ...(segment.spec.contacts ?? []).map(c => c.surface), ...segment.rigid.owners.flatMap((owner) => owner.kind === "held" && owner.held.item.surface ? [owner.held.item.surface] : [])]) {
        if (surface?.stiffness?.unit !== "N/m") throw new Error(`${fighter.id}'s ${segment.spec.name} states no surface in N/m: a blow has nothing to share by`);
        if (surface.point && (surface.point.direction.unit !== "1" || surface.point.alignment.unit !== "1"
          || !surface.point.direction.value.every(Number.isFinite) || !surface.point.direction.value.some(v => v !== 0)
          || !(surface.point.alignment.value >= 0 && surface.point.alignment.value <= 1))) throw new Error("a piercing point states a finite direction and a normal cosine in 0..1");
      }
    }
  }
  /** Whether `part` can meet in a blow: its fighter's fight has not ended and the part is on. */
  const inFight = ({ body, segment }: Part<Fighter>): boolean => body.pool.ending() === null && body.pool.attached(segment.spec.name);
  /** The touched shape's owner, stiffness and optional piercing direction, in the body's reference frame. */
  const surfaceOf = ({ segment }: Part<Fighter>, shape: number): { readonly item: string | null; readonly region?: string; readonly stiffness: number | null; readonly direction?: Vec3; readonly alignment?: number } => {
    const owner = segment.rigid.owners[shape]!;
    switch (owner.kind) {
      case "segment": return { item: null, stiffness: segment.spec.surface.stiffness.value,
        ...(segment.spec.surface.point ? { direction: segment.spec.surface.point.direction.value, alignment: segment.spec.surface.point.alignment.value } : {}) };
      case "region": return { item: null, region: owner.region.name, stiffness: owner.region.surface.stiffness.value,
        ...(owner.region.surface.point ? { direction: owner.region.surface.point.direction.value, alignment: owner.region.surface.point.alignment.value } : {}) };
      case "held": {
        const point = owner.held.item.surface?.point;
        if (!point) return { item: owner.held.item.name, stiffness: owner.held.item.surface?.stiffness.value ?? null };
        const frame = heldFrame(owner.held), v = point.direction.value;
        const direction = [0, 1, 2].map(k => frame.x[k]! * v[0] + frame.y[k]! * v[1] + frame.z[k]! * v[2]) as unknown as Vec3;
        return { item: owner.held.item.name, stiffness: owner.held.item.surface!.stiffness.value, direction, alignment: point.alignment.value };
      }
      default: {
        const never: never = owner;
        throw new Error(`unknown shape owner ${JSON.stringify(never)}`);
      }
    }
  };
  const normal = new Vector3(), inverse = new Quaternion();
  const mechanismOf = (part: Part<Fighter>, surface: ReturnType<typeof surfaceOf>, direction: Vec3, sign: number): Mechanism => {
    if (!surface.direction) return "blunt";
    normal.set(...direction).scaleInPlace(sign)
      .applyRotationQuaternionToRef(Quaternion.InverseToRef(turnOfToRef(part.segment, inverse), inverse), normal);
    return pointsInto(surface.direction, [normal.x, normal.y, normal.z], surface.alignment!) ? "point" : "blunt";
  };
  const parts = new Map(fighters.flatMap(body => [...body.built.segments.values()].map(segment => [segment.body.id, { body, segment }] as const)));
  const land = (first: Part<Fighter>, second: Part<Fighter>, pair: ContactPair, location: Pick<ContactPair, "point" | "normal">, energy: number,
    kg: readonly [number, number], closing: number, work?: number,
    material?: { shares: readonly number[]; damage: readonly number[]; pointDamage: readonly number[] }) => {
    const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)] as const;
    const shares = material?.shares ?? energyShares(surfaces.map(surface => surface.stiffness));
    const mechanisms = work === undefined
      ? [mechanismOf(first, surfaces[0], pair.normal, 1), mechanismOf(second, surfaces[1], pair.normal, -1)] as const
      : [surfaces[0].direction ? "point" : "blunt", surfaces[1].direction ? "point" : "blunt"] as const;
    const side = (part: Part<Fighter>, k: 0 | 1): BlowSide => {
      const name = part.segment.spec.name, share = shares[k]!, mechanism = mechanisms[k === 0 ? 1 : 0], damage = material?.damage[k] ?? (share > 0 ? blowDamage(rules, mechanism, share * energy) : 0);
      const wound = share > 0 ? part.body.pool.wound({ part: name, damage, clean: false }) : null;
      return { fighter: part.body.id, segment: name, item: surfaces[k].item, ...(surfaces[k].region ? { region: surfaces[k].region } : {}),
        ...(mechanism === "blunt" ? {} : { mechanism }), kg: kg[k], share, damage,
        ...(material ? { pointDamage: material.pointDamage[k]! } : {}), wound };
    };
    const blow: LandedBlow = deepFreeze({ time: world.time, point: location.point, normal: location.normal, closing, energy,
      ...(work === undefined ? {} : { work }), sides: [side(first, 0), side(second, 1)] as const });
    blows.push(blow); onBlow?.(blow);
  };
  const physical = world.afterStep(() => {
    for (const episode of world.contactWork.released) {
      const first = parts.get(episode.first), second = parts.get(episode.second), energy = Math.max(0, episode.work);
      if (!first || !second || first.body.side === second.body.side || !inFight(first) || !inFight(second) || !(energy > 0)) continue;
      const absorbed = [[0, 0], [0, 0]], shapes = [episode.mine, episode.theirs], strongest = [-Infinity, -Infinity];
      const pointed = [false, false];
      for (const pair of episode.pairs.values()) {
        const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)], shares = energyShares(surfaces.map(s => s.stiffness));
        for (const k of [0, 1] as const) {
          absorbed[k]![surfaces[1 - k]!.direction ? 1 : 0]! += pair.work * shares[k]!;
          const point = !!surfaces[k]!.direction;
          if (pair.work > 0 && (point && !pointed[k] || point === pointed[k] && pair.work > strongest[k]!)) {
            shapes[k] = k === 0 ? pair.mine : pair.theirs; strongest[k] = pair.work; pointed[k] = point;
          }
        }
      }
      // Unloading credits the episode; clipping cannot increase the energy it prices.
      for (const bins of absorbed) for (let k = 0; k < bins.length; k++) bins[k] = Math.max(0, bins[k]!);
      const total = absorbed[0]![0]! + absorbed[0]![1]! + absorbed[1]![0]! + absorbed[1]![1]!;
      if (!(total > 0)) continue;
      const scale = energy / total;
      const pointDamage = absorbed.map(bins => blowDamage(rules, "point", bins[1]! * scale));
      const damage = absorbed.map((bins, k) => blowDamage(rules, "blunt", bins[0]! * scale) + pointDamage[k]!);
      land(first, second, { mine: shapes[0]!, theirs: shapes[1]!, point: episode.point, normal: episode.normal, impulse: 0 },
        episode, energy, [first.segment.rigid.mass, second.segment.rigid.mass], episode.closing, energy,
        { shares: absorbed.map(bins => (bins[0]! + bins[1]!) / total), damage, pointDamage });
    }
  });
  const touches: TouchWatch<Fighter> = watchTouches(world, fighters, {
    // A touch is read from the earlier of its two: only a fighter with one of another side after it has one to read.
    reads: (fighter: Fighter) => fighters.some((other, k) => k > place.get(fighter)! && other.side !== fighter.side),
    lasts: "pushed",
    // Each pair of bodies is read once, from the one given first; a blow earlier in the step may have ended either's fight.
    counts: (first: Part<Fighter>, second: Part<Fighter> | null) => second !== null && second.body.side !== first.body.side && place.get(second.body)! > place.get(first.body)!
      && inFight(first) && inFight(second),
  }, (touch: Touch<Fighter>) => {
    const first = touch.of, second = touch.on!;
    const key = `${first.segment.body.id}:${second.segment.body.id}`, reverse = `${second.segment.body.id}:${first.segment.body.id}`;
    if (world.contactWork.active.has(key) || world.contactWork.active.has(reverse)) return;
    const { ofKg, onKg, energy } = touches.priced(touch), kg = [ofKg, onKg] as const;
    const pair = strongest(touch.pairs);
    land(first, second, pair, touch, energy, kg, touch.closing);
  });

  const state: BlowState = { touches: touches.state, blows };
  return { state, get blows() { return state.blows; }, dispose() { physical.dispose(); touches.dispose(); } };
}
