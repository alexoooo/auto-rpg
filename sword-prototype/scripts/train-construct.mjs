import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { assertConstructCheckpointIdentity, defaultConstructTrainingIdentity, encodeConstructCheckpoint } from
  "../src/construct/learning/checkpoint.ts";
import { CONSTRUCT_NETWORK_WEIGHT_COUNT, initializeConstructNetwork } from "../src/construct/learning/network.ts";
import { constructIndexedJobs } from "../src/construct/learning/ppo.ts";
import { CONSTRUCT_LEARNING_SCHEDULE, CONSTRUCT_LEARNING_SCHEDULE_DIGEST } from
  "../src/construct/learning/schedule.ts";
import { CONSTRUCT_LEARNING_CORPUS_DIGEST } from "../src/construct/learning/corpus.ts";
import { evaluateConstructLearningStage } from "../src/construct/learning/schedule.ts";
import { recomputeConstructTournamentVerdict, selectConstructValidationCandidate } from
  "../src/construct/learning/ladder.ts";
import { CONSTRUCT_LAB_BOUT_CAP_STEPS } from "../src/construct/lab-config.ts";
import { readCurrentConstructCheckpointBundle, writeConstructCheckpointBundle } from
  "./construct-checkpoint-bundle.mjs";
import { constructQualificationSourceFingerprint } from "./qualify-construct-learning-entry.mjs";

const encode = (value) => new TextEncoder().encode(canonicalIntegrityJson(value));
const ROLLOUT_WORKER_URL = new URL("./construct-rollout-worker.mjs", import.meta.url);
const pad = (value) => String(value).padStart(8, "0");
const atomic = async (path, data) => {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, data);
  await rename(temporary, path);
};

const initialCheckpoint = (config) => Object.freeze({
  checkpointVersion: 2, observationVersion: 2, actionVersion: 1, policyVersion: 2,
  identity: config.identity, weights: initializeConstructNetwork(config.seed),
  optimizer: Object.freeze({ update: 0,
    firstMoment: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)),
    secondMoment: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)) }),
  nextJobIndex: 0, completedShards: Object.freeze([]),
  morphologySplit: config.morphologySplit,
});

const identityMatches = (actual, expected, context) => {
  for (const field of ["graphDigest", "actionDigest", "programDigest", "teacherDigest", "configDigest"]) {
    if (actual?.[field] !== expected[field]) throw new Error(`${context} refused: ${field} changed`);
  }
};

const metricKeys = Object.freeze(["stage", "morphology", "candidate", "score", "loss", "decisions", "schedulerAdmissions",
  "commandDigestRows", "morphologyCells", "deadMorphologyCells", "actionGroupsSeen", "unsupportedRate",
  "refusalRate", "finiteCommandRate", "lifecycleFailureCount", "stuckRate", "meanDamage", "timeCapRate",
  "imitationAgreement", "mirrorApplications", "motorSaturationRate", "selfCollisionCount", "victoryRate"]);
const validateMetrics = (metrics, spec, context) => {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics) ||
      Object.keys(metrics).sort().join("\0") !== [...metricKeys].sort().join("\0")) {
    throw new Error(`${context} metrics do not have the exact physical schema`);
  }
  if (metrics.stage !== spec.stage || metrics.morphology !== spec.morphology) {
    throw new Error(`${context} metrics do not match frozen stage/morphology`);
  }
  if (metrics.candidate !== (spec.candidate ?? "evolving")) throw new Error(`${context} metric "candidate" is stale`);
  for (const name of ["score", "loss", "meanDamage"]) if (!Number.isFinite(metrics[name])) {
    throw new Error(`${context} metric "${name}" must be finite`);
  }
  for (const name of ["decisions", "schedulerAdmissions", "morphologyCells", "deadMorphologyCells",
    "actionGroupsSeen", "lifecycleFailureCount", "mirrorApplications", "selfCollisionCount"]) {
    if (!Number.isSafeInteger(metrics[name]) || metrics[name] < 0) throw new Error(`${context} metric "${name}" must be non-negative integer`);
  }
  if (metrics.morphologyCells < 1 || metrics.deadMorphologyCells > metrics.morphologyCells) {
    throw new Error(`${context} morphology counters are inconsistent`);
  }
  for (const name of ["unsupportedRate", "refusalRate", "finiteCommandRate", "stuckRate", "timeCapRate",
    "imitationAgreement", "motorSaturationRate", "victoryRate"]) if (!Number.isFinite(metrics[name]) || metrics[name] < 0 || metrics[name] > 1) {
    throw new Error(`${context} metric "${name}" must be finite in [0,1]`);
  }
  if (!Array.isArray(metrics.commandDigestRows) || metrics.commandDigestRows.some((row) => typeof row !== "string")) {
    throw new Error(`${context} commandDigestRows must be strings`);
  }
};
const resolveFrozenJobSpec = (config, spec) => {
  if (spec?.morphology) return spec;
  if (!spec || !Number.isSafeInteger(spec.morphologySlot) || !Number.isSafeInteger(spec.opponentSlot)) {
    throw new Error("construct physical job has no stage-scoped morphology slots");
  }
  const split = spec.stage === "validation" ? config.morphologySplit.validation :
    spec.stage === "held-out" ? config.morphologySplit.test : config.morphologySplit.train;
  const train = config.morphologySplit.train;
  if (!split.length || !train.length) throw new Error(`construct ${spec.stage} split is empty`);
  return Object.freeze({ ...spec, morphology: split[spec.morphologySlot % split.length],
    opponent: train[spec.opponentSlot % train.length] });
};
const candidateBoundaryIndex = (config, id) => {
  const stage = id === "bc-final" ? "behavior-cloning" : id === "ppo-final" ? "ppo" : null;
  if (!stage) throw new Error(`unknown frozen candidate boundary "${id}"`);
  const indices = config.jobSpecs.flatMap((spec, index) => spec.stage === stage ? [index] : []);
  if (!indices.length) throw new Error(`frozen candidate ${id} has no declared ${stage} jobs`);
  return Math.max(...indices) + 1;
};
const recomputeCandidateBoundary = (config, id, committedByIndex) => {
  const end = candidateBoundaryIndex(config, id);
  let rebuilt = initialCheckpoint(config);
  for (let start = 0; start < end; start += config.shardsPerUpdate) {
    const rows = Array.from({ length: config.shardsPerUpdate }, (_, offset) => committedByIndex.get(start + offset));
    if (rows.some((row) => !row)) throw new Error(`frozen candidate ${id} boundary is missing a committed shard`);
    rebuilt = advanceConstructBundle(rebuilt, rows, config);
  }
  return rebuilt;
};

