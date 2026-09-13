// The gradient-signal probe: the cosine's arithmetic, the partition, and the term that must be off.
// Experiment B of the signal set's menu.
//
// **What an instrument's test file is for.** The probe prints one number an iteration and the
// whole of Experiment B is that number, so every way of being quietly wrong here is a published
// figure about nothing. Three of them are available and each has its own section below. The cosine
// could be arithmetic nobody checked -- so it is checked against pairs whose answer is known
// before the call. The two halves could overlap, or miss an ask, or be drawn from an order the fit
// never walks -- so the partition is asserted as an identity through the pool the fit itself sums
// through, and the order against an independently written Fisher-Yates. And the entropy bonus
// could be left on, which is the failure that would produce a *healthy* number from a rollout
// carrying nothing at all -- so the inflation is demonstrated rather than argued, beside the
// binding the shards were actually stepped under.
//
// **Six mutations of `scripts/gradient-probe.mjs` were watched red on 2026-09-12**, each applied
// alone and then restored:
//
// | mutation | what went red |
// |---|---|
// | `halfGradients` binds a non-zero coefficient instead of `PROBE_ENTROPY` | the entropy-off test and the inflation test |
// | `halfSplit` hands the second half the whole epoch, so the two overlap | the partition test, the averaging identity, the inflation test and the norms test |
// | `halfSplit` rounds both cuts up, so exactly one ask is in both halves | the partition test, the averaging identity and the norms test |
// | `cosineOf` divides by the sum of the two norms rather than by their product | the identical-pair test, the scale test and the norms test |
// | `cosineOf` calls a zero block perfect agreement rather than no angle at all | the zero-block test |
// | `epochOrder` shuffles from a stream of its own | the order test |
//
// **One of those six was green the first time it was run, and the reason is worth more than the
// row.** The sum-of-norms mutation answers `norm(a) / 2` for a block against itself -- 6.03 on the
// fixture the identical-pair test was written with -- and the clamp into `[-1, 1]` turned that into
// exactly 1, so the test that exists to pin the cosine's arithmetic reported the arithmetic as
// correct. It takes a *unit-length* pair beside the long one now, where the two denominators are 1
// and 2 and the clamp has nothing to hide. A clamp is a guard against the last bits and it is also
// a way to make a wrong answer look right; a fixture whose norm is not near 1 cannot see it.
//
// **The class split added four more on the same day**, watched red the same way and against the
// tests that do not want a fit pool, so the whole table runs in under two seconds:
//
// | mutation | what went red |
// |---|---|
// | `askClasses` closes the episode before reading its body, so every last ask of a bout is filed under the next one | the trace test, and all three of the partition tests downstream of it |
// | `classBlocks` partitions the rollout's own index order rather than the fit's shuffled order | the halves test, on the assertion that a class comes out in the order the epoch walks |
// | the control is the class's own two halves again rather than a prefix of the shuffled order | the control test, on the assertion that its two blocks are disjoint |
// | the floor is read against a class's whole ask count rather than against one of its halves | the drop test |
//
// **Two of those four were green the first time and the fixtures were wrong, not the code.** The
// drop test was written with classes of 100 asks against a floor of 400, where a class is under
// the floor whole *and* halved and the two spellings cannot be told apart; it is written with
// classes of 600 now, which are over the floor whole and under it halved. And the first spelling of
// the off-by-one mutation swapped two lines that were already independent of each other, so it was
// not a mutation at all -- a green row in a table like this is worth nothing until the mutation is
// read back and confirmed to be the mistake it claims to be.
//
// A fifth lives in `tests/ppo.test.mjs`, because the code it mutates does: `bodyOf` filing a build
// under its primary socket's terminal rather than its armed hand's, which is the mistake this was
// actually written with and which the first live run caught by reporting three classes where the
// pool had been narrowed to two.
//
// **The bout split added five more on 2026-09-12**, watched red the same way:
//
// | mutation | what went red |
// |---|---|
// | `askBouts` advances the episode before reading its bout, so every last ask of one is filed under the next | the trace test and all four of the splits downstream of it |
// | `askBouts` refuses a bout of `null` rather than anything that is not a whole number | the refusal test, on the entry an older worker would leave undefined |
// | `boutBlocks` alternates bouts between the halves instead of filling the lighter one | the halves test, on the exact 400-against-600 split |
// | `boutBlocks` hands the second half the whole re-laid order, so the two overlap | the halves test and the end-to-end row |
// | `boutGradients` steps the caller's order rather than the re-laid one | the order test, which exists for this mutation and no other reason |
//
// **The first of those was green in its first spelling, for the reason this file already records
// one paragraph up**: it swapped `keys[i] = bout` with the `done` advance, and the bout had been
// read into a local before either of them, so the two lines were already independent and the swap
// was not a mutation. The lesson did not transfer on its own and is now written down twice.
//
// **One identity is refused rather than asserted, and it is worth naming which.** That
// `rollout.episodeBouts` holds one entry an episode in the order `mergeRollouts` concatenated its
// parts is a fact about `collectRollouts`, which no test in this tree runs -- a live collection is
// bouts and this file is arithmetic. So `askBouts` throws on every way the identity could be
// broken and asserts none of it, which is the same footing `askClasses` stands on.
//
// **The reward axis added seven more on 2026-09-12**, watched red the same way. It is the first
// cut this file measures that changes a number the fit reads rather than the way one is taken, so
// the mutations divide into the ones that break the arm and the ones that break its pairing:
//
// | mutation | what went red |
// |---|---|
// | an arm's unknown row is ignored rather than refused by name | the refusal test |
// | a repeated arm label is allowed, so two arms answer to one name | the refusal test |
// | an arm starts from an empty table rather than from the shipped one | the shipped-rows test |
// | an arm reuses the row's standardised advantages instead of standardising its own | the pairing test |
// | an arm reuses the row's returns instead of the ones its own table implies | the pairing test |
// | an arm is cut on a shuffle of its own rather than on the order the row was cut on | the pairing test |
// | a shaping share is taken over what the asks netted rather than over what they paid | the share test |
//
// **The last three of those are the reason the pairing test asserts an identity and a difference
// at once.** An arm that reuses too much of the row agrees with it exactly and passes anything
// that only asks whether the arms are plausible; an arm that reuses too little disagrees with it
// for a reason that is the instrument's rather than the table's. So the identity arm -- the
// shipped coefficients, named on purpose -- has to reproduce the row to the last digit, and the
// no-shaping arm has to fail to, and no single mutation above can satisfy both.
//
// **The credit horizon joined the same file and added five more on 2026-09-12.** `halfLife` and
// `lambda` are free along exactly the axis the coefficients are -- neither changes how a held
// policy acts, both are read after a collection -- so they are rows of an arm rather than a second
// grid, and the mutations are about keeping the two vocabularies apart:
//
// | mutation | what went red |
// |---|---|
// | an arm's horizon is read and then not used, so every arm runs the run's own | the horizon test |
// | a horizon is reported on every arm rather than only on the arm that named one | the horizon test |
// | a horizon lands in the reward table instead of beside it | the arm-rows test |
// | a half-life of zero is allowed, so the next window is discounted by a division by zero | the arm-rows test |
// | a lambda outside the unit interval is allowed, so the recursion diverges rather than fails | the arm-rows test |
//
// **The last two are refusals at the edges the arithmetic actually breaks at**, which is not the
// same as tidy ones: `lambda` 0 and `lambda` 1 are both legal and both meaningful -- the one-step
// return and the whole episode -- and the test asserts they pass, so the refusal cannot be
// satisfied by refusing everything near the boundary.
//
// **The entropy bonus added six more on 2026-09-13**, watched red the same way. This is the first
// thing in the file that binds a production coefficient at all, and the module's one correctness
// property is that no cosine is taken under one -- so half the mutations are about the arithmetic
// and half are about that property surviving it:
//
// | mutation | what went red |
// |---|---|
// | both steps pay the production coefficient, so the difference is identically zero | all five bonus tests |
// | the difference is taken the other way round | the by-hand test, on the angle and not on the norm |
// | the pool is left bound at the production coefficient | the zero-block test |
// | the share divides by the bonus's own norm rather than by the data's | the spread test |
// | the bonus is taken over the front half of the order rather than over the whole of it | the by-hand test |
// | `probeRollout` hands the bonus the probe's coefficient instead of the run's | the row test |
//
// **The second of those is the one the fixture nearly could not see.** Reversing the subtraction
// leaves every norm in the block exactly where it was and only flips the angle, so a test that
// asserted the norms and called it a day would pass -- and the fixture's actor bonus stands at
// +0.092 to its data, which is close enough to a right angle that a sign flip is a change of 0.18.
// So the by-hand test asserts the cosine against an independently taken pair *and* asserts that
// the pair is not near-orthogonal, which is the assertion that makes the first one mean something.
//
// **The head cut added nine more on 2026-09-13.** It is the first reading in the file that is
// about *part* of the gradient, so the mutations divide into the ones that slice the wrong numbers
// and the ones that slice the right numbers under the wrong name:
//
// | mutation | what went red |
// |---|---|
// | the head is located one layer too early, so every group reads a hidden layer's row | all six |
// | an output's bias is taken from the head's weights rather than from the bias block | all six |
// | every axis is assumed to own one output rather than the span its spec declares | the coverage test, and only under `mixed`/`state` |
// | the gates are read from the front of the head rather than from `gateAt` | the coverage test, the by-hand test and the bonus test |
// | a group's weight row runs to the head's width rather than to its fan-in | the by-hand test and the bonus test |
// | a group past the end of the head is sliced rather than refused | the refusal test |
// | the bonus's head cut is taken over the data rather than over the bonus | the bonus test |
// | a head cut is written on every priced arm as well as on the row | the row test |
// | a layout with no spec beside it is accepted rather than refused | the row test |
//
// **The third row is the one that earned its fixture, and it would have been green against every
// run this project has ever made.** Under the shipped Gaussian head an axis owns exactly one
// output and `spec.at[j]` is `j`, so `of(name, spec.at[j], spec.span[j])` and `of(name, j, 1)` are
// the same call -- for the twelve-wide head, for every checkpoint on disk, and for every row in
// the record. The mutation is only a mutation under `--head mixed --sigma state`, where three axes
// own nine outputs apiece and nine spreads sit past the gates, which is why the coverage test is
// written over both heads and not over the one the runs use. A reader that assumed one output an
// axis would be correct today and would silently misattribute every number the moment the head
// that `docs/design.md` already describes is fitted.
//
// **The first two rows going red six times over is not six times the evidence.** Both move `base`,
// and a `base` that is wrong makes every group read numbers from somewhere else, so every
// assertion downstream of it fails at once -- including the ones that exist for other mistakes. A
// mutation table's rows are not comparable by their length, and the two rows that say the most
// here are the ones that went red exactly once.
//
// **What no mutation here can reach.** That the last layer is the right place to cut at all. A
// head output's own row and bias are unambiguously that output's and the two hidden layers are
// shared by all twelve, so the cut says what the *head* is being told and not what the network is.
// The by-hand test pins the consequence -- the twelve groups sum to the head's norm and the head
// is under four fifths of the vector -- which makes the limitation checkable without making it
// false.
//
// **The baseline axis added fourteen more on 2026-09-13.** An advantage is a return less a
// baseline, and a baseline is read after the bouts -- so it is the third quantity one held
// collection can be re-priced under, and the first whose value is a word rather than a number. Two
// of the five kinds are least-squares fits rather than lookups, so a third of the table is about
// arithmetic no other axis in this file needed:
//
// | mutation | what went red |
// |---|---|
// | the Monte-Carlo return is taken at the run's lambda rather than at 1 | the return test |
// | a position is divided by the episode's length, so no ask is ever at its end | the position test |
// | the position walk does not restart, so it runs over the whole rollout | the position test, the time test and the end-to-end row |
// | a grouped mean writes its group's sum rather than its mean | the grouped-mean test, the time test and the body test |
// | the linear fit carries no intercept | the plane test |
// | the normal equations are solved without the ridge on the diagonal | the dead-column test |
// | the Cholesky reads the lower triangle of a matrix held as its upper | the solve test and the plane test |
// | a non-positive pivot is called zero rather than refused | the singular test |
// | an unknown baseline kind falls through to the linear fit rather than being refused | the kind test |
// | the time baseline is grouped by the ask's own index rather than by its position | the time test |
// | the body baseline groups by the episode's terminal rather than by its build | the body test |
// | an arm's baseline is read and then not used, so every arm runs the row's critic | the end-to-end row |
// | a baseline is reported on every arm rather than only on the arm that named one | the end-to-end row |
// | an arm's baseline word is not checked, so it lands in the reward table | the arm-rows test and the end-to-end row |
//
// **One of the fourteen was green the first time, for the third time in this file, and the mistake
// was the same mistake twice removed.** The body fixture's three episodes drew `mace`, `draw-2`
// and `mace` -- whose *terminals* are `mace`, `maul` and `mace` -- so grouping by build and
// grouping by terminal produced the same cells and the two spellings could not be told apart. It
// draws three builds over two terminals now. The lesson this file has recorded twice already is
// that a mutation must be read back and confirmed to be the mistake it claims to be; what this row
// adds is that a *fixture* has to be built so the two axes it distinguishes actually disagree on
// it, and that is a different thing to check and it is checked in the same sitting.
//
// **The plane test is the strongest assertion available about a fit, and it is why it is written
// that way.** A least-squares baseline over a rollout of noise can only be asserted to have
// returned numbers; over a rollout whose return *is* a plane through the normalised columns it has
// an exact answer, and landing on it to six decimal places pins the accumulation, the ridge, the
// factorisation, both triangular solves and the intercept at once. The dead-column test is its
// complement: it asserts what the fit does *not* read, by writing a million into a zeroed column
// and requiring the baseline not to move.
//
// **What no mutation here can reach.** Whether any of the five is the right baseline. `critic` is
// what production uses, `zero` is the absence of one, and `time`, `body` and `linear` are three
// guesses at what an advantage should have been compared against -- two of them fitted in sample
// on the very collection they are then used on, which is optimistic by construction and is the
// point. That a baseline is *free* is the same claim the reward arms rest on and is false the
// moment a run fits; a grid of baselines is a diagnostic and nothing here asserts otherwise.
//
// **What no mutation here can reach, and it is the claim the sweep rests on.** That a reward
// coefficient does not change how a *held* policy acts is a fact about the collectors, which this
// file does not run: a body draws from weights that do not move, so the collection is the same
// collection whatever it is later priced at. It is argued in `priceRollout`'s own header, it is
// true by construction of `--hold`, and it is false the moment a run fits -- which is why the
// reward arms are a diagnostic and not a training result, and why nothing here asserts otherwise.
//
// And two that are green on purpose, recorded so the next reader does not re-derive them. Replacing
// `PROBE_EPOCH` with any other whole number changes nothing at all, because `FitPool.step` stores
// it in the control block and `shardStep` never reads it -- it is written for a person reading a
// row. And `cosineOf` answering the *dot product* for a zero block is not a mutation but an
// identity: a dot product with the zero vector is zero, so the two spellings cannot be told apart
// by anything.
import test from "node:test";
import assert from "node:assert/strict";

