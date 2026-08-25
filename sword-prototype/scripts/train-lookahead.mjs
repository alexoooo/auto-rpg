import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { calibrateTacticalModel, fitTacticalModel, TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { UNLEARNED_PERSISTENCE, UNLEARNED_STANCE, deployableTactics } from "../src/learning/meta.ts";
import { plannedTacticKey, tacticalStateFromView } from "../src/learning/lookahead.ts";
import { RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, tacticTargets } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";

/**
 * **The training state and the deployment state are one function, and were two.**
 *
 * `tacticalStateFromPublishedView` was a verbatim second copy of
 * `tacticalStateFromView` in `src/learning/lookahead.ts` -- the same five columns
 * off the same published fields, down to the angle wrap. It existed because this
 * script did not import from that file at all, and nothing in `tests/` imported
 * this copy, so the two could have drifted with nobody to notice: a trace fitted
 * on one rule and a beam predicting from another is a model calibrated for a body
 * that never fights, and it fails as a quiet loss of accuracy rather than as an
 * error. Measured before the merge, on 1,449 real published states across
 * `sword+empty`, `bow+empty` and `empty+empty`: **0 differ**.
 *
 * Stage C2c removed the obstacle -- this file already imports `plannedTacticKey`
 * from exactly that module -- so what was left was `AGENTS.md`'s rule about a
 * caller holding its own copy of a rule with the reason for the copy gone.
 *
 * Indexed 0.10 s deltas from actual Havok, with only `FighterView` and contact
 * publication retained.
 */
export async function collectTacticalTrace({ seed, solverSteps, split = "train", jobIndex = 0, forcedTactic = null }) {
  const job = researchMatrix(split, seed)[jobIndex % researchMatrix(split, seed).length];
  let selected = { movement: "hold", action: "cover", effector: "primary", target: "threat" };
  let decision = 0; const mind = researchLabelMind("lookahead-trace", (view) => {
    // The deployment mask, asked for rather than rebuilt -- and since stage C2c
    // the whole tuple mask rather than the action half of it. This line was
    // `supportedOptions(view).has(action) && (action !== "cover" || hasHand)`,
    // which is `deployableActions` spelled out -- a fifth copy of the rule, and
    // one that would have had to be found and edited by hand every time the
    // fourth one moved. `deployableTactics` is that same rule carried down to
    // the effector and the aim, and it is what the schedule table below is a
    // per-loadout claim about.
    const supported = deployableTactics(view);
    if (forcedTactic && !supported.some((tactic) => tactic.action === forcedTactic.action &&
        tactic.effector === forcedTactic.effector && tactic.target === forcedTactic.target)) {
      throw new Error(`lookahead schedule chose unsupported ${job.unit}/${job.loadout} tactic ${plannedTacticKey(forcedTactic)}`);
    }
    const chosen = forcedTactic ?? { ...supported[decision % supported.length],
      movement: MOVEMENT_NAMES[decision % MOVEMENT_NAMES.length] };
    decision += 1;
    selected = { movement: chosen.movement, action: chosen.action, effector: chosen.effector, target: chosen.target };
    // **The two fields the plan does not decide, named rather than defaulted.**
    // Stage B spelled `asMeasured(chooseEffector(view, action))` here because a
    // model keyed on `(movement, action)` alone could not honestly claim an aim,
    // so every trace had to stay on the measured shoulder line. Stage C2c keys
    // the model on the effector and the aim as well, so the schedule enumerates
    // them and `"as-measured"` leaves the look-ahead path entirely: the trace is
    // now taken at the aim the planner will actually name. What is left
    // unlearned is the stance and the persistence, and both are the same
    // constants `lookaheadMind` spells at its own call site -- which is the
    // point of naming them, because a trace collected under a different stance
    // from the one the runtime holds is a model calibrated for a body that never
    // fights.
    return { ...selected, stance: UNLEARNED_STANCE, persistence: UNLEARNED_PERSISTENCE };
  });
  const raw = []; let samples = 0; let contacted = false;
  const result = await runResearchBout({ ...job, index: jobIndex }, () => mind, solverSteps, null, {
    onEvent() { contacted = true; },
    onSample({ view }) { samples += 1; if (samples % 24 !== 0) return;
      raw.push({ state: tacticalStateFromView(view, 0), tactic: plannedTacticKey(selected), contact: contacted }); contacted = false; },
  });
  const bodyLoadout = `${job.unit}/${job.loadout}`; const rows = [];
  for (let index = 1; index < raw.length; index += 1) rows.push({ tactic: raw[index - 1].tactic, before: raw[index - 1].state,
    after: { ...raw[index].state, contactProbability: raw[index].contact ? 1 : 0 }, contact: raw[index].contact,
    bodyLoadout, split, traceIndex: index - 1 });
  return { rows, solverSteps: result.solverSteps, bout: result.result, bodyLoadout };
}

/**
 * Which effectors each loadout can perform each action with, in
 * `HAND_ACTION_NAMES` order and then in hand order.
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
 * `lookaheadMind`, which plans over the runtime mask and called
 * `requireCalibration` on every pair it planned, asked for a `close+punch` cell
 * that no budget had ever been spent on and threw
 * `tactic "close+punch" has no calibrated model` on the first replan. The
 * runtime is right and this was wrong: unlike a two-hander's trailing hand,
 * which is welded to the haft and excluded from the strikers list, that hand can
 * actually throw the punch.
 *
 * **Stage C2c grew the second column and deliberately not a third.** The aim is
 * not here, because it is not a property of a loadout at all:
 * `tacticTargets(action)` reads `AIMED_TARGETS` in `src/options.ts`, which is
 * keyed on the action alone and consults no body. Writing the aims out here
 * would have been that table copied thirteen times, which is precisely the
 * defect the second column exists to avoid on the effector side -- and the
 * effector genuinely does depend on the loadout, because a two-hander welds one
 * hand to its haft and an empty hand cannot hold a point. So the row is a claim
 * about what the loadout *has*, and the aim comes from the one table that owns
 * it.
 *
 * **What the test beside this covers is intact bodies, and nothing here can
 * cover more than that.**
 * `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` reads the
 * mask off real published bodies over 48 solver steps and compares the whole
 * thirteen-cell table against `deployableTactics`, which is what keeps a
 * *starting* loadout's row honest. It is not what stops the two coming apart,
 * because a row keys on the loadout a body started with and the mask keys on
 * what is still attached: sever the bow hand of a `bow+empty` and the two-handed
 * weld goes with it, the empty hand is free, and `punch` appears in a mask whose
 * row is `cover, shoot, recover`. This row cannot describe that without
 * describing every combination of losses as well. Capability loss is answered
 * one layer down instead, by `calibratedPlannedTactics` in
 * `src/learning/lookahead.ts`, which searches only the cells a budget was
 * actually spent on --
 * `a_severed_hand_moves_the_mask_and_the_lookahead_plans_over_what_it_can_predict`
 * is the test that exercises it, on bodies with a hand taken off.
 *
 * The cost is **775 tasks per split against 240**, and a minimum budget of
 * **148,800 solver steps against 46,080** -- 3.23x, measured in
 * `docs/measurements.md` under "Session 17 Stage C2c", where the 19x the plan
 * priced is also recorded along with the measurement that declined it.
 */
const LOADOUT_TACTICS = Object.freeze({
  "sword+empty": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    punch: ["secondary"], recover: ["primary", "secondary"] }),
  "sword+shield": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    recover: ["primary", "secondary"] }),
  "sword+buckler": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    recover: ["primary", "secondary"] }),
  "axe+empty": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], punch: ["secondary"],
    recover: ["primary", "secondary"] }),
  "bow+empty": Object.freeze({ cover: ["primary"], shoot: ["primary"], recover: ["primary"] }),
  "empty+empty": Object.freeze({ cover: ["primary", "secondary"], punch: ["primary", "secondary"],
    recover: ["primary", "secondary"] }),
  "natural:bite": Object.freeze({ bite: ["natural"], recover: ["natural"] }),
});
const rowFor = (loadout) => {
  // `Object.hasOwn` and not `in`: `"toString"` reaches the prototype through the
  // latter and answers a function, so a loadout that does not exist would have
  // become a row of one non-iterable value rather than a refusal.
  const row = Object.hasOwn(LOADOUT_TACTICS, loadout) ? LOADOUT_TACTICS[loadout] : null;
  if (!row) throw new Error(`lookahead schedule has no tactic row for loadout "${loadout}"`);
  return row;
};
/** The action half of a loadout's row, in `HAND_ACTION_NAMES` order. */
export const actionsFor = (loadout) => HAND_ACTION_NAMES.filter((action) => Object.hasOwn(rowFor(loadout), action));
/**
 * Every legal `(action, effector, target)` a loadout can perform, in exactly
 * `deployableTactics`' enumeration order so the two can be compared as lists.
 */
