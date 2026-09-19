import type { PilotHook } from "../pilot.ts";
import type { GolemDriven } from "../tactics-v4.ts";
import type { ReaperTactics } from "./reaper.ts";
import { REAPER, golemReaper } from "./reaper.ts";

/**
 * The second rung of the ladder: `golem-miser`, the reaper's rules with a table that was found
 * rather than written.
 *
 * It shares every line of `reaperPilot`. What differs is twenty-four numbers, and the name is what
 * they add up to: **this mind spends nothing.** It turns at 1.00 where the hand-built table turns
 * at 2.60, waits 0.10 s between throws where the other waits 0.35, and is out of its recovery in
 * 0.099 s against 0.30. It stands closer, strikes fully extended, and crosses the mark near the
 * anchor. The hand-built reaper fights by choosing its moments; this one fights by never being
 * anywhere expensive.
 *
 * **What it is worth, on a seed base neither the search nor its hold-out ever saw.** All four arms
 * below ran the *same* jobs -- same foes, same seeds, same sides -- because the absolute level of
 * this objective moves with the seed base and only a within-run comparison is a comparison. Base
 * 20291111, 64 bouts a foe a side:
 *
 * ```
 * arm                       n   score   [95 % band]    dealt  taken  ratio
 *   miser     [gauntlet]  256    77.3   [71.2..83.5]    8.77   5.93   1.48
 *   reaper    [gauntlet]  256    43.8   [37.6..49.9]    8.32   9.05   0.92
 *   miser     [unseen]    256    81.3   [75.1..87.4]   10.31   6.39   1.61
 *   planner   [unseen]    256    76.2   [70.0..82.3]   10.30   6.10   1.69
 *   duelist   [unseen]    256    73.0   [66.9..79.2]    9.78   6.45   1.52
 *   reaper    [unseen]    256    67.0   [60.9..73.1]    9.32   7.55   1.23
 * ```
 *
 * The bands do not overlap in either column. **The `unseen` column is the one that matters**: the
 * search's objective was the four-mind gauntlet, so a table that only beats the gauntlet has
 * fitted four opponents rather than learned to fight. These four -- skirmisher, guardian, brawler
 * and form -- were never in the objective, and it leads there too.
 *
 * Most of the margin is in the column it is *not* hit in. It deals about half a hit more a bout
 * and takes three fewer, and `tests/harness/stroke-phase.mjs` says it is not buying that with
 * throughput: it throws 9.6 strokes and lands 12.8 cuts a bout against the hand-built table's 9.3
 * and 13.0, the same fight at the same rate. What moved is where a cut lands and what it is worth
 * -- `commit` carries 58.2 % of its cutting damage against 46.7 %, almost all of it taken out of
 * `recover`, and a committed cut is worth 0.6919 at 12.51 m/s against 0.5698 at 11.64.
 *
 * **And it is the first golem mind on this executor that is not lopsided.** A mirror -- the same
 * mind, same table, same body, both sides -- must sit at 50 %, and the number that says whether it
 * does is the left/right split, since the score is 50 by construction:
 *
 * ```
 * mirror, n=64          left    right
 *   golem-reaper        15.6     84.4
 *   golem-planner       31.3     68.8
 *   golem-duelist       46.9     53.1
 *   golem-miser         53.1     46.9
 * ```
 *
 * The hand-built reaper loses its own mirror eighty-five times in a hundred on side alone. This
 * table does not, on the same arena and the same opening, which is the evidence that the defect
 * was never pure geometry -- a table exists that does not have it. Which row carries the fix is a
 * separate question and `msweep.mjs` is the instrument for it; the honest statement here is that
 * the search found a side-balanced table and was never asked to.
 *
 * **What this rung is not.** It is not a different kind of mind. Every rule, every gate and every
 * option is `reaperPilot`'s, and a searched table cannot grow a behaviour its pilot does not have.
 * It is on the ladder because the margin is real and replicated, not because it is clever.
 */
export const MISER: ReaperTactics = {
  ...REAPER,
  // Cross-entropy search, 24 dimensions, 26 generations, two-stage with an unseen hold-out list
  // and elites picked on the sum. The champion is generation 12's and no later generation beat it,
  // which is the search saying it converged rather than ran out of time -- sigma fell from 0.180
  // to 0.109 over the twenty-six. Training-list score 74.7 against the shipped table's 36.3.
  //
  // The four rows that carry the style, with what the hand-built table held:
  //   turnGain       2.60 -> 1.00   turn less than half as hard
  //   recoverSeconds 0.30 -> 0.099  out of the recovery almost at once
  //   patience       0.35 -> 0.10   the floor of its band
  //   holdFraction   0.78 -> 0.62   stand closer
  circleDuty: 0.5975,
  circleStrafe: 0.6463,
  closeGain: 1.9335,
  commitSeconds: 0.2517,
  cooldown: 0.149,
  cutBend: 0.1548,
  cutLean: 0.5564,
  cutSeconds: 0.2288,
  feintFraction: 0.1733,
  followSeconds: 0.0385,
  holdFraction: 0.6181,
  insideSlack: 0.3952,
  openCeiling: 1.2134,
  openFloor: 0.8222,
  openHold: 1.0891,
  patience: 0.1,
  recoverSeconds: 0.0991,
  slackFraction: 0.084,
  strikeBite: 0.9147,
  strikeFraction: 1,
  trunkSweep: 0.9797,
  turnGain: 1,
  voidStep: 0.9425,
  voidStrafe: 0.9313,
};

/** The mind over the executor, with an optional hook on the ask for a command log. */
export function golemMiser(
  seed: number, T: ReaperTactics = MISER, onAsk: PilotHook | null = null,
): GolemDriven {
  return golemReaper(seed, T, onAsk);
}
