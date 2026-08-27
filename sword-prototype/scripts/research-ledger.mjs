import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { canonicalJson } from "../src/learning/artifact.ts";
import {
  GATE_CONTRACT,
  RESEARCH_GATE_NAMES,
  engagementGates,
  measuredGate,
  unavailableGate,
} from "../src/learning/gates.ts";
export { GATE_CONTRACT, RESEARCH_GATE_NAMES, engagementGates, measuredGate, unavailableGate,
  MAX_FIRST_ATTACK_P90_SECONDS, MAX_NEAR_RANGE_STALL_SHARE, MAX_SPECIALIST_GAP,
  MAX_SYMMETRIC_TIME_CAP_RATE, MIN_ACTION_SHARE, MIN_ATTACK_CONTACT_RATE, MIN_DIVERSE_ACTIONS,
  MIN_OPPORTUNITY_ATTACK_RATE } from "../src/learning/gates.ts";

export const LEDGER_SCHEMA = 1;
export const DEFAULT_PLATEAU_EPSILON = 0.01;
export const DEFAULT_PLATEAU_ROWS = 6;
const OBJECTIVE_CONTRACT = Object.freeze({
  "neat-qd": ["validationWorstCellScore", "higher"], dagger: ["validationLoss", "lower"],
  ppo: ["validationMacroReward", "higher"], lookahead: ["calibrationSeverity", "lower"],
});
export const RESEARCH_SAFETY_NAMES = Object.freeze(["finiteAnatomical", "capabilities", "postVerdict", "stuckActions", "lifecycle"]);
export const LEDGER_CONTRACT = Object.freeze({
  schema: LEDGER_SCHEMA,
  fields: Object.freeze(["schema", "direction", "row", "jobIndex", "stepsConsumed", "wallSeconds",
    "stepsPerSecond", "configDigest", "contractDigest", "validation", "objective", "gates", "gateScope",
    "safety", "directionData", "champion", "improvedSinceRow", "summary", "stopping"]),
  objectives: OBJECTIVE_CONTRACT,
  safetyNames: RESEARCH_SAFETY_NAMES,
  gateNames: RESEARCH_GATE_NAMES,
});

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
};

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const digestContract = (contract) => sha256(canonicalJson(contract));
export const checkpointJobDue = (completedJobs, everyJobs) => {
  if (!Number.isSafeInteger(completedJobs) || completedJobs <= 0 || !Number.isSafeInteger(everyJobs) || everyJobs <= 0) {
    throw new Error("checkpoint cadence requires positive integer job counts");
  }
  return completedJobs % everyJobs === 0;
};

const betterBy = (direction, candidate, reference) => direction === "higher"
  ? candidate - reference : reference - candidate;

const reachesEpsilon = (difference, epsilon, candidate, reference) => {
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(candidate), Math.abs(reference), Math.abs(epsilon));
  return difference + tolerance >= epsilon;
};

export function objectiveProgress(rows, objective, epsilon) {
  if (objective.observed !== false) finite(objective.value, `${objective.name} objective`);
  finite(epsilon, "plateau epsilon");
  if (epsilon < 0) throw new Error("plateau epsilon must be non-negative");
  if (objective.direction !== "higher" && objective.direction !== "lower") {
    throw new Error("objective direction must be higher or lower");
  }
  let significantBest = null; let absoluteBest = null; let bestRow = -1; let lastImprovementRow = -1;
  for (const row of [...rows, { row: rows.length, objective }].filter((candidate) => candidate.objective.observed !== false)) {
    const value = row.objective.value;
    if (absoluteBest === null || betterBy(objective.direction, value, absoluteBest) > 0) {
      absoluteBest = value; bestRow = row.row;
    }
    if (significantBest === null || reachesEpsilon(
      betterBy(objective.direction, value, significantBest), epsilon, value, significantBest,
    )) {
      significantBest = value; lastImprovementRow = row.row;
    }
  }
  return Object.freeze({ best: absoluteBest, bestRow, lastImprovementRow,
    improved: lastImprovementRow === rows.length,
    rowsSinceImprovement: lastImprovementRow < 0 ? 0 : [...rows, { row: rows.length, objective }]
      .filter((candidate) => candidate.objective.observed !== false && candidate.row > lastImprovementRow).length });
}

