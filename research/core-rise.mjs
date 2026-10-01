/**
 * The battery of falls and its table (`docs/reference/rising.md#battery`): every model shoved
 * sixteen ways with the club in hand and with nothing, and the fall of each of the arena's nine
 * matchups, each watched for whether the body gets up (`core-rise-trials.mjs`). A line a cell: how
 * many fell, how many of those rose, the median seconds to rise, the median of the fastest a
 * segment moved while down, and the most the stance asked of the ground beyond its soles.
 *
 *   node research/core-rise.mjs [--workers 12]
 */
import { Worker } from "node:worker_threads";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { defaultLanes } from "./bout-pool.mjs";
import { LOADOUTS, RISE_HARNESS, UP_SECONDS, WATCH_SECONDS } from "./core-rise-trials.mjs";

const args = process.argv.slice(2);
const option = (name, otherwise) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
const lanes = Number(option("workers", defaultLanes()));

/** How many ways a body is shoved, evenly about up. */
const SHOVES = 16;
/** How far apart a bout's two stand, m: the arena's. */
const GAP = 4;

const cells = [];
for (const model of BODY_MODELS) for (const held of Object.keys(LOADOUTS)) {
  cells.push({ name: `${model}, ${held}, shoved`, jobs: Array.from({ length: SHOVES }, (_, k) => ({ trial: "shoved", model, held, degrees: k * 360 / SHOVES })) });
}
cells.push({
  name: "bouts",
  jobs: BODY_MODELS.flatMap((left) => BODY_MODELS.map((right) => ({ trial: "boutFall", recipe: { left, right, gap: GAP } }))),
});

/** Every job on `lanes` workers, each worker one fall at a time; the rows in the jobs' order, each back by message. */
async function run(jobs) {
  const rows = new Array(jobs.length);
  const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./core-rise-worker.mjs", import.meta.url)));
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        rows[id] = result;
        feed();
      });
      worker.postMessage({ ...jobs[id], id });
    };
    feed();
  })));
  return rows;
}

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fixed = (value, digits) => value === null ? "-" : Number.isFinite(value) ? value.toFixed(digits) : "inf";

const jobs = cells.flatMap((cell) => cell.jobs);
const rows = await run(jobs);
console.log(`${RISE_HARNESS}; watched ${WATCH_SECONDS} s from the fall, risen is ${UP_SECONDS} s up running; ${lanes} workers`);
console.log("| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights |");
console.log("|---|---|---|---|---|---|---|");
let at = 0;
for (const cell of cells) {
  const all = rows.slice(at, at += cell.jobs.length);
  // A shove the body holds and a bout nobody falls in are no falls: they are counted, and left out of the rates.
  const fell = all.filter((row) => row?.fell), rose = fell.filter((row) => row.risen);
  console.log(`| ${cell.name} | ${all.length} | ${fell.length} | ${rose.length} | ${fixed(median(rose.map((row) => row.seconds)), 2)} | ${fixed(median(fell.map((row) => row.peak)), 2)} | ${fixed(fell.length ? Math.max(...fell.map((row) => row.asked)) : null, 1)} |`);
}