import { forward, initWeights, netScratch, netSize } from "../src/golem/neural-net.ts";
import {
  ACTION_AXES, ACTION_GATES, ACTION_WIDTH, GAUSSIAN_HEAD, actionLogProb, headSpecOf, normalise,
  sampleAction,
} from "../src/golem/policy.ts";
import { COMMAND_AXES, COMMAND_GATES } from "../src/golem/tactics-v4.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { mulberry32 } from "../src/rng.ts";
import { PARAM } from "../scripts/fit-worker.mjs";
import {
  FIT_SHUFFLE_SEED, FitPool, PRICED_COLUMNS, REWARD_KEYS, advantages, fitShuffle, fitShuffleRandom,
  ppoFit, priceRollout, standardisedAdvantages, valuesOf,
} from "../scripts/train-ppo.mjs";
import {
  CLASS_AXES, PROBE_ENTROPY, PROBE_EPOCH, askBouts, askClasses, askPositions, baselineOf, boutBlocks,
  boutGradients, checkHeldStart, classBlocks, cosineOf, dotOf, epochOrder, groupedMeans, halfGradients,
  halfSplit, headGroups, headNorms, headRows, headSignal, linearBaseline, mcReturns, measureBonus,
  measureSignal, normOf, parseClasses, probeRollout, rewardArms, shareOf, solveCholesky,
  wholeGradient,
} from "../scripts/gradient-probe.mjs";

const SEED = 20260917;

// ---------------------------------------------------------------------------------------
// The cosine, on partials whose answer is known before the call.
// ---------------------------------------------------------------------------------------

test("the_cosine_of_two_identical_partials_is_one_and_of_two_opposed_is_minus_one", () => {
  const a = Float64Array.from([0.4, -1.25, 3e-7, 0, 12]);
  const opposed = Float64Array.from(a, (x) => -x);
  assert.ok(Math.abs(cosineOf(a, a) - 1) < 1e-12, `a partial against itself read ${cosineOf(a, a)}`);
  assert.ok(Math.abs(cosineOf(a, opposed) + 1) < 1e-12, `a partial against its negation read ${cosineOf(a, opposed)}`);
  // And inside the interval a cosine lives in, whatever the last bits of the two roots do.
  assert.ok(cosineOf(a, a) <= 1 && cosineOf(a, opposed) >= -1);
  // **A pair of unit length as well, and the clamp is the reason.** Against the fixture above --
  // norm 12.1 -- a `cosineOf` that divided by the *sum* of the two norms instead of their product
  // answers 6.03, which the clamp turns into exactly 1 and this test then calls correct. Watched
  // green against that mutation on 2026-09-12. At unit length the two denominators are 1 and 2 and
  // there is nowhere to hide.
  const unit = Float64Array.from([0.6, -0.8]);
  assert.ok(Math.abs(normOf(unit) - 1) < 1e-15, "the second fixture is not of unit length");
  assert.ok(Math.abs(cosineOf(unit, unit) - 1) < 1e-12, `a unit partial against itself read ${cosineOf(unit, unit)}`);
});

test("the_cosine_of_two_orthogonal_partials_is_zero_and_a_zero_partial_reads_zero_with_a_zero_norm", () => {
  const across = Float64Array.from([1, 0, 0, 2]);
  const along = Float64Array.from([0, 3, -4, 0]);
  assert.equal(cosineOf(across, along), 0, "two partials sharing no axis are not at an angle");
  assert.equal(dotOf(across, along), 0);
  // A half whose every sample fell outside the clip carries no gradient at all. The cosine is zero
  // by convention and the norm beside it is what makes that unambiguous in a row -- which is the
  // whole reason a norm is reported.
  const nothing = new Float64Array(4);
  assert.equal(cosineOf(across, nothing), 0);
  assert.equal(cosineOf(nothing, nothing), 0);
  assert.equal(normOf(nothing), 0);
  assert.ok(normOf(across) > 0);
});

test("the_cosine_reads_the_angle_and_not_the_two_lengths", () => {
  const a = Float64Array.from([0.3, -0.7, 1.1]);
  const b = Float64Array.from([0.1, -0.2, 0.9]);
  const angle = cosineOf(a, b);
  assert.ok(angle > 0 && angle < 1, `the fixture is meant to be at an angle, not ${angle}`);
  // A half over twice the samples is a mean of the same quantity at a different length; if the
  // scale reached the answer, the two bout counts of Experiment B would not be comparable.
  const big = Float64Array.from(a, (x) => x * 1e6);
  const small = Float64Array.from(b, (x) => x * 1e-6);
  assert.ok(Math.abs(cosineOf(big, small) - angle) < 1e-12);
  assert.ok(Math.abs(normOf(big) - normOf(a) * 1e6) < 1e-6);
});

// ---------------------------------------------------------------------------------------
// The partition, and the order it is a partition of.
// ---------------------------------------------------------------------------------------

test("the_two_halves_partition_the_epoch_and_share_no_ask", () => {
  for (const count of [2, 3, 5, 128, 4097, 57_349]) {
    const { first, second } = halfSplit(count);
    assert.equal(first.at, 0, `an epoch of ${count} does not begin at its first ask`);
    assert.equal(first.end, second.at, `an epoch of ${count} leaves a gap or an overlap at the cut`);
    assert.equal(second.end, count, `an epoch of ${count} stops at ${second.end}`);
    assert.ok(first.end > first.at && second.end > second.at, `an epoch of ${count} has an empty half`);
    const sizes = [first.end - first.at, second.end - second.at];
    assert.equal(sizes[0] + sizes[1], count);
    assert.ok(Math.abs(sizes[0] - sizes[1]) <= 1, `an epoch of ${count} split ${sizes[0]}/${sizes[1]}`);
  }
  // An odd epoch gives the extra ask to the second half, and the row says both counts either way.
  assert.deepEqual(halfSplit(5), { first: { at: 0, end: 2 }, second: { at: 2, end: 5 } });
});

test("an_epoch_with_no_two_halves_in_it_is_refused_rather_than_measured", () => {
  assert.throws(() => halfSplit(1), /no two halves/);
  assert.throws(() => halfSplit(0), /no two halves/);
  assert.throws(() => halfSplit(2.5), /no two halves/);
});

/**
 * The order the halves are cut out of is the order the fit's first epoch walks.
 *
 * Asserted against a Fisher-Yates written out here rather than against the exported one, which is
 * the only way to say anything at all: `epochOrder` calls the fit's own shuffle, so comparing it
 * against that function would be comparing it against itself. What this pins is the stream, the
 * constant it is mixed with, and the direction of the walk -- three things a plausible rewrite
 * would each get differently, and every one of which would leave the probe measuring a fair
 * partition of an epoch nobody is optimising.
 */
test("the_probes_order_is_the_shuffled_order_the_fits_first_epoch_walks", () => {
  const count = 977;
  const seed = (SEED ^ 17 * 31) >>> 0;
  const random = mulberry32((seed ^ 0x9907e0) >>> 0);
  const wanted = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = wanted[i];
    wanted[i] = wanted[j];
    wanted[j] = held;
  }
  assert.deepEqual(epochOrder(count, seed), wanted);
  assert.equal(FIT_SHUFFLE_SEED, 0x9907e0, "the constant the fit's stream is mixed with moved");
  // A permutation and not merely a list of the right length: a shuffle that dropped an index would
  // give the two halves an ask twice and another never.
  assert.deepEqual([...epochOrder(count, seed)].sort((a, b) => a - b), wanted.slice().sort((a, b) => a - b));
  assert.deepEqual(fitShuffle([0, 1, 2, 3, 4], fitShuffleRandom(seed)).slice().sort((a, b) => a - b),
    [0, 1, 2, 3, 4]);
});

// ---------------------------------------------------------------------------------------
// The measurement, through the pool the fit sums its own minibatches through.
// ---------------------------------------------------------------------------------------

/** The head and the critic the probe's tests fit, small enough for a pool to open in a second. */
const LAYOUT = Object.freeze({ inputs: 6, hidden: Object.freeze([14, 10]), outputs: ACTION_WIDTH });
const VALUE = Object.freeze({ inputs: 6, hidden: Object.freeze([12]), outputs: 1 });

/**
 * A rollout at a small shape, under a normalisation that is emphatically not the identity.
 *
 * `tests/ppo.test.mjs`'s reason: an identity normalisation is precisely the case that would hide a
 * shard reading the wrong observation statistics, and the probe binds the shards itself. The
 * rewards are noise on purpose -- this fixture is a rollout with no signal in it, which is the
 * regime Experiment B exists to be able to report, and it is why the actor cosine below is small
 * rather than near one.
 */
function fixture(count = 256, seed = SEED + 3, { priced = false } = {}) {
  const width = LAYOUT.inputs;
  const random = mulberry32(seed);
  const norm = { count: 11_000, mean: [], variance: [] };
  for (let k = 0; k < width; k += 1) { norm.mean[k] = k - 2.5; norm.variance[k] = 0.2 + k / 4; }
  const weights = initWeights(LAYOUT, seed + 1);
  const valueWeights = initWeights(VALUE, seed + 2);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.6);
  const scratch = netScratch(LAYOUT);
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
    done: Uint8Array.from({ length: count }, (_, i) => (i % 32 === 31 ? 1 : 0)),
  };
  rollout.done[count - 1] = 1;
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < width; k += 1) {
      raw[k] = norm.mean[k] + Math.sqrt(norm.variance[k]) * (random() * 2 - 1) * 1.5;
      rollout.x[i * width + k] = raw[k];
    }
    normalise(raw, norm, observation);
    const head = forward(LAYOUT, weights, observation, scratch);
    sampleAction(head, logSigma, random, draw);
    rollout.a.set(draw, i * ACTION_WIDTH);
    rollout.logp[i] = actionLogProb(head, logSigma, draw);
    rollout.reward[i] = random() - 0.5;
  }
  // Off unless asked for, so every test written before the reward axis existed reads a rollout
  // that is byte for byte the one it read. With it, the fixture carries the quantities a table is
  // a coefficient on *and* its reward is what the shipped table pays for them -- both halves
  // matter, because a rollout whose `reward` did not come from its own `raw` would let an arm
  // naming the shipped coefficients disagree with the row it sits in for a reason that is the
  // fixture's and not the instrument's.
  if (priced) {
    rollout.raw = Object.fromEntries([
      ...PRICED_COLUMNS.map((row) => [row, new Float64Array(count)]),
      ["outcome", new Int8Array(count)],
    ]);
    for (let i = 0; i < count; i += 1) {
      // Quantities rather than noise: a duration is never negative, and a table swept over a
      // column that went negative would report a credit where the arena can only charge.
      rollout.raw.dealt[i] = random() < 0.2 ? random() * 0.1 : 0;
      rollout.raw.taken[i] = random() < 0.2 ? random() * 0.1 : 0;
      rollout.raw.clinch[i] = random() < 0.3 ? random() * 0.08 : 0;
      rollout.raw.idle[i] = random() * 0.05;
      rollout.raw.closing[i] = random() < 0.4 ? random() * 0.06 : 0;
      rollout.raw.stall[i] = random() < 0.3 ? random() * 0.08 : 0;
      rollout.raw.outside[i] = random() < 0.5 ? random() * 0.08 : 0;
      rollout.raw.swing[i] = random() < 0.1 ? 1 : 0;
      rollout.raw.outcome[i] = i < count / 2 ? 1 : -1;
    }
    Object.assign(rollout, priceRollout(rollout, GOLEM_REWARD));
  }
  return { rollout, norm, weights, valueWeights, logSigma };
}

