import measured from "../../../../assets/core/edge-profiles.json" with { type: "json" };
import { deepFreeze } from "../../state.ts";

/**
 * **What an edge's drill found of it on a body** (`docs/reference/rising.md#routes-priced`): the
 * share of trials it took the body to its posture, the mean seconds a trial ran, done or not, and
 * the positions those not done came to rest in, each with its share of the trials.
 */
export interface EdgeProfile {
  readonly done: number;
  readonly seconds: number;
  readonly fails: readonly { readonly at: string; readonly share: number }[];
}

type Measured = Readonly<Record<string, Readonly<Record<string, { begun: number; done: number; seconds: number; fails: Readonly<Record<string, number>> }>>>>;

/**
 * Each body's profiles, by model and technique, from the Rise drill's records
 * (`assets/core/edge-profiles.json`, `research/edge-profiles.mjs`).
 */
const PROFILES: Readonly<Record<string, Readonly<Record<string, EdgeProfile>>>> = deepFreeze(Object.fromEntries(
  Object.entries(measured.profiles as Measured).map(([model, mine]) => [model, Object.fromEntries(Object.entries(mine).map(([technique, p]) =>
    [technique, { done: p.done / p.begun, seconds: p.seconds, fails: Object.entries(p.fails).map(([at, count]) => ({ at, share: count / p.begun })) }]))])));

/** Technique `technique`'s profile on body `model`; null where its drill has none. */
export function edgeProfile(model: string, technique: string): EdgeProfile | null {
  return PROFILES[model]?.[technique] ?? null;
}
