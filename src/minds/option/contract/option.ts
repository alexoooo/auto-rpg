import type { Readiness, Resource } from "../../../skills/framework/action.ts";
import type { SelectedAsk } from "../../../skills/framework/intent.ts";
import type { Spot } from "../../../skills/framework/menu.ts";
import type { ModelledStrike, Situation } from "./situation.ts";
import type { Ask, Terms } from "./terms.ts";

/**
 * Where an Option running is (`Option.status`): `committed`, keeping what it claims; `yields`,
 * given up for a better one if there is one; at its `exit`, where what it holds can be handed to
 * another Option here, which a chooser decides afresh at (yielding there too); or `over`, having
 * run its course, to be begun afresh only.
 */
export type Status = "committed" | "yields" | "exit" | "over";

/** What an Option asks of the skills in a step, the hands' cover aside. */
export type Asked = SelectedAsk["asked"];

/** **An Option's step**: what it asks, and what its asks hold (`SkillsActions.needs`, `asking`), by resource. */
export interface Step {
  readonly asked: Asked;
  readonly holds: readonly Resource[];
}

/**
 * **An Option**: a skill applied to a target, chosen by its chooser (`Chooser`) in a set of
 * Options whose claims do not overlap. It says where it can begin and whether it goes on (its
 * entry and its status), what running it from a state is expected to bring (its model: measured
 * where a profile prices it, else guessed by hand where its Mind has guesses), and what it asks of the skills each step. Begun,
 * it runs until it is over, out of its entry, or given up for a better one where it yields. What
 * it may say beside, where its kind has it to say, its mind reads of any Option alike.
 */
export interface Option {
  readonly name: string;
  /** What kind of course it is, as its maker names it (a strike, a walk, a hold, a back step, …): what its offers say they are (`Offer.kind`). */
  readonly kind: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  /** The resources it takes from the set while it runs (`Resource`; `WHOLE`, all of them): what no other Option chosen beside it may hold. */
  readonly claims: readonly Resource[];
  /**
   * Whether it is a rest Option (`hold`, `guard`, `brace`): one worth no more than it does not take
   * its resource from it. A mark of its own: by rank the rest Options are last, the floor, and by
   * worth a rest Option wins a tie, so neither its rank nor its worth can say it.
   */
  readonly rest?: true;
  /**
   * The targets it may run at, by name, where it has a choice of them (a gait's destinations): its
   * chooser prices it at each (`aim`) and runs it at the best. One with none runs at its own.
   */
  readonly targets?: readonly string[];
  /** Run it at its target at `index` of `targets` from now on: its name, entry, status and worth are there. */
  aim?(index: number): void;
  /** Its entry, now: `ready` to begin or go on, else `waiting` or `blocked`, and why. */
  entry(now: Situation): Readiness;
  /**
   * Whether it is asked for firmly at `now` (a body's firm orders, `Orders.firm`): on offer, a
   * chooser takes it as it keeps a committed one, before it prices anything, so no worth decides
   * it, and keeps it for as long as it is asked. No target is chosen for it (`aim`). Absent, never.
   */
  bound?(now: Situation): boolean;
  /** Where it is now, running (`Status`). */
  status(now: Situation): Status;
  begin(now: Situation): void;
  /** It is over, run out or given up. */
  end(): void;
  /**
   * **What running it from `at` is expected to bring** (`Terms`), at the state the body is in now
   * or one an Option leaves it in (`placed`), asked as `ask` says; null where it is not on offer
   * there. It reads the state's percepts, so it answers at a predicted state as it would there; at
   * the state now its entry has the last word (`entry`).
   */
  model(at: Situation, ask: Ask): Terms | null;
  /** It runs as long as it is held, never over of itself (hold, guard, brace, the cover): priced over the seconds it is asked (`Ask.until`), and nothing after it. */
  readonly open?: true;
  /**
   * **Its sites** (`Site`): the spots it would begin from, if not where the body stands, each a
   * target of every walk its mind has (`WALK_OPTION`), so the search reaches it there as well as
   * where the body stands. Absent where it names none.
   */
  readonly sites?: readonly Site[];
  /**
   * How its model is priced now, a sentence: measured, where its profile prices it (and why
   * scaled, `ProfileReading.scaled`); else by hand, or not at all where its Mind guesses nothing, and why: it was never measured, its profile is
   * stale (`staleness`), or no trial reads where it stands. Absent where it reads no profile.
   */
  priced?(now: Situation): string;
  /**
   * What it is expected to take of the focus a second, within its reach, as a share of the
   * focus's full life, begun afresh; 0 with no focus. Not at the range now: out of reach it reads
   * what it would deal in reach. Absent where it deals nothing.
   */
  rate?(now: Situation): number;
  /** The strike its body is modelled by (`ModelledStrike`), where it is one. */
  readonly modelled?: ModelledStrike;
  /** What it asks this step, and what that holds. */
  step(now: Situation, dt: number): Step;
}

/**
 * **A site**: a spot an Option would begin from (`Option.sites`), by its name, unique among its
 * mind's sites; where it is at the state `at` (`Spot`), null where there is none there.
 */
export interface Site {
  readonly name: string;
  spot(at: Situation): Spot | null;
}

/**
 * **The sites a mind's Options name** (`Option.sites`), in their order, and their names: filled
 * once every Option is made (`optionsOf`), so a walk made among them goes to each (`walkBy`).
 */
export interface Sites {
  readonly all: readonly Site[];
  readonly names: readonly string[];
}
