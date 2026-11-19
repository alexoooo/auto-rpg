import type { StancePhase } from "../../control/stance/goal.ts";
import type { StanceReading } from "../../control/stance/goal.ts";
import type { Spot } from "../../skills/framework/menu.ts";
import type { KeysOf, Part } from "../../parts/parts.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import { turnAt } from "../../control/stance/stance-envelope.ts";
import { stanceEnvelopeOf } from "../../skills/locomotion/shared/stance/envelope.ts";
import { atan2, exp, hypot } from "../../core/math/real.ts";
import type { Rulebook } from "../../combat/rulebook.ts";
import type { LegsUnmet } from "../../skills/framework/skill.ts";
import type { BearingEnd, BodySpec } from "../../core/bodies/spec/body.ts";
import { defaultStrikeLimbs } from "../../skills/perception/default-strike-limbs.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Cover } from "../../skills/framework/intent.ts";
import { ordersAsked, type Orders } from "../orders.ts";
import { limbHoldsAsMeasured, profilesOn, sameReaction } from "../../skills/framework/profile/lookup.ts";
import { measuredAt, STANDING, type Postures, type Profile, type StanceNumbers, type Stances } from "../../skills/framework/profile/profile.ts";
import { profileAgainst } from "../../skills/framework/profile/across.ts";
import { readProfile, type ProfileReading } from "../../skills/framework/profile/reading.ts";
import { startVelocity } from "../../skills/framework/profile/numbers.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import type { Sight } from "../decider.ts";
import { foePhase, sensedPosture, threatReader, type FoePhase } from "../../skills/perception/threat.ts";
import { stancesOf, turned } from "../../skills/perception/stance-numbers.ts";
import { carriageOf } from "../../skills/locomotion/move/gaits.ts";
import type { GroundReading, Position } from "../../control/ground-reading.ts";
import type { RiseMemory } from "./rise-memory.ts";
import type { Situation } from "./option.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { alongHorizons, pairingApart, pressureCurve, pressureTable, validPairing, type MeasuredPairing, type PressureTable } from "./pressure.ts";
import { blowLife, DECIDING, limbReach, record, type Ground } from "./value.ts";

/**
 * What every percept and prediction reads from, a step's: the body's sight and spec, the world's
 * rate (Hz), the measured profiles of its own strikes and of every striker's, its orders, the foe
 * it fights (its focus, `situationReader`), the blow predicted to reach its head and a foe's weapon
 * to ward off, each read the first time the step asks for it, and the threat reader that reads
 * them; and what its reader keeps of its rise (`RiseMemory`).
 */
export interface Seen {
  readonly sight: Sight;
  readonly spec: BodySpec;
  readonly hz: number;
  /** The rate its mind decides at, Hz (`OptionMindConfig.rate`), at which a profile is read. */
  readonly rate: number;
  /** The steps its body's command waits (`Body.delay`), at which a profile is read. */
  readonly delay: number;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow built by hand (`blowLife`). */
  readonly rules: Rulebook;
  /** The body's own strikes, each with its profiles measured as the body reads it (`ModelledStrike`). */
  readonly strikes: readonly ModelledStrike[];
  /** Every striker's measured strikes (`dataOf("strike-profiles")`), which model a foe's (`foeModel`). */
  readonly measured: readonly Profile[];
  /** What the focus is expected to take from the body as the two fight (`OthersModel`): its strikes' rate (`RATE_OTHERS`) or its measured pressures. */
  readonly others: OthersModel;
  readonly orders: Orders | null;
  readonly focus: BodySense | null;
  readonly blow: ReturnType<Threats["blowOf"]>;
  /** A foe's weapon to ward off, at the hand that holds it (`READINGS.ward`); null with none. */
  readonly ward: Cover | null;
  readonly threats: Threats;
  readonly risen: RiseMemory;
  /** What its reader keeps of the stretches the body has spent within and out of each foe's reach (`reachMemory`). */
  readonly reach: ReachMemory;
}

type Threats = ReturnType<typeof threatReader>;

/**
 * **A strike a body is modelled by**: its name, the limbs it is thrown with (effector segments,
 * `hand.right`), and its profiles measured on that body as it is read, its senses' reaction time
 * aside, one a body it was measured against (none where none is). It is read by the one against
 * the body it strikes (`profileAgainst`); one whose profile is not fresh at the senses' reaction
 * time is read by its limbs' prior (`modelOf`), so a strike left unmeasured is priced by hand while
 * the others are measured.
 */
export interface ModelledStrike {
  readonly name: string;
  readonly limbs: readonly string[];
  readonly profiles: readonly Profile[];
}

/**
 * **A percept**: one named reading of what the body senses, read the first time a step asks for it
 * (`perceiver`). Its cue, where it has one, is what of it a chooser watches where its last decision
 * asked for it (`Cues`): a change in the cue is an event, on which the chooser decides at once.
 */
export interface Percept<V> {
  read(seen: Seen): V;
  cue?(value: V): unknown;
}

/** This body's head, and the focus's (its `marks.high`, else its centre). */
const heads = ({ focus, sight }: Seen) => ({ mine: sight.view.head, theirs: focus ? focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre : null });

/**
 * Set by hand, for where no strike models the foe (`foeModel`): the chance a foe's
 * blow predicted to reach the head lands; and how many blows a second a standing foe throws within
 * its reach, of which as many land as of the body's own (`record`): two bodies trading blows land
 * alike.
 */
const LANDS = .3, RATE = 1;

/** The stance's feet the ground bears (`StanceEnd.touching`), by name, in the stance's order. */
type Bearing = readonly BearingEnd[];

/** The feet of `ends` the ground bears. */
const bearingOf = (ends: StanceReading["ends"]): Bearing => Object.keys(ends).filter((end) => ends[end]!.touching);

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

/**
 * How late the senses show the focus, s: their reaction time (`Senses.reaction`), which a body
 * carried for less is also read at, as each profile's fights began; where they name none, the
 * senses' time less the focus's. Null with no focus, or one sensed without its time.
 */
const reactionOf = ({ focus, sight }: Seen): number | null =>
  focus?.time === undefined ? null : sight.view.senses.reaction ?? sight.view.senses.time - focus.time;

/**
 * **A prior**: what a strike of `striker` is taken to bring before a drill measures it, a profile
 * of one trial read like any measured one (`readProfile`): within `range` m centre to centre, in any
 * phase and at any velocity, `life` of `struck`'s life every `seconds` s, its whole cycle (it
 * records no recovery, `Trial.recovers`).
 */
