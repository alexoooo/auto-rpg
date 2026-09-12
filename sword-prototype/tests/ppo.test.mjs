// The trainer: the surrogate, the advantage, the artifact, and one problem it is known to solve.
// Session 13 of the style set.
//
// **The rule this directory keeps applies with a vengeance here.** A trainer is the easiest thing
// in this tree to write a green test for that asserts nothing: a fit that ran without throwing is
// not a fit that learned, and a loss that fell is not a policy that improved. So what is asserted
// is arithmetic against an independent computation wherever there is one -- the gradient against
// central differences of the very function it claims to be the gradient of, the advantage against
// three transitions worked by hand -- and, once, against a problem whose answer is known before
// the run starts.
//
// The two-dimensional bandit at the end is the one test that would catch a trainer that is
// internally consistent and still wrong: every piece can be individually correct and the loop
// around them still not move a policy toward reward. It is deliberately not an arena -- there is
// no physics, no opponent and no credit assignment over time, so a failure is a failure of this
// file's code and of nothing else.
//
// **Ten mutations were watched red on 2026-09-08**, each applied alone and then restored. The
// last three are Session 14's, added when the calibration made the reward table, the opponent and
// the pool into knobs:
//
// | mutation in `scripts/train-ppo.mjs` | what went red |
// |---|---|
// | drop the minus from the surrogate's gradient, so the loss is the objective | both gradient tests and the bandit |
// | take the gradient whether or not the clip is binding (`active` always true) | the clip test |
// | `advantages` bootstraps `V(s_T)` at a terminal step instead of zero | the GAE tests |
// | `advantages` discounts by `lambda` alone, dropping `gamma` from the recursion | the GAE tests |
// | `mergeRollouts` reads the outcome as `winner === "left"` rather than as the pack's own side | the outcome test |
// | `extendNormalisation` averages the two variances instead of composing them | the normalisation test |
// | the trust region never fires, so a fit always runs every epoch | the target-KL test and the bandit |
// | `mergeRollouts` ignores its table and always pays `GOLEM_REWARD` | the swept-table test |
// | `rolloutPairs` returns one ordered pair against a named opponent instead of both | the corner test |
// | `poolFor` filters on the *primary* terminal rather than the armed one | the pool test |
// | `poolFor` still defaults to the whole pool, so the learn set's first frozen choice is off | the pool test |
// | `poolFor` ignores `mirror`, so a mirrored rollout collects on bodies that cannot finish themselves | the pool test |
// | `adamToJson` rounds the moments to five places, as the weights beside them are rounded | the resumed-fit test |
// | `momentsFromJson` returns cold state for a block it was given | the resumed-fit test |
// | `resumesOwnLog` compares the two file names rather than resolving both paths | the resume-path test |
//
// **Four more were watched red on 2026-09-09**, when Session 05 of the learn set put the fit on
// worker threads, and they are mutations of `scripts/fit-worker.mjs` as well as of the trainer:
//
// | mutation | what went red |
// |---|---|
// | `shardStep` scales by its own slice rather than by the whole minibatch | the sharded-equality test |
// | `FitPool.bind` sends `freshNormalisation` instead of the run's frozen one | the sharded-equality test, and only because its rollout is normalised |
// | the trust region is evaluated on a shard's own KL rather than the minibatch's | the sharded trust-region test, and the equality test with it |
// | `shardSlice` gives every shard `floor(length / shards)`, dropping the remainder | the slice test alone, because a minibatch that divides evenly cannot see it |
//
// **Three more were watched red on 2026-09-11**, when Session 03 of the signal set put a floor
// under a fitted variance. The first is the defect itself, restated as a mutation:
//
// | mutation | what went red |
// |---|---|
// | `normalise` drops the dead-column branch, so a zero variance divides by a ten-thousandth | the dead-column test, and the shipped table's pin in `tests/policy-perception.test.mjs` |
// | `normalise` floors at `<=` rather than `<`, so a variance exactly at the constant is dead | the dead-column test, on the column that sits on the bound |
// | `extendNormalisation` writes a sub-floor variance as it computed it | the written-variance test, and nothing else, because the reader floors it anyway |
//
// **One property this file deliberately cannot test is the one the design turns on.** `FitPool`
// sums its shards' partials in shard order 0..K-1, and a pool that summed them in the order they
// finished would still pass every assertion below -- reassociating a sum of a thousand doubles
// moves it in its last bits and the bar is 1e-9. What a completion order would cost is
// *reproducibility*: the same seed would answer differently on a busy host. So the order is a
// property of the code and is argued where the code is, and this note is here so that a later
// reader does not conclude from a green suite that it did not matter.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { forward, initWeights, netScratch, netSize } from "../src/golem/neural-net.ts";
import {
  ACTION_AXES, ACTION_GATES, ACTION_WIDTH, DEAD_VARIANCE, GAUSSIAN_HEAD, HEAD_BINS, POLICY_LAYOUT,
  POLICY_VERSION, POLICY_VERSIONS_READ, SIGMA_FLOOR, SIGMA_ROOF, VALUE_LAYOUT, actionEntropy,
  actionLogProb, axisLogSigma, binCentre, binOf, checkPolicyWeights, commandFromAction,
  freshNormalisation, freshPolicyTable, golemPolicy, headSpecOf, meanAction, normalise,
  policyLayout, sampleAction, uniformPilot,
} from "../src/golem/policy.ts";
import { POLICY_WEIGHTS } from "../src/golem/policy-weights.ts";
import { COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, freshCommand } from "../src/golem/tactics-v4.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { PILOT_FEATURE_COUNT, PILOT_FEATURE_COUNT_V2 } from "../src/golem/pilot.ts";
import { policyMind } from "../src/mind.ts";
import { policyForUnit } from "../src/units.ts";
import { mulberry32 } from "../src/rng.ts";
import {
  FIT_NAME, FitPool, GAUSSIAN_ENTROPY_OFFSET, MIRROR_SHARE_TOLERANCE, PACK_COLUMNS, RATING_POOLS,
  SCHEDULE_OPPONENTS, SHAPING_ROWS, advantages,
  boutSplit, checkEntropyTarget, checkMirrorShare, checkpointFor, cohensD, contenderShape,
  explainedVariance, extendNormalisation,
  mergeRollouts, mixedSchedule, momentsFromJson, momentsToJson, opponentOf, parseEntropyStage,
  parseOpponentStage, parseSchedule, parseSeparationStage, parseTactics, parseTerminals,
  parseTerminalsStage, poolFor, poolWord, ppoFit, ratePolicy, ratingSeed, realisedMirrorShare,
  renderPolicyModule, resumesOwnLog, rolloutPairs, scheduled, surrogateGrad, surrogateObjective,
} from "../scripts/train-ppo.mjs";
import { CONFIG } from "../src/config.ts";
import { shardSlice } from "../scripts/fit-worker.mjs";
import { armedTerminal, buildPool } from "../scripts/tournament.mjs";
import { VIABLE_TERMINALS, viableBuild, viableMirror, viablePair } from "../src/golem/viability.ts";

const SEED = 20260913;

// ---------------------------------------------------------------------------------------
// The surrogate.
// ---------------------------------------------------------------------------------------

/** A small head and a small action, so a difference quotient is not swamped by the arithmetic. */
function bench(seed, { inputs = 5, hidden = [7] } = {}) {
  const layout = { inputs, hidden, outputs: ACTION_WIDTH };
  const weights = initWeights(layout, seed);
  const scratch = netScratch(layout);
  const random = mulberry32(seed);
  const input = Float64Array.from({ length: inputs }, () => random() * 2 - 1);
  const logSigma = Float64Array.from({ length: ACTION_AXES }, () => -0.6 + random() * 0.4);
  const action = new Float64Array(ACTION_WIDTH);
  const head = forward(layout, weights, input, scratch);
  const oldLogp = sampleAction(head, logSigma, random, action);
  return { layout, weights, scratch, input, logSigma, action, oldLogp };
}

/**
 * The gradient with respect to `logSigma`, against central differences of the objective.
 *
 * `logSigma` is a parameter and not an output, so its gradient is the one that never passes
 * through the network and would go unnoticed by any check that only differences the weights. Both
 * halves of it are here: the Gaussian's, which moves the spread, and the entropy bonus's, which
 * is the only thing holding the spread up at all.
 */
test("the_surrogates_gradient_in_the_spread_is_its_central_difference", () => {
  const { layout, weights, scratch, input, logSigma, action, oldLogp } = bench(SEED);
  const knobs = { clip: 0.2, entropy: 0.01 };
  const adv = 0.7;
  const head = forward(layout, weights, input, scratch);
  const delta = new Float64Array(ACTION_WIDTH);
  const sigmaGrad = new Float64Array(ACTION_AXES);
  const term = surrogateGrad(head, logSigma, action, oldLogp, adv, knobs, 1, delta, sigmaGrad);
  assert.ok(term.active, "the bench sample is meant to sit inside the clip");
  assert.ok(Math.abs(term.ratio - 1) < 1e-12, "the bench head is the collecting head");
  const h = 1e-6;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const was = logSigma[j];
    logSigma[j] = was + h;
    const up = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs);
    logSigma[j] = was - h;
    const down = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs);
    logSigma[j] = was;
    // The gradient accumulated is of the *loss*, which is the objective's negative.
    const numeric = -(up - down) / (2 * h);
    assert.ok(Math.abs(sigmaGrad[j] - numeric) < 1e-5 * (1 + Math.abs(numeric)),
      `spread ${j}: analytic ${sigmaGrad[j]}, numeric ${numeric}`);
  }
});

/**
 * The gradient with respect to the head's own twelve outputs, against central differences.
 *
 * The nine means and the three gate logits are different arithmetic -- a Gaussian's score and a
 * Bernoulli's -- and a sign error in either is invisible in a training curve. Differencing the
 * head rather than the weights is the sharper test: `backwardFrom` is `neural-net.ts`'s and has
 * its own check, and what is new in this session is the twelve numbers handed to it.
 */
test("the_surrogates_gradient_in_the_head_is_its_central_difference", () => {
  const { layout, weights, scratch, input, logSigma, action, oldLogp } = bench(SEED + 5);
  const knobs = { clip: 0.2, entropy: 0.01 };
  const adv = -1.3;
  const head = Float64Array.from(forward(layout, weights, input, scratch));
  const delta = new Float64Array(ACTION_WIDTH);
  const sigmaGrad = new Float64Array(ACTION_AXES);
  surrogateGrad(head, logSigma, action, oldLogp, adv, knobs, 1, delta, sigmaGrad);
  const h = 1e-6;
  for (let j = 0; j < ACTION_WIDTH; j += 1) {
    const was = head[j];
    head[j] = was + h;
    const up = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs);
    head[j] = was - h;
    const down = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs);
    head[j] = was;
    const numeric = -(up - down) / (2 * h);
    assert.ok(Math.abs(delta[j] - numeric) < 1e-5 * (1 + Math.abs(numeric)),
      `output ${j}: analytic ${delta[j]}, numeric ${numeric}`);
  }
});

/**
 * The clip, which is the whole point of the surrogate: past the bound the head takes no gradient.
 *
 * Moved there by hand rather than by training to it -- the head is displaced until the ratio is
 * outside `1 + clip` with a positive advantage, which is the case the clip exists for: the policy
 * has already moved as far toward this action as the batch is allowed to license.
 */
test("a_ratio_past_the_clip_takes_no_gradient_but_still_pays_the_entropy", () => {
  const { layout, weights, scratch, input, logSigma, action, oldLogp } = bench(SEED + 9);
  const knobs = { clip: 0.2, entropy: 0.01 };
  const head = Float64Array.from(forward(layout, weights, input, scratch));
  // Walk the first mean toward the action until the density there is more than 1.2 times what it
  // was; the ratio is a smooth function of that one number and this is the shortest way to it.
  let ratio = 1;
  for (let step = 0; step < 200 && ratio < 1.3; step += 1) {
    head[0] += 0.02 * Math.sign(action[0] - head[0]);
    ratio = Math.exp(actionLogProb(head, logSigma, action) - oldLogp);
  }
  assert.ok(ratio > 1 + knobs.clip, `the head only reached a ratio of ${ratio}`);
  const withGradient = new Float64Array(ACTION_WIDTH);
  const withSpread = new Float64Array(ACTION_AXES);
  const clipped = surrogateGrad(head, logSigma, action, oldLogp, 1, knobs, 1, withGradient, withSpread);
  assert.equal(clipped.active, false, "a ratio past the clip with a positive advantage took the gradient");
  // What is left is the entropy bonus alone, which is what an entropy-only pass writes.
  const onlyEntropy = new Float64Array(ACTION_WIDTH);
  const onlySpread = new Float64Array(ACTION_AXES);
  surrogateGrad(head, logSigma, action, oldLogp, 0, knobs, 1, onlyEntropy, onlySpread);
  for (let j = 0; j < ACTION_WIDTH; j += 1) {
    assert.ok(Math.abs(withGradient[j] - onlyEntropy[j]) < 1e-12, `output ${j} kept a surrogate gradient`);
  }
  for (let j = 0; j < ACTION_AXES; j += 1) {
    assert.ok(Math.abs(withSpread[j] - onlySpread[j]) < 1e-12, `spread ${j} kept a surrogate gradient`);
  }
  // The same ratio with a *negative* advantage is the other side of the min and does take it.
  const negative = surrogateGrad(head, logSigma, action, oldLogp, -1, knobs, 1,
    new Float64Array(ACTION_WIDTH), new Float64Array(ACTION_AXES));
  assert.equal(negative.active, true, "the clip refused a gradient that pulls back toward the batch");
});

// ---------------------------------------------------------------------------------------
// The advantage.
// ---------------------------------------------------------------------------------------

/**
 * GAE over three transitions, against the arithmetic done by hand.
 *
 * Half a second a step at a half-life of one second is `gamma = 2^-0.5`, which is an awkward
 * enough number that a wrong discount cannot coincide with the right one. The last step is
 * terminal, so the value after it is zero rather than bootstrapped -- see the trainer's note on
 * why this arena has no truncation to bootstrap for.
 */
test("gae_over_three_transitions_is_the_recursion_worked_by_hand", () => {
  const rollout = {
    count: 3, width: 1,
    reward: Float64Array.from([0.2, -0.1, 0.5]),
    seconds: Float64Array.from([0.5, 0.5, 0.5]),
    done: Uint8Array.from([0, 0, 1]),
  };
  const values = Float64Array.from([0.4, 0.3, 0.1]);
  const halfLife = 1;
  const lambda = 0.9;
  const g = Math.pow(2, -0.5);
  const d2 = 0.5 + g * 0 - 0.1;
  const d1 = -0.1 + g * 0.1 - 0.3;
  const d0 = 0.2 + g * 0.3 - 0.4;
  const a2 = d2;
  const a1 = d1 + g * lambda * a2;
  const a0 = d0 + g * lambda * a1;
  const { advantage, returns } = advantages(rollout, values, { halfLife, lambda });
  for (const [i, want] of [[0, a0], [1, a1], [2, a2]]) {
    assert.ok(Math.abs(advantage[i] - want) < 1e-12, `advantage ${i}: ${advantage[i]} against ${want}`);
    assert.ok(Math.abs(returns[i] - (want + values[i])) < 1e-12, `return ${i}: ${returns[i]}`);
  }
  // Two episodes do not leak into one another: the same three steps with the middle one terminal
  // give the first episode nothing of the second's.
  const split = { ...rollout, done: Uint8Array.from([0, 1, 1]) };
  const cut = advantages(split, values, { halfLife, lambda });
  assert.ok(Math.abs(cut.advantage[1] - (-0.1 - 0.3)) < 1e-12, `the terminal step bootstrapped: ${cut.advantage[1]}`);
  assert.ok(Math.abs(cut.advantage[0] - (d0 + g * lambda * (-0.4))) < 1e-12, `${cut.advantage[0]}`);
  assert.ok(Math.abs(cut.advantage[2] - a2) < 1e-12);
});

