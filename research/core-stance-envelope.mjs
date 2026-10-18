/**
 * The core stance's envelope (`src/core/control/stance-envelope.ts`): the gait battery's walks, at
 * each speed five ways (forward, right, back, left, forward right) for 8 s and then a stop
 * (`walk` in `core-stance-trials.mjs`), on each core body as a fight plays it with each thing its
 * right hand holds (`HOLDS`: in the guard, under its character's balance) at the game's rate, each
 * trial on a worker of its own stand; how many held at each speed and the fastest held by the
 * envelope's rule, and each way's alone (`wayHeld`, `byWay`). Then the turn battery, walking forward at each speed up to its fastest walk forward: the
 * heading turned half round at each rate both ways (`turn`), beginning at each of `AFTERS` s
 * after the walk sets off, how many held at each rate (did not fall, and turned as asked:
 * `turnedAsAsked`) and the fastest held by the same rule, at each speed. Each body's readings are
 * over every thing held, the least of them, and again over each thing held alone (`holds`), which a
 * body holding it reads. With `--write` it writes `assets/core/stance-envelope.json`.
 *
 * With `--legs stride` the bodies walk and turn by the stride (`src/core/skills/stride.ts`) in
 * place of the stance's own walk, at the stride's speeds, and `--write` writes
 * `assets/core/stride-envelope.json`; with `--legs simbicon`, by the SIMBICON gait
 * (`src/core/skills/simbicon.ts`) told it may not run, at its walk's speeds, writing
 * `assets/core/simbicon-envelope.json`; with `--legs simbicon-run`, by it free to run, at its run's
 * speeds, writing `assets/core/simbicon-run-envelope.json`.
 *
 *   node research/core-stance-envelope.mjs [--legs stride|simbicon|simbicon-run] [--write] [--workers 14]
 *     [--config settings.json] [--physique '{"speed":1.25}'] [--out envelope.json] [--walks]
 *     [--gusts 1:20:1,2] [--solve]
 *
 * With `--legs simbicon --config` (or `simbicon-run`), the walk is the SIMBICON gait's with the settings in that file
 * (a `SimbiconConfig`, as the Lab's mind takes it) in place of its defaults; `--out` writes the
 * envelope to that file in place of the asset. `--physique` builds each body of that physique
 * (`Physique`, `src/core/human/physique.ts`) in place of its own. `--walks` measures the walks alone,
 * with no turns. `--gusts rate:strength:seeds` walks each walk calm and again in the lab's gusts
 * (`startWind`) on each seed, and a speed holds only if every one of them held: calm, as asked;
 * in the gusts, standing. `--solve` puts every body on the whole-body solve (`BodyOptions.solve`).
 */
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { HELD } from "../src/core/items/held.ts";
import { fastestHeld, turnedAsAsked, wentAsAsked } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { CORE_STANCE_HARNESS } from "./core-stance-trials.mjs";

/**
 * The gait battery's speeds, m/s, by the legs it measures: the stride's reach past the stance walk's;
 * the SIMBICON walk's take 1.5, just past the pace it runs from (`SimbiconSettings.run`), where it
 * first runs and is brought down to a walk again, and begin at 0.3: slower, a step's pendulum carries
 * the body on past the pace asked, or short of it (the Rogue asked 0.2 forward makes 0.34, and to its
 * forward right 0.13 along).
 */
const SIMBICON_SPEEDS = [0.3, 0.4, 0.5, 0.7, 1, 1.2, 1.4, 1.5, 1.7, 2, 2.5];
const SPEEDS_OF = { stance: [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.2, 1.4], stride: [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.2], simbicon: SIMBICON_SPEEDS, "simbicon-run": [...SIMBICON_SPEEDS, 3, 3.5, 4, 4.5] };
export const WAYS = [0, 90, 180, 270, 45];
/**
 * How long a walk trial sets off before it is measured and rests after, s, by the legs it measures
 * (`walk`): the run comes up to its pace and down from it at 0.6 m/s² (`RunCycleSettings.accel`,
 * `brake`), from 0 to 4.5 m/s and back in some 8 s each way.
 */
