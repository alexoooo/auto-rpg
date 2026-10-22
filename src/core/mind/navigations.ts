import { LOCAL_NAVIGATION } from "./local-navigation.ts";
import { VISIBILITY_NAVIGATION } from "./visibility-navigation.ts";

/**
 * **Every navigation, by its kind** (`NavigatorPart`), in the order a picker offers them: a line
 * here registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const NAVIGATIONS = { "visibility-navigation": VISIBILITY_NAVIGATION, "local-navigation": LOCAL_NAVIGATION };
