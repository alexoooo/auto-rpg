import { coveringPart, type CoveringConfig } from "../shared/cover.ts";

/** **The shield guard** (`coveringPart`): a cover guard that also wards with an item's declared face, held out at the threat and turned toward it. */
export const SHIELD_GUARD = coveringPart({ kind: "shield-guard", label: "Guard faces and lines",
  // A shield with a cross on its face.
  icon: "M12 2l8 3v6c0 5-3.4 9-8 11c-4.6-2-8-6-8-11V5ZM11.2 6h1.6v4h4.7v1.6h-4.7V18h-1.6v-6.4H6.5V10h4.7Z",
  named: "shield guard", wards: true });

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "shield-guard": CoveringConfig<"shield-guard">;
  }
}
