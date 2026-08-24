import { OPTION_NAMES, type OptionName } from "../options.ts";

export const MAX_SPECIALIST_GAP = 0.15;
export const MIN_OPTION_SHARE = 0.08;
export const MIN_DIVERSE_OPTIONS = 3;
export const MIN_STRONGER_MOTIFS = 2;

export interface ExperimentEvidence {
  readonly runId: string;
  readonly championDigest: string;
  readonly validationScore: number;
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

/** Select without consulting any test result. Ties are stable and declared. */
export function selectValidationChampion(rows: readonly ExperimentEvidence[]): ExperimentEvidence {
  if (rows.length < 3) throw new Error("promotion requires at least three independent default experiments");
  for (const row of rows) {
    if (!Number.isFinite(row.validationScore)) throw new Error(`experiment ${row.runId} has a non-finite validation score`);
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
