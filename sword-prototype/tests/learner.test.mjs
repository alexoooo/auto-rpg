// `golem-learner`: the value network, the targets it is fitted to, and the trainer that fits it.
// Session 10 of the style set.
//
// The pure half is arithmetic and costs a second or two. The claim that matters is the last of
// them: fitted Q-iteration, run exactly as the trainer runs it, recovers the optimal policy of a
// small semi-Markov chain whose optimum a greedy reader gets wrong -- so a run of the trainer
// that does not learn is a fact about the arena or the features and not about the fit. The chain
// is written out below with its exact values, computed by hand from the recursion rather than by
// the code under test.
//
// The real half spawns two workers for one round of collect-and-refit on three-second bouts over
// two builds, and checks that what comes out the far end is a module the mind loads and the
// picker offers.
import test from "node:test";
import assert from "node:assert/strict";

import { LEARNER_LAYOUT, LEARNER_VERSION, checkLearnerWeights, golemLearner } from "../src/golem/learner.ts";
import { LEARNER_WEIGHTS } from "../src/golem/learner-weights.ts";
import { backwardFrom, forward, initWeights, netScratch, netSize, pickOpenIn, qBackward } from "../src/golem/neural-net.ts";
import { STYLE_FEATURE_COUNT, STYLE_FEATURES_VERSION } from "../src/golem/style-features.ts";
import { STYLE_OPTIONS } from "../src/golem/tactics-v3.ts";
import { POLICIES, policyMind } from "../src/mind.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool } from "../scripts/tournament.mjs";
import {
  LEARNER_LEAGUE, bellmanTargets, collectRound, columnsOf, confirm, fittedQ, learnerTable,
  optionCensus, renderLearnerModule, tailOf,
} from "../scripts/train-learner.mjs";

const SEED = 20260910;

// ------------------------------------------------------------------- the six-state chain

/**
 * The chain: six states, three actions, durations of one or two seconds, one action closed in two
 * states, and a myopic trap at the root. Each entry is `[reward, seconds, next]`, `null` where the
 * action is closed, and state 5 is terminal.
 *
 * From state 0 the greedy reward is action 0 -- a whole point, now -- and the optimum is action 1,
 * which pays nothing and reaches the branch that pays two. Action 2 reaches the same branch by a
 * two-second road instead of a one-second one and is worth less for exactly that reason, which is
 * the part a per-step discount could not tell apart.
 */
const CHAIN = [
  [[1.0, 1, 1], [0.0, 1, 2], [0.0, 2, 2]],
  [[-0.1, 2, 3], [0.0, 2, 3], null],
  [[0.0, 1, 4], [-0.2, 1, 4], [0.0, 1, 3]],
  [[0.0, 1, 5], [-0.3, 1, 5], [-0.5, 1, 5]],
  [[2.0, 1, 5], [0.5, 1, 5], null],
];
const TERMINAL = 5;
const HALF_LIFE = 8;
const CHAIN_WIDTH = 10;
const CHAIN_LAYOUT = { inputs: CHAIN_WIDTH, hidden: [16], outputs: 3 };

const discount = (seconds) => Math.pow(2, -seconds / HALF_LIFE);

/** Q* and V* of the chain, by backward recursion over its states; state 5 is worth nothing. */
function chainOptimum() {
  const V = new Array(TERMINAL + 1).fill(0);
  const Q = CHAIN.map(() => new Array(3).fill(Number.NEGATIVE_INFINITY));
  for (let s = CHAIN.length - 1; s >= 0; s -= 1) {
    for (let a = 0; a < 3; a += 1) {
      const edge = CHAIN[s][a];
      if (edge === null) continue;
      const [reward, seconds, next] = edge;
      Q[s][a] = reward + discount(seconds) * V[next];
    }
    V[s] = Math.max(...Q[s]);
  }
  return { Q, V };
}

/** The open mask of a state, as the log carries it: a bit a live action. */
const chainMask = (s) => CHAIN[s].reduce((bits, edge, a) => (edge === null ? bits : bits | 1 << a), 0);

/** One-hot the state, with a bias column in front, into the chain's ten. */
function chainFeatures(s, into, at) {
  for (let k = 0; k < CHAIN_WIDTH; k += 1) into[at + k] = 0;
  into[at] = 1;
  into[at + 1 + s] = 1;
}

