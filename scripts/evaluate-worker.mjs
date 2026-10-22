// One evaluation case at a time (`scripts/evaluate.mjs`): each job is answered with its row when its case is done.
import "../tests/harness/preload-data.mjs";
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { playRow } from "../src/evaluation/play.ts";

// A worker's row is its message: Babylon's banner for each case's scene is not.
Logger.LogLevels = Logger.NoneLogLevel;

parentPort.on("message", async ({ evaluation, protocol, key, condition, world, seconds }) => {
  const cases = EVALUATIONS[evaluation]?.protocols[protocol];
  parentPort.postMessage(cases
    ? await playRow(key, world, seconds, (built) => cases.read(built, condition))
    : { key, reading: null, digest: null, fault: { kind: "error", message: `no cases for ${evaluation} ${protocol}` } });
});
