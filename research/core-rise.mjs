/**
 * The battery of falls and its table (`docs/reference/rising.md#battery`): every model shoved
 * sixteen ways with the club in hand and with nothing, and the fall of each of the arena's nine
 * matchups, each watched for whether the body gets up (`core-rise-trials.mjs`). A line a cell: how
 * many fell, how many of those rose, the median seconds to rise, the median of the fastest a
 * segment moved while down, the most the stance asked of the ground beyond its soles, the
 * median and the longest of the seconds until the body last moved, and how many are up at the
 * watch's end. Then a line for each way a
 * cell's bodies lay: how many, how many of those rose, the furthest stage of the rise each
 * reached, and how many played the rise to its end.
 *
 *   node research/core-rise.mjs [--workers 12] [--mind '<MindConfig JSON>'] [--watch 15] [--only <text>]
 *     [--shoves 16] [--turn 0] [--falls]
 *
 * With `--mind` every body has that mind in place of the game's (`FIGHTER`); with `--watch` each
 * fall is watched that many seconds in place of `WATCH_SECONDS`; with `--only`, only the cells
 * whose name holds the text are run; with `--shoves`, each model is shoved that many ways; with `--turn`, every shove is
 * turned that many degrees further, a fresh set of falls to replicate a reading on; with `--falls`, a last table
 * has a line for each fall.
 */
import { Worker } from "node:worker_threads";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { defaultLanes } from "./bout-pool.mjs";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { LOADOUTS, RISE_HARNESS, UP_SECONDS, WATCH_SECONDS } from "./core-rise-trials.mjs";

const args = process.argv.slice(2);
const option = (name, otherwise) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
const lanes = Number(option("workers", defaultLanes()));
const given = option("mind", null), mind = given === null ? undefined : JSON.parse(given);
const watch = Number(option("watch", WATCH_SECONDS)), only = option("only", null), each = args.includes("--falls");

/** How many ways a body is shoved, evenly about up, unless `--shoves` says. */
const SHOVES = Number(option("shoves", 16));
/** Degrees every shove is turned by, unless `--turn` says. */
const TURN = Number(option("turn", 0));
/** How far apart a bout's two stand, m: the arena's. */
const GAP = 4;

const cells = [];
for (const model of BODY_MODELS) for (const held of Object.keys(LOADOUTS)) {
  cells.push({ name: `${model}, ${held}, shoved`, jobs: Array.from({ length: SHOVES }, (_, k) => ({ trial: "shoved", model, held, degrees: TURN + k * 360 / SHOVES })) });
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
      worker.postMessage({ ...jobs[id], mind, watch, id });
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

if (only !== null) cells.splice(0, cells.length, ...cells.filter((cell) => cell.name.includes(only)));
const jobs = cells.flatMap((cell) => cell.jobs);
const rows = await run(jobs);
console.log(`${RISE_HARNESS}; watched ${watch} s from the fall, risen is ${UP_SECONDS} s up running; mind ${given ?? "the game's"}; ${only === null ? "" : `cells holding "${only}"; `}${TURN === 0 ? "" : `shoves turned ${TURN} degrees; `}${lanes} workers`);
console.log("| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights | median s it last moved | the longest, s | up at the end |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
let at = 0;
/** Each cell's bodies that fell, by how they lay. */
const lay = new Map();
for (const cell of cells) {
  const all = rows.slice(at, at += cell.jobs.length);
  for (const row of all) if (row?.fell) lay.set(`${cell.name}, on its ${row.lie}`, [...lay.get(`${cell.name}, on its ${row.lie}`) ?? [], row]);
  // A shove the body holds and a bout nobody falls in are no falls: they are counted, and left out of the rates.
  const fell = all.filter((row) => row?.fell), rose = fell.filter((row) => row.risen);
  console.log(`| ${cell.name} | ${all.length} | ${fell.length} | ${rose.length} | ${fixed(median(rose.map((row) => row.seconds)), 2)} | ${fixed(median(fell.map((row) => row.peak)), 2)} | ${fixed(fell.length ? Math.max(...fell.map((row) => row.asked)) : null, 1)} | ${fixed(median(fell.map((row) => row.moved)), 2)} | ${fixed(fell.length ? Math.max(...fell.map((row) => row.moved)) : null, 2)} | ${fell.filter((row) => row.up).length} |`);
}
console.log("");
console.log("| falls, as the body lay | fell | rose | the furthest stage reached | played to the rise's end |");
console.log("|---|---|---|---|---|");
/** The furthest stages `fell` reached, each with how many reached it, in the rise's order. */
const stages = (fell) => ["none", ...RISE.rise.map((stage) => stage.name)]
  .map((name) => [name, fell.filter((row) => row.stage === name).length]).filter(([, count]) => count > 0)
  .map(([name, count]) => `${name}: ${count}`).join(", ") || "-";
for (const [name, fell] of [...lay].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`| ${name} | ${fell.length} | ${fell.filter((row) => row.risen).length} | ${stages(fell)} | ${fell.some((row) => row.ended !== null) ? fell.filter((row) => row.ended).length : "-"} |`);
}

if (each) {
  console.log("");
  console.log("| fall | how | lay on its | the furthest stage | rose, s | up at the end |");
  console.log("|---|---|---|---|---|---|");
  jobs.forEach((job, k) => {
    const row = rows[k];
    if (!row?.fell) return;
    const how = job.trial === "shoved" ? `${job.model}, ${job.held}, ${job.degrees} degrees` : `${job.recipe.left} against ${job.recipe.right}`;
    console.log(`| ${k} | ${how} | ${row.lie} | ${row.stage ?? "-"} | ${row.risen ? row.seconds.toFixed(2) : "-"} | ${row.up ? "up" : "down"} |`);
  });
}
