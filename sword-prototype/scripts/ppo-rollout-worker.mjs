import { parentPort, workerData } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { collectPpoTrajectory, leagueControllers } from "./train-ppo.mjs";

Logger.LogLevels = Logger.NoneLogLevel;
if (!parentPort) throw new Error("ppo-rollout-worker.mjs is a worker-thread entry point");
const controllers = leagueControllers(workerData.models ?? []);
parentPort.on("message", async ({ id, request }) => {
  try { parentPort.postMessage({ id, value: await collectPpoTrajectory({ ...request, controllers }) }); }
  catch (error) { parentPort.postMessage({ id, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
});
parentPort.postMessage({ ready: true });
