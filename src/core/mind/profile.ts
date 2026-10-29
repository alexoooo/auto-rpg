/**
 * **A skill's profile**: what its drill measured the skill to bring from where it began, so that a
 * chooser prices it on measured numbers rather than a hand-built model. Few dimensions: the range to
 * the foe, centre to centre across the ground, m; how fast the two close, m/s; and the foe's phase
 * (`FoePhase`: a skill with no foe, a ground edge, has one cell, at no range, clear). Each cell holds
 * what its trials came to (`ProfileCell`). A profile names what it was measured on (`Measured`);
 * one read for another body, skill, rate or reaction time is stale (`staleness`), and a chooser
 * prices that skill by hand.
 *
 * Profiles are data scripts write from drill records: the strikes' from the Strike drill
 * (`research/strike-profiles.mjs`, `assets/core/strike-profiles.json`) and the ground edges' from
 * the Rise drill (`research/edge-profiles.mjs`, `assets/core/edge-profiles.json`). A chooser reads
 * one through `expect`, never a skill's code.
 */
import edgeData from "../../../assets/core/edge-profiles.json" with { type: "json" };
import strikeData from "../../../assets/core/strike-profiles.json" with { type: "json" };
import { dataOf } from "../data/store.ts";
import { bodyKey, type BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { ActionConfig, ExecutorEntry } from "./config.ts";
import type { PartLookup } from "./lookup.ts";
import type { PartConfig } from "./parts.ts";

/**
 * What a profile was measured on: its body (`bodyKey`) and the digest of that body's spec
 * (`specDigest`), its skill's digest (`skillDigest`, `techniqueDigest`), the world's rate, Hz, and
 * how late its senses showed the other body, s (null for a skill that reads none).
 */
export interface Measured {
  readonly body: string;
  readonly spec: string;
  readonly skill: string;
  readonly hz: number;
  readonly reaction: number | null;
}

/**
 * **One cell of a profile**: where its trials began (range, closing speed, the foe's phase), how
 * many there were, and what they came to: the share done (a strike landed, an edge reached its
 * posture), the hit points its blows took from the body struck and those its own body lost (the
 * rules' damage, each a share of a body's life once over that body's hit points), the seconds a
 * trial ran, the share that ended with the body down, and where those not done came to rest (an
 * edge's positions), each with its share; and, where its drill let it go from there before its
 * point of no return, what that cost.
 */
export interface ProfileCell {
  readonly range: number;
  readonly closing: number;
  readonly phase: string;
  readonly trials: number;
  readonly done: number;
  readonly dealt: number;
  readonly taken: number;
  readonly seconds: number;
  readonly down: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
  /** What letting it go before its point of no return cost: the seconds until it could begin again, and the hit points its body lost meanwhile; absent where no drill let it go. */
  readonly letGo?: { readonly seconds: number; readonly taken: number };
}

export interface Profile {
  readonly measured: Measured;
  readonly cells: readonly ProfileCell[];
}

/** Where a skill would begin: the range, m, the closing speed, m/s, and the foe's phase. */
export interface ProfilePlace {
  readonly range: number;
  readonly closing: number;
  readonly phase: string;
}

/** How far a metre a second of closing is from a metre of range, s, in finding the nearest cell. */
const CLOSING_SECONDS = 1;

/** **What `profile` expects from `at`**: its nearest cell of the same phase (range and closing apart, `CLOSING_SECONDS`), the first of equals; null where it has none of that phase. */
export function expect(profile: Profile, at: ProfilePlace): ProfileCell | null {
  let best: ProfileCell | null = null, distance = Infinity;
  for (const cell of profile.cells) {
    if (cell.phase !== at.phase) continue;
    const d = Math.abs(cell.range - at.range) + CLOSING_SECONDS * Math.abs(cell.closing - at.closing);
    if (d < distance) { best = cell; distance = d; }
  }
  return best;
}

/** The farthest range `profile` was measured from in `phase`, m; -Infinity where it has no cell of that phase. */
export function farthest(profile: Profile, phase: string): number {
  let most = -Infinity;
  for (const cell of profile.cells) if (cell.phase === phase) most = Math.max(most, cell.range);
  return most;
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

/** A body's spec's digest (`digestOf`): what a profile measured on it names. */
export const specDigest = (spec: BodySpec): string => digestOf(spec);

/**
 * **A strike's digest**: its action's config, its executor's (named by the action) and the mind
 * data the executor reads (`Part.reads`, a learned skill's weights), as the mind holds them.
 */
export function skillDigest(parts: PartLookup, executors: readonly ExecutorEntry[], action: ActionConfig): string {
  const executor = executors.find((entry) => entry.name === action.executor) ?? null;
  const data = executor ? (parts.of("executor", executor).reads?.(executor) ?? []).map((key) => digestOf(dataOf(key))) : [];
  return digestOf({ action, executor, data });
}

/** A ground technique's digest: its config, as its stand-up holds it. */
export const techniqueDigest = (technique: PartConfig): string => digestOf(technique);

/** What a profile of a skill of digest `skill`, read by a body of `spec` at `hz`, its senses `reaction` s late (null for none), must have been measured on. */
export const measuredOn = (spec: BodySpec, skill: string, hz: number, reaction: number | null): Measured =>
  ({ body: bodyKey(spec), spec: specDigest(spec), skill, hz, reaction });

/** **Whether a reaction time `now` s reads as `was` s** at `hz`: within half a step, or either unknown. */
export const sameReaction = (was: number | null, now: number | null, hz: number): boolean => was === null || now === null || Math.abs(was - now) <= .5 / hz;

/** **Why `profile` is stale for `now`**, a sentence: the first of what it was measured on that differs (a reaction time the same by `sameReaction`); null where none does. */
export function staleness(profile: Profile, now: Measured): string | null {
  const was = profile.measured;
  if (was.body !== now.body) return `measured on ${was.body}, read on ${now.body}`;
  if (was.spec !== now.spec) return `measured on another ${now.body}`;
  if (was.skill !== now.skill) return "measured on another version of the skill";
  if (was.hz !== now.hz) return `measured at ${was.hz} Hz, read at ${now.hz} Hz`;
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

/** **The profiles among `profiles` measured on a body of `spec`** at `hz` with senses `reaction` s late, of any skill: what a foe of that body is measured to deal. */
export function profilesOn(profiles: readonly Profile[], spec: BodySpec, hz: number, reaction: number | null): readonly Profile[] {
  const body = bodyKey(spec), digest = specDigest(spec);
  return profiles.filter((profile) => staleness(profile, { body, spec: digest, skill: profile.measured.skill, hz, reaction }) === null);
}

/** The strikes' profiles, from the Strike drill (`research/strike-profiles.mjs`). */
export const STRIKE_PROFILES: readonly Profile[] = deepFreeze((strikeData as unknown as { profiles: Profile[] }).profiles);

/** The ground edges' profiles, from the Rise drill (`research/edge-profiles.mjs`). */
export const EDGE_PROFILES: readonly Profile[] = deepFreeze((edgeData as unknown as { profiles: Profile[] }).profiles);
