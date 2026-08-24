import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { Checkpoint } from "../src/learning/checkpoint.ts";
import { evaluationMirrorSeeds, seedRangesOverlap, validateSeedRanges, SEED_RANGES } from "../src/learning/evaluation.ts";
import { FeatureWriter, FEATURE_COLUMNS } from "../src/learning/features.ts";
import { learnedMetaMind, randomMetaMind, supportedOptions } from "../src/learning/meta.ts";
import { assessPromotion, validateDefaultTrainingReport } from "../src/learning/promotion.ts";
import { OPTION_NAMES, scriptedMetaMind } from "../src/options.ts";
import { policyMind } from "../src/mind.ts";

const LOADOUTS = Object.freeze([
  { name: "sword", loadout: { primary: "sword", secondary: "empty" }, specialist: "duelist" },
  { name: "shield", loadout: { primary: "sword", secondary: "shield" }, specialist: "duelist" },
  { name: "axe", loadout: { primary: "axe", secondary: "empty" }, specialist: "duelist" },
  { name: "bow", loadout: { primary: "bow", secondary: "empty" }, specialist: "archer" },
  { name: "bare-hands", loadout: { primary: "empty", secondary: "empty" }, specialist: "duelist" },
]);
Logger.LogLevels = Logger.NoneLogLevel;

const intentNumbers = (intent) => [intent.forward, intent.strafe, intent.turn, intent.zoom,
  intent.posture.trunkLean, intent.posture.trunkTwist, intent.posture.crouch,
  ...["primary", "secondary"].flatMap((hand) => [intent[hand].pointerX, intent[hand].pointerY,
    intent[hand].roll, intent[hand].wristBend])];

const score = (winner, side) => winner === null ? 0.5 : winner === side ? 1 : 0;
const motifCounts = (transitions) => Object.fromEntries(Object.entries(transitions).filter(([name]) => !name.startsWith("null")));

