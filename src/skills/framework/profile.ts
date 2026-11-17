/**
 * **A skill's profile**: what the skill was measured to bring from where it began, so that a
 * chooser prices it on measured numbers rather than a hand-built model: a strike's against a foe
 * fighting back, from starts drawn at random (the Strike drill's `sparring` and `sparring-laid`),
 * never at a drill's still target, which reads how well the body throws it and nothing of what it brings; a ground edge's,
 * which has no foe, in its own tries. A profile is a sample of
 * trials (`Trial`), each keeping what it brought and where it began (`Start`): the range to the
 * foe, centre to centre across the ground, m; the foe's phase as the striker sensed it (the `phase`
 * percept, `sensedPhase`); how the two bodies stood; and the velocity at the start, in the frame of
 * the skill's target (`startVelocity`), or, for a skill with no target, the body's own (forward and
 * to its right of its facing); for a skill begun from a window, where in it the body stood; and
 * the Steadiness and haste its bodies' characters set, where they were not their models' own
 * (`Levels`). A
 * reading takes the trials nearest the start asked at (`NEAREST`), its velocity and its place in
 * its window within the spans its trials began at (`within`), and its bodies' levels, which are
 * their specs', within those its trials began at (`LEVELS`). A
 * skill with no foe, a ground edge, begins at no range, clear. A profile is found by the question
 * it answers (`Measured`): its skill and variation, the limb that throws it, its body's model and
 * what that body holds, the world's rates and the senses' reaction time; and by the body it was
 * measured against (`Target`, none for a skill with no foe). The code it was measured on is no
 * part of what finds it: a retrained network or a tuned setting leaves it read until its own tool
 * measures it again, a number its character sets is read at the nearest its trials began at, and
 * where it came from is kept on it (`Origin`), which labels it and finds nothing. One of another
 * body, loadout, skill or limb answers another question (`askedOtherwise`) and is never read for
 * it; one measured at another rate, delay or reaction time is stale (`staleness`) and still read,
 * so a chooser prices a skill by hand only where nothing measured it.
 *
 * Each dataset owner declares and loads its profiles. Readers use `readProfile`; identity
 * selects the loaded data each provider declares relevant to a subject (`dataIdentity`).
 */
import { dataIdentity, type DataKey, type DataLoader } from "../../core/data/store.ts";
import { characterDefaults, type BodyModel } from "../../core/bodies/models.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { hypot } from "../../core/math/real.ts";
import type { ActionConfig, ExecutorEntry } from "../config.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { chosenVariation, type Varied } from "./variations.ts";

/**
 * **The question a profile answers**, which it is found by: its body's model and what that body
 * held (`holdsOf`; absent, nothing), its skill as its character holds it (`skill/variation`,
 * `strikeSkill`, `techniqueSkill`), the limb a strike was thrown with (absent for a skill thrown
 * with none), the world's rate, Hz, how late its senses showed the other body, s (null for a skill
 * that reads none), the rate its mind's driver ran at, Hz, where that is not the world's (`rateOf`,
 * `LayerOptions.every`), and the steps its body's command waited (`World.delay`), where there were
 * any (`delayOf`).
 */
export interface Measured {
  readonly body: string;
  readonly holds?: string;
  readonly skill: string;
  readonly limb?: string;
  readonly hz: number;
  readonly reaction: number | null;
  readonly rate?: number;
  readonly delay?: number;
}

/** **The steps a body's command waited** where `measured` was measured: its `delay`, else none. */
const delayOf = (measured: Measured): number => measured.delay ?? 0;

/** **The rate the mind's driver ran at** where `measured` was measured, Hz: its `rate`, else the world's. */
const rateOf = (measured: Measured): number => measured.rate ?? measured.hz;

/** The body a profile was measured against: its model and what it held (`holdsOf`; absent, nothing). */
interface Target {
  readonly body: string;
  readonly holds?: string;
}

/**
 * **Where a profile came from**, which finds and refuses none: the digests of its body's spec, of
 * its skill and of the spec of the body it was measured against, as its trials were played
 * (`specDigest`, `skillDigest`, `techniqueDigest`); and the commit its trials were played on,
 * whether a build input differed from it, and the day, where its tool knew them.
 */
export interface Origin {
  readonly spec?: string;
  readonly skill?: string;
  readonly target?: string;
  readonly commit?: string;
  readonly changed?: boolean;
  readonly date?: string;
}

