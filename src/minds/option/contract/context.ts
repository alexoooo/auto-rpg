import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import type { Intent } from "../../../skills/framework/intent.ts";
import type { GroundPoint } from "../../../skills/framework/movement.ts";
import type { OutcomeModel } from "../../../skills/framework/outcomes.ts";
import type { GaitName } from "../../../skills/framework/skill.ts";
import type { Sites } from "./option.ts";
import type { Arrival, Guesses, MeasuredTries } from "./predictors.ts";
import type { Situation } from "./situation.ts";

/**
 * **What an Option kind is made from** (`OptionPart.make`): its body's spec, the world's rate (Hz)
 * and the part lookup; the legs its body goes by (whose gaits its walks name), its Mind's Options
 * as its config names them, the outcome model they ask what each act brings (`OutcomeModel`) and what they guess where nothing is measured (`Guesses`, null where they guess nothing);
 * what the Mind itself runs on: its walk and its Options' record of their tries; and the sites its
 * Options name (`Sites`, filled once every Option is made). A kind builds anything else it needs
 * from these.
 */
export interface OptionContext {
  readonly spec: BodySpec;
  readonly hz: number;
  /** How often its Mind looks for a change it watches, Hz (`OptionMindConfig.rate`, the world's where it names none). */
  readonly rate: number;
  /** The steps its body's command waits (`Body.delay`). */
  readonly delay: number;
  readonly parts: PartLookup;
  readonly legs: PartConfig;
  readonly guards: readonly PartConfig[];
  /** Its Mind's Options, as its config names them, in rank order. */
  readonly options: readonly PartConfig[];
  readonly outcomes: OutcomeModel;
  /** What its Options guess where nothing is measured (`Predictors.guesses`); null where they guess nothing. */
  readonly guesses: Guesses | null;
  /** What its tries on the ground were measured to do, where they are priced so (`Predictors.groundTries`); null where profiles and guesses price them. */
  readonly tries: MeasuredTries | null;
  readonly walk: Walker;
  readonly record: OptionRecord;
  readonly sites: Sites;
}

/** What an Option asks of the legs: a movement goal under a ceiling, and a facing. */
export type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **How a standing Option walks its body**: what its gaits hold, under its orders' pace; which way
 * its focus is; how long a way takes; and a walk kept clear of what the body must keep clear of.
 */
export interface Walker {
  /**
   * The speed the rule asks going `forward` and `right` (a direction, in the frame of the way the
   * body faces) with nothing ahead to stop for, m/s: what the gait holds that way (`heldPace`),
   * `gait` where it names one the legs have (`SkillsLegs.limitsOf`), else the one they go by, under
   * the orders' ceiling. Forward unless given.
   */
  pace(now: Situation, gait?: GaitName | null, forward?: number, right?: number): number;
  /**
   * How long each leg of the way from where the body is through `way` takes by `gait`, s: at the
   * speed the legs are asked all along it (`legSeconds`, the speed rule), from the speed the body
   * is priced as starting at (`WalkStart`), facing `face` where given and else the way each leg
   * goes, under the orders' ceiling, coming to its end as a place it stands within `near` m of
   * is come to (`Going.near`); at that ceiling where the legs have no such gait. What an
   * Option prices a walk by. Facing the way each leg goes, the body steers as it walks, so a gait
   * is priced no faster than it can steer (`steeredPace`). A walk that cannot turn at its top
   * speed slows itself to a speed it can turn at.
   */
  seconds(now: Situation, gait: GaitName, way: readonly GroundPoint[], face: number | null, near: number): number[];
  /**
   * The forward speed the legs' gait now was measured to hold, m/s, or the explicit ordered pace
   * without an envelope: what a second of orders already carried out is priced by, the same by
   * every gait.
   */
  stride(now: Situation): number;
  /**
   * How fast `gait` carries out `now`'s orders to move, m/s: along an ordered place's way (the
   * navigator's route there where it plans its way to that place, else the order's points), or to
   * an ordered range of a body (the navigator's route to its spot where it plans one, else straight
   * toward the body to the middle of the range), its length over its time (`seconds`), facing as
   * ordered or along the way; along an ordered direction, at its pace that way (`pace`); and at the
   * stride (`stride`) where the orders stand or face, the body is at the place or in the range, or
   * the legs go by no gait.
   */
  obeying(now: Situation, gait: GaitName | null): number;
  /** The heading to the focus, or the body's own with none. */
  facing(now: Situation): number;
  /**
   * When a walk by the gait its walk Option names `gait` (its label, in lower case) from `now` to
   * `spot` arrives, as walks were measured to (`Arrival`, `walkArrivals`); null where the walk is
   * timed by its gait's reckoning (`seconds`) alone, or nothing measured reads it there.
   */
  arrival(now: Situation, gait: string, spot: GroundPoint): Arrival | null;
  /** Whether its walks are timed by what walks measured (`Predictors.walkArrivals`), so arrive moving. */
  readonly measured: boolean;
  /**
   * `asked` kept out of what the body must keep clear of (`keepOut`): a solid's clearance and the
   * reach of every fallen body but `exempt` (the one it means to be near), at the orders' pace
   * and by their gait. What each Option that asks the legs asks them is kept so: a limit of the
   * walk, not of the choice.
   */
  kept<A extends Walk>(now: Situation, asked: A, exempt?: string | null): A;
}

/** **How a walk is priced as starting** (`Walker.seconds`), by name (`WALK_STARTS`, which says what each is). */
export type WalkStart = "speed" | "along" | "signed";

/** One Option's tries from one situation in the bout: how many were begun, and how many did what it does. */
export interface Tried {
  readonly name: string;
  readonly from: string;
  tries: number;
  done: number;
}

/** **Every Option's record of its tries** in the bout (`Tried`), by its name and the situation it was begun from. */
export interface OptionRecord {
  /** Its memory: the tries, and how many have been noted, which a reader of it compares to see a try end. */
  readonly state: { readonly tried: Tried[]; version: number };
  /** The tries of `name` from `from`, none where it was never tried there. */
  of(name: string, from: string): Tried | undefined;
  /** Note a try of `name` from `from` ended, and whether it did what it does. */
  note(name: string, from: string, done: boolean): void;
}