/** A zero half-life is a myopic return, and a very long one an undiscounted sum of the rewards. */
test("the_half_life_spans_from_myopic_to_undiscounted", () => {
  const rollout = {
    count: 4, width: 1,
    reward: Float64Array.from([0.1, 0.2, 0.3, 0.4]),
    seconds: Float64Array.from([1, 1, 1, 1]),
    done: Uint8Array.from([0, 0, 0, 1]),
  };
  const values = new Float64Array(4);
  const patient = advantages(rollout, values, { halfLife: 1e6, lambda: 1 });
  assert.ok(Math.abs(patient.returns[0] - 1.0) < 1e-5, `${patient.returns[0]} is not the whole sum`);
  const myopic = advantages(rollout, values, { halfLife: 1e-6, lambda: 1 });
  for (let i = 0; i < 4; i += 1) {
    assert.ok(Math.abs(myopic.returns[i] - rollout.reward[i]) < 1e-9, `${myopic.returns[i]}`);
  }
});

/** Explained variance is 1 for an exact critic, 0 for one that only knows the mean, negative below. */
test("explained_variance_reads_the_way_its_name_says", () => {
  const returns = Float64Array.from([1, 2, 3, 4]);
  assert.ok(Math.abs(explainedVariance(Float64Array.from([1, 2, 3, 4]), returns) - 1) < 1e-12);
  assert.ok(Math.abs(explainedVariance(Float64Array.from([2.5, 2.5, 2.5, 2.5]), returns)) < 1e-12);
  assert.ok(explainedVariance(Float64Array.from([4, 3, 2, 1]), returns) < 0);
});

// ---------------------------------------------------------------------------------------
// The rollout, and the statistics frozen into the artifact.
// ---------------------------------------------------------------------------------------

/** A pilot pack, small enough to write out by hand. */
function pack(side, winner, rewards) {
  const n = rewards.length;
  return {
    kind: "pilot", side, winner,
    x: new Float32Array(n * PILOT_FEATURE_COUNT),
    a: new Float64Array(n * ACTION_WIDTH),
    logp: Float64Array.from({ length: n }, (_, i) => -(i + 1)),
    dealt: Float64Array.from(rewards),
    taken: new Float64Array(n),
    seconds: Float64Array.from({ length: n }, () => 0.0833),
    clinch: new Float64Array(n),
    idle: new Float64Array(n),
    closing: new Float64Array(n),
    stall: new Float64Array(n),
    outside: new Float64Array(n),
    swing: new Float64Array(n),
    done: Uint8Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)),
    margin: rewards.reduce((a, b) => a + b, 0),
  };
}

/** A whole table, so a case can name only the rows it is about; a partial one prices to `NaN`. */
const table = (over) => ({
  win: 0, clinch: 0, idle: 0, tick: 0, closing: 0, stall: 0, outside: 0, swing: 0, ...over,
});

/**
 * The outcome is the pack's own side's, which is the one thing two mirrored packs disagree about.
 *
 * Self-play records both sides of every bout, so half of every rollout is the loser's half, and a
 * trainer that read `winner` without asking which side it is holding would pay the win term to
 * both. The two packs here have the same rewards and opposite outcomes for exactly that reason.
 */