const TIMES_OF = { stance: {}, stride: {}, simbicon: {}, "simbicon-run": { setOff: 10, rest: 10 } };
export const MODELS = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
/**
 * The turn battery's rates, rad/s, by the legs it measures: the SIMBICON walk's finer, for its turns
 * set the Run's pace round a bend and a turn read between two rates is the slower's.
 */
const SIMBICON_RATES = [0.25, 0.35, 0.5, 0.7, 1, 1.4, 2, 4];
const RATES_OF = { stance: [0.25, 0.5, 1, 2, 4], stride: [0.25, 0.5, 1, 2, 4], simbicon: SIMBICON_RATES, "simbicon-run": SIMBICON_RATES };
export const SENSES = [1, -1];
/** What a fight puts in a body's right hand: every way a body is played is a way it must hold. */
export const HOLDS = HELD;
/**
 * When a turn begins, s after the walk sets off: every eighth of a second to 1.5, over the first
 * strides, where a turn meets the walk in any phase of its weight shift; and at 3, under way.
 */
export const AFTERS = [...Array.from({ length: 13 }, (_, k) => k / 8), 3];

const { values } = parseArgs({ options: { write: { type: "boolean", default: false }, workers: { type: "string" }, legs: { type: "string" }, config: { type: "string" }, out: { type: "string" }, physique: { type: "string" }, walks: { type: "boolean", default: false }, gusts: { type: "string" }, solve: { type: "boolean", default: false } } });
/** The winds each walk is walked in: calm, and the gusts on each seed asked. */
const WINDS = [null, ...(() => {
  if (!values.gusts) return [];
  const [rate, strength, seeds] = values.gusts.split(":");
  return seeds.split(",").map((seed) => ({ rate: Number(rate), strength: Number(strength), seed: Number(seed) }));
})()];
const physique = values.physique ? JSON.parse(values.physique) : undefined;
const legs = values.legs ?? null;
if (legs !== null && !Object.hasOwn(SPEEDS_OF, legs)) throw new Error(`no envelope is measured for legs ${legs}`);
const simbiconLegs = legs === "simbicon" || legs === "simbicon-run";
if (values.config && !simbiconLegs) throw new Error("--config gives a SIMBICON walk's settings: it needs --legs simbicon or simbicon-run");
/** What each trial walks by: the legs' name, or the SIMBICON walk's settings given, free to run as the legs say. */
const walker = values.config ? { ...JSON.parse(readFileSync(values.config, "utf8")), runs: legs === "simbicon-run" } : legs;
const SPEEDS = SPEEDS_OF[legs ?? "stance"], RATES = RATES_OF[legs ?? "stance"];
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

