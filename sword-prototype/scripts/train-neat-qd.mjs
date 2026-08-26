import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

import { ResearchArtifact } from "../src/learning/artifact.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { adaptiveCompatibilityThreshold, breedGeneration, cloneGenome, initialSparseGenome, InnovationTracker,
  innovationTrackerFor, speciate } from "../src/learning/genome.ts";
import { QualityArchive, selectValidationChampion } from "../src/learning/quality-diversity.ts";
import { curriculumDigest, curriculumStage, opponentForArchive, researchMatrix, sampleOpponentArchive,
  SHIPPED_OPPONENT_ARCHIVE } from "../src/learning/research-matrix.ts";
import { META_OUTPUT_LAYOUT } from "../src/learning/meta.ts";
import { inProgressResearchArtifact, RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES } from "../src/options.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { checkpointJobDue, checkpointRun, DEFAULT_PLATEAU_EPSILON, DEFAULT_PLATEAU_ROWS, digestContract, engagementGates,
  finalizeRun, ledgerStopDecision, makeLedgerRow, readLedger, runIsFinalized } from "./research-ledger.mjs";

const argv = process.argv.slice(2); const value = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at < 0 ? fallback : argv[at + 1]; };
const flag = (name) => argv.includes(`--${name}`); const smoke = flag("smoke");
const seed = Number(value("seed", 310013)); const solverSteps = Number(value("solver-steps", smoke ? 30_720 : 1_800_000_000));
const populationSize = Number(value("population", smoke ? 4 : 128)); const generations = Number(value("generations", smoke ? 2 : 80));
const workers = Number(value("workers", smoke ? 1 : 8));
const checkpointEveryJobs = Number(value("checkpoint-every-jobs", 1));
const plateauEpsilon = Number(value("plateau-epsilon", DEFAULT_PLATEAU_EPSILON));
const plateauRows = Number(value("plateau-rows", DEFAULT_PLATEAU_ROWS));
const ablation = String(value("ablation", "none"));
if (!["none", "without-curriculum", "without-qd", "fixed-species-threshold"].includes(ablation)) throw new Error(`unknown NEAT-QD ablation "${ablation}"`);
for (const [name, number] of Object.entries({ seed, solverSteps, populationSize, generations, workers, checkpointEveryJobs, plateauRows })) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`--${name} must be a positive integer`);
}
if (!Number.isFinite(plateauEpsilon) || plateauEpsilon < 0) throw new Error("--plateau-epsilon must be a non-negative number");
if (solverSteps % 4 !== 0) throw new Error("--solver-steps must be divisible by four");
const evaluationJobs = generations * populationSize * 2; const budgetQuanta = solverSteps / 4;
const baseQuanta = Math.floor(budgetQuanta / evaluationJobs); const extraJobs = budgetQuanta % evaluationJobs;
if (baseQuanta < 1) throw new Error(`--solver-steps needs at least ${evaluationJobs * 4} steps for the configured jobs`);
// The **output** vocabulary belongs in here as much as the input one, and
// leaving it out was a resume landmine rather than an untidiness. None of
// `featureVersion`, `featureNames`, `movementNames` or `actionNames` moved when
// the output contract went from thirteen to twenty-six, so `configText` was
// byte-identical across the widening: `--resume` accepted a saved state, reloaded
// a 13-output population, and died inside a worker with `learned output vector is
// 13 wide; the contract is 26` -- loud, but named wrongly and one bout late.
// Worse, `configDigest` is the default `runId`, so a pre- and post-widening run
// with identical settings wrote to the *same* directory and overwrote each
// other's `state.json`, `champion.artifact` and `report.json`; and the digest goes
// into artifact provenance, so two artifacts trained against different output
// vocabularies carried the same one. Default `runId`s moved when this landed, and
// nothing was lost, because every checked-in run is already refused at feature
// version 3 against runtime 4.
const config = { version: 1, algorithm: "neat-qd", seed, solverSteps,
  populationSize, generations, ablation, budgetAllocation: { evaluationJobs, baseQuanta, extraJobs }, featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS,
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  tacticVersion: TACTIC_VERSION, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES,
  effectorNames: EFFECTOR_NAMES, targetNames: TARGET_NAMES, stanceNames: STANCE_NAMES, curriculumDigest: curriculumDigest(),
  ablations: ["without-curriculum", "without-qd", "fixed-species-threshold"], plateauEpsilon, plateauRows };
