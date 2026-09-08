// Train `golem-learner` by fitted Q-iteration on the decision log. Session 10 of the style set.
//
//   node scripts/train-learner.mjs --samples a.bin[,b.bin] [--out src/golem/learner-weights.ts]
//        [--seed 20260910] [--iterations 30] [--epochs 3] [--batch 128] [--rate 1e-3]
//        [--replay 600000] [--half-life 8] [--win-bonus 0] [--explore 0.1]
//        [--rounds 3] [--round-bouts 2048] [--self-play 512] [--confirm 1536]
//        [--workers 30] [--cap 60] [--log tournaments/learner.jsonl]
//
// **What is learned.** A value an option: what naming this option in this state is worth from
// here to the end of the bout, in bar units. The mind plays the best open one; nothing else about
// it differs from `golem-neural`, and everything that matters is in where the numbers come from.
//
// **Why fitted Q and not another search.** The matchup set's neural entry records the wall: one
// scalar a bout, sigma 0.032 points at 384 bouts, and an evolution strategy that could not move a
// confident imitation. Session 08 of this set replaced the signal rather than the optimiser --
// 253 decisions a side a bout, each paying the damage the two bars took until the next ask, and
// telescoping to the bar margin exactly. Fitted Q is what that signal is for: off-policy, so
// every style at explore 0.3 in the corpus is data; per decision, so the sample count is a
// thousand times the bout count; and with no teacher, so no ceiling at one.
//
// **The loop.** A fit is `iterations` sweeps. Each sweep freezes the current network as Q-minus,
// computes a target for every decision -- its own reward plus the duration-discounted best
// Q-minus at the decision that followed, nothing after the last -- and then runs `epochs` passes
// of minibatch Adam on the squared error at the taken option only. A round is a fit, then a
// tournament in which the new greedy plays the league and itself at `explore`, then a refit on
// the union of everything collected so far, capped at the newest `replay` decisions and warm
// started from the previous fit.
//
// **What is reported each sweep**, because a Q-iteration that is not converging says so long
// before the confirmation does: the Bellman residual on the training decisions and on a held-out
// tenth that no gradient ever saw, the mean value the network puts on the first decision of a
// bout, and how many decisions changed their greedy answer since the previous sweep.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { LEARNER_LAYOUT, LEARNER_VERSION, checkLearnerWeights } from "../src/golem/learner.ts";
import { forward, initWeights, netScratch, netSize, qBackward } from "../src/golem/neural-net.ts";
import { STYLE_FEATURES_VERSION } from "../src/golem/style-features.ts";
import { STYLE_OPTIONS } from "../src/golem/tactics-v3.ts";
import { mulberry32 } from "../src/rng.ts";
import { mergeSamples, readSamples, writeSamples } from "./decision-log.mjs";
import { buildPool, runJobs, scheduleJobs } from "./tournament.mjs";
import { evaluate } from "./tune.mjs";

/** The nine hand-coded minds a round collects against, and the confirmation rates on. */
export const LEARNER_LEAGUE = Object.freeze([
  "golem-duelist", "golem-fencer", "golem-planner", "golem-champion", "golem-neural",
  "golem-form", "golem-skirmisher", "golem-guardian", "golem-brawler",
]);

const round5 = (x) => Math.round(x * 1e5) / 1e5;
const round4 = (x) => Math.round(x * 1e4) / 1e4;

// ------------------------------------------------------------------------------- the targets

