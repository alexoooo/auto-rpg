/**
 * **Where each recipe lands** (`Recipe.window`, `src/core/skills/strikes.ts`): each recipe of
 * `assets/core/strikes.json` thrown as its search threw it (`evaluateBlow`, `core-blow.mjs`), with
 * its target body moved from its place along the heading, across it and up, one way at a time,
 * in steps of `--step` m out to `--most`. A recipe's window each way runs from its place out to
 * the last stand-off at which it, and every stand-off nearer, landed, left its body up `WATCH`
 * seconds after its pushes, and did that way's share of the hit points it does at its place or
 * more, at every rate of `--hz`: `--keep` along the heading and across it, where the feet are set
 * to the window, and `--keep-up` up, where nothing sets a target's height and the blow outside
 * the window is another recipe's or a placed one. What a blow does, and not what it nets, is
 * what a window is read by: a blow that costs its hand more than it does its target nets under
 * nothing, and the less it lands the more it nets. Each stand-off's reading is the mean of
 * `--trials` throws, the first as written and the rest perturbed as a search's are, and it lands
 * where every one of them does. Node core stand, Rapier; each throw on a worker of its own stand.
 *
 *   node research/core-strike-window.mjs [--write] [--hz 120,480] [--step 0.02] [--most 0.6] [--keep 0.8] [--keep-up 0.5]
 *     [--trials 4] [--only <model>/<held>/<band>] [--spare <file>] [--workers 14] [--save readings.json] [--load readings.json,...]
 *
 * **A recipe the feet cannot be set to is not kept** (`setTo`): the skill sets each foot within
 * `PLACING.near` of its place and throws once the target stands in the window, so a recipe whose
 * window along the heading or across it is narrower than twice that is never thrown. It is taken
 * out of the asset. Its cell takes the next of its searches (`--spare`, the file
 * `research/core-strike-repertoire.mjs --spare` wrote), whose window is read in its turn, and
 * is thrown at by placement when none is left; the asset's `passed` and `placed` say which.
 *
 * Prints each recipe's readings, and with `--write` puts the windows into the asset. `--only`
 * reads one recipe and leaves the others' windows as they are. `--save` keeps every throw's
 * reading, and `--load` reads those it has in place of throwing them: the windows another
 * `--keep` gives, or the recipes read before. A reading is its recipe's by its cell and its place.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { PLACING } from "../src/core/skills/locomotion.ts";

const ASSET = new URL("../assets/core/strikes.json", import.meta.url);
/** The ways a target is moved from a recipe's place (`StandOff`); the reading at the place is kept under the first. */
const WAYS = ["along", "across", "up"];
/** What a mind cannot hold exactly from one blow to the next (`core-strike-search.mjs`). */
const TIMING = 1 / 240, LEVEL = 0.02;
/**
 * Seconds after its pushes a blow's body is watched: a body still stepping a second after them
 * is down within two or stands by three (`docs/reference/human-and-strikes.md#windows`).
 */
const WATCH = 3;

/** Whether the feet can be set to `window`: it is as wide as the feet are placed to, along the heading and across it. */
const setTo = (window) => ["along", "across"].every((way) => window[way][1] - window[way][0] > 2 * PLACING.near - 1e-9);

