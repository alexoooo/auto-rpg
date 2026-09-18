import { mulberry32 } from "../../rng.ts";
import {
  GOLEM_TACTICS_V3, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector, type StyleOption, type StyleTactics,
} from "../tactics-v3.ts";

/**
 * `golem-skirmisher`: the hit-and-run direction, and the first style that answers a range.
 *
 * ## What it fights like
 *
 * It stands twelve hundredths of their reach outside it -- about a fifth of a metre beyond a
 * mirror opponent's point -- and treats that gap as the thing it is defending. It comes in for one
 * committed cut and only for one: their arm on its way back, or its own patience running out at
 * two and a half seconds. The moment the exchange ends it leaves, and it goes on leaving until the
 * gap is wider than their reach and slack again. Their point committing inside their reach is
 * stepped off the line of, never met -- this style has no parry, on purpose, because a hand that
 * is covering is a hand that is not carrying the body backwards.
 *
 * ## The two bodies this does not describe
 *
 * A **longer** arm than theirs gets one more rule: a point closing faster than `stopHitClosing`
 * is met with the quick stroke rather than the committed one, which is v2's stop-hit and is the
 * only thing in this file that is not a cut.
 *
 * A **shorter** arm gets a different style altogether, because "stand outside their reach" is a
 * sentence with no meaning for an arm that cannot then reach back. It alternates leaving and
 * cutting, and on their recover it names `wait` instead of `cut` -- a quick stroke on the opening
 * rather than a 0.72 s wind-up it does not have room for.
 *
 * A **paired** grip is offered no cut from outside its own strike range, so a skirmisher on a maul
 * is a maul that circles and leaves. That is written here rather than hidden: the league row by
 * build class is where it shows, and it is the plan's fourth named risk.
 *
 * ## Where the numbers are
 *
 * `SKIRMISHER` is `GOLEM_TACTICS_V3` with three rows moved, so `--override
 * skirmisher.patience=3.5` in `scripts/tournament.mjs` is a row of this style and `--override
 * patience=3.5` is not. `retreatSeconds` is swept from here too and is not moved, because v3's
 * 1.2 turned out to be the middle of the bracket the plan asked for.
 */
const SKIRMISHER_TABLE = {
  ...GOLEM_TACTICS_V3,
  /** Outside their point rather than at it: 0.12 of a 1.7 m reach is a fifth of a metre of air. */
  standOffFraction: 1.12,
  /**
   * Seconds of nothing happening before it comes in anyway.
   *
   * The plan set this at 2.5 on the argument that coming in is this style's expensive act, and
   * Session 05's sweep of {2.0, 2.5, 3.5} disagreed by 2.8 standard errors with every structural
   * column agreeing: 2.0 lands a harder stroke, at a higher contact speed, with a higher committed
   * fraction, a lower clinch and more disengaged seconds. The bracket says the argument was
   * backwards -- a style that leaves after every exchange is one that has to come
   * back, and waiting longer out there only lets them close the ground for free. It is the one
   * number this set has moved off a sweep rather than reported off one, and it is moved because
   * 2.8 sigma over eight comparisons is outside the noise rule rather than inside it.
   */
  patience: 2.0,
  /** Lower than the form's 0.15: a feint from out here draws nothing, it only spends the range. */
  feintFraction: 0.10,
};

/** Every constant this style has: the executor's table with this style's rows over it. */
export type SkirmisherTactics = StyleTactics;

export const SKIRMISHER: SkirmisherTactics = SKIRMISHER_TABLE;

/**
 * The style itself: eight rules, and the order is the whole of it.
 *
 * Leaving comes before answering, answering comes before coming in, and coming in comes before
 * moving for the sake of moving -- which is the form's order with one rule inserted at the top,
 * because for this style the range *is* the tactic and everything else is what it does while it
 * has one.
 */
