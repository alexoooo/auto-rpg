import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { calibrateTacticalModel, calibrationSeverity, fitTacticalModel,
  TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { UNLEARNED_PERSISTENCE, UNLEARNED_STANCE, deployableTactics } from "../src/learning/meta.ts";
import { plannedTacticKey, tacticalStateFromView } from "../src/learning/lookahead.ts";
import { decodeResearchArtifact, inProgressResearchArtifact, LOOKAHEAD_CALIBRATION_LIMITS,
  RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, tacticTargets } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";
import { checkpointRun, DEFAULT_PLATEAU_EPSILON, DEFAULT_PLATEAU_ROWS, digestContract, engagementGates,
  finalizeRun, ledgerStopDecision, makeLedgerRow, readLedger, runIsFinalized } from "./research-ledger.mjs";

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
 * would have been that table copied once per loadout, which is precisely the
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
 * fifteen-cell table against `deployableTactics`, which is what keeps a
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
 * The cost of the widening is **945 tasks per split against 280**, and a minimum
 * budget of **181,440 solver steps against 53,760** -- 3.375x, measured in
 * `docs/measurements.md` under "Session 17 Stage C2c", where the 19x the plan
 * priced is also recorded along with the measurement that declined it.
 *
 * **Both columns moved when `sword+axe` joined the strata, and the ratio moved
 * with them**: 775/240 = 3.23x became 945/280 = 3.375x. Re-derived rather than
 * scaled (`.review/sa27/schedule.mjs`, which reads
 * `lookaheadTacticCellSchedule` and `actionsFor` rather than multiplying by a
 * cell count), because the two columns do not scale by the same factor. The
 * (movement, action) column counts *actions* -- `sword+axe` has four, the same
 * as `sword+shield` -- while the tuple column counts (action, effector, target),
 * and `sword+axe`'s `cut` is the one row in the table with two effectors, so it
 * is the widest row in the tuple column at 17 tuples and an ordinary one in the
 * action column. A cell-count multiplier applied to either figure gets the other
 * wrong.
 */
const LOADOUT_TACTICS = Object.freeze({
  "sword+empty": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    punch: ["secondary"], recover: ["primary", "secondary"] }),
  "sword+shield": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    recover: ["primary", "secondary"] }),
  "sword+buckler": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary"], thrust: ["primary"],
    recover: ["primary", "secondary"] }),
  // **The row this table was widened for, and the only one whose `cut` names two
  // hands.** `isHeldStriker` accepts both a sword and an axe, so `cut` reaches
  // either; `hasPoint` refuses the axe, so `thrust` reaches only the sword hand;
  // `punch` reaches neither, because a punching hand must be empty and both are
  // full. That asymmetry is the point of the loadout rather than an accident of
  // it -- an action that names the hand and an action beside it that cannot is
  // what separates "the effector head decided" from "the loadout decided".
  "sword+axe": Object.freeze({ cover: ["primary", "secondary"], cut: ["primary", "secondary"],
    thrust: ["primary"], recover: ["primary", "secondary"] }),
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

