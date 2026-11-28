// One rollout at a time (`rollouts.mjs`): each job is answered only when its rollout is done.
// The option fork's hook and the move prior's are registered first, so a job may name an Option
// and measure its run (`rollout`'s `option` and its `measure`); a job that does neither plays as it did without them.
import { register } from "node:module";
import { parentPort } from "node:worker_threads";

register("./option-fork-hook.mjs", import.meta.url);
register("./minds/move-prior-hook.mjs", import.meta.url);
const { rollout } = await import("./rollouts.mjs");

parentPort.on("message", async ({ id, ...job }) => {
  try { parentPort.postMessage({ id, result: await rollout(job) }); }
  catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
});
