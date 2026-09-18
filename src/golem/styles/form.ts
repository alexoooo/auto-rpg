import { mulberry32 } from "../../rng.ts";
import {
  GOLEM_TACTICS_V3, golemStyled, watchedDirector,
  type GolemStyled, type StyleAskHook, type StyleDirector, type StyleOption, type StyleTactics,
} from "../tactics-v3.ts";

/**
 * `golem-form`: the first style over the third executor, and the argument for what a style is.
 *
 * ## What it fights like
 *
 * It stands a little further out than its own reach asks for, circles for something over a third
 * of the time it is not doing anything else, and never throws the quick stroke. What it throws is
 * the committed cut, and it throws it into one of two things: their arm recovering, or its own
 * patience running out. Their point committing inside their own reach is met with the spare hand
 * on the solved intercept when there is a spare hand to meet it with, and stepped off the line of
 * when there is not. Roughly a stroke every two and a half seconds, which is a sixth of what the
 * duelist throws and is the whole point of it.
 *
 * ## Why the rules are here and not in the executor
 *
 * Every one of them was a reflex in `tactics-v2.ts`: the void on a read commit, the counter into a
 * recover, patience, the feint roll. Moving them here is the frozen choice the set is built on --
 * a style is a director, and the executor owns an exchange once started and decides nothing. The
 * test of that choice is this file's length: a whole fighting style is ninety lines, because the
 * body it drives already knows how to cut, parry, shove, thrust, duck, circle and leave.
 *
 * The numbers are `FORM`, which is `GOLEM_TACTICS_V3` with seven rows moved, so `--override
 * form.cutLean=0.8` in `scripts/tournament.mjs` is a row of this style and `--override
 * cutLean=0.8` is not. Each of the seven has a sweep in `docs/measurements.md` under Session 04;
 * the last two of them exist so that the control row can be written down at all.
 */
const FORM_TABLE = {
  ...GOLEM_TACTICS_V3,
  /** A hand's breadth further out than v2's 1.00, which is what makes the cut's step-in matter. */
  standOffFraction: 1.06,
  /** On: this style would rather meet a point than finish a stroke into it. */
  chamberAbort: true,
  /** Seconds of nothing happening before it opens one anyway. v2's 1.6 is a duelist's. */
  patience: 2.2,
  /** How often a chamber is shown and taken back instead of thrown. */
  feintFraction: 0.15,
  /**
   * The fraction of its idle time spent circling rather than standing.
   *
   * A duty and not a per-ask probability, which is a distinction the first draft got wrong: a
   * circle runs `circleSeconds` once named and a hold is re-asked six times a second, so a coin
   * flipped at every ask circles almost always. The director alternates two phases instead --
   * `circleSeconds` of circling against `circleSeconds * (1 - duty) / duty` of holding, each
   * jittered on its own seeded stream -- so the number here is the fraction it actually means.
   */
  circleDuty: 0.40,
  /**
   * Whether their committed point is met with the spare hand, or only stepped away from.
   *
   * Off is v2's reflex exactly -- the void and nothing else -- and it exists so that the control
   * row of Session 04 can be written on the command line. That row is this constant's sweep: the
   * third executor under the second's numbers has to sit inside noise of the fencer, and it cannot
   * be asked to do that while it is parrying, because the fencer has no parry to answer with.
   */
  parryOnCommit: true,
  /**
   * Whether an opening is taken with the quick stroke instead of the committed cut.
   *
   * On is v2's shapes, which is the part of the control row `--override form.cutSeconds` cannot
   * reach: the committed arc differs from the quick one in its chamber swing, its chamber reach
   * and its chamber time as well as in the seconds it sweeps in, and only the last of those is a
   * number. The style ships with it off and never throws `strike`, which is the whole of what it
   * is; on, it is a slower fencer with a longer stand-off, and that is the reading the control
   * row is for.
   */
  quickStrokes: false,
};

/** Every constant this style has: the executor's table with this style's rows over it. */
export type FormTactics = StyleTactics & {
  circleDuty: number;
  parryOnCommit: boolean;
  quickStrokes: boolean;
};

export const FORM: FormTactics = FORM_TABLE;

/**
 * The style itself: eight rules in the order they are asked, and no ninth.
 *
 * The order is the style. Meeting their point comes before answering it, answering it comes
 * before starting something, and starting something comes before moving for the sake of moving.
 */
export function formDirector(seed: number, T: FormTactics = FORM): StyleDirector {
  const random = mulberry32(seed);
  /** The clock at which the last exchange was named, and how long patience runs this time. */
  let opened = 0;
  let patience = T.patience * (0.8 + random() * 0.4);
  /** The circling duty's two phases, alternating on the bout's own clock. */
  let circling = true;
  let phaseUntil = Number.NEGATIVE_INFINITY;

  /** A cut, or the feint that is a cut shown and taken back. */
  const openWith = (available: readonly StyleOption[], clock: number, want: StyleOption): StyleOption => {
    opened = clock;
    patience = T.patience * (0.8 + random() * 0.4);
    if (want !== "feint" && available.includes("feint") && random() < T.feintFraction) return "feint";
    return want;
  };

  return (available, reading, view): StyleOption => {
    const clock = view.clock;
    // The abort ask, which offers three things and never `hold`: meet the point if the spare can,
    // otherwise finish what was started. Leaving is not this style's answer to a committed arm.
    const meets = T.parryOnCommit;
    if (!available.includes("hold")) {
      return meets && available.includes("parry") ? "parry" : available[0];
    }

    const threatening = reading.theirs === "commit" && reading.gap <= reading.theirReach + reading.slack;
    if (threatening) {
      if (meets && available.includes("parry")) return "parry";
      if (available.includes("void")) return "void";
    }

    // The counter: their arm on its way back is the opening this style waits for.
    const stroke: StyleOption = T.quickStrokes ? "strike" : "cut";
    if (reading.theirs === "recover" && available.includes(stroke)) {
      return openWith(available, clock, stroke);
    }

    if (clock - opened > patience) {
      // A head that is the weakest thing within reach is worth a point rather than an edge.
      if (reading.weakestSlot === "head" && available.includes("thrust")) {
        return openWith(available, clock, "thrust");
      }
      if (available.includes(stroke)) return openWith(available, clock, stroke);
    }

    if (clock >= phaseUntil) {
      circling = !circling;
      const span = circling ? T.circleSeconds : T.circleSeconds * (1 - T.circleDuty) / T.circleDuty;
      phaseUntil = clock + span * (0.6 + random() * 0.8);
    }
    return circling && available.includes("circle") ? "circle" : "hold";
  };
}

/** The style over the executor, with an optional hook on the ask for a decision log. */
export function golemForm(
  seed: number, T: FormTactics = FORM, onAsk: StyleAskHook | null = null,
): GolemStyled {
  const director = formDirector(seed, T);
  return golemStyled(seed, T, onAsk === null ? director : watchedDirector(director, onAsk));
}
