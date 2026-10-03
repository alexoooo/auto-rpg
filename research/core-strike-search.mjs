/**
 * The blow that pays most for one body, one thing held and one height band, found by search
 * rather than set by hand: cross-entropy search over the strikes a candidate stands for
 * (`HELD`, `core-blow.mjs`): a chamber pose and its time, a push on each freedom that may push,
 * and how far ahead the target stands. A candidate is scored by the rule a fight wounds by
 * (`evaluateBlow`, `scoreOf`): the hit points its blow does a target body of the band's part,
 * less those it costs the body that throws it; under any hit, by how near it passed; and `FELL`
 * for a body left down or not standing. Each worker runs one Rapier stand at a time. The search
 * runs at `--hz` (the game's 120 by default).
 *
 *   node research/core-strike-search.mjs [--model workshop-rogue] [--held fist|"wooden club"] [--band high|middle] [--hand right]
 *     [--hz 120] [--guard] [--generations 30] [--population 64] [--elite 10] [--workers 14] [--seed 1] [--trials 4] [--grounds 20]
 *     [--from <model>:<band>|<file>] [--sigma 0.6] [--jitter <along>,<across>,<up>] [--still]
 *
 * With `--guard` the strike has no chamber: it is thrown from the lab's guard, as a straight is.
 *
 * A candidate's score is its mean over `--trials` runs (`perturbed` in `core-strike.mjs` says why):
 * the strike as written, and the rest with every push moved and scaled by one draw, the same draws
 * for every candidate in a generation; and one more run thrown at nothing, which a candidate
 * must end standing or score `FELL` whatever it does when it lands (`candidateScore`). With
 * `--grounds 20,30,40,25` trial k stands on the k-th ground's size, m (20 alone unless given): the
 * size moves nothing a blow meets, only the float state the world steps in, which moves a fragile
 * blow's energy by several percent, so no trial is scored in the one float state the search found
 * it in. Prints one JSON line per generation, then the best strike read again on eight fresh
 * trials at each of `--replay`'s rates (120, 480 and 1920 Hz unless given), as written on a 20, 30
 * and 40 m ground (`noise`), and thrown at nothing.
 *
 * With `--jitter` each trial's target body stands off the strike's place, m, within that much each
 * way along the heading, across it and up, and the skill is told where once the blow is committed,
 * as of a head that moved under it (`Throw.moved`), so that the blow turns after it (`STEER`): the
 * offsets are the golden ratio's sequence in as many dimensions as are jittered (Roberts 2018, "The
 * unreasonable effectiveness of quasirandom sequences"), carried on from one generation to the
 * next, so that no candidate is scored on the same four; the best is the last generation's. The
 * replay reads the best at its place.
 *
 * With `--still` each trial is thrown at nothing as well, and a candidate's score is less
 * `STEPPED` for each step its stance took to catch it there, on the mean: a recipe searched against
 * a target, which stops its arm, is not otherwise scored on what a miss does to its feet. The
 * replay reads the steps of its throw at nothing.
 *
 * `--from` starts the search centred on a strike, which is its first generation's first
 * candidate, with every spread `--sigma` (0.6, the fresh search's, unless given): a recipe of the
 * repertoire (`assets/core/strikes.json`), named by the body it was searched on and its band,
 * with this search's `--held` (`encodeHeld`: on another body, each number held to that body's
 * ranges); or a finished search's output (its last line), whose held, model and hand must be this
 * search's. A recipe with no chamber is searched as one (`--guard`).
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { BAND_NAMES } from "../src/core/skills/strikes.ts";
import { bandRise } from "../src/lab/blow.ts";
import { candidateScore, CORE_BLOW_HARNESS, decodeHeld, dimensionsHeld, encodeHeld, HELD, heldSpec, scoreOf } from "./core-blow.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string", default: "workshop-fighter" }, hand: { type: "string", default: "right" }, hz: { type: "string", default: "120" },
  guard: { type: "boolean", default: false }, held: { type: "string", default: "fist" }, band: { type: "string", default: "high" },
  generations: { type: "string", default: "30" }, population: { type: "string", default: "64" },
  elite: { type: "string", default: "10" }, workers: { type: "string" }, seed: { type: "string", default: "1" },
  trials: { type: "string", default: "4" }, replay: { type: "string", default: "120,480,1920" },
  from: { type: "string" }, sigma: { type: "string", default: "0.6" }, grounds: { type: "string", default: "20" },
  jitter: { type: "string" }, still: { type: "boolean", default: false },
} });
const { model, hand, held, band } = values, hz = Number(values.hz);
const WAYS = ["along", "across", "up"], jitter = values.jitter ? values.jitter.split(",").map(Number) : null;
if (jitter && (jitter.length !== 3 || jitter.some((j) => !(j >= 0)))) throw new Error(`--jitter is three sizes, m, along, across and up: ${values.jitter}`);
if (!HELD[held]) throw new Error(`--held is one of ${Object.keys(HELD).join(", ")}, not ${held}`);
if (!BAND_NAMES.includes(band)) throw new Error(`--band is one of ${BAND_NAMES.join(", ")}, not ${band}`);
const generations = Number(values.generations), population = Number(values.population), elite = Number(values.elite);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), trials = Number(values.trials);
const spec = heldSpec(model, held, hand);

/** Where the search starts, if anywhere: the strike's numbers, and whether it is thrown from the guard. */
function start() {
  if (!values.from) return null;
  if (existsSync(values.from)) {
    const record = JSON.parse(readFileSync(values.from, "utf8").trim().split("\n").at(-1));
    if (record.held !== held || record.model !== model || record.hand !== hand) throw new Error(`--from ${values.from} is a ${record.held} search on ${record.model}'s ${record.hand} hand`);
    return { unit: record.unit, guard: record.guard };
  }
  const [fromModel, fromBand] = values.from.split(":");
  const asset = JSON.parse(readFileSync(new URL("../assets/core/strikes.json", import.meta.url), "utf8"));
  const recipe = asset.recipes.find((r) => r.model === fromModel && r.held === held && r.band === fromBand);
  if (!recipe) throw new Error(`--from ${values.from}: the repertoire has no ${held} recipe of ${fromModel}'s in the ${fromBand} band, and no such file`);
  if (recipe.strike.hand !== hand) throw new Error(`--from ${values.from} is the ${recipe.strike.hand} hand's`);
  return { unit: encodeHeld(held, recipe.strike, recipe.place.ahead, spec), guard: !recipe.strike.chamber };
}
const from = start(), guard = from ? from.guard : values.guard;
if (from && values.guard && !from.guard) throw new Error(`--from ${values.from} has a chamber; --guard is for a strike without one`);
if (guard && !HELD[held].guard) throw new Error(`a blow with ${held} is chambered; --guard is for a straight`);
const n = dimensionsHeld(held, hand, guard);
if (from && from.unit.length !== n) throw new Error(`--from ${values.from} is ${from.unit.length} numbers, not ${n}`);