/**
 * The Bellman target for every decision, against a frozen network.
 *
 * `target[i] = r[i] + gamma[i] * max over the options open at i+1 of Q(x[i+1])`, and on the last
 * decision of a side the bootstrap is dropped: there is no state after the bout.
 *
 * **The discount is by duration and not by step.** `gamma = 2^(-seconds / halfLife)`, so a strike
 * that occupies six hold-lengths of the bout is discounted six holds' worth. A per-step discount
 * would pay a mind for taking many short decisions, which is exactly the flail this set exists to
 * remove; the semi-Markov form is what makes a slow committed act comparable with a fast one.
 *
 * **The terminal bonus is on the sign of the side's own bar.** The plan asks for a bonus "on the
 * bout's result", and the samples file has no winner column -- the format was frozen in Session
 * 08 and the corpus on disk cost half an hour of the host -- so what is available is the sum of
 * the side's own rewards, which telescopes to its bar margin exactly. Its sign is *not* the
 * recorded winner: a bout is also won by a kill. At `winBonus` 0, which is what ships, the two
 * definitions cannot differ; a sweep off zero is measuring the bar's sign and the entry says so.
 *
 * Pure, and the network is read and never written, so a caller may hand it the previous
 * iteration's weights while training the next.
 */
export function bellmanTargets(samples, weights, { layout = LEARNER_LAYOUT, halfLife = 8, winBonus = 0 } = {}) {
  if ((samples.kind ?? "style") !== "style") {
    throw new Error(`these are ${samples.kind} samples; the learner is fitted on the third executor's columns`);
  }
  const n = samples.count;
  const width = samples.width;
  const targets = new Float64Array(n);
  const scratch = netScratch(layout);
  const input = new Float64Array(width);
  const outputs = layout.outputs;
  // The reward, and the running sum of each side's rewards so the last decision can be paid a
  // bonus on the sign of what the side ended up with.
  const reward = new Float64Array(n);
  let run = 0;
  const bonus = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    reward[i] = samples.dealt[i] - samples.taken[i];
    run += reward[i];
    if (samples.done[i]) {
      bonus[i] = winBonus === 0 ? 0 : winBonus * Math.sign(run);
      run = 0;
    }
  }
  // One forward a decision that follows another, used as the bootstrap of the one before it.
  for (let j = 0; j < n; j += 1) {
    const previous = j - 1;
    if (previous < 0 || samples.done[previous]) continue;
    for (let k = 0; k < width; k += 1) input[k] = samples.x[j * width + k];
    const q = forward(layout, weights, input, scratch);
    const open = samples.open[j];
    let best = Number.NEGATIVE_INFINITY;
    for (let a = 0; a < outputs; a += 1) if ((open >> a & 1) === 1 && q[a] > best) best = q[a];
    if (best === Number.NEGATIVE_INFINITY) best = 0;
    targets[previous] = reward[previous] + Math.pow(2, -samples.seconds[previous] / halfLife) * best;
  }
  for (let i = 0; i < n; i += 1) if (samples.done[i]) targets[i] = reward[i] + bonus[i];
  return targets;
}

// ----------------------------------------------------------------------------------- the fit

const ADAM = Object.freeze({ beta1: 0.9, beta2: 0.999, eps: 1e-8 });

/**
 * Fitted Q-iteration over a set of samples.
 *
 * `iterations` sweeps; each freezes the network, takes a target for every decision against that
 * frozen copy, and runs `epochs` passes of minibatch Adam on the squared error at the taken
 * option. Warm started from `start` when one is given, which is what a round after the first
 * does: the targets move because Q-minus moved, not because the weights were thrown away.
 *
 * `holdOut` decisions take no gradient and are scored anyway, which is the only honest read of
 * whether a falling training residual is a fit or a memorisation. They are drawn by a shuffle of
 * the whole set rather than by taking the last tenth of the file, because the file is ordered by
 * bout and by side and its last tenth is a handful of matchups.
 */
