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
 * ## The three things Session 13 laid over it, and why they are not free
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
 * ## The four rows Session 06 of the learn set added, and the owner's eye that asked for them
 *
 * The style set shipped a mind and the owner watched it: it "mostly stays just out of reach or
 * hugs rather than fighting". Both of those habits were *already measured* -- `EngagementTracker`
 * in `src/engagement.ts` has counted `nearRangeStallSeconds` and `retreatOutsideReachSeconds`
 * since before the style set, and `scripts/tournament.mjs` printed both beside the shipped fit's
 * league row -- and the table above charged for neither. A pathology that a run reports and the
 * reward ignores is a pathology the fit is free to keep, which is the whole of why these exist.
 *
 * So: `stall` and `outside` are those two columns priced, `closing` pays the metre of radial
 * approach the same instrument already counts, and `swing` charges a stroke that finished and hit
 * nothing. Every one of them is **a coefficient on a quantity the tournament row already carries**,
 * which is the property that makes a table auditable against the row it was meant to move: a run
 * that halves its `nearRangeStallSeconds` under a non-zero `stall` moved the thing it was paid to
 * move, and a run that did not can be told apart from one that was never charged.
 *
 * **`closing` is the first row that *pays* rather than charges, and that is the interesting one.**
 * Every other term here is either the outcome or a subtraction, and in a mirrored bout the outcome
 * cancels: the record's finding is that the only part of a mirrored reward that survives averaging
 * is the part that charges for engaging. `closing` is the part that *pays* for engaging, and both
 * sides of a mirror can collect it at once -- two bodies walking into each other both close --
 * which is the one row in this file that can lift a mirrored return off zero by fighting.
 *
 * **`swing` is defined against a stroke that finished, and that distinction is not pedantry.**
 * Session 07 of the learn set probed the action surface over a uniform policy and found that
 * **99.2 % of strokes started are aborted**: the executor's `abort` gate closes over the stroke
 * before its arc runs. An empty-stroke count taken over strokes *started* is therefore a
 * measurement of that gate and of nothing else, and a reward charged from it would pay a policy to
 * stop asking rather than to stop missing. What is counted is a stroke that ran chamber, commit
 * and recover without an abort and recorded no contact -- a swing at the air, which is the thing
 * the row is named for.
 *
 * ## What is deliberately not here
 *
 * No shaping toward a stroke, a parry, a stand-off, a target or a contact speed. Those are the
 * decisions the policy exists to make, and a reward that named them would be a hand-coded style
 * with extra steps. What is charged is a pathology visible from outside the fight, what is paid is
 * the fight's own outcome, and `closing` -- a metre of ground given up towards the other body --
 * is the one term in between, which is why it ships at zero until a run says otherwise.
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
  /** **Paid** a metre of `radialClosingMetres`, in bar units. The one row that is a credit. */
  readonly closing: number;
  /** Charged a second of `nearRangeStallSeconds`, in bar units. */
  readonly stall: number;
  /** Charged a second of `retreatOutsideReachSeconds`, in bar units. */
  readonly outside: number;
  /** Charged a stroke that finished without an abort and landed no blow, in bar units. */
  readonly swing: number;
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
 *
 * `closing`, `stall`, `outside` and `swing` are **zero; Session 06 of the learn set**. That
 * session wrote the rows, gave them the flags that sweep them and ran five arms of the shipped
 * league over them, and the shipped table deliberately did not move in the session that added
 * them: a coefficient the record has not chosen is a guess, and a guess that ships is a guess
 * nobody can tell from a measurement afterwards. The arm that chose each value is recorded here
 * once one has.
 */
const REWARD_TABLE = {
  win: 0.5,
  clinch: 0.004,
  idle: 0.004,
  tick: 0,
  closing: 0,
  stall: 0,
  outside: 0,
  swing: 0,
};

export const GOLEM_REWARD: RewardTable = REWARD_TABLE;

/**
 * One window between two asks, as the reward reads it.
 *
 * `dealt` and `taken` are Session 08's, unchanged and in bar units: what their bar lost and what
 * mine lost between this ask and the next. `outcome` is `+1` won, `-1` lost, `0` drawn, and is
 * read only on the window marked `done`.
 *
 * Every field is a *quantity* and no field is a reward: the coefficients live in the table and
 * this is what they multiply. That split is what lets one collected rollout be re-priced under a
 * different table without a single bout being replayed, which is the only reason a reward arm is
 * a flag rather than a rebuild -- `mergeRollouts` in `scripts/train-ppo.mjs` is where the two
 * halves meet.
 */
export interface RewardWindow {
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  /** Seconds of this window the clinch instrument counted, and metres the idle one did. */
  readonly clinchSeconds: number;
  readonly idleMetres: number;
  /**
   * The four quantities Session 06 of the learn set priced, over this window and no other.
   *
   * The first three are `EngagementTracker`'s own accumulators differenced ask to ask -- not a
   * second definition of them, the same reading the tournament row prints -- and `emptyStrokes`
   * counts strokes that finished in this window having recorded no contact. All four are charged
   * to whichever ask was open when the sample went by, exactly as `clinchSeconds` and
   * `idleMetres` are, so a policy is paid against the number a league table prints about it.
   */
  readonly closingMetres: number;
  readonly stallSeconds: number;
  readonly outsideSeconds: number;
  readonly emptyStrokes: number;
  readonly done: boolean;
  readonly outcome: number;
}

/**
 * What one window pays.
 *
 * The first term is the whole of the return when every other row of the table is zero, which is
 * what `tests/reward.test.mjs` asserts against a real bout: the undiscounted sum is the bar margin
 * to 1e-9. Everything else is laid over it and none of it telescopes, which is the honest
 * description of what shaping is.
 *
 * `shaped` is written as one expression rather than folded into the running total a row at a time,
 * because it is the whole of what this file adds to the outcome and a reader auditing a table
 * against the behaviour it was meant to move should be able to see all of it at once. Three of its
 * four terms are subtractions and `closing` is not; the sign of each row is the row's whole
 * argument, and it is stated here and in `RewardTable` rather than only in a comment.
 */
export function stepReward(window: RewardWindow, T: RewardTable = GOLEM_REWARD): number {
  let r = window.dealt - window.taken;
  r -= T.clinch * window.clinchSeconds;
  r -= T.idle * window.idleMetres;
  r -= T.tick * window.seconds;
  const shaped = T.closing * window.closingMetres
    - T.stall * window.stallSeconds - T.outside * window.outsideSeconds
    - T.swing * window.emptyStrokes;
  r += shaped;
  if (window.done) r += T.win * window.outcome;
  return r;
}

/** The reward with only its telescoping term, which is what the identity test measures. */
export const BARE_REWARD: RewardTable = Object.freeze({
  win: 0, clinch: 0, idle: 0, tick: 0, closing: 0, stall: 0, outside: 0, swing: 0,
});