function validateGate(gate) {
  if (!gate || typeof gate.name !== "string") throw new Error("ledger gate must have a name");
  if (gate.status === "measured") {
    const valueOk = Number.isFinite(gate.value) || gate.value === "Infinity" || gate.value === "-Infinity";
    const marginOk = Number.isFinite(gate.margin) || gate.margin === "Infinity" || gate.margin === "-Infinity";
    if (!valueOk || !Number.isFinite(gate.threshold) || !marginOk) {
      throw new Error(`measured gate ${gate.name} must carry a finite signed margin`);
    }
    const [threshold, comparison] = GATE_CONTRACT[gate.name] ?? [];
    if (gate.threshold !== threshold || gate.comparison !== comparison) throw new Error(`measured gate ${gate.name} changed its frozen contract`);
    const expected = gate.value === "Infinity" ? (comparison === "at-least" ? "Infinity" : "-Infinity")
      : gate.value === "-Infinity" ? (comparison === "at-least" ? "-Infinity" : "Infinity")
      : comparison === "at-least" ? gate.value - threshold : threshold - gate.value;
    if (gate.margin !== expected) throw new Error(`measured gate ${gate.name} has the wrong signed margin`);
  } else if (gate.status !== "unavailable" || typeof gate.reason !== "string" || gate.reason.length === 0 ||
      gate.value !== null || gate.threshold !== null || gate.comparison !== null || gate.margin !== null) {
    throw new Error(`unavailable gate ${gate.name} must carry a reason and null measurements`);
  }
}

const unavailableMeasurement = (value) => value?.status === "unavailable" && typeof value.reason === "string" && value.reason.length > 0;
const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;
const finiteFields = (value, names) => value && names.every((name) => Number.isFinite(value[name]));

function validateDirectionData(direction, data) {
  if (direction === "neat-qd" && (!safeCount(data.generation) || !safeCount(data.species) ||
      !safeCount(data.archiveCoverage) || !unavailableMeasurement(data.mutationTotals))) {
    throw new Error("NEAT-QD ledger data must carry generation, species, archive coverage, and explicit mutation telemetry");
  }
  if (direction === "dagger") {
    const macroNames = ["movement", "action", "effector", "target", "stance"];
    if (!safeCount(data.iteration) || !safeCount(data.rowsAggregated) ||
        !(unavailableMeasurement(data.macroF1) || finiteFields(data.macroF1, macroNames))) {
      throw new Error("DAgger ledger data must carry iteration, rows aggregated, and five-head macro F1 or unavailability");
    }
  }
  if (direction === "ppo") {
    const entropyNames = ["movement", "action", "effector", "target", "stance", "persistence"];
    if (!finiteFields(data.rewardComponents, ["terminal", "vitalityDelta", "nearRangeProgress"]) ||
        !(unavailableMeasurement(data.headEntropies) || finiteFields(data.headEntropies, entropyNames))) {
      throw new Error("PPO ledger data must carry reward components and six-head entropy or unavailability");
    }
  }
  if (direction === "lookahead" && (!safeCount(data.cellsFitted) || !safeCount(data.calibrationKeys) ||
      !(Number.isFinite(data.calibrationSeverity) || unavailableMeasurement(data.calibrationSeverity)) ||
      !(safeCount(data.identicalCalibrationKeys) || unavailableMeasurement(data.identicalCalibrationKeys)))) {
    throw new Error("lookahead ledger data must carry fitted cells and explicit calibration measurements or unavailability");
  }
}

