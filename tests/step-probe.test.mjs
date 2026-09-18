// The step probe: the direction, the two ends of the step, and what an evaluation reports.
// Experiment O of the signal set's menu.
//
// **What this file can and cannot be.** The experiment is bouts -- collect a gradient, walk along
// it, collect more bouts, read what they returned -- and no test in this tree runs an arena. So
// what is asserted here is the arithmetic between those collections: that a direction is a unit
// vector, that the two ends of a step straddle the start by the distance asked for, that a random
// direction is drawn without reference to the data and is reproducible from its seed, and that an
// evaluation reports the rollout's own numbers rather than a second derivation of them. The claim
// the experiment rests on -- that a random direction raises the return no more often than it lowers
// it -- is a fact about the arena and is the thing the run is for; it is not assertable here and
// nothing here pretends to assert it.
//
// **Eight mutations of `scripts/step-probe.mjs` were watched red on 2026-09-13**, each applied
// alone and then restored:
//
// | mutation | what went red |
// |---|---|
// | `unit` divides by the sum of the squares rather than by its root | the unit test, the isotropy test, the step test and the control test |
// | `unit` reports the scaled vector's norm rather than the one it divided by | the unit test and the control test |
// | a direction of length zero is scaled rather than refused | the refusal test |
// | `randomDirection` reuses one normal draw for both coordinates of a pair | the isotropy test |
// | `randomDirection` is seeded from the clock rather than from its argument | the reproducibility test |
// | `stepped` adds the direction rather than the distance times it | the step test |
// | `directionsOf` derives the random direction from the gradient | the control test |
// | `evaluationOf` reports the summed episode returns rather than their mean | the evaluation test |
//
// **And three more on 2026-09-13, for a sign that nothing else in this record could have caught.**
// Every gradient in this tree is a loss gradient and every step the fit takes is a subtraction, so
// the direction this file walks is minus the vector the pool hands back. The gradient probe's own
// numbers -- cosines, dots of two halves, norms, ratios of those -- are every one of them invariant
// to negating both halves at once, so the whole record carried no assertion that could tell the two
// signs apart. The first run of this file walked the wrong way and came back with a clean,
// consistent, monotone result of the opposite sign.
//
// | mutation | what went red |
// |---|---|
// | the gradient arm walks the loss gradient, which is the bug this run was started with | the sign test |
// | the ascent sign is applied to the random arm as well, so the control is not a control | the control test |
// | the norm reported beside the direction is negated with it | both |
//
// **The first is not hypothetical and that is why it is first.** It is the code that was committed,
// armed and run, and what caught it was a peek at one draw rather than a test. The test exists so
// that the next reader does not need the peek.
//
// **The fourth of the six above is the one worth its row.** Box-Muller produces normals in pairs and the obvious
// slip is to write the same one into both coordinates, which leaves every pair of adjacent
// coordinates exactly equal -- a direction that is still a unit vector, still reproducible, still
// zero-mean, and confined to a subspace of half the dimensions. Every property a careless test
// would assert survives it. So the isotropy test asserts the thing that does not: that adjacent
// coordinates are uncorrelated over the whole vector.
import test from "node:test";
import assert from "node:assert/strict";

import { forward, initWeights, netScratch } from "../src/golem/neural-net.ts";
import {
  ACTION_AXES, ACTION_WIDTH, actionLogProb, normalise, sampleAction,
} from "../src/golem/policy.ts";
import { mulberry32 } from "../src/rng.ts";
import { FitPool } from "../scripts/train-ppo.mjs";
import { epochOrder, wholeGradient } from "../scripts/gradient-probe.mjs";
import {
  ASCENT, STEP_KINDS, directionsOf, evaluationOf, randomDirection, stepped, unit,
} from "../scripts/step-probe.mjs";

const SEED = 20260917;

/** A rollout carrying only what an evaluation reads: rewards, `done` flags and the two summaries. */
function evaluated(lengths, rewards, margin, decided) {
  const count = lengths.reduce((a, b) => a + b, 0);
  const done = new Uint8Array(count);
  let at = 0;
  for (const length of lengths) { at += length; done[at - 1] = 1; }
  return { count, episodes: lengths.length, done, reward: Float64Array.from(rewards), margin, decided };
}

