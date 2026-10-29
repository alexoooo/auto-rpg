import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../../build/rigid.ts";
import { pointAtToRef, poseAngles, specChainTo } from "../../control/kinematics.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import type { StancePhase } from "../../control/stance.ts";
import { hypot } from "../../math/real.ts";
import type { LegsUnmet } from "../../skills/skill.ts";
import { guardPosture } from "../../skills/guard.ts";
import { rangeOf } from "../../skills/strike.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Cover } from "../intent.ts";
import type { Orders } from "../orders.ts";
import { profilesOn, STRIKE_PROFILES, type Profile, type ProfileCell } from "../profile.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { READINGS, type threatReader } from "../threat.ts";
import type { DownModel } from "./down.ts";
import type { Situation } from "./option.ts";
import { blowEnergy, lifeOf, record } from "./value.ts";

/**
 * What every percept reads from, once a step: the body's sight and spec, the world's rate (Hz), the
 * measured profiles of its own strikes, its orders, the foe it fights (its focus,
 * `situationReader`), the blow predicted to reach its head and the threat reader that predicted it,
 * and how its ways up from the ground are priced (`DownModel`).
 */
export interface Seen {
  readonly sight: Sight;
  readonly spec: BodySpec;
  readonly hz: number;
  readonly strikes: readonly Profile[];
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

/**
 * Head to head across the ground to the focus, m; the most at which its hands reach this body's
 * head and this body's reach its; and the range head to head at which the two guards' farthest
 * points meet (`guardAhead`).
 */
export interface Reach { readonly apart: number; readonly theirs: number; readonly mine: number; readonly guards: number }

/**
 * By hand, where no strike models the foe (`foeModel`): the chance a foe's blow predicted to reach
 * the head lands; and how many blows a second a standing foe throws within its reach, of which as
 * many land as of the body's own (`record`): two bodies trading blows land alike.
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

/** Whether `spec` has both hands to strike with: what the reach readings measure. */
const twoHanded = (spec: BodySpec): boolean => ["hand.left", "hand.right"].every((hand) => spec.effectors?.some((effector) => effector.segment === hand) ?? false);

/** How far a hand of `striker` reaches a head `up` m over its own, m head to head across the ground: its range's outer bound. */
const outer = (striker: BodySpec, up: number): number => { const range = rangeOf(striker, "right", up); return range.reach + range.along[1]; };

/** Each spec's guard's reach ahead of its head, found once: a spec is immutable, and so is what is read from it. */
const GUARDS = new WeakMap<BodySpec, number>();

/**
 * **How far ahead of its head `spec`'s guard holds its farthest point**, m: of each hand's points
 * and what it holds (`rigidPoints`), in the reference pose with the guard's angles
 * (`guardPosture`), along the body frame's forward; 0 for a body with no hands.
 */
function guardAhead(spec: BodySpec): number {
  let ahead = GUARDS.get(spec);
  if (ahead !== undefined) return ahead;
  const angles = poseAngles(spec, guardPosture(spec)), head = spec.segments.find((segment) => segment.name === "head")?.centreOfMass.value[2] ?? 0, at = new Vector3();
  ahead = 0;
  for (const segment of spec.segments) {
    if (segment.name !== "hand.left" && segment.name !== "hand.right") continue;
    const chain = specChainTo(spec, segment.name), turned = chain.map((joint) => angles[joint.spec.name] ?? joint.spec.dofs.map(() => 0));
    for (const point of rigidPoints(spec, segment).values()) ahead = Math.max(ahead, pointAtToRef(chain, turned, point.value, at).z - head);
  }
  GUARDS.set(spec, ahead);
  return ahead;
}

/** The heavier of `striker`'s two hands' blows on `struck`'s head, J. */
const heavier = (striker: BodySpec, struck: BodySpec): number => Math.max(blowEnergy(striker, "left", struck), blowEnergy(striker, "right", struck));

/** How late the senses show the focus, s: the senses' time less the focus's; null with no focus, or one sensed without its time. */
const reactionOf = ({ focus, sight }: Seen): number | null => focus?.time === undefined ? null : sight.view.senses.time - focus.time;

/**
 * **The strikes a foe of `foe` is modelled by**: those a drill measured on its body (`profilesOn`),
 * else this body's own (`Seen.strikes`), each fresh at the senses' reaction time; none where
 * neither is.
 */
function foeModel(seen: Seen, foe: BodySpec): readonly Profile[] {
  const measured = profilesOn(STRIKE_PROFILES, foe, seen.hz, reactionOf(seen));
  return measured.length ? measured : ownModel(seen);
}

/** **This body's own strikes** (`Seen.strikes`), those fresh at the senses' reaction time. */
function ownModel(seen: Seen): readonly Profile[] {
  const reaction = reactionOf(seen);
  return seen.strikes.filter((profile) => profile.measured.reaction === null || reaction === null || Math.abs(profile.measured.reaction - reaction) <= .5 / seen.hz);
}

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/**
 * **What one standing body's strikes are expected to deal another**: the strikes it is modelled by
 * (`model`), read at the struck body's phase (`phase`) and in its life (`hp`, its hit points), the
 * most of them a second at any range (`peak`, the struck body's life); with no model, built by hand
 * within the striker's reach (`peak` its blows a second, `RATE`, landing as this body's own do,
 * `record`, each its heavier hand's). The focus's on this body (`pressure`), and this body's on the
 * focus (`pressing`); none with no standing focus.
 */
export interface Pressure {
  readonly model: readonly Profile[];
  readonly phase: string;
  readonly hp: number;
  readonly peak: number;
}

/** No pressure: no standing focus. */
const NO_PRESSURE: Pressure = deepFreeze({ model: [], phase: "clear", hp: 1, peak: 0 });

/** The phase of `profile`'s cells read for a body in `phase`: its own where the profile has cells of it, else clear. */
const phaseIn = (profile: Profile, phase: string): string => profile.cells.some((cell) => cell.phase === phase) ? phase : "clear";

/**
 * The cell of `profile` nearest `range` m, centre to centre, for a body in `phase` (`phaseIn`):
 * where `anywhere`, at any range; else within its reach, its farthest cell and half its spacing on,
 * and null beyond.
 */
function cellAt(profile: Profile, phase: string, range: number, anywhere: boolean): ProfileCell | null {
  const at = phaseIn(profile, phase);
  let nearest: ProfileCell | null = null, far = -Infinity, next = -Infinity;
  for (const cell of profile.cells) {
    if (cell.phase !== at) continue;
    if (cell.range > far) { next = far; far = cell.range; } else if (cell.range > next) next = cell.range;
    if (!nearest || Math.abs(cell.range - range) < Math.abs(nearest.range - range)) nearest = cell;
  }
  return nearest && (anywhere || range <= far + (next > -Infinity ? (far - next) / 2 : 0)) ? nearest : null;
}

/** **The pressure** (`Pressure`) of strikes `model` on a body in `phase` of `hp` hit points; `byHand` its peak with no model. */
function pressureBy(model: readonly Profile[], phase: string, hp: number, byHand: () => number): Pressure {
  if (model.length === 0) return { model, phase, hp, peak: byHand() };
  let peak = 0;
  for (const profile of model) {
    const at = phaseIn(profile, phase);
    for (const cell of profile.cells) if (cell.phase === at) peak = Math.max(peak, cell.dealt / hp / cell.seconds);
  }
  return { model, phase, hp, peak };
}

/** **The pressure** (`Pressure`) a standing focus puts on the body. */
function pressureOf(seen: Seen): Pressure {
  const { focus, sight, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(foeModel(seen, focus.spec), ownPhase(seen), spec.wounds.hp.value,
    () => RATE * record(sight.report.ledger, null).lands * lifeOf(heavier(focus.spec, spec), spec));
}

/** **The pressure** (`Pressure`) the body's own strikes put on a standing focus: its measured strikes (`Seen.strikes`) fresh at the senses' reaction time, read at the focus's phase (`FoePhase`). */
function pressingOf(seen: Seen): Pressure {
  const { focus, sight, spec } = seen;
  if (!focus || focus.down) return NO_PRESSURE;
  return pressureBy(ownModel(seen), foePhase(focus, seen.blow), focus.spec.wounds.hp.value,
    () => RATE * record(sight.report.ledger, null).lands * lifeOf(heavier(spec, focus.spec), focus.spec));
}

/**
 * **The life `seconds` s at `range` m apart, centre to centre, are expected to cost the struck
 * body** under `pressure`: modelled, the most of its strikes, each its nearest cell's hit points
 * over its seconds within its reach (`cellAt`); built by hand, its peak at any range (its caller
 * keeps to the striker's reach, `dealtAt`).
 */
export function pressureAt(pressure: Pressure, range: number, seconds: number): number {
  if (pressure.model.length === 0) return pressure.peak * seconds;
  let rate = 0;
  for (const profile of pressure.model) {
    const cell = cellAt(profile, pressure.phase, range, false);
    if (cell) rate = Math.max(rate, cell.dealt / pressure.hp / cell.seconds);
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
 * **The own life the blow coming is expected to take**: modelled (`foeModel`, its striker's), the
 * most of its strikes' hit points at the striker's range and this body's phase, its nearest cell's
 * at any range (a blow predicted to reach the head is in reach); else built by hand, its energy at
 * the speed it closes, landing as often as `LANDS`. 0 with none coming.
 */
function dangerOf(seen: Seen): number {
  const { blow, spec, sight } = seen;
  if (!blow) return 0;
  const model = foeModel(seen, blow.foe.spec);
  if (model.length === 0) return LANDS * lifeOf(blowEnergy(blow.foe.spec, blow.hand, spec, blow.closing), spec);
  const centre = sight.view.stance.centre, range = hypot(blow.foe.centre.x - centre.x, blow.foe.centre.z - centre.z), phase = ownPhase(seen);
  let most = 0;
  for (const profile of model) most = Math.max(most, (cellAt(profile, phase, range, true)?.dealt ?? 0) / spec.wounds.hp.value);
  return most;
}

/**
 * **What a fall is expected to cost**, own life: the focus's blows while the body is down, at the
 * most its pressure deals (`Pressure.peak`), over the cheapest of its ways up that stands (its time
 * down, less the share of blows it keeps off, over its chance of standing); all the life it has
 * where none stands.
 */
function downCostOf(seen: Seen): number {
  const peak = pressureOf(seen).peak;
  let least = seen.sight.view.senses.life;
  for (const down of seen.downs) if (down.stands > 0) least = Math.min(least, peak * down.seconds * (1 - down.shelter) / down.stands);
  return least;
}

/** How fast the body and the focus close, m/s, across the ground: their centres' velocities along the line between them; 0 with no focus, or none apart. */
function closingOf({ focus, sight }: Seen): number {
  if (!focus) return 0;
  const { centre, velocity } = sight.view.stance, x = focus.centre.x - centre.x, z = focus.centre.z - centre.z, apart = hypot(x, z);
  return apart > 0 ? ((velocity.x - focus.velocity.x) * x + (velocity.z - focus.velocity.z) * z) / apart : 0;
}

/**
 * **Every percept the options fighter reads**, by name, in the order they are read: whether the
 * body is down; its orders; its focus; how far off the focus is, centre to centre across the
 * ground (Infinity with none); a foe's blow closing on the head (`READINGS.threat`) and one
 * predicted to reach it (`READINGS.predicted`); the own life that blow is expected to take
 * (`dangerOf`), 0 with none; the reach head to head (`Reach`:
 * Infinity and noughts with no focus); what a standing focus is expected to deal the body
 * (`Pressure`), and what its own strikes are expected to deal the focus (`pressingOf`); what a fall
 * would cost (`downCostOf`), own life; how fast the two close (`closingOf`), m/s; how late the
 * senses show the focus (`reactionOf`), s; the lead (its own life less the focus's, 0 with none)
 * and the time left before the clock's verdict (`Senses.ends`, Infinity where none ends it), s;
 * and the focus's life a blow of each hand at its head takes (`blowEnergy`, `lifeOf`), 0 with no
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
  danger: { read: dangerOf } as Percept<number>,
  reach: { read: ({ focus, sight, spec }): Reach => {
    if (!focus) return { apart: Infinity, theirs: 0, mine: 0, guards: 0 };
    const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
    return { apart: hypot(theirs.x - mine.x, theirs.z - mine.z), theirs: twoHanded(focus.spec) ? outer(focus.spec, mine.y - theirs.y) : 0,
      mine: twoHanded(spec) ? outer(spec, theirs.y - mine.y) : 0, guards: guardAhead(spec) + guardAhead(focus.spec) };
  } } as Percept<Reach>,
  pressure: { read: pressureOf } as Percept<Pressure>,
  pressing: { read: pressingOf } as Percept<Pressure>,
  downCost: { read: downCostOf } as Percept<number>,
  closing: { read: closingOf } as Percept<number>,
  reaction: { read: reactionOf } as Percept<number | null>,
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 } as Percept<number>,
  left: { read: ({ sight }) => (sight.view.senses.ends ?? Infinity) - sight.view.senses.time } as Percept<number>,
  blows: { read: ({ focus, spec }): Readonly<Record<Side, number>> => ({ left: focus ? lifeOf(blowEnergy(spec, "left", focus.spec), focus.spec) : 0,
    right: focus ? lifeOf(blowEnergy(spec, "right", focus.spec), focus.spec) : 0 }) } as Percept<Readonly<Record<Side, number>>>,
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
