import type { MotorUnmet } from "../../control/motor.ts";
import { paceToward, stanceEnvelopeOf } from "../../control/stance-envelope.ts";
import type { StancePhase } from "../../control/stance.ts";
import { hypot } from "../../math/real.ts";
import type { Rulebook } from "../../rules/rulebook.ts";
import type { LegsUnmet } from "../../skills/skill.ts";
import { rangeOf } from "../../skills/strike.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Cover } from "../intent.ts";
import type { Orders } from "../orders.ts";
import { profilesOn, readProfile, sameReaction, type Profile, type ProfileReading } from "../profile.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { READINGS, threatReader, type ThreatView } from "../threat.ts";
import type { DownModel } from "./down.ts";
import type { Situation } from "./option.ts";
import { blowLife, record } from "./value.ts";

/**
 * What every percept reads from, once a step: the body's sight and spec, the world's rate (Hz), the
 * measured profiles of its own strikes and of every striker's, its orders, the foe it fights (its focus,
 * `situationReader`), the blow predicted to reach its head and the threat reader that predicted it,
 * and how its ways up from the ground are priced (`DownModel`).
 */
export interface Seen {
  readonly sight: Sight;
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow built by hand (`blowLife`). */
  readonly rules: Rulebook;
  readonly strikes: readonly Profile[];
  /** Every striker's measured strikes (`dataOf("strike-profiles")`), which model a foe's (`foeModel`). */
  readonly measured: readonly Profile[];
  readonly orders: Orders | null;
  readonly focus: BodySense | null;
  readonly blow: ReturnType<Threats["blowOf"]>;
  readonly threats: Threats;
  readonly downs: readonly DownModel[];
}

type Threats = ReturnType<typeof threatReader>;

/**
 * **A percept**: one named reading of what the body senses, read once a step (`situationReader`).
 * Its cue, where it has one, is what of it a chooser watches (`eventOf`): a change in the cue is an
 * event, on which the chooser decides at once.
 */
export interface Percept<V> {
  read(seen: Seen): V;
  cue?(value: V): unknown;
}

/** Head to head across the ground to the focus, m; and the most at which its hands reach this body's head and this body's reach its. */
export interface Reach { readonly apart: number; readonly theirs: number; readonly mine: number }

/**
 * By hand, where no strike models the foe (`foeModel`), the owner's decisions: the chance a foe's
 * blow predicted to reach the head lands; and how many blows a second a standing foe throws within
 * its reach, of which as many land as of the body's own (`record`): two bodies trading blows land
 * alike.
 */
const LANDS = .3, RATE = 1;

/** Which feet the ground bears (`StanceReading.touching`): both, one, or none. */
type Bearing = "both" | "left" | "right" | "none";

/** The feet `touching` says the ground bears. */
const bearingOf = (touching: Readonly<Record<Side, boolean>>): Bearing =>
  touching.left ? touching.right ? "both" : "left" : touching.right ? "right" : "none";

/**
 * **What a foe's body is doing**, read from what is sensed of it: striking, a blow of its predicted
 * to reach the head (`READINGS.predicted`); down by its spec's rule (`BodySense.down`), and rising,
 * down with its centre of mass going up faster than `RISING`; else clear.
 */
type FoePhase = "striking" | "down" | "rising" | "clear";

/** How fast a fallen body's centre of mass goes up for it to read as rising, m/s. */
const RISING = 0.2;

/** The phase (`FoePhase`) of `focus`, `blow` the blow predicted to reach the head; clear with no focus. */
function foePhase(focus: BodySense | null, blow: Seen["blow"]): FoePhase {
  if (!focus) return "clear";
  if (focus.down) return focus.velocity.y > RISING ? "rising" : "down";
  return blow?.foe.id === focus.id ? "striking" : "clear";
}

/**
 * **The `phase` percept of a body that senses as `view` does, its focus the body `focus` names**
 * (`foePhase`, the blow predicted as the situation predicts it, `READINGS.predicted`): the rule a
 * reader outside the mind reads it by, a drill's record of where its strike began.
 */
export function sensedPhase(view: ThreatView, focus: string): FoePhase {
  return foePhase(view.senses.others.find((other) => other.id === focus) ?? null, threatReader().blowOf(view, READINGS.predicted));
}

/** Whether `spec` has both hands to strike with: what the reach readings measure. */
const twoHanded = (spec: BodySpec): boolean => ["hand.left", "hand.right"].every((hand) => spec.effectors?.some((effector) => effector.segment === hand) ?? false);

/** How far a hand of `striker` reaches a head `up` m over its own, m head to head across the ground: its range's outer bound. */
const outer = (striker: BodySpec, up: number): number => { const range = rangeOf(striker, "right", up); return range.reach + range.along[1]; };

