/**
 * The fastest straight a core human's arm and trunk can throw, found by search rather than set by
 * hand: cross-entropy search over `decode`'s strikes (`core-strike.mjs`), a chamber pose and its
 * time, a push on each freedom that may push, and the target's distance, scored by the fist's
 * forward speed at a head-sized sphere (or, for a miss, how near it passed). Each worker runs one
 * Rapier stand at a time. The search runs at `--hz` (the game's 120 by default).
 *
 * With `--guard` the strike is a straight: no chamber, thrown from the lab's guard. Without it the
 * search also chooses a chamber pose, and finds whatever blow is fastest. With `--weapon club` the
 * hand holds the wooden club and a blow is `core-club-strike.mjs`'s, scored by the energy it brings
 * to the head (joules) instead of a fist's speed.
 *
 *   node research/core-strike-search.mjs [--model workshop-rogue] [--hand right] [--hz 120] [--guard] [--weapon club]
 *     [--generations 30] [--population 64] [--elite 10] [--workers 14] [--seed 1] [--trials 4] [--grounds 20]
 *
 * A candidate's score is its mean over `--trials` runs (`perturbed` in `core-strike.mjs` says why):
 * the strike as written, and the rest with every push moved and scaled by one draw, the same draws
 * for every candidate in a generation. With `--grounds 20,30,40,25` trial k stands on the k-th ground's
 * size, m (20 alone unless given): the size moves nothing a blow meets, only the float state the
 * world steps in, which moves a fragile blow's energy by several percent (the plan's section on the
 * engine: a club blow searched on from seed 1 read 105.9 J on the search's 20 m ground and 97.6 on
 * 30 and 40), so no trial is scored in the one float state the search found it in. Prints one JSON
 * line per generation, then the best strike read again on eight fresh trials at each of `--replay`'s
 * rates (120, 480 and 1920 Hz unless given), and as written on a 20, 30 and 40 m ground (`noise`).
 *
 * `--from <file>` goes on from a finished search's output (its last line): the search starts centred
 * on that best strike, which is its first generation's first candidate, with every spread `--sigma`
 * (0.6, the fresh search's, unless given). The weapon, model and hand must be the file's.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CORE_CLUB_HARNESS, clubDimensions, evaluateClubStrike } from "./core-club-strike.mjs";
import { CORE_STRIKE_HARNESS, dimensions, evaluateStrike } from "./core-strike.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string", default: "workshop-fighter" }, hand: { type: "string", default: "right" }, hz: { type: "string", default: "120" },
  guard: { type: "boolean", default: false }, weapon: { type: "string", default: "fist" },
  generations: { type: "string", default: "30" }, population: { type: "string", default: "64" },
  elite: { type: "string", default: "10" }, workers: { type: "string" }, seed: { type: "string", default: "1" },
  trials: { type: "string", default: "4" }, replay: { type: "string", default: "120,480,1920" },
  from: { type: "string" }, sigma: { type: "string", default: "0.6" }, grounds: { type: "string", default: "20" },
} });
const { model, hand, guard, weapon } = values, hz = Number(values.hz);
if (weapon !== "fist" && weapon !== "club") throw new Error(`--weapon is fist or club, not ${weapon}`);
if (weapon === "club" && guard) throw new Error("a club blow is chambered; --guard is for a straight");
const evaluateOne = weapon === "club" ? evaluateClubStrike : evaluateStrike;
const generations = Number(values.generations), population = Number(values.population), elite = Number(values.elite);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), trials = Number(values.trials);
/**
 * What a mind cannot hold exactly from one blow to the next, and the search's choice: a push placed
 * anywhere within half a 120 Hz step, and its activation within 2 %.
 */
const TIMING = 1 / 240, LEVEL = 0.02;
/** Each trial's ground, m, in turn; and the grounds the replay reads the strike as written on. */
const GROUNDS = values.grounds.split(",").map(Number), NOISE = [20, 30, 40];

let state = Number(values.seed) >>> 0 || 1;
const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());

