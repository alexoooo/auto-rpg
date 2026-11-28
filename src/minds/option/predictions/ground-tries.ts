import type { MeasuredTries } from "../contract/predictors.ts";
import type { Origin } from "../../../skills/framework/profile/profile.ts";
import { fittedSource } from "./value/fitted-value.ts";

/** What a try of a ground Option begun lying in a posture did: how many tries, their seconds at the mean, and the share that ended in each posture (`[posture, share]`), the likeliest first. */
export interface TriedFrom {
  readonly tries: number;
  readonly seconds: number;
  readonly ends: readonly (readonly [string, number])[];
}

/**
 * **What the record's tries on the ground did** (`assets/minds/ground-tries.json`, fitted by the
 * measuring command, `research/minds/ground-fit.mjs`): for each way up and regain, by its Option's
 * name, and each posture its tries were begun lying in, what those tries did (`TriedFrom`), of
 * the tries the Minds that played its bouts took; and the bodies those bouts played.
 */
export interface GroundTries {
  readonly origin: string;
  readonly from: Origin;
  readonly bodies: readonly string[];
  readonly ways: Readonly<Record<string, Readonly<Record<string, TriedFrom>>>>;
}

/** Whether `value` is ground tries: each posture's tries with their seconds and the share ending in each posture. */
export const validGroundTries = (value: unknown): value is GroundTries => {
  const v = value as GroundTries | null;
  return !!v && typeof v === "object" && Array.isArray(v.bodies) && v.bodies.every((body) => typeof body === "string") && !!v.ways && typeof v.ways === "object"
    && Object.values(v.ways).every((froms) => !!froms && typeof froms === "object" && Object.values(froms).every((tried) => tried.tries > 0 && tried.seconds >= 0
      && Array.isArray(tried.ends) && tried.ends.every((end) => Array.isArray(end) && typeof end[0] === "string" && end[1] >= 0)));
};

/**
 * **Ground tries as a ground Option asks them** (`MeasuredTries`), for the body `body`
 * (`bodyOf`), none for a body they were not fitted on: read where its focus is a body they were
 * fitted on too (`fittedOn`) and its Option was measured begun where the body lies; done in the
 * share that ended where it goes, the rest ending where they did.
 */
export function groundTries(value: GroundTries, body: string): MeasuredTries | null {
  if (!value.bodies.includes(body)) return null;
  const sourceOf = fittedSource(value.bodies, body);
  return {
    of(at, name, from, to) {
      const tried = value.ways[name]?.[from], source = tried ? sourceOf(at.focus) : null;
      if (!tried || !source) return null;
      let done = 0;
      const ends: { at: string; share: number }[] = [];
      for (const [end, share] of tried.ends) if (end === to) done += share; else ends.push({ at: end, share });
      return { seconds: tried.seconds, done, ends, source };
    },
    source: (at, name) => value.ways[name] ? sourceOf(at.focus) : null,
  };
}