/** Everything `halfGradients` needs, computed the way the fit computes it. */
function bindings({ rollout, norm, weights, valueWeights, logSigma }, seed = SEED + 9) {
  const values = valuesOf(rollout, valueWeights, norm, VALUE);
  const { advantage, returns } = advantages(rollout, values, { halfLife: 4, lambda: 0.95 });
  const { scaled, sd } = standardisedAdvantages(advantage, rollout.count);
  return {
    rollout, norm, weights, valueWeights, logSigma, scaled, returns, sd,
    order: epochOrder(rollout.count, seed), clip: 0.2,
  };
}

/**
 * The two half gradients average to the gradient over the whole epoch.
 *
 * This is the partition asserted as arithmetic rather than as a pair of index ranges, and it is
 * taken through the same `FitPool` the fit sums its minibatches through -- so it fails if the
 * halves overlap, if they miss an ask, if either is scaled by the wrong count, or if the second
 * half's step disturbed what the first one measured. Each half comes back as a mean over its own
 * samples, so the identity is the weighted average and not the plain one, and the tolerance is
 * about one fixed reassociation of a sum of a few hundred terms.
 */
test("the_two_half_gradients_average_to_the_gradient_over_the_whole_epoch", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const n = built.rollout.count;
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const [first, second] = halfGradients({ pool, ...bound });
    assert.equal(first.asks + second.asks, n);
    // The same binding, one range covering everything: the fit's own mean over the epoch.
    const whole = pool.step({
      at: 0, end: n, epoch: PROBE_EPOCH, order: bound.order,
      weights: built.weights, valueWeights: built.valueWeights, logSigma: built.logSigma,
    });
    for (const [which, block, size] of [
      ["actor", "grad", pool.size], ["spread", "sigmaGrad", ACTION_AXES], ["critic", "valueGrad", pool.valueSize],
    ]) {
      let most = 0;
      let scale = 0;
      for (let k = 0; k < size; k += 1) {
        const averaged = (first.asks * first[which][k] + second.asks * second[which][k]) / n;
        most = Math.max(most, Math.abs(averaged - whole[block][k]));
        scale = Math.max(scale, Math.abs(whole[block][k]));
      }
      assert.ok(most <= 1e-12 * (1 + scale), `the ${which} halves average to something ${most} away`);
      assert.ok(scale > 0, `the whole epoch's ${which} gradient is identically zero`);
    }
  } finally {
    await pool.close();
  }
});

/**
 * The probe binds the shards an entropy coefficient of exactly zero.
 *
 * The single correctness property of the instrument, read off the binding the shards were actually
 * stepped under rather than off the constant the module holds. The row carries the same number, so
 * a log written by a build that had this wrong says so in every line of itself.
 */
test("the_probe_binds_the_fit_shards_an_entropy_coefficient_of_exactly_zero", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const row = measureSignal({ pool, ...bound });
    assert.equal(PROBE_ENTROPY, 0);
    assert.equal(pool.bound.params[PARAM.ENTROPY], 0,
      "the shards summed a gradient that had the entropy bonus in it");
    assert.equal(row.entropyPaid, 0, "the row does not testify to what it was measured under");
    // The clip is the caller's and is not zeroed with it: a probe that also turned off the trust
    // region's own bound would be measuring a gradient the fit never sees.
    assert.equal(pool.bound.params[PARAM.CLIP], 0.2);
  } finally {
    await pool.close();
  }
});

/**
 * The entropy bonus drives the cosine toward one, which is the whole reason the probe turns it off.
 *
 * Demonstrated rather than argued, on the rollout whose rewards are noise. With the bonus on, both
 * halves receive a term that is not an expectation over their samples -- exactly `coefficient` on
 * every spread, and a deterministic function of the observation on the three gate logits -- so the
 * two agree almost perfectly however little the data carries. With it off, this fixture reports
 * what it actually has, which is very little.
 *
 * **Measured on this fixture, over the coefficient**, which is worth writing down because it says
 * which of the two reported cosines the bonus ruins and which it merely bends:
 *
 * | coefficient | actor cosine | spread cosine |
 * | ---: | ---: | ---: |
 * | 0 | +0.088 | -0.131 |
 * | 1 | +0.117 | +0.989 |
 * | 4 | +0.309 | +0.999 |
 * | 16 | +0.803 | +1.000 |
 * | 64 | +0.950 | +1.000 |
 * | 256 | +0.962 | +1.000 |
 *
 * The spread is gone at a coefficient of one, because there the bonus *is* a constant and the two
 * halves receive the identical vector. The actor climbs more slowly and saturates around 0.96
 * rather than at 1, which is the gate term being a function of the observation rather than a
 * constant: it agrees across halves far better than an advantage-weighted score function does, and
 * not perfectly. Sixteen is the coefficient asserted below, and the shipped defaults are 0.003 and
 * 0.0003 -- so this is a demonstration of the mechanism at a size that cannot be mistaken for
 * noise rather than a claim about how large the inflation would have been at the league's own
 * setting. The direction is what is being pinned: the bonus can only *raise* a cosine, so every
 * reading it contaminates is an overstatement of the signal.
 */
test("the_entropy_bonus_drives_the_cosine_to_one_which_is_why_the_probe_turns_it_off", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const n = built.rollout.count;
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const off = measureSignal({ pool, ...bound });
    // The contrast arm, by hand through the public pool: the same rollout, the same weights, the
    // same two ranges, and a coefficient the probe itself has no way to be given.
    pool.bind(bound.rollout, bound.scaled, bound.returns, bound.norm, { clip: 0.2, entropy: 16 });
    const halves = halfSplit(n);
    const taken = [];
    for (const half of [halves.first, halves.second]) {
      const sums = pool.step({
        at: half.at, end: half.end, epoch: PROBE_EPOCH, order: bound.order,
        weights: built.weights, valueWeights: built.valueWeights, logSigma: built.logSigma,
      });
      taken.push({ actor: Float64Array.from(sums.grad), spread: Float64Array.from(sums.sigmaGrad) });
    }
    const onSpread = cosineOf(taken[0].spread, taken[1].spread);
    const onActor = cosineOf(taken[0].actor, taken[1].actor);
    assert.ok(onSpread > 0.99, `the bonus left the spread cosine at ${onSpread}`);
    assert.ok(off.spread.cosine < onSpread - 0.5,
      `the probe's spread cosine is ${off.spread.cosine} against the contaminated ${onSpread}`);
    // The actor too, and less bluntly: the bonus reaches the eighty-seven thousand weights of a
    // real run only through the three gate logits, which is a deterministic function of the
    // observation rather than a constant -- so it agrees across halves because there is no reward
    // noise in it, not because it is the same vector twice.
    assert.ok(onActor > 0.7, `the bonus left the actor cosine at ${onActor}`);
    assert.ok(off.cosine < onActor - 0.3,
      `the probe's actor cosine is ${off.cosine} against the contaminated ${onActor}`);
    // And the fixture is what it claims to be: a rollout with no signal in it.
    assert.ok(Math.abs(off.cosine) < 0.5, `the no-signal fixture reports a cosine of ${off.cosine}`);
  } finally {
    await pool.close();
  }
});

/**
 * Every cosine comes with the two norms and the two ask counts that make it readable.
 *
 * A cosine of 0.02 with norms of 1e-3 and a cosine of 0.02 with norms of 1e-9 are two different
 * findings -- a tiny signal against a noisy estimator, and an estimator that is barely asking for
 * anything at all -- and the closing table's question is which of them the learn set was run at.
 * So the row is asserted to carry them, per block, with the counts they are means over.
 */
test("each_half_reports_its_own_ask_count_and_gradient_norm_beside_the_cosine", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const row = measureSignal({ pool, ...bound });
    assert.equal(row.asks, built.rollout.count);
    assert.equal(row.firstAsks + row.secondAsks, row.asks);
    for (const block of [row, row.spread, row.critic]) {
      assert.ok(Number.isFinite(block.cosine) && Math.abs(block.cosine) <= 1);
      assert.ok(block.firstNorm > 0 && block.secondNorm > 0, "a block came back identically zero");
      assert.ok(Number.isFinite(block.dot));
      // The cosine is the dot over the two norms, which is the one relation a reader recomputes.
      assert.ok(Math.abs(block.cosine - block.dot / block.firstNorm / block.secondNorm) < 1e-12);
    }
    assert.ok(row.clipFraction >= 0 && row.clipFraction <= 1);
    // The signal and the noise the norms and the dot are there to separate: for two independent
    // means over m samples, the dot estimates the squared true gradient and the squared norm
    // estimates that plus the per-sample variance over m, so this difference is the draw's share.
    const noise = (row.firstNorm ** 2 + row.secondNorm ** 2) / 2 - row.dot;
    assert.ok(noise > 0, "a no-signal fixture whose halves agree better than chance");
  } finally {
    await pool.close();
  }
});

/**
 * The probe and the fit standardise one iteration's advantages to the same spread.
 *
 * The instrument is only worth anything if the gradient it cuts in half is the gradient the Adam
 * step was taken from, and the standardised advantage's spread is the one quantity both paths
 * compute from the same rollout. They share the function now, so this is exact rather than close;
 * the run itself refuses outright when the two ever part, which is the check this test is the
 * fixture for.
 */
test("the_probe_and_the_fit_standardise_one_iterations_advantages_to_the_same_spread", { timeout: 300_000 }, async () => {
  const built = fixture();
  const seed = (SEED ^ 5 * 31) >>> 0;
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let row;
  let fit;
  try {
    row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed,
      halfLife: 4, lambda: 0.95, clip: 0.2,
    });
    fit = ppoFit(built.rollout, {
      weights: built.weights, logSigma: built.logSigma, valueWeights: built.valueWeights,
      layout: LAYOUT, valueLayout: VALUE, norm: built.norm, seed,
      halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.0003, rate: 1e-4, valueRate: 1e-3,
      sigmaRate: 1e-3, epochs: 1, batch: 128, targetKl: 0.03, sigmaFloor: -3, sigmaRoof: 0.5,
      shards: 2, pool,
    });
  } finally {
    await pool.close();
  }
  assert.equal(row.advantageSd, fit.advantageSd,
    "the probe cut up a different estimator from the one the fit stepped");
  assert.ok(row.advantageSd > 0, "the fixture's advantages have no spread at all");
  assert.ok(fit.updates > 0, "the fit took no step, so there is nothing for the probe to be about");
});

// ---------------------------------------------------------------------------------------
// Holding one policy still, which is the measurement the first grid could not make.
// ---------------------------------------------------------------------------------------

test("holding_a_policy_still_requires_naming_which_policy_is_held", () => {
  // The pairing this refusal exists for. `--hold` is the flag that turns an iteration from a step
  // of a trajectory into one independent collection at a fixed point, and a fixed point that was
  // never loaded is the fresh initialisation -- a mind nobody will ever train, measured for the
  // same hours as a real one, reported in the same shape as a finding.
  for (const from of [null, undefined, ""]) {
    assert.throws(() => checkHeldStart({ from, hold: true }), /wants --from/);
  }
  assert.equal(checkHeldStart({ from: "tournaments/bracket-fencer/pool-30.json", hold: true }), true);
});

test("a_run_that_is_not_holding_never_needs_a_checkpoint_and_says_so_by_returning_false", () => {
  // The other half, and the reason the check returns the flag rather than nothing: the grid
  // already in the record ran with neither flag, so the un-held path has to stay exactly what it
  // was or its eight cells stop being comparable to anything measured after today.
  assert.equal(checkHeldStart({ from: null, hold: false }), false);
  assert.equal(checkHeldStart({ from: undefined, hold: false }), false);
  assert.equal(checkHeldStart({ from: "tournaments/bracket-idle/pool-5.json", hold: false }), false);
});

// ---------------------------------------------------------------------------------------
// Cutting one rollout by the body that fought it, which is the question the grid named as owed.
// ---------------------------------------------------------------------------------------

/**
 * A rollout carrying only what a class split reads: the ask count, the episode count, the `done`
 * flags that close the episodes and the bodies that fought them.
 *
 * Deliberately not a collected rollout. Every other test in this file that wants gradients builds
 * one through the pool, and that is the right shape for a gradient; the trace from an ask to a
 * build is index arithmetic over two arrays and a fixture with hand-written episode lengths is the
 * only kind of fixture where the expected answer is known by reading it.
 */
function rolloutOf(lengths, bodies, episodeBouts) {
  const count = lengths.reduce((a, b) => a + b, 0);
  const done = new Uint8Array(count);
  let at = 0;
  for (const length of lengths) { at += length; done[at - 1] = 1; }
  return { count, episodes: lengths.length, done, bodies, episodeBouts };
}

const BODIES = [
  { build: "mace", terminal: "mace" },
  { build: "draw-2", terminal: "maul" },
  { build: "draw-7", terminal: "mace" },
];

