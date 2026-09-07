import type { FighterView, Intent } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { planIn, type Plan, type PlanWeights } from "./duel-model.ts";
import { checkStyleModel, styleObserve, STYLE_VOCABULARY, type StyleModelTables } from "./style-model.ts";
import { STYLE_MODEL_TABLES } from "./style-model-tables.ts";
import {
  GOLEM_TACTICS_V3, golemStyled,
  type GolemStyled, type StyleAskHook, type StyleOption, type StyleTactics,
} from "./tactics-v3.ts";

/**
 * The planner rebuilt over the third executor: `golem-tactician`. Session 09 of the style set.
 *
 * Everything the matchup set's `src/golem/planner.ts` says about *why* a search is asked a few times a
 * second and an executor answers the physics holds here word for word, and is not repeated. What
 * is different is the three things the search is over, and each of them is a decision this file
 * owns:
 *
 * **Fifteen options rather than eight.** The planner chose among hold, close, withdraw, circle,
 * strike, feint, wait and ram; this one may also name a void, a retreat, a cut, a thrust, a
 * parry, a shove and a duck. Seven of those are exactly the acts the four styles were written to
 * make, so the tactician is the first mind that can *combine* them: it is not a style, and it has
 * no rules, but its vocabulary is the styles' vocabulary and every option it names has a fitted
 * cost behind it.
 *
 * **A state that knows whose arm is longer.** `styleObserve` adds the reach pair, and the search
 * runs inside one weapon-and-reach family, so a plan made on a short arm against a long one is
 * made from windows logged on short arms against long ones. Session 05 of this set measured the
 * skirmisher converting a reach edge better than anything that ships; a model blind to the edge
 * would have averaged that away.
 *
 * **Tables the styles wrote.** `STYLE_MODEL_TABLES` is fitted by `scripts/calibrate-style-model.mjs`
 * from a tournament in which the four styles played at `--explore`, which is the same arrangement
 * the planner's tables came from and for the same reason -- a style's unexplored log says only
 * that a style's own rules are what a style does. They are refused on load if their version is
 * not this build's.
 *
 * **What it does not do.** As the planner does not: no hand command of its own, no capability the
 * executor does not read, no learning inside a bout. It is a chooser among the third executor's
 * options.
 */
export const GOLEM_TACTICIAN = {
  /** Windows deep the search looks; a window is at most half a second. */
  horizon: 6,
  /** Per-window discount. */
  discount: 0.9,
  /** What dealt damage weighs over taken with the bars level. */
  aggression: 0.5,
  /** How much a lead on the bar moves the weights: the leader guards, the trailer chases. */
  caution: 1.0,
  /** The fraction of asks answered with a random open option; for calibration runs, zero in play. */
  explore: 0,
};
export type TacticianTactics = { -readonly [K in keyof typeof GOLEM_TACTICIAN]: number };

export interface GolemTactician {
  readonly styled: GolemStyled;
  /** The last plan the search returned, for a test and the readout. */
  readonly lastPlan: Plan<StyleOption> | null;
  /** How many times the search ran, and how long it took in all, ms. */
  readonly replans: number;
  readonly totalMs: number;
  /** How many asks were answered at random under `explore`. */
  readonly explored: number;
  decide(view: FighterView, dt: number): Intent;
}

export function golemTactician(
  seed: number, tables: StyleModelTables = STYLE_MODEL_TABLES, P: TacticianTactics = GOLEM_TACTICIAN,
  T: StyleTactics = GOLEM_TACTICS_V3, onAsk: StyleAskHook | null = null,
): GolemTactician {
  checkStyleModel(tables);
  let lastPlan: Plan<StyleOption> | null = null;
  let replans = 0;
  let totalMs = 0;
  let explored = 0;
  // Drawn apart from the executor's own stream, exactly as the planner's is, so that a tactician
  // at explore zero draws nothing and the executor under it rolls as it would under any director.
  const random = mulberry32((seed ^ 0x5eed0109) >>> 0);
  const styled = golemStyled(seed, T, (available, reading, view): StyleOption => {
    const started = performance.now();
    const state = styleObserve(reading, view.opponent.reach);
    const lead = view.self.vitality - view.opponent.vitality;
    const weights: PlanWeights = {
      dealt: 1 + P.aggression + P.caution * Math.max(0, -lead),
      taken: 1 + P.caution * Math.max(0, lead),
    };
    lastPlan = planIn(STYLE_VOCABULARY, tables, state, available, weights,
      { horizon: P.horizon, discount: P.discount });
    replans += 1;
    totalMs += performance.now() - started;
    let option = lastPlan.option;
    if (P.explore > 0 && random() < P.explore) {
      explored += 1;
      option = available[Math.floor(random() * available.length)] ?? lastPlan.option;
    }
    onAsk?.(available, reading, view, option);
    return option;
  });
  return {
    styled,
    get lastPlan(): Plan<StyleOption> | null { return lastPlan; },
    get replans(): number { return replans; },
    get totalMs(): number { return totalMs; },
    get explored(): number { return explored; },
    decide: (view, dt) => styled.decide(view, dt),
  };
}
