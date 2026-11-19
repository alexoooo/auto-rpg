import { CONTEXT } from "./context.ts";
import { createMatchup } from "../../game/arena/matchup.ts";
import { createLabScenarios } from "../../game/lab/scenarios.ts";

/** Node setup and configuration links. */
export const { readControls, controlCharacter, controlsFor, defaultControl, readMinds, recipeOf } = createMatchup(CONTEXT);
export const { LAB_MIND, labAddress } = createLabScenarios(CONTEXT);
