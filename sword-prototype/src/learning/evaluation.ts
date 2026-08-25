/**
 * Nineteen exports across this tree went from live to test-only in session 17,
 * and this is the one note about it rather than nineteen.
 *
 * Every non-test caller of the split/seed/parity machinery was one of the files
 * that stage deleted -- `evaluate-options.mjs`, `promotion-evaluator.mjs`,
 * `training-evaluator.mjs`, `train-meta.mjs` and `checkpoint.ts`. Eight of the
 * nineteen are here: `SEED_RANGES`, `validateSeedRanges`,
 * `evaluationMirrorSeeds`, `mirroredEvaluationJobs`, `INTENT_FIELDS`,
 * `intentFieldDeltas`, `intentSequencesEqual` and `forcedOptionEvaluationMind`
 * -- with `intentNumbers`, rescued into this file from the evaluator, arriving
 * in the same state. `evaluationSeed` is the one still on a live path, through
 * `research-matrix.ts`. The rest are `initialPopulation` in `genome.ts`, both of
 * `jobs.ts`, and `Network` in `network.ts`; `meta.ts`'s three fitness/novelty
 * functions and `options.ts`'s four recorders carry their own notes because
 * each of those can name the reader that is coming.
 *
 * **This is a situation, not a verdict.** The rule in `AGENTS.md` is that a
 * field or export with no reader will drift, and the exception is one whose
 * coming reader can be *named*. Nothing here can name one yet: the four research
 * directions score through `research-havok.mjs` and `tournament.ts`, and none of
 * them re-derives a split seed or compares two intent streams. Whoever writes
 * session 20's contract-freezing command either uses these or deletes them --
 * a test that exercises a function nothing else calls proves the function still
 * behaves, not that anything wanted it.
 *
 * Two that went to *zero* readers were deleted rather than noted:
 * `seedRangesOverlap` here, whose job `validateSeedRanges` already does with a
 * refusal that names the offending pair, and `genome.ts`'s `NodeKind` **export**
 * -- the alias itself survives because `NodeGene`, declared just below it, still
 * reads it, which is a reader an import-graph sweep does not see.
 */
export type EvaluationSplit = "train" | "validation" | "test";

/** Separate numeric regions make accidental leakage visible in the JSON. */
export const SEED_RANGES: Readonly<Record<EvaluationSplit, readonly [number, number]>> = Object.freeze({
  train: [0, 99_999],
  validation: [100_000, 199_999],
  test: [200_000, 299_999],
});

export function validateSeedRanges(ranges: Record<string, readonly [number, number]>): void {
  const entries = Object.entries(ranges);
  for (const [name, [low, high]] of entries) {
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high < low) {
      throw new Error(`invalid ${name} seed range ${low}..${high}`);
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [a, [a0, a1]] = entries[i]; const [b, [b0, b1]] = entries[j];
      if (Math.max(a0, b0) <= Math.min(a1, b1)) throw new Error(`seed ranges ${a} and ${b} overlap`);
    }
  }
}

validateSeedRanges(SEED_RANGES);

export function evaluationSeed(base: number, split: EvaluationSplit, cell: number): number {
  const [low, high] = SEED_RANGES[split];
  const width = high - low + 1;
  let mixed = (base ^ Math.imul(cell + 1, 0x9e3779b9)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d) >>> 0;
  return low + (mixed % width);
}

export function evaluationMirrorSeeds(base: number, split: EvaluationSplit, cell: number): readonly [number, number] {
  const seed = evaluationSeed(base, split, cell);
  return [seed, seed];
}

export interface MirroredEvaluationJob { cell: number; mirror: 0 | 1; seed: number; actorSide: "left" | "right" }
export function mirroredEvaluationJobs(base: number, split: EvaluationSplit, bouts: number): MirroredEvaluationJob[] {
  if (!Number.isInteger(bouts) || bouts <= 0 || bouts % 2 !== 0) throw new Error("mirrored bout count must be a positive even integer");
  return Array.from({ length: bouts / 2 }, (_, cell) => evaluationMirrorSeeds(base, split, cell).map((seed, mirror) =>
    ({ cell, mirror: mirror as 0 | 1, seed, actorSide: mirror === 0 ? "left" as const : "right" as const }))).flat();
}

