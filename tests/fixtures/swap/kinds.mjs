/** The game's kinds list with the swap fixture's entrant: what `src/core/mind/kinds.ts` is under `hooks.mjs`. */
import { MIND_KINDS as GAME } from "../../../src/core/mind/kinds.ts?game";
import { SWAP_MIND } from "./mind.mjs";

export const MIND_KINDS = [...GAME, SWAP_MIND];
