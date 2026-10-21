import data from "../../../assets/research/research-rise.json" with { type: "json" };
import unshod from "../../../assets/research/research-rise-unshod-warrior.json" with { type: "json" };
import { deepFreeze } from "../state.ts";
import type { ReferenceParameters, RiseReference } from "../mind/rise/reference-types.ts";

/** One body's recorded get-ups and how Research rise plays them (`researchRise`). */
export interface ResearchRiseEntry {
  readonly kind: "library" | "path";
  readonly channels: readonly string[];
  readonly parameters: ReferenceParameters;
  readonly reference: RiseReference;
}

/** **Research rise's data**: its get-ups by `<model>/<club|empty>`, the default, and the unshod Warrior's. */
export interface ResearchRiseData {
  readonly default: ResearchRiseEntry;
  readonly bodies: Readonly<Record<string, ResearchRiseEntry>>;
  /** The default with two more get-ups for the empty-handed Warrior without soles. */
  readonly unshodWarrior: ResearchRiseEntry;
}

const bundle = deepFreeze(JSON.parse(data.payload)) as { default: ResearchRiseEntry; bodies: Record<string, ResearchRiseEntry> };
const additions = deepFreeze(JSON.parse(unshod.payload)).default as ResearchRiseEntry;

/**
 * Research rise's two files, each a JSON `payload` of its own, read, frozen and merged
 * (`dataOf("research-rise")`): a module of its own, imported only when loaded (`loadData`).
 */
export const RESEARCH_RISE: ResearchRiseData = deepFreeze({
  default: bundle.default, bodies: bundle.bodies,
  unshodWarrior: deepFreeze({ ...bundle.default,
    parameters: { ...bundle.default.parameters,
      controllers: [...bundle.default.parameters.controllers!, ...additions.parameters.controllers!] },
    reference: { ...bundle.default.reference,
      references: [...bundle.default.reference.references, ...additions.reference.references] } }),
});
