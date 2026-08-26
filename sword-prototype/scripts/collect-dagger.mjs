import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

import { ResearchArtifact } from "../src/learning/artifact.ts";
import { aggregateDaggerRows, balancedDaggerRows, daggerClassificationMetrics, DAGGER_HEAD_NAMES, predictDagger,
  requireTeacherEngagement, selectDaggerIteration, trainDaggerModel } from "../src/learning/dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { inProgressResearchArtifact, RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { TACTICAL_TEACHER_VERSION } from "../src/learning/tactical-teacher.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES } from "../src/options.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { checkpointJobDue, checkpointRun, DEFAULT_PLATEAU_EPSILON, DEFAULT_PLATEAU_ROWS, digestContract,
  engagementGates, finalizeRun, ledgerStopDecision, makeLedgerRow, readLedger, runIsFinalized } from "./research-ledger.mjs";

const argv = process.argv.slice(2);
const value = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at < 0 ? fallback : argv[at + 1]; };
const flag = (name) => argv.includes(`--${name}`); const smoke = flag("smoke");
const seed = Number(value("seed", 310013)); const solverSteps = Number(value("solver-steps", smoke ? 19_200 : 1_800_000_000));
const iterations = Number(value("iterations", smoke ? 2 : 5)); const workers = Number(value("workers", smoke ? 1 : 8));
const checkpointEveryJobs = Number(value("checkpoint-every-jobs", 1));
const plateauEpsilon = Number(value("plateau-epsilon", DEFAULT_PLATEAU_EPSILON));
const plateauRows = Number(value("plateau-rows", DEFAULT_PLATEAU_ROWS));
for (const [name, number] of Object.entries({ seed, solverSteps, iterations, workers, checkpointEveryJobs, plateauRows })) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`--${name} must be a positive integer`);
}
if (!Number.isFinite(plateauEpsilon) || plateauEpsilon < 0) throw new Error("--plateau-epsilon must be a non-negative number");
if (solverSteps % 4 !== 0) throw new Error("--solver-steps must be divisible by four");
const evaluationJobs = iterations * 2; const quanta = solverSteps / 4; const baseQuanta = Math.floor(quanta / evaluationJobs);
const extraJobs = quanta % evaluationJobs; if (baseQuanta < 1) throw new Error("DAgger budget cannot cover every train/validation job");
// The output vocabulary, for the reason written out in full on `train-neat-qd.mjs`'s
// own `config`: without it this text is byte-identical either side of a change to
// what a network *writes*, so `--resume` reloads a population or a model bred
// against a retired output contract, and `configDigest` -- which is the default
// `runId` and goes into artifact provenance -- cannot tell the two runs apart.
const config = { version: 1, algorithm: "dagger", seed, solverSteps, iterations,
  budgetAllocation: { evaluationJobs, baseQuanta, extraJobs }, teacherVersion: TACTICAL_TEACHER_VERSION,
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  teacherEngagementFloor: 0.05, featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS,
  tacticVersion: TACTIC_VERSION, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES,
  effectorNames: EFFECTOR_NAMES, targetNames: TARGET_NAMES, stanceNames: STANCE_NAMES,
  humanTraceStratum: "absent-optional", plateauEpsilon, plateauRows };
const configText = JSON.stringify(config); const configDigest = createHash("sha256").update(configText).digest("hex").slice(0, 16);
const runId = String(value("run-id", `dagger-${seed}-${configDigest}`));
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId)) throw new Error("invalid --run-id");
const runDir = new URL(`../asset-src/learning/research/${runId}/`, import.meta.url); await mkdir(runDir, { recursive: true });
const stateUrl = new URL("state.json", runDir);
const atomic = async (url, data) => { const temporary = new URL(`${url.pathname.split("/").pop()}.tmp-${process.pid}`, runDir);
  await writeFile(temporary, data); await rename(temporary, url); };
const runPath = fileURLToPath(runDir); const contractDigest = digestContract(RESEARCH_ARTIFACT_CONTRACT);

