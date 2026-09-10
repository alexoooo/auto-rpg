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
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { forward, initWeights, netScratch, netSize } from "../src/golem/neural-net.ts";
import {
  ACTION_AXES, ACTION_GATES, ACTION_WIDTH, POLICY_LAYOUT, actionEntropy, actionLogProb,
  checkPolicyWeights, commandFromAction, freshNormalisation, freshPolicyTable, golemPolicy,
  meanAction, normalise, sampleAction, uniformPilot,
} from "../src/golem/policy.ts";
import { POLICY_WEIGHTS } from "../src/golem/policy-weights.ts";
import { COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, freshCommand } from "../src/golem/tactics-v4.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { PILOT_FEATURE_COUNT } from "../src/golem/pilot.ts";
import { policyMind } from "../src/mind.ts";
import { policyForUnit } from "../src/units.ts";
import { mulberry32 } from "../src/rng.ts";
import {
  advantages, checkpointFor, cohensD, explainedVariance, extendNormalisation, mergeRollouts,
  momentsFromJson, momentsToJson, parseTerminals, poolFor, ppoFit, renderPolicyModule,
  resumesOwnLog, rolloutPairs, surrogateGrad, surrogateObjective,
} from "../scripts/train-ppo.mjs";
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
    done: Uint8Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)),
    margin: rewards.reduce((a, b) => a + b, 0),
  };
}

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
 * Session 14's calibration is a sweep over four coefficients that had been argued and never
 * moved, and the only reason it can be a flag rather than a rebuild is that the reward is
 * applied here, in the main thread, to packs that carry `dealt`, `taken`, `seconds`, `clinch`
 * and `idle` raw. This pins that: one pack, three tables, three answers -- and `penalty`
 * counting the clock alongside the two older charges, so a run under a non-zero `tick` reports
 * the share its shaping actually took.
 */
test("a_rollout_pays_the_table_it_is_given_and_reports_every_charge_in_it", () => {
  const raw = pack("left", "left", [0.1, 0.2]);
  raw.clinch = Float64Array.from([1, 0]);
  raw.idle = Float64Array.from([0, 2]);
  raw.seconds = Float64Array.from([0.5, 0.25]);

  const bare = mergeRollouts([raw], { win: 0, clinch: 0, idle: 0, tick: 0 });
  assert.ok(Math.abs(bare.reward[0] - 0.1) < 1e-12, `${bare.reward[0]}`);
  assert.ok(Math.abs(bare.reward[1] - 0.2) < 1e-12, "the win term was paid by a table that is all zeros");
  for (const i of [0, 1]) assert.equal(bare.penalty[i], 0);

  // The same two asks under a table with every row non-zero, each term checked on its own ask.
  const T = { win: 2, clinch: 0.01, idle: 0.02, tick: 0.008 };
  const full = mergeRollouts([raw], T);
  assert.ok(Math.abs(full.reward[0] - (0.1 - 0.01 - 0.008 * 0.5)) < 1e-12, `${full.reward[0]}`);
  assert.ok(Math.abs(full.reward[1] - (0.2 - 0.04 - 0.008 * 0.25 + 2)) < 1e-12, `${full.reward[1]}`);
  // `penalty` is what the three charges took and never the win, which is the outcome and not shaping.
  assert.ok(Math.abs(full.penalty[0] - (0.01 + 0.008 * 0.5)) < 1e-12, `${full.penalty[0]}`);
  assert.ok(Math.abs(full.penalty[1] - (0.04 + 0.008 * 0.25)) < 1e-12,
    `the win term was counted as a penalty: ${full.penalty[1]}`);

  // No table at all is the shipped table, so every caller that does not care reads as it did.
  const shipped = mergeRollouts([raw]);
  assert.ok(Math.abs(shipped.reward[1] - (0.2 - 2 * GOLEM_REWARD.idle + GOLEM_REWARD.win)) < 1e-12,
    `${shipped.reward[1]}`);
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
  assert.equal(text.length, disk.length, "the rendered module changed length");
  assert.equal(text, disk, "the renderer no longer reproduces the checked-in policy table");
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

/** Six refusals, by name, and the shipped table passes all of them. */
test("a_table_this_build_cannot_read_is_refused_by_name", () => {
  checkPolicyWeights(POLICY_WEIGHTS);
  const bad = (over, pattern) => assert.throws(() => checkPolicyWeights({ ...POLICY_WEIGHTS, ...over }), pattern);
  bad({ version: 99 }, /version 99/);
  bad({ features: 99 }, /feature version 99/);
  bad({ layout: { ...POLICY_LAYOUT, inputs: 7 } }, /layout|inputs/i);
  bad({ weights: [1, 2, 3] }, /weights|numbers/i);
  bad({ logSigma: [0, 0] }, /spread|logSigma|axes/i);
  bad({ normalisation: { count: 0, mean: [0], variance: [1] } }, /normalisation/i);
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
