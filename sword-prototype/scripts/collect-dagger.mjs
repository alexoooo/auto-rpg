import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";

import { ResearchArtifact } from "../src/learning/artifact.ts";
import { aggregateDaggerRows, balancedDaggerRows, daggerClassificationMetrics, predictDagger, requireTeacherEngagement,
  selectDaggerIteration, trainDaggerModel } from "../src/learning/dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { TACTICAL_TEACHER_VERSION } from "../src/learning/tactical-teacher.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES } from "../src/options.ts";

const argv = process.argv.slice(2);
const value = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at < 0 ? fallback : argv[at + 1]; };
const flag = (name) => argv.includes(`--${name}`); const smoke = flag("smoke");
const seed = Number(value("seed", 310013)); const solverSteps = Number(value("solver-steps", smoke ? 19_200 : 1_800_000_000));
const iterations = Number(value("iterations", smoke ? 2 : 5)); const workers = Number(value("workers", smoke ? 1 : 8));
for (const [name, number] of Object.entries({ seed, solverSteps, iterations, workers })) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`--${name} must be a positive integer`);
}
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
  teacherEngagementFloor: 0.05, featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS,
  tacticVersion: TACTIC_VERSION, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES,
  effectorNames: EFFECTOR_NAMES, targetNames: TARGET_NAMES, stanceNames: STANCE_NAMES,
  humanTraceStratum: "absent-optional" };
const configText = JSON.stringify(config); const configDigest = createHash("sha256").update(configText).digest("hex").slice(0, 16);
const runId = String(value("run-id", `dagger-${seed}-${configDigest}`));
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId)) throw new Error("invalid --run-id");
const runDir = new URL(`../asset-src/learning/research/${runId}/`, import.meta.url); await mkdir(runDir, { recursive: true });
const stateUrl = new URL("state.json", runDir);
const atomic = async (url, data) => { const temporary = new URL(`${url.pathname.split("/").pop()}.tmp-${process.pid}`, runDir);
  await writeFile(temporary, data); await rename(temporary, url); };

let nextIteration = 0; let consumedSolverSteps = 0; let iterationRows = []; let validations = []; let models = [];
if (flag("resume")) { const saved = JSON.parse(await readFile(stateUrl, "utf8"));
  if (JSON.stringify(saved.config) !== configText) throw new Error("DAgger resume refused: config digest changed");
  ({ nextIteration, consumedSolverSteps, iterationRows, validations, models } = saved); }
const budgetFor = (iteration, split) => { const ordinal = iteration * 2 + (split === "validation" ? 1 : 0);
  return (baseQuanta + (ordinal < extraJobs ? 1 : 0)) * 4; };
const loss = (rows, model) => rows.reduce((sum, row) => { const predicted = predictDagger(model, row.features);
  return sum + (predicted.movement === row.label.movement ? 0 : 1) + (predicted.action === row.label.action ? 0 : 1) +
    Math.abs(predicted.persistence - row.label.persistence); }, 0) / Math.max(1, rows.length);

