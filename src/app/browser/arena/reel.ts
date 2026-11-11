/**
 * **A reel's trials** (`LinkedReel`): each case it names of a subject's result, built again as this
 * build makes it (`casesNow`), with what the Arena needs to play and name it: the world, how long
 * the trial played when it was scored and its outcome in the evaluation's words (the result's), the
 * commit it was read at, and its condition.
 */
import { isEngineName } from "../../../core/physics/engines.ts";
import { BODY_MODELS } from "../../../core/bodies/models.ts";
import { validBoutTiming, type CaseWorld } from "../../../evaluation/evaluation.ts";
import { resultOf } from "../../../evaluation/results.ts";
import { EVALUATIONS } from "../evaluation.ts";
import { conditionText } from "../ratings/analysis.ts";
import { casesNow, resultsOf } from "../ratings/results.ts";
import type { LinkedReel } from "./case-link.ts";
import { isOrdersEntry } from "../../../game/arena/duel.ts";

/** A bout case's world: the one kind the Arena opens, bit-equal between JavaScript engines. */
type BoutWorld = Extract<CaseWorld, { readonly kind: "bout" }>;

/** One case of a reel, ready to play. */
export interface Trial {
  readonly world: BoutWorld;
  /** How long it played when scored, s of the bout's clock; null where its result does not say. */
  readonly played: number | null;
  /** The commit its result was read at. */
  readonly commit: string;
  /** Its outcome as its result names it, or null for one that names none. */
  readonly outcome: string | null;
  readonly condition: string;
}

/** Why `world` is no bout case this build can play, or null where it is one. */
function refusal(world: CaseWorld): string | null {
  if (world.kind !== "bout") return "the Arena opens bout cases only";
  if (!isEngineName(world.engine)) return `its engine ${String(world.engine)} is not one this build has`;
  if (world.timing !== undefined && !validBoutTiming(world.timing)) return "its timing is invalid";
  if (!BODY_MODELS.includes(world.recipe.left) || !BODY_MODELS.includes(world.recipe.right)) return "its recipe names a character this build does not have";
  if (!world.tape.every((entry, k, tape) => isOrdersEntry(entry) && (k === 0 || entry.step >= tape[k - 1]!.step))) return "its tape has invalid or unordered orders";
  return null;
}

/** `reel`'s trials, in its order; an error naming the first case that is missing or cannot be played, or where they need more than one engine or level. */
export async function reelTrials(reel: LinkedReel): Promise<{ readonly trials: Trial[]; readonly fault?: never } | { readonly fault: string; readonly trials?: never }> {
  const evaluation = Object.hasOwn(EVALUATIONS, reel.evaluation) ? EVALUATIONS[reel.evaluation]! : null;
  if (!evaluation) return { fault: `the reel's evaluation ${reel.evaluation} is not one this build has` };
  const results = await resultsOf(reel.evaluation), result = resultOf(results, reel.protocol, reel.subject);
  if (!result) return { fault: `${reel.evaluation} keeps no result of ${reel.subject} on ${reel.protocol}` };
  const cases = casesNow(evaluation, reel.protocol, reel.subject);
  if ("fault" in cases) return { fault: cases.fault };
  const names = results.cases[result.cases ?? ""] ?? [], trials: Trial[] = [];
  for (const name of reel.cases) {
    const found = cases.get(name), row = result.trials?.[names.indexOf(name)] ?? null;
    if (!found) return { fault: `this build makes no case ${name} of ${reel.subject} on ${reel.evaluation} ${reel.protocol}` };
    const refused = refusal(found.world);
    if (refused !== null) return { fault: `the case ${name} cannot be played: ${refused}` };
    trials.push({ world: found.world as BoutWorld, played: row?.[0] ?? null, commit: result.commit, outcome: row ? result.outcomes?.[row[1]!]?.label ?? null : null, condition: conditionText(found.condition) });
  }
  if (!trials.length) return { fault: "the reel names no case" };
  // The Arena builds its engine and level once, for every trial it plays.
  const { engine, recipe, timing } = trials[0]!.world;
  if (trials.some(({ world }) => world.engine !== engine || (world.recipe.level ?? "open") !== (recipe.level ?? "open")
    || (world.timing?.hz ?? 120) !== (timing?.hz ?? 120) || (world.timing?.delay ?? 1) !== (timing?.delay ?? 1))) {
    return { fault: "the reel's cases use different engines, levels, rates or command delays" };
  }
  return { trials };
}
