import { parentPort, workerData } from "node:worker_threads";

if (!parentPort) throw new Error("construct bout worker requires a parent port");

const engine = await import(workerData.engineUrl);
if (typeof engine.runConstructBoutJob !== "function") {
  throw new Error(`construct bout engine ${workerData.engineUrl} does not export runConstructBoutJob`);
}

for (const job of workerData.jobs) {
  try {
    const row = await engine.runConstructBoutJob(job, workerData.engineOptions ?? {});
    parentPort.postMessage({ type: "row", row });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      job: job.index,
      message: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    break;
  }
}