test("an_ask_is_traced_to_its_body_through_the_done_flags_and_not_through_its_position", () => {
  // Episodes of three different lengths, so a trace that assumed equal-length episodes -- the
  // mistake available here, and the one nothing else in the file would catch -- puts the wrong
  // build on most of the asks and is off by a different amount in each class.
  const rollout = rolloutOf([4, 1, 3], BODIES);
  assert.deepEqual(askClasses(rollout, "build"),
    ["mace", "mace", "mace", "mace", "draw-2", "draw-7", "draw-7", "draw-7"]);
  // The coarse cut puts two of the three episodes in one class, which is the arrangement the
  // experiment is actually run at and the one where an off-by-one is hardest to see by eye.
  assert.deepEqual(askClasses(rollout, "terminal"),
    ["mace", "mace", "mace", "mace", "maul", "mace", "mace", "mace"]);
});

test("a_rollout_whose_bodies_do_not_line_up_with_its_episodes_is_refused_rather_than_cut", () => {
  // Each of the three ways the trace can be broken, by name. A split that was silently off by one
  // would read as bodies that disagree, which is exactly the finding the instrument exists to
  // report -- so every step of the trace is a refusal and none of them is an assumption.
  assert.throws(() => askClasses(rolloutOf([4, 1, 3], undefined), "build"), /carries no bodies/);
  assert.throws(() => askClasses(rolloutOf([4, 1, 3], BODIES.slice(0, 2)), "build"), /2 bodies over 3 episodes/);
  const short = rolloutOf([4, 1, 3], BODIES);
  short.done[7] = 0;
  assert.throws(() => askClasses(short, "build"), /done flags close 2 episodes over 3/);
  // And a body with no word on the axis asked for, which is what a pack from an older worker is.
  const blank = rolloutOf([4, 1, 3], [BODIES[0], { build: "draw-2" }, BODIES[2]]);
  assert.throws(() => askClasses(blank, "terminal"), /episode 1 carries no terminal/);
});

test("the_grouping_is_read_by_name_and_none_is_the_absence_of_one_rather_than_a_third_grouping", () => {
  assert.equal(parseClasses(null), "none");
  assert.equal(parseClasses(undefined), "none");
  for (const word of CLASS_AXES) assert.equal(parseClasses(word), word);
  assert.equal(parseClasses(" Terminal "), "terminal");
  assert.throws(() => parseClasses("weapon"), /--classes weapon/);
  // `none` reaches `parseClasses` as a legal word and `askClasses` as a bug: the CLI branches on it
  // before the trace, so a split asked for by a caller that forgot to branch is refused loudly
  // rather than answered with one class holding everything.
  assert.throws(() => askClasses(rolloutOf([2, 2], BODIES.slice(0, 2)), "none"), /wants a grouping/);
});

test("a_class_is_two_halves_of_its_own_asks_and_nothing_else_of_the_rollout_is_in_them", () => {
  const rollout = rolloutOf([1000, 1000, 1000], BODIES);
  const keys = askClasses(rollout, "build");
  const order = epochOrder(rollout.count, SEED);
  const laid = classBlocks(order, keys, { floor: 100 });
  assert.equal(laid.classes, 3);
  assert.equal(laid.blocks.length, 6, "three classes did not come back as three pairs of halves");
  // The re-laid order holds each ask at most once, which is not a tidiness preference: the shared
  // order a `FitPool` binds is allocated at the rollout's own count, and a block past it is
  // summed over indices nothing wrote.
  assert.ok(laid.order.length <= rollout.count, "the re-laid order is longer than the rollout");
  assert.equal(new Set(laid.order).size, laid.order.length);
  for (const key of ["mace", "draw-2", "draw-7"]) {
    const halves = laid.blocks.filter((block) => block.key === key);
    assert.equal(halves.length, 2);
    const taken = halves.flatMap((block) => laid.order.slice(block.at, block.end));
    // Disjoint, complete, and every index really is this class's: the three properties the pooled
    // `halfSplit` gets for free from being two ranges of one array and that this has to be given.
    assert.equal(new Set(taken).size, taken.length, `${key} put an ask in both of its halves`);
    assert.equal(taken.length, 1000, `${key} lost or gained asks in the cut`);
    for (const index of taken) assert.equal(keys[index], key, `${key} took an ask of another class`);
    // And in the fit's own order, which is what makes halving it a random split of the class
    // rather than a split by bout: the class's indices come out in the sequence the epoch walks.
    assert.deepEqual(taken, order.filter((index) => keys[index] === key));
  }
});

test("every_class_gets_a_pooled_control_of_its_own_two_sizes_drawn_without_regard_to_class", () => {
  // Uneven classes on purpose. The control exists because a within-class cosine is taken over a
  // quarter of the rollout where the experiment's own cosine is taken over a half, so the two are
  // not comparable as they stand -- and the direction of that bias is the one that manufactures
  // the finding. A control of the wrong size is therefore worse than none.
  const rollout = rolloutOf([1500, 900, 600], BODIES);
  const keys = askClasses(rollout, "build");
  const order = epochOrder(rollout.count, SEED);
  const laid = classBlocks(order, keys, { floor: 100 });
  for (const key of ["mace", "draw-2", "draw-7"]) {
    const sizes = (rows) => rows.filter((block) => block.key === key).map((block) => block.end - block.at);
    assert.deepEqual(sizes(laid.controls), sizes(laid.blocks), `${key} was controlled at some other size`);
    // The controls are ranges into the caller's order rather than into the re-laid one, because a
    // control is a prefix of the order the caller already holds and copying it would push the
    // re-laid order past the ask count a `FitPool` binds.
    const control = laid.controls.filter((block) => block.key === key);
    const taken = control.flatMap((block) => order.slice(block.at, block.end));
    assert.equal(new Set(taken).size, taken.length, `${key} read one control block twice`);
    // Class ignored: the control is the front of the shuffled order, so for at least one class it
    // holds asks of a class it is not the control of. A control that had been filtered would be a
    // second within-class reading wearing the name of a baseline.
    assert.deepEqual(taken, order.slice(0, taken.length));
  }
});

test("a_class_too_small_to_halve_is_dropped_by_name_rather_than_averaged_in_at_any_variance", () => {
  // One class of 2,000 asks and two of 600, against a floor of 400. **The two small ones are over
  // the floor and their halves are under it**, which is the arrangement that says what the floor
  // is counted in: a class kept on its whole size would enter the mean as a cosine between two
  // three-hundred-ask gradients, and the floor exists because asks are what the estimator averages
  // over. A fixture whose small classes were under the floor whole could not tell the two
  // spellings apart, and the mutation that reads it whole was watched green against exactly that.
  const rollout = rolloutOf([2000, 600, 600], BODIES);
  const keys = askClasses(rollout, "build");
  const order = epochOrder(rollout.count, SEED);
  const laid = classBlocks(order, keys, { floor: 400 });
  assert.equal(laid.classes, 3, "a dropped class is still a class that was there");
  assert.deepEqual(laid.blocks.map((block) => block.key), ["mace", "mace"]);
  assert.deepEqual(laid.dropped.map((row) => row.key).sort(), ["draw-2", "draw-7"]);
  assert.deepEqual(laid.dropped.map((row) => row.asks), [600, 600]);
  // And the floor is a number rather than a rule: the same rollout cut at a floor of three hundred
  // keeps all three, which is what makes the drops in a run's rows readable against the flag that
  // caused them instead of against a constant a reader has to go and find.
  const lower = classBlocks(order, keys, { floor: 300 });
  assert.equal(lower.dropped.length, 0);
  assert.equal(lower.blocks.length, 6);
});

test("the_three_class_cosines_come_out_of_one_binding_of_the_pool_the_fit_sums_through", async () => {
  // The end-to-end property, and the one that cannot be checked by arithmetic on a fixture: the
  // class gradients are the *fit's* gradients, summed by the pool over ranges of a re-laid order,
  // and a class against itself is a cosine in the interval a cosine lives in. Built on a rollout
  // whose two classes are the two halves of the fixture, so both survive any floor worth setting.
  const built = fixture();
  built.rollout.episodes = 8;
  const half = Math.floor(built.rollout.episodes / 2);
  built.rollout.bodies = Array.from({ length: built.rollout.episodes }, (_, e) => (e < half
    ? { build: "mace", terminal: "mace" }
    : { build: "draw-2", terminal: "maul" }));
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let row = null;
  try {
    row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED,
      classes: "terminal", floor: 8,
    });
  } finally {
    await pool.close();
  }
  assert.equal(row.classAxis, "terminal");
  assert.equal(row.classes.kept, 2, "the fixture's two classes did not both survive the floor");
  assert.equal(row.classes.within.length, 2);
  assert.equal(row.classes.pooled.length, 2);
  // Four cross-half cosines for the one pair of classes, which is what makes `between` a mean over
  // draws rather than a single one.
  assert.equal(row.classes.between.length, 4);
  for (const entry of [...row.classes.within, ...row.classes.pooled, ...row.classes.between]) {
    assert.ok(entry.cosine >= -1 && entry.cosine <= 1, `a cosine read ${entry.cosine}`);
  }
  // The pooled cosine of the experiment above is untouched by the split, which is the property
  // that keeps a `--classes` run comparable with every row already in the record: the class
  // measurement rebinds the pool afterwards and reports separately.
  assert.ok(row.cosine >= -1 && row.cosine <= 1);
  assert.ok(row.advantageSd > 0);
  // And a run that asked for no split carries no split, absent rather than null: a row with a
  // `classes` key holding nothing would say a cut was taken and found nothing.
  const poolAgain = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let plain = null;
  try {
    plain = probeRollout({
      pool: poolAgain, rollout: built.rollout, weights: built.weights,
      valueWeights: built.valueWeights, logSigma: built.logSigma, norm: built.norm,
      valueLayout: VALUE, seed: SEED,
    });
  } finally {
    await poolAgain.close();
  }
  assert.ok(!("classes" in plain) && !("classAxis" in plain));
  assert.equal(plain.cosine, row.cosine, "the split moved the number the experiment is about");
});

test("an_ask_is_traced_to_its_bout_through_the_same_done_walk_the_class_split_uses", () => {
  // Five episodes of four different lengths over three bouts, with the two episodes of the
  // mirrored bout **not adjacent** -- because they need not be, and a trace that assumed a bout is
  // a contiguous run of episodes would be right on every fixture where they are.
  const rollout = rolloutOf([3, 2, 1, 2, 4], BODIES.slice(0, 1), [7, 9, 7, 4, 9]);
  rollout.bodies = undefined;
  assert.deepEqual(askBouts(rollout),
    [7, 7, 7, 9, 9, 7, 4, 4, 9, 9, 9, 9]);
});

test("a_rollout_whose_episode_bouts_do_not_line_up_with_its_episodes_is_refused_rather_than_split", () => {
  // The same three refusals `askClasses` makes, because the same identity is being trusted: an
  // array in another file written one entry an episode in the order a third function concatenated
  // its parts. A bout split silently off by one would put asks of two bouts in one half and read
  // as two independent collections that agree, which is the flattering direction.
  assert.throws(() => askBouts(rolloutOf([3, 2, 1], BODIES)), /carries no episodeBouts/);
  assert.throws(() => askBouts(rolloutOf([3, 2, 1], BODIES, [0, 1])), /2 episode bouts over 3 episodes/);
  const short = rolloutOf([3, 2, 1], BODIES, [0, 1, 1]);
  short.done[5] = 0;
  assert.throws(() => askBouts(short, "build"), /done flags close 2 episodes over 3/);
  // And an entry that is not a whole number, which is what a rollout merged by an older worker is.
  assert.throws(() => askBouts(rolloutOf([3, 2, 1], BODIES, [0, undefined, 1])),
    /episode 1 carries no bout/);
});

test("the_two_bout_halves_hold_whole_bouts_permute_the_order_and_balance_the_asks_rather_than_the_bouts", () => {
  // Bouts of wildly unequal length, which is the arrangement the property is about: a partition
  // that alternated bouts would be balanced in bouts and badly unbalanced in what the two halves
  // average over, and the halves are means.
  const rollout = rolloutOf([600, 40, 40, 300, 20], BODIES.slice(0, 1), [1, 2, 3, 4, 5]);
  rollout.bodies = undefined;
  const keys = askBouts(rollout);
  const order = epochOrder(rollout.count, SEED);
  const laid = boutBlocks(order, keys);
  // A permutation of the caller's own order and exactly as long, which is what keeps the shared
  // order `FitPool.bind` allocates the size it was asked for. The class split had to be rewritten
  // around exactly this and the cost of getting it wrong was silent: a step past the buffer reads
  // whatever the last binding left.
  assert.equal(laid.order.length, order.length);
  assert.equal(new Set(laid.order).size, laid.order.length);
  assert.deepEqual([...laid.order].sort((a, b) => a - b), [...order].sort((a, b) => a - b));
  // Whole bouts: no bout has asks in both halves, which is the whole of what a bout split is.
  const half = (range) => new Set(laid.order.slice(range.at, range.end).map((index) => keys[index]));
  const first = half(laid.first);
  const second = half(laid.second);
  for (const bout of first) assert.ok(!second.has(bout), `bout ${bout} landed in both halves`);
  assert.equal(first.size + second.size, 5);
  assert.equal(laid.firstBouts, first.size);
  assert.equal(laid.secondBouts, second.size);
  // Balanced in **asks**, and the exact split is pinned because it is the whole of what greedy
  // buys: four bouts against one, 400 asks against 600, which is the best partition these five
  // bouts have. A rule that alternated bouts instead would be 2/3 in bouts and 640/360 in asks --
  // the same bout counts a reader would call balanced, over halves that are not.
  const firstAsks = laid.first.end - laid.first.at;
  const secondAsks = laid.second.end - laid.second.at;
  assert.equal(firstAsks + secondAsks, rollout.count);
  assert.equal(firstAsks, 400);
  assert.equal(secondAsks, 600);
  assert.equal(laid.firstBouts, 4);
  assert.equal(laid.secondBouts, 1);
});

