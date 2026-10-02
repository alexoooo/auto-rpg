import type { BuiltBody } from "../build/build-body.ts";
import { deepFreeze } from "../state.ts";
import { watchTouches, type Part, type Touch, type TouchWatch } from "../touches.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { World } from "../world.ts";
import type { Pool, Wound } from "./pool.ts";
import { blowDamage, type Rulebook } from "./rulebook.ts";

/**
 * **Blows between bodies**: what the Crypt and the Arena wound with. A blow is a new touch
 * (`watchTouches`, `src/core/touches.ts`) of a standing fighter's striker on another side's
 * standing fighter, lasting while the solver pushes on it: a hand pressed against a body lands
 * once.
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

/** **What a blow watch remembers.** */
interface BlowState {
  /** Its touch watch's memory: the touches under way, and each body as the last step left it. */
  readonly touches: object;
  readonly blows: LandedBlow[];
}

/** Read the blows among `fighters` in `world` under `rules`; `onBlow` hears each as it lands. */
export function watchBlows(world: World, fighters: readonly Fighter[], rules: Rulebook, onBlow?: (blow: LandedBlow) => void): BlowWatch {
  const blows: LandedBlow[] = [];
  const standing = (fighter: Fighter) => fighter.pool.ending() === null;
  const isStriker = ({ segment }: Part<Fighter>) => STRIKERS.includes(segment.spec.name);
  const touches: TouchWatch<Fighter> = watchTouches(world, fighters, {
    segments: STRIKERS,
    lasts: "pushed",
    counts: (striker, struck) => standing(striker.body) && striker.body.pool.attached(striker.segment.spec.name)
      && struck !== null && struck.body.side !== striker.body.side && standing(struck.body),
  }, (touch: Touch<Fighter>) => {
    const striker = touch.of, struck = touch.on!;
    const { ofKg: strikerKg, onKg: struckKg, energy } = touches.priced(touch);
    const clash = isStriker(struck);
    const damage = clash ? 0 : blowDamage(rules, "blunt", energy);
    const wound = clash ? null : struck.body.pool.wound({ part: struck.segment.spec.name, damage, clean: false });
    // The touch names the fighters, which are no record: the blow takes its numbers and their names.
    const blow: LandedBlow = deepFreeze({
      time: touch.time, attacker: striker.body.id, target: struck.body.id,
      striker: striker.segment.spec.name, part: struck.segment.spec.name,
      point: touch.point, normal: touch.normal, closing: touch.closing, strikerKg, struckKg, energy, damage, clash, wound,
    });
    blows.push(blow);
    onBlow?.(blow);
  });
  const state: BlowState = { touches: touches.state, blows };
  return { state, get blows() { return state.blows; }, dispose: () => touches.dispose() };
}
