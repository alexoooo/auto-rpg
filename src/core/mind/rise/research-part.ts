import { deepFreeze } from "../../state.ts";
import { fitsWhen } from "../parts.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { researchRise, researchRiseFits } from "./research.ts";

/** Experimental reference-motion feedback through ordinary muscles. */
interface ResearchRiseConfig { readonly kind: "research-rise" }

/** **Research rise** (`researchRise`): recorded get-ups, which it reads when made (`dataOf("research-rise")`). */
export const RESEARCH_RISE_PART: SubMindPart<ResearchRiseConfig> = deepFreeze({
  role: "sub-mind", label: "Research rise", stage: "experimental", fields: [], slots: [], defaults: { kind: "research-rise" }, keys: { kind: true },
  fits: fitsWhen(researchRiseFits, "needs the Warrior or the Rogue, holding one item at most, in a hand"), faults: () => [],
  reads: () => ["research-rise"],
  make: (own, view, _config, clock) => researchRise(own, view, clock),
});
