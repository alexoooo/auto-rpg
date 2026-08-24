import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { calibrateTacticalModel, fitTacticalModel, TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { supportedOptions } from "../src/learning/meta.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";

const wrapAngle = (value) => { while (value > Math.PI) value -= Math.PI * 2; while (value < -Math.PI) value += Math.PI * 2; return value; };
export function tacticalStateFromPublishedView(view, contactProbability = 0) {
  const bearing = Math.atan2(view.opponent.ground.x - view.self.ground.x, view.opponent.ground.z - view.self.ground.z);
  const threats = Object.values(view.opponent.hands).filter((hand) => !hand.lost).sort((a, b) => b.tipSpeed - a.tipSpeed);
  const threat = threats[0]; const offensiveReach = Math.max(view.self.reach,
    ...Object.values(view.self.hands).filter((hand) => !hand.lost).map((hand) => hand.reach));
  return Object.freeze({ reachMargin: offensiveReach + view.opponent.collisionRadius - view.measure,
    facingError: wrapAngle(bearing - view.self.facing),
    threatAlignment: threat ? Math.min(1, threat.tipSpeed / 30) : 0,
    contactProbability, vitalityPotential: view.self.vitality - view.opponent.vitality });
}

/** Indexed 0.10 s deltas from actual Havok, with only FighterView and contact publication retained. */
export async function collectTacticalTrace({ seed, solverSteps, split = "train", jobIndex = 0, forcedPair = null }) {
  const job = researchMatrix(split, seed)[jobIndex % researchMatrix(split, seed).length]; let selected = { movement: "hold", action: "cover" };
  let decision = 0; const mind = researchLabelMind("lookahead-trace", (view) => {
    const hasHand = Object.values(view.self.hands).some((hand) => !hand.lost);
    const supported = HAND_ACTION_NAMES.filter((action) => supportedOptions(view).has(action) && (action !== "cover" || hasHand));
    if (forcedPair && !supported.includes(forcedPair.action)) throw new Error(`lookahead schedule chose unsupported ${job.unit}/${job.loadout} tactic ${forcedPair.movement}+${forcedPair.action}`);
    const action = forcedPair?.action ?? supported[decision % supported.length];
    const movement = forcedPair?.movement ?? MOVEMENT_NAMES[decision % MOVEMENT_NAMES.length]; decision += 1; selected = { movement, action };
    return { movement, action, persistence: 0.4 };
  });
  const raw = []; let samples = 0; let contacted = false;
  const result = await runResearchBout({ ...job, index: jobIndex }, () => mind, solverSteps, null, {
    onEvent() { contacted = true; },
    onSample({ view }) { samples += 1; if (samples % 24 !== 0) return;
      raw.push({ state: tacticalStateFromPublishedView(view, 0), tactic: `${selected.movement}+${selected.action}`, contact: contacted }); contacted = false; },
  });
  const bodyLoadout = `${job.unit}/${job.loadout}`; const rows = [];
  for (let index = 1; index < raw.length; index += 1) rows.push({ tactic: raw[index - 1].tactic, before: raw[index - 1].state,
    after: { ...raw[index].state, contactProbability: raw[index].contact ? 1 : 0 }, contact: raw[index].contact,
    bodyLoadout, split, traceIndex: index - 1 });
  return { rows, solverSteps: result.solverSteps, bout: result.result, bodyLoadout };
}

const actionsFor = (unit, loadout) => unit === "centipede" ? ["bite", "recover"] : loadout.startsWith("bow") ?
  ["cover", "shoot", "recover"] : loadout.startsWith("empty") ? ["cover", "punch", "recover"] :
  loadout.startsWith("axe") ? ["cover", "cut", "recover"] : ["cover", "cut", "thrust", "recover"];
/** Every compatible body/loadout/tactic cell, in fixed matrix and option-table order. */
export function lookaheadTacticCellSchedule(split, seed) {
  const matrix = researchMatrix(split, seed); const seen = new Set(); const cells = [];
  matrix.forEach((job, jobIndex) => { const cell = `${job.unit}/${job.loadout}`; if (!seen.has(cell)) {
    seen.add(cell); cells.push({ cell, unit: job.unit, loadout: job.loadout, jobIndex }); } });
  return Object.freeze(cells.flatMap((cell) => MOVEMENT_NAMES.flatMap((movement) =>
    actionsFor(cell.unit, cell.loadout).map((action) => Object.freeze({ ...cell, movement, action })))));
}

async function collectTacticalBudget(task, seed, solverSteps, split) {
  let consumed = 0; const rows = []; let bout = null; let iteration = 0;
  while (consumed < solverSteps) {
    const trace = await collectTacticalTrace({ seed: seed ^ iteration, solverSteps: solverSteps - consumed, split,
      jobIndex: task.jobIndex, forcedPair: { movement: task.movement, action: task.action } });
    if (trace.solverSteps <= 0) throw new Error(`lookahead ${task.cell} ${task.movement}+${task.action} made no solver-step progress`);
    consumed += trace.solverSteps; rows.push(...trace.rows); bout = trace.bout; iteration += 1;
  }
  if (!rows.length) throw new Error(`lookahead ${split} ${task.cell} ${task.movement}+${task.action} collected no complete 0.10-second rows`);
  return { rows, solverSteps: consumed, bout };
}

const writeAtomic = async (path, bytes) => { const target = resolve(path); await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`; await writeFile(temporary, bytes); await rename(temporary, target); };

export async function trainLookahead({ seed, solverSteps }) {
  if (solverSteps % 4) throw new Error("lookahead solver-step budget must be a multiple of four");
  const seeds = [seed, seed ^ 0x9e3779b9, seed ^ 0x51f15e]; let consumed = 0;
  const trainTasks = lookaheadTacticCellSchedule("train", seed); const validationTasks = lookaheadTacticCellSchedule("validation", seed);
  const groups = seeds.length * trainTasks.length + validationTasks.length;
  const perJob = Math.floor(solverSteps / groups / 4) * 4;
  if (perJob < 48) throw new Error(`lookahead budget ${solverSteps} cannot cover ${groups} indexed tactic-cell jobs; minimum is ${groups * 48}`);
  let extraJobs = (solverSteps - perJob * groups) / 4; const budgetFor = () => perJob + (extraJobs-- > 0 ? 4 : 0);
  const candidates = [];
  for (let index = 0; index < seeds.length; index += 1) {
    const rows = [];
    for (const task of trainTasks) { const trace = await collectTacticalBudget(task, seeds[index], budgetFor(), "train");
      consumed += trace.solverSteps; rows.push(...trace.rows); }
    candidates.push({ seed: seeds[index], rows, model: fitTacticalModel(rows) });
  }
  const validation = { rows: [], solverSteps: 0 };
  for (const task of validationTasks) { const trace = await collectTacticalBudget(task, seed ^ 0x7f4a7c15, budgetFor(), "validation");
    consumed += trace.solverSteps; validation.solverSteps += trace.solverSteps; validation.rows.push(...trace.rows); }
  for (const candidate of candidates) candidate.model = calibrateTacticalModel(candidate.model, validation.rows);
  const calibrationScore = (model) => Object.values(model.cells).flatMap(Object.values).reduce((sum, fitted) => sum +
    Math.abs(fitted.calibration.signedReachError) + fitted.calibration.contactBrier + fitted.calibration.vitalityDeltaError, 0);
  candidates.sort((a, b) => calibrationScore(a.model) - calibrationScore(b.model) || a.seed - b.seed);
  const selected = candidates[0]; const model = selected.model; const trainRows = selected.rows;
  const configDigest = artifactChecksum(canonicalJson({ seed, requestedSolverSteps: solverSteps,
    fitSeeds: seeds, selectedSeed: selected.seed, columns: TACTICAL_STATE_COLUMNS }));
  const payload = [...new TextEncoder().encode(canonicalJson(model))];
  const artifact = new ResearchArtifact({ algorithm: "lookahead", featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS,
    movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES, payload,
    provenance: { seed, solverSteps: consumed, trainingSplit: "train", validationSplit: "validation", configDigest } },
    { featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES });
  const report = { algorithm: "lookahead", configDigest, requestedSolverSteps: solverSteps, solverSteps: consumed,
    unspentSolverSteps: solverSteps - consumed, traceRows: trainRows.length, modelDigest: model.digest,
    selectedSeed: selected.seed, calibration: Object.fromEntries(Object.entries(model.cells).map(([cell, tactics]) => [cell,
      Object.fromEntries(Object.entries(tactics).map(([tactic, fitted]) => [tactic, fitted.calibration]))])) };
  return { artifact: artifact.toBytes(), report: new TextEncoder().encode(canonicalJson(report)), model };
}

export async function runLookaheadCli() {
  const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const output = await trainLookahead({ seed: Number(arg("seed", 310013)), solverSteps: Number(arg("solver-steps", 960)) });
  if (arg("artifact", "")) await writeAtomic(arg("artifact", ""), output.artifact);
  if (arg("report", "")) await writeAtomic(arg("report", ""), output.report);
  process.stdout.write(new TextDecoder().decode(output.report) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runLookaheadCli();