test("a_rollout_pays_the_win_term_to_the_side_that_won_and_charges_the_other", () => {
  const won = pack("left", "left", [0.1, 0.2]);
  const lost = pack("right", "left", [0.1, 0.2]);
  const drawn = pack("left", null, [0.1, 0.2]);
  const merged = mergeRollouts([won, lost, drawn]);
  assert.equal(merged.count, 6);
  assert.equal(merged.episodes, 3);
  assert.ok(Math.abs(merged.reward[1] - (0.2 + GOLEM_REWARD.win)) < 1e-12, `${merged.reward[1]}`);
  assert.ok(Math.abs(merged.reward[3] - (0.2 - GOLEM_REWARD.win)) < 1e-12, `${merged.reward[3]}`);
  assert.ok(Math.abs(merged.reward[5] - 0.2) < 1e-12, `a draw was paid ${merged.reward[5]}`);
  // The non-terminal steps are the bare margin whatever the outcome was.
  for (const i of [0, 2, 4]) assert.ok(Math.abs(merged.reward[i] - 0.1) < 1e-12, `${merged.reward[i]}`);
  assert.deepEqual(Array.from(merged.done), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(Array.from(merged.logp), [-1, -2, -1, -2, -1, -2],
    "the packs' log-probabilities were not laid end to end");
});

/**
 * A swept table pays the same collected bouts differently, and the charge is reported apart.
 *
 * Session 14's calibration is a sweep over coefficients that had been argued and never moved, and
 * the only reason it can be a flag rather than a rebuild is that the reward is applied here, in
 * the main thread, to packs that carry every quantity in `PACK_COLUMNS` raw. This pins that: one
 * pack, three tables, three answers -- and `penalty` counting the clock alongside the older
 * charges, so a run under a non-zero `tick` reports the share its shaping actually took.
 *
 * Session 06 of the learn set added four rows and one property worth stating on its own:
 * `closing` is a *credit*, so it lowers `penalty` by exactly what it raises the reward. A share
 * that took an absolute value per row would report a run as more shaped the more it was paid to
 * fight, which is the opposite of what the share exists to warn about.
 */
test("a_rollout_pays_the_table_it_is_given_and_reports_every_charge_in_it", () => {
  const raw = pack("left", "left", [0.1, 0.2]);
  raw.clinch = Float64Array.from([1, 0]);
  raw.idle = Float64Array.from([0, 2]);
  raw.seconds = Float64Array.from([0.5, 0.25]);
  raw.closing = Float64Array.from([0.75, 0]);
  raw.stall = Float64Array.from([0, 1.5]);
  raw.outside = Float64Array.from([2.5, 0]);
  raw.swing = Float64Array.from([0, 3]);

  const bare = mergeRollouts([raw], table({}));
  assert.ok(Math.abs(bare.reward[0] - 0.1) < 1e-12, `${bare.reward[0]}`);
  assert.ok(Math.abs(bare.reward[1] - 0.2) < 1e-12, "the win term was paid by a table that is all zeros");
  for (const i of [0, 1]) assert.equal(bare.penalty[i], 0);

  // The same two asks under a table with every row non-zero, each term checked on its own ask.
  const T = table({
    win: 2, clinch: 0.01, idle: 0.02, tick: 0.008,
    closing: 0.4, stall: 0.1, outside: 0.05, swing: 0.02,
  });
  const full = mergeRollouts([raw], T);
  assert.ok(Math.abs(full.reward[0] - (0.1 - 0.01 - 0.008 * 0.5 + 0.4 * 0.75 - 0.05 * 2.5)) < 1e-12,
    `${full.reward[0]}`);
  assert.ok(Math.abs(full.reward[1] - (0.2 - 0.04 - 0.008 * 0.25 - 0.1 * 1.5 - 0.02 * 3 + 2)) < 1e-12,
    `${full.reward[1]}`);
  // `penalty` is what the shaping rows took and never the win, which is the outcome and not shaping.
  assert.ok(Math.abs(full.penalty[0] - (0.01 + 0.008 * 0.5 - 0.4 * 0.75 + 0.05 * 2.5)) < 1e-12,
    `${full.penalty[0]}`);
  assert.ok(Math.abs(full.penalty[1] - (0.04 + 0.008 * 0.25 + 0.1 * 1.5 + 0.02 * 3)) < 1e-12,
    `the win term was counted as a penalty: ${full.penalty[1]}`);
  // And the split by row sums back to it, which is what `episodeReturns` divides to get a share.
  for (const i of [0, 1]) {
    const summed = SHAPING_ROWS.reduce((total, row) => total + full.charges[row][i], 0);
    assert.ok(Math.abs(summed - full.penalty[i]) < 1e-12, `ask ${i}: ${summed} against ${full.penalty[i]}`);
  }
  assert.ok(Math.abs(full.charges.closing[0] - -0.4 * 0.75) < 1e-12,
    `closing is a credit and was booked as ${full.charges.closing[0]}`);
  assert.ok(Math.abs(full.charges.swing[1] - 0.02 * 3) < 1e-12, `${full.charges.swing[1]}`);

  // No table at all is the shipped table, so every caller that does not care reads as it did.
  const shipped = mergeRollouts([raw]);
  assert.ok(Math.abs(shipped.reward[1] - (0.2 - 2 * GOLEM_REWARD.idle + GOLEM_REWARD.win)) < 1e-12,
    `${shipped.reward[1]}`);
});

/**
 * A pack written by an older worker is refused by column name, before a single reward is priced.
 *
 * The failure this replaces is silent and expensive rather than loud: `undefined` times a
 * coefficient is `NaN`, one `NaN` reward poisons every advantage in its episode through the
 * backwards discount in `advantages`, and what a run reports is a fit that has quietly stopped
 * learning with no error anywhere in the log. Refusing by *name* is what makes the message
 * actionable -- the column named says which session the pack predates -- and the length check
 * beside it catches the other shape of the same defect, a column that exists and is not one an ask.
 */
test("a_rollout_refuses_a_pack_that_is_missing_a_column_by_the_name_of_the_column", () => {
  for (const column of PACK_COLUMNS) {
    const short = pack("left", "left", [0.1, 0.2]);
    delete short[column];
    assert.throws(() => mergeRollouts([short]), new RegExp(`no "${column}" column`),
      `a pack with no ${column} was priced`);
  }
  const ragged = pack("left", "left", [0.1, 0.2]);
  ragged.stall = new Float64Array(5);
  assert.throws(() => mergeRollouts([ragged]), /"stall" column is 5 long over 2 asks/);
  // And a whole pack still prices, so the refusal is not simply refusing everything.
  assert.equal(mergeRollouts([pack("left", "left", [0.1, 0.2])]).count, 2);
});

/**
 * Against a named opponent the fit is collected from both corners, and against itself from one.
 *
 * A pairing draws its build before `scheduleJobs` swaps the sides, so the swap balances the
 * corners within a pairing and not across the pool: an odd cycle would put the fit on the left
 * for the first draw, the right for the second, and -- since the cycle length divides the
 * schedule -- in a fixed corner for every *repeat* of a body. Two pairs make the cycle even.
 */
test("a_rollout_against_an_opponent_is_collected_from_both_corners", () => {
  assert.deepEqual(rolloutPairs("fit", null), [["fit", "fit"]]);
  const pairs = rolloutPairs("fit", "golem-driver");
  assert.equal(pairs.length, 2, "the fit sat in one corner of every pairing");
  assert.deepEqual(pairs, [["fit", "golem-driver"], ["golem-driver", "fit"]]);
  for (const corner of [0, 1]) {
    assert.equal(pairs.filter((pair) => pair[corner] === "fit").length, 1);
  }
});

/**
 * The decisive-pool filter keeps the weapon and not the hand it happens to be in.
 *
 * A build with a capped primary fights with its secondary, and `armedTerminal` is the function
 * that knows it -- `buildClass` and the whole rating table are keyed through it. A filter that
 * read `primary.terminal` instead would silently drop every capped-primary maul from a run whose
 * whole point is that mauls are the bodies that can finish, and nothing downstream would say so.
 */
test("the_decisive_pool_keeps_the_armed_hand_and_not_the_primary", () => {
  const seed = 20260906;
  const whole = poolFor({ seed, random: 40, terminals: ["all"] });
  assert.deepEqual(whole.map((b) => b.name), buildPool({ seed, random: 40 }).map((b) => b.name),
    "`all` is the word for the whole pool");

  const heavy = poolFor({ seed, random: 40, terminals: ["maul", "mace"] });
  assert.ok(heavy.length > 0 && heavy.length < whole.length, `${heavy.length} of ${whole.length}`);
  for (const build of heavy) {
    assert.ok(["maul", "mace"].includes(armedTerminal(build.setup)), build.caption);
  }
  // Every maul and mace in the whole pool is in it, capped primaries included.
  const wanted = whole.filter((b) => ["maul", "mace"].includes(armedTerminal(b.setup)));
  assert.deepEqual(heavy.map((b) => b.name), wanted.map((b) => b.name));
  assert.ok(wanted.some((b) => b.setup.primary.terminal === "none"),
    "the fixture has no capped-primary build, so this test cannot see the defect it is for");

  assert.throws(() => poolFor({ seed, random: 0, terminals: ["trebuchet"] }), /no build in the pool/);
});

/**
 * The pool a run draws by default is the viable one, and the whole pool has a word.
 *
 * The learn set's first frozen choice, and it is a *default* rather than a flag because the flag
 * already existed and no run passed it. What this asserts is the direction of the default -- an
 * absent `terminals` is `VIABLE_TERMINALS` and not a hard-coded fifty-two -- and that the word
 * back is exactly `all`, since a run that meant the whole pool and got the viable one would report
 * a number about a pool it never measured.
 *
 * **On the table Session 01 measured the two pools are the same fifty-two builds**, because every
 * class on the shelf is viable -- the maul decides against all seven, so the second admission rule
 * admitted all seven. That is asserted, not glossed: this is the test that would have caught a
 * default silently doing nothing, so it says so out loud, and a re-measurement that refuses a
 * class turns the second assertion red rather than quietly making the default matter again.
 *
 * **The mirrored pool is where the predicate does cut**, and the second half of this test is about
 * it: an iteration's rollouts put one build in both corners, so the pool is the fifteen builds
 * `viableMirror` accepts and not the fifty-two. `all` has to restore the mirror too, or the
 * close-out's whole-pool table cannot be taken in the arrangement every other table was taken in.
 */
test("the_default_pool_is_the_viable_one_and_all_is_the_word_back_to_the_whole_pool", () => {
  const seed = 20260906;
  const whole = poolFor({ seed, random: 40, terminals: ["all"] });
  const byDefault = poolFor({ seed, random: 40 });
  assert.ok(byDefault.length > 0, `${byDefault.length} of ${whole.length}`);
  assert.equal(byDefault.length, whole.length,
    "the measured class table admits every class, so the default cuts nothing");
  for (const build of byDefault) assert.ok(viableBuild(build.setup), build.caption);
  assert.deepEqual(byDefault.map((b) => b.name),
    whole.filter((b) => viableBuild(b.setup)).map((b) => b.name),
    "every viable build in the pool is in it, and nothing else");
  assert.deepEqual(byDefault, poolFor({ seed, random: 40, terminals: [...VIABLE_TERMINALS] }));

  // And the pool a *mirrored* run draws, which is where the predicate stopped being decorative.
  // Both corners hold one build, so the question is `viableMirror` and not `viableBuild`, and the
  // two answers are as far apart as this module gets: none refused against thirty-seven.
  const mirrored = poolFor({ seed, random: 40, mirror: true });
  assert.deepEqual(mirrored.map((b) => b.name), whole.filter((b) => viableMirror(b.setup)).map((b) => b.name),
    "exactly the builds whose mirror is viable, and nothing else");
  assert.equal(mirrored.length, 15, `${mirrored.length} of ${whole.length}`);
  for (const build of mirrored) {
    assert.ok(["maul", "mace"].includes(armedTerminal(build.setup)), build.caption);
    assert.ok(viablePair(build.setup, build.setup), build.caption);
  }
  // `all` restores the whole pool for the mirror too, which is the word the close-out's table needs.
  assert.deepEqual(poolFor({ seed, random: 40, terminals: ["all"], mirror: true }).map((b) => b.name),
    whole.map((b) => b.name));
  assert.deepEqual(poolFor({ seed, random: 40, terminals: [], mirror: true }).map((b) => b.name),
    whole.map((b) => b.name), "the empty list is still the whole pool, mirrored or not");
  // A class narrowed to one that cannot mirror is refused by name rather than rated for a night.
  assert.throws(() => poolFor({ seed, random: 40, terminals: ["blade"], mirror: true }),
    /no build armed with blade can finish a copy of itself/);
  // The empty list still means the whole pool, unchanged: `POLICY_WEIGHTS` carries one from the
  // run that fitted it, and reinterpreting that field would rewrite a shipped table's header.
  assert.deepEqual(poolFor({ seed, random: 40, terminals: [] }).map((b) => b.name),
    whole.map((b) => b.name));

  // And the flag: no flag is the viable set, `all` is the whole pool, a typo is refused by name.
  assert.deepEqual(parseTerminals(null), [...VIABLE_TERMINALS]);
  assert.deepEqual(parseTerminals("all"), ["all"]);
  assert.deepEqual(parseTerminals(" maul , Mace "), ["maul", "mace"]);
  assert.throws(() => parseTerminals(" , "), /--terminals wants weapon classes/);
  assert.throws(() => parseTerminals("maul,maul"), /repeats a class/);
  assert.throws(() => parseTerminals("all,maul"), /cannot be narrowed/);
  assert.throws(() => poolFor({ seed, random: 40, terminals: parseTerminals("malu") }),
    /no build in the pool is armed with malu/);
});

/**
 * The curriculum grammar: stages, the value in force at an iteration, and the three refusals.
 *
 * The claim worth asserting is not that the parser parses -- it is that a constant and a one-stage
 * schedule are the *same object*, because that is what lets `--separation 1.2` and
 * `--separation-schedule 1.2:0` be one run rather than two runs that happen to fight the same
 * bouts. A header carrying the raw text would differ between them and a reader six months later
 * would have to decide whether that mattered.
 *
 * The boundaries are checked on both sides of every stage, which is the half of `scheduled` a
 * fencepost error lives in: a stage that began at 20 must be in force *at* 20 and not at 19.
 */
test("a_schedule_is_stages_a_constant_is_one_stage_and_the_value_in_force_changes_at_the_boundary", () => {
  assert.deepEqual(parseSchedule("1.0:0,2.5:20,4.0:40", Number),
    [{ from: 0, value: 1 }, { from: 20, value: 2.5 }, { from: 40, value: 4 }]);
  // A single value with no boundary is a constant from iteration zero, and is exactly what
  // writing the boundary out gives, which is the whole of "the old flags stay".
  assert.deepEqual(parseSchedule("1.2", Number), [{ from: 0, value: 1.2 }]);
  assert.deepEqual(parseSchedule("1.2", Number), parseSchedule("1.2:0", Number));
  assert.equal(parseSchedule(null, Number), null);

  const stages = parseSchedule("1.0:0,2.5:20,4.0:40", Number);
  assert.deepEqual([0, 1, 19, 20, 21, 39, 40, 41, 600].map((i) => scheduled(stages, i)),
    [1, 1, 1, 2.5, 2.5, 2.5, 4, 4, 4]);
  assert.equal(scheduled(parseSchedule("1.2", Number), 93), 1.2, "a constant is a constant forever");
  assert.throws(() => scheduled([], 0), /and was handed none/);

  // A schedule that runs backwards, or restates a boundary, is refused: whichever stage won would
  // be an implementation detail standing where a decision should be.
  assert.throws(() => parseSchedule("4.0:40,1.0:0", Number), /begins at iteration 40/);
  assert.throws(() => parseSchedule("1.0:0,2.5:20,4.0:20", Number), /runs backwards/);
  assert.throws(() => parseSchedule("1.0:0,2.5:20,4.0:10", Number), /runs backwards/);
  // And one that starts anywhere but zero, because nothing would be in force for the first
  // rollout and the three plausible answers to that are three different runs.
  assert.throws(() => parseSchedule("1.0:5", Number), /nothing is in force before it/);
  assert.throws(() => parseSchedule("1.0:2.5", Number), /is not an iteration/);
  assert.throws(() => parseSchedule(" , ", Number), /wants value:from stages/);
  assert.throws(() => parseSchedule(":4", Number), /names no value/);

  // The three stage kinds. Metres or the config's own distance; a mind the golem offers or one of
  // the three words; classes joined with a plus, which is how a list rides inside a comma list.
  assert.equal(parseSeparationStage("1.2"), 1.2);
  assert.equal(parseSeparationStage("default"), CONFIG.fighter.separation);
  assert.throws(() => parseSeparationStage("close"), /neither metres nor the word default/);
  assert.throws(() => parseSeparationStage("-1"), /neither metres nor the word default/);
  for (const word of [...SCHEDULE_OPPONENTS, "idle", "golem-driver", "golem-fencer"]) {
    assert.equal(parseOpponentStage(word), word);
  }
  assert.throws(() => parseOpponentStage("golem-drivr"), /neither a mind the golem offers nor/);
  assert.deepEqual(parseTerminalsStage("maul"), ["maul"]);
  assert.deepEqual(parseTerminalsStage("maul+mace"), ["maul", "mace"]);
  assert.deepEqual(parseTerminalsStage("viable"), [...VIABLE_TERMINALS]);
  assert.deepEqual(parseTerminalsStage("all"), ["all"]);
  assert.throws(() => parseTerminalsStage("maul+maul"), /--terminals-schedule repeats a class/);
  // A class nothing carries is refused where every other `--terminals` typo is refused -- at the
  // draw, by name -- and not silently narrowed to nothing.
  assert.throws(() => poolFor({ seed: SEED, random: 40, terminals: parseTerminalsStage("malu"), mirror: true }),
    /no build in the pool is armed with malu/);

  // `self` and `league` both mean self-play to a lone fit, which is the one place this file's
  // vocabulary and `scripts/league.mjs`'s deliberately disagree, and it is said out loud.
  assert.equal(opponentOf("self"), null);
  assert.equal(opponentOf("league"), null);
  assert.equal(opponentOf("uniform"), "uniform");
  assert.equal(opponentOf("golem-driver"), "golem-driver");
});

/**
 * The running statistics compose: two batches folded one after the other are one batch of both.
 *
 * This is the property a resumed run depends on, and it is not the obvious arithmetic -- the
 * variances do not average, they compose with a term for how far the two means are apart. The
 * check is against the direct computation over the concatenation, which knows nothing about
 * counts or partial sums.
 */
test("the_frozen_normalisation_composes_across_iterations", () => {
  const width = 3;
  const random = mulberry32(SEED + 11);
  const rows = Array.from({ length: 40 }, () => Array.from({ length: width }, () => random() * 6 - 2));
  const roll = (from, to) => ({
    width, count: to - from,
    x: Float32Array.from(rows.slice(from, to).flat()),
  });
  let norm = freshNormalisation(width);
  norm = extendNormalisation(norm, roll(0, 17));
  norm = extendNormalisation(norm, roll(17, 40));
  assert.equal(norm.count, 40);
  for (let k = 0; k < width; k += 1) {
    const column = rows.map((row) => Math.fround(row[k]));
    const mean = column.reduce((a, b) => a + b, 0) / column.length;
    const variance = column.reduce((a, b) => a + (b - mean) ** 2, 0) / column.length;
    assert.ok(Math.abs(norm.mean[k] - mean) < 1e-6, `column ${k} mean ${norm.mean[k]} against ${mean}`);
    assert.ok(Math.abs(norm.variance[k] - variance) < 1e-6, `column ${k} variance ${norm.variance[k]} against ${variance}`);
  }
  // And what it is for: a column standardised by it is centred and unit, and a wild one is clipped.
  const into = new Float64Array(width);
  normalise(Float64Array.from(rows[0]), norm, into);
  for (let k = 0; k < width; k += 1) assert.ok(Math.abs(into[k]) <= 5);
  normalise(Float64Array.from({ length: width }, () => 1e9), norm, into);
  for (let k = 0; k < width; k += 1) assert.equal(into[k], 5, "an enormous column was not clipped");
});

/**
 * A column the fit never varied reads zero, and every other column reads exactly what it did.
 *
 * Session 03 of the signal set. The clamp in `normalise` was written as the guard against a
 * constant column and is the mechanism of the defect instead: the divisor for a zero variance is
 * `sqrt(0 + 1e-8)`, a ten-thousandth, so the column saturates at +-5 on a difference of a quarter
 * of a millimetre and hands the first layer a large input through weights that -- the column being
 * constant over every row of the fit -- never took a gradient and are still at their Glorot draw.
 *
 * **Zero is not a choice among several, it is the value the fit itself saw.** On every row of the
 * accumulation the raw value equalled the mean, so `(raw - mean) / 1e-4` was exactly 0. The second
 * half of this test is therefore the more important one: on a table whose every column is live the
 * function must be *bit for bit* what it was, because a correctness fix that moved a live column
 * would be a policy change wearing a fix's clothes.
 */
test("a_dead_column_reads_zero_and_a_live_column_reads_exactly_what_it_read_before", () => {
  const mean = [0, 0, 0, 0, 3];
  const variance = [1, 0, 1e-9, DEAD_VARIANCE, 0.25];
  const norm = { count: 100, mean, variance };
  const width = mean.length;
  const into = new Float64Array(width);

  // 1e9 is the plan's own number and the mutation to watch is deleting the branch, which makes
  // columns 1 and 2 read 5 -- the same thing a live column reads, which is the whole trouble.
  normalise(Float64Array.from({ length: width }, () => 1e9), norm, into);
  assert.deepEqual(Array.from(into), [5, 0, 0, 5, 5],
    "a dead column read something, or a live one stopped clipping");
  normalise(Float64Array.from({ length: width }, () => -1e9), norm, into);
  assert.deepEqual(Array.from(into), [-5, 0, 0, -5, -5], "the sign of the saturation still survives a dead column");
  // The floor is closed at the top: a variance *at* `DEAD_VARIANCE` is live, so the constant is a
  // bound a writer can hit rather than a band an implementation has to agree about.
  assert.equal(DEAD_VARIANCE, 1e-6);

  // The no-op, pinned. An independent statement of the arithmetic this function had before the
  // floor, over a table with no dead column in it, compared exactly rather than to a tolerance.
  const random = mulberry32(SEED + 23);
  const live = {
    count: 100,
    mean: Array.from({ length: 9 }, () => random() * 4 - 2),
    variance: Array.from({ length: 9 }, () => DEAD_VARIANCE + random() * 3),
  };
  const clamp = (x) => (x < -5 ? -5 : x > 5 ? 5 : x);
  const wide = new Float64Array(9);
  for (let trial = 0; trial < 200; trial += 1) {
    const raw = Float64Array.from({ length: 9 }, () => (random() * 2 - 1) * 20);
    normalise(raw, live, wide);
    for (let k = 0; k < 9; k += 1) {
      const was = clamp((raw[k] - live.mean[k]) / Math.sqrt(live.variance[k] + 1e-8));
      assert.equal(wide[k], was, `column ${k} moved on a table with no dead column in it`);
    }
  }

  // An unfitted table is live by construction, so a mind with no fit behind it reads its columns
  // rather than zeroing all of them -- which is what a floor written the careless way would do.
  for (const v of freshNormalisation(5).variance) assert.ok(v >= DEAD_VARIANCE, "a fresh column is dead");
});

/**
 * A variance below the floor is *written* as zero, so that "dead" is one predicate and not two.
 *
 * `normalise` is where the defect was and floors at read time because the shipped table cannot be
 * rewritten. That leaves a second reader -- a person, looking at a generated module -- who would
 * otherwise have to know the floor to tell a dead column from a nearly dead one. So the writer
 * honours the same constant, and `extendNormalisation`'s composition arithmetic is untouched: the
 * floor is applied to what it computed, not inside the fold.
 */
test("a_column_that_never_moved_is_written_as_a_zero_variance", () => {
  const width = 3;
  const random = mulberry32(SEED + 29);
  // Column 0 varies, column 1 never moves, column 2 moves by less than the floor allows.
  const rows = Array.from({ length: 30 }, () => [random() * 6 - 2, 0.75, 1 + (random() - 0.5) * 1e-4]);
  const roll = (from, to) => ({
    width, count: to - from, x: Float32Array.from(rows.slice(from, to).flat()),
  });
  let norm = freshNormalisation(width);
  norm = extendNormalisation(norm, roll(0, 11));
  assert.ok(norm.variance[0] > DEAD_VARIANCE, "the varying column was floored");
  assert.equal(norm.variance[1], 0, "a column that never moved was written as something to interpret");
  assert.equal(norm.variance[2], 0, "a column below the floor was written as something to interpret");
  // And it composes: a second batch over the same constant leaves it zero rather than reviving it
  // out of the floored prior, and the varying column is unharmed by the neighbour that was floored.
  const composed = extendNormalisation(norm, roll(11, 30));
  assert.equal(composed.count, 30);
  assert.equal(composed.variance[1], 0);
  const column = rows.map((row) => Math.fround(row[0]));
  const m = column.reduce((a, b) => a + b, 0) / column.length;
  const v = column.reduce((a, b) => a + (b - m) ** 2, 0) / column.length;
  assert.ok(Math.abs(composed.variance[0] - v) < 1e-6, `the live column composed to ${composed.variance[0]}, not ${v}`);
  assert.ok(Math.abs(composed.mean[1] - 0.75) < 1e-6, "a dead column still carries the value it never left");
});

/** Cohen's d of a paired column is its mean over its own spread, and is scale free. */
test("cohens_d_is_the_paired_mean_over_the_paired_spread", () => {
  assert.equal(cohensD([1, 1, 1, 1]), 0, "a column with no spread is not a size");
  const column = [0.1, 0.3, -0.2, 0.4, 0.0];
  const mean = column.reduce((a, b) => a + b, 0) / column.length;
  const sd = Math.sqrt(column.reduce((a, b) => a + (b - mean) ** 2, 0) / (column.length - 1));
  assert.ok(Math.abs(cohensD(column) - mean / sd) < 1e-12);
  assert.ok(Math.abs(cohensD(column.map((x) => x * 7)) - cohensD(column)) < 1e-12, "d moved with the units");
});

// ---------------------------------------------------------------------------------------
// The artifact.
// ---------------------------------------------------------------------------------------

/**
 * The checked-in table is what the renderer writes, byte for byte.
 *
 * The same claim `tests/tournament.test.mjs` makes about the duel tables, for the same reason: a
 * generated file that the generator no longer reproduces is a file somebody edited by hand, and
 * the next fit would silently discard whatever they meant by it.
 *
 * **Byte for byte, minus one line, from 2026-09-11.** Session 03 of the signal set gave the header
 * a line naming the columns the fit never varied, and the checked-in table predates it -- and the
 * set's frozen choices say that file is not touched at all, weights, spreads, variances, header
 * and all, because the whole argument that the session is a correctness fix rather than a change
 * of policy is that *the reader changes and the table does not*. So the claim is now made in two
 * pieces: the new line is asserted against its exact expected text, and everything else is
 * asserted byte for byte against the disk. That is strictly stronger than the old single
 * assertion, not weaker -- the old one could not say what the header should contain, only that it
 * had not moved.
 */
test("the_checked_in_policy_table_is_what_the_renderer_writes", () => {
  const disk = readFileSync(new URL("../src/golem/policy-weights.ts", import.meta.url), "utf8");
  // **Which generator, read off the file rather than assumed.** Two scripts write this module and
  // their names differ by three characters, so a test that renders with the default header fails
  // on any table shipped by the league -- which is what it did on 2026-09-09, the first day a
  // league checkpoint was the checked-in mind. The invariant is still byte for byte; what the
  // header decides is only which of the two writers is being reproduced.
  const generator = /^\/\/ GENERATED by (\S+) --/.exec(disk)?.[1];
  assert.ok(["scripts/train-ppo.mjs", "scripts/league.mjs"].includes(generator),
    `the checked-in table names ${generator}, which is not a script that writes it`);
  const text = renderPolicyModule(POLICY_WEIGHTS, generator);
  const line = /^\/\/ Dead columns[^\n]*\n\/\/ a ten-thousandth: [^\n]*\n/m.exec(text);
  assert.ok(line, "the renderer no longer names the columns the fit never varied");
  assert.equal(line[0],
    "// Dead columns, never varied by this fit and therefore read as zero rather than divided by\n"
    + "// a ten-thousandth: bias, reachEdge, myWeapon:buckler, theirWeapon:buckler, "
    + "myHealth:locomotion, theirHealth:locomotion, interceptWall.\n",
    "the shipped table's dead columns are not the seven that tests/policy-perception.test.mjs pins");
  const rest = text.slice(0, line.index) + text.slice(line.index + line[0].length);
  assert.equal(rest.length, disk.length, "the rendered module changed length");
  assert.equal(rest, disk, "the renderer no longer reproduces the checked-in policy table");
  // The generator's name is a parameter, because `scripts/league.mjs` writes this module too and
  // a header pointing at the wrong script sends a reader to the wrong run to reproduce it.
  assert.match(renderPolicyModule(POLICY_WEIGHTS), /^\/\/ GENERATED by scripts\/train-ppo\.mjs --/);
  assert.match(renderPolicyModule(POLICY_WEIGHTS, "scripts/league.mjs"),
    /^\/\/ GENERATED by scripts\/league\.mjs --/);
});

/**
 * A fitted table survives the trip through the module text and into a mind that fights.
 *
 * The numbers are the risk: they are written sixteen to a line by `join`, which is
 * `Number.prototype.toString`, and read back by the module loader. Round-tripping them through
 * the literal and then asking the mind that reads them to write a command is what says the
 * artifact is the fit and not a rounding of it.
 */
test("a_fitted_table_round_trips_through_the_module_text_and_drives_the_executor", () => {
  const random = mulberry32(SEED + 3);
  const weights = Array.from({ length: netSize(POLICY_LAYOUT) }, () => Math.round((random() * 2 - 1) * 1e5) / 1e5);
  const logSigma = Array.from({ length: ACTION_AXES }, () => Math.round((random() - 1.5) * 1e5) / 1e5);
  const table = {
    ...freshPolicyTable(weights, logSigma),
    seed: SEED, date: "2026-09-08", iterations: 3, bouts: 12, steps: 400,
    halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.003,
    score: 0.61, baselines: { uniform: 0.39 },
  };
  const text = renderPolicyModule(table);
  // The literal, read back the way the module loader would: everything between the first `= ` of
  // the export and the final semicolon, with the one value import put back as a literal.
  const at = text.indexOf("export const POLICY_WEIGHTS: PolicyWeights = ");
  assert.ok(at > 0, "the module does not export the table");
  const literal = text.slice(at + "export const POLICY_WEIGHTS: PolicyWeights = ".length, -2)
    .replace("\"reward\":GOLEM_REWARD", JSON.stringify(GOLEM_REWARD).replace(/^\{/, "").replace(/\}$/, "")
      .length > 0 ? `"reward":${JSON.stringify(GOLEM_REWARD)}` : "");
  const back = JSON.parse(literal);
  assert.deepEqual(back.weights, weights, "a weight changed value in the module text");
  assert.deepEqual(back.logSigma, logSigma, "a spread changed value in the module text");
  assert.deepEqual(back.reward, GOLEM_REWARD);
  assert.equal(back.score, 0.61);
  checkPolicyWeights(back);
  // And the mind reads it: the head is a function of the weights, so a table that round-tripped
  // wrong would write a different command.
  const scratch = netScratch(POLICY_LAYOUT);
  const observation = new Float64Array(PILOT_FEATURE_COUNT).fill(0.25);
  const mine = forward(POLICY_LAYOUT, Float64Array.from(weights), observation, scratch);
  const theirs = forward(POLICY_LAYOUT, Float64Array.from(back.weights), observation, netScratch(POLICY_LAYOUT));
  for (let j = 0; j < ACTION_WIDTH; j += 1) assert.equal(mine[j], theirs[j], `output ${j} moved`);
  const action = meanAction(mine, new Float64Array(ACTION_WIDTH));
  const command = commandFromAction(action, freshCommand());
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const [low, high] = COMMAND_RANGES[COMMAND_AXES[j]];
    const value = command[COMMAND_AXES[j]];
    assert.ok(value >= low - 1e-12 && value <= high + 1e-12, `${COMMAND_AXES[j]} is ${value}, outside ${low}..${high}`);
  }
});

