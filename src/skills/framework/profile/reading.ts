/**
 * **A profile as a mind reads it** (`ProfileReading`, `readProfile`): what a skill is expected to
 * bring from a start, by the trials nearest it (`nearestRun`), at the postures the bodies stand in.
 */
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { STANDING, startedAt, type Asked, type Postures, type Profile, type Trial } from "./profile.ts";
import { bodyNumbers, eachNearest, numbersAt, sampleOf, type Sample } from "./nearest.ts";
import { acrossBodies, heldPast } from "./across.ts";
import { struckNumbers } from "./numbers.ts";

/** A reading of a profile whose trials record no body numbers (`bodyNumbers`): asked at none. */
const NO_NUMBERS = new Float64Array(0);

/**
 * **What a skill is expected to bring from a start** (`ProfileReading.expect`), in life, a share
 * of a body's full life: the share done; the struck body's life its blows take, and its own life
 * the blows on it took meanwhile (`Trial.taken`, over its own full life); the seconds its
 * skill runs, and from its end until its limb is back (`Trial.recovers`, of the trials that saw it;
 * 0 where none did); the chance it ends down; where those not done came to rest, each with its share;
 * where asked at a progress of its motion, what letting it go there cost (the seconds until the hand
 * was back at its guard, and its own life lost meanwhile); and the percepts it leaves the body in.
 */
export interface Expected {
  readonly done: number;
  readonly dealt: number;
  readonly taken: number;
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
  expect(at: Asked & { readonly progress?: number }, struck: BodySpec | null): Expected | null;
  /** What it expects from `at` to take of `struck`'s life a second: its nearest trials' dealt over their cycle, null where it expects nothing. */
  rate(at: Asked, struck: BodySpec | null): number | null;
  /** The most of `struck`'s life a second it takes from any start of its trials for a body in `phase` (`rate` there); 0 with none. */
  peak(phase: string, struck: BodySpec): number;
  /** The fewest seconds it runs from any start of its trials for a body in `phase` where it takes life: its fastest blow; Infinity with none. */
  fastest(phase: string): number;
  /** Why its trials are read scaled for `struck`, a sentence: another body struck, or either body holding past what its trials held; null where neither. */
  scaled(struck: BodySpec | null): string | null;
}

/** **A reader of profiles** (`profileReading`) for a skill of a body, at the postures it stands in. */
export type ReadsProfile = (profile: Profile, striker: BodySpec, postures?: Postures) => ProfileReading;

/**
 * **Profiles read with their run trials read by `runs`** (`profileReading`), at ranges by stature
 * where one was measured on another body (`acrossBodies`); each made once for its profile, the
 * striker's spec and the postures read at, own then target, as a profile and a spec are immutable.
 */
export function profileReader(runs: RunReader): ReadsProfile {
  const readings = new WeakMap<Profile, WeakMap<BodySpec, Map<string, Map<string, ProfileReading>>>>();
  return (profile, striker, postures = STANDING) => {
    let bySpec = readings.get(profile);
    if (!bySpec) readings.set(profile, bySpec = new WeakMap());
    let byOwn = bySpec.get(striker);
    if (!byOwn) bySpec.set(striker, byOwn = new Map());
    let byTarget = byOwn.get(postures.own);
    if (!byTarget) byOwn.set(postures.own, byTarget = new Map());
    const known = byTarget.get(postures.target);
    if (known) return known;
    const reading = acrossBodies(profile, striker, profileReading(profile, striker, postures, runs));
    byTarget.set(postures.target, reading);
    return reading;
  };
}

/** **`profile` read for a skill of a body of `striker`** (`ProfileReading`) at `postures`, by its trials nearest a start (`nearestRun`). */
export const readProfile: ReadsProfile = profileReader(nearestRun);

