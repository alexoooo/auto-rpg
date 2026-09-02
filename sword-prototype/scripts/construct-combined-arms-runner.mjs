import { Worker } from "node:worker_threads";

const WORKER_URL = new URL("./construct-combined-arms-worker.mjs", import.meta.url);
const ENGINE_URL = new URL("./construct-combined-arms-worker-engine.mjs", import.meta.url);

const batchesFor = (assignments, count) => {
  const batches = Array.from({ length: count }, () => []);
  assignments.forEach((assignment, at) => batches[at % count].push(assignment));
  return batches;
};

const assignedIndexes = (batch) => new Set(batch.map(({ index }) => index));

const startWorker = (batch, engineUrl, engineOptions, onResult) => {
  const assigned = assignedIndexes(batch);
  const worker = new Worker(WORKER_URL, { workerData: {
    assignments: batch,
    engineUrl: engineUrl.href,
    engineOptions,
  } });
  let reportedError = null;
  const promise = new Promise((resolve, reject) => {
    worker.on("message", (message) => {
      if (message?.type === "result") {
        if (!assigned.has(message.index)) {
          reportedError = new Error(`combined-arms qualification worker returned unassigned job ${message.index}`);
          void worker.terminate();
          return;
        }
        assigned.delete(message.index);
        // The acknowledgement is backpressure, not ceremony. Without it a fast worker can put
        // every raw event stream in the parent port while a disk checkpoint is still being
        // written, making the nominally streamed path another corpus-sized allocation.
        void Promise.resolve(onResult(message.index, message.bout)).then(() => {
          worker.postMessage({ type: "accepted", index: message.index });
        }).catch((error) => {
          reportedError = new Error(`combined-arms qualification result callback for job ${message.index} failed: ${error.message}`, {
            cause: error,
          });
          void worker.terminate();
        });
      } else if (message?.type === "error") {
        reportedError = new Error(`combined-arms qualification worker job ${message.index}: ${message.message}`);
      }
    });
    worker.on("error", (error) => {
      const index = batch[0]?.index ?? "unknown";
      reject(new Error(`combined-arms qualification worker for job ${index} failed: ${error.message}`, {
        cause: error,
      }));
    });
    worker.on("exit", (code) => {
      if (reportedError) reject(reportedError);
      else if (code !== 0) reject(new Error(`combined-arms qualification worker for job ${batch[0]?.index ?? "unknown"} exited ${code}`));
      else if (assigned.size) reject(new Error(`combined-arms qualification worker omitted job ${Math.min(...assigned)}`));
      else resolve();
    });
  });
  return Object.freeze({ promise, terminate: () => worker.terminate() });
};

/**
 * Run fixed indexed qualification jobs in isolated JavaScript/Havok realms. A worker owns one
 * engine realm and consumes its batch sequentially; only the parent publishes results.
 */
export async function runCombinedArmsJobsInWorkers({
  assignments,
  workers,
  engineUrl = ENGINE_URL,
  engineOptions = {},
  onResult = null,
  retainResults = undefined,
} = {}) {
  if (!Array.isArray(assignments)) throw new Error("combined-arms qualification assignments must be an array");
  if (!Number.isSafeInteger(workers) || workers <= 0) {
    throw new Error("combined-arms qualification workers must be a positive safe integer");
  }
  const indexes = assignments.map(({ index }) => index);
  if (indexes.some((index) => !Number.isSafeInteger(index) || index < 0) ||
      new Set(indexes).size !== indexes.length) {
    throw new Error("combined-arms qualification assignments require unique nonnegative job indexes");
  }
  const retains = retainResults ?? onResult === null;
  if (typeof retains !== "boolean") throw new Error("combined-arms qualification result retention must be boolean");
  if (onResult !== null && typeof onResult !== "function") {
    throw new Error("combined-arms qualification result callback must be a function");
  }
  const publish = onResult ?? (() => {});
  const output = retains ? new Array(assignments.length) : null;
  if (!assignments.length) return output;
  const positionByIndex = new Map(indexes.map((index, position) => [index, position]));
  const count = Math.min(workers, assignments.length);
  const running = batchesFor(assignments, count).map((batch) => startWorker(batch, engineUrl,
    engineOptions, async (index, bout) => {
      if (output !== null) output[positionByIndex.get(index)] = bout;
      await publish(index, bout);
    }));
  try {
    await Promise.all(running.map(({ promise }) => promise));
  } catch (error) {
    await Promise.allSettled(running.map(({ terminate }) => terminate()));
    throw error;
  }
  return output;
}
