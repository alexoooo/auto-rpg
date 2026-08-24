import { RESEARCH_ALGORITHMS, artifactChecksum, canonicalJson, type ResearchAlgorithm } from "./artifact.ts";
import type { ResearchMatrixJob } from "./research-matrix.ts";

export const OPPORTUNITY_WINDOW_SECONDS = 0.75;
export const STALL_WINDOW_SECONDS = 2.0;
export const MAX_NEAR_RANGE_STALL_SHARE = 0.15;
export const MIN_OPPORTUNITY_ATTACK_RATE = 0.65;
export const MIN_ATTACK_CONTACT_RATE = 0.20;
export const MAX_FIRST_ATTACK_P90_SECONDS = 6.0;
export const MAX_SYMMETRIC_TIME_CAP_RATE = 0.10;
export const MAX_SPECIALIST_GAP = 0.15;
export const MIN_ACTION_SHARE = 0.08;
export const MIN_DIVERSE_ACTIONS = 3;

export interface TournamentCell {
  readonly name: string;
  readonly meaningfulEngagement: number;
  readonly opportunityAttackRate: number;
  readonly attackContactRate: number;
  readonly nearRangeStallShare: number;
  readonly firstAttackP90Seconds: number;
  readonly symmetricTimeCapRate: number;
  readonly score: number;
  readonly specialistScore: number;
}

export interface TournamentCandidate {
  readonly name: string;
  readonly algorithm: ResearchAlgorithm;
  readonly artifactBytes: number;
  readonly meanScore: number;
  readonly confidenceLow: number;
  readonly confidenceHigh?: number;
  readonly scriptedScore: number;
  readonly randomScore: number;
  readonly cells: readonly TournamentCell[];
  readonly actionCounts: Readonly<Record<string, number>>;
  readonly safety: {
    readonly finiteAnatomical: boolean;
    readonly capabilities: boolean;
    readonly postVerdict: boolean;
    readonly stuckActions: boolean;
    readonly lifecycle: boolean;
  };
}

