import { dataOf } from "../../core/data/store.ts";
import type { PredictionsPart } from "./parts.ts";
import { anyBody } from "../../parts/parts.ts";
import { validProfiles, type Profile } from "../../skills/framework/profile.ts";
import { deepFreeze } from "../../core/world/state.ts";

/** **What Option Mind predicts from**: the measured profiles of strikes (any striker's, by their drills) and of its ground Options (by its own tries in falls); a model with none of its own reads its prior. */
export interface ProfileTables {
  readonly strikes: readonly Profile[];
  readonly edges: readonly Profile[];
}

/** An experiment may supply the ground profiles measured for the skill settings it runs. */
interface MeasuredConfig { readonly kind: "measured"; readonly edges?: readonly Profile[] }

/** **Measured**: supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own where fresh, else its prior. */
export const MEASURED_PREDICTIONS: PredictionsPart<MeasuredConfig, ProfileTables> = deepFreeze({
  role: "predictions", label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "measured" }, keys: { kind: true, edges: true }, tuning: ["edges"],
  fits: anyBody, faults: config => config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
  reads: config => config.edges === undefined ? ["strike-profiles", "edge-profiles"] : ["strike-profiles"],
  make: config => deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles") }),
});

/** **The prior alone**: no profile, each model its prior, set by hand. */
export const PRIOR_PREDICTIONS: PredictionsPart<{ readonly kind: "prior" }, ProfileTables> = deepFreeze({
  role: "predictions", label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => ({ strikes: [], edges: [] }),
});
