/**
 * A gait's envelope (`src/core/control/stance-envelope.ts`): on each core body as a fight plays it
 * with each thing its right hand holds (`HOLDS`: in the guard, under its character's balance), at
 * the game's rate, the fastest speed it walks each way (forward, right, back, left) at which every
 * trial held, and walking forward at each speed up to that, the fastest rate its heading turns half
 * round at which every trial held. Each body's readings are over every thing held, and again over
 * each alone (`holds`), which a body holding it reads.
 *
 * It plays only what that rule reads. Each way searches down from the fastest speed and stops at the
 * first speed whose trials all held; a speed stops at its first trial that did not hold (a fall, or
 * a walk or turn that did not go as asked: `wentAsAsked`, `turnedAsAsked`), and its trials not yet
 * begun are not played. A trial is played once a run: the readings over every thing held read the
 * trials each thing's own played.
 *
 *   node research/core-stance-envelope.mjs [--legs stance|walk-run] [--write] [--add] [--out file]
 *     [--models workshop-fighter,...] [--holds empty,club] [--walks] [--gusts 1:5:1,2,3,4] [--workers 30]
 *     [--physique '{"speed":1.25}'] [--toes]
 *
 * `--legs` names the walk measured: the stance's own (`stance`, the default), or the walk and run
 * free to run; `--write` writes `assets/core/<legs>-envelope.json`, `--out`
 * that file in place of it. `--models` and `--holds` screen a few bodies or things held first.
 * `--walks` measures the walks alone, with no turns. `--gusts rate:strength:seeds` walks each walk
 * calm and again in the lab's gusts (`startWind`) on each seed, and a speed holds only if every one
 * of them held: calm, as asked; in the gusts, standing. `--physique` builds each body of that
 * physique (`Physique`, `src/core/human/physique.ts`) in place of its own, and `--toes` with toes
 * (`src/core/human/toes.ts`). Each body's readings are kept under its key (`bodyKey`).
 *
 * `--add` writes the bodies measured into the asset as it stands, each with the day it was measured,
 * and keeps the others: the asset's grid (speeds, ways, rates, holds and the rest) must be this run's.
 */
import { readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";
import { HELD } from "../src/core/items/held.ts";
import { turnedAsAsked, wentAsAsked } from "../src/core/control/stance-envelope.ts";
import { modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { CORE_STANCE_HARNESS } from "./core-stance-trials.mjs";

/**
 * The battery's speeds, m/s, by the legs it measures: the walk and run's reach past the stance
 * walk's to the run's.
 */
const RUN_SPEEDS = [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.2, 1.4, 1.5, 1.7, 2, 2.5, 3, 3.5, 4, 4.5];
const SPEEDS_OF = { stance: [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.2, 1.4, 1.5, 1.7, 2, 2.5], "walk-run": RUN_SPEEDS };
/** The ways a walk is measured, degrees to the right of forward: the four `StanceEnvelope.ways` reads. */
const WAYS = [0, 90, 180, 270];
/**
 * How long a walk trial sets off before it is measured and rests after, s, by the legs it measures
 * (`walk`): the run comes up to its pace and down from it at 0.6 m/s² (`RunCycleSettings.accel`,
 * `brake`), from 0 to 4.5 m/s and back in some 8 s each way.
 */
const TIMES_OF = { stance: {}, "walk-run": { setOff: 10, rest: 10 } };
const MODELS = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
/**
 * The turn battery's rates, rad/s, by the legs it measures: the walk and run's finer, for its turns
 * set the Run's pace round a bend and a turn read between two rates is the slower's.
 */
const FINE_RATES = [0.25, 0.35, 0.5, 0.7, 1, 1.4, 2, 4];
const RATES_OF = { stance: [0.25, 0.5, 1, 2, 4], "walk-run": FINE_RATES };
const SENSES = [1, -1];
/**
 * When a turn begins, s after the walk sets off: every eighth of a second to 1.5, over the first
 * strides, where a turn meets the walk in any phase of its weight shift; and at 3, under way.
 */
const AFTERS = [...Array.from({ length: 13 }, (_, k) => k / 8), 3];

const { values } = parseArgs({ options: { write: { type: "boolean", default: false }, add: { type: "boolean", default: false }, workers: { type: "string" }, legs: { type: "string" },
  out: { type: "string" }, physique: { type: "string" }, toes: { type: "boolean", default: false }, walks: { type: "boolean", default: false }, gusts: { type: "string" },
  models: { type: "string" }, holds: { type: "string" } } });
const legs = values.legs ?? "stance";
if (!Object.hasOwn(SPEEDS_OF, legs)) throw new Error(`no envelope is measured for legs ${legs}`);
/** What each trial walks by: the legs' name, none for the stance's own. */
const walker = legs === "stance" ? null : legs;
const given = values.physique ? JSON.parse(values.physique) : undefined;
/** The character each trial's body is built with (`modelSpec`): the physique asked, and toes where asked. */
const physique = values.toes ? { ...given, toes: true } : given;
/** The key `model`'s readings are kept under: its body's (`bodyKey`). */
const keyOf = (model) => bodyKey(modelSpec(model, physique));
/** The winds each walk is walked in: calm, and the gusts on each seed asked. */
const WINDS = [null, ...(() => {
  if (!values.gusts) return [];
  const [rate, strength, seeds] = values.gusts.split(":");
  return seeds.split(",").map((seed) => ({ rate: Number(rate), strength: Number(strength), seed: Number(seed) }));
})()];
const pick = (given, all, what) => {
  if (!given) return all;
  const asked = given.split(",");
  for (const one of asked) if (!all.includes(one)) throw new Error(`no ${what} ${one}`);
  return asked;
};
const models = pick(values.models, MODELS, "model"), holds = pick(values.holds, HELD, "thing held");
const SPEEDS = SPEEDS_OF[legs], RATES = RATES_OF[legs], hz = PHYSICS_HZ.value;

/** The trials this run has played, by their inputs. */
const kept = new Map();

const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
const pool = Array.from({ length: lanes }, () => new Worker(new URL("./core-stance-worker.mjs", import.meta.url)));
const queue = [], counts = { played: 0, reused: 0, skipped: 0 }, started = Date.now();
/** Each idle worker takes the next trial whose search still wants it; a trial a search has given up on is not begun. */
function feed(worker) {
  let next;
  while ((next = queue.shift()) && next.group.done) { counts.skipped++; next.resolve(null); }
  if (!next) { worker.idle = true; return; }
  worker.idle = false;
  worker.once("message", ({ result, error }) => {
    if (error) { next.reject(new Error(error)); return; }
    kept.set(next.key, result); counts.played++;
    next.resolve(result);
    feed(worker);
  });
  worker.postMessage({ ...next.job, id: 0 });
}
for (const worker of pool) worker.idle = true;
/** `job`'s result: kept, or played on the pool; null where its search gave up on it before it began. */
function play(job, group) {
  const key = JSON.stringify(job);
  if (kept.has(key)) { counts.reused++; return Promise.resolve(kept.get(key)); }
  return new Promise((resolve, reject) => {
    queue.push({ job, key, group, resolve, reject });
    const idle = pool.find((w) => w.idle);
    if (idle) feed(idle);
  });
}
const progress = setInterval(() => {
  const seconds = (Date.now() - started) / 1000;
  console.error(`${seconds.toFixed(0)} s: ${counts.played} played (${(counts.played / seconds).toFixed(1)} a second), ${counts.reused} kept, ${counts.skipped} not begun, ${queue.length} queued`);
}, 20_000);

/**
 * **The fastest level at which every trial held**, searching down from the fastest (`levels`
 * slowest first): each level's trials (`trialsAt`) together, given up at the first that did not
 * hold (`ok`); 0 where none held. Each level tried gives how many of its trials held, or null where
 * the search gave up on it before all were played.
 */
async function fastest(levels, trialsAt, ok) {
  const tried = new Map();
  for (const level of [...levels].reverse()) {
    const group = { done: false }, jobs = trialsAt(level);
    const results = await Promise.all(jobs.map((job) => play(job, group).then((result) => {
      if (result !== null && !ok(job, result)) group.done = true;
      return result;
    })));
    const held = results.filter((result, i) => result !== null && ok(jobs[i], result)).length;
    tried.set(level, results.includes(null) ? null : held);
    if (held === jobs.length) return { top: level, tried };
  }
  return { top: 0, tried };
}

const walkJob = (model, held, degrees, speed, wind) => ({ trial: "walk", model, speed, degrees, held, hz, stance: {}, legs: walker, physique, wind, ...TIMES_OF[legs] });
const turnJob = (model, held, speed, rate, sense, after) => ({ trial: "turn", model, speed, rate, sense, held, after, hz, stance: {}, legs: walker, physique });
// A walk held if it did not fall and, calm, went the way asked at the pace asked: a gust throws a slow walk off its way, and is there to throw the body down.
const walked = (job, result) => !result.fell && (job.wind !== null || wentAsAsked(result.along, result.across, job.speed));
const turned = (_, result) => !result.fell && turnedAsAsked(result.lag);

/** `model`'s walks each way over `held`, each way's search together. */
const walksOf = (model, held) => Promise.all(WAYS.map((degrees) =>
  fastest(SPEEDS, (speed) => held.flatMap((h) => WINDS.map((wind) => walkJob(model, h, degrees, speed, wind))), walked)));
/** `model`'s turns over `held` at each speed up to `forward`, each speed's search together. */
const turnsOf = (model, held, forward) => values.walks ? Promise.resolve([]) : Promise.all(SPEEDS.filter((speed) => speed <= forward).map((speed) =>
  fastest(RATES, (rate) => held.flatMap((h) => SENSES.flatMap((sense) => AFTERS.map((after) => turnJob(model, h, speed, rate, sense, after)))), turned)));
/** A reading as the asset keeps it: each way's fastest (`byWay`), and how many held at each level it tried, null where not played through. */
const reading = (ways, turns, held) => ({
  byWay: ways.map((w) => w.top),
  wayTrials: held.length * WINDS.length,
  wayHeld: ways.map((w) => SPEEDS.map((speed) => w.tried.get(speed) ?? null)),
  turns: turns.map((t) => t.top),
  turnHeld: turns.map((t) => RATES.map((rate) => t.tried.get(rate) ?? null)),
});

// Each thing held alone first: what holds over all of them is read mostly from their rows.
const alone = Object.fromEntries(await Promise.all(models.map(async (model) => [model, Object.fromEntries(await Promise.all(holds.map(async (h) => {
  const ways = await walksOf(model, [h]);
  return [h, reading(ways, await turnsOf(model, [h], ways[0].top), [h])];
})))])));
const today = new Date().toISOString().slice(0, 10);
const all = Object.fromEntries(await Promise.all(models.map(async (model) => {
  const ways = await walksOf(model, holds);
  return [keyOf(model), { ...(values.add ? { measured: today } : {}), ...reading(ways, await turnsOf(model, holds, ways[0].top), holds), holds: alone[model] }];
})));
clearInterval(progress);
await Promise.all(pool.map((w) => w.terminate()));

const envelope = { harness: CORE_STANCE_HARNESS, played: "each body built in the guard and holding it, under its character's balance (the rulebook's per cent), with each of `holds` in its right hand"
  + (walker ? `, walking by the ${legs}` : "") + (TIMES_OF[legs]?.setOff ? `, each walk set off ${TIMES_OF[legs].setOff} s before it is measured and resting ${TIMES_OF[legs].rest} s after` : "")
  + (WINDS.length > 1 ? ", each walk calm and in each of `winds`" : "") + "; each way's and speed's fastest is the fastest at which every trial held, searched down from the fastest, and a level not played through is null",
  ...(walker ? { legs } : {}), ...TIMES_OF[legs], hz, measured: today,
  speeds: SPEEDS, ways: WAYS, rates: RATES, senses: SENSES, holds, afters: AFTERS, ...(WINDS.length > 1 ? { winds: WINDS.slice(1) } : {}), models: all };
const asset = new URL(`../assets/core/${legs}-envelope.json`, import.meta.url);
if (values.add) {
  // The asset as it stands takes this run's bodies, its grid unchanged: a body measured on another grid is no body of it.
  const kept = JSON.parse(await readFile(asset, "utf8"));
  for (const field of ["legs", "setOff", "rest", "hz", "speeds", "ways", "rates", "senses", "holds", "afters", "winds"])
    if (JSON.stringify(kept[field]) !== JSON.stringify(envelope[field])) throw new Error(`the asset's ${field} is not this run's: ${JSON.stringify(kept[field])} against ${JSON.stringify(envelope[field])}`);
  Object.assign(envelope, { ...kept, models: { ...kept.models, ...all } });
}
console.log(`${CORE_STANCE_HARNESS}, ${hz} Hz; ${counts.played} trials played, ${counts.reused} kept, ${counts.skipped} not begun, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
// Two-space JSON with each list of numbers on one line.
const text = `${JSON.stringify(envelope, null, 2).replace(/\[[-\d.,\s(null)]*\]/g, (list) => list.replace(/\s+/g, "").replaceAll(",", ", "))}\n`;
if (values.out) await writeFile(values.out, text);
else if (values.write || values.add) await writeFile(asset, text);
else console.log(text);
