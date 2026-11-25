/** Option framework contracts and reusable components; entrants own their assemblies. */
export { optionMind } from "./mind.ts";
export type { OptionMindConfig, OptionAssembly } from "./config.ts";
export { ORDERS_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, WALK_OPTION, HOLD_AT_OPTION,
  BITE_OPTION, BONK_OPTION, CLUB_BLOW_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION,
  type WalkConfig, type StrikeConfig, type ProfileOptionPart } from "./kinds.ts";
export { BRACE_OPTION, BRACE_TUMBLING_OPTION, REGAIN_OPTION, FLATTEN_OPTION, LAND_OPTION, REPOSITION_OPTION, WAY_UP_OPTION } from "./rise.ts";
export type { OptionChooserPart } from "./chooser.ts";
export type { Chooser } from "./contract/chooser.ts";
export type { Option } from "./contract/option.ts";
export type { Situation } from "./contract/situation.ts";
export type { OptionPart, ChooserPart, ObjectivePart, PredictionsPart, NamedSkills } from "./contract/parts.ts";
export type { OptionEvaluation, OptionEvaluationInput } from "./model.ts";
export { PROFILE_MODEL, type ProfileOptionContext } from "./profile-contract.ts";
export type { OptionSkills } from "./skills.ts";
export type { Objective, Path } from "./contract/objective.ts";
export { profileLearningMind } from "./profile-learning.ts";
export { gaitLearningMind, withGaitTuning, withStanceTuning } from "./gait-learning.ts";
