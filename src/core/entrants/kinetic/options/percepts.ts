import type { MotorUnmet } from "../../../control/motor.ts";
import { paceToward, stanceEnvelopeOf } from "../../../control/stance-envelope.ts";
import type { StancePhase } from "../../../control/stance.ts";
import { atan2, hypot } from "../../../math/real.ts";
import type { Rulebook } from "../../../rules/rulebook.ts";
import type { LegsUnmet } from "../../../skills/skill.ts";
import { rangeOf } from "../../../skills/strike.ts";
import type { BodySpec, Side } from "../../../spec/body.ts";
import { deepFreeze } from "../../../state.ts";
import type { Cover } from "../../../mind/intent.ts";
import type { Orders } from "../../../mind/orders.ts";
import { profilesOn, readProfile, sameReaction, type Measured, type Profile, type ProfileReading } from "../../../mind/profile.ts";
import type { BodySense } from "../../../mind/senses.ts";
import type { Sight } from "../../../mind/tactics.ts";
import { foePhase, threatReader, type FoePhase } from "../../../mind/threat.ts";
import type { Position } from "../../../mind/ground/reading.ts";
import type { DownModel } from "./down.ts";
import type { Situation } from "./option.ts";
import { blowLife, record } from "./value.ts";

/**
 * What every percept reads from, once a step: the body's sight and spec, the world's rate (Hz), the
 * measured profiles of its own strikes and of every striker's, its orders, the foe it fights (its focus,
 * `situationReader`), the blow predicted to reach its head and the threat reader that predicted it,
 * and what a rise from each posture is priced at (`DownModel`; null where none stands it).
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
  readonly riseFrom: (posture: Position) => DownModel | null;
  /** The seconds until the body is braced (`Reading.unbraced`). */
  readonly unbraced: (sight: Sight) => number;
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

/** The most at which the focus's hands reach this body's head, and this body's reach its, m head to head across the ground. */
export interface Reach { readonly theirs: number; readonly mine: number }

/** This body's head, and the focus's (its `marks.high`, else its centre). */
const heads = ({ focus, sight }: Seen) => ({ mine: sight.view.head, theirs: focus ? focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre : null });

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

/** What a prior was measured on: nothing; the owner's decision by hand. */
const BY_HAND: Measured = Object.freeze({ body: "", spec: "", skill: "by hand", hz: 0, reaction: null });

/**
 * **A prior**: what a strike of `striker` is taken to bring before a drill measures it, a profile
 * of one cell read like any measured one (`readProfile`): within `range` m centre to centre, in any
 * phase, `life` of `struck`'s life every `seconds` s.
 */
function prior(striker: BodySpec, struck: BodySpec, range: number, life: number, seconds: number): ProfileReading {
  return readProfile({ measured: BY_HAND, target: null,
    cells: [{ range, phase: "clear", trials: 1, done: 1, dealt: life * struck.wounds.hp.value, taken: 0, seconds, down: 0, ends: [] }] }, striker);
}

/** How far centre to centre the head-to-head `reach` is with the focus where it stands, m. */
const centred = (seen: Seen, reach: number): number => PERCEPTS.apart.read(seen) - PERCEPTS.range.read(seen) + reach;

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
 * body's life), and how it is priced (`priced`, a sentence). With no strike measured its model is
 * its prior (`prior`): within the striker's reach, `RATE` blows a second, landing as this body's
 * own do (`record`), each its heavier hand's. The focus's on this body (`pressure`), and this body's on the focus
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

/** **The pressure** (`Pressure`) of strikes `model` by a body of `striker` on a body of `struck` in `phase`, its prior within `reach` m centre to centre where none is measured. */
function pressureBy(seen: Seen, model: Model, phase: string, striker: BodySpec, struck: BodySpec, reach: number): Pressure {
  const readings = model.readings.length ? model.readings
    : [prior(striker, struck, reach, record(seen.sight.report.ledger, null).lands * heavier(seen.rules, striker, struck), 1 / RATE)];
  let peak = 0;
  for (const reading of readings) peak = Math.max(peak, reading.peak(phase, struck));
  return { model: readings, phase, struck, peak, priced: model.priced };
}