const readCommittedRows = async (runDirectory, config, jobs, physical) => {
  const rows = [];
  const names = (await readdir(join(runDirectory, "shards")))
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort();
  for (const name of names) {
    const index = Number(name.slice(0, 8));
    const row = JSON.parse(await readFile(join(runDirectory, "shards", name), "utf8"));
    const expected = jobs[index]; const spec = config.jobSpecs?.[index] ?
      resolveFrozenJobSpec(config, config.jobSpecs[index]) : undefined;
    if (row.version !== 1 || row.index !== index || index >= config.totalShards || row.seed !== expected?.seed ||
        row.configDigest !== config.identity.configDigest ||
        !Array.isArray(row.gradient) || row.gradient.length !== CONSTRUCT_NETWORK_WEIGHT_COUNT ||
        row.gradient.some((value) => !Number.isFinite(value))) {
      throw new Error(`construct committed shard ${index} is invalid or belongs to a stale config`);
    }
    if (physical) {
      if (!spec) throw new Error(`construct committed shard ${index} has no frozen job spec`);
      validateMetrics(row.metrics, spec, `construct committed shard ${index}`);
    }
    rows.push(Object.freeze(row));
  }
  return rows;
};

export const advanceConstructBundle = (checkpoint, rows, config) => {
  const average = Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0);
  for (const row of rows) for (let at = 0; at < average.length; at += 1) average[at] += row.gradient[at] / rows.length;
  const update = checkpoint.optimizer.update + 1; const beta1 = 0.9; const beta2 = 0.999;
  const firstMoment = average.map((gradient, index) => beta1 * checkpoint.optimizer.firstMoment[index] +
    (1 - beta1) * gradient);
  const secondMoment = average.map((gradient, index) => beta2 * checkpoint.optimizer.secondMoment[index] +
    (1 - beta2) * gradient * gradient);
  const values = checkpoint.weights.values.map((weight, index) => weight - config.learningRate *
    (firstMoment[index] / (1 - beta1 ** update)) / (Math.sqrt(secondMoment[index] / (1 - beta2 ** update)) + 1e-8));
  const completed = [...new Set([...checkpoint.completedShards, ...rows.map((row) => row.index)])].sort((a, b) => a - b);
  return Object.freeze({ ...checkpoint, weights: Object.freeze({ values }), optimizer: Object.freeze({
    update, firstMoment: Object.freeze(firstMoment), secondMoment: Object.freeze(secondMoment),
  }), nextJobIndex: (() => {
    const indices = new Set(completed);
    let index = 0;
    while (indices.has(index)) index += 1;
    return index;
  })(),
  completedShards: Object.freeze(completed) });
};

const terminalKeys = Object.freeze(["version", "status", "promotedArtifact", "reason", "completedShards", "updates",
  "scheduleDigest", "identity", "qualification", "checkpointDigest", "tournamentManifest",
  "tournamentManifestDigest", "artifactDigest", "gates", "worstHeldScore", "evidence", "stageGate"]);
const durableResult = async (runDirectory, result) => {
  const normalized = Object.freeze({ version: 2, status: result.status, promotedArtifact: result.promotedArtifact ?? null,
    reason: result.reason, completedShards: result.completedShards ?? 0, updates: result.updates ?? 0,
    scheduleDigest: result.scheduleDigest, identity: result.identity, qualification: result.qualification,
    checkpointDigest: result.checkpointDigest ?? null, tournamentManifest: result.tournamentManifest ?? null,
    tournamentManifestDigest: result.tournamentManifestDigest ?? null, artifactDigest: result.artifactDigest ?? null,
    gates: result.gates ?? null, worstHeldScore: result.worstHeldScore ?? null, evidence: result.evidence ?? null,
    stageGate: result.stageGate ?? null });
  await atomic(join(runDirectory, "construct-learning-result.json"), encode(normalized));
  return normalized;
};
const checkpointDigest = (checkpoint) => integrityDigest(new TextDecoder().decode(encodeConstructCheckpoint(checkpoint)));
const weightsDigest = (weights) => integrityDigest(canonicalIntegrityJson(weights));

const stageMetrics = (rows) => {
  if (!rows.length) return null;
  const average = (field) => rows.reduce((sum, row) => sum + row.metrics[field], 0) / rows.length;
  return Object.freeze({
    morphologyCells: new Set(rows.map((row) => row.metrics.morphology)).size,
    deadMorphologyCells: rows.reduce((sum, row) => sum + row.metrics.deadMorphologyCells, 0),
    actionGroupsSeen: Math.min(...rows.map((row) => row.metrics.actionGroupsSeen)),
    unsupportedRate: average("unsupportedRate"),
    refusalRate: average("refusalRate"),
    finiteCommandRate: Math.min(...rows.map((row) => row.metrics.finiteCommandRate)),
    lifecycleFailureCount: rows.reduce((sum, row) => sum + row.metrics.lifecycleFailureCount, 0),
    stuckRate: average("stuckRate"),
    meanDamage: average("meanDamage"),
    timeCapRate: average("timeCapRate"),
    imitationAgreement: average("imitationAgreement"),
    motorSaturationRate: average("motorSaturationRate"), selfCollisionCount: rows.reduce((sum, row) =>
      sum + row.metrics.selfCollisionCount, 0), victoryRate: average("victoryRate"),
  });
};

