import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { calibrateTacticalModel, fitTacticalModel, TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { deployableActions } from "../src/learning/meta.ts";
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
    // The deployment mask, asked for rather than rebuilt. This line was
    // `supportedOptions(view).has(action) && (action !== "cover" || hasHand)`,
    // which is `deployableActions` spelled out -- a fifth copy of the rule, and
    // one that would have had to be found and edited by hand every time the
    // fourth one moved.
    const supported = HAND_ACTION_NAMES.filter((action) => deployableActions(view).has(action));
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

/**
 * What each loadout's budget is spent on, in `HAND_ACTION_NAMES` order.
 *
 * One row per `ResearchLoadout`, and the schedule refuses a loadout with no row
 * rather than falling through to a sword's: this was a chain of `startsWith`
 * ternaries whose last arm was the default, so a loadout added to
 * `RESEARCH_STRATA` silently trained the sword schedule against whatever it was
 * actually holding.
 *
 * **These rows are a claim about the runtime, and the claim was false on two of
 * them.** `sword+empty` and `axe+empty` leave a genuinely free empty hand, the
 * runtime mask offers `punch` on it, and this table did not -- so
 * `lookaheadMind`, which plans over the runtime mask and calls
 * `requireCalibration` on every pair it plans, asked for a `close+punch` cell
 * that no budget had ever been spent on and threw
 * `tactic "close+punch" has no calibrated model` on the first replan. The
 * runtime is right and this was wrong: unlike a two-hander's trailing hand,
 * which is welded to the haft and excluded from the strikers list, that hand can
 * actually throw the punch.
 *
 * **What the test beside this covers is intact bodies, and nothing here can
 * cover more than that.**
 * `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` reads the
 * mask off real published bodies over 48 solver steps and compares the whole
 * thirteen-row table, which is what keeps a *starting* loadout's row honest. It
 * is not what stops the two coming apart, because a row keys on the loadout a
 * body started with and the mask keys on what is still attached: sever the bow
 * hand of a `bow+empty` and the two-handed weld goes with it, the empty hand
 * starts offering `punch`, and this row cannot describe that without describing
 * every combination of losses as well. Capability loss is answered one layer
 * down instead, by `calibratedTacticPairs` in `src/learning/lookahead.ts`, which
 * searches only the cells a budget was actually spent on --
 * `a_severed_hand_moves_the_mask_and_the_lookahead_plans_over_what_it_can_predict`
 * is the test that exercises it, on bodies with a hand taken off.
 *
 * The cost is 240 tasks per split against 220, and a minimum budget of 46,080
 * solver steps against 42,240. That is the figure **today**; session 20's tuple
 * expansion supersedes it by roughly twentyfold and is where the real ceiling
 * gets decided.
 */
const LOADOUT_ACTIONS = Object.freeze({
  "sword+empty": Object.freeze(["cover", "cut", "thrust", "punch", "recover"]),
  "sword+shield": Object.freeze(["cover", "cut", "thrust", "recover"]),
  "sword+buckler": Object.freeze(["cover", "cut", "thrust", "recover"]),
  "axe+empty": Object.freeze(["cover", "cut", "punch", "recover"]),
  "bow+empty": Object.freeze(["cover", "shoot", "recover"]),
  "empty+empty": Object.freeze(["cover", "punch", "recover"]),
  "natural:bite": Object.freeze(["bite", "recover"]),
});
export const actionsFor = (loadout) => {
  const actions = Object.hasOwn(LOADOUT_ACTIONS, loadout) ? LOADOUT_ACTIONS[loadout] : null;
  if (!actions) throw new Error(`lookahead schedule has no tactic row for loadout "${loadout}"`);
  return actions;
};
/** Every compatible body/loadout/tactic cell, in fixed matrix and option-table order. */
export function lookaheadTacticCellSchedule(split, seed) {
  const matrix = researchMatrix(split, seed); const seen = new Set(); const cells = [];
  matrix.forEach((job, jobIndex) => { const cell = `${job.unit}/${job.loadout}`; if (!seen.has(cell)) {
    seen.add(cell); cells.push({ cell, unit: job.unit, loadout: job.loadout, jobIndex }); } });
  return Object.freeze(cells.flatMap((cell) => MOVEMENT_NAMES.flatMap((movement) =>
    actionsFor(cell.loadout).map((action) => Object.freeze({ ...cell, movement, action })))));
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