const configText = JSON.stringify(config); const configDigest = createHash("sha256").update(configText).digest("hex").slice(0, 16);
const runId = String(value("run-id", `neat-qd-${seed}-${configDigest}`));
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId)) throw new Error("invalid --run-id");
const runDir = new URL(`../asset-src/learning/research/${runId}/`, import.meta.url); await mkdir(runDir, { recursive: true });
const stateUrl = new URL("state.json", runDir); const atomic = async (url, data) => { const temp = new URL(`${url.pathname.split("/").pop()}.tmp-${process.pid}`, runDir);
  await writeFile(temp, data); await rename(temp, url); };
const runPath = fileURLToPath(runDir); const contractDigest = digestContract(RESEARCH_ARTIFACT_CONTRACT);
// Asked of the one output table rather than re-derived: a population bred at a
// width the deployment decoder does not read is a run that finishes and cannot
// be deployed, and nothing between here and `readMetaOutput` would say so.
const outputs = META_OUTPUT_LAYOUT.width;
const initial = () => { const rng = new SeededRng(seed); const innovations = new InnovationTracker(FEATURE_COLUMNS.length + 1 + outputs);
  return Array.from({ length: populationSize }, (_, id) => initialSparseGenome(id, FEATURE_COLUMNS.length, outputs, rng, innovations)); };

let population = initial(); let nextGeneration = 0; let threshold = 1.5; let consumedSolverSteps = 0;
let opponentArchive = [...SHIPPED_OPPONENT_ARCHIVE]; const championGenomes = new Map(); let ledgers = []; let selected = null;
let qualityElites = []; let checkpointRows = []; let pendingLedgerRow = null;
if (flag("resume")) {
  const saved = JSON.parse(await readFile(stateUrl, "utf8"));
  if (JSON.stringify(saved.config) !== configText) throw new Error("NEAT-QD resume refused: config digest changed");
  ({ population, nextGeneration, threshold, consumedSolverSteps, opponentArchive, ledgers, selected,
    qualityElites = [], pendingLedgerRow = null } = saved);
  for (const entry of saved.championGenomes ?? []) championGenomes.set(entry.id, entry.genome);
}
const existingRows = await readLedger(fileURLToPath(new URL("ledger.jsonl", runDir)));
if (!flag("resume") && existingRows.length > 0) throw new Error(`NEAT-QD run "${runId}" already has a ledger; use --resume or a new --run-id`);
checkpointRows = existingRows; const baseWallSeconds = checkpointRows.at(-1)?.wallSeconds ?? 0;
const runStarted = performance.now(); let previousCheckpointWall = baseWallSeconds;

async function evaluate(genome, split, generation, genomeIndex) {
  const ordinal = (generation * populationSize + genomeIndex) * 2 + (split === "validation" ? 1 : 0);
  const splitBudget = (baseQuanta + (ordinal < extraJobs ? 1 : 0)) * 4;
  const fraction = generations === 1 ? 1 : generation / (generations - 1);
  const stage = ablation === "without-curriculum" ? curriculumStage(1) : curriculumStage(fraction); const base = researchMatrix(split, seed);
  const candidates = base.filter((job) => stage.strata.some((row) => row.unit === job.unit && row.loadout === job.loadout && row.opponent === job.opponent));
  const matrixJob = candidates[(generation * populationSize + genomeIndex) % candidates.length];
  const archiveEntry = sampleOpponentArchive(opponentArchive, seed, generation * populationSize + genomeIndex);
  const start = (generation * populationSize + genomeIndex) % candidates.length;
  const jobs = candidates.map((_, offset) => { const candidate = candidates[(start + offset) % candidates.length];
    return { ...candidate, opponent: opponentForArchive(archiveEntry, candidate.opponent),
      index: ((generation * populationSize + genomeIndex) * candidates.length) + offset }; });
  const opponentGenome = archiveEntry.policy === "champion" ? championGenomes.get(archiveEntry.id) : null;
  const result = await new Promise((resolve, reject) => { const worker = new Worker(new URL("./research-rollout-worker.mjs", import.meta.url),
    { workerData: { mode: "neat", jobs, budget: splitBudget, genome, opponentGenome } });
    worker.once("message", resolve); worker.once("error", reject); worker.once("exit", (code) => { if (code !== 0) reject(new Error(`NEAT-QD worker exited ${code}`)); }); });
  consumedSolverSteps += result.solverSteps; return result;
}