/** Every leaf of a combat command, which is every number a parity sweep compares. */
export const INTENT_FIELDS = Object.freeze([
  "forward", "strafe", "turn", "actingHand", "natural.thrust", "natural.guard",
  "posture.trunkLean", "posture.trunkTwist", "posture.crouch",
  ...["primary", "secondary"].flatMap((hand) => ["pointerX", "pointerY", "roll", "wristBend", "thrust", "guard"].map((field) => `${hand}.${field}`)),
]);
/**
 * Every number in a combat command, which is the list a finiteness sweep reads.
 *
 * It lives beside `INTENT_FIELDS` because the two are the same claim written
 * twice -- one as paths, one as values -- and they have already drifted: this
 * list carried a camera `zoom` column until session 15, so it swept a candidate
 * for finiteness in a dimension no fighter reads. It was in a plain-JS script
 * until session 17, which is exactly where a stale column survives a type check.
 * `tests/ai-evaluation.test.mjs` marks each numeric leaf with a value of its own
 * and compares the two, so neither a forgotten field nor an invented one passes.
 */
export function intentNumbers(intent: Intent): number[] {
  return [intent.forward, intent.strafe, intent.turn,
    intent.posture.trunkLean, intent.posture.trunkTwist, intent.posture.crouch,
    ...(["primary", "secondary"] as const).flatMap((hand) => [intent[hand].pointerX, intent[hand].pointerY,
      intent[hand].roll, intent[hand].wristBend])];
}
const readPath = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((at, key) =>
  at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined, value);
export function intentFieldDeltas(before: unknown, after: unknown) {
  return INTENT_FIELDS.map((field) => {
    const oldValue = readPath(before, field); const newValue = readPath(after, field);
    const numeric = typeof oldValue === "number" && typeof newValue === "number";
    const delta = numeric ? newValue - oldValue : null;
    return { field, before: oldValue, after: newValue,
      delta,
      equal: numeric ? Math.abs(delta as number) <= 1e-12 : Object.is(oldValue, newValue) };
  });
}

/** Exact ordered parity; unlike a mean, opposite frame errors cannot cancel. */
export function intentSequencesEqual(before: readonly unknown[], after: readonly unknown[]): boolean {
  if (before.length !== after.length) return false;
  for (let sample = 0; sample < before.length; sample += 1) {
    for (const field of INTENT_FIELDS) {
      if (!Object.is(readPath(before[sample], field), readPath(after[sample], field))) return false;
    }
  }
  return true;
}

/**
 * A corpus probe may retire a once-capable forced option after capability loss.
 *
 * It is handed an `OptionName`, which is a movement *or* a hand action, and
 * those stopped being one thing when session 17 merged `combatOption` away: a
 * movement is `movementIntent` and has no capability to lose, a hand action is
 * `handActionOption` and has one. Splitting the two here is what keeps the probe
 * able to force either -- the alternative was a door that took movement names
 * into an arm skill, which is exactly what the merge closed.
 *
 * The refusal wording is load-bearing in both directions. `enter` retires on any
 * message beginning `option "<name>" requires `, so a hand action that becomes
 * impossible mid-bout degrades to `recover`, while one that was never possible
 * throws on the first step -- and `tests/learning.test.mjs` pins both.
 */
export function forcedOptionEvaluationMind(name: OptionName): Mind & { readonly selected: OptionName } {
  const movement = (MOVEMENT_NAMES as readonly string[]).includes(name);
  let option: CombatOption | null = null; let entered = false; let retired = false;
  const enter = (view: FighterView): void => {
    const requested = (retired ? "recover" : name) as HandActionName;
    // No effector can mean two different things -- no arm at all, or no arm
    // holding the right thing -- and the refusal has to say which. Naming the
    // preferred hand when the search comes back empty is what makes it say
    // `a bow in the primary hand` rather than something about a search.
    const effector = chooseEffector(view, requested) ?? "primary";
    try { option = handActionOption(requested, asMeasured(effector)); option.enter(view); if (!retired) entered = true; }
    catch (error) {
      const namedCapabilityLoss = error instanceof Error && error.message.startsWith(`option "${requested}" requires `);
      if (!entered || retired || !namedCapabilityLoss) throw error;
      retired = true; option = null;
    }
  };
  return { name: `option-${name}`, get selected() { return retired ? "recover" : name; }, decide(view, dt) {
    if (movement) return movementIntent(name, view);
    if (retired && !HANDS.some((hand) => view.self.hands[hand] && !view.self.hands[hand].lost)) return freshIntent();
    if (!option || option.done(view)) enter(view);
    // Losing every hand can make even recover unavailable. At that point the
    // probe has completed; an inert Intent records that fact without inventing
    // a replacement skill.
    return option ? option.decide(view, dt) : freshIntent();
  } };
}
import { freshIntent } from "../action-primitives.ts";
import { HANDS } from "../hands.ts";
import { MOVEMENT_NAMES, asMeasured, chooseEffector, handActionOption, movementIntent,
  type CombatOption, type HandActionName, type OptionName } from "../options.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
