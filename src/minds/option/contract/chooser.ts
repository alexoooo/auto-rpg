import type { Offer } from "../../engagement.ts";
import type { Option } from "./option.ts";
import type { Situation } from "./situation.ts";

/**
 * **What a chooser decided**: the set running, the first chosen first (empty with none), the
 * situation it runs at, and whether it decided afresh at that time, pricing its Options.
 */
export interface Chosen {
  readonly set: readonly Option[];
  readonly at: Situation;
  readonly fresh: boolean;
}

/**
 * **A chooser**: of a body's Options, the set it runs, whose claims (`Option.claims`) do not
 * overlap. Its memory is in `state`, plain data.
 */
export interface Chooser {
  readonly state: object;
  /**
   * The set running and where (`Chosen`), after deciding at `now` if it has not yet at its time.
   * Deciding afresh with nothing committed, it prices its Options at each of `others` too (the
   * situation at each other foe, each price held as its `Holding` says where it gives one), and
   * runs the set at the one whose best is worth most, priced afresh; else at `now`.
   */
  decide(now: Situation, others?: () => readonly Situation[]): Chosen;
  /** The set running, as the last decision left it. */
  readonly running: readonly Option[];
  /** What it chose among at its last decision. */
  readonly offers: readonly Offer[];
}
