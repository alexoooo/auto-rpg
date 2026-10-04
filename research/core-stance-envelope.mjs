/**
 * The core stance's envelope (`src/core/control/stance-envelope.ts`): the gait battery's walks, at
 * each speed five ways (forward, right, back, left, forward right) for 8 s and then a stop
 * (`walk` in `core-stance-trials.mjs`), on each core body as a fight plays it with each thing its
 * right hand holds (`HOLDS`: in the guard, under its character's balance) at the game's rate, each
 * trial on a worker of its own stand; how many held at each speed and the fastest held by the
 * envelope's rule. Then the turn battery, walking at each speed up to that fastest walk: the
 * heading turned half round at each rate both ways (`turn`), beginning at each of `AFTERS` s
 * after the walk sets off, how many held at each rate and the fastest held by the same rule, at
 * each speed. With `--write` it writes `assets/core/stance-envelope.json`.
 *
 *   node research/core-stance-envelope.mjs [--write] [--workers 14]
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DUEL_HELD } from "../src/arena/duel.ts";
import { fastestHeld } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { CORE_STANCE_HARNESS } from "./core-stance-trials.mjs";

export const SPEEDS = [0.2, 0.3, 0.4, 0.5, 0.7];
export const WAYS = [0, 90, 180, 270, 45];
export const MODELS = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
export const RATES = [0.25, 0.5, 1, 2, 4];
export const SENSES = [1, -1];
/** What a fight puts in a body's right hand: every way a body is played is a way it must hold. */
export const HOLDS = DUEL_HELD;
/**
 * When a turn begins, s after the walk sets off: every eighth of a second to 1.5, over the first
 * strides, where a turn meets the walk in any phase of its weight shift; and at 3, under way.
 */
export const AFTERS = [...Array.from({ length: 13 }, (_, k) => k / 8), 3];

const { values } = parseArgs({ options: { write: { type: "boolean", default: false }, workers: { type: "string" } } });
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), hz = PHYSICS_HZ.value;

const pool = Array.from({ length: lanes }, () => new Worker(new URL("./core-stance-worker.mjs", import.meta.url)));
const started = Date.now();
/** Run `jobs` on the pool, each answered into its `result`. */
async function runAll(jobs) {
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { resolve(); return; }
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
}

const walks = MODELS.flatMap((model) => SPEEDS.flatMap((speed) => WAYS.flatMap((degrees) => HOLDS.map((held) => ({ trial: "walk", model, speed, degrees, held, hz, stance: {} })))));
await runAll(walks);
const walkHeld = (model) => SPEEDS.map((speed) => walks.filter((j) => j.model === model && j.speed === speed && !j.result.fell).length);
const fastest = Object.fromEntries(MODELS.map((model) => [model, fastestHeld({ speeds: SPEEDS, ways: WAYS.length * HOLDS.length, held: walkHeld(model) })]));
/** The gait battery's speeds up to `model`'s fastest walk. */
const upTo = (model) => SPEEDS.filter((speed) => speed <= fastest[model]);
const turns = MODELS.flatMap((model) => upTo(model).flatMap((speed) => RATES.flatMap((rate) => SENSES.flatMap((sense) => HOLDS.flatMap((held) => AFTERS.map((after) => ({ trial: "turn", model, speed, rate, sense, held, after, hz, stance: {} })))))));
await runAll(turns);
await Promise.all(pool.map((w) => w.terminate()));
const turnHeld = (model, speed) => RATES.map((rate) => turns.filter((j) => j.model === model && j.speed === speed && j.rate === rate && !j.result.fell).length);

const models = Object.fromEntries(MODELS.map((model) => [model, {
  held: walkHeld(model), walk: fastest[model],
  turnHeld: upTo(model).map((speed) => turnHeld(model, speed)),
  turns: upTo(model).map((speed) => fastestHeld({ speeds: RATES, ways: SENSES.length * HOLDS.length * AFTERS.length, held: turnHeld(model, speed) })),
}]));
const envelope = { harness: CORE_STANCE_HARNESS, played: "each body in the guard, under its character's balance (the rulebook's per cent), with each of `holds` in its right hand", hz, measured: new Date().toISOString().slice(0, 10), speeds: SPEEDS, ways: WAYS, rates: RATES, senses: SENSES, holds: HOLDS, afters: AFTERS, models };
console.log(`${CORE_STANCE_HARNESS}, ${hz} Hz; ${walks.length} walks and ${turns.length} turns in ${((Date.now() - started) / 1000).toFixed(0)} s`);
// Two-space JSON with each list of numbers on one line.
const text = `${JSON.stringify(envelope, null, 2).replace(/\[[-\d.,\s]*\]/g, (list) => list.replace(/\s+/g, "").replaceAll(",", ", "))}\n`;
console.log(text);
if (values.write) await writeFile(new URL("../assets/core/stance-envelope.json", import.meta.url), text);