/**
 * Nine refusals, by name, and the shipped table passes all of them.
 *
 * Six until Session 09 of the learn set, which put the head, the spread's provenance and the
 * observation width behind flags and so made three more ways for a file and a build to disagree
 * about what a row of weights means. **The third of them is the one that is not a typo check**: a
 * version-2 table that names a head is a file somebody edited by hand or a reader that pasted this
 * build's default onto a file that never claimed it, and either way the shape it declares is not
 * the shape it was fitted under. That refusal is why `assemble` in snapshot.ts deletes the fields
 * rather than defaulting them.
 */
test("a_table_this_build_cannot_read_is_refused_by_name", () => {
  checkPolicyWeights(POLICY_WEIGHTS);
  const bad = (over, pattern) => assert.throws(() => checkPolicyWeights({ ...POLICY_WEIGHTS, ...over }), pattern);
  bad({ version: 99 }, /version 99/);
  bad({ features: 99 }, /feature version 99/);
  bad({ head: "gaussian" }, /version 2 and name a head/);
  bad({ version: 3, head: "quadratic" }, /head "quadratic"/);
  bad({ version: 3, sigma: "learned" }, /spread "learned"/);
  bad({ layout: { ...POLICY_LAYOUT, inputs: 7 } }, /layout|inputs/i);
  bad({ weights: [1, 2, 3] }, /weights|numbers/i);
  bad({ logSigma: [0, 0] }, /spread|logSigma|axes/i);
  bad({ normalisation: { count: 0, mean: [0], variance: [1] } }, /normalisation/i);
  // The shipped table is version 2 and names no head on purpose: it was fitted before the field
  // existed, and every arm of Session 09 had to be run beside it inside one process.
  assert.equal(POLICY_WEIGHTS.version, 2);
  assert.equal(POLICY_WEIGHTS.head, undefined, "the shipped table grew a head it was not fitted with");
});

/** The mind is in the picker under its own name and builds without a fit. */
test("golem_policy_is_a_policy_the_golem_offers", () => {
  const mind = policyMind(policyForUnit("golem", "golem-policy"), SEED);
  assert.equal(mind.name, "golem-policy");
  assert.ok(mind.driven !== undefined, "the policy does not publish the fourth executor");
  assert.equal(mind.styled, undefined, "the policy published an option vocabulary it does not have");
  assert.equal(mind.fencer, undefined);
  const other = policyMind("golem-policy", SEED);
  assert.notEqual(mind, other, "the picker handed back one instance twice");
  assert.throws(() => policyForUnit("warrior", "golem-policy"), /does not support/);
});

/** The null hypothesis writes inside every range and flips both gates. */
test("the_uniform_baseline_writes_a_legal_command_and_is_not_a_constant", () => {
  const pilot = uniformPilot(SEED);
  const seen = { commit: new Set(), abort: new Set(), parry: new Set() };
  const spread = COMMAND_AXES.map(() => ({ low: Infinity, high: -Infinity }));
  for (let i = 0; i < 400; i += 1) {
    const command = pilot(null, null);
    for (let j = 0; j < ACTION_AXES; j += 1) {
      const [low, high] = COMMAND_RANGES[COMMAND_AXES[j]];
      const value = command[COMMAND_AXES[j]];
      assert.ok(value >= low - 1e-12 && value <= high + 1e-12, `${COMMAND_AXES[j]} is ${value}`);
      spread[j].low = Math.min(spread[j].low, value);
      spread[j].high = Math.max(spread[j].high, value);
    }
    for (let j = 0; j < ACTION_GATES; j += 1) seen[COMMAND_GATES[j]].add(command[COMMAND_GATES[j]]);
  }
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const [low, high] = COMMAND_RANGES[COMMAND_AXES[j]];
    assert.ok(spread[j].high - spread[j].low > (high - low) * 0.8,
      `${COMMAND_AXES[j]} only ever covered ${spread[j].low}..${spread[j].high}`);
  }
  for (const gate of COMMAND_GATES) {
    assert.deepEqual([...seen[gate]].sort(), [0, 1], `${gate} was not a coin`);
  }
  // Seeded: two baselines under one seed are the same baseline, and under two are not.
  assert.equal(uniformPilot(SEED)(null, null).standOff, uniformPilot(SEED)(null, null).standOff);
  assert.notEqual(uniformPilot(SEED)(null, null).standOff, uniformPilot(SEED + 1)(null, null).standOff);
});

/**
 * The trust region the clip does not give: a fit stops when the whole policy has moved too far.
 *
 * The clip bounds each sample's own ratio and says nothing about the policy as a whole, and this
 * arena walks into the gap -- as the spread tightens, a step of the size that was reasonable at
 * one spread is a different policy at another. The check is that the stop is real: at a target of
 * zero the fit runs every epoch, and at an impossibly small one it stops in the first and leaves
 * the weights where it found them, because the minibatch that failed is not applied.
 */
test("a_fit_stops_when_the_policy_has_moved_further_than_the_target_kl_allows", () => {
  const width = 3;
  const layout = { inputs: width, hidden: [8], outputs: ACTION_WIDTH };
  const valueLayout = { inputs: width, hidden: [8], outputs: 1 };
  const random = mulberry32(SEED + 21);
  const count = 128;
  const rollout = {
    count, width,
    x: Float32Array.from({ length: count * width }, () => random() * 2 - 1),
    a: Float64Array.from({ length: count * ACTION_WIDTH }, () => random() * 2 - 1),
    logp: Float64Array.from({ length: count }, () => -12 + random()),
    reward: Float64Array.from({ length: count }, () => random() - 0.5),
    seconds: Float64Array.from({ length: count }, () => 0.0833),
    done: Uint8Array.from({ length: count }, (_, i) => (i % 32 === 31 ? 1 : 0)),
  };
  const knobs = {
    layout, valueLayout, norm: freshNormalisation(width), seed: SEED,
    halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.001, rate: 0.01, valueRate: 0.01,
    epochs: 4, batch: 32,
  };
  const patient = ppoFit(rollout, {
    ...knobs, targetKl: 0,
    weights: initWeights(layout, SEED), logSigma: new Float64Array(ACTION_AXES).fill(-0.7),
    valueWeights: initWeights(valueLayout, SEED + 1),
  });
  assert.equal(patient.epochs, 4, "a fit with no target ran short");
  assert.equal(patient.stopped, null);

  const weights = initWeights(layout, SEED);
  const before = Float64Array.from(weights);
  const strict = ppoFit(rollout, {
    ...knobs, targetKl: 1e-9,
    weights, logSigma: new Float64Array(ACTION_AXES).fill(-0.7),
    valueWeights: initWeights(valueLayout, SEED + 1),
  });
  assert.equal(strict.epochs, 0, "a fit past its target still finished an epoch");
  assert.ok(strict.stopped !== null && strict.stopped.epoch === 1, `stopped at ${JSON.stringify(strict.stopped)}`);
  for (let k = 0; k < weights.length; k += 1) {
    assert.equal(weights[k], before[k], `weight ${k} moved after the fit had already stopped`);
  }
  // The recorded log-probabilities are nowhere near this head, so the first minibatch is well past
  // any sane target: the stop is the arithmetic firing and not a boundary case.
  assert.ok(strict.stopped.kl > 1, `the first minibatch moved the policy by only ${strict.stopped.kl} nats`);
});

// ---------------------------------------------------------------------------------------
// One problem whose answer is known before the run starts.
// ---------------------------------------------------------------------------------------

/**
 * PPO recovers the optimum of a two-dimensional continuous bandit.
 *
 * One state, one step an episode, and a reward that is `-(a0 - t0)^2 - (a1 - t1)^2` for a target
 * the trainer is never told. Everything the arena makes hard is stripped out -- no physics, no
 * opponent, no credit over time -- so what is left is exactly the loop: draw from the head, pay
 * each draw, standardise, and take a clipped step toward the ones that paid. If that loop is
 * wrong in any way that matters the head does not move to the target, and no amount of internal
 * consistency will fake it.
 *
 * Two things are asserted and the second is the one that matters. The first is that the means
 * arrive: within a tenth of the target on both axes, where the draw's own spread starts at half a
 * unit. The second is that the *return improved* -- the mean reward over the last round beats the
 * first by a wide margin -- because a head sitting on the target with a spread that never shrank
 * is not a solved bandit.
 */
test("ppo_recovers_the_optimum_of_a_two_dimensional_continuous_bandit", () => {
  const target = [0.6, -0.45];
  const width = 4;
  const layout = { inputs: width, hidden: [24], outputs: ACTION_WIDTH };
  const valueLayout = { inputs: width, hidden: [24], outputs: 1 };
  const weights = initWeights(layout, SEED);
  const valueWeights = initWeights(valueLayout, SEED + 1);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  const norm = freshNormalisation(width);
  const random = mulberry32(SEED + 2);
  const scratch = netScratch(layout);
  const observation = Float64Array.from([1, 0.5, -0.25, 0]);
  const draw = new Float64Array(ACTION_WIDTH);
  const rounds = 90;
  const perRound = 192;
  let state = { actor: null, spread: null, critic: null };
  let first = 0;
  let last = 0;
  for (let round = 1; round <= rounds; round += 1) {
    const rollout = {
      count: perRound, width,
      x: new Float32Array(perRound * width),
      a: new Float64Array(perRound * ACTION_WIDTH),
      logp: new Float64Array(perRound),
      reward: new Float64Array(perRound),
      seconds: new Float64Array(perRound),
      done: new Uint8Array(perRound).fill(1),
    };
    let paid = 0;
    for (let i = 0; i < perRound; i += 1) {
      const head = forward(layout, weights, observation, scratch);
      const logp = sampleAction(head, logSigma, random, draw);
      const reward = -((draw[0] - target[0]) ** 2) - ((draw[1] - target[1]) ** 2);
      rollout.x.set(observation, i * width);
      rollout.a.set(draw, i * ACTION_WIDTH);
      rollout.logp[i] = logp;
      rollout.reward[i] = reward;
      paid += reward;
    }
    paid /= perRound;
    if (round === 1) first = paid;
    if (round === rounds) last = paid;
    const fit = ppoFit(rollout, {
      weights, logSigma, valueWeights, layout, valueLayout, norm, seed: SEED + round,
      halfLife: 1, lambda: 0.95, clip: 0.2, entropy: 0.0005, rate: 0.012, valueRate: 0.02,
      // Pinned to the head's rate rather than left at the trainer's ten-times default: the
      // multiplier exists because the arena's actor rate is set by a trust region and is far
      // smaller than a bandit's, and a test of the surrogate should not also be a test of that
      // schedule. Left at the default, this bandit ends with its first spread on the floor.
      sigmaRate: 0.012,
      epochs: 4, batch: 64, targetKl: 0.02, sigmaFloor: -4, sigmaRoof: 0.5, ...state,
    });
    state = { actor: fit.actor, spread: fit.spread, critic: fit.critic };
  }
  const head = forward(layout, weights, observation, scratch);
  // The tolerance is a fifth of the spread the draw started at, and is loose on purpose: the head
  // is one noisy draw's worth of gradient away from wherever it settled, and four other seeds put
  // it between 0.504 and 0.616 on the first axis. A tighter number here would be a test of this
  // seed rather than of the trainer.
  assert.ok(Math.abs(head[0] - target[0]) < 0.15, `axis 0 arrived at ${head[0]}, wanted ${target[0]}`);
  assert.ok(Math.abs(head[1] - target[1]) < 0.15, `axis 1 arrived at ${head[1]}, wanted ${target[1]}`);
  assert.ok(last > -0.06, `the last round paid ${last} a draw`);
  assert.ok(last > first + 0.5, `the mean reward went from ${first} to ${last}`);
  // The two axes that were paid for tightened, which is the half of the answer a mean cannot
  // give: a head on the target with the spread it started at is still paying for its own noise.
  assert.ok(logSigma[0] < -1.2, `axis 0 kept a spread of exp(${logSigma[0]})`);
  assert.ok(logSigma[1] < -1.2, `axis 1 kept a spread of exp(${logSigma[1]})`);
  assert.ok(logSigma[0] > -4 + 1e-9, "axis 0 sat on the floor rather than finding a spread");
  assert.ok(actionEntropy(head, logSigma) > -50, "the head collapsed to a point");
});

// ---------------------------------------------------------------------------------------
// The thing that makes a restarted arm the same run.
// ---------------------------------------------------------------------------------------

/** The one problem's knobs, said once, so the three runs below cannot drift apart. */
const BANDIT = Object.freeze({
  target: Object.freeze([0.6, -0.45]),
  layout: Object.freeze({ inputs: 4, hidden: Object.freeze([24]), outputs: ACTION_WIDTH }),
  valueLayout: Object.freeze({ inputs: 4, hidden: Object.freeze([24]), outputs: 1 }),
  perRound: 192,
});

/**
 * One round of the bandit above, from a state that has been through JSON and back.
 *
 * The whole state crosses that boundary the way a checkpoint does -- the weights, the spreads, the
 * critic and, when `carry` is on, Adam's three blocks -- and the round's own random stream is
 * derived from the round number, exactly as `scripts/train-ppo.mjs` derives an iteration's seed
 * from `seed + iteration * 7919`. So a "resumed" round here is a resumed round: nothing survives in
 * a live object that a restarted process would not have had to read off disk. `moments` is passed
 * in instead when the caller is the uninterrupted run, which is the only difference between the
 * two arrangements and therefore the only thing this test is about.
 */
