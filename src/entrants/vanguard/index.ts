import type { Entrant } from "../../core/parts/entrant.ts";
import { VANGUARD_EXCHANGE } from "./exchange.ts";
import { VANGUARD_PRESETS, VANGUARD_MIND } from "./mind.ts";
import { VANGUARD_NAVIGATION } from "./navigation-part.ts";
import { VANGUARD_PLAN } from "./plan.ts";
import { VANGUARD_PUNCH } from "./punch-part.ts";
import { VANGUARD_WALK } from "./walk-part.ts";

/** **Vanguard**: its own mind over the toolkit's fighter, its layered planner, exchange, punch, walk and navigation, and a calibration for each humanoid. */
export const VANGUARD: Entrant = Object.freeze({
  name: "vanguard", minds: [VANGUARD_MIND], parts: [VANGUARD_PUNCH, VANGUARD_PLAN, VANGUARD_WALK, VANGUARD_EXCHANGE, VANGUARD_NAVIGATION], presets: VANGUARD_PRESETS,
});