/**
 * Episodes from state 0 under a uniform draw from what is open, laid out as the decision log lays
 * them: one run a episode, `done` on its last decision. Every episode reaches the terminal in
 * three steps, so no run is truncated and no target loses its bootstrap for a reason the chain
 * did not intend.
 */
function chainSamples(episodes, seed) {
  const random = mulberry32(seed);
  const x = [];
  const y = [];
  const open = [];
  const dealt = [];
  const taken = [];
  const seconds = [];
  const done = [];
  const buffer = new Float64Array(CHAIN_WIDTH);
  for (let e = 0; e < episodes; e += 1) {
    let s = 0;
    while (s !== TERMINAL) {
      const live = [0, 1, 2].filter((a) => CHAIN[s][a] !== null);
      const a = live[Math.floor(random() * live.length)];
      const [reward, duration, next] = CHAIN[s][a];
      chainFeatures(s, buffer, 0);
      for (let k = 0; k < CHAIN_WIDTH; k += 1) x.push(buffer[k]);
      y.push(a);
      open.push(chainMask(s));
      dealt.push(reward);
      taken.push(0);
      seconds.push(duration);
      done.push(next === TERMINAL ? 1 : 0);
      s = next;
    }
  }
  return {
    kind: "style", count: y.length, bouts: episodes, width: CHAIN_WIDTH,
    x: Float32Array.from(x), y: Uint8Array.from(y), open: Uint16Array.from(open),
    dealt: Float64Array.from(dealt), taken: Float64Array.from(taken),
    seconds: Float64Array.from(seconds), done: Uint8Array.from(done),
  };
}

// ------------------------------------------------------------------------ the gradient

/**
 * The hand-written value gradient against central differences.
 *
 * `qBackward` returns the squared error and accumulates the gradient of *half* of it, which is
 * the usual convention and the one `backward` already follows for the cross-entropy: the delta it
 * seeds is `Q[a] - target` and not twice it. The check is therefore on `0.5 * error ** 2`, and it
 * is written out here because the factor is exactly the kind of thing that is off by two for a
 * whole session without any test failing.
 */
test("the_value_gradient_agrees_with_central_differences_and_is_zero_off_the_taken_row", () => {
  const layout = { inputs: 6, hidden: [7, 5], outputs: 4 };
  const weights = initWeights(layout, 12345);
  const scratch = netScratch(layout);
  const random = mulberry32(99);
  const input = Float64Array.from({ length: layout.inputs }, () => random() * 2 - 1);
  const action = 2;
  const target = 0.37;
  const grad = new Float64Array(netSize(layout));
  const delta = new Float64Array(layout.outputs);
  forward(layout, weights, input, scratch);
  const error = qBackward(layout, weights, input, scratch, action, target, grad, delta);
  assert.ok(Math.abs(error - (scratch[scratch.length - 1][action] - target) ** 2) < 1e-12,
    "the return is not the squared error at the taken option");
  for (let a = 0; a < layout.outputs; a += 1) {
    if (a === action) continue;
    assert.equal(delta[a], 0, `the delta is not zero at option ${a}, which nothing was said about`);
  }
  const loss = (w) => {
    const local = netScratch(layout);
    const q = forward(layout, w, input, local);
    return 0.5 * (q[action] - target) ** 2;
  };
  const step = 1e-6;
  const random2 = mulberry32(7);
  for (let n = 0; n < 40; n += 1) {
    const k = Math.floor(random2() * weights.length);
    const up = Float64Array.from(weights);
    const down = Float64Array.from(weights);
    up[k] += step;
    down[k] -= step;
    const numeric = (loss(up) - loss(down)) / (2 * step);
    assert.ok(Math.abs(numeric - grad[k]) < 1e-6,
      `weight ${k}: the analytic gradient ${grad[k]} is not the numeric ${numeric}`);
  }
});