function banditRound(round, saved, { carry = true, moments = null } = {}) {
  const { target, layout, valueLayout, perRound } = BANDIT;
  const state = JSON.parse(saved);
  const weights = Float64Array.from(state.weights);
  const logSigma = Float64Array.from(state.logSigma);
  const valueWeights = Float64Array.from(state.valueWeights);
  const carried = moments ?? momentsFromJson(carry ? state.adam : null, {
    actor: netSize(layout), spread: ACTION_AXES, critic: netSize(valueLayout),
  }).moments;
  const scratch = netScratch(layout);
  const observation = Float64Array.from([1, 0.5, -0.25, 0]);
  const draw = new Float64Array(ACTION_WIDTH);
  const random = mulberry32(SEED + round * 7919);
  const rollout = {
    count: perRound, width: layout.inputs,
    x: new Float32Array(perRound * layout.inputs),
    a: new Float64Array(perRound * ACTION_WIDTH),
    logp: new Float64Array(perRound),
    reward: new Float64Array(perRound),
    seconds: new Float64Array(perRound),
    done: new Uint8Array(perRound).fill(1),
  };
  for (let i = 0; i < perRound; i += 1) {
    const head = forward(layout, weights, observation, scratch);
    rollout.logp[i] = sampleAction(head, logSigma, random, draw);
    rollout.reward[i] = -((draw[0] - target[0]) ** 2) - ((draw[1] - target[1]) ** 2);
    rollout.x.set(observation, i * layout.inputs);
    rollout.a.set(draw, i * ACTION_WIDTH);
  }
  const fit = ppoFit(rollout, {
    weights, logSigma, valueWeights, layout, valueLayout, norm: freshNormalisation(layout.inputs),
    seed: SEED + round, halfLife: 1, lambda: 0.95, clip: 0.2, entropy: 0.0005, rate: 0.012,
    // The trust region is off, where the bandit above runs at 0.02. It has a test of its own two
    // sections up, and a round that stopped in its first epoch would make this one an assertion
    // about one or three Adam updates rather than about all twelve of them carrying their moments
    // across a restart -- which is the thing being claimed.
    valueRate: 0.02, sigmaRate: 0.012, epochs: 4, batch: 64, targetKl: 0,
    sigmaFloor: -4, sigmaRoof: 0.5, ...carried,
  });
  const next = { actor: fit.actor, spread: fit.spread, critic: fit.critic };
  return {
    moments: next,
    saved: JSON.stringify({
      weights: Array.from(weights), logSigma: Array.from(logSigma),
      valueWeights: Array.from(valueWeights), adam: momentsToJson(next),
    }),
  };
}

/** The largest distance between two same-length lists of numbers, which is what 1e-9 is about. */
const worstOf = (a, b) => a.reduce((most, x, i) => Math.max(most, Math.abs(x - b[i])), 0);

/**
 * A fit resumed with its Adam state is the uninterrupted fit; resumed without it, it is not.
 *
 * This is the whole justification for putting three flat arrays of eighty-seven thousand numbers
 * into every checkpoint, so both halves are asserted and the second is the one that earns it. Adam
 * divides by its own second moment, so with cold moments *every* weight moves by exactly the rate
 * in whatever direction the first minibatch chose -- the calibration in `docs/measurements.md`
 * measured that as about 0.18 nats in a single step at 3e-4, which is why the batch and the rate
 * were retuned around it. A run restarted four times overnight pays that four times, and its curve
 * carries four steps somebody would later try to read as learning.
 *
 * Two iterations is enough and is the plan's own number: after the first the moments are non-zero
 * and the step counts are up, so the second is where a cold restart and a warm one part company.
 * The tolerance is 1e-9 on every weight, which is equality for a double that has been through
 * `JSON.stringify` -- the moments are written at full precision for exactly this reason, and
 * rounding them the way the weights beside them are rounded turns this test red.
 */
test("a_fit_resumed_with_its_adam_state_is_the_uninterrupted_fit_and_without_it_is_not", () => {
  const { layout, valueLayout, perRound } = BANDIT;
  const start = JSON.stringify({
    weights: Array.from(initWeights(layout, SEED)),
    logSigma: Array.from(new Float64Array(ACTION_AXES).fill(-0.7)),
    valueWeights: Array.from(initWeights(valueLayout, SEED + 1)),
    adam: null,
  });
  const first = banditRound(1, start);
  const warm = JSON.parse(banditRound(2, first.saved, { carry: true }).saved);
  const cold = JSON.parse(banditRound(2, first.saved, { carry: false }).saved);
  // The uninterrupted pair, holding the moments in memory the way a process that never died does.
  const second = banditRound(2, first.saved, { moments: first.moments });
  const uninterrupted = JSON.parse(second.saved);

  // The state a restart reads is the state the first round wrote, and it has moments in it.
  const written = JSON.parse(first.saved);
  assert.equal(written.adam.actor.step, 4 * Math.ceil(perRound / 64), "every minibatch of every epoch took a step");
  assert.equal(written.adam.actor.m.length, netSize(layout));
  assert.equal(written.adam.spread.m.length, ACTION_AXES);
  assert.ok(written.adam.critic.v.some((x) => x !== 0), "the critic's second moments are not all zero");

  assert.ok(worstOf(warm.weights, uninterrupted.weights) < 1e-9,
    `a resumed fit moved a weight by ${worstOf(warm.weights, uninterrupted.weights)}`);
  assert.ok(worstOf(warm.logSigma, uninterrupted.logSigma) < 1e-9, "a resumed fit moved a spread");
  assert.ok(worstOf(warm.valueWeights, uninterrupted.valueWeights) < 1e-9, "a resumed fit moved the critic");
  // And the half that says the state is worth persisting: without it the same round is a different
  // fit, by a margin many orders of magnitude past the tolerance above.
  const drift = worstOf(cold.weights, uninterrupted.weights);
  assert.ok(drift > 1e-4, `a fit resumed with cold moments differed by only ${drift}`);
});

/**
 * Which `--resume` may append to an existing log, and which is a second run pointed at one.
 *
 * The refusal that a run does not append to another run's log is worth keeping, and was also --
 * until Session 04 of the learn set -- refusing the one thing `--resume` exists for, so every
 * hand-restarted run in the record started a second log file and its curve had to be stitched
 * afterwards. The rule that separates the two cases is exact rather than a heuristic: the
 * checkpoint being resumed is the checkpoint this log writes. Anything else is `--from`, which
 * starts a fresh log from another run's weights.
 */
test("a_resume_continues_only_the_log_whose_own_checkpoint_it_names", () => {
  assert.equal(checkpointFor("tournaments/arm-1.jsonl"), "tournaments/arm-1-checkpoint.json");
  assert.equal(resumesOwnLog("tournaments/arm-1.jsonl", "tournaments/arm-1-checkpoint.json"), true);
  // The same file said a different way is the same file, which is why both sides are resolved.
  assert.equal(resumesOwnLog("tournaments/arm-1.jsonl", "tournaments/./arm-1-checkpoint.json"), true);
  assert.equal(resumesOwnLog("tournaments/arm-1.jsonl", "tournaments/arm-2-checkpoint.json"), false,
    "another arm's checkpoint is --from, not --resume");
  assert.equal(resumesOwnLog("tournaments/arm-1.jsonl", null), false);
});

/**
 * The three blocks survive JSON, and a block that cannot be used says which one and why.
 *
 * The width case is not hypothetical: `--value-hidden` moves the critic's size, so a checkpoint
 * written under one width and resumed under another has value moments there is nothing sensible to
 * do with. Starting that one block cold and naming it is the same answer `roleFromCheckpoint` in
 * `scripts/league.mjs` gives for the value *weights*, and refusing the whole checkpoint over it
 * would throw away a perfectly good actor.
 */
test("adam_moments_round_trip_and_a_block_of_the_wrong_width_starts_cold_by_name", () => {
  const sizes = { actor: 6, spread: 2, critic: 3 };
  const made = {
    actor: { m: Float64Array.from([1e-9, -2, 3, 4, 5, 6]), v: Float64Array.from([1, 2, 3, 4, 5, 6]), step: 7 },
    spread: { m: Float64Array.from([0.5, -0.5]), v: Float64Array.from([0.25, 0.25]), step: 7 },
    critic: { m: Float64Array.from([1, 2, 3]), v: Float64Array.from([1, 2, 3]), step: 7 },
  };
  const back = momentsFromJson(JSON.parse(JSON.stringify(momentsToJson(made))), sizes);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(Array.from(back.moments.actor.m), Array.from(made.actor.m));
  assert.equal(back.moments.actor.m[0], 1e-9, "a second moment survives at its own scale");
  assert.equal(back.moments.critic.step, 7);

  const narrow = momentsFromJson(momentsToJson(made), { ...sizes, critic: 4 });
  assert.equal(narrow.moments.critic, null);
  assert.deepEqual(Array.from(narrow.moments.actor.m), Array.from(made.actor.m), "the actor is untouched");
  assert.deepEqual(narrow.warnings, ["critic moments 3 moments, not 4; that block starts cold"]);

  const nothing = momentsFromJson(null, sizes);
  assert.deepEqual(Object.values(nothing.moments), [null, null, null]);
  assert.equal(nothing.warnings.length, 3, "a checkpoint written before this session says so per block");
});

// ---------------------------------------------------------------------------------------
// The fit split across threads, which is not allowed to be a different fit.
// ---------------------------------------------------------------------------------------

/** The critic the trainer's own CLI defaults to, which is narrower than the exported layout. */
const TEST_VALUE_LAYOUT = Object.freeze({ ...VALUE_LAYOUT, hidden: Object.freeze([64, 64]) });

/** A run whose frozen normalisation is a real one, so `normalise` is not the identity. */
const RUN_CHECKPOINT = "tournaments/ppo-run1-checkpoint.json";

/**
 * A rollout at the shipped shape, under a normalisation that is emphatically not the identity.
 *
 * The columns are drawn from the run's own frozen mean and variance, so a shard that read the
 * wrong normalisation -- or a fresh one, or none -- lands somewhere else on the tanh and the fit
 * moves. That is the whole reason the fixture is built this way rather than from zero-mean noise:
 * an identity normalisation is exactly the case that would hide getting this wrong, and the
 * observation statistics are the thing the owner named as the place to be careful.
 *
 * The run's checkpoint is read when it is there -- 71 columns, one of them with variance exactly
 * zero, which is the degenerate column the 1e-8 guard and the five-sigma clip exist for -- and
 * the fallback is a made-up normalisation of the same shape, because the tournaments directory is
 * gitignored and a test that only passes on the machine the run happened on is not one.
 */
function normalisedRollout(count = 4096) {
  const width = PILOT_FEATURE_COUNT;
  const layout = POLICY_LAYOUT;
  const random = mulberry32(SEED + 55);
  let norm;
  let weights;
  let logSigma;
  if (existsSync(RUN_CHECKPOINT)) {
    const saved = JSON.parse(readFileSync(RUN_CHECKPOINT, "utf8"));
    norm = saved.normalisation;
    weights = Float64Array.from(saved.weights);
    logSigma = Float64Array.from(saved.logSigma);
  } else {
    norm = { count: 1_691_101, mean: [], variance: [] };
    for (let k = 0; k < width; k += 1) {
      norm.mean[k] = k === 0 ? 1 : (k % 7) - 3 + k / 40;
      norm.variance[k] = k === 0 ? 0 : 0.05 + (k % 11) / 9;
    }
    weights = initWeights(layout, SEED + 56);
    logSigma = new Float64Array(ACTION_AXES).fill(-0.66);
  }
  assert.ok(norm.mean.some((m) => m !== 0) && norm.variance.some((v) => v !== 1),
    "the fixture's normalisation is the identity, which is the one case this test cannot see");
  const scratch = netScratch(layout);
  const observation = new Float64Array(width);
  const raw = new Float64Array(width);
  const draw = new Float64Array(ACTION_WIDTH);
  const rollout = {
    count, width,
    x: new Float32Array(count * width),
    a: new Float64Array(count * ACTION_WIDTH),
    logp: new Float64Array(count),
    reward: new Float64Array(count),
    seconds: new Float64Array(count).fill(0.0833),
    done: Uint8Array.from({ length: count }, (_, i) => (i % 37 === 36 ? 1 : 0)),
  };
  // Every episode has to end inside the rollout: `advantages` reads the value *after* the last
  // ask and there is nothing after the last row, so a rollout whose tail is unterminated is all
  // NaN and every comparison below would pass on two identical piles of it.
  rollout.done[count - 1] = 1;
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < width; k += 1) {
      raw[k] = norm.mean[k] + Math.sqrt(norm.variance[k]) * (random() * 2 - 1) * 1.7;
      rollout.x[i * width + k] = raw[k];
    }
    normalise(raw, norm, observation);
    const head = forward(layout, weights, observation, scratch);
    rollout.logp[i] = sampleAction(head, logSigma, random, draw);
    rollout.a.set(draw, i * ACTION_WIDTH);
    rollout.reward[i] = random() - 0.5;
  }
  return { rollout, norm, weights, logSigma };
}

/** The largest elementwise gap between two same-length runs of numbers. */
const gapOf = (a, b) => {
  let most = 0;
  for (let i = 0; i < a.length; i += 1) most = Math.max(most, Math.abs(a[i] - b[i]));
  return most;
};

test("a_shards_slice_covers_the_minibatch_exactly_once_and_in_index_order", () => {
  for (const shards of [1, 2, 3, 4, 8, 12]) {
    for (const [at, end] of [[0, 4096], [4096, 8192], [53_248, 56_370], [7, 8]]) {
      let previous = at;
      const seen = [];
      for (let shard = 0; shard < shards; shard += 1) {
        const { from, to } = shardSlice(at, end, shard, shards);
        assert.equal(from, previous, `shard ${shard} of ${shards} does not start where the one before it ended`);
        assert.ok(to >= from, `shard ${shard} of ${shards} runs backwards`);
        for (let m = from; m < to; m += 1) seen.push(m);
        previous = to;
      }
      assert.equal(previous, end, `${shards} shards of the range ending at ${end} stop at ${previous}`);
      // In index order and not merely covering, which is what makes the reassociation a fixed one.
      assert.deepEqual(seen, Array.from({ length: end - at }, (_, i) => at + i));
    }
  }
});

/**
 * A sharded fit is the single thread's fit to 1e-9, on a rollout that is normalised.
 *
 * This is the session's bar and the set's ninth frozen choice made mechanical: the fit may go
 * wider but it may not go anywhere else. Three things are asserted and each is a different way of
 * being wrong.
 *
 * **At K = 1 the two are bit for bit the same number.** One shard walks the whole minibatch in
 * index order and the main thread adds its single partial to zero, which is exact, so there is no
 * tolerance to hide behind: if the loop moved to the worker is not the loop it was lifted from,
 * this line is red at the first minibatch.
 *
 * **At K = 2 and K = 4 they agree to far better than the bar.** What differs is one fixed
 * reassociation of a sum of a thousand terms, which is a last-bit effect; the measured gap on this
 * fixture is around 1e-16 an actor weight against a bar of 1e-9, and it is *fixed* -- the partials
 * are summed in shard order 0..K-1 and never in completion order, so two runs of this test on the
 * same seed give the same numbers and the tolerance is about floating point rather than about
 * scheduling.
 *
 * **The discrete read-out is identical rather than close.** The epoch count, the number of Adam
 * steps and the clip fraction are the same values, the last because it is a count of ones over a
 * count of samples and integers add exactly however they are grouped. The three float read-outs
 * -- the KL, the entropy and the value loss -- are compared at the same 1e-9 as the weights,
 * because they are sums the sharding reassociates in exactly the same way.
 */
