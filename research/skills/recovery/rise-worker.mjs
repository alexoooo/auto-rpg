// One fall at a time: each job is answered when its trial is done (`rise-trials.mjs`).
import { parentPort } from "node:worker_threads";
import { TRIALS } from "./rise-trials.mjs";

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await TRIALS[job.trial](job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
