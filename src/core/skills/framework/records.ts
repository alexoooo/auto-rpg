import { bodyKey, type BodySpec } from "../../spec/body.ts";

/**
 * **A skill's record for one body**: the settings it was tuned to on that body, whole, and how
 * they were made (`made`: the run that wrote them). A skill whose settings are its body's reads
 * every body's records as mind data (`dataOf`, by `bodyKey`), and knows the bodies with one before
 * they load (its `.meta.json`): a body with none does not use the skill and says so
 * (`recordFault`), and an experiment's research `tuning` sets settings over its body's, all of
 * them where it has none. A mind carries none of a skill's settings; a new body is rows, written by
 * the run that tuned the skill on it (`research/skill-records.mjs`).
 */
export interface SkillRecord<S> {
  readonly made: string;
  readonly settings: S;
}

/** Every body's record of one skill, by `bodyKey`. */
export type SkillRecords<S> = Readonly<Record<string, SkillRecord<S>>>;

/** A config of a skill tuned per body: an experiment's research `tuning` over its body's settings. */
export interface Tuned<S> {
  readonly tuning?: Partial<S>;
}

/**
 * A part's `fits` for a skill tuned per body (`SkillRecord`): why a body of `spec` has no `skill`
 * under `config`, or null: no record of its own among `bodies` and no whole research tuning in its
 * place (`whole`).
 */
export function recordFault<T>(skill: string, bodies: readonly string[], whole: (tuning: T) => boolean): (spec: BodySpec, config: { readonly tuning?: T }) => string | null {
  return (spec, config) => bodies.includes(bodyKey(spec)) || config.tuning !== undefined && whole(config.tuning) ? null : `the ${skill} is not tuned for ${bodyKey(spec)}`;
}

/** The settings a skill throws on a body of `spec`: its record's among `records`, with `config`'s research tuning over them. */
export const tunedSettings = <S>(records: SkillRecords<S>, spec: BodySpec, config: Tuned<S>): S =>
  ({ ...records[bodyKey(spec)]?.settings, ...config.tuning }) as S;