async function collect(iteration, split, deployed, budget) {
  const matrix = researchMatrix(split, seed); const logicalJobs = Math.min(8, budget / 4);
  const totalQuanta = budget / 4; const base = Math.floor(totalQuanta / logicalJobs); const extra = totalQuanta % logicalJobs;
  const descriptors = Array.from({ length: logicalJobs }, (_, shard) => {
    const shardBudget = (base + (shard < extra ? 1 : 0)) * 4;
    const jobs = Array.from({ length: Math.max(1, Math.min(8, matrix.length)) }, (_, offset) => {
      const source = matrix[(iteration * 7 + shard + offset * logicalJobs) % matrix.length]; return { ...source, index: iteration * matrix.length + shard + offset * logicalJobs };
    });
    return { shardBudget, jobs };
  });
  const results = [];
  for (let start = 0; start < descriptors.length; start += workers) {
    const batch = await Promise.all(descriptors.slice(start, start + workers).map(({ shardBudget, jobs }) =>
      new Promise((resolve, reject) => { const worker = new Worker(new URL("./research-rollout-worker.mjs", import.meta.url),
      { workerData: { mode: "dagger", jobs, budget: shardBudget, deployed, iteration } });
      worker.once("message", resolve); worker.once("error", reject); worker.once("exit", (code) => { if (code !== 0) reject(new Error(`DAgger worker exited ${code}`)); }); })));
    results.push(...batch);
  }
  const rows = results.flatMap((result) => result.rows); consumedSolverSteps += results.reduce((sum, result) => sum + result.solverSteps, 0);
  const opportunities = results.reduce((sum, result) => sum + result.metrics.opportunities, 0);
  const attacksInWindow = results.reduce((sum, result) => sum + result.metrics.attacksInWindow, 0);
  const contactsInWindow = results.reduce((sum, result) => sum + result.metrics.contactsInWindow, 0);
  const damage = results.reduce((sum, result) => sum + result.metrics.damage, 0);
  return { rows, metrics: { opportunities, attacksInWindow, contactsInWindow, damage,
    opportunityConversion: opportunities ? attacksInWindow / opportunities : 0,
    contactConversion: attacksInWindow ? contactsInWindow / attacksInWindow : 0 } };
}

for (let iteration = nextIteration; iteration < iterations; iteration += 1) {
  const deployed = iteration === 0 ? null : models[iteration - 1];
  const training = await collect(iteration, "train", deployed, budgetFor(iteration, "train"));
  if (iteration === 0) requireTeacherEngagement(training.metrics.opportunityConversion, config.teacherEngagementFloor);
  iterationRows.push(training.rows); const aggregate = balancedDaggerRows(aggregateDaggerRows(iterationRows), 64);
  const model = trainDaggerModel(aggregate, FEATURE_COLUMNS.length, MOVEMENT_NAMES, HAND_ACTION_NAMES,
    smoke ? 2 : 8, 0.01, seed, 12);
  models.push(model); const validation = await collect(iteration, "validation", model, budgetFor(iteration, "validation"));
  validations.push({ iteration, validationLoss: loss(validation.rows, model), trainRows: training.rows.length,
    validationRows: validation.rows.length, classification: daggerClassificationMetrics(validation.rows, model),
    train: training.metrics, rollout: validation.metrics });
  nextIteration = iteration + 1; await atomic(stateUrl, `${JSON.stringify({ config, nextIteration, consumedSolverSteps,
    iterationRows, validations, models }, null, 2)}\n`);
}
if (consumedSolverSteps !== solverSteps) throw new Error(`DAgger spent ${consumedSolverSteps} solver steps, expected exactly ${solverSteps}`);
const selected = selectDaggerIteration(validations); const model = models[selected.iteration];
const payload = new TextEncoder().encode(JSON.stringify(model)); const artifact = new ResearchArtifact({ algorithm: "dagger",
  ...RESEARCH_ARTIFACT_CONTRACT,
  payload: [...payload], provenance: { seed, configDigest, solverSteps: consumedSolverSteps, selectedIteration: selected.iteration,
    teacherVersion: TACTICAL_TEACHER_VERSION, humanTraceStratum: "absent-optional", trainingSplit: "train",
    validationSplit: "validation" } }, RESEARCH_ARTIFACT_CONTRACT);
const report = { version: 1, algorithm: "dagger", config, configDigest, consumedSolverSteps, selectedIteration: selected.iteration,
  comparisons: { teacherOnly: validations[0]?.train ?? null, behaviorClone: validations[0] ?? null, dagger: selected }, validations,
  daggerOutperformedClone: selected.iteration > 0 && selected.validationLoss < validations[0].validationLoss,
  fullBudgetCompleted: solverSteps === 1_800_000_000 };
await atomic(new URL("champion.artifact", runDir), artifact.toBytes());
await atomic(new URL("report.json", runDir), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ runId, consumedSolverSteps, report: new URL("report.json", runDir).pathname })}\n`);
