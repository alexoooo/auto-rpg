import type { StanceReading } from "../../../control/stance/goal.ts";
import { turnAt } from "../../../control/stance/stance-envelope.ts";
import { stanceEnvelopeOf } from "../../../skills/locomotion/shared/stance/envelope.ts";
import { atan2, hypot } from "../../../core/math/real.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { defaultStrikeLimbs } from "../../../skills/perception/default-strike-limbs.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { Cover } from "../../../skills/framework/intent.ts";
import { ordersAsked, type Orders } from "../../orders.ts";
import { limbHoldsAsMeasured, profilesOn, sameReaction } from "../../../skills/framework/profile/lookup.ts";
import { measuredAt, STANDING, type Postures, type Profile, type StanceNumbers, type Stances } from "../../../skills/framework/profile/profile.ts";
import { profileAgainst } from "../../../skills/framework/profile/across.ts";
import { readProfile, type ProfileReading } from "../../../skills/framework/profile/reading.ts";
import { startVelocity } from "../../../skills/framework/profile/numbers.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { Sight } from "../../decider.ts";
import { foePhase, sensedPosture } from "../../../skills/perception/threat.ts";
import { stancesOf, turned } from "../../../skills/perception/stance-numbers.ts";
import { carriageOf } from "../../../skills/locomotion/move/gaits.ts";
import type { Position } from "../../../control/ground-reading.ts";
import type { RiseMemory } from "./rise-memory.ts";
import type { ExchangePredictor, FoeMove, Guesses, Placing } from "../contract/predictors.ts";
import type { Bearing, Cues, ModelledStrike, Percepts, Predictions, Pressure, ReachMemory, Seen, Situation, Span } from "../contract/situation.ts";
import type { Terms } from "../contract/terms.ts";
import { pressureCurve, pressureTable, type PressureTable } from "../predictions/exchange/pressure-table.ts";
import { pricedBy, UNMEASURED_TURN } from "../predictions/by-hand.ts";
import { blowLife } from "../predictions/damage.ts";
import { RETHINK } from "../options/outcomes.ts";

/**
 * **What every percept reads from**, a step's: what a predictor reads (`Seen`), and with it the
 * body's orders, a foe's weapon to ward off, read the first time the step asks for it, and what
 * its reader keeps of its rise and of each foe's reach.
 */
export interface ReaderSeen extends Seen {
  readonly orders: Orders | null;
  /** A foe's weapon to ward off, at the hand that holds it (`READINGS.ward`); null with none. */
  readonly ward: Cover | null;
  readonly risen: RiseMemory;
  /** What its reader keeps of the stretches the body has spent within and out of each foe's reach (`reachMemory`). */
  readonly reach: ReachMemory;
}

/**
 * **What the profile predictor is built with** (`ProfileExchange`): the body's own strikes, each
 * with its profiles measured as the body reads it (`ModelledStrike`); every striker's measured
 * strikes, which model a foe's (`ProfileExchange.foeModel`); and what bouts measured a foe's fighting took from a
 * body (`PressureTable`), null to read the foe's strikes' rate alone.
 */
interface ProfileTables {
  readonly strikes: readonly ModelledStrike[];
  readonly measured: readonly Profile[];
  readonly pressures: readonly PressureTable[] | null;
}

/**
 * **A percept**: one named reading of what the body senses, read the first time a step asks for it
 * (`perceiver`). Its cue, where it has one, is what of it a chooser watches where its last decision
 * asked for it (`Cues`): a change in the cue is an event, on which the chooser decides at once.
 */
interface Percept<V> {
  read(seen: ReaderSeen): V;
  cue?(value: V): unknown;
}

/** This body's head, and the focus's (its `marks.high`, else its centre). */
const heads = ({ focus, sight }: Seen) => ({ mine: sight.view.head, theirs: focus ? focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre : null });

/** The feet of `ends` the ground bears. */
const bearingOf = (ends: StanceReading["ends"]): Bearing => Object.keys(ends).filter((end) => ends[end]!.touching);

/** Each spec's turn standing measured on its body, rad/s, found once; where none was measured, what it is taken for (`UNMEASURED_TURN`). */
const TURNS = new WeakMap<BodySpec, number>();

