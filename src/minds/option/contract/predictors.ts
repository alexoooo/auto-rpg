import type { Position } from "../../../control/ground-reading.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { TargetRef } from "../../../skills/framework/action.ts";
import type { Expected, ProfileReading } from "../../../skills/framework/profile/reading.ts";
import type { OutcomeModel } from "../../../skills/framework/outcomes.ts";
import type { WalkStart } from "./context.ts";
import type { ModelledStrike, Pressure, Seen, Situation } from "./situation.ts";
import type { Terms } from "./terms.ts";

/** A move the foe is expected to make: a velocity over the ground, m/s, and the seconds it keeps it. */
export interface FoeMove {
  readonly x: number;
  readonly z: number;
  readonly seconds: number;
}

/**
 * **What the body and its foe are expected to do to each other**, as far as the body can tell
 * without knowing the foe's Options. Its first five members are a situation's predictions
 * (`Predictions`), each read of what the reader sees (`Seen`) the first time a step asks for it.
 * The last two are asked by a search, of a state already read.
 */
export interface ExchangePredictor {
  /** The share of the body's life the blow already coming is expected to take; 0 with none, or where `pressure` counts it already. */
  danger(seen: Seen): number;
  /** What the foe's fighting is expected to take from the body as the two stand now. */
  pressure(seen: Seen): Pressure;
  /** What a second spent down in each posture is expected to cost the body, own life. */
  downRate(seen: Seen): (posture: Position) => number;
  /** How fast the foe turns to face, rad/s; Infinity with no foe. */
  turns(seen: Seen): number;
  /** The share of the foe's life a blow of a limb of the body's takes at a segment of the foe's, closing on it at `closing` m/s; 0 with no foe. */
  blows(seen: Seen): (limb: string, segment: string, closing: number) => number;
  /**
   * The foe `seconds` s from now, moving as `foe` is sensed to move. The same object where that
   * does not move it. A search imagines a reply (`reply`) by giving the foe the reply's velocity
   * and asking this.
   */
  later(foe: BodySense, seconds: number): BodySense;
  /** The move the foe is expected to answer a line of the body's with, the line's model `line` at `root`. Null where it is expected to stand. */
  reply(root: Situation, line: Terms): FoeMove | null;
}

/** **What a Mind predicts by**, made by its predictions part (`PredictionsPart.make`). */
export interface Predictors {
  /** What each act of the body's own brings. */
  readonly outcomes: OutcomeModel;
  /** Its exchange predictor, given the body's own strikes as its Options model them: made once its Options are. */
  exchange(given: { readonly strikes: readonly ModelledStrike[] }): ExchangePredictor;
  /** The speed a walk is priced as starting at. */
  readonly walkStart: WalkStart;
  /** What it guesses where nothing is measured. Null where it guesses nothing: a strike, a limb, a blow coming or a way up with no measurement is then not priced. */
  readonly guesses: Guesses | null;
}

/** **What an Option is taken to bring where no drill measured it**: the seconds it runs, and the share of its tries that do what it does. */
export interface Prior {
  readonly seconds: number;
  readonly done: number;
}

/** What a strike's guess reads of the strike: its action with its limbs, how many blows one try throws, and what it aims at from a state (null with nothing to aim at). */
export interface GuessedStrike {
  readonly action: { readonly name: string; readonly effectors: readonly string[] };
  readonly throws: number;
  target(at: Situation): TargetRef | null;
}

/** Where a guess puts a striker's limb: within its reach of the struck body's centre, or over the struck body, at no range. */
export type Placing = "reach" | "over";

/** What a limb's guess reads: the limb, the body it is on, the body it strikes, and where the guess puts it. */
interface GuessedLimb {
  readonly striker: BodySpec;
  readonly struck: BodySpec;
  readonly limb: string;
  readonly placing: Placing;
}

/** What a guess is of, of the ground's Options: a way up, the regain, or a brace until a way up admits the body. */
export type GuessedWay = "way" | "regain" | "settle";

/**
 * **Numbers set by hand that stand in where a measurement is missing.** A Mind has them only where
 * its predictions part gives them (`Predictors.guesses`), and measured code reaches one only
 * through this interface.
 */
export interface Guesses {
  /**
   * What a strike of the body's is expected to bring from `at`, its blow `progress` s under way,
   * with its chance of ending down. A search asks it at every state it prices such a strike, so it
   * takes its arguments by place and no argument object is made.
   */
  strike(at: Situation, strike: GuessedStrike, progress: number): Expected;
  /** A limb with no profile of its own, as a reading of what it deals a body it can reach. */
  limb(seen: Seen, limb: GuessedLimb): ProfileReading;
  /** A blow already coming from a limb with no profile of its own, its striker `range` m away, as a reading of what it deals. */
  blow(seen: Seen, blow: NonNullable<Seen["blow"]>, range: number): ProfileReading;
  /** How long a way up, a regain or a brace takes and how often it does what it does, where no drill measured it. */
  way(kind: GuessedWay): Prior;
}

/** **An Option on offer as one try of it is modelled** (`Terms`): its kind, whether it is open, and its seconds and the life it deals and takes. */
export interface Offered { readonly kind: string; readonly open: boolean; readonly duration: number; readonly dealt: number; readonly taken: number }

/** **What followed a state**: the life dealt and taken. */
export interface Followed { readonly dealt: number; readonly taken: number }

/** **What a state is worth where a line of a search stops.** */
export interface ValuePredictor {
  /** A reader for one search begun at `root`. Null where it has no reading of this body against this foe. */
  from(root: Situation): ValueReader | null;
}

/**
 * The life expected to be dealt and taken over the `seconds` after `at`, read with the Options on
 * offer there as their models price one try (`offered`) and the body's `grace` there (`graceAt`).
 * Null where it has no reading of this state. A search asks it at every leaf, so it takes its
 * arguments by place and no argument object is made.
 */
export type ValueReader = (at: Situation, grace: number, offered: readonly Offered[], seconds: number) => Followed | null;
