// Many arena bouts, each in a world of its own on a worker thread (`bout-worker.mjs`).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";

/** The lanes a run takes unless told: all but two of the machine's threads. */
export const defaultLanes = () => Math.max(1, availableParallelism() - 2);

/**
 * Play every job (`{ recipe, seconds?, shortfall? }`, as `bout-worker.mjs` reads it) on `lanes`
 * workers, each worker one bout at a time, and give the rows in the jobs' order. A row comes back as
 * a message: no two workers share a file.
 */
export async function playBouts(jobs, lanes = defaultLanes()) {
  const rows = new Array(jobs.length);
  const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./bout-worker.mjs", import.meta.url)));
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
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
  return rows;
}
