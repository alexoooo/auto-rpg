import { dataOf } from "../../../core/data/store.ts";
import type { PredictionsPart } from "../contract/parts.ts";
import { anyBody } from "../../../parts/parts.ts";
import { validProfiles, type Profile } from "../../../skills/framework/profile/profile.ts";
import { deepFreeze } from "../../../core/state.ts";
import { validPressures } from "./exchange/pressure-table.ts";
import { ProfileExchange } from "./exchange/profile.ts";
import { BY_HAND } from "./by-hand.ts";
import type { Guesses } from "../contract/predictors.ts";
import { atExit, nearestTrials, ownSteps, writtenForms, type OutcomeModel, type Tables } from "../../../skills/framework/outcomes.ts";
import { optionalChoice } from "../../../parts/fields.ts";
import type { WalkStart } from "../contract/context.ts";
import { WALK_STARTS } from "../options/walk.ts";
import { validWalkTimes, walkArrivals, type WalkTimes } from "./walk-times.ts";

/**
 * An experiment may supply the ground profiles measured for the skill settings it runs. Its foe's
 * pressure is what bouts measured a foe's fighting took (`measured`, the default, `PressureTable`),
 * its strikes' rate where they measured none near; or that rate alone (`rate`). Its Options ask
 * what an act brings of a form fitted to its trials (`written`, the default, `writtenForms`), of
 * its trials nearest the start (`nearest`, `nearestTrials`). Its foe stands where it is as an
 * Option runs. Its walks are priced as starting at the body's speed, or as another walk start
 * says (`WALK_STARTS`). A sway leaves the body where its trials ended (`range`, the
 * default) or by its own steps (`own`, `SWAYS`). A strike is priced until its limb is back at
 * its guard (`back`, the default) or until its exit, where its Option ends (`exit`, `STRIKES_TO`).
 * A walk is timed by its gait's reckoning alone (the default) or arrives as the record's walks did
 * (`measured`, `walkArrivals`), where they measured its gait for its body and foe.
 */
interface MeasuredConfig<K extends string> {
  readonly kind: K; readonly edges?: readonly Profile[]; readonly pressure?: "rate" | "measured"; readonly outcomes?: "nearest" | "written";
  readonly walkStart?: Exclude<WalkStart, "speed">; readonly sways?: "own"; readonly strikesTo?: "exit"; readonly walks?: "measured";
}

/** The walk starts a config names (`MeasuredConfig.walkStart`), each with its label: all but the body's speed, the default. */
const STARTED = Object.entries(WALK_STARTS).filter(([start]) => start !== "speed").map(([start, rule]) => [start as Exclude<WalkStart, "speed">, rule.label] as const);

/** **Where a sway leaves the body** (`MeasuredConfig.sways`): what each makes of an outcome model. */
const SWAYS: Readonly<Record<"range" | NonNullable<MeasuredConfig<string>["sways"]>, (model: OutcomeModel) => OutcomeModel>> = {
  range: (model) => model, own: ownSteps,
};

/** **How long a strike is priced as running** (`MeasuredConfig.strikesTo`): what each makes of an outcome model. */
const STRIKES_TO: Readonly<Record<"back" | NonNullable<MeasuredConfig<string>["strikesTo"]>, (model: OutcomeModel) => OutcomeModel>> = {
  back: (model) => model, exit: atExit,
};

/**
 * **A kind of predictions read from what was measured**, named `kind` and labelled `label`:
 * supplied ground profiles where given, otherwise the drills' (`dataOf`); each model its own
 * where fresh. Where nothing measured reads, it answers by `guesses`; given none, it predicts
 * nothing there.
 */
