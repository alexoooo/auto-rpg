import { MEASURED_PREDICTIONS, PRIOR_PREDICTIONS } from "./predictions-part.ts";

/**
 * **Every kind of predictions, by its kind** (`PredictionsPart`), in the order a picker offers them: a line here
 * registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const PREDICTIONS = { measured: MEASURED_PREDICTIONS, prior: PRIOR_PREDICTIONS };