export function fittedQ(samples, {
  layout = LEARNER_LAYOUT, seed, iterations = 30, epochs = 3, batch = 128, rate = 1e-3,
  halfLife = 8, winBonus = 0, holdOut = 0.1, start = null, onIteration = null,
}) {
  if ((samples.kind ?? "style") !== "style") {
    throw new Error(`these are ${samples.kind} samples; the learner is fitted on the third executor's columns`);
  }
  const size = netSize(layout);
  const weights = start === null ? initWeights(layout, seed) : Float64Array.from(start);
  if (weights.length !== size) throw new Error(`the start has ${weights.length} weights; the layout wants ${size}`);
  const width = samples.width;
  const random = mulberry32((seed ^ 0x1ea27) >>> 0);
  const order = Array.from({ length: samples.count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const held = Math.floor(samples.count * holdOut);
  const test = order.slice(0, held);
  const train = order.slice(held);
  const scratch = netScratch(layout);
  const input = new Float64Array(width);
  const delta = new Float64Array(layout.outputs);
  const grad = new Float64Array(size);
  const m = new Float64Array(size);
  const v = new Float64Array(size);
  let step = 0;
  const load = (i) => {
    for (let k = 0; k < width; k += 1) input[k] = samples.x[i * width + k];
    return input;
  };
  // The greedy answer at every decision, so a sweep can say how many of them moved.
  const greedy = new Uint8Array(samples.count).fill(255);
  const isTest = new Uint8Array(samples.count);
  for (const i of test) isTest[i] = 1;
  let rootCount = 0;
  for (let i = 0; i < samples.count; i += 1) if (i === 0 || samples.done[i - 1]) rootCount += 1;
  // One forward a decision, and every column of the read-out taken off it: the residual split by
  // whether a gradient ever saw the row, the greedy answer so the next sweep can count what moved,
  // and the value the network puts on a bout's first decision.
  const readOut = (targets) => {
    let trainResidual = 0;
    let testResidual = 0;
    let moved = 0;
    let rootQ = 0;
    for (let i = 0; i < samples.count; i += 1) {
      const q = forward(layout, weights, load(i), scratch);
      const error = q[samples.y[i]] - targets[i];
      if (isTest[i]) testResidual += error * error; else trainResidual += error * error;
      const open = samples.open[i];
      let best = -1;
      for (let a = 0; a < layout.outputs; a += 1) if ((open >> a & 1) === 1 && (best < 0 || q[a] > q[best])) best = a;
      if (greedy[i] !== 255 && greedy[i] !== best) moved += 1;
      greedy[i] = best < 0 ? 254 : best;
      if (i === 0 || samples.done[i - 1]) rootQ += best < 0 ? 0 : q[best];
    }
    return {
      residual: train.length === 0 ? 0 : trainResidual / train.length,
      heldOut: test.length === 0 ? 0 : testResidual / test.length,
      rootQ: rootCount === 0 ? 0 : rootQ / rootCount,
      moved,
    };
  };
  let last = null;
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const started = Date.now();
    const targets = bellmanTargets(samples, weights, { layout, halfLife, winBonus });
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
      for (let i = train.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [train[i], train[j]] = [train[j], train[i]];
      }
      for (let at = 0; at < train.length; at += batch) {
        const end = Math.min(train.length, at + batch);
        grad.fill(0);
        for (let n = at; n < end; n += 1) {
          const i = train[n];
          forward(layout, weights, load(i), scratch);
          qBackward(layout, weights, input, scratch, samples.y[i], targets[i], grad, delta);
        }
        const scale = 1 / (end - at);
        step += 1;
        const c1 = 1 - ADAM.beta1 ** step;
        const c2 = 1 - ADAM.beta2 ** step;
        for (let k = 0; k < size; k += 1) {
          const g = grad[k] * scale;
          m[k] = ADAM.beta1 * m[k] + (1 - ADAM.beta1) * g;
          v[k] = ADAM.beta2 * v[k] + (1 - ADAM.beta2) * g * g;
          weights[k] -= rate * (m[k] / c1) / (Math.sqrt(v[k] / c2) + ADAM.eps);
        }
      }
    }
    last = { iteration, ...readOut(targets), seconds: (Date.now() - started) / 1000 };
    onIteration?.(last);
  }
  return { weights, iterations, held, decisions: samples.count, last };
}

// ------------------------------------------------------------------------------ a round

