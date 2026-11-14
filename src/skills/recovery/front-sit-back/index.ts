import { routeTechnique, type StagedConfig } from "../shared/staged/techniques.ts";

/**
 * **Sit back from the front**: onto hands and knees as step up comes, and on through the sit-back
 * without a stop (`SIT_BACK`): one rise, since a body stopped on hands and knees (`staged-down`)
 * and begun on the sit-back afresh mostly falls.
 */
export const FRONT_SIT_BACK = routeTechnique("front-sit-back", "Sit back from the front");

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "front-sit-back": StagedConfig<"front-sit-back">;
  }
}