function prior(striker: BodySpec, struck: BodySpec, range: number, life: number, seconds: number): ProfileReading {
  // A reading is made of these alone, and a spec is immutable: a prior is made once for them, for a caller whose
  // numbers come from a few (a limb's reach, a share of its record's blows). A -0 is read as given, since a key takes it for 0.
  if (Object.is(range, -0) || Object.is(life, -0) || Object.is(seconds, -0)) return priorOf(striker, struck, range, life, seconds);
  let byStruck = PRIORS.get(striker);
  if (!byStruck) PRIORS.set(striker, byStruck = new WeakMap());
  let byRange = byStruck.get(struck);
  if (!byRange) byStruck.set(struck, byRange = new Map());
  let byLife = byRange.get(range);
  if (!byLife) byRange.set(range, byLife = new Map());
  let bySeconds = byLife.get(life);
  if (!bySeconds) byLife.set(life, bySeconds = new Map());
  let made = bySeconds.get(seconds);
  if (!made) bySeconds.set(seconds, made = priorOf(striker, struck, range, life, seconds));
  return made;
}

/** Each prior made (`prior`), by its striker's spec, the struck body's, its range, its life and its seconds. */
const PRIORS = new WeakMap<BodySpec, WeakMap<BodySpec, Map<number, Map<number, Map<number, ProfileReading>>>>>();

/** A prior (`prior`), made anew: of `striker`'s body, measured on nothing, its skill set by hand. */
const priorOf = (striker: BodySpec, struck: BodySpec, range: number, life: number, seconds: number): ProfileReading =>
  readProfile({ measured: { body: striker.model, stature: striker.stature.value, skill: "by hand", hz: 0, reaction: null },
    trials: [{ start: { range, phase: "clear" }, done: true, dealt: life * struck.wounds.hp.value, taken: 0, seconds, recovers: null, down: false }] }, striker);

/**
 * **The strikes a body is modelled by**: each measured, read for its striker (`readProfile`), with
 * the limbs that throw it; the limbs the rest are thrown with, each read by its prior where the two
 * stand so that one is of it (`pressureBy`, `lifeOf`); and how they are priced, a sentence.
 */
interface Model {
  readonly measured: readonly { readonly limbs: readonly string[]; readonly reading: ProfileReading }[];
  readonly unmeasured: readonly string[];
  readonly priced: string;
}

/** Why a strike of `profile` (null with none) is stale with the senses `reaction` s late, a sentence (`sameReaction`); null where it is fresh or there is none. A stale profile is still read. */
const staleAt = (profile: Profile | null, reaction: number | null, hz: number): string | null =>
  !profile || sameReaction(profile.measured.reaction, reaction, hz) ? null : `measured with senses ${profile.measured.reaction} s late, read ${reaction} s late`;

/** Why a strike of `profile` is priced by hand at `postures`, a sentence: none measured it, or measured it with the bodies standing otherwise (`measuredAt`); null where its profile reads them, stale or not. */
const byHandAt = (profile: Profile | null, postures: Postures): string | null =>
  !profile ? "no fight measured it as it is" : measuredAt(profile, postures) ? null : `measured with no ${postures.own} striker at a ${postures.target} target`;

/**
 * **The model** (`Model`) of `strikes` thrown by a body of `striker` at one of `struck`, read at
 * `postures`: each by its profile against that body (`profileAgainst`) where it is fresh at the
 * senses' reaction time and measured at those postures, each other by the prior of every limb it
 * is thrown with: a strike measured only on a body standing says nothing of one lying
 * (`measuredAt`).
 */
function modelOf(seen: Seen, strikes: readonly ModelledStrike[], striker: BodySpec, struck: BodySpec, postures: Postures): Model {
  const reaction = reactionOf(seen), measured: Model["measured"][number][] = [], unmeasured = new Set<string>(), why: string[] = [];
  for (const strike of strikes) {
    const profile = profileAgainst(strike.profiles, struck), hand = byHandAt(profile, postures), stale = staleAt(profile, reaction, seen.hz);
    if (hand === null) { measured.push({ limbs: strike.limbs, reading: readProfile(profile!, striker, postures) }); if (stale !== null) why.push(`${strike.name} stale, ${stale}`); }
    else { why.push(`${strike.name} by hand, ${hand}`); for (const limb of strike.limbs) unmeasured.add(limb); }
  }
  return { measured, unmeasured: [...unmeasured], priced: why.length ? why.join("; ") : strikes.length ? "measured" : "no strike to model" };
}

/**
 * **The strikes a foe of `foe` is modelled by**: every one measured on its body, whatever its
 * character holds, which is not sensed (`profilesOn`, each skill's profiles with a limb one
 * strike, `strikesOf`; its pressure reads them pooled, `pooled`), else this
 * body's own measured (`Seen.strikes`), each
 * read by its profile against this body (`modelOf`), fresh at the senses' reaction time and
 * this mind's rate (`Seen.rate`: a foe's mind is taken for one like it) and thrown with the limb it names (`Measured.limb`); and each other limb the foe strikes with
 * (`defaultStrikeLimbs`), by its prior. A foe's strikes are not sensed, so its limbs stand for them: a limb
 * no measured strike throws is priced by hand while the others are measured.
 */
function foeModel(seen: Seen, foe: BodySpec, postures: Postures = STANDING): Model {
  const reaction = reactionOf(seen), on = profilesOn(seen.measured, foe, { hz: seen.hz, reaction, rate: seen.rate, delay: seen.delay });
  const strikes: readonly ModelledStrike[] = on.read.length ? strikesOf(on.read)
    : seen.strikes.filter((strike) => profileAgainst(strike.profiles, seen.spec) !== null);
  const thrown = new Set(strikes.flatMap((strike) => strike.limbs)), limbs = defaultStrikeLimbs(foe).filter((limb) => !thrown.has(limb));
  const model = modelOf(seen, [...strikes, ...limbs.map((limb) => ({ name: limb, limbs: [limb], profiles: [] }))], foe, seen.spec, postures);
  const source = on.read.length ? (on.stale === null ? "measured" : `measured, stale, ${on.stale}`) : strikes.length ? `as its own strikes, ${on.stale}` : `by hand, ${on.stale}`;
  return { ...model, priced: limbs.length && strikes.length ? `${source}; by hand: ${limbs.join(", ")}` : source };
}

