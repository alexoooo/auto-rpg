import { parentPort, workerData } from "node:worker_threads";

if (!parentPort) throw new Error("combined-arms qualification worker requires a parent port");

const engine = await import(workerData.engineUrl);
if (typeof engine.runCombinedArmsQualificationBout !== "function") {
  throw new Error(`combined-arms qualification engine ${workerData.engineUrl} does not export runCombinedArmsQualificationBout`);
}

// Sequential execution is part of the contract. Havok keeps realm-global wasm state, so two
// arenas must never be alive concurrently inside this worker even though each bout is async.
for (const { index, job } of workerData.assignments) {
  try {
    const bout = await engine.runCombinedArmsQualificationBout(job, workerData.engineOptions ?? {});
    parentPort.postMessage({ type: "result", index, bout });
    await new Promise((resolve, reject) => {
      const receive = (message) => {
        if (message?.type !== "accepted" || message.index !== index) {
          parentPort.off("message", receive);
          reject(new Error(`combined-arms qualification worker received invalid acknowledgement for job ${index}`));
          return;
        }
        parentPort.off("message", receive);
        resolve();
      };
      parentPort.on("message", receive);
    });
  } catch (error) {
    parentPort.postMessage({ type: "error", index,
      message: error instanceof Error ? error.stack ?? error.message : String(error) });
    break;
  }
}
