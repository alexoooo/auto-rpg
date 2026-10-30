import type { MotorUnmet } from "../control/motor.ts";
import { paceToward, stanceEnvelopeOf, turnAt } from "../control/stance-envelope.ts";
import type { StancePhase } from "../control/stance.ts";
import { atan2, hypot } from "../math/real.ts";
import type { Rulebook } from "../rules/rulebook.ts";
import type { LegsUnmet } from "../skills/framework/skill.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { Cover } from "../intent/intent.ts";
import type { Orders } from "../intent/orders.ts";
import { profilesOn, readProfile, sameReaction, STANDING, type Measured, type Postures, type Profile, type ProfileReading } from "../skills/framework/profile.ts";
import type { BodySense } from "../mind/senses.ts";
import type { Sight } from "../tactics/tactics.ts";
import { foePhase, sensedPosture, threatReader, type FoePhase } from "../perception/threat.ts";
import type { Position } from "../recovery/ground/reading.ts";
import type { DownModel } from "./down.ts";
import type { Situation } from "./option.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { PartConfig } from "../parts/parts.ts";
import { blowLife, limbReach, record, strikersOf } from "./value.ts";

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
  /** A foe's weapon to ward off (`READINGS.ward`), read where a hand holds a covering face; null else. */
  readonly ward: Cover | null;
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

/** Each spec's fastest walk forward measured on its body, m/s, found once: a spec is immutable, and so is what is read from it; null where none was measured. */
const PACES = new WeakMap<BodySpec, number | null>();

/** The fastest walk forward `spec`'s body was measured to hold (`stanceEnvelopeOf`, `paceToward`), m/s; null where none was measured. */
function paceOf(spec: BodySpec): number | null {
  if (PACES.has(spec)) return PACES.get(spec)!;
  const envelope = stanceEnvelopeOf(spec), pace = envelope ? paceToward(envelope, 1, 0) : null;
  PACES.set(spec, pace);
  return pace;
}

/** Each spec's turn standing measured on its body, rad/s, found once; Infinity where none was measured. */
const TURNS = new WeakMap<BodySpec, number>();

/** **How fast a body of `spec` turns to face**, rad/s: its measured turn walking slowest (`turnAt`, `stanceEnvelopeOf`); Infinity where none was measured, so it is taken to face at once. */
function turnOf(spec: BodySpec): number {
  const known = TURNS.get(spec);
  if (known !== undefined) return known;
  const envelope = stanceEnvelopeOf(spec), turn = envelope ? turnAt(envelope, 0) : 0, rate = turn > 0 ? turn : Infinity;
  TURNS.set(spec, rate);
  return rate;
}

/** The way `body`'s `marks.base` faces across the ground, as a vector (its +z); null where it is not sensed. */
function aheadOf(body: BodySense): { readonly x: number; readonly z: number } | null {
  const turn = body.segments.get(body.spec.marks.base)?.rotation;
  return turn ? { x: 2 * (turn.x * turn.z + turn.w * turn.y), z: 1 - 2 * (turn.x * turn.x + turn.y * turn.y) } : null;
}

/** **The bearing of the ground point (`x`, `z`) around `body`**, rad from the way it faces (`aheadOf`), positive to its right; 0 where it is not sensed. */
export function bearingAround(body: BodySense, x: number, z: number): number {
  const ahead = aheadOf(body);
  if (!ahead) return 0;
  const to = { x: x - body.centre.x, z: z - body.centre.z };
  return atan2(ahead.z * to.x - ahead.x * to.z, ahead.x * to.x + ahead.z * to.z);
}

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

/** Strikes a body is modelled by, each read for its striker (`readProfile`), and how they are priced, a sentence. */
interface Model { readonly readings: readonly ProfileReading[]; readonly priced: string }

/**
 * **The strikes a foe of `foe` is modelled by**: those a drill measured on its body (`profilesOn`),
 * else this body's own (`Seen.strikes`), each fresh at the senses' reaction time; none where
 * neither is, and why.
 */
function foeModel(seen: Seen, foe: BodySpec, postures: Postures = STANDING): Model {
  const measured = profilesOn(seen.measured, foe, seen.hz, reactionOf(seen));
  if (measured.fresh.length) return { readings: measured.fresh.map((profile) => readProfile(profile, foe, postures)), priced: "measured" };
  const own = ownModel(seen, postures);
  return own.readings.length ? { readings: own.readings.map((reading) => readProfile(reading.profile, foe, postures)), priced: `as its own strikes: ${measured.stale}` } : { readings: [], priced: `by hand, ${measured.stale}` };
}

