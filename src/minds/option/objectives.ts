import { FEW_TERMS_PART, REACH_PLACE_PART } from "./objective.ts";

/**
 * **Every objective, by its kind** (`ObjectivePart`), in the order a picker offers them: a line here
 * registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const OBJECTIVES = { "few-terms": FEW_TERMS_PART, "reach-place": REACH_PLACE_PART };