/**
 * **How far a foe of `foe` reaches a body of `struck` with the foe in `phase`**, m centre to centre:
 * the farthest any strike measured on its body reads (`ProfileReading.reach`), each read by its
 * profile against that body (`strikesOf`, `profileAgainst`), as a Mind reads a foe's reach
 * (`foeModel`, `edgeOf`); -Infinity where none reads in that phase.
 */
export function measuredReach(profiles: readonly Profile[], foe: BodySpec, struck: BodySpec, phase: string): number {
  let reach = -Infinity;
  for (const strike of strikesOf(profiles.filter((profile) => profile.measured.body === foe.model && limbHoldsAsMeasured(profile, foe)))) {
    const profile = profileAgainst(strike.profiles, struck);
    if (profile) reach = Math.max(reach, readProfile(profile, foe, STANDING).reach(phase));
  }
  return reach;
}

/** **The strikes `profiles` measure**, each skill's profiles with one limb one strike (`ModelledStrike`), named by its skill and its limb and thrown with that limb. */
function strikesOf(profiles: readonly Profile[]): readonly ModelledStrike[] {
  const bySkill = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const { skill, limb } = profile.measured, name = limb === undefined ? skill : `${skill} ${limb}`, of = bySkill.get(name);
    if (of) of.push(profile); else bySkill.set(name, [profile]);
  }
  return [...bySkill].map(([name, of]) => ({ name, limbs: of[0]!.measured.limb === undefined ? [] : [of[0]!.measured.limb], profiles: of }));
}

/** **This body's own strikes** (`Seen.strikes`) at a body of `struck`, read at `postures` (`modelOf`). */
const ownModel = (seen: Seen, struck: BodySpec, postures: Postures): Model => modelOf(seen, seen.strikes, seen.spec, struck, postures);

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/**
 * **What one body's strikes are expected to deal another**: the strikes it is modelled by
 * (`model`, each read through its profile at how the two stand, `ProfileReading`), read at the
 * struck body's phase (`phase`) and in its life (`struck`), the most of them a second at any range
 * (`peak`, the struck body's life), and how it is priced (`priced`, a sentence). Each limb its
 * model reads by hand (`Model.unmeasured`) is, between two standing bodies, its prior (`prior`):
 * within that limb's reach (`limbReach`), `RATE` blows a second, landing as this body's own do
 * (`record`), each that limb's blow (`blowLife`); a body lying, or struck lying, deals none by
 * hand. Its latency (`latency`), s: how long a blow not yet begun takes to reach the struck body
 * once it is within reach, the striker's mind taken for one like this (its rethink, `DECIDING`, and
 * its command's delay, `Seen.delay`) and its fastest blow's run (`ProfileReading.fastest`). The
 * focus's on this body (`pressure`), and this body's on the focus (`pressing`); none with no focus.
 */
export interface Pressure {
  readonly model: readonly ProfileReading[];
  readonly phase: string;
  readonly struck: BodySpec | null;
  readonly peak: number;
  readonly latency: number;
  readonly priced: string;
  /** How the striker and the struck body stand toward each other (`Stances`), at which its model is read; absent, read as alike any. */
  readonly stance?: Stances;
  /** The rate at an exact start, where a search keeps query scratch (`cachedPressure`). */
  readonly rateAt?: (range: number, velocity: readonly [number, number]) => number;
  /** What bouts measured the focus's fighting took from the body (`PressureTable`), read where it reads (`pressureCurve`), the focus in `doing` as now. */
  readonly measured?: { readonly table: PressureTable; readonly doing: string };
}

/** No pressure: no focus. */
const NO_PRESSURE: Pressure = deepFreeze({ model: [], phase: "clear", struck: null, peak: 0, latency: Infinity, priced: "no focus" });

/**
 * Where a prior (`pressureBy`) puts a striker's limbs: each within its reach (`limbReach`) of the
 * struck body's centre, or each over the struck body, at no range; none where the two stand so
 * that no prior is of it.
 */
type Placing = "reach" | "over" | null;

/**
 * **The pressure** (`Pressure`) of strikes `model` by a body of `striker` on a body of `struck` in
 * `phase`: each measured, and the prior of each limb it reads by hand, placed by `placing`.
 */
function pressureBy(seen: Seen, model: Model, phase: string, striker: BodySpec, struck: BodySpec, placing: Placing): Pressure {
  const lands = model.unmeasured.length === 0 || placing === null ? 0 : record(seen.sight.report.ledger, null).lands;
  const readings = model.measured.map((one) => one.reading);
  if (placing !== null) for (const limb of model.unmeasured)
    readings.push(prior(striker, struck, placing === "over" ? 0 : limbReach(striker, limb), lands * blowLife(seen.rules, striker, limb, struck), 1 / RATE));
  let peak = 0, fastest = Infinity;
  for (const reading of readings) { peak = Math.max(peak, reading.peak(phase, struck)); fastest = Math.min(fastest, reading.fastest(phase)); }
  return { model: readings, phase, struck, peak, latency: DECIDING.rethink + seen.delay / seen.hz + fastest, priced: model.priced };
}

/** Where a prior puts the limbs of a body striking one whose posture is `posture` (`Placing`): within their reach of a body standing; none of one lying. */
const placingAt = (posture: string): Placing => posture === "standing" ? "reach" : null;

/** Each pooled profile (`pooled`), by the profiles it pools, in their order: a profile is immutable. */
interface Pools { pool?: Profile; readonly next: WeakMap<Profile, Pools> }
const POOLS: Pools = { next: new WeakMap() };

/**
 * **A foe's measured strikes as one** (`Model`): the trials of every profile of `model` pooled into
 * one profile, read for `striker` at `postures`, thrown with any of their limbs. A foe throws one
 * blow at a time, which of them unsensed: read as one, what it deals from a start is the mean of the
 * trials nearest it of whichever strikes were measured there, where the most of each strike's own
 * reading is the most of noisy readings. A model of one profile or none is as it is.
 */
function pooled(model: Model, striker: BodySpec, postures: Postures): Model {
  if (model.measured.length < 2) return model;
  const profiles = model.measured.map((one) => one.reading.profile), first = profiles[0]!;
  let at = POOLS;
  for (const profile of profiles) { let next = at.next.get(profile); if (!next) at.next.set(profile, next = { next: new WeakMap() }); at = next; }
  const { limb: _, ...measured } = first.measured;
  at.pool ??= deepFreeze({ measured: { ...measured, skill: profiles.map((profile) => `${profile.measured.skill} ${profile.measured.limb ?? ""}`.trim()).join(" + ") },
    trials: profiles.flatMap((profile) => profile.trials) });
  return { ...model, measured: [{ limbs: [...new Set(model.measured.flatMap((one) => one.limbs))], reading: readProfile(at.pool, striker, postures) }] };
}

