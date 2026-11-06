/**
 * **A skill's profile**: what its drill measured the skill to bring from where it began, so that a
 * chooser prices it on measured numbers rather than a hand-built model. A profile is a sample of
 * trials (`Trial`), each keeping what it brought and where it began (`Start`): the range to the
 * foe, centre to centre across the ground, m; the foe's phase as the striker sensed it (the `phase`
 * percept, `sensedPhase`); how the two bodies stood; and the velocity at the start, in the frame of
 * the skill's target (`startVelocity`), or, for a skill with no target, the body's own (forward and
 * to its right of its facing); and, for a skill begun from a window, where in it the body stood. A
 * reading takes the trials nearest the start asked at (`NEAREST`), its velocity and its place in
 * its window within the spans its trials began at (`within`). A
 * skill with no foe, a ground edge, begins at no range, clear. A profile names what it was measured
 * on (`Measured`) and the body it was measured against (`Target`, none for a skill with no foe); one
 * read for another body, skill, rate or reaction time is stale (`staleness`), and a chooser prices
 * that skill by hand.
 *
 * Each dataset owner declares and loads its profiles. Readers use `readProfile`; identity
 * selects the loaded data each provider declares relevant to a subject (`dataIdentity`).
 */
import { dataIdentity, type DataKey } from "../../core/data/store.ts";
import { bodyKey, type BodySpec } from "../../core/bodies/spec/body.ts";
import { hypot } from "../../core/math/real.ts";
import type { ActionConfig, ExecutorEntry } from "../config.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";

/**
 * What a profile was measured on: its body (`bodyKey`) and the digest of that body's spec
 * (`specDigest`), its skill's digest (`skillDigest`, `techniqueDigest`), the world's rate, Hz,
 * how late its senses showed the other body, s (null for a skill that reads none), the rate its
 * mind's driver ran at, Hz, where that is not the world's (`rateOf`, `LayerOptions.every`), and the
 * steps its body's command waited (`World.delay`), where there were any (`delayOf`).
 */
export interface Measured {
  readonly body: string;
  readonly spec: string;
  readonly skill: string;
  readonly hz: number;
  readonly reaction: number | null;
  readonly rate?: number;
  readonly delay?: number;
}

/** **The steps a body's command waited** where `measured` was measured: its `delay`, else none. */
export const delayOf = (measured: Measured): number => measured.delay ?? 0;

/** **The rate the mind's driver ran at** where `measured` was measured, Hz: its `rate`, else the world's. */
export const rateOf = (measured: Measured): number => measured.rate ?? measured.hz;

/** The body a profile was measured against: its body (`bodyKey`) and its spec's digest (`specDigest`). */
export interface Target {
  readonly body: string;
  readonly spec: string;
}

/**
 * **How the bodies stood as a trial began**, each a posture's name (`Position`'s): the body whose
 * skill it is, `own`, and the body it struck, `target`. A profile is read at a pair of them
 * (`readProfile`), so a skill measured standing says nothing of a striker lying or a target down.
 */
export interface Postures {
  readonly own: string;
  readonly target: string;
}

/** Both bodies standing: what a trial that names no postures began at, and what a profile is read at unless asked otherwise. */
export const STANDING: Postures = Object.freeze({ own: "standing", target: "standing" });

/**
 * **Where a trial began**, or a reading is asked at: the range, m, and the foe's phase; how the
 * bodies stood (`Postures`; absent, both standing); the velocity at the start, m/s, in the
 * target's frame (`startVelocity`: closing on it and across the line to it) or, with no target,
 * the body's own (forward and to its right), absent where its drill did not record it, read as
 * still; and, for a skill begun from a window (`Window`), where in it the body stood
 * (`placeInWindow`: the target's offset from the window's middle, ahead and to the right, m),
 * absent where it begins from none or its drill did not record it, read as at the middle.
 */
export interface Start {
  readonly range: number;
  readonly phase: string;
  readonly postures?: Postures;
  readonly velocity?: readonly [number, number];
  readonly window?: readonly [number, number];
}

/** Still, or at the window's middle: the velocity and the place a start that records none is read at. */
const STILL: readonly [number, number] = Object.freeze([0, 0]) as readonly [number, number];

/**
 * **A body's velocity at the start in its target's frame**, m/s: `relative`, its velocity less the
 * target's, along `to`, the ground's way from it to the target (closing, positive toward the
 * target), and across that line (positive to the body's right as it faces the target). The two
 * read the same from either body, each taken as the other's target.
 */
