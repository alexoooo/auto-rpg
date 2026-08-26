import { evaluationSeed, type EvaluationSplit } from "./evaluation.ts";
import { artifactChecksum, canonicalJson } from "./artifact.ts";

export type ResearchUnit = "warrior" | "broot" | "centipede";
export type ResearchOpponent = "specialist" | "scripted-meta" | "random-meta";
export type ResearchLoadout = "sword+empty" | "sword+shield" | "sword+buckler" | "sword+axe" |
  "axe+empty" | "bow+empty" | "empty+empty" | "natural:bite";

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

/**
 * The off hand is the axis for the first four -- nothing, a strapped guard, a
 * held guard, a second striker -- and the last three are about the primary hand
 * instead: a different striker, a two-hander, and no weapon at all.
 *
 * **`sword+axe` is here because the effector head could not otherwise be
 * measured on a body that attacks.** Re-measured over every stratum, sampling
 * `tacticEffectors` for every action at every physics sample of a real bout
 * (`.review/sa27/cells.mjs`, 45 bouts after and 39 before, every cell x all 3
 * `RESEARCH_OPPONENTS`, mirror 0 only, split "train", base seed 310013, 1200
 * solver steps each): before this row, the only actions that
 * ever offered two legal effectors on an armed body were `cover` and `recover`.
 * So on 8 cells of 13 the free-effector denominator was exactly "how often did
 * it choose to defend", on 3 more it was structurally zero, and the two cells
 * where an *attacking* action had an effector choice were the weaponless
 * `empty+empty` pair -- which is the perverse reading `headUtilisation`'s
 * docstring in `learning/tournament.ts` records: **the better a candidate was at
 * attacking, the less the record could say about its effector head.**
 *
 * Two one-handed strikers of different kinds is the smallest body that breaks
 * that. `cut` is legal in both hands (`isHeldStriker` accepts both) and `thrust`
 * in only the sword hand (`hasPoint` refuses the axe), so the loadout separates
 * *which hand* from *which action* rather than confounding them -- which is why
 * `docs/measurements.md` already used `sword+axe` for exactly this in
 * `selectDeployableTactic`'s unit test while the matrix did not contain it.
 * Measured after: an attacking action has two legal effectors on 4 of 15 cells,
 * and 2 of those 4 are weapon-bearing.
 *
 * `sword+sword` would have done the same job for `cut` and is not what was
 * added: it makes `thrust` two-handed as well, so no action in the loadout
 * distinguishes the hands, and the counterfactual "would the answer have been
 * the same with the other hand" has no negative case.
 *
 * The cost, priced before any compute was spent rather than after and derived
 * from the live tables (`.review/sa27/schedule.mjs`): 13 cells to **15**, 39
 * strata rows to **45**, 78 matrix jobs a split to **90**,
 * `lookaheadTacticCellSchedule` 775 tasks a split to **945**, and its minimum
 * look-ahead budget 148,800 solver steps to **181,440**. **The two costs are not
 * the same percentage and the decision note assumed they were**: the tournament
 * grows with the job count, 15.4 %, and the look-ahead schedule grows with the
 * tuple count, **21.9 %**, because `sword+axe` is the *widest* row in the table
 * at 17 tuples while being an ordinary one at four actions. Anything derived
 * here by multiplying a cell count is wrong in one direction or the other.
 * `curriculumDigest` moves f9d5c046 -> a011a028 with it, which refuses
 * `--resume` on any saved NEAT-QD state; the three runs under
 * `asset-src/learning/research/` were already refused at feature version 3
 * against runtime 4 and are not regenerated.
 */
export const HUMANOID_RESEARCH_LOADOUTS = Object.freeze([
  "sword+empty", "sword+shield", "sword+buckler", "sword+axe", "axe+empty", "bow+empty", "empty+empty",
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

/**
 * Where `sword+axe` lands in the ladder, decided rather than inherited.
 *
 * Two of the five filters could have taken it and only one does, so both are
 * written down -- a loadout that falls into a stage because the filter happened
 * to be a negation is the shape this file has no way to notice later.
 *
 * - **`moving-unguarded`: out.** The filter names one loadout (`sword+empty`)
 *   and that is what it is: the second rung, immediately after a single
 *   stationary cell, teaching approach against `random-meta` on the body with
 *   the least tactical surface. `sword+axe` is literally unguarded, so the
 *   stage's *name* admits it -- and it has strictly more surface than
 *   `sword+empty`, because `cut` reaches both hands there and one here. Putting
 *   it in makes the earliest movement rung wider without teaching movement any
 *   better. It is the effector head this loadout exists for, and the effector
 *   head is not what this stage is about.
 * - **`guarding-specialist`: in, on purpose.** That filter is a negation --
 *   everything but `bow+empty` -- because the exclusion is *ranged*, not
 *   *unnamed*: an archer's plan is distance and this stage is about holding a
 *   guard against the scripted `swinger`. `sword+axe` covers with either hand
 *   and fights in measure, so it belongs by the same property the bow is
 *   refused by. It is also the first rung on which the effector head has a
 *   choice while *attacking*, which is the whole argument for the row.
 * - `stationary` names `warrior/empty+empty` and takes one row; `mixed` takes
 *   every humanoid; `complete` takes everything. None of the three is a
 *   judgement about this loadout.
 */
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
