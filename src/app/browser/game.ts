import { CONTEXT } from "./context.ts";
import { gameApplication } from "../game.ts";

/** Browser gameplay composition. */
export const { crowdFight, labActor, strikeActions } = gameApplication(CONTEXT);