const measuredPredictions = <K extends string>({ kind, label, guesses }: { readonly kind: K; readonly label: string; readonly guesses: Guesses | null }) => deepFreeze<PredictionsPart<MeasuredConfig<K>>>({
  role: "predictions", label, slots: [], defaults: { kind }, keys: { kind: true, edges: true, pressure: true, outcomes: true, walkStart: true, sways: true, strikesTo: true, walks: true }, tuning: ["edges"],
  fields: [optionalChoice<MeasuredConfig<K>, "walkStart">("walkStart", "A walk starts at", WALK_STARTS.speed.label, () => STARTED),
    optionalChoice<MeasuredConfig<K>, "sways">("sways", "A sway leaves the body", "Where its trials ended", () => [["own", "By its own steps"]]),
    optionalChoice<MeasuredConfig<K>, "strikesTo">("strikesTo", "A strike is priced until", "Its limb is back", () => [["exit", "Its exit"]]),
    optionalChoice<MeasuredConfig<K>, "walks">("walks", "A walk is timed by", "Its gait's reckoning", () => [["measured", "What walks measured"]])],
  fits: anyBody, faults: config => [...config.edges === undefined || validProfiles(config.edges) ? [] : ["edges: invalid profiles"],
    ...config.pressure === undefined || config.pressure === "rate" || config.pressure === "measured" ? [] : ["pressure: rate or measured"],
    ...config.outcomes === undefined || Object.hasOwn(OUTCOMES, config.outcomes) ? [] : ["outcomes: nearest or written"],
    ...config.walkStart === undefined || STARTED.some(([start]) => start === config.walkStart) ? [] : [`walkStart: ${STARTED.map(([start]) => start).join(", ")} or none`],
    ...config.sways === undefined || config.sways === "own" ? [] : ["sways: own or none"],
    ...config.strikesTo === undefined || config.strikesTo === "exit" ? [] : ["strikesTo: exit or none"],
    ...config.walks === undefined || config.walks === "measured" ? [] : ["walks: measured or none"]],
  reads: config => [...config.edges === undefined ? ["strike-profiles", "edge-profiles", "step-profiles"] as const : ["strike-profiles", "step-profiles"] as const, ...config.pressure !== "rate" ? ["pressure-profiles"] as const : [], ...config.walks === "measured" ? ["walk-times"] as const : []],
  make: config => {
    const tables = deepFreeze({ strikes: dataOf("strike-profiles"), edges: config.edges ?? dataOf("edge-profiles"), steps: dataOf("step-profiles") });
    const outcomes = STRIKES_TO[config.strikesTo ?? "back"](SWAYS[config.sways ?? "range"](OUTCOMES[config.outcomes ?? "written"](tables))), pressures = config.pressure === "rate" ? null : measuredPressures();
    return { outcomes, exchange: ({ strikes }) => new ProfileExchange({ strikes, measured: tables.strikes, pressures, guesses }), walkStart: config.walkStart ?? "speed", walkArrivals: config.walks === "measured" ? arrivalsOf(measuredWalks()) : null, guesses };
  },
});

/** **Measured, by hand where nothing is**: each model its own where fresh, else its guess, set by hand (`BY_HAND`). */
export const MEASURED_PREDICTIONS = measuredPredictions({ kind: "measured", label: "Measured, by hand where nothing is", guesses: BY_HAND });

/** **Measured, no fallback**: each model its own where fresh; what is not measured is not predicted. */
export const MEASURED_ONLY_PREDICTIONS = measuredPredictions({ kind: "measured-only", label: "Measured, no fallback", guesses: null });

/** The outcome model a config names (`MeasuredConfig.outcomes`), of its tables. */
const OUTCOMES: Readonly<Record<NonNullable<MeasuredConfig<string>["outcomes"]>, (tables: Tables) => OutcomeModel>> = {
  nearest: nearestTrials, written: writtenForms,
};

/** When each body's walks arrive, as `times` measured (`walkArrivals`). */
const arrivalsOf = (times: WalkTimes) => (body: string) => walkArrivals(times, body);

/** The walk times (`dataOf("walk-times")`), an error where they are not. */
function measuredWalks(): WalkTimes {
  const times: unknown = dataOf("walk-times");
  if (!validWalkTimes(times)) throw new Error("walk-times: invalid walk times");
  return times;
}

/** The measured pressures (`dataOf("pressure-profiles")`), an error where they are not. */
function measuredPressures() {
  const tables: unknown = dataOf("pressure-profiles");
  if (!validPressures(tables)) throw new Error("pressure-profiles: invalid pressure tables");
  return tables;
}

/** **The prior alone**: no profile, each model its guess, set by hand (`BY_HAND`); its walks priced as starting at the body's speed. */
export const PRIOR_PREDICTIONS = deepFreeze<PredictionsPart<{ readonly kind: "prior" }>>({
  role: "predictions", label: "The prior alone", fields: [], slots: [], defaults: { kind: "prior" }, keys: { kind: true },
  fits: anyBody, faults: () => [], make: () => ({ outcomes: nearestTrials({ strikes: [], edges: [] }), exchange: ({ strikes }) => new ProfileExchange({ strikes, measured: [], pressures: null, guesses: BY_HAND }), walkStart: "speed", walkArrivals: null, guesses: BY_HAND }),
});

declare module "../contract/parts.ts" {
  interface PredictionsConfigs {
    readonly measured: MeasuredConfig<"measured">;
    readonly "measured-only": MeasuredConfig<"measured-only">;
    readonly prior: { readonly kind: "prior" };
  }
}
