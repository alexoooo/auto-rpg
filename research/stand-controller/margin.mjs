/** The hand-off statics, margin first: the most support margin with hands touching and the soles bearing all, share at most CAP. */
import { Worker } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
const lanes = 18, evals = 1500, cap = Number(process.env.CAP ?? .6);
const model = process.env.MODEL ?? "workshop-fighter";
const variants = (process.argv[2] ?? "built,dorsi0.6,dorsi0.8,dorsi1.0,foot0.04,foot0.08,foot0.12,dorsi0.6+foot0.08").split(",");
const rows = [{ row: "hands and feet, hands light" }, ...[0.5, 0.6].map((height) => ({ row: "squat, hands light", height }))];
const first = (process.env.STARTS ?? "statics-workshop-fighter.json").split(",").flatMap((f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")));
const rowKey = (r) => r.height === undefined ? r.row : `${r.row} @ ${r.height.toFixed(2)} m`;
// Starts: the first pass's two best balanced witnesses of the row on any body, by margin, and two random seeds.
const starts = (r) => first.filter((m) => m.rec.row === rowKey(r) && m.rec.found && m.rec.balanced).sort((a, b) => b.rec.margin - a.rec.margin).slice(0, Number(process.env.TOP ?? 2)).map((m) => ({ start: m.rec.posture, from: `${m.model ?? ""}${m.variant}#${m.seed}` }));
const jobs = variants.flatMap((variant) => rows.flatMap((r) => [...starts(r), { from: "seed1" }, { from: "seed2" }].map((s, k) => ({ model, variant, ...r, seed: s.start ? 0 : k, evals, objective: "margin", cap, ...s }))));
console.error(`${jobs.length} jobs`);
const t0 = Date.now(), out = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
  const w = new Worker(new URL("./statics-worker.mjs", import.meta.url));
  const give = () => { if (next >= jobs.length) { w.terminate(); resolve(); return; } w.postMessage(jobs[next++]); };
  w.on("message", (m) => { out.push(m); if (out.length % 10 === 0) console.error(`${out.length}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`); give(); });
  w.on("error", reject); give();
})));
writeFileSync(new URL(`./margin-${model}${process.env.TAG ?? ""}.json`, import.meta.url), JSON.stringify(out));
const best = new Map();
const score = (r) => r.held && r.share <= cap ? 10 + r.margin : r.found && r.balanced ? r.margin : -10 + r.margin;
for (const m of out) { const key = `${m.variant}|${m.rec.row}`, b = best.get(key); if (!b || score(m.rec) > score(b.rec)) best.set(key, m); }
console.log(`${model}, ${jobs.length} margin searches, share cap ${cap}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log("| variant | row | verdict | share | margin, m | centre, m | pitch | ankle | knee | hip | lumbar | from |");
for (const variant of variants) for (const [key, m] of best) if (key.startsWith(variant + "|")) { const r = m.rec;
  console.log(`| ${variant} | ${r.row} | ${r.held ? "held" : !r.found ? `none found (${r.off > .001 ? "off " + r.off : "overlap " + r.overlap?.depth})` : !r.balanced ? "unbalanced" : "too weak"} | ${r.share ?? "-"} | ${r.margin} | ${r.height} | ${r.pitch} | ${r.angles["ankle.right dorsiflexion"]} | ${r.angles["knee.right flexion"]} | ${r.angles["hip.right flexion"]} | ${r.angles["lumbar flexion"]} | ${m.from} |`); }
