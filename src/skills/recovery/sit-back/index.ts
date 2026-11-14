import { routeTechnique, type StagedConfig } from "../shared/staged/techniques.ts";

/** **Sit back**: from hands and knees on toes, sat back onto the heels and up over the feet (`SIT_BACK`), climbed and steadied. */
export const SIT_BACK_EDGE = routeTechnique("sit-back", "Sit back");

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "sit-back": StagedConfig<"sit-back">;
  }
}