test("a_rollout_of_one_bout_has_no_two_halves_of_whole_bouts_and_is_refused_by_name", () => {
  // A half read twice has a cosine of exactly one, so the failure this refusal prevents is a
  // published number of perfect agreement from a rollout that contains one draw.
  const rollout = rolloutOf([40, 40], BODIES.slice(0, 1), [3, 3]);
  rollout.bodies = undefined;
  const order = epochOrder(rollout.count, SEED);
  assert.throws(() => boutBlocks(order, askBouts(rollout)), /1 bout\(s\) has no two halves/);
});

test("the_bout_split_is_reported_beside_the_ask_split_and_does_not_move_the_number_it_sits_next_to", async () => {
  // The end-to-end property and the reason the flag exists at all: one rollout cut two ways in one
  // call, so the two cosines are comparable. Two runs would have been two rollouts.
  const built = fixture();
  built.rollout.episodes = 8;
  // Four bouts of two episodes each, which is what a mirrored collection is: both corners of one
  // pairing, whose bar margins are exact negations and which must therefore not be split apart.
  built.rollout.episodeBouts = [0, 0, 1, 1, 2, 2, 3, 3];
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let row = null;
  let plain = null;
  try {
    row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED, boutSplit: true,
    });
    plain = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED,
    });
  } finally {
    await pool.close();
  }
  assert.equal(row.byBout.firstBouts + row.byBout.secondBouts, 4);
  assert.equal(row.byBout.firstAsks + row.byBout.secondAsks, built.rollout.count);
  for (const block of [row.byBout, row.byBout.spread, row.byBout.critic]) {
    assert.ok(block.cosine >= -1 && block.cosine <= 1, `a cosine read ${block.cosine}`);
  }
  // The three blocks are the same shape as the ask split's, so the two are read with one reader.
  assert.deepEqual(Object.keys(row.byBout.critic).sort(), ["cosine", "dot", "firstNorm", "secondNorm"]);
  // Absent rather than null when the flag was not passed, and identical where it was: the bout
  // split consumes no randomness and rebinds the pool afterwards, so a run that asks for it
  // reports exactly the row a run that does not would have, plus one key.
  assert.ok(!("byBout" in plain));
  assert.equal(plain.cosine, row.cosine, "the bout split moved the number the grid was read on");
  assert.equal(plain.critic.cosine, row.critic.cosine);
  assert.equal(plain.advantageSd, row.advantageSd);
});

// ---------------------------------------------------------------------------------------
// The reward axis, which is the one cut that changes a number rather than the way one is taken.
// ---------------------------------------------------------------------------------------

test("an_arm_is_the_shipped_table_with_the_rows_it_names_changed_and_nothing_else", () => {
  const [one] = rewardArms([{ label: "no-idle", idle: 0 }]);
  assert.equal(one.label, "no-idle");
  assert.equal(one.table.idle, 0);
  // Every row the arm did not name is the shipped one, which is what makes an arm readable as a
  // difference from the table the record was written under rather than as eight fresh numbers.
  for (const row of REWARD_KEYS) {
    if (row === "idle") continue;
    assert.equal(one.table[row], GOLEM_REWARD[row], `${row} moved in an arm that did not name it`);
  }
  // Naming every row is also legal, and an arm that names them all to their shipped values is the
  // identity arm the sweep uses to check this whole path against the row it sits in.
  const [same] = rewardArms([{ label: "shipped", ...GOLEM_REWARD }]);
  assert.deepEqual({ ...same.table }, { ...GOLEM_REWARD });
});

test("a_reward_arm_that_names_a_row_this_build_does_not_pay_is_refused_by_the_name_it_used", () => {
  // By name rather than ignored, and it is the refusal that earns this parser. A file that says
  // `idles` instead of `idle` under a silent reader is a sweep that runs its hours, reports a row
  // of arms that are all the shipped table, and looks exactly like a null result.
  assert.throws(() => rewardArms([{ label: "typo", idles: 0 }]), /"idles", which is not a reward row/);
  assert.throws(() => rewardArms([{ label: "typo", idles: 0 }]), /win, clinch, idle, tick/);
  assert.throws(() => rewardArms([{ label: "bad", idle: "0" }]), /sets idle to 0, which is not a coefficient/);
  assert.throws(() => rewardArms([{ label: "bad", idle: NaN }]), /not a coefficient/);
  // An arm is read back by its label, so two arms under one label is a record that cannot be read.
  assert.throws(() => rewardArms([{ label: "a", idle: 0 }, { label: "a", stall: 1 }]), /two arms "a"/);
  assert.throws(() => rewardArms([{ idle: 0 }]), /has no label/);
  assert.throws(() => rewardArms([{ label: "  " }]), /has no label/);
  // And the two shapes of an empty ask, both of which mean somebody meant to sweep something.
  assert.throws(() => rewardArms([]), /no arms in it/);
  assert.throws(() => rewardArms({ label: "a" }), /an array of reward arms, not object/);
  assert.throws(() => rewardArms([["label", "a"]]), /arm 0 is not an object/);
});

test("a_reward_arm_is_measured_on_the_same_asks_as_the_row_it_sits_in_and_does_not_move_it", async () => {
  // The property the whole sweep rests on, and the reason it is worth an instrument rather than a
  // row of runs: a table does not move a held policy, so an arm and the row it sits in are one
  // collection. Pinned as identity where the arms agree and as difference where they do not.
  const built = fixture(256, SEED + 3, { priced: true });
  const arms = rewardArms([
    { label: "shipped", ...GOLEM_REWARD },
    { label: "no-shaping", clinch: 0, idle: 0, tick: 0, closing: 0, stall: 0, outside: 0, swing: 0 },
  ]);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let row = null;
  let plain = null;
  try {
    row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED, rewards: arms,
    });
    plain = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED,
    });
  } finally {
    await pool.close();
  }
  // Absent rather than empty when no arm was named, exactly as the other two splits are.
  assert.ok(!("priced" in plain));
  assert.deepEqual(row.priced.map((arm) => arm.label), ["shipped", "no-shaping"]);
  // The identity arm. The fixture's reward *is* what the shipped table pays its raw columns, so an
  // arm naming those coefficients has to reproduce the row's own cosine to the last digit -- and
  // its advantage spread with it, because a table that reproduced the cosine off a different
  // standardisation would be agreeing by luck.
  const [shipped, bare] = row.priced;
  assert.equal(shipped.cosine, row.cosine, "the identity arm did not reproduce the row it sits in");
  assert.equal(shipped.advantageSd, row.advantageSd);
  assert.equal(shipped.critic.cosine, row.critic.cosine);
  // Every arm reads the same asks in the same two halves, which is the pairing stated as a number
  // rather than as an argument: an arm that differed here would be a different sample and the
  // comparison would carry the per-bout noise the whole design exists to remove.
  for (const arm of row.priced) {
    assert.equal(arm.asks, row.asks);
    assert.equal(arm.firstAsks, row.firstAsks);
    assert.equal(arm.secondAsks, row.secondAsks);
  }
  // And an arm that changes the table changes the answer, or the sweep is measuring nothing.
  assert.notEqual(bare.cosine, row.cosine, "a table with no shaping in it paid what the shipped one did");
  assert.notEqual(bare.advantageSd, row.advantageSd);
  // The arms do not disturb the row they were taken beside, so a run with a dozen of them reports
  // the same baseline a run with none would.
  assert.equal(plain.cosine, row.cosine, "pricing an arm moved the collection it was priced off");
  assert.equal(plain.advantageSd, row.advantageSd);
});

test("an_arms_shaping_share_is_over_what_the_asks_paid_in_total_rather_than_over_what_they_netted", () => {
  // A mirrored collection's rewards very nearly cancel -- both corners are collected, so `dealt`
  // less `taken` telescopes and the win terms sum to zero -- and a share over that denominator
  // swings between plus and minus infinity while nothing is happening. Over the absolute total it
  // is bounded and readable, and an arm that charges nothing reads exactly zero.
  const built = fixture(256, SEED + 3, { priced: true });
  const bare = { ...GOLEM_REWARD, clinch: 0, idle: 0, tick: 0, closing: 0, stall: 0, outside: 0, swing: 0 };
  const nothing = shareOf(priceRollout(built.rollout, bare), built.rollout);
  assert.equal(nothing.penalty, 0, "a table with no shaping rows in it reported a shaping share");
  for (const row of Object.keys(nothing.rows)) assert.equal(nothing.rows[row], 0, row);
  const shipped = shareOf(priceRollout(built.rollout, GOLEM_REWARD), built.rollout);
  // The rows sum to the total, which is what makes a row auditable against the behaviour it was
  // meant to move rather than against a number that happens to sit beside it.
  const summed = Object.values(shipped.rows).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(summed - shipped.penalty) < 1e-12, `${summed} against ${shipped.penalty}`);
  // The shipped table charges for idling and for clinching and for nothing else today, which is
  // the finding the reward sweep was written to act on, asserted here so the fixture cannot drift
  // away from the table the record is about.
  for (const row of ["tick", "closing", "stall", "outside", "swing"]) {
    assert.equal(shipped.rows[row], 0, `${row} is charged by the shipped table after all`);
  }
  assert.ok(shipped.rows.idle > 0, `idling was not charged: ${shipped.rows.idle}`);
  // A denominator that cannot be zero for a rollout that paid anything, and zero when it did not.
  const empty = { count: 4, reward: new Float64Array(4), done: new Uint8Array(4), seconds: new Float64Array(4) };
  empty.raw = Object.fromEntries([
    ...PRICED_COLUMNS.map((row) => [row, new Float64Array(4)]), ["outcome", new Int8Array(4)],
  ]);
  const none = shareOf(priceRollout(empty, GOLEM_REWARD), empty);
  assert.equal(none.paid, 0);
  assert.equal(none.penalty, 0, "a share was taken over a denominator of zero");
});

test("an_arm_may_name_a_credit_horizon_instead_of_a_coefficient_and_is_refused_at_its_edges", () => {
  const [one] = rewardArms([{ label: "short", halfLife: 0.5 }]);
  assert.equal(one.halfLife, 0.5);
  // A horizon is not a coefficient, so it does not land in the table; the table is the shipped one.
  assert.deepEqual({ ...one.table }, { ...GOLEM_REWARD });
  const [both] = rewardArms([{ label: "mix", halfLife: 1, lambda: 0.5, idle: 0 }]);
  assert.equal(both.halfLife, 1);
  assert.equal(both.lambda, 0.5);
  assert.equal(both.table.idle, 0, "an arm that names a horizon stopped reading its coefficients");
  // Absent rather than defaulted when unnamed, which is what lets a grid of tables alone write the
  // row it wrote before this axis existed.
  const [plain] = rewardArms([{ label: "plain", idle: 0 }]);
  assert.ok(!("halfLife" in plain), "an arm that named no horizon carries one");
  assert.ok(!("lambda" in plain));
  // Both edges, and they are the edges the arithmetic actually breaks at rather than tidy ones. A
  // half-life of zero discounts the next window to nothing and divides by it; a lambda outside the
  // unit interval makes the recursion in `advantages` diverge rather than fail, which is worse.
  assert.throws(() => rewardArms([{ label: "x", halfLife: 0 }]), /a half-life is seconds/);
  assert.throws(() => rewardArms([{ label: "x", halfLife: -1 }]), /a half-life is seconds/);
  assert.throws(() => rewardArms([{ label: "x", lambda: -0.1 }]), /runs from 0 to 1/);
  assert.throws(() => rewardArms([{ label: "x", lambda: 1.1 }]), /runs from 0 to 1/);
  // The edges themselves are legal: lambda 0 is the one-step return and lambda 1 the whole episode.
  assert.equal(rewardArms([{ label: "x", lambda: 0 }])[0].lambda, 0);
  assert.equal(rewardArms([{ label: "x", lambda: 1 }])[0].lambda, 1);
  // And the refusal by name now names both vocabularies, so a typo says which one it missed.
  assert.throws(() => rewardArms([{ label: "x", halflife: 1 }]), /and estimates over halfLife, lambda/);
});