/** What a body's trials in one phase are read by: those its skill ran from (`run`), those it let go by the progress let go at (`letGo`), and its reach. */
interface Phase {
  readonly run: Sample;
  readonly letGo: ReadonlyMap<number, Sample>;
  readonly reach: number;
  /** The most hit points a second, and the fewest seconds of a start that deals any, of any start of its trials (`ProfileReading.peak`, `fastest`); found when first asked. */
  extremes?: { readonly peak: number; readonly fastest: number };
  /** Its run trials as its reading reads them (`RunReader`); made when first asked. */
  runs?: RunReading;
}

/** The hit points a start deals and its cycle, s: the seconds it runs, and those with the seconds until its limb is back (`Trial.recovers`). */
export type Cycle = { readonly dealt: number; readonly cycle: number; readonly seconds: number };

/**
 * **A phase's run trials as a reading reads them at a start** (`ProfileReading.expect`, `rate`), its
 * bodies at the levels `levels` (`bodyNumbers`' order): what they bring against `struck` but what
 * letting go costs, and the hit points they deal and their cycle; null where they read nothing.
 */
export interface RunReading {
  expect(at: Asked, levels: Float64Array, struck: BodySpec | null): Omit<Expected, "letGo"> | null;
  cycle(at: Asked, levels: Float64Array): Cycle | null;
}

/** **A way to read a phase's run trials** (`RunReading`), for a body of `own` hit points. */
export type RunReader = (run: Sample, own: number) => RunReading;

/** **The nearest trials** (`NEAREST`, `eachNearest`): the mean of what the trials nearest the start brought. */
export function nearestRun(run: Sample, own: number): RunReading {
  return {
    expect(at, levels, struck) {
      const shares = new Map<string, number>();
      let done = 0, dealt = 0, taken = 0, seconds = 0, recovered = 0, recovers = 0, down = 0;
      const exits: Record<string, number> = {}, exited: Record<string, number> = {};
      const n = eachNearest(run, at, levels, (trial) => {
        if (trial.done) done++;
        if (trial.down) down++;
        dealt += trial.dealt; taken += trial.taken; seconds += trial.seconds;
        if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
        if (trial.end !== undefined) shares.set(trial.end, (shares.get(trial.end) ?? 0) + 1);
        for (const key in trial.exit) { exits[key] = (exits[key] ?? 0) + trial.exit[key]!; exited[key] = (exited[key] ?? 0) + 1; }
      });
      if (n === 0) return null;
      return { done: done / n, dealt: struck ? dealt / n / struck.wounds.hp.value : 0, taken: taken / n / own, seconds: seconds / n, recovers: recovered ? recovers / recovered : 0, down: down / n,
        ends: [...shares].map(([end, count]) => ({ at: end, share: count / n })),
        ...(Object.keys(exits).length ? { exit: Object.fromEntries(Object.keys(exits).map(key => [key, exits[key]! / exited[key]!])) } : {}) };
    },
    cycle: (at, levels) => cycleAt(run, at, levels),
  };
}

/** **The hit points `sample`'s trials nearest `at` deal, and their cycle**, s: the mean seconds they ran and, of those that recorded it, until their limb was back (`Trial.recovers`). */
function cycleAt(sample: Sample, at: Asked, asked: Float64Array): Cycle | null {
  let dealt = 0, seconds = 0, recovered = 0, recovers = 0;
  const n = eachNearest(sample, at, asked, (trial) => {
    dealt += trial.dealt; seconds += trial.seconds;
    if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
  });
  return n === 0 ? null : { dealt: dealt / n, seconds: seconds / n, cycle: seconds / n + (recovered ? recovers / recovered : 0) };
}

/**
 * **`profile` read for a skill of a body of `striker` at `postures`** (`ProfileReading`), its run
 * trials read by `runs`: its trials begun there alone (`Start.postures`), none where none was, a
 * phase with none read at its clear trials; its reach, extremes and what letting go costs its
 * nearest trials'. Made anew; `profileReader` keeps them.
 */