/** **The pressure** (`Pressure`) a standing focus puts on the body. */
function pressureOf(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(seen, foeModel(seen, focus.spec), ownPhase(seen), focus.spec, spec, centred(seen, PERCEPTS.reach.read(seen).theirs));
}

/** **The pressure** (`Pressure`) the body's own strikes put on a standing focus: its measured strikes (`Seen.strikes`) fresh at the senses' reaction time, read at the focus's phase (`FoePhase`). */
function pressingOf(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(seen, ownModel(seen), foePhase(focus, seen.blow), spec, focus.spec, centred(seen, PERCEPTS.reach.read(seen).mine));
}

/**
 * **The life `seconds` s at `range` m apart, centre to centre, are expected to cost the struck
 * body** under `pressure`: the most of its strikes, each what its profile expects there within its
 * reach (`ProfileReading.expect`) a second.
 */
export function pressureAt(pressure: Pressure, range: number, seconds: number): number {
  let rate = 0;
  for (const reading of pressure.model) {
    const expected = reading.expect({ range, phase: pressure.phase }, pressure.struck);
    if (expected) rate = Math.max(rate, expected.dealt / expected.seconds);
  }
  return rate * seconds;
}

/** **The life `seconds` s cost the struck body under `pressure`** with the two `apart` m head to head: at the range centre to centre that leaves (`pressureAt`). */
export const dealtAt = (pressure: Pressure, now: Situation, apart: number, seconds: number): number => pressureAt(pressure, now.apart + apart - now.range, seconds);

/** **The own life `seconds` s cost under the focus's pressure** (`Pressure`, `dealtAt`), standing `apart` m from it head to head. */
export const threatened = (now: Situation, seconds: number, apart = now.range): number => dealtAt(now.predictions.pressure, now, apart, seconds);

/**
 * **The own life `blow` is expected to take**: the most its striker's strikes (`foeModel`) are
 * expected to take at the striker's range and this body's phase, to their reach (a blow predicted
 * to reach the head is in reach); with none measured, its prior (`prior`): its energy at the speed
 * it closes, landing as often as `LANDS`. 0 with none: the blow coming's (`danger`).
 */
function lifeOf(seen: Seen, blow: Seen["blow"]): number {
  const { spec, sight } = seen;
  if (!blow) return 0;
  const centre = sight.view.stance.centre, range = hypot(blow.foe.centre.x - centre.x, blow.foe.centre.z - centre.z), phase = ownPhase(seen);
  const measured = foeModel(seen, blow.foe.spec).readings;
  const model = measured.length ? measured : [prior(blow.foe.spec, spec, range, LANDS * blowLife(seen.rules, blow.foe.spec, blow.hand, spec, blow.closing), 1)];
  let most = 0;
  for (const reading of model) most = Math.max(most, reading.expect({ range: Math.min(range, reading.reach(phase)), phase }, spec)?.dealt ?? 0);
  return most;
}

/**
 * **What lying in a posture is expected to cost**, own life: the blows of a foe standing over the
 * body while it is down, at the most they deal (`Pressure.peak`): the focus's, down or not, and
 * with none one of its own kind; over the rise from there (its time down, less the share of blows
 * it keeps off, over its chance of standing, `Seen.riseFrom`); all the life it has where none
 * stands it. It costs something with no foe standing, so that down, a way up is worth more than
 * lying still.
 */
function downCostAtOf(seen: Seen): (posture: Position) => number {
  const { focus, spec } = seen, foe = focus?.spec ?? spec, life = seen.sight.view.senses.life;
  let peak: number | null = null;
  return (posture) => {
    const down = seen.riseFrom(posture);
    if (!down || down.stands <= 0) return life;
    peak ??= pressureBy(seen, foeModel(seen, foe), ownPhase(seen), foe, spec, 0).peak;
    return Math.min(life, peak * down.seconds * (1 - down.shelter) / down.stands);
  };
}