export function startVelocity(to: { readonly x: number; readonly z: number }, relative: { readonly x: number; readonly z: number }): [number, number] {
  const length = hypot(to.x, to.z);
  if (length === 0) return [0, 0];
  const ux = to.x / length, uz = to.z / length;
  return [relative.x * ux + relative.z * uz, relative.x * uz - relative.z * ux];
}

/**
 * **One trial of a skill**: where it began (`Start`) and what it brought: whether it was done (a
 * strike landed, an edge reached its posture); the life its blows took from the body struck, in
 * hit points (each contact's damage at the struck segment's cost in life, `lifeFactor`), and the hit
 * points its own body lost over the whole trial (the drill foe's replies and its own blows'
 * impacts, which a reading leaves out: the foe's pressure prices what the body takes); the seconds
 * its skill ran (a strike's action from its start to its end, when its limb is free to begin
 * another; an edge's run); the seconds from its end until its limb was back at its guard and still
 * (`recovers`: null where its drill did not see it so, or measures none); whether it ended with the
 * body down; where it came to rest where not done (`end`, an edge's position); the percepts it left
 * the body in, by name (`exit`: a strike's range head to head to the foe once its limb was back,
 * `range`, m); and, where its drill
 * let it go before its point of no return (`letGo`), at what progress of its motion (s from its
 * start), the seconds until the hand was back at its guard, and the hit points its body lost
 * meanwhile: such a trial prices letting go alone.
 */
export interface Trial {
  readonly start: Start;
  readonly done: boolean;
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  readonly recovers: number | null;
  readonly down: boolean;
  readonly end?: string;
  readonly exit?: Readonly<Record<string, number>>;
  readonly letGo?: { readonly progress: number; readonly seconds: number; readonly taken: number };
}

/** Whether `start` began with the bodies standing as `postures` say (both standing where it names none). */
const startedAt = (start: Start, postures: Postures): boolean =>
  (start.postures ?? STANDING).own === postures.own && (start.postures ?? STANDING).target === postures.target;

/** **Whether `profile` measured its skill with the bodies standing as `postures` say**: a trial of it began so; one that did not says nothing of them. */
export const measuredAt = (profile: Profile, postures: Postures): boolean => profile.trials.some((trial) => startedAt(trial.start, postures));

export interface Profile {
  readonly measured: Measured;
  /** The body it was measured against; null for a skill with no foe. */
  readonly target: Target | null;
  readonly trials: readonly Trial[];
  /** The limbs a strike's trials were thrown with (effector segments, `hand.right`), which a foe's strikes are modelled by; absent for a skill thrown with none. */
  readonly limbs?: readonly string[];
}

const profileObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const profileNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const profileNonnegative = (value: unknown): boolean => profileNumber(value) && value >= 0;
const profileText = (value: unknown): boolean => typeof value === "string" && value.length > 0;
const profilePair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(profileNumber);
const profilePostures = (value: unknown): boolean => profileObject(value) && profileText(value.own) && profileText(value.target);
const profileTarget = (value: unknown): boolean => profileObject(value) && profileText(value.body) && profileText(value.spec);
const profileMeasured = (value: unknown): boolean => profileTarget(value) && profileObject(value)
  && profileText(value.skill) && profileNumber(value.hz) && value.hz > 0
  && (value.reaction === null || profileNonnegative(value.reaction))
  && (value.rate === undefined || profileNumber(value.rate) && value.rate > 0)
  && (value.delay === undefined || profileNonnegative(value.delay) && Number.isSafeInteger(value.delay));
const profileTrial = (value: unknown): boolean => profileObject(value) && profileObject(value.start)
  && profileNumber(value.start.range) && profileText(value.start.phase)
  && (value.start.postures === undefined || profilePostures(value.start.postures))
  && (value.start.velocity === undefined || profilePair(value.start.velocity))
  && (value.start.window === undefined || profilePair(value.start.window))
  && typeof value.done === "boolean" && typeof value.down === "boolean"
  && profileNonnegative(value.dealt) && profileNonnegative(value.taken) && profileNonnegative(value.seconds)
  && (value.recovers === null || profileNonnegative(value.recovers))
  && (value.end === undefined || profileText(value.end))
  && (value.exit === undefined || profileObject(value.exit) && Object.values(value.exit).every(profileNumber))
  && (value.letGo === undefined || profileObject(value.letGo) && [value.letGo.progress, value.letGo.seconds, value.letGo.taken].every(profileNonnegative));