async function evaluatePopulation(split, generation) {
  const rows = Array(population.length); for (let start = 0; start < population.length; start += workers) {
    const batch = await Promise.all(population.slice(start, start + workers).map((genome, offset) => evaluate(genome, split, generation, start + offset)));
    batch.forEach((row, offset) => { rows[start + offset] = row; });
  } return rows;
}

const artifactForSelected = (inProgress) => {
  if (!selected) throw new Error("NEAT-QD cannot write an artifact before it has selected a validation champion");
  const payload = new TextEncoder().encode(JSON.stringify(selected.genome));
  const artifact = new ResearchArtifact({ algorithm: "neat-qd", ...RESEARCH_ARTIFACT_CONTRACT, payload: [...payload],
    provenance: { seed, configDigest, solverSteps: selected.solverSteps, selectedGeneration: selected.generation,
      curriculumDigest: config.curriculumDigest, trainingSplit: "train", validationSplit: "validation" } }, RESEARCH_ARTIFACT_CONTRACT);
  return inProgress ? inProgressResearchArtifact(artifact, runId) : artifact;
};

let stopped = null;

if (pendingLedgerRow) {
  const bytes = artifactForSelected(true).toBytes();
  if (checkpointRows.length === pendingLedgerRow.row) {
    await checkpointRun({ runDir: runPath, row: pendingLedgerRow, championBytes: bytes }); checkpointRows.push(pendingLedgerRow);
  } else if (JSON.stringify(checkpointRows.at(-1)) !== JSON.stringify(pendingLedgerRow)) {
    throw new Error("NEAT-QD pending ledger row does not match the complete ledger prefix");
  }
  pendingLedgerRow = null;
  await atomic(stateUrl, `${JSON.stringify({ config, nextGeneration, threshold, consumedSolverSteps, population,
    opponentArchive, championGenomes: [...championGenomes].map(([id, genome]) => ({ id, genome })),
    qualityElites, ledgers, selected, pendingLedgerRow }, null, 2)}\n`);
}
stopped = ledgerStopDecision(checkpointRows);
if (flag("resume") && stopped && await runIsFinalized(runPath)) throw new Error(`NEAT-QD resume refused: ${stopped}`);

