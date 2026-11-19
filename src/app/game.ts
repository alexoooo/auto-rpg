import { crowdFight as crowd } from "../game/arena/team-bout.ts";
import { createDungeonRun as dungeonRun } from "../game/dungeon/run.ts";
import { labActor as actor } from "../game/lab/actor.ts";
import { strikeActions as actions } from "../game/lab/attack-target.ts";
import type { GameContext } from "../game/arena/context.ts";

/** Application constructors over the same immutable gameplay context. */
export function gameApplication(context: GameContext) {
  return { createDungeonRun: (options: Parameters<typeof dungeonRun>[0]) => dungeonRun(options, context), crowdFight: (seed = 0) => crowd(context, seed),
    labActor: (...args: [Parameters<typeof actor>[1], Parameters<typeof actor>[2], Parameters<typeof actor>[3]]) => actor(context, ...args),
    strikeActions: (...args: [Parameters<typeof actions>[1], Parameters<typeof actions>[2]]) => actions(context, ...args) };
}
