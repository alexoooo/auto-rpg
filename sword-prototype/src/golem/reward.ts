/**
 * What a step of a bout is worth, and the table that says so. Session 13 of the style set.
 *
 * ## Why a reward at all, when there is already a margin
 *
 * Session 08 gave every ask the damage the two bars took until the next one, and the whole of
 * that session's mechanical claim was that those windows *telescope*: the sum of `dealt - taken`
 * over a side is its final bar less its opponent's, exactly, because each close reads the two
 * vitalities that the next open records. That identity is why this module can exist. A per-step
 * reward that did not sum to the outcome would be a proxy, and this repository has one expensive
 * memory of what proxies cost -- the session where every scalar went green while the owner's eye
 * stayed red.
 *
 * So the reward's *first* term is not chosen. It is the bar margin, differenced. What is chosen
 * is everything laid over it, and each of those is a row here with a reason beside it.
 *
 * ## The three things laid over it, and why they are not free
 *
 * A term that does not telescope changes what a policy is optimising, so each has to earn its
 * place against the thing it is being added to:
 *
 * - **`win`**, paid once at the end to the side that won and charged to the side that lost. The
 *   bar margin is already an outcome, but it is a *continuous* one, and Session 11 measured what
 *   that costs: at the settings this set landed, 493 of 1,024 random-pair bouts decide and the
 *   rest end on the clock with both bars up. A policy paid only in bar has no reason to prefer
 *   the last tenth that kills over the tenth before it. This is the term that says a kill is
 *   worth more than the damage it happens to be made of.
 * - **`clinch`**, charged a second spent inside their reach with nothing landing either way.
 * - **`idle`**, charged a metre of sideways travel while nothing is landing.
 *
 * **Both penalties are the tournament's own instruments and not a second definition of them.**
 * `clinchSeconds` and `idleTravelMetres` are columns `scripts/tournament-worker.mjs` has computed
 * off the sample loop since Session 00, from the ground positions and the shared quiet clock; the
 * rollout recorder charges the reward from those same accumulators, attributed to whichever ask
 * was open when the sample went by. So a policy that is paid to stop clinching is paid against
 * the number the league table will print about it, which is the only arrangement in which the
 * two can be read together.
 *
 * Both are *small* on purpose, for a reason this set has already been caught by: a policy paid to
 * stop clinching can stop clinching by standing at the far wall, which scores well on every
 * column here and is not a fighter. The bar margin has to stay the term that decides, so a run
 * reports what fraction of the return each penalty accounted for and a run where a penalty
 * dominated is a run to throw away.
 *
 * ## What is deliberately not here
 *
 * No shaping toward a stroke, a parry, a stand-off, a target or a contact speed. Those are the
 * decisions the policy exists to make, and a reward that named them would be a hand-coded style
 * with extra steps. The only things charged are two pathologies visible from outside the fight,
 * and the only thing paid is the fight's own outcome.
 */
export interface RewardTable {
  /** Paid to the winner at the last step and charged to the loser, in bar units. */
  readonly win: number;
  /** Charged a second of `clinchSeconds`, in bar units. */
  readonly clinch: number;
  /** Charged a metre of `idleTravelMetres`, in bar units. */
  readonly idle: number;
  /** Charged a second the clock runs, in bar units. Zero ships; the cap is not a cost. */
  readonly tick: number;
}

/**
 * The shipped coefficients.
 *
 * `win` 0.5 is half a bar: at Session 11's settings a decided bout leaves the winner about 0.45
 * of its own bar, so a win is worth about as much again as the margin that produced it and no
 * more. The two penalties are set so that a bout spent entirely in the pathology costs about a
 * tenth of a bar -- Session 08's league puts a clinch at 0.8-1.9 s a bout and idle travel at
 * 0.6-3.1 m, so 0.004 apiece is a small charge against a typical bout and a real one against the
 * bout that does nothing else. `tick` ships at zero because the 60 s cap is a measurement
 * artifact and not a thing a fighter should be taught to fear.
 */
const REWARD_TABLE = {
  win: 0.5,
  clinch: 0.004,
  idle: 0.004,
  tick: 0,
};

export const GOLEM_REWARD: RewardTable = REWARD_TABLE;

/**
 * One window between two asks, as the reward reads it.
 *
 * `dealt` and `taken` are Session 08's, unchanged and in bar units: what their bar lost and what
 * mine lost between this ask and the next. `outcome` is `+1` won, `-1` lost, `0` drawn, and is
 * read only on the window marked `done`.
 */
export interface RewardWindow {
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  /** Seconds of this window the clinch instrument counted, and metres the idle one did. */
  readonly clinchSeconds: number;
  readonly idleMetres: number;
  readonly done: boolean;
  readonly outcome: number;
}

/**
 * What one window pays.
 *
 * The first term is the whole of the return when the table's other three are zero, which is what
 * `tests/reward.test.mjs` asserts against a real bout: the undiscounted sum is the bar margin to
 * 1e-9. Everything else is subtracted from it and none of it telescopes, which is the honest
 * description of what shaping is.
 */
export function stepReward(window: RewardWindow, T: RewardTable = GOLEM_REWARD): number {
  let r = window.dealt - window.taken;
  r -= T.clinch * window.clinchSeconds;
  r -= T.idle * window.idleMetres;
  r -= T.tick * window.seconds;
  if (window.done) r += T.win * window.outcome;
  return r;
}

/** The reward with only its telescoping term, which is what the identity test measures. */
export const BARE_REWARD: RewardTable = Object.freeze({ win: 0, clinch: 0, idle: 0, tick: 0 });