/**
 * Below this many steps per job the validation split is not a split, and the
 * calibration a report prints is in-sample wearing a held-out label.
 *
 * **The bouts start from unrelated seeds, and this said they were adjacent.**
 * `researchMatrix(split, base)` does produce a validation `actorSeed` exactly
 * +100000 above the train one **at a fixed base**, because `evaluationSeed`
 * mixes only `(base, cell)` and then offsets by the split's range -- but that is
 * not what runs. `trainLookahead` collects train rows under base `seed` and
 * validation rows under base `seed ^ 0x7f4a7c15`, and `collectTacticalTrace`
 * rebuilds the matrix from the base it is handed, so the two bouts start from
 * seeds that differ by 12,613 to 180,739 across the 78 jobs of the thirteen-cell
 * matrix (39 distinct differences at seed 310013; `.review/rem20/an3.mjs`; the
 * matrix is 90 jobs since `sword+axe` and the spread has not been re-taken --
 * nothing in the argument turns on it, because the conclusion is that the seed
 * does not matter). The rows come back
 * bit-identical anyway, and the reason is the interesting one: **the opening of
 * a bout is seed-insensitive.** Two fighters start from the same pose at the
 * same separation, and 48 solver steps is 0.2 s, which is not long enough for
 * anything the seed touches to have moved them apart. Right measurement, wrong
 * mechanism -- and the mechanism matters, because "adjacent seeds" would be
 * fixed by widening the offset and this is not.
 *
 * Measured on real Havok at seed 310013, per (cell, tactic) key,
 * **on the 775-key thirteen-cell schedule** (`.review/calgate/p4-sweep.mjs`):
 *
 * | steps/job | budget then | keys whose held-out rows are bit-identical |
 * | ---: | ---: | ---: |
 * | 48 | 148,800 -- the minimum then | **775 / 775** |
 * | 96 | 297,600 | 651 / 775 |
 * | 192 | 595,200 | 164 / 775 |
 * | 384 | 1,190,400 | 3 / 775 |
 *
 * **Deliberately not renumbered for the fifteen-cell schedule.** The schedule is
 * 945 keys and its minimum budget 181,440 since `sword+axe` joined the strata,
 * so the *budget* column is superseded and every figure in it is 3,780/3,100 =
 * 1.219x low. The *keys* column is a measurement and cannot be rescaled: it
 * counts how many keys got a bit-identical held-out sample, which is a fact
 * about 775 particular bouts and not a proportion. Re-taking it costs a
 * 1,451,520-step run, which is a compute decision. What survives unchanged is
 * the thing the floor is about, because **the axis is steps per job and not the
 * key count**: every key gets its own bouts at `perJob` steps whatever the
 * schedule's length, so the 48/96/192/384 column means the same thing on 945
 * keys as on 775. The proportions are the honest reading -- 100 %, 84 %, 21 %,
 * 0.4 % -- and nothing has established that they carry across, because
 * `sword+axe`'s two-effector `cut` is a *new kind* of key rather than more of
 * the same.
 *
 * So **most** of the split becomes real somewhere between 96 and 192, and this
 * is a warning rather than a floor because the *model* fitted at the minimum
 * budget is fine -- it is the evidence about the model that is not evidence.
 * `calibrateTacticalModel` genuinely rescores against the validation rows and
 * genuinely covers every key; the rows just happen to be the same rows. The
 * report says which it got, measured rather than inferred, in
 * `identicalCalibrationKeys` -- which is the field that makes the stale table
 * above safe to leave standing, because a run reports its own count rather than
 * reading one from here.
 *
 * **192 is not where the split becomes a split, and the sentence used to say it
 * was.** 164 of 775 keys were still bit-identical there -- 21 % of the
 * calibration record in-sample -- against 3 of 775 at 384. A run at exactly 192
 * gets no warning, which is why the *measured* count is emitted beside the
 * warning by `lookaheadNotices` rather than left in the report for somebody to
 * look up. The floor stays at 192 because that is where the proxy stops being
 * useful, and the count is what is true.
 */
export const MIN_SPLIT_STEPS_PER_JOB = 192;

/**
 * The sentence, or null. Returned rather than printed, and exported rather than
 * inlined, so that a test can assert it without spending 181,440 solver steps to
 * reach the line that builds it.
 */
export const splitWarningFor = (solverSteps, stepsPerJob) => stepsPerJob >= MIN_SPLIT_STEPS_PER_JOB ? null :
  `lookahead budget ${solverSteps} gives ${stepsPerJob} solver steps per job, under the ${MIN_SPLIT_STEPS_PER_JOB} ` +
  "at which most of the validation split becomes real: the two bouts open identically whatever their seeds, and " +
  "measured at seed 310013 on the then-775-key schedule all 775 keys came back bit-identical at 48 steps per job, " +
  "651 at 96, 164 at 192 and 3 at 384. " +
  "Calibration below this is in-sample; read identicalCalibrationKeys in the report rather than trusting the label";

/**
 * How many (cell, tactic) keys got a validation sample bit-identical to their own
 * training sample -- the fact the warning above is a proxy for.
 *
 * Keyed exactly as `calibrateTacticalModel` keys its filter, and comparing the
 * three fields a calibration is computed from rather than the whole row, because
 * `split` and `traceIndex` differ between the two by construction and would make
 * every key look distinct.
 */
export function identicalSampleKeys(trainRows, validationRows) {
  const byKey = (rows) => rows.reduce((map, row) => { const key = `${row.bodyLoadout} ${row.tactic}`;
    return map.set(key, [...(map.get(key) ?? []), [row.before, row.after, row.contact]]); }, new Map());
  const train = byKey(trainRows);
  return [...byKey(validationRows)].filter(([key, held]) => canonicalJson(held) === canonicalJson(train.get(key) ?? [])).length;
}

