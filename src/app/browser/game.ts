import { CONTEXT } from "./context.ts";
import { gameApplication } from "../game.ts";

/** Browser gameplay composition. */
export const { Duel, TeamBout, DungeonRun, createDungeonRun, crowdFight, teamFaults, labActor, strikeActions, attackTargetPart } = gameApplication(CONTEXT);
export type Duel = import("../../game/arena/duel.ts").Duel;
export type TeamBout = import("../../game/arena/team-bout.ts").TeamBout;
export type DungeonRun = import("../../game/dungeon/run.ts").DungeonRun;

export * from "../../game/arena/duel.ts";
export * from "../../game/arena/team-bout.ts";
export * from "../../game/dungeon/run.ts";
export * from "../../game/lab/actor.ts";
export * from "../../game/lab/attack-target.ts";