/** Whether supplied profiles have finite measurements and the trial fields their readers use. */
export const validProfiles = (value: unknown): value is readonly Profile[] => Array.isArray(value) && value.every(profile => profileObject(profile)
  && profileMeasured(profile.measured) && (profile.target === null || profileTarget(profile.target))
  && Array.isArray(profile.trials) && profile.trials.every(profileTrial)
  && (profile.limbs === undefined || Array.isArray(profile.limbs) && profile.limbs.every(profileText)));

/**
 * **What a skill is expected to bring from a start** (`ProfileReading.expect`), in life, a share
 * of a body's full life: the share done; the struck body's life its blows take; the seconds its
 * skill runs, and from its end until its limb is back (`Trial.recovers`, of the trials that saw it;
 * 0 where none did); the chance it ends down; where those not done came to rest, each with its share;
 * where asked at a progress of its motion, what letting it go there cost (the seconds until the hand
 * was back at its guard, and its own life lost meanwhile); and the percepts it leaves the body in.
 */
export interface Expected {
  readonly done: number;
  readonly dealt: number;
  readonly seconds: number;
  readonly recovers: number;
  readonly down: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
  /** What letting it go at the progress asked cost, from the let-go trials nearest it; absent where no progress was asked, or none was let go. */
  readonly letGo?: { readonly seconds: number; readonly taken: number };
  /** The percepts it is expected to leave the body in, by name (`Trial.exit`); absent where its trials name none. */
  readonly exit?: Trial["exit"];
}

/**
 * **A profile as a mind reads it**, the one way any is read (`readProfile`). A body in a phase the
 * profile has no trials of is read at its clear trials. Its trials' hit points are the rules' damage
 * on the body it was measured against, read over the hit points of the body struck now: a blow on a
 * body of another mass delivers it within about one per cent (an arm's reduced mass against a whole
 * body's), so the hit points are taken as they are, and the reading says it is scaled (`scaled`).
 * A rate of blows reads its trials' cycle: the seconds each ran and those until its limb was back
 * at its guard (`Trial.recovers`; none where none of them recorded it).
 */
export interface ProfileReading {
  readonly profile: Profile;
  /** The farthest range it reads at for a body in `phase`, m: its farthest trial's start; -Infinity with none. */
  reach(phase: string): number;
  /** What it expects from `at` against `struck` (none for a skill with no foe): its trials nearest `at` (`NEAREST`), within its reach; null beyond, or asked at a progress, what letting it go there cost. */
  expect(at: Start & { readonly progress?: number }, struck: BodySpec | null): Expected | null;
  /** What it expects from `at` to take of `struck`'s life a second: its nearest trials' dealt over their cycle, null where it expects nothing. */
  rate(at: Start, struck: BodySpec | null): number | null;
  /** The most of `struck`'s life a second it takes from any start of its trials for a body in `phase` (`rate` there); 0 with none. */
  peak(phase: string, struck: BodySpec): number;
  /** The fewest seconds it runs from any start of its trials for a body in `phase` where it takes life: its fastest blow; Infinity with none. */
  fastest(phase: string): number;
  /** Why its trials are read scaled for `struck`, a sentence; null where `struck` is its target, or it has none. */
  scaled(struck: BodySpec | null): string | null;
}

/**
 * **The trials a reading takes** (`ProfileReading.expect`): the nearest the start asked at, nearer
 * first and ties together, until there are `trials` of them, so a lone trial is read with its
 * neighbours; nearness the distance in range over `range` m, in velocity over `speed` m/s and in
 * the place in its window over `place` m together, each the span over which trials are taken as
 * alike. Tuned: about a stride's worth of neighbours on the range a strike's window spans, a step's
 * change of pace, and a quarter of the depth of a stomp's window.
 */
const NEAREST = Object.freeze({ trials: 10, range: .1, speed: .25, place: .1 });

/** How near two distances are taken as one: the nearest trials' ties. */
const TIE = 1e-9;

/** Each profile's readings, by the striker's spec and the postures read at: a profile and a spec are immutable. */
const READINGS = new WeakMap<Profile, WeakMap<BodySpec, Map<string, ProfileReading>>>();

/**
 * **`profile` read for a skill of a body of `striker`** (`ProfileReading`) at `postures`: its trials
 * begun there alone (`Start.postures`), none where none was; made once for the three.
 */
export function readProfile(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  let bySpec = READINGS.get(profile);
  if (!bySpec) READINGS.set(profile, bySpec = new WeakMap());
  let byPostures = bySpec.get(striker);
  if (!byPostures) bySpec.set(striker, byPostures = new Map());
  const key = `${postures.own} ${postures.target}`, known = byPostures.get(key);
  if (known) return known;
  const reading = profileReading(profile, striker, postures);
  byPostures.set(key, reading);
  return reading;
}

