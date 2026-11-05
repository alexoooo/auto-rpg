import { dataOf } from "../../../core/data/store.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { measuredOn, profileFor, readProfile, techniqueDigest, type Expected, type Postures, type Profile } from "../../framework/profile.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "edge-profiles": readonly Profile[] } }

/** The postures a ground technique's trial began at (`Start.postures`): its body lying in position `from`, with no foe. */
export const groundStart = (from: string): Postures => ({ own: from, target: "none" });

/**
 * **What the ground technique `technique` is expected to bring a body of `spec` at `hz`, its command
 * `delay` steps late**, by where it is begun: its profile among `profiles` (`dataOf("edge-profiles")`
 * unless given) read through `readProfile` at its trials begun there (`groundStart`, `expected`),
 * null from a position none began at; and how it is priced, a sentence (`priced`): measured, or not,
 * and why (no drill measured it, or its profile is stale, `staleness`).
 */
export function edgeExpected(parts: PartLookup, spec: BodySpec, technique: PartConfig, hz: number, delay: number, profiles: readonly Profile[] = dataOf("edge-profiles")): {
  readonly expected: ((from: string) => Expected | null) | null; readonly priced: string } {
  const found = profileFor(profiles, measuredOn(spec, techniqueDigest(parts, spec, technique), hz, null, hz, delay));
  if (!found) return { expected: null, priced: "no drill measured it" };
  if (found.stale !== null) return { expected: null, priced: found.stale };
  const profile = found.profile;
  return { expected: (from) => readProfile(profile, spec, groundStart(from)).expect({ range: 0, phase: "clear" }, null), priced: "measured" };
}
