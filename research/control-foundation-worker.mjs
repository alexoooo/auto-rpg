/** One sequential stream of isolated physical trials per worker. */
import { parentPort } from "node:worker_threads";
import { foundationTrial } from "./control-foundation-trials.mjs";

parentPort.on("message", async ({ index, job }) => {
  try { parentPort.postMessage({ index, result: await foundationTrial(job) }); }
  catch (error) { parentPort.postMessage({ index, error: String(error?.stack ?? error) }); }
});