const walks = MODELS.flatMap((model) => SPEEDS.flatMap((speed) => WAYS.flatMap((degrees) => HOLDS.flatMap((held) => WINDS.map((wind) => ({ trial: "walk", model, speed, degrees, held, hz, stance: {}, legs: walker, physique, wind, solve: values.solve, ...TIMES_OF[legs] }))))));
await runAll(walks);
// A walk held if it did not fall and, calm, went the way asked at the pace asked: a gust throws a slow walk off its way, and is there to throw the body down.
const went = (j) => !j.result.fell && (j.wind !== null || wentAsAsked(j.result.along, j.result.across, j.speed));
// Each reading is over the things held `holds`: all of them, or one.
const walkHeld = (model, holds) => SPEEDS.map((speed) => walks.filter((j) => j.model === model && holds.includes(j.held) && j.speed === speed && went(j)).length);
/** At each speed, how many of the walks with each of `holds` held walking `degrees` round. */
const wayHeld = (model, holds, degrees) => SPEEDS.map((speed) => walks.filter((j) => j.model === model && holds.includes(j.held) && j.speed === speed && j.degrees === degrees && went(j)).length);
/** The gait battery's speeds up to `model`'s fastest walk forward with each of `holds`, the way a turn walks. */
const upTo = (model, holds) => {
  const forward = fastestHeld({ speeds: SPEEDS, ways: holds.length * WINDS.length, held: wayHeld(model, holds, 0) });
  return SPEEDS.filter((speed) => speed <= forward);
};
// Each thing held turns at the speeds up to its own fastest walk forward: the least of them, at those up to theirs.
const turns = values.walks ? [] : MODELS.flatMap((model) => HOLDS.flatMap((held) => upTo(model, [held]).flatMap((speed) => RATES.flatMap((rate) => SENSES.flatMap((sense) => AFTERS.map((after) => ({ trial: "turn", model, speed, rate, sense, held, after, hz, stance: {}, legs: walker, physique, solve: values.solve })))))));
await runAll(turns);
await Promise.all(pool.map((w) => w.terminate()));
const turnHeld = (model, holds, speed) => RATES.map((rate) => turns.filter((j) => j.model === model && holds.includes(j.held) && j.speed === speed && j.rate === rate && !j.result.fell && turnedAsAsked(j.result.lag)).length);

/** `model`'s readings over the things held `holds`. */
const readings = (model, holds) => ({
  held: walkHeld(model, holds), walk: fastestHeld({ speeds: SPEEDS, ways: WAYS.length * holds.length * WINDS.length, held: walkHeld(model, holds) }),
  wayTrials: holds.length * WINDS.length,
  wayHeld: WAYS.map((degrees) => wayHeld(model, holds, degrees)),
  byWay: WAYS.map((degrees) => fastestHeld({ speeds: SPEEDS, ways: holds.length * WINDS.length, held: wayHeld(model, holds, degrees) })),
  turnHeld: upTo(model, holds).map((speed) => turnHeld(model, holds, speed)),
  turns: upTo(model, holds).map((speed) => fastestHeld({ speeds: RATES, ways: SENSES.length * holds.length * AFTERS.length, held: turnHeld(model, holds, speed) })),
});
const models = Object.fromEntries(MODELS.map((model) => [model, {
  ...readings(model, HOLDS),
  holds: Object.fromEntries(HOLDS.map((held) => [held, readings(model, [held])])),
}]));
const envelope = { harness: CORE_STANCE_HARNESS, played: "each body built in the guard and holding it, under its character's balance (the rulebook's per cent), with each of `holds` in its right hand" + (legs ? `, walking by the ${legs}` : "") + (TIMES_OF[legs]?.setOff ? `, each walk set off ${TIMES_OF[legs].setOff} s before it is measured and resting ${TIMES_OF[legs].rest} s after` : "") + (WINDS.length > 1 ? ", each walk calm and in each of `winds`" : ""), ...(legs ? { legs } : {}), ...TIMES_OF[legs], hz, measured: new Date().toISOString().slice(0, 10), speeds: SPEEDS, ways: WAYS, rates: RATES, senses: SENSES, holds: HOLDS, afters: AFTERS, ...(WINDS.length > 1 ? { winds: WINDS.slice(1) } : {}), models };
console.log(`${CORE_STANCE_HARNESS}, ${hz} Hz; ${walks.length} walks and ${turns.length} turns in ${((Date.now() - started) / 1000).toFixed(0)} s`);
// Two-space JSON with each list of numbers on one line.
const text = `${JSON.stringify(envelope, null, 2).replace(/\[[-\d.,\s]*\]/g, (list) => list.replace(/\s+/g, "").replaceAll(",", ", "))}\n`;
console.log(text);
if (values.out) await writeFile(values.out, text);
else if (values.write) await writeFile(new URL(`../assets/core/${legs ?? "stance"}-envelope.json`, import.meta.url), text);
