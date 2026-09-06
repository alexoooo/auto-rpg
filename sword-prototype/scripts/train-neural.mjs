// Train the neural contender, `golem-neural`: fit the network to the champion's choices, then
// search the weights by an evolution strategy on the tournament harness. Session 08 of the
// matchup set.
//
//   node scripts/train-neural.mjs --seed 20260908 --collect 128 --epochs 30 --generations 12
//                                 --population 16 --bouts 32 --confirm 128 --workers 32
//                                 [--league golem-duelist,golem-fencer,golem-planner]
//                                 [--teacher golem-champion] [--samples tournaments/samples.bin]
//                                 --out tournaments/neural.jsonl [--write src/golem/neural-weights.ts]
//
// **What is learned.** The network is a director over the fencer's executor (Session 06's
// hook): at every ask it reads `neuralFeatures` -- the options open, the reading, the view --
// and names one of the open options. Its weights are the whole of what this script moves; the
// fencer's table under it is the shipped one.
//
// **Two stages, and why the first.** An evolution strategy from Glorot-random weights starts
// from a director that answers at random, which is far below the duelist, and a search whose
// fitness has a σ of a few hundredths of the bar at a few hundred bouts (Session 07) climbs out
// of that hole slowly if at all. So the first stage is imitation: the teacher (the champion by
// default) plays the league on a logged run with a hook on its director, every ask is a sample
// of features, open options and the option it took, and the network is fitted to those by
// minibatch Adam on the masked cross-entropy, a tenth held out to report an accuracy that is
// not the training set's. The second stage is the search: OpenAI-style natural evolution with
// antithetic pairs, rank-shaped utilities and a normalised step, the mean and every
// perturbation scored together on one seed against the frozen league on the mirrored pool by
// the tuner's `evaluate`, so that everything the search compares met the same bodies with the
// same streams. The plan named ES first and policy gradient as the fallback; imitation before
// ES is a departure recorded in the plan file, and it is what makes the second stage a search
// near the champion rather than a search for it.
//
// **What is shipped, and what is claimed.** Three candidates are confirmed on a seed the search
// never saw against the league, beside the champion itself on the same seed: the imitated
// weights, the search's final mean, and the mean of the generation that scored highest. The
// one confirming highest is written; the table carries all three confirmations and the
// champion's, so that a reader sees whether the search added anything to the imitation and
// whether either is near the champion. Picking the best of three on the confirmation seed is
// a small winner's curse of its own, and the measurements entry says so.
//
// **What is written.** A log of JSON lines under `tournaments/` (gitignored); the samples, as a
// binary file beside it when `--samples` names one (reused on a later run instead of
// re-collected); and the weights module, versioned by build and by feature version, refused on
// load by either.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DUEL_OPTIONS } from "../src/golem/duel-model.ts";
import { FEATURE_COUNT, NEURAL_FEATURES_VERSION } from "../src/golem/neural-features.ts";
import { backward, forward, initWeights, netScratch, netSize } from "../src/golem/neural-net.ts";
import { NEURAL_LAYOUT, NEURAL_VERSION, checkNeuralWeights } from "../src/golem/neural.ts";
import { mulberry32 } from "../src/rng.ts";
import { buildPool, runJobs, scheduleJobs } from "./tournament.mjs";
import { DEFAULT_LEAGUE, evaluate } from "./tune.mjs";

export const DEFAULT_TEACHER = "golem-champion";

const round5 = (x) => Math.round(x * 1e5) / 1e5;
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** A weights table over a vector, with the header a run fills in. */
export function neuralTable(weights, over = {}) {
  return {
    version: NEURAL_VERSION, features: NEURAL_FEATURES_VERSION,
    layout: { inputs: NEURAL_LAYOUT.inputs, hidden: [...NEURAL_LAYOUT.hidden], outputs: NEURAL_LAYOUT.outputs },
    seed: 0, date: "", teacher: "", imitation: { samples: 0, accuracy: 0 },
    generations: 0, bouts: 0, score: 0, baseline: 0, league: [],
    weights: Array.from(weights, round5),
    ...over,
  };
}

