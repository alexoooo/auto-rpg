import { coveringPart, type CoveringConfig } from "../shared/cover.ts";

/** **The shield guard** (`coveringPart`): a cover guard that also wards with an item's declared face, held out at the threat and turned toward it. */
export const SHIELD_GUARD = coveringPart({ kind: "shield-guard", label: "Guard faces and lines", named: "shield guard", wards: true });

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "shield-guard": CoveringConfig<"shield-guard">;
  }
}
