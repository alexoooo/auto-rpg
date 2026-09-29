/**
 * The fastest straight a core human's arm and trunk can throw, found by search rather than set by
 * hand: cross-entropy search over `decode`'s strikes (`core-strike.mjs`), a chamber pose and its
 * time, a push on each freedom that may push, and the target's distance, scored by the fist's
 * forward speed at a head-sized sphere (or, for a miss, how near it passed). Each worker runs one
 * Havok stand at a time. The search runs at `--hz` (480 by default: see `core-strike.mjs` for why
 * not the game's 120), and the best strike is run again at 120 Hz once the workers are gone.
 *
 * With `--guard` the strike is a straight: no chamber, thrown from the lab's guard. Without it the
 * search also chooses a chamber pose, and finds whatever blow is fastest.
 *
 *   node research/core-strike-search.mjs [--model workshop-rogue] [--hand right] [--hz 480] [--guard]
 *     [--generations 30] [--population 64] [--elite 10] [--workers 14] [--seed 1]
 *
 * Prints one JSON line per generation, then the best strike with both rates' readings.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { CORE_STRIKE_HARNESS, dimensions, evaluateStrike } from "./core-strike.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string", default: "workshop-fighter" }, hand: { type: "string", default: "right" }, hz: { type: "string", default: "480" },
  guard: { type: "boolean", default: false },
  generations: { type: "string", default: "30" }, population: { type: "string", default: "64" },
  elite: { type: "string", default: "10" }, workers: { type: "string" }, seed: { type: "string", default: "1" },
} });
const { model, hand, guard } = values, hz = Number(values.hz);
const generations = Number(values.generations), population = Number(values.population), elite = Number(values.elite);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));

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
function evaluate(unit) {
  return new Promise((resolve, reject) => {
    const run = (worker) => {
      const id = nextId++;
      pending.set(id, { resolve: (r) => { release(worker); resolve(r); }, reject: (e) => { release(worker); reject(e); } });
      worker.postMessage({ id, model, hand, guard, unit, hz });
    };
    idle.length ? run(idle.pop()) : waiting.push(run);
  });
}
function release(worker) { const next = waiting.shift(); next ? next(worker) : idle.push(worker); }

const n = dimensions(hand, guard);
let mean = new Array(n).fill(0), sigma = new Array(n).fill(0.6);
let best = null;
const started = Date.now();
for (let g = 0; g < generations; g++) {
  const candidates = Array.from({ length: population }, () => mean.map((m, i) => Math.max(-1, Math.min(1, m + sigma[i] * normal()))));
  if (best) candidates[0] = best.unit;
  const results = await Promise.all(candidates.map(async (unit) => ({ unit, ...(await evaluate(unit)) })));
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
const other = hz === 120 ? 480 : 120;
const check = await evaluateStrike({ model, hand, guard, unit: best.unit, hz: other });
const reading = (r) => ({ closing: +r.closing.toFixed(2), at: r.at, peak: +r.peak.toFixed(2) });
console.log(JSON.stringify({ harness: CORE_STRIKE_HARNESS, model, hand, guard, seed: Number(values.seed),
  [`at${hz}`]: reading(best), [`at${other}`]: reading(check), distance: +best.distance.toFixed(3), strike: best.strike, unit: best.unit }));
