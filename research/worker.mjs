import { parentPort } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { runBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { CONFIG } from "../src/config.ts";
import { candidateMind } from "../src/golem/research-candidates.ts";
import { policyMind } from "../src/mind.ts";
Logger.LogLevels = Logger.ErrorLogLevel;

export function descriptors(record, retreatSeconds, attacks) {
  const seconds = Math.max(record.seconds, 1e-9);
  return { attackRate: attacks / seconds,
    retreatFraction: retreatSeconds / seconds, blockRate: record.blocks / seconds,
    range: record.rangeBins.map((time) => time / seconds) };
}
export async function execute(job, manifest) {
  const retreat = { left: 0, right: 0 };
  const attacks = { left: 0, right: 0 };
  const builds = new Map(manifest.builds.map((build) => [build.name, build.setup]));
  const candidates = new Map((manifest.candidates ?? []).map((candidate) => [candidate.name, candidate]));
  const mind = (name, seed, side) => {
    const inner = candidates.has(name) ? candidateMind(candidates.get(name), seed) : policyMind(name, seed);
    const previous = { primary: false, secondary: false, natural: false };
    return { name: inner.name, decide(view, dt) {
      const intent = inner.decide(view, dt);
      if (intent.forward < -0.1) retreat[side] += dt;
      for (const channel of ["primary", "secondary", "natural"]) {
        if (intent[channel].thrust && !previous[channel]) attacks[side]++;
        previous[channel] = intent[channel].thrust;
      }
      return intent;
    } };
  };
  const result = runBout({ left: candidates.get(job.left)?.parent ?? job.left,
    right: candidates.get(job.right)?.parent ?? job.right,
    leftMind: mind(job.left, job.seeds[0], "left"), rightMind: mind(job.right, job.seeds[1], "right"),
    seeds: job.seeds, leftGolem: builds.get(job.leftBuild), rightGolem: builds.get(job.rightBuild),
    ...manifest.protocol, physics: await freshHavok() });
  const sides = Object.fromEntries(["left", "right"].map((side) => [side, {
    damage: result[side].damage, hits: result[side].hits, blocks: result[side].blocks,
    descriptors: descriptors(result.behaviour[side], retreat[side], attacks[side]),
    engagement: result.behaviour[side].engagement,
  }]));
  return { ...job, status: "ok", winner: result.winner, ending: result.ending, seconds: result.seconds,
    overtime: result.seconds >= CONFIG.bout.overtimeSeconds, sides,
    instrumentVersion: result.engagementInstrumentVersion };
}

if (parentPort) parentPort.on("message", async ({ job, manifest }) => {
  try { parentPort.postMessage(await execute(job, manifest)); }
  catch (error) { parentPort.postMessage({ ...job, status: "failed", error: String(error?.stack ?? error) }); }
});
