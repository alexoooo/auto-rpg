// One rollout at a time (`rollouts.mjs`): each job is answered only when its rollout is done.
// The option fork's hook is registered first, so a job may name an Option (`rollout`'s `option`);
// a job that names none plays as it did without it.
import { register } from "node:module";
import { parentPort } from "node:worker_threads";

register("./option-fork-hook.mjs", import.meta.url);
const { rollout } = await import("./rollouts.mjs");

parentPort.on("message", async ({ id, ...job }) => {
  try { parentPort.postMessage({ id, result: await rollout(job) }); }
  catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
});
