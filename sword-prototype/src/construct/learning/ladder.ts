import type { ConstructNetworkWeights } from "./network.ts";
import { evaluateConstructLearningStage, type ConstructLearningStage, type ConstructStageMetrics } from "./schedule.ts";

export interface ConstructCandidateLedgerRow extends ConstructStageMetrics {
  readonly candidate: string;
  readonly stage: ConstructLearningStage;
  readonly split: "train" | "validation" | "test";
  readonly morphology: string;
  readonly score: number;
}

export interface FrozenConstructCandidate {
  readonly id: string;
  readonly weights: ConstructNetworkWeights;
  readonly validationScore: number;
}

/** Selection accepts validation rows only; test rows are an error, not ignored input. */
export function selectConstructValidationCandidate(
  candidates: readonly Readonly<{ id: string; weights: ConstructNetworkWeights } >[],
  rows: readonly ConstructCandidateLedgerRow[],
): FrozenConstructCandidate | null {
  const testRow = rows.find((row) => row.split === "test");
  if (testRow) throw new Error(`validation selection cannot read test row for morphology "${testRow.morphology}"`);
  let selected: FrozenConstructCandidate | null = null;
  for (const candidate of candidates) {
    const own = rows.filter((row) => row.candidate === candidate.id && row.split === "validation");
    if (!own.length) continue;
    if (own.some((row) => evaluateConstructLearningStage(row.stage, row).decision !== "advance")) continue;
    const score = Math.min(...own.map((row) => row.score));
    if (!selected || score > selected.validationScore ||
        (score === selected.validationScore && candidate.id < selected.id)) {
      selected = Object.freeze({ id: candidate.id, weights: candidate.weights, validationScore: score });
    }
  }
  return selected;
}

export interface ConstructTournamentVerdict {
  readonly pass: boolean;
  readonly candidate: string;
  readonly worstMorphologyScore: number;
  readonly reasons: readonly string[];
}

export function recomputeConstructTournamentVerdict(
  candidate: string,
  rows: readonly ConstructCandidateLedgerRow[],
  minimumWorstMorphologyScore: number,
): ConstructTournamentVerdict {
  if (!Number.isFinite(minimumWorstMorphologyScore)) throw new Error("construct tournament threshold must be finite");
  const own = rows.filter((row) => row.candidate === candidate && row.split === "test");
  const reasons: string[] = [];
  if (!own.length) reasons.push("no held-out test rows");
  for (const row of own) {
    const decision = evaluateConstructLearningStage("held-out", row);
    if (decision.decision !== "advance") reasons.push(...decision.reasons.map((reason) => `${row.morphology}: ${reason}`));
  }
  const worst = own.length ? Math.min(...own.map((row) => row.score)) : Number.NEGATIVE_INFINITY;
  if (worst < minimumWorstMorphologyScore) reasons.push("worst held-out morphology score is below threshold");
  return Object.freeze({ pass: reasons.length === 0, candidate, worstMorphologyScore: worst,
    reasons: Object.freeze([...new Set(reasons)]) });
}