/**
 * **The pressure** (`Pressure`) the focus puts on the body by its strikes' rate: its model read at
 * the focus's posture (`sensedPosture`), pooled (`pooled`), the body struck as standing.
 */
function ratePressure(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus) return NO_PRESSURE;
  const posture = sensedPosture(focus), postures = { own: posture, target: "standing" };
  return { ...pressureBy(seen, pooled(foeModel(seen, focus.spec, postures), focus.spec, postures), ownPhase(seen), focus.spec, spec, placingAt(posture)),
    stance: turned(carriedStances(spec, seen.sight.view, focus)) };
}

/**
 * **The others' model**: what the focus is expected to take from the body as the two fight
 * (`Pressure`). A mind's predictions choose its kind: the focus's strikes' rate (`RATE_OTHERS`),
 * or what bouts measured (`measuredOthers`). And where the focus's own steps carry it over the
 * seconds after while the body runs an Option of `kind` (`Choice.kind`; `steps`, m on the ground): with none, it stands,
 * and an Option's measured exit holds its trials' foe's steps; its velocity persisting
 * (`persisting`); or what bouts measured (`measuredSteps`). And whether its pressure holds the
 * blow coming (`holdsBlow`), so none is priced beside it (`Predictions.danger`).
 */
export interface OthersModel {
  pressure(seen: Seen): Pressure;
  holdsBlow?(seen: Seen): boolean;
  steps?(seen: Seen, seconds: number, kind: string): Ground;
}

/**
 * **The foe's steps as bouts measured them**: how far the focus came toward the body, centre to
 * centre on the ground, m, by the seconds after (`horizons`), from moments `band` m apart by the
 * range centre to centre (each cell's lower edge, `range`) and the kind of the Option the body ran then (`kind`, `Choice.kind`),
 * on `n` moments; measured of a foe of `measured`'s numbers on a body of `target`'s
 * (`MeasuredPairing`).
 */
export interface FoeSteps extends MeasuredPairing {
  readonly band: number;
  readonly cells: readonly { readonly kind: string; readonly range: number; readonly n: number; readonly toward: readonly number[] }[];
}

/** The fewest moments a cell of the foe's steps is read on (`FoeSteps`). */
const STEPS_READ = 30;

/** Whether `value` is a table of the foe's steps (`FoeSteps`). */
export function validFoeSteps(value: unknown): value is FoeSteps {
  const table = value as FoeSteps;
  return validPairing(table) && Number.isFinite(table.band) && table.band > 0 && Array.isArray(table.cells)
    && table.cells.every((cell) => typeof cell.kind === "string" && Number.isFinite(cell.range) && Number.isFinite(cell.n) && Array.isArray(cell.toward)
      && cell.toward.length === table.horizons.length && cell.toward.every(Number.isFinite));
}

/**
 * **`others` with the foe's steps as bouts measured them** (`FoeSteps`): toward the body by the
 * cell of the range it stands at and the kind of Option the body runs, of those read on
 * `STEPS_READ` moments or more the nearest by range; over `seconds` as `alongHorizons` reads it.
 * None where no cell of that kind is, or where the table was measured of bodies not near these (`pairingApart`).
 */
export function measuredSteps(others: OthersModel, table: FoeSteps): OthersModel {
  const read = table.cells.filter((cell) => cell.n >= STEPS_READ), { horizons, band } = table;
  return Object.freeze({ ...others,
    steps(seen: Seen, seconds: number, kind: string): Ground {
      const focus = seen.focus;
      if (!focus || !(seconds > 0)) return NO_STEPS;
      if (pairingApart(table, focus.spec, seen.spec) > 1) return NO_STEPS;
      const where = seen.sight.view.stance.centre, dx = where.x - focus.centre.x, dz = where.z - focus.centre.z, apart = hypot(dx, dz);
      if (!(apart > 0)) return NO_STEPS;
      let cell: FoeSteps["cells"][number] | null = null;
      for (const one of read) if (one.kind === kind &&(!cell || Math.abs(one.range + band / 2 - apart) < Math.abs(cell.range + band / 2 - apart))) cell = one;
      if (!cell) return NO_STEPS;
      const toward = alongHorizons(horizons, cell.toward, seconds);
      return { x: dx / apart * toward, z: dz / apart * toward };
    } });
}

/**
 * **`others` with the focus's velocity persisting**: where its own steps carry it over `seconds`,
 * its velocity now fading as `e^(-t / persists)`: `v persists (1 - e^(-seconds / persists))`.
 */
export function persisting(others: OthersModel, persists: number): OthersModel {
  return Object.freeze({ ...others,
    steps(seen: Seen, seconds: number): Ground {
      const focus = seen.focus;
      if (!focus || !(seconds > 0)) return NO_STEPS;
      const carried = persists * (1 - exp(-seconds / persists));
      return { x: focus.velocity.x * carried, z: focus.velocity.z * carried };
    } });
}

/** No steps of the focus's own. */
const NO_STEPS: Ground = Object.freeze({ x: 0, z: 0 });

/** **The rate**: the focus throwing its strikes back to back from wherever it stands, each as its profile reads it (`ratePressure`). */
export const RATE_OTHERS: OthersModel = Object.freeze({ pressure: ratePressure });

/**
 * **What bouts measured**: where `tables` hold one of a standing focus's body fighting this one
 * (`pressureTable`), the rate read by it (`Pressure.measured`), the focus doing as it is now
 * (`foePhase`): its moments carry how soon its blows came, so no grace is kept of it (its latency
 * none), and what a blow under way took, so it holds the blow coming (`holdsBlow`); else the rate.
 */
export function measuredOthers(tables: readonly PressureTable[]): OthersModel {
  const tableOf = (seen: Seen): PressureTable | null => {
    const focus = seen.focus;
    return focus && sensedPosture(focus) === "standing" ? pressureTable(tables, focus.spec, seen.spec) : null;
  };
  return {
    pressure(seen) {
      const pressure = ratePressure(seen), table = tableOf(seen);
      return table ? { ...pressure, latency: 0, priced: `${pressure.priced}; measured in bouts`, measured: { table, doing: foePhase(seen.focus!, seen.blow) } } : pressure;
    },
    holdsBlow: (seen) => tableOf(seen) !== null,
  };
}

/**
 * **The pressure** (`Pressure`) the body's own strikes put on the focus: its strikes (`ownModel`),
 * read standing at the focus's posture (`sensedPosture`) and phase (`FoePhase`).
 */
