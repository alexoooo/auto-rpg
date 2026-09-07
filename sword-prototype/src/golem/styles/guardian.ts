import { mulberry32 } from "../../rng.ts";
import {
  GOLEM_TACTICS_V3, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector, type StyleOption, type StyleTactics,
} from "../tactics-v3.ts";

/**
 * `golem-guardian`: the third style, and the first golem that blocks on purpose.
 *
 * ## What it fights like
 *
 * It stands at their reach rather than outside it, holds the cover between exchanges, and answers
 * their arm drawing back with the spare hand rather than with its feet. The parry goes out on the
 * *chamber* -- before their point is closing at all -- because Session 02 measured a plate taking
 * 0.89 s to settle over 0.40 m against a commit that runs in 0.20, and an arm that waits for the
 * commit is an arm that arrives after the stroke. Their recover is answered with the committed
 * cut -- the plan said the quick stroke and two seeds of measurement said otherwise. Inside the
 * inner radius it shoves. Failing all of that it waits three seconds and cuts, which is the
 * longest patience of any style in the set.
 *
 * ## What it is up against
 *
 * Session 04 measured the thing this style exists to disprove: `golem-form` throws about twenty
 * solved parries a bout and books five more blocks than the fencer, out of the 226 the fencer
 * books by standing still. A plate left where it is catches forty strokes a bout by accident. So
 * the honest question for this style is not whether it blocks -- everything blocks -- but whether
 * blocking *on purpose*, from the chamber, with a wall, is worth more than the accident. The
 * Session 06 entry in `docs/measurements.md` answers it either way.
 *
 * ## Where the rules are
 *
 * As the others: every one of them is here and none is in the executor. The one thing this style
 * needed that the executor did not have is `wallOnChamber`, which is not a reflex but a
 * capability -- there is no intercept to solve while their arm is drawing back, so without it no
 * parry is offered during a chamber and this style's first rule cannot be spoken.
 */
const GUARDIAN_TABLE = {
  ...GOLEM_TACTICS_V3,
  /** v2's own number, kept on purpose: this style has no reason to stand off a fight it wants. */
  standOffFraction: 1.00,
  /** Three seconds of nothing before it opens one itself. The longest in the set, and the point. */
  patience: 3.0,
  /** On: a style that would rather meet a point than finish a stroke into it, more than the form. */
  chamberAbort: true,
  /** On: the whole of the first rule. See the row's own note in `src/golem/tactics-v3.ts`. */
  wallOnChamber: true,
  /**
   * Whether the riposte is the quick stroke or the committed arc.
   *
   * **Off, against the plan's own frozen choice, on two seeds of measurement.** The argument for
   * the quick stroke was that a riposte is the half second their arm is out of position and the
   * committed cut spends 0.32 s in the chamber before it starts to sweep. The arithmetic is right
   * and the premise is wrong: their recover runs 0.30 s and is followed by a 0.30 s `cooldown`
   * before they can open anything, so the window is 0.60 s; a committed sword cut chambers 0.32
   * and crosses the mark 0.112 into a 0.20 s arc that runs from +1.20 to -0.94, which is 0.43 s
   * and inside it. Session 06 swept it at +0.0281
   * bar on seed 20260906 and +0.0259 on a held-out 20260907, 3.6 standard errors combined, with
   * the harder stroke, the higher committed fraction, the lower damage taken and the lower clinch
   * agreeing on both. On is still a row on the command line, and it is what the plan asked for.
   */
  ripostesQuick: false,
  /**
   * Whether anything that gets inside the inner radius is shoved off.
   *
   * On is the plan's rule and it is a strong one: `shove` is on offer at every ask while the gap
   * is inside `near + 0.15 * reach`, so a guardian that is being crowded shoves, recovers, and
   * shoves again for as long as they stay there. Off, it holds its ground and takes the exchange
   * instead. This exists for the same reason `parryOnCommit` exists in the form's own table in
   * `src/golem/styles/form.ts` -- so that the question "is the shove worth its seconds" is a row
   * on the command line rather than an argument -- and Session 06's entry has the answer.
   */
  shovesInside: true,
};

/** Every constant this style has: the executor's table with this style's rows over it. */
export type GuardianTactics = StyleTactics & { ripostesQuick: boolean; shovesInside: boolean };

export const GUARDIAN: GuardianTactics = GUARDIAN_TABLE;

/**
 * The style itself: six rules, and the order says what a guardian is.
 *
 * Meeting their arm comes before everything, because everything else can wait a step and that
 * cannot. Answering it comes next, then getting them off me, then -- only when none of that is on
 * offer -- starting something of my own.
 */
export function guardianDirector(seed: number, T: GuardianTactics = GUARDIAN): StyleDirector {
  const random = mulberry32(seed);
  /** The clock at which the last exchange was named, and how long patience runs this time. */
  let opened = 0;
  let patience = T.patience * (0.8 + random() * 0.4);

  /** A stroke, or the feint that is a stroke shown and taken back. */
  const openWith = (available: readonly StyleOption[], clock: number, want: StyleOption): StyleOption => {
    opened = clock;
    patience = T.patience * (0.8 + random() * 0.4);
    if (want !== "feint" && available.includes("feint") && random() < T.feintFraction) return "feint";
    return want;
  };

  /**
   * What answers a drawn or driving arm: the spare hand if there is one, otherwise the body.
   *
   * `duck` is offered by the executor only for a tip above my shoulder, which is exactly the
   * plan's condition for it, so asking whether it is on offer *is* asking whether their point is
   * high. A body with no spare cover -- a lost hand, a paired grip -- has only these two.
   */
  const answer = (available: readonly StyleOption[]): StyleOption | null => {
    if (available.includes("parry")) return "parry";
    if (available.includes("duck")) return "duck";
    if (available.includes("void")) return "void";
    return null;
  };

  return (available, reading, view): StyleOption => {
    const clock = view.clock;
    // The abort ask, which this style receives often because `chamberAbort` is on: three options
    // and never `hold`. Meeting their point is what it abandons a chamber *for*.
    if (!available.includes("hold")) {
      const met = answer(available);
      return met !== null ? met : available[0];
    }

    // The first rule, and the one the executor had to be taught to allow: their arm on its way
    // back is already the stroke, and the cover leaves now rather than when the point turns round.
    if (reading.theirs === "chamber" || reading.theirs === "commit") {
      const met = answer(available);
      if (met !== null) return met;
    }

    // The riposte: their arm out of position, and the window is their recover plus their
    // cooldown rather than their recover alone, which is why the arc fits inside it.
    const riposte: StyleOption = T.ripostesQuick ? "strike" : "cut";
    if (reading.theirs === "recover" && available.includes(riposte)) {
      return openWith(available, clock, riposte);
    }

    // Inside the inner radius there is no stroke worth throwing, and a shove is how a body that
    // has been crowded gets its distance back without giving up the ground behind it.
    if (T.shovesInside && available.includes("shove")) return "shove";

    if (clock - opened > patience) {
      if (reading.weakestSlot === "head" && available.includes("thrust")) {
        return openWith(available, clock, "thrust");
      }
      if (available.includes("cut")) return openWith(available, clock, "cut");
    }

    return "hold";
  };
}

/** The style over the executor, with an optional hook on the ask for a decision log. */
export function golemGuardian(
  seed: number, T: GuardianTactics = GUARDIAN, onAsk: StyleAskHook | null = null,
): GolemStyled {
  const director = guardianDirector(seed, T);
  return golemStyled(seed, T, onAsk === null ? director : watchedDirector(director, onAsk));
}