/**
 * The champion score, and the choice it makes.
 *
 * Each column as a fraction of the tolerance the deployed gate gives it, summed
 * over cells. It summed the three raw numbers until session 19, which at the 2x
 * budget came to 1.145 + 42.778 + 1.373 -- **94.4 % Brier**, on a Brier that was
 * 99.6 % correlated with irreducible outcome variance, so the champion seed was
 * chosen by which validation bouts happened to contact least ambiguously. A sum
 * of three quantities in three units was never a score.
 *
 * **Exported, and separately, because inlined it was untestable.** Reverting
 * this to a raw sum of the three new columns left the whole suite green: the
 * champion is the same seed under both scores at all four budgets, so nothing
 * downstream moved either. **The inputs did move**, which the record under-sold:
 * at 595,200 the old score's winning margin was 0.003 % against 1.393 % under
 * severity, and at 1,190,400 the ranking of the two also-rans swaps.
 * `the_champion_is_chosen_by_severity_rather_than_by_a_sum_of_three_units` is
 * built on a pair the two scores order differently.
 *
 * `calibrationSeverity` takes the cell key because the reach tolerance depends
 * on the movement, and a champion chosen against scales the gate does not use
 * would be ranked by a threshold nothing enforces.
 */
export const modelCalibrationScore = (model, limits) => Object.entries(model.cells)
  .flatMap(([, tactics]) => Object.entries(tactics))
  .reduce((sum, [tactic, fitted]) => sum + calibrationSeverity(tactic, fitted.calibration, limits), 0);

/** Lowest score wins; ties go to the lower seed, so the choice is a function of the candidates and nothing else. */
export const selectCalibratedCandidate = (candidates, limits) =>
  [...candidates].sort((a, b) => modelCalibrationScore(a.model, limits) - modelCalibrationScore(b.model, limits) ||
    a.seed - b.seed)[0];

/**
 * The report record, built where a test can reach it.
 *
 * Every field here survived deletion silently -- `identicalCalibrationKeys` and
 * `splitWarning` both, and `splitWarningFor` could be handed a constant 384
 * instead of the run's own `perJob` -- because the only thing that built a
 * report spent 181,440 solver steps first.
 * `the_lookahead_report_carries_the_whole_record_a_run_is_judged_by` asserts the
 * whole record against a freshly stated one, which is the shape that grows with
 * the report instead of listing the field names somebody remembered.
 */
export function lookaheadReport({ configDigest, requestedSolverSteps, solverSteps, traceRows, model,
  selectedSeed, stepsPerJob, calibrationKeys, identicalCalibrationKeys }) {
  return { algorithm: "lookahead", configDigest, requestedSolverSteps, solverSteps,
    unspentSolverSteps: requestedSolverSteps - solverSteps, traceRows, modelDigest: model.digest,
    selectedSeed, solverStepsPerJob: stepsPerJob, calibrationKeys,
    identicalCalibrationKeys, splitWarning: splitWarningFor(requestedSolverSteps, stepsPerJob),
    calibration: Object.fromEntries(Object.entries(model.cells).map(([cell, tactics]) => [cell,
      Object.fromEntries(Object.entries(tactics).map(([tactic, fitted]) => [tactic, fitted.calibration]))])) };
}

/**
 * What a person running this needs told, read off the report rather than off the
 * budget.
 *
 * Two sentences and both are facts about the run. The first is the budget proxy;
 * the second is the thing the proxy is a proxy *for*, and it is here because a
 * run at exactly 192 steps per job gets no warning while 21 % of its calibration
 * record is still in-sample. A number nothing prints is a number nobody reads.
 */
export const lookaheadNotices = (report) => [
  report.splitWarning,
  report.identicalCalibrationKeys > 0 ?
    `lookahead calibration: ${report.identicalCalibrationKeys} of ${report.calibrationKeys} keys got a validation ` +
    "sample bit-identical to their own training sample, so that much of the calibration record is in-sample" : null,
].filter((sentence) => sentence !== null);

/**
 * The report to stdout, the notices to stderr, both through streams a caller
 * hands over.
 *
 * Injected rather than reaching for `process` so a test can assert what a run
 * emits without spending a budget; disabling the stderr write was one of five
 * wiring changes that left the suite green.
 *
 * **stdout is not currently a clean pipe and this is not the fix.** Babylon's
 * null engine logs its banner through `console.log` once per bout, so
 * `node scripts/train-lookahead.mjs > report.json` writes about 158 KB of
 * `BJS - ...` before the first `{`. The notices are on stderr because that is
 * where a warning belongs, not because the alternative works today.
 */
export const writeLookaheadOutput = (report, streams) => {
  for (const notice of lookaheadNotices(report)) streams.stderr.write(`${notice}\n`);
  streams.stdout.write(`${canonicalJson(report)}\n`);
};

const LOOKAHEAD_RESUME_VERSION = 1;
const LOOKAHEAD_RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const textEncoder = new TextEncoder(); const textDecoder = new TextDecoder();

/**
 * The immutable identity of a look-ahead run, including the complete schedule.
 *
 * A stopped run has no model: fitting only the prefix would make a syntactically
 * deployable controller whose calibrated tactic mask was silently narrowed by
 * the stop boundary. The state instead carries rows and the next one of all
 * 3,780 jobs; fitting happens only after that index reaches `groups`.
 */
