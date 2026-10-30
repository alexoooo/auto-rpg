import { FEW_TERMS_PART } from "./position.ts";

/**
 * **Every position value, by its kind** (`PositionPart`), in the order a picker offers them: a line here
 * registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const POSITIONS = { "few-terms": FEW_TERMS_PART };
