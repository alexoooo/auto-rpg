import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { contactMass, type ContactMass } from "../build/contact-mass.ts";
import type { ContactPair, SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { impactEnergy } from "./impact.ts";
import type { Pool, Wound } from "./pool.ts";
import { blowDamage, type Rulebook } from "./rulebook.ts";
import { energyShares } from "./share.ts";

/**
 * **Blows between bodies, read from the engine's contacts**: what the Crypt and the Arena wound
 * with. A blow has no striker. After every step (`World.afterStep`), any two segments of two
 * sides' fighters that the solver pushed on each other (`PhysicsWorld.contactsOf`) have met in a
 * blow, unless the two were already touching the step before: a hand pressed against a body lands
 * once. Two bodies that touch are read once, from the one of the fighter the watch was given
 * first, so only a body with a fighter of another side after its own has its contacts read.
 *
 * - **A blow has two sides** (`BlowSide`): the surfaces that met, the first built first, each
 *   with the share of the blow's energy it took. Which surfaces is the engine's reading: of the
 *   pairs of shapes that touched (`Contact.pairs`), the one the solver pushed on hardest, and
 *   whose each shape is (`Rigid.owners`): the segment's own, or an item it holds, which is one
 *   body with the segment (`BodySpec.held`).
 * - **The two surfaces share the energy by their compliance** (`energyShares`): a segment's
 *   surface is its spec's (`SegmentSpec.surface`), and an item that states none is rigid and takes
 *   none. So a fist takes its part of its own punch, what a club strikes takes the whole blow, and
 *   two items meeting are a clash, in which neither side takes any (`isClash`).
 * - **The closing speed** is the two points' velocities along the contact's normal, from the
 *   bodies' velocities as the step before left them: the step a blow lands in has already met it.
 *   A touch that was not closing lands nothing.
 * - **Its energy** is `impactEnergy` of the masses the contact meets on each side (`contactMass`,
 *   joints free and each body floating), as the club's best blow was read
 *   (`src/lab/club-blow.ts`).
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

interface Owned {
  /** Its place among the watch's bodies: its key in a touch, and its place in `BlowState.last`. */
  readonly key: number;
  readonly fighter: Fighter;
  /** Whether a fighter of another side was given after its own: a touch is read from the earlier of its two, so only then has it one to read. */
  readonly reads: boolean;
  readonly segment: BuiltSegment;
  readonly masses: ContactMass;
  /** The centre of mass in the segment's own frame. */
  readonly local: Vector3;
}

/** **What a blow watch remembers.** */
interface BlowState {
  /** The touches of the last step, the two bodies' keys, the lesser first: one still touching lands nothing. */
  touching: Set<string>;
  readonly blows: LandedBlow[];
  /** Each body's velocities and centre as the last step left them, in the bodies' order. */
  readonly last: { readonly velocity: Vector3; readonly spin: Vector3; readonly centre: Vector3 }[];
}

/**
 * Read the blows among `fighters` in `world` under `rules`; `onBlow` hears each as it lands. A
 * fighter with a segment that states no surface, or one not in N/m, is refused.
 */
