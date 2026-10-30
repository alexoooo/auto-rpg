/** The game's entrants with the swap fixture's: what `src/entrants/index.ts` is under `hooks.mjs`. */
import { ENTRANTS as GAME } from "../../../src/entrants/index.ts?game";
import { SWAP_MIND, SWAP_OPTION_MIND, SWAP_QUADRUPED_MIND } from "./mind.mjs";

export const ENTRANTS = [...GAME, SWAP_MIND, SWAP_OPTION_MIND, SWAP_QUADRUPED_MIND];
