// One Havok arena at a time: each job is answered only when its bout is done.
// `workerData.globals` are set before any source loads; `workerData.patches` overwrite fields of
// exported tables ({ module, export, path?, set }), so a candidate body is searched without editing it.
import { parentPort, workerData } from "node:worker_threads";

for (const [key, value] of Object.entries(workerData?.globals ?? {})) globalThis[key] = value;
for (const patch of workerData?.patches ?? []) {
  let table = (await import(new URL(patch.module, import.meta.url).href))[patch.export];
  for (const key of patch.path ?? []) table = table[key];
  for (const [field, value] of Object.entries(patch.set)) table[field] = value;
}
const { evaluateStrike } = await import("./strike-eval.mjs");
parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await evaluateStrike(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