/**
 * The newest `cap` decisions, cut back to a run boundary.
 *
 * A replay buffer that kept everything would spend a round's fit on the corpus the styles wrote
 * and hardly any of it on what the learner has since done; capping it is the plan's rule. The cut
 * is moved forward to the first decision that starts a side's run so that no run in the buffer is
 * missing its opening -- the arithmetic would survive a half run, since a cut row simply becomes a
 * root, but the terminal bonus would then be paid on part of a bar.
 */
export function tailOf(samples, cap) {
  if (!Number.isFinite(cap) || cap <= 0 || samples.count <= cap) return samples;
  let start = samples.count - cap;
  while (start < samples.count && !(start === 0 || samples.done[start - 1] === 1)) start += 1;
  const width = samples.width;
  const count = samples.count - start;
  const out = { kind: samples.kind, count, bouts: samples.bouts, width };
  out.x = samples.x.slice(start * width, samples.count * width);
  for (const name of ["y", "open", "dealt", "taken", "seconds", "done"]) out[name] = samples[name].slice(start);
  return out;
}

/**
 * One collection: the current greedy, at `explore`, against the league on random pairs and
 * against itself on mirrored ones.
 *
 * **Both pools, in one collection, on purpose.** The league bouts are where the learner meets
 * everything that ships, on bodies drawn apart, which is the pool it is confirmed on; the
 * self-play bouts are mirrored, which is the only arrangement in which what differs across the
 * bout is a choice rather than an arm, and they are the only rows in which the learner is on both
 * sides of the answer. Session 09's entry recorded that a mirrored bout is one of ten diagonal
 * cells; a learner that only ever saw random pairs would never be asked what to do against its
 * own reach.
 *
 * The two are scheduled apart and their jobs concatenated, because `scheduleJobs` walks one cycle
 * of pairings under one seed and a self-play cycle is not a league cycle.
 */
export async function collectRound({
  pool, weights, league = LEARNER_LEAGUE, seed, bouts, selfPlay, workers, cap, explore = 0.1,
  name = "learner", onProgress = null,
}) {
  const contenders = { [name]: { q: Array.from(weights), explore } };
  const jobs = [];
  if (bouts > 0 && league.length > 0) {
    const scheduled = scheduleJobs({
      pool, policies: [name, ...league], pairings: Math.ceil(bouts / 2 / league.length) * league.length,
      seed, cap, mirror: false, contenders, pairs: league.map((policy) => [name, policy]),
    });
    for (const job of scheduled) jobs.push({ ...job, index: jobs.length });
  }
  if (selfPlay > 0) {
    const scheduled = scheduleJobs({
      pool, policies: [name], pairings: Math.ceil(selfPlay / 2),
      seed: (seed ^ 0x5e1f) >>> 0, cap, mirror: true, contenders, pairs: [[name, name]],
    });
    for (const job of scheduled) jobs.push({ ...job, index: jobs.length });
  }
  const rows = await runJobs(jobs, { workers, contenders, record: [name], onProgress });
  const parts = [];
  for (const row of rows) {
    for (const side of ["left", "right"]) {
      const pack = row?.samples?.[side];
      if (!pack || pack.y.length === 0) continue;
      if (pack.kind !== "style") throw new Error(`a round collected ${pack.kind} samples; the learner reads the style columns`);
      parts.push(pack);
    }
  }
  return mergeSamples(parts, { kind: "style", bouts: rows.length });
}

// ------------------------------------------------------------------------------ the confirmation

/** The default opposition a confirmation reports against: the best style, the fencer, the champion. */
export const CONFIRM_AGAINST = Object.freeze({
  brawler: { policy: "golem-brawler" },
  fencer: { policy: "golem-fencer" },
  champion: { policy: "golem-champion" },
});

/**
 * One column a contender, of that contender's own side of each bout, in schedule order.
 *
 * `evaluate` schedules every contender over the same pairings from the same seed, so column k's
 * row j met the same body under the same streams as column l's row j: the difference of two
 * columns is a paired difference and is a much tighter number than the difference of two means.
 * The contender is `left` on the even row of a pairing and `right` on the swapped one, and a row
 * that names it on neither side is a scheduling mistake rather than a number to average.
 */
