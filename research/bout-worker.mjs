// One arena bout at a time (`bout.mjs`): each job is answered only when its bout is done.
import { parentPort } from "node:worker_threads";
import { playBout } from "./bout.mjs";

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await playBout(job.recipe, job.seconds) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
