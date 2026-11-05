import { Duel as BaseDuel } from "../game/arena/duel.ts";
import { TeamBout as BaseTeamBout, crowdFight as crowd, teamFaults as faults } from "../game/arena/team-bout.ts";
import { DungeonRun as BaseDungeonRun } from "../game/dungeon/run.ts";
import { labActor as actor } from "../game/lab/actor.ts";
import { strikeActions as actions, attackTargetPart as targetPart } from "../game/lab/attack-target.ts";
import type { GameContext } from "../game/arena/context.ts";

/** Application constructors over the same immutable gameplay context. */
export function gameApplication(context: GameContext) {
  class Duel extends BaseDuel {
    constructor(world: ConstructorParameters<typeof BaseDuel>[0], recipe: ConstructorParameters<typeof BaseDuel>[1], hooks: ConstructorParameters<typeof BaseDuel>[3] = {}) { super(world, recipe, context, hooks); }
  }
  class TeamBout extends BaseTeamBout {
    constructor(world: ConstructorParameters<typeof BaseTeamBout>[0], recipe: ConstructorParameters<typeof BaseTeamBout>[1], hooks: ConstructorParameters<typeof BaseTeamBout>[3] = {}) { super(world, recipe, context, hooks); }
  }
  class DungeonRun extends BaseDungeonRun {
    constructor(options: ConstructorParameters<typeof BaseDungeonRun>[0]) { super(options, context); }
  }
  return { Duel, TeamBout, DungeonRun, crowdFight: (seed = 0) => crowd(context, seed), teamFaults: (recipe: Parameters<typeof faults>[1]) => faults(context, recipe),
    labActor: (...args: [Parameters<typeof actor>[1], Parameters<typeof actor>[2], Parameters<typeof actor>[3]]) => actor(context, ...args),
    strikeActions: (...args: [Parameters<typeof actions>[1], Parameters<typeof actions>[2]]) => actions(context, ...args),
    attackTargetPart: (...args: [Parameters<typeof targetPart>[1], Parameters<typeof targetPart>[2]]) => targetPart(context, ...args) };
}
