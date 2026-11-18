import { PROFILE_MODEL } from "./profile-contract.ts";
import { profileModel } from "./profile-model.ts";
import { dataOf } from "../../core/data/store.ts";
import type { PredictionsPart } from "./parts.ts";
import { anyBody } from "../../parts/parts.ts";
import { validProfiles, type Profile } from "../../skills/framework/profile.ts";
import { deepFreeze } from "../../core/state.ts";
import { validPressures } from "./pressure.ts";

/**
 * An experiment may supply the ground profiles measured for the skill settings it runs. Its foe's
 * pressure is its strikes' rate (`rate`, the default), or what bouts measured a foe's fighting
 * took (`measured`, `PressureTable`), the rate where they measured none near. Its Options ask what
 * an act brings of its trials nearest the start (`nearest`, the default, `nearestTrials`) or of a
 * coarse table of their answers (`coarse`, `coarseTable`).
 */
interface MeasuredConfig { readonly kind: "measured"; readonly edges?: readonly Profile[]; readonly pressure?: "rate" | "measured"; readonly outcomes?: "nearest" | "coarse" }

/** **Measured**: supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own where fresh, else its prior. */
export const MEASURED_PREDICTIONS = deepFreeze<PredictionsPart<MeasuredConfig>>({
  role: "predictions", model: PROFILE_MODEL, label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "measured" }, keys: { kind: true, edges: true, pressure: true, outcomes: true }, tuning: ["edges"],
  fits: anyBody, faults: config => [...config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
    ...config.pressure === undefined || config.pressure === "rate" || config.pressure === "measured" ? [] : ["pressure: rate or measured"],
    ...config.outcomes === undefined || config.outcomes === "nearest" || config.outcomes === "coarse" ? [] : ["outcomes: nearest or coarse"]],
  reads: config => [...config.edges === undefined ? ["strike-profiles", "edge-profiles", "step-profiles"] as const : ["strike-profiles", "step-profiles"] as const, ...config.pressure === "measured" ? ["pressure-profiles"] as const : []],
  make: config => profileModel(deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles"), steps: dataOf("step-profiles"),
    ...config.pressure === "measured" ? { pressures: measuredPressures() } : {} }), config.outcomes ?? "nearest"),
});

/** The measured pressures (`dataOf("pressure-profiles")`), an error where they are not. */
function measuredPressures() {
  const tables: unknown = dataOf("pressure-profiles");
  if (!validPressures(tables)) throw new Error("pressure-profiles: invalid pressure tables");
  return tables;
}

/** **The prior alone**: no profile, each model its prior, set by hand. */
export const PRIOR_PREDICTIONS = deepFreeze<PredictionsPart<{ readonly kind: "prior" }>>({
  role: "predictions", model: PROFILE_MODEL, label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => profileModel({ strikes: [], edges: [] }),
});

declare module "./parts.ts" {
  interface PredictionsConfigs {
    readonly measured: MeasuredConfig;
    readonly prior: { readonly kind: "prior" };
  }
}
