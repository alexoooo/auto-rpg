import type { FighterView, Intent } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import {
  checkDuelModel, observe, planOption,
  type DuelModelTables, type DuelOption, type Plan,
} from "./duel-model.ts";
import { DUEL_MODEL_TABLES } from "./duel-model-tables.ts";
import { GOLEM_TACTICS_V2, golemFencer, type FencerTactics, type GolemFencer } from "./tactics-v2.ts";

/**
 * The golem's third scripted mind, `golem-planner`: the fencer's executor with the fencer's own
 * triggers replaced by a search. Session 06 of the matchup set.
 *
 * Between exchanges the fencer publishes what it can do this step -- `hold`, `close`,
 * `withdraw`, `circle`, and `strike`, `feint`, `wait`, `ram` when the range and the cooldown
 * allow -- and what it reads: the gap against the two reaches, their arm's phase, its own. The
 * planner discretises that into a state of the duel model, solves the model's finite-horizon
 * dynamic program from that state, and hands back the option the search rates highest. The
 * fencer runs it until the next ask (`replanSeconds` later, six times a second) or until it
 * starts an exchange, which then runs to its end as every exchange does. That is the plan's
 * "replan at 4 to 8 Hz, execute between replans", and it is also what keeps a planner from
 * changing its mind at 240 Hz: the search is asked a question a few times a second and the
 * executor is what answers the physics.
 *
 * **What the search values.** A window's reward is damage dealt weighted by `dealt` less
 * damage taken weighted by `taken`. Dealt carries `aggression` over taken from the first step,
 * because a bout is decided on the bar at the cap and a search that weighed the two evenly
 * found, on the first fitted tables, that stepping back out of both reaches was worth as much
 * as anything else and did it for twenty seconds; a draw is not a result the model can see, so
 * the weight is where the bout's shape enters. The lead moves the weights after that, by
 * `caution` times the lead: ahead on the bar, what is taken weighs more, and behind, what is
 * dealt does. Those and the horizon and discount are the whole of `GOLEM_PLANNER`; every one
 * has a sweep row behind it and the cadence is the fencer's `replanSeconds`.
 *
 * **Where the tables come from.** The fencer's own log is not an experiment: it closes where
 * its rules close and rams where its arms are capped, so a table fitted from it alone says that
 * closing is where one gets hit and that a ram is what a fighter with no arms does. The first
 * such table sent the planner backward out of both reaches for twenty seconds. `explore` is
 * the answer: at that fraction of asks the director names a uniformly random open option instead
 * of the search's, seeded, so a calibration run under `--override explore=0.5` exercises every
 * option from every state and the refit sees what each actually costs. It is zero in play.
 *
 * **What it does not do.** It writes no hand command and reads no capability the fencer does
 * not: the frozen choices of Session 00 stand, and the planner is a chooser among the fencer's
 * options, not a second executor. It does not learn during a bout. Its tables are the checked-in
 * `DUEL_MODEL_TABLES`, fitted by `scripts/calibrate-duel-model.mjs` from a logged tournament
 * and refused on load if their version is not this build's.
 */
export const GOLEM_PLANNER = {
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
export type PlannerTactics = { -readonly [K in keyof typeof GOLEM_PLANNER]: number };

export interface GolemPlanner {
  readonly fencer: GolemFencer;
  /** The last plan the search returned, for a test and the readout. */
  readonly lastPlan: Plan | null;
  /** How many times the search ran, and how long it took in all, ms. */
  readonly replans: number;
  readonly totalMs: number;
  /** How many asks were answered at random under `explore`. */
  readonly explored: number;
  decide(view: FighterView, dt: number): Intent;
}

export function golemPlanner(
  seed: number, tables: DuelModelTables = DUEL_MODEL_TABLES, P: PlannerTactics = GOLEM_PLANNER,
  T: FencerTactics = GOLEM_TACTICS_V2,
): GolemPlanner {
  checkDuelModel(tables);
  let lastPlan: Plan | null = null;
  let replans = 0;
  let totalMs = 0;
  let explored = 0;
  // The fencer's own stream is seeded from the same number; this one is drawn apart from it so
  // that a planner with `explore` at zero draws nothing and the fencer under it rolls as it
  // would under any director.
  const random = mulberry32((seed ^ 0x5eed0106) >>> 0);
  const fencer = golemFencer(seed, T, (available, reading, view): DuelOption => {
    const started = performance.now();
    const state = observe(reading, view.opponent.reach);
    const lead = view.self.vitality - view.opponent.vitality;
    const weights = {
      dealt: 1 + P.aggression + P.caution * Math.max(0, -lead),
      taken: 1 + P.caution * Math.max(0, lead),
    };
    lastPlan = planOption(tables, state, available, weights, { horizon: P.horizon, discount: P.discount });
    replans += 1;
    totalMs += performance.now() - started;
    if (P.explore > 0 && random() < P.explore) {
      explored += 1;
      return available[Math.floor(random() * available.length)] ?? lastPlan.option;
    }
    return lastPlan.option;
  });
  return {
    fencer,
    get lastPlan(): Plan | null { return lastPlan; },
    get replans(): number { return replans; },
    get totalMs(): number { return totalMs; },
    get explored(): number { return explored; },
    decide: (view, dt) => fencer.decide(view, dt),
  };
}