export function skirmisherDirector(seed: number, T: SkirmisherTactics = SKIRMISHER): StyleDirector {
  const random = mulberry32(seed);
  /** The clock at which the last exchange was named, and how long patience runs this time. */
  let opened = 0;
  let patience = T.patience * (0.8 + random() * 0.4);
  /**
   * Whether the retreat that follows an exchange is still owed.
   *
   * The executor's `retreat` ends on `retreatSeconds` *or* on the gap opening, whichever comes
   * first, so one naming of it is not the plan's "until the gap exceeds their reach plus slack".
   * This flag is what makes it a rule rather than a step: it is raised the moment an exchange
   * ends and lowered only by the range, so the director re-names `retreat` at every ask in
   * between.
   */
  let owed = false;
  /**
   * Whether the last thing this director named was an exchange.
   *
   * The obvious implementation -- watch `reading.mine` go from `exchange` to `free` -- does not
   * work and it fails silently, which is worth the four lines it costs to say so. The executor
   * asks its director only in the interruptible stances, and every one of those reads `mine` as
   * `free`; the ask that *names* a cut and the ask that lands after it are both `free`, so the
   * transition is never sampled and the retreat is never owed. What the director can see is what
   * it said, so that is what it remembers.
   */
  let opening = false;
  /** Which of the shorter arm's two acts is next; it alternates rather than rolling a coin. */
  let cutting = true;

  /** A cut, or the feint that is a cut shown and taken back. */
  const openWith = (available: readonly StyleOption[], clock: number, want: StyleOption): StyleOption => {
    opened = clock;
    opening = true;
    patience = T.patience * (0.8 + random() * 0.4);
    if (want !== "feint" && available.includes("feint") && random() < T.feintFraction) return "feint";
    return want;
  };

  return (available, reading, view): StyleOption => {
    const clock = view.clock;
    // The abort ask, which this style is not configured to receive -- `chamberAbort` is off -- and
    // answers by finishing the stroke if it ever is. There is no parry here to answer with.
    if (!available.includes("hold")) return available[0];

    // An exchange that has just ended owes a retreat, and the range is what pays it off.
    if (opening) { owed = true; opening = false; }
    if (reading.gap > reading.theirReach + reading.slack) owed = false;

    if (reading.theirs === "commit" && reading.gap <= reading.theirReach + reading.slack) {
      if (available.includes("void")) return "void";
    }
    if (owed && available.includes("retreat")) return "retreat";

    // The stop-hit: v2's reflex, and the one rule a longer arm has that a shorter one does not.
    if (reading.longer && reading.gapRate < -T.stopHitClosing && reading.theirs !== "recover"
      && available.includes("strike")) {
      return openWith(available, clock, "strike");
    }

    // The shorter arm's whole style, because standing outside a reach it cannot answer is not one.
    if (reading.shorter) {
      if (reading.theirs === "recover" && available.includes("wait")) { opening = true; return "wait"; }
      if (cutting && available.includes("cut")) { cutting = false; return openWith(available, clock, "cut"); }
      if (available.includes("retreat")) { cutting = true; return "retreat"; }
      return available.includes("cut") ? openWith(available, clock, "cut") : "hold";
    }

    // The counter, and the only way in: their arm on its way back.
    if (reading.theirs === "recover" && available.includes("cut")) {
      return openWith(available, clock, "cut");
    }
    if (clock - opened > patience && available.includes("cut")) {
      return openWith(available, clock, "cut");
    }

    // Circle while nothing is happening, stand still while something is being drawn: a body
    // walking sideways is a body that cannot change direction, and their chamber is the moment
    // that costs most.
    if (reading.theirs === "idle" && available.includes("circle")) return "circle";
    return "hold";
  };
}

/** The style over the executor, with an optional hook on the ask for a decision log. */
export function golemSkirmisher(
  seed: number, T: SkirmisherTactics = SKIRMISHER, onAsk: StyleAskHook | null = null,
): GolemStyled {
  const director = skirmisherDirector(seed, T);
  return golemStyled(seed, T, onAsk === null ? director : watchedDirector(director, onAsk));
}