function pressingOf(seen: Seen): Pressure {
  const { focus, spec } = seen;
  if (!focus) return NO_PRESSURE;
  const posture = sensedPosture(focus);
  return { ...pressureBy(seen, ownModel(seen, focus.spec, { own: "standing", target: posture }), foePhase(focus, seen.blow), spec, focus.spec, placingAt(posture)),
    stance: carriedStances(spec, seen.sight.view, focus) };
}

/**
 * **The life `seconds` s at `range` m apart, centre to centre, the two moving at `velocity`
 * (`startVelocity`), are expected to cost the struck body** under `pressure`: the most of its
 * strikes (a foe's pooled as one, `pooled`), each what its profile expects there a second (`ProfileReading.rate`) short of its reach
 * (`edgeOf`: the reach is where the body is out of it).
 */
function pressureAt(pressure: Pressure, range: number, velocity: readonly [number, number], seconds: number): number {
  return (pressure.rateAt ? pressure.rateAt(range, velocity) : pressureRateAt(pressure, range, velocity)) * seconds;
}

/**
 * How near a range may come to a reach and still read as at its edge, m: the rounding of one range
 * found by two routes (a spot placed at the edge of a reach, then measured back from where it is).
 */
const ROUNDING = 1e-9;

/** **Whether `range` m is within `reach` m**: short of it; a range at its edge, rounding aside (`ROUNDING`), is out of it. */
const within = (range: number, reach: number): boolean => range < reach - ROUNDING;

/** The most life a second the measured strikes of `pressure` deal at this start. */
function pressureRateAt(pressure: Pressure, range: number, velocity: readonly [number, number]): number {
  let rate = 0;
  for (const reading of pressure.model) {
    if (!within(range, reading.reach(pressure.phase))) continue;
    const expected = reading.rate(pressure.stance ? { range, phase: pressure.phase, velocity, stance: pressure.stance } : { range, phase: pressure.phase, velocity }, pressure.struck);
    if (expected !== null) rate = Math.max(rate, expected);
  }
  return rate;
}

/** Query scratch holds at most this many exact starts; four ways share each hash bucket. */
const PRESSURE_CACHE = Object.freeze({ buckets: 64, ways: 4 });

/**
 * `pressure` with bounded exact rate queries for one search. The arrays belong to that search,
 * never to its saved state. A bucket evicts its least recently used start; a miss reads the
 * original profiles in their order. Duration is applied by `pressureAt` on both hits and misses.
 */
export function cachedPressure(pressure: Pressure): Pressure {
  const { buckets, ways } = PRESSURE_CACHE, size = buckets * ways;
  const ranges = new Float64Array(size), forward = new Float64Array(size), across = new Float64Array(size), rates = new Float64Array(size), ages = new Float64Array(size);
  const values = new Float64Array(3), words = new Uint32Array(values.buffer);
  let clock = 0;
  return { ...pressure, rateAt(range, velocity) {
    const x = velocity[0], z = velocity[1];
    if (!Number.isFinite(range) || !Number.isFinite(x) || !Number.isFinite(z)) return pressureRateAt(pressure, range, velocity);
    values[0] = range; values[1] = x; values[2] = z;
    let hash = 0x811c9dc5;
    for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i]!, 0x01000193);
    // Fold high bits into the bucket: nearby floating point values often share their low bits.
    const from = ((hash ^ hash >>> 16) & (buckets - 1)) * ways;
    let oldest = from;
    for (let i = from; i < from + ways; i++) {
      if (ages[i]! > 0 && Object.is(ranges[i], range) && Object.is(forward[i], x) && Object.is(across[i], z)) {
        ages[i] = ++clock;
        return rates[i]!;
      }
      if (ages[i]! < ages[oldest]!) oldest = i;
    }
    const rate = pressureRateAt(pressure, range, velocity);
    ranges[oldest] = range; forward[oldest] = x; across[oldest] = z; rates[oldest] = rate; ages[oldest] = ++clock;
    return rate;
  } };
}

/** Each pressure read at another own stance (`stancedPressure`), by its pressure and that stance: a pressure and a stance are immutable. */
const STANCED = new WeakMap<Pressure, WeakMap<object, Pressure>>();

/**
 * **`pressure` with the body it reads standing at `own`** (`Pressure.stance`): `body`, the struck
 * (`target`: the focus's pressure on the body) or the striker (`own`: the body's on the focus);
 * its exact-start cache made anew for it (`cachedPressure`). Made once for the two; `pressure`
 * itself where it reads that body at `own` already, so a walk in the body's carriage asks nothing anew.
 */
export function stancedPressure(pressure: Pressure, body: keyof Stances, own: StanceNumbers): Pressure {
  if (pressure.stance?.[body] === own) return pressure;
  let by = STANCED.get(pressure);
  if (!by) STANCED.set(pressure, by = new WeakMap());
  const known = by.get(own);
  if (known) return known;
  const { rateAt: _, ...rest } = pressure, was = pressure.stance ?? {};
  const made = cachedPressure({ ...rest, stance: { ...was, [body]: own } });
  by.set(own, made);
  return made;
}

/** Still: the start's velocity with no focus. */
const AT_REST: readonly [number, number] = Object.freeze([0, 0]) as readonly [number, number];

/**
 * **The start's velocity at `now`** (`startVelocity`, what a profile reads a start by): the body's
 * velocity (`velocity`) against the focus's, along the line from where it stands to the focus and
 * across it, which reads the same from the focus; still with no focus.
 */
