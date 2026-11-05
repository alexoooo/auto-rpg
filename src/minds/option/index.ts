/** Option framework contracts and reusable components; entrants own their assemblies. */
export { optionMind, type OptionMindConfig } from "./mind.ts";
export { ORDERS_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, WALK_OPTION, HOLD_AT_OPTION,
  BITE_OPTION, CLUB_BLOW_OPTION, CUT_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION,
  type WalkConfig, type StrikeConfig, type OptionKindPart, type OptionsGiven } from "./kinds.ts";
export { BRACE_OPTION, BRACE_TUMBLING_OPTION, STEADY_OPTION, FLATTEN_OPTION, LAND_OPTION } from "./rise.ts";
export { RANKED_CHOOSER, type OptionChooserPart, type Chooser } from "./chooser.ts";
export type { Option, Situation } from "./option.ts";
export type { OptionPart, ChooserPart, ObjectivePart, PredictionPart, PredictionsPart, PerceptPart } from "./parts.ts";
export type { Objective, Path } from "./objective.ts";
