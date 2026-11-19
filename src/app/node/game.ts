import { CONTEXT } from "./context.ts";
import { gameApplication } from "../game.ts";

/** Node gameplay composition. */
export const { createDungeonRun, crowdFight, labActor } = gameApplication(CONTEXT);
