import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { contactMass, type ContactMass } from "../build/contact-mass.ts";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { impactEnergy } from "./impact.ts";
import type { Pool, Wound } from "./pool.ts";
import { blowDamage, type Rulebook } from "./rulebook.ts";

/**
 * **Blows between bodies, read from the engine's contacts**: what the Crypt and the Arena wound
 * with. After every step (`World.afterStep`), each striker of a standing fighter that the solver
 * pushed on another side's fighter (`PhysicsWorld.contactsOf`) has landed a blow there, unless the
 * two were already touching the step before: a hand pressed against a body lands once.
 *
 * - **The strikers are the hands** (`STRIKERS`), with whatever they hold, which is one body with
 *   the hand (`BodySpec.held`). A hand meeting a hand is a clash, and wounds neither.
 * - **The closing speed** is the two points' velocities along the contact's normal, from the
 *   bodies' velocities as the step before left them: the step a blow lands in has already met it.
 *   A touch that was not closing lands nothing.
 * - **Its energy** is `impactEnergy` of the masses the contact meets on each side (`contactMass`,
 *   joints free and each body floating), as the damage unit's blow was read
 *   (`src/lab/club-blow.ts`).
 * - **Its damage** is `blowDamage` of that energy. Every blow is blunt until the weapons that cut
 *   and pierce come, and a blunt blow is never clean, so it takes a part off only past empty by
 *   the rulebook's margin (`src/core/rules/pool.ts`).
 * - A fighter whose pool has ended neither strikes nor is struck.
 */

/** The segments a blow is struck with: the hands, and what they hold. */
const STRIKERS: readonly string[] = Object.freeze(["hand.left", "hand.right"]);

/** A body in the fight: its side, its pool, and what it was built as. */
export interface Fighter {
  readonly id: string;
  /** Fighters of one side never wound each other. */
  readonly side: string;
  readonly built: BuiltBody;
  readonly pool: Pool;
}

/** A blow that landed, or a clash of two strikers. */
export interface LandedBlow {
  /** The world's clock when it landed, s. */
  readonly time: number;
  readonly attacker: string;
  readonly target: string;
  /** The attacker's striker, and the target's segment it met. */
  readonly striker: string;
  readonly part: string;
  /** Where, world, m, and the normal, attacker into target. */
  readonly point: Vec3;
  readonly normal: Vec3;
  /** The closing speed along the normal, m/s. */
  readonly closing: number;
  /** The masses the contact meets, kg. */
  readonly strikerKg: number;
  readonly struckKg: number;
  /** J. */
  readonly energy: number;
  /** Hit points, in the rulebook's unit; 0 for a clash. */
  readonly damage: number;
  /** Whether the target's segment was a striker too: then neither is wounded. */
  readonly clash: boolean;
  /** What it did to the target's pool; null for a clash. */
  readonly wound: Wound | null;
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
  readonly segment: BuiltSegment;
  readonly masses: ContactMass;
  /** The centre of mass in the segment's own frame. */
  readonly local: Vector3;
}

/** **What a blow watch remembers.** */
interface BlowState {
  /** The touches of the last step, striker to struck by their keys: one still touching lands nothing. */
  touching: Set<string>;
  readonly blows: LandedBlow[];
  /** Each body's velocities and centre as the last step left them, in the bodies' order. */
  readonly last: { readonly velocity: Vector3; readonly spin: Vector3; readonly centre: Vector3 }[];
}

/** Read the blows among `fighters` in `world` under `rules`; `onBlow` hears each as it lands. */
export function watchBlows(world: World, fighters: readonly Fighter[], rules: Rulebook, onBlow?: (blow: LandedBlow) => void): BlowWatch {
  const owners = new Map<SegmentBody, Owned>();
  const state: BlowState = { touching: new Set(), blows: [], last: [] };
  for (const fighter of fighters) {
    const masses = contactMass(fighter.built);
    for (const segment of fighter.built.segments.values()) {
      if (owners.has(segment.body)) throw new Error(`${fighter.id}'s ${segment.spec.name} is another fighter's body`);
      const { origin, x, y, z } = segment.frame, c = segment.rigid.centre, d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
      const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]) as [number, number, number]);
      owners.set(segment.body, { key: state.last.length, fighter, segment, masses, local });
      state.last.push({ velocity: new Vector3(), spin: new Vector3(), centre: new Vector3() });
    }
  }
  const remember = () => {
    for (const owned of owners.values()) {
      const { segment } = owned, last = state.last[owned.key]!;
      segment.body.linearVelocityToRef(last.velocity);
      segment.body.angularVelocityToRef(last.spin);
      owned.local.applyRotationQuaternionToRef(segment.node.rotationQuaternion!, last.centre).addInPlace(segment.node.position);
    }
  };
  remember();
  const standing = (fighter: Fighter) => fighter.pool.ending() === null;
  const strikers = fighters.flatMap((fighter) => STRIKERS.flatMap((name) => {
    const segment = fighter.built.segments.get(name);
    return segment ? [owners.get(segment.body)!] : [];
  }));
  const isStriker = new Set(strikers);
  /** The velocity of `owned`'s body at `point` as the last step left it. */
  const velocityAt = (owned: Owned, point: Vector3): Vector3 => {
    const last = state.last[owned.key]!;
    return last.velocity.add(Vector3.Cross(last.spin, point.subtract(last.centre)));
  };

  const hook = world.afterStep(() => {
    const now = new Set<string>();
    for (const striker of strikers) {
      const attacker = striker.fighter;
      if (!standing(attacker) || !attacker.pool.attached(striker.segment.spec.name)) continue;
      for (const contact of world.physics.contactsOf(striker.segment.body)) {
        // A blow is a touch of a body that the solver pushed on.
        if (contact.other === null || !(contact.impulse > 0)) continue;
        const struck = owners.get(contact.other);
        if (!struck || struck.fighter.side === attacker.side || !standing(struck.fighter)) continue;
        const key = `${striker.key}:${struck.key}`;
        now.add(key);
        if (state.touching.has(key)) continue;
        const point = new Vector3(...contact.point), normal = new Vector3(...contact.normal);
        const closing = Vector3.Dot(velocityAt(striker, point).subtract(velocityAt(struck, point)), normal);
        // A touch that was not closing is no blow: a hand laid on, or brushing past.
        if (!(closing > 0)) continue;
        striker.masses.update();
        struck.masses.update();
        const strikerKg = striker.masses.along(striker.segment, contact.point, contact.normal);
        const struckKg = struck.masses.along(struck.segment, contact.point, contact.normal);
        const energy = impactEnergy(strikerKg, struckKg, closing);
        const clash = isStriker.has(struck);
        const damage = clash ? 0 : blowDamage(rules, "blunt", energy);
        const wound = clash ? null : struck.fighter.pool.wound({ part: struck.segment.spec.name, damage, clean: false });
        const blow: LandedBlow = deepFreeze({
          time: world.time, attacker: attacker.id, target: struck.fighter.id,
          striker: striker.segment.spec.name, part: struck.segment.spec.name,
          point: contact.point, normal: contact.normal, closing, strikerKg, struckKg, energy, damage, clash, wound,
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
