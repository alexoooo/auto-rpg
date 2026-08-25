import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { predictDagger } from "../src/learning/dagger.ts";
import { FEATURE_VERSION } from "../src/learning/features.ts";
import { deployableActions, readMetaOutput } from "../src/learning/meta.ts";
import { RecurrentNeatNetwork } from "../src/learning/recurrent-neat.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { tacticalTeacher, TACTICAL_TEACHER_VERSION } from "../src/learning/tactical-teacher.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";

Logger.LogLevels = Logger.NoneLogLevel;

/**
 * A NEAT genome read as a research label -- the training half of the seam
 * `deployment.ts` is the deployed half of.
 *
 * **The legality test here was a fourth copy of the deployment rule, and it was
 * not the deployed one.** It asked `weapon === "sword"` for `thrust` where the
 * runtime asks `hasPoint`, and an exclusion list of four names for `cut` where
 * the runtime asks `isStriking && !== "empty"`. Both rewrites happen to answer
 * identically for every kind in `GRIPS` today -- swept over all 49 ordered weapon
 * pairs, not argued -- which is exactly how they survived two sessions looking
 * for them, and neither survives the next kind: a pointed spear is a `thrust` the
 * name test refuses, and `hands.ts`'s own note about two unions that are equal
 * today is about this.
 *
 * What it got wrong today is structural, and the sweep is where it shows: every
 * one of the twelve disagreeing pairs is a **two-handed** one. Neither rewrite
 * knows that `Fighter.update` welds the trailing hand to the haft, so on
 * `bow+empty` this offered `punch` on that hand while `deployableActions` -- the
 * mask `researchLabelMind` refuses by, one call later -- did not. A genome whose
 * punch logit won on a bow cell was trained under this mask and then killed by
 * that one, `research policy produced unsupported action "punch"`, mid-run.
 *
 * `recover` is the seed rather than a fallback: it is in every non-empty
 * `deployableActions` set, and `researchLabelMind` returns an inert command
 * without ever asking here when the set is empty.
 */
export const neatLabeler = (genome) => { const network = new RecurrentNeatNetwork(genome); return (view, features) => {
  const { movementLogits, actionLogits, persistence } = readMetaOutput(network.run(features));
  let movement = MOVEMENT_NAMES[0]; let movementScore = -Infinity;
  MOVEMENT_NAMES.forEach((name, index) => { if (movementLogits[index] > movementScore) { movement = name; movementScore = movementLogits[index]; } });
  const allowed = deployableActions(view); let action = "recover"; let actionScore = -Infinity;
  HAND_ACTION_NAMES.forEach((name, index) => { if (allowed.has(name) && actionLogits[index] > actionScore) {
    action = name; actionScore = actionLogits[index]; } });
  return { movement, action, persistence };
}; };

async function neat() {
  const { jobs, job, budget, genome, opponentGenome } = workerData; const jobList = jobs ?? [job];
  let remaining = budget; let opportunityCount = 0;
  let attacksInWindow = 0; let contactsInWindow = 0; let stallSeconds = 0; let seconds = 0;
  let damage = 0; let attacks = 0; let wins = 0; let bouts = 0; const cells = new Map();
  while (remaining > 0) { const activeJob = jobList[bouts % jobList.length];
    const result = await runResearchBout({ ...activeJob, index: activeJob.index + bouts * jobList.length },
    (onDecision) => researchLabelMind("neat-qd", neatLabeler(genome), onDecision), remaining,
    opponentGenome ? () => researchLabelMind("archived-champion", neatLabeler(opponentGenome)) : null);
    if (result.solverSteps <= 0 || result.solverSteps > remaining) throw new Error("NEAT-QD worker returned invalid solver-step accounting");
    remaining -= result.solverSteps; bouts += 1; opportunityCount += result.engagement.viableOpportunities;
    attacksInWindow += result.engagement.attacksInWindow; contactsInWindow += result.engagement.damagingContactsInWindow;
    stallSeconds += result.engagement.nearRangeStallSeconds; seconds += result.result.seconds; damage += result.damage;
    attacks += result.attacks; const won = result.result.winner === activeJob.actorSide ? 1 : 0; wins += won;
    const key = `${activeJob.unit}/${activeJob.loadout}/${activeJob.opponent}/${activeJob.mirror}`;
    const cell = cells.get(key) ?? { key, wins: 0, damage: 0, attacks: 0, stallSeconds: 0, seconds: 0 };
    cell.wins += won; cell.damage += result.damage; cell.attacks += result.attacks;
    cell.stallSeconds += result.engagement.nearRangeStallSeconds; cell.seconds += result.result.seconds; cells.set(key, cell); }
  const opportunity = opportunityCount ? attacksInWindow / opportunityCount : 0;
  const contact = attacksInWindow ? contactsInWindow / attacksInWindow : 0; const stall = Math.min(1, stallSeconds / Math.max(0.001, seconds));
  const cellScores = [...cells.values()].sort((a, b) => a.key.localeCompare(b.key)).map((cell) => ({ key: cell.key,
    score: cell.wins * 1000 + cell.damage + cell.attacks * 2 - Math.min(1, cell.stallSeconds / Math.max(0.001, cell.seconds)) * 100 }));
  const macroScore = cellScores.reduce((sum, cell) => sum + cell.score, 0) / Math.max(1, cellScores.length);
  const worstCellScore = Math.min(...cellScores.map((cell) => cell.score));
  return { solverSteps: budget, bout: { result: { winner: wins > 0 ? jobList[0].actorSide : null }, damage, attacks, bouts },
    descriptor: { opportunityConversion: opportunity, contactConversion: contact, nearRangeStallShare: stall },
    score: macroScore, macroScore, worstCellScore, cellScores,
    feasible: opportunity >= 0.2 && stall <= 0.5 };
}