export function startOf(now: Pick<Situation, "focus" | "where" | "velocity">): readonly [number, number] {
  const focus = now.focus;
  return focus ? startVelocity({ x: focus.centre.x - now.where.x, z: focus.centre.z - now.where.z },
    { x: now.velocity.x - focus.velocity.x, z: now.velocity.z - focus.velocity.z }) : AT_REST;
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

/** **A span under the focus's pressure**: the two `apart` m head to head, moving at `velocity` (`startOf`), for `seconds` s from `from` s after now. */
export interface Span {
  readonly apart: number;
  readonly velocity: readonly [number, number];
  readonly seconds: number;
  readonly from: number;
}

/**
 * **The life a span (`Span`) costs the struck body under `pressure`**, at `now`: at the range
 * centre to centre its `apart` leaves, what bouts measured there (`Pressure.measured`) from `from`
 * to `from + seconds` s after a moment, the focus doing as now where `now` is the body's own and as
 * any where it is a state an Option leaves (`Situation.grace`), later than what it does now; else,
 * or where they measured none near, its strikes' rate (`pressureAt`).
 */
export function dealtAt(pressure: Pressure, now: Situation, { apart, velocity, seconds, from }: Span): number {
  const range = now.apart + apart - now.range, measured = pressure.measured;
  const curve = measured ? pressureCurve(measured.table, now.grace === undefined ? measured.doing : null, range) : null;
  return curve ? curve(from + seconds) - curve(from) : pressureAt(pressure, range, velocity, seconds);
}

/** **Whether the body at `now` is within the focus's reach** (`edgeOf` its pressure). */
export const inReach = (now: Situation): boolean => within(now.range, edgeOf(now, now.predictions.pressure));

/**
 * **What a body's reader keeps of the focus's reach**: for each foe, the seconds a blow it has not
 * begun would still take to reach the body (its grace), and when that was counted. Within the foe's
 * reach the grace is spent as time passes, out of it restored as time passes, never past the foe's
 * latency (`Pressure.latency`), which a foe first seen gives whole. It is counted when a decision
 * reads it (`graceAt`), the body taken as within or out of reach since the last count as it is now.
 */
export function reachMemory() {
  const state: Record<string, { grace: number; at: number }> = {};
  return {
    state,
    /** The grace at `now`'s focus, counted to `now`. */
    grace(now: Situation): number {
      const focus = now.focus, latency = now.predictions.pressure.latency;
      if (!focus || !Number.isFinite(latency)) return latency;
      let kept = state[focus.id];
      if (!kept) kept = state[focus.id] = { grace: latency, at: now.time };
      if (kept.at !== now.time) {
        const dt = now.time - kept.at;
        kept.grace = inReach(now) ? Math.max(0, kept.grace - dt) : Math.min(latency, kept.grace + dt);
        kept.at = now.time;
      }
      return Math.min(kept.grace, latency);
    },
  };
}

/** **A body's reach memory** (`reachMemory`). */
type ReachMemory = ReturnType<typeof reachMemory>;

/**
 * **The seconds before the focus's pressure reaches the body at `now`**: what a state an Option
 * leaves the body in carries (`Situation.grace`); else, at the state now, what its reader keeps
 * (`reachMemory`, `Situation.reached`).
 */
export const graceAt = (now: Situation): number => now.grace ?? now.reached.grace(now);

/**
 * **The own life `seconds` s cost under the focus's pressure** (`Pressure`, `dealtAt`), standing
 * where it stands at `now`, the two moving at `velocity` (`startOf`; the start's at `now` unless
 * given): none of the first s of its grace (`graceAt`), before a blow not yet begun reaches it.
 */
export const threatened = (now: Situation, seconds: number, velocity = startOf(now)): number =>
  dealtAt(now.predictions.pressure, now, { apart: now.range, velocity, seconds: Math.max(0, seconds - graceAt(now)), from: 0 });

/**
 * **The own life `blow` is expected to take**: the most its striker's measured strikes thrown with
 * its limb (`foeModel`) are expected to take at the striker's range, the two bodies' velocities
 * (`startVelocity`) and this body's phase, to their reach (a blow predicted to reach the head is in
 * reach); with none, its prior (`prior`): its
 * energy at the speed it closes, landing as often as `LANDS`. 0 with none: the blow coming's
 * (`danger`), where the foe's pressure does not hold it already (`OthersModel.holdsBlow`).
 */
function lifeOf(seen: Seen, blow: Seen["blow"]): number {
  const { spec, sight } = seen;
  if (!blow) return 0;
  const centre = sight.view.stance.centre, foe = blow.foe, range = hypot(foe.centre.x - centre.x, foe.centre.z - centre.z), phase = ownPhase(seen);
  const own = sight.view.stance.velocity, velocity = startVelocity({ x: foe.centre.x - centre.x, z: foe.centre.z - centre.z }, { x: own.x - foe.velocity.x, z: own.z - foe.velocity.z });
  const measured = foeModel(seen, blow.foe.spec).measured.filter((one) => one.limbs.includes(blow.limb)).map((one) => one.reading);
  const model = measured.length ? measured : [priorOf(blow.foe.spec, spec, range, LANDS * blowLife(seen.rules, blow.foe.spec, blow.limb, spec, blow.closing), 1)];
  let most = 0;
  const stance = turned(carriedStances(spec, sight.view, foe));
  for (const reading of model) most = Math.max(most, reading.expect({ range: Math.min(range, reading.reach(phase)), phase, velocity, stance }, spec)?.dealt ?? 0);
  return most;
}

/**
 * **What a second costs the body down in `posture`**, own life, against a foe of `foe` as it is
 * (`sensedPosture`; standing with no focus), as the foe's pressure reads it: the blows of the foe
 * over it (`Pressure.peak`: the foe's strikes read at its posture and a target lying in that
 * posture, in the phase down; a foe lying deals none by hand, `placingAt`). What a second on its
 * feet brings is priced by the Options that begin there, as the search reaches them.
 */
function downRateOf(seen: Seen, foe: BodySpec, posture: Position): number {
  const foeAt = seen.focus ? sensedPosture(seen.focus) : "standing", postures = { own: foeAt, target: posture };
  return pressureBy(seen, pooled(foeModel(seen, foe, postures), foe, postures), "down", foe, seen.spec, placingAt(foeAt) && "over").peak;
}

/** **What a second down costs in each posture** (`downRateOf`) against the focus, and with none one of its own kind; each found once a posture. */
function downRateAtOf(seen: Seen): (posture: Position) => number {
  const foe = seen.focus?.spec ?? seen.spec, rates = new Map<Position, number>();
  return (posture) => {
    let rate = rates.get(posture);
    if (rate === undefined) rates.set(posture, rate = downRateOf(seen, foe, posture));
    return rate;
  };
}

/**
 * **How the body and `other` stand toward each other, each in its carriage** (`stancesOf`,
 * `carriageOf`): what the Mind reads a profile at. Read so, a body walking in its own carriage is
 * asked at the stance it stands at, and a stride's swing of the feet asks nothing new.
 */
function carriedStances(spec: BodySpec, view: Sight["view"], other: BodySense): Stances {
  const { own, target } = stancesOf(spec, view, other);
  return { ...(own ? { own: carriageOf(spec.model, own) } : {}), ...(target ? { target: carriageOf(other.spec.model, target) } : {}) };
}

/** How two bodies stand with no focus: neither read. */
const NO_STANCES: Stances = Object.freeze({});

/**
 * **Every percept Option Mind reads**, by name: what it reads of the senses
 * and its own body with fixed geometry and kinematics, the same whatever a drill or the rules give.
 * Whether the body is down, how it lies (`Position`, what bears it, as the ground reading's label
 * settles: standing on its feet); what its reader keeps
 * of its rise (`Seen.risen`): whether it runs, the ground as its rise reads it (`ground`, none where
 * no rise runs), the seconds the body has been braced tumbling in it (`tumbled`) and the seconds its
 * regain has held it in its try (`regained`); where
 * on the ground it stands and the way it faces (`where`: its stance's centre and its heading); what
 * its reader keeps of the stretches it has spent within each foe's reach (`reached`, `reachMemory`); its
 * orders; its focus; how far off the focus is, centre to centre
 * across the ground (Infinity with none), and head to head (`range`, Infinity with none); its
 * bearing around the focus, rad from the focus's forward (its `marks.base`'s +z), positive to its
 * right (0 with none); a foe's blow predicted to reach the head (`READINGS.predicted`); a foe's
 * weapon near enough to ward off (`Seen.ward`); how late the senses show the focus (`reactionOf`), s; the
 * lead (its own life less the focus's, 0 with none) and how late in the bout it is (`lateness`:
 * the share of the clock's time from its start to its verdict that has passed, `Senses.begins` to
 * `Senses.ends`; 0 where no clock ends the bout). The gait's: where the stance is in a step
 * (`StanceReading.phase`), which feet the ground bears (`Bearing`) and the centre of mass's velocity
 * over the ground, m/s (`velocity`). What the controllers did not carry out: the legs' (`LegsReport.unmet`) and
 * the motor's (`BodyView.unmet`). The focus's phase (`FoePhase`), its posture (`sensedPosture`;
 * standing with no focus), and the time to contact of the
 * blow it strikes with, s (Infinity with none). Its cues: going down or getting up, another posture,
 * orders asking for something else (`ordersAsked`), another focus, a threat or a blow coming.
 */
const PERCEPTS = Object.freeze({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down } as Percept<boolean>,
  posture: { read: ({ sight }) => sight.view.ground?.position ?? (sight.view.down ? "between" : "standing"), cue: (posture) => posture } as Percept<Position>,
  rising: { read: (seen) => seen.risen.state.rising } as Percept<boolean>,
  ground: { read: ({ risen, sight }) => risen.state.rising ? sight.view.ground : null } as Percept<GroundReading | null>,
  tumbled: { read: (seen) => seen.risen.state.tumbled } as Percept<number>,
  regained: { read: (seen) => seen.risen.state.regained } as Percept<number>,
  where: { read: ({ sight }) => ({ x: sight.view.stance.centre.x, z: sight.view.stance.centre.z, face: sight.report.legs.heading }) } as Percept<Spot>,
  reached: { read: (seen) => seen.reach } as Percept<ReachMemory>,
  orders: { read: (seen) => seen.orders, cue: ordersAsked } as Percept<Orders | null>,
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null } as Percept<BodySense | null>,
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity } as Percept<number>,
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null } as Percept<Cover | null>,
  ward: { read: (seen) => seen.ward } as Percept<Cover | null>,
  range: { read: (seen) => { const { mine, theirs } = heads(seen); return theirs ? hypot(theirs.x - mine.x, theirs.z - mine.z) : Infinity; } } as Percept<number>,
  around: { read: ({ focus, sight }) => focus ? bearingAround(focus, sight.view.stance.centre.x, sight.view.stance.centre.z) : 0 } as Percept<number>,
  reaction: { read: reactionOf } as Percept<number | null>,
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 } as Percept<number>,
  lateness: { read: ({ sight }) => { const { begins, ends, time } = sight.view.senses; return begins === undefined || ends === undefined || !(ends > begins) ? 0 : Math.min(1, Math.max(0, (time - begins) / (ends - begins))); } } as Percept<number>,
  stride: { read: ({ sight }) => sight.view.stance.phase } as Percept<StancePhase>,
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.ends) } as Percept<Bearing>,
  velocity: { read: ({ sight }) => ({ x: sight.view.stance.velocity.x, z: sight.view.stance.velocity.z }) } as Percept<Ground>,
  legsUnmet: { read: ({ sight }) => sight.report.legs.unmet } as Percept<LegsUnmet>,
  motorUnmet: { read: ({ sight }) => sight.view.unmet } as Percept<MotorUnmet>,
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) } as Percept<FoePhase>,
  foePosture: { read: ({ focus }) => focus ? sensedPosture(focus) : "standing" } as Percept<Position>,
  stances: { read: ({ focus, spec, sight }) => focus ? carriedStances(spec, sight.view, focus) : NO_STANCES } as Percept<Stances>,
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity } as Percept<number>,
});