export async function runPromotionEvaluation({ checkpointPath, checkpointBytes, trainingReportPath, trainingReport,
  baseSeed, bouts, outputPath, freshHavok, runBout }) {
  validateSeedRanges(SEED_RANGES);
  if (!checkpointPath && !checkpointBytes) throw new Error("--checkpoint is required for candidate promotion evaluation");
  if (!Number.isInteger(bouts) || bouts <= 0 || bouts % 2 !== 0) throw new Error("--bouts must be a positive even integer");
  const bytes = checkpointBytes ?? new Uint8Array(await readFile(checkpointPath));
  const checkpoint = Checkpoint.fromBytes(bytes);
  const trained = trainingReport ?? (trainingReportPath ? JSON.parse(await readFile(trainingReportPath, "utf8")) : null);
  if (!trained) throw new Error("--training-report is required to prove promotion provenance");
  const digest = createHash("sha256").update(bytes).digest("hex");
  validateDefaultTrainingReport(trained, digest, checkpoint.provenance);
  const controllers = ["learned", "scripted", "random"];
  const reservedTestSeed = evaluationMirrorSeeds(baseSeed, "test", 0)[0];
  const promotionSeeds = new Set([reservedTestSeed]);
  const raw = []; const totalDecisions = Object.fromEntries(OPTION_NAMES.map((name) => [name, 0]));
  const learnedMotifs = {}; const scriptedMotifs = {}; const transitionExamples = [];
  const safety = { finiteIntents: true, supportedOptions: true, noStuckOption: true, noPostVerdictAction: true };
  const safetyFindings = [];

  for (let loadoutIndex = 0; loadoutIndex < LOADOUTS.length; loadoutIndex += 1) {
    const cell = LOADOUTS[loadoutIndex];
    for (const controller of controllers) {
      for (let pair = 0; pair < bouts / 2; pair += 1) {
        // Trainer reports already contain test cell zero. Promotion begins at
        // one so the final decision does not score the candidate on that probe again.
        const seed = evaluationMirrorSeeds(baseSeed, "test", loadoutIndex * 100 + pair + 1)[0];
        if (controller === controllers[0]) {
          if (promotionSeeds.has(seed)) throw new Error(`promotion seed ${seed} reuses a previously scored test cell`);
          promotionSeeds.add(seed);
        }
        for (let mirror = 0; mirror < 2; mirror += 1) {
          const actorSide = mirror === 0 ? "left" : "right";
          const mind = controller === "learned" ? learnedMetaMind(checkpoint)
            : controller === "random" ? randomMetaMind(seed)
              : scriptedMetaMind(cell.specialist, seed);
          const featureWriter = new FeatureWriter(); let previousOption = null; let decisionBucket = -1;
          let actor = null; let opponent = null; let decisions = 0; let lastIntentClock = -Infinity;
          let optionSince = 0; let longestOptionRun = 0;
          const transitions = {}; const examples = [];
          const tracked = { name: mind.name, decide(view, dt) {
            const intent = mind.decide(view, dt); actor = view; lastIntentClock = view.clock;
            if (controller === "learned" && intentNumbers(intent).some((value) => !Number.isFinite(value))) {
              safety.finiteIntents = false; safetyFindings.push({ loadout: cell.name, controller, mirror, seed, at: view.clock, issue: "non-finite intent" });
            }
            if ("selected" in mind) {
              const allowed = supportedOptions(view);
              if (controller === "learned" && allowed.size > 0 && !allowed.has(mind.selected)) {
                safety.supportedOptions = false; safetyFindings.push({ loadout: cell.name, controller, mirror, seed, at: view.clock,
                  option: mind.selected, issue: "unsupported option" });
              }
              const reading = typeof mind.diagnostic === "function" ? mind.diagnostic() : null;
              if (controller === "learned" && reading && (!Number.isFinite(reading.persistenceRemaining) || reading.persistenceRemaining > 0.801)) {
                safety.noStuckOption = false; safetyFindings.push({ loadout: cell.name, controller, mirror, seed, at: view.clock,
                  option: mind.selected, issue: "invalid persistence clock" });
              }
              const bucket = Math.floor((view.clock + 1e-9) / 0.10);
              if (bucket !== decisionBucket) {
                decisionBucket = bucket; decisions += 1;
                if (controller === "learned") totalDecisions[mind.selected] += 1;
              }
              if (previousOption !== null && previousOption !== mind.selected) {
                longestOptionRun = Math.max(longestOptionRun, view.clock - optionSince); optionSince = view.clock;
                const key = `${previousOption}->${mind.selected}`; transitions[key] = (transitions[key] ?? 0) + 1;
                if (examples.length < 12) {
                  const features = featureWriter.write(view); const named = Object.fromEntries([
                    "measure", "self_vitality", "opponent_vitality", "opponent_primary_tip_speed",
                    "opponent_secondary_tip_speed", "self_crouch", "self_trunk_twist",
                  ].map((name) => [name, features[FEATURE_COLUMNS.indexOf(name)]]));
                  examples.push({ at: view.clock, from: previousOption, to: mind.selected, features: named });
                }
              }
              previousOption = mind.selected;
            }
            return intent;
          } };
          const enemy = policyMind("swinger", seed ^ 0xa5a5a5a5);
          const result = runBout({
            left: actorSide === "left" ? controller : "swinger", right: actorSide === "right" ? controller : "swinger",
            seeds: [seed, seed ^ 0xa5a5a5a5],
            leftLoadout: actorSide === "left" ? cell.loadout : undefined,
            rightLoadout: actorSide === "right" ? cell.loadout : undefined,
            leftMind: actorSide === "left" ? tracked : enemy, rightMind: actorSide === "right" ? tracked : enemy,
            physics: await freshHavok(),
            onSample({ left, right }) { opponent = actorSide === "left" ? right.view : left.view; },
          });
          longestOptionRun = Math.max(longestOptionRun, result.seconds - optionSince);
          const stuck = result.seconds >= 5 && longestOptionRun >= Math.max(5, result.seconds * 0.95);
          if (controller === "learned" && stuck) safetyFindings.push({ loadout: cell.name, controller, mirror, seed, option: previousOption,
            seconds: longestOptionRun, issue: "one option occupied at least 95% of the bout" });
          if (controller === "learned") safety.noStuckOption &&= !stuck;
          const postVerdict = lastIntentClock > result.seconds + 1e-9;
          if (controller === "learned" && postVerdict) safetyFindings.push({ loadout: cell.name, controller, mirror, seed, at: lastIntentClock, issue: "post-verdict action" });
          if (controller === "learned") safety.noPostVerdictAction &&= !postVerdict;
          const row = { loadout: cell.name, controller, mirror, seed, outcome: result.ending,
            winner: result.winner, winScore: score(result.winner, actorSide), seconds: result.seconds,
            vitality: actor?.self.vitality ?? 0, opponentVitality: opponent?.self.vitality ?? 0,
            decisions, transitions: motifCounts(transitions), transitionExamples: examples };
          raw.push(row);
          const into = controller === "learned" ? learnedMotifs : controller === "scripted" ? scriptedMotifs : null;
          if (into) for (const [name, count] of Object.entries(row.transitions)) into[name] = (into[name] ?? 0) + count;
          if (controller === "learned") transitionExamples.push(...examples.map((example) => ({ loadout: cell.name, mirror, seed, ...example })));
        }
      }
    }
  }

  const rowsFor = (controller, loadout = null) => raw.filter((row) => row.controller === controller && (!loadout || row.loadout === loadout));
  const meanScore = (rows) => rows.reduce((sum, row) => sum + row.winScore, 0) / Math.max(1, rows.length);
  const loadouts = LOADOUTS.map((cell) => ({ name: cell.name,
    learnedWinRate: meanScore(rowsFor("learned", cell.name)), specialistWinRate: meanScore(rowsFor("scripted", cell.name)) }));
  const learnedDecisionTotal = rowsFor("learned").reduce((sum, row) => sum + row.decisions, 0);
  const scriptedDecisionTotal = rowsFor("scripted").reduce((sum, row) => sum + row.decisions, 0);
  const motifs = [...new Set([...Object.keys(learnedMotifs), ...Object.keys(scriptedMotifs)])].sort().map((name) =>
    ({ name, learned: (learnedMotifs[name] ?? 0) * 100 / Math.max(1, learnedDecisionTotal),
      scripted: (scriptedMotifs[name] ?? 0) * 100 / Math.max(1, scriptedDecisionTotal) }));
  const evidence = { splitOverlap: seedRangesOverlap(SEED_RANGES), heldOutWinScore: meanScore(rowsFor("learned")),
    scriptedWinScore: meanScore(rowsFor("scripted")), randomWinScore: meanScore(rowsFor("random")),
    loadouts, decisionCounts: totalDecisions, motifs, safety };
  const decision = assessPromotion(evidence);
  const compact = { version: 1, checkpoint: { provenance: checkpoint.provenance }, baseSeed,
    seedRanges: SEED_RANGES, split: "test", bouts,
    loadouts, winScores: { learned: evidence.heldOutWinScore, scripted: evidence.scriptedWinScore, random: evidence.randomWinScore },
    decisionCounts: totalDecisions, optionShares: decision.optionShares, motifRateUnit: "transitions per 100 decisions", motifs,
    transitionExamples: transitionExamples.slice(0, 40), safety, safetyFindings: safetyFindings.slice(0, 40),
    promoted: decision.promoted, failures: decision.failures };
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(compact, null, 2)}\n`);
  console.log(JSON.stringify(compact, null, 2));
  return compact;
}
