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

import { forward, initWeights, netScratch } from "../src/golem/neural-net.ts";
import {
  ACTION_AXES, ACTION_WIDTH, actionLogProb, normalise, sampleAction,
} from "../src/golem/policy.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";
import { mulberry32 } from "../src/rng.ts";
import { PARAM } from "../scripts/fit-worker.mjs";
import {
  FIT_SHUFFLE_SEED, FitPool, PRICED_COLUMNS, REWARD_KEYS, advantages, fitShuffle, fitShuffleRandom,
  ppoFit, priceRollout, standardisedAdvantages, valuesOf,
} from "../scripts/train-ppo.mjs";
import {
  CLASS_AXES, PROBE_ENTROPY, PROBE_EPOCH, askBouts, askClasses, boutBlocks, boutGradients, checkHeldStart,
  classBlocks, cosineOf, dotOf, epochOrder, halfGradients, halfSplit, measureSignal, normOf,
  parseClasses, probeRollout, rewardArms, shareOf,
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
