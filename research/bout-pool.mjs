import { workerJobs } from "./worker-jobs.mjs";
// Many arena bouts, each in a world of its own on a worker thread (`bout-worker.mjs`).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { BUILD_IDENTITY } from "../src/app/node/build-identity.ts";
import { ORDERS_PROTOCOL } from "../src/game/arena/duel.ts";
import { requireRecordingIdentity } from "../src/core/world/recording.ts";

/** The lanes a run takes unless told: all but two of the machine's threads. */
export const defaultLanes = () => Math.max(1, availableParallelism() - 2);

/**
 * Play every job (`{ recipe, seconds?, shortfall?, blows? }`, as `bout-worker.mjs` reads it) on `lanes`
 * workers, each worker one bout at a time, and give the rows in the jobs' order. A row comes back as
 * a message: no two workers share a file. Each row is handed to `onRow` with its job's index as it
 * comes, so a long run keeps what it has played.
 */
export async function playBouts(jobs, lanes = defaultLanes(), onRow = () => {}) {
  return workerJobs(jobs, { lanes, create: () => new Worker(new URL("./bout-worker.mjs", import.meta.url)),
    message: (job, id) => ({ ...job, id }),
    result: ({ result }, _job, id) => {
      const identity = result?.recording?.identity;
      if (typeof identity?.configuration !== "string") throw new Error("bout worker returned no recording identity");
      requireRecordingIdentity(identity, { build: BUILD_IDENTITY, protocol: ORDERS_PROTOCOL, configuration: identity.configuration });
      onRow(result, id);
      return result;
    } });
}