/** A fall's lie: what a fall is priced from (`downCost`). */
const FALLEN: Position = "back";

/**
 * **Every percept Kinetic reads**, by name, in the order they are read: what it reads of the senses
 * and its own body with fixed geometry and kinematics, the same whatever a drill or the rules give.
 * Whether the body is down, how it lies (`Position`: standing on its feet), and the seconds until
 * it is braced (`Seen.unbraced`); its orders; its focus; how far off the focus is, centre to centre
 * across the ground (Infinity with none), and head to head (`range`, Infinity with none); its
 * bearing around the focus, rad from the focus's forward (its `marks.base`'s +z), positive to its
 * right (0 with none); a foe's blow predicted to reach the head (`READINGS.predicted`); the reach
 * head to head (`Reach`: noughts with no focus); how late the senses show the focus (`reactionOf`), s; the
 * lead (its own life less the focus's, 0 with none) and the time left before the clock's verdict
 * (`Senses.ends`, Infinity where none ends it), s. The gait's: where the stance is in a step
 * (`StanceReading.phase`), which feet the ground bears (`Bearing`) and the centre of mass's speed
 * over the ground, m/s. What the controllers did not carry out: the legs' (`SkillReport.legs`) and
 * the motor's (`BodyView.unmet`). The focus's phase (`FoePhase`), and the time to contact of the
 * blow it strikes with, s (Infinity with none). Its cues: going down or getting up, braced, other
 * orders, another focus, a threat or a blow coming.
 */
export const PERCEPTS = Object.freeze({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down } as Percept<boolean>,
  posture: { read: ({ sight }) => sight.view.ground?.position ?? (sight.view.down ? "between" : "standing") } as Percept<Position>,
  unbraced: { read: (seen) => seen.unbraced(seen.sight), cue: (seconds) => seconds > 0 } as Percept<number>,
  orders: { read: (seen) => seen.orders, cue: (orders) => orders } as Percept<Orders | null>,
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null } as Percept<BodySense | null>,
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity } as Percept<number>,
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null } as Percept<Cover | null>,
  range: { read: (seen) => { const { mine, theirs } = heads(seen); return theirs ? hypot(theirs.x - mine.x, theirs.z - mine.z) : Infinity; } } as Percept<number>,
  around: { read: ({ focus, sight }) => {
    const turn = focus?.segments.get(focus.spec.marks.base)?.rotation;
    if (!focus || !turn) return 0;
    const ahead = { x: 2 * (turn.x * turn.z + turn.w * turn.y), z: 1 - 2 * (turn.x * turn.x + turn.y * turn.y) };
    const to = { x: sight.view.stance.centre.x - focus.centre.x, z: sight.view.stance.centre.z - focus.centre.z };
    return atan2(ahead.z * to.x - ahead.x * to.z, ahead.x * to.x + ahead.z * to.z);
  } } as Percept<number>,
  reach: { read: (seen): Reach => {
    const { mine, theirs } = heads(seen), { focus, spec } = seen;
    if (!focus || !theirs) return { theirs: 0, mine: 0 };
    return { theirs: twoHanded(focus.spec) ? outer(focus.spec, mine.y - theirs.y) : 0, mine: twoHanded(spec) ? outer(spec, theirs.y - mine.y) : 0 };
  } } as Percept<Reach>,
  reaction: { read: reactionOf } as Percept<number | null>,
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 } as Percept<number>,
  left: { read: ({ sight }) => (sight.view.senses.ends ?? Infinity) - sight.view.senses.time } as Percept<number>,
  stride: { read: ({ sight }) => sight.view.stance.phase } as Percept<StancePhase>,
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.touching) } as Percept<Bearing>,
  speed: { read: ({ sight }) => hypot(sight.view.stance.velocity.x, sight.view.stance.velocity.z) } as Percept<number>,
  legsUnmet: { read: ({ sight }) => sight.report.legs } as Percept<LegsUnmet>,
  motorUnmet: { read: ({ sight }) => sight.view.unmet } as Percept<MotorUnmet>,
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) } as Percept<FoePhase>,
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity } as Percept<number>,
});