/** **What a body of `spec` holds**, each item's name by the segment that holds it, in the segments' order by name; undefined with nothing. */
export function holdsOf(spec: Pick<BodySpec, "held">): string | undefined {
  const held = spec.held ?? [];
  return held.length ? held.map((one) => `${one.segment}:${one.item.name}`).sort().join(",") : undefined;
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
 * absent where it begins from none or its drill did not record it, read as at the middle; how each
 * body stood (`Stances`), absent where its drill did not record it, read as alike any. A trial
 * records as well the levels its bodies began at (`Levels`); a reading is asked at none, its
 * bodies' levels being their specs' (`Asked`).
 */
interface Start {
  readonly range: number;
  readonly phase: string;
  readonly postures?: Postures;
  readonly velocity?: readonly [number, number];
  readonly window?: readonly [number, number];
  readonly stance?: Stances;
  readonly levels?: Levels;
}

/**
 * **How a body stands**, m (`stanceNumbers`, `src/skills/perception/stance-numbers.ts`): its feet's stagger along the line to the other
 * body, positive with its left foot nearer it; their width across that line; and its centre's
 * height over them. Numbers, not a named stance, so a reading takes the trials begun nearest how
 * the bodies stand whatever gait stood them so.
 */
export type StanceNumbers = {
  readonly stagger: number;
  readonly width: number;
  readonly height: number;
};

/** **How the two bodies of a start stood** (`StanceNumbers`): the body whose skill it is, `own`, and the body it struck, `target`; each absent where it was not read. */
export type Stances = {
  readonly own?: StanceNumbers;
  readonly target?: StanceNumbers;
};

/** The span each of a body's stance numbers is read over (`STANCES`), m. */
export const STANCE_SPANS: Readonly<Record<keyof StanceNumbers, number>> = Object.freeze({ stagger: 1, width: .4, height: .02 });

/**
 * **The stance numbers a start is compared by**, beside its range, velocity and place: each body's
 * each number, and the span over which trials are taken as alike, m. A sparring start is mostly a
 * walking one, and a walk swings the feet's stagger 0.3 m either way a stride and their width
 * 0.2 m, staggered or square alike, while a staggered body's centre stands about 0.045 m lower:
 * height tells the two apart, stagger and width little. Tuned on 335 trials of
 * `sparring-stances`, a Warrior at a Warrior: with these spans a start's ten nearest trials were of
 * its own pairing 0.57 to 0.72 of the time (a quarter by chance), and height alone did as well.
 */
const STANCES = Object.freeze(((["own", "target"] as const).flatMap((of) => (["stagger", "width", "height"] as const).map((key) => ({ of, key, span: STANCE_SPANS[key] })))));

/** `stance`'s numbers in `STANCES`' order into `out` from `at`, NaN where it records none. */
function stanceInto(stance: Stances | undefined, out: Float64Array, at = 0): void {
  for (let k = 0; k < STANCES.length; k++) { const { of, key } = STANCES[k]!; out[at + k] = stance?.[of]?.[key] ?? NaN; }
}

/** Where a reading is asked at: a start less its bodies' levels, which the reading takes from their specs. */
type Asked = Omit<Start, "levels">;

/** The numbers a character sets that a trial records of a body (`AttributeSpec`), per cent: each absent where it was its model's own (`characterDefaults`). */
interface BodyLevels {
  readonly steadiness?: number;
  readonly haste?: number;
}

/** **The levels a trial's bodies began at** (`BodyLevels`): the body whose skill it is, `own`, and the body it struck, `target`; each absent where every level was its model's own. */
interface Levels {
  readonly own?: BodyLevels;
  readonly target?: BodyLevels;
}

/**
 * **The levels a start is compared by**, beside its range, its velocity and its place: each body's
 * each level, and the span over which trials are taken as alike, per cent. The spans are tuned on
 * no reading: no stored profile holds trials begun at two levels.
 */
const LEVELS = Object.freeze(((["own", "target"] as const).flatMap((of) => [{ of, level: "steadiness", span: 2 }, { of, level: "haste", span: 10 }] as const)));

/** A reading of a profile whose trials record no level: asked at none. */
const NO_LEVELS = new Float64Array(0);

/** A model's own levels (`characterDefaults`): what a body's trial that records none began at. */
const ownLevels = (model: string): BodyLevels => characterDefaults(model as BodyModel);

/**
 * **The levels a trial of `own` against `target` records** (`Start.levels`): each body's Steadiness
 * and haste where its character set it apart from its model's own; undefined where none did.
 */
export function startLevels(own: BodySpec, target: BodySpec | null): Levels | undefined {
  const of = (spec: BodySpec): BodyLevels | undefined => {
    const defaults = ownLevels(spec.model), set = (["steadiness", "haste"] as const).filter((level) => spec.attributes[level].value !== defaults[level]);
    return set.length ? Object.fromEntries(set.map((level) => [level, spec.attributes[level].value])) : undefined;
  };
  const mine = of(own), its = target ? of(target) : undefined;
  return mine || its ? { ...(mine ? { own: mine } : {}), ...(its ? { target: its } : {}) } : undefined;
}

/** **A start's levels** in `LEVELS`' order: those it records, and `defaults` where it records none. */
const levelsAt = (levels: Levels | undefined, defaults: Float64Array): Float64Array =>
  Float64Array.from(LEVELS, ({ of, level }, k) => levels?.[of]?.[level] ?? defaults[k]!);

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
interface Trial {
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
  /** Where it came from (`Origin`); absent where its tool kept none. */
  readonly from?: Origin;
}

/** A profiles' loader whose identity for a body is the profiles measured on it (`dataIdentity`): its own strikes', and what a foe of that body is modelled by. */
export function bodyProfiles(load: () => Promise<unknown>): DataLoader {
  return Object.assign(load, { identity: (data: unknown, body: string) => (data as readonly Profile[]).filter((profile) => profile.measured.body === body) });
}

const profileObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const profileNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const profileNonnegative = (value: unknown): boolean => profileNumber(value) && value >= 0;
const profileText = (value: unknown): boolean => typeof value === "string" && value.length > 0;
const profilePair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(profileNumber);
const profilePostures = (value: unknown): boolean => profileObject(value) && profileText(value.own) && profileText(value.target);
const profileLevels = (value: unknown): boolean => profileObject(value) && [value.own, value.target].every((body) => body === undefined
  || profileObject(body) && [body.steadiness, body.haste].every((level) => level === undefined || profileNumber(level)));
const profileStanceNumbers = (value: unknown): boolean => profileObject(value) && [value.stagger, value.width, value.height].every(profileNumber);
const profileStances = (value: unknown): boolean => profileObject(value) && [value.own, value.target].every((body) => body === undefined || profileStanceNumbers(body));
const profileTarget = (value: unknown): boolean => profileObject(value) && profileText(value.body) && (value.holds === undefined || profileText(value.holds));
const profileOrigin = (value: unknown): boolean => profileObject(value)
  && [value.spec, value.skill, value.target, value.commit, value.date].every((one) => one === undefined || profileText(one))
  && (value.changed === undefined || typeof value.changed === "boolean");
const profileMeasured = (value: unknown): boolean => profileTarget(value) && profileObject(value)
  && profileText(value.skill) && (value.limb === undefined || profileText(value.limb)) && profileNumber(value.hz) && value.hz > 0
  && (value.reaction === null || profileNonnegative(value.reaction))
  && (value.rate === undefined || profileNumber(value.rate) && value.rate > 0)
  && (value.delay === undefined || profileNonnegative(value.delay) && Number.isSafeInteger(value.delay));
const profileTrial = (value: unknown): boolean => profileObject(value) && profileObject(value.start)
  && profileNumber(value.start.range) && profileText(value.start.phase)
  && (value.start.postures === undefined || profilePostures(value.start.postures))
  && (value.start.velocity === undefined || profilePair(value.start.velocity))
  && (value.start.window === undefined || profilePair(value.start.window))
  && (value.start.levels === undefined || profileLevels(value.start.levels))
  && (value.start.stance === undefined || profileStances(value.start.stance))
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
  && (profile.from === undefined || profileOrigin(profile.from)));

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
  expect(at: Asked & { readonly progress?: number }, struck: BodySpec | null): Expected | null;
  /** What it expects from `at` to take of `struck`'s life a second: its nearest trials' dealt over their cycle, null where it expects nothing. */
  rate(at: Asked, struck: BodySpec | null): number | null;
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
 * alike, and in its bodies' levels where its profile's trials record any (`LEVELS`). Tuned: about a stride's worth of neighbours on the range a strike's window spans, a step's
 * change of pace, and a quarter of the depth of a stomp's window.
 */
