import type { FighterView } from "../mind.ts";
import { MY_PHASES, THEIR_PHASES } from "./duel-model.ts";
import { FEATURE_WEAPONS } from "./neural-features.ts";
import { slotHealth, type TargetSlot } from "./tactics-v2.ts";
import type { StyleReading } from "./tactics-v3.ts";
import type { StyleCommand } from "./tactics-v4.ts";

/**
 * The surface a mind drives the fourth executor through: what it reads, when it is asked, and
 * what a learned one is handed. Session 12 of the style set.
 *
 * ## What is different about being a pilot rather than a director
 *
 * A director over `tactics-v3.ts` names one of fifteen options, and the fifteen are a partition:
 * naming `cut` names a stand-off, a lean, a target and a reach all at once, at values a table
 * froze before the bout started. A pilot writes those numbers itself, every twelfth of a second,
 * and the executor does what it is told. Nothing here decides anything -- this module is the
 * vocabulary, the clock and the feature vector, and the tactics are in the pilot.
 *
 * ## Why the cadence is here and not in the executor
 *
 * Because it is the thing a mind is entitled to know about itself. `askCadence` is a clock and a
 * latch, and the executor holds one; a test that asks "twelve a second plus the events and not one
 * more" is asking about this object, and can ask it without standing a body up.
 */

// ---------------------------------------------------------------------------------- the cadence

/**
 * Asks a second, and the one number in this file chosen rather than derived.
 *
 * Three timescales in the body converge on about twenty asks a second and none of them supports
 * more: the phase read in `strokeReader` is low-passed at `readSeconds` 0.05, a plate crosses its
 * own guard shell in about 0.05 s at `CHAIN_REACH.anchorRate` 5 m/s, and the commit phase is
 * 0.22 s long. Twelve is inside all three with room, and it is the owner's choice among the rates
 * that are inside them: 20 Hz is affordable and 12 was named as sufficient, so the cheaper of the
 * two ships and the more expensive one is an override away.
 *
 * v3's `replanSeconds` is 0.167, which is six a second, and a mind that only names options can
 * afford that because an option runs itself. A mind that writes a strafe cannot: between asks the
 * last command is what drives the body, so the cadence is also the resolution of every continuous
 * axis on the surface.
 */
export const PILOT_HZ = 12;

/** A clock that says which steps are asks, and remembers how many there have been. */
export interface AskCadence {
  /** How many asks have been taken since this object was made. */
  readonly asks: number;
  /** How many of those were an event rather than the clock coming round. */
  readonly events: number;
  /** Seconds since the last ask, or infinity before the first. */
  readonly since: number;
  /**
   * Advance by `dt` and answer whether this step is an ask.
   *
   * The clock is advanced before the question is asked, so the first step of a bout is an ask
   * whatever `dt` is: `since` starts at infinity, which is the same latch `arm` sets.
   */
  step(dt: number, event: boolean): boolean;
  /** Make the next step an ask whatever the clock says. */
  arm(): void;
}

export function askCadence(hz: number = PILOT_HZ): AskCadence {
  const period = hz > 0 ? 1 / hz : Number.POSITIVE_INFINITY;
  let since = Number.POSITIVE_INFINITY;
  let asks = 0;
  let events = 0;
  return {
    get asks(): number { return asks; },
    get events(): number { return events; },
    get since(): number { return since; },
    arm(): void { since = Number.POSITIVE_INFINITY; },
    step(dt: number, event: boolean): boolean {
      since += dt;
      const due = since >= period;
      if (!due && !event) return false;
      if (!due) events += 1;
      since = 0;
      asks += 1;
      return true;
    },
  };
}

// ------------------------------------------------------------------------------- what it reads

/**
 * What a pilot reads: everything a director over v3 read, and six things it did not need.
 *
 * The six are all quantities v3's *options* used to carry and a command surface does not.
 * `circleSide` and `voidAxis` are the two side geometries a `circle` and a `void` bundled -- a
 * mind that writes a strafe has to know which way is round them and which way is off the line, and
 * both are pure functions of the published view, so publishing them hands a mind nothing it could
 * not have computed and saves it from computing it four different ways. `weakestHeight` and
 * `weakestLateral` are `weakestSlot` in the command's own coordinates, for the same reason: a slot
 * name is no use to something that writes a point. `myReach` is what the acting hand publishes,
 * which matters because the stand-off is a fraction of the *other* body's; `armed` is the cooldown
 * and the hand's ability read as the one bit a gate cares about.
 */
export interface PilotReading extends StyleReading {
  /** The acting hand's published reach, metres. `theirReach` is the other body's. */
  myReach: number;
  /** Whether a stroke could be started this step at all: the cooldown is out and a hand can. */
  armed: boolean;
  /** My strafe axis toward the side their armed hand is not on: +1 right, -1 left. */
  circleSide: number;
  /** My strafe axis off the line their point is travelling on, -1 to +1. */
  voidAxis: number;
  /** `weakestSlot` as a target command: height up their body, and across it. */
  weakestHeight: number;
  weakestLateral: number;
}

/** A pilot writes the whole command every ask; the executor holds it until the next one. */
export type Pilot = (reading: PilotReading, view: FighterView) => StyleCommand;

/** A hook around a pilot, of the same shape plus what it answered: how a command log is taken. */
export type PilotHook = (reading: PilotReading, view: FighterView, command: StyleCommand) => void;

