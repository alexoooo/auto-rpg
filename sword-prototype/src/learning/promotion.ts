import { FEATURE_VERSION } from "./features.ts";
import { OPTION_NAMES, type OptionName } from "../options.ts";

export const MAX_SPECIALIST_GAP = 0.15;
export const MIN_OPTION_SHARE = 0.08;
export const MIN_DIVERSE_OPTIONS = 3;
export const MIN_STRONGER_MOTIFS = 2;

export interface ExperimentEvidence {
  readonly runId: string;
  readonly seed: number;
  readonly championDigest: string;
  readonly validationScore: number;
  readonly population: number;
  readonly generations: number;
  readonly mirroredBouts: number;
  readonly workers: number;
  readonly trainerProtocol: number;
  readonly configDigest: string;
  readonly featureVersion: number;
  readonly optionNames: readonly OptionName[];
}

export interface PromotionEvidence {
  readonly splitOverlap: boolean;
  readonly heldOutWinScore: number;
  readonly scriptedWinScore: number;
  readonly randomWinScore: number;
  readonly loadouts: readonly {
    readonly name: string;
    readonly learnedWinRate: number;
    readonly specialistWinRate: number;
  }[];
  readonly decisionCounts: Readonly<Record<OptionName, number>>;
  readonly motifs: readonly {
    readonly name: string;
    readonly learned: number;
    readonly scripted: number;
  }[];
  readonly safety: {
    readonly finiteIntents: boolean;
    readonly supportedOptions: boolean;
    readonly noStuckOption: boolean;
    readonly noPostVerdictAction: boolean;
  };
}

export interface PromotionDecision {
  readonly promoted: boolean;
  readonly failures: readonly string[];
  readonly optionShares: Readonly<Record<OptionName, number>>;
}

/**
 * Refuse a provenance summary whose raw generation ledger is incomplete.
 *
 * The dimensions in `config` say what was requested; only this ordered ledger
 * proves every requested generation actually reached the reporting boundary.
 * Promotion reads no fitness from it, so this hardening changes no training or
 * selection semantics.
 */
export function validateDefaultTrainingReport(
  report: {
    readonly config?: { readonly version?: number; readonly seed?: number; readonly population?: number;
      readonly generations?: number; readonly mirroredBouts?: number };
    readonly configDigest?: string;
    readonly championDigest?: string;
    readonly reports?: readonly { readonly generation?: number }[];
  },
  championDigest: string,
  provenance: Readonly<Record<string, unknown>>,
): void {
  const config = report.config ?? {};
  if (config.version !== 3 || config.population !== 128 || config.generations !== 80 ||
      config.mirroredBouts !== 24 || report.championDigest !== championDigest ||
      report.configDigest !== provenance.configDigest || config.seed !== provenance.seed) {
    throw new Error("training report does not prove this checkpoint came from a complete protocol-v3 default experiment");
  }
  if (!Array.isArray(report.reports) || report.reports.length !== config.generations) {
    throw new Error(`training report generation ledger must contain exactly ${config.generations} rows`);
  }
  for (let index = 0; index < report.reports.length; index += 1) {
    if (report.reports[index]?.generation !== index) {
      throw new Error(`training report generation row ${index} must have index ${index}`);
    }
  }
}