export const tacticsFor = (loadout) => {
  const row = rowFor(loadout);
  return Object.freeze(actionsFor(loadout).flatMap((action) => row[action].flatMap((effector) =>
    tacticTargets(action).map((target) => Object.freeze({ action, effector, target })))));
};
/** Every compatible body/loadout/tactic cell, in fixed matrix and option-table order. */
export function lookaheadTacticCellSchedule(split, seed) {
  const matrix = researchMatrix(split, seed); const seen = new Set(); const cells = [];
  matrix.forEach((job, jobIndex) => { const cell = `${job.unit}/${job.loadout}`; if (!seen.has(cell)) {
    seen.add(cell); cells.push({ cell, unit: job.unit, loadout: job.loadout, jobIndex }); } });
  return Object.freeze(cells.flatMap((cell) => MOVEMENT_NAMES.flatMap((movement) =>
    tacticsFor(cell.loadout).map((tactic) => Object.freeze({ ...cell, movement, ...tactic })))));
}

async function collectTacticalBudget(task, seed, solverSteps, split) {
  let consumed = 0; const rows = []; let bout = null; let iteration = 0;
  const key = plannedTacticKey(task);
  while (consumed < solverSteps) {
    const trace = await collectTacticalTrace({ seed: seed ^ iteration, solverSteps: solverSteps - consumed, split,
      jobIndex: task.jobIndex, forcedTactic: { movement: task.movement, action: task.action,
        effector: task.effector, target: task.target } });
    if (trace.solverSteps <= 0) throw new Error(`lookahead ${task.cell} ${key} made no solver-step progress`);
    consumed += trace.solverSteps; rows.push(...trace.rows); bout = trace.bout; iteration += 1;
  }
  if (!rows.length) throw new Error(`lookahead ${split} ${task.cell} ${key} collected no complete 0.10-second rows`);
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
  const artifact = new ResearchArtifact({ algorithm: "lookahead", ...RESEARCH_ARTIFACT_CONTRACT, payload,
    provenance: { seed, solverSteps: consumed, trainingSplit: "train", validationSplit: "validation", configDigest } },
    RESEARCH_ARTIFACT_CONTRACT);
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