const pool = Array.from({ length: lanes }, () => new Worker(new URL("./core-strike-worker.mjs", import.meta.url)));
let nextId = 0;
const pending = new Map();
for (const worker of pool) worker.on("message", ({ id, result, error }) => {
  const { resolve, reject } = pending.get(id); pending.delete(id);
  error ? reject(new Error(error)) : resolve(result);
});
const idle = [...pool], waiting = [];
function run1(unit, perturbation) {
  return new Promise((resolve, reject) => {
    const run = (worker) => {
      const id = nextId++;
      pending.set(id, { resolve: (r) => { release(worker); resolve(r); }, reject: (e) => { release(worker); reject(e); } });
      worker.postMessage({ id, weapon, model, hand, guard, unit, hz, perturbation, groundSize: perturbation.ground });
    };
    idle.length ? run(idle.pop()) : waiting.push(run);
  });
}
/** A candidate's mean over `perturbations`, with its unperturbed run's reading beside it. */
async function evaluate(unit, perturbations) {
  const runs = await Promise.all(perturbations.map((p) => run1(unit, p)));
  return { ...runs[0], score: runs.reduce((s, r) => s + r.score, 0) / runs.length, runs: runs.map((r) => +r.score.toFixed(2)) };
}
/** Trials for one generation, shared by every candidate in it; the first is the strike as written. */
const draw = () => Array.from({ length: trials }, (_, k) => ({ ...(k === 0 ? { shift: 0, scale: 1 }
  : { shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) }), ground: GROUNDS[k % GROUNDS.length] }));
function release(worker) { const next = waiting.shift(); next ? next(worker) : idle.push(worker); }

const n = weapon === "club" ? clubDimensions(hand) : dimensions(hand, guard);
const from = values.from ? JSON.parse(readFileSync(values.from, "utf8").trim().split("\n").at(-1)) : null;
if (from && (from.weapon !== weapon || from.model !== model || from.hand !== hand || from.unit.length !== n)) {
  throw new Error(`--from ${values.from} is a ${from.weapon} search on ${from.model}'s ${from.hand} hand`);
}
let mean = from ? [...from.unit] : new Array(n).fill(0), sigma = new Array(n).fill(Number(values.sigma));
let best = null;
const started = Date.now();
for (let g = 0; g < generations; g++) {
  const candidates = Array.from({ length: population }, () => mean.map((m, i) => Math.max(-1, Math.min(1, m + sigma[i] * normal()))));
  if (best) candidates[0] = best.unit;
  else if (from) candidates[0] = from.unit;
  const perturbations = draw();
  const results = await Promise.all(candidates.map(async (unit) => ({ unit, ...(await evaluate(unit, perturbations)) })));
  results.sort((a, b) => b.score - a.score);
  if (!best || results[0].score > best.score) best = results[0];
  const top = results.slice(0, elite);
  mean = mean.map((_, i) => top.reduce((s, r) => s + r.unit[i], 0) / top.length);
  sigma = sigma.map((_, i) => Math.max(0.05, Math.sqrt(top.reduce((s, r) => s + (r.unit[i] - mean[i]) ** 2, 0) / top.length)));
  console.log(JSON.stringify({ generation: g, best: +best.score.toFixed(2), generationBest: +results[0].score.toFixed(2),
    eliteMedian: +top[top.length >> 1].score.toFixed(2), hitting: results.filter((r) => r.at !== null).length,
    seconds: Math.round((Date.now() - started) / 1000) }));
}
await Promise.all(pool.map((w) => w.terminate()));
// The best, read again on fresh trials at the game's rate and two finer ones: each rate's mean score,
// its runs, and the unperturbed run's arrival and peak.
const fresh = [{ shift: 0, scale: 1 }, ...Array.from({ length: 7 }, () => ({ shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) }))]
  .map((p, k) => ({ ...p, ground: GROUNDS[k % GROUNDS.length] }));
const readings = {};
for (const rate of values.replay.split(",").map(Number)) {
  const runs = [];
  for (const perturbation of fresh) runs.push(await evaluateOne({ model, hand, guard, unit: best.unit, hz: rate, perturbation, groundSize: perturbation.ground }));
  const noise = [];
  for (const groundSize of NOISE) noise.push(+(await evaluateOne({ model, hand, guard, unit: best.unit, hz: rate, groundSize })).score.toFixed(2));
  readings[`at${rate}`] = { mean: +(runs.reduce((s, r) => s + r.score, 0) / runs.length).toFixed(2), runs: runs.map((r) => +r.score.toFixed(2)),
    noise, at: runs[0].at, peak: +runs[0].peak.toFixed(2),
    ...(weapon === "club" ? { closing: +runs[0].closing.toFixed(3), clubKg: runs[0].clubKg && +runs[0].clubKg.toFixed(3), headKg: runs[0].headKg && +runs[0].headKg.toFixed(2), normal: runs[0].normal } : {}) };
}
console.log(JSON.stringify({ harness: weapon === "club" ? CORE_CLUB_HARNESS : CORE_STRIKE_HARNESS, weapon, model, hand, guard, seed: Number(values.seed), hz, trials,
  ...(from ? { from: values.from, sigma: Number(values.sigma) } : {}), ...(values.grounds !== "20" ? { grounds: GROUNDS } : {}),
  searched: { mean: +best.score.toFixed(2), runs: best.runs }, ...readings, distance: +best.distance.toFixed(3), strike: best.strike, unit: best.unit }));