/** `backwardFrom` is the loop `backward` always ran: a delta the caller seeds, and nothing else. */
test("the_extracted_backward_pass_accumulates_rather_than_overwrites_and_reads_the_delta", () => {
  const layout = { inputs: 4, hidden: [5], outputs: 3 };
  const weights = initWeights(layout, 5150);
  const scratch = netScratch(layout);
  const input = Float64Array.from([0.3, -0.7, 1.0, 0.2]);
  forward(layout, weights, input, scratch);
  const delta = Float64Array.from([0.5, 0, -0.25]);
  const once = new Float64Array(netSize(layout));
  backwardFrom(layout, weights, input, scratch, delta, once);
  assert.deepEqual(Array.from(delta), [0.5, 0, -0.25], "the delta was written to");
  const twice = new Float64Array(netSize(layout));
  backwardFrom(layout, weights, input, scratch, delta, twice);
  backwardFrom(layout, weights, input, scratch, delta, twice);
  for (let k = 0; k < twice.length; k += 1) {
    assert.ok(Math.abs(twice[k] - 2 * once[k]) < 1e-12, `weight ${k} did not accumulate`);
  }
});

// -------------------------------------------------------------------------- the targets

/** Four decisions in two runs, with the network's own answers taken independently of the code. */
test("a_bellman_target_is_the_reward_plus_the_discounted_best_open_value_and_nothing_after_done", () => {
  const layout = CHAIN_LAYOUT;
  const weights = initWeights(layout, 4242);
  const scratch = netScratch(layout);
  const x = new Float32Array(4 * CHAIN_WIDTH);
  for (const [row, state] of [[0, 0], [1, 2], [2, 3], [3, 4]]) chainFeatures(state, x, row * CHAIN_WIDTH);
  const samples = {
    kind: "style", count: 4, bouts: 2, width: CHAIN_WIDTH, x,
    y: Uint8Array.from([0, 1, 2, 0]),
    open: Uint16Array.from([0b011, 0b101, 0b100, 0b111]),
    dealt: Float64Array.from([1.0, 0, 0.5, 0]),
    taken: Float64Array.from([0.25, 2, 0, 0]),
    seconds: Float64Array.from([0.5, 1.5, 3, 0.25]),
    done: Uint8Array.from([0, 1, 0, 1]),
  };
  const valueAt = (row, options) => {
    const input = Float64Array.from(samples.x.subarray(row * CHAIN_WIDTH, (row + 1) * CHAIN_WIDTH));
    const q = forward(layout, weights, input, scratch);
    return Math.max(...options.map((a) => q[a]));
  };
  const targets = bellmanTargets(samples, weights, { layout, halfLife: HALF_LIFE });
  assert.equal(targets.length, 4);
  assert.ok(Math.abs(targets[0] - (0.75 + discount(0.5) * valueAt(1, [0, 2]))) < 1e-12,
    "the first target is not its reward plus the discounted best of what was open next");
  assert.ok(Math.abs(targets[1] - -2) < 1e-12, "the last decision of a run bootstrapped from something");
  assert.ok(Math.abs(targets[2] - (0.5 + discount(3) * valueAt(3, [0, 1, 2]))) < 1e-12);
  assert.equal(targets[3], 0);
  // The bonus is paid on the sign of the side's own summed bar, on the row that closes the run.
  const bonused = bellmanTargets(samples, weights, { layout, halfLife: HALF_LIFE, winBonus: 0.5 });
  assert.ok(Math.abs(bonused[1] - -2.5) < 1e-12, "the losing run was not charged the bonus");
  assert.ok(Math.abs(bonused[3] - 0.5) < 1e-12, "the winning run was not paid the bonus");
  assert.ok(Math.abs(bonused[0] - targets[0]) < 1e-12, "a bonus reached a decision that did not close a run");
});

test("the_trainer_refuses_samples_that_are_not_the_third_executors", () => {
  const samples = { ...chainSamples(1, 1), kind: "neural" };
  assert.throws(() => bellmanTargets(samples, initWeights(CHAIN_LAYOUT, 1), { layout: CHAIN_LAYOUT }),
    /these are neural samples/);
  assert.throws(() => fittedQ(samples, { layout: CHAIN_LAYOUT, seed: 1, iterations: 1 }),
    /these are neural samples/);
});

