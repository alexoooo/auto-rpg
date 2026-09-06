// The neural contender: its features, its network, its weights table, and the trainer that
// makes one. Session 08 of the matchup set.
//
// The pure half is arithmetic and costs milliseconds: the feature vector is the width it says,
// the network is deterministic under a seed, the masked head never wants a closed option, and
// the hand-written backward pass agrees with finite differences. The real half runs a bout with
// the shipped weights and spawns two workers for a collection, an imitation, a generation and a
// confirmation on three-second bouts over two builds, and checks that what comes out the far end
// is a table the mind loads.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DUEL_OPTIONS } from "../src/golem/duel-model.ts";
import { FEATURE_COUNT, FEATURE_NAMES, NEURAL_FEATURES_VERSION, neuralFeatures } from "../src/golem/neural-features.ts";
import { backward, forward, initWeights, maskedSoftmax, netScratch, netSize, pickOpen } from "../src/golem/neural-net.ts";
import { NEURAL_LAYOUT, NEURAL_VERSION, checkNeuralWeights, golemNeural } from "../src/golem/neural.ts";
import { NEURAL_WEIGHTS } from "../src/golem/neural-weights.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { unitDefinition } from "../src/units.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool } from "../scripts/tournament.mjs";
import {
  DEFAULT_TEACHER, collect, confirm, evolve, imitate, neuralTable, readSamples, renderNeuralModule, utilities, writeSamples,
} from "../scripts/train-neural.mjs";

import { freshHavok, runBout } from "../scripts/bout-runner.mjs";

const SEED = 20260908;

/** The mask a bitmask names, in `DUEL_OPTIONS` order. */
const openOf = (bits) => DUEL_OPTIONS.map((_, j) => (bits >> j & 1) === 1);

test("the_feature_vector_is_as_wide_as_its_names_and_refuses_another_width", () => {
  assert.equal(FEATURE_NAMES.length, FEATURE_COUNT);
  assert.equal(new Set(FEATURE_NAMES).size, FEATURE_COUNT, "a column is named twice");
  assert.equal(FEATURE_NAMES[0], "bias");
  for (const option of DUEL_OPTIONS) assert.ok(FEATURE_NAMES.includes(`open:${option}`), `no column says whether ${option} is open`);
  assert.equal(NEURAL_LAYOUT.inputs, FEATURE_COUNT);
  assert.equal(NEURAL_LAYOUT.outputs, DUEL_OPTIONS.length);
  const reading = { gap: 1.2, strike: 1.0, slack: 0.2, gapRate: -0.3, theirWeapon: "sword", myWeapon: "club", theirs: "idle", mine: "free" };
  assert.throws(() => neuralFeatures(reading, DUEL_OPTIONS, null, new Float64Array(FEATURE_COUNT - 1)), /is 55/);
});

