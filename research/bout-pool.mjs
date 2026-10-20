// Many arena bouts, each in a world of its own on a worker thread (`bout-worker.mjs`).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { BUILD_IDENTITY } from "../src/build-identity.ts";
import { ORDERS_PROTOCOL } from "../src/arena/duel.ts";
import { requireRecordingIdentity } from "../src/core/recording.ts";

/** The lanes a run takes unless told: all but two of the machine's threads. */
export const defaultLanes = () => Math.max(1, availableParallelism() - 2);

/**
 * Play every job (`{ recipe, seconds?, shortfall?, blows? }`, as `bout-worker.mjs` reads it) on `lanes`
 * workers, each worker one bout at a time, and give the rows in the jobs' order. A row comes back as
 * a message: no two workers share a file. Each row is handed to `onRow` with its job's index as it
 * comes, so a long run keeps what it has played.
 */
export async function playBouts(jobs, lanes = defaultLanes(), onRow = () => {}) {
  const rows = new Array(jobs.length);
  const pool = [];
  let next = 0, failed = false;
  try {
    for (let lane = 0; lane < Math.min(lanes, jobs.length); lane++) pool.push(new Worker(new URL("./bout-worker.mjs", import.meta.url)));
    await Promise.all(pool.map(worker => new Promise((resolve, reject) => {
      let finished = false;
      const fail = error => { failed = true; reject(error); };
      worker.once("error", fail);
      worker.once("exit", code => { if (!finished && !failed) fail(new Error(`bout worker exited before its result (${code})`)); });
      const feed = () => {
        if (next >= jobs.length) { finished = true; resolve(); return; }
        const id = next++;
        worker.once("message", ({ result, error }) => {
          if (failed) return;
          try {
            if (error) throw new Error(error);
            const identity = result?.recording?.identity;
            if (typeof identity?.configuration !== "string") throw new Error("bout worker returned no recording identity");
            requireRecordingIdentity(identity, { build: BUILD_IDENTITY, protocol: ORDERS_PROTOCOL, configuration: identity.configuration });
            onRow(result, id);
            rows[id] = result;
            feed();
          } catch (error) { fail(error); }
        });
        worker.postMessage({ ...jobs[id], id });
      };
      feed();
    })));
    return rows;
  } finally {
    failed = true;
    await Promise.all(pool.map(worker => worker.terminate()));
  }
}
