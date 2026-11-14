import { routeTechnique, type StagedConfig } from "../shared/staged/techniques.ts";

/** **Staged roll**: from the back or a side onto the front, as step up rolls. */
export const STAGED_ROLL = routeTechnique("staged-roll", "Staged roll");

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "staged-roll": StagedConfig<"staged-roll">;
  }
}