// ------------------------------------------------------------------------------- collection

/**
 * The teacher plays the league on the mirrored pool with a hook on its director; every ask is
 * a sample. Returns the samples packed: `x` is `count × FEATURE_COUNT` floats, `y` the index
 * of the option taken, `open` a bitmask over `DUEL_OPTIONS` of what was open.
 */
export async function collect({ pool, teacher, league, seed, bouts, workers, cap, onProgress = null }) {
  const jobs = scheduleJobs({
    pool, policies: [teacher, ...league], pairings: Math.ceil(bouts / 2) * league.length, seed, cap,
    mirror: true, pairs: league.map((policy) => [teacher, policy]),
  });
  const rows = await runJobs(jobs, { workers, record: teacher, onProgress });
  const parts = [];
  let count = 0;
  for (const row of rows) {
    for (const side of ["left", "right"]) {
      const samples = row.samples?.[side];
      if (!samples || samples.y.length === 0) continue;
      parts.push(samples);
      count += samples.y.length;
    }
  }
  const x = new Float32Array(count * FEATURE_COUNT);
  const y = new Uint8Array(count);
  const open = new Uint8Array(count);
  let at = 0;
  for (const part of parts) {
    x.set(part.x, at * FEATURE_COUNT);
    y.set(part.y, at);
    open.set(part.open, at);
    at += part.y.length;
  }
  return { x, y, open, count, bouts: rows.length };
}

/** The samples as one binary file: a little JSON header, then the three arrays. */
export function writeSamples(path, samples) {
  const header = Buffer.from(JSON.stringify({ count: samples.count, width: FEATURE_COUNT, features: NEURAL_FEATURES_VERSION, bouts: samples.bouts }));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([
    length, header,
    Buffer.from(samples.x.buffer, samples.x.byteOffset, samples.x.byteLength),
    Buffer.from(samples.y.buffer, samples.y.byteOffset, samples.y.byteLength),
    Buffer.from(samples.open.buffer, samples.open.byteOffset, samples.open.byteLength),
  ]));
}

export function readSamples(path) {
  const file = readFileSync(path);
  const length = file.readUInt32LE(0);
  const header = JSON.parse(file.subarray(4, 4 + length).toString());
  if (header.width !== FEATURE_COUNT || header.features !== NEURAL_FEATURES_VERSION) {
    throw new Error(`${path} holds ${header.width}-wide samples of feature version ${header.features}; this build reads ${FEATURE_COUNT} of version ${NEURAL_FEATURES_VERSION}`);
  }
  let at = 4 + length;
  const x = new Float32Array(header.count * FEATURE_COUNT);
  Buffer.from(x.buffer).set(file.subarray(at, at + x.byteLength));
  at += x.byteLength;
  const y = Uint8Array.from(file.subarray(at, at + header.count));
  at += header.count;
  const open = Uint8Array.from(file.subarray(at, at + header.count));
  return { x, y, open, count: header.count, bouts: header.bouts };
}

// -------------------------------------------------------------------------------- imitation

const openOf = (bits) => DUEL_OPTIONS.map((_, j) => (bits >> j & 1) === 1);

/**
 * Fit the network to the samples: minibatch Adam on the masked cross-entropy, from seeded
 * initial weights, a fraction held out. Returns the weights and how well they agree with the
 * teacher on the held-out samples.
 */
