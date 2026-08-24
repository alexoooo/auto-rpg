import { canonicalJson, type ResearchAlgorithm } from "./artifact.ts";
import type { EvaluationSplit } from "./evaluation.ts";

export const RESEARCH_SOLVER_STEP_BUDGET = 1_800_000_000;
export const ABLATION_SOLVER_STEP_BUDGET = 180_000_000;
export const RESEARCH_SEEDS = Object.freeze([310013, 310019, 310031] as const);

export interface ResearchJob<T> {
  readonly index: number;
  readonly split: EvaluationSplit;
  readonly solverSteps: number;
  readonly value: T;
}

export function indexedResearchJobs<T>(split: EvaluationSplit, values: readonly T[], solverSteps: number): ResearchJob<T>[] {
  if (!Number.isSafeInteger(solverSteps) || solverSteps <= 0) throw new Error(`invalid solver-step budget ${solverSteps}`);
  return values.map((value, index) => Object.freeze({ index, split, solverSteps, value }));
}

export class SplitReader<T> {
  readonly split: EvaluationSplit;
  private readonly values: readonly T[];
  constructor(split: EvaluationSplit, values: readonly T[]) { this.split = split; this.values = Object.freeze([...values]); }
  readForTraining(algorithm: ResearchAlgorithm): readonly T[] {
    if (this.split !== "train") throw new Error(`${algorithm} training cannot read ${this.split} rows`);
    return this.values;
  }
  readForEvaluation(): readonly T[] { return this.values; }
}

export interface IndexedResearchResult<T> { readonly index: number; readonly value: T }

export function resumeResearch<T>(jobs: readonly ResearchJob<T>[], completed: readonly IndexedResearchResult<unknown>[]): readonly ResearchJob<T>[] {
  const seen = new Set<number>();
  for (const row of completed) {
    if (!Number.isSafeInteger(row.index) || row.index < 0 || row.index >= jobs.length || seen.has(row.index)) {
      throw new Error(`research resume has invalid or duplicate job index ${row.index}`);
    }
    seen.add(row.index);
  }
  return jobs.filter((job) => !seen.has(job.index));
}

export function stableResearchReport<T>(algorithm: ResearchAlgorithm, rows: readonly IndexedResearchResult<T>[]): string {
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  if (ordered.some((row, index) => row.index !== index)) throw new Error("research report has missing or duplicate indexed jobs");
  return canonicalJson({ algorithm, rows: ordered });
}

/** Canonical state bytes make uninterrupted and resumed research directly comparable. */
export function researchStateBytes(state: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(state));
}