/** A unit vector is the vector it was given, scaled, and the norm it reports is the one it used. */
test("a_unit_vector_is_the_vector_it_was_given_scaled_by_the_norm_it_reports", () => {
  const { direction, norm } = unit(Float64Array.from([3, 4]));
  assert.equal(norm, 5);
  assert.deepEqual(Array.from(direction), [0.6, 0.8]);
  // The property the fixture above is one instance of, over a vector whose norm is nowhere near 1
  // and whose coordinates differ in sign: a norm near one cannot see a division by the wrong thing.
  const long = unit(Float64Array.from([-30, 40, 120]));
  assert.ok(Math.abs(long.norm - 130) < 1e-12, `the norm came back as ${long.norm}`);
  let sum = 0;
  for (const value of long.direction) sum += value * value;
  assert.ok(Math.abs(sum - 1) < 1e-12, `the direction has squared length ${sum}`);
});

/** A vector with no direction is refused by name rather than divided by. */
test("a_vector_of_length_zero_is_refused_rather_than_divided_by", () => {
  assert.throws(() => unit(new Float64Array(8)), /length zero cannot be walked along/);
});

/**
 * A random direction is a unit vector whose adjacent coordinates carry no relation to each other.
 *
 * The correlation is the assertion that matters: Box-Muller draws normals in pairs and a spelling
 * that writes one draw into both coordinates of a pair leaves a vector that is still of length one,
 * still zero-mean and still reproducible, and lives in half the dimensions it claims to.
 */
test("a_random_direction_is_isotropic_and_not_a_pair_of_the_same_number_twice", () => {
  const { direction } = randomDirection(4096, SEED + 11);
  let sum = 0;
  for (const value of direction) sum += value * value;
  assert.ok(Math.abs(sum - 1) < 1e-12, `a random direction has squared length ${sum}`);
  let even = 0;
  let odd = 0;
  let cross = 0;
  let evenSquares = 0;
  let oddSquares = 0;
  for (let k = 0; k + 1 < direction.length; k += 2) {
    even += direction[k];
    odd += direction[k + 1];
    cross += direction[k] * direction[k + 1];
    evenSquares += direction[k] * direction[k];
    oddSquares += direction[k + 1] * direction[k + 1];
  }
  const correlation = cross / Math.sqrt(evenSquares * oddSquares);
  assert.ok(Math.abs(correlation) < 0.1, `adjacent coordinates correlate at ${correlation}`);
  const pairs = direction.length / 2;
  assert.ok(Math.abs(even / pairs) < 0.02 && Math.abs(odd / pairs) < 0.02,
    `a random direction is off centre at ${even / pairs} and ${odd / pairs}`);
});

/** The same seed draws the same direction, and a different seed does not. */
test("a_random_direction_is_reproducible_from_its_seed_and_only_from_it", () => {
  const again = randomDirection(64, SEED + 12);
  assert.deepEqual(Array.from(randomDirection(64, SEED + 12).direction), Array.from(again.direction));
  const other = randomDirection(64, SEED + 13);
  assert.notDeepEqual(Array.from(other.direction), Array.from(again.direction));
});

/**
 * The two ends of a step straddle the start by the distance asked for, along the direction given.
 *
 * Asserted as a distance rather than coordinate by coordinate, because the distance is what the
 * experiment's rows are read at and a step scaled by the wrong thing is the mistake that would make
 * two arms incomparable while leaving every row plausible.
 */
test("a_step_straddles_the_start_by_the_distance_it_was_asked_for", () => {
  const weights = Float64Array.from({ length: 32 }, (_, k) => Math.sin(k) * 0.08);
  const { direction } = randomDirection(32, SEED + 14);
  for (const distance of [0.02, 0.08, 1.5]) {
    const plus = stepped(weights, direction, distance);
    const minus = stepped(weights, direction, -distance);
    let away = 0;
    let apart = 0;
    for (let k = 0; k < weights.length; k += 1) {
      away += (plus[k] - weights[k]) ** 2;
      apart += (plus[k] - minus[k]) ** 2;
    }
    assert.ok(Math.abs(Math.sqrt(away) - distance) < 1e-12,
      `a step of ${distance} landed ${Math.sqrt(away)} away`);
    assert.ok(Math.abs(Math.sqrt(apart) - 2 * distance) < 1e-12,
      `the two ends of a step of ${distance} are ${Math.sqrt(apart)} apart`);
  }
  // And the start is where it was: `stepped` allocates rather than walking the caller's weights,
  // which is the difference between two ends of a step and one end taken twice.
  assert.equal(weights[0], Math.sin(0) * 0.08);
});

