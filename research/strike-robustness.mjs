/**
 * **Where each recipe misses, and what a miss does to its body.** Each recipe of
 * `assets/core/strikes.json` thrown as its search threw it (`evaluateBlow`, `core-blow.mjs`):
 *
 * - at its target body moved from its place each of `--ways` (along the heading, across it, up) by
 *   each of `--offsets` (m, either way), as a body whose feet stood that far off its place throws: the skill aims where
 *   the place is and the target is not there; with `--seen`, as a target that moved under the blow
 *   once it was committed, the skill told so (`Throw.moved`) and turning after it (`STEER`, or
 *   `--steer`). A stand-off's reading is how many of `--trials`
 *   throws landed (the first as written, the rest perturbed as a search's are) and the mean of what
 *   they did, HP;
 * - at nothing, each throw traced (`balanceTrace`): how far the capture point ran and which way,
 *   whether it left the outline the stance steps from, the most the soles fell short of what the
 *   stance asked, and the steps the stance took to catch the body; at each of `--hz`.
 *
 * Node core stand, Rapier; each throw on a worker of its own stand.
 *
 *   node research/strike-robustness.mjs [--offsets 0.06,0.1,0.12] [--ways along,across] [--hz 120,480] [--trials 4] [--only <model>/<held>/<band>]
 *     [--seen] [--steer <rad>] [--workers 14] [--save rows.json] [--load rows.json,...]
 *
 * Prints, for each recipe, a line of its offsets' readings each way, and a line of its throws at
 * nothing at each rate. `--save` keeps every throw's reading, and `--load` reads those it has in
 * place of throwing them.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const ASSET = new URL("../assets/core/strikes.json", import.meta.url);
/** What a mind cannot hold exactly from one blow to the next (`core-strike-search.mjs`). */
const TIMING = 1 / 240, LEVEL = 0.02;
/** Seconds after its pushes a blow's body is watched (`core-strike-window.mjs`'s `WATCH`). */
const WATCH = 3;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    offsets: { type: "string", default: "0.06,0.1,0.12" }, ways: { type: "string", default: "along,across" }, hz: { type: "string", default: "120,480" }, trials: { type: "string", default: "4" },
    only: { type: "string" }, seen: { type: "boolean", default: false }, steer: { type: "string" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
  } });
  const ways = values.ways.split(","), sizes = values.offsets.split(",").map(Number), rates = values.hz.split(",").map(Number), trials = Number(values.trials);
  const offsets = [0, ...sizes.flatMap((d) => [-d, d])].sort((a, b) => a - b);
  const asset = JSON.parse(await readFile(ASSET, "utf8"));
  const cell = (recipe) => `${recipe.model}/${recipe.held}/${recipe.band}`;
  const recipes = asset.recipes.filter((recipe) => !values.only || cell(recipe) === values.only);
  for (const way of ways) if (!["along", "across", "up"].includes(way)) throw new Error(`--ways ${way}: along, across or up`);
  if (!recipes.length) throw new Error(`--only ${values.only} names no recipe: one of ${asset.recipes.map(cell).join(", ")}`);
  // The trials' draws, the same for every throw: the first is the strike as written.
  let seed = 1;
  const uniform = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const draws = Array.from({ length: trials }, (_, k) => k === 0 ? { shift: 0, scale: 1 } : { shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) });
  const jobs = [];
  recipes.forEach((recipe, r) => {
    draws.forEach((perturbation, trial) => {
      // The throw at the place is read once, as the first way's.
      for (const way of ways) for (const d of offsets) {
        if (way !== ways[0] && d === 0) continue;
        jobs.push({ r, kind: "off", hz: rates[0], way, d, trial, perturbation, recipe, seen: values.seen, ...(values.steer === undefined ? {} : { steer: Number(values.steer) }) });
      }
      for (const hz of rates) jobs.push({ r, kind: "nothing", hz, way: null, d: null, trial, perturbation, recipe });
    });
  });
  const key = (job) => `${cell(job.recipe)}@${job.recipe.place.ahead} ${job.kind} ${job.hz} ${job.way} ${job.d} ${job.trial}`;
  const loaded = new Map();
  for (const file of values.load?.split(",") ?? []) for (const [name, result] of JSON.parse(await readFile(file, "utf8"))) loaded.set(name, result);
  for (const job of jobs) job.result = loaded.get(key(job));
  const thrown = jobs.filter((job) => !job.result);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), started = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, thrown.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= thrown.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        thrown[id].result = result;
        if (++done % 100 === 0) process.stderr.write(`${done}/${thrown.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        feed();
      });
      const { result: _, ...job } = thrown[id];
      worker.postMessage(job);
    };
    feed();
  })));
  const { CORE_BLOW_HARNESS } = await import("./core-blow.mjs");
  console.log(`Recipes off their place and at nothing, ${trials} throws a reading, watched ${WATCH} s after the pushes; ${CORE_BLOW_HARNESS}`);
  console.log(`  off: landed of ${trials} and the mean done (HP), at ${rates[0]} Hz; offsets, cm: ${offsets.map((d) => (100 * d).toFixed(0)).join(" ")}`);
  console.log("  at nothing: steps the stance took to catch the body (each throw), the most the capture point ran back and forward, left and right of the soles' middle (cm),");
  console.log("  how far past the outline the stance steps from (cm), when it first left it (s from the pushes), the most the soles fell short (weights, N m), and falls");
  const cm = (v) => (100 * v).toFixed(0);
  recipes.forEach((recipe, r) => {
    console.log(`${cell(recipe)} (window ${ways.map((way) => `${way} ${recipe.window[way].map(cm).join(" to ")}`).join(", ")} cm)`);
    for (const way of ways) {
      console.log(`  ${way.padEnd(7)}${offsets.map((d) => {
        const runs = jobs.filter((j) => j.r === r && j.kind === "off" && j.way === (d === 0 ? ways[0] : way) && j.d === d).map((j) => j.result);
        const landed = runs.filter((run) => run.done > 0 && !run.fell).length, fell = runs.filter((run) => run.fell).length;
        return `${landed}/${runs.length}${fell ? `f${fell}` : ""} ${(runs.reduce((sum, run) => sum + run.done, 0) / runs.length).toFixed(2)}`.padStart(11);
      }).join("")}`);
    }
    for (const hz of rates) {
      const runs = jobs.filter((j) => j.r === r && j.kind === "nothing" && j.hz === hz).map((j) => j.result);
      const most = (f) => Math.max(...runs.map(f)), least = (f) => Math.min(...runs.map(f));
      const lefts = runs.map((run) => run.balance.left).filter((t) => t !== null);
      console.log(`  ${`${hz} Hz`.padEnd(7)} steps ${runs.map((run) => run.balance.recoveries).join(",")}`
        + `  back ${cm(-least((run) => run.balance.ahead[0]))} forward ${cm(most((run) => run.balance.ahead[1]))}`
        + `  left ${cm(-least((run) => run.balance.aside[0]))} right ${cm(most((run) => run.balance.aside[1]))}`
        + `  past ${cm(most((run) => run.balance.inner))}${lefts.length ? ` at ${Math.min(...lefts).toFixed(2)}` : ""}`
        + `  short ${most((run) => run.balance.force).toFixed(2)}, ${most((run) => run.balance.moment).toFixed(0)}`
        + `  fell ${runs.filter((run) => run.fell || !run.stood).length}`);
    }
  });
  console.log(`${jobs.length} throws, ${thrown.length} thrown, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  if (values.save) await writeFile(values.save, JSON.stringify(jobs.map((job) => [key(job), job.result])));
} else {
  const { balanceTrace, evaluateBlow } = await import("./core-blow.mjs");
  parentPort.on("message", async ({ kind, hz, way, d, perturbation, recipe, seen, steer }) => {
    try {
      let trace = null;
      const r = await evaluateBlow({ model: recipe.model, held: recipe.held, hand: recipe.strike.hand, band: recipe.band, strike: recipe.strike,
        ahead: recipe.place.ahead, hz, perturbation, recover: WATCH, seen, steer,
        ...(kind === "off" ? { off: { [way]: d } } : { dummy: false, trace: (body, blow) => (trace ??= balanceTrace(body)).take(body, blow) }) });
      parentPort.postMessage({ result: { done: r.done, fell: r.fell, stood: r.stood, balance: trace?.reading ?? null } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
