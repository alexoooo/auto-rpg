/**
 * The core stance's envelope (`src/core/control/stance-envelope.ts`): the gait battery's walks, at
 * each speed five ways (forward, right, back, left, forward right) for 8 s and then a stop
 * (`walk` in `core-stance-trials.mjs`), on each human unarmed at the game's rate, each trial on a
 * worker of its own stand; how many held at each speed and the fastest held by the envelope's rule.
 * With `--write` it writes `assets/core/stance-envelope.json`.
 *
 *   node research/core-stance-envelope.mjs [--write] [--workers 14]
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fastestHeld } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/engine/rapier.ts";
import { CORE_STANCE_HARNESS } from "./core-stance-trials.mjs";

export const SPEEDS = [0.2, 0.3, 0.4, 0.5, 0.7];
export const WAYS = [0, 90, 180, 270, 45];
export const MODELS = ["workshop-fighter", "workshop-rogue"];

const { values } = parseArgs({ options: { write: { type: "boolean", default: false }, workers: { type: "string" } } });
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), hz = PHYSICS_HZ.value;

const jobs = MODELS.flatMap((model) => SPEEDS.flatMap((speed) => WAYS.map((degrees) => ({ trial: "walk", model, speed, degrees, hz, stance: {} }))));
const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./core-stance-worker.mjs", import.meta.url)));
const started = Date.now();
let next = 0;
await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
  const feed = () => {
    if (next >= jobs.length) { worker.terminate(); resolve(); return; }
    const id = next++;
    worker.once("message", ({ result, error }) => {
      if (error) { reject(new Error(error)); return; }
      jobs[id].result = result;
      feed();
    });
    worker.postMessage({ ...jobs[id], id });
  };
  feed();
})));

const models = Object.fromEntries(MODELS.map((model) => {
  const held = SPEEDS.map((speed) => jobs.filter((j) => j.model === model && j.speed === speed && !j.result.fell).length);
  return [model, { held, walk: fastestHeld({ speeds: SPEEDS, ways: WAYS.length, held }) }];
}));
const envelope = { harness: CORE_STANCE_HARNESS, hz, measured: new Date().toISOString().slice(0, 10), speeds: SPEEDS, ways: WAYS, models };
console.log(`${CORE_STANCE_HARNESS}, ${hz} Hz; ${jobs.length} walks in ${((Date.now() - started) / 1000).toFixed(0)} s`);
// Two-space JSON with each list of numbers on one line.
const text = `${JSON.stringify(envelope, null, 2).replace(/\[[\d.,\s]*\]/g, (list) => list.replace(/\s+/g, "").replaceAll(",", ", "))}\n`;
console.log(text);
if (values.write) await writeFile(new URL("../assets/core/stance-envelope.json", import.meta.url), text);
