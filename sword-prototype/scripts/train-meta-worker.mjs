import { parentPort, workerData } from "node:worker_threads";
import { evaluateGenome } from "./training-evaluator.mjs";

if (!parentPort) throw new Error("train-meta-worker requires a worker thread");
const results = [];
for (const job of workerData.jobs) results.push({ index: job.index,
  result: await evaluateGenome(job.genome, workerData.baseSeed, job.split, job.cells) });
parentPort.postMessage(results);