export function validateLedgerRow(row, expectedRow = row.row) {
  if (row?.schema !== LEDGER_SCHEMA) throw new Error(`ledger row schema ${row?.schema} is unsupported`);
  if (!Number.isSafeInteger(row.row) || row.row !== expectedRow || !Number.isSafeInteger(row.jobIndex) || row.jobIndex < 0) {
    throw new Error("ledger rows and jobs must be contiguous non-negative integers");
  }
  if (!Number.isSafeInteger(row.stepsConsumed) || row.stepsConsumed < 0 ||
      ![row.wallSeconds, row.stepsPerSecond].every(Number.isFinite)) throw new Error("ledger row has invalid accounting");
  if (!/^[0-9a-f]{8,64}$/.test(row.configDigest) || !/^[0-9a-f]{8,64}$/.test(row.contractDigest)) {
    throw new Error("ledger row must carry config and contract digests");
  }
  if (!row.objective || !["higher", "lower"].includes(row.objective.direction) ||
      row.objective.observed !== false && !Number.isFinite(row.objective.value) ||
      row.objective.best !== null && !Number.isFinite(row.objective.best) ||
      !Number.isSafeInteger(row.objective.bestRow)) throw new Error("ledger row has an invalid objective");
  if (!Array.isArray(row.gates) || row.gates.length !== RESEARCH_GATE_NAMES.length ||
      RESEARCH_GATE_NAMES.some((name) => row.gates.filter((gate) => gate.name === name).length !== 1)) {
    throw new Error("ledger row must carry each frozen research gate exactly once");
  }
  row.gates.forEach(validateGate);
  if (!row.safety || RESEARCH_SAFETY_NAMES.some((name) => row.safety[name]?.status !== "unavailable" ||
      typeof row.safety[name]?.reason !== "string")) throw new Error("ledger row must name every unavailable research safety gate");
  if (!row.validation || ![row.validation.macro, row.validation.worstCell]
      .every((value) => value === null || Number.isFinite(value))) throw new Error("ledger validation values must be finite or absent");
  if (!row.directionData || row.directionData.kind !== row.direction) throw new Error("ledger direction data must name its direction");
  if (!['neat-qd', 'dagger', 'ppo', 'lookahead'].includes(row.direction)) throw new Error(`unknown ledger direction ${row.direction}`);
  if (row.objective.name !== OBJECTIVE_CONTRACT[row.direction][0] ||
      row.objective.direction !== OBJECTIVE_CONTRACT[row.direction][1]) {
    throw new Error(`${row.direction} ledger objective changed its frozen name or direction`);
  }
  validateDirectionData(row.direction, row.directionData);
  if (typeof row.gateScope !== "string" || row.gateScope.length === 0) throw new Error("ledger gate scope must be explicit");
  if (!row.champion || !["available", "unavailable"].includes(row.champion.status) ||
      row.champion.status === "available" && !/^[0-9a-f]{64}$/.test(row.champion.digest) ||
      row.champion.status === "unavailable" && (row.champion.digest !== null || typeof row.champion.reason !== "string") ||
      typeof row.summary !== "string" || !row.summary) {
    throw new Error("ledger row must honestly describe its champion and summary");
  }
  if (!row.stopping || !Number.isFinite(row.stopping.plateauEpsilon) || row.stopping.plateauEpsilon < 0 ||
      !Number.isSafeInteger(row.stopping.plateauRows) || row.stopping.plateauRows <= 0 ||
      !Number.isSafeInteger(row.stopping.stepCeiling) || row.stopping.stepCeiling <= 0) {
    throw new Error("ledger row must carry its stopping contract");
  }
  return row;
}