/** Each spec's fastest walk forward measured on its body, m/s, found once: a spec is immutable, and so is what is read from it; null where none was measured. */
const PACES = new WeakMap<BodySpec, number | null>();

/** The fastest walk forward `spec`'s body was measured to hold (`stanceEnvelopeOf`, `paceToward`), m/s; null where none was measured. */
function paceOf(spec: BodySpec): number | null {
  if (PACES.has(spec)) return PACES.get(spec)!;
  const envelope = stanceEnvelopeOf(spec), pace = envelope ? paceToward(envelope, 1, 0) : null;
  PACES.set(spec, pace);
  return pace;
}

/** The life the heavier of `striker`'s two hands' blows takes from `struck`'s head, by `rules` (`blowLife`). */
const heavier = (rules: Rulebook, striker: BodySpec, struck: BodySpec): number => Math.max(blowLife(rules, striker, "left", struck), blowLife(rules, striker, "right", struck));

/** How late the senses show the focus, s: the senses' time less the focus's; null with no focus, or one sensed without its time. */
const reactionOf = ({ focus, sight }: Seen): number | null => focus?.time === undefined ? null : sight.view.senses.time - focus.time;

/**
 * **How far the focus walks in the time the senses show it late**, m: at its fastest walk forward
 * measured on its body, else at this body's own (`paceOf`, `Sight.envelope`), as a foe with no
 * model of its own is modelled as this body is; 0 with no focus, no reaction time or no walk
 * measured.
 */
function closesOf(seen: Seen): number {
  const { focus, sight } = seen, reaction = reactionOf(seen);
  if (!focus || reaction === null) return 0;
  const pace = paceOf(focus.spec) ?? (sight.envelope ? paceToward(sight.envelope, 1, 0) : 0);
  return pace * reaction;
}

/** Strikes a body is modelled by, each read for its striker (`readProfile`), and how they are priced, a sentence. */
interface Model { readonly readings: readonly ProfileReading[]; readonly priced: string }

/**
 * **The strikes a foe of `foe` is modelled by**: those a drill measured on its body (`profilesOn`),
 * else this body's own (`Seen.strikes`), each fresh at the senses' reaction time; none where
 * neither is, and why.
 */
function foeModel(seen: Seen, foe: BodySpec): Model {
  const measured = profilesOn(seen.measured, foe, seen.hz, reactionOf(seen));
  if (measured.fresh.length) return { readings: measured.fresh.map((profile) => readProfile(profile, foe)), priced: "measured" };
  const own = ownModel(seen);
  return own.readings.length ? { readings: own.readings.map((reading) => readProfile(reading.profile, foe)), priced: `as its own strikes: ${measured.stale}` } : { readings: [], priced: `by hand, ${measured.stale}` };
}

/** **This body's own strikes** (`Seen.strikes`), those fresh at the senses' reaction time. */
function ownModel(seen: Seen): Model {
  const reaction = reactionOf(seen);
  const fresh = seen.strikes.filter((profile) => sameReaction(profile.measured.reaction, reaction, seen.hz));
  return fresh.length ? { readings: fresh.map((profile) => readProfile(profile, seen.spec)), priced: "measured" }
    : { readings: [], priced: seen.strikes.length ? `by hand, measured with senses ${seen.strikes[0]!.measured.reaction} s late, read ${reaction} s late` : "by hand, no drill measured its strikes" };
}

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/**
 * **What one standing body's strikes are expected to deal another**: the strikes it is modelled by
 * (`model`, each read through its profile, `ProfileReading`), read at the struck body's phase
 * (`phase`) and in its life (`struck`), the most of them a second at any range (`peak`, the struck
 * body's life); with no model, built by hand within the striker's reach (`peak` its blows a second,
 * `RATE`, landing as this body's own do, `record`, each its heavier hand's); and how it is priced
 * (`priced`, a sentence). The focus's on this body (`pressure`), and this body's on the focus
 * (`pressing`); none with no standing focus.
 */
export interface Pressure {
  readonly model: readonly ProfileReading[];
  readonly phase: string;
  readonly struck: BodySpec | null;
  readonly peak: number;
  readonly priced: string;
}

/** No pressure: no standing focus. */
const NO_PRESSURE: Pressure = deepFreeze({ model: [], phase: "clear", struck: null, peak: 0, priced: "no standing focus" });

