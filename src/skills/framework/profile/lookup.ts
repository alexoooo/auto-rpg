/**
 * **The profiles a body reads for a skill**, found by the question they answer (`Measured`,
 * `measuredOn`): fresh, else stale (`staleness`), else of another body; and those a foe's body is
 * modelled by (`profilesOn`).
 */
import type { DataLoader } from "../../../core/data/store.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { ActionConfig, ExecutorEntry } from "../../config.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { chosenVariation } from "../variations.ts";
import type { Measured, Profile } from "./profile.ts";
import { heldPast } from "./across.ts";
import { remembered } from "../../../core/remembered.ts";

/** **The steps a body's command waited** where `measured` was measured: its `delay`, else none. */
const delayOf = (measured: Measured): number => measured.delay ?? 0;

/** **The rate the mind's driver ran at** where `measured` was measured, Hz: its `rate`, else the world's. */
const rateOf = (measured: Measured): number => measured.rate ?? measured.hz;

/** A profiles' loader whose identity for a body is the profiles measured on it (`dataIdentity`): its own strikes', and what a foe of that body is modelled by. */
export function bodyProfiles(load: () => Promise<unknown>): DataLoader {
  return Object.assign(load, { identity: (data: unknown, body: string) => (data as readonly Profile[]).filter((profile) => profile.measured.body === body) });
}

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

/** **What a profile is asked of**: its skill (`strikeSkill`, `techniqueSkill`), and the limb it is thrown with, null with none. */
export interface SkillAsked {
  readonly skill: string;
  readonly limb: string | null;
}

/** **What a body is measured at**: its world's rate, Hz; its senses' reaction time, s (null for none); its mind's driver's rate, Hz; its command's delay, steps. */
export interface MeasuredAt {
  readonly hz: number;
  readonly reaction: number | null;
  readonly rate: number;
  readonly delay: number;
}

/** The question (`Measured`) a profile asked of `asked` (`SkillAsked`) answers for a body of `spec` measured at `at` (`MeasuredAt`). */
export function measuredOn(spec: BodySpec, { skill, limb }: SkillAsked, { hz, reaction, rate, delay }: MeasuredAt): Measured {
  return { body: spec.model, stature: spec.stature.value, skill, ...(limb === null ? {} : { limb }), hz, reaction, ...(rate !== hz ? { rate } : {}), ...(delay !== 0 ? { delay } : {}) };
}

/** **Whether a reaction time `now` s reads as `was` s** at `hz`: within half a step, or either unknown. */
export const sameReaction = (was: number | null, now: number | null, hz: number): boolean => was === null || now === null || Math.abs(was - now) <= 1 / 2 / hz;

/** **Why `profile` answers another question than `now` asks**, a sentence: another body, skill or limb; null where it answers the same. One that does is never read for it. */
function askedOtherwise(profile: Profile, now: Measured): string | null {
  const was = profile.measured;
  if (was.body !== now.body) return `measured on ${was.body}, read on ${now.body}`;
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
 * question at another setting, else those asked it on another body (the nearest in stature, read
 * by stature, `acrossBodies`); and why those are stale, or why none is read (`stale`, null where
 * they are fresh).
 */
interface Found {
  readonly read: readonly Profile[];
  readonly stale: string | null;
}

/**
 * **The profiles of the skill and limb `now` names** among `profiles` (`Found`): each measured as
 * it is read, else each of the same question at another setting, stale (`staleness`), else each
 * of it measured on the other body nearest this one in stature, stale; one a body it was measured
 * against (`profileAgainst` reads the struck body's); null where the skill was never measured
 * with that limb.
 */
export function profilesFor(profiles: readonly Profile[], now: Measured): Found | null {
  const fresh: Profile[] = [], stale: Profile[] = [], elsewhere: Profile[] = [];
  for (const profile of profiles) {
    if (profile.measured.skill !== now.skill || profile.measured.limb !== now.limb) continue;
    if (askedOtherwise(profile, now) !== null) elsewhere.push(profile);
    else (staleness(profile, now) === null ? fresh : stale).push(profile);
  }
  if (fresh.length) return { read: fresh, stale: null };
  if (stale.length) return { read: stale, stale: staleness(stale[0]!, now) };
  if (elsewhere.length) {
    const apart = (profile: Profile): number => Math.abs(profile.measured.stature - now.stature);
    const nearest = elsewhere.reduce((best, profile) => apart(profile) < apart(best) ? profile : best).measured.body;
    const read = elsewhere.filter((profile) => profile.measured.body === nearest);
    return { read, stale: `${staleness(read[0]!, now)}, read by stature: coarse` };
  }
  return null;
}

/**
 * **Whether a body of `spec` throws `profile`'s strike with its limb as its trials did**: what that
 * limb holds within what theirs held (`heldPast`), so a strike its trials threw with a weapon is not
 * read of an empty hand, nor a punch of a hand that grips one. A profile of no limb fits every body.
 */
export const limbHoldsAsMeasured = (profile: Profile, spec: Pick<BodySpec, "held">): boolean => limbHolds(profile)(spec);

/** `limbHoldsAsMeasured`, found once a profile and a spec. */
const limbHolds = remembered((profile: Profile) => remembered((spec: Pick<BodySpec, "held">): boolean =>
  profile.measured.limb === undefined || heldPast(profile.trials, "own", spec, [profile.measured.limb]) === null));

/**
 * **The profiles among `profiles` measured on a body of `spec`**, of any skill its limbs throw
 * as they hold (`limbHoldsAsMeasured`), at `at` (`MeasuredAt`, `fresh`): what a foe of that body is measured
 * able to deal. Which skills a foe's character holds is not sensed (`sensedSpec`), so every one
 * measured on its body stands for them. Those it reads (`read`): the fresh, else those measured at
 * another setting, stale; and why those are stale, or why none is read (`stale`, null where they
 * are fresh).
 */
export function profilesOn(profiles: readonly Profile[], spec: BodySpec, at: MeasuredAt): { readonly read: readonly Profile[]; readonly stale: string | null } {
  const body = spec.model, fresh: Profile[] = [], stale: Profile[] = [];
  let staleWhy: string | null = null;
  for (const profile of profiles) {
    const was = profile.measured;
    if (was.body !== body || !limbHoldsAsMeasured(profile, spec)) continue;
    const stalled = staleness(profile, measuredOn(spec, { skill: was.skill, limb: was.limb ?? null }, at));
    if (stalled === null) fresh.push(profile);
    else { stale.push(profile); staleWhy ??= stalled; }
  }
  if (fresh.length) return { read: fresh, stale: null };
  if (stale.length) return { read: stale, stale: staleWhy };
  return { read: [], stale: `no fight measured the strikes a ${body} throws as it holds` };
}
