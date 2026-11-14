// One core stand at a time: each job is answered when its trial is done (`stance-trials.mjs`).
import { parentPort } from "node:worker_threads";
import { TRIALS } from "./stance-trials.mjs";

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await TRIALS[job.trial](job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