/** **How fast a body of `spec` turns to face**, rad/s: its measured turn walking slowest (`turnAt`, `stanceEnvelopeOf`); where none was measured, what it is taken for (`UNMEASURED_TURN`). */
function turnOf(spec: BodySpec): number {
  const known = TURNS.get(spec);
  if (known !== undefined) return known;
  const envelope = stanceEnvelopeOf(spec), turn = envelope ? turnAt(envelope, 0) : 0, rate = turn > 0 ? turn : UNMEASURED_TURN;
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
 * **The strikes a body is modelled by**: each measured, read for its striker (`readProfile`), with
 * the limbs that throw it; the limbs the rest are thrown with, each read by its guess where the
 * Mind has guesses and the two stand so that one is of it (`pressureBy`, `lifeOf`); and how they
 * are priced, a sentence.
 */
interface Model {
  readonly measured: readonly { readonly limbs: readonly string[]; readonly reading: ProfileReading }[];
  readonly unmeasured: readonly string[];
  readonly priced: string;
}

/** Why a strike of `profile` (null with none) is stale with the senses `reaction` s late, a sentence (`sameReaction`); null where it is fresh or there is none. A stale profile is still read. */
const staleAt = (profile: Profile | null, reaction: number | null, hz: number): string | null =>
  !profile || sameReaction(profile.measured.reaction, reaction, hz) ? null : `measured with senses ${profile.measured.reaction} s late, read ${reaction} s late`;

/** Why a strike of `profile` is not read by its profile at `postures`, a sentence: none measured it, or measured it with the bodies standing otherwise (`measuredAt`); null where its profile reads them, stale or not. */
const unreadAt = (profile: Profile | null, postures: Postures): string | null =>
  !profile ? "no fight measured it as it is" : measuredAt(profile, postures) ? null : `measured with no ${postures.own} striker at a ${postures.target} target`;

/**
 * **The model** (`Model`) of `strikes` thrown by a body of `striker` at one of `struck`, read at
 * `postures`: each by its profile against that body (`profileAgainst`) where it is fresh at the
 * senses' reaction time and measured at those postures, each other left to the guess of every limb
 * it is thrown with: a strike measured only on a body standing says nothing of one lying
 * (`measuredAt`). Its sentence says how such a strike is priced (`pricedBy` of `guesses`).
 */
function modelOf(seen: Seen, { strikes, striker, struck, postures, guesses }: { readonly strikes: readonly ModelledStrike[]; readonly striker: BodySpec; readonly struck: BodySpec; readonly postures: Postures; readonly guesses: Guesses | null }): Model {
  const reaction = reactionOf(seen), measured: Model["measured"][number][] = [], unmeasured = new Set<string>(), said: string[] = [];
  for (const strike of strikes) {
    const profile = profileAgainst(strike.profiles, struck), why = unreadAt(profile, postures), stale = staleAt(profile, reaction, seen.hz);
    if (why === null) { measured.push({ limbs: strike.limbs, reading: readProfile(profile!, striker, postures) }); if (stale !== null) said.push(`${strike.name} stale, ${stale}`); }
    else { said.push(`${strike.name} ${pricedBy(guesses)}, ${why}`); for (const limb of strike.limbs) unmeasured.add(limb); }
  }
  return { measured, unmeasured: [...unmeasured], priced: said.length ? said.join("; ") : strikes.length ? "measured" : "no strike to model" };
}

/**
 * **How far a foe of `foe` reaches a body of `struck` with the foe in `phase`**, m centre to centre:
 * the farthest any strike measured on its body reads (`ProfileReading.reach`), each read by its
 * profile against that body (`strikesOf`, `profileAgainst`), as a Mind reads a foe's reach
 * (`ProfileExchange.foeModel`, `ProfilePressure.edge`); -Infinity where none reads in that phase.
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

/** This body's phase as a foe's strike meets it (`FoePhase`'s): striking while a blow of its own is under way, else clear. */
const ownPhase = ({ sight }: Seen): string => sight.report.actions.length > 0 ? "striking" : "clear";

/**
 * **What makes the pressure** (`PressureFields`) of strikes `model` by a body of `striker` on a body of `struck` in
 * `phase`: each measured, and, where the Mind has `guesses`, the guess of each limb its model
 * has no profile of (`Model.unmeasured`, `Guesses.limb`), placed by `placing`: null where the two
 * stand so that no guess is of it (a body lying, or struck lying, deals none by a guess). With no
 * guesses such a limb adds nothing. Its latency takes the striker's mind for one like this (its rethink, `RETHINK`, and its
 * command's delay, `Seen.delay`) and adds its fastest blow's run (`ProfileReading.fastest`).
 */
function pressureBy(seen: Seen, { model, phase, striker, struck, placing, guesses }: { readonly model: Model; readonly phase: string; readonly striker: BodySpec; readonly struck: BodySpec; readonly placing: Placing | null; readonly guesses: Guesses | null }): PressureFields {
  const readings = model.measured.map((one) => one.reading);
  if (guesses && placing !== null) for (const limb of model.unmeasured) readings.push(guesses.limb(seen, { striker, struck, limb, placing }));
  let peak = 0, fastest = Infinity;
  for (const reading of readings) { peak = Math.max(peak, reading.peak(phase, struck)); fastest = Math.min(fastest, reading.fastest(phase)); }
  return { model: readings, phase, struck, peak, latency: RETHINK + seen.delay / seen.hz + fastest, priced: model.priced };
}

/** Where a guess puts the limbs of a body striking one whose posture is `posture` (`Placing`): within their reach of a body standing; null of one lying, which no guess is of. */
const placingAt = (posture: string): Placing | null => posture === "standing" ? "reach" : null;

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
 * How near a range may come to a reach and still read as at its edge, m: the rounding of one range
 * found by two routes (a spot placed at the edge of a reach, then measured back from where it is).
 */
const ROUNDING = 1e-9;

/** **Whether `range` m is within `reach` m**: short of it; a range at its edge, rounding aside (`ROUNDING`), is out of it. */
const within = (range: number, reach: number): boolean => range < reach - ROUNDING;

/**
 * **What a `ProfilePressure` is made of**: the strikes it is modelled by (`model`, each read
 * through its profile at how the two stand, `ProfileReading`), read at the struck body's phase
 * (`phase`) and in its life (`struck`); the most of them a second at any range (`peak`), its
 * latency and how it is priced (`Pressure`); how the striker and the struck body stand toward
 * each other (`stance`), at which its model is read, alike any where absent; and what bouts
 * measured the focus's fighting took from the body (`measured`: a `PressureTable`, read where
 * it reads, `pressureCurve`, the focus in `doing` as now).
 */
interface PressureFields {
  readonly model: readonly ProfileReading[];
  readonly phase: string;
  readonly struck: BodySpec | null;
  readonly peak: number;
  readonly latency: number;
  readonly priced: string;
  readonly stance?: Stances;
  readonly measured?: { readonly table: PressureTable; readonly doing: string };
}

/** A search's scratch holds at most this many exact starts; four ways share each hash bucket. */
const PRESSURE_CACHE = Object.freeze({ buckets: 64, ways: 4 });

/**
 * **One search's scratch of a pressure's exact starts** (`ProfilePressure.cached`): each start
 * kept (its range and the two parts of its velocity), the rate found there, and when it was last
 * asked for (`ages`, by `clock`; 0, never). `values` and `words` are one start's numbers and
 * their bits, which it is hashed by.
 */
interface Starts {
  readonly ranges: Float64Array;
  readonly forward: Float64Array;
  readonly across: Float64Array;
  readonly rates: Float64Array;
  readonly ages: Float64Array;
  readonly values: Float64Array;
  readonly words: Uint32Array;
  clock: number;
}

/** An empty scratch (`Starts`). */
function startsOf(): Starts {
  const size = PRESSURE_CACHE.buckets * PRESSURE_CACHE.ways, values = new Float64Array(3);
  return { ranges: new Float64Array(size), forward: new Float64Array(size), across: new Float64Array(size), rates: new Float64Array(size), ages: new Float64Array(size),
    values, words: new Uint32Array(values.buffer), clock: 0 };
}

/** Each pressure read at another own stance (`ProfilePressure.stanced`), by its pressure and that stance: a pressure and a stance are immutable. */
const STANCED = new WeakMap<ProfilePressure, WeakMap<object, ProfilePressure>>();

/**
 * **A pressure read from measured profiles** (`Pressure`, of `PressureFields`). What it takes
 * over a span is what bouts measured where it holds their table and they measured near, else the
 * most of its strikes' rates there (a foe's pooled as one, `pooled`). What it is made of never
 * changes: a pressure at another stance, or one keeping a search's scratch, is another pressure.
 */
class ProfilePressure implements Pressure {
  readonly latency: number;
  readonly peak: number;
  readonly priced: string;
  private readonly fields: PressureFields;
  // A cache: one search's exact starts and the rate read at each. Null where it keeps none.
  private readonly starts: Starts | null;

  constructor(fields: PressureFields, starts: Starts | null) {
    this.latency = fields.latency;
    this.peak = fields.peak;
    this.priced = fields.priced;
    this.fields = fields;
    this.starts = starts;
  }

  /**
   * At the range centre to centre the span's `apart` leaves: what bouts measured there
   * (`measured`) from `from` to `from + seconds` s after a moment, the focus doing as now where
   * `now` is the body's own and as any where it is a state an Option leaves (`Situation.grace`),
   * later than what it does now; else, or where they measured none near, its strikes' rate there
   * for the span's seconds (`rateAt`).
   */
  dealt(now: Situation, { apart, velocity, seconds, from }: Span): number {
    const range = now.apart + apart - now.range, measured = this.fields.measured;
    const curve = measured ? pressureCurve(measured.table, now.grace === undefined ? measured.doing : null, range) : null;
    return curve ? curve(from + seconds) - curve(from) : this.rateAt(range, velocity) * seconds;
  }

  /** Its strikes' farthest range at its phase (`ProfileReading.reach`), as the range at `now` places it; 0 with no strikes. */
  edge(now: Pick<Situation, "range" | "apart">): number {
    const { model, phase } = this.fields;
    if (model.length === 0) return 0;
    let range = -Infinity;
    for (const reading of model) range = Math.max(range, reading.reach(phase));
    return now.range + range - now.apart;
  }

  /**
   * Made once for the pressure and the stance (`STANCED`), with a search's scratch of its own;
   * itself where it reads that body at `own` already, so a walk in the body's carriage asks
   * nothing anew.
   */
  stanced(own: StanceNumbers): ProfilePressure {
    const fields = this.fields;
    if (fields.stance?.target === own) return this;
    let by = STANCED.get(this);
    if (!by) STANCED.set(this, by = new WeakMap());
    const known = by.get(own);
    if (known) return known;
    const made = new ProfilePressure({ ...fields, stance: { ...fields.stance, target: own } }, startsOf());
    by.set(own, made);
    return made;
  }

  cached(): ProfilePressure { return new ProfilePressure(this.fields, startsOf()); }

  /**
   * The most life a second its strikes deal at this start. Where it keeps a search's scratch
   * (`Starts`) an exact start asked before is answered from it; a bucket evicts its least recently
   * used start, and a miss reads the profiles (`read`).
   */
  private rateAt(range: number, velocity: readonly [number, number]): number {
    const starts = this.starts, x = velocity[0], z = velocity[1];
    if (!starts || !Number.isFinite(range) || !Number.isFinite(x) || !Number.isFinite(z)) return this.read(range, velocity);
    const { ranges, forward, across, rates, ages, values, words } = starts, { buckets, ways } = PRESSURE_CACHE;
    values[0] = range; values[1] = x; values[2] = z;
    let hash = 0x811c9dc5;
    for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i]!, 0x01000193);
    // Fold high bits into the bucket: nearby floating point values often share their low bits.
    const from = ((hash ^ hash >>> 16) & (buckets - 1)) * ways;
    let oldest = from;
    for (let i = from; i < from + ways; i++) {
      if (ages[i]! > 0 && Object.is(ranges[i], range) && Object.is(forward[i], x) && Object.is(across[i], z)) {
        ages[i] = ++starts.clock;
        return rates[i]!;
      }
      if (ages[i]! < ages[oldest]!) oldest = i;
    }
    const rate = this.read(range, velocity);
    ranges[oldest] = range; forward[oldest] = x; across[oldest] = z; rates[oldest] = rate; ages[oldest] = ++starts.clock;
    return rate;
  }

  /** The most of its strikes at this start, each what its profile expects there a second (`ProfileReading.rate`) short of its reach: the reach is where the body is out of it. */
  private read(range: number, velocity: readonly [number, number]): number {
    const { model, phase, stance, struck } = this.fields;
    let rate = 0;
    for (const reading of model) {
      if (!within(range, reading.reach(phase))) continue;
      const expected = reading.rate(stance ? { range, phase, velocity, stance } : { range, phase, velocity }, struck);
      if (expected !== null) rate = Math.max(rate, expected);
    }
    return rate;
  }
}