export function watchBlows(world: World, fighters: readonly Fighter[], rules: Rulebook, onBlow?: (blow: LandedBlow) => void): BlowWatch {
  const owners = new Map<SegmentBody, Owned>();
  const state: BlowState = { touching: new Set(), blows: [], last: [] };
  fighters.forEach((fighter, at) => {
    const masses = contactMass(fighter.built), reads = fighters.some((other, k) => k > at && other.side !== fighter.side);
    for (const segment of fighter.built.segments.values()) {
      if (owners.has(segment.body)) throw new Error(`${fighter.id}'s ${segment.spec.name} is another fighter's body`);
      for (const surface of [segment.spec.surface, ...segment.rigid.owners.flatMap((owner) => owner.kind === "held" && owner.held.item.surface ? [owner.held.item.surface] : [])]) {
        if (surface?.stiffness?.unit !== "N/m") throw new Error(`${fighter.id}'s ${segment.spec.name} states no surface in N/m: a blow has nothing to share by`);
      }
      const { origin, x, y, z } = segment.frame, c = segment.rigid.centre, d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
      const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]) as [number, number, number]);
      owners.set(segment.body, { key: state.last.length, fighter, reads, segment, masses, local });
      state.last.push({ velocity: new Vector3(), spin: new Vector3(), centre: new Vector3() });
    }
  });
  const remember = () => {
    for (const owned of owners.values()) {
      const { segment } = owned, last = state.last[owned.key]!;
      segment.body.linearVelocityToRef(last.velocity);
      segment.body.angularVelocityToRef(last.spin);
      owned.local.applyRotationQuaternionToRef(segment.node.rotationQuaternion!, last.centre).addInPlace(segment.node.position);
    }
  };
  remember();
  /** Whether `owned` can meet in a blow: its fighter's fight has not ended and the part is on. */
  const inFight = (owned: Owned): boolean => owned.fighter.pool.ending() === null && owned.fighter.pool.attached(owned.segment.spec.name);
  /** Whose `owned`'s shape `shape` is: the held item's name, or null for the segment's own; and its stiffness, N/m, null where rigid. */
  const surfaceOf = (owned: Owned, shape: number): { readonly item: string | null; readonly stiffness: number | null } => {
    const owner = owned.segment.rigid.owners[shape]!;
    switch (owner.kind) {
      case "segment": return { item: null, stiffness: owned.segment.spec.surface.stiffness.value };
      case "held": return { item: owner.held.item.name, stiffness: owner.held.item.surface?.stiffness.value ?? null };
      default: {
        const never: never = owner;
        throw new Error(`unknown shape owner ${JSON.stringify(never)}`);
      }
    }
  };
  /** The velocity of `owned`'s body at `point` as the last step left it. */
  const velocityAt = (owned: Owned, point: Vector3): Vector3 => {
    const last = state.last[owned.key]!;
    return last.velocity.add(Vector3.Cross(last.spin, point.subtract(last.centre)));
  };

  const hook = world.afterStep(() => {
    const now = new Set<string>();
    for (const first of owners.values()) {
      if (!first.reads || !inFight(first)) continue;
      for (const contact of world.physics.contactsOf(first.segment.body)) {
        const second = owners.get(contact.other);
        // Each pair of bodies is read once, from the one given first.
        if (!second || second.key < first.key || second.fighter.side === first.fighter.side) continue;
        // A blow earlier in this step may have ended either's fight.
        if (!inFight(first) || !inFight(second)) continue;
        const key = `${first.key}:${second.key}`;
        now.add(key);
        if (state.touching.has(key)) continue;
        const point = new Vector3(...contact.point), normal = new Vector3(...contact.normal);
        const closing = Vector3.Dot(velocityAt(first, point).subtract(velocityAt(second, point)), normal);
        // A touch that was not closing is no blow: a hand laid on, or brushing past.
        if (!(closing > 0)) continue;
        first.masses.update();
        second.masses.update();
        const kg = [first.masses.along(first.segment, contact.point, contact.normal), second.masses.along(second.segment, contact.point, contact.normal)] as const;
        const energy = impactEnergy(kg[0], kg[1], closing);
        const pair = strongest(contact.pairs);
        const surfaces = [surfaceOf(first, pair.mine), surfaceOf(second, pair.theirs)] as const;
        const shares = energyShares(surfaces.map((surface) => surface.stiffness));
        const side = (owned: Owned, k: 0 | 1): BlowSide => {
          const part = owned.segment.spec.name, share = shares[k]!, damage = share > 0 ? blowDamage(rules, "blunt", share * energy) : 0;
          const wound = share > 0 ? owned.fighter.pool.wound({ part, damage, clean: false }) : null;
          return { fighter: owned.fighter.id, segment: part, item: surfaces[k].item, kg: kg[k], share, damage, wound };
        };
        const blow: LandedBlow = deepFreeze({
          time: world.time, point: contact.point, normal: contact.normal, closing, energy,
          sides: [side(first, 0), side(second, 1)] as const,
        });
        state.blows.push(blow);
        onBlow?.(blow);
      }
    }
    state.touching = now;
    remember();
  });
  return { state, get blows() { return state.blows; }, dispose: () => hook.dispose() };
}