/** **The pressure** (`Pressure`) of strikes `model` on a body of `struck` in `phase`; `byHand` its peak with no model. */
function pressureBy(model: Model, phase: string, struck: BodySpec, byHand: () => number): Pressure {
  const { readings, priced } = model;
  if (readings.length === 0) return { model: readings, phase, struck, peak: byHand(), priced };
  let peak = 0;
  for (const reading of readings) peak = Math.max(peak, reading.peak(phase, struck));
  return { model: readings, phase, struck, peak, priced };
}

/** **The pressure** (`Pressure`) a standing focus puts on the body. */
function pressureOf(seen: Seen): Pressure {
  const { focus, sight, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(foeModel(seen, focus.spec), ownPhase(seen), spec,
    () => RATE * record(sight.report.ledger, null).lands * heavier(seen.rules, focus.spec, spec));
}

/** **The pressure** (`Pressure`) the body's own strikes put on a standing focus: its measured strikes (`Seen.strikes`) fresh at the senses' reaction time, read at the focus's phase (`FoePhase`). */
function pressingOf(seen: Seen): Pressure {
  const { focus, sight, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(ownModel(seen), foePhase(focus, seen.blow), focus.spec,
    () => RATE * record(sight.report.ledger, null).lands * heavier(seen.rules, spec, focus.spec));
}

/**
 * **The life `seconds` s at `range` m apart, centre to centre, are expected to cost the struck
 * body** under `pressure`: modelled, the most of its strikes, each what its profile expects there
 * within its reach (`ProfileReading.expect`) a second; built by hand, its peak at any range (its
 * caller keeps to the striker's reach, `dealtAt`).
 */
export function pressureAt(pressure: Pressure, range: number, seconds: number): number {
  if (pressure.model.length === 0) return pressure.peak * seconds;
  let rate = 0;
  for (const reading of pressure.model) {
    const expected = reading.expect({ range, phase: pressure.phase }, pressure.struck);
    if (expected) rate = Math.max(rate, expected.dealt / expected.seconds);
  }
  return rate * seconds;
}

/**
 * **The life `seconds` s cost the struck body under `pressure`** with the two `apart` m head to
 * head: modelled, at the range centre to centre that leaves (`pressureAt`); built by hand, only
 * within the striker's `reach`, m head to head.
 */
export const dealtAt = (pressure: Pressure, now: Situation, apart: number, reach: number, seconds: number): number =>
  pressure.model.length ? pressureAt(pressure, now.apart + apart - now.reach.apart, seconds) : apart <= reach ? pressureAt(pressure, 0, seconds) : 0;

/** **The own life `seconds` s cost under the focus's pressure** (`Pressure`, `dealtAt`), standing `apart` m from it head to head. */
export const threatened = (now: Situation, seconds: number, apart = now.reach.apart): number => dealtAt(now.pressure, now, apart, now.reach.theirs, seconds);

/**
 * **The own life `blow` is expected to take**: modelled (`foeModel`, its striker's), the most its
 * strikes are expected to take at the striker's range and this body's phase, to their reach (a blow
 * predicted to reach the head is in reach); else built by hand, its energy at the speed it closes,
 * landing as often as `LANDS`. 0 with none: the blow coming's (`danger`), and the one closing on
 * the head's (`menace`).
 */
function lifeOf(seen: Seen, blow: Seen["blow"]): number {
  const { spec, sight } = seen;
  if (!blow) return 0;
  const model = foeModel(seen, blow.foe.spec).readings;
  if (model.length === 0) return LANDS * blowLife(seen.rules, blow.foe.spec, blow.hand, spec, blow.closing);
  const centre = sight.view.stance.centre, range = hypot(blow.foe.centre.x - centre.x, blow.foe.centre.z - centre.z), phase = ownPhase(seen);
  let most = 0;
  for (const reading of model) most = Math.max(most, reading.expect({ range: Math.min(range, reading.reach(phase)), phase }, spec)?.dealt ?? 0);
  return most;
}

/**
 * **What a fall is expected to cost**, own life: the blows of a foe standing over the body while it
 * is down, at the most they deal (`Pressure.peak`): the focus's, down or not, and with none one of
 * its own kind; over the cheapest of its ways up that stands (its time down, less the share of
 * blows it keeps off, over its chance of standing); all the life it has where none stands. A fall
 * costs something with no foe standing, so that down, a way up is worth more than lying still.
 */
function downCostOf(seen: Seen): number {
  const { focus, sight, spec } = seen, foe = focus?.spec ?? spec;
  const peak = pressureBy(foeModel(seen, foe), ownPhase(seen), spec, () => RATE * record(sight.report.ledger, null).lands * heavier(seen.rules, foe, spec)).peak;
  let least = seen.sight.view.senses.life;
  for (const down of seen.downs) if (down.stands > 0) least = Math.min(least, peak * down.seconds * (1 - down.shelter) / down.stands);
  return least;
}

/**
 * **Every percept the options fighter reads**, by name, in the order they are read: whether the
 * body is down; its orders; its focus; how far off the focus is, centre to centre across the
 * ground (Infinity with none); a foe's blow closing on the head (`READINGS.threat`) and one
 * predicted to reach it (`READINGS.predicted`); the own life that blow is expected to take
 * (`lifeOf`), 0 with none, and the one closing on it; the reach head to head (`Reach`:
 * Infinity and noughts with no focus); what a standing focus is expected to deal the body
 * (`Pressure`), and what its own strikes are expected to deal the focus (`pressingOf`); what a fall
 * would cost (`downCostOf`), own life; how late the
 * senses show the focus (`reactionOf`), s, and how far it walks in that time (`closesOf`), m; the lead (its own life less the focus's, 0 with none)
 * and the time left before the clock's verdict (`Senses.ends`, Infinity where none ends it), s;
 * and the focus's life a blow of each hand at its head takes by the rules (`blowLife`), 0 with no
 * focus. The gait's: where the stance is in a step (`StanceReading.phase`),
 * which feet the ground bears (`Bearing`) and the centre of mass's speed over the ground, m/s. What
 * the controllers did not carry out: the legs' (`SkillReport.legs`) and the motor's
 * (`BodyView.unmet`). The focus's phase (`FoePhase`), and the time to contact of the blow it
 * strikes with, s (Infinity with none). Its cues: going down or getting up, other orders, another
 * focus, a threat or a blow coming.
 */
export const PERCEPTS = Object.freeze({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down } as Percept<boolean>,
  orders: { read: (seen) => seen.orders, cue: (orders) => orders } as Percept<Orders | null>,
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null } as Percept<BodySense | null>,
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity } as Percept<number>,
  threat: { read: (seen) => seen.threats.threatOf(seen.sight.view, READINGS.threat), cue: (threat) => threat !== null } as Percept<Cover | null>,
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null } as Percept<Cover | null>,
  danger: { read: (seen) => lifeOf(seen, seen.blow) } as Percept<number>,
  menace: { read: (seen) => lifeOf(seen, seen.threats.blowOf(seen.sight.view, READINGS.threat)) } as Percept<number>,
  reach: { read: ({ focus, sight, spec }): Reach => {
    if (!focus) return { apart: Infinity, theirs: 0, mine: 0 };
    const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
    return { apart: hypot(theirs.x - mine.x, theirs.z - mine.z), theirs: twoHanded(focus.spec) ? outer(focus.spec, mine.y - theirs.y) : 0,
      mine: twoHanded(spec) ? outer(spec, theirs.y - mine.y) : 0 };
  } } as Percept<Reach>,
  pressure: { read: pressureOf } as Percept<Pressure>,
  pressing: { read: pressingOf } as Percept<Pressure>,
  downCost: { read: downCostOf } as Percept<number>,
  reaction: { read: reactionOf } as Percept<number | null>,
  closes: { read: closesOf } as Percept<number>,
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 } as Percept<number>,
  left: { read: ({ sight }) => (sight.view.senses.ends ?? Infinity) - sight.view.senses.time } as Percept<number>,
  blows: { read: ({ focus, spec, rules }): Readonly<Record<Side, number>> => ({ left: focus ? blowLife(rules, spec, "left", focus.spec) : 0,
    right: focus ? blowLife(rules, spec, "right", focus.spec) : 0 }) } as Percept<Readonly<Record<Side, number>>>,
  stride: { read: ({ sight }) => sight.view.stance.phase } as Percept<StancePhase>,
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.touching) } as Percept<Bearing>,
  speed: { read: ({ sight }) => hypot(sight.view.stance.velocity.x, sight.view.stance.velocity.z) } as Percept<number>,
  legsUnmet: { read: ({ sight }) => sight.report.legs } as Percept<LegsUnmet>,
  motorUnmet: { read: ({ sight }) => sight.view.unmet } as Percept<MotorUnmet>,
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) } as Percept<FoePhase>,
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity } as Percept<number>,
});

/** What each percept reads, by its name. */
export type Percepts = { readonly [K in keyof typeof PERCEPTS]: typeof PERCEPTS[K] extends Percept<infer V> ? V : never };

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze((Object.keys(PERCEPTS) as (keyof typeof PERCEPTS)[]).filter((name) => PERCEPTS[name].cue !== undefined));

/** **What changes the situation enough to decide at once** (`Percept.cue`): every cue's value, as one text a chooser compares with the last. */
export const eventOf = (now: Percepts): string =>
  JSON.stringify(CUED.map((name) => (PERCEPTS[name] as Percept<unknown>).cue!(now[name])));