let nextIteration = 0; let consumedSolverSteps = 0; let iterationRows = []; let validations = []; let models = [];
let partialCollection = null; let pendingTraining = null; let completedJobs = 0;
let checkpointRows = []; let pendingLedgerRow = null;
if (flag("resume")) { const saved = JSON.parse(await readFile(stateUrl, "utf8"));
  if (JSON.stringify(saved.config) !== configText) throw new Error("DAgger resume refused: config digest changed");
  ({ nextIteration, consumedSolverSteps, iterationRows, validations, models, partialCollection = null, pendingTraining = null,
    completedJobs = 0, pendingLedgerRow = null } = saved); }
const existingRows = await readLedger(fileURLToPath(new URL("ledger.jsonl", runDir)));
if (!flag("resume") && existingRows.length > 0) throw new Error(`DAgger run "${runId}" already has a ledger; use --resume or a new --run-id`);
checkpointRows = existingRows; const baseWallSeconds = checkpointRows.at(-1)?.wallSeconds ?? 0;
const runStarted = performance.now(); let previousCheckpointWall = baseWallSeconds;
const budgetFor = (iteration, split) => { const ordinal = iteration * 2 + (split === "validation" ? 1 : 0);
  return (baseQuanta + (ordinal < extraJobs ? 1 : 0)) * 4; };
// One misclassification per head plus the persistence error, so the number an
// iteration is *selected* on scores the whole label. It was movement + action +
// persistence, which is the loss a three-field teacher owed; leaving it there
// would have selected the DAgger iteration that got two of five heads right.
// The scale moves with it -- 0..5 + persistence a row rather than 0..2 -- so
// losses are comparable within a run and not across the widening, which is the
// same thing `teacherVersion` now says out loud.
const loss = (rows, model) => rows.reduce((sum, row) => { const predicted = predictDagger(model, row.features);
  return sum + DAGGER_HEAD_NAMES.reduce((wrong, name) => wrong + (predicted[name] === row.label[name] ? 0 : 1), 0) +
    Math.abs(predicted.persistence - row.label.persistence); }, 0) / Math.max(1, rows.length);

const emptyMetrics = () => ({ opportunities: 0, attacksInWindow: 0, contactsInWindow: 0, damage: 0,
  nearRangeStallSeconds: 0, seconds: 0, firstAttackSeconds: [] });
const addMetrics = (into, from) => {
  for (const name of ["opportunities", "attacksInWindow", "contactsInWindow", "damage", "nearRangeStallSeconds", "seconds"]) {
    into[name] += from[name] ?? 0;
  }
  into.firstAttackSeconds.push(...(from.firstAttackSeconds ?? []));
};
const finishMetrics = (metrics) => ({ ...metrics,
  opportunityConversion: metrics.opportunities ? metrics.attacksInWindow / metrics.opportunities : 0,
  contactConversion: metrics.attacksInWindow ? metrics.contactsInWindow / metrics.attacksInWindow : 0 });

async function collect(iteration, split, deployed, budget, partial, onShard) {
  const matrix = researchMatrix(split, seed); const logicalJobs = Math.min(8, budget / 4);
  const totalQuanta = budget / 4; const base = Math.floor(totalQuanta / logicalJobs); const extra = totalQuanta % logicalJobs;
  const descriptors = Array.from({ length: logicalJobs }, (_, shard) => {
    const shardBudget = (base + (shard < extra ? 1 : 0)) * 4;
    const jobs = Array.from({ length: Math.max(1, Math.min(8, matrix.length)) }, (_, offset) => {
      const source = matrix[(iteration * 7 + shard + offset * logicalJobs) % matrix.length]; return { ...source, index: iteration * matrix.length + shard + offset * logicalJobs };
    });
    return { shardBudget, jobs };
  });
  if (partial && (partial.iteration !== iteration || partial.split !== split || partial.logicalJobs !== logicalJobs)) {
    throw new Error("DAgger partial collection does not match the requested indexed phase");
  }
  const collectedRows = partial?.rows ?? []; const metrics = partial?.metrics ?? emptyMetrics();
  const firstShard = partial?.nextShard ?? 0;
  for (let start = firstShard; start < descriptors.length; start += workers) {
    const batch = await Promise.all(descriptors.slice(start, start + workers).map(({ shardBudget, jobs }) =>
      new Promise((resolve, reject) => { const worker = new Worker(new URL("./research-rollout-worker.mjs", import.meta.url),
      { workerData: { mode: "dagger", jobs, budget: shardBudget, deployed, iteration } });
      worker.once("message", resolve); worker.once("error", reject); worker.once("exit", (code) => { if (code !== 0) reject(new Error(`DAgger worker exited ${code}`)); }); })));
    for (let offset = 0; offset < batch.length; offset += 1) {
      const result = batch[offset]; collectedRows.push(...result.rows); addMetrics(metrics, result.metrics);
      consumedSolverSteps += result.solverSteps;
      const nextShard = start + offset + 1; partialCollection = { iteration, split, logicalJobs,
        nextShard, rows: collectedRows, metrics };
      completedJobs += 1;
      await onShard(partialCollection, nextShard === descriptors.length);
    }
  }
  partialCollection = null; return { rows: collectedRows, metrics: finishMetrics(metrics), logicalJobs };
}

