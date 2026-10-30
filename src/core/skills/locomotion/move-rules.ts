import { WHEN_DISTANCE } from "./distance-rule.ts";
import { WHEN_STANDING } from "./standing-rule.ts";

/**
 * **Every rule of Move, by its kind** (`MoveRulePart`), in the order a picker offers them: what
 * Move's rule list holds, a line here registering one. This module holds its imports and this
 * list and nothing else: a case's code reads it as where each kind's own code begins
 * (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const MOVE_RULES = { "when-standing": WHEN_STANDING, "when-distance": WHEN_DISTANCE };
