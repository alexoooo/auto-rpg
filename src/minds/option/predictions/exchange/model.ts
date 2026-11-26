import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../../core/state.ts";
import { limbHoldsAsMeasured, sameReaction } from "../../../../skills/framework/profile/lookup.ts";
import { STANDING, measuredAt, type Postures, type Profile } from "../../../../skills/framework/profile/profile.ts";
import { profileAgainst } from "../../../../skills/framework/profile/across.ts";
import { readProfile, type ProfileReading } from "../../../../skills/framework/profile/reading.ts";
import type { Guesses } from "../../contract/predictors.ts";
import type { ModelledStrike, Seen } from "../../contract/situation.ts";
import { pricedBy } from "../by-hand.ts";
import { reactionOf } from "../../situation/percepts.ts";

/**
 * **The strikes a body is modelled by**: each measured, read for its striker (`readProfile`), with
 * the limbs that throw it; the limbs the rest are thrown with, each read by its guess where the
 * Mind has guesses and the two stand so that one is of it (`pressureBy`, `lifeOf`); and how they
 * are priced, a sentence.
 */
export interface Model {
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
export function modelOf(seen: Seen, { strikes, striker, struck, postures, guesses }: { readonly strikes: readonly ModelledStrike[]; readonly striker: BodySpec; readonly struck: BodySpec; readonly postures: Postures; readonly guesses: Guesses | null }): Model {
  const reaction = reactionOf(seen), measured: Model["measured"][number][] = [], unmeasured = new Set<string>(), said: string[] = [];
  for (const strike of strikes) {
    const profile = profileAgainst(strike.profiles, struck), why = unreadAt(profile, postures), stale = staleAt(profile, reaction, seen.hz);
    if (why === null) { measured.push({ limbs: strike.limbs, reading: readProfile(profile!, striker, postures) }); if (stale !== null) said.push(`${strike.name} stale, ${stale}`); }
    else { said.push(`${strike.name} ${pricedBy(guesses)}, ${why}`); for (const limb of strike.limbs) unmeasured.add(limb); }
  }
  return { measured, unmeasured: [...unmeasured], priced: said.length ? said.join("; ") : strikes.length ? "measured" : "no strike to model" };
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
