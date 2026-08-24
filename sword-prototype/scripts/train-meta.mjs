// Seeded NEAT training over real, freshly isolated Havok bouts.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import { Checkpoint } from "../src/learning/checkpoint.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { breedGeneration, initialPopulation, innovationTrackerFor, speciate } from "../src/learning/genome.ts";
import { partitionIndexed, restoreIndexed } from "../src/learning/jobs.ts";
import { noveltyScore } from "../src/learning/meta.ts";
import { OPTION_NAMES } from "../src/options.ts";
import { evaluateControl, evaluateGenome } from "./training-evaluator.mjs";

const argv = process.argv.slice(2);
const valueNames = new Set(["seed", "population", "generations", "elite", "bouts", "checkpoint-every", "workers", "run-id"]);
const flagNames = new Set(["smoke", "resume"]); const parsed = new Map();
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]; if (!token.startsWith("--")) throw new Error(`unexpected argument "${token}"`);
  const name = token.slice(2); if (flagNames.has(name)) { if (parsed.has(name)) throw new Error(`duplicate --${name}`); parsed.set(name, true); continue; }
  if (!valueNames.has(name)) throw new Error(`unknown option --${name}`);
  const value = argv[index + 1]; if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  if (parsed.has(name)) throw new Error(`duplicate --${name}`); parsed.set(name, value); index += 1;
}
const arg = (name, fallback) => parsed.get(name) ?? fallback;
const flag = (name) => parsed.get(name) === true;
const positive = (name, fallback) => { const value = Number(arg(name, fallback)); if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`); return value; };
const smoke = flag("smoke");
const workerLimit = Math.max(1, Math.min(8, availableParallelism()));
const workers = positive("workers", Math.min(workerLimit, smoke ? 2 : 8));
if (workers > workerLimit) throw new Error(`--workers may not exceed the conservative host cap ${workerLimit}`);
const seed = Number(arg("seed", 20260823));
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("--seed must be an unsigned 32-bit integer");
const config = Object.freeze({
  // Version 3 includes the terminal no-hand semantics used by every control.
  // Keeping it in the resume contract prevents a pre-repair population from
  // being continued under the corrected evaluator.
  version: 3, seed,
  population: positive("population", smoke ? 8 : 128), generations: positive("generations", smoke ? 3 : 80),
  elite: positive("elite", smoke ? 2 : 4), mirroredBouts: positive("bouts", smoke ? 2 : 24),
  decisionSeconds: 0.10, checkpointEvery: positive("checkpoint-every", smoke ? 1 : 5),
  featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS, optionNames: OPTION_NAMES,
});
if (config.elite > config.population) throw new Error("--elite may not exceed population");
if (config.mirroredBouts % 2 !== 0) throw new Error("--bouts must be even so every seed is charged from both spawn sides");

const configText = JSON.stringify(config); const configDigest = createHash("sha256").update(configText).digest("hex").slice(0, 16);
const runId = String(arg("run-id", `${config.seed}-${configDigest}`));
if (runId === "." || runId === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId)) {
  throw new Error("--run-id must start with a letter or digit and contain only letters, digits, dot, underscore and hyphen");
}
const runDir = new URL(`../asset-src/learning/runs/${runId}/`, import.meta.url);
const stateUrl = new URL("state.json", runDir); const reportUrl = new URL("report.json", runDir);
const atomic = async (url, bytes) => { const temp = new URL(`${url.pathname.split("/").pop()}.tmp-${process.pid}`, runDir); await writeFile(temp, bytes); await rename(temp, url); };
await mkdir(runDir, { recursive: true });

async function evaluateMany(genomes, split, cells) {
  if (workers === 1 || genomes.length === 1) { const rows = []; for (const genome of genomes) rows.push(await evaluateGenome(genome, config.seed, split, cells)); return rows; }
  const batches = partitionIndexed(genomes, workers);
  const active = []; const tasks = batches.map((batch) => new Promise((resolve, reject) => { const jobs = batch.map(({ index, value: genome }) => ({ index, genome, split, cells }));
    const worker = new Worker(new URL("./train-meta-worker.mjs", import.meta.url), { workerData: { jobs, baseSeed: config.seed } });
    active.push(worker); let answered = false;
    worker.once("message", (rows) => { answered = true; if (!Array.isArray(rows) || rows.length !== jobs.length) reject(new Error("training worker returned an invalid result batch")); else resolve(rows); });
    worker.once("error", reject); worker.once("exit", (code) => { if (!answered) reject(new Error(`training worker exited ${code} before returning results`)); }); }));
  let raw; try { raw = await Promise.all(tasks); } catch (error) { await Promise.allSettled(active.map((worker) => worker.terminate())); throw error; }
  await Promise.allSettled(active.map((worker) => worker.terminate()));
  const batchesOut = raw.map((rows) => rows.map((row) => ({ index: row.index, value: row.result })));
  return restoreIndexed(batchesOut, genomes.length);
}

let population; let archive = []; let firstGeneration = 0; let selectedChampion = null; let selectedValidation = -Infinity;
let selectedGeneration = -1; const reports = [];
if (flag("resume")) {
  const state = JSON.parse(await readFile(stateUrl, "utf8"));
  if (JSON.stringify(state.config) !== configText) throw new Error("resume refused: feature/action/config versions do not exactly match this run");
  population = state.population; archive = state.archive; firstGeneration = state.nextGeneration; selectedChampion = state.selectedChampion;
  selectedValidation = state.selectedValidation; selectedGeneration = state.selectedGeneration; reports.push(...state.reports);
} else population = initialPopulation(config.population, FEATURE_COLUMNS.length, OPTION_NAMES.length + 1, config.seed);
let innovations = innovationTrackerFor(population); const started = Date.now();

for (let generation = firstGeneration; generation < config.generations; generation += 1) {
  const trainRows = await evaluateMany(population, "train", config.mirroredBouts);
  const evaluated = population.map((genome, index) => ({ genome, ...trainRows[index] }));
  for (const row of evaluated) { row.genome.novelty = noveltyScore(row.descriptor, [...archive, ...evaluated.filter((other) => other !== row).map((other) => other.descriptor)]);
    row.genome.fitness = row.components.total + row.genome.novelty * 0.15; }
  const groups = speciate(population); const champions = groups.map((group) => [...group.members].sort((a, b) => b.fitness - a.fitness || a.id - b.id)[0]);
  const validationRows = await evaluateMany(champions, "validation", 2);
  const validation = champions.map((genome, index) => ({ genome, evaluation: validationRows[index] }));
  validation.sort((a, b) => b.evaluation.components.total - a.evaluation.components.total || a.genome.id - b.genome.id);
  const champion = validation[0].genome; archive.push(evaluated.find((row) => row.genome === champion)?.descriptor ?? validation[0].evaluation.descriptor);
  const validationScore = validation[0].evaluation.components.total;
  if (validationScore > selectedValidation) { selectedChampion = champion; selectedValidation = validationScore; selectedGeneration = generation; }
  if (archive.length > 512) archive = archive.slice(-512);
  const report = { generation, champion: champion.id, championFitness: champion.fitness,
    training: evaluated.find((row) => row.genome === champion)?.components ?? null,
    validation: validation[0].evaluation.components, novelty: champion.novelty, species: groups.map((group) => group.members.length),
    controls: { scripted: await evaluateControl("scripted", config.seed, "validation"), random: await evaluateControl("random", config.seed, "validation") } };
  reports.push(report); console.log(JSON.stringify(report));
  const nextPopulation = generation + 1 < config.generations
    ? breedGeneration(population, config.seed ^ (generation + 1), config.elite, innovations) : population;
  if ((generation + 1) % config.checkpointEvery === 0 || generation + 1 === config.generations) {
    const checkpoint = new Checkpoint({ featureVersion: FEATURE_VERSION, featureNames: FEATURE_COLUMNS, optionNames: OPTION_NAMES,
      nodes: champion.nodes, edges: champion.edges, provenance: { seed: config.seed, generation, configDigest,
        trainSeedRange: "train", validationSeedRange: "validation", testSeedRange: "unused-until-final" } });
    await atomic(new URL(`generation-${String(generation + 1).padStart(3, "0")}.bin`, runDir), checkpoint.toBytes());
    await atomic(stateUrl, `${JSON.stringify({ config, nextGeneration: generation + 1, population: nextPopulation,
      selectedChampion, selectedValidation, selectedGeneration, archive, reports }, null, 2)}\n`);
  }
  population = nextPopulation;
  innovations = innovationTrackerFor(population);
}

if (!selectedChampion) throw new Error("training produced no validation champion"); const final = selectedChampion;
const test = await evaluateGenome(final, config.seed, "test", 2); const finalCheckpoint = new Checkpoint({ featureVersion: FEATURE_VERSION,
  featureNames: FEATURE_COLUMNS, optionNames: OPTION_NAMES, nodes: final.nodes, edges: final.edges,
  provenance: { seed: config.seed, generation: selectedGeneration, validation: selectedValidation, configDigest, test: test.components } });
const championBytes = finalCheckpoint.toBytes(); const championDigest = createHash("sha256").update(championBytes).digest("hex");
const elapsedSeconds = (Date.now() - started) / 1000;
const finalReport = { version: 1, config, configDigest, runId, championDigest, test, reports };
await atomic(new URL("champion.bin", runDir), championBytes); await atomic(reportUrl, `${JSON.stringify(finalReport, null, 2)}\n`);
console.log(JSON.stringify({ runId, championDigest, test: test.components, elapsedSeconds }));