export function lookaheadRunConfig({ seed, solverSteps, runId = null }) {
  if (!Number.isSafeInteger(seed)) throw new Error("lookahead seed must be a safe integer");
  if (!Number.isSafeInteger(solverSteps) || solverSteps <= 0) {
    throw new Error("lookahead solver-step budget must be a positive integer");
  }
  if (solverSteps % 4) throw new Error("lookahead solver-step budget must be a multiple of four");
  const fitSeeds = [seed, seed ^ 0x9e3779b9, seed ^ 0x51f15e];
  const trainTasks = lookaheadTacticCellSchedule("train", seed); const validationTasks = lookaheadTacticCellSchedule("validation", seed);
  const groups = fitSeeds.length * trainTasks.length + validationTasks.length;
  const perJob = Math.floor(solverSteps / groups / 4) * 4;
  if (perJob < 48) throw new Error(`lookahead budget ${solverSteps} cannot cover ${groups} indexed tactic-cell jobs; minimum is ${groups * 48}`);
  const schedule = { trainTasks: trainTasks.length, validationTasks: validationTasks.length, groups,
    digest: artifactChecksum(canonicalJson({ train: trainTasks, validation: validationTasks })) };
  const allocation = { perJob, extraJobs: (solverSteps - perJob * groups) / 4 };
  const identity = { version: LOOKAHEAD_RESUME_VERSION, algorithm: "lookahead", seed,
    requestedSolverSteps: solverSteps, fitSeeds, columns: TACTICAL_STATE_COLUMNS, schedule, allocation };
  const defaultRunId = `lookahead-${seed}-${artifactChecksum(canonicalJson(identity))}`;
  const chosenRunId = String(runId ?? defaultRunId);
  if (!LOOKAHEAD_RUN_ID.test(chosenRunId)) throw new Error("invalid --run-id");
  const config = { ...identity, runId: chosenRunId };
  // The directory label identifies one execution, not the search contract. Two
  // names for the same indexed search therefore share a config digest while
  // resume still compares the complete config, including `runId`.
  return { ...config, configDigest: artifactChecksum(canonicalJson(identity)) };
}

const initialLookaheadState = (config) => ({ nextJobIndex: 0, consumedSolverSteps: 0,
  candidates: config.fitSeeds.map((candidateSeed) => ({ seed: candidateSeed, jobsCompleted: 0, rows: [] })),
  validation: { jobsCompleted: 0, rows: [], solverSteps: 0 }, pendingCheckpoint: null });

const solverStepsForPrefix = (config, jobs) => config.allocation.perJob * jobs +
  Math.min(jobs, config.allocation.extraJobs) * 4;

/** Stable bytes are both the disk format and the comparison made by the resume test. */
export const encodeLookaheadResume = (config, state) => textEncoder.encode(canonicalJson({
  version: LOOKAHEAD_RESUME_VERSION, algorithm: "lookahead", config, state,
}));

export function decodeLookaheadResume(bytes, expectedConfig) {
  let saved;
  try { saved = JSON.parse(typeof bytes === "string" ? bytes : textDecoder.decode(bytes)); }
  catch (error) { throw new Error(`lookahead resume is not valid JSON: ${error.message}`); }
  if (saved?.version !== LOOKAHEAD_RESUME_VERSION || saved?.algorithm !== "lookahead") {
    throw new Error("lookahead resume has an unsupported version or algorithm");
  }
  if (canonicalJson(saved.config) !== canonicalJson(expectedConfig)) {
    throw new Error("lookahead resume refused: run id, seed, budget, or indexed schedule changed");
  }
  const state = saved.state;
  if (!Number.isSafeInteger(state?.nextJobIndex) || state.nextJobIndex < 0 || state.nextJobIndex > expectedConfig.schedule.groups) {
    throw new Error("lookahead resume has an invalid next job index");
  }
  if (!Number.isSafeInteger(state.consumedSolverSteps) || state.consumedSolverSteps !==
      solverStepsForPrefix(expectedConfig, state.nextJobIndex) ||
      !Array.isArray(state.candidates) || state.candidates.length !== expectedConfig.fitSeeds.length ||
      state.candidates.some((candidate, index) => candidate.seed !== expectedConfig.fitSeeds[index] ||
        !Number.isSafeInteger(candidate.jobsCompleted) || !Array.isArray(candidate.rows)) ||
      !Number.isSafeInteger(state.validation?.jobsCompleted) || !Array.isArray(state.validation?.rows) ||
      !Number.isSafeInteger(state.validation?.solverSteps)) {
    throw new Error("lookahead resume has invalid progress state");
  }
  const trainJobs = expectedConfig.schedule.trainTasks; const allTrainJobs = expectedConfig.fitSeeds.length * trainJobs;
  for (let index = 0; index < state.candidates.length; index += 1) {
    const expected = Math.max(0, Math.min(trainJobs, state.nextJobIndex - index * trainJobs));
    const candidate = state.candidates[index];
    if (candidate.jobsCompleted !== expected || (expected === 0) !== (candidate.rows.length === 0)) {
      throw new Error("lookahead resume candidate rows do not match its indexed training prefix");
    }
  }
  const validationJobs = Math.max(0, state.nextJobIndex - allTrainJobs);
  const validationStartSteps = solverStepsForPrefix(expectedConfig, allTrainJobs);
  if (state.validation.jobsCompleted !== validationJobs ||
      state.validation.solverSteps !== solverStepsForPrefix(expectedConfig,
        Math.max(state.nextJobIndex, allTrainJobs)) - validationStartSteps ||
      (validationJobs === 0) !== (state.validation.rows.length === 0)) {
    throw new Error("lookahead resume validation rows do not match its indexed validation prefix");
  }
  if (state.pendingCheckpoint !== null && (!state.pendingCheckpoint ||
      state.pendingCheckpoint.jobIndex !== state.nextJobIndex - 1 ||
      state.pendingCheckpoint.stepsConsumed !== state.consumedSolverSteps)) {
    throw new Error("lookahead resume pending checkpoint does not match its indexed prefix");
  }
  return state;
}