/**
 * A hook wrapped around a pilot, so a log can be taken of what was read and written.
 *
 * `watchedDirector` in `tactics-v3.ts` is the same seam for the same reason: the reading and the
 * command are what a per-decision reward needs, and the executor does not have to know that
 * anybody is writing them down. The command handed to the hook is the pilot's own object, before
 * the executor has clamped anything, so a log records what was *asked for* -- the refusal counts
 * on the executor are what say how much of it was legal.
 */
export function watchedPilot(pilot: Pilot, onAsk: PilotHook): Pilot {
  return (reading, view) => {
    const command = pilot(reading, view);
    onAsk(reading, view, command);
    return command;
  };
}

// ---------------------------------------------------------------------------------- the columns

/**
 * What a learned pilot sees: a fixed-width vector, a pure function of the reading and the view.
 *
 * ## Against `src/golem/style-features.ts`
 *
 * The first forty-nine columns are that module's first forty-nine to the digit, deliberately, so
 * that a number taken from one may be read against a number taken from the other. What differs is
 * the tail. A director's tail is a fifteen-bit open mask, because the only thing it may say is a
 * name and the mask says which names are legal; a pilot has no mask at all -- every axis is always
 * legal and out of range is clamped -- so the fifteen bits are replaced by the seventeen numbers
 * that used to sit *behind* the mask. `cooldown` is why `strike` used to be closed; `intercept` is
 * why `parry` used to be open; `near` and `hold` are the two distances the range gates were.
 *
 * That is the trade this session makes, written as columns: fifteen bits saying which of fifteen
 * bundles were legal, against seventeen numbers saying what the body actually is.
 *
 * **Versioned by name.** `PILOT_FEATURE_NAMES` is the order and `PILOT_FEATURES_VERSION` is bumped
 * whenever a column is added, removed, moved or rescaled; an artifact carries the version it was
 * fitted on and is refused when it differs. **Scale**: every column is on the order of one.
 */
export const PILOT_FEATURES_VERSION = 1;

const SLOTS: readonly TargetSlot[] = Object.freeze(["trunk", "head", "primary", "secondary", "locomotion"]);

export const PILOT_FEATURE_NAMES: readonly string[] = Object.freeze([
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
  // The tail: the seventeen numbers the open mask used to stand for.
  "near", "hold", "cooldown", "armed", "spareCanCover", "headfirst", "inside", "longer", "shorter",
  "interceptOpen", "interceptTime", "interceptDistance", "interceptWall",
  "circleSide", "voidAxis", "weakestHeight", "weakestLateral",
]);

export const PILOT_FEATURE_COUNT = PILOT_FEATURE_NAMES.length;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A clock as a column: seconds over ten, and one for a thing that has not happened yet. */
const clockColumn = (seconds: number): number => (Number.isFinite(seconds) ? clamp(seconds / 10, 0, 1) : 1);

const healthScratch: Record<TargetSlot, number> = { trunk: 0, head: 0, primary: 0, secondary: 0, locomotion: 0 };

/** A slot's least health as a column: the fraction, or zero for a slot the body has no part in. */
const healthColumn = (fraction: number): number => (fraction < 0 ? 0 : clamp(fraction, 0, 1));

/**
 * Fill `into` with the columns for this ask. `into` is the caller's, `PILOT_FEATURE_COUNT` long,
 * so a pilot at twelve hertz allocates nothing; the return is the same array.
 */
export function pilotFeatures(
  reading: PilotReading, view: FighterView, into: Float64Array,
): Float64Array {
  if (into.length !== PILOT_FEATURE_COUNT) {
    throw new Error(`a pilot feature vector is ${PILOT_FEATURE_COUNT} wide; this one is ${into.length}`);
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
  into[i++] = clockColumn(reading.theirsSeconds);
  into[i++] = clockColumn(reading.mineSeconds);
  into[i++] = clamp(reading.theirCommits / Math.max(view.clock, 0.1) * 10, 0, 4);
  into[i++] = clockColumn(reading.sinceTheirCommit);
  into[i++] = clockColumn(reading.sinceMyStroke);
  into[i++] = clockColumn(reading.sinceContact);
  // The tail. `cooldown` is on its own scale rather than `clockColumn`'s: it is never more than a
  // second, and a column that spent its whole range inside the first tenth is a wasted weight.
  into[i++] = clamp(reading.near / 3, 0, 2);
  into[i++] = clamp(reading.hold / 3, 0, 2);
  into[i++] = clamp(reading.cooldown, 0, 1);
  into[i++] = reading.armed ? 1 : 0;
  into[i++] = reading.spareCanCover ? 1 : 0;
  into[i++] = reading.headfirst ? 1 : 0;
  into[i++] = reading.inside ? 1 : 0;
  into[i++] = reading.longer ? 1 : 0;
  into[i++] = reading.shorter ? 1 : 0;
  const intercept = reading.intercept;
  into[i++] = intercept === null ? 0 : 1;
  into[i++] = intercept === null ? 1 : clamp(intercept.t, 0, 1);
  into[i++] = intercept === null ? 0 : clamp(intercept.distance / 2, 0, 2);
  into[i++] = intercept !== null && intercept.wall ? 1 : 0;
  into[i++] = clamp(reading.circleSide, -1, 1);
  into[i++] = clamp(reading.voidAxis, -1, 1);
  into[i++] = clamp(reading.weakestHeight, 0, 1);
  into[i++] = clamp(reading.weakestLateral, -1, 1);
  return into;
}
