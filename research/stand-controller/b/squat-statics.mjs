/**
 * Fork B: the no-hands `squat` row (both soles bearing, symmetric) at low heights, margin first
 * (`margin-search.mjs`: the most support margin at a muscle share of at most `CAP`), for the Warrior
 * on the built ankle and with its dorsiflexion raised. Static, the posture audit's statics
 * (`research/core-posture-trials.mjs`).
 *
 *   node squat-statics.mjs [variants] [heights]     e.g. "built,dorsi0.6,dorsi0.7,dorsi0.8" "0.35,0.4,0.45,0.5"
 */
import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
const cap = Number(process.env.CAP ?? .6), model = process.env.MODEL ?? "workshop-fighter", evals = Number(process.env.EVALS ?? 1500);
const variants = (process.argv[2] ?? "built,dorsi0.6,dorsi0.7,dorsi0.8").split(",");
const heights = (process.argv[3] ?? "0.35,0.4,0.45,0.5").split(",").map(Number);
const jobs = variants.flatMap((variant) => heights.flatMap((height) => [0, 1, 2].map((seed) => ({ model, variant, row: "squat", height, seed, evals, objective: "margin", cap }))));
console.error(`${jobs.length} jobs`);
const t0 = Date.now(), out = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(16, jobs.length) }, () => new Promise((resolve, reject) => {
  const w = new Worker(new URL("../statics-worker.mjs", import.meta.url));
  const give = () => { if (next >= jobs.length) { w.terminate(); resolve(); return; } w.postMessage(jobs[next++]); };
  w.on("message", (m) => { out.push(m); if (out.length % 8 === 0) console.error(`${out.length}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`); give(); });
  w.on("error", reject); give();
})));
writeFileSync(new URL(`./squat-${model}${process.env.TAG ?? ""}.json`, import.meta.url), JSON.stringify(out));
const score = (r) => r.held ? 10 + r.margin : r.found && r.balanced ? r.margin : -10 + r.margin;
console.log(`${model}, ${jobs.length} squat searches, share cap ${cap}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log("| variant | height, m | verdict | share | margin, m | centre, m | pitch | ankle | knee | hip | lumbar | shoulder flex |");
for (const variant of variants) for (const height of heights) {
  const mine = out.filter((m) => m.variant === variant && m.height === height);
  const m = mine.reduce((a, b) => (score(b.rec) > score(a.rec) ? b : a)), r = m.rec, a = r.angles ?? {};
  console.log(`| ${variant} | ${height} | ${r.held ? "held" : !r.found ? `none found (${r.off > .001 ? "off " + r.off : "overlap " + r.overlap?.depth + " " + (r.overlap?.between ?? []).join("/")})` : !r.balanced ? "unbalanced" : "too weak"} | ${r.share ?? "-"} | ${r.margin} | ${r.height} | ${r.pitch} | ${a["ankle.right dorsiflexion"]} | ${a["knee.right flexion"]} | ${a["hip.right flexion"]} | ${a["lumbar flexion"]} | ${a["shoulder.right flexion"]} |`);
}
