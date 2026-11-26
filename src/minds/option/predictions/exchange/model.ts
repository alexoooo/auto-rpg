import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../../core/state.ts";
import { changes, limbHoldsAsMeasured } from "../../../../skills/framework/profile/lookup.ts";
import { STANDING, measuredAt, type Postures, type Profile } from "../../../../skills/framework/profile/profile.ts";
import { profileAgainst } from "../../../../skills/framework/profile/across.ts";
import { readProfile, type ProfileReading } from "../../../../skills/framework/profile/reading.ts";
import { staler, type Read } from "../../../../skills/framework/profile/source.ts";
import type { Guesses } from "../../contract/predictors.ts";
import type { ModelledStrike, Seen } from "../../contract/situation.ts";
import { standIn } from "../by-hand.ts";
import { reactionOf } from "../../situation/percepts.ts";

/**
 * **The strikes a body is modelled by**: each measured, read for its striker (`readProfile`), with
 * the limbs that throw it; the limbs the rest are thrown with, each read by its guess where the
 * Mind has guesses and the two stand so that one is of it (`pressureBy`, `lifeOf`); and each
 * strike with where its reading comes from (`reads`).
 */
export interface Model {
  readonly measured: readonly { readonly limbs: readonly string[]; readonly reading: ProfileReading }[];
  readonly unmeasured: readonly string[];
  readonly reads: readonly Read[];
}

/** Why a strike of `profile` is not read by its profile at `postures`, a sentence: none measured it, or measured it with the bodies standing otherwise (`measuredAt`); null where its profile reads them, stale or not. */
const unreadAt = (profile: Profile | null, postures: Postures): string | null =>
  !profile ? "no fight measured it as it is" : measuredAt(profile, postures) ? null : `measured with no ${postures.own} striker at a ${postures.target} target`;

/**
 * **The model** (`Model`) of `strikes` thrown by a body of `striker` at one of `struck`, read at
 * `postures`: each by its profile against that body (`profileAgainst`) where it was measured at
 * those postures, each other left to the guess of every limb it is thrown with: a strike measured
 * only on a body standing says nothing of one lying (`measuredAt`). A profile measured at other
 * settings than the Mind reads at now is still read, and its source says what has changed
 * (`changes`). A strike left to a guess says so, or that it is not priced where the Mind has no
 * `guesses` (`standIn`).
 */
export function modelOf(seen: Seen, { strikes, striker, struck, postures, guesses }: { readonly strikes: readonly ModelledStrike[]; readonly striker: BodySpec; readonly struck: BodySpec; readonly postures: Postures; readonly guesses: Guesses | null }): Model {
  const at = { hz: seen.hz, reaction: reactionOf(seen), rate: seen.rate, delay: seen.delay };
  const measured: Model["measured"][number][] = [], unmeasured = new Set<string>(), reads: Read[] = [];
  for (const strike of strikes) {
    const profile = profileAgainst(strike.profiles, struck), why = unreadAt(profile, postures);
    if (why === null) {
      const reading = readProfile(profile!, striker, postures);
      measured.push({ limbs: strike.limbs, reading });
      reads.push({ what: strike.name, source: staler(reading.source(struck), changes(profile!, at)) });
    } else {
      reads.push({ what: strike.name, source: standIn(guesses, "limb", why) });
      for (const limb of strike.limbs) unmeasured.add(limb);
    }
  }
  return { measured, unmeasured: [...unmeasured], reads };
}

/** **The strikes `profiles` measure**, each skill's profiles with one limb one strike (`ModelledStrike`), named by its skill and its limb and thrown with that limb. */
export function strikesOf(profiles: readonly Profile[]): readonly ModelledStrike[] {
  const bySkill = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const { skill, limb } = profile.measured, name = limb === undefined ? skill : `${skill} ${limb}`, of = bySkill.get(name);
    if (of) of.push(profile); else bySkill.set(name, [profile]);
  }
  return [...bySkill].map(([name, of]) => ({ name, limbs: of[0]!.measured.limb === undefined ? [] : [of[0]!.measured.limb], profiles: of }));
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
export function pooled(model: Model, striker: BodySpec, postures: Postures): Model {
  if (model.measured.length < 2) return model;
  const profiles = model.measured.map((one) => one.reading.profile), first = profiles[0]!;
  let at = POOLS;
  for (const profile of profiles) { let next = at.next.get(profile); if (!next) at.next.set(profile, next = { next: new WeakMap() }); at = next; }
  const { limb: _, ...measured } = first.measured;
  at.pool ??= deepFreeze({ measured: { ...measured, skill: profiles.map((profile) => `${profile.measured.skill} ${profile.measured.limb ?? ""}`.trim()).join(" + ") },
    trials: profiles.flatMap((profile) => profile.trials) });
  return { ...model, measured: [{ limbs: [...new Set(model.measured.flatMap((one) => one.limbs))], reading: readProfile(at.pool, striker, postures) }] };
}
