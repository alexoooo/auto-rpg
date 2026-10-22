/** Each candidate's eight starts are sequential in one realm. */
import "../tests/harness/preload-data.mjs";
import { parentPort, workerData } from "node:worker_threads";
import { techniqueTrial } from "../src/evaluation/rising.ts";
import { plantSettings, searchStarts, techniqueScore } from "./rising-search.mjs";

parentPort.on("message", async ({ id, x }) => {
  try {
    const tuning = plantSettings(x), rows = [];
    for (const start of searchStarts(workerData.stage)) rows.push(await techniqueTrial({ ...start, tuning, model: workerData.model, factor: workerData.factor }));
    parentPort.postMessage({ id, r: { score: techniqueScore(rows), reached: rows.filter(row => row.reached).length,
      survived: rows.filter(row => row.survived).length, rows } });
  } catch (error) { throw new Error(`rising candidate ${id}: ${error?.stack ?? error}`); }
});