const scheduledLookaheadJob = (index, config, trainTasks, validationTasks) => {
  const trainJobCount = config.fitSeeds.length * trainTasks.length;
  if (index < trainJobCount) {
    const candidateIndex = Math.floor(index / trainTasks.length);
    return { split: "train", candidateIndex, seed: config.fitSeeds[candidateIndex],
      task: trainTasks[index % trainTasks.length] };
  }
  return { split: "validation", candidateIndex: null, seed: config.seed ^ 0x7f4a7c15,
    task: validationTasks[index - trainJobCount] };
};

/** The honest row material available before a calibrated model exists. */
export const lookaheadProgress = (config, state) => {
  const trainRows = state.candidates.reduce((sum, candidate) => sum + candidate.rows.length, 0);
  const keys = (rows) => new Set(rows.map((row) => `${row.bodyLoadout} ${row.tactic}`)).size;
  return { algorithm: "lookahead", runId: config.runId, configDigest: config.configDigest,
    jobIndex: state.nextJobIndex - 1, jobsCompleted: state.nextJobIndex, jobsTotal: config.schedule.groups,
    stepsConsumed: state.consumedSolverSteps, trainRows, validationRows: state.validation.rows.length,
    cellsFitted: 0, collectedKeys: state.candidates.reduce((sum, candidate) => sum + keys(candidate.rows), 0),
    calibrationKeys: keys(state.validation.rows), objective: { name: "calibrationSeverity", direction: "lower", value: null },
    champion: null, artifact: null };
};

/** One honest pre-fit row, shared by the live callback and crash reconciliation. */
export function makeLookaheadPartialLedgerRow({ config, state, ledgerRows, contractDigest,
  wallSeconds, stepsPerSecond, plateauEpsilon, plateauRows }) {
  const progress = lookaheadProgress(config, state);
  return makeLedgerRow({ previousRows: ledgerRows, direction: "lookahead", jobIndex: progress.jobIndex,
    stepsConsumed: progress.stepsConsumed, wallSeconds, stepsPerSecond,
    configDigest: progress.configDigest, contractDigest, validationMacro: null, validationWorstCell: null,
    objective: { name: "calibrationSeverity", direction: "lower", observed: false, value: null },
    gates: engagementGates({}), directionData: { jobsCompleted: progress.jobsCompleted, jobsTotal: progress.jobsTotal,
      cellsFitted: 0, collectedKeys: progress.collectedKeys, calibrationKeys: progress.calibrationKeys,
      identicalCalibrationKeys: { status: "unavailable", reason: "fitting and comparison require the complete schedule" },
      calibrationSeverity: { status: "unavailable", reason: "a partial schedule has no calibrated model" } },
    championBytes: null, championUnavailableReason: "look-ahead has no complete calibrated model before the full validation schedule",
    stepCeiling: config.requestedSolverSteps, plateauEpsilon, plateauRows });
}

/**
 * Recover the one transaction edge where atomic state landed and its append did
 * not. Telemetry is deliberately zero-duration: it is reconstructed data and
 * must not pretend the dead process reported a clock sample it never committed.
 */