for (let generation = nextGeneration; generation < generations && !stopped; generation += 1) {
  const qd = new QualityArchive(); for (const elite of qualityElites) qd.offer(elite); const train = await evaluatePopulation("train", generation);
  for (let index = 0; index < population.length; index += 1) { const row = train[index];
    population[index].fitness = row.score; if (ablation !== "without-qd") qd.offer({ descriptor: row.descriptor,
      result: { terminalTier: row.bout.result.winner ? 1 : 0, safetyTier: Math.round((1 - row.descriptor.nearRangeStallShare) * 100), feasible: row.feasible }, value: population[index] }); train.push(row); }
  qualityElites = qd.entries().map(([, elite]) => elite);
  const validation = await evaluatePopulation("validation", generation);
  const ranked = population.map((genome, index) => ({ genome, index, validation: validation[index] }));
  const champion = selectValidationChampion(ranked.map((row) => ({ id: row.genome.id,
    macroScore: row.validation.macroScore, worstCellScore: row.validation.worstCellScore, value: row })));
  if (!selected || champion.validation.worstCellScore > selected.worstCellScore ||
      champion.validation.worstCellScore === selected.worstCellScore && champion.validation.macroScore > selected.validationScore) {
    selected = { generation, validationScore: champion.validation.macroScore,
      worstCellScore: champion.validation.worstCellScore, genome: champion.genome,
      engagement: champion.validation.engagement, solverSteps: consumedSolverSteps };
  }
  const digest = createHash("sha256").update(JSON.stringify(champion.genome)).digest("hex"); const championId = `champion:${generation}:${digest.slice(0, 12)}`;
  championGenomes.set(championId, champion.genome); opponentArchive.push({ id: championId, stage: generation, policy: "champion", artifactDigest: digest });
  const groups = speciate(population, threshold); if (ablation !== "fixed-species-threshold") threshold = adaptiveCompatibilityThreshold(threshold, groups.length);
  const fraction = generations === 1 ? 1 : generation / (generations - 1);
  ledgers.push({ generation, stage: (ablation === "without-curriculum" ? curriculumStage(1) : curriculumStage(fraction)).name, species: groups.length, threshold,
    archiveCoverage: qd.entries().length, champion: champion.genome.id, validationScore: champion.validation.macroScore,
    validationWorstCellScore: champion.validation.worstCellScore, validationCells: champion.validation.cellScores.length,
    solverSteps: consumedSolverSteps });
  const innovations = innovationTrackerFor(population); population = generation + 1 < generations
    ? breedGeneration(population, seed ^ (generation + 1), Math.min(2, population.length), innovations, threshold) : population;
  if (generation + 1 < generations && ablation !== "without-qd") qualityElites.slice(0, Math.min(2, population.length))
    .forEach((elite, index) => { population[index] = cloneGenome(elite.value, index); });
  nextGeneration = generation + 1;
  const checkpointDue = checkpointJobDue(nextGeneration, checkpointEveryJobs) || nextGeneration === generations;
  if (checkpointDue) {
    const wallSeconds = baseWallSeconds + (performance.now() - runStarted) / 1000;
    const bytes = artifactForSelected(true).toBytes();
    const current = ranked[champion.index]?.validation ?? champion.validation;
    const row = makeLedgerRow({ previousRows: checkpointRows, direction: "neat-qd", jobIndex: generation,
      stepsConsumed: consumedSolverSteps, wallSeconds,
      stepsPerSecond: (consumedSolverSteps - (checkpointRows.at(-1)?.stepsConsumed ?? 0)) /
        Math.max(0.001, wallSeconds - previousCheckpointWall), configDigest, contractDigest,
      validationMacro: champion.validation.macroScore, validationWorstCell: champion.validation.worstCellScore,
      objective: { name: "validationWorstCellScore", direction: "higher", value: champion.validation.worstCellScore },
      gates: engagementGates(current.engagement), directionData: { generation, species: groups.length,
        archiveCoverage: qd.entries().length, compatibilityThreshold: threshold,
        mutationTotals: { status: "unavailable", reason: "breedGeneration does not expose per-operator mutation counts" } },
      championBytes: bytes, stepCeiling: solverSteps, plateauEpsilon, plateauRows });
    checkpointRows.push(row); previousCheckpointWall = wallSeconds; pendingLedgerRow = row;
  }
  await atomic(stateUrl, `${JSON.stringify({ config, nextGeneration,
    threshold, consumedSolverSteps, population, opponentArchive, championGenomes: [...championGenomes].map(([id, genome]) => ({ id, genome })),
    qualityElites, ledgers, selected, pendingLedgerRow }, null, 2)}\n`);
  if (checkpointDue) {
    const row = checkpointRows.at(-1); const bytes = artifactForSelected(true).toBytes();
    if (row.champion.digest !== createHash("sha256").update(bytes).digest("hex")) throw new Error("NEAT-QD checkpoint champion digest drifted");
    await checkpointRun({ runDir: runPath, row, championBytes: bytes }); pendingLedgerRow = null;
    await atomic(stateUrl, `${JSON.stringify({ config, nextGeneration, threshold, consumedSolverSteps, population,
      opponentArchive, championGenomes: [...championGenomes].map(([id, genome]) => ({ id, genome })),
      qualityElites, ledgers, selected, pendingLedgerRow }, null, 2)}\n`);
    process.stdout.write(`${row.summary}\n`);
    stopped = ledgerStopDecision(checkpointRows); if (stopped) break;
  }
}
const artifact = artifactForSelected(false);
stopped ??= consumedSolverSteps >= solverSteps ? "stopped: ceiling" : ledgerStopDecision(checkpointRows);
if (!stopped) throw new Error("NEAT-QD ended without a plateau or solver-step ceiling");
const report = { version: 1, algorithm: "neat-qd", config, configDigest, consumedSolverSteps, selectedGeneration: selected.generation,
  ledgers, ledgerFile: "ledger.jsonl", archiveEntries: opponentArchive.length,
  stopping: { plateauEpsilon, plateauRows, stepCeiling: solverSteps }, stopped };
await finalizeRun({ runDir: runPath, championBytes: artifact.toBytes(), reportBytes: `${JSON.stringify(report, null, 2)}\n` });
process.stdout.write(`${JSON.stringify({ runId, consumedSolverSteps, report: new URL("report.json", runDir).pathname })}\n`);
