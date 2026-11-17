/**
 * **The outcome model**: from here, doing this, what an act brings: what it deals and takes, how
 * long it runs, where it leaves the body and whether it falls (`ProfileReading`). An Option asks
 * it and reads no table of its own; which kind answers is its mind's (its predictions part). The
 * kind of today is its trials nearest the start (`nearestTrials`); one that has no act answers
 * none, and the Option prices it by hand.
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { profileAgainst, profilesFor, readProfile, type Measured, type Postures, type Profile, type ProfileReading } from "./profile.ts";

/** The acts an outcome model answers for: strikes, a body's ways up off the ground (`edges`) and its steps. */
export type ActTable = "strikes" | "edges" | "steps";

/** What an outcome model has of one act, as one body's mind asks it (`OutcomeModel.act`). */
export interface ActOutcomes {
  /** Null where what it answers from is fresh, else why it is stale (`staleness`). */
  readonly stale: string | null;
  /** The profiles it answers from: what a foe of the same make is modelled by (`StrikeModel.profiles`). */
  readonly read: readonly Profile[];
  /**
   * What it answers against a body of `struck` (the first it has where null) for a body of `spec`
   * standing as `postures`; null where it has nothing against it.
   */
  reading(struck: BodySpec | null, spec: BodySpec, postures?: Postures): ProfileReading | null;
}

/** **An outcome model**: what it has of an act measured as `asked` is (`Measured`); null where it has none. */
export interface OutcomeModel {
  act(table: ActTable, asked: Measured): ActOutcomes | null;
}

/**
 * **The nearest trials**: an act's profile among `tables`' as it was measured where one is fresh,
 * else stale (`profilesFor`), against the struck body's where one was (`profileAgainst`), read by
 * its trials nearest the start asked at (`readProfile`).
 */
export function nearestTrials(tables: Readonly<Partial<Record<ActTable, readonly Profile[]>>>): OutcomeModel {
  return {
    act(table, asked) {
      const found = profilesFor(tables[table] ?? [], asked);
      if (!found) return null;
      const read = found.read;
      return {
        stale: found.stale, read,
        reading(struck, spec, postures) {
          const profile = profileAgainst(read, struck);
          return profile ? readProfile(profile, spec, postures) : null;
        },
      };
    },
  };
}
