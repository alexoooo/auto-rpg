import { PROFILE_MODEL } from "./profile-contract.ts";
import { profileModel } from "./profile-model.ts";
import { dataOf } from "../../core/data/store.ts";
import type { PredictionsPart } from "./contract/parts.ts";
import { anyBody } from "../../parts/parts.ts";
import { validProfiles, type Profile } from "../../skills/framework/profile/profile.ts";
import { deepFreeze } from "../../core/state.ts";
import { validPressures } from "./pressure.ts";
import { measuredOthers, RATE_OTHERS } from "./percepts.ts";
import { nearestTrials, ownSteps, writtenForms, type OutcomeModel, type Tables } from "../../skills/framework/outcomes.ts";
import { optionalChoice } from "../../parts/fields.ts";
import { WALK_STARTS, type WalkStart } from "./walk.ts";

/**
 * An experiment may supply the ground profiles measured for the skill settings it runs. Its foe's
 * pressure is what bouts measured a foe's fighting took (`measured`, the default, `PressureTable`),
 * its strikes' rate where they measured none near; or that rate alone (`rate`). Its Options ask
 * what an act brings of a form fitted to its trials (`written`, the default, `writtenForms`), of
 * its trials nearest the start (`nearest`, `nearestTrials`). Its foe stands where it is as an
 * Option runs. Its walks are priced as starting at the body's speed, or as another walk start
 * says (`WALK_STARTS`). A sway leaves the body where its trials ended (`range`, the
 * default) or by its own steps (`own`, `SWAYS`).
 */
interface MeasuredConfig { readonly kind: "measured"; readonly edges?: readonly Profile[]; readonly pressure?: "rate" | "measured"; readonly outcomes?: "nearest" | "written"; readonly walkStart?: Exclude<WalkStart, "speed">; readonly sways?: "own" }

/** The walk starts a config names (`MeasuredConfig.walkStart`), each with its label: all but the body's speed, the default. */
const STARTED = Object.entries(WALK_STARTS).filter(([start]) => start !== "speed").map(([start, rule]) => [start as Exclude<WalkStart, "speed">, rule.label] as const);

/** **Where a sway leaves the body** (`MeasuredConfig.sways`): what each makes of an outcome model. */
const SWAYS: Readonly<Record<"range" | NonNullable<MeasuredConfig["sways"]>, (model: OutcomeModel) => OutcomeModel>> = {
  range: (model) => model, own: ownSteps,
};

/** **Measured**: supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own where fresh, else its prior. */
export const MEASURED_PREDICTIONS = deepFreeze<PredictionsPart<MeasuredConfig>>({
  role: "predictions", model: PROFILE_MODEL, label: "Measured", slots: [], defaults: { kind: "measured" }, keys: { kind: true, edges: true, pressure: true, outcomes: true, walkStart: true, sways: true }, tuning: ["edges"],
  fields: [optionalChoice<MeasuredConfig, "walkStart">("walkStart", "A walk starts at", WALK_STARTS.speed.label, () => STARTED),
    optionalChoice<MeasuredConfig, "sways">("sways", "A sway leaves the body", "Where its trials ended", () => [["own", "By its own steps"]])],
  fits: anyBody, faults: config => [...config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
    ...config.pressure === undefined || config.pressure === "rate" || config.pressure === "measured" ? [] : ["pressure: rate or measured"],
    ...config.outcomes === undefined || Object.hasOwn(OUTCOMES, config.outcomes) ? [] : ["outcomes: nearest or written"],
    ...config.walkStart === undefined || STARTED.some(([start]) => start === config.walkStart) ? [] : [`walkStart: ${STARTED.map(([start]) => start).join(", ")} or none`],
    ...config.sways === undefined || config.sways === "own" ? [] : ["sways: own or none"]],
  reads: config => [...config.edges === undefined ? ["strike-profiles", "edge-profiles", "step-profiles"] as const : ["strike-profiles", "step-profiles"] as const, ...config.pressure !== "rate" ? ["pressure-profiles"] as const : []],
  make: config => {
    const tables = deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles"), steps: dataOf("step-profiles") });
    return profileModel({ strikes: tables.strikes, outcomes: SWAYS[config.sways ?? "range"](OUTCOMES[config.outcomes ?? "written"](tables)),
      others: config.pressure === "rate" ? RATE_OTHERS : measuredOthers(measuredPressures()), walkStart: config.walkStart ?? "speed" });
  },
});

/** The outcome model a config names (`MeasuredConfig.outcomes`), of its tables. */
const OUTCOMES: Readonly<Record<NonNullable<MeasuredConfig["outcomes"]>, (tables: Tables) => OutcomeModel>> = {
  nearest: nearestTrials, written: writtenForms,
};

/** The measured pressures (`dataOf("pressure-profiles")`), an error where they are not. */
function measuredPressures() {
  const tables: unknown = dataOf("pressure-profiles");
  if (!validPressures(tables)) throw new Error("pressure-profiles: invalid pressure tables");
  return tables;
}

/** **The prior alone**: no profile, each model its prior, set by hand; its walks priced as starting at the body's speed. */
export const PRIOR_PREDICTIONS = deepFreeze<PredictionsPart<{ readonly kind: "prior" }>>({
  role: "predictions", model: PROFILE_MODEL, label: "The prior alone", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => profileModel({ strikes: [], outcomes: nearestTrials({ strikes: [], edges: [] }), others: RATE_OTHERS, walkStart: "speed" }),
});

declare module "./contract/parts.ts" {
  interface PredictionsConfigs {
    readonly measured: MeasuredConfig;
    readonly prior: { readonly kind: "prior" };
  }
}
