/**
 * How the arena's bouts end: every ordered pair of the core's bodies at each starting gap, each
 * bout to its verdict in a world of its own on a worker (`bout-worker.mjs`).
 *
 *   node research/bout-baseline.mjs [--gaps 3,4,5] [--workers 14]
 *
 * It prints the harness, a row for each bout (who won, how it ended, when, the blows that landed,
 * those that wounded, the clashes of striker on striker, each side's bar), and the totals: the bouts
 * by ending, the falls and the wounding blows for each minute of bout time, and the share of bouts
 * that ended before any blow wounded. A count over one bout is not a rate; the totals are read
 * over all of them.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { BOUT_HARNESS } from "./bout.mjs";

const { values } = parseArgs({ options: { gaps: { type: "string", default: "3,4,5" }, workers: { type: "string" } } });
const gaps = values.gaps.split(",").map(Number);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));

const jobs = [];
for (const gap of gaps) for (const left of BODY_MODELS) for (const right of BODY_MODELS) jobs.push({ recipe: { left, right, gap } });

const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./bout-worker.mjs", import.meta.url)));
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

const rows = jobs.map((job) => job.result);
console.log(`${BOUT_HARNESS}; ${rows.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log("| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const row of rows) {
  console.log(`| ${row.recipe.left} | ${row.recipe.right} | ${row.recipe.gap} | ${row.winner ?? "draw"} | ${row.ending} | ${row.seconds.toFixed(2)} | ${row.blows} | ${row.wounding} | ${row.clashes} | ${row.bars.map((bar) => bar.toFixed(2)).join(" | ")} |`);
}
const minutes = rows.reduce((sum, row) => sum + row.seconds, 0) / 60;
const endings = new Map();
for (const row of rows) endings.set(row.ending, (endings.get(row.ending) ?? 0) + 1);
const falls = rows.reduce((sum, row) => sum + row.fallen.length, 0), wounding = rows.reduce((sum, row) => sum + row.wounding, 0);
console.log(`\nBouts by ending: ${[...endings].map(([ending, count]) => `${ending} ${count}`).join(", ")}.`);
console.log(`Bout time ${(60 * minutes).toFixed(0)} s; falls a minute ${(falls / minutes).toFixed(2)} (${falls} falls); wounding blows a minute ${(wounding / minutes).toFixed(1)}.`);
console.log(`Ended before any wounding blow: ${rows.filter((row) => row.wounding === 0).length} of ${rows.length}.`);