/** **This body's own strikes** (`Seen.strikes`), those fresh at the senses' reaction time, read at `postures` (`readProfile`). */
function ownModel(seen: Seen, postures: Postures = STANDING): Model {
  const reaction = reactionOf(seen);
  const fresh = seen.strikes.filter((profile) => sameReaction(profile.measured.reaction, reaction, seen.hz));
  return fresh.length ? { readings: fresh.map((profile) => readProfile(profile, seen.spec, postures)), priced: "measured" }
    : { readings: [], priced: seen.strikes.length ? `by hand, measured with senses ${seen.strikes[0]!.measured.reaction} s late, read ${reaction} s late` : "by hand, no drill measured its strikes" };
}

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/**
 * **What one body's strikes are expected to deal another**: the strikes it is modelled by
 * (`model`, each read through its profile at how the two stand, `ProfileReading`), read at the
 * struck body's phase (`phase`) and in its life (`struck`), the most of them a second at any range
 * (`peak`, the struck body's life), and how it is priced (`priced`, a sentence). With no strike
 * measured, between two standing bodies its model is its prior (`prior`): a strike of each limb it
 * strikes with (`strikersOf`), within that limb's reach (`limbReach`), `RATE` blows a second,
 * landing as this body's own do (`record`), each that limb's blow (`blowLife`); a body lying, or struck lying, with no strike measured from there deals none. The focus's on this
 * body (`pressure`), and this body's on the focus (`pressing`); none with no focus.
 */
export interface Pressure {
  readonly model: readonly ProfileReading[];
  readonly phase: string;
  readonly struck: BodySpec | null;
  readonly peak: number;
  readonly priced: string;
}

/** No pressure: no focus. */
const NO_PRESSURE: Pressure = deepFreeze({ model: [], phase: "clear", struck: null, peak: 0, priced: "no focus" });

/**
 * Where a prior (`pressureBy`) puts a striker's limbs: each within its reach (`limbReach`) of the
 * struck body's centre, or each over the struck body, at no range; none where the two stand so
 * that no prior is of it.
 */
type Placing = "reach" | "over" | null;

/**
 * **The pressure** (`Pressure`) of strikes `model` by a body of `striker` on a body of `struck` in
 * `phase`; where none is measured, its prior: a strike of each limb it strikes with
 * (`strikersOf`), placed by `placing`.
 */
function pressureBy(seen: Seen, model: Model, phase: string, striker: BodySpec, struck: BodySpec, placing: Placing): Pressure {
  const lands = model.readings.length || placing === null ? 0 : record(seen.sight.report.ledger, null).lands;
  const readings = model.readings.length || placing === null ? model.readings : strikersOf(striker).map((limb) =>
    prior(striker, struck, placing === "over" ? 0 : limbReach(striker, limb), lands * blowLife(seen.rules, striker, limb, struck), 1 / RATE));
  let peak = 0;
  for (const reading of readings) peak = Math.max(peak, reading.peak(phase, struck));
  return { model: readings, phase, struck, peak, priced: model.priced };
}

/** Where a prior puts the limbs of a body striking one whose posture is `posture` (`Placing`): within their reach of a body standing; none of one lying. */
const placingAt = (posture: string): Placing => posture === "standing" ? "reach" : null;

/** **The pressure** (`Pressure`) the focus puts on the body: its model read at the focus's posture (`sensedPosture`), the body struck as standing. */
function pressureOf(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus) return NO_PRESSURE;
  const posture = sensedPosture(focus);
  return pressureBy(seen, foeModel(seen, focus.spec, { own: posture, target: "standing" }), ownPhase(seen), focus.spec, spec, placingAt(posture));
}

/**
 * **The pressure** (`Pressure`) the body's own strikes put on the focus: its measured strikes
 * (`Seen.strikes`) fresh at the senses' reaction time, read standing at the focus's posture
 * (`sensedPosture`) and phase (`FoePhase`).
 */
function pressingOf(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus) return NO_PRESSURE;
  const posture = sensedPosture(focus);
  return pressureBy(seen, ownModel(seen, { own: "standing", target: posture }), foePhase(focus, seen.blow), spec, focus.spec, placingAt(posture));
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

/**
 * **How far `pressure` reaches**, m head to head: its strikes' farthest range at its phase
 * (`ProfileReading.reach`), as the range now places it; 0 with no strikes.
 */
export function edgeOf(now: Pick<Situation, "range" | "apart">, pressure: Pressure): number {
  if (pressure.model.length === 0) return 0;
  let range = -Infinity;
  for (const reading of pressure.model) range = Math.max(range, reading.reach(pressure.phase));
  return now.range + range - now.apart;
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
  const model = measured.length ? measured : [prior(blow.foe.spec, spec, range, LANDS * blowLife(seen.rules, blow.foe.spec, `hand.${blow.hand}`, spec, blow.closing), 1)];
  let most = 0;
  for (const reading of model) most = Math.max(most, reading.expect({ range: Math.min(range, reading.reach(phase)), phase }, spec)?.dealt ?? 0);
  return most;
}