/**
 * A draw walks along its own gradient and along a direction that owes the gradient nothing.
 *
 * The control is the whole design, so the assertion is the one that fails if the control is derived
 * from the thing it controls for: two directions of one draw are close to orthogonal in a space of
 * this many dimensions, and a random vector that had been built out of the gradient would not be.
 */
test("a_draw_walks_the_gradient_and_a_direction_that_owes_it_nothing", () => {
  const random = mulberry32(SEED + 15);
  const gradient = Float64Array.from({ length: 2048 }, () => random() * 2 - 1);
  const walked = directionsOf({ gradient, seed: SEED + 16 });
  assert.deepEqual(walked.map((w) => w.kind), STEP_KINDS);
  const [first, second] = walked;
  // The gradient arm reports the norm it was scaled by, which is the row's `|g|`; the control has
  // no norm of its own to report and says so by carrying one.
  let want = 0;
  for (const value of gradient) want += value * value;
  assert.ok(Math.abs(first.norm - Math.sqrt(want)) < 1e-9, `the gradient norm came back as ${first.norm}`);
  assert.equal(second.norm, 1);
  let cosine = 0;
  for (let k = 0; k < gradient.length; k += 1) cosine += first.direction[k] * second.direction[k];
  // Two independent unit vectors in 2,048 dimensions sit within about 0.022 of a right angle at one
  // standard deviation, so a tenth is a wide bound that a derived control could not pass.
  assert.ok(Math.abs(cosine) < 0.1, `the control sits at ${cosine} to the gradient it controls for`);
});

/** An evaluation reports the mean episode return and the rollout's own two summaries. */
test("an_evaluation_reports_the_mean_episode_return_and_the_rollouts_own_summaries", () => {
  const rollout = evaluated([2, 3], [1, 2, 10, -4, 1], -0.125, 0.75);
  const got = evaluationOf(rollout);
  assert.equal(got.episodes, 2);
  // 3 and 7, so the mean is 5 and a summed spelling would answer 10.
  assert.equal(got.return, 5);
  assert.equal(got.margin, -0.125);
  assert.equal(got.decided, 0.75);
  assert.equal(got.asks, 5);
});

// ---------------------------------------------------------------------------------------
// Which way along the gradient the probe walks, which is the one thing about this file that the
// rest of the record could not have caught.
// ---------------------------------------------------------------------------------------

/** The head and the critic these two tests fit, small enough for a pool to open in a second. */
const SIGN_LAYOUT = Object.freeze({ inputs: 6, hidden: Object.freeze([14, 10]), outputs: ACTION_WIDTH });
const SIGN_VALUE = Object.freeze({ inputs: 6, hidden: Object.freeze([12]), outputs: 1 });

/**
 * A rollout with an observation, an action and the log-probability the policy gave it.
 *
 * Small and deliberately unremarkable: the assertion below is about a sign, and a sign does not
 * need a realistic collection to be wrong in.
 */
function signFixture(count = 192, seed = SEED + 41) {
  const width = SIGN_LAYOUT.inputs;
  const random = mulberry32(seed);
  const norm = { count: 9_000, mean: [], variance: [] };
  for (let k = 0; k < width; k += 1) { norm.mean[k] = k - 2; norm.variance[k] = 0.3 + k / 5; }
  const weights = initWeights(SIGN_LAYOUT, seed + 1);
  const valueWeights = initWeights(SIGN_VALUE, seed + 2);
  const logSigma = new Float64Array(ACTION_AXES).fill(-0.6);
  const scratch = netScratch(SIGN_LAYOUT);
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
    done: Uint8Array.from({ length: count }, (_, i) => (i % 24 === 23 ? 1 : 0)),
  };
  rollout.done[count - 1] = 1;
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < width; k += 1) {
      raw[k] = norm.mean[k] + Math.sqrt(norm.variance[k]) * (random() * 2 - 1) * 1.5;
      rollout.x[i * width + k] = raw[k];
    }
    normalise(raw, norm, observation);
    const head = forward(SIGN_LAYOUT, weights, observation, scratch);
    sampleAction(head, logSigma, random, draw);
    rollout.a.set(draw, i * ACTION_WIDTH);
    rollout.logp[i] = actionLogProb(head, logSigma, draw);
    rollout.reward[i] = random() - 0.5;
  }
  return { rollout, norm, weights, valueWeights, logSigma };
}