export function columnsOf(rows, names) {
  const per = rows.length / names.length;
  if (!Number.isInteger(per)) throw new Error(`${rows.length} rows do not divide among ${names.length} contenders`);
  const points = {};
  const bar = {};
  for (let k = 0; k < names.length; k += 1) {
    const name = names[k];
    points[name] = [];
    bar[name] = [];
    for (let i = 0; i < per; i += 1) {
      const row = rows[k * per + i];
      const me = row.left.policy === name ? "left" : "right";
      if (row[me].policy !== name) throw new Error(`row ${i} of the ${name} block names neither side`);
      const them = me === "left" ? "right" : "left";
      points[name].push(row.winner === me ? 1 : row.winner === null ? 0.5 : 0);
      bar[name].push(row[me].vitality - row[them].vitality);
    }
  }
  return { per, points, bar };
}

/** Mean and standard error of a column. */
export function meanOf(xs) { return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length; }
export function semOf(xs) {
  if (xs.length < 2) return 0;
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

/**
 * The confirmation: the fit against the opposition on one pool of one held-out seed.
 *
 * The learner plays at explore 0 -- a confirmation rates what would ship, and what ships is the
 * greedy -- and every other contender is a shipped policy by name, so the row a policy makes here
 * is the row it makes in the league. Returns the summary rows, the paired columns, and the one
 * difference the gate is written on.
 */
export async function confirm({
  weights, league = LEARNER_LEAGUE, against = CONFIRM_AGAINST, pool, seed, bouts, workers, cap,
  mirror = false, name = "learner", gauge = "brawler", onProgress = null,
}) {
  const contenders = { [name]: { q: Array.from(weights), explore: 0 }, ...against };
  const names = Object.keys(contenders);
  const { rows, results } = await evaluate({ contenders, league, pool, seed, bouts, workers, cap, mirror, onProgress });
  const { per, points, bar } = columnsOf(rows, names);
  const differences = {};
  for (const other of names) {
    if (other === name) continue;
    const d = points[name].map((p, i) => p - points[other][i]);
    const b = bar[name].map((p, i) => p - bar[other][i]);
    differences[other] = { points: meanOf(d), pointsSem: semOf(d), bar: meanOf(b), barSem: semOf(b) };
  }
  return { mirror, per, names, results, points, bar, differences, gauge, gate: differences[gauge] ?? null };
}

// ---------------------------------------------------------------------------------- the module

/**
 * The module text: a header that says where the numbers came from, then the literal.
 *
 * Sixteen numbers a line, as `renderNeuralModule` writes its own, so that a refit diffs by row
 * rather than as one very long line. The import is type-only and deliberately so:
 * `learner.ts` imports this file for its default table, so a value imported back the other way
 * is a cycle and the shipped mind would read an uninitialised layout.
 */
export function renderLearnerModule(table) {
  checkLearnerWeights(table);
  const rows = [];
  for (let i = 0; i < table.weights.length; i += 16) rows.push("  " + table.weights.slice(i, i + 16).join(","));
  const body = "\"weights\":[\n" + rows.join(",\n") + "\n]";
  const beaten = Object.entries(table.baselines)
    .map(([name, score]) => `${name} ${score.toFixed(3)}`).join(", ");
  return [
    "// GENERATED by scripts/train-learner.mjs -- do not edit; regenerate.",
    "//",
    `// Learner weights, version ${table.version} over feature version ${table.features}, ` +
    `${table.weights.length} numbers laid out ${JSON.stringify(table.layout)}.`,
    table.date
      ? `// Fitted ${table.date} from seed ${table.seed}: ${table.rounds} round(s) of collect-and-refit, ` +
        `${table.iterations} Q-iterations a fit, on ${table.decisions} decisions from ${table.bouts} bouts, ` +
        `collected at explore ${table.explore}; half-life ${table.halfLife} s, win bonus ${table.winBonus}. ` +
        `Confirmed ${table.score.toFixed(3)} points a bout against ${beaten || "nothing"} on the held-out seed.`
      : "// Unfitted: zero weights, so that the mind loads; the trainer overwrites this file.",
    "//",
    "// What a value means is in src/golem/learner.ts, what the columns are in",
    "// src/golem/style-features.ts, and a build that reads another version refuses this file by name.",
    "import type { LearnerWeights } from \"./learner.ts\";",
    "",
    `export const LEARNER_WEIGHTS: LearnerWeights = ${JSON.stringify({ ...table, weights: [] }).replace("\"weights\":[]", body)};`,
    "",
  ].join("\n");
}

/** The last weights a run's log carried, so a long fit can be picked up where it stopped. */
export function readFitWeights(path) {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  let weights = null;
  for (const line of lines) if (line.type === "fit") weights = line.weights;
  if (weights === null) throw new Error(`${path} has no fit line to start from`);
  return Float64Array.from(weights);
}

/** The table the module is rendered from, with everything the header has to name. */
export function learnerTable(weights, {
  seed, date, rounds, iterations, decisions, bouts, halfLife, winBonus, explore, score, baselines,
}) {
  return {
    version: LEARNER_VERSION, features: STYLE_FEATURES_VERSION, layout: LEARNER_LAYOUT,
    seed, date, rounds, iterations, decisions, bouts, halfLife, winBonus, explore,
    score: round4(score), baselines: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, round4(v)])),
    weights: Array.from(weights, round5),
  };
}