const NEAREST = Object.freeze({ trials: 10, range: .1, speed: .25, place: .1 });

/** The span of range over which a reading takes its trials as alike, m (`NEAREST.range`). */
export const PROFILE_RANGE_SPAN = NEAREST.range;

/** How near two distances are taken as one: the nearest trials' ties. */
const TIE = 1e-9;

/** Each profile's readings, by the striker's spec and the postures read at, own then target: a profile and a spec are immutable. */
const READINGS = new WeakMap<Profile, WeakMap<BodySpec, Map<string, Map<string, ProfileReading>>>>();

/**
 * **`profile` read for a skill of a body of `striker`** (`ProfileReading`) at `postures`: its trials
 * begun there alone (`Start.postures`), none where none was; made once for the three.
 */
export function readProfile(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  let bySpec = READINGS.get(profile);
  if (!bySpec) READINGS.set(profile, bySpec = new WeakMap());
  let byOwn = bySpec.get(striker);
  if (!byOwn) bySpec.set(striker, byOwn = new Map());
  let byTarget = byOwn.get(postures.own);
  if (!byTarget) byOwn.set(postures.own, byTarget = new Map());
  const known = byTarget.get(postures.target);
  if (known) return known;
  const reading = profileReading(profile, striker, postures);
  byTarget.set(postures.target, reading);
  return reading;
}

/** A start's velocity and place in its window, read as a reading reads them (`within`): closing, across, ahead and aside. */
type Read = readonly [number, number, number, number];

/**
 * **Trials sorted by the range they began at**, with their starts in arrays made once; and the span
 * of their starts' velocities, closing and across, and of their places in their window, ahead and
 * aside (`low`, `high`, in that order, `Read`), which a start is read within (`within`). Where its
 * profile's trials record levels, each trial's (`levels.at`, in `LEVELS`' order) and their spans;
 * where they record stances, the same of those (`stances`). The nearest to a start are found
 * through trees of its trials (`Tree`), made when first asked.
 */
interface Sample {
  readonly trials: readonly Trial[];
  readonly range: Float64Array;
  readonly closing: Float64Array;
  readonly across: Float64Array;
  readonly ahead: Float64Array;
  readonly aside: Float64Array;
  /** Query scratch: a trial's distance from the start asked, where `asked` holds that query's mark. */
  readonly distances: Float64Array;
  readonly asked: Float64Array;
  readonly low: Read;
  readonly high: Read;
  readonly levels: { readonly at: readonly Float64Array[]; readonly low: Float64Array; readonly high: Float64Array } | null;
  /** Where any of its trials records how its bodies stood: each trial's numbers (`STANCES`' order, NaN where it records none, `stanceInto`) and their spans. */
  readonly stances: { readonly at: Float64Array; readonly low: Float64Array; readonly high: Float64Array } | null;
  /** Its trials' trees (`forestOf`), made when first searched. */
  forest: readonly Tree[] | null;
}

/** `trials` as a sample; with `defaults`, the levels a trial that records none began at, its trials' levels beside. */
function sampleOf(trials: readonly Trial[], defaults: Float64Array | null): Sample {
  const sorted = [...trials].sort((a, b) => a.start.range - b.start.range), n = sorted.length;
  const range = new Float64Array(n), closing = new Float64Array(n), across = new Float64Array(n), ahead = new Float64Array(n), aside = new Float64Array(n);
  const low: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity], high: [number, number, number, number] = [-Infinity, -Infinity, -Infinity, -Infinity];
  const levels = defaults && { at: LEVELS.map(() => new Float64Array(n)), low: new Float64Array(LEVELS.length).fill(Infinity), high: new Float64Array(LEVELS.length).fill(-Infinity) };
  const stances = sorted.some((trial) => trial.start.stance) ? { at: new Float64Array(n * STANCES.length), low: new Float64Array(STANCES.length).fill(Infinity), high: new Float64Array(STANCES.length).fill(-Infinity) } : null;
  sorted.forEach((trial, i) => {
    if (stances) {
      stanceInto(trial.start.stance, stances.at, i * STANCES.length);
      for (let k = 0; k < STANCES.length; k++) {
        const v = stances.at[i * STANCES.length + k]!;
        if (v === v) { stances.low[k] = Math.min(stances.low[k]!, v); stances.high[k] = Math.max(stances.high[k]!, v); }
      }
    }
    if (levels) levelsAt(trial.start.levels, defaults).forEach((level, k) => {
      levels.at[k]![i] = level; levels.low[k] = Math.min(levels.low[k]!, level); levels.high[k] = Math.max(levels.high[k]!, level);
    });
    const velocity = trial.start.velocity ?? STILL, place = trial.start.window ?? STILL, at: Read = [velocity[0], velocity[1], place[0], place[1]];
    range[i] = trial.start.range; closing[i] = at[0]; across[i] = at[1]; ahead[i] = at[2]; aside[i] = at[3];
    for (const k of [0, 1, 2, 3] as const) { low[k] = Math.min(low[k], at[k]); high[k] = Math.max(high[k], at[k]); }
  });
  return { trials: sorted, range, closing, across, ahead, aside, low, high, levels, stances, distances: new Float64Array(n), asked: new Float64Array(n), forest: null };
}