export function imitate(samples, { seed, epochs, batch = 64, rate = 1e-3, holdOut = 0.1, onEpoch = null }) {
  const layout = NEURAL_LAYOUT;
  const weights = initWeights(layout, seed);
  const size = weights.length;
  const random = mulberry32((seed ^ 0x1e11) >>> 0);
  const order = Array.from({ length: samples.count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const held = Math.floor(samples.count * holdOut);
  const test = order.slice(0, held);
  const train = order.slice(held);
  const scratch = netScratch(layout);
  const input = new Float64Array(FEATURE_COUNT);
  const probabilities = new Float64Array(layout.outputs);
  const grad = new Float64Array(size);
  const m = new Float64Array(size);
  const v = new Float64Array(size);
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  let step = 0;
  const load = (i) => {
    for (let k = 0; k < FEATURE_COUNT; k += 1) input[k] = samples.x[i * FEATURE_COUNT + k];
    return input;
  };
  const accuracy = (indices) => {
    if (indices.length === 0) return 0;
    let right = 0;
    for (const i of indices) {
      const logits = forward(layout, weights, load(i), scratch);
      const open = openOf(samples.open[i]);
      let best = -1;
      for (let j = 0; j < logits.length; j += 1) if (open[j] && (best < 0 || logits[j] > logits[best])) best = j;
      if (best === samples.y[i]) right += 1;
    }
    return right / indices.length;
  };
  let loss = 0;
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    for (let i = train.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [train[i], train[j]] = [train[j], train[i]];
    }
    let total = 0;
    for (let start = 0; start < train.length; start += batch) {
      const end = Math.min(train.length, start + batch);
      grad.fill(0);
      for (let n = start; n < end; n += 1) {
        const i = train[n];
        forward(layout, weights, load(i), scratch);
        total += backward(layout, weights, input, scratch, openOf(samples.open[i]), samples.y[i], grad, probabilities);
      }
      const scale = 1 / (end - start);
      step += 1;
      const c1 = 1 - beta1 ** step;
      const c2 = 1 - beta2 ** step;
      for (let k = 0; k < size; k += 1) {
        const g = grad[k] * scale;
        m[k] = beta1 * m[k] + (1 - beta1) * g;
        v[k] = beta2 * v[k] + (1 - beta2) * g * g;
        weights[k] -= rate * (m[k] / c1) / (Math.sqrt(v[k] / c2) + eps);
      }
    }
    loss = train.length === 0 ? 0 : total / train.length;
    onEpoch?.({ epoch, loss, accuracy: accuracy(train), heldOut: accuracy(test) });
  }
  return { weights, loss, accuracy: accuracy(train), heldOut: accuracy(test), epochs, samples: samples.count, held };
}

// ----------------------------------------------------------------------------------- the search

/** Rank-shaped utilities over `n` scores, best first, summing to zero; the NES weighting. */
export function utilities(scores) {
  const n = scores.length;
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const raw = order.map((_, rank) => Math.max(0, Math.log(n / 2 + 1) - Math.log(rank + 1)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const out = new Array(n).fill(0);
  order.forEach(([, i], rank) => { out[i] = raw[rank] / sum - 1 / n; });
  return out;
}

const gauss = (random) => {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * One generation: the mean and `population` antithetic perturbations of it scored together;
 * the mean steps along the utility-weighted sum of the perturbations, normalised to `alpha`.
 */
export async function esGeneration({ mean, population, sigma, alpha, league, pool, seed, bouts, workers, cap, onProgress = null }) {
  if (population % 2 !== 0 || population < 2) throw new Error("the population is antithetic pairs, so even and at least two");
  const random = mulberry32(seed);
  const pairs = population / 2;
  const eps = [];
  const contenders = { mean: { weights: Array.from(mean) } };
  for (let p = 0; p < pairs; p += 1) {
    const e = new Float64Array(mean.length);
    for (let k = 0; k < e.length; k += 1) e[k] = gauss(random);
    eps.push(e);
    const plus = new Float64Array(mean.length);
    const minus = new Float64Array(mean.length);
    for (let k = 0; k < e.length; k += 1) { plus[k] = mean[k] + sigma * e[k]; minus[k] = mean[k] - sigma * e[k]; }
    contenders[`plus-${p + 1}`] = { weights: Array.from(plus) };
    contenders[`minus-${p + 1}`] = { weights: Array.from(minus) };
  }
  const { results } = await evaluate({ contenders, league, pool, seed, bouts, workers, cap, onProgress });
  const names = [];
  const scores = [];
  for (let p = 0; p < pairs; p += 1) {
    names.push(`plus-${p + 1}`, `minus-${p + 1}`);
    scores.push(results[`plus-${p + 1}`].margin, results[`minus-${p + 1}`].margin);
  }
  const u = utilities(scores);
  const gradient = new Float64Array(mean.length);
  for (let p = 0; p < pairs; p += 1) {
    const w = u[2 * p] - u[2 * p + 1];
    const e = eps[p];
    for (let k = 0; k < e.length; k += 1) gradient[k] += w * e[k];
  }
  let norm = 0;
  for (let k = 0; k < gradient.length; k += 1) norm += gradient[k] * gradient[k];
  norm = Math.sqrt(norm);
  const next = new Float64Array(mean.length);
  for (let k = 0; k < mean.length; k += 1) next[k] = mean[k] + (norm > 0 ? alpha * gradient[k] / norm : 0);
  const ranked = names.map((name, i) => [name, scores[i]]).sort((a, b) => b[1] - a[1]);
  return {
    results, next, gradientNorm: norm,
    mean: { score: results.mean.score, margin: results.mean.margin },
    best: { name: ranked[0][0], margin: ranked[0][1] },
    worst: { name: ranked[ranked.length - 1][0], margin: ranked[ranked.length - 1][1] },
    bouts: Object.values(results).reduce((sum, r) => sum + r.bouts, 0),
  };
}

/** The whole search from `start`: `generations` steps, the log line per step, the final and the peak mean. */
export async function evolve({
  start, league, pool, seed, generations, population, sigma, alpha, bouts, workers, cap, log = null, onProgress = null,
}) {
  let mean = Float64Array.from(start);
  let peak = { margin: Number.NEGATIVE_INFINITY, weights: mean, generation: 0 };
  let spent = 0;
  for (let g = 1; g <= generations; g += 1) {
    const gseed = (seed ^ Math.imul(g, 0x9e3779b9) ^ 0x0e5) >>> 0;
    const started = Date.now();
    const result = await esGeneration({ mean, population, sigma, alpha, league, pool, seed: gseed, bouts, workers, cap, onProgress });
    spent += result.bouts;
    if (result.mean.margin > peak.margin) peak = { margin: result.mean.margin, weights: mean, generation: g };
    log?.({
      type: "generation", generation: g, seed: gseed, seconds: (Date.now() - started) / 1000, bouts: result.bouts,
      mean: { score: round4(result.mean.score), margin: round4(result.mean.margin) },
      best: { name: result.best.name, margin: round4(result.best.margin) },
      worst: { name: result.worst.name, margin: round4(result.worst.margin) },
      gradientNorm: round4(result.gradientNorm), alpha, sigma,
      scores: Object.fromEntries(Object.entries(result.results).map(([k, r]) => [k, round4(r.margin)])),
    });
    mean = result.next;
  }
  return { final: mean, peak, bouts: spent };
}

/** The candidates against the league on the confirmation seed, with the champion on the same seed. */
export async function confirm({ candidates, league, pool, seed, bouts, workers, cap, onProgress = null }) {
  const contenders = { champion: { policy: DEFAULT_TEACHER } };
  for (const [name, weights] of Object.entries(candidates)) contenders[name] = { weights: Array.from(weights) };
  const { results } = await evaluate({ contenders, league, pool, seed, bouts, workers, cap, onProgress });
  return results;
}

// ---------------------------------------------------------------------------------- the module

/** The module text: a header that says where the numbers came from, then the literal. */
export function renderNeuralModule(table) {
  checkNeuralWeights(table);
  // Sixteen numbers a line, so the file diffs by row rather than as one line.
  const rows = [];
  for (let i = 0; i < table.weights.length; i += 16) rows.push("  " + table.weights.slice(i, i + 16).join(","));
  const body = "\"weights\":[\n" + rows.join(",\n") + "\n]";
  return [
    "// GENERATED by scripts/train-neural.mjs -- do not edit; regenerate.",
    "//",
    `// Neural weights, version ${table.version} over feature version ${table.features}, ` +
    `${table.weights.length} numbers laid out ${JSON.stringify(table.layout)}.`,
    table.date
      ? `// Trained ${table.date} from seed ${table.seed}: imitated ${table.teacher} on ${table.imitation.samples} asks ` +
        `(held-out agreement ${(table.imitation.accuracy * 100).toFixed(1)} %), then ${table.generations} generations ` +
        `and ${table.bouts} bouts against ${table.league.join(", ")}; confirmed ${table.score.toFixed(3)} against ` +
        `${table.baseline.toFixed(3)} for the champion on the same seed.`
      : "// Untrained: seeded initial weights, so that the mind loads; the trainer overwrites this file.",
    "//",
    "// What the columns are is in src/golem/neural-features.ts and what the numbers do in",
    "// src/golem/neural-net.ts; a build that reads another version refuses this file by name.",
    "import type { NeuralWeights } from \"./neural.ts\";",
    "",
    `export const NEURAL_WEIGHTS: NeuralWeights = ${JSON.stringify({ ...table, weights: [] }).replace("\"weights\":[]", body)};`,
    "",
  ].join("\n");
}

/** The last mean of an earlier log, to start the search from. */
export function readStartWeights(path) {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  let weights = null;
  for (const line of lines) if (line.type === "weights") weights = line.table.weights;
  if (weights === null) throw new Error(`${path} has no weights line`);
  return Float64Array.from(weights);
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
  const seed = Number(flag("seed", 20260908)) >>> 0;
  const collectBouts = Math.max(2, Number(flag("collect", 64)));
  const epochs = Math.max(0, Number(flag("epochs", 30)));
  const batch = Math.max(1, Number(flag("batch", 64)));
  const rate = Number(flag("rate", 1e-3));
  const generations = Math.max(0, Number(flag("generations", 10)));
  const population = Math.max(2, Number(flag("population", 16)));
  const sigma = Number(flag("sigma", 0.05));
  const alpha = Number(flag("alpha", 0.5));
  const bouts = Math.max(2, Number(flag("bouts", 32)));
  const confirmBouts = Math.max(2, Number(flag("confirm", bouts * 4)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, Math.floor(availableParallelism() / 2)))));
  const random = Math.max(0, Number(flag("random", 40)));
  const cap = Number(flag("cap", 60));
  const league = flag("league", DEFAULT_LEAGUE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const teacher = flag("teacher", DEFAULT_TEACHER);
  const samplesPath = flag("samples", null);
  const startFrom = flag("start", null);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const out = resolve(flag("out", "tournaments/neural-" + stamp + "-" + seed + ".jsonl"));
  const write = flag("write", null);
  if (existsSync(out)) throw new Error(`${out} exists; a run does not append to another run's log`);
  mkdirSync(dirname(out), { recursive: true });
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });
  const progress = (label) => ({ done, total, seconds }) => {
    if (done % 256 === 0 || done === total) console.log(`  ${label}: ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
  };

  const pool = buildPool({ seed, random });
  const date = new Date().toISOString().slice(0, 10);
  log({
    type: "header", seed, date, pool: pool.map((b) => b.name), league, teacher, layout: NEURAL_LAYOUT, features: NEURAL_FEATURES_VERSION,
    collect: collectBouts, epochs, batch, rate, generations, population, sigma, alpha, bouts, confirm: confirmBouts, cap, workers,
  });
  console.log(`neural: seed ${seed}, ${pool.length} builds, league ${league.join(", ")}, teacher ${teacher}, ${workers} workers`);

  let samples;
  if (samplesPath !== null && existsSync(samplesPath)) {
    samples = readSamples(samplesPath);
    console.log(`  samples: ${samples.count} asks from ${samples.bouts} bouts, read from ${samplesPath}`);
  } else {
    const started = Date.now();
    samples = await collect({ pool, teacher, league, seed, bouts: collectBouts, workers, cap, onProgress: progress("collect") });
    console.log(`  samples: ${samples.count} asks from ${samples.bouts} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    if (samplesPath !== null) writeSamples(samplesPath, samples);
  }
  log({ type: "collect", samples: samples.count, bouts: samples.bouts });

  let start;
  let heldOut = 0;
  if (startFrom !== null) {
    start = readStartWeights(startFrom);
    console.log(`  starting from the weights in ${startFrom}`);
  } else {
    const started = Date.now();
    const fitted = imitate(samples, {
      seed, epochs, batch, rate,
      onEpoch: (e) => {
        log({ type: "imitate", ...e });
        console.log(`  epoch ${e.epoch}: loss ${e.loss.toFixed(3)}, agreement ${(e.accuracy * 100).toFixed(1)} % train, ${(e.heldOut * 100).toFixed(1)} % held out`);
      },
    });
    start = fitted.weights;
    heldOut = fitted.heldOut;
    console.log(`  imitation: ${fitted.samples} samples, ${fitted.held} held out, agreement ${(fitted.heldOut * 100).toFixed(1)} %, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    log({ type: "imitated", samples: fitted.samples, held: fitted.held, epochs, loss: round4(fitted.loss), accuracy: round4(fitted.accuracy), heldOut: round4(fitted.heldOut) });
  }
  const imitation = { samples: samples.count, accuracy: round4(heldOut) };

  const { final, peak, bouts: searched } = await evolve({
    start, league, pool, seed, generations, population, sigma, alpha, bouts, workers, cap,
    log: (line) => {
      log(line);
      console.log(`  generation ${line.generation}: mean ${line.mean.margin >= 0 ? "+" : ""}${line.mean.margin.toFixed(3)}/${line.mean.score.toFixed(3)}, ` +
        `best ${line.best.name} ${line.best.margin.toFixed(3)}, worst ${line.worst.name} ${line.worst.margin.toFixed(3)}, ${line.seconds.toFixed(0)} s`);
    },
    onProgress: progress("search"),
  });

  const cseed = (seed ^ 0xc0f1c0f1) >>> 0;
  const candidates = { imitated: start, final, peak: peak.weights };
  const results = await confirm({ candidates, league, pool, seed: cseed, bouts: confirmBouts, workers, cap, onProgress: progress("confirm") });
  const summary = Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { score: round4(r.score), margin: round4(r.margin), bouts: r.bouts }]));
  log({ type: "confirmation", seed: cseed, peakGeneration: peak.generation, results: summary, structural: results });
  for (const [name, r] of Object.entries(summary)) console.log(`  ${name.padEnd(9)} ${r.score.toFixed(3)} (margin ${r.margin >= 0 ? "+" : ""}${r.margin.toFixed(3)}) over ${r.bouts} bouts on the confirmation seed`);
  const shipped = ["imitated", "final", "peak"].sort((a, b) => summary[b].score - summary[a].score || summary[b].margin - summary[a].margin)[0];
  const table = neuralTable(candidates[shipped], {
    seed, date, teacher, imitation, generations, bouts: samples.bouts + searched + Object.values(summary).reduce((s, r) => s + r.bouts, 0),
    score: summary[shipped].score, baseline: summary.champion.score, league,
  });
  log({ type: "weights", shipped, table });
  console.log(`  shipping the ${shipped} weights: ${table.score.toFixed(3)} against the champion's ${table.baseline.toFixed(3)}`);
  const text = renderNeuralModule(table);
  if (write !== null) {
    writeFileSync(resolve(write), text);
    console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`log: ${out}`);
}
