import type { FighterView } from "../mind.ts";
import { MY_PHASES, THEIR_PHASES } from "./duel-model.ts";
import { FEATURE_WEAPONS } from "./neural-features.ts";
import { slotHealth, type TargetSlot } from "./tactics-v2.ts";
import { STYLE_OPTIONS, type StyleOption, type StyleReading } from "./tactics-v3.ts";

/**
 * What a learned director over the third executor sees: a fixed-width vector, a pure function of
 * what a style reads at an ask and of the view it was handed. Session 08 of the style set.
 *
 * ## What this is, against `src/golem/neural-features.ts`
 *
 * The same fifty-six columns, rebuilt: the reading is a `StyleReading` rather than a
 * `DuelReading`, the open block is over the fifteen `STYLE_OPTIONS` rather than the eight duel
 * ones, and six columns are added for the rhythm the new reading keeps. Everything else is the
 * older module's arithmetic to the digit, deliberately, so that a number from one can be read
 * against a number from the other -- and it is a separate module rather than a widening of that
 * one because `NEURAL_WEIGHTS` is a checked-in table of eight thousand numbers keyed to the
 * older width, and a module that grew a column would be refused on load, which is the refusal
 * working exactly as it should.
 *
 * ## What is not a column
 *
 * The thirteen things `StyleReading` adds over `DuelReading` -- `near`, `cooldown`,
 * `intercept`, `weakestSlot` and the rest -- are not columns, and that is on purpose rather
 * than an omission. Almost all of them are already in the open mask: `strike` is open exactly
 * when a hand is armed and the gap is inside the strike range, `parry` exactly when a spare
 * hand can cover and their point crosses the shell, `ram` exactly when a natural attack is in
 * range. A column that repeats a bit of the mask costs a weight and adds nothing, and the ones
 * that are not in the mask are the ones the *styles* were written to read, which a learner has
 * no business being handed for free. If Session 10's log says a region of the space is not
 * separable without one of them, that is the session that adds it and bumps the version.
 *
 * **The columns are versioned by name**, as the older module's are: `STYLE_FEATURE_NAMES` is the
 * order and `STYLE_FEATURES_VERSION` is bumped whenever a column is added, removed, moved or
 * rescaled; an artifact carries the version it was fitted on and is refused when it differs.
 *
 * **Scale.** Every column is on the order of one -- metres over a few metres, rates over two,
 * seconds over ten, fractions as they are, kinds and phases one-hot -- so a first layer of
 * weights of order one sees inputs of order one. Nothing is standardised against a dataset.
 */
export const STYLE_FEATURES_VERSION = 1;

const SLOTS: readonly TargetSlot[] = Object.freeze(["trunk", "head", "primary", "secondary", "locomotion"]);

/** Every column, by name, in the order the vector carries them. */
export const STYLE_FEATURE_NAMES: readonly string[] = Object.freeze([
  "bias",
  "gap", "gapOverStrike", "gapBeyondStrike", "gapRate", "iReach", "theyReach",
  "myReach", "theirReach", "reachEdge",
  ...FEATURE_WEAPONS.map((kind) => `myWeapon:${kind}`),
  ...FEATURE_WEAPONS.map((kind) => `theirWeapon:${kind}`),
  "myVitality", "theirVitality", "lead",
  ...SLOTS.map((slot) => `myHealth:${slot}`),
  ...SLOTS.map((slot) => `theirHealth:${slot}`),
  "theirTipSpeed", "myTipSpeed",
  ...THEIR_PHASES.map((phase) => `theirs:${phase}`),
  ...MY_PHASES.map((phase) => `mine:${phase}`),
  "pairedHands", "ramReady", "ramReach", "clock",
  "theirsSeconds", "mineSeconds", "theirCommits", "sinceTheirCommit", "sinceMyStroke", "sinceContact",
  ...STYLE_OPTIONS.map((option) => `open:${option}`),
]);

export const STYLE_FEATURE_COUNT = STYLE_FEATURE_NAMES.length;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A clock as a column: seconds over ten, and one for a thing that has not happened yet. */
const clockColumn = (seconds: number): number => (Number.isFinite(seconds) ? clamp(seconds / 10, 0, 1) : 1);

const healthScratch: Record<TargetSlot, number> = { trunk: 0, head: 0, primary: 0, secondary: 0, locomotion: 0 };