/**
 * **What a second costs the body down rather than on its feet**, own life a second, against a foe
 * of `foe`: the blows of the foe standing over it (`Pressure.peak`), and what a second on its feet
 * is worth: the most its own strikes take of the foe a second less the most the foe's take of it,
 * none below nothing, since a body on its feet can keep out of reach. Each side's strikes are read
 * at the phase the other is in now.
 */
function downRateOf(seen: Seen, foe: BodySpec): { readonly blows: number; readonly standing: number } {
  const { focus, spec } = seen, blows = pressureBy(seen, foeModel(seen, foe), ownPhase(seen), foe, spec, "over").peak;
  const own = pressureBy(seen, ownModel(seen), focus ? foePhase(focus, seen.blow) : "clear", spec, foe, "over").peak;
  return { blows, standing: Math.max(0, own - blows) };
}

/**
 * **What lying in a posture is expected to cost**, own life: each second down (`downRateOf`) over
 * the rise from there, against the focus, and with none one of its own kind: its time down over
 * its chance of standing (`Seen.riseFrom`), the foe's blows less the share it keeps off; all the
 * life it has where none stands it. With no foe able to strike, it still costs what the body's own
 * strikes would take on its feet, so that down, a way up is worth more than lying still.
 */
function downCostAtOf(seen: Seen): (posture: Position) => number {
  const { focus, spec } = seen, foe = focus?.spec ?? spec, life = seen.sight.view.senses.life;
  let rate: ReturnType<typeof downRateOf> | null = null;
  return (posture) => {
    const down = seen.riseFrom(posture);
    if (!down || down.stands <= 0) return life;
    rate ??= downRateOf(seen, foe);
    return Math.min(life, (rate.blows * down.seconds * (1 - down.shelter) + rate.standing * down.seconds) / down.stands);
  };
}

/** A fall's lie: what a fall is priced from (`downCost`). */
const FALLEN: Position = "back";

/**
 * **Every percept Option Mind reads**, by name, in the order they are read: what it reads of the senses
 * and its own body with fixed geometry and kinematics, the same whatever a drill or the rules give.
 * Whether the body is down, how it lies (`Position`: standing on its feet), and the seconds until
 * it is braced (`Seen.unbraced`); its orders; its focus; how far off the focus is, centre to centre
 * across the ground (Infinity with none), and head to head (`range`, Infinity with none); its
 * bearing around the focus, rad from the focus's forward (its `marks.base`'s +z), positive to its
 * right (0 with none); a foe's blow predicted to reach the head (`READINGS.predicted`); a foe's
 * weapon near enough to ward off, with a hand that holds a covering face (`Seen.ward`); how late the senses show the focus (`reactionOf`), s; the
 * lead (its own life less the focus's, 0 with none) and the time left before the clock's verdict
 * (`Senses.ends`, Infinity where none ends it), s. The gait's: where the stance is in a step
 * (`StanceReading.phase`), which feet the ground bears (`Bearing`) and the centre of mass's speed
 * over the ground, m/s. What the controllers did not carry out: the legs' (`SkillReport.legs`) and
 * the motor's (`BodyView.unmet`). The focus's phase (`FoePhase`), its posture (`sensedPosture`;
 * standing with no focus), and the time to contact of the
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
  ward: { read: (seen) => seen.ward } as Percept<Cover | null>,
  range: { read: (seen) => { const { mine, theirs } = heads(seen); return theirs ? hypot(theirs.x - mine.x, theirs.z - mine.z) : Infinity; } } as Percept<number>,
  around: { read: ({ focus, sight }) => focus ? bearingAround(focus, sight.view.stance.centre.x, sight.view.stance.centre.z) : 0 } as Percept<number>,
  reaction: { read: reactionOf } as Percept<number | null>,
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 } as Percept<number>,
  left: { read: ({ sight }) => (sight.view.senses.ends ?? Infinity) - sight.view.senses.time } as Percept<number>,
  stride: { read: ({ sight }) => sight.view.stance.phase } as Percept<StancePhase>,
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.touching) } as Percept<Bearing>,
  speed: { read: ({ sight }) => hypot(sight.view.stance.velocity.x, sight.view.stance.velocity.z) } as Percept<number>,
  legsUnmet: { read: ({ sight }) => sight.report.legs } as Percept<LegsUnmet>,
  motorUnmet: { read: ({ sight }) => sight.view.unmet } as Percept<MotorUnmet>,
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) } as Percept<FoePhase>,
  foePosture: { read: ({ focus }) => focus ? sensedPosture(focus) : "standing" } as Percept<Position>,
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
 * **Every prediction Option Mind reads**, by name: the own life the blow coming is expected to take
 * (`lifeOf`), 0 with none; what the focus is expected to deal the body (`Pressure`), and
 * what its own strikes are expected to deal the focus (`pressingOf`); what a fall would cost
 * from standing, lying on its back (`FALLEN`), and lying in each posture (`downCostAtOf`), own life; how far the focus walks in the time the senses show it late
 * (`closesOf`), m; how fast the focus turns to face (`turnOf`), rad/s, Infinity with none; and the
 * focus's life a blow of a limb at a segment of its takes by the rules (`blowLife`), 0 with no focus.
 */
