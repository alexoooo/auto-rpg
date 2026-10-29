/** The hands-bearing start: `hands and feet` searched (least share) on the Warrior with a 12 cm longer foot and the Rogue as built. */
import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
const jobs = [["workshop-fighter", "foot0.12"], ["workshop-rogue", "built"]].flatMap(([model, variant]) => [0, 1, 2].map((seed) => ({ model, variant, row: "hands and feet", seed, evals: 1500 })));
const out = []; let next = 0;
await Promise.all(Array.from({ length: jobs.length }, () => new Promise((resolve) => { const w = new Worker(new URL("./statics-worker.mjs", import.meta.url));
  const give = () => { if (next >= jobs.length) { w.terminate(); resolve(); return; } w.postMessage(jobs[next++]); };
  w.on("message", (m) => { out.push(m); give(); }); give(); })));
writeFileSync(new URL("./hands-feet.json", import.meta.url), JSON.stringify(out));
for (const m of out) console.log(m.model, m.variant, m.seed, m.rec.held, m.rec.share, m.rec.margin, m.rec.height, JSON.stringify(m.rec.forces));
