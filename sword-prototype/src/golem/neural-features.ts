import type { FighterView } from "../mind.ts";
import {
  DUEL_OPTIONS, MY_PHASES, THEIR_PHASES, type DuelOption, type DuelReading,
} from "./duel-model.ts";
import { slotHealth, type TargetSlot } from "./tactics-v2.ts";

/**
 * What the neural contender sees: a fixed-width vector, a pure function of what the fencer
 * reads and publishes at an ask and of the view it was handed. Session 08 of the matchup set.
 *
 * The fencer's director hook (Session 06) is asked between exchanges with three things -- the
 * options open this step, the reading the duel model discretises, and the view -- and this
 * module turns those three into the columns a network reads. Nothing here is a capability of
 * the opponent's, and nothing is a module id: the frozen choices of Session 00 hold for a
 * network exactly as they hold for a hand-written mind, and a column that is not in
 * `BodyView`, `DuelReading` or the open-options list is not a column.
 *
 * **The columns are versioned by name.** `FEATURE_NAMES` is the order and `NEURAL_FEATURES_VERSION`
 * is bumped whenever a column is added, removed, moved or rescaled; the weights module carries
 * the version it was trained on and is refused when it differs, because a network reading a
 * column it was trained without is a network answering a different question with confidence.
 *
 * **Scale.** Every column is put on the order of one -- gaps in metres over a few metres,
 * rates in metres a second over two, fractions as they are, kinds and phases as one-hot --
 * so a first layer of weights of order one sees inputs of order one. Nothing is standardised
 * against a dataset, because a dataset is a thing this module must not depend on.
 */
export const NEURAL_FEATURES_VERSION = 1;

/** The weapon kinds a golem hand publishes, in one-hot order; a kind not listed lights no column. */
export const FEATURE_WEAPONS = ["sword", "club", "whip", "empty", "shield", "buckler"] as const;

const SLOTS: readonly TargetSlot[] = Object.freeze(["trunk", "head", "primary", "secondary", "locomotion"]);

/** Every column, by name, in the order the vector carries them. */
export const FEATURE_NAMES: readonly string[] = Object.freeze([
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
  ...DUEL_OPTIONS.map((option) => `open:${option}`),
]);

export const FEATURE_COUNT = FEATURE_NAMES.length;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const healthScratch: Record<TargetSlot, number> = { trunk: 0, head: 0, primary: 0, secondary: 0, locomotion: 0 };

/** A slot's least health as a column: the fraction, or zero for a slot the body has no part in. */
const healthColumn = (fraction: number): number => (fraction < 0 ? 0 : clamp(fraction, 0, 1));

/**
 * Fill `into` with the columns for this ask. `into` is the caller's, `FEATURE_COUNT` long, so
 * a director at eight hertz allocates nothing; the return is the same array.
 */
export function neuralFeatures(
  reading: DuelReading, available: readonly DuelOption[], view: FighterView, into: Float64Array,
): Float64Array {
  if (into.length !== FEATURE_COUNT) {
    throw new Error(`a feature vector is ${FEATURE_COUNT} wide; this one is ${into.length}`);
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
  for (const option of DUEL_OPTIONS) into[i++] = available.includes(option) ? 1 : 0;
  return into;
}
