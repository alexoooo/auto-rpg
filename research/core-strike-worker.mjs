// One core stand at a time: each job is a blow (`evaluateBlow`, `core-blow.mjs`), answered only
// when it is done, with its reading; the blows it landed go with it only where the job asks (`blows`).
import { parentPort } from "node:worker_threads";
import { evaluateBlow } from "./core-blow.mjs";

parentPort.on("message", async ({ id, blows = false, ...job }) => {
  try {
    const { blows: landed, ...reading } = await evaluateBlow(job);
    parentPort.postMessage({ id, result: blows ? { ...reading, blows: landed } : reading });
  } catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
});
