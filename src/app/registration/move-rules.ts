import { WHEN_DISTANCE } from "../../skills/locomotion/distance-rule.ts";
import { WHEN_STANDING } from "../../skills/locomotion/standing-rule.ts";

/**
 * **Every rule of Move, by its kind** (`MoveRulePart`), in the order a picker offers them: what
 * Move's rule list holds, a line here registering one.
 */
export const MOVE_RULES = { "when-standing": WHEN_STANDING, "when-distance": WHEN_DISTANCE };
