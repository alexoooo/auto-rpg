/** The statics' "hands and toes" on a body variant: several searches in worker threads, each kept. */
import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
const variant = process.argv[2] ?? "dorsi0.8", seeds = [1, 2, 3, 4, 5, 6];
const out = await Promise.all(seeds.map((seed) => new Promise((resolve, reject) => {
  const w = new Worker(new URL("../statics-worker.mjs", import.meta.url));
  w.on("message", (m) => { w.terminate(); resolve(m); }); w.on("error", reject);
  w.postMessage({ model: "workshop-fighter", variant, row: "hands and toes", seed, evals: 1500 });
})));
writeFileSync(new URL(`./toes-${variant}.json`, import.meta.url), JSON.stringify(out));
for (const m of out) { const r = m.rec; console.log(JSON.stringify({ seed: m.seed, held: r.held, found: r.found, share: r.share, margin: r.margin, centre: r.height, pitch: r.pitch, ankle: r.angles?.["ankle.right dorsiflexion"], knee: r.angles?.["knee.right flexion"], hip: r.angles?.["hip.right flexion"], forces: r.forces })); }