/**
 * What the greedy names over a set of decisions, and what the log recorded, side by side.
 *
 * A fitted Q that has collapsed onto two options says so here long before a tournament does, and
 * an option the corpus never carries is the other thing this column shows: a value fitted from no
 * rows at all is the initialisation, and the mind would play it anyway if it happened to be high.
 */
export function optionCensus(samples, weights, layout = LEARNER_LAYOUT) {
  const scratch = netScratch(layout);
  const input = new Float64Array(samples.width);
  const greedy = new Array(layout.outputs).fill(0);
  const taken = new Array(layout.outputs).fill(0);
  const open = new Array(layout.outputs).fill(0);
  for (let i = 0; i < samples.count; i += 1) {
    for (let k = 0; k < samples.width; k += 1) input[k] = samples.x[i * samples.width + k];
    const q = forward(layout, weights, input, scratch);
    const mask = samples.open[i];
    let best = -1;
    for (let a = 0; a < layout.outputs; a += 1) {
      if ((mask >> a & 1) !== 1) continue;
      open[a] += 1;
      if (best < 0 || q[a] > q[best]) best = a;
    }
    if (best >= 0) greedy[best] += 1;
    taken[samples.y[i]] += 1;
  }
  return STYLE_OPTIONS.map((name, a) => ({ option: name, greedy: greedy[a], taken: taken[a], open: open[a] }));
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const has = (name) => argv.includes(`--${name}`);
  const seed = Number(flag("seed", 20260910)) >>> 0;
  const iterations = Math.max(1, Number(flag("iterations", 30)));
  const epochs = Math.max(1, Number(flag("epochs", 3)));
  const batch = Math.max(1, Number(flag("batch", 128)));
  const rate = Number(flag("rate", 1e-3));
  const replay = Math.max(1, Number(flag("replay", 600000)));
  const halfLife = Number(flag("half-life", 8));
  const winBonus = Number(flag("win-bonus", 0));
  const explore = Number(flag("explore", 0.1));
  const rounds = Math.max(0, Number(flag("rounds", 3)));
  const roundBouts = Math.max(0, Number(flag("round-bouts", 2048)));
  const selfPlay = Math.max(0, Number(flag("self-play", 512)));
  const confirmBouts = Math.max(0, Number(flag("confirm", 1536)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  const cap = Number(flag("cap", 60));
  const random = Math.max(0, Number(flag("random", 60)));
  const league = flag("league", LEARNER_LEAGUE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const samplesPaths = flag("samples", "").split(",").map((s) => s.trim()).filter(Boolean);
  const startFrom = flag("start", null);
  const write = flag("out", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  // Concatenated rather than interpolated: a backticked span that looks like a path is a
  // durable reference to the documentation tests, and this one names a file that never exists.
  const out = resolve(flag("log", "tournaments/learner-" + stamp + "-" + seed + ".jsonl"));
  if (samplesPaths.length === 0) throw new Error("--samples names the decision log(s) the first fit is made from");
  if (existsSync(out)) throw new Error(`${out} exists; a run does not append to another run's log`);
  mkdirSync(dirname(out), { recursive: true });
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });
  const progress = (label) => ({ done, total, seconds }) => {
    if (done % 512 === 0 || done === total) console.log(`  ${label}: ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
  };

  const date = new Date().toISOString().slice(0, 10);
  const parts = samplesPaths.map((path) => readSamples(path));
  const corpus = parts.length === 1 ? parts[0] : mergeSamples(parts, {
    kind: "style", bouts: parts.reduce((sum, p) => sum + p.bouts, 0),
  });
  let buffer = tailOf(corpus, replay);
  let bouts = corpus.bouts;
  log({
    type: "header", seed, date, layout: LEARNER_LAYOUT, features: STYLE_FEATURES_VERSION, league,
    samples: samplesPaths, corpus: corpus.count, corpusBouts: corpus.bouts,
    iterations, epochs, batch, rate, replay, halfLife, winBonus, explore,
    rounds, roundBouts, selfPlay, confirm: confirmBouts, workers, cap, random,
  });
  console.log(`learner: seed ${seed}, ${corpus.count} decisions from ${corpus.bouts} bouts, `
    + `${buffer.count} in the replay, ${workers} workers`);

  let weights = null;
  const fit = (label, samples, start) => {
    const started = Date.now();
    const result = fittedQ(samples, {
      layout: LEARNER_LAYOUT, seed, iterations, epochs, batch, rate, halfLife, winBonus, start,
      onIteration: (it) => {
        log({ type: "iteration", label, ...it, residual: round5(it.residual), heldOut: round5(it.heldOut), rootQ: round5(it.rootQ) });
        console.log(`  ${label} ${String(it.iteration).padStart(2)}: residual ${it.residual.toFixed(5)} `
          + `held-out ${it.heldOut.toFixed(5)} root Q ${it.rootQ >= 0 ? "+" : ""}${it.rootQ.toFixed(4)} `
          + `moved ${it.moved} (${(it.moved / Math.max(1, samples.count) * 100).toFixed(1)} %) ${it.seconds.toFixed(0)} s`);
      },
    });
    console.log(`  ${label}: ${result.decisions} decisions, ${result.held} held out, `
      + `${((Date.now() - started) / 60000).toFixed(1)} min`);
    log({ type: "fit", label, decisions: result.decisions, held: result.held, weights: Array.from(result.weights, round5) });
    return result.weights;
  };

  if (startFrom !== null) {
    weights = readFitWeights(startFrom);
    console.log(`  starting from the last fit in ${startFrom}`);
  } else {
    weights = fit("fit 0", buffer, null);
  }
  const census = (round) => {
    const rows = optionCensus(buffer, weights);
    for (const row of rows) log({ type: "census", round, ...row });
    console.log(`  greedy/taken/open by option after ${round === 0 ? "the first fit" : `round ${round}`}:`);
    console.log("    " + rows.map((r) => `${r.option} ${r.greedy}/${r.taken}/${r.open}`).join("  "));
  };
  census(0);

  for (let round = 1; round <= rounds; round += 1) {
    const started = Date.now();
    const pool = buildPool({ seed: (seed ^ round) >>> 0, random });
    const fresh = await collectRound({
      pool, weights, league, seed: (seed + round * 7919) >>> 0, bouts: roundBouts, selfPlay,
      workers, cap, explore, onProgress: progress(`round ${round}`),
    });
    bouts += fresh.bouts;
    console.log(`  round ${round}: ${fresh.count} decisions from ${fresh.bouts} bouts in `
      + `${((Date.now() - started) / 60000).toFixed(1)} min`);
    log({ type: "round", round, decisions: fresh.count, bouts: fresh.bouts, seconds: (Date.now() - started) / 1000 });
    buffer = tailOf(mergeSamples([buffer, fresh], { kind: "style", bouts: buffer.bouts + fresh.bouts }), replay);
    weights = fit(`round ${round}`, buffer, weights);
    census(round);
  }

  const baselines = {};
  let score = 0;
  if (confirmBouts > 0) {
    const cseed = (seed ^ 0xc0f1c0f1) >>> 0;
    for (const mirror of [false, true]) {
      const pool = buildPool({ seed: cseed, random: mirror ? 40 : random });
      const started = Date.now();
      const result = await confirm({
        weights, league, pool, seed: cseed, bouts: Math.max(2, Math.ceil(confirmBouts / league.length / 2) * 2),
        workers, cap, mirror, onProgress: progress(mirror ? "confirm mirrored" : "confirm random"),
      });
      const label = mirror ? "mirrored" : "random pairs";
      console.log(`\n=== confirmation on ${label}: ${result.per} bouts a contender, `
        + `${((Date.now() - started) / 60000).toFixed(1)} min ===`);
      for (const name of result.names) {
        const r = result.results[name];
        console.log(`  ${name.padEnd(10)} points ${meanOf(result.points[name]).toFixed(4)} +- ${semOf(result.points[name]).toFixed(4)}  `
          + `bar ${meanOf(result.bar[name]) >= 0 ? "+" : ""}${meanOf(result.bar[name]).toFixed(4)}  `
          + `w/d/l ${r.wins}/${r.draws}/${r.losses}  strokes ${(r.strokes ?? 0).toFixed(1)} `
          + `dmg/stroke ${(r.strokeDamage ?? 0).toFixed(2)} commit ${((r.committedFraction ?? 0) * 100).toFixed(1)}% `
          + `clinch ${(r.clinchSeconds ?? 0).toFixed(1)} idle ${(r.idleTravelMetres ?? 0).toFixed(1)}`);
      }
      console.log("  paired differences, common random numbers:");
      for (const [other, d] of Object.entries(result.differences)) {
        console.log(`    learner - ${other.padEnd(9)} points ${d.points >= 0 ? "+" : ""}${d.points.toFixed(4)} `
          + `+- ${d.pointsSem.toFixed(4)}  bar ${d.bar >= 0 ? "+" : ""}${d.bar.toFixed(4)} +- ${d.barSem.toFixed(4)}`);
      }
      log({
        type: "confirmation", pool: label, seed: cseed, per: result.per,
        results: Object.fromEntries(Object.entries(result.results).map(([k, r]) => [k, { score: round4(r.score), margin: round4(r.margin), bouts: r.bouts }])),
        differences: Object.fromEntries(Object.entries(result.differences).map(([k, d]) => [k, { points: round4(d.points), pointsSem: round4(d.pointsSem), bar: round4(d.bar), barSem: round4(d.barSem) }])),
        structural: result.results,
      });
      if (!mirror) {
        score = result.results.learner.score;
        for (const name of result.names) if (name !== "learner") baselines[name] = result.results[name].score;
      }
    }
  }

  const table = learnerTable(weights, {
    seed, date, rounds, iterations, decisions: buffer.count, bouts, halfLife, winBonus, explore,
    score, baselines,
  });
  log({ type: "weights", table });
  const text = renderLearnerModule(table);
  if (write !== null) {
    writeFileSync(resolve(write), text);
    console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`log: ${out}`);
}