/**
 * **A prediction**: what data a drill, a training run or the rules make says of the situation,
 * stale with that data; read when an option or the position value asks for it, once a step at most
 * (`predictor`).
 */
export interface Prediction<V> {
  read(seen: Seen): V;
}

/**
 * **Every prediction Kinetic reads**, by name: the own life the blow coming is expected to take
 * (`lifeOf`), 0 with none; what a standing focus is expected to deal the body (`Pressure`), and
 * what its own strikes are expected to deal the focus (`pressingOf`); what a fall would cost
 * from standing, lying on its back (`FALLEN`), and lying in each posture (`downCostAtOf`), own life; how far the focus walks in the time the senses show it late
 * (`closesOf`), m; and the focus's life a blow of each hand at its head takes by the rules
 * (`blowLife`), 0 with no focus.
 */
export const PREDICTIONS = Object.freeze({
  danger: { read: (seen) => lifeOf(seen, seen.blow) } as Prediction<number>,
  pressure: { read: pressureOf } as Prediction<Pressure>,
  pressing: { read: pressingOf } as Prediction<Pressure>,
  downCost: { read: (seen) => downCostAtOf(seen)(FALLEN) } as Prediction<number>,
  downCostAt: { read: downCostAtOf } as Prediction<(posture: Position) => number>,
  closes: { read: closesOf } as Prediction<number>,
  blows: { read: ({ focus, spec, rules }): Readonly<Record<Side, number>> => ({ left: focus ? blowLife(rules, spec, "left", focus.spec) : 0,
    right: focus ? blowLife(rules, spec, "right", focus.spec) : 0 }) } as Prediction<Readonly<Record<Side, number>>>,
});

/** What each prediction says, by its name. */
export type Predictions = { readonly [K in keyof typeof PREDICTIONS]: typeof PREDICTIONS[K] extends Prediction<infer V> ? V : never };

/** The predictions' names, in their order. */
const PREDICTED = Object.freeze(Object.keys(PREDICTIONS) as (keyof typeof PREDICTIONS)[]);

/**
 * **One body's predictions** (`Predictions`), each read from the step's `Seen` (`reset`) the first
 * time it is asked that step and kept until the next. One object serves every step, so a situation
 * kept past its step reads the latest step's.
 */
export function predictor() {
  let seen: Seen | null = null;
  const values: unknown[] = PREDICTED.map(() => undefined), read: boolean[] = PREDICTED.map(() => false);
  const predictions = {} as Predictions;
  PREDICTED.forEach((name, i) => Object.defineProperty(predictions, name, { enumerable: true, get() {
    if (!read[i]) { values[i] = PREDICTIONS[name].read(seen!); read[i] = true; }
    return values[i];
  } }));
  return {
    predictions,
    /** The step's `Seen`, each prediction to be read afresh. */
    reset(next: Seen): void { seen = next; read.fill(false); },
  };
}

/** What each percept reads, by its name. */
export type Percepts = { readonly [K in keyof typeof PERCEPTS]: typeof PERCEPTS[K] extends Percept<infer V> ? V : never };

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze((Object.keys(PERCEPTS) as (keyof typeof PERCEPTS)[]).filter((name) => PERCEPTS[name].cue !== undefined));

/** **What changes the situation enough to decide at once** (`Percept.cue`): every cue's value, as one text a chooser compares with the last. */
export const eventOf = (now: Percepts): string =>
  JSON.stringify(CUED.map((name) => (PERCEPTS[name] as Percept<unknown>).cue!(now[name])));
