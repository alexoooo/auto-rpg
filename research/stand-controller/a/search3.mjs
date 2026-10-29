/** A small CMA search over push3's gains, each candidate the mean score over the first `seeds` accepted starts. */
import { parentPort, isMainThread, workerData } from "node:worker_threads";
import { writeFile, appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { cmaSearch, workerPool } from "../../../research/cma.mjs";
import { trial } from "./ctl.mjs";
import { pushController, P } from "./push3.mjs";
export const KNOBS = { rockV: [.4, 1.6], rockH: [.2, .45], rockResp: [.2, .6], rockShin: [.2, .8], rockHand: [.05, .45], rockPitch: [.8, 1.7], sOnto: [.1, .45],
  ontoV: [-.8, .6], ontoHand: [0, .4], ontoResp: [.15, .5], sTarget: [-.1, .2], upPitch: [.6, 1.7], upH: [.4, .75], upTime: [.3, 1.2], upResp: [.15, .5], upHandMin: [0, .3], upFold: [0, 1], handOut: [.03, .3] };
const names = Object.keys(KNOBS);
export const decode = (u) => ({ ...P, ...Object.fromEntries(names.map((n, i) => [n, KNOBS[n][0] + Math.min(1, Math.max(0, u[i])) * (KNOBS[n][1] - KNOBS[n][0])])) });
const encode = (p) => names.map((n) => (p[n] - KNOBS[n][0]) / (KNOBS[n][1] - KNOBS[n][0]));
async function candidate({ seeds, model, held, u }) {
  const rows = [];
  for (const seed of seeds) rows.push(await trial({ seed, model, held, controller: pushController(decode(u)) }));
  return { score: rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length, stood: rows.filter((r) => r.verified !== null).length, times: rows.map((r) => r.verified), ends: rows.map((r) => r.failed ?? "ok") };
}
if (!isMainThread && workerData.harness === "search3") {
  parentPort.on("message", async ({ id, x }) => { try { parentPort.postMessage({ id, r: await candidate({ ...workerData, u: x }) }); } catch (e) { parentPort.postMessage({ id, r: { score: 0, error: String(e?.stack ?? e) } }); } });
} else if (process.argv[1]?.endsWith("search3.mjs")) {
  const { values } = parseArgs({ options: { out: { type: "string" }, generations: { type: "string" }, workers: { type: "string" }, seeds: { type: "string" }, model: { type: "string" }, held: { type: "string" } } });
  const seeds = (values.seeds ?? "1,2,3,4").split(",").map(Number), workers = Number(values.workers ?? 14), t0 = Date.now();
  const start = encode({ ...P, sOnto: .35, ontoV: -.3, sTarget: .08, upPitch: 1.3 });
  const pool = workerPool(new URL(import.meta.url), { harness: "search3", seeds, model: values.model ?? "workshop-fighter", held: values.held ?? "empty" }, workers);
  try {
    await cmaSearch({ n: start.length, start, sigma: .15, lambda: workers, generations: Number(values.generations ?? 40), seed: 5, score: (u) => pool.evaluate(u),
      async onGeneration(entry, progress) {
        await writeFile(`${values.out}.best.json`, JSON.stringify({ seeds, ...progress.best, p: decode(progress.best.u) }));
        await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, best: progress.best.score, r: progress.best.r }) + "\n");
        console.log(JSON.stringify({ g: entry.g, gen: +entry.best.toFixed(3), med: +entry.median.toFixed(3), best: +progress.best.score.toFixed(3), stood: progress.best.r.stood, times: progress.best.r.times, ends: progress.best.r.ends, s: Math.round((Date.now() - t0) / 1000) }));
      } });
  } finally { await pool.terminate(); }
}
