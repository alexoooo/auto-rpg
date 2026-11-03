/**
 * **A skill's profile**: what its drill measured the skill to bring from where it began, so that a
 * chooser prices it on measured numbers rather than a hand-built model. Few dimensions: the range to
 * the foe, centre to centre across the ground, m, and the foe's phase as the striker sensed it when
 * it began (the `phase` percept, `sensedPhase`: a skill with no foe, a ground edge, has one cell, at
 * no range, clear). Each cell holds what its trials came to (`ProfileCell`). A profile names what it
 * was measured on (`Measured`) and the body it was measured against (`Target`, none for a skill with
 * no foe); one read for another body, skill, rate or reaction time is stale (`staleness`), and a
 * chooser prices that skill by hand.
 *
 * Profiles are data scripts write from drill records: the strikes' from the Strike drill
 * (`research/strike-profiles.mjs`, `assets/core/strike-profiles.json`), the ground edges' from the
 * Rise drill (`research/edge-profiles.mjs`, `assets/core/edge-profiles.json`) and the gaits' from
 * the Gait drill (`research/gait-profiles.mjs`, `assets/core/gait-profiles.json`). A mind reaches
 * them as mind data (`dataOf("strike-profiles")`, `"edge-profiles"`, `"gait-profiles"`), which the
 * parts that read them declare (`Part.reads`), and reads one through `readProfile`, never a skill's
 * code.
 */
import { dataOf, type DataKey } from "../../data/store.ts";
import { bodyKey, type BodySpec } from "../../spec/body.ts";
import type { ActionConfig, ExecutorEntry } from "../config.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";