export function reconcileLookaheadCheckpoint({ config, state, ledgerRows, contractDigest,
  plateauEpsilon, plateauRows }) {
  const pending = state.pendingCheckpoint;
  if (pending === null) return null;
  const last = ledgerRows.at(-1);
  if (last?.jobIndex === pending.jobIndex) return null;
  if (last && last.jobIndex > pending.jobIndex) throw new Error("lookahead ledger is ahead of its pending state checkpoint");
  return makeLookaheadPartialLedgerRow({ config, state, ledgerRows, contractDigest,
    wallSeconds: last?.wallSeconds ?? 0, stepsPerSecond: 0, plateauEpsilon, plateauRows });
}

export function assertLookaheadLedgerPrefix(state, ledgerRows) {
  const last = ledgerRows.at(-1);
  if (state.nextJobIndex === 0 && !last) return;
  const pending = state.pendingCheckpoint;
  if (pending && pending.jobIndex === state.nextJobIndex - 1 &&
      pending.stepsConsumed === state.consumedSolverSteps && (!last || last.jobIndex < pending.jobIndex)) return;
  if (!last || last.jobIndex !== state.nextJobIndex - 1 || last.stepsConsumed !== state.consumedSolverSteps) {
    throw new Error("lookahead resume state does not match the run ledger prefix");
  }
}

/** The durable final report is assembled from the rows that justify its stop. */
export function finalLookaheadReport(record, ledgerRows) {
  const stopped = ledgerStopDecision(ledgerRows);
  if (stopped !== "stopped: ceiling") throw new Error("lookahead completed without its solver-step ceiling");
  return { ...record, ledgerFile: "ledger.jsonl", stopped };
}

export async function trainLookahead({ seed, solverSteps, runId = null, resumeBytes = null, stopAfterJobs = 0,
  checkpointEveryJobs = 1, plateauEpsilon = DEFAULT_PLATEAU_EPSILON, plateauRows = DEFAULT_PLATEAU_ROWS,
  onCheckpoint = null, collectBudget = collectTacticalBudget }) {
  if (!Number.isSafeInteger(stopAfterJobs) || stopAfterJobs < 0) throw new Error("lookahead stop-after-jobs must be a non-negative integer");
  if (!Number.isSafeInteger(checkpointEveryJobs) || checkpointEveryJobs <= 0) {
    throw new Error("lookahead checkpoint-every-jobs must be a positive integer");
  }
  const config = lookaheadRunConfig({ seed, solverSteps, runId });
  const trainTasks = lookaheadTacticCellSchedule("train", seed); const validationTasks = lookaheadTacticCellSchedule("validation", seed);
  const state = resumeBytes ? decodeLookaheadResume(resumeBytes, config) : initialLookaheadState(config);
  let completedHere = 0;
  while (state.nextJobIndex < config.schedule.groups) {
    const jobIndex = state.nextJobIndex;
    const scheduled = scheduledLookaheadJob(jobIndex, config, trainTasks, validationTasks);
    const budget = config.allocation.perJob + (jobIndex < config.allocation.extraJobs ? 4 : 0);
    const trace = await collectBudget(scheduled.task, scheduled.seed, budget, scheduled.split, { jobIndex });
    if (!Number.isSafeInteger(trace?.solverSteps) || trace.solverSteps !== budget || trace.solverSteps % 4 !== 0 ||
        !Array.isArray(trace.rows) || trace.rows.length === 0) {
      throw new Error(`lookahead indexed job ${jobIndex} must consume exactly its assigned ${budget} solver steps and return rows`);
    }
    state.consumedSolverSteps += trace.solverSteps;
    if (scheduled.split === "train") { state.candidates[scheduled.candidateIndex].jobsCompleted += 1;
      state.candidates[scheduled.candidateIndex].rows.push(...trace.rows); }
    else { state.validation.jobsCompleted += 1; state.validation.solverSteps += trace.solverSteps;
      state.validation.rows.push(...trace.rows); }
    state.nextJobIndex += 1; completedHere += 1;
    const stopping = stopAfterJobs > 0 && completedHere >= stopAfterJobs && state.nextJobIndex < config.schedule.groups;
    const checkpoint = stopping || state.nextJobIndex === config.schedule.groups || state.nextJobIndex % checkpointEveryJobs === 0;
    if (checkpoint && onCheckpoint) {
      state.pendingCheckpoint = { jobIndex: state.nextJobIndex - 1, stepsConsumed: state.consumedSolverSteps };
      await onCheckpoint(encodeLookaheadResume(config, state), lookaheadProgress(config, state));
      state.pendingCheckpoint = null;
    }
    if (stopping) return { complete: false, resume: encodeLookaheadResume(config, state),
      ...lookaheadProgress(config, state) };
  }
  const candidates = state.candidates.map((candidate) => ({ ...candidate, model: fitTacticalModel(candidate.rows) }));
  const validation = state.validation;
  for (const candidate of candidates) candidate.model = calibrateTacticalModel(candidate.model, validation.rows);
  const selected = selectCalibratedCandidate(candidates, LOOKAHEAD_CALIBRATION_LIMITS);
  const model = selected.model; const trainRows = selected.rows;
  // Measured, not inferred from the budget: how many keys got a validation sample
  // that is bit-identical to their own training sample, and therefore a
  // calibration record that is in-sample under a held-out name. `splitWarningFor`
  // reads `perJob` because a budget can be judged before the bouts are spent;
  // this is the fact itself, and `lookaheadNotices` emits both.
  const identicalCalibrationKeys = identicalSampleKeys(trainRows, validation.rows);
  const calibrationKeys = new Set(validation.rows.map((row) => `${row.bodyLoadout} ${row.tactic}`)).size;
  const configDigest = config.configDigest;
  const payload = [...new TextEncoder().encode(canonicalJson(model))];
  const artifact = new ResearchArtifact({ algorithm: "lookahead", ...RESEARCH_ARTIFACT_CONTRACT, payload,
    provenance: { runId: config.runId, seed, solverSteps: state.consumedSolverSteps,
      trainingSplit: "train", validationSplit: "validation", configDigest } },
    RESEARCH_ARTIFACT_CONTRACT);
  const report = { runId: config.runId, ...lookaheadReport({ configDigest, requestedSolverSteps: solverSteps,
    solverSteps: state.consumedSolverSteps,
    traceRows: trainRows.length, model, selectedSeed: selected.seed, stepsPerJob: config.allocation.perJob,
    calibrationKeys, identicalCalibrationKeys }), ledgerFile: "ledger.jsonl",
    stopping: { plateauEpsilon, plateauRows, stepCeiling: solverSteps } };
  return { complete: true, artifact: artifact.toBytes(), report: textEncoder.encode(canonicalJson(report)),
    resume: encodeLookaheadResume(config, state), model, record: report };
}