/**
 * **A prediction**: what data a drill, a training run or the rules make says of the situation,
 * stale with that data; read when an option or the position value asks for it, once a step at most
 * (`perceiver`).
 */
export interface Prediction<V> {
  read(seen: Seen): V;
}

/**
 * **Every prediction Option Mind reads**, by name: the own life the blow coming is expected to take
 * (`lifeOf`), 0 with none or where the foe's pressure holds it (`OthersModel.holdsBlow`); what the
 * focus is expected to deal the body (`Pressure`), and
 * what its own strikes are expected to deal the focus (`pressingOf`); what a second down in each
 * posture costs (`downRateAtOf`); how fast the focus turns to face (`turnOf`), rad/s, Infinity with none; where its own
 * steps carry it over a number of seconds while the body does one thing (`OthersModel.steps`), null where its model has none; and the
 * focus's life a blow of a limb at a segment of its takes by the rules (`blowLife`), 0 with no focus.
 */
const PREDICTIONS = Object.freeze({
  danger: { read: (seen) => seen.others.holdsBlow?.(seen) ? 0 : lifeOf(seen, seen.blow) } as Prediction<number>,
  pressure: { read: (seen) => seen.others.pressure(seen) } as Prediction<Pressure>,
  pressing: { read: pressingOf } as Prediction<Pressure>,
  downRate: { read: downRateAtOf } as Prediction<(posture: Position) => number>,
  turns: { read: ({ focus }) => focus ? turnOf(focus.spec) : Infinity } as Prediction<number>,
  steps: { read: (seen) => { const others = seen.others; return others.steps ? (seconds: number, kind: string) => others.steps!(seen, seconds, kind) : null; } } as Prediction<((seconds: number, kind: string) => Ground) | null>,
  blows: { read: ({ focus, spec, rules }) => (limb: string, segment: string): number => focus ? blowLife(rules, spec, limb, focus.spec, undefined, segment) : 0 } as Prediction<(limb: string, segment: string) => number>,
});

