import { SUPPORT_FOLD } from "../skills/support-part.ts";

/**
 * **Every low support, by its kind** (`SupportPart`), in the order a picker offers them: a line
 * here registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const SUPPORTS = { "support-fold": SUPPORT_FOLD };