/**
 * **The velocity and place in its window `at` is read at in `sample`** (`Read`): its own, each
 * within the span its trials began at (`Sample.low`, `high`). A start no trial began at says
 * nothing the nearest measured one does not: read as it is, its distance would outweigh the
 * range's and take the few trials begun at the sample's extreme, from whatever range they began at.
 */
function within(sample: Sample, at: Asked, read: Nearest["read"]): void {
  const velocity = at.velocity ?? STILL, closing = velocity[0], across = velocity[1],
    window = at.window ?? STILL, ahead = window[0], aside = window[1], { low, high } = sample;
  read[0] = Math.min(high[0], Math.max(low[0], closing)); read[1] = Math.min(high[1], Math.max(low[1], across));
  read[2] = Math.min(high[2], Math.max(low[2], ahead)); read[3] = Math.min(high[3], Math.max(low[3], aside));
}

/**
 * How far `sample`'s trial `i` lies from a start at `range` read at `read` (`within`); where its
 * trials record levels, at `levels`; and where they record how their bodies stood, at `stance`
 * (NaN where not asked: a number a trial or the question lacks is no part of it), each part over
 * its span (`NEAREST`, `LEVELS`, `STANCES`).
 */
function apart(sample: Sample, i: number, range: number, read: Read, levels: Float64Array, stance: Float64Array): number {
  return apartWith(sample, i, range, read, levels, sample.stances ? stancePart(sample.stances.at, i, stance) : 0);
}

/** **Trial `i`'s stance part of its distance** from `stance` (`at`, `Sample.stances`): the sum of each number's square over its span, a number either lacks no part of it. */
function stancePart(at: Float64Array, i: number, stance: Float64Array): number {
  let squared = 0;
  for (let k = 0, from = i * STANCES.length; k < STANCES.length; k++) { const by = (at[from + k]! - stance[k]!) / STANCES[k]!.span; if (by === by) squared += by * by; }
  return squared;
}

/** **`apart`, trial `i`'s stance part given** (`stancePart`, 0 where its sample records none): the square root of its parts' squares, which `hypot` reads several times slower. */
function apartWith(sample: Sample, i: number, range: number, read: Read, levels: Float64Array, stance: number): number {
  const r = (sample.range[i]! - range) / NEAREST.range, c = (sample.closing[i]! - read[0]) / NEAREST.speed, a = (sample.across[i]! - read[1]) / NEAREST.speed,
    h = (sample.ahead[i]! - read[2]) / NEAREST.place, s = (sample.aside[i]! - read[3]) / NEAREST.place;
  let squared = r * r + c * c + a * a + h * h + s * s;
  if (sample.levels) for (let k = 0; k < LEVELS.length; k++) { const by = (sample.levels.at[k]![i]! - levels[k]!) / LEVELS[k]!.span; squared += by * by; }
  return Math.sqrt(squared + stance);
}

/**
 * **Those of a sample's trials that record the same stance numbers, as a tree** (a k-d tree): each
 * trial's numbers a distance reads, each over its span (`coords`, `dims` a trial: range, velocity,
 * place, the levels where its sample records them, and the stance numbers its trials record), its
 * trials (`order`, indices of the sample) in the tree's order, and its nodes, each the trials
 * `[start, end)` of `order`, the box their numbers lie in (`box`, low then high for each number)
 * and its two halves (`left`, `right`; -1 at a leaf). A search reads a node
 * only where the least distance its box allows is within the farthest kept: what a sample's size
 * costs a reading grows as its log, not as its size.
 */
interface Tree {
  readonly dims: number;
  readonly coords: Float64Array;
  readonly order: Int32Array;
  readonly start: Int32Array;
  readonly end: Int32Array;
  readonly left: Int32Array;
  readonly right: Int32Array;
  readonly box: Float64Array;
  /** Which stance numbers it holds (`STANCES`' order): those its trials record. */
  readonly stances: readonly number[];
}

/** How many trials a leaf of a tree holds at most. */
const LEAF = 12;

/**
 * **`sample`'s trees** (`Tree`), one for the trials that record each set of stance numbers, so each
 * is searched by every number its trials have; made once.
 */
function forestOf(sample: Sample): readonly Tree[] {
  if (sample.forest) return sample.forest;
  const n = sample.range.length, stanceAt = sample.stances?.at ?? null, groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    let recorded = 0;
    if (stanceAt) for (let k = 0; k < STANCES.length; k++) { const v = stanceAt[i * STANCES.length + k]!; if (v === v) recorded |= 1 << k; }
    let group = groups.get(recorded);
    if (!group) groups.set(recorded, group = []);
    group.push(i);
  }
  return sample.forest = [...groups].map(([recorded, trials]) => treeOf(sample, Int32Array.from(trials), STANCES.map((_, k) => k).filter((k) => recorded & 1 << k)));
}