/** Select without consulting any test result. Ties are stable and declared. */
export function selectValidationChampion(rows: readonly ExperimentEvidence[]): ExperimentEvidence {
  if (rows.length < 3) throw new Error("promotion requires at least three independent default experiments");
  const runIds = new Set<string>(); const seeds = new Set<number>(); const digests = new Set<string>();
  for (const row of rows) {
    if (!Number.isFinite(row.validationScore)) throw new Error(`experiment ${row.runId} has a non-finite validation score`);
    if (row.population !== 128 || row.generations !== 80 || row.mirroredBouts !== 24 || row.workers !== 8) {
      throw new Error(`experiment ${row.runId} is not a default 128x80x24 run with 8 workers`);
    }
    // The feature version is the runtime's, not a literal. It was pinned at 2
    // and had already been stale for a whole version before anybody noticed,
    // which is what a hand-maintained copy of a contract does: every experiment
    // run against the current table was refused for "not matching" it.
    //
    // A correction to that note, because "stale" was only half of it: the 2 was
    // exactly the version of `asset-src/learning/unpromoted-v1.json`, the one
    // piece of evidence in the tree. So the gate passed the file it was written
    // beside and refused everything anybody would ever run next, in both
    // directions, without ever looking wrong.
    //
    // Reading the runtime's version has a consequence worth stating outright:
    // that checked-in v2 evidence is **no longer selectable**, and that is the
    // right answer rather than a cost. A v2 champion is a network whose 66
    // inputs mean different things to a 99-column v4 build, and selecting one
    // here would only move the refusal down to `learnedMetaMind`, after the
    // selection had already been believed. The evidence stays at the version it
    // was recorded at; `the_compact_unpromoted_evidence_recomputes_the_recorded_failure`
    // pins both halves -- the refusal, and that the ordering rule still
    // reproduces the recorded champion when asked at a version this build runs.
    if (row.trainerProtocol !== 3 || row.featureVersion !== FEATURE_VERSION || row.configDigest.length !== 16 ||
        row.optionNames.join("\0") !== OPTION_NAMES.join("\0")) {
      throw new Error(`experiment ${row.runId} does not match the protocol-v3 feature and option contract`);
    }
    if (runIds.has(row.runId) || seeds.has(row.seed) || digests.has(row.championDigest)) {
      throw new Error(`experiment ${row.runId} is not independent`);
    }
    runIds.add(row.runId); seeds.add(row.seed); digests.add(row.championDigest);
  }
  return [...rows].sort((a, b) => b.validationScore - a.validationScore ||
    a.runId.localeCompare(b.runId) || a.championDigest.localeCompare(b.championDigest))[0] as ExperimentEvidence;
}

export function assessPromotion(evidence: PromotionEvidence): PromotionDecision {
  const failures: string[] = [];
  if (evidence.splitOverlap) failures.push("train/validation/test seeds overlap");
  if (!(evidence.heldOutWinScore > evidence.scriptedWinScore)) failures.push("held-out win score did not beat scripted meta");
  if (!(evidence.heldOutWinScore > evidence.randomWinScore)) failures.push("held-out win score did not beat random-option control");
  for (const row of evidence.loadouts) {
    if (row.specialistWinRate - row.learnedWinRate > MAX_SPECIALIST_GAP + Number.EPSILON) {
      failures.push(`${row.name} trails its scripted specialist by more than 15 percentage points`);
    }
  }
  const total = OPTION_NAMES.reduce((sum, name) => sum + (evidence.decisionCounts[name] ?? 0), 0);
  const optionShares = Object.fromEntries(OPTION_NAMES.map((name) => [name,
    total > 0 ? (evidence.decisionCounts[name] ?? 0) / total : 0])) as Record<OptionName, number>;
  const diverse = OPTION_NAMES.filter((name) => name !== "recover" && optionShares[name] >= MIN_OPTION_SHARE);
  if (diverse.length < MIN_DIVERSE_OPTIONS) failures.push("fewer than three non-recover options occupy at least 8% of decisions");
  if (evidence.motifs.filter((row) => row.learned > row.scripted).length < MIN_STRONGER_MOTIFS) {
    failures.push("fewer than two transition motifs are more common than scripted baseline");
  }
  if (!evidence.safety.finiteIntents) failures.push("a non-finite intent was observed");
  if (!evidence.safety.supportedOptions) failures.push("an unsupported option was observed");
  if (!evidence.safety.noStuckOption) failures.push("a stuck option was observed");
  if (!evidence.safety.noPostVerdictAction) failures.push("post-verdict action was observed");
  return Object.freeze({ promoted: failures.length === 0, failures: Object.freeze(failures), optionShares: Object.freeze(optionShares) });
}
