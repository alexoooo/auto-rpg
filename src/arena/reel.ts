/**
 * **A reel's trials** (`LinkedReel`): each case it names, found in its evaluation's records as the
 * build carries them (`recordsOf`), with what the Arena needs to play and name it: the world, how
 * long the case was played when it was scored (`Row.played`), its record's commit, its conditions
 * and its outcome in the evaluation's words.
 */
import { isEngineName } from "../core/engine/engines.ts";
import { BODY_MODELS } from "../core/models.ts";
import type { CaseWorld } from "../evaluation/evaluation.ts";
import { EVALUATIONS } from "../evaluation/evaluations.ts";
import { conditionText, findCase } from "../ratings/analysis.ts";
import { recordsOf } from "../ratings/records.ts";
import type { LinkedReel } from "./case-link.ts";
import { isOrdersEntry } from "./duel.ts";

/** A bout case's world: the one kind the Arena opens, bit-equal between JavaScript engines. */
type BoutWorld = Extract<CaseWorld, { readonly kind: "bout" }>;

/** One case of a reel, ready to play. */
export interface Trial {
  readonly world: BoutWorld;
  /** How long it played when scored, s of the bout's clock; null for a record older than rows that say. */
  readonly played: number | null;
  readonly commit: string;
  readonly condition: string;
  /** Its outcome as the evaluation names it (`Evaluation.outcome`), or null for one that names none. */
  readonly outcome: string | null;
}

/** Why `world` is no bout case this build can play, or null where it is one. */
function refusal(world: CaseWorld | null): string | null {
  if (world?.kind !== "bout") return "the Arena opens recorded bout cases only";
  if (!isEngineName(world.engine)) return `its engine ${String(world.engine)} is not one this build has`;
  if (!BODY_MODELS.includes(world.recipe.left) || !BODY_MODELS.includes(world.recipe.right)) return "its recipe names a character this build does not have";
  if (!world.tape.every((entry, k, tape) => isOrdersEntry(entry) && (k === 0 || entry.step >= tape[k - 1]!.step))) return "its tape has invalid or unordered orders";
  return null;
}

/** `reel`'s trials, in its order; an error naming the first case that is missing or cannot be played, or where they need more than one engine or level. */
export async function reelTrials(reel: LinkedReel): Promise<Trial[]> {
  const evaluation = Object.hasOwn(EVALUATIONS, reel.evaluation) ? EVALUATIONS[reel.evaluation]! : null;
  if (!evaluation) throw new Error(`the reel's evaluation ${reel.evaluation} is not one this build has`);
  const records = await recordsOf(reel.evaluation);
  const trials = reel.cases.map((key): Trial => {
    const found = findCase(records, key);
    if (!found) throw new Error(`no record of ${reel.evaluation} holds the case ${key}`);
    const { record, line } = found, refused = refusal(line.world);
    if (refused !== null) throw new Error(`the case ${key} cannot be played: ${refused}`);
    return { world: line.world as BoutWorld, played: line.played ?? null, commit: record.header.commit, condition: conditionText(line.condition),
      outcome: line.reading !== null && evaluation.outcome ? evaluation.outcome(line.reading).label : null };
  });
  // The Arena builds its engine and level once, for every trial it plays.
  const { engine, recipe } = trials[0]!.world;
  if (trials.some(({ world }) => world.engine !== engine || (world.recipe.level ?? "open") !== (recipe.level ?? "open"))) {
    throw new Error("the reel's cases are of more than one engine or level");
  }
  return trials;
}
