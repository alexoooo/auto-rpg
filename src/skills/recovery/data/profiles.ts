import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { measuredOn, techniqueSkill } from "../../framework/profile/lookup.ts";
import { type Expected } from "../../framework/profile/reading.ts";
import { notPriced, staler, type Source } from "../../framework/profile/source.ts";
import { type Postures, type Profile } from "../../framework/profile/profile.ts";
import type { OutcomeModel } from "../../framework/outcomes.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "edge-profiles": readonly Profile[] } }

/** The postures a ground technique's trial began at (`Start.postures`): its body lying in position `from`, with no foe. */
export const groundStart = (from: string): Postures => ({ own: from, target: "none" });

/** No drill measured a ground technique. */
const NO_DRILL = notPriced("no drill measured it");

/**
 * **What the ground technique `technique` is expected to bring a body of `spec` at `hz`, its command
 * `delay` steps late**, by where it is begun: what `outcomes` answers of it begun there with no foe
 * (`groundStart`, `expected`), null from a position it answers nothing at; and where what it
 * answers comes from (`source`): its measured profile with what has changed since
 * (`ActOutcomes.stale`), or nothing where no drill measured it.
 */
export function edgeExpected(technique: PartConfig, { spec, hz, delay, outcomes }: {
  readonly spec: BodySpec; readonly hz: number; readonly delay: number; readonly outcomes: OutcomeModel;
}): { readonly expected: ((from: string) => Expected | null) | null; readonly source: Source } {
  const act = outcomes.act("edges", measuredOn(spec, { skill: techniqueSkill(spec, technique), limb: null }, { hz, reaction: null, rate: hz, delay }));
  const read = act?.reading(null, spec);
  if (!act || !read) return { expected: null, source: NO_DRILL };
  return { expected: (from) => act.reading(null, spec, groundStart(from))?.expect({ range: 0, phase: "clear" }, null) ?? null, source: staler(read.source(null), act.stale) };
}