test("a_sharded_fit_matches_the_single_thread_fit_to_1e_9", { timeout: 900_000 }, async () => {
  const { rollout, norm } = normalisedRollout(4096);
  const knobs = {
    layout: POLICY_LAYOUT, valueLayout: TEST_VALUE_LAYOUT, norm, seed: SEED,
    halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.003, rate: 1e-3, valueRate: 1e-3,
    sigmaRate: 1e-2, epochs: 2, batch: 1024, targetKl: 0, sigmaFloor: -3, sigmaRoof: 0.5,
  };
  const fresh = () => ({
    weights: initWeights(POLICY_LAYOUT, SEED + 8),
    logSigma: new Float64Array(ACTION_AXES).fill(-0.7),
    valueWeights: initWeights(TEST_VALUE_LAYOUT, SEED + 9),
  });

  const alone = fresh();
  const one = ppoFit(rollout, { ...knobs, ...alone });
  assert.ok(one.updates > 4, `the single thread took only ${one.updates} Adam steps`);
  assert.ok(one.clipFraction > 0, "no sample was clipped, so the clip branch is untested here");

  for (const shards of [1, 2, 4]) {
    const pool = await FitPool.open({ shards, layout: POLICY_LAYOUT, valueLayout: TEST_VALUE_LAYOUT });
    const many = fresh();
    let sharded;
    try {
      sharded = ppoFit(rollout, { ...knobs, ...many, shards, pool });
    } finally {
      await pool.close();
    }
    const bar = shards === 1 ? 0 : 1e-9;
    const where = `at ${shards} shard${shards === 1 ? "" : "s"}`;
    assert.ok(gapOf(alone.weights, many.weights) <= bar,
      `${where} an actor weight moved by ${gapOf(alone.weights, many.weights)}`);
    assert.ok(gapOf(alone.valueWeights, many.valueWeights) <= bar,
      `${where} a critic weight moved by ${gapOf(alone.valueWeights, many.valueWeights)}`);
    assert.ok(gapOf(alone.logSigma, many.logSigma) <= bar,
      `${where} a spread moved by ${gapOf(alone.logSigma, many.logSigma)}`);
    assert.equal(sharded.epochs, one.epochs, `${where} the fit ran a different number of epochs`);
    assert.equal(sharded.updates, one.updates, `${where} the fit took a different number of steps`);
    assert.equal(sharded.stopped, one.stopped, `${where} the trust region behaved differently`);
    assert.equal(sharded.clipFraction, one.clipFraction, `${where} the clip fraction is not the same number`);
    for (const key of ["kl", "entropy", "valueLoss", "explainedAfter", "advantageSd"]) {
      assert.ok(Math.abs(sharded[key] - one[key]) <= 1e-9,
        `${where} ${key} read ${sharded[key]} against ${one[key]}`);
    }
    // Adam's own state has to have travelled too, or a resumed sharded arm is a different run.
    assert.ok(gapOf(one.actor.m, sharded.actor.m) <= bar,
      `${where} the actor's first moments differ by ${gapOf(one.actor.m, sharded.actor.m)}`);
    assert.equal(sharded.actor.step, one.actor.step);
  }
});

/**
 * The trust region stops on the same minibatch at K = 1 and at K = 4, and applies neither.
 *
 * The rollout is built so the first minibatch cannot trip: its recorded log-probabilities are the
 * ones this very head gives those actions, so the KL of the collecting policy against the fitted
 * one is zero before anything has moved. The rate is then large enough that the single Adam step
 * that minibatch takes carries the policy well past the target, and the *second* minibatch trips.
 * That is a controlled version of the case the region exists for, and it is the one the plan asks
 * to see sharded: one step applied, the failing minibatch discarded, the same epoch named.
 */
test("the_trust_region_stops_on_the_same_minibatch_sharded_as_on_one_thread", { timeout: 300_000 }, async () => {
  const width = 5;
  const layout = { inputs: width, hidden: [16], outputs: ACTION_WIDTH };
  const valueLayout = { inputs: width, hidden: [16], outputs: 1 };
  const count = 512;
  const random = mulberry32(SEED + 71);
  const norm = { count: 4096, mean: [], variance: [] };
  for (let k = 0; k < width; k += 1) { norm.mean[k] = 2 + k; norm.variance[k] = 0.25 + k / 3; }
  const start = () => ({
    weights: initWeights(layout, SEED + 11),
    logSigma: new Float64Array(ACTION_AXES).fill(-0.7),
    valueWeights: initWeights(valueLayout, SEED + 12),
  });
  const held = start();
  const scratch = netScratch(layout);
  const raw = new Float64Array(width);
  const observation = new Float64Array(width);
  const draw = new Float64Array(ACTION_WIDTH);
  const rollout = {
    count, width,
    x: new Float32Array(count * width),
    a: new Float64Array(count * ACTION_WIDTH),
    logp: new Float64Array(count),
    reward: new Float64Array(count),
    seconds: new Float64Array(count).fill(0.0833),
    done: Uint8Array.from({ length: count }, (_, i) => (i % 16 === 15 ? 1 : 0)),
  };
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < width; k += 1) {
      raw[k] = norm.mean[k] + Math.sqrt(norm.variance[k]) * (random() * 2 - 1) * 1.5;
      rollout.x[i * width + k] = raw[k];
    }
    normalise(raw, norm, observation);
    const head = forward(layout, held.weights, observation, scratch);
    // Drawn and then re-read at this same head, so the ratio starts at exactly one everywhere.
    sampleAction(head, held.logSigma, random, draw);
    rollout.a.set(draw, i * ACTION_WIDTH);
    rollout.logp[i] = actionLogProb(head, held.logSigma, draw);
    rollout.reward[i] = random() - 0.5;
  }
  const knobs = {
    layout, valueLayout, norm, seed: SEED + 13, halfLife: 4, lambda: 0.95, clip: 0.2,
    entropy: 0.003, rate: 0.25, valueRate: 0.01, sigmaRate: 0.25, epochs: 3, batch: 128,
    targetKl: 0.02, sigmaFloor: -3, sigmaRoof: 0.5,
  };
  const alone = start();
  const one = ppoFit(rollout, { ...knobs, ...alone });
  assert.ok(one.stopped !== null, "the fixture never tripped the trust region on one thread");
  assert.equal(one.stopped.epoch, 1, `the stop was in epoch ${one.stopped.epoch}`);
  assert.equal(one.updates, 1, `${one.updates} minibatches were applied before the stop`);
  assert.equal(one.epochs, 0, "an epoch that stopped part way through was counted as run");

  const pool = await FitPool.open({ shards: 4, layout, valueLayout });
  const many = start();
  let sharded;
  try {
    sharded = ppoFit(rollout, { ...knobs, ...many, shards: 4, pool });
  } finally {
    await pool.close();
  }
  assert.ok(sharded.stopped !== null, "the sharded fit did not stop where the single thread did");
  assert.equal(sharded.stopped.epoch, one.stopped.epoch);
  assert.equal(sharded.updates, one.updates, "the shards applied a different number of minibatches");
  assert.equal(sharded.epochs, one.epochs);
  assert.ok(Math.abs(sharded.stopped.kl - one.stopped.kl) <= 1e-9,
    `the failing minibatch measured ${sharded.stopped.kl} sharded against ${one.stopped.kl}`);
  assert.ok(gapOf(alone.weights, many.weights) <= 1e-9, "the two stops left different weights behind");
  assert.ok(gapOf(alone.logSigma, many.logSigma) <= 1e-9, "the two stops left different spreads behind");
  assert.ok(gapOf(alone.valueWeights, many.valueWeights) <= 1e-9, "the two stops left different critics behind");
});

/**
 * The bandit still finds its optimum with the fit on four threads.
 *
 * The equality test above is the strong claim and this is the one that would catch the failure
 * equality cannot see: a pool that is self-consistently wrong in both halves of a comparison it is
 * also the subject of. This is the same problem the single thread solves two sections up, at the
 * same seed and the same knobs, with the loop on four shards -- so a head that does not arrive
 * says the sharded loop is not the loop, whatever the two paths agree with each other about.
 */
test("a_bandit_fitted_on_four_shards_still_finds_its_optimum", { timeout: 300_000 }, async () => {
  const target = [0.6, -0.45];
  const width = 4;
  const layout = { inputs: width, hidden: [24], outputs: ACTION_WIDTH };
  const valueLayout = { inputs: width, hidden: [24], outputs: 1 };
  const weights = initWeights(layout, SEED);
  const valueWeights = initWeights(valueLayout, SEED + 1);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  const norm = freshNormalisation(width);
  const random = mulberry32(SEED + 2);
  const scratch = netScratch(layout);
  const observation = Float64Array.from([1, 0.5, -0.25, 0]);
  const draw = new Float64Array(ACTION_WIDTH);
  const rounds = 90;
  const perRound = 192;
  const pool = await FitPool.open({ shards: 4, layout, valueLayout });
  let state = { actor: null, spread: null, critic: null };
  let last = 0;
  try {
    for (let round = 1; round <= rounds; round += 1) {
      const rollout = {
        count: perRound, width,
        x: new Float32Array(perRound * width),
        a: new Float64Array(perRound * ACTION_WIDTH),
        logp: new Float64Array(perRound),
        reward: new Float64Array(perRound),
        seconds: new Float64Array(perRound),
        done: new Uint8Array(perRound).fill(1),
      };
      let paid = 0;
      for (let i = 0; i < perRound; i += 1) {
        const head = forward(layout, weights, observation, scratch);
        rollout.logp[i] = sampleAction(head, logSigma, random, draw);
        rollout.reward[i] = -((draw[0] - target[0]) ** 2) - ((draw[1] - target[1]) ** 2);
        rollout.x.set(observation, i * width);
        rollout.a.set(draw, i * ACTION_WIDTH);
        paid += rollout.reward[i];
      }
      last = paid / perRound;
      const fit = ppoFit(rollout, {
        weights, logSigma, valueWeights, layout, valueLayout, norm, seed: SEED + round,
        halfLife: 1, lambda: 0.95, clip: 0.2, entropy: 0.0005, rate: 0.012, valueRate: 0.02,
        sigmaRate: 0.012, epochs: 4, batch: 64, targetKl: 0.02, sigmaFloor: -4, sigmaRoof: 0.5,
        shards: 4, pool, ...state,
      });
      state = { actor: fit.actor, spread: fit.spread, critic: fit.critic };
    }
  } finally {
    await pool.close();
  }
  const head = forward(layout, weights, observation, scratch);
  assert.ok(Math.abs(head[0] - target[0]) < 0.15, `axis 0 arrived at ${head[0]}, wanted ${target[0]}`);
  assert.ok(Math.abs(head[1] - target[1]) < 0.15, `axis 1 arrived at ${head[1]}, wanted ${target[1]}`);
  assert.ok(last > -0.06, `the last round paid ${last} a draw`);
  assert.ok(logSigma[0] < -1.2, `axis 0 kept a spread of exp(${logSigma[0]})`);
});

/**
 * A pool refuses the two mistakes that would otherwise be silent.
 *
 * A fit that names one shard count and is handed a pool of another would run at the pool's, which
 * is a run whose header says something the run did not do; and a pool stepped before it has been
 * bound would read whatever the last iteration left in shared memory, which is a fit on the
 * previous rollout and is exactly the failure this file's opening note is about -- green, quiet,
 * and not a fit.
 */
test("a_fit_pool_refuses_a_shard_count_it_does_not_have_and_a_step_before_its_binding", { timeout: 120_000 }, async () => {
  const pool = await FitPool.open({ shards: 2, layout: POLICY_LAYOUT, valueLayout: TEST_VALUE_LAYOUT });
  try {
    assert.equal(pool.shards, 2);
    assert.throws(() => ppoFit({ count: 0, width: 1 }, { shards: 4, pool }), /4 shards was handed a pool of 2/);
    assert.throws(() => pool.step({ at: 0, end: 1, order: [0], weights: [], valueWeights: [], logSigma: [] }),
      /only after it has been bound/);
  } finally {
    await pool.close();
  }
  await assert.rejects(async () => FitPool.open({ shards: 0 }), /not a pool/);
});

// ---------------------------------------------------------------------------------------
// Session 09 of the learn set: three more shapes a head may take, and one more spread.
// ---------------------------------------------------------------------------------------

/**
 * The five shapes this build fits under, named once so every test below runs all of them.
 *
 * The Gaussian with a constant spread is version 2's and is in the list on purpose: a suite that
 * only exercised the new shapes would not notice the day the old one stopped agreeing with itself,
 * and the whole argument for shipping the alternatives as *arms* is that the control is measured
 * beside them through the same instrument.
 */
const HEADS = Object.freeze([
  { name: "gaussian", spec: GAUSSIAN_HEAD },
  { name: "mixed", spec: headSpecOf("mixed", "constant") },
  { name: "beta", spec: headSpecOf("beta", "constant") },
  { name: "state", spec: headSpecOf("gaussian", "state") },
  { name: "mixed+state", spec: headSpecOf("mixed", "state") },
]);

/** `bench`, at a head's own output width. */
function headBench(seed, spec, { inputs = 5, hidden = [7] } = {}) {
  const layout = { inputs, hidden, outputs: spec.width };
  const weights = initWeights(layout, seed);
  const scratch = netScratch(layout);
  const random = mulberry32(seed);
  const input = Float64Array.from({ length: inputs }, () => random() * 2 - 1);
  const logSigma = Float64Array.from({ length: ACTION_AXES }, () => -0.6 + random() * 0.4);
  const action = new Float64Array(ACTION_WIDTH);
  const head = forward(layout, weights, input, scratch);
  const oldLogp = sampleAction(head, logSigma, random, action, spec);
  return { layout, weights, scratch, input, logSigma, action, oldLogp };
}

/**
 * Every head's gradient in its own outputs is its own central difference.
 *
 * **This is a rule the session was handed rather than a test somebody thought of.** A new
 * distribution does not get an arm until its analytic gradient has been differenced against the
 * surrogate it claims to be the gradient of. A sign lost in a softmax, a missing factor on a
 * softplus chain, a squash whose derivative was written for the wrong variable -- none of those
 * show up as anything but a curve that fails to rise, and a night of ten six-hour arms is the
 * worst place in this tree to discover one.
 *
 * Differencing the *head* rather than the weights, for the reason the two tests at the top of this
 * file give: `backwardFrom` has its own check and what is new here is the numbers handed to it.
 * Under `sigma: "state"` that includes the nine spreads, which have moved from parameters of the
 * policy to outputs of the network -- so the same loop covers the squash without a second test,
 * and the assertion that `sigmaGrad` stays *empty* is what says they really moved.
 */
test("every_heads_gradient_in_its_own_outputs_is_its_central_difference", () => {
  const knobs = { clip: 0.2, entropy: 0.01 };
  const h = 1e-6;
  for (const [at, { name, spec }] of HEADS.entries()) {
    const { layout, weights, scratch, input, logSigma, action, oldLogp } = headBench(SEED + at * 13, spec);
    const adv = at % 2 === 0 ? 0.7 : -1.3;
    const head = Float64Array.from(forward(layout, weights, input, scratch));
    const delta = new Float64Array(spec.width);
    const sigmaGrad = new Float64Array(ACTION_AXES);
    const term = surrogateGrad(head, logSigma, action, oldLogp, adv, knobs, 1, delta, sigmaGrad, spec);
    assert.ok(Math.abs(term.ratio - 1) < 1e-9, `${name}: the bench head is not the collecting head`);
    for (let j = 0; j < spec.width; j += 1) {
      const was = head[j];
      head[j] = was + h;
      const up = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs, spec);
      head[j] = was - h;
      const down = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs, spec);
      head[j] = was;
      const numeric = -(up - down) / (2 * h);
      assert.ok(Math.abs(delta[j] - numeric) < 1e-5 * (1 + Math.abs(numeric)),
        `${name} output ${j}: analytic ${delta[j]}, numeric ${numeric}`);
    }
    if (spec.sigmaAt < 0) {
      for (let j = 0; j < ACTION_AXES; j += 1) {
        const was = logSigma[j];
        logSigma[j] = was + h;
        const up = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs, spec);
        logSigma[j] = was - h;
        const down = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs, spec);
        logSigma[j] = was;
        const numeric = -(up - down) / (2 * h);
        assert.ok(Math.abs(sigmaGrad[j] - numeric) < 1e-5 * (1 + Math.abs(numeric)),
          `${name} spread ${j}: analytic ${sigmaGrad[j]}, numeric ${numeric}`);
      }
    } else {
      for (let j = 0; j < ACTION_AXES; j += 1) {
        assert.equal(sigmaGrad[j], 0,
          `${name}: a state-dependent spread wrote ${sigmaGrad[j]} into the policy's own parameter`);
      }
      // Nor are the parameters read: the objective does not move when they do.
      const before = surrogateObjective(head, logSigma, action, oldLogp, adv, knobs, spec);
      const moved = Float64Array.from(logSigma, (x) => x + 0.5);
      assert.equal(surrogateObjective(head, moved, action, oldLogp, adv, knobs, spec), before,
        `${name}: the objective still reads the policy's own spreads`);
    }
  }
});

