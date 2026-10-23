/** The game's Commanders list with the swap fixture's stub: what `src/core/command/commanders.ts` is under `hooks.mjs`. */
import { COMMANDERS as GAME } from "../../../src/core/command/commanders.ts?game";
import { STUB_COMMANDER, STUB_APPROACH_COMMANDER } from "./stub-commander.mjs";

export const COMMANDERS = { ...GAME, "stub-hold": STUB_COMMANDER, "stub-approach": STUB_APPROACH_COMMANDER };