export function makeLedgerRow(input) {
  const previous = input.previousRows ?? [];
  const epsilon = input.plateauEpsilon ?? DEFAULT_PLATEAU_EPSILON;
  const objective = { ...input.objective, observed: input.objective.observed !== false };
  const progress = objectiveProgress(previous, objective, epsilon);
  const row = previous.length;
  const championDigest = input.championBytes ? input.championDigest ?? sha256(input.championBytes) : null;
  const championChanged = championDigest !== null && previous.at(-1)?.champion?.digest !== championDigest;
  const summary = `${input.direction} row ${row} jobs ${input.jobIndex} steps ${input.stepsConsumed}: ` +
    (championChanged ? input.championMetric
      ? `new champion ${input.championMetric.name} ${input.championMetric.value}` : objective.observed
      ? `new champion ${input.objective.name} ${objective.value}`
      : `new champion digest ${championDigest}` : "No new champion");
  return validateLedgerRow(Object.freeze({
    schema: LEDGER_SCHEMA, direction: input.direction, row, jobIndex: input.jobIndex,
    stepsConsumed: input.stepsConsumed, wallSeconds: input.wallSeconds, stepsPerSecond: input.stepsPerSecond,
    configDigest: input.configDigest, contractDigest: input.contractDigest,
    validation: Object.freeze({ macro: input.validationMacro ?? null, worstCell: input.validationWorstCell ?? null }),
    objective: Object.freeze({ name: objective.name, direction: objective.direction, observed: objective.observed,
      value: objective.observed ? objective.value : null, best: progress.best, bestRow: progress.bestRow }),
    gates: Object.freeze([...(input.gates ?? [])]), gateScope: input.gateScope ?? "checkpoint-observation",
    safety: Object.freeze(Object.fromEntries(RESEARCH_SAFETY_NAMES.map((name) => [name,
      Object.freeze({ status: "unavailable", reason: "research checkpoints do not execute the held-out tournament safety sweep" })]))),
    directionData: Object.freeze({ kind: input.direction, ...(input.directionData ?? {}) }),
    champion: input.championBytes
      ? Object.freeze({ status: "available", digest: championDigest })
      : Object.freeze({ status: "unavailable", digest: null,
        reason: input.championUnavailableReason ?? "no complete deployable controller exists at this job boundary" }),
    improvedSinceRow: progress.lastImprovementRow,
    summary, stopping: Object.freeze({ plateauEpsilon: epsilon,
      plateauRows: input.plateauRows ?? DEFAULT_PLATEAU_ROWS, stepCeiling: input.stepCeiling }),
  }));
}

export function validateLedgerSequence(rows) {
  rows.forEach((row, index) => validateLedgerRow(row, index));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const previous = rows.slice(0, index);
    const progress = objectiveProgress(previous, { name: row.objective.name, direction: row.objective.direction,
      observed: row.objective.observed, value: row.objective.value }, row.stopping.plateauEpsilon);
    if (row.objective.best !== progress.best || row.objective.bestRow !== progress.bestRow ||
        row.improvedSinceRow !== progress.lastImprovementRow) throw new Error("ledger objective progress was not derived from its prefix");
    const championChanged = row.champion.status === "available" && previous.at(-1)?.champion?.digest !== row.champion.digest;
    const expectedSummary = `${row.direction} row ${row.row} jobs ${row.jobIndex} steps ${row.stepsConsumed}: ` +
      (championChanged ? row.direction === "ppo" && Number.isFinite(row.directionData.championMacro)
        ? `new champion championMacroReward ${row.directionData.championMacro}`
        : row.objective.observed ? `new champion ${row.objective.name} ${row.objective.value}`
        : `new champion digest ${row.champion.digest}` : "No new champion");
    if (row.summary !== expectedSummary) throw new Error("ledger summary does not match its champion transition");
  }
  for (let index = 1; index < rows.length; index += 1) {
    const before = rows[index - 1]; const after = rows[index];
    if (after.jobIndex <= before.jobIndex) throw new Error("ledger job indices must increase");
    if (after.stepsConsumed < before.stepsConsumed || after.wallSeconds < before.wallSeconds) throw new Error("ledger accounting cannot move backwards");
    for (const name of ["direction", "configDigest", "contractDigest"]) if (after[name] !== before[name]) throw new Error(`ledger ${name} changed mid-run`);
    if (after.gateScope !== before.gateScope) throw new Error("ledger gate scope changed mid-run");
    for (const name of ["name", "direction"]) if (after.objective[name] !== before.objective[name]) throw new Error(`ledger objective ${name} changed mid-run`);
    if (canonicalJson(after.stopping) !== canonicalJson(before.stopping)) throw new Error("ledger stopping contract changed mid-run");
  }
  return rows;
}

