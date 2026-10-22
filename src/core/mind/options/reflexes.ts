import { COVER_REFLEX } from "./cover-reflex.ts";

/**
 * **Every reflex, by its kind** (`ReflexPart`), in the order a picker offers them: what a mind's
 * reflex list holds, a line here registering one. This module holds its imports and this list and
 * nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const REFLEXES = { "cover-reflex": COVER_REFLEX };
