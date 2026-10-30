/** The game's entrants with the swap fixture's: what `src/entrants/index.ts` is under `hooks.mjs`. */
import { ENTRANTS as GAME } from "../../../src/entrants/index.ts?game";
import { SWAP } from "./mind.mjs";

export const ENTRANTS = [...GAME, SWAP];