const stageGate = (rows, stage) => {
  const metrics = stageMetrics(rows.filter((row) => row.metrics.stage === stage));
  return metrics ? Object.freeze({ metrics, ...evaluateConstructLearningStage(stage, metrics) }) :
    Object.freeze({ metrics: null, decision: "kill", reasons: Object.freeze([`no ${stage} physical rows`]) });
};
const candidateStageGate = (rows, stage, candidate) => stageGate(
  rows.filter((row) => row.metrics.candidate === candidate), stage,
);

const assertPairedValidationRows = (rows, config) => {
  const candidates = CONSTRUCT_LEARNING_SCHEDULE.validationSelection.candidates;
  const specs = config.jobSpecs.filter(({ stage }) => stage === "validation");
  const scenarioKeys = [...new Set(specs.map(({ scenarioKey }) => scenarioKey))].sort();
  if (!scenarioKeys.length || specs.length !== scenarioKeys.length * candidates.length) {
    throw new Error("validation selection does not have the declared paired scenario coverage");
  }
  for (const scenarioKey of scenarioKeys) {
    const expected = specs.filter((spec) => spec.scenarioKey === scenarioKey);
    const actual = rows.filter((row) => row.metrics.stage === "validation" &&
      config.jobSpecs[row.index]?.scenarioKey === scenarioKey);
    for (const candidate of candidates) {
      if (expected.filter((spec) => spec.candidate === candidate).length !== 1 ||
          actual.filter((row) => row.metrics.candidate === candidate).length !== 1) {
        throw new Error(`validation scenario ${scenarioKey} does not contain exactly one ${candidate} row`);
      }
    }
  }
  return Object.freeze(scenarioKeys);
};

/** Worker messages are committed one at a time before another completion is observed. */
export async function runPhysicalConstructShardBundle(jobs, weights, workers, commit, options = {}) {
  if (!Number.isSafeInteger(workers) || workers <= 0) throw new Error("construct rollout worker count must be positive");
  const expected = new Set(jobs.map(({ index }) => index));
  if (expected.size !== jobs.length) throw new Error("construct rollout bundle has duplicate assigned indices");
  const received = new Set();
  const count = Math.min(workers, jobs.length);
  const batches = Array.from({ length: count }, () => []);
  jobs.forEach((job, index) => batches[index % count].push(job));
  let queue = Promise.resolve();
  let failure = null;
  const live = new Set();
  const abortWorkers = (error) => {
    if (!failure) failure = error;
    for (const worker of live) void worker.terminate();
  };
  const processes = [];
  try {
    for (const batch of batches) processes.push(new Promise((resolveWorker) => {
      const assigned = new Set(batch.map(({ index }) => index));
      let worker;
      try { worker = options.workerFactory?.(batch, weights) ??
        new Worker(ROLLOUT_WORKER_URL, { workerData: { jobs: batch, weights } }); }
      catch (error) { abortWorkers(error); resolveWorker(); return; }
      live.add(worker);
      worker.on("message", (message) => {
        if (failure) return;
        if (message.type === "error") abortWorkers(new Error(`construct rollout shard ${message.index}: ${message.message}`));
        else if (message.type === "row") {
          if (!assigned.has(message.index)) {
            abortWorkers(new Error(`construct rollout worker returned unassigned shard ${message.index}`));
          } else if (received.has(message.index)) {
            abortWorkers(new Error(`construct rollout worker returned duplicate shard ${message.index}`));
          } else {
            received.add(message.index);
            queue = queue.then(async () => {
              try { await commit(message.index, message.result); }
              catch (error) { abortWorkers(error); }
            });
          }
        }
      });
      worker.on("error", (error) => { abortWorkers(error); });
      worker.on("exit", (code) => {
        live.delete(worker);
        if (code !== 0 && !failure) abortWorkers(new Error(`construct rollout worker exited ${code}`));
        resolveWorker();
      });
    }));
    await Promise.all(processes);
    await queue;
    if (failure) throw failure;
    const missing = [...expected].filter((index) => !received.has(index)).sort((left, right) => left - right);
    if (missing.length) throw new Error(`construct rollout worker omitted shard(s) ${missing.join(",")}`);
  } catch (error) {
    abortWorkers(error);
    await Promise.allSettled(processes);
    throw failure ?? error;
  } finally {
    if (failure) for (const worker of live) void worker.terminate();
  }
}