/** A start's velocity and place in its window, read as a reading reads them (`within`): closing, across, ahead and aside. */
type Read = readonly [number, number, number, number];

/**
 * **Trials sorted by the range they began at**, with their starts in arrays made once, so the
 * nearest to a start are found by walking out from its range (`nearestOf`); and the span of their
 * starts' velocities, closing and across, and of their places in their window, ahead and aside
 * (`low`, `high`, in that order, `Read`), which a start is read within (`within`).
 */
interface Sample {
  readonly trials: readonly Trial[];
  readonly range: Float64Array;
  readonly closing: Float64Array;
  readonly across: Float64Array;
  readonly ahead: Float64Array;
  readonly aside: Float64Array;
  /** Query scratch: only the interval written by the current nearest search is read. */
  readonly distances: Float64Array;
  readonly low: Read;
  readonly high: Read;
}

function sampleOf(trials: readonly Trial[]): Sample {
  const sorted = [...trials].sort((a, b) => a.start.range - b.start.range), n = sorted.length;
  const range = new Float64Array(n), closing = new Float64Array(n), across = new Float64Array(n), ahead = new Float64Array(n), aside = new Float64Array(n);
  const low: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity], high: [number, number, number, number] = [-Infinity, -Infinity, -Infinity, -Infinity];
  sorted.forEach((trial, i) => {
    const velocity = trial.start.velocity ?? STILL, place = trial.start.window ?? STILL, at: Read = [velocity[0], velocity[1], place[0], place[1]];
    range[i] = trial.start.range; closing[i] = at[0]; across[i] = at[1]; ahead[i] = at[2]; aside[i] = at[3];
    for (const k of [0, 1, 2, 3] as const) { low[k] = Math.min(low[k], at[k]); high[k] = Math.max(high[k], at[k]); }
  });
  return { trials: sorted, range, closing, across, ahead, aside, low, high, distances: new Float64Array(n) };
}

/**
 * **The velocity and place in its window `at` is read at in `sample`** (`Read`): its own, each
 * within the span its trials began at (`Sample.low`, `high`). A start no trial began at says
 * nothing the nearest measured one does not: read as it is, its distance would outweigh the
 * range's and take the few trials begun at the sample's extreme, from whatever range they began at.
 */
function within(sample: Sample, at: Start, read: Nearest["read"]): void {
  const velocity = at.velocity ?? STILL, closing = velocity[0], across = velocity[1],
    window = at.window ?? STILL, ahead = window[0], aside = window[1], { low, high } = sample;
  read[0] = Math.min(high[0], Math.max(low[0], closing)); read[1] = Math.min(high[1], Math.max(low[1], across));
  read[2] = Math.min(high[2], Math.max(low[2], ahead)); read[3] = Math.min(high[3], Math.max(low[3], aside));
}

/** How far `sample`'s trial `i` lies from a start at `range` read at `read` (`within`), each part over its span (`NEAREST`). */
const apart = (sample: Sample, i: number, range: number, read: Read): number =>
  hypot(hypot((sample.range[i]! - range) / NEAREST.range, (sample.closing[i]! - read[0]) / NEAREST.speed, (sample.across[i]! - read[1]) / NEAREST.speed),
    (sample.ahead[i]! - read[2]) / NEAREST.place, (sample.aside[i]! - read[3]) / NEAREST.place);

/** The first index of `sample` whose range is at least `range`. */
function firstFrom(sample: Sample, range: number): number {
  let lo = 0, hi = sample.range.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sample.range[mid]! < range) lo = mid + 1; else hi = mid; }
  return lo;
}

/** The nearest distances found, ascending, of a search (`nearestOf`): made once, as long as `NEAREST.trials`. */
const BEST = new Float64Array(NEAREST.trials);

/** A nearest query's clamped coordinates, bounds and visited interval, held through aggregation. */
interface Nearest { from: number; to: number; bound: number; readonly read: [number, number, number, number]; visitedFrom: number; visitedTo: number }

/** One query's work; nested queries use a frame of their own until the outer aggregation ends. */
const nearestWork = (): Nearest => ({ from: 0, to: 0, bound: 0, read: [0, 0, 0, 0], visitedFrom: 0, visitedTo: 0 });
const QUERY_WORK = { depth: 0, frames: [nearestWork()] };