test("a_learner_table_is_refused_by_version_by_features_by_layout_and_by_length", () => {
  const table = LEARNER_WEIGHTS;
  assert.equal(checkLearnerWeights(table), table);
  assert.equal(table.version, LEARNER_VERSION);
  assert.equal(table.features, STYLE_FEATURES_VERSION);
  assert.equal(table.layout.inputs, STYLE_FEATURE_COUNT);
  assert.equal(table.layout.outputs, STYLE_OPTIONS.length);
  assert.equal(table.weights.length, netSize(LEARNER_LAYOUT));
  assert.throws(() => checkLearnerWeights({ ...table, version: table.version + 1 }), /this build reads version/);
  assert.throws(() => checkLearnerWeights({ ...table, features: table.features + 1 }), /feature version/);
  assert.throws(() => checkLearnerWeights({ ...table, layout: { ...table.layout, hidden: [64] } }), /laid out/);
  assert.throws(() => checkLearnerWeights({ ...table, weights: table.weights.slice(1) }), /numbers; the layout wants/);
  assert.throws(() => golemLearner(SEED, { ...table, version: 99 }), /this build reads version/);
  assert.throws(() => renderLearnerModule({ ...table, weights: table.weights.slice(1) }), /numbers; the layout wants/);
});

// ------------------------------------------------------------------------------ the fit

/**
 * The claim the whole session rests on: run exactly as the trainer runs it, fitted Q-iteration
 * finds the optimal policy of a chain whose optimum contradicts the reward in front of it.
 *
 * The data are episodes under a uniform draw from what is open, so the policy that generated them
 * is not the policy that comes out -- which is the off-policy property the corpus of Session 08
 * depends on. Nothing here is the arena: if this passes and a real fit does not learn, the fit is
 * not what is wrong.
 */
test("fitted_q_iteration_recovers_the_optimum_of_a_semi_markov_chain_with_a_myopic_trap", { timeout: 120_000 }, () => {
  const { Q, V } = chainOptimum();
  // The three numbers the chain was built around, from the closed form rather than the recursion:
  // a point now, or two points two one-second hops away, or the same two hops away by a road that
  // takes a second longer.
  assert.ok(Math.abs(Q[0][0] - 1) < 1e-12);
  assert.ok(Math.abs(Q[0][1] - Math.pow(2, 0.75)) < 1e-12, "the patient action is not worth 2^(3/4)");
  assert.ok(Math.abs(Q[0][2] - Math.pow(2, 0.625)) < 1e-12, "the slow road is not worth 2^(5/8)");
  assert.ok(Q[0][1] > Q[0][0], "the trap is not a trap");
  assert.ok(Math.abs(V[4] - 2) < 1e-12);

  const samples = chainSamples(1500, 3);
  assert.equal(samples.count, 1500 * 3, "an episode is three decisions");
  const seen = new Set();
  for (let i = 0; i < samples.count; i += 1) {
    assert.ok((samples.open[i] >> samples.y[i] & 1) === 1, `decision ${i} took an option that was not open`);
    seen.add(`${samples.x.slice(i * CHAIN_WIDTH, (i + 1) * CHAIN_WIDTH).join("")}|${samples.y[i]}`);
  }
  assert.equal(seen.size, 13, "the draw did not cover every open state-action pair of the chain");

  const trace = [];
  const fit = fittedQ(samples, {
    layout: CHAIN_LAYOUT, seed: SEED, iterations: 40, epochs: 4, batch: 64, rate: 0.01,
    halfLife: HALF_LIFE, holdOut: 0.1, onIteration: (it) => trace.push(it),
  });
  assert.equal(trace.length, 40);
  assert.equal(fit.decisions, samples.count);
  assert.equal(fit.held, Math.floor(samples.count * 0.1));
  assert.ok(fit.last.residual < 0.01, `the training residual settled at ${fit.last.residual}`);
  assert.ok(fit.last.heldOut < 0.02, `the held-out residual settled at ${fit.last.heldOut}`);
  assert.ok(trace[trace.length - 1].moved < samples.count * 0.01,
    "the greedy answer was still moving on the last sweep");

  const scratch = netScratch(CHAIN_LAYOUT);
  const input = new Float64Array(CHAIN_WIDTH);
  let worst = 0;
  for (let s = 0; s < CHAIN.length; s += 1) {
    chainFeatures(s, input, 0);
    const q = forward(CHAIN_LAYOUT, fit.weights, input, scratch);
    const live = [0, 1, 2].filter((a) => CHAIN[s][a] !== null);
    const best = live.reduce((a, b) => (q[b] > q[a] ? b : a));
    const star = live.reduce((a, b) => (Q[s][b] > Q[s][a] ? b : a));
    assert.equal(best, star, `state ${s}: the fit plays ${best} where the optimum is ${star}`);
    for (const a of live) worst = Math.max(worst, Math.abs(q[a] - Q[s][a]));
  }
  assert.ok(worst < 0.05, `the worst open value is ${worst.toFixed(4)} away from Q*`);
  // The mind reads the same argmax the check above took by hand, through the shipped picker.
  chainFeatures(0, input, 0);
  const q = forward(CHAIN_LAYOUT, fit.weights, input, scratch);
  assert.equal(pickOpenIn(["a", "b", "c"], q, ["a", "b", "c"]), "b", "the picker does not name the optimum");
  assert.equal(pickOpenIn(["a", "b", "c"], q, ["a", "c"]), "c", "the picker ignored a closed option's value");
});

