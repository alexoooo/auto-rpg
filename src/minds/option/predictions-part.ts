import { PROFILE_MODEL } from "./profile-contract.ts";
import { profileModel } from "./profile-model.ts";
import { dataOf } from "../../core/data/store.ts";
import type { PredictionsPart } from "./parts.ts";
import { anyBody } from "../../parts/parts.ts";
import { validProfiles, type Profile } from "../../skills/framework/profile.ts";
import { deepFreeze } from "../../core/state.ts";

/** An experiment may supply the ground profiles measured for the skill settings it runs. */
interface MeasuredConfig { readonly kind: "measured"; readonly edges?: readonly Profile[] }

/** **Measured**: supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own where fresh, else its prior. */
export const MEASURED_PREDICTIONS: PredictionsPart<MeasuredConfig> = deepFreeze({
  role: "predictions", model: PROFILE_MODEL, label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "measured" }, keys: { kind: true, edges: true }, tuning: ["edges"],
  fits: anyBody, faults: config => config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
  reads: config => config.edges === undefined ? ["strike-profiles", "edge-profiles"] : ["strike-profiles"],
  make: config => profileModel(deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles") })),
});

/** **The prior alone**: no profile, each model its prior, set by hand. */
export const PRIOR_PREDICTIONS: PredictionsPart<{ readonly kind: "prior" }> = deepFreeze({
  role: "predictions", model: PROFILE_MODEL, label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => profileModel({ strikes: [], edges: [] }),
});

declare module "./parts.ts" {
  interface PredictionsConfigs {
    readonly measured: MeasuredConfig;
    readonly prior: { readonly kind: "prior" };
  }
}
