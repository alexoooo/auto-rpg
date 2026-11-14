import { LOCAL_NAVIGATION } from "../../skills/locomotion/navigation/local-navigation.ts";
import { VISIBILITY_NAVIGATION } from "../../skills/locomotion/navigation/visibility-navigation.ts";

/**
 * **Every navigation, by its kind** (`NavigatorPart`), in the order a picker offers them: a line
 * here registers one.
 */
export const NAVIGATIONS = { "visibility-navigation": VISIBILITY_NAVIGATION, "local-navigation": LOCAL_NAVIGATION };
