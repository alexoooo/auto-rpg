import type { Entrant } from "../../minds/index.ts";
import { BARE_MIND, BARE_PRESETS } from "./mind.ts";

/** **Bare**: a network from the body to its muscles and nothing of the toolkit's control. */
export const BARE: Entrant = Object.freeze({ name: "bare", minds: [BARE_MIND], presets: BARE_PRESETS });
