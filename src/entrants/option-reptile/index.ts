import type { Entrant } from "../../core/parts/entrant.ts";
import { FIGHT_OBJECTIVE, OPTION_REPTILE_MIND, OPTION_REPTILE_PRESETS, VALUED_CHOOSER } from "./mind.ts";
import { BITE_OPTION, CRAWL_OPTION, HOLD_OPTION, ORDERS_OPTION, RIGHTING_OPTION } from "./options.ts";

/**
 * **The Option Reptile**: the Option framework on a second body family, a chooser over the
 * reptile's crawl, bite and righting as option kinds, over the toolkit's quadruped layers.
 */
export const OPTION_REPTILE: Entrant = Object.freeze({
  name: "option-reptile",
  minds: [OPTION_REPTILE_MIND],
  parts: [VALUED_CHOOSER, FIGHT_OBJECTIVE, ORDERS_OPTION, BITE_OPTION, CRAWL_OPTION, RIGHTING_OPTION, HOLD_OPTION],
  presets: OPTION_REPTILE_PRESETS,
});