const selectedNow = () => validations.length ? selectDaggerIteration(validations) : null;
const artifactForSelected = (inProgress) => {
  const selected = selectedNow(); if (!selected) return null; const model = models[selected.iteration];
  const payload = new TextEncoder().encode(JSON.stringify(model));
  const artifact = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT, payload: [...payload],
    provenance: { seed, configDigest, solverSteps: selected.solverSteps, selectedIteration: selected.iteration,
      teacherVersion: TACTICAL_TEACHER_VERSION, humanTraceStratum: "absent-optional", trainingSplit: "train",
      validationSplit: "validation" } }, RESEARCH_ARTIFACT_CONTRACT);
  return inProgress ? inProgressResearchArtifact(artifact, runId) : artifact;
};
const stateBytes = () => `${JSON.stringify({ config, nextIteration, consumedSolverSteps, iterationRows, validations,
  models, partialCollection, pendingTraining, completedJobs, pendingLedgerRow }, null, 2)}\n`;
const persist = () => atomic(stateUrl, stateBytes());
const checkpoint = async ({ jobIndex, objective, validationMacro = null, validationWorstCell = null, gates, directionData }) => {
  const wallSeconds = baseWallSeconds + (performance.now() - runStarted) / 1000;
  const champion = artifactForSelected(true); const championBytes = champion?.toBytes() ?? null;
  const row = makeLedgerRow({ previousRows: checkpointRows, direction: "dagger", jobIndex,
    stepsConsumed: consumedSolverSteps, wallSeconds,
    stepsPerSecond: (consumedSolverSteps - (checkpointRows.at(-1)?.stepsConsumed ?? 0)) /
      Math.max(0.001, wallSeconds - previousCheckpointWall), configDigest, contractDigest,
    validationMacro, validationWorstCell, objective, gates, directionData, championBytes,
    stepCeiling: solverSteps, plateauEpsilon, plateauRows,
    championUnavailableReason: "DAgger has not completed a validation iteration yet" });
  checkpointRows.push(row); previousCheckpointWall = wallSeconds; pendingLedgerRow = row;
  await persist(); await checkpointRun({ runDir: runPath, row, championBytes }); pendingLedgerRow = null; await persist();
  process.stdout.write(`${row.summary}\n`);
  return ledgerStopDecision(checkpointRows);
};

if (pendingLedgerRow) {
  const bytes = artifactForSelected(true)?.toBytes() ?? null;
  if (checkpointRows.length === pendingLedgerRow.row) {
    await checkpointRun({ runDir: runPath, row: pendingLedgerRow, championBytes: bytes }); checkpointRows.push(pendingLedgerRow);
  } else if (JSON.stringify(checkpointRows.at(-1)) !== JSON.stringify(pendingLedgerRow)) {
    throw new Error("DAgger pending ledger row does not match the complete ledger prefix");
  }
  pendingLedgerRow = null; await persist();
}
let stopped = ledgerStopDecision(checkpointRows);
if (flag("resume") && stopped && await runIsFinalized(runPath)) throw new Error(`DAgger resume refused: ${stopped}`);

