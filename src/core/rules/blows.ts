import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { turnOfToRef } from "../control/support.ts";
import { heldFrame } from "../build/rigid.ts";
import { pointsInto } from "./points.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { ContactPair } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { ContactRegionSpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { watchTouches, type Part, type Touch, type TouchWatch } from "../touches.ts";
import type { World } from "../world.ts";
import type { Hold } from "../build/contact-mass.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Pool, Wound } from "./pool.ts";
import { pointLoadDamage, sideDamage, type Mechanism, type Rulebook } from "./rulebook.ts";
import { energyShares } from "./share.ts";

/**
 * Contact injury is physical and has no striker. New closing touches share their impact energy
 * by compliance and are priced by the strongest pair's directed mechanism. Anatomical points
 * instead injure the opposing body under sustained normal load, once per rigid-body pair and
 * interval, with every qualifying shape included. Held points wound only on impact. Sides and
 * reverse contacts remain blunt. A held item intercepts sustained piercing injury.
 */

/** A body in the fight: its side, its pool, and what it was built as. */
export interface Fighter {
  readonly id: string;
  /** Fighters of one side never wound each other. */
  readonly side: string;
  readonly built: BuiltBody;
  readonly pool: Pool;
  /**
   * Its muscles: each freedom holds through a blow with the ceilings they were last given
   * (`holdsOf`). A fighter without them meets every blow with its joints free.
   */
  readonly muscles?: Pick<MuscleDriver, "channels" | "bounds">;
}

/** The freedoms whose muscles `muscles` hold through a contact with, and what each gives toward either sense (`Hold`). */
export function holdsOf(muscles: Pick<MuscleDriver, "channels" | "bounds">): Hold[] {
  return muscles.channels.map((channel, i) => ({ joint: channel.joint, index: channel.index, negative: muscles.bounds.negative[i]!, positive: muscles.bounds.positive[i]! }));
}

/** The stiffness of two surfaces in series, N/m: `Infinity` where both are rigid (null). */
export const seriesStiffness = (stiffness: readonly (number | null)[]): number =>
  1 / stiffness.reduce<number>((sum, k) => sum + (k === null ? 0 : 1 / k), 0);

/** One side of a blow: the surface that met the other's. */
export interface BlowSide {
  readonly fighter: string;
  readonly segment: string;
  /** The held item whose shape was touched, by name; null for the segment's own. */
  readonly item: string | null;
  /** The contact region on the segment or held item, where it states a separate collider. */
  readonly region?: string;
  /** Absent for blunt contact; the opposing surface's aligned mechanism prices this wound. */
  readonly mechanism?: Mechanism;
  /** Effective impact mass, or the contacted rigid mass for a load record, kg. */
  readonly kg: number;
  /** The compliance share of the two surfaces, 0 to 1; load injury uses impulse directly. */
  readonly share: number;
  /** Hit points requested from this physical cause of injury. */
  readonly damage: number;
  /** What it did to this side's pool; null where no wound is requested. */
  readonly wound: Wound | null;
}

/** A blow: two surfaces of two sides' bodies that met, the side built first first. */
interface ContactInjury {
  /** The world's clock when it landed, s. */
  readonly time: number;
  /** Where, world, m, and the normal, out of the first side into the second. */
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly sides: readonly [BlowSide, BlowSide];
}