/** Keep distance `d` among the nearest `want`, returning how many have been found. */
function keepNearest(d: number, found: number, want: number): number {
  if (found === want && d >= BEST[want - 1]!) return found;
  let k = found < want ? found++ : want - 1;
  while (k > 0 && BEST[k - 1]! > d) { BEST[k] = BEST[k - 1]!; k--; }
  BEST[k] = d;
  return found;
}

/**
 * **The trials of `sample` nearest `at`** (`NEAREST`): the span of its indices `[from, to)` that
 * holds them, and the distance the farthest of them lies at (`bound`), each in the span within it;
 * written into `near`; false where `sample` is empty.
 */
function nearestOf(sample: Sample, at: Start, near: Nearest): boolean {
  const n = sample.range.length;
  if (n === 0) return false;
  const read = near.read;
  within(sample, at, read);
  const want = Math.min(NEAREST.trials, n);
  let found = 0;
  // Out from the range asked, each way, until the range alone puts a trial past the farthest kept.
  const start = firstFrom(sample, at.range);
  let visitedFrom = start, visitedTo = start;
  for (let i = start; i < n; i++) {
    if (found === want && (sample.range[i]! - at.range) / NEAREST.range > BEST[want - 1]!) break;
    const distance = sample.distances[i] = apart(sample, i, at.range, read);
    found = keepNearest(distance, found, want); visitedTo = i + 1;
  }
  for (let i = start - 1; i >= 0; i--) {
    if (found === want && (at.range - sample.range[i]!) / NEAREST.range > BEST[want - 1]!) break;
    const distance = sample.distances[i] = apart(sample, i, at.range, read);
    found = keepNearest(distance, found, want); visitedFrom = i;
  }
  const bound = BEST[want - 1]! + TIE, span = bound * NEAREST.range;
  near.from = firstFrom(sample, at.range - span); near.to = firstFrom(sample, at.range + span + TIE * NEAREST.range);
  near.bound = bound; near.visitedFrom = visitedFrom; near.visitedTo = visitedTo;
  return true;
}

/** Each trial of `sample` in `nearest`'s span within its bound, by `each`. */
function eachNearest(sample: Sample, at: Start, each: (trial: Trial) => void): number {
  const depth = QUERY_WORK.depth++, near = QUERY_WORK.frames[depth] ??= nearestWork();
  try {
    if (!nearestOf(sample, at, near)) return 0;
    let n = 0;
    for (let i = near.from; i < near.to; i++) {
      // The tie tolerance can admit trials beyond the interval visited before pruning.
      const distance = i >= near.visitedFrom && i < near.visitedTo ? sample.distances[i]! : apart(sample, i, at.range, near.read);
      if (distance <= near.bound) { each(sample.trials[i]!); n++; }
    }
    return n;
  } finally { QUERY_WORK.depth--; }
}

/** What a body's trials in one phase are read by: those its skill ran from (`run`), those it let go by the progress let go at (`letGo`), and its reach. */
interface Phase {
  readonly run: Sample;
  readonly letGo: ReadonlyMap<number, Sample>;
  readonly reach: number;
  /** The most hit points a second, and the fewest seconds of a start that deals any, of any start of its trials (`ProfileReading.peak`, `fastest`); found when first asked. */
  extremes?: { readonly peak: number; readonly fastest: number };
}

/** **The hit points `sample`'s trials nearest `at` deal, and their cycle**, s: the mean seconds they ran and, of those that recorded it, until their limb was back (`Trial.recovers`). */
function cycleAt(sample: Sample, at: Start): { readonly dealt: number; readonly cycle: number; readonly seconds: number } | null {
  let dealt = 0, seconds = 0, recovered = 0, recovers = 0;
  const n = eachNearest(sample, at, (trial) => {
    dealt += trial.dealt; seconds += trial.seconds;
    if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
  });
  return n === 0 ? null : { dealt: dealt / n, seconds: seconds / n, cycle: seconds / n + (recovered ? recovers / recovered : 0) };
}

