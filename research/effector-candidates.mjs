/** One decision from a warmed real human bout, then the winning rollout played live.
 * An explanatory fixture, not headroom: reseeding is disabled for exact live prediction.
 * Scores every evaluated candidate; no motor, objective or proposal changes.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { ExpertMind, expertConfig, boutHost, poseHash } from "../tests/harness/expert.mjs";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { setChannelFlags } from "../src/body-command.ts";

export const CANDIDATE_HARNESS = "Node/Havok bout runner and exact forks; supported humans, 0.75 s warmup, one c8/h1 decision, reseed false, winning plan played live for 1 s";

export async function effectorCandidateProbe({ terminal = "blade", side = "left", separation = 1.5 } = {}) {
  if (!["blade", "mace", "fist"].includes(terminal) || !["left", "right"].includes(side)
    || !Number.isFinite(separation) || separation <= 0) throw new Error("invalid candidate probe");
  const other = side === "left" ? "right" : "left";
  const flags = setChannelFlags({ effector: true });
  const config = { ...expertConfig("expert-effector@c8,h1"), reseed: false, trace: true };
  const expert = new ExpertMind(config, 11);
  const setup = humanSetup(terminal, terminal === "fist" ? "fist" : "plate");
  const base = { left: "humanoid-duelist", right: "humanoid-duelist", seeds: [11, 22],
    leftGolem: setup, rightGolem: setup, separation, locomotionMode: "supported", maxSeconds: 3 };
  let bout;
  try {
    bout = createBout({ ...base, physics: await freshHavok(), [`${side}Mind`]: expert });
    // Before its first search, the expert uses its normal shadow-policy continuation.
    for (let i = 0; i < 45 && bout.active; i++) bout.step();
    if (!bout.active) throw new Error("candidate probe ended during warmup");
    const before = { pose: poseHash(bout), vE: bout[side].vitality, vO: bout[other].vitality };
    await expert.beforeFrame(boutHost(bout, base, side));
    if (poseHash(bout) !== before.pose) throw new Error("search changed the live pose");
    const decision = expert.log.at(-1);
    for (let i = 0; i < 60 && bout.active; i++) bout.step();
    const live = { pose: poseHash(bout), vE: bout[side].vitality, vO: bout[other].vitality };
    const predictionMatches = Object.entries(live).every(([key, value]) => decision.predicted[key] === value);
    if (!predictionMatches) throw new Error("winning candidate prediction did not match live playback");
    return { terminal, side, separation, before, chosen: decision.label, terms: decision.terms,
      candidates: decision.candidates, spread: decision.spread, tied: decision.tied, live, predictionMatches };
  } finally { expert.dispose(); bout?.dispose(); setChannelFlags(flags); }
}

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = [];
  for (const terminal of ["blade", "mace", "fist"]) for (const side of ["left", "right"]) {
    for (const separation of [1.1, 1.5, 2.1]) rows.push(await effectorCandidateProbe({ terminal, side, separation }));
  }
  console.log(JSON.stringify({ harness: CANDIDATE_HARNESS, rows }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
