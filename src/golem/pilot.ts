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
 * fitted on and is refused when its version is one this build cannot read. **Scale**: every column
 * is on the order of one.
 *
 * ## Version 2, and why two versions are readable at once
 *
 * Session 09 of the learn set adds nine columns and does **not** retire the seventy-one. The
 * shipped table in `policy-weights.ts` is a version-1 table, `POLICY_LAYOUT` is 71 wide, and an
 * arm that widens the observation is an *arm* -- one of ten, run against a control on the same
 * night -- rather than a decision. So this constant is the highest version this build publishes and
 * `PILOT_FEATURE_VERSIONS_READ` is what it will load; `pilotFeatureCount` and `pilotFeatureNames`
 * take the version, and `PILOT_FEATURE_COUNT` keeps meaning version 1's width, which is what every
 * caller written before this session meant by it.
 *
 * A version is refused rather than inferred from a width for the usual reason: two versions that
 * happened to be the same width would load each other's weights and fight at the wrong distance.
 */
export const PILOT_FEATURES_VERSION = 2;

/** Every observation version this build can drive a mind under. Ordered, oldest first. */
export const PILOT_FEATURE_VERSIONS_READ: readonly number[] = Object.freeze([1, 2]);

/**
 * The version a fit takes unless it is asked for another, which is version 1 and not the newest.
 *
 * Deliberate. Version 2 arrived as an *arm* of Session 09 and not as a replacement: the shipped
 * mind reads version 1, the control of that sweep has to read what the shipped mind reads, and a
 * default that quietly moved would have made every arm in the manifest a two-change arm.
 */
export const PILOT_FEATURES_DEFAULT = 1;

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

// ------------------------------------------------------------------- the trace, version 2 only

/**
 * The three quantities version 2 remembers, and why these three and not any others.
 *
 * A pilot is asked twelve times a second and told nothing about the eleven asks before this one.
 * Every column above is an instantaneous reading, so a mind cannot tell a gap of 1.4 m that has
 * been 1.4 m for a second from one that was 2.2 m a quarter of a second ago, and cannot tell an
 * opponent whose point is *accelerating* from one holding a speed. Those are the two facts a fight
 * is made of, and the cheap version of a recurrent head is to hand them over as exponential traces
 * rather than to give the network a memory of its own.
 *
 * The three are the *closing* geometry and nothing else: `gap`, its rate, and their tip speed.
 * Health, phase and weapon class are already slow-moving or one-hot, and a trace of a one-hot is a
 * fraction of the last few asks it was set -- a quantity with a meaning, but not one this session
 * has an argument for. Three columns bought at a cost of nine is the trade; nine bought at a cost
 * of fifty-one is a different session.
 */
export const PILOT_TRACE_COLUMNS: readonly string[] = Object.freeze(["gap", "gapRate", "theirTipSpeed"]);

/**
 * The three decays, which are the plan's "last four readings" written as a half-life each side of it.
 *
 * An exponential trace `t <- t + (1 - d)(x - t)` has a mean memory of `1 / (1 - d)` asks, so these
 * are **two, four and eight** asks -- a sixth of a second, a third, and two thirds. Four is the
 * number the plan names and the other two are there because the right window is not known: a mind
 * that wants the instant already has the raw column beside it, and one that wants a whole exchange
 * has the clock columns. What is missing is the middle, and the honest way to supply a middle whose
 * width nobody has measured is to supply three and let the weights choose.
 *
 * Fixed rather than fitted, and stated here rather than on the table: a decay that moved between
 * two runs would make two tables incomparable in a way no version could catch, because the columns
 * would still be nine and still be called the same thing.
 */
export const PILOT_TRACE_DECAYS: readonly number[] = Object.freeze([0.5, 0.75, 0.875]);

/** The nine names version 2 appends, quantity-major so that a reader can find one by eye. */
export const PILOT_TRACE_NAMES: readonly string[] = Object.freeze(
  PILOT_TRACE_COLUMNS.flatMap((column) => PILOT_TRACE_DECAYS.map((decay) => `trace:${column}@${decay}`)),
);

/** Version 2's order: version 1's seventy-one, unmoved, then the nine. */
export const PILOT_FEATURE_NAMES_V2: readonly string[] = Object.freeze(
  [...PILOT_FEATURE_NAMES, ...PILOT_TRACE_NAMES],
);

export const PILOT_FEATURE_COUNT_V2 = PILOT_FEATURE_NAMES_V2.length;

/** The column order of an observation version, by name. Refuses a version this build cannot read. */
export function pilotFeatureNames(version: number = PILOT_FEATURES_VERSION): readonly string[] {
  if (version === 1) return PILOT_FEATURE_NAMES;
  if (version === 2) return PILOT_FEATURE_NAMES_V2;
  throw new Error(`pilot feature version ${version} is not one this build publishes; `
    + `it reads ${PILOT_FEATURE_VERSIONS_READ.join(" and ")}`);
}

/** How wide an observation version is. The one number a layout and a normalisation are checked on. */
export function pilotFeatureCount(version: number = PILOT_FEATURES_VERSION): number {
  return pilotFeatureNames(version).length;
}