/**
 * What a mind cannot hold exactly from one blow to the next, and the search's choice: a push placed
 * anywhere within half a 120 Hz step, and its activation within 2 %.
 */
const TIMING = 1 / 240, LEVEL = 0.02;
/**
 * The golden ratio's sequence in the jittered dimensions: the n-th point, each coordinate in [0, 1).
 * Its generator is the root over 1 of x^(d+1) = x + 1, found by Newton's method.
 */
const jittered = jitter ? WAYS.filter((_, i) => jitter[i] > 0) : [];
const generator = (() => {
  const d = jittered.length;
  let x = 2;
  for (let k = 0; k < 64; k++) { let power = 1; for (let i = 0; i < d + 1; i++) power *= x; x -= (power - x - 1) / ((d + 1) * power / x - 1); }
  return x;
})();
const alphas = jittered.map((_, i) => { let a = 1; for (let k = 0; k <= i; k++) a /= generator; return a; });
let sequenceAt = 0;
/** The next offset of the sequence (`StandOff`), or none without `--jitter`. */
const nextOff = () => {
  if (!jitter) return null;
  const n = ++sequenceAt;
  return Object.fromEntries(WAYS.map((way, i) => {
    const k = jittered.indexOf(way);
    if (k < 0) return [way, 0];
    const u = (0.5 + n * alphas[k]) % 1;
    return [way, jitter[i] * (2 * u - 1)];
  }));
};
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
function release(worker) { const next = waiting.shift(); next ? next(worker) : idle.push(worker); }
/** One blow of `unit` on a worker: at `rate`, under `perturbation` on its ground, at the target or at nothing. */
function run1(unit, perturbation, { dummy = true, rate = hz } = {}) {
  return new Promise((resolve, reject) => {
    const run = (worker) => {
      const id = nextId++;
      pending.set(id, { resolve: (r) => { release(worker); resolve(r); }, reject: (e) => { release(worker); reject(e); } });
      worker.postMessage({ id, model, held, hand, band, guard, unit, hz: rate, perturbation, ground: perturbation.ground, dummy,
        ...(perturbation.off && dummy ? { off: perturbation.off, seen: true } : {}) });
    };
    idle.length ? run(idle.pop()) : waiting.push(run);
  });
}
const AS_WRITTEN = { shift: 0, scale: 1 };
/** A candidate's score over `perturbations` and thrown at nothing (each perturbation `--still`, else once as written), with its unperturbed run's reading beside it. */
async function evaluate(unit, perturbations) {
  const empty = values.still ? perturbations : [{ ...AS_WRITTEN, ground: GROUNDS[0] }];
  const [nothing, runs] = await Promise.all([Promise.all(empty.map((p) => run1(unit, p, { dummy: false }))), Promise.all(perturbations.map((p) => run1(unit, p)))]);
  return { ...runs[0], score: candidateScore(runs, nothing, values.still), runs: runs.map((r) => +scoreOf(r).toFixed(3)) };
}
/** Trials for one generation, shared by every candidate in it; the first is the strike as written. */
const draw = () => Array.from({ length: trials }, (_, k) => ({ ...(k === 0 ? AS_WRITTEN
  : { shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) }), ground: GROUNDS[k % GROUNDS.length],
  ...(jitter ? { off: nextOff() } : {}) }));

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
  // Under jitter a generation's draws are its own, so a score is not held against another
  // generation's: the best is the generation's, among which the last best is scored again.
  if (jitter || !best || results[0].score > best.score) best = results[0];
  const top = results.slice(0, elite);
  mean = mean.map((_, i) => top.reduce((s, r) => s + r.unit[i], 0) / top.length);
  sigma = sigma.map((_, i) => Math.max(0.05, Math.sqrt(top.reduce((s, r) => s + (r.unit[i] - mean[i]) ** 2, 0) / top.length)));
  console.log(JSON.stringify({ generation: g, best: +best.score.toFixed(3), generationBest: +results[0].score.toFixed(3),
    eliteMedian: +top[top.length >> 1].score.toFixed(3), hitting: results.filter((r) => r.done > 0).length,
    seconds: Math.round((Date.now() - started) / 1000) }));
}
// The best, read again on fresh trials at the game's rate and two finer ones: each rate's mean
// of what it did less what it cost, its runs, and whether it stood thrown at nothing.
const fresh = [AS_WRITTEN, ...Array.from({ length: 7 }, () => ({ shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) }))]
  .map((p, k) => ({ ...p, ground: GROUNDS[k % GROUNDS.length] }));
