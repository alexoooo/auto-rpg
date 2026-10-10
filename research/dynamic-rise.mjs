import { Worker } from "node:worker_threads";
import { dynamicRiseQualification } from "./dynamic-rise-qualification.mjs";

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

const qualification = dynamicRiseQualification(rows);
console.log(JSON.stringify({ harness: rows[0].harness, ...qualification, rows }, null, 2));
process.exitCode = qualification.pass ? 0 : 1;
