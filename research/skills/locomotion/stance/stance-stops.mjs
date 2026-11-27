/**
 * Each gait's stops (`assets/skills/locomotion/stops.json`): a body sent to a place under the
 * speed rule (`arrive`, `stance-trials.mjs`) at each stopping rate of `RATES`, from each distance
 * of its battery, from a stand and from a walk, and how far past the place it went at the worst
 * of them, and how many fell, braked after the lag that stretch states. Each gait is the legs a
 * trial names (`skillOf`), braked at each rate at every speed; the walk and run's walk below its
 * switch is braked so with its pace held under its switch (`below`, its first stretch), and its
 * run from distances it runs over, above that walk as the skill stops it (`above`).
 *
 *   node research/skills/locomotion/stance/stance-stops.mjs [--models man] [--holds empty] [--gaits quick-start,...] [--workers 30] [--write] [--out file]
 *
 * `--write` writes the asset with the bodies and gaits measured over the ones it holds; `--out`
 * a file in place of it.
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { CORE_STANCE_HARNESS } from "./stance-trials.mjs";
import { defaultLanes, simulationWorker } from "../../../../scripts/lanes.mjs";
import { PHYSICS_HZ } from "../../../../src/core/world/world.ts";

/** The stopping rates the speed rule is given, m/s². */
const RATES = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5, 2, 3];
/**
 * A walk's battery: the places' distances, m, and the paces it walks at before the order, m/s (0,
 * from a stand); a trial from a walk at a rate that cannot stop it by the place at all
 * (`arrive`'s `reachable`) is no trial of that rate.
 */
const WALKS = { distances: [0.5, 1, 2, 4], walking: [0, 1] };
/** A run's: places it runs to. */
const RUNS = { distances: [4, 8, 15], walking: [0, 2] };
/**
 * The gaits measured, by the name a trial builds its legs by (`skillOf`), the key the asset keeps
 * them under, and their battery; a walk and run's `below`, its walk's battery under its switch.
 */
const GAITS = {
  "braced": { key: "stance-walk/stance-walk", battery: WALKS },
  "quick-start": { key: "stance-walk/quick-start", battery: WALKS },
  "staggered": { key: "stance-walk/staggered", battery: WALKS },
  "footwork": { key: "stance-walk/footwork", battery: WALKS },
  "walk-run": { key: "walk-run/walk-run", battery: RUNS, below: WALKS },
  "quick-run": { key: "walk-run/quick-start", battery: RUNS, below: WALKS },
};

const { values } = parseArgs({ options: { models: { type: "string" }, holds: { type: "string" }, gaits: { type: "string" }, workers: { type: "string" },
  write: { type: "boolean", default: false }, out: { type: "string" } } });
const models = (values.models ?? "man").split(","), holds = (values.holds ?? "empty").split(",");
const gaits = (values.gaits ?? Object.keys(GAITS).join(",")).split(",");
for (const gait of gaits) if (!Object.hasOwn(GAITS, gait)) throw new Error(`no gait ${gait}`);
const hz = PHYSICS_HZ.value;

const lanes = Number(values.workers ?? defaultLanes()), pool = [], queue = [];
let played = 0;
const started = Date.now();
const feed = (worker) => {
  const next = queue.shift();
  if (!next) { worker.idle = true; return; }
  worker.idle = false;
  worker.once("message", ({ result, error }) => {
    if (error) { next.reject(new Error(error)); return; }
    played++; next.resolve(result); feed(worker);
  });
  worker.postMessage({ ...next.job, id: 0 });
};
const play = (job) => new Promise((resolve, reject) => {
  queue.push({ job, resolve, reject });
  const idle = pool.find((w) => w.idle);
  if (idle) feed(idle);
});
const progress = setInterval(() => console.error(`${((Date.now() - started) / 1000).toFixed(0)} s: ${played} played, ${queue.length} queued`), 20_000);

/**
 * One stretch's curve (`arrive`'s `stretch`): the lag it was braked after, and at each rate, the
 * worst past over its trials (null where every trial fell) and how many fell, of `trials`; with
 * `below`, the top of the first stretch as well (`speed`).
 */
async function curve(model, held, legs, { distances, walking }, stretch) {
  let lag = null, speed = null;
  const rows = await Promise.all(RATES.map(async (rate) => {
    const results = await Promise.all(distances.flatMap((distance) => walking.map((pace) =>
      play({ trial: "arrive", model, held, legs, distance, rate, stretch, walking: pace, hz }))));
    lag = results[0].lag; speed = results[0].below;
    const tried = results.filter((r) => r.reachable), stood = tried.filter((r) => !r.fell);
    return { past: stood.length ? +Math.max(...stood.map((r) => r.past)).toFixed(3) : null, fell: tried.length - stood.length, trials: tried.length };
  }));
  return { ...(stretch === "below" ? { speed } : {}), lag, past: rows.map((r) => r.past), fell: rows.map((r) => r.fell), trials: rows.map((r) => r.trials) };
}

let measured;
try {
  for (let i = 0; i < lanes; i++) {
    const worker = simulationWorker(new URL("./stance-worker.mjs", import.meta.url));
    worker.idle = true; pool.push(worker); feed(worker);
  }
  measured = Object.fromEntries(await Promise.all(models.map(async (model) => [model, Object.fromEntries(await Promise.all(holds.map(async (held) =>
    [held, Object.fromEntries(await Promise.all(gaits.map(async (gait) => {
      const { key, battery, below } = GAITS[gait];
      const [under, reading] = await Promise.all([below ? curve(model, held, gait, below, "below") : null, curve(model, held, gait, battery, below ? "above" : "whole")]);
      return [key, under ? { ...reading, below: under } : reading];
    })))]))) ])));
} finally {
  clearInterval(progress);
  await Promise.all(pool.map((w) => w.terminate()));
}

const today = new Date().toISOString().slice(0, 10);
const asset = new URL("../../../../assets/skills/locomotion/stops.json", import.meta.url);
const kept = values.write ? JSON.parse(await readFile(asset, "utf8").catch(() => "{}")) : {};
const merged = structuredClone(kept.models ?? {});
for (const [model, byHeld] of Object.entries(measured)) for (const [held, byGait] of Object.entries(byHeld))
  for (const [key, reading] of Object.entries(byGait)) ((merged[model] ??= {})[held] ??= {})[key] = { measured: today, ...reading };
const stops = { harness: CORE_STANCE_HARNESS, hz,
  played: "each body in the guard, holding each of its holds, sent straight ahead to a place under the speed rule at each rate from a stand and from a walk (`arrive`); `past` the farthest past the place over the trials that stood, null where none did, `fell` how many fell",
  rates: RATES, walks: WALKS, runs: RUNS, models: merged };
console.log(`${played} trials in ${((Date.now() - started) / 1000).toFixed(0)} s`);
const text = `${JSON.stringify(stops, null, 2).replace(/\[[-\d.,\s(null)]*\]/g, (list) => list.replace(/\s+/g, "").replaceAll(",", ", "))}\n`;
if (values.out) await writeFile(values.out, text);
else if (values.write) await writeFile(asset, text);
else console.log(text);