/**
 * A state-dependent spread lands inside its squash and moves with what it reads.
 *
 * Three claims, and the third is the one the arm rests on. That every spread is inside
 * `[floor, roof]` whatever the network says, which is what a squash is for and a clamp would give
 * too. That the ends are approached and never reached, which a clamp would *not*: a clamp has zero
 * gradient outside its range, and a spread that walked out of one could never walk back. And that
 * it is a function of the observation at all -- because a state-dependent sigma that came out the
 * same everywhere would be a constant one with more weights, and would look exactly like this arm
 * quietly succeeding at nothing.
 */
test("a_state_dependent_spread_is_squashed_and_is_a_function_of_what_it_reads", () => {
  const spec = headSpecOf("gaussian", "state");
  const layout = { inputs: 5, hidden: [7], outputs: spec.width };
  const weights = initWeights(layout, SEED + 77);
  const scratch = netScratch(layout);
  const random = mulberry32(SEED + 78);
  const constant = new Float64Array(ACTION_AXES).fill(-0.7);
  const into = new Float64Array(ACTION_AXES);
  const seen = [];
  for (let trial = 0; trial < 32; trial += 1) {
    const input = Float64Array.from({ length: 5 }, () => random() * 6 - 3);
    const head = forward(layout, weights, input, scratch);
    const ls = axisLogSigma(head, constant, spec, into);
    for (let j = 0; j < ACTION_AXES; j += 1) {
      assert.ok(ls[j] > SIGMA_FLOOR && ls[j] < SIGMA_ROOF,
        `trial ${trial} axis ${j} is ${ls[j]}, outside the squash`);
    }
    seen.push(Float64Array.from(ls));
  }
  let moved = 0;
  for (let j = 0; j < ACTION_AXES; j += 1) {
    const low = Math.min(...seen.map((row) => row[j]));
    const high = Math.max(...seen.map((row) => row[j]));
    if (high - low > 1e-3) moved += 1;
  }
  assert.equal(moved, ACTION_AXES, `only ${moved} of ${ACTION_AXES} spreads changed with the observation`);
  // And the policy's own nine are not read at all under this spread: nonsense in them changes nothing.
  const head = forward(layout, weights, Float64Array.from([1, 0, -1, 0.5, 0]), scratch);
  const a = Float64Array.from(axisLogSigma(head, constant, spec, into));
  const b = Float64Array.from(axisLogSigma(head, new Float64Array(ACTION_AXES).fill(99), spec, into));
  assert.deepEqual([...a], [...b], "the state-dependent spread read the policy's own parameters");
  // A constant spread is the identity on them, which is what says version 2 is untouched.
  const flat = axisLogSigma(head, constant, GAUSSIAN_HEAD, into);
  assert.deepEqual([...flat], [...constant]);
});

/**
 * A categorical axis tiles its range in nine bins, and a draw round-trips the bin it came from.
 *
 * The arithmetic here is silent everywhere else: `binOf(binCentre(b))` must be `b` for every bin,
 * or the log-probability the trainer reads belongs to a different bin from the one the body
 * played, and the ratio in the surrogate is a ratio of two unrelated numbers. The ends are the
 * case worth naming -- a Gaussian axis is clipped at the range, so `binOf` has to answer for a
 * value sitting exactly on it, and for one outside.
 */
test("the_categorical_axis_tiles_its_range_and_a_draw_round_trips_its_bin", () => {
  assert.equal(HEAD_BINS, 9);
  for (let b = 0; b < HEAD_BINS; b += 1) {
    assert.equal(binOf(binCentre(b)), b, `bin ${b} did not round-trip`);
    assert.ok(Math.abs(binCentre(b)) <= 1, `bin ${b} centres outside the range at ${binCentre(b)}`);
  }
  assert.ok(Math.abs(binCentre(0) + binCentre(HEAD_BINS - 1)) < 1e-12, "the bins are not symmetric about zero");
  assert.equal(binOf(-1), 0);
  assert.equal(binOf(1), HEAD_BINS - 1);
  assert.equal(binOf(-4), 0, "a value under the range fell off the bottom bin");
  assert.equal(binOf(4), HEAD_BINS - 1, "a value over the range fell off the top bin");
  // Every bin is reachable from the draw, which is what says the sampler is not a mode-finder.
  const spec = headSpecOf("mixed", "constant");
  const head = new Float64Array(spec.width);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  const random = mulberry32(SEED + 91);
  const action = new Float64Array(ACTION_WIDTH);
  const bins = new Set();
  const at = COMMAND_AXES.indexOf("standOff");
  for (let i = 0; i < 600; i += 1) {
    sampleAction(head, logSigma, random, action, spec);
    bins.add(binOf(action[at]));
  }
  assert.equal(bins.size, HEAD_BINS, `a flat head reached ${bins.size} of ${HEAD_BINS} bins`);
  // A head that is not flat concentrates, and the greedy read is the bin it concentrated on.
  head[spec.at[at] + 7] = 6;
  assert.equal(binOf(meanAction(head, new Float64Array(ACTION_WIDTH), spec)[at]), 7);
});

/**
 * A Beta axis draws strictly inside the interval a clipped Gaussian would pile onto its ends.
 *
 * The three axes `head: "beta"` claims -- `targetHeight`, `swing` and `bite` -- are exactly the
 * ones whose published range is the unit interval, and under a Gaussian their draw is *clipped*:
 * the body sees a value on the boundary while the density the trainer differentiates says the draw
 * was somewhere outside it. So what is asserted is the support, over enough draws to have hit a
 * clip many times if there were one, and that every draw has a finite log-probability. That the
 * density is the gradient's own is the business of the difference test above and is not restated.
 */
test("a_beta_axis_draws_strictly_inside_the_interval_a_clip_would_have_piled_onto", () => {
  const spec = headSpecOf("beta", "constant");
  const layout = { inputs: 4, hidden: [8], outputs: spec.width };
  const weights = initWeights(layout, SEED + 31);
  const scratch = netScratch(layout);
  const random = mulberry32(SEED + 32);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
  const action = new Float64Array(ACTION_WIDTH);
  const head = forward(layout, weights, Float64Array.from([1, -0.5, 0.25, 0]), scratch);
  const betas = ["targetHeight", "swing", "bite"].map((name) => COMMAND_AXES.indexOf(name));
  const reach = betas.map(() => ({ low: Infinity, high: -Infinity }));
  for (let i = 0; i < 800; i += 1) {
    const logp = sampleAction(head, logSigma, random, action, spec);
    assert.ok(Number.isFinite(logp), `draw ${i} has a log-probability of ${logp}`);
    for (const [k, j] of betas.entries()) {
      assert.ok(action[j] > -1 && action[j] < 1,
        `draw ${i} on axis ${j} landed on the boundary at ${action[j]}`);
      reach[k].low = Math.min(reach[k].low, action[j]);
      reach[k].high = Math.max(reach[k].high, action[j]);
    }
  }
  for (const [k, j] of betas.entries()) {
    assert.ok(reach[k].high - reach[k].low > 0.3,
      `axis ${j} only ever covered ${reach[k].low} to ${reach[k].high}`);
  }
  // The greedy read is inside the interval too, and a bout plays that rather than a draw.
  const mean = meanAction(head, new Float64Array(ACTION_WIDTH), spec);
  for (const j of betas) assert.ok(mean[j] > -1 && mean[j] < 1, `the mode on axis ${j} is ${mean[j]}`);
  // The six axes this head does not claim are still Gaussians, and still read their own spread.
  const other = COMMAND_AXES.map((_, j) => j).filter((j) => !betas.includes(j));
  for (const j of other) assert.equal(spec.kinds[j], "gaussian", `axis ${j} is a ${spec.kinds[j]}`);
});

/**
 * Every head recovers the optimum of the bandit whose answer is known before the run starts.
 *
 * The same problem the Gaussian head is put through above, run once per shape, with the paid axes
 * chosen to be axes that shape actually changed: the two categorical ones under `mixed`, two of
 * the three Beta ones under `beta`, and two Gaussians under `sigma: "state"`, where what changed
 * is not the axis but where its spread comes from. **A head whose gradient is right and whose
 * sampler is wrong passes the difference test above and fails this one**, which is the whole
 * reason both exist.
 *
 * The tolerance differs by shape because the shapes answer at different resolutions: a categorical
 * cannot do better than the centre of the bin its target is in, which is a quarter of the range
 * wide, so it is asked for the right neighbourhood rather than the right number.
 */
test("every_head_recovers_the_optimum_of_the_bandit_it_is_paid_on", { timeout: 300_000 }, () => {
  const width = 4;
  for (const { name, spec, axes, target, tolerance } of [
    { name: "mixed", spec: headSpecOf("mixed", "constant"), axes: [0, 3], target: [0.5, -0.5], tolerance: 0.2 },
    { name: "beta", spec: headSpecOf("beta", "constant"), axes: [4, 7], target: [0.4, -0.5], tolerance: 0.2 },
    { name: "state", spec: headSpecOf("gaussian", "state"), axes: [0, 1], target: [0.6, -0.45], tolerance: 0.2 },
  ]) {
    const layout = { inputs: width, hidden: [24], outputs: spec.width };
    const valueLayoutHere = { inputs: width, hidden: [24], outputs: 1 };
    const weights = initWeights(layout, SEED);
    const valueWeights = initWeights(valueLayoutHere, SEED + 1);
    const logSigma = new Float64Array(ACTION_AXES).fill(-0.7);
    const norm = freshNormalisation(width);
    const random = mulberry32(SEED + 2);
    const scratch = netScratch(layout);
    const observation = Float64Array.from([1, 0.5, -0.25, 0]);
    const draw = new Float64Array(ACTION_WIDTH);
    const rounds = 90;
    const perRound = 192;
    let state = { actor: null, spread: null, critic: null };
    let first = 0;
    let last = 0;
    for (let round = 1; round <= rounds; round += 1) {
      const rollout = {
        count: perRound, width,
        x: new Float32Array(perRound * width),
        a: new Float64Array(perRound * ACTION_WIDTH),
        logp: new Float64Array(perRound),
        reward: new Float64Array(perRound),
        seconds: new Float64Array(perRound),
        done: new Uint8Array(perRound).fill(1),
      };
      let paid = 0;
      for (let i = 0; i < perRound; i += 1) {
        const head = forward(layout, weights, observation, scratch);
        const logp = sampleAction(head, logSigma, random, draw, spec);
        const reward = -((draw[axes[0]] - target[0]) ** 2) - ((draw[axes[1]] - target[1]) ** 2);
        rollout.x.set(observation, i * width);
        rollout.a.set(draw, i * ACTION_WIDTH);
        rollout.logp[i] = logp;
        rollout.reward[i] = reward;
        paid += reward;
      }
      paid /= perRound;
      if (round === 1) first = paid;
      if (round === rounds) last = paid;
      const fit = ppoFit(rollout, {
        weights, logSigma, valueWeights, layout, valueLayout: valueLayoutHere, norm,
        seed: SEED + round, spec,
        halfLife: 1, lambda: 0.95, clip: 0.2, entropy: 0.0005, rate: 0.012, valueRate: 0.02,
        sigmaRate: 0.012, epochs: 4, batch: 64, targetKl: 0.02, sigmaFloor: -4, sigmaRoof: 0.5,
        ...state,
      });
      state = { actor: fit.actor, spread: fit.spread, critic: fit.critic };
    }
    const mean = meanAction(forward(layout, weights, observation, scratch), new Float64Array(ACTION_WIDTH), spec);
    for (const [k, j] of axes.entries()) {
      assert.ok(Math.abs(mean[j] - target[k]) < tolerance,
        `${name} axis ${j} arrived at ${mean[j]}, wanted ${target[k]}`);
    }
    assert.ok(last > first + 0.2, `${name}: the mean reward went from ${first} to ${last}`);
  }
});

/**
 * A version-3 table round-trips through the module renderer, at every shape and both widths.
 *
 * What could go wrong and be invisible is a field that survives the fit and not the artifact: a
 * head declared in memory, dropped by the renderer, and read back as a Gaussian by a build that
 * has no way of knowing better -- weights of the right *count* under the wrong distribution, which
 * loads, runs, and is a different mind. So every declared field is compared after the trip, and
 * the layout with it, because the layout is the only field whose width the head decides.
 */
test("a_version_3_table_round_trips_through_the_module_text_at_every_shape", () => {
  assert.equal(POLICY_VERSION, 3);
  assert.deepEqual([...POLICY_VERSIONS_READ], [2, 3]);
  const marker = "export const POLICY_WEIGHTS: PolicyWeights = ";
  for (const { name, spec } of HEADS) {
    for (const features of [1, 2]) {
      const layout = policyLayout(features, spec);
      assert.equal(layout.inputs, features === 1 ? PILOT_FEATURE_COUNT : PILOT_FEATURE_COUNT_V2);
      assert.equal(layout.outputs, spec.width);
      const table = {
        ...freshPolicyTable(
          // `|| 0` is not decoration: `Math.round` gives back a negative zero for a small negative
          // number, `JSON.stringify` writes it as `0`, and the two are not `deepStrictEqual`.
          Array.from({ length: netSize(layout) }, (_, k) => (Math.round(Math.sin(k) * 1e4) || 0) / 1e5),
          Array.from({ length: ACTION_AXES }, (_, k) => -0.7 + k / 100), features, spec,
        ),
        seed: SEED, date: "2026-09-10", iterations: 60, bouts: 64, steps: 400,
        halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.003,
        score: 0.5, baselines: { uniform: 0.3 },
      };
      assert.equal(table.version, 3);
      assert.equal(table.head, spec.head);
      assert.equal(table.sigma, spec.sigma);
      checkPolicyWeights(table);
      const text = renderPolicyModule(table);
      const at = text.indexOf(marker);
      assert.ok(at > 0, `${name}/${features}: the module does not export the table`);
      const back = JSON.parse(text.slice(at + marker.length, -2)
        .replace("\"reward\":GOLEM_REWARD", `"reward":${JSON.stringify(GOLEM_REWARD)}`));
      for (const field of ["version", "features", "head", "sigma", "sigmaFloor", "sigmaRoof"]) {
        assert.equal(back[field], table[field], `${name}/${features}: ${field} did not survive the module`);
      }
      assert.deepEqual(back.layout, { ...layout, hidden: [...layout.hidden] });
      assert.deepEqual(back.weights, table.weights, `${name}/${features}: a weight moved`);
      assert.deepEqual(back.logSigma, table.logSigma);
      checkPolicyWeights(back);
      // And the module says out loud which shape a reader is looking at.
      assert.match(text, new RegExp(`version 3 over feature version ${features}`));
    }
  }
  // The shipped table is the other half of the claim: it predates all of this and still loads.
  checkPolicyWeights(POLICY_WEIGHTS);
  assert.equal(POLICY_WEIGHTS.layout.inputs, PILOT_FEATURE_COUNT);
  assert.equal(POLICY_WEIGHTS.layout.outputs, ACTION_WIDTH);
});

/**
 * A contender carries its own shape and its own executor rows, and a misspelled row is refused.
 *
 * `--tactics` and `--override` are two different instruments and the difference is the whole of
 * arms h, i and j: an override moves `GOLEM_TACTICS_V4` inside the worker and therefore moves it
 * for **both** corners, which measures what happens when the arena changes. `--tactics` moves the
 * table one contender is built over, so the arm fights a shipped executor with a changed one --
 * which is the question "would this row help the mind that learned under it", and is the only form
 * in which an executor row can be rated against a control at all.
 *
 * The refusal is the part that would otherwise be silent: a misspelled row is a flag that does
 * nothing, and an arm that ran a flag that did nothing measured its own control twice.
 */
