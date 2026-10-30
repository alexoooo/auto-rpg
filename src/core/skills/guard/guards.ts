import { COVER_GUARD, SHIELD_GUARD } from "./guard-part.ts";

/**
 * **Every guard, by its kind** (`GuardPart`), in the order a picker offers them: a line here
 * registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const GUARDS = { "cover-guard": COVER_GUARD, "shield-guard": SHIELD_GUARD };
