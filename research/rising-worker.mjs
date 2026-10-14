/** One independently built fall per job, stepped sequentially in each worker realm. */
import { parentPort } from "node:worker_threads";
import { risingTrial } from "./rising-trial.mjs";

if (parentPort) parentPort.on("message", async job => {
  try { parentPort.postMessage({ id: job.id, result: await risingTrial(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
