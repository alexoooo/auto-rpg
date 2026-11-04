import { dataOf } from "../data/store.ts";
import type { PredictionsPart } from "./parts.ts";
import { anyBody } from "../parts/parts.ts";
import type { Profile } from "../skills/framework/profile.ts";
import { deepFreeze } from "../state.ts";

/** **What Option Mind predicts from**: the measured profiles of strikes (any striker's, by their drills) and of its ground Options (by its own tries in falls); a model with none of its own reads its prior. */
export interface ProfileTables {
  readonly strikes: readonly Profile[];
  readonly edges: readonly Profile[];
}

/** **Measured**: the drills' profiles (`dataOf`), each model its own where one is fresh, else its prior. */
export const MEASURED_PREDICTIONS: PredictionsPart<{ readonly kind: "measured" }, ProfileTables> = deepFreeze({
  role: "predictions", label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "measured" }, keys: { kind: true },
  fits: anyBody, faults: () => [], reads: () => ["strike-profiles", "edge-profiles"],
  make: () => ({ strikes: dataOf("strike-profiles"), edges: dataOf("edge-profiles") }),
});

/** **The prior alone**: no profile, each model its prior, set by hand. */
export const PRIOR_PREDICTIONS: PredictionsPart<{ readonly kind: "prior" }, ProfileTables> = deepFreeze({
  role: "predictions", label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => ({ strikes: [], edges: [] }),
});
