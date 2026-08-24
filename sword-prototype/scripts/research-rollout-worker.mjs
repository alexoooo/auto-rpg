import { parentPort, workerData } from "node:worker_threads";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { predictDagger } from "../src/learning/dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { RecurrentNeatNetwork } from "../src/learning/recurrent-neat.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { tacticalTeacher, TACTICAL_TEACHER_VERSION } from "../src/learning/tactical-teacher.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";

Logger.LogLevels = Logger.NoneLogLevel;

const neatLabeler = (genome) => { const network = new RecurrentNeatNetwork(genome); return (view, features) => {
  const output = network.run(features); let movement = MOVEMENT_NAMES[0]; let movementScore = -Infinity;
  MOVEMENT_NAMES.forEach((name, index) => { if (output[index] > movementScore) { movement = name; movementScore = output[index]; } });
  const hands = Object.values(view.self.hands).some((hand) => !hand.lost);
  const legal = HAND_ACTION_NAMES.filter((name) => name === "recover" || name === "bite" && view.self.naturalAttacks?.bite ||
    hands && name === "cover" || Object.values(view.self.hands).some((hand) => !hand.lost &&
      (name === "punch" ? hand.weapon === "empty" : name === "shoot" ? hand.weapon === "bow" :
        name === "thrust" ? hand.weapon === "sword" : name === "cut" ? !["empty", "bow", "shield", "buckler"].includes(hand.weapon) : false)));
  let action = "recover"; let actionScore = -Infinity;
  for (const name of legal) { const score = output[MOVEMENT_NAMES.length + HAND_ACTION_NAMES.indexOf(name)];
    if (score > actionScore) { action = name; actionScore = score; } }
  const raw = output[output.length - 1]; return { movement, action, persistence: 0.10 + (Math.max(-1, Math.min(1, raw)) + 1) * 0.35 };
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

try { parentPort.postMessage(workerData.mode === "neat" ? await neat() : await dagger()); }
catch (error) { throw error; }
