/** The game's end rules list with the swap fixture's stub: what `src/arena/ends.ts` is under `hooks.mjs`. */
import { END_RULES as GAME } from "../../../src/arena/ends.ts?game";
import { STUB_RING } from "./stub-end.mjs";

export const END_RULES = { ...GAME, "stub-ring": STUB_RING };