/** The mean log-probability this table gives the actions that rollout actually took. */
function meanLogProb({ rollout, norm, weights, logSigma }) {
  const scratch = netScratch(SIGN_LAYOUT);
  const raw = new Float64Array(rollout.width);
  const observation = new Float64Array(rollout.width);
  const action = new Float64Array(ACTION_WIDTH);
  let sum = 0;
  for (let i = 0; i < rollout.count; i += 1) {
    for (let k = 0; k < rollout.width; k += 1) raw[k] = rollout.x[i * rollout.width + k];
    normalise(raw, norm, observation);
    for (let k = 0; k < ACTION_WIDTH; k += 1) action[k] = rollout.a[i * ACTION_WIDTH + k];
    sum += actionLogProb(forward(SIGN_LAYOUT, weights, observation, scratch), logSigma, action);
  }
  return sum / rollout.count;
}

/**
 * The whole experiment in one assertion: a step along this file's direction makes the policy
 * **more** likely to do what a positive advantage said was good.
 *
 * Every gradient in this tree is a loss gradient -- `surrogateGrad` accumulates `-adv * ratio`
 * times the score and `adamStep` subtracts -- and every number the gradient probe publishes is a
 * cosine, a dot of two halves, a norm or a ratio of those, each of which is invariant to negating
 * both halves at once. So the record carried no assertion anywhere that could tell the ascent
 * direction from the descent one, and the first run of this file walked the wrong way: eight of
 * eight evaluations came back below their own start, monotonically in the step length, which is
 * exactly what a clean result with a reversed headline looks like.
 *
 * The advantages are **all positive**, which is what makes the assertion unambiguous. Under a
 * standardised advantage the fit is told some actions were better than average and some worse, and
 * the log-probability of the whole collection is not a quantity with a direction; told that every
 * action was good, there is one thing an improving step does and this pins it.
 */
test("a_step_along_the_probes_direction_makes_the_good_action_more_likely_not_less",
  { timeout: 300_000 }, async () => {
    const built = signFixture();
    const pool = await FitPool.open({ shards: 2, layout: SIGN_LAYOUT, valueLayout: SIGN_VALUE });
    try {
      const scaled = new Float64Array(built.rollout.count).fill(1);
      const returns = new Float64Array(built.rollout.count).fill(0);
      const order = epochOrder(built.rollout.count, SEED + 42);
      const whole = wholeGradient({
        pool, rollout: built.rollout, scaled, returns, norm: built.norm,
        weights: built.weights, valueWeights: built.valueWeights, logSigma: built.logSigma, order,
      });
      const [gradient] = directionsOf({ gradient: whole.actor, seed: SEED + 43 });
      const before = meanLogProb(built);
      const uphill = meanLogProb({ ...built, weights: stepped(built.weights, gradient.direction, 0.01) });
      const downhill = meanLogProb({ ...built, weights: stepped(built.weights, gradient.direction, -0.01) });
      assert.ok(uphill > before,
        `a step along the gradient took the mean log-probability from ${before} to ${uphill}`);
      assert.ok(downhill < before,
        `a step against the gradient took the mean log-probability from ${before} to ${downhill}`);
      // And the direction is anti-parallel to the loss gradient it came from, exactly, which is the
      // same claim said where a reader of `directionsOf` will look for it.
      let dot = 0;
      let norm = 0;
      for (let k = 0; k < whole.actor.length; k += 1) {
        dot += gradient.direction[k] * whole.actor[k];
        norm += whole.actor[k] * whole.actor[k];
      }
      assert.ok(Math.abs(dot + Math.sqrt(norm)) < 1e-9 * (1 + Math.sqrt(norm)),
        `the walked direction sits at a dot of ${dot} to a gradient of norm ${Math.sqrt(norm)}`);
      assert.equal(gradient.norm, Math.sqrt(norm));
    } finally {
      await pool.close();
    }
  });
