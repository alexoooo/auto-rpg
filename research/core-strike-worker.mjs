// One core stand at a time: each job is answered only when its strike is done (`core-strike.mjs`,
// or `core-club-strike.mjs` for a club).
import { parentPort } from "node:worker_threads";
import { evaluateClubStrike } from "./core-club-strike.mjs";
import { evaluateStrike } from "./core-strike.mjs";

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ id: job.id, result: await (job.weapon === "club" ? evaluateClubStrike : evaluateStrike)(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
