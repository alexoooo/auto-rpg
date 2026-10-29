/** The hand-off statics: hands touching, the soles bearing all, by body variant. node statics.mjs [lanes] [evals] [seeds] [variants] */
import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
const [lanes = 18, evals = 1500, seeds = 3] = process.argv.slice(2, 5).map(Number);
const variants = (process.argv[5] ?? "built,dorsi0.6,dorsi0.8,dorsi1.0,foot0.04,foot0.08,foot0.12").split(",");
const model = process.env.MODEL ?? "workshop-fighter";
const rows = [...[0.5, 0.6, 0.7, 0.8].map((height) => ({ row: "squat, hands light", height })), { row: "hands and feet, hands light" }];
const jobs = variants.flatMap((variant) => rows.flatMap((r) => Array.from({ length: seeds }, (_, seed) => ({ model, variant, ...r, seed, evals }))));
const t0 = Date.now(), out = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
  const w = new Worker(new URL("./statics-worker.mjs", import.meta.url));
  const give = () => { if (next >= jobs.length) { w.terminate(); resolve(); return; } w.postMessage(jobs[next++]); };
  w.on("message", (m) => { out.push(m); if (out.length % 10 === 0) console.error(`${out.length}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`); give(); });
  w.on("error", reject);
  give();
})));
writeFileSync(new URL(`./statics-${model}.json`, import.meta.url), JSON.stringify(out));
const best = new Map();
for (const m of out) {
  const key = `${m.variant}|${m.rec.row}`, b = best.get(key);
  const score = (r) => r.held ? 10 - r.share : r.found ? r.margin : -10 + r.margin;
  if (!b || score(m.rec) > score(b)) best.set(key, m.rec);
}
console.log(`${model}, ${jobs.length} searches, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log("| variant | row | verdict | share | margin, m | centre, m | ankle | knee | hip | lumbar |");
for (const variant of variants) for (const [key, r] of best) if (key.startsWith(variant + "|"))
  console.log(`| ${variant} | ${r.row} | ${r.held ? "held" : !r.found ? `none found (overlap ${r.overlap.depth})` : !r.balanced ? "unbalanced" : "too weak"} | ${r.share ?? "-"} | ${r.margin} | ${r.height} | ${r.angles["ankle.right dorsiflexion"]} | ${r.angles["knee.right flexion"]} | ${r.angles["hip.right flexion"]} | ${r.angles["lumbar flexion"]} |`);
