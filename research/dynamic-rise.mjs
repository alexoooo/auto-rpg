import { Worker } from "node:worker_threads";

/** Human baseline qualification on the gameplay engine, with sixteen fall directions per body/loadout. */
const args = process.argv.slice(2), at = args.indexOf("--workers");
const lanes = at < 0 ? 2 : Number(args[at + 1]);
if (!Number.isSafeInteger(lanes) || lanes < 1) throw new Error("--workers must be a positive integer");
const jobs = ["workshop-fighter", "workshop-rogue"].flatMap(model => ["empty", "club"].flatMap(held =>
  Array.from({ length: 16 }, (_, k) => ({ trial: "dynamicFall", model, held, degrees: k * 22.5, watch: 6 }))));
const rows = new Array(jobs.length), workers = [];
let next = 0;
try {
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./core-rise-worker.mjs", import.meta.url),
      { env: { ...process.env, CORE_ENGINE: "rapier-coordinate" }, stdout: true });
    worker.stdout.resume();
    workers.push(worker);
    worker.on("error", reject);
    const feed = () => {
      if (next === jobs.length) { resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        rows[id] = result;
        feed();
      });
      worker.postMessage({ ...jobs[id], id });
    };
    feed();
  })));
} finally { await Promise.all(workers.map(worker => worker.terminate())); }

const groups = ["workshop-fighter", "workshop-rogue"].flatMap(model => ["empty", "club"].map(held => {
  const selected = rows.filter(r => r.model === model && r.held === held);
  // A censored failure remains in the median instead of making successful outliers the whole sample.
  const times = selected.map(r => r.success ? r.seconds : Infinity).sort((a, b) => a - b);
  const median = (times[7] + times[8]) / 2, successes = selected.filter(r => r.success).length;
  return { model, held, trials: selected.length, falls: selected.filter(r => r.fell).length, successes,
    median: Number.isFinite(median) ? median : null, pass: successes >= 15 && median <= 4 };
}));
console.log(JSON.stringify({ harness: rows[0].harness, target: { median: 4, deadline: 6, minimum: "15 of 16 per group" },
  groups, pass: groups.every(g => g.pass), rows }, null, 2));
process.exitCode = groups.every(g => g.pass) ? 0 : 1;