export interface CandidateVerdict {
  readonly name: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface TournamentVerdict {
  readonly candidates: readonly CandidateVerdict[];
  readonly promoted: string | null;
}

export interface TournamentRawRow {
  readonly manifestDigest: string;
  readonly index: number;
  readonly candidate: string;
  readonly job: ResearchMatrixJob;
  readonly outcome: "win" | "loss" | "draw";
  readonly seconds: number;
  readonly engagement: {
    readonly opportunities: number; readonly attacks: number; readonly contacts: number;
    readonly nearRangeStallSeconds: number; readonly firstAttackSeconds: number | null;
    readonly meaningful: number;
  };
  readonly actionCounts: Readonly<Record<string, number>>;
  readonly safety: TournamentCandidate["safety"];
}

export interface FrozenTournamentManifest {
  readonly version: 1;
  readonly split: "test";
  readonly selectedOn: "validation";
  readonly candidates: readonly { readonly name: string; readonly algorithm: ResearchAlgorithm;
    readonly artifactDigest: string; readonly artifactBytes: number }[];
  readonly controls: readonly ["scripted-meta-control", "random-meta-control", "specialist-control"];
  readonly jobs: readonly ResearchMatrixJob[];
  readonly thresholds: Readonly<Record<string, number>>;
  readonly priorTestRows: 0;
  readonly digest: string;
}

export const TOURNAMENT_THRESHOLDS = Object.freeze({
  opportunityWindowSeconds: OPPORTUNITY_WINDOW_SECONDS, stallWindowSeconds: STALL_WINDOW_SECONDS,
  maxNearRangeStallShare: MAX_NEAR_RANGE_STALL_SHARE, minOpportunityAttackRate: MIN_OPPORTUNITY_ATTACK_RATE,
  minAttackContactRate: MIN_ATTACK_CONTACT_RATE, maxFirstAttackP90Seconds: MAX_FIRST_ATTACK_P90_SECONDS,
  maxSymmetricTimeCapRate: MAX_SYMMETRIC_TIME_CAP_RATE, maxSpecialistGap: MAX_SPECIALIST_GAP,
  minActionShare: MIN_ACTION_SHARE, minDiverseActions: MIN_DIVERSE_ACTIONS,
});
export const TOURNAMENT_CONTROLS = Object.freeze(["scripted-meta-control", "random-meta-control", "specialist-control"] as const);

const manifestBody = (manifest: Omit<FrozenTournamentManifest, "digest">): string => canonicalJson(manifest);
export function freezeTournamentManifest(input: Omit<FrozenTournamentManifest, "version" | "split" | "selectedOn" |
  "controls" | "thresholds" | "priorTestRows" | "digest">): FrozenTournamentManifest {
  const body = Object.freeze({ version: 1 as const, split: "test" as const, selectedOn: "validation" as const,
    candidates: Object.freeze(input.candidates.map((candidate) => Object.freeze({ ...candidate }))),
    jobs: Object.freeze(input.jobs.map((job) => Object.freeze({ ...job }))), thresholds: TOURNAMENT_THRESHOLDS,
    controls: TOURNAMENT_CONTROLS, priorTestRows: 0 as const });
  return Object.freeze({ ...body, digest: artifactChecksum(manifestBody(body)) });
}

export function validateTournamentManifest(manifest: FrozenTournamentManifest): void {
  if (manifest.version !== 1) throw new Error(`tournament manifest version ${manifest.version} is unsupported`);
  if (manifest.split !== "test" || manifest.selectedOn !== "validation") throw new Error("tournament selection must use validation before test is opened");
  if (manifest.priorTestRows !== 0) throw new Error("test rows must be absent before the frozen candidate set is selected");
  const { digest, ...body } = manifest;
  if (artifactChecksum(manifestBody(body)) !== digest) throw new Error("tournament manifest changed after test was opened");
  const names = new Set<string>();
  for (const candidate of manifest.candidates) {
    if (names.has(candidate.name)) throw new Error(`duplicate tournament candidate "${candidate.name}"`);
    names.add(candidate.name);
    if (!(RESEARCH_ALGORITHMS as readonly string[]).includes(candidate.algorithm)) throw new Error(`${candidate.name} has unknown algorithm "${candidate.algorithm}"`);
    if (!Number.isSafeInteger(candidate.artifactBytes) || candidate.artifactBytes <= 0) throw new Error(`${candidate.name} has invalid artifact byte size`);
    if (!/^[a-f0-9]{64}$/.test(candidate.artifactDigest)) throw new Error(`${candidate.name} has an invalid artifact digest`);
  }
  if (!manifest.candidates.length) throw new Error("tournament manifest has no validation-selected candidates");
  if (!manifest.jobs.length || manifest.jobs.some((job) => job.split !== "test")) throw new Error("tournament manifest must contain test jobs only");
  const jobs = manifest.jobs.map(jobSignature);
  if (new Set(jobs).size !== jobs.length) throw new Error("tournament manifest contains duplicate jobs");
}

const jobSignature = (job: ResearchMatrixJob): string => canonicalJson(job);
const controllersFor = (manifest: FrozenTournamentManifest): readonly string[] =>
  Object.freeze([...manifest.candidates.map((candidate) => candidate.name), ...manifest.controls]);

function validatePartialTournamentRows(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): void {
  validateTournamentManifest(manifest); const allowed = new Set(controllersFor(manifest)); const seen = new Set<string>();
  for (const row of rows) {
    if (!allowed.has(row.candidate)) throw new Error(`unknown tournament controller "${row.candidate}"`);
    if (row.manifestDigest !== manifest.digest) throw new Error(`${row.candidate} row ${row.index} belongs to a different frozen manifest`);
    if (!Number.isSafeInteger(row.index) || row.index < 0 || row.index >= manifest.jobs.length ||
        jobSignature(row.job) !== jobSignature(manifest.jobs[row.index]!)) throw new Error(`${row.candidate} has invalid tournament row index ${row.index}`);
    const identity = `${row.candidate}:${row.index}`; if (seen.has(identity)) throw new Error(`duplicate tournament row ${identity}`); seen.add(identity);
    if (row.outcome !== "win" && row.outcome !== "loss" && row.outcome !== "draw") throw new Error(`${identity} has invalid outcome`);
    if (!Number.isFinite(row.seconds) || row.seconds < 0 || row.seconds > row.job.boutCapSeconds + 1e-9) throw new Error(`${identity} has invalid bout seconds`);
    const engagement = row.engagement;
    for (const [name, value] of Object.entries({ opportunities: engagement.opportunities, attacks: engagement.attacks,
      contacts: engagement.contacts, meaningful: engagement.meaningful })) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${identity} has invalid engagement ${name}`);
    }
    if (engagement.attacks > engagement.opportunities || engagement.contacts > engagement.attacks) throw new Error(`${identity} has impossible engagement attribution`);
    if (!Number.isFinite(engagement.nearRangeStallSeconds) || engagement.nearRangeStallSeconds < 0 ||
        engagement.nearRangeStallSeconds > row.seconds + 1e-9) throw new Error(`${identity} has invalid stall seconds`);
    if (engagement.firstAttackSeconds !== null && (!Number.isFinite(engagement.firstAttackSeconds) ||
        engagement.firstAttackSeconds < 0 || engagement.firstAttackSeconds > row.seconds + 1e-9)) throw new Error(`${identity} has invalid first attack time`);
    if (Object.values(row.actionCounts).some((count) => !Number.isSafeInteger(count) || count < 0)) throw new Error(`${identity} has invalid action count`);
    if (Object.values(row.safety).some((value) => typeof value !== "boolean")) throw new Error(`${identity} has invalid safety evidence`);
  }
}
export function assertCommonTournamentMatrix(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): void {
  validatePartialTournamentRows(rows, manifest);
  const expected = manifest.jobs.map(jobSignature);
  for (const controller of controllersFor(manifest)) {
    const actual = rows.filter((row) => row.candidate === controller).sort((a, b) => a.index - b.index);
    const indices = new Set(actual.map((row) => row.index));
    if (actual.length !== expected.length || indices.size !== expected.length ||
        actual.some((row, index) => row.index !== index || jobSignature(row.job) !== expected[index])) {
      throw new Error(`${controller} did not run the exact frozen cells, seeds, mirrors and opponents`);
    }
  }
}

export function missingTournamentRows(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): readonly { candidate: string; index: number }[] {
  validatePartialTournamentRows(rows, manifest);
  const complete = new Set(rows.map((row) => `${row.candidate}:${row.index}`));
  const controllers = controllersFor(manifest);
  return Object.freeze(controllers.flatMap((candidate) => manifest.jobs.map((_, index) => ({ candidate, index })))
    .filter((row) => !complete.has(`${row.candidate}:${row.index}`)));
}

/** The sole scheduler for a held-out run: deterministic holes, never a fresh seed range. */
export function nextTournamentBatch(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest, maximum: number): readonly { candidate: string; index: number }[] {
  if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new Error("tournament batch size must be a positive integer");
  return Object.freeze(missingTournamentRows(rows, manifest).slice(0, maximum));
}

export function mergeTournamentRows(existing: readonly TournamentRawRow[], incoming: readonly TournamentRawRow[],
  manifest: FrozenTournamentManifest): readonly TournamentRawRow[] {
  const expected = nextTournamentBatch(existing, manifest, incoming.length || 1);
  if (!incoming.length || incoming.some((row, index) => row.candidate !== expected[index]?.candidate || row.index !== expected[index]?.index)) {
    throw new Error("tournament resume rows are unknown, duplicate or out of indexed order");
  }
  const merged = [...existing, ...incoming]; validatePartialTournamentRows(merged, manifest); return Object.freeze(merged);
}

/** A stopped run resumes indexed holes; a complete run cannot open test again. */
export function resumeTournament(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): readonly { candidate: string; index: number }[] {
  const missing = missingTournamentRows(rows, manifest);
  if (!missing.length) throw new Error("the frozen test tournament was already completed and cannot be opened twice");
  return missing;
}

export function assessTournamentCandidate(candidate: TournamentCandidate): CandidateVerdict {
  const failures: string[] = [];
  const safety = candidate.safety;
  if (!safety.finiteAnatomical) failures.push("finite/anatomical failure");
  if (!safety.capabilities) failures.push("capability failure");
  if (!safety.postVerdict) failures.push("post-verdict action failure");
  if (!safety.stuckActions) failures.push("stuck-action failure");
  if (!safety.lifecycle) failures.push("lifecycle failure");
  if (!(candidate.meanScore > candidate.scriptedScore)) failures.push("macro held-out score did not beat scripted meta");
  if (!(candidate.meanScore > candidate.randomScore)) failures.push("macro held-out score did not beat random meta");
  for (const cell of candidate.cells) {
    if (cell.meaningfulEngagement <= 0) failures.push(`${cell.name}: zero meaningful engagement`);
    if (cell.opportunityAttackRate < MIN_OPPORTUNITY_ATTACK_RATE) failures.push(`${cell.name}: opportunity attack rate below ${MIN_OPPORTUNITY_ATTACK_RATE}`);
    if (cell.attackContactRate < MIN_ATTACK_CONTACT_RATE) failures.push(`${cell.name}: attack contact rate below ${MIN_ATTACK_CONTACT_RATE}`);
    if (cell.nearRangeStallShare > MAX_NEAR_RANGE_STALL_SHARE) failures.push(`${cell.name}: near-range stall share above ${MAX_NEAR_RANGE_STALL_SHARE}`);
    if (cell.firstAttackP90Seconds > MAX_FIRST_ATTACK_P90_SECONDS) failures.push(`${cell.name}: first-attack p90 above ${MAX_FIRST_ATTACK_P90_SECONDS}s`);
    if (cell.symmetricTimeCapRate > MAX_SYMMETRIC_TIME_CAP_RATE) failures.push(`${cell.name}: symmetric cap rate above ${MAX_SYMMETRIC_TIME_CAP_RATE}`);
    if (cell.specialistScore - cell.score > MAX_SPECIALIST_GAP + Number.EPSILON) failures.push(`${cell.name}: specialist gap above ${MAX_SPECIALIST_GAP}`);
  }
  const total = Object.values(candidate.actionCounts).reduce((sum, count) => sum + count, 0);
  const diverse = Object.entries(candidate.actionCounts).filter(([name, count]) =>
    name !== "recover" && total > 0 && count / total >= MIN_ACTION_SHARE);
  if (diverse.length < MIN_DIVERSE_ACTIONS) failures.push("fewer than three non-recover actions occupy at least 8% of decisions");
  return Object.freeze({ name: candidate.name, passed: failures.length === 0, failures: Object.freeze(failures) });
}

export function tournamentVerdict(candidates: readonly TournamentCandidate[]): TournamentVerdict {
  const names = new Set<string>();
  for (const candidate of candidates) {
    if (names.has(candidate.name)) throw new Error(`duplicate tournament candidate "${candidate.name}"`);
    names.add(candidate.name);
  }
  const verdicts = candidates.map(assessTournamentCandidate).sort((a, b) => a.name.localeCompare(b.name));
  const passing = candidates.filter((candidate) => verdicts.find((row) => row.name === candidate.name)?.passed);
  if (!passing.length) return Object.freeze({ candidates: Object.freeze(verdicts), promoted: null });
  const topCandidate = [...passing].sort((a, b) => b.meanScore - a.meanScore || a.name.localeCompare(b.name))[0] as TournamentCandidate;
  const topLow = topCandidate.confidenceLow;
  const statisticallyTied = passing.filter((candidate) => (candidate.confidenceHigh ?? candidate.meanScore) >= topLow);
  const pool = statisticallyTied.length ? statisticallyTied : [topCandidate];
  const selected = [...pool].sort((a, b) => a.artifactBytes - b.artifactBytes ||
    a.algorithm.localeCompare(b.algorithm) || a.name.localeCompare(b.name))[0] as TournamentCandidate;
  return Object.freeze({ candidates: Object.freeze(verdicts), promoted: selected.name });
}

const percentile = (values: readonly number[], fraction: number): number => {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] as number;
};

/** Rebuild all promotion inputs from raw mirrored rows; report aggregates have no authority. */
export function candidateFromRawRows(candidate: FrozenTournamentManifest["candidates"][number], rows: readonly TournamentRawRow[]): TournamentCandidate {
  const mine = rows.filter((row) => row.candidate === candidate.name);
  if (!mine.length) throw new Error(`${candidate.name} has no raw tournament rows`);
  const cellNames = [...new Set(mine.map((row) => `${row.job.unit}/${row.job.loadout}`))].sort();
  const scoreFor = (controller: string, cellName?: string): number => {
    const selected = rows.filter((row) => row.candidate === controller && (!cellName || `${row.job.unit}/${row.job.loadout}` === cellName));
    if (!selected.length) throw new Error(`${controller} has no raw tournament rows${cellName ? ` for ${cellName}` : ""}`);
    return selected.filter((row) => row.outcome === "win").length / selected.length;
  };
  const cells = cellNames.map((name) => {
    const cellRows = mine.filter((row) => `${row.job.unit}/${row.job.loadout}` === name);
    const opportunities = cellRows.reduce((sum, row) => sum + row.engagement.opportunities, 0);
    const attacks = cellRows.reduce((sum, row) => sum + row.engagement.attacks, 0);
    const caps = cellRows.filter((row) => row.outcome === "draw" && row.seconds >= row.job.boutCapSeconds - 1e-9).length;
    return Object.freeze({ name, meaningfulEngagement: cellRows.reduce((sum, row) => sum + row.engagement.meaningful, 0),
      opportunityAttackRate: attacks / Math.max(1, opportunities),
      attackContactRate: cellRows.reduce((sum, row) => sum + row.engagement.contacts, 0) / Math.max(1, attacks),
      nearRangeStallShare: cellRows.reduce((sum, row) => sum + row.engagement.nearRangeStallSeconds, 0) /
        Math.max(1e-9, cellRows.reduce((sum, row) => sum + row.seconds, 0)),
      firstAttackP90Seconds: percentile(cellRows.map((row) => row.engagement.firstAttackSeconds ?? Number.POSITIVE_INFINITY), 0.90),
      symmetricTimeCapRate: caps / cellRows.length,
      score: cellRows.filter((row) => row.outcome === "win").length / cellRows.length,
      specialistScore: scoreFor("specialist-control", name) });
  });
  const actionCounts: Record<string, number> = {};
  for (const row of mine) for (const [name, count] of Object.entries(row.actionCounts)) actionCounts[name] = (actionCounts[name] ?? 0) + count;
  const safety = mine.reduce((value, row) => ({ finiteAnatomical: value.finiteAnatomical && row.safety.finiteAnatomical,
    capabilities: value.capabilities && row.safety.capabilities, postVerdict: value.postVerdict && row.safety.postVerdict,
    stuckActions: value.stuckActions && row.safety.stuckActions, lifecycle: value.lifecycle && row.safety.lifecycle }),
  { finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true });
  const wins = mine.filter((row) => row.outcome === "win").length; const meanScore = wins / mine.length;
  const z = 1.959963984540054; const denominator = 1 + z * z / mine.length;
  const centre = (meanScore + z * z / (2 * mine.length)) / denominator;
  const margin = z * Math.sqrt(meanScore * (1 - meanScore) / mine.length + z * z / (4 * mine.length * mine.length)) / denominator;
  return Object.freeze({ name: candidate.name, algorithm: candidate.algorithm, artifactBytes: candidate.artifactBytes,
    meanScore, confidenceLow: Math.max(0, centre - margin), confidenceHigh: Math.min(1, centre + margin),
    scriptedScore: scoreFor("scripted-meta-control"), randomScore: scoreFor("random-meta-control"),
    cells: Object.freeze(cells), actionCounts: Object.freeze(actionCounts), safety: Object.freeze(safety) });
}

export function recomputeTournamentReport(report: { readonly manifest: FrozenTournamentManifest; readonly rawRows: readonly TournamentRawRow[] }): TournamentVerdict {
  assertCommonTournamentMatrix(report.rawRows, report.manifest);
  return tournamentVerdict(report.manifest.candidates.map((candidate) => candidateFromRawRows(candidate, report.rawRows)));
}
