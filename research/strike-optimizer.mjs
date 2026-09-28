/**
 * The strongest strike a human body can deliver, found by search rather than guessed.
 *
 * Cross-entropy search over `STRIKE_PARAMS` (a guard, a chamber and a strike, each a pose of the
 * posture and the striking hand, plus the start distance), scored by `evaluateStrike`: the largest
 * energy Combat books for an unblocked contact of the striking hand on an idle unarmed Warrior.
 * Each worker runs one Havok arena at a time.
 *
 *   node research/strike-optimizer.mjs --terminal club --attributes '{"size":1.1}' \
 *     [--model workshop-rogue] [--generations 14] [--population 48] [--workers 14] [--seed 1]
 *
 * Prints one JSON line per generation and the best strike found, with its contact.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { STRIKE_PARAMS, STRIKE_HARNESS } from "./strike-eval.mjs";

const { values } = parseArgs({ options: {
  terminal: { type: "string", default: "club" }, attributes: { type: "string" }, model: { type: "string" },
  generations: { type: "string", default: "14" }, population: { type: "string", default: "48" },
  elite: { type: "string", default: "8" }, workers: { type: "string" }, seed: { type: "string", default: "1" },
  globals: { type: "string" }, patches: { type: "string" }, objective: { type: "string", default: "energy" },
} });
const terminal = values.terminal, attributes = values.attributes ? JSON.parse(values.attributes) : undefined;
const model = values.model, globals = values.globals ? JSON.parse(values.globals) : {};
const patches = values.patches ? JSON.parse(values.patches) : [];
const generations = Number(values.generations), population = Number(values.population), elite = Number(values.elite);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));

let state = Number(values.seed) >>> 0 || 1;
const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());

const pool = Array.from({ length: lanes }, () => new Worker(new URL("./strike-worker.mjs", import.meta.url), { workerData: { globals, patches } }));
let nextId = 0;
const pending = new Map();
for (const worker of pool) worker.on("message", ({ id, result, error }) => {
  const { resolve, reject } = pending.get(id); pending.delete(id);
  error ? reject(new Error(error)) : resolve(result);
});
const idle = [...pool];
const waiting = [];
function evaluate(params) {
  return new Promise((resolve, reject) => {
    const run = (worker) => {
      const id = nextId++;
      pending.set(id, { resolve: (r) => { release(worker); resolve(r); }, reject: (e) => { release(worker); reject(e); } });
      worker.postMessage({ id, terminal, attributes, model, params, objective: values.objective });
    };
    idle.length ? run(idle.pop()) : waiting.push(run);
  });
}
function release(worker) { const next = waiting.shift(); next ? next(worker) : idle.push(worker); }

const n = STRIKE_PARAMS.length;
let mean = new Array(n).fill(0), sigma = new Array(n).fill(0.6);
let best = null;
const started = Date.now();
for (let g = 0; g < generations; g++) {
  const candidates = Array.from({ length: population }, () =>
    mean.map((m, i) => Math.max(-1, Math.min(1, m + sigma[i] * normal()))));
  if (best) candidates[0] = best.unit;
  const results = await Promise.all(candidates.map(async (unit) => ({ unit, ...(await evaluate(unit)) })));
  results.sort((a, b) => b.energyJ - a.energyJ);
  if (!best || results[0].energyJ > best.energyJ) best = results[0];
  const top = results.slice(0, elite);
  mean = mean.map((_, i) => top.reduce((s, r) => s + r.unit[i], 0) / top.length);
  sigma = sigma.map((_, i) => Math.max(0.05, Math.sqrt(top.reduce((s, r) => s + (r.unit[i] - mean[i]) ** 2, 0) / top.length)));
  console.log(JSON.stringify({ generation: g, bestJ: +best.energyJ.toFixed(2), generationBestJ: +results[0].energyJ.toFixed(2),
    eliteMedianJ: +top[top.length >> 1].energyJ.toFixed(2), hitting: results.filter(r => r.energyJ > 0).length,
    seconds: Math.round((Date.now() - started) / 1000) }));
}
console.log(JSON.stringify({ harness: STRIKE_HARNESS, terminal, attributes: attributes ?? {}, model: model ?? "default",
  globals, patches, objective: values.objective, best: { score: best.energyJ, peakSpeedBeforeContact: best.peakSpeedBeforeContact, contact: best.best, params: best.params, unit: best.unit } }));
await Promise.all(pool.map((w) => w.terminate()));
