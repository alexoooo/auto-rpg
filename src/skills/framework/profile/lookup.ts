/**
 * **The profiles a body reads for a skill**, found by the question they answer (`Measured`,
 * `measuredOn`): fresh, else stale (`changes`), else of another body; and those a foe's body is
 * modelled by (`profilesOn`).
 */
import type { DataLoader } from "../../../core/data/store.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { ActionConfig, ExecutorEntry } from "../../config.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { chosenVariation } from "../variations.ts";
import type { Measured, Profile } from "./profile.ts";
import type { Change } from "./source.ts";
import { heldPast } from "./across.ts";
import { remembered } from "../../../core/remembered.ts";

/** The settings a profile is measured at, as a profile records them (`Measured`): a mind's rate and a command's delay are absent where they are the world's rate and none. */
type Settings = Pick<Measured, "hz" | "reaction" | "rate" | "delay">;

/** **The steps a body's command waited** where `measured` was measured: its `delay`, else none. */
const delayOf = (measured: Settings): number => measured.delay ?? 0;

/** **The rate the mind's driver ran at** where `measured` was measured, Hz: its `rate`, else the world's. */
const rateOf = (measured: Settings): number => measured.rate ?? measured.hz;

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

/** Nothing has changed since a profile was measured. */
const NO_CHANGE: readonly Change[] = Object.freeze([]);

/**
 * **What has changed since `profile` was measured, for `now`**: each setting it was measured at
 * that is another now. The settings are the world's rate, the mind's rate, the command's delay
 * and the senses' reaction time (the same by `sameReaction`). None where it was measured as it is
 * read. A profile measured at another setting is stale and still read, with these on its source
 * (`Source.stale`), so a stale measurement prices a skill before a guess does.
 */
export function changes(profile: Profile, now: Settings): readonly Change[] {
  const was = profile.measured, reacts = sameReaction(was.reaction, now.reaction, now.hz);
  if (was.hz === now.hz && rateOf(was) === rateOf(now) && delayOf(was) === delayOf(now) && reacts) return NO_CHANGE;
  return [
    ...was.hz === now.hz ? [] : [{ what: "the world's rate, Hz", measured: was.hz, asked: now.hz }],
    ...rateOf(was) === rateOf(now) ? [] : [{ what: "its mind's rate, Hz", measured: rateOf(was), asked: rateOf(now) }],
    ...delayOf(was) === delayOf(now) ? [] : [{ what: "its command's delay, steps", measured: delayOf(was), asked: delayOf(now) }],
    ...reacts ? [] : [{ what: "its senses' reaction time, s", measured: was.reaction, asked: now.reaction }],
  ];
}

/**
 * A skill's profiles looked up (`profilesFor`), one a body it was measured against: those it reads
 * (`read`), and what has changed since they were measured (`stale`, none where they are fresh).
 * It reads the ones measured on the body as it is read where there are any; else those measured
 * on the body at another setting; else those measured on the other body nearest it in stature,
 * read by stature (`acrossBodies`). Whose trials it reads is on the reading's source
 * (`ProfileReading.source`).
 */
interface Found {
  readonly read: readonly Profile[];
  readonly stale: readonly Change[];
}

/**
 * **The profiles of the skill and limb `now` names** among `profiles` (`Found`): each measured as
 * it is read, else each measured on the body at another setting, stale (`changes`), else each
 * measured on the other body nearest this one in stature; one a body it was measured against
 * (`profileAgainst` reads the struck body's); null where the skill was never measured with that
 * limb.
 */
export function profilesFor(profiles: readonly Profile[], now: Measured): Found | null {
  const fresh: Profile[] = [], stale: Profile[] = [], elsewhere: Profile[] = [];
  for (const profile of profiles) {
    if (profile.measured.skill !== now.skill || profile.measured.limb !== now.limb) continue;
    if (profile.measured.body !== now.body) elsewhere.push(profile);
    else (changes(profile, now).length === 0 ? fresh : stale).push(profile);
  }
  if (fresh.length) return { read: fresh, stale: NO_CHANGE };
  if (stale.length) return { read: stale, stale: changes(stale[0]!, now) };
  if (elsewhere.length) {
    const apart = (profile: Profile): number => Math.abs(profile.measured.stature - now.stature);
    const nearest = elsewhere.reduce((best, profile) => apart(profile) < apart(best) ? profile : best).measured.body;
    const read = elsewhere.filter((profile) => profile.measured.body === nearest);
    return { read, stale: changes(read[0]!, now) };
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
 * as they hold (`limbHoldsAsMeasured`), at `at` (`MeasuredAt`): what a foe of that body is
 * measured able to deal. Which skills a foe's character holds is not sensed (`sensedSpec`), so
 * every one measured on its body stands for them. They are the fresh, else those measured at
 * another setting (`changes`); none where no fight measured a strike its body throws as it holds.
 */
export function profilesOn(profiles: readonly Profile[], spec: BodySpec, at: MeasuredAt): readonly Profile[] {
  const body = spec.model, fresh: Profile[] = [], stale: Profile[] = [];
  for (const profile of profiles) {
    if (profile.measured.body !== body || !limbHoldsAsMeasured(profile, spec)) continue;
    (changes(profile, at).length === 0 ? fresh : stale).push(profile);
  }
  return fresh.length ? fresh : stale;
}