/** `profile` read for a skill of a body of `striker` at `postures` (`readProfile`), made anew: for a profile made for one reading, which no later read asks again. */
export function profileReading(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  const own = striker.wounds.hp.value;
  const trials = profile.trials.filter((trial) => startedAt(trial.start, postures));
  const phaseOf = (phase: string): string => trials.some((trial) => trial.start.phase === phase) ? phase : "clear";
  const phases = new Map<string, Phase>();
  /** The trials a body in `phase` reads (`phaseOf`); found once a phase. */
  const read = (phase: string): Phase => {
    const known = phases.get(phase);
    if (known) return known;
    const at = phaseOf(phase), of = trials.filter((trial) => trial.start.phase === at), run = of.filter((trial) => !trial.letGo);
    const byProgress = new Map<number, Trial[]>();
    for (const trial of of) if (trial.letGo) byProgress.set(trial.letGo.progress, [...byProgress.get(trial.letGo.progress) ?? [], trial]);
    let reach = -Infinity;
    for (const trial of run) reach = Math.max(reach, trial.start.range);
    const made: Phase = { run: sampleOf(run), letGo: new Map([...byProgress].map(([progress, those]) => [progress, sampleOf(those)])), reach };
    phases.set(phase, made);
    return made;
  };
  const extremes = (phase: string): NonNullable<Phase["extremes"]> => {
    const of = read(phase);
    if (of.extremes) return of.extremes;
    let peak = 0, fastest = Infinity;
    for (const trial of of.run.trials) {
      const at = cycleAt(of.run, trial.start);
      if (!at || at.dealt <= 0 || at.cycle <= 0) continue;
      peak = Math.max(peak, at.dealt / at.cycle); fastest = Math.min(fastest, at.seconds);
    }
    return of.extremes = { peak, fastest };
  };
  const reading: ProfileReading = {
    profile,
    reach: (phase) => read(phase).reach,
    expect(at, struck) {
      const of = read(at.phase);
      if (at.range > of.reach) return null;
      const shares = new Map<string, number>();
      let done = 0, dealt = 0, seconds = 0, recovered = 0, recovers = 0, down = 0;
      const exits: Record<string, number> = {}, exited: Record<string, number> = {};
      const n = eachNearest(of.run, at, (trial) => {
        if (trial.done) done++;
        if (trial.down) down++;
        dealt += trial.dealt; seconds += trial.seconds;
        if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
        if (trial.end !== undefined) shares.set(trial.end, (shares.get(trial.end) ?? 0) + 1);
        for (const key in trial.exit) { exits[key] = (exits[key] ?? 0) + trial.exit[key]!; exited[key] = (exited[key] ?? 0) + 1; }
      });
      if (n === 0) return null;
      const letGo = at.progress === undefined ? null : letGoAt(of, at, at.progress);
      return { done: done / n, dealt: struck ? dealt / n / struck.wounds.hp.value : 0, seconds: seconds / n, recovers: recovered ? recovers / recovered : 0, down: down / n,
        ends: [...shares].map(([end, count]) => ({ at: end, share: count / n })),
        ...(letGo ? { letGo: { seconds: letGo.seconds, taken: letGo.taken / own } } : {}), ...(Object.keys(exits).length ? { exit: Object.fromEntries(Object.keys(exits).map(key => [key, exits[key]! / exited[key]!])) } : {}) };
    },
    rate(at, struck) {
      const of = read(at.phase);
      if (at.range > of.reach) return null;
      const cycle = cycleAt(of.run, at);
      return cycle ? cycle.cycle > 0 ? (struck ? cycle.dealt / struck.wounds.hp.value : 0) / cycle.cycle : 0 : null;
    },
    peak: (phase, struck) => extremes(phase).peak / struck.wounds.hp.value,
    fastest: (phase) => extremes(phase).fastest,
    scaled(struck) {
      const target = profile.target;
      if (!target || !struck) return null;
      const body = bodyKey(struck);
      return body !== target.body ? `measured against ${target.body}, read against ${body}` : specDigest(struck) !== target.spec ? `measured against another ${body}` : null;
    },
  };
  return reading;
}

/** **What letting go at `progress` cost** from `at`: of the trials of `of` let go at the progress nearest it, the mean of those nearest `at`; null where none was let go. */
function letGoAt(of: Phase, at: Start, progress: number): { readonly seconds: number; readonly taken: number } | null {
  let nearest: number | null = null;
  for (const one of of.letGo.keys()) if (nearest === null || Math.abs(one - progress) < Math.abs(nearest - progress)) nearest = one;
  if (nearest === null) return null;
  let seconds = 0, taken = 0;
  const n = eachNearest(of.letGo.get(nearest)!, at, (trial) => { seconds += trial.letGo!.seconds; taken += trial.letGo!.taken; });
  return n === 0 ? null : { seconds: seconds / n, taken: taken / n };
}

/** Each object's digest, found once: what is digested is frozen. */
const DIGESTS = new WeakMap<object, string>();

