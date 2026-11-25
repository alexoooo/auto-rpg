/** Option framework contracts and reusable components; entrants own their assemblies. */
export { optionController } from "./assembly/controller.ts";
export type { OptionMindConfig, OptionAssembly } from "./assembly/config.ts";
export { ORDERS_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, WALK_OPTION, HOLD_AT_OPTION, type WalkConfig } from "./options/kinds.ts";
export { BITE_OPTION, BONK_OPTION, CLUB_BLOW_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION, type StrikeConfig } from "./options/strike-kinds.ts";
export { BRACE_OPTION, BRACE_TUMBLING_OPTION, REGAIN_OPTION, FLATTEN_OPTION, LAND_OPTION, REPOSITION_OPTION, WAY_UP_OPTION } from "./options/rise.ts";
export type { Chooser } from "./contract/chooser.ts";
export type { Option } from "./contract/option.ts";
export type { Situation } from "./contract/situation.ts";
export type { OptionPart, ChooserPart, ObjectivePart, PredictionsPart, NamedSkills } from "./contract/parts.ts";
export type { OptionSkills } from "./assembly/skills.ts";
export type { Objective, Path } from "./contract/objective.ts";
export { profileLearningMind } from "./assembly/profile-learning.ts";
export { gaitLearningMind, withGaitTuning, withStanceTuning } from "./assembly/gait-learning.ts";
