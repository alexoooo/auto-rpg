/** Option framework contracts and reusable components; entrants own their assemblies. */
export { optionMind } from "./mind.ts";
export type { OptionMindConfig, OptionAssembly } from "./config.ts";
export { ORDERS_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, WALK_OPTION, HOLD_AT_OPTION,
  BITE_OPTION, BONK_OPTION, CLUB_BLOW_OPTION, CUT_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION,
  type WalkConfig, type StrikeConfig, type ProfileOptionPart } from "./kinds.ts";
export { BRACE_OPTION, BRACE_TUMBLING_OPTION, STEADY_OPTION, FLATTEN_OPTION, LAND_OPTION } from "./rise.ts";
export { BASE_OPTIONS, RISE_OPTIONS } from "./standard.ts";
export type { OptionChooserPart, Chooser } from "./chooser.ts";
export type { Option, Situation } from "./option.ts";
export type { OptionPart, ChooserPart, ObjectivePart, PredictionsPart } from "./parts.ts";
export type { Seen, Percept, Prediction, ProfilePerceptPart, ProfilePredictionPart } from "./percepts.ts";
export type { OptionEvaluation, OptionEvaluationInput } from "./model.ts";
export { PROFILE_MODEL, type ProfileOptionContext, type ProfileTables } from "./profile-contract.ts";
export type { NamedSkills, OptionSkills } from "./skills.ts";
export type { Objective, Path } from "./objective.ts";
export { profileLearningMind } from "./profile-learning.ts";
export { gaitLearningMind, withGaitTuning, withStanceTuning } from "./gait-learning.ts";