declare module "../../data/store.ts" {
  interface DataOf {
    /** What the Strike drill measured every strike to bring. */
    "strike-profiles": readonly Profile[];
    /** What the Rise drill measured every ground edge to bring. */
    "edge-profiles": readonly Profile[];
    /** What the Gait drill measured every gait to leave a body unbraced. */
    "gait-profiles": readonly Profile[];
  }
}

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
 * **One cell of a profile**: where its trials began (range, the foe's phase), how
 * many there were, and what they came to: the share done (a strike landed, an edge reached its
 * posture), the life its blows took from the body struck (each contact's damage at the struck
 * segment's cost in life, `lifeFactor`) and the hit points its own body lost, each a share of a
 * body's life once over that body's hit points, the seconds a
 * trial ran, the share that ended with the body down, and where those not done came to rest (an
 * edge's positions), each with its share; and, where its drill let it go from there before its
 * point of no return, what that cost at each progress of the motion it was let go at.
 */
export interface ProfileCell {
  readonly range: number;
  readonly phase: string;
  readonly trials: number;
  readonly done: number;
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  readonly down: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
  /**
   * What letting it go before its point of no return cost, by the progress of the motion it was let
   * go at (s from its start, in order): the seconds until the hand was back at its guard, and the
   * hit points its body lost meanwhile; absent where no drill let it go.
   */
  readonly letGo?: readonly { readonly progress: number; readonly seconds: number; readonly taken: number }[];
  /**
   * The percepts its trials ended in where the skill did, by name, each over the trials that
   * recorded it (a strike's range head to head to the foe, `range`, m); absent where none did.
   * The postures an edge leaves are its `ends`.
   */
  readonly exit?: Readonly<Record<string, number>>;
  /** How the two bodies stood as its trials began (`Postures`); absent, both standing. */
  readonly postures?: Postures;
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

/** Both bodies standing: what a cell that names no postures was measured at, and what a profile is read at unless asked otherwise. */
export const STANDING: Postures = Object.freeze({ own: "standing", target: "standing" });

/** Whether `cell` was measured with the bodies standing as `postures` say (`ProfileCell.postures`, both standing where it names none). */
const cellAt = (cell: ProfileCell, postures: Postures): boolean =>
  (cell.postures ?? STANDING).own === postures.own && (cell.postures ?? STANDING).target === postures.target;

/** **Whether `profile` measured its skill with the bodies standing as `postures` say**: a cell of it was (`cellAt`); one that was not says nothing of them. */
export const measuredAt = (profile: Profile, postures: Postures): boolean => profile.cells.some((cell) => cellAt(cell, postures));

export interface Profile {
  readonly measured: Measured;
  /** The body it was measured against; null for a skill with no foe. */
  readonly target: Target | null;
  readonly cells: readonly ProfileCell[];
  /** The limbs a strike's trials were thrown with (effector segments, `hand.right`), which a foe's strikes are modelled by; absent for a skill thrown with none. */
  readonly limbs?: readonly string[];
}

/** Where a skill would begin: the range, m, and the foe's phase. */
interface ProfilePlace {
  readonly range: number;
  readonly phase: string;
  /** How far the motion is under way, s from its start; absent, not begun. */
  readonly progress?: number;
}

/**
 * **What a skill is expected to bring from a place** (`ProfileReading.expect`), in life, a share
 * of a body's full life: the share done; the struck body's life its blows take; its own body's life
 * lost; the seconds a trial ran; the chance it ends down; where those not done came to rest; and,
 * where its drill let it go there, what letting it go at the place's progress cost (its nearest
 * measured: the seconds until the hand was back at its guard, and its own life lost meanwhile).
 */
export interface Expected {
  readonly done: number;
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  readonly down: number;
  readonly ends: ProfileCell["ends"];
  readonly letGo?: { readonly seconds: number; readonly taken: number };
  /** The percepts it is expected to leave the body in, by name (`ProfileCell.exit`); absent where its cell names none. */
  readonly exit?: ProfileCell["exit"];
}

/**
 * **A profile as a mind reads it**, the one way any is read (`readProfile`). A body in a phase the
 * profile has no cells of is read at its clear cells. Its cells' hit points are the rules' damage
 * on the body it was measured against, read over the hit points of the body struck now: a blow on a
 * body of another mass delivers it within about one per cent (an arm's reduced mass against a whole
 * body's), so the hit points are taken as they are, and the reading says it is scaled (`scaled`).
 */
export interface ProfileReading {
  readonly profile: Profile;
  /** The farthest range it reads at for a body in `phase`, m: its farthest cell, and half its spacing on; -Infinity with no cells. */
  reach(phase: string): number;
  /** What it expects from `at` against `struck` (none for a skill with no foe): its nearest cell by range within its reach, the first of equals; null beyond. */
  expect(at: ProfilePlace, struck: BodySpec | null): Expected | null;
  /** What it expects from `range` m in `phase` to take of `struck`'s life a second: `expect`'s dealt over its seconds, null where it expects nothing. */
  rate(range: number, phase: string, struck: BodySpec | null): number | null;
  /** The most of `struck`'s life a second any of its cells for a body in `phase` takes; 0 with none. */
  peak(phase: string, struck: BodySpec): number;
  /** Why its cells are read scaled for `struck`, a sentence; null where `struck` is its target, or it has none. */
  scaled(struck: BodySpec | null): string | null;
}

/** Each profile's readings, by the striker's spec and the postures read at: a profile and a spec are immutable. */
const READINGS = new WeakMap<Profile, WeakMap<BodySpec, Map<string, ProfileReading>>>();

/**
 * **`profile` read for a skill of a body of `striker`** (`ProfileReading`) at `postures`: its cells
 * measured there alone (`ProfileCell.postures`), none where none was; made once for the three.
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

/** `profile` read for a skill of a body of `striker` at `postures` (`readProfile`), made anew: for a profile made for one reading, which no later read asks again. */
export function profileReading(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  const own = striker.wounds.hp.value;
  const cells = profile.cells.filter((cell) => cellAt(cell, postures));
  const phaseOf = (phase: string): string => cells.some((cell) => cell.phase === phase) ? phase : "clear";
  // Each phase a body is read in: the cells it reads at (`phaseOf`), in order, and their reach; found once a phase.
  const phases = new Map<string, { readonly cells: readonly ProfileCell[]; readonly reach: number }>();
  const read = (phase: string) => {
    const known = phases.get(phase);
    if (known) return known;
    const at = phaseOf(phase), of = cells.filter((cell) => cell.phase === at);
    let far = -Infinity, next = -Infinity;
    for (const cell of of) if (cell.range > far) { next = far; far = cell.range; } else if (cell.range > next && cell.range < far) next = cell.range;
    const made = { cells: of, reach: far + (next > -Infinity ? (far - next) / 2 : 0) };
    phases.set(phase, made);
    return made;
  };
  const reach = (phase: string): number => read(phase).reach;
  /** The cell nearest `range` by range of those a body in `phase` reads, the first of equals, within its reach; null beyond or with none. */
  const nearest = (range: number, phase: string): ProfileCell | null => {
    const { cells: of, reach: far } = read(phase);
    if (range > far) return null;
    let best: ProfileCell | null = null, distance = Infinity;
    for (const cell of of) {
      const d = Math.abs(cell.range - range);
      if (d < distance) { best = cell; distance = d; }
    }
    return best;
  };
  const reading: ProfileReading = {
    profile, reach,
    expect(at, struck) {
      const best = nearest(at.range, at.phase);
      if (!best) return null;
      const progress = at.progress ?? 0;
      let letGo: NonNullable<ProfileCell["letGo"]>[number] | null = null;
      for (const one of best.letGo ?? []) if (!letGo || Math.abs(one.progress - progress) < Math.abs(letGo.progress - progress)) letGo = one;
      return { done: best.done, dealt: struck ? best.dealt / struck.wounds.hp.value : 0, taken: best.taken / own, seconds: best.seconds, down: best.down, ends: best.ends,
        ...(letGo ? { letGo: { seconds: letGo.seconds, taken: letGo.taken / own } } : {}), ...(best.exit ? { exit: best.exit } : {}) };
    },
    rate(range, phase, struck) {
      const best = nearest(range, phase);
      return best ? (struck ? best.dealt / struck.wounds.hp.value : 0) / best.seconds : null;
    },
    peak(phase, struck) {
      const at = phaseOf(phase), hp = struck.wounds.hp.value;
      let most = 0;
      for (const cell of cells) if (cell.phase === at) most = Math.max(most, cell.dealt / hp / cell.seconds);
      return most;
    },
    scaled(struck) {
      const target = profile.target;
      if (!target || !struck) return null;
      const body = bodyKey(struck);
      return body !== target.body ? `measured against ${target.body}, read against ${body}` : specDigest(struck) !== target.spec ? `measured against another ${body}` : null;
    },
  };
  return reading;
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
 * left out: they are how the rules read a blow on it (`src/core/rules/pool.ts`), not how it moves.
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
  let digest = byPart.get(part ?? NO_PART);
  if (digest === undefined) byPart.set(part ?? NO_PART, digest = readSkillDigest(part, spec, executor === NO_EXECUTOR ? null : executor, action));
  return digest;
}

/** Each strike's digest (`skillDigest`), by its action, its executor, its body's spec and its executor's part: each is frozen data, read once. */
const SKILL_DIGESTS = new WeakMap<ActionConfig, WeakMap<ExecutorEntry, WeakMap<BodySpec, WeakMap<object, string>>>>();
/** `executor`'s part. */
const executorPart = (parts: PartLookup, executor: ExecutorEntry) => parts.of("executor", executor) as { readonly reads?: (config: ExecutorEntry) => readonly DataKey[] };
/** The keys of an action whose executor is none of those given. */
const NO_EXECUTOR = Object.freeze({}) as ExecutorEntry, NO_PART = Object.freeze({});

function readSkillDigest(part: ReturnType<typeof executorPart> | null, spec: BodySpec, executor: ExecutorEntry | null, action: ActionConfig): string {
  const body = bodyKey(spec);
  const data = executor && part ? (part.reads?.(executor) ?? []).map((key) => digestOf((dataOf(key) as Readonly<Record<string, unknown>>)[body] ?? null)) : [];
  const { name: _action, executor: _executor, ...does } = action;
  return digestOf({ action: does, executor: executor && (({ name: _, ...rest }) => rest)(executor), data });
}

/** A ground technique's digest: its config, as its stand-up holds it. */
export const techniqueDigest = (technique: PartConfig): string => digestOf(technique);

/** A gait's digest: its legs' config (`GAITS`) and the digest of the strike its drill stops to throw (`skillDigest`), whose readiness ends the time it leaves the body unbraced. */
export const gaitDigest = (legs: PartConfig, strike: string): string => digestOf({ legs, strike });

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

/**
 * **What the rise's edge `technique` is expected to bring a body of `spec` at `hz`, its command
 * `delay` steps late**: its profile
 * among `profiles` (`dataOf("edge-profiles")` unless given) read through `readProfile`, from where it begins (`expected`); and how it is
 * priced, a sentence (`priced`): measured, or not, and why (no drill measured it, or its profile is
 * stale, `staleness`).
 */
export function edgeExpected(spec: BodySpec, technique: PartConfig, hz: number, delay: number, profiles: readonly Profile[] = dataOf("edge-profiles")): { readonly expected: Expected | null; readonly priced: string } {
  const found = profileFor(profiles, measuredOn(spec, techniqueDigest(technique), hz, null, hz, delay));
  if (!found) return { expected: null, priced: "no drill measured it" };
  if (found.stale !== null) return { expected: null, priced: found.stale };
  const expected = readProfile(found.profile, spec).expect({ range: 0, phase: "clear" }, null);
  return { expected, priced: expected ? "measured" : "no cell of its profile reads from where it begins" };
}
