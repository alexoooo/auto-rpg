import { COVER_GUARD, LOWERED_GUARD, REST_GUARD, SHIELD_GUARD } from "../../skills/guard/guard-part.ts";

/**
 * **Every guard, by its kind** (`GuardPart`), in the order a picker offers them: a line here
 * registers one.
 */
export const GUARDS = { "cover-guard": COVER_GUARD, "shield-guard": SHIELD_GUARD, rest: REST_GUARD, lowered: LOWERED_GUARD };
