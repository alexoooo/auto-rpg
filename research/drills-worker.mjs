// One drill run per job, for `research/drills.mjs` through `runJobs` in `research/runner.mjs`: a
// worker thread holds one job at a time, and every run builds its worlds in Havok instances of
// their own (`tests/harness/drills.mjs`), so no two arenas ever share a realm at once.
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { runDrill } from "../tests/harness/drills.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const started = performance.now();
  const run = await runDrill({ drill: job.drill, subjectSetup: builds.get(job.leftBuild),
    opponentSetup: builds.get(job.rightBuild), seed: job.seeds[0], rungs: manifest.rungs });
  // `winner` is null because a drill run has none; `runJobs`' schedule check requires the field.
  return { ...job, status: "ok", winner: null, wallSeconds: (performance.now() - started) / 1000, run };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
