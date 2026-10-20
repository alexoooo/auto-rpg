// One arena bout at a time (`bout.mjs`): each job is answered only when its bout is done.
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { playBout } from "./bout.mjs";

// A worker's row is its message: Babylon's banner for each bout's scene is not.
Logger.LogLevels = Logger.NoneLogLevel;

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await playBout(job.recipe, job.seconds, [], { shortfall: job.shortfall, blows: job.blows }) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