/** Impact energy and sustained load are separate physical causes of injury. */
export type LandedBlow = ContactInjury & (
  | { readonly kind: "impact"; readonly energy: number; readonly closing: number }
  | { readonly kind: "load"; readonly impulse: readonly [number, number]; readonly seconds: number }
);

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
      for (const surface of [segment.spec.surface, ...(segment.spec.contacts ?? []).map(c => c.surface), ...segment.rigid.owners.flatMap((owner) =>
        owner.kind === "held-region" ? [owner.region.surface] : owner.kind === "held" && owner.held.item.surface ? [owner.held.item.surface] : [])]) {
        if (surface?.stiffness?.unit !== "N/m") throw new Error(`${fighter.id}'s ${segment.spec.name} states no surface in N/m: a blow has nothing to share by`);
        const directed = surface.directed;
        if (directed && ((directed.mechanism !== "point" && directed.mechanism !== "edge")
          || directed.direction.unit !== "1" || directed.alignment.unit !== "1" || directed.direction.value.length !== 3
          || !directed.direction.value.every(Number.isFinite) || !directed.direction.value.some(v => v !== 0)
          || !(directed.alignment.value >= 0 && directed.alignment.value <= 1))) throw new Error("a directed surface states point or edge, a finite direction and a normal cosine in 0..1");
      }
    }
  }
  /** Whether `part` can meet in a blow: its fighter's fight has not ended and the part is on. */
  const inFight = ({ body, segment }: Part<Fighter>): boolean => body.pool.ending() === null && body.pool.attached(segment.spec.name);
  /** The touched shape's owner, stiffness and optional mechanism, in the body's reference frame. */
  const surfaceOf = ({ segment }: Part<Fighter>, shape: number): { readonly item: string | null; readonly region?: string; readonly stiffness: number | null; readonly directed?: { readonly mechanism: "point" | "edge"; readonly direction: Vec3; readonly alignment: number } } => {
    const owner = segment.rigid.owners[shape]!;
    const read = (surface: ContactRegionSpec["surface"] | undefined) => ({ stiffness: surface?.stiffness.value ?? null,
      ...(surface?.directed ? { directed: { mechanism: surface.directed.mechanism, direction: surface.directed.direction.value, alignment: surface.directed.alignment.value } } : {}) });
    switch (owner.kind) {
      case "segment": return { item: null, ...read(segment.spec.surface) };
      case "region": return { item: null, region: owner.region.name, ...read(owner.region.surface) };
      case "held":
      case "held-region": {
        const surface = read(owner.kind === "held" ? owner.held.item.surface : owner.region.surface);
        const result = { item: owner.held.item.name, ...(owner.kind === "held-region" ? { region: owner.region.name } : {}), ...surface };
        if (!surface.directed) return result;
        const frame = heldFrame(owner.held), v = surface.directed.direction;
        const direction = [0, 1, 2].map(k => frame.x[k]! * v[0] + frame.y[k]! * v[1] + frame.z[k]! * v[2]) as unknown as Vec3;
        return { ...result, directed: { ...surface.directed, direction } };
      }
      default: {
        const never: never = owner;
        throw new Error(`unknown shape owner ${JSON.stringify(never)}`);
      }
    }
  };
  const normal = new Vector3(), inverse = new Quaternion();
  const mechanismOf = (part: Part<Fighter>, surface: ReturnType<typeof surfaceOf>, direction: Vec3, sign: number): Mechanism => {
    if (!surface.directed) return "blunt";
    normal.set(...direction).scaleInPlace(sign)
      .applyRotationQuaternionToRef(Quaternion.InverseToRef(turnOfToRef(part.segment, inverse), inverse), normal);
    return pointsInto(surface.directed.direction, [normal.x, normal.y, normal.z], surface.directed.alignment) ? surface.directed.mechanism : "blunt";
  };
  const parts = new Map(fighters.flatMap(body => [...body.built.segments.values()].map(segment => [segment.body.id, { body, segment }] as const)));
  const publish = (blow: LandedBlow) => { deepFreeze(blow); blows.push(blow); onBlow?.(blow); };
  const land = (first: Part<Fighter>, second: Part<Fighter>, pair: ContactPair, location: Pick<ContactPair, "point" | "normal">, energy: number,
    kg: readonly [number, number], closing: number) => {
    const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)] as const;
    const shares = energyShares(surfaces.map(surface => surface.stiffness));
    const mechanisms = [mechanismOf(first, surfaces[0], pair.normal, 1), mechanismOf(second, surfaces[1], pair.normal, -1)] as const;
    const side = (part: Part<Fighter>, k: 0 | 1): BlowSide => {
      const name = part.segment.spec.name, share = shares[k]!, mechanism = mechanisms[k === 0 ? 1 : 0];
      const spared = surfaces[k].item === null && part.segment.spec.handPoses && surfaces[k === 0 ? 1 : 0].item === null ? rules.fist.value : 0;
      const opposing = surfaces[k === 0 ? 1 : 0];
      const loadPoint = mechanism === "point" && opposing.item === null;
      const damage = loadPoint ? 0 : sideDamage(rules, mechanism, energy, share, spared);
      const wound = share > 0 ? part.body.pool.wound({ part: name, damage, clean: false }) : null;
      return { fighter: part.body.id, segment: name, item: surfaces[k].item, ...(surfaces[k].region ? { region: surfaces[k].region } : {}),
        ...(mechanism === "blunt" ? {} : { mechanism }), kg: kg[k], share, damage, wound };
    };
    publish({ kind: "impact", time: world.time, point: location.point, normal: location.normal, closing, energy,
      sides: [side(first, 0), side(second, 1)] });
  };
  const pointed = (part: Part<Fighter>) => part.segment.rigid.owners.some((_, shape) => {
    const surface = surfaceOf(part, shape);
    return surface.item === null && surface.directed?.mechanism === "point";
  });
  const ordered = [...parts.values()], indices = new Map(ordered.map((part, i) => [part.segment.body, i]));
  const points = new Set(ordered.filter(pointed).map(part => part.segment.body));
  const readLoads = () => {
    if (points.size === 0) return;
    for (let i = 0; i < ordered.length; i++) {
      const first = ordered[i]!;
      if (!inFight(first)) continue;
      const contacts = world.physics.contactsOf(first.segment.body, other => other !== null && (indices.get(other) ?? -1) > i
        && (points.has(first.segment.body) || points.has(other)));
      for (const contact of contacts) {
        const second = ordered[indices.get(contact.other!)!]!;
        if (first.body.side === second.body.side || !inFight(first) || !inFight(second)) continue;
        const impulses: [number, number] = [0, 0];
        let selected: ContactPair | null = null;
        for (const pair of contact.pairs) {
          const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)];
          const pierces = [surfaces[0]!.item === null && mechanismOf(first, surfaces[0]!, pair.normal, 1) === "point",
            surfaces[1]!.item === null && mechanismOf(second, surfaces[1]!, pair.normal, -1) === "point"];
          for (const k of [0, 1] as const) if (pierces[1 - k] && surfaces[k]!.item === null && surfaces[k]!.stiffness !== null) {
            impulses[k] += pair.impulse;
            if (!selected || pair.impulse > selected.impulse) selected = pair;
          }
        }
        if (!selected) continue;
        const damage = impulses.map(impulse => pointLoadDamage(rules, impulse, world.dt));
        if (!damage.some(value => value > 0)) continue;
        const pair = selected, surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)];
        const shares = energyShares(surfaces.map(surface => surface.stiffness));
        const side = (part: Part<Fighter>, k: 0 | 1): BlowSide => ({ fighter: part.body.id, segment: part.segment.spec.name,
          item: surfaces[k]!.item, ...(surfaces[k]!.region ? { region: surfaces[k]!.region } : {}),
          ...(impulses[k] > 0 ? { mechanism: "point" as const } : {}), kg: part.segment.rigid.mass, share: shares[k]!, damage: damage[k]!,
          wound: damage[k]! > 0 ? part.body.pool.wound({ part: part.segment.spec.name, damage: damage[k]!, clean: false }) : null });
        publish({ kind: "load", time: world.time, point: pair.point, normal: pair.normal, impulse: impulses, seconds: world.dt,
          sides: [side(first, 0), side(second, 1)] });
      }
    }
  };
  const touches: TouchWatch<Fighter> = watchTouches(world, fighters, {
    // A touch is read from the earlier of its two: only a fighter with one of another side after it has one to read.
    reads: (fighter: Fighter) => fighters.some((other, k) => k > place.get(fighter)! && other.side !== fighter.side),
    lasts: "pushed",
    holds: (fighter: Fighter) => (fighter.muscles ? holdsOf(fighter.muscles) : []),
    // Each pair of bodies is read once, from the one given first; a blow earlier in the step may have ended either's fight.
    counts: (first: Part<Fighter>, second: Part<Fighter> | null) => second !== null && second.body.side !== first.body.side && place.get(second.body)! > place.get(first.body)!
      && inFight(first) && inFight(second),
  }, (touch: Touch<Fighter>) => {
    const first = touch.of, second = touch.on!;
    const pair = strongest(touch.pairs);
    const stiffness = seriesStiffness([surfaceOf(first, pair.mine).stiffness, surfaceOf(second, pair.theirs).stiffness]);
    const { ofKg, onKg, energy } = touches.priced(touch, stiffness), kg = [ofKg, onKg] as const;
    land(first, second, pair, touch, energy, kg, touch.closing);
  });

  const physical = world.afterStep(readLoads);
  const state: BlowState = { touches: touches.state, blows };
  return { state, get blows() { return state.blows; }, dispose() { physical.dispose(); touches.dispose(); } };
}