// ------------------------------------------------------------------- the replay and the columns

test("the_replay_buffer_keeps_the_newest_decisions_and_cuts_at_a_run_boundary", () => {
  const samples = chainSamples(10, 11);
  assert.equal(samples.count, 30);
  assert.equal(tailOf(samples, 30), samples, "a buffer that fits is not copied");
  assert.equal(tailOf(samples, 999), samples);
  const tail = tailOf(samples, 7);
  assert.equal(tail.count, 6, "the cut did not move forward to the start of a run");
  assert.equal(tail.x.length, tail.count * CHAIN_WIDTH);
  assert.equal(tail.done[tail.count - 1], 1, "the buffer ends part way through a run");
  assert.equal(tail.kind, "style");
  // The rows kept are the last six of the original, column for column.
  for (let i = 0; i < tail.count; i += 1) {
    const j = samples.count - tail.count + i;
    assert.equal(tail.y[i], samples.y[j]);
    assert.equal(tail.seconds[i], samples.seconds[j]);
    assert.equal(tail.done[i], samples.done[j]);
  }
});

/**
 * The paired columns of a confirmation. `evaluate` runs the contenders in blocks, one block a
 * contender, in the same schedule order; row j of every block met the same body under the same
 * streams, so column k minus column l is a paired difference. A row that names neither side is a
 * scheduling mistake, and it is caught here rather than averaged.
 */
test("the_confirmation_columns_are_read_from_the_contenders_own_side_of_each_row", () => {
  const row = (left, right, winner, vitality) => ({
    left: { policy: left, vitality: vitality[0] }, right: { policy: right, vitality: vitality[1] }, winner,
  });
  const rows = [
    row("a", "golem-fencer", "left", [0.9, 0.4]),
    row("golem-fencer", "a", "left", [0.7, 0.2]),
    row("b", "golem-fencer", null, [0.5, 0.5]),
    row("golem-fencer", "b", "right", [0.1, 0.8]),
  ];
  const { per, points, bar } = columnsOf(rows, ["a", "b"]);
  assert.equal(per, 2);
  assert.deepEqual(points.a, [1, 0]);
  assert.deepEqual(points.b, [0.5, 1]);
  assert.deepEqual(bar.a.map((x) => Math.round(x * 10) / 10), [0.5, -0.5]);
  assert.deepEqual(bar.b.map((x) => Math.round(x * 10) / 10), [0, 0.7]);
  assert.throws(() => columnsOf(rows, ["a", "b", "c"]), /do not divide/);
  assert.throws(() => columnsOf(rows, ["a", "z"]), /names neither side/);
});

/** The shipped table loads, and with nothing fitted the greedy is the first open option. */
test("the_shipped_learner_table_loads_and_the_greedy_reads_the_open_mask", () => {
  const learner = golemLearner(SEED);
  assert.equal(learner.asks, 0);
  assert.equal(learner.explored, 0);
  assert.ok(learner.styled !== null, "the learner does not publish its executor for the decision log");
  assert.equal(learner.lastValues.length, STYLE_OPTIONS.length);
  const flat = new Float64Array(STYLE_OPTIONS.length);
  assert.equal(pickOpenIn(STYLE_OPTIONS, flat, ["parry", "cut", "hold"]), "hold",
    "a tie is not broken toward the first option in the vocabulary");
  assert.equal(pickOpenIn(STYLE_OPTIONS, flat, ["parry", "cut"]), "cut");
});

// ------------------------------------------------------------------------- the real round

/**
 * One round of the trainer on two workers: the current greedy collects against the league on
 * random pairs and against itself on mirrored ones, a fit is warm-started from the table it began
 * with, a confirmation rates it beside a shipped policy on the same schedule, and the module that
 * comes out is one the mind loads and the picker offers.
 *
 * The claim is the shape of what comes out and not the number, which four three-second bouts
 * cannot say anything about.
 */
