/**
 * A worker of `rising-step-search.mjs`: given its battery (`jobs`), a candidate in the unit cube is
 * scored on every fall; given a `tuning`, one fall is run.
 */
import { parentPort, workerData } from "node:worker_threads";
import { stepFall, stepTuning } from "./rising-step-search.mjs";

parentPort.on("message", async ({ id, x }) => {
  if (workerData.tuning) { parentPort.postMessage({ id, r: await stepFall({ tuning: workerData.tuning, first: false, ...x }) }); return; }
  const tuning = stepTuning(x), rows = [];
  for (const job of workerData.jobs) rows.push(await stepFall({ tuning, ...job }));
  const falls = rows.filter(r => r.score !== null);
  parentPort.postMessage({ id, r: { score: falls.reduce((s, r) => s + r.score, 0) / Math.max(1, falls.length), stood: falls.filter(r => r.stood).length, of: falls.length,
    at: rows.map(r => r.verified && +r.verified.toFixed(1)), furthest: rows.map(r => r.furthest) } });
});
