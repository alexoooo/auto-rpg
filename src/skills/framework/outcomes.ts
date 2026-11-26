/**
 * **The outcome model**: from here, doing this, what an act brings: what it deals and takes, how
 * long it runs, where it leaves the body and whether it falls (`ProfileReading`). An Option asks
 * it and reads no table of its own; which kind answers is its mind's (its predictions part). The
 * kinds are its trials nearest the start (`nearestTrials`) and a form fitted to its trials
 * (`writtenForms`). One that has no act answers none, and the Option prices it by hand.
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { formReading } from "./form.ts";
import { profileAgainst } from "./profile/across.ts";
import { profilesFor } from "./profile/lookup.ts";
import { readProfile, type ProfileReading } from "./profile/reading.ts";
import { type Measured, type Postures, type Profile } from "./profile/profile.ts";
import type { Change } from "./profile/source.ts";

/** The acts an outcome model answers for: strikes, a body's ways up off the ground (`edges`) and its steps. */
type ActTable ="strikes" | "edges" | "steps";

/** What an outcome model has of one act, as one body's mind asks it (`OutcomeModel.act`). */
export interface ActOutcomes {
  /** What has changed since what it answers from was measured (`changes`); none where it is fresh. */
  readonly stale: readonly Change[];
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

/** An outcome model's profiles, by the table of acts they are of. */
export type Tables = Readonly<Partial<Record<ActTable, readonly Profile[]>>>;

/**
 * **An act's profile among `tables`' read by `readAs`**: as it was measured where one is fresh,
 * else stale (`profilesFor`), against the struck body's where one was (`profileAgainst`).
 */
function profilesReadBy(tables: Tables, readAs: typeof readProfile): OutcomeModel {
  return {
    act(table, asked) {
      const found = profilesFor(tables[table] ?? [], asked);
      if (!found) return null;
      const read = found.read;
      return {
        stale: found.stale, read,
        reading(struck, spec, postures) {
          const profile = profileAgainst(read, struck);
          return profile ? readAs(profile, spec, postures) : null;
        },
      };
    },
  };
}

/** **The nearest trials**: an act's profile (`profilesReadBy`) read by its trials nearest the start asked at (`readProfile`). */
export const nearestTrials = (tables: Tables): OutcomeModel => profilesReadBy(tables, readProfile);

/** **The written forms**: an act's profile (`profilesReadBy`) read by a form fitted to its trials (`formReading`). */
export const writtenForms = (tables: Tables): OutcomeModel => profilesReadBy(tables, formReading);

/**
 * **`model` with a sway left by its own steps**: where a reading expects its own steps' share of
 * the move (`Exit.own`, a sway's), it leaves the two that much further apart, all of its trials
 * (`stays` 0), not by how far apart its trials ended (`moved`), which holds its trials' foe's
 * moves too: what a body's own act does, beside a foe that stands. Every other reading as `model`'s.
 */
export function ownSteps(model: OutcomeModel): OutcomeModel {
  return {
    act(table, asked) {
      const act = model.act(table, asked);
      return act && {
        stale: act.stale, read: act.read,
        reading(struck, spec, postures) {
          const reading = act.reading(struck, spec, postures);
          return reading && Object.create(reading, { expect: { value: (at: Parameters<ProfileReading["expect"]>[0], body: BodySpec | null) => {
            const expected = reading.expect(at, body), own = expected?.exit?.own;
            return own === undefined ? expected : { ...expected!, exit: { ...expected!.exit, stays: 0, moved: own } };
          } } }) as ProfileReading;
        },
      };
    },
  };
}
