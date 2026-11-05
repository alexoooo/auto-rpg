import type { GameContext } from "../game/arena/context.ts";
import { WORLD_FACTORIES } from "./worlds.ts";

/** The registered case-world builders, bound to the application's fixed choices. */
export function createWorlds(context: GameContext) {
  return { WORLD_BUILDERS: { bout: WORLD_FACTORIES.bout(context), fall: WORLD_FACTORIES.fall(context), crypt: WORLD_FACTORIES.crypt(context), lone: WORLD_FACTORIES.lone(context), technique: WORLD_FACTORIES.technique(context) } };
}
