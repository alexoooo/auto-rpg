import { evaluationSeed, type EvaluationSplit } from "./evaluation.ts";
import { artifactChecksum, canonicalJson } from "./artifact.ts";

export type ResearchUnit = "warrior" | "broot" | "centipede";
export type ResearchOpponent = "specialist" | "scripted-meta" | "random-meta";
export type ResearchLoadout = "sword+empty" | "sword+shield" | "sword+buckler" | "axe+empty" |
  "bow+empty" | "empty+empty" | "natural:bite";

export interface ResearchStratum {
  readonly unit: ResearchUnit;
  readonly loadout: ResearchLoadout;
  readonly opponent: ResearchOpponent;
  readonly boutCapSeconds: number;
}

export interface ResearchMatrixJob extends ResearchStratum {
  readonly split: EvaluationSplit;
  readonly cell: number;
  readonly mirror: 0 | 1;
  readonly actorSide: "left" | "right";
  readonly actorSeed: number;
  readonly opponentSeed: number;
}

export const HUMANOID_RESEARCH_LOADOUTS = Object.freeze([
  "sword+empty", "sword+shield", "sword+buckler", "axe+empty", "bow+empty", "empty+empty",
] as const);
export const RESEARCH_OPPONENTS = Object.freeze(["specialist", "scripted-meta", "random-meta"] as const);

export const RESEARCH_STRATA: readonly ResearchStratum[] = Object.freeze([
  ...(["warrior", "broot"] as const).flatMap((unit) => HUMANOID_RESEARCH_LOADOUTS.flatMap((loadout) =>
    RESEARCH_OPPONENTS.map((opponent) => Object.freeze({ unit, loadout, opponent, boutCapSeconds: 45 })))),
  ...RESEARCH_OPPONENTS.map((opponent) => Object.freeze({ unit: "centipede" as const,
    loadout: "natural:bite" as const, opponent, boutCapSeconds: 45 })),
]);

export function researchMatrix(split: EvaluationSplit, baseSeed: number): ResearchMatrixJob[] {
  return RESEARCH_STRATA.flatMap((stratum, cell) => ([0, 1] as const).map((mirror) => {
    const seed = evaluationSeed(baseSeed, split, cell);
    return Object.freeze({ ...stratum, split, cell, mirror, actorSide: mirror === 0 ? "left" as const : "right" as const,
      actorSeed: seed, opponentSeed: evaluationSeed(baseSeed ^ 0x51f15e, split, cell) });
  }));
}

export type CurriculumStageName = "stationary" | "moving-unguarded" | "guarding-specialist" | "mixed" | "complete";
export interface CurriculumStage { readonly name: CurriculumStageName; readonly startFraction: number; readonly strata: readonly ResearchStratum[] }

export const RESEARCH_CURRICULUM: readonly CurriculumStage[] = Object.freeze([
  Object.freeze({ name: "stationary", startFraction: 0, strata: RESEARCH_STRATA.filter((row) => row.unit === "warrior" && row.loadout === "empty+empty").slice(0, 1) }),
  Object.freeze({ name: "moving-unguarded", startFraction: 0.15, strata: RESEARCH_STRATA.filter((row) => row.opponent === "random-meta" && row.loadout === "sword+empty") }),
  Object.freeze({ name: "guarding-specialist", startFraction: 0.35, strata: RESEARCH_STRATA.filter((row) => row.opponent === "specialist" && row.loadout !== "bow+empty") }),
  Object.freeze({ name: "mixed", startFraction: 0.55, strata: RESEARCH_STRATA.filter((row) => row.unit !== "centipede") }),
  Object.freeze({ name: "complete", startFraction: 0.75, strata: RESEARCH_STRATA }),
]);

export function curriculumStage(fraction: number): CurriculumStage {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error("curriculum fraction must be within 0..1");
  return [...RESEARCH_CURRICULUM].reverse().find((stage) => fraction >= stage.startFraction) as CurriculumStage;
}

export const curriculumDigest = (): string => artifactChecksum(canonicalJson(RESEARCH_CURRICULUM));

export interface OpponentArchiveEntry {
  readonly id: string;
  readonly stage: number;
  readonly policy: ResearchOpponent | "champion";
  readonly artifactDigest: string | null;
}

export const SHIPPED_OPPONENT_ARCHIVE: readonly OpponentArchiveEntry[] = Object.freeze(
  RESEARCH_OPPONENTS.map((policy, stage) => Object.freeze({ id: `shipped:${policy}`, stage, policy, artifactDigest: null })),
);

/** Indexed sampling is independent of worker scheduling and has no mutable RNG cursor. */
export function sampleOpponentArchive(entries: readonly OpponentArchiveEntry[], seed: number, jobIndex: number): OpponentArchiveEntry {
  if (!entries.length) throw new Error("opponent archive is empty");
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(jobIndex) || jobIndex < 0) throw new Error("invalid opponent archive sample index");
  let mixed = (seed ^ Math.imul(jobIndex + 1, 0x9e3779b9)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d) >>> 0;
  return entries[mixed % entries.length] as OpponentArchiveEntry;
}

/** Shipped archive entries select their named control; champions supply a frozen genome separately. */
export function opponentForArchive(entry: OpponentArchiveEntry, matrixFallback: ResearchOpponent): ResearchOpponent {
  return entry.policy === "champion" ? matrixFallback : entry.policy;
}