/** **A tree of `sample`'s `trials`**, each recording the stance numbers `stances` (`Tree`). */
function treeOf(sample: Sample, trials: Int32Array, stances: readonly number[]): Tree {
  const n = trials.length, stanceAt = sample.stances?.at ?? null;
  const dims = 5 + (sample.levels ? LEVELS.length : 0) + stances.length, coords = new Float64Array(sample.range.length * dims);
  for (const i of trials) {
    const at = i * dims;
    coords[at] = sample.range[i]! / NEAREST.range; coords[at + 1] = sample.closing[i]! / NEAREST.speed; coords[at + 2] = sample.across[i]! / NEAREST.speed;
    coords[at + 3] = sample.ahead[i]! / NEAREST.place; coords[at + 4] = sample.aside[i]! / NEAREST.place;
    let d = 5;
    if (sample.levels) for (let k = 0; k < LEVELS.length; k++) coords[at + d++] = sample.levels.at[k]![i]! / LEVELS[k]!.span;
    for (const k of stances) coords[at + d++] = stanceAt![i * STANCES.length + k]! / STANCES[k]!.span;
  }
  const order = trials, most = Math.max(1, 2 * Math.ceil(n / LEAF) * 2);
  const start = new Int32Array(most), end = new Int32Array(most), left = new Int32Array(most).fill(-1), right = new Int32Array(most).fill(-1), box = new Float64Array(most * dims * 2);
  let nodes = 0;
  const build = (from: number, to: number): number => {
    const node = nodes++, at = node * dims * 2;
    start[node] = from; end[node] = to;
    for (let d = 0; d < dims; d++) { box[at + d] = Infinity; box[at + dims + d] = -Infinity; }
    for (let p = from; p < to; p++) for (let d = 0, i = order[p]! * dims; d < dims; d++) {
      const v = coords[i + d]!; if (v < box[at + d]!) box[at + d] = v; if (v > box[at + dims + d]!) box[at + dims + d] = v;
    }
    if (to - from <= LEAF) return node;
    let split = 0, widest = -1;
    for (let d = 0; d < dims; d++) { const width = box[at + dims + d]! - box[at + d]!; if (width > widest) { widest = width; split = d; } }
    if (!(widest > 0)) return node;
    const part = order.subarray(from, to).sort((a, b) => coords[a * dims + split]! - coords[b * dims + split]! || a - b), mid = from + (part.length >> 1);
    left[node] = build(from, mid); right[node] = build(mid, to);
    return node;
  };
  build(0, n);
  return { dims, coords, order, start, end, left, right, box, stances };
}

/** The nearest distances found, ascending, of a search (`nearestOf`): made once, as long as `NEAREST.trials`. */
const BEST = new Float64Array(NEAREST.trials);

/**
 * A nearest query's clamped coordinates and its bound, held through aggregation: where it is asked
 * over each number's span (`query`, NaN where it asks none) and the trials within the bound found
 * (`hits`, `count`), in the sample's order.
 */
interface Nearest { bound: number; readonly read: [number, number, number, number]; readonly levels: Float64Array; readonly stance: Float64Array; query: Float64Array; hits: Int32Array; count: number; mark: number }

/** One query's work; nested queries use a frame of their own until the outer aggregation ends. */
const nearestWork = (): Nearest => ({ bound: 0, read: [0, 0, 0, 0], levels: new Float64Array(LEVELS.length), stance: new Float64Array(STANCES.length),
  query: new Float64Array(5 + LEVELS.length + STANCES.length), hits: new Int32Array(64), count: 0, mark: 0 });
const QUERY_WORK = { depth: 0, frames: [nearestWork()], marks: 0 };

/** Keep distance `d` among the nearest `want`, returning how many have been found. */
function keepNearest(d: number, found: number, want: number): number {
  if (found === want && d >= BEST[want - 1]!) return found;
  let k = found < want ? found++ : want - 1;
  while (k > 0 && BEST[k - 1]! > d) { BEST[k] = BEST[k - 1]!; k--; }
  BEST[k] = d;
  return found;
}

/**
 * How much a node's least distance may fall short of a trial's and still prune it, over a
 * distance's square: its parts' rounding, read over spans, against the exact distance read from
 * the trial's own numbers (`apart`).
 */
const ROUNDING_SQUARED = 1e-9;

/** The least square distance from `query` (NaN numbers not asked) to `tree`'s `node`'s box. */
function boxSquared(tree: Tree, node: number, query: Float64Array): number {
  const dims = tree.dims, at = node * dims * 2, box = tree.box;
  let squared = 0;
  for (let d = 0; d < dims; d++) {
    const q = query[d]!;
    if (q !== q) continue;
    const low = box[at + d]!, high = box[at + dims + d]!, by = q < low ? low - q : q > high ? q - high : 0;
    squared += by * by;
  }
  return squared;
}

/**
 * **The trials of `sample` nearest `at`** (`NEAREST`), its bodies at the levels `asked`, nearer
 * first and ties together: written into `near`, the distance the farthest of them lies at and the
 * tie beyond (`bound`) and each trial within it in the sample's order (`hits`); false where
 * `sample` is empty. A level and a stance are read within the span its trials began at, as a
 * velocity is (`within`).
 */
