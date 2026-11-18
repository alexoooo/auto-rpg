import { PROFILE_MODEL } from "./profile-contract.ts";
import { profileModel } from "./profile-model.ts";
import { dataOf } from "../../core/data/store.ts";
import type { PredictionsPart } from "./parts.ts";
import { anyBody } from "../../parts/parts.ts";
import { validProfiles, type Profile } from "../../skills/framework/profile.ts";
import { deepFreeze } from "../../core/state.ts";
import { validPressures } from "./pressure.ts";
import { measuredOthers, measuredSteps, persisting, RATE_OTHERS, validFoeSteps, type FoeSteps } from "./percepts.ts";
import { coarseTable, nearestTrials, writtenForms, type OutcomeModel, type Tables } from "../../skills/framework/outcomes.ts";

/**
 * An experiment may supply the ground profiles measured for the skill settings it runs. Its foe's
 * pressure is its strikes' rate (`rate`, the default), or what bouts measured a foe's fighting
 * took (`measured`, `PressureTable`), the rate where they measured none near. Its Options ask what
 * an act brings of its trials nearest the start (`nearest`, the default, `nearestTrials`) or of a
 * coarse table of their answers (`coarse`, `coarseTable`), or of a form fitted to them (`written`, `writtenForms`). Its foe stands where it is as an
 * Option runs, or, given `foeSteps` in seconds, goes on as it goes now, its velocity fading over
 * about that long (`persisting`), or, given a table of them, as bouts measured (`measuredSteps`).
 */
interface MeasuredConfig { readonly kind: "measured"; readonly edges?: readonly Profile[]; readonly pressure?: "rate" | "measured"; readonly outcomes?: "nearest" | "coarse" | "written"; readonly foeSteps?: number | FoeSteps }

/** **Measured**: supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own where fresh, else its prior. */
export const MEASURED_PREDICTIONS = deepFreeze<PredictionsPart<MeasuredConfig>>({
  role: "predictions", model: PROFILE_MODEL, label: "Measured", stage: "game", fields: [], slots: [], defaults: { kind: "measured" }, keys: { kind: true, edges: true, pressure: true, outcomes: true, foeSteps: true }, tuning: ["edges"],
  fits: anyBody, faults: config => [...config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
    ...config.pressure === undefined || config.pressure === "rate" || config.pressure === "measured" ? [] : ["pressure: rate or measured"],
    ...config.outcomes === undefined || Object.hasOwn(OUTCOMES, config.outcomes) ? [] : ["outcomes: nearest, coarse or written"],
    ...config.foeSteps === undefined || (typeof config.foeSteps === "number" ? Number.isFinite(config.foeSteps) && config.foeSteps > 0 : validFoeSteps(config.foeSteps)) ? [] : ["foeSteps: seconds over 0, or a table of the foe's steps"]],
  reads: config => [...config.edges === undefined ? ["strike-profiles", "edge-profiles", "step-profiles"] as const : ["strike-profiles", "step-profiles"] as const, ...config.pressure === "measured" ? ["pressure-profiles"] as const : []],
  make: config => {
    const tables = deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles"), steps: dataOf("step-profiles") });
    const others = config.pressure === "measured" ? measuredOthers(measuredPressures()) : RATE_OTHERS, steps = config.foeSteps;
    return profileModel({ strikes: tables.strikes, outcomes: OUTCOMES[config.outcomes ?? "nearest"](tables),
      others: steps === undefined ? others : typeof steps === "number" ? persisting(others, steps) : measuredSteps(others, steps) });
  },
});

/** The outcome model a config names (`MeasuredConfig.outcomes`), of its tables. */
const OUTCOMES: Readonly<Record<NonNullable<MeasuredConfig["outcomes"]>, (tables: Tables) => OutcomeModel>> = {
  nearest: nearestTrials, coarse: (tables) => coarseTable(nearestTrials(tables)), written: writtenForms,
};

/** The measured pressures (`dataOf("pressure-profiles")`), an error where they are not. */
function measuredPressures() {
  const tables: unknown = dataOf("pressure-profiles");
  if (!validPressures(tables)) throw new Error("pressure-profiles: invalid pressure tables");
  return tables;
}

/** **The prior alone**: no profile, each model its prior, set by hand. */
export const PRIOR_PREDICTIONS = deepFreeze<PredictionsPart<{ readonly kind: "prior" }>>({
  role: "predictions", model: PROFILE_MODEL, label: "The prior alone", stage: "game", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => profileModel({ strikes: [], outcomes: nearestTrials({ strikes: [], edges: [] }), others: RATE_OTHERS }),
});

declare module "./parts.ts" {
  interface PredictionsConfigs {
    readonly measured: MeasuredConfig;
    readonly prior: { readonly kind: "prior" };
  }
}
