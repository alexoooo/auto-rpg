/**
 * A search for the push: the push-off witness's four bear phases (`research/rise-witness.mjs`'s
 * encoding, a phase's lowest tenth of duration none) and the bridge's ease, height and pitch, each
 * candidate scored as the mean of `pushTrial` over the first `seeds` accepted starts. Diagonal CMA-ES.
 *
 *   node push-search.mjs --out runs/a [--model workshop-fighter] [--held empty] [--seeds 4] [--generations 60] [--workers 14] [--sigma .1]
 */
import { parentPort, isMainThread, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { cmaSearch, workerPool } from "../../research/cma.mjs";
import { armedWith } from "../../src/core/items/held.ts";
import { humanoidSpec } from "../../src/core/human/spec.ts";
import { phases, acceptedSeeds } from "../../research/rise-witness.mjs";
import { pushTrial } from "./push.mjs";

const EASE = [.2, 1.5], RISE = [.55, .9], PITCH = [0, 1.4];
const lin = (u, [lo, hi]) => lo + Math.min(1, Math.max(0, u)) * (hi - lo), unlin = (v, [lo, hi]) => (v - lo) / (hi - lo);
export function decode(spec, u) {
  const n = u.length - 3;
  return { plan: phases("push-off-bear", spec, u.slice(0, n)).filter((p) => p.duration > 0), bridge: { ease: lin(u[n], EASE), rise: lin(u[n + 1], RISE), pitch: lin(u[n + 2], PITCH) } };
}
async function candidate({ model, held, seeds, u }) {
  const spec = armedWith(humanoidSpec(model), "right", held), { plan, bridge } = decode(spec, u);
  const rows = [];
  for (const seed of seeds) rows.push(await pushTrial({ model, held, seed, plan, bridge }));
  const score = rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length;
  return { score, stood: rows.filter((r) => r.verified !== null).length, times: rows.map((r) => r.verified), climbs: rows.filter((r) => r.climbAt !== null).length };
}
if (!isMainThread && workerData.harness === "push-search") {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await candidate({ ...workerData, u: x }) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: 0, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("push-search.mjs")) {
  const { values } = parseArgs({ options: { out: { type: "string" }, model: { type: "string" }, held: { type: "string" }, seeds: { type: "string" },
    generations: { type: "string" }, workers: { type: "string" }, sigma: { type: "string" }, start: { type: "string" } } });
  const model = values.model ?? "workshop-fighter", held = values.held ?? "empty", spec = armedWith(humanoidSpec(model), "right", held);
  const seeds = acceptedSeeds("push-off-bear", spec, Number(values.seeds ?? 4));
  const witness = JSON.parse(readFileSync("../../assets/research/rise-witness/push-off-bear.json", "utf8"));
  const start = values.start ? JSON.parse(readFileSync(values.start, "utf8")).u : [...witness.u, unlin(.8, EASE), unlin(.75, RISE), unlin(.8, PITCH)];
  await mkdir(dirname(values.out), { recursive: true });
  const workers = Number(values.workers ?? 14), t0 = Date.now();
  const pool = workerPool(new URL(import.meta.url), { harness: "push-search", model, held, seeds }, workers);
  try {
    const result = await cmaSearch({ n: start.length, start, sigma: Number(values.sigma ?? .1), lambda: workers, generations: Number(values.generations ?? 60), seed: 11,
      score: (u) => pool.evaluate(u),
      async onGeneration(entry, progress) {
        const s = Math.round((Date.now() - t0) / 1000);
        await writeFile(`${values.out}.best.json`, JSON.stringify({ model, held, seeds, ...progress.best }));
        await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: progress.best.score, r: progress.best.r, s }) + "\n");
        console.log(JSON.stringify({ g: entry.g, best: +entry.best.toFixed(3), median: +entry.median.toFixed(3), bestSoFar: +progress.best.score.toFixed(3), stood: progress.best.r.stood, times: progress.best.r.times, s }));
      } });
    console.log(JSON.stringify({ best: result.best.score, r: result.best.r }));
  } finally { await pool.terminate(); }
}
