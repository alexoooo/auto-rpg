import { CONTEXT } from "./context.ts";
import { createMatchup } from "../../game/arena/matchup.ts";
import { createLabScenarios } from "../../game/lab/scenarios.ts";
import { mindLinks } from "../../minds/config-link.ts";
export * from "../../game/arena/matchup.ts";
export * from "../../game/lab/scenarios.ts";

/** Browser setup and configuration links. */
export const { mindFaults, writeMind, readMind, mindText } = mindLinks(CONTEXT.catalog);
export const { CONTROLS, readControls, controlCharacter, controlsFor, defaultControl, linkedMind, unreadMinds, mindsSearch, controlName, controllerLabel, recipeOf } = createMatchup(CONTEXT);
export const { LAB_MIND, LAB_WALKER, labPresets, labMind, labWithMind, labAddress, labHref } = createLabScenarios(CONTEXT);