export const PREDICTIONS = Object.freeze({
  danger: { read: (seen) => lifeOf(seen, seen.blow) } as Prediction<number>,
  pressure: { read: pressureOf } as Prediction<Pressure>,
  pressing: { read: pressingOf } as Prediction<Pressure>,
  downCost: { read: (seen) => downCostAtOf(seen)(FALLEN) } as Prediction<number>,
  downCostAt: { read: downCostAtOf } as Prediction<(posture: Position) => number>,
  closes: { read: closesOf } as Prediction<number>,
  turns: { read: ({ focus }) => focus ? turnOf(focus.spec) : Infinity } as Prediction<number>,
  blows: { read: ({ focus, spec, rules }) => (limb: string, segment: string): number => focus ? blowLife(rules, spec, limb, focus.spec, undefined, segment) : 0 } as Prediction<(limb: string, segment: string) => number>,
});

/** What each prediction says, by its name. */
export type Predictions = { readonly [K in keyof typeof PREDICTIONS]: typeof PREDICTIONS[K] extends Prediction<infer V> ? V : never };

/** The predictions' names, in their order. */
const PREDICTED = Object.freeze(Object.keys(PREDICTIONS) as (keyof typeof PREDICTIONS)[]);

/**
 * **One body's predictions** (`Predictions`), each read from the step's `Seen` (`reset`) the first
 * time it is asked that step and kept until the next; and the percept and prediction parts an option
 * or an objective asks for by config (`perceive`, `predict`: a `PerceptPart`'s or `PredictionPart`'s,
 * made once a config through `parts`), read the same way. One object serves every step, so a
 * situation kept past its step reads the latest step's.
 */
export function predictor(parts?: PartLookup) {
  let seen: Seen | null = null;
  const values: unknown[] = PREDICTED.map(() => undefined), read: boolean[] = PREDICTED.map(() => false);
  const predictions = {} as Predictions;
  PREDICTED.forEach((name, i) => Object.defineProperty(predictions, name, { enumerable: true, get() {
    if (!read[i]) { values[i] = PREDICTIONS[name].read(seen!); read[i] = true; }
    return values[i];
  } }));
  const made = new Map<PartConfig, Percept<unknown>>(), asked = new Map<PartConfig, unknown>();
  /** What the part of `role` that `config` names reads now, once a step. */
  const readPart = (role: "percept" | "prediction", config: PartConfig): unknown => {
    if (asked.has(config)) return asked.get(config);
    if (!parts) throw new Error(`a ${role} part read with no part lookup: ${config.kind}`);
    let reading = made.get(config);
    if (!reading) made.set(config, reading = parts.of(role, config).make(config) as Percept<unknown>);
    const value = reading.read(seen!);
    asked.set(config, value);
    return value;
  };
  return {
    predictions,
    /** What the percept part `config` names reads now (`PerceptPart`). */
    perceive: <V>(config: PartConfig): V => readPart("percept", config) as V,
    /** What the prediction part `config` names predicts now (`PredictionPart`). */
    predict: <V>(config: PartConfig): V => readPart("prediction", config) as V,
    /** The step's `Seen`, each prediction to be read afresh. */
    reset(next: Seen): void { seen = next; read.fill(false); asked.clear(); },
  };
}

/** What each percept reads, by its name. */
export type Percepts = { readonly [K in keyof typeof PERCEPTS]: typeof PERCEPTS[K] extends Percept<infer V> ? V : never };

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze((Object.keys(PERCEPTS) as (keyof typeof PERCEPTS)[]).filter((name) => PERCEPTS[name].cue !== undefined));

/** **What changes the situation enough to decide at once** (`Percept.cue`): every cue's value, as one text a chooser compares with the last. */
export const eventOf = (now: Percepts): string =>
  JSON.stringify(CUED.map((name) => (PERCEPTS[name] as Percept<unknown>).cue!(now[name])));