test("a_contender_carries_its_own_shape_and_its_own_executor_rows", () => {
  assert.deepEqual(parseTactics("holdMyReach=true"), { holdMyReach: true });
  assert.deepEqual(parseTactics("strokeOutOfRange=false"), { strokeOutOfRange: false });
  assert.deepEqual(parseTactics("closeGain=0.9"), { closeGain: 0.9 });
  assert.deepEqual(parseTactics("holdMyReach=true, closeGain=0.9"), { holdMyReach: true, closeGain: 0.9 });
  assert.equal(parseTactics(null), null);
  assert.equal(parseTactics(""), null);
  assert.throws(() => parseTactics("holdMyReech=true"), /not a row of the fourth executor/);
  assert.throws(() => parseTactics("closeGain"), /row=value/);
  assert.throws(() => parseTactics("closeGain=quite a lot"), /neither a number nor a flag/);
  // Session 02 of the signal set: the two readings of one stand-off axis, named together. The
  // *executor* still resolves a table carrying both, and `src/golem/tactics-v4.ts` documents which
  // way -- what is refused is a **harness** that named both, because the run would have measured
  // `holdMetres` and written `holdMyReach` in its own header.
  assert.throws(() => parseTactics("holdMetres=true, holdMyReach=true"),
    /two readings of one stand-off axis/);
  assert.deepEqual(parseTactics("holdMetres=true, holdMyReach=false"), { holdMetres: true, holdMyReach: false },
    "only the pair that is a contradiction is refused; one of them off is a table and not a mistake");

  // The shipped shape is the object a contender has always been: no head fields it did not ask for
  // beyond the declaration, and no `tactics` key at all when nothing overrides the table.
  const plain = contenderShape();
  assert.equal(plain.version, POLICY_VERSION);
  assert.equal(plain.features, 1);
  assert.equal(plain.head, "gaussian");
  assert.equal(plain.sigma, "constant");
  assert.deepEqual(plain.layout, { ...POLICY_LAYOUT, hidden: [...POLICY_LAYOUT.hidden] });
  assert.equal("tactics" in plain, false, "a contender under the shipped executor named a table");
  assert.equal("tactics" in contenderShape({ tactics: {} }), false, "an empty table is still a table");

  const spec = headSpecOf("mixed", "state");
  const wide = contenderShape({ features: 2, spec, tactics: { holdMyReach: true } });
  assert.equal(wide.features, 2);
  assert.equal(wide.layout.inputs, PILOT_FEATURE_COUNT_V2);
  assert.equal(wide.layout.outputs, spec.width);
  assert.deepEqual(wide.tactics, { holdMyReach: true });
  // And a table built to that shape loads, which is what the worker does with it.
  checkPolicyWeights({
    ...freshPolicyTable(new Array(netSize(wide.layout)).fill(0),
      new Array(ACTION_AXES).fill(-0.7), 2, spec),
    ...wide,
  });

  // The entropy stage, which is the other flag a manifest can spell wrong at no cost until it fires.
  assert.equal(parseEntropyStage("0.003"), 0.003);
  assert.equal(parseEntropyStage("0"), 0);
  assert.throws(() => parseEntropyStage("-1"), /not an entropy coefficient/);
  assert.throws(() => parseEntropyStage("lots"), /not an entropy coefficient/);
  assert.deepEqual(parseSchedule("0.003:0,0.0003:20", parseEntropyStage),
    [{ from: 0, value: 0.003 }, { from: 20, value: 0.0003 }]);
});

/**
 * Session 10 of the learn set: one rating call, two arrangements, two difference tables, and the
 * bouts behind them disjoint.
 *
 * The disjointness is the claim worth a test rather than the two tables. If the two halves shared
 * their bouts, the pair of numbers would be one measurement printed twice with two labels on it --
 * which is worse than having only the mirror, because it would look like corroboration. They are
 * kept apart by two things and both are asserted: the arrangement moves the pool (`viableMirror`
 * against the class filter) and `ratingSeed` moves the random half off the mirrored one's stream,
 * so that a mirrored rating taken today is byte-identical to one taken before this session and the
 * random half is not a re-labelling of it.
 */
test("ratePolicy_rates_two_pools_in_one_call_from_disjoint_bouts", { timeout: 600_000 }, async () => {
  // The seeds first, because they are the half of the claim that costs nothing to check.
  assert.deepEqual([...RATING_POOLS], ["mirror", "random"]);
  assert.equal(ratingSeed(SEED, "mirror"), SEED >>> 0,
    "the mirrored rating is on the stream it has always been on, or the record's old numbers move");
  assert.notEqual(ratingSeed(SEED, "random"), ratingSeed(SEED, "mirror"));
  assert.equal(poolWord("mirror"), "the mirror");
  assert.equal(poolWord("random"), "random viable pairs");

  // The whole viable class list and not a narrowed one, because the two pools have to be able to
  // differ: every maul and mace build can finish a copy of itself, so a run filtered to those two
  // classes would hand both arrangements the same list and the test would pass on a bug.
  const pool = poolFor({ seed: SEED, random: 40, terminals: [...VIABLE_TERMINALS], mirror: false });
  const rated = await ratePolicy({
    weights: new Float64Array(netSize(POLICY_LAYOUT)),
    logSigma: Float64Array.from({ length: ACTION_AXES }, () => -0.7),
    norm: { count: 0, mean: new Array(PILOT_FEATURE_COUNT).fill(0), variance: new Array(PILOT_FEATURE_COUNT).fill(1) },
    league: ["golem-driver"], pool, seed: SEED, bouts: 2, workers: 2, cap: 8,
    terminals: [...VIABLE_TERMINALS], pools: ["mirror", "random"],
  });
  assert.deepEqual(rated.pools, ["mirror", "random"]);
  assert.deepEqual(Object.keys(rated.byPool).sort(), ["mirror", "random"]);
  // Two tables, each with a row a baseline, and the first pool asked for repeated at the top level
  // so that every caller written before this session reads what it always read. Three baselines
  // since Session 02 of the signal set: the fencer is the mind the matchup set left in front, so a
  // rating that does not face it cannot say whether an arm is closing on anything that matters.
  for (const which of ["mirror", "random"]) {
    assert.deepEqual(Object.keys(rated.byPool[which].differences).sort(), ["driver", "fencer", "uniform"]);
  }
  assert.deepEqual(rated.differences, rated.byPool.mirror.differences);
  assert.equal(rated.byPool.mirror.mirror, true);
  assert.equal(rated.byPool.random.mirror, false);
  // The pool is narrowed at each arrangement's own question: `viableMirror` for one, the class
  // filter for the other. A caller that handed over an already-mirrored list would see these two
  // counts equal, which is how the league's own rating was quietly rating both halves on thirteen
  // builds until this session.
  assert.ok(rated.byPool.random.builds > rated.byPool.mirror.builds,
    `${rated.byPool.random.builds} random builds against ${rated.byPool.mirror.builds} mirrored`);
  // And the bouts themselves are two sets: mirrored bouts put one build in both corners, so every
  // one of them is a body against itself, and the random half has at least one pairing that is not.
  const mirroredBout = rated.byPool.mirror.results;
  const randomBout = rated.byPool.random.results;
  assert.equal(mirroredBout[FIT_NAME].bouts, randomBout[FIT_NAME].bouts,
    "the same budget either way, so a difference between the tables is not a difference in bouts");
  assert.notDeepEqual(mirroredBout, randomBout,
    "two arrangements of the same minds over the same budget that agreed bout for bout would be "
    + "one measurement wearing two labels");

  // The refusals, which are cheap and are what stops a manifest's typo from buying the same
  // measurement twice under two names.
  await assert.rejects(() => ratePolicy({
    weights: new Float64Array(netSize(POLICY_LAYOUT)),
    logSigma: Float64Array.from({ length: ACTION_AXES }, () => -0.7),
    norm: { count: 0, mean: new Array(PILOT_FEATURE_COUNT).fill(0), variance: new Array(PILOT_FEATURE_COUNT).fill(1) },
    pool, seed: SEED, bouts: 2, workers: 1, cap: 8, pools: ["mirror", "mirror"],
  }), /one pool is one rating/);
  await assert.rejects(() => ratePolicy({
    weights: new Float64Array(netSize(POLICY_LAYOUT)),
    logSigma: Float64Array.from({ length: ACTION_AXES }, () => -0.7),
    norm: { count: 0, mean: new Array(PILOT_FEATURE_COUNT).fill(0), variance: new Array(PILOT_FEATURE_COUNT).fill(1) },
    pool, seed: SEED, bouts: 2, workers: 1, cap: 8, pools: ["mirror", "held-out"],
  }), /is not an arrangement this rating knows/);
});

/**
 * The mirror share, which is the share of a rollout's bouts that puts one build in both corners.
 *
 * Exactly one and exactly zero are not rounded, and that is the point of the branch: a run at the
 * default has to schedule byte-identically to every run in the record, and a run at zero has to
 * have no mirrored bouts at all rather than one cycle's worth left over by arithmetic.
 */
test("a_mirror_share_splits_a_rollout_by_whole_cycles_and_never_rounds_the_ends_away", () => {
  assert.deepEqual(boutSplit(16, 1), { mirror: 16, random: 0 });
  assert.deepEqual(boutSplit(16, 0), { mirror: 0, random: 16 });
  assert.deepEqual(boutSplit(16, 0.5), { mirror: 8, random: 8 });
  // Whole cycles, so the declared opponent mix is the realised one on both sides of the split.
  assert.deepEqual(boutSplit(20, 0.5, 5), { mirror: 10, random: 10 });
  assert.deepEqual(boutSplit(20, 0.25, 5), { mirror: 5, random: 15 });
  // A share strictly between zero and one always leaves at least one cycle of each, however small
  // the rollout or however lopsided the share: a run that asked for both and got one is a run
  // whose header says something its bouts do not.
  const tiny = boutSplit(10, 0.05, 5);
  assert.equal(tiny.mirror, 5);
  assert.equal(tiny.random, 5);
  assert.deepEqual(boutSplit(1, 0.5, 1), { mirror: 1, random: 0 },
    "a single pairing cannot be split, and a share at or above a half keeps the mirror");
  assert.throws(() => boutSplit(16, 1.5), /is not a share/);
  assert.throws(() => boutSplit(16, -0.1), /is not a share/);
  // And a share that wants random pairs with no pool to draw them from is refused by name rather
  // than drawing them out of the mirrored list, which would be thirteen bodies two at a time.
  assert.throws(() => mixedSchedule({
    pool: poolFor({ seed: SEED, random: 0, terminals: ["maul"], mirror: true }), randomPool: null,
    policies: ["golem-driver"], pairs: [["golem-driver", "golem-driver"]], pairings: 4,
    seed: SEED, cap: 8, mirrorShare: 0.5,
  }), /wants a pool to draw random pairs from/);
});

// ---------------------- Session 02 of the signal set: the defaults, and the three refusals

/**
 * `ppoFit`'s four defaults, asserted literally, because nothing else in this suite can see them.
 *
 * Both production CLIs pass all four explicitly, so these numbers govern exactly one caller: one
 * written by hand, in a test or at a REPL, that takes the signature's word for what a sane fit is.
 * The word it used to take was `3e-4 / 512 / 3 / 0.02`, which is precisely the row Session 13 of
 * the style set measured, on 2026-09-08, as stopping the fit **after its first minibatch every
 * time** -- 512 samples out of the 57,000 the harness had just spent twenty seconds and thirty
 * workers collecting -- at an explained variance of -0.790. The bandits below override every knob
 * by hand, which is why the suite could not catch that and why this test is literal.
 */
test("the_fits_four_defaults_are_the_row_the_calibration_measured_and_not_the_row_it_refuted", () => {
  // Read off the signature itself, because a default is only observable to a caller that omits the
  // argument and there is no other way to say "and it is this number" about all four at once.
  const source = ppoFit.toString();
  const header = source.slice(0, source.indexOf("}"));
  const defaultOf = (name) => {
    const found = new RegExp(String.raw`\b${name} = ([^,\n]+)`).exec(header);
    return found === null ? null : found[1].trim();
  };
  assert.equal(defaultOf("rate"), "1e-4", "2026-09-08: 3e-4 is the rate the calibration refuted");
  assert.equal(defaultOf("batch"), "4096", "512 is one minibatch of a 57,000-sample rollout");
  assert.equal(defaultOf("epochs"), "4", "three passes over one minibatch is three passes over nothing");
  assert.equal(defaultOf("targetKl"), "0.03", "0.02 is what stopped the fit after that one minibatch");
  // The other eight are unchanged, and are here so that a future session moving one of them has to
  // say so in this file rather than in a signature nobody reads.
  assert.equal(defaultOf("halfLife"), "4");
  assert.equal(defaultOf("lambda"), "0.95");
  assert.equal(defaultOf("clip"), "0.2");
  assert.equal(defaultOf("entropy"), "0.003");
  assert.equal(defaultOf("valueRate"), "1e-3");
  assert.equal(defaultOf("sigmaRate"), "null", "null is ten times the actor's rate, computed inside");
  assert.equal(defaultOf("sigmaFloor"), "-3");
  assert.equal(defaultOf("sigmaRoof"), "0.5");
});

/**
 * An entropy target has to be a spread the axis can actually hold, and the message prints the band.
 *
 * A Gaussian axis's entropy is `logSigma + 0.5 (log 2pi + 1)` and depends on nothing else, so a
 * target outside `[floor + C, roof + C]` asks the controller for a spread the clamp will not give
 * it: the coefficient walks to a bound on iteration one and stays there, and the run looks like a
 * run rather than like a misconfiguration. Session 09 of the learn set passed -1.0 against a floor
 * of -1.581 and its arm was still the best on the pool that mattered, which is the worst way to
 * find out.
 */
test("an_entropy_target_outside_the_band_the_two_bounds_allow_is_refused_with_the_band", () => {
  assert.ok(Math.abs(GAUSSIAN_ENTROPY_OFFSET - 1.41894) < 1e-4, "0.5 (log 2pi + 1)");
  assert.equal(checkEntropyTarget(null, -3, 0.5), null, "no target is not a bad target");
  assert.equal(checkEntropyTarget(1.5, -3, 0.5), 1.5);
  assert.equal(checkEntropyTarget(-1.5, -3, 0.5), -1.5);
  // Session 09's own arm: a target of -1.0 against a floor of -1.581, which is below the band.
  assert.throws(() => checkEntropyTarget(-1.0, -3, -3), /is outside \[-1\.581, -1\.581\]/);
  assert.throws(() => checkEntropyTarget(2.5, -3, 0.5), /is outside \[-1\.581, 1\.919\]/);
  assert.throws(() => checkEntropyTarget(2.5, -3, 0.5), /would saturate against the bound and never turn round/);
  assert.throws(() => checkEntropyTarget("often", -3, 0.5), /is not an entropy per axis/);
});

/**
 * A mirror share the schedule cannot realise is refused before the bouts, naming a budget that can.
 *
 * `boutSplit` rounds each half to a whole number of opponent cycles and that rounding does not
 * move -- it is what makes a declared opponent mix the realised one, and three tests pin it. What
 * was missing is the other half of the sentence: a share that rounds away is a configuration change
 * wearing a cost saving's clothes, and the whole of what it costs is found afterwards. Session 11
 * of the learn set asked for 0.5 over a six-opponent cycle at 32 bouts and trained at 0.667, and
 * nothing said so -- the headline run of a plan set, confounded on an axis the flag claimed to set.
 */
test("a_mirror_share_the_schedule_cannot_realise_is_refused_with_a_budget_that_can", () => {
  // Session 11's own numbers: 32 bouts is 16 pairings, rounded up to 18 over a cycle of six, and
  // the mirrored half takes two of the three cycles.
  assert.deepEqual(boutSplit(18, 0.5, 6), { mirror: 12, random: 6 });
  assert.equal(realisedMirrorShare(18, 0.5, 6), 2 / 3);
  assert.throws(() => checkMirrorShare(18, 0.5, 6), /realises 0\.667/);
  assert.throws(() => checkMirrorShare(18, 0.5, 6), /the budget and not the flag is what has to move/);
  assert.throws(() => checkMirrorShare(18, 0.5, 6), /48 bouts an iteration would meet it/);
  // A budget that divides is returned rather than refused, and so is one inside the tolerance.
  assert.equal(checkMirrorShare(24, 0.5, 6), 0.5);
  assert.equal(checkMirrorShare(4, 0.5, 1), 0.5);
  assert.equal(MIRROR_SHARE_TOLERANCE, 0.05);
  assert.equal(checkMirrorShare(1, 1, 1), 1, "a mirrored iteration is every iteration before Session 10");
});