async function dagger() {
  const { jobs, budget, deployed, iteration } = workerData; let remaining = budget; let boutIndex = 0; const rows = [];
  let opportunities = 0; let attacksInWindow = 0; let contactsInWindow = 0; let damage = 0;
  while (remaining > 0) { const job = jobs[boutIndex % jobs.length]; let sourceStep = 0;
    const result = await runResearchBout({ ...job, index: job.index + boutIndex }, (harnessDecision) => {
      const deployedLabeler = deployed ? (_view, features) => predictDagger(deployed, features) : (view) => tacticalTeacher(view);
      return researchLabelMind(deployed ? "dagger-learner" : "dagger-teacher", deployedLabeler, (view, features, chosen) => {
        rows.push({ featureVersion: FEATURE_VERSION, features: [...features], label: tacticalTeacher(view),
          unitCell: `${job.unit}/${job.loadout}`, sourceSeed: job.actorSeed, sourceStep: sourceStep++, iteration,
          teacherVersion: TACTICAL_TEACHER_VERSION }); harnessDecision(view, features, chosen); });
    }, remaining);
    if (result.solverSteps <= 0 || result.solverSteps > remaining) throw new Error("DAgger worker returned invalid solver-step accounting");
    remaining -= result.solverSteps; boutIndex += 1; opportunities += result.engagement.viableOpportunities;
    attacksInWindow += result.engagement.attacksInWindow; contactsInWindow += result.engagement.damagingContactsInWindow; damage += result.damage; }
  return { solverSteps: budget, rows, metrics: { opportunities, attacksInWindow, contactsInWindow, damage,
    opportunityConversion: opportunities ? attacksInWindow / opportunities : 0,
    contactConversion: attacksInWindow ? contactsInWindow / attacksInWindow : 0 } };
}

// Gated on the port, so the module can also be imported. `neatLabeler` above
// carried a legality table nothing could reach: this last line ran at import
// time and threw on `parentPort.postMessage` of null, so the only way to read
// that table was to read it, which two sessions did and got wrong. The
// try/catch that used to wrap this rethrew what it caught and did nothing else.
//
// **The bare gate turned a throw into a silent success**, which is worse here
// than anywhere else in the tree: a worker that reaches the end without posting
// hangs its trainer forever, because `train-neat-qd.mjs` and
// `collect-dagger.mjs` both resolve on `message` and reject only on `error` or a
// non-zero `exit`. Exiting 0 with nothing posted is the one outcome neither can
// see. Nothing reaches this today -- a worker thread always has a port -- so the
// case that can be reached instead is a person running the file, and that is
// refused by name rather than exiting 0 having done nothing at all.
if (parentPort) parentPort.postMessage(workerData.mode === "neat" ? await neat() : await dagger());
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  throw new Error("research-rollout-worker.mjs is a worker-thread entry point with no command line; " +
    "run it through scripts/train-neat-qd.mjs or scripts/collect-dagger.mjs");
}
