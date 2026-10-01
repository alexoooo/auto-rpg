// Rollouts over worker threads (`rollout-worker.mjs`), each in a world of its own.
import { Worker } from "node:worker_threads";

/**
 * `lanes` workers that stay up between calls. `run(jobs)` gives the jobs' rows (`rollout`,
 * `rollouts.mjs`) in the jobs' order, a worker one rollout at a time and the jobs of every call
 * taken first come, first served; `close()` ends the workers.
 */
export function rolloutPool(lanes) {
  const workers = Array.from({ length: Math.max(1, lanes) }, () => new Worker(new URL("./rollout-worker.mjs", import.meta.url)));
  const idle = [...workers], queue = [], waiting = new Map();
  let nextId = 0;
  const pump = () => {
    while (idle.length > 0 && queue.length > 0) {
      const worker = idle.pop(), { job, resolve, reject } = queue.shift(), id = nextId++;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...job, id });
    }
  };
  for (const worker of workers) {
    worker.on("message", ({ id, result, error }) => {
      const { resolve, reject } = waiting.get(id);
      waiting.delete(id);
      idle.push(worker);
      if (error) reject(new Error(error)); else resolve(result);
      pump();
    });
  }
  return {
    run: (jobs) => Promise.all(jobs.map((job) => new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); pump(); }))),
    close: () => Promise.all(workers.map((worker) => worker.terminate())),
  };
}