test("the_network_is_the_same_under_a_seed_and_its_head_competes_only_among_what_is_open", () => {
  assert.equal(netSize(NEURAL_LAYOUT), 64 * (FEATURE_COUNT + 1) + 64 * 65 + 8 * 65);
  const a = initWeights(NEURAL_LAYOUT, 7);
  const b = initWeights(NEURAL_LAYOUT, 7);
  const c = initWeights(NEURAL_LAYOUT, 8);
  assert.deepEqual(Array.from(a), Array.from(b), "a seed names the weights");
  assert.notDeepEqual(Array.from(a), Array.from(c));
  assert.ok(a.every(Number.isFinite));
  // Biases are zero: the last eight numbers are the head's.
  assert.ok(a.subarray(a.length - 8).every((w) => w === 0));
  const input = new Float64Array(FEATURE_COUNT).map((_, i) => Math.sin(i));
  const scratch = netScratch(NEURAL_LAYOUT);
  const logits = Float64Array.from(forward(NEURAL_LAYOUT, a, input, scratch));
  assert.equal(logits.length, DUEL_OPTIONS.length);
  assert.deepEqual(Array.from(forward(NEURAL_LAYOUT, a, input, netScratch(NEURAL_LAYOUT))), Array.from(logits));
  assert.throws(() => forward(NEURAL_LAYOUT, a, new Float64Array(3), scratch), /reads 56 inputs/);
  assert.throws(() => forward(NEURAL_LAYOUT, a.subarray(1), input, scratch), /wants 8328 weights/);
  // The masked softmax: zero on a closed option, one over the open ones, refused with none open.
  const open = DUEL_OPTIONS.map((option) => option === "hold" || option === "strike" || option === "wait");
  const p = maskedSoftmax(logits, open, new Float64Array(DUEL_OPTIONS.length));
  DUEL_OPTIONS.forEach((option, j) => assert.ok(open[j] ? p[j] > 0 : p[j] === 0, `${option} should be ${open[j] ? "in" : "out"}`));
  assert.ok(Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  assert.throws(() => maskedSoftmax(logits, DUEL_OPTIONS.map(() => false), new Float64Array(8)), /no option is open/);
  // The pick is the highest open logit, the first in order on a tie.
  const rigged = Float64Array.from([5, 1, 9, 9, 0, 0, 0, 0]);
  assert.equal(pickOpen(rigged, DUEL_OPTIONS), "withdraw");
  assert.equal(pickOpen(rigged, ["hold", "close", "circle"]), "circle");
  assert.equal(pickOpen(rigged, ["close", "hold"]), "hold");
  assert.throws(() => pickOpen(rigged, []), /no option is open/);
});

test("the_backward_pass_agrees_with_finite_differences_through_the_mask", () => {
  const layout = { inputs: 3, hidden: [4], outputs: 3 };
  const weights = initWeights(layout, 11);
  const input = Float64Array.from([0.3, -0.7, 0.9]);
  const open = [true, false, true];
  const target = 2;
  const scratch = netScratch(layout);
  const probabilities = new Float64Array(3);
  const grad = new Float64Array(weights.length);
  forward(layout, weights, input, scratch);
  const loss = backward(layout, weights, input, scratch, open, target, grad, probabilities);
  assert.ok(loss > 0 && Number.isFinite(loss));
  assert.equal(probabilities[1], 0, "the closed option has no probability");
  const lossAt = (w) => {
    forward(layout, w, input, scratch);
    const p = maskedSoftmax(scratch[scratch.length - 1], open, new Float64Array(3));
    return -Math.log(p[target]);
  };
  const h = 1e-6;
  for (let k = 0; k < weights.length; k += 1) {
    const plus = Float64Array.from(weights); plus[k] += h;
    const minus = Float64Array.from(weights); minus[k] -= h;
    const numeric = (lossAt(plus) - lossAt(minus)) / (2 * h);
    assert.ok(Math.abs(numeric - grad[k]) < 1e-6, `weight ${k}: analytic ${grad[k]} vs numeric ${numeric}`);
  }
  // The gradient of the closed head row is zero: nothing flows to an option that cannot be taken.
  const headRow = weights.length - 3 * (4 + 1) + 1 * 4;
  assert.ok(grad.subarray(headRow, headRow + 4).every((g) => g === 0));
  // Accumulation: a second call doubles it.
  const once = Float64Array.from(grad);
  forward(layout, weights, input, scratch);
  backward(layout, weights, input, scratch, open, target, grad, probabilities);
  for (let k = 0; k < grad.length; k += 1) assert.ok(Math.abs(grad[k] - 2 * once[k]) < 1e-12);
  assert.throws(() => backward(layout, weights, input, scratch, open, 1, grad, probabilities), /is not open/);
});

test("a_weights_table_is_refused_by_version_layout_and_length_by_name", () => {
  assert.equal(checkNeuralWeights(NEURAL_WEIGHTS), NEURAL_WEIGHTS);
  assert.equal(NEURAL_WEIGHTS.version, NEURAL_VERSION);
  assert.equal(NEURAL_WEIGHTS.features, NEURAL_FEATURES_VERSION);
  assert.equal(NEURAL_WEIGHTS.weights.length, netSize(NEURAL_LAYOUT));
  assert.throws(() => checkNeuralWeights({ ...NEURAL_WEIGHTS, version: 0 }), /version 0; this build reads version 1/);
  assert.throws(() => checkNeuralWeights({ ...NEURAL_WEIGHTS, features: 0 }), /feature version 0; this build publishes version 1/);
  assert.throws(() => checkNeuralWeights({ ...NEURAL_WEIGHTS, layout: { ...NEURAL_WEIGHTS.layout, hidden: [32, 32] } }), /laid out/);
  assert.throws(() => checkNeuralWeights({ ...NEURAL_WEIGHTS, weights: NEURAL_WEIGHTS.weights.slice(1) }), /hold 8327 numbers/);
  assert.throws(() => golemNeural(SEED, { ...NEURAL_WEIGHTS, version: 2 }), /version 2/);
  // The rank utilities: sum to zero, best highest, and a permutation of the same scores permutes them.
  const u = utilities([0.1, 0.5, 0.3, 0.2]);
  assert.ok(Math.abs(u.reduce((s, x) => s + x, 0)) < 1e-12);
  assert.equal(Math.max(...u), u[1]);
  assert.equal(Math.min(...u), u[0]);
});

test("imitation_recovers_a_rule_it_is_shown", () => {
  // Four thousand asks under a rule: the option is the open one whose fixed direction agrees
  // most with the features. A network that reads the features can learn it; one that does not
  // stays at chance, which over about four open options is a quarter.
  const random = mulberry32(5);
  const count = 4000;
  const x = new Float32Array(count * FEATURE_COUNT);
  const y = new Uint8Array(count);
  const open = new Uint8Array(count);
  const directions = DUEL_OPTIONS.map(() => Float64Array.from({ length: FEATURE_COUNT }, () => random() * 2 - 1));
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < FEATURE_COUNT; k += 1) x[i * FEATURE_COUNT + k] = random() * 2 - 1;
    let bits = 0;
    while (bits === 0) bits = Math.floor(random() * 256);
    open[i] = bits;
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let j = 0; j < DUEL_OPTIONS.length; j += 1) {
      if ((bits >> j & 1) === 0) continue;
      let score = 0;
      for (let k = 0; k < FEATURE_COUNT; k += 1) score += directions[j][k] * x[i * FEATURE_COUNT + k];
      if (score > bestScore) { best = j; bestScore = score; }
    }
    y[i] = best;
  }
  const samples = { x, y, open, count, bouts: 0 };
  const epochs = [];
  const fitted = imitate(samples, { seed: SEED, epochs: 12, rate: 3e-3, onEpoch: (e) => epochs.push(e) });
  assert.equal(epochs.length, 12);
  assert.ok(epochs[11].loss < epochs[0].loss, "the loss did not fall");
  assert.equal(fitted.held, 400);
  assert.ok(fitted.heldOut > 0.85, `held-out agreement ${fitted.heldOut}`);
  assert.equal(fitted.weights.length, netSize(NEURAL_LAYOUT));
  // The same seed makes the same fit.
  const again = imitate(samples, { seed: SEED, epochs: 2 });
  const twice = imitate(samples, { seed: SEED, epochs: 2 });
  assert.deepEqual(Array.from(again.weights), Array.from(twice.weights));
  // Samples survive the file.
  const dir = mkdtempSync(join(tmpdir(), "neural-samples-"));
  try {
    const path = join(dir, "samples.bin");
    writeSamples(path, samples);
    const back = readSamples(path);
    assert.equal(back.count, count);
    assert.deepEqual(Array.from(back.y), Array.from(y));
    assert.deepEqual(Array.from(back.open), Array.from(open));
    assert.deepEqual(Array.from(back.x.subarray(0, 100)), Array.from(x.subarray(0, 100)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The mind plays a real bout on the shipped weights: the network is asked, every column it
 * read was finite and the open columns were the fencer's own list, and the picker loads it.
 * A NaN in a reading reaches the vector rather than being hidden, so a bad publication fails
 * loudly in a test and not quietly in a table.
 */
test("golem_neural_plays_a_real_bout_on_the_shipped_weights_and_loads_through_the_picker", async () => {
  const asks = [];
  const neural = golemNeural(SEED, NEURAL_WEIGHTS, undefined, (available, reading, view, option) => {
    if (asks.length < 4) asks.push({ available: [...available], reading: { ...reading }, view, option });
  });
  const mind = { name: "golem-neural", fencer: neural.fencer, decide: (view, dt) => neural.decide(view, dt) };
  const setup = defaultGolemSetup();
  const result = runBout({
    left: "golem-neural", right: "golem-fencer",
    leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported",
    leftMind: mind,
    seeds: [SEED, SEED + 3],
    maxSeconds: 3,
    physics: await freshHavok(),
  });
  assert.ok(result.seconds >= 2.9, `the bout ran ${result.seconds.toFixed(1)} s`);
  assert.ok(neural.asks > 0, "the network was never asked");
  assert.equal(neural.lastLogits.length, DUEL_OPTIONS.length);
  assert.ok(asks.length > 0);
  for (const ask of asks) {
    assert.ok(ask.available.includes(ask.option), `${ask.option} was not open`);
    const features = neuralFeatures(ask.reading, ask.available, ask.view, new Float64Array(FEATURE_COUNT));
    assert.ok(features.every(Number.isFinite), "a column is not finite");
    assert.equal(features[0], 1);
    DUEL_OPTIONS.forEach((option, j) => {
      assert.equal(features[FEATURE_NAMES.indexOf(`open:${option}`)], ask.available.includes(option) ? 1 : 0);
    });
    assert.equal(features[FEATURE_NAMES.indexOf("myWeapon:sword")], 1, "the default golem holds a sword");
    assert.ok(features[FEATURE_NAMES.indexOf("myHealth:trunk")] > 0);
    const broken = neuralFeatures({ ...ask.reading, gap: Number.NaN }, ask.available, ask.view, new Float64Array(FEATURE_COUNT));
    assert.ok(Number.isNaN(broken[FEATURE_NAMES.indexOf("gap")]), "a NaN reading must reach the vector");
  }
  const shipped = unitDefinition("golem").createPolicy("golem-neural");
  assert.equal(shipped.name, "golem-neural");
  assert.ok(shipped.fencer !== null, "the neural mind publishes its fencer for the exchange log");
});

/**
 * One turn of the whole trainer on two workers: the teacher's asks are collected, a network is
 * fitted to them, one generation of two antithetic pairs moves the mean, and the confirmation
 * rates the results beside the champion on the same schedule. The claim is the shape of what
 * comes out -- log lines with the fields the readout needs and a module the mind loads -- and
 * not the number, which two bouts cannot say anything about.
 */
test("one_generation_of_the_trainer_on_two_workers_makes_a_table_the_mind_loads", { timeout: 300_000 }, async () => {
  const pool = buildPool({ seed: SEED, random: 0 }).filter((build) => build.name === "default" || build.name === "fists");
  assert.equal(pool.length, 2);
  const league = ["golem-fencer"];
  const samples = await collect({ pool, teacher: DEFAULT_TEACHER, league, seed: SEED, bouts: 2, workers: 2, cap: 3 });
  assert.ok(samples.count > 0, "the champion never asked");
  assert.equal(samples.x.length, samples.count * FEATURE_COUNT);
  assert.equal(samples.bouts, 2, "bouts is the whole budget, spread over the pool, as the tuner spends it");
  for (let i = 0; i < samples.count; i += 1) {
    assert.ok((samples.open[i] >> samples.y[i] & 1) === 1, `sample ${i} took an option that was not open`);
  }
  const fitted = imitate(samples, { seed: SEED, epochs: 1 });
  assert.equal(fitted.weights.length, netSize(NEURAL_LAYOUT));
  const lines = [];
  const run = await evolve({
    start: fitted.weights, league, pool, seed: SEED, generations: 1, population: 2, sigma: 0.02, alpha: 0.01,
    bouts: 2, workers: 2, cap: 3, log: (line) => lines.push(line),
  });
  assert.equal(lines.length, 1);
  const [generation] = lines;
  assert.equal(generation.type, "generation");
  assert.equal(generation.generation, 1);
  assert.equal(generation.bouts, 3 * 2, "the mean and two antithetic children, two bouts each");
  assert.ok(Number.isFinite(generation.mean.margin) && Number.isFinite(generation.gradientNorm));
  assert.deepEqual(Object.keys(generation.scores).sort(), ["mean", "minus-1", "plus-1"]);
  assert.equal(run.bouts, generation.bouts);
  assert.equal(run.final.length, fitted.weights.length);
  assert.ok(run.final.some((w, k) => w !== fitted.weights[k]), "the step moved nothing");
  assert.equal(run.peak.generation, 1);
  const rated = await confirm({ candidates: { final: run.final }, league, pool, seed: SEED, bouts: 2, workers: 2, cap: 3 });
  assert.deepEqual(Object.keys(rated).sort(), ["champion", "final"]);
  assert.equal(rated.champion.bouts, 2);
  assert.ok(Number.isFinite(rated.final.margin));
  const table = neuralTable(run.final, {
    seed: SEED, date: "2026-09-06", teacher: DEFAULT_TEACHER, imitation: { samples: samples.count, accuracy: fitted.heldOut },
    generations: 1, bouts: run.bouts, score: rated.final.score, baseline: rated.champion.score, league,
  });
  const text = renderNeuralModule(table);
  assert.match(text, /GENERATED by scripts\/train-neural\.mjs/);
  assert.match(text, /Trained 2026-09-06 from seed 20260908: imitated golem-champion/);
  const literal = text.slice(text.indexOf("= ") + 2, text.lastIndexOf(";"));
  const parsed = JSON.parse(literal);
  assert.equal(checkNeuralWeights(parsed), parsed);
  assert.equal(parsed.weights.length, netSize(NEURAL_LAYOUT));
  const loaded = golemNeural(SEED, parsed);
  assert.equal(loaded.asks, 0);
  assert.throws(() => renderNeuralModule({ ...table, weights: table.weights.slice(1) }), /hold 8327 numbers/);
});
