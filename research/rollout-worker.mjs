// One rollout at a time (`rollouts.mjs`): each job is answered only when its rollout is done.
import { parentPort } from "node:worker_threads";
import { rollout } from "./rollouts.mjs";

parentPort.on("message", async ({ id, ...job }) => {
  try { parentPort.postMessage({ id, result: await rollout(job) }); }
  catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
});
