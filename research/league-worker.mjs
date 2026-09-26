// One league bout per job, for `research/league.mjs` through `runJobs` in `research/runner.mjs`.
// A worker thread holds one job at a time and each bout gets a fresh Havok, because one realm runs
// one Havok arena at a time (AGENTS.md).
//
// Beside the bout's result it reads, once a frame, the two things only a frame-by-frame reader
// can: the lead (whose bar is higher, outside a dead band) and each body's falls (edges into
// `fallen` on its published support state).
import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { policyMind } from "../src/mind.ts";
Logger.LogLevels = Logger.ErrorLogLevel;

/**
 * A lead is a bar difference of more than this share of a bar. Inside it the lead stays with
 * whoever held it last, so two bodies trading scratches at level bars do not count as a change a
 * frame.
 */
export const LEAD_BAND = 0.02;

/** A frame-by-frame lead counter: feed it both bars, read `changes` at the end. */
export function leadCounter(band = LEAD_BAND) {
  let leader = null;
  let changes = 0;
  return {
    feed(left, right) {
      const now = left - right > band ? "left" : right - left > band ? "right" : leader;
      if (leader !== null && now !== leader) changes += 1;
      leader = now;
    },
    get changes() { return changes; },
    get leader() { return leader; },
  };
}

export async function execute(job, manifest) {
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const bout = createBout({ left: job.left, right: job.right,
    leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]),
    seeds: job.seeds, leftGolem: builds.get(job.leftBuild), rightGolem: builds.get(job.rightBuild),
    ...manifest.protocol, physics: await freshHavok() });
  const lead = leadCounter();
  const falls = { left: 0, right: 0 };
  const was = { left: "supported", right: "supported" };
  let result;
  let vitality;
  try {
    while (bout.step()) {
      lead.feed(bout.left.vitality, bout.right.vitality);
      for (const side of ["left", "right"]) {
        const support = bout[side].view?.self?.support ?? "supported";
        if (support === "fallen" && was[side] !== "fallen") falls[side] += 1;
        was[side] = support;
      }
    }
    result = bout.finish();
    vitality = [bout.left.vitality, bout.right.vitality];
  } finally { bout.dispose(); }
  const sides = Object.fromEntries(["left", "right"].map((side) => [side, {
    damage: result[side].damage,
    falls: falls[side],
    nearRangeStallSeconds: result.behaviour[side].engagement.nearRangeStallSeconds,
    retreatOutsideReachSeconds: result.behaviour[side].engagement.retreatOutsideReachSeconds,
  }]));
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds,
    vitality, leadChanges: lead.changes, sides, instrumentVersion: result.engagementInstrumentVersion };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
