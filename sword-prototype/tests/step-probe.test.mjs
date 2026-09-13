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
// **The fourth is the one worth the row.** Box-Muller produces normals in pairs and the obvious
// slip is to write the same one into both coordinates, which leaves every pair of adjacent
// coordinates exactly equal -- a direction that is still a unit vector, still reproducible, still
// zero-mean, and confined to a subspace of half the dimensions. Every property a careless test
// would assert survives it. So the isotropy test asserts the thing that does not: that adjacent
// coordinates are uncorrelated over the whole vector.
import test from "node:test";
import assert from "node:assert/strict";

import { mulberry32 } from "../src/rng.ts";
import {
  STEP_KINDS, directionsOf, evaluationOf, randomDirection, stepped, unit,
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
