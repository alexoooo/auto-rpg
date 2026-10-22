import { CONDITIONS } from "../mind/conditions.ts";
import { deepFreeze } from "../state.ts";
import type { GaitName } from "./gaits.ts";
import { standingRule } from "./move.ts";
import { moveRulePart, withGait } from "./move-rule-part.ts";

/** A rule of Move: while the body is asked to stand, `gait`. */
interface WhenStandingConfig { readonly kind: "when-standing"; readonly gait: GaitName }

export const WHEN_STANDING = deepFreeze(moveRulePart<WhenStandingConfig>({
  label: "While standing", defaults: { kind: "when-standing", gait: "braced" }, keys: { kind: true, gait: true },
  fields: withGait(CONDITIONS["when-standing"].fields), faults: () => [],
  make: (_config, gait) => standingRule(gait),
}));
