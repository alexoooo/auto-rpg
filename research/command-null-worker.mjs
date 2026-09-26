// One bout of the command surface's null control (`research/command-null.mjs`), with the trajectory
// it took hashed as it went (`trajectoryTracer` in `research/side-mirror.mjs`) and its behaviour
// record hashed beside it, through `runJobs` in `research/runner.mjs`: a fresh Havok per bout and one
// bout per worker realm at a time (AGENTS.md).
//
// An `expert...` corner is session 04's reference expert, run through `runExpertBout`; its decision
// labels are kept, because a search whose forks drift chooses differently long before a bar does.
// This file imports no other worker module.
import { parentPort } from "node:worker_threads";
import { createHash } from "node:crypto";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { expertMind, runExpertBout } from "../tests/harness/expert.mjs";
import { policyMind } from "../src/mind.ts";
import { trajectoryTracer } from "./side-mirror.mjs";
import { auditBuild } from "./headroom-builds.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

const digestOf = (value) => createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export async function playNull(job, manifest) {
  const setupOf = (name) => {
    const build = auditBuild(name);
    if (!build) throw new Error(`no build "${name}"`);
    return build.setup;
  };
  const options = { left: job.left, right: job.right, seeds: job.seeds,
    leftGolem: setupOf(job.leftBuild), rightGolem: setupOf(job.rightBuild),
    ...manifest.protocol, ...(job.maxSeconds ? { maxSeconds: job.maxSeconds } : {}), physics: await freshHavok() };
  const experts = { left: expertMind(job.left, job.seeds[0]), right: expertMind(job.right, job.seeds[1]) };
  let result, vitality, traced, summaries = null;
  if (experts.left || experts.right) {
    let tracer = null;
    const chosen = Object.fromEntries(Object.entries(experts).filter(([, e]) => e));
    const out = await runExpertBout(options, { experts: chosen,
      onFrame: (bout) => { tracer ??= trajectoryTracer(bout); tracer.frame(); },
      onFinish: () => { traced = tracer.finish(); } });
    ({ result, vitality } = out);
    summaries = Object.fromEntries(Object.entries(out.experts).map(([side, s]) =>
      [side, { decisions: s.decisions, rollouts: s.rollouts, labels: s.labels }]));
  } else {
    const bout = createBout({ ...options,
      leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]) });
    const tracer = trajectoryTracer(bout);
    try {
      while (bout.step()) tracer.frame();
      result = bout.finish();
      vitality = [bout.left.vitality, bout.right.vitality];
      traced = tracer.finish();
    } finally { bout.dispose(); }
  }
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds, vitality,
    behaviour: digestOf(result.behaviour), ...traced, ...(summaries ? { experts: summaries } : {}) };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await playNull(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
