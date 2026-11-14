import { routeTechnique, type StagedConfig } from "../shared/staged/techniques.ts";

/** **Staged down**: from the front onto hands and knees, step up's fold, tuck, prop and bearing stage on them. */
export const STAGED_DOWN = routeTechnique("staged-down", "Staged down");

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "staged-down": StagedConfig<"staged-down">;
  }
}