test("an_arm_that_names_a_horizon_is_measured_under_it_and_the_arms_beside_it_are_not", async () => {
  // The combination is the point: a table and a horizon in one arm rather than in two grids. This
  // pins that an arm's horizon reaches `advantages` and reaches nothing else -- the run's own
  // number still governs the row, and an arm that named none still reads the row's.
  const built = fixture(256, SEED + 3, { priced: true });
  const arms = rewardArms([
    { label: "as-run", ...GOLEM_REWARD },
    { label: "short", halfLife: 0.25 },
    { label: "one-step", lambda: 0 },
  ]);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  let row = null;
  try {
    row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED, rewards: arms,
      halfLife: 4, lambda: 0.95,
    });
  } finally {
    await pool.close();
  }
  const [asRun, short, oneStep] = row.priced;
  // The arm that changes neither is still the identity arm, which is what makes the other two
  // readable as the horizon and not as the instrument.
  assert.equal(asRun.cosine, row.cosine);
  assert.ok(!("halfLife" in asRun), "an arm that named no horizon reported one");
  // A quarter-second half-life against the fixture's twelfth-of-a-second windows discounts the next
  // ask to about three quarters, so the advantages are nothing like the run's and neither is the
  // spread they are standardised by.
  assert.equal(short.halfLife, 0.25);
  assert.notEqual(short.advantageSd, row.advantageSd, "a horizon of a quarter second read as four");
  assert.equal(oneStep.lambda, 0);
  assert.notEqual(oneStep.advantageSd, row.advantageSd);
  // And the row itself is untouched by either, so the arms are read against a baseline that is the
  // run's own and not the last arm's.
  assert.equal(row.advantageSd, standardisedAdvantages(
    advantages(built.rollout, valuesOf(built.rollout, built.valueWeights, built.norm, VALUE),
      { halfLife: 4, lambda: 0.95 }).advantage, built.rollout.count,
  ).sd);
});

test("a_bout_half_is_summed_over_its_own_bouts_asks_and_not_over_the_front_of_the_shuffled_order", async () => {
  // The one property of `boutGradients` that the end-to-end row cannot show. Its two ranges are
  // bout-aligned whichever order is walked, so a step that walked the *caller's* order would
  // report the right ask counts over the wrong asks -- an ask split wearing the bout split's name,
  // and the flattering direction again. Three bouts of 96, 64 and 96 asks, whose subset sums never
  // reach 128, so the halves cannot coincide with the ask split's either.
  const built = fixture();
  built.rollout.episodes = 8;
  built.rollout.episodeBouts = [0, 0, 0, 1, 1, 2, 2, 2];
  const bound = bindings(built, SEED);
  const keys = askBouts(built.rollout);
  const laid = boutBlocks(bound.order, keys);
  const firstAsks = laid.first.end - laid.first.at;
  assert.ok([64, 96, 160, 192].includes(firstAsks), `a half of ${firstAsks} asks is no set of whole bouts`);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const { taken } = boutGradients({ pool, ...bound, keys });
    pool.bind(built.rollout, bound.scaled, bound.returns, bound.norm,
      { clip: bound.clip, entropy: PROBE_ENTROPY });
    const front = pool.step({
      at: laid.first.at, end: laid.first.end, epoch: PROBE_EPOCH, order: bound.order,
      weights: bound.weights, valueWeights: bound.valueWeights, logSigma: bound.logSigma,
    });
    assert.notEqual(normOf(Float64Array.from(front.grad)), normOf(taken[0].actor),
      "the bout half summed the same asks the shuffled order's front holds");
  } finally {
    await pool.close();
  }
});

/**
 * The bonus the probe turns off, measured rather than argued about.
 *
 * `measureBonus` differences one whole-order step at `PROBE_ENTROPY` against one at a production
 * coefficient, so what it returns is the entropy term exactly. The **spread** half of it is the
 * case that can be written down before the call: for a constant spread `entropyGrad` adds exactly
 * `coefficient` to each of the nine axes at every sample, so a mean over the order is exactly the
 * coefficient on each axis and its norm is exactly three times it. That number is asserted rather
 * than a range, because a range here would pass for a bonus that had been halved, doubled, or
 * summed instead of averaged.
 */
test("the_spreads_half_of_the_bonus_is_exactly_three_times_the_coefficient", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    for (const coefficient of [0.0003, 0.003, 1]) {
      const bonus = measureBonus({ pool, ...bound, entropy: coefficient });
      assert.equal(bonus.coefficient, coefficient);
      const want = Math.sqrt(ACTION_AXES) * coefficient;
      assert.ok(Math.abs(bonus.spread.norm - want) <= 1e-12 * want,
        `nine axes at ${coefficient} came back as a norm of ${bonus.spread.norm}, not ${want}`);
      // And the share is against the *data's* norm, which is the reading the row is for.
      assert.ok(Math.abs(bonus.spread.share - bonus.spread.norm / bonus.spread.dataNorm) < 1e-15);
    }
  } finally {
    await pool.close();
  }
});

/**
 * The bonus is linear in the coefficient and its direction does not depend on it.
 *
 * Which is the property that makes one row readable at a coefficient a run did not use: a fit at
 * 3e-4 and a fit at 3e-3 take the same bonus direction and differ by a factor of ten in how far
 * they go along it. Asserted across three coefficients spanning four orders of magnitude, on the
 * actor block, where the term is the three Bernoulli gates' and is not a constant.
 *
 * **On this fixture**, the actor's bonus is 0.1757 of the coefficient in norm and stands at +0.092
 * to the data's gradient -- so at the shipped 3e-4 it is a twenty-thousandth of the data's length.
 * That is this fixture's number and not a finding about the arena; the fixture's rewards are noise
 * and its weights are a fresh initialisation. What the test pins is the linearity and the fixed
 * direction, which are properties of the arithmetic.
 */
test("the_bonus_is_linear_in_the_coefficient_and_its_direction_does_not_move", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const taken = [0.0003, 0.003, 1].map((c) => measureBonus({ pool, ...bound, entropy: c }));
    const slope = taken[0].actor.norm / taken[0].coefficient;
    for (const bonus of taken) {
      assert.ok(Math.abs(bonus.actor.norm / bonus.coefficient - slope) <= 1e-10 * slope,
        `the actor bonus is not linear in the coefficient at ${bonus.coefficient}`);
      assert.ok(Math.abs(bonus.actor.cosine - taken[0].actor.cosine) < 1e-9,
        `the actor bonus points somewhere else at ${bonus.coefficient}`);
      assert.ok(Math.abs(bonus.spread.cosine - taken[0].spread.cosine) < 1e-9,
        `the spread bonus points somewhere else at ${bonus.coefficient}`);
      // The data's own gradient is the same vector in all three, because the first of the two
      // steps is taken at `PROBE_ENTROPY` whatever the second one is asked for.
      assert.equal(bonus.actor.dataNorm, taken[0].actor.dataNorm);
    }
  } finally {
    await pool.close();
  }
});

/**
 * A coefficient of zero writes no block, and a non-zero one leaves the pool where it found it.
 *
 * Two properties and one test, because they are the two ways this measurement could damage
 * something that is not it. A row that carried a block of zeros would not be comparable field for
 * field with the rows every grid in the record so far was written into. And a pool left bound at a
 * production coefficient is a trap for the next cosine somebody takes -- the module's one
 * correctness property is that no cosine is taken under one, and `entropyPaid` on the row is how a
 * log testifies to it.
 */
test("a_bonus_of_zero_writes_no_block_and_a_bonus_leaves_the_pool_at_probe_entropy", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    assert.equal(measureBonus({ pool, ...bound, entropy: 0 }), null);
    assert.equal(measureBonus({ pool, ...bound }), null, "a caller that named no coefficient got one");
    const bonus = measureBonus({ pool, ...bound, entropy: 0.0003 });
    assert.ok(bonus.actor.norm > 0);
    assert.equal(pool.bound.params[PARAM.ENTROPY], PROBE_ENTROPY,
      "the pool was left bound at a production coefficient");
    // And the row after it still testifies to zero, which is the thing a reader checks.
    assert.equal(measureSignal({ pool, ...bound }).entropyPaid, 0);
  } finally {
    await pool.close();
  }
});

/**
 * The bonus is the difference between a production step and the probe's, taken by hand.
 *
 * The arithmetic asserted against the pool directly rather than against `measureBonus`'s own two
 * calls, so a mutation that differenced the wrong pair, or the same pair twice, or subtracted in
 * the wrong order has something outside itself to disagree with. The order matters for the cosine
 * and not for the norm, which is exactly why the cosine is asserted here too.
 */
test("the_bonus_is_a_production_step_less_the_probes_over_the_same_order", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const n = built.rollout.count;
  const coefficient = 0.003;
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const bonus = measureBonus({ pool, ...bound, entropy: coefficient });
    const step = (entropy) => {
      pool.bind(bound.rollout, bound.scaled, bound.returns, bound.norm, { clip: 0.2, entropy });
      const sums = pool.step({
        at: 0, end: n, epoch: PROBE_EPOCH, order: bound.order,
        weights: built.weights, valueWeights: built.valueWeights, logSigma: built.logSigma,
      });
      return Float64Array.from(sums.grad);
    };
    const plain = step(PROBE_ENTROPY);
    const paid = step(coefficient);
    const want = Float64Array.from(plain, (x, k) => paid[k] - x);
    assert.ok(Math.abs(bonus.actor.norm - normOf(want)) <= 1e-12 * normOf(want),
      `the bonus norm is ${bonus.actor.norm} against ${normOf(want)} taken by hand`);
    assert.ok(Math.abs(bonus.actor.cosine - cosineOf(want, plain)) < 1e-12,
      `the bonus points at ${bonus.actor.cosine} against ${cosineOf(want, plain)} taken by hand`);
    assert.ok(Math.abs(bonus.actor.dataNorm - normOf(plain)) <= 1e-12 * normOf(plain));
    // Not the other order, which has the same norm and the opposite angle.
    assert.ok(Math.abs(bonus.actor.cosine + cosineOf(want, plain)) > 1e-6,
      "the fixture's bonus is orthogonal to its data, so this test cannot see a sign flip");
  } finally {
    await pool.close();
  }
});

/**
 * A run that names a coefficient gets the block in its row, and one that does not gets no key.
 *
 * The end of the wire, through `probeRollout`, because the CLI hands it the coefficient the fit
 * below would have paid -- whether or not there is a fit below, which is the point of measuring it
 * at a held policy at all.
 */
test("a_probe_row_carries_the_bonus_only_when_a_coefficient_was_named", { timeout: 300_000 }, async () => {
  const built = fixture();
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const common = {
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED + 9,
    };
    const bare = probeRollout(common);
    assert.equal(bare.bonus, undefined, "a run that asked for no bonus got one anyway");
    const paid = probeRollout({ ...common, entropy: 0.0003 });
    assert.equal(paid.bonus.coefficient, 0.0003);
    assert.ok(paid.bonus.actor.norm > 0 && paid.bonus.spread.norm > 0);
    // The bonus is measured beside the cosine and never inside it: the two rows agree on every
    // number the halves produced.
    assert.equal(paid.cosine, bare.cosine);
    assert.equal(paid.dot, bare.dot);
    assert.equal(paid.spread.cosine, bare.spread.cosine);
    assert.equal(paid.entropyPaid, 0);
  } finally {
    await pool.close();
  }
});

// ---------------------------------------------------------------------------------------
// The head cut: which of the twelve outputs a number is about.
// ---------------------------------------------------------------------------------------

/**
 * The last layer's weights and biases, located by arithmetic and checked against the total.
 *
 * `headRows` is index arithmetic over a layout and nothing else, so the only thing that can be
 * wrong with it is the arithmetic -- and an off-by-one here would report a finding about the wrong
 * axis while every norm it printed stayed a plausible size. So the offsets are recomputed here
 * from the layer widths, in a shape deliberately unlike the accumulating loop the module uses, and
 * the layouts include a one-hidden-layer net and a net whose head is wider than its fan-in.
 */
test("the_head_rows_are_the_last_layers_own_weights_and_the_biases_beside_them", () => {
  for (const layout of [
    LAYOUT, VALUE, { inputs: 3, hidden: [5], outputs: 4 }, { inputs: 71, hidden: [256, 256], outputs: 12 },
    { inputs: 6, hidden: [2], outputs: 9 },
  ]) {
    const widths = [layout.inputs, ...layout.hidden, layout.outputs];
    // Everything before the last layer, spelled as a sum over the layers rather than as a running
    // total: layer `l` is `widths[l + 1]` rows of `widths[l]` plus one bias apiece.
    const earlier = widths.slice(0, -2)
      .map((from, l) => widths[l + 1] * (from + 1)).reduce((a, b) => a + b, 0);
    const rows = headRows(layout);
    assert.equal(rows.base, earlier, `a ${widths.join("-")} net puts its head at ${rows.base}`);
    assert.equal(rows.fanIn, widths[widths.length - 2]);
    assert.equal(rows.outputs, layout.outputs);
    assert.equal(rows.biasAt, earlier + layout.outputs * widths[widths.length - 2]);
    // The assertion the module makes about itself, made again from outside it: the last bias is
    // the last number in the vector, so nothing is left over and nothing is claimed twice.
    assert.equal(rows.biasAt + layout.outputs, netSize(layout));
  }
});

