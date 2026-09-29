// One core stand at a time: each job is answered only when its strike is done (`core-strike.mjs`).
import { parentPort } from "node:worker_threads";
import { evaluateStrike } from "./core-strike.mjs";

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await evaluateStrike(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