export async function readLedger(path) {
  let text;
  try { text = await readFile(path, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  const lastNewline = text.lastIndexOf("\n");
  const complete = text.endsWith("\n") ? text.slice(0, -1) : lastNewline < 0 ? "" : text.slice(0, lastNewline);
  if (!complete) return [];
  return validateLedgerSequence(complete.split("\n").filter(Boolean).map((line) => JSON.parse(line)));
}

/** One append call plus fsync: a killed final write may truncate, and the reader ignores only that final fragment. */
export async function appendLedgerRow(path, row) {
  try {
    const bytes = await readFile(path);
    if (bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a) {
      const lastNewline = bytes.lastIndexOf(0x0a); const handle = await open(path, "r+");
      try { await handle.truncate(lastNewline < 0 ? 0 : lastNewline + 1); await handle.sync(); }
      finally { await handle.close(); }
    }
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const previous = await readLedger(path);
  validateLedgerSequence([...previous, row]);
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");
  try { await handle.appendFile(`${JSON.stringify(row)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

export async function writeAtomically(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.tmp-${process.pid}`);
  await writeFile(temporary, bytes); await rename(temporary, path);
}

/** Final outputs land before this marker, so a stopped ledger without the marker is safe to finish again. */
export async function finalizeRun({ runDir, championBytes, reportBytes }) {
  if (!championBytes) throw new Error("a completed research run must have champion bytes");
  await writeAtomically(join(runDir, "champion.artifact"), championBytes);
  await writeAtomically(join(runDir, "report.json"), reportBytes);
  await writeAtomically(join(runDir, "finalized.json"), `${canonicalJson({ schema: 1,
    championDigest: sha256(championBytes), reportDigest: sha256(reportBytes) })}\n`);
}

export async function runIsFinalized(runDir) {
  let marker;
  try { marker = JSON.parse(await readFile(join(runDir, "finalized.json"), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  if (marker?.schema !== 1 || !/^[0-9a-f]{64}$/.test(marker.championDigest) ||
      !/^[0-9a-f]{64}$/.test(marker.reportDigest)) throw new Error("research finalization marker is invalid");
  const championBytes = await readFile(join(runDir, "champion.artifact"));
  const reportBytes = await readFile(join(runDir, "report.json"));
  if (sha256(championBytes) !== marker.championDigest || sha256(reportBytes) !== marker.reportDigest) {
    throw new Error("research final outputs do not match their finalization marker");
  }
  return true;
}

/** A finalization marker is terminal even when its ledger is absent or truncated. */
export async function refuseFinalizedResume(runDir, direction, resumeRequested) {
  if (resumeRequested && await runIsFinalized(runDir)) {
    throw new Error(`${direction} resume refused: run is finalized`);
  }
}

export async function checkpointRun({ runDir, row, championBytes }) {
  validateLedgerSequence([...(await readLedger(join(runDir, "ledger.jsonl"))), row]);
  if (row.champion.status === "available" && (!championBytes || sha256(championBytes) !== row.champion.digest)) {
    throw new Error("checkpoint champion bytes do not match the ledger digest");
  }
  if (row.champion.status === "unavailable" && championBytes) {
    throw new Error("checkpoint cannot publish champion bytes for an unavailable ledger champion");
  }
  if (championBytes) await writeAtomically(join(runDir, "champion-so-far.artifact"), championBytes);
  await appendLedgerRow(join(runDir, "ledger.jsonl"), row);
}

/** The decision is reconstructed only from the rows, including epsilon, window and ceiling. */
export function ledgerStopDecision(rows) {
  if (rows.length === 0) return null;
  rows.forEach((row, index) => validateLedgerRow(row, index));
  const last = rows.at(-1); const { plateauEpsilon, plateauRows, stepCeiling } = last.stopping;
  if (last.stepsConsumed >= stepCeiling) return "stopped: ceiling";
  if (last.objective.best === null) return null;
  const objective = { name: last.objective.name, direction: last.objective.direction,
    observed: last.objective.observed, value: last.objective.value };
  const progress = objectiveProgress(rows.slice(0, -1), objective, plateauEpsilon);
  return progress.rowsSinceImprovement >= plateauRows ? "stopped: plateau" : null;
}

export function ledgerStatus(rows) {
  if (rows.length === 0) return null;
  const last = rows.at(-1); const progress = objectiveProgress(rows.slice(0, -1),
    { name: last.objective.name, direction: last.objective.direction,
      observed: last.objective.observed, value: last.objective.value },
    last.stopping.plateauEpsilon);
  return Object.freeze({ last, best: progress.best, bestRow: progress.bestRow,
    rowsSinceImprovement: progress.rowsSinceImprovement, stop: ledgerStopDecision(rows) });
}
