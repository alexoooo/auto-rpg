/**
 * **Where each recipe lands** (`Recipe.window`, `src/core/skills/strikes.ts`): each recipe of
 * `assets/core/strikes.json` thrown as its search threw it, with the target moved from its place
 * along the heading and across it, one way at a time, in steps of `--step` m out to `--most`. A
 * recipe's window each way runs from its place out to the last stand-off at which it, and every
 * stand-off nearer, landed at `--keep` of its reading at its place or better, at every rate of
 * `--hz`. A fist's reading is its forward speed into the sphere (`evaluateStrike`), a club's the
 * energy of its blow (`evaluateClubStrike`). Node core stand, Rapier; each throw on a worker of
 * its own stand.
 *
 *   node research/core-strike-window.mjs [--write] [--hz 120,480] [--step 0.02] [--most 0.16] [--keep 0.95] [--workers 14]
 *
 * Prints each recipe's readings, and with `--write` puts the windows into the asset.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const ASSET = new URL("../assets/core/strikes.json", import.meta.url);

if (isMainThread) {
  const { values } = parseArgs({ options: {
    write: { type: "boolean", default: false }, hz: { type: "string", default: "120,480" }, step: { type: "string", default: "0.02" },
    most: { type: "string", default: "0.16" }, keep: { type: "string", default: "0.95" }, workers: { type: "string" },
  } });
  const rates = values.hz.split(",").map(Number), step = Number(values.step), most = Number(values.most), keep = Number(values.keep);
  const asset = JSON.parse(await readFile(ASSET, "utf8"));
  const offsets = [];
  for (let k = -Math.round(most / step); k <= Math.round(most / step); k++) offsets.push(+(k * step).toFixed(6));
  const jobs = [];
  asset.recipes.forEach((recipe, r) => {
    for (const hz of rates) for (const way of ["along", "across"]) for (const d of offsets) {
      if (way === "across" && d === 0) continue;
      jobs.push({ r, hz, way, d, recipe });
    }
  });
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const started = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        jobs[id].result = result;
        if (++done % 20 === 0) process.stderr.write(`${done}/${jobs.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        feed();
      });
      worker.postMessage(jobs[id]);
    };
    feed();
  })));
  const harness = "Node core stand, Rapier, standing on its feet as built, ground on; each recipe thrown from standing in the guard";
  console.log(`Recipes' windows: landing at ${keep} of the reading at the place or better, at ${rates.join(" and ")} Hz; ${harness}`);
  asset.recipes.forEach((recipe, r) => {
    const reading = (hz, way, d) => {
      const job = jobs.find((j) => j.r === r && j.hz === hz && j.way === (d === 0 ? "along" : way) && j.d === d);
      return job.result;
    };
    const holds = (way, d) => rates.every((hz) => {
      const at = reading(hz, way, d), home = reading(hz, "along", 0);
      return at.landed && home.landed && at.score >= keep * home.score;
    });
    const edge = (way, sense) => {
      let last = 0;
      for (const d of offsets.filter((o) => sense * o > 0).sort((a, b) => sense * (a - b))) {
        if (!holds(way, d)) break;
        last = d;
      }
      return last;
    };
    const window = { along: [edge("along", -1), edge("along", 1)], across: [edge("across", -1), edge("across", 1)] };
    console.log(`${recipe.model} ${recipe.held}: along ${window.along.map((v) => (100 * v).toFixed(0)).join(" to ")} cm, `
      + `across ${window.across.map((v) => (100 * v).toFixed(0)).join(" to ")} cm`);
    for (const hz of rates) for (const way of ["along", "across"]) {
      console.log(`  ${hz} Hz ${way.padEnd(6)} ${offsets.map((d) => {
        const at = reading(hz, way, d);
        return at.landed ? at.score.toFixed(2) : "miss";
      }).join(" ")}`);
    }
    recipe.window = window;
  });
  console.log(`  offsets, cm: ${offsets.map((d) => (100 * d).toFixed(0)).join(" ")}`);
  asset.windows = `research/core-strike-window.mjs --hz ${values.hz} --step ${step} --most ${most} --keep ${keep}: `
    + `each recipe's window, where it landed at ${keep} of its reading at its place or better at every rate (${harness})`;
  if (values.write) await writeFile(ASSET, `${JSON.stringify(asset, null, 2)}\n`);
} else {
  const [{ Logger }, { evaluateStrike }, { evaluateClubStrike }] = await Promise.all([
    import("@babylonjs/core/Misc/logger.js"), import("./core-strike.mjs"), import("./core-club-strike.mjs")]);
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async ({ hz, way, d, recipe }) => {
    try {
      const given = { model: recipe.model, hz, hand: recipe.strike.hand, strike: recipe.strike, distance: recipe.distance, off: { [way]: d } };
      const r = recipe.held === "fist" ? await evaluateStrike(given) : await evaluateClubStrike(given);
      parentPort.postMessage({ result: { score: r.score, landed: r.at !== null && !r.fell } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