function profileReading(profile: Profile, striker: BodySpec, postures: Postures, runs: RunReader): ProfileReading {
  const own = striker.wounds.hp.value;
  const trials = profile.trials.filter((trial) => startedAt(trial.start, postures));
  const numbers = bodyNumbers(trials);
  const askedAt = new WeakMap<BodySpec, Float64Array>();
  let askedAlone: Float64Array | null = null;
  /** The body numbers a reading against `struck` is asked at (`bodyNumbers`): the striker's and `struck`'s, as their specs have them. */
  const asked = (struck: BodySpec | null): Float64Array => {
    if (!numbers.length) return NO_NUMBERS;
    const known = struck ? askedAt.get(struck) : askedAlone;
    if (known) return known;
    const made = Float64Array.from(numbers, (number) => number.asked(striker, struck));
    if (struck) askedAt.set(struck, made); else askedAlone = made;
    return made;
  };
  /** What `scaled` found, a struck spec (`scaledAt`) or none struck (`scaledAlone`); undefined until asked. */
  const scaledAt = new WeakMap<BodySpec, string | null>();
  let scaledAlone: string | null | undefined;
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
    const made: Phase = { run: sampleOf(run, numbers), letGo: new Map([...byProgress].map(([progress, those]) => [progress, sampleOf(those, numbers)])), reach };
    phases.set(phase, made);
    return made;
  };
  const extremes = (phase: string): NonNullable<Phase["extremes"]> => {
    const of = read(phase);
    if (of.extremes) return of.extremes;
    let peak = 0, fastest = Infinity;
    for (const trial of of.run.trials) {
      const at = cycleAt(of.run, trial.start, numbers.length ? numbersAt(trial.start, numbers) : NO_NUMBERS);
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
      const levels = asked(struck), run = (of.runs ??= runs(of.run, own)).expect(at, levels, struck);
      if (!run || at.progress === undefined) return run;
      const letGo = letGoAt(of, at, levels, at.progress);
      return letGo ? { ...run, letGo: { seconds: letGo.seconds, taken: letGo.taken / own } } : run;
    },
    rate(at, struck) {
      const of = read(at.phase);
      if (at.range > of.reach) return null;
      const cycle = (of.runs ??= runs(of.run, own)).cycle(at, asked(struck));
      return cycle ? cycle.cycle > 0 ? (struck ? cycle.dealt / struck.wounds.hp.value : 0) / cycle.cycle : 0 : null;
    },
    peak: (phase, struck) => extremes(phase).peak / struck.wounds.hp.value,
    fastest: (phase) => extremes(phase).fastest,
    scaled(struck) {
      const known = struck ? scaledAt.get(struck) : scaledAlone;
      if (known !== undefined) return known;
      // A profile of a skill at a foe is one whose trials record the body they struck.
      const was = struck ? trials.find((trial) => trial.start.struck)?.start.struck : undefined, now = struck && struckNumbers(struck);
      const why = [...was && now && (was.stature !== now.stature || was.mass !== now.mass)
        ? [`measured against a body of ${was.stature} m and ${was.mass} kg, read against one of ${now.stature} m and ${now.mass} kg`] : [],
        ...[heldPast(trials, "own", striker), struck && was ? heldPast(trials, "target", struck) : null].filter((one) => one !== null)];
      const made = why.length ? why.join("; ") : null;
      if (struck) scaledAt.set(struck, made); else scaledAlone = made;
      return made;
    },
  };
  return reading;
}

/** **What letting go at `progress` cost** from `at`: of the trials of `of` let go at the progress nearest it, the mean of those nearest `at`; null where none was let go. */
function letGoAt(of: Phase, at: Asked, asked: Float64Array, progress: number): { readonly seconds: number; readonly taken: number } | null {
  let nearest: number | null = null;
  for (const one of of.letGo.keys()) if (nearest === null || Math.abs(one - progress) < Math.abs(nearest - progress)) nearest = one;
  if (nearest === null) return null;
  let seconds = 0, taken = 0;
  const n = eachNearest(of.letGo.get(nearest)!, at, asked, (trial) => { seconds += trial.letGo!.seconds; taken += trial.letGo!.taken; });
  return n === 0 ? null : { seconds: seconds / n, taken: taken / n };
}