/**
 * Every head output belongs to exactly one named group, and the names are the ones a sentence uses.
 *
 * Coverage and disjointness are the property -- a group that quietly overlapped its neighbour would
 * report the neighbour's gradient as its own -- and they are asserted over the *flat indices*, not
 * over the outputs, because that is the level the readers work at. Both heads are cut: the shipped
 * one, twelve outputs of one number each, and `mixed`/`state`, where three axes own nine outputs
 * apiece and nine more spreads sit past the gates. The second is the reason `headGroups` reads
 * `spec.at` and `spec.span` rather than counting.
 */
test("every_head_output_belongs_to_exactly_one_named_group_and_the_groups_cover_the_head", () => {
  for (const spec of [GAUSSIAN_HEAD, headSpecOf("mixed", "state")]) {
    const layout = { inputs: 6, hidden: [14, 10], outputs: spec.width };
    const { rows, groups } = headGroups(layout, spec);
    assert.equal(groups.length, ACTION_AXES + ACTION_GATES + (spec.sigmaAt < 0 ? 0 : ACTION_AXES));
    assert.deepEqual(groups.slice(0, ACTION_AXES).map((g) => g.name), [...COMMAND_AXES]);
    assert.deepEqual(groups.slice(ACTION_AXES, ACTION_WIDTH).map((g) => g.name), [...COMMAND_GATES]);
    // An axis owns exactly the outputs its span claims, which is one under a Gaussian and nine
    // under a categorical -- the number `headGroups` would get wrong by assuming.
    for (const [j, group] of groups.slice(0, ACTION_AXES).entries()) {
      assert.equal(group.outputs.length, spec.span[j], `${group.name} owns ${group.outputs.length} outputs`);
      assert.equal(group.outputs[0], spec.at[j]);
    }
    const seen = new Set();
    let counted = 0;
    for (const group of groups) {
      for (const j of group.outputs) {
        for (let k = rows.base + j * rows.fanIn; k < rows.base + (j + 1) * rows.fanIn; k += 1) {
          assert.ok(!seen.has(k), `${group.name} claims weight ${k}, which another group already has`);
          seen.add(k);
          counted += 1;
        }
        assert.ok(!seen.has(rows.biasAt + j), `${group.name} claims a bias another group already has`);
        seen.add(rows.biasAt + j);
        counted += 1;
      }
    }
    assert.equal(counted, seen.size, "a flat index was counted twice");
    assert.equal(seen.size, spec.width * (rows.fanIn + 1), "the groups do not cover the whole head");
    // And every index is inside the last layer, which is the claim the file's doc comment makes.
    for (const k of seen) assert.ok(k >= rows.base && k < netSize(layout));
  }
});

test("a_head_group_that_wants_an_output_the_layout_does_not_have_is_refused", () => {
  // A spec and a layout that disagree is the mistake this is here for: a `--head mixed` table read
  // against a twelve-wide net would slice the head at indices past its end and report norms taken
  // out of a neighbouring layer, which is a number and not an error.
  assert.throws(() => headGroups(LAYOUT, headSpecOf("mixed", "state")), /of a head 12 wide/);
  // `headRows`'s own refusal has no layout that reaches it, and saying so is worth more than a
  // test that pretends otherwise: every offset it computes comes out of the same widths `netSize`
  // sums, so the two agree for any layout, including a net with no hidden layer at all -- where
  // the head is the whole network and `base` is 0. It is a guard against a rewrite of the
  // arithmetic, watched red by mutation and not by a fixture.
  assert.deepEqual(headRows({ inputs: 4, hidden: [], outputs: 3 }),
    { base: 0, fanIn: 4, outputs: 3, biasAt: 12 });
});

/**
 * A group's numbers are the slice it names, taken by hand out of the same two vectors.
 *
 * The cut is asserted against `dotOf` and `cosineOf` over an explicitly gathered slice, so a reader
 * that walked the right count of numbers from the wrong offset -- the mutation that survives every
 * coverage assertion above -- has something outside itself to disagree with. And the twelve groups'
 * squared norms sum to the whole *head's* squared norm and not the whole vector's, which is the
 * file's stated limitation asserted rather than narrated: two thirds of this fixture's gradient is
 * in the hidden layers and no group claims any of it.
 */
test("a_head_group_reads_the_slice_it_names_and_the_groups_sum_to_the_head_and_not_the_net", () => {
  const random = mulberry32(SEED + 41);
  const first = Float64Array.from({ length: netSize(LAYOUT) }, () => random() * 2 - 1);
  const second = Float64Array.from({ length: netSize(LAYOUT) }, () => random() * 2 - 1);
  const { rows, groups } = headGroups(LAYOUT, GAUSSIAN_HEAD);
  const cut = headSignal({ first, second, layout: LAYOUT, spec: GAUSSIAN_HEAD });
  const norms = headNorms({ vector: first, layout: LAYOUT, spec: GAUSSIAN_HEAD });
  assert.equal(cut.length, groups.length);
  let squared = 0;
  for (const [g, group] of groups.entries()) {
    const at = [];
    for (const j of group.outputs) {
      for (let k = 0; k < rows.fanIn; k += 1) at.push(rows.base + j * rows.fanIn + k);
      at.push(rows.biasAt + j);
    }
    const left = Float64Array.from(at, (k) => first[k]);
    const right = Float64Array.from(at, (k) => second[k]);
    assert.equal(cut[g].name, group.name);
    assert.ok(Math.abs(cut[g].dot - dotOf(left, right)) <= 1e-12 * Math.abs(dotOf(left, right)));
    assert.ok(Math.abs(cut[g].firstNorm - normOf(left)) <= 1e-12 * normOf(left));
    assert.ok(Math.abs(cut[g].secondNorm - normOf(right)) <= 1e-12 * normOf(right));
    assert.ok(Math.abs(cut[g].cosine - cosineOf(left, right)) < 1e-12);
    assert.ok(Math.abs(norms[g].norm - normOf(left)) <= 1e-12 * normOf(left));
    squared += norms[g].norm ** 2;
  }
  const head = normOf(first.subarray(rows.base));
  assert.ok(Math.abs(Math.sqrt(squared) - head) <= 1e-9 * head,
    `the groups sum to ${Math.sqrt(squared)} against the head's own ${head}`);
  // The limitation, pinned: the head is a minority of the vector, so a group's norm is not a share
  // of the step and nothing downstream may read it as one.
  assert.ok(head < 0.8 * normOf(first), "the fixture's head is most of its net, so this asserts nothing");
});

/**
 * The entropy bonus reaches the three gates and touches no axis at all under a constant spread.
 *
 * This is the head cut's reason for existing, stated as an invariant rather than as a measurement.
 * A Gaussian's entropy depends on its spread and not on its mean, so `entropyGrad`'s only terms are
 * `-logit * p * (1 - p)` on each gate and a term on `logSigma`, which is not a head output at all.
 * The nine axis rows of the last layer are therefore *exactly* zero in the bonus -- not small, zero
 * -- and the whole of the bonus that lands on the network is on 3 outputs of 12.
 *
 * Which is the fact the whole-actor norm could not say. On this fixture the bonus is a thousandth
 * of the step's length, and reading that as "the entropy term is negligible" is the error: it is a
 * thousandth of the step because it is concentrated on a quarter of one layer, and on the gate rows
 * themselves it is a fraction of the same order as the data's own gradient there.
 */
test("the_entropy_bonus_lands_on_the_three_gates_and_on_no_axis_under_a_constant_spread", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const heads = { layout: LAYOUT, spec: GAUSSIAN_HEAD };
    const bonus = measureBonus({ pool, ...bound, entropy: 0.003, heads });
    assert.equal(bonus.actor.heads.length, ACTION_WIDTH);
    for (const group of bonus.actor.heads.slice(0, ACTION_AXES)) {
      assert.equal(group.norm, 0, `the bonus moved ${group.name}, which has no entropy of its own`);
    }
    for (const group of bonus.actor.heads.slice(ACTION_AXES)) {
      assert.ok(group.norm > 0, `the bonus left the ${group.name} gate alone`);
    }
    // And the gates are where all of it is: the head cut's squared norms sum to the bonus's own.
    const squared = bonus.actor.heads.reduce((a, g) => a + g.norm ** 2, 0);
    const rows = headRows(LAYOUT);
    assert.ok(Math.sqrt(squared) <= bonus.actor.norm + 1e-12);
    assert.ok(Math.sqrt(squared) > 0.2 * bonus.actor.norm,
      "the head carries almost none of the bonus, which would make the cut pointless");
    // The spread block has no head groups, because `logSigma` is nine parameters and not nine
    // outputs -- so a reader that put them there would be slicing the wrong vector.
    assert.equal(bonus.spread.heads, undefined);
    assert.ok(rows.base > 0);
  } finally {
    await pool.close();
  }
});

/**
 * A row carries the head cut and its priced arms do not, and half a request is refused.
 *
 * The arms differ from the row by a reward table and not by a head, so seventeen copies of the same
 * twelve groups an iteration would be seventeen times the bytes for one answer. The refusal beside
 * it is the mistake that would otherwise be silent: a caller who named a layout and forgot the spec
 * would get a row with no `heads` key and no complaint, and would read its absence as an answer.
 */
test("a_probe_row_carries_the_head_cut_and_its_arms_do_not", { timeout: 300_000 }, async () => {
  const built = fixture(256, SEED + 3, { priced: true });
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const common = {
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED + 9,
      rewards: rewardArms([{ label: "shipped" }, { label: "quiet", outside: 0 }]),
    };
    const bare = probeRollout(common);
    assert.equal(bare.heads, undefined, "a run that named no layout got a head cut anyway");
    const cut = probeRollout({ ...common, layout: LAYOUT, spec: GAUSSIAN_HEAD, entropy: 0.0003 });
    assert.equal(cut.heads.length, ACTION_WIDTH);
    assert.equal(cut.heads[ACTION_AXES + 1].name, "abort");
    assert.equal(cut.bonus.actor.heads.length, ACTION_WIDTH);
    for (const arm of cut.priced) assert.equal(arm.heads, undefined, `${arm.label} carried a head cut`);
    // Passive, the way every reading this file adds is: the row it sits in does not move.
    assert.equal(cut.cosine, bare.cosine);
    assert.equal(cut.dot, bare.dot);
    assert.equal(cut.firstNorm, bare.firstNorm);
    assert.deepEqual(cut.priced.map((a) => a.cosine), bare.priced.map((a) => a.cosine));
    assert.throws(() => probeRollout({ ...common, layout: LAYOUT }), /both a layout and a head spec/);
    assert.throws(() => probeRollout({ ...common, spec: GAUSSIAN_HEAD }), /both a layout and a head spec/);
  } finally {
    await pool.close();
  }
});

// ---------------------------------------------------------------------------------------
// The baseline an advantage is taken against, which is the third thing a held collection is free
// to be re-priced under and the first one whose value is a word rather than a number.
// ---------------------------------------------------------------------------------------

/**
 * A rollout carrying only what a return and a baseline read: rewards, window lengths and `done`.
 *
 * The rewards are a fixed little sequence rather than a draw, because every assertion below is a
 * sum whose answer is worth being able to work out by reading the fixture.
 */
function returning(lengths, rewards, seconds = 0.5) {
  const count = lengths.reduce((a, b) => a + b, 0);
  assert.equal(rewards.length, count, "the fixture pays a reward an ask");
  const done = new Uint8Array(count);
  let at = 0;
  for (const length of lengths) { at += length; done[at - 1] = 1; }
  return {
    count, episodes: lengths.length, done,
    reward: Float64Array.from(rewards),
    seconds: new Float64Array(count).fill(seconds),
  };
}

/**
 * The Monte-Carlo return is the discounted sum of what an episode paid from that ask onwards.
 *
 * Taken against a hand-written double loop rather than against another recursion, and with a
 * half-life that makes the discount a number a reader can carry: a window of 0.5 s under a
 * half-life of 0.5 s is a gamma of exactly one half.
 */
test("the_monte_carlo_return_is_the_discounted_sum_of_an_episodes_own_rewards", () => {
  const rollout = returning([3, 2], [1, 2, 4, -1, 8]);
  const got = mcReturns(rollout, 0.5);
  // gamma is 2^(-0.5/0.5) = 0.5, and the sum stops at the end of the episode and not of the array.
  const want = [1 + 2 / 2 + 4 / 4, 2 + 4 / 2, 4, -1 + 8 / 2, 8];
  for (let i = 0; i < want.length; i += 1) {
    assert.ok(Math.abs(got[i] - want[i]) < 1e-12, `ask ${i} returned ${got[i]} against ${want[i]}`);
  }
  // The property the arithmetic above is one instance of, and the reason `mcReturns` exists: a
  // baseline of zeros at lambda 1 leaves the advantage equal to the return, so any later spelling
  // of the discount that disagrees with `advantages` disagrees with the fit as well.
  const zero = baselineOf({ kind: "zero", rollout, returns: got, critic: null, norm: null });
  const arm = advantages(rollout, zero, { halfLife: 0.5, lambda: 1 });
  assert.deepEqual(Array.from(arm.advantage), Array.from(got));
});

/**
 * Every episode's asks run from 0 at its first to 1 at its last, and the count restarts at a `done`.
 *
 * Three episodes of different lengths, because a fixture of equal ones cannot see a walk that
 * carries its start across a boundary and a fixture of one cannot see the restart at all.
 */