/**
 * **A digest of `value`'s values**, 16 hex digits (two FNV-1a words): its numbers, strings and
 * flags, an object's by its keys in order, leaving out functions, what is undefined and each
 * `provenance` (where a number came from, not what it is).
 */
export function digestOf(value: unknown): string {
  const known = typeof value === "object" && value !== null ? DIGESTS.get(value) : undefined;
  if (known !== undefined) return known;
  let a = 2166136261, b = 3735928559;
  const text = (piece: string) => {
    for (let i = 0; i < piece.length; i++) {
      const c = piece.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619) >>> 0;
      b = Math.imul(b ^ c, 16777619) >>> 0;
    }
  };
  const walk = (one: unknown): void => {
    if (one === null || typeof one === "boolean" || typeof one === "string") { text(JSON.stringify(one)); return; }
    if (typeof one === "number") { text(Number.isFinite(one) ? JSON.stringify(one) : String(one)); return; }
    if (Array.isArray(one) || ArrayBuffer.isView(one)) {
      text("[");
      for (const item of Array.from(one as ArrayLike<unknown>)) { walk(item); text(","); }
      text("]");
      return;
    }
    if (one instanceof Map) { walk([...one.entries()]); return; }
    if (typeof one === "object") {
      text("{");
      for (const key of Object.keys(one).sort()) {
        const item = (one as Record<string, unknown>)[key];
        if (key === "provenance" || item === undefined || typeof item === "function") continue;
        text(JSON.stringify(key)); text(":"); walk(item); text(",");
      }
      text("}");
      return;
    }
    text(String(one));
  };
  walk(value);
  const digest = a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  if (typeof value === "object" && value !== null) DIGESTS.set(value, digest);
  return digest;
}

/** Each spec's digest (`specDigest`), found once a spec. */
const SPEC_DIGESTS = new WeakMap<BodySpec, string>();

/**
 * **A body's spec's digest** (`digestOf`): what a profile measured on it names. Its wounds are
 * left out: they are how the rules read a blow on it (`src/combat/pool.ts`), not how it moves.
 */
export const specDigest = (spec: BodySpec): string => {
  let digest = SPEC_DIGESTS.get(spec);
  if (digest === undefined) SPEC_DIGESTS.set(spec, digest = digestOf({ ...spec, wounds: undefined }));
  return digest;
};

/**
 * **A strike's digest** on a body of `spec`: what it does, not what it is called: its action's
 * config and its executor's (the one the action names), each without its name, and the body's own
 * row of each record the executor reads (`Part.reads`: an executor's data is its skills' records by
 * `bodyKey`, `SkillRecord`), as the mind holds them, so another body's row moves no digest.
 */
export function skillDigest(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig): string {
  const executor = executors.find((entry) => entry.name === action.executor) ?? NO_EXECUTOR;
  let byExecutor = SKILL_DIGESTS.get(action);
  if (!byExecutor) SKILL_DIGESTS.set(action, byExecutor = new WeakMap());
  let bySpec = byExecutor.get(executor);
  if (!bySpec) byExecutor.set(executor, bySpec = new WeakMap());
  let byPart = bySpec.get(spec);
  if (!byPart) bySpec.set(spec, byPart = new WeakMap());
  const part = executor === NO_EXECUTOR ? null : executorPart(parts, executor);
  let digest = byPart.get(parts);
  if (digest === undefined) byPart.set(parts, digest = readSkillDigest(parts, part, spec, executor === NO_EXECUTOR ? null : executor, action));
  return digest;
}

/** Each strike's digest (`skillDigest`), by its action, its executor, its body's spec and its executor's part: each is frozen data, read once. */
const SKILL_DIGESTS = new WeakMap<ActionConfig, WeakMap<ExecutorEntry, WeakMap<BodySpec, WeakMap<object, string>>>>();
/** `executor`'s part. */
const executorPart = (parts: PartLookup, executor: ExecutorEntry) => parts.of("executor", executor) as { readonly reads?: (config: ExecutorEntry) => readonly DataKey[] };
/** The keys of an action whose executor is none of those given. */
const NO_EXECUTOR = Object.freeze({}) as ExecutorEntry;

function readSkillDigest(parts: PartLookup, part: ReturnType<typeof executorPart> | null, spec: BodySpec, executor: ExecutorEntry | null, action: ActionConfig): string {
  const body = bodyKey(spec);
  const aim = action.aim ? parts.of("aim", action.aim) : null;
  const keys = [...new Set([...(executor && part ? part.reads?.(executor) ?? [] : []), ...(action.aim ? aim?.reads?.(action.aim) ?? [] : [])])];
  const data = keys.map(key => digestOf(dataIdentity(key, body)));
  const { name: _action, executor: _executor, ...does } = action;
  return digestOf({ action: does, executor: executor && (({ name: _, ...rest }) => rest)(executor), data });
}

