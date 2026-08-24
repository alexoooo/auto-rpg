export type EvaluationSplit = "train" | "validation" | "test";

/** Separate numeric regions make accidental leakage visible in the JSON. */
export const SEED_RANGES: Readonly<Record<EvaluationSplit, readonly [number, number]>> = Object.freeze({
  train: [0, 99_999],
  validation: [100_000, 199_999],
  test: [200_000, 299_999],
});
/** Exact maxima from 48 fresh-Havok legacy brackets on bases 20260823..20260826, fixed before held-out base 20260827. */
export const PARITY_LIMITS = Object.freeze({ damage: 0, seconds: 0, actionRate: 0 });
export const PARITY_CALIBRATION = Object.freeze({
  bases: Object.freeze([20260823, 20260824, 20260825, 20260826]), heldOutBase: 20260827,
  brackets: 48,
  observedLegacyRepeatMax: Object.freeze({ damage: 0, seconds: 0, actionRate: 0 }),
  method: "fresh Havok per bout; unscored warm-up, then legacy -> meta -> legacy-repeat for each seed, side and loadout",
});

export function seedRangesOverlap(ranges: Record<string, readonly [number, number]>): boolean {
  const entries = Object.values(ranges);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (Math.max(entries[i][0], entries[j][0]) <= Math.min(entries[i][1], entries[j][1])) return true;
    }
  }
  return false;
}

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
  "forward", "strafe", "turn", "driving",
  "posture.trunkLean", "posture.trunkTwist", "posture.crouch",
  ...["primary", "secondary"].flatMap((hand) => ["pointerX", "pointerY", "roll", "wristBend", "thrust", "guard"].map((field) => `${hand}.${field}`)),
]);
export const SYNTHETIC_FIELD_LIMITS = Object.freeze(Object.fromEntries(INTENT_FIELDS.map((field) =>
  [field, Object.freeze({ changedRate: 0.005, maxDelta: 0.01 })])));
export const SHOT_PARITY_LIMITS = Object.freeze({ duty: 0.01, edges: 1 });
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

/** A corpus probe may retire a once-capable forced option after capability loss. */
export function forcedOptionEvaluationMind(name: OptionName): Mind & { readonly selected: OptionName } {
  let option: CombatOption | null = null; let entered = false; let retired = false;
  const enter = (view: FighterView): void => {
    const requested = retired ? "recover" : name;
    try { option = combatOption(requested); option.enter(view); if (!retired) entered = true; }
    catch (error) {
      const namedCapabilityLoss = error instanceof Error && error.message.startsWith(`option "${requested}" requires `);
      if (!entered || retired || !namedCapabilityLoss) throw error;
      retired = true; option = null;
    }
  };
  return { name: `option-${name}`, get selected() { return retired ? "recover" : name; }, decide(view, dt) {
    if (retired && view.self.hands.primary.lost && view.self.hands.secondary.lost) return freshIntent();
    if (!option || option.done(view)) enter(view);
    // Losing every hand can make even recover unavailable. At that point the
    // probe has completed; an inert Intent records that fact without inventing
    // a replacement skill.
    return option ? option.decide(view, dt) : freshIntent();
  } };
}
import { freshIntent } from "../action-primitives.ts";
import { combatOption, type CombatOption, type OptionName } from "../options.ts";
import type { FighterView, Mind } from "../mind.ts";
