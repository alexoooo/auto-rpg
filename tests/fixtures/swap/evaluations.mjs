/** The game's evaluations with the swap fixture's stub: what `src/evaluation/evaluations.ts` is under `hooks.mjs`. */
import { EVALUATIONS as GAME } from "../../../src/evaluation/evaluations.ts?game";
import { STUB_STAND } from "./stub-evaluation/index.mjs";

export const EVALUATIONS = Object.freeze({ ...GAME, "stub-stand": STUB_STAND });