const average = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const readings = {};
for (const rate of values.replay.split(",").map(Number)) {
  const [nothing, noise, runs] = await Promise.all([
    run1(best.unit, { ...AS_WRITTEN, ground: GROUNDS[0] }, { dummy: false, rate }),
    Promise.all(NOISE.map((ground) => run1(best.unit, { ...AS_WRITTEN, ground }, { rate }))),
    Promise.all(fresh.map((perturbation) => run1(best.unit, perturbation, { rate }))),
  ]);
  readings[`at${rate}`] = {
    net: +average(runs.map((r) => r.done - r.cost)).toFixed(4), done: +average(runs.map((r) => r.done)).toFixed(4), cost: +average(runs.map((r) => r.cost)).toFixed(4),
    runs: runs.map((r) => +(r.done - r.cost).toFixed(3)), noise: noise.map((r) => +(r.done - r.cost).toFixed(3)),
    landed: runs.filter((r) => r.done > 0).length, stood: runs.filter((r) => !r.fell && r.stood).length, stoodAtNothing: !nothing.fell && nothing.stood, stepsAtNothing: nothing.recoveries,
  };
}
await Promise.all(pool.map((w) => w.terminate()));
const found = decodeHeld(held, best.unit, spec, hand, guard);
console.log(JSON.stringify({ harness: CORE_BLOW_HARNESS, held, band, model, hand, guard, seed: Number(values.seed), hz, trials,
  generations, population, ...(values.from ? { from: values.from, sigma: Number(values.sigma) } : {}), ...(values.grounds !== "20" ? { grounds: GROUNDS } : {}), ...(jitter ? { jitter } : {}), ...(values.still ? { still: true } : {}),
  searched: { mean: +best.score.toFixed(3), runs: best.runs }, ...readings,
  place: { ahead: found.distance, up: bandRise(spec, band) }, strike: found.strike, unit: best.unit }));
