import { dataIdentity, type DataKey } from "../core/data/store.ts";
import { recordingKey } from "../core/world/recording.ts";
import { type GameContext, perContext } from "../game/arena/context.ts";
import type { CaseWorld, Json, WorldKind } from "./evaluation.ts";
import { sha256Text } from "./sha256.ts";
import { WORLD_FACTORIES } from "./worlds.ts";

/** The registered case-world builders, bound to the application's fixed choices, and what a world of them loads. */
export const createWorlds = perContext((context: GameContext) => {
  const WORLD_BUILDERS = { bout: WORLD_FACTORIES.bout(context), fall: WORLD_FACTORIES.fall(context), crypt: WORLD_FACTORIES.crypt(context), lone: WORLD_FACTORIES.lone(context), technique: WORLD_FACTORIES.technique(context) };

  /** Each model's row of each key, digested once: mind data loads once a realm and is frozen (`loadData`). */
  const digests = new Map<string, string>();
  const rowDigest = (key: DataKey, model: string): string => {
    const at = `${key} ${model}`;
    if (!digests.has(at)) digests.set(at, sha256Text(recordingKey(dataIdentity(key, model))).slice(0, 16));
    return digests.get(at)!;
  };

  /**
   * **What `world` loads, as its case's key covers it** (`casesOf`): for each mind data key its
   * kind names (`WorldKind.loads`) and each model it seats, the digest of that model's row of the
   * data as it is loaded now (`dataIdentity`). A record or a profile changed under a body is so
   * another key, and one changed under a body the world does not seat is not.
   */
  function loadsOf(world: CaseWorld): Json {
    const { models, keys } = (WORLD_BUILDERS[world.kind] as unknown as WorldKind).loads(world);
    const seated = [...new Set(models)].sort();
    return Object.fromEntries([...new Set(keys)].sort().map((key) =>
      [key, Object.fromEntries(seated.map((model) => [model, rowDigest(key, model)]))]));
  }

  return { WORLD_BUILDERS, loadsOf };
});