/** A ground technique's digest: its config and the body's records its part reads. */
export function techniqueDigest(parts: PartLookup, spec: BodySpec, technique: PartConfig): string {
  const keys = parts.of("technique", technique).reads?.(technique) ?? [];
  const body = bodyKey(spec), data = keys.map((key) => digestOf(dataIdentity(key, body)));
  return data.length ? digestOf({ technique, data }) : digestOf(technique);
}

/** What a profile of a skill of digest `skill`, read by a body of `spec` at `hz`, its senses `reaction` s late (null for none), its mind's driver at `rate` Hz, its command `delay` steps late, must have been measured on. */
export const measuredOn = (spec: BodySpec, skill: string, hz: number, reaction: number | null, rate: number, delay: number): Measured =>
  ({ body: bodyKey(spec), spec: specDigest(spec), skill, hz, reaction, ...(rate !== hz ? { rate } : {}), ...(delay !== 0 ? { delay } : {}) });

/** **Whether a reaction time `now` s reads as `was` s** at `hz`: within half a step, or either unknown. */
export const sameReaction = (was: number | null, now: number | null, hz: number): boolean => was === null || now === null || Math.abs(was - now) <= .5 / hz;

/** **Why `profile` is stale for `now`**, a sentence: the first of what it was measured on that differs (a reaction time the same by `sameReaction`); null where none does. */
export function staleness(profile: Profile, now: Measured): string | null {
  const was = profile.measured;
  if (was.body !== now.body) return `measured on ${was.body}, read on ${now.body}`;
  if (was.spec !== now.spec) return `measured on another ${now.body}`;
  if (was.skill !== now.skill) return "measured on another version of the skill";
  if (was.hz !== now.hz) return `measured at ${was.hz} Hz, read at ${now.hz} Hz`;
  if (rateOf(was) !== rateOf(now)) return `measured with its mind at ${rateOf(was)} Hz, read at ${rateOf(now)} Hz`;
  if (delayOf(was) !== delayOf(now)) return `measured with its command ${delayOf(was)} steps late, read ${delayOf(now)} steps late`;
  if (!sameReaction(was.reaction, now.reaction, now.hz))
    return `measured with senses ${was.reaction} s late, read ${now.reaction} s late`;
  return null;
}

/** A profile looked up for a skill (`profileFor`), and why it is stale where it is. */
export interface Found {
  readonly profile: Profile;
  readonly stale: string | null;
}

/**
 * **The profile of the skill `now` names** among `profiles`: the one measured as it is read, else
 * one on its body, else any of the skill's, with why it is stale; null where no drill measured the
 * skill.
 */
export function profileFor(profiles: readonly Profile[], now: Measured): Found | null {
  let body: Profile | null = null, any: Profile | null = null;
  for (const profile of profiles) {
    if (profile.measured.skill !== now.skill) continue;
    if (staleness(profile, now) === null) return { profile, stale: null };
    if (profile.measured.body === now.body) body ??= profile;
    any ??= profile;
  }
  const found = body ?? any;
  return found ? { profile: found, stale: staleness(found, now) } : null;
}

/**
 * **The profiles among `profiles` measured on a body of `spec`** at `hz` with senses `reaction` s
 * late, a mind's driver at `rate` Hz and its command `delay` steps late, of any skill (`fresh`): what a
 * foe of that body is measured to deal; and, for none, why (`stale`): the first measured on its
 * body that is stale (`staleness`), or none measured on it.
 */
export function profilesOn(profiles: readonly Profile[], spec: BodySpec, hz: number, reaction: number | null, rate: number, delay: number): { readonly fresh: readonly Profile[]; readonly stale: string } {
  const body = bodyKey(spec), digest = specDigest(spec), fresh: Profile[] = [];
  let stale: string | null = null;
  for (const profile of profiles) {
    const why = staleness(profile, { body, spec: digest, skill: profile.measured.skill, hz, reaction, ...(rate !== hz ? { rate } : {}), ...(delay !== 0 ? { delay } : {}) });
    if (why === null) fresh.push(profile);
    else if (profile.measured.body === body) stale ??= why;
  }
  return { fresh, stale: stale ?? `no drill measured the strikes of a ${body}` };
}
