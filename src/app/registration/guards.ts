import { COVER_GUARD } from "../../skills/guard/cover-guard/index.ts";
import { SHIELD_GUARD } from "../../skills/guard/shield-guard/index.ts";
import { REST_GUARD } from "../../skills/guard/rest/index.ts";
import { LOWERED_GUARD } from "../../skills/guard/lowered/index.ts";

/**
 * **Every guard, by its kind** (`GuardPart`), in the order a picker offers them: a line here
 * registers one.
 */
export const GUARDS = { "cover-guard": COVER_GUARD, "shield-guard": SHIELD_GUARD, rest: REST_GUARD, lowered: LOWERED_GUARD };
