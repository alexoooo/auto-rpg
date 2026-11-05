import { CONTEXT } from "./context.ts";
import { createMatchup } from "../../game/arena/matchup.ts";
import { createLabScenarios } from "../../game/lab/scenarios.ts";
import { mindLinks } from "../../minds/config-link.ts";
export * from "../../game/arena/matchup.ts";
export * from "../../game/lab/scenarios.ts";
export type { LinkedMind, Staging } from "../../minds/config-link.ts";

/** Browser setup and configuration links. */
export const { mindFaults, parseMind, writeMind, readMind, mindText } = mindLinks(CONTEXT.catalog);
export const { CONTROLS, readControls, controlCharacter, controlsFor, defaultControl, linkedMind, unreadMinds, readMinds, mindsSearch, controlName, controllerLabel, recipeOf } = createMatchup(CONTEXT);
export const { LAB_MIND, LAB_WALKER, labPresets, labMind, labWithMind, labAddress, labHref } = createLabScenarios(CONTEXT);
