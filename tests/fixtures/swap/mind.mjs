/**
 * **The swap fixture's entrant**: the game's fighter under a kind of its own, every part chosen by
 * its config, its stubs its own parts (`Controller.parts`). It is registered from here by one list
 * line (`kinds.mjs`), as an entrant's folder is.
 */
import { RECIPE_FIGHTER } from "../../../src/core/mind/config.ts";
import { FIGHTER_MIND } from "../../../src/core/mind/fighter-kind.ts";
import { STRAIGHT_NAVIGATION } from "./straight-navigation.mjs";

/** Each converted role's stub, by the config key of the slot it goes in. */
export const STUBS = Object.freeze({ navigation: STRAIGHT_NAVIGATION });

export const SWAP_DEFAULTS = Object.freeze({ ...RECIPE_FIGHTER, kind: "swap-stub", navigation: STRAIGHT_NAVIGATION.defaults });

export const SWAP_MIND = Object.freeze({
  ...FIGHTER_MIND, label: "Swap stubs", stage: "experimental", defaults: SWAP_DEFAULTS, presets: Object.freeze({}),
  parts: Object.freeze(Object.values(STUBS)),
});