/** No pressure: no focus. */
const NO_PRESSURE = deepFreeze(new ProfilePressure({ model: [], phase: "clear", struck: null, peak: 0, latency: Infinity, priced: "no focus" }, null));

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

/** **Whether the body at `now` is within the focus's reach** (`Pressure.edge`). */
export const inReach = (now: Situation): boolean => within(now.range, now.predictions.pressure.edge(now));

/**
 * **What a body's reader keeps of the focus's reach**: for each foe, the seconds a blow it has not
 * begun would still take to reach the body (its grace), and when that was counted. Within the foe's
 * reach the grace is spent as time passes, out of it restored as time passes, never past the foe's
 * latency (`Pressure.latency`), which a foe first seen gives whole. It is counted when a decision
 * reads it (`graceAt`), the body taken as within or out of reach since the last count as it is now.
 */
export function reachMemory(): ReachMemory {
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

/**
 * **The seconds before the focus's pressure reaches the body at `now`**: what a state an Option
 * leaves the body in carries (`Situation.grace`); else, at the state now, what its reader keeps
 * (`reachMemory`, `Situation.reached`).
 */
export const graceAt = (now: Situation): number => now.grace ?? now.reached.grace(now);

/**
 * **The own life `seconds` s cost under the focus's pressure** (`Pressure.dealt`), standing
 * where it stands at `now`, the two moving at `velocity` (`startOf`; the start's at `now` unless
 * given): none of the first s of its grace (`graceAt`), before a blow not yet begun reaches it.
 */
export const threatened = (now: Situation, seconds: number, velocity = startOf(now)): number =>
  now.predictions.pressure.dealt(now, { apart: now.range, velocity, seconds: Math.max(0, seconds - graceAt(now)), from: 0 });

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

/** **How each percept is read** (`Percepts`, which says what each is), by its name, in the order a situation keeps them; with its cue, where a chooser watches it (`Percept.cue`). */
const PERCEPTS = Object.freeze<{ readonly [K in keyof Percepts]: Percept<Percepts[K]> }>({
  down: { read: (seen) => seen.sight.view.down, cue: (down) => down },
  posture: { read: ({ sight }) => sight.view.ground?.position ?? (sight.view.down ? "between" : "standing"), cue: (posture) => posture },
  rising: { read: (seen) => seen.risen.state.rising },
  ground: { read: ({ risen, sight }) => risen.state.rising ? sight.view.ground : null },
  tumbled: { read: (seen) => seen.risen.state.tumbled },
  regained: { read: (seen) => seen.risen.state.regained },
  where: { read: ({ sight }) => ({ x: sight.view.stance.centre.x, z: sight.view.stance.centre.z, face: sight.report.legs.heading }) },
  reached: { read: (seen) => seen.reach },
  orders: { read: (seen) => seen.orders, cue: ordersAsked },
  focus: { read: (seen) => seen.focus, cue: (focus) => focus?.id ?? null },
  apart: { read: ({ focus, sight }) => focus ? hypot(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : Infinity },
  incoming: { read: (seen) => seen.blow?.cover ?? null, cue: (incoming) => incoming !== null },
  ward: { read: (seen) => seen.ward },
  range: { read: (seen) => { const { mine, theirs } = heads(seen); return theirs ? hypot(theirs.x - mine.x, theirs.z - mine.z) : Infinity; } },
  around: { read: ({ focus, sight }) => focus ? bearingAround(focus, sight.view.stance.centre.x, sight.view.stance.centre.z) : 0 },
  reaction: { read: reactionOf },
  lead: { read: ({ focus, sight }) => focus ? sight.view.senses.life - focus.life : 0 },
  lateness: { read: ({ sight }) => { const { begins, ends, time } = sight.view.senses; return begins === undefined || ends === undefined || !(ends > begins) ? 0 : Math.min(1, Math.max(0, (time - begins) / (ends - begins))); } },
  stride: { read: ({ sight }) => sight.view.stance.phase },
  bearing: { read: ({ sight }) => bearingOf(sight.view.stance.ends) },
  velocity: { read: ({ sight }) => ({ x: sight.view.stance.velocity.x, z: sight.view.stance.velocity.z }) },
  legsUnmet: { read: ({ sight }) => sight.report.legs.unmet },
  motorUnmet: { read: ({ sight }) => sight.view.unmet },
  phase: { read: ({ focus, blow }) => foePhase(focus, blow) },
  foePosture: { read: ({ focus }) => focus ? sensedPosture(focus) : "standing" },
  stances: { read: ({ focus, spec, sight }) => focus ? carriedStances(spec, sight.view, focus) : NO_STANCES },
  contact: { read: ({ focus, blow }) => focus && blow?.foe.id === focus.id ? blow.seconds : Infinity },
});

/** The least a reply moves the foe, m (`ProfileExchange.reply`): a line moving the body less is the foe standing. */
const REPLY_LEAST = .01;

/**
 * **The exchange as measured profiles predict it** (`ExchangePredictor`), built with its tables
 * (`ProfileTables`). The focus's pressure is its strikes' rate (`ratePressure`): the focus
 * throwing its strikes back to back from wherever it stands, each as its profile reads it. Where
 * the tables hold what bouts measured of a standing focus's body fighting this one
 * (`measuredAgainst`), the rate is read by that (`ProfilePressure.measured`), the focus doing as it is
 * now (`foePhase`): its moments carry how soon its blows came, so no grace is kept of it (its
 * latency none), and what a blow under way took, so the blow coming is priced at none beside it
 * (`danger`).
 */
export class ProfileExchange implements ExchangePredictor {
  private readonly tables: ProfileTables;
  /** What it guesses where nothing is measured; null where it guesses nothing. */
  private readonly guesses: Guesses | null;

  constructor({ guesses, ...tables }: ProfileTables & { readonly guesses: Guesses | null }) { this.tables = tables; this.guesses = guesses; }

  danger(seen: Seen): number { return this.measuredAgainst(seen) ? 0 : this.lifeOf(seen, seen.blow); }

  pressure(seen: Seen): ProfilePressure {
    const focus = seen.focus;
    if (!focus) return NO_PRESSURE;
    const rate = this.ratePressure(seen, focus), table = this.measuredAgainst(seen);
    return new ProfilePressure(table ? { ...rate, latency: 0, priced: `${rate.priced}; measured in bouts`, measured: { table, doing: foePhase(focus, seen.blow) } } : rate, null);
  }

  /** What a second down costs in each posture (`downRateOf`) against the focus, and with none one of its own kind; each found once a posture. */
  downRate(seen: Seen): (posture: Position) => number {
    const foe = seen.focus?.spec ?? seen.spec, rates = new Map<Position, number>();
    return (posture) => {
      let rate = rates.get(posture);
      if (rate === undefined) rates.set(posture, rate = this.downRateOf(seen, foe, posture));
      return rate;
    };
  }

  /** The focus's measured turn (`turnOf`). */
  turns({ focus }: Seen): number { return focus ? turnOf(focus.spec) : Infinity; }

  /** A blow by the rules (`blowLife`). */
  blows({ focus, spec, rules }: Seen): (limb: string, segment: string, closing: number) => number {
    return (limb, segment, closing) => focus ? blowLife(rules, spec, limb, focus.spec, closing, segment) : 0;
  }

  /** The foe carried on its velocity for `seconds` s and stopped there. */
  later(foe: BodySense, seconds: number): BodySense {
    const v = foe.velocity;
    if (!(seconds > 0) || (v.x === 0 && v.z === 0)) return foe;
    const c = foe.centre;
    return Object.create(foe, { centre: { value: { x: c.x + v.x * seconds, y: c.y, z: c.z + v.z * seconds } }, velocity: { value: { x: 0, y: 0, z: 0 } } }) as BodySense;
  }

  /**
   * A foe that can do what the body's own lines do, roles swapped: the velocity that moves the
   * foe by the line's first step reversed (each way it ends by its chance, `Leaves.where`), over
   * that step's seconds; none where the line does not move the body (`REPLY_LEAST`).
   */
  reply(root: Situation, line: Terms): FoeMove | null {
    const from = root.where!;
    let x = 0, z = 0;
    for (const outcome of line.outcomes) { const where = outcome.leaves.where ?? from; x += outcome.chance * (where.x - from.x); z += outcome.chance * (where.z - from.z); }
    if (!(line.duration > 0) || hypot(x, z) < REPLY_LEAST) return null;
    return { x: -x / line.duration, z: -z / line.duration, seconds: line.duration };
  }

  /** What bouts measured of a standing focus's body fighting this one (`pressureTable`); null where its tables hold none. */
  private measuredAgainst(seen: Seen): PressureTable | null {
    const focus = seen.focus, pressures = this.tables.pressures;
    return pressures && focus && sensedPosture(focus) === "standing" ? pressureTable(pressures, focus.spec, seen.spec) : null;
  }

  /**
   * **The strikes a foe of `foe` is modelled by**: every one measured on its body, whatever its
   * character holds, which is not sensed (`profilesOn`, each skill's profiles with a limb one
   * strike, `strikesOf`; its pressure reads them pooled, `pooled`), else this body's own measured
   * (`ProfileTables.strikes`), each read by its profile against this body (`modelOf`), fresh at the
   * senses' reaction time and this mind's rate (`Seen.rate`: a foe's mind is taken for one like
   * it) and thrown with the limb it names (`Measured.limb`); and each other limb the foe strikes
   * with (`defaultStrikeLimbs`), left to its guess. A foe's strikes are not sensed, so its limbs
   * stand for them: a limb no measured strike throws is priced by hand while the others are
   * measured, or not priced where the Mind has no guesses (`pricedBy`).
   */
  private foeModel(seen: Seen, foe: BodySpec, postures: Postures): Model {
    const reaction = reactionOf(seen), on = profilesOn(this.tables.measured, foe, { hz: seen.hz, reaction, rate: seen.rate, delay: seen.delay });
    const strikes: readonly ModelledStrike[] = on.read.length ? strikesOf(on.read)
      : this.tables.strikes.filter((strike) => profileAgainst(strike.profiles, seen.spec) !== null);
    const thrown = new Set(strikes.flatMap((strike) => strike.limbs)), limbs = defaultStrikeLimbs(foe).filter((limb) => !thrown.has(limb));
    const unread = pricedBy(this.guesses);
    const model = modelOf(seen, { strikes: [...strikes, ...limbs.map((limb) => ({ name: limb, limbs: [limb], profiles: [] }))], striker: foe, struck: seen.spec, postures, guesses: this.guesses });
    const source = on.read.length ? (on.stale === null ? "measured" : `measured, stale, ${on.stale}`) : strikes.length ? `as its own strikes, ${on.stale}` : `${unread}, ${on.stale}`;
    return { ...model, priced: limbs.length && strikes.length ? `${source}; ${unread}: ${limbs.join(", ")}` : source };
  }

  /**
   * **What makes the pressure `focus` puts on the body by its strikes' rate** (`PressureFields`):
   * its model read at the focus's posture (`sensedPosture`), pooled (`pooled`), the body struck
   * as standing.
   */
  private ratePressure(seen: Seen, focus: BodySense): PressureFields {
    const spec = seen.spec, posture = sensedPosture(focus), postures = { own: posture, target: "standing" };
    return { ...pressureBy(seen, { model: pooled(this.foeModel(seen, focus.spec, postures), focus.spec, postures), phase: ownPhase(seen), striker: focus.spec, struck: spec, placing: placingAt(posture), guesses: this.guesses }),
      stance: turned(carriedStances(spec, seen.sight.view, focus)) };
  }

  /**
   * **The own life `blow` is expected to take**: the most its striker's measured strikes thrown with
   * its limb (`foeModel`) are expected to take at the striker's range, the two bodies' velocities
   * (`startVelocity`) and this body's phase, to their reach (a blow predicted to reach the head is in
   * reach); with none, its guess where the Mind has guesses (`Guesses.blow`). 0 with neither, and
   * with no blow.
   */
  private lifeOf(seen: Seen, blow: Seen["blow"]): number {
    const { spec, sight } = seen;
    if (!blow) return 0;
    const centre = sight.view.stance.centre, foe = blow.foe, range = hypot(foe.centre.x - centre.x, foe.centre.z - centre.z), phase = ownPhase(seen);
    const own = sight.view.stance.velocity, velocity = startVelocity({ x: foe.centre.x - centre.x, z: foe.centre.z - centre.z }, { x: own.x - foe.velocity.x, z: own.z - foe.velocity.z });
    const measured = this.foeModel(seen, blow.foe.spec, STANDING).measured.filter((one) => one.limbs.includes(blow.limb)).map((one) => one.reading);
    const guessed = measured.length ? null : this.guesses?.blow(seen, blow, range) ?? null, model = guessed ? [guessed] : measured;
    let most = 0;
    const stance = turned(carriedStances(spec, sight.view, foe));
    for (const reading of model) most = Math.max(most, reading.expect({ range: Math.min(range, reading.reach(phase)), phase, velocity, stance }, spec)?.dealt ?? 0);
    return most;
  }

  /**
   * **What a second costs the body down in `posture`**, own life, against a foe of `foe` as it is
   * (`sensedPosture`; standing with no focus), as the foe's pressure reads it: the blows of the foe
   * over it (`PressureFields.peak`: the foe's strikes read at its posture and a target lying in that
   * posture, in the phase down; a foe lying deals none by a guess, `placingAt`). What a second on its
   * feet brings is priced by the Options that begin there, as the search reaches them.
   */
  private downRateOf(seen: Seen, foe: BodySpec, posture: Position): number {
    const foeAt = seen.focus ? sensedPosture(seen.focus) : "standing", postures = { own: foeAt, target: posture };
    return pressureBy(seen, { model: pooled(this.foeModel(seen, foe, postures), foe, postures), phase: "down", striker: foe, struck: seen.spec, placing: placingAt(foeAt) && "over", guesses: this.guesses }).peak;
  }
}

/** The percepts' names, in their order. */
const PERCEIVED = Object.freeze(Object.keys(PERCEPTS) as (keyof Percepts)[]);

/** The predictions' names, in their order: each is the member of an exchange predictor that reads it (`ExchangePredictor`). */
const PREDICTED = Object.freeze(Object.keys({ danger: 0, pressure: 0, downRate: 0, turns: 0, blows: 0 } satisfies Record<keyof Predictions, 0>) as (keyof Predictions)[]);

/** The percepts' names that have a cue, in their order. */
const CUED = Object.freeze(PERCEIVED.filter((name) => PERCEPTS[name].cue !== undefined));

/** What a percept or prediction holds before it is first asked for. */
const UNREAD = Symbol("unread");

/** Where a situation and its predictions keep their `Memo`. */
const MEMO = Symbol("memo");

/**
 * **One situation's reading**: what it reads from (`ReaderSeen`), and what each percept and then each
 * prediction read (`UNREAD` until asked).
 */
interface Memo { readonly seen: ReaderSeen; readonly values: unknown[] }

/** A situation or its predictions, keeping its `Memo`. */
type Memoized = Record<typeof MEMO, Memo>;

/**
 * **A body's situations** (`Situation`) read from a step's `ReaderSeen` (`at`): each percept
 * (`PERCEPTS`) and each prediction, which `exchange` reads, read the first time it is asked and kept. Every situation's readings are getters on one prototype made here; a situation keeps its own, so one kept past
 * its step reads its own step. Which cued percepts any of its situations was asked for is counted
 * for a chooser (`Cues`).
 */
export function perceiver(exchange: ExchangePredictor) {
  /** The cued percepts asked for since `Cues.clear`, a bit each, by their place in `CUED`. */
  let asked = 0;
  /** What `percept` reads in `memo`'s situation, at `i` of its values: read the first time it is asked. */
  const perceived = (memo: Memo, i: number, percept: Percept<unknown>): unknown => {
    const value = memo.values[i];
    return value === UNREAD ? memo.values[i] = percept.read(memo.seen) : value;
  };
  /** What reads each prediction, by its name: the member of `exchange` of that name, which answers with that prediction's type. */
  const readers: { readonly [K in keyof Predictions]: (seen: Seen) => Predictions[K] } = exchange;
  /** What `exchange` predicts by its member `name` in `memo`'s situation, at `i` of its values: read the first time it is asked. */
  const predicted = (memo: Memo, i: number, name: keyof Predictions): unknown => {
    const value = memo.values[i];
    return value === UNREAD ? memo.values[i] = readers[name](memo.seen) : value;
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
  const situation = { cues };
  PERCEIVED.forEach((name, i) => {
    const percept = PERCEPTS[name] as Percept<unknown>, bit = CUED.includes(name) ? 1 << CUED.indexOf(name) : 0;
    Object.defineProperty(situation, name, { get(this: Memoized) { asked |= bit; return perceived(this[MEMO], i, percept); } });
  });
  const predictions = {};
  PREDICTED.forEach((name, i) => Object.defineProperty(predictions, name, { get(this: Memoized) { return predicted(this[MEMO], PERCEIVED.length + i, name); } }));
  return {
    /** **The situation `seen` reads**, its percepts and predictions read as they are asked. */
    at(seen: ReaderSeen): Situation {
      const memo: Memo = { seen, values: new Array<unknown>(PERCEIVED.length + PREDICTED.length).fill(UNREAD) };
      const now = Object.create(situation) as Memoized & { sight: Sight; time: number; predictions: Predictions };
      now.sight = seen.sight; now.time = seen.sight.view.time; now[MEMO] = memo;
      const said = Object.create(predictions) as Memoized;
      said[MEMO] = memo;
      now.predictions = said as unknown as Predictions;
      return now as unknown as Situation;
    },
  };
}
