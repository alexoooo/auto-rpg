import { parentPort, workerData } from "node:worker_threads";

import { runConstructRolloutJob } from "./construct-rollout-engine.mjs";

if (!parentPort) throw new Error("construct rollout worker requires a parent port");

for (const job of workerData.jobs) {
  try {
    const result = await runConstructRolloutJob(job, workerData.weights);
    parentPort.postMessage({ type: "row", index: job.index, result });
  } catch (error) {
    parentPort.postMessage({ type: "error", index: job.index,
      message: error instanceof Error ? error.stack ?? error.message : String(error) });
    break;
  }
}
