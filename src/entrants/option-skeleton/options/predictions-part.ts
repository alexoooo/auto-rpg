import { dataOf } from "../../../core/data/store.ts";
import type { PredictionsPart } from "../../../core/option/parts.ts";
import { anyBody } from "../../../core/parts/parts.ts";
import type { Profile } from "../../../core/mind/profile.ts";
import { deepFreeze } from "../../../core/state.ts";

/** **What Option Mind predicts from**: the profiles its drills measured, of strikes (any striker's), gaits and the rise's edges; a model with none of its own reads its prior. */
export interface ProfileTables {
  readonly strikes: readonly Profile[];
  readonly gaits: readonly Profile[];
  readonly edges: readonly Profile[];
}

/** **Measured**: the drills' profiles (`dataOf`), each model its own where one is fresh, else its prior. */
export const MEASURED_PREDICTIONS: PredictionsPart<{ readonly kind: "option-skeleton:measured" }, ProfileTables> = deepFreeze({
  role: "predictions", label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "option-skeleton:measured" }, keys: { kind: true },
  fits: anyBody, faults: () => [], reads: () => ["strike-profiles", "gait-profiles", "edge-profiles"],
  make: () => ({ strikes: dataOf("strike-profiles"), gaits: dataOf("gait-profiles"), edges: dataOf("edge-profiles") }),
});

/** **The prior alone**: no profile, each model its prior, the owner's decision by hand. */
export const PRIOR_PREDICTIONS: PredictionsPart<{ readonly kind: "option-skeleton:prior" }, ProfileTables> = deepFreeze({
  role: "predictions", label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "option-skeleton:prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => ({ strikes: [], gaits: [], edges: [] }),
});
