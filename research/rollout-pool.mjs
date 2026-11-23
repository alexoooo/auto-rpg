// Rollouts over worker threads, with queued and active requests owned by their pool.
import { workerJobPool } from "./worker-jobs.mjs";
import { simulationWorker } from "../scripts/lanes.mjs";

/** Workers stay up between calls; close settles every outstanding rollout and rejects new work. */
export function rolloutPool(lanes) {
  return workerJobPool({ lanes, create: () => simulationWorker(new URL("./rollout-worker.mjs", import.meta.url)),
    message: (job, id) => ({ ...job, id }) });
}