export async function runLookaheadCli() {
  const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const flag = (name) => process.argv.includes(`--${name}`);
  const seed = Number(arg("seed", 310013)); const solverSteps = Number(arg("solver-steps", 181_440));
  const plateauEpsilon = Number(arg("plateau-epsilon", DEFAULT_PLATEAU_EPSILON));
  const plateauRows = Number(arg("plateau-rows", DEFAULT_PLATEAU_ROWS));
  const stopAfterJobs = Number(arg("stop-after-jobs", 0));
  const checkpointEveryJobs = Number(arg("checkpoint-every-jobs", 1));
  if (!Number.isFinite(plateauEpsilon) || plateauEpsilon < 0) throw new Error("--plateau-epsilon must be a non-negative number");
  if (!Number.isSafeInteger(plateauRows) || plateauRows <= 0) throw new Error("--plateau-rows must be a positive integer");
  if (!Number.isSafeInteger(stopAfterJobs) || stopAfterJobs < 0) throw new Error("--stop-after-jobs must be a non-negative integer");
  if (!Number.isSafeInteger(checkpointEveryJobs) || checkpointEveryJobs <= 0) throw new Error("--checkpoint-every-jobs must be a positive integer");
  const provisional = lookaheadRunConfig({ seed, solverSteps, runId: arg("run-id", null) });
  const runDir = new URL(`../asset-src/learning/research/${provisional.runId}/`, import.meta.url);
  const runPath = fileURLToPath(runDir); await mkdir(runPath, { recursive: true });
  const statePath = arg("state", fileURLToPath(new URL("state.json", runDir)));
  const resumeFrom = arg("resume-from", flag("resume") ? statePath : "");
  const encodeCliState = (bytes) => textEncoder.encode(canonicalJson({ version: 1,
    resume: Buffer.from(bytes).toString("base64"), plateauEpsilon, plateauRows }));
  const decodeCliState = (bytes) => { let value; try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { return bytes; }
    if (value?.version !== 1 || typeof value.resume !== "string") return bytes;
    if (value.plateauEpsilon !== plateauEpsilon || value.plateauRows !== plateauRows) {
      throw new Error("lookahead resume refused: plateau contract changed");
    }
    return new Uint8Array(Buffer.from(value.resume, "base64")); };
  let resumeBytes = resumeFrom ? decodeCliState(new Uint8Array(await readFile(resolve(resumeFrom)))) : null;
  const contractDigest = digestContract(RESEARCH_ARTIFACT_CONTRACT);
  let ledgerRows = await readLedger(resolve(runPath, "ledger.jsonl"));
  if (!resumeBytes && ledgerRows.length) throw new Error(`lookahead run "${provisional.runId}" already has a ledger; use --resume or a new --run-id`);
  if (resumeBytes) {
    const resumedState = decodeLookaheadResume(resumeBytes, provisional);
    if (resumedState.nextJobIndex < provisional.schedule.groups) {
      const recovered = reconcileLookaheadCheckpoint({ config: provisional, state: resumedState, ledgerRows, contractDigest,
        plateauEpsilon, plateauRows });
      if (recovered) { await checkpointRun({ runDir: runPath, row: recovered, championBytes: null });
        ledgerRows.push(recovered); process.stdout.write(`${recovered.summary}\n`); }
    }
    assertLookaheadLedgerPrefix(resumedState, ledgerRows);
    resumedState.pendingCheckpoint = null; resumeBytes = encodeLookaheadResume(provisional, resumedState);
  }
  const existingStop = ledgerStopDecision(ledgerRows);
  if (resumeBytes && existingStop && await runIsFinalized(runPath)) throw new Error(`lookahead resume refused: ${existingStop}`);
  const baseWallSeconds = ledgerRows.at(-1)?.wallSeconds ?? 0; const started = performance.now();
  const output = await trainLookahead({ seed, solverSteps, runId: provisional.runId, resumeBytes,
    stopAfterJobs, checkpointEveryJobs, plateauEpsilon, plateauRows,
    onCheckpoint: async (bytes, progress) => {
      await writeAtomic(statePath, encodeCliState(bytes));
      if (progress.jobsCompleted === progress.jobsTotal) return;
      const wallSeconds = baseWallSeconds + (performance.now() - started) / 1000;
      const row = makeLookaheadPartialLedgerRow({ config: provisional, state: decodeLookaheadResume(bytes, provisional),
        ledgerRows, contractDigest, wallSeconds,
        stepsPerSecond: (progress.stepsConsumed - (ledgerRows.at(-1)?.stepsConsumed ?? 0)) /
          Math.max(0.001, wallSeconds - (ledgerRows.at(-1)?.wallSeconds ?? baseWallSeconds)),
        plateauEpsilon, plateauRows });
      await checkpointRun({ runDir: runPath, row, championBytes: null }); ledgerRows.push(row);
      process.stdout.write(`${row.summary}\n`);
    } });
  if (!output.complete) { process.stdout.write(`lookahead paused after ${output.jobsCompleted}/${output.jobsTotal} jobs; resume from ${statePath}\n`); return; }
  const inProgress = inProgressResearchArtifact(decodeResearchArtifact(output.artifact), provisional.runId).toBytes();
  const wallSeconds = baseWallSeconds + (performance.now() - started) / 1000;
  const severity = modelCalibrationScore(output.model, LOOKAHEAD_CALIBRATION_LIMITS);
  const row = makeLedgerRow({ previousRows: ledgerRows, direction: "lookahead", jobIndex: provisional.schedule.groups - 1,
    stepsConsumed: output.record.solverSteps, wallSeconds,
    stepsPerSecond: (output.record.solverSteps - (ledgerRows.at(-1)?.stepsConsumed ?? 0)) /
      Math.max(0.001, wallSeconds - (ledgerRows.at(-1)?.wallSeconds ?? baseWallSeconds)),
    configDigest: provisional.configDigest, contractDigest, validationMacro: null, validationWorstCell: null,
    objective: { name: "calibrationSeverity", direction: "lower", value: severity }, gates: engagementGates({}),
    directionData: { jobsCompleted: provisional.schedule.groups, jobsTotal: provisional.schedule.groups,
      cellsFitted: Object.values(output.model.cells).reduce((sum, tactics) => sum + Object.keys(tactics).length, 0),
      calibrationKeys: output.record.calibrationKeys, identicalCalibrationKeys: output.record.identicalCalibrationKeys,
      calibrationSeverity: severity }, championBytes: inProgress,
    stepCeiling: solverSteps, plateauEpsilon, plateauRows });
  if (!existingStop) { await checkpointRun({ runDir: runPath, row, championBytes: inProgress }); ledgerRows.push(row); }
  await writeAtomic(statePath, encodeCliState(output.resume));
  const finalReport = finalLookaheadReport(output.record, ledgerRows);
  const finalReportBytes = textEncoder.encode(canonicalJson(finalReport));
  await finalizeRun({ runDir: runPath, championBytes: output.artifact, reportBytes: finalReportBytes });
  if (arg("artifact", "")) await writeAtomic(arg("artifact", ""), output.artifact);
  if (arg("report", "")) await writeAtomic(arg("report", ""), finalReportBytes);
  writeLookaheadOutput(finalReport, { stdout: process.stdout, stderr: process.stderr });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runLookaheadCli();