function nearestOf(sample: Sample, at: Asked, asked: Float64Array, near: Nearest): boolean {
  const n = sample.range.length;
  if (n === 0) return false;
  const read = near.read, levels = near.levels, stance = near.stance;
  within(sample, at, read);
  if (sample.levels) for (let k = 0; k < LEVELS.length; k++) levels[k] = Math.min(sample.levels.high[k]!, Math.max(sample.levels.low[k]!, asked[k]!));
  // How the bodies stand is read within the span its trials stood at, as a velocity is; NaN, not asked, stays NaN.
  if (sample.stances) { stanceInto(at.stance, stance); for (let k = 0; k < STANCES.length; k++) stance[k] = Math.min(sample.stances.high[k]!, Math.max(sample.stances.low[k]!, stance[k]!)); }
  const forest = forestOf(sample), query = near.query, mark = near.mark = ++QUERY_WORK.marks;
  query[0] = at.range / NEAREST.range; query[1] = read[0] / NEAREST.speed; query[2] = read[1] / NEAREST.speed; query[3] = read[2] / NEAREST.place; query[4] = read[3] / NEAREST.place;
  const levelled = 5 + (sample.levels ? LEVELS.length : 0);
  if (sample.levels) for (let k = 0; k < LEVELS.length; k++) query[5 + k] = levels[k]! / LEVELS[k]!.span;
  /** `query` asked of `tree`: its stance numbers after the levels. */
  const askOf = (tree: Tree): Float64Array => { let d = levelled; for (const k of tree.stances) query[d++] = stance[k]! / STANCES[k]!.span; return query; };
  let tree = forest[0]!;
  const want = Math.min(NEAREST.trials, n);
  let found = 0;
  // Each trial measured, once a query; every trial within the bound is among them (`search`).
  let measured = 0;
  const distanceOf = (i: number): number => {
    if (sample.asked[i] === mark) return sample.distances[i]!;
    sample.asked[i] = mark;
    if (measured === near.hits.length) { const more = new Int32Array(measured * 2); more.set(near.hits); near.hits = more; }
    near.hits[measured++] = i;
    return sample.distances[i] = apart(sample, i, at.range, read, levels, stance);
  };
  /** Whether a node whose least square distance is `least` may hold a trial within `bound`. */
  const may = (least: number, bound: number): boolean => least <= bound * bound + ROUNDING_SQUARED;
  // The nearest: each node nearer first, none whose box lies past the farthest kept and the tie beyond it, which is never nearer than the last.
  const search = (node: number, least: number): void => {
    if (found === want && !may(least, BEST[want - 1]! + TIE)) return;
    const l = tree.left[node]!;
    if (l < 0) { for (let p = tree.start[node]!; p < tree.end[node]!; p++) found = keepNearest(distanceOf(tree.order[p]!), found, want); return; }
    const r = tree.right[node]!, toLeft = boxSquared(tree, l, query), toRight = boxSquared(tree, r, query);
    if (toLeft <= toRight) { search(l, toLeft); search(r, toRight); } else { search(r, toRight); search(l, toLeft); }
  };
  for (const one of forest) { tree = one; askOf(tree); search(0, 0); }
  const bound = BEST[want - 1]! + TIE;
  // Every trial within the bound, in the sample's order, as a walk along it read them.
  let count = 0;
  for (let k = 0; k < measured; k++) { const i = near.hits[k]!; if (sample.distances[i]! <= bound) near.hits[count++] = i; }
  near.hits.subarray(0, count).sort();
  near.bound = bound; near.count = count;
  return true;
}

