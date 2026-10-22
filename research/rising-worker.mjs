/** One independently built fall per job, stepped sequentially in each worker realm. */
import "../tests/harness/preload-data.mjs";
import { parentPort } from "node:worker_threads";
import { risingTrial } from "../src/evaluation/rising.ts";

if (parentPort) parentPort.on("message", async job => {
  try { parentPort.postMessage({ id: job.id, result: await risingTrial(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
