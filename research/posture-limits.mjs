/** Compare static witnesses with five-second engine holds under each Rapier limit model. */
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";

const { values } = parseArgs({ options: { workers: { type: "string", default: "3" },
  out: { type: "string", default: "research/runs/posture-limits" } }, strict: true });
const workers = Number(values.workers);
if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("workers must be positive");
// Development witness inputs and hold conditions: docs/reference/posture-limit-models.md.
const jobs = ["rapier", "rapier-coordinate"].flatMap((engine) => [
  { row: "fours" }, { row: "half kneel, knee light" }, { row: "squat", height: .5 },
].map((row) => ({ engine, ...row, trial: "audit", seed: 0, evals: 300, variant: "built", friction: "box" })));
const rows = new Array(jobs.length); let next = 0;
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
  while (next < jobs.length) {
    const index = next++, job = jobs[index];
    const worker = new Worker(new URL("./core-posture-worker.mjs", import.meta.url), { env: { ...process.env, CORE_ENGINE: job.engine } });
    const request = (task) => new Promise((resolve, reject) => {
      const cleanup = () => { worker.off("message", message); worker.off("error", failed); worker.off("exit", exited); };
      const failed = (error) => { cleanup(); reject(error); };
      const exited = (code) => failed(new Error(`posture worker exited during a task: ${code}`));
      const message = (reply) => { cleanup(); reply.error ? reject(new Error(reply.error)) : resolve(reply.result); };
      worker.once("message", message); worker.once("error", failed); worker.once("exit", exited); worker.postMessage(task);
    });
    try {
      const result = await request({ ...job, id: index });
      const hold = await request({ trial: "held", row: job.row, posture: result.posture,
        k: 1, drive: "side", solver: "game", seconds: 5, id: index });
      rows[index] = { job, result, hold };
      console.log(JSON.stringify(rows[index]));
    } finally { await worker.terminate(); }
  }
}));
await mkdir(values.out, { recursive: true });
await writeFile(`${values.out}/records.json`, JSON.stringify({
  harness: "Node statics, Warrior, no world step; engine and limit model named per row; no assistance; development witnesses",
  holdHarness: "Node core world, 120 Hz game solver, side-selected velocity-motor ceilings at 1x anatomical peak, five seconds; poses installed by the stand, not reached by a controller",
  rows,
}, null, 2) + "\n");