/** Each trial of `sample` nearest `at` (`nearestOf`), by `each`, in the sample's order. */
function eachNearest(sample: Sample, at: Asked, asked: Float64Array, each: (trial: Trial) => void): number {
  const depth = QUERY_WORK.depth++, near = QUERY_WORK.frames[depth] ??= nearestWork();
  try {
    if (!nearestOf(sample, at, asked, near)) return 0;
    const hits = near.hits, count = near.count;
    for (let k = 0; k < count; k++) each(sample.trials[hits[k]!]!);
    return count;
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
function cycleAt(sample: Sample, at: Asked, asked: Float64Array): { readonly dealt: number; readonly cycle: number; readonly seconds: number } | null {
  let dealt = 0, seconds = 0, recovered = 0, recovers = 0;
  const n = eachNearest(sample, at, asked, (trial) => {
    dealt += trial.dealt; seconds += trial.seconds;
    if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
  });
  return n === 0 ? null : { dealt: dealt / n, seconds: seconds / n, cycle: seconds / n + (recovered ? recovers / recovered : 0) };
}

/** `profile` read for a skill of a body of `striker` at `postures` (`readProfile`), made anew: for a profile made for one reading, which no later read asks again. */
export function profileReading(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  const own = striker.wounds.hp.value;
  const trials = profile.trials.filter((trial) => startedAt(trial.start, postures));
  // The levels a trial that records none began at, its bodies' models' own: read only where a trial records one.
  const defaults = trials.some((trial) => trial.start.levels) ? levelsAt({ own: ownLevels(profile.measured.body), target: ownLevels((profile.target ?? profile.measured).body) }, NO_LEVELS) : null;
  const askedAt = new WeakMap<BodySpec, Float64Array>();
  let askedAlone: Float64Array | null = null;
  /** The levels a reading against `struck` is asked at, in `LEVELS`' order: the striker's and `struck`'s, as their specs have them. */
  const asked = (struck: BodySpec | null): Float64Array => {
    if (!defaults) return NO_LEVELS;
    const known = struck ? askedAt.get(struck) : askedAlone;
    if (known) return known;
    const made = Float64Array.from(LEVELS, ({ of, level }, k) => of === "own" ? striker.attributes[level].value : struck ? struck.attributes[level].value : defaults[k]!);
    if (struck) askedAt.set(struck, made); else askedAlone = made;
    return made;
  };
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
    const made: Phase = { run: sampleOf(run, defaults), letGo: new Map([...byProgress].map(([progress, those]) => [progress, sampleOf(those, defaults)])), reach };
    phases.set(phase, made);
    return made;
  };
  const extremes = (phase: string): NonNullable<Phase["extremes"]> => {
    const of = read(phase);
    if (of.extremes) return of.extremes;
    let peak = 0, fastest = Infinity;
    for (const trial of of.run.trials) {
      const at = cycleAt(of.run, trial.start, defaults ? levelsAt(trial.start.levels, defaults) : NO_LEVELS);
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
      const levels = asked(struck);
      const n = eachNearest(of.run, at, levels, (trial) => {
        if (trial.done) done++;
        if (trial.down) down++;
        dealt += trial.dealt; seconds += trial.seconds;
        if (trial.recovers !== null) { recovered++; recovers += trial.recovers; }
        if (trial.end !== undefined) shares.set(trial.end, (shares.get(trial.end) ?? 0) + 1);
        for (const key in trial.exit) { exits[key] = (exits[key] ?? 0) + trial.exit[key]!; exited[key] = (exited[key] ?? 0) + 1; }
      });
      if (n === 0) return null;
      const letGo = at.progress === undefined ? null : letGoAt(of, at, levels, at.progress);
      return { done: done / n, dealt: struck ? dealt / n / struck.wounds.hp.value : 0, seconds: seconds / n, recovers: recovered ? recovers / recovered : 0, down: down / n,
        ends: [...shares].map(([end, count]) => ({ at: end, share: count / n })),
        ...(letGo ? { letGo: { seconds: letGo.seconds, taken: letGo.taken / own } } : {}), ...(Object.keys(exits).length ? { exit: Object.fromEntries(Object.keys(exits).map(key => [key, exits[key]! / exited[key]!])) } : {}) };
    },
    rate(at, struck) {
      const of = read(at.phase);
      if (at.range > of.reach) return null;
      const cycle = cycleAt(of.run, at, asked(struck));
      return cycle ? cycle.cycle > 0 ? (struck ? cycle.dealt / struck.wounds.hp.value : 0) / cycle.cycle : 0 : null;
    },
    peak: (phase, struck) => extremes(phase).peak / struck.wounds.hp.value,
    fastest: (phase) => extremes(phase).fastest,
    scaled(struck) {
      const target = profile.target;
      if (!target || !struck) return null;
      const body = struck.model;
      return body !== target.body ? `measured against ${target.body}, read against ${body}`
        : holdsOf(struck) !== target.holds ? `measured against a ${body} holding ${target.holds ?? "nothing"}` : null;
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

/** Each object's digest, found once: what is digested is frozen. */
const DIGESTS = new WeakMap<object, string>();

/**
 * **A digest of `value`'s values**, 16 hex digits (two FNV-1a words): its numbers, strings and
 * flags, an object's by its keys in order, leaving out functions, what is undefined and each
 * `provenance` (where a number came from, not what it is).
 */
function digestOf(value: unknown): string {
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
 * **A body's spec's digest** (`digestOf`): where a profile measured on it came from
 * (`Origin.spec`). Its wounds are left out: they are how the rules read a blow on it
 * (`src/combat/pool.ts`), not how it moves; and its skills: a strike's digest names the variation
 * it runs (`skillDigest`).
 */
export const specDigest = (spec: BodySpec): string => {
  let digest = SPEC_DIGESTS.get(spec);
  if (digest === undefined) SPEC_DIGESTS.set(spec, digest = digestOf({ ...spec, wounds: undefined, skills: undefined }));
  return digest;
};

/** The executor among `executors` that `action` names; undefined where it names none of them. */
const executorOf = (executors: readonly ExecutorEntry[], action: ActionConfig): ExecutorEntry | undefined => executors.find((entry) => entry.name === action.executor);

/**
 * **The skill a strike's profile is found by** (`Measured.skill`): the skill `action`'s executor
 * among `executors` runs and the variation of it a body of `spec` runs (`chosenVariation`), as its
 * character holds it (`skill/variation`, `BodySpec.skills`); the action's executor's name where it
 * names none of them.
 */
export function strikeSkill(spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig): string {
  const executor = executorOf(executors, action);
  return executor ? `${executor.kind}/${chosenVariation(spec, executor.kind, executor) ?? ""}` : action.executor;
}

/** **The skill a ground technique's profile is found by** (`Measured.skill`): `technique`'s kind and the variation of it a body of `spec` runs, as its character holds it (`skill/variation`). */
export const techniqueSkill = (spec: BodySpec, technique: PartConfig): string => `${technique.kind}/${chosenVariation(spec, technique.kind, technique) ?? ""}`;

/**
 * **A strike's digest** on a body of `spec`, where its profile came from (`Origin.skill`): what it does, not what it is called: its action's
 * config and its executor's (the one the action names), each without its name, the variation of
 * the executor's skill it runs (`chosenVariation`), and the body's own
 * row of each record the executor reads (`Part.reads`: an executor's data is its skills' records by
 * model, `SkillRecord`), as the mind holds them, so another body's row moves no digest.
 */
export function skillDigest(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig): string {
  const executor = executorOf(executors, action) ?? NO_EXECUTOR;
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
  const body = spec.model;
  const aim = action.aim ? parts.of("aim", action.aim) : null;
  const variation = executor ? chosenVariation(spec, executor.kind, executor) : undefined;
  // The executor's records are asked with the variation its body runs: another variation's record moves no digest.
  const asked = executor && variation !== undefined ? { ...executor, variation } : executor;
  const keys = [...new Set([...(asked && part ? part.reads?.(asked) ?? [] : []), ...(action.aim ? aim?.reads?.(action.aim) ?? [] : [])])];
  const data = keys.map(key => digestOf(dataIdentity(key, body)));
  const { name: _action, executor: _executor, ...does } = action;
  return digestOf({ action: does, executor: executor && (({ name: _, variation: _variation, ...rest }: ExecutorEntry & Varied) => rest)(executor), ...(variation === undefined ? {} : { variation }), data });
}

/** A ground technique's digest, where its profile came from (`Origin.skill`): its config and the body's records its part reads. */
export function techniqueDigest(parts: PartLookup, spec: BodySpec, technique: PartConfig): string {
  const keys = parts.of("technique", technique).reads?.(technique) ?? [];
  const body = spec.model, data = keys.map((key) => digestOf(dataIdentity(key, body)));
  return data.length ? digestOf({ technique, data }) : digestOf(technique);
}

/**
 * The question (`Measured`) a profile of `skill` (`strikeSkill`, `techniqueSkill`) thrown with `limb` (null with none) answers for
 * a body of `spec` at `hz`, its senses `reaction` s late (null for none), its mind's driver at `rate` Hz, its command `delay` steps late.
 */
export function measuredOn(spec: BodySpec, skill: string, limb: string | null, hz: number, reaction: number | null, rate: number, delay: number): Measured {
  const holds = holdsOf(spec);
  return { body: spec.model, ...(holds === undefined ? {} : { holds }), skill, ...(limb === null ? {} : { limb }), hz, reaction, ...(rate !== hz ? { rate } : {}), ...(delay !== 0 ? { delay } : {}) };
}

/** **Whether a reaction time `now` s reads as `was` s** at `hz`: within half a step, or either unknown. */
export const sameReaction = (was: number | null, now: number | null, hz: number): boolean => was === null || now === null || Math.abs(was - now) <= .5 / hz;

/** **Why `profile` answers another question than `now` asks**, a sentence: another body, holding, skill or limb; null where it answers the same. One that does is never read for it. */
export function askedOtherwise(profile: Profile, now: Measured): string | null {
  const was = profile.measured;
  if (was.body !== now.body) return `measured on ${was.body}, read on ${now.body}`;
  if (was.holds !== now.holds) return `measured holding ${was.holds ?? "nothing"}, read holding ${now.holds ?? "nothing"}`;
  if (was.skill !== now.skill || was.limb !== now.limb) return `measured of ${was.skill}${was.limb ? ` with ${was.limb}` : ""}`;
  return null;
}

/**
 * **Why `profile` is stale for `now`**, a sentence: the first of what it was measured on that
 * differs, the question it answers (`askedOtherwise`) or a setting it was measured at (the world's
 * and the mind's rates, the command's delay, the senses' reaction time, the same by
 * `sameReaction`); null where none does. One measured at another setting is still read, labelled
 * by this, so a stale measurement prices a skill before a hand-built guess does.
 */
export function staleness(profile: Profile, now: Measured): string | null {
  const was = profile.measured, asked = askedOtherwise(profile, now);
  if (asked !== null) return asked;
  if (was.hz !== now.hz) return `measured at ${was.hz} Hz, read at ${now.hz} Hz`;
  if (rateOf(was) !== rateOf(now)) return `measured with its mind at ${rateOf(was)} Hz, read at ${rateOf(now)} Hz`;
  if (delayOf(was) !== delayOf(now)) return `measured with its command ${delayOf(was)} steps late, read ${delayOf(now)} steps late`;
  if (!sameReaction(was.reaction, now.reaction, now.hz))
    return `measured with senses ${was.reaction} s late, read ${now.reaction} s late`;
  return null;
}

/**
 * A skill's profiles looked up (`profilesFor`), one a body it was measured against: those it reads
 * (`read`), the ones measured as it is read where there are any, else those asked the same
 * question at another setting; and why those are stale, or why none is read (`stale`, null where
 * they are fresh).
 */
interface Found {
  readonly read: readonly Profile[];
  readonly stale: string | null;
}

/**
 * **The profiles of the skill and limb `now` names** among `profiles` (`Found`): each measured as
 * it is read, else each of the same question at another setting, stale (`staleness`), one a body it
 * was measured against (`profileAgainst` reads the struck body's); with none, why one on its body,
 * else any of the skill's, answers another question; null where the skill was never measured with
 * that limb.
 */
export function profilesFor(profiles: readonly Profile[], now: Measured): Found | null {
  const fresh: Profile[] = [], stale: Profile[] = [];
  let body: Profile | null = null, any: Profile | null = null;
  for (const profile of profiles) {
    if (profile.measured.skill !== now.skill || profile.measured.limb !== now.limb) continue;
    if (askedOtherwise(profile, now) !== null) { if (profile.measured.body === now.body) body ??= profile; }
    else (staleness(profile, now) === null ? fresh : stale).push(profile);
    any ??= profile;
  }
  if (fresh.length) return { read: fresh, stale: null };
  if (stale.length) return { read: stale, stale: staleness(stale[0]!, now) };
  const found = body ?? any;
  return found ? { read: [], stale: staleness(found, now) } : null;
}

/**
 * **The profile among one skill's `profiles` that a body of `struck` is read by**: the one
 * measured against its model holding what it holds (`holdsOf`); else the first against its model
 * holding otherwise, else the first of any, read scaled (`ProfileReading.scaled`). A skill with no
 * foe has one, read with none struck. Null with none.
 */
export function profileAgainst(profiles: readonly Profile[], struck: BodySpec | null): Profile | null {
  if (!struck) return profiles[0] ?? null;
  const body = struck.model, holds = holdsOf(struck);
  let another: Profile | null = null;
  for (const profile of profiles) {
    if (!profile.target || profile.target.body === body && profile.target.holds === holds) return profile;
    if (profile.target.body === body) another ??= profile;
  }
  return another ?? profiles[0] ?? null;
}

/**
 * **The profiles among `profiles` measured on a body of `spec`**, of any skill, its model holding
 * what it holds in its hands at `hz` with senses `reaction` s late, a mind's driver at `rate` Hz
 * and its command `delay` steps late (`fresh`): what a foe of that body is measured able to deal.
 * Which skills a foe's character holds is not sensed (`sensedSpec`), so every one measured on its
 * body stands for them. Those it reads (`read`): the fresh, else those measured holding as it holds
 * at another setting, stale; and why those are stale, or why none is read (`stale`, null where they
 * are fresh): the first measured on its model holding otherwise, or none measured.
 */
export function profilesOn(profiles: readonly Profile[], spec: BodySpec, hz: number, reaction: number | null, rate: number, delay: number): { readonly read: readonly Profile[]; readonly stale: string | null } {
  const body = spec.model, fresh: Profile[] = [], stale: Profile[] = [];
  let why: string | null = null, staleWhy: string | null = null;
  for (const profile of profiles) {
    const was = profile.measured;
    if (was.body !== body) continue;
    const now = measuredOn(spec, was.skill, was.limb ?? null, hz, reaction, rate, delay), asked = askedOtherwise(profile, now);
    if (asked !== null) { why ??= asked; continue; }
    const stalled = staleness(profile, now);
    if (stalled === null) fresh.push(profile);
    else { stale.push(profile); staleWhy ??= stalled; }
  }
  if (fresh.length) return { read: fresh, stale: null };
  if (stale.length) return { read: stale, stale: staleWhy };
  return { read: [], stale: why ?? `no fight measured the strikes a ${body} holds` };
}