for (let iteration = nextIteration; iteration < iterations && !stopped; iteration += 1) {
  const deployed = iteration === 0 ? null : models[iteration - 1];
  const trainBudget = budgetFor(iteration, "train"); const trainLogicalJobs = Math.min(8, trainBudget / 4);
  const training = pendingTraining?.iteration === iteration
    ? { rows: iterationRows[iteration], metrics: pendingTraining.metrics, logicalJobs: trainLogicalJobs }
    : await collect(iteration, "train", deployed, trainBudget,
      partialCollection?.split === "train" ? partialCollection : null, async (partial, final) => {
      if (checkpointJobDue(completedJobs, checkpointEveryJobs)) stopped = await checkpoint({ jobIndex: completedJobs - 1,
        objective: { name: "validationLoss", direction: "lower", observed: false, value: null },
        gates: engagementGates(partial.metrics), directionData: { iteration, phase: "train", shard: partial.nextShard,
          shards: partial.logicalJobs, rowsAggregated: partial.rows.length,
          macroF1: { status: "unavailable", reason: "partial training shards have no fitted validation model" } } });
      else await persist();
    });
  if (iteration === 0) requireTeacherEngagement(training.metrics.opportunityConversion, config.teacherEngagementFloor);
  if (iterationRows.length === iteration) iterationRows.push(training.rows); else iterationRows[iteration] = training.rows;
  pendingTraining = { iteration, metrics: training.metrics };
  const aggregate = balancedDaggerRows(aggregateDaggerRows(iterationRows), 64);
  const model = trainDaggerModel(aggregate, FEATURE_COLUMNS.length,
    { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES, target: TARGET_NAMES, stance: STANCE_NAMES },
    TACTICAL_TEACHER_VERSION, smoke ? 2 : 8, 0.01, seed, 12);
  if (models.length === iteration) models.push(model); else models[iteration] = model;
  await persist(); const validationBudget = budgetFor(iteration, "validation");
  const validation = await collect(iteration, "validation", model, validationBudget,
    partialCollection?.split === "validation" ? partialCollection : null, async (partial, final) => {
      if (final) return;
      if (checkpointJobDue(completedJobs, checkpointEveryJobs)) stopped = await checkpoint({ jobIndex: completedJobs - 1,
        objective: { name: "validationLoss", direction: "lower", observed: false, value: null },
        gates: engagementGates(partial.metrics), directionData: { iteration, phase: "validation", shard: partial.nextShard,
          shards: partial.logicalJobs, rowsAggregated: partial.rows.length,
          macroF1: { status: "unavailable", reason: "partial validation shards do not produce complete macro F1" } } });
      else await persist();
    });
  const validationRow = { iteration, validationLoss: loss(validation.rows, model), trainRows: training.rows.length,
    validationRows: validation.rows.length, classification: daggerClassificationMetrics(validation.rows, model),
    train: training.metrics, rollout: validation.metrics, solverSteps: consumedSolverSteps };
  if (validations.length === iteration) validations.push(validationRow); else validations[iteration] = validationRow;
  nextIteration = iteration + 1; pendingTraining = null;
  stopped = await checkpoint({ jobIndex: completedJobs - 1,
    objective: { name: "validationLoss", direction: "lower", value: validationRow.validationLoss },
    gates: engagementGates(validation.metrics), directionData: { iteration, phase: "validation", shard: validation.logicalJobs,
      shards: validation.logicalJobs, rowsAggregated: aggregate.length,
      macroF1: Object.fromEntries(Object.entries(validationRow.classification).map(([name, metrics]) => [name, metrics.macroF1])) } });
  if (stopped) break;
}
const selected = selectDaggerIteration(validations); const model = models[selected.iteration];
const artifact = artifactForSelected(false);
stopped ??= consumedSolverSteps >= solverSteps ? "stopped: ceiling" : ledgerStopDecision(checkpointRows);
if (!stopped) throw new Error("DAgger ended without a plateau or solver-step ceiling");
const report = { version: 1, algorithm: "dagger", config, configDigest, consumedSolverSteps, selectedIteration: selected.iteration,
  comparisons: { teacherOnly: validations[0]?.train ?? null, behaviorClone: validations[0] ?? null, dagger: selected }, validations,
  daggerOutperformedClone: selected.iteration > 0 && selected.validationLoss < validations[0].validationLoss,
  ledgerFile: "ledger.jsonl", stopping: { plateauEpsilon, plateauRows, stepCeiling: solverSteps }, stopped };
await finalizeRun({ runDir: runPath, championBytes: artifact.toBytes(), reportBytes: `${JSON.stringify(report, null, 2)}\n` });
process.stdout.write(`${JSON.stringify({ runId, consumedSolverSteps, report: new URL("report.json", runDir).pathname })}\n`);