test("one_round_of_the_trainer_on_two_workers_makes_a_module_the_picker_offers", { timeout: 300_000 }, async () => {
  const pool = buildPool({ seed: SEED, random: 0 }).filter((build) => build.name === "default" || build.name === "fists");
  assert.equal(pool.length, 2);
  const league = ["golem-fencer"];
  const start = Float64Array.from(LEARNER_WEIGHTS.weights);
  const samples = await collectRound({
    pool, weights: start, league, seed: SEED, bouts: 2, selfPlay: 2, workers: 2, cap: 3, explore: 0.3,
  });
  assert.equal(samples.kind, "style");
  assert.equal(samples.bouts, 4, "two league bouts and two mirrored self-play ones");
  assert.ok(samples.count > 0, "the learner was never asked");
  assert.equal(samples.width, STYLE_FEATURE_COUNT);
  assert.equal(samples.x.length, samples.count * STYLE_FEATURE_COUNT);
  assert.equal(samples.done.reduce((sum, d) => sum + d, 0), 6,
    "one run a recorded side: the learner alone in a league bout, both sides of a self-play one");
  for (let i = 0; i < samples.count; i += 1) {
    assert.ok((samples.open[i] >> samples.y[i] & 1) === 1, `decision ${i} took an option that was not open`);
  }

  const fit = fittedQ(samples, {
    layout: LEARNER_LAYOUT, seed: SEED, iterations: 2, epochs: 1, batch: 32, start,
  });
  assert.equal(fit.weights.length, netSize(LEARNER_LAYOUT));
  assert.ok(fit.weights.some((w) => w !== 0), "the fit moved nothing off the placeholder's zeros");
  const census = optionCensus(samples, fit.weights);
  assert.equal(census.length, STYLE_OPTIONS.length);
  assert.deepEqual(census.map((r) => r.option), Array.from(STYLE_OPTIONS));
  assert.equal(census.reduce((sum, r) => sum + r.taken, 0), samples.count);
  assert.equal(census.reduce((sum, r) => sum + r.greedy, 0), samples.count);

  const rated = await confirm({
    weights: fit.weights, league, pool, seed: SEED, bouts: 2, workers: 2, cap: 3, mirror: true,
    against: { fencer: { policy: "golem-fencer" } }, gauge: "fencer",
  });
  assert.deepEqual(rated.names, ["learner", "fencer"]);
  assert.equal(rated.per, 2);
  assert.ok(Number.isFinite(rated.gate.points) && Number.isFinite(rated.gate.bar));
  assert.equal(rated.results.learner.bouts, 2);

  const table = learnerTable(fit.weights, {
    seed: SEED, date: "2026-09-07", rounds: 1, iterations: 2, decisions: samples.count,
    bouts: samples.bouts, halfLife: 8, winBonus: 0, explore: 0.3,
    score: rated.results.learner.score, baselines: { fencer: rated.results.fencer.score },
  });
  const text = renderLearnerModule(table);
  assert.match(text, /GENERATED by scripts\/train-learner\.mjs/);
  assert.match(text, /Fitted 2026-09-07 from seed 20260910: 1 round\(s\)/);
  assert.match(text, /import type \{ LearnerWeights \}/, "a value import here would be a cycle");
  const literal = text.slice(text.indexOf("= ") + 2, text.lastIndexOf(";"));
  const parsed = JSON.parse(literal);
  assert.equal(checkLearnerWeights(parsed), parsed);
  assert.equal(parsed.weights.length, netSize(LEARNER_LAYOUT));
  const loaded = golemLearner(SEED, parsed);
  assert.equal(loaded.asks, 0);
  assert.ok(LEARNER_LEAGUE.includes("golem-fencer") && !LEARNER_LEAGUE.includes("golem-learner"),
    "a round collects against the hand-coded minds and not against itself by name");
  // The picker: the mind is a registered policy and builds from the name alone, which is what the
  // matchup screen and every tournament ask of it.
  const offered = POLICIES.find((policy) => policy.name === "golem-learner");
  assert.ok(offered !== undefined, "golem-learner is not among the policies the picker offers");
  assert.equal(offered.label, "Golem learner");
  assert.equal(policyMind("golem-learner", SEED).name, "golem-learner");
});