/**
 * The nine numbers a version-2 observation carries between asks, and the object that owns them.
 *
 * **State, in a file whose whole promise was that a feature vector is a pure function of the
 * reading.** That promise is not being broken quietly: a trace is by construction a function of
 * more than one ask, so version 2's columns are a function of the reading *and of this object*, and
 * the object is per-mind and per-bout. `golemPolicy` makes one and hands the same one to every ask,
 * which is what makes a bout under a seed the bout; a caller that made a fresh trace each ask would
 * get nine copies of the raw column and no error anywhere, which is why `step` seeds itself on its
 * first call and `primed` says out loud whether it has been called.
 *
 * **The first ask is the reading and not a fraction of it.** A trace initialised at zero would
 * spend its first eight asks climbing out of a transient that is a fact about the trace rather than
 * about the fight, and at twelve hertz that is two thirds of a second of every bout. So the first
 * call sets all three decays to the reading itself, and the difference between the columns after
 * that is the difference the trace exists to publish.
 */
export interface PilotTrace {
  /** The nine, in `PILOT_TRACE_NAMES` order. The caller reads and does not write. */
  readonly values: Float64Array;
  /** Whether `step` has been called, which is what tells a first ask from a later one. */
  readonly primed: boolean;
  /** Advance every decay by this ask's reading, and return the nine. */
  step(reading: PilotReading, view: FighterView): Float64Array;
  /** Forget everything, which is what the start of a bout is. */
  reset(): void;
}

export function pilotTrace(): PilotTrace {
  const values = new Float64Array(PILOT_TRACE_NAMES.length);
  const now = new Float64Array(PILOT_TRACE_COLUMNS.length);
  let primed = false;
  return {
    values,
    get primed(): boolean { return primed; },
    reset(): void { values.fill(0); primed = false; },
    step(reading: PilotReading, view: FighterView): Float64Array {
      // The same three scalings the raw columns use, so a trace and its own instantaneous column
      // are on one scale and a weight that differences them is differencing like with like.
      now[0] = clamp(reading.gap / 3, 0, 2);
      now[1] = clamp(reading.gapRate / 2, -2, 2);
      now[2] = clamp(view.opponent.tipSpeed / 5, 0, 2);
      let at = 0;
      for (let q = 0; q < PILOT_TRACE_COLUMNS.length; q += 1) {
        for (let d = 0; d < PILOT_TRACE_DECAYS.length; d += 1, at += 1) {
          values[at] = primed
            ? values[at] + (1 - PILOT_TRACE_DECAYS[d]) * (now[q] - values[at])
            : now[q];
        }
      }
      primed = true;
      return values;
    },
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A clock as a column: seconds over ten, and one for a thing that has not happened yet. */
const clockColumn = (seconds: number): number => (Number.isFinite(seconds) ? clamp(seconds / 10, 0, 1) : 1);

const healthScratch: Record<TargetSlot, number> = { trunk: 0, head: 0, primary: 0, secondary: 0, locomotion: 0 };

/** A slot's least health as a column: the fraction, or zero for a slot the body has no part in. */
const healthColumn = (fraction: number): number => (fraction < 0 ? 0 : clamp(fraction, 0, 1));

/**
 * Fill `into` with the columns for this ask. `into` is the caller's, so a pilot at twelve hertz
 * allocates nothing; the return is the same array.
 *
 * **The width chooses the version, and the version chooses whether a trace is wanted.** `into` is
 * either `PILOT_FEATURE_COUNT` long, which is version 1 and is what every caller written before
 * Session 09 of the learn set hands over, or `PILOT_FEATURE_COUNT_V2` long, which is version 2 and
 * needs the caller's own `PilotTrace` -- the nine trailing columns are a function of the asks
 * before this one and there is nowhere else for them to live. A version-2 width with no trace is
 * refused by name rather than filled with zeros, because zeros are what a trace looks like at the
 * start of every bout and a silently traceless run would read as a fit that learned nothing from
 * nine columns it never had.
 */
export function pilotFeatures(
  reading: PilotReading, view: FighterView, into: Float64Array, trace: PilotTrace | null = null,
): Float64Array {
  const wide = into.length === PILOT_FEATURE_COUNT_V2;
  if (!wide && into.length !== PILOT_FEATURE_COUNT) {
    throw new Error(`a pilot feature vector is ${PILOT_FEATURE_COUNT} wide at version 1 and `
      + `${PILOT_FEATURE_COUNT_V2} at version 2; this one is ${into.length}`);
  }
  if (wide && trace === null) {
    throw new Error(`a ${PILOT_FEATURE_COUNT_V2}-wide observation is version 2 and its last `
      + `${PILOT_TRACE_NAMES.length} columns are a trace; pass the mind's own pilotTrace()`);
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
  // The tail of the tail: version 2's nine, advanced once an ask and appended in place.
  if (wide && trace !== null) {
    const traced = trace.step(reading, view);
    for (let k = 0; k < traced.length; k += 1) into[i++] = traced[k];
  }
  return into;
}