test("an_episodes_asks_run_from_zero_to_one_and_the_position_restarts_at_every_done", () => {
  const rollout = returning([3, 1, 4], [0, 0, 0, 0, 0, 0, 0, 0]);
  const got = Array.from(askPositions(rollout));
  assert.deepEqual(got, [0, 0.5, 1, 0, 0, 1 / 3, 2 / 3, 1]);
  // An episode of one ask is at position zero and not at a division by zero, which is the edge the
  // arena actually produces: a bout decided on its first window.
  assert.equal(got[3], 0);
});

/** A rollout whose flags leave asks in no closed episode is refused rather than half-walked. */
test("a_rollout_whose_done_flags_leave_asks_open_is_refused_by_name", () => {
  const rollout = returning([3, 2], [0, 0, 0, 0, 0]);
  rollout.done[4] = 0;
  assert.throws(() => askPositions(rollout), /asks in no closed episode/);
});

/** A grouped mean writes its group's mean, and writes it to every ask of that group. */
test("a_grouped_mean_writes_its_groups_mean_to_every_ask_of_that_group", () => {
  const got = groupedMeans(["a", "b", "a", "a"], Float64Array.from([1, 7, 2, 3]), 4);
  assert.deepEqual(Array.from(got), [2, 7, 2, 2]);
});

/** The Cholesky solve answers the vector the matrix was applied to, to the last few bits. */
test("a_cholesky_solve_answers_the_vector_the_matrix_was_applied_to", () => {
  const p = 5;
  const random = mulberry32(SEED + 41);
  const m = Float64Array.from({ length: p * p }, () => random() * 2 - 1);
  // `m' m` is symmetric positive semi-definite whatever `m` is, and the identity on the diagonal
  // makes it definite; only the upper triangle is read, so only it is filled.
  const a = new Float64Array(p * p);
  for (let r = 0; r < p; r += 1) {
    for (let c = r; c < p; c += 1) {
      let sum = r === c ? 1 : 0;
      for (let k = 0; k < p; k += 1) sum += m[k * p + r] * m[k * p + c];
      a[r * p + c] = sum;
    }
  }
  const want = Float64Array.from({ length: p }, () => random() * 2 - 1);
  const b = new Float64Array(p);
  for (let r = 0; r < p; r += 1) {
    for (let c = 0; c < p; c += 1) b[r] += a[Math.min(r, c) * p + Math.max(r, c)] * want[c];
  }
  const got = solveCholesky(a, b, p);
  for (let r = 0; r < p; r += 1) {
    assert.ok(Math.abs(got[r] - want[r]) < 1e-9, `row ${r} solved ${got[r]} against ${want[r]}`);
  }
});

/** A matrix with nothing on a pivot is refused by name rather than square-rooted into a NaN. */
test("a_singular_column_is_refused_by_name_rather_than_carried_into_a_nan", () => {
  const a = Float64Array.from([1, 0, 0, 0]);
  assert.throws(() => solveCholesky(a, Float64Array.from([1, 1]), 2), /singular at column 1/);
});

/**
 * The linear baseline reproduces a return that is a linear function of the columns it reads.
 *
 * The strongest statement available about a least-squares fit is that it is exact where an exact
 * answer exists, so the fixture's return *is* a plane through the normalised observation and the
 * baseline has to land on it. A fixture of noise would only assert that the solve returned numbers.
 */
test("the_linear_baseline_reproduces_a_return_that_is_a_plane_through_the_columns", () => {
  const built = fixture(192, SEED + 42);
  const { rollout, norm } = built;
  const width = rollout.width;
  const random = mulberry32(SEED + 43);
  const beta = Float64Array.from({ length: width }, () => random() * 2 - 1);
  const intercept = 0.37;
  const raw = new Float64Array(width);
  const z = new Float64Array(width);
  const returns = new Float64Array(rollout.count);
  for (let i = 0; i < rollout.count; i += 1) {
    for (let k = 0; k < width; k += 1) raw[k] = rollout.x[i * width + k];
    normalise(raw, norm, z);
    let sum = intercept;
    for (let k = 0; k < width; k += 1) sum += beta[k] * z[k];
    returns[i] = sum;
  }
  const got = linearBaseline({ rollout, returns, norm });
  for (let i = 0; i < rollout.count; i += 1) {
    assert.ok(Math.abs(got[i] - returns[i]) < 1e-6,
      `ask ${i} was fitted at ${got[i]} against the plane's ${returns[i]}`);
  }
});

/**
 * A column `normalise` zeroed takes the ridge alone and moves no coefficient.
 *
 * The dead columns of the shipped table are the reason `LINEAR_RIDGE` exists, and the assertion is
 * the one that matters rather than the one that is easy: the fit does not merely survive a dead
 * column, it does not *read* it, so writing anything at all into that column of the rollout leaves
 * the baseline where it was.
 */
test("a_dead_column_takes_the_ridge_alone_and_the_baseline_does_not_read_it", () => {
  const built = fixture(160, SEED + 44);
  const { rollout } = built;
  const norm = { count: built.norm.count, mean: [...built.norm.mean], variance: [...built.norm.variance] };
  norm.variance[3] = 0;
  const returns = Float64Array.from({ length: rollout.count }, (_, i) => Math.sin(i));
  const before = linearBaseline({ rollout, returns, norm });
  for (let i = 0; i < rollout.count; i += 1) rollout.x[i * rollout.width + 3] = 1e6;
  const after = linearBaseline({ rollout, returns, norm });
  assert.deepEqual(Array.from(after), Array.from(before));
});

/**
 * The time baseline averages over the bouts at a position and not over an ask's own neighbours.
 *
 * Two episodes whose returns are wholly different, cut at the same twenty buckets: an ask two
 * thirds of the way through one episode has to come back with the mean of *both* episodes at two
 * thirds, which is the only thing that makes this a control variate rather than a smoother.
 */
test("the_time_baseline_averages_over_the_bouts_at_a_position", () => {
  const rollout = returning([4, 4], [0, 0, 0, 0, 0, 0, 0, 0]);
  const returns = Float64Array.from([1, 2, 3, 4, 11, 12, 13, 14]);
  const got = baselineOf({ kind: "time", rollout, returns, critic: null, norm: null, buckets: 4 });
  // Positions are 0, 1/3, 2/3, 1 in both episodes, so the four buckets hold one ask of each --
  // except the last, which takes position 1 into the top bucket rather than off the end.
  assert.deepEqual(Array.from(got), [6, 7, 8, 9, 6, 7, 8, 9]);
});

/** The body baseline is the mean over every episode that drew the same build. */
test("the_body_baseline_is_the_mean_over_the_episodes_that_drew_the_same_build", () => {
  const rollout = returning([2, 2, 2], [0, 0, 0, 0, 0, 0]);
  // Three builds and two terminals, on purpose: a fixture whose builds group the way its
  // terminals do cannot tell the two axes apart, and the first spelling of this test was one.
  rollout.bodies = [BODIES[0], BODIES[2], BODIES[1]];
  const returns = Float64Array.from([1, 3, 10, 10, 5, 7]);
  const got = baselineOf({ kind: "body", rollout, returns, critic: null, norm: null });
  // Every episode drew a build of its own, so each keeps its own mean. Grouped by terminal the
  // first two would be one cell of four asks at 6 and the answer would be 6 six times over.
  assert.deepEqual(Array.from(got), [2, 2, 10, 10, 6, 6]);
});

/** The critic baseline is the vector it was handed, and is not rebuilt out of the returns. */
test("the_critic_baseline_is_the_vector_it_was_handed", () => {
  const rollout = returning([2], [0, 0]);
  const critic = Float64Array.from([0.25, -0.5]);
  const got = baselineOf({ kind: "critic", rollout, returns: null, critic, norm: null });
  assert.equal(got, critic, "the critic baseline was copied or recomputed rather than passed on");
});

/** A baseline this build does not have is refused by name rather than defaulted to the critic. */
test("a_baseline_kind_the_build_does_not_have_is_refused_by_name", () => {
  const rollout = returning([2], [0, 0]);
  assert.throws(
    () => baselineOf({ kind: "oracle", rollout, returns: null, critic: null, norm: null }),
    /baselineOf oracle; this build takes critic, zero, time, body, linear/,
  );
});

/**
 * An arm may name a baseline, an arm that did not carries no such key, and a word is checked.
 *
 * The same absent-unless-named rule the horizon follows, for the same reason: a grid that acquired
 * a constant field by default would make every row already under tournaments a different row.
 */
test("an_arm_names_a_baseline_or_carries_no_such_key_and_an_unknown_word_is_refused", () => {
  const [named, bare] = rewardArms([
    { label: "zeroed", baseline: "zero" },
    { label: "plain", outside: 0.01 },
  ]);
  assert.equal(named.baseline, "zero");
  assert.deepEqual(named.table, { ...GOLEM_REWARD }, "a baseline landed in the reward table");
  assert.equal("baseline" in bare, false, "an arm that named no baseline carries one anyway");
  assert.throws(() => rewardArms([{ label: "a", baseline: "oracle" }]), /this build baselines on/);
  assert.throws(() => rewardArms([{ label: "a", baseline: 4 }]), /this build baselines on/);
});

/**
 * A row's arms take their advantages against the baselines they named, and only those.
 *
 * The end of the wire, and the same identity-and-difference shape the reward pairing test uses: an
 * arm naming the run's own critic has to reproduce the row to the last digit -- the baseline is the
 * one the row was taken under -- and an arm naming anything else has to fail to. One mutation
 * cannot satisfy both, which is what makes the pair worth more than either.
 */
test("a_probe_rows_arms_take_their_advantages_against_the_baselines_they_named", { timeout: 300_000 }, async () => {
  const built = fixture(256, SEED + 45, { priced: true });
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const row = probeRollout({
      pool, rollout: built.rollout, weights: built.weights, valueWeights: built.valueWeights,
      logSigma: built.logSigma, norm: built.norm, valueLayout: VALUE, seed: SEED + 46,
      rewards: rewardArms([
        { label: "shipped" },
        { label: "same", baseline: "critic" },
        { label: "none", baseline: "zero" },
        { label: "when", baseline: "time" },
        { label: "plane", baseline: "linear" },
      ]),
    });
    const arms = Object.fromEntries(row.priced.map((arm) => [arm.label, arm]));
    assert.equal(arms.shipped.cosine, row.cosine, "the identity arm did not reproduce its row");
    assert.equal("baseline" in arms.shipped, false, "an arm that named no baseline carries one");
    assert.equal(arms.same.baseline, "critic");
    assert.equal(arms.same.cosine, row.cosine, "the critic arm is the row and did not come back as it");
    assert.equal(arms.same.dot, row.dot);
    for (const label of ["none", "when", "plane"]) {
      assert.notEqual(arms[label].cosine, row.cosine, `the ${label} arm reused the row's advantages`);
      assert.ok(Number.isFinite(arms[label].cosine), `the ${label} arm came back at ${arms[label].cosine}`);
    }
    // And the three of them disagree with each other as well, which is what says the kind was read
    // rather than a single not-the-critic branch taken three times.
    const cosines = new Set(["none", "when", "plane"].map((label) => arms[label].cosine));
    assert.equal(cosines.size, 3, "two baselines of different kinds produced the same gradient");
  } finally {
    await pool.close();
  }
});

/**
 * The whole epoch's gradient is the one the two halves average to, and it is taken under no bonus.
 *
 * `wholeGradient` exists for `scripts/step-probe.mjs`, which walks along it -- so the two things it
 * has to be are the gradient this file has been measuring the halves of, and a gradient with no
 * entropy coefficient in it. Both are asserted here rather than there, because this is the module
 * that owns the binding and a correctness property asserted in the file that consumes it is one
 * that moves the next time somebody adds a consumer.
 */
test("the_whole_epoch_gradient_is_the_one_the_two_halves_average_to", { timeout: 300_000 }, async () => {
  const built = fixture();
  const bound = bindings(built);
  const n = built.rollout.count;
  const pool = await FitPool.open({ shards: 2, layout: LAYOUT, valueLayout: VALUE });
  try {
    const [first, second] = halfGradients({ pool, ...bound });
    const whole = wholeGradient({ pool, ...bound });
    assert.equal(whole.asks, n);
    for (const which of ["actor", "spread", "critic"]) {
      let most = 0;
      let scale = 0;
      for (let k = 0; k < whole[which].length; k += 1) {
        const averaged = (first.asks * first[which][k] + second.asks * second[which][k]) / n;
        most = Math.max(most, Math.abs(averaged - whole[which][k]));
        scale = Math.max(scale, Math.abs(whole[which][k]));
      }
      assert.ok(most <= 1e-12 * (1 + scale), `the whole ${which} gradient is ${most} off the average`);
      assert.ok(scale > 0, `the whole epoch's ${which} gradient is identically zero`);
    }
    // The binding it left behind, read the way the entropy test reads it: a whole-epoch gradient
    // taken under a production coefficient would be a step along a direction the bonus chose.
    assert.equal(pool.bound.params[PARAM.ENTROPY], PROBE_ENTROPY);
  } finally {
    await pool.close();
  }
});