/** What each prediction says, by its name. */
export type Predictions = { readonly [K in keyof typeof PREDICTIONS]: typeof PREDICTIONS[K] extends Prediction<infer V> ? V : never };

/** What each percept reads, by its name. */
export type Percepts = { readonly [K in keyof typeof PERCEPTS]: typeof PERCEPTS[K] extends Percept<infer V> ? V : never };

/** The percepts' names, in their order. */
const PERCEIVED = Object.freeze(Object.keys(PERCEPTS) as (keyof typeof PERCEPTS)[]);

/** The predictions' names, in their order. */
const PREDICTED = Object.freeze(Object.keys(PREDICTIONS) as (keyof typeof PREDICTIONS)[]);

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze(PERCEIVED.filter((name) => PERCEPTS[name].cue !== undefined));

/**
 * **What a chooser watches of a body's situations** (`Situation.cues`): the cued percepts
 * (`Percept.cue`) asked for since it last cleared them, of any situation its reader made, and the
 * event those cues make.
 */
export interface Cues {
  /** **What changes the situation enough to decide at once**: the cue of each of the percepts `watched` names at `now`, as one text a chooser compares with the last; reading them is not asking. */
  event(now: Situation, watched: readonly string[]): string;
  /** Count the cued percepts asked for afresh. */
  clear(): void;
  /** The cued percepts asked for since `clear`, by name, in their order. */
  asked(): string[];
}

/** What a percept or prediction holds before it is first asked for. */
const UNREAD = Symbol("unread");

/** Where a situation and its predictions keep their `Memo`. */
const MEMO = Symbol("memo");

/**
 * **One situation's reading**: what it reads from (`Seen`), what each percept and then each
 * prediction read (`UNREAD` until asked), and what each part its config names read.
 */
interface Memo { readonly seen: Seen; readonly values: unknown[]; parts: Map<PartConfig, unknown> | null }

/** A situation or its predictions, keeping its `Memo`. */
type Memoized = Record<typeof MEMO, Memo>;

/**
 * **A body's situations** (`Situation`) read from a step's `Seen` (`at`): each percept and
 * prediction read the first time it is asked and kept, and each percept and prediction part an
 * option or an objective asks for by config (`perceive`, `predict`: a `ProfilePerceptPart`'s or
 * `ProfilePredictionPart`'s, made once a config through `parts`), read the same way. Every situation's
 * readings are getters on one prototype made here; a situation keeps its own, so one kept past
 * its step reads its own step. Which cued percepts any of its situations was asked for is counted
 * for a chooser (`Cues`).
 */
export function perceiver(parts?: PartLookup) {
  /** The cued percepts asked for since `Cues.clear`, a bit each, by their place in `CUED`. */
  let asked = 0;
  const made = new Map<PartConfig, Percept<unknown>>();
  /** What `reading` reads in `memo`'s situation, at `i` of its values: read the first time it is asked. */
  const memoized = (memo: Memo, i: number, reading: { read(seen: Seen): unknown }): unknown => {
    const value = memo.values[i];
    return value === UNREAD ? memo.values[i] = reading.read(memo.seen) : value;
  };
  /** What the part of `role` that `config` names reads in `memo`'s situation, once. */
  const readPart = (memo: Memo, role: "profile-percept" | "profile-prediction", config: PartConfig): unknown => {
    const read = memo.parts ??= new Map();
    if (read.has(config)) return read.get(config);
    if (!parts) throw new Error(`a ${role} part read with no part lookup: ${config.kind}`);
    let reading = made.get(config);
    if (!reading) made.set(config, reading = parts.of(role, config).make(config));
    const value = reading.read(memo.seen);
    read.set(config, value);
    return value;
  };
  const cues: Cues = {
    event(now, watched) {
      const was = asked, text = JSON.stringify(watched.map((name) => (PERCEPTS[name as keyof Percepts] as Percept<unknown>).cue!(now[name as keyof Percepts])));
      asked = was;
      return text;
    },
    clear() { asked = 0; },
    asked: () => CUED.filter((_, c) => (asked & 1 << c) !== 0),
  };
  const situation = {
    cues,
    perceive(this: Memoized, config: PartConfig): unknown { return readPart(this[MEMO], "profile-percept", config); },
    predict(this: Memoized, config: PartConfig): unknown { return readPart(this[MEMO], "profile-prediction", config); },
  };
  PERCEIVED.forEach((name, i) => {
    const percept = PERCEPTS[name] as Percept<unknown>, bit = CUED.includes(name) ? 1 << CUED.indexOf(name) : 0;
    Object.defineProperty(situation, name, { get(this: Memoized) { asked |= bit; return memoized(this[MEMO], i, percept); } });
  });
  const predictions = {};
  PREDICTED.forEach((name, i) => Object.defineProperty(predictions, name, { get(this: Memoized) { return memoized(this[MEMO], PERCEIVED.length + i, PREDICTIONS[name]); } }));
  return {
    /** **The situation `seen` reads**, its percepts and predictions read as they are asked. */
    at(seen: Seen): Situation {
      const memo: Memo = { seen, values: new Array<unknown>(PERCEIVED.length + PREDICTED.length).fill(UNREAD), parts: null };
      const now = Object.create(situation) as Memoized & { sight: Sight; time: number; predictions: Predictions };
      now.sight = seen.sight; now.time = seen.sight.view.time; now[MEMO] = memo;
      const said = Object.create(predictions) as Memoized;
      said[MEMO] = memo;
      now.predictions = said as unknown as Predictions;
      return now as unknown as Situation;
    },
  };
}

/** Percepts owned by the profile model consume that model's complete Seen value. */
export interface ProfilePerceptPart<C extends PartConfig = PartConfig, P = unknown> extends Part<C> {
  readonly role: "profile-percept";
  readonly keys: KeysOf<C>;
  make(config: C): Percept<P>;
}

/** Predictions owned by the profile model consume that model's complete Seen value. */
export interface ProfilePredictionPart<C extends PartConfig = PartConfig, P = unknown> extends Part<C> {
  readonly role: "profile-prediction";
  readonly keys: KeysOf<C>;
  make(config: C): Prediction<P>;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly "profile-percept": ProfilePerceptPart;
    readonly "profile-prediction": ProfilePredictionPart;
  }
}
