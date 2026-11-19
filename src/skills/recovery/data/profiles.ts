import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { measuredOn, techniqueSkill } from "../../framework/profile/lookup.ts";
import { type Expected } from "../../framework/profile/reading.ts";
import { type Postures, type Profile } from "../../framework/profile/profile.ts";
import type { OutcomeModel } from "../../framework/outcomes.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "edge-profiles": readonly Profile[] } }

/** The postures a ground technique's trial began at (`Start.postures`): its body lying in position `from`, with no foe. */
export const groundStart = (from: string): Postures => ({ own: from, target: "none" });

/**
 * **What the ground technique `technique` is expected to bring a body of `spec` at `hz`, its command
 * `delay` steps late**, by where it is begun: what `outcomes` answers of it begun there with no foe
 * (`groundStart`, `expected`), null from a position it answers nothing at; and how it is priced, a
 * sentence (`priced`): measured, or not, and why (no drill measured it, or what it answers from is
 * stale, `ActOutcomes.stale`).
 */
export function edgeExpected(spec: BodySpec, technique: PartConfig, hz: number, delay: number, outcomes: OutcomeModel): {
  readonly expected: ((from: string) => Expected | null) | null; readonly priced: string } {
  const act = outcomes.act("edges", measuredOn(spec, { skill: techniqueSkill(spec, technique), limb: null }, { hz, reaction: null, rate: hz, delay }));
  if (!act) return { expected: null, priced: "no drill measured it" };
  if (!act.read.length) return { expected: null, priced: act.stale ?? "no drill measured it" };
  return { expected: (from) => act.reading(null, spec, groundStart(from))?.expect({ range: 0, phase: "clear" }, null) ?? null, priced: act.stale === null ? "measured" : `measured, stale, ${act.stale}` };
}