/** A slot's least health as a column: the fraction, or zero for a slot the body has no part in. */
const healthColumn = (fraction: number): number => (fraction < 0 ? 0 : clamp(fraction, 0, 1));

/**
 * Fill `into` with the columns for this ask. `into` is the caller's, `STYLE_FEATURE_COUNT` long,
 * so a director at eight hertz allocates nothing; the return is the same array.
 */
export function styleFeatures(
  reading: StyleReading, available: readonly StyleOption[], view: FighterView, into: Float64Array,
): Float64Array {
  if (into.length !== STYLE_FEATURE_COUNT) {
    throw new Error(`a style feature vector is ${STYLE_FEATURE_COUNT} wide; this one is ${into.length}`);
  }
  const self = view.self;
  const them = view.opponent;
  const theirReach = them.reach;
  const myReach = self.reach;
  let i = 0;
  into[i++] = 1;
  into[i++] = clamp(reading.gap / 3, 0, 2);
  into[i++] = clamp(reading.strike > 0 ? reading.gap / reading.strike : 2, 0, 3) - 1;
  into[i++] = clamp((reading.gap - reading.strike) / 2, -2, 2);
  into[i++] = clamp(reading.gapRate / 2, -2, 2);
  into[i++] = reading.gap <= reading.strike ? 1 : 0;
  into[i++] = reading.gap <= theirReach + reading.slack ? 1 : 0;
  into[i++] = clamp(myReach / 2, 0, 2);
  into[i++] = clamp(theirReach / 2, 0, 2);
  into[i++] = clamp((myReach - theirReach) / 0.5, -2, 2);
  for (const kind of FEATURE_WEAPONS) into[i++] = reading.myWeapon === kind ? 1 : 0;
  for (const kind of FEATURE_WEAPONS) into[i++] = reading.theirWeapon === kind ? 1 : 0;
  into[i++] = clamp(self.vitality, 0, 1);
  into[i++] = clamp(them.vitality, 0, 1);
  into[i++] = clamp(self.vitality - them.vitality, -1, 1);
  slotHealth(self.health, healthScratch);
  for (const slot of SLOTS) into[i++] = healthColumn(healthScratch[slot]);
  slotHealth(them.health, healthScratch);
  for (const slot of SLOTS) into[i++] = healthColumn(healthScratch[slot]);
  into[i++] = clamp(them.tipSpeed / 5, 0, 2);
  into[i++] = clamp(self.tipSpeed / 5, 0, 2);
  for (const phase of THEIR_PHASES) into[i++] = reading.theirs === phase ? 1 : 0;
  for (const phase of MY_PHASES) into[i++] = reading.mine === phase ? 1 : 0;
  into[i++] = self.capabilities?.pairedHands ? 1 : 0;
  let ramReady = 0;
  let ramReach = 0;
  for (const name of Object.keys(self.naturalAttacks)) {
    const attack = self.naturalAttacks[name];
    if (attack.ready) ramReady = 1;
    if (attack.reach > ramReach) ramReach = attack.reach;
  }
  into[i++] = ramReady;
  into[i++] = clamp(ramReach / 2, 0, 2);
  into[i++] = clamp(view.clock / 60, 0, 2);
  // The rhythm. Their commits are a rate rather than a count, so that a column read at four
  // seconds and one read at fifty say the same thing about the same opponent; the first tenth
  // of a second is floored away rather than dividing by nothing.
  into[i++] = clockColumn(reading.theirsSeconds);
  into[i++] = clockColumn(reading.mineSeconds);
  into[i++] = clamp(reading.theirCommits / Math.max(view.clock, 0.1) * 10, 0, 4);
  into[i++] = clockColumn(reading.sinceTheirCommit);
  into[i++] = clockColumn(reading.sinceMyStroke);
  into[i++] = clockColumn(reading.sinceContact);
  for (const option of STYLE_OPTIONS) into[i++] = available.includes(option) ? 1 : 0;
  return into;
}

/** The open options as a bitmask, in `STYLE_OPTIONS` order; fifteen bits of a sixteen-bit word. */
export function styleOpenMask(available: readonly StyleOption[]): number {
  let bits = 0;
  STYLE_OPTIONS.forEach((name, j) => { if (available.includes(name)) bits |= 1 << j; });
  return bits;
}

/** The mask read back: which options were open, in `STYLE_OPTIONS` order. */
export function styleOpenOf(bits: number): boolean[] {
  return STYLE_OPTIONS.map((_, j) => (bits >> j & 1) === 1);
}