if (isMainThread) {
  const { values } = parseArgs({ options: {
    write: { type: "boolean", default: false }, hz: { type: "string", default: "120,480" }, step: { type: "string", default: "0.02" },
    most: { type: "string", default: "0.6" }, keep: { type: "string", default: "0.8" }, "keep-up": { type: "string", default: "0.5" },
    trials: { type: "string", default: "4" }, only: { type: "string" }, spare: { type: "string" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
  } });
  const rates = values.hz.split(",").map(Number), step = Number(values.step), most = Number(values.most), trials = Number(values.trials);
  /** The share of what it does at its place a recipe keeps inside its window, each way. */
  const keep = { along: Number(values.keep), across: Number(values.keep), up: Number(values["keep-up"]) };
  const asset = JSON.parse(await readFile(ASSET, "utf8"));
  const cell = (recipe) => `${recipe.model}/${recipe.held}/${recipe.band}`;
  const first = asset.recipes.filter((recipe) => !values.only || cell(recipe) === values.only);
  if (!first.length) throw new Error(`--only ${values.only} names no recipe: one of ${asset.recipes.map(cell).join(", ")}`);
  /** Which search each recipe of the asset is, and each cell's other searches in the order it takes them. */
  const spares = values.spare ? JSON.parse(await readFile(values.spare, "utf8")) : { from: {}, spare: [] };
  const offsets = [];
  for (let k = -Math.round(most / step); k <= Math.round(most / step); k++) offsets.push(+(k * step).toFixed(6));
  // The trials' draws, the same at every stand-off: the first is the strike as written.
  let state = 1;
  const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const draws = Array.from({ length: trials }, (_, k) => k === 0 ? { shift: 0, scale: 1 } : { shift: TIMING * (2 * uniform() - 1), scale: 1 + LEVEL * (2 * uniform() - 1) });
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const started = Date.now();
  const key = (job) => `${cell(job.recipe)}@${job.recipe.place.ahead} ${job.hz} ${job.way} ${job.d} ${job.trial}`;
  const loaded = new Map();
  for (const file of values.load?.split(",") ?? []) for (const [name, result] of JSON.parse(await readFile(file, "utf8"))) if (!loaded.has(name)) loaded.set(name, result);
  const { CORE_BLOW_HARNESS } = await import("./core-blow.mjs");
  const rule = `landing, up ${WATCH} s after its pushes, with ${keep.along} of the hit points it does at its place or more along and across, and ${keep.up} up, at every rate`;
  console.log(`Recipes' windows: ${rule} (${rates.join(" and ")} Hz), each reading the mean of ${trials}; ${CORE_BLOW_HARNESS}`);
  /** Every throw read, over the rounds; a round reads the recipes the round before put in a cell. */
  const every = [];
  const passed = [], placed = [];
  const narrow = (recipe) => `netting ${recipe.net} HP, has a window ${["along", "across"].map((way) => `${(100 * (recipe.window[way][1] - recipe.window[way][0])).toFixed(0)} cm ${way}`).join(" and ")}`;
  for (let read = first; read.length;) {
    const jobs = [];
    read.forEach((recipe, r) => {
      for (const hz of rates) for (const way of WAYS) for (const d of offsets) {
        if (way !== "along" && d === 0) continue;
        draws.forEach((perturbation, trial) => jobs.push({ r, hz, way, d, trial, perturbation, recipe }));
      }
    });
    for (const job of jobs) job.result = loaded.get(key(job));
    every.push(...jobs);
    const thrown = jobs.filter((job) => !job.result);
    if (values.load) process.stderr.write(`${jobs.length - thrown.length} of ${jobs.length} readings loaded
`);
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(lanes, thrown.length) }, () => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => {
        if (next >= thrown.length) { worker.terminate(); resolve(); return; }
        const id = next++;
        worker.once("message", ({ result, error }) => {
          if (error) { reject(new Error(error)); return; }
          thrown[id].result = result;
          if (++done % 200 === 0) process.stderr.write(`${done}/${thrown.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
          feed();
        });
        worker.postMessage(thrown[id]);
      };
      feed();
    })));
    read.forEach((recipe, r) => {
      const reading = (hz, way, d) => {
        const runs = jobs.filter((j) => j.r === r && j.hz === hz && j.way === (d === 0 ? "along" : way) && j.d === d).map((j) => j.result);
        return { landed: runs.every((run) => run.done > 0 && !run.fell), fell: runs.some((run) => run.fell), done: runs.reduce((sum, run) => sum + run.done, 0) / runs.length };
      };
      const holds = (way, d) => rates.every((hz) => {
        const at = reading(hz, way, d), home = reading(hz, "along", 0);
        return at.landed && home.landed && at.done >= keep[way] * home.done;
      });
      const edge = (way, sense) => {
        let last = 0;
        for (const d of offsets.filter((o) => sense * o > 0).sort((a, b) => sense * (a - b))) {
          if (!holds(way, d)) break;
          last = d;
        }
        return last;
      };
      const window = Object.fromEntries(WAYS.map((way) => [way, [edge(way, -1), edge(way, 1)]]));
      console.log(`${cell(recipe)}: ${WAYS.map((way) => `${way} ${window[way].map((v) => (100 * v).toFixed(0)).join(" to ")} cm`).join(", ")}`);
      for (const hz of rates) for (const way of WAYS) {
        console.log(`  ${hz} Hz ${way.padEnd(6)} ${offsets.map((d) => {
          const at = reading(hz, way, d);
          return at.landed ? at.done.toFixed(2) : at.fell ? "fell" : "miss";
        }).join(" ")}`);
      }
      recipe.window = window;
    });
    // A recipe the feet cannot be set to gives its cell to the cell's next search, read in the next round.
    const after = [];
    for (const recipe of read.filter((r) => !setTo(r.window))) {
      const name = cell(recipe), at = asset.recipes.indexOf(recipe), k = spares.spare.findIndex((s) => cell(s.recipe) === name);
      const line = `${name}: its recipe (${spares.from[name] ?? "the asset's"}), ${narrow(recipe)}, narrower than the ${(200 * PLACING.near).toFixed(0)} cm the feet are set to`;
      if (k < 0) {
        console.log(`  ${name} is not kept: its window is narrower than the ${(200 * PLACING.near).toFixed(0)} cm the feet are set to`);
        asset.recipes.splice(at, 1);
        placed.push(line);
        continue;
      }
      const [{ from, recipe: taken }] = spares.spare.splice(k, 1);
      console.log(`  ${name} is not kept: its window is narrower than the ${(200 * PLACING.near).toFixed(0)} cm the feet are set to; its cell takes ${from}`);
      asset.recipes[at] = taken;
      spares.from[name] = from;
      passed.push(line);
      after.push(taken);
    }
    read = after;
  }
  console.log(`  offsets, cm: ${offsets.map((d) => (100 * d).toFixed(0)).join(" ")}`);
  if (values.save) await writeFile(values.save, JSON.stringify(every.map((job) => [key(job), job.result])));
  asset.windows = `research/core-strike-window.mjs --hz ${values.hz} --step ${step} --most ${most} --keep ${keep.along} --keep-up ${keep.up} --trials ${trials}: `
    + `each recipe's window, ${rule} (${CORE_BLOW_HARNESS})`;
  // A cell left with no recipe is thrown at by placement, and every search of its that was passed over says why.
  const kept = new Set(asset.recipes.map(cell));
  asset.placed = [...(asset.placed ?? []), ...passed.filter((line) => !kept.has(line.split(": ")[0])), ...placed];
  asset.passed = [...(asset.passed ?? []), ...passed.filter((line) => kept.has(line.split(": ")[0]))];
  if (values.write) await writeFile(ASSET, `${JSON.stringify(asset, null, 2)}\n`);
} else {
  const { evaluateBlow } = await import("./core-blow.mjs");
  parentPort.on("message", async ({ hz, way, d, perturbation, recipe }) => {
    try {
      const r = await evaluateBlow({ model: recipe.model, held: recipe.held, hand: recipe.strike.hand, band: recipe.band, strike: recipe.strike,
        ahead: recipe.place.ahead, hz, perturbation, off: { [way]: d }, recover: WATCH });
      parentPort.postMessage({ result: { done: r.done, fell: r.fell, stood: r.stood } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
