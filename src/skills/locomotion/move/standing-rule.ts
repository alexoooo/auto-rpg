import type { GaitName } from "../../framework/skill.ts";
import { CONDITIONS } from "./move/conditions.ts";
import { deepFreeze } from "../../../core/state.ts";
import { standingRule } from "./move/move.ts";
import { moveRulePart, withGait } from "./move-rule-part.ts";

/** A rule of Move: while the body is asked to stand, `gait`. */
interface WhenStandingConfig { readonly kind: "when-standing"; readonly gait: GaitName }

export const WHEN_STANDING = deepFreeze(moveRulePart<WhenStandingConfig>({
  label: "While standing", defaults: { kind: "when-standing", gait: "braced" }, keys: { kind: true, gait: true },
  fields: withGait(CONDITIONS["when-standing"].fields), faults: () => [],
  make: (_config, gait) => standingRule(gait),
}));

declare module "./move-rule-part.ts" {
  interface MoveRuleConfigs {
    readonly "when-standing": WhenStandingConfig;
  }
}