export async function runConstructTrainer(options) {
  const { runDirectory, config, runShard, runShardBundle, stopAfterShards = Number.POSITIVE_INFINITY,
    workerCount = 1, onCommitted,
    qualificationSourceFingerprint = constructQualificationSourceFingerprint } = options;
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0) throw new Error("construct trainer workerCount must be positive");
  if (!Number.isSafeInteger(config.totalShards) || config.totalShards <= 0 ||
      !Number.isSafeInteger(config.shardsPerUpdate) || config.shardsPerUpdate <= 0) {
    throw new Error("construct trainer shard counts must be positive safe integers");
  }
  await mkdir(join(runDirectory, "shards"), { recursive: true });
  let actualSourceDigest = null;
  const qualification = Object.freeze({ entryQualified: config.entryQualified === true,
    sourceDigest: config.mode === "production" ? config.qualificationSourceDigest ?? null : null,
    protocolDigest: config.mode === "production" ? config.qualificationProtocolDigest ?? null : null });
  const finish = (result) => durableResult(runDirectory, { ...result, qualification });
  if (!config.entryQualified) {
    return finish({ status: "rejected", promotedArtifact: null,
      reason: config.entryReason, completedShards: 0, updates: 0, scheduleDigest: config.scheduleDigest,
      identity: config.identity, evidence: CONSTRUCT_LEARNING_SCHEDULE.entryGate.evidence });
  }
  if (config.mode === "production") {
    actualSourceDigest = await qualificationSourceFingerprint();
    if (config.qualificationSourceDigest !== actualSourceDigest ||
        config.qualificationProtocolDigest !== CONSTRUCT_LEARNING_SCHEDULE_DIGEST ||
        config.scheduleDigest !== CONSTRUCT_LEARNING_SCHEDULE_DIGEST) {
      return finish({ status: "rejected", promotedArtifact: null,
        reason: config.qualificationSourceDigest !== actualSourceDigest ?
          `qualification source/environment fingerprint is stale: expected ${config.qualificationSourceDigest}, got ${actualSourceDigest}` :
          "qualification protocol digest is stale or incoherent with the production schedule",
        completedShards: 0, updates: 0, scheduleDigest: config.scheduleDigest, identity: config.identity });
    }
  }
  try {
    const terminal = JSON.parse(await readFile(join(runDirectory, "construct-learning-result.json"), "utf8"));
    if (Object.keys(terminal).sort().join("\0") !== [...terminalKeys].sort().join("\0") || terminal.version !== 2 ||
        !["rejected", "smoke-complete", "complete", "promoted"].includes(terminal.status) ||
        terminal.scheduleDigest !== config.scheduleDigest ||
        canonicalIntegrityJson(terminal.qualification) !== canonicalIntegrityJson(qualification)) {
      throw new Error("construct terminal recovery refused: terminal schema or qualification identity is stale");
    }
    identityMatches(terminal.identity, config.identity, "construct terminal recovery");
    if ((terminal.tournamentManifest === null) !== (terminal.tournamentManifestDigest === null)) {
      throw new Error("construct terminal recovery refused: tournament manifest identity is incomplete");
    }
    if (terminal.tournamentManifest !== null) {
      if (terminal.tournamentManifest !== "construct-tournament-manifest.json" ||
          integrityDigest(await readFile(join(runDirectory, terminal.tournamentManifest), "utf8")) !==
            terminal.tournamentManifestDigest) {
        throw new Error("construct terminal recovery refused: tournament manifest digest changed");
      }
    }
    if (terminal.status === "promoted") {
      if (terminal.promotedArtifact !== "promoted-construct-policy.json" ||
          terminal.tournamentManifest !== "construct-tournament-manifest.json" ||
          typeof terminal.artifactDigest !== "string" || typeof terminal.tournamentManifestDigest !== "string" ||
          typeof terminal.checkpointDigest !== "string") {
        throw new Error("construct terminal recovery refused: promoted terminal provenance is incomplete");
      }
      const artifactText = await readFile(join(runDirectory, terminal.promotedArtifact), "utf8");
      const manifestText = await readFile(join(runDirectory, terminal.tournamentManifest), "utf8");
      if (integrityDigest(artifactText) !== terminal.artifactDigest ||
          integrityDigest(manifestText) !== terminal.tournamentManifestDigest) {
        throw new Error("construct terminal recovery refused: promoted artifact or manifest digest changed");
      }
      const artifact = JSON.parse(artifactText);
      if (Object.keys(artifact).sort().join("\0") !== ["version", "provenance", "scheduleDigest", "checkpointDigest",
        "candidate", "candidateWeightsDigest", "candidateOrigin", "weights", "worstHeldScore",
        "tournamentManifest"].sort().join("\0") || artifact.version !== 1 ||
          artifact.provenance !== "held-out-qualified" || artifact.tournamentManifest !== terminal.tournamentManifest ||
          Object.keys(artifact.candidateOrigin ?? {}).sort().join("\0") !== ["checkpointDigest", "configDigest",
            "nextJobIndex", "protocolDigest", "update"].sort().join("\0")) {
        throw new Error("construct terminal recovery refused: promoted artifact schema is invalid");
      }
      const current = await readCurrentConstructCheckpointBundle(runDirectory);
      const boundary = JSON.parse(await readFile(join(runDirectory, `candidate-boundary-${artifact.candidate}.json`), "utf8"));
      const { checkpoint: boundaryCheckpoint, ...boundaryIdentity } = boundary;
      const recoveryJobs = constructIndexedJobs(config.totalShards, config.seed);
      const recoveryRows = await readCommittedRows(runDirectory, config, recoveryJobs, Boolean(runShardBundle));
      const reconstructedBoundary = recomputeCandidateBoundary(config, artifact.candidate,
        new Map(recoveryRows.map((row) => [row.index, row])));
      if (!current || checkpointDigest(current.checkpoint) !== terminal.checkpointDigest ||
          artifact.checkpointDigest !== terminal.checkpointDigest || artifact.scheduleDigest !== config.scheduleDigest ||
          artifact.candidateWeightsDigest !== weightsDigest(artifact.weights) ||
          checkpointDigest(boundaryCheckpoint) !== boundary.checkpointDigest ||
          checkpointDigest(boundaryCheckpoint) !== checkpointDigest(reconstructedBoundary) ||
          weightsDigest(boundaryCheckpoint.weights) !== boundary.weightsDigest ||
          canonicalIntegrityJson(boundaryIdentity) !== canonicalIntegrityJson({ id: artifact.candidate,
            weightsDigest: artifact.candidateWeightsDigest, ...artifact.candidateOrigin })) {
        throw new Error("construct terminal recovery refused: candidate/checkpoint provenance is stale");
      }
    } else if (terminal.promotedArtifact !== null || terminal.artifactDigest !== null) {
      throw new Error("construct terminal recovery refused: non-promoted terminal names an artifact");
    }
    return Object.freeze({ ...terminal, recovered: true, rolloutsStarted: 0 });
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  let checkpoint = (await readCurrentConstructCheckpointBundle(runDirectory))?.checkpoint ?? initialCheckpoint(config);
  assertConstructCheckpointIdentity(checkpoint, config.identity);
  const jobs = constructIndexedJobs(config.totalShards, config.seed);
  const committed = await readCommittedRows(runDirectory, config, jobs, Boolean(runShardBundle));
  const committedByIndex = new Map(committed.map((row) => [row.index, row]));
  const frozenCandidates = new Map([["prior-frozen", initializeConstructNetwork(config.seed)]]);
  const frozenCandidateOrigins = new Map();
  const freezeCandidate = async (id) => {
    const path = join(runDirectory, `candidate-${id}.json`);
    const boundaryPath = join(runDirectory, `candidate-boundary-${id}.json`);
    let expected;
    try {
      expected = JSON.parse(await readFile(boundaryPath, "utf8"));
      if (Object.keys(expected).sort().join("\0") !== ["id", "weightsDigest", "checkpointDigest", "checkpoint",
        "update", "nextJobIndex", "configDigest", "protocolDigest"].sort().join("\0") || expected.id !== id) {
        throw new Error(`frozen candidate ${id} boundary is invalid or stale`);
      }
      if (expected.configDigest !== config.identity.configDigest || expected.protocolDigest !== config.scheduleDigest ||
          !/^[0-9a-f]{8}$/.test(expected.weightsDigest) || !/^[0-9a-f]{8}$/.test(expected.checkpointDigest) ||
          expected.checkpointDigest !== checkpointDigest(expected.checkpoint) ||
          expected.checkpointDigest !== checkpointDigest(recomputeCandidateBoundary(config, id, committedByIndex)) ||
          expected.weightsDigest !== weightsDigest(expected.checkpoint.weights) ||
          expected.update !== expected.checkpoint.optimizer.update ||
          expected.nextJobIndex !== expected.checkpoint.nextJobIndex ||
          expected.nextJobIndex !== candidateBoundaryIndex(config, id) ||
          canonicalIntegrityJson(expected.checkpoint.identity) !== canonicalIntegrityJson(config.identity) ||
          expected.update !== expected.nextJobIndex / config.shardsPerUpdate ||
          expected.update > checkpoint.optimizer.update || expected.nextJobIndex > checkpoint.nextJobIndex) {
        throw new Error(`frozen candidate ${id} boundary is invalid or stale`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (checkpoint.nextJobIndex !== candidateBoundaryIndex(config, id) ||
          checkpoint.optimizer.update !== checkpoint.nextJobIndex / config.shardsPerUpdate ||
          checkpointDigest(checkpoint) !== checkpointDigest(recomputeCandidateBoundary(config, id, committedByIndex))) {
        throw new Error(`frozen candidate ${id} was not reached at its exact scheduled boundary`);
      }
      expected = Object.freeze({ id, weightsDigest: weightsDigest(checkpoint.weights), checkpoint,
        checkpointDigest: checkpointDigest(checkpoint), update: checkpoint.optimizer.update,
        nextJobIndex: checkpoint.nextJobIndex, configDigest: config.identity.configDigest,
        protocolDigest: config.scheduleDigest });
      await atomic(boundaryPath, encode(expected));
    }
    try {
      const decoded = JSON.parse(await readFile(path, "utf8"));
      if (Object.keys(decoded).sort().join("\0") !== ["id", "origin", "version", "weights", "weightsDigest"].sort().join("\0") ||
          decoded.version !== 2 || decoded.id !== id ||
          Object.keys(decoded.origin ?? {}).sort().join("\0") !==
            ["checkpointDigest", "configDigest", "nextJobIndex", "protocolDigest", "update"].sort().join("\0") ||
          decoded.origin.configDigest !== expected.configDigest ||
          decoded.origin.protocolDigest !== expected.protocolDigest ||
          decoded.origin.checkpointDigest !== expected.checkpointDigest ||
          decoded.origin.update !== expected.update || decoded.origin.nextJobIndex !== expected.nextJobIndex ||
          !Array.isArray(decoded.weights?.values) || decoded.weights.values.length !== CONSTRUCT_NETWORK_WEIGHT_COUNT ||
          decoded.weights.values.some((value) => !Number.isFinite(value)) ||
          decoded.weightsDigest !== expected.weightsDigest ||
          decoded.weightsDigest !== weightsDigest(decoded.weights)) throw new Error(`frozen candidate ${id} is invalid or stale`);
      const weights = Object.freeze({ values: Object.freeze(decoded.weights.values) }); frozenCandidates.set(id, weights);
      frozenCandidateOrigins.set(id, Object.freeze({ ...decoded.origin }));
      return weights;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const weights = expected.checkpoint.weights;
      const record = Object.freeze({ version: 2, id, weights, weightsDigest: expected.weightsDigest,
        origin: Object.freeze({ checkpointDigest: expected.checkpointDigest, update: expected.update,
          nextJobIndex: expected.nextJobIndex, configDigest: expected.configDigest,
          protocolDigest: expected.protocolDigest }) });
      await atomic(path, encode(record)); frozenCandidates.set(id, weights); frozenCandidateOrigins.set(id, record.origin);
      return weights;
    }
  };
  let selectedCandidate = null;
  const checkpointed = new Set(checkpoint.completedShards);
  for (const index of checkpointed) {
    if (!committedByIndex.has(index)) throw new Error(`construct checkpoint names missing durable shard ${index}`);
  }
  const drainReadyBundles = async (terminal = false) => {
    for (;;) {
      const start = checkpoint.nextJobIndex;
      if (start >= config.totalShards) return;
      const count = Math.min(config.shardsPerUpdate, config.totalShards - start);
      if (count < config.shardsPerUpdate && !terminal) return;
      const bundle = Array.from({ length: count }, (_, offset) => committedByIndex.get(start + offset));
      if (bundle.some((row) => !row)) return;
      checkpoint = advanceConstructBundle(checkpoint, bundle, config);
      await writeConstructCheckpointBundle(runDirectory, checkpoint, terminal && checkpoint.nextJobIndex === config.totalShards
        ? "terminal" : "running");
    }
  };
  await drainReadyBundles(false);
  const commitOne = async (job, value) => {
    if (committedByIndex.has(job.index)) return;
    const row = Object.freeze({ version: 1, index: job.index, seed: job.seed,
      configDigest: config.identity.configDigest, gradient: Object.freeze([...value.gradient]),
      metrics: Object.freeze({ ...value.metrics }) });
    if (row.gradient.length !== CONSTRUCT_NETWORK_WEIGHT_COUNT || row.gradient.some((entry) => !Number.isFinite(entry))) {
      throw new Error(`construct rollout shard ${job.index} returned an invalid gradient`);
    }
    const spec = job.spec;
    if (runShardBundle) {
      if (!spec) throw new Error(`construct rollout shard ${job.index} has no frozen job spec`);
      validateMetrics(row.metrics, spec, `construct rollout shard ${job.index}`);
    }
    await atomic(join(runDirectory, "shards", pad(job.index) + ".json"), encode(row));
    committed.push(row);
    committedByIndex.set(row.index, row);
    await onCommitted?.(row);
  };
  if (runShardBundle) {
    if (!Array.isArray(config.jobSpecs) || config.jobSpecs.length !== jobs.length) {
      throw new Error("construct physical trainer requires one frozen job spec per indexed shard");
    }
    let started = 0;
    let priorStage = null;
    for (let start = 0; start < jobs.length; start += config.shardsPerUpdate) {
      const indexed = jobs.slice(start, start + config.shardsPerUpdate).map((job) => Object.freeze({
        ...job, spec: resolveFrozenJobSpec(config, config.jobSpecs[job.index]),
      }));
      const stage = indexed[0].spec.stage;
      if (indexed.some((job) => job.spec.stage !== stage)) {
        throw new Error("construct update bundle crosses a frozen learning-stage boundary");
      }
      if (config.enforceStageGates && priorStage !== null && priorStage !== stage) {
        let gate;
        if (priorStage === "validation") {
          assertPairedValidationRows(committed, config);
          const candidates = ["bc-final", "ppo-final"].map((id) => ({ id, weights: frozenCandidates.get(id) }));
          const ledger = committed.filter((row) => row.metrics.stage === "validation").map((row) => ({
            ...row.metrics, candidate: row.metrics.candidate, split: "validation", stage: "validation",
          }));
          selectedCandidate = selectConstructValidationCandidate(candidates, ledger);
          if (!selectedCandidate) return finish({ status: "rejected",
            promotedArtifact: null, reason: "frozen validation selected no candidate", completedShards: committed.length,
            updates: checkpoint.optimizer.update, scheduleDigest: config.scheduleDigest, identity: config.identity });
          gate = candidateStageGate(committed, "validation", selectedCandidate.id);
          frozenCandidates.set("selected", selectedCandidate.weights);
        } else gate = stageGate(committed, priorStage);
        if (gate.decision !== "advance") return finish({ status: "rejected",
          promotedArtifact: null, reason: `${priorStage} gate failed: ${gate.reasons.join("; ")}`,
          completedShards: committed.length, updates: checkpoint.optimizer.update,
          scheduleDigest: config.scheduleDigest, identity: config.identity, stageGate: gate });
        if (priorStage === "behavior-cloning") await freezeCandidate("bc-final");
        if (priorStage === "ppo") await freezeCandidate("ppo-final");
      }
      priorStage = stage;
      const pending = indexed.filter((job) => !committedByIndex.has(job.index));
      if (pending.length === 0) { await drainReadyBundles(false); continue; }
      if (started + pending.length > stopAfterShards) return Object.freeze({ status: "interrupted", checkpoint,
        completedShards: committedByIndex.size, rolloutsStarted: started });
      const grouped = new Map();
      for (const job of pending) {
        const id = job.spec.candidate ?? "evolving"; const rows = grouped.get(id) ?? []; rows.push(job); grouped.set(id, rows);
      }
      for (const [id, rows] of grouped) {
        const weights = id === "evolving" ? checkpoint.weights : id === "authored" ?
          (frozenCandidates.get("selected") ?? checkpoint.weights) : frozenCandidates.get(id);
        if (!weights) throw new Error(`construct stage ${stage} has no frozen candidate "${id}"`);
        await runShardBundle(rows, weights, workerCount, async (index, value) => {
          const job = rows.find((candidate) => candidate.index === index);
          if (!job) throw new Error(`construct rollout worker returned unknown shard ${index}`);
          await commitOne(job, value);
        });
      }
      started += pending.length;
      await drainReadyBundles(false);
    }
    await drainReadyBundles(true);
    await writeConstructCheckpointBundle(runDirectory, checkpoint, "terminal");
    const gates = Object.freeze({
      "behavior-cloning": stageGate(committed, "behavior-cloning"),
      ppo: stageGate(committed, "ppo"),
      validation: candidateStageGate(committed, "validation", selectedCandidate?.id ?? "selected"),
      "held-out": candidateStageGate(committed, "held-out", "selected"),
    });
    if (config.mode === "smoke") {
      const lossRows = committed.filter((row) => Number.isFinite(row.metrics.loss));
      const moved = checkpoint.weights.values.some((value, index) =>
        value !== initializeConstructNetwork(config.seed).values[index]);
      const evidence = Object.freeze({ physicalRows: committed.length, finiteLossRows: lossRows.length,
        decisions: committed.reduce((sum, row) => sum + (row.metrics.decisions ?? 0), 0),
        schedulerAdmissions: committed.reduce((sum, row) => sum + (row.metrics.schedulerAdmissions ?? 0), 0),
        weightsMoved: moved });
      if (committed.length !== config.totalShards || !moved || evidence.finiteLossRows !== committed.length ||
          evidence.decisions <= 0 || evidence.schedulerAdmissions <= 0) {
        return finish({ status: "rejected", promotedArtifact: null,
          reason: "physical smoke did not move finite loss/weights through the public scheduler",
          completedShards: committed.length, updates: checkpoint.optimizer.update,
          scheduleDigest: config.scheduleDigest, identity: config.identity, evidence });
      }
      return finish({ status: "smoke-complete", promotedArtifact: null,
        reason: "real physical smoke only; this is not promotion evidence", completedShards: committed.length,
        updates: checkpoint.optimizer.update, checkpointDigest: integrityDigest(new TextDecoder().decode(
          encodeConstructCheckpoint(checkpoint))), scheduleDigest: config.scheduleDigest, identity: config.identity, evidence });
    }
    const failed = Object.entries(gates).find(([, gate]) => gate.decision !== "advance");
    const heldRows = committed.filter((row) => row.metrics.stage === "held-out");
    const ledger = heldRows.map((row) => ({ ...row.metrics, split: "test", stage: "held-out",
      scenarioKey: config.jobSpecs[row.index]?.scenarioKey ?? `unpaired-job-${row.index}` }));
    const selectedId = selectedCandidate?.id ?? "selected";
    const selectedRows = ledger.filter((row) => row.candidate === "selected").map((row) => ({ ...row, candidate: selectedId }));
    const verdict = recomputeConstructTournamentVerdict(selectedId, selectedRows, 0);
    const competitors = ["selected", "prior-frozen", "authored"];
    const scenarioKeys = [...new Set(config.jobSpecs.filter(({ stage }) => stage === "held-out")
      .map(({ scenarioKey }) => scenarioKey))].sort();
    const comparisonReasons = [];
    for (const scenarioKey of scenarioKeys) {
      const cell = ledger.filter((row) => row.scenarioKey === scenarioKey);
      for (const competitor of competitors) if (cell.filter((row) => row.candidate === competitor).length !== 1) {
        comparisonReasons.push(`${scenarioKey} does not contain exactly one ${competitor} row`);
      }
      const selected = cell.find((row) => row.candidate === "selected");
      for (const baseline of ["authored", "prior-frozen"]) {
        const other = cell.find((row) => row.candidate === baseline);
        if (selected && other && selected.score < other.score) {
          comparisonReasons.push(`${scenarioKey}: selected candidate underperforms ${baseline}`);
        }
      }
    }
    const tournamentManifest = Object.freeze({ version: 1, selected: selectedId,
      competitors: Object.freeze([selectedId, "authored", "prior-frozen"]), scenarioKeys: Object.freeze(scenarioKeys),
      rows: Object.freeze(ledger),
      verdict, comparisonReasons: Object.freeze(comparisonReasons) });
    const tournamentManifestBytes = encode(tournamentManifest);
    await atomic(join(runDirectory, "construct-tournament-manifest.json"), tournamentManifestBytes);
    const tournamentManifestDigest = integrityDigest(new TextDecoder().decode(tournamentManifestBytes));
    const worstHeldScore = verdict.worstMorphologyScore;
    if (failed || !verdict.pass || comparisonReasons.length) return finish({ status: "rejected",
      promotedArtifact: null, reason: failed ? `${failed[0]} gate failed: ${failed[1].reasons.join("; ")}` :
        [...verdict.reasons, ...comparisonReasons].join("; "), completedShards: committed.length,
      updates: checkpoint.optimizer.update, scheduleDigest: config.scheduleDigest, identity: config.identity,
      gates, worstHeldScore, tournamentManifest: "construct-tournament-manifest.json", tournamentManifestDigest });
    const promotedWeights = frozenCandidates.get("selected") ?? checkpoint.weights;
    const artifact = Object.freeze({ version: 1, provenance: "held-out-qualified", scheduleDigest: config.scheduleDigest,
      checkpointDigest: integrityDigest(new TextDecoder().decode(encodeConstructCheckpoint(checkpoint))),
      candidate: selectedId, candidateWeightsDigest: weightsDigest(promotedWeights),
      candidateOrigin: frozenCandidateOrigins.get(selectedId), weights: promotedWeights, worstHeldScore,
      tournamentManifest: "construct-tournament-manifest.json" });
    const artifactBytes = encode(artifact);
    await atomic(join(runDirectory, "promoted-construct-policy.json"), artifactBytes);
    return finish({ status: "promoted",
      promotedArtifact: "promoted-construct-policy.json", reason: "all frozen physical gates passed",
      completedShards: committed.length, updates: checkpoint.optimizer.update, scheduleDigest: config.scheduleDigest,
      identity: config.identity, gates, worstHeldScore, checkpointDigest: artifact.checkpointDigest,
      tournamentManifest: "construct-tournament-manifest.json", tournamentManifestDigest,
      artifactDigest: integrityDigest(new TextDecoder().decode(artifactBytes)) });
  }
  const completionOrder = [];
  for (let start = 0; start < jobs.length; start += config.shardsPerUpdate) {
    const bundle = jobs.slice(start, start + config.shardsPerUpdate);
    completionOrder.push(...Array.from({ length: workerCount }, (_, worker) =>
      bundle.filter((_, index) => index % workerCount === worker)).flat());
  }
  let started = 0;
  for (const job of completionOrder) {
    if (committedByIndex.has(job.index)) continue;
    if (started >= stopAfterShards) return Object.freeze({ status: "interrupted", checkpoint,
      completedShards: committedByIndex.size, rolloutsStarted: started });
    const indexed = Object.freeze({ ...job, spec: config.jobSpecs?.[job.index] ?
      resolveFrozenJobSpec(config, config.jobSpecs[job.index]) : undefined });
    const value = await runShard(indexed, checkpoint.weights);
    await commitOne(indexed, value);
    started += 1;
    await drainReadyBundles(false);
  }
  await drainReadyBundles(true);
  await writeConstructCheckpointBundle(runDirectory, checkpoint, "terminal");
  return finish({ status: "complete", promotedArtifact: null,
    reason: "software ladder completed without a qualified tournament verdict", completedShards: committed.length,
    updates: checkpoint.optimizer.update, checkpointDigest: integrityDigest(new TextDecoder().decode(
      encodeConstructCheckpoint(checkpoint))), scheduleDigest: config.scheduleDigest, identity: config.identity });
}

const physicalJobSpecs = (stages, steps) => {
  return Object.freeze(Object.entries(stages).flatMap(([stage, count]) => {
    if (stage === "validation") {
      const selection = CONSTRUCT_LEARNING_SCHEDULE.validationSelection;
      const cells = selection.seeds.flatMap((scenarioSeed, seedIndex) => selection.mirrors.map((mirrored) => Object.freeze({
        stage, morphologySlot: seedIndex, opponentSlot: seedIndex + 1, mirrored, scenarioSeed, steps,
        scenarioKey: `validation-${seedIndex}/opponent-${seedIndex + 1}/seed-${scenarioSeed}/mirror-${mirrored ? 1 : 0}`,
      })));
      const specs = cells.flatMap((cell) => selection.candidates.map((candidate) => Object.freeze({
        ...cell, candidate, controller: "policy",
      })));
      if (specs.length !== count) throw new Error(`validation schedule declares ${count} shards but expands to ${specs.length}`);
      return specs;
    }
    if (stage !== "held-out") return Array.from({ length: count }, (_, index) => Object.freeze({
      stage, morphologySlot: index, opponentSlot: index + 1, mirrored: index % 2 === 1, steps,
      candidate: "evolving",
      controller: "policy",
    }));
    const tournament = CONSTRUCT_LEARNING_SCHEDULE.heldOutTournament;
    const cells = CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.test.flatMap((_morphology, morphologySlot) =>
      tournament.seeds.flatMap((scenarioSeed, seedIndex) => tournament.mirrors.map((mirrored) => Object.freeze({
        morphologySlot, opponentSlot: seedIndex, mirrored, scenarioSeed,
        scenarioKey: `test-${morphologySlot}/opponent-${seedIndex}/seed-${scenarioSeed}/mirror-${mirrored ? 1 : 0}`,
      }))));
    const specs = cells.flatMap((cell) => tournament.competitors.map((candidate) => Object.freeze({
      stage, ...cell, steps, candidate, controller: candidate === "authored" ? "authored" : "policy",
    })));
    if (specs.length !== count) throw new Error(`held-out schedule declares ${count} shards but expands to ${specs.length}`);
    return specs;
  }));
};

export const smokeConstructTrainerConfig = () => Object.freeze({
  mode: "smoke", enforceStageGates: false,
  entryQualified: true, entryReason: "physical smoke override; never promotion evidence", totalShards: 2, shardsPerUpdate: 1,
  seed: 20260828, learningRate: 0.0001, scheduleDigest: integrityDigest(canonicalIntegrityJson({ physicalSmoke: 2 })),
  identity: defaultConstructTrainingIdentity({ actionDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST,
    programDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST, teacherDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST, configDigest: "51515152" }),
  morphologySplit: Object.freeze({ train: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.train,
    validation: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.validation,
    test: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.test }),
  jobSpecs: physicalJobSpecs({ "behavior-cloning": 1, ppo: 1 }, 120),
});

/** Production stays executable but fail-closed until the authored qualification gate moves. */
export const constructProductionRunConfigDigest = (entryGate = CONSTRUCT_LEARNING_SCHEDULE.entryGate) =>
  integrityDigest(canonicalIntegrityJson({ protocol: CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
    qualificationSource: entryGate.sourceDigest, qualificationRun: entryGate.runDigest }));

export const productionConstructTrainerConfig = () => Object.freeze({
  mode: "production", enforceStageGates: true,
  entryQualified: CONSTRUCT_LEARNING_SCHEDULE.entryGate.qualified,
  entryReason: CONSTRUCT_LEARNING_SCHEDULE.entryGate.reason,
  qualificationSourceDigest: CONSTRUCT_LEARNING_SCHEDULE.entryGate.sourceDigest,
  qualificationProtocolDigest: CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
  totalShards: Object.values(CONSTRUCT_LEARNING_SCHEDULE.stageShards).reduce((sum, count) => sum + count, 0),
  shardsPerUpdate: CONSTRUCT_LEARNING_SCHEDULE.durability.checkpointEveryUpdates,
  seed: 20260828,
  learningRate: 0.0001,
  scheduleDigest: CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
  identity: defaultConstructTrainingIdentity({ actionDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST,
    programDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST, teacherDigest: CONSTRUCT_LEARNING_CORPUS_DIGEST,
    configDigest: constructProductionRunConfigDigest() }),
  morphologySplit: Object.freeze({ train: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.train,
    validation: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.validation,
    test: CONSTRUCT_LEARNING_SCHEDULE.morphologySplit.test }),
  jobSpecs: physicalJobSpecs(CONSTRUCT_LEARNING_SCHEDULE.stageShards, CONSTRUCT_LAB_BOUT_CAP_STEPS),
});

export const smokeConstructShard = (job) => Object.freeze({
  gradient: Object.freeze(Array.from({ length: CONSTRUCT_NETWORK_WEIGHT_COUNT }, (_, at) =>
    (((job.seed >>> (at % 16)) & 255) - 127) / 1_000_000)),
  metrics: Object.freeze({ stage: job.spec?.stage ?? "ppo", morphology: job.spec?.morphology ?? "smoke-train",
    candidate: job.spec?.candidate ?? "evolving",
    score: 0, loss: 1 / (job.index + 1), decisions: 1, schedulerAdmissions: 1,
    commandDigestRows: Object.freeze([`synthetic-${job.index}`]), morphologyCells: 1, deadMorphologyCells: 0,
    actionGroupsSeen: 2, unsupportedRate: 0, refusalRate: 0, finiteCommandRate: 1,
    lifecycleFailureCount: 0, stuckRate: 0, meanDamage: 1, timeCapRate: 0,
    imitationAgreement: 1, mirrorApplications: job.spec?.mirrored ? 2 : 0,
    motorSaturationRate: 0, selfCollisionCount: 0, victoryRate: 0 }),
});

const argument = (name) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : null; };
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const runDirectory = resolve(argument("--run") ?? ".tools/construct-training");
  const smoke = process.argv.includes("--smoke");
  const config = smoke ? smokeConstructTrainerConfig() : productionConstructTrainerConfig();
  const requestedWorkers = Number(argument("--workers") ?? (smoke ? Math.min(2, availableParallelism()) :
    CONSTRUCT_LEARNING_SCHEDULE.topology.rolloutWorkers ?? 1));
  const result = await runConstructTrainer({ runDirectory, config, workerCount: requestedWorkers,
    runShardBundle: runPhysicalConstructShardBundle });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
