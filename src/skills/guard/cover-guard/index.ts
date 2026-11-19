import { coveringPart, type CoveringConfig } from "../shared/cover.ts";

/** **The cover guard** (`coveringPart`): the arms' posture, and a guarding hand's cover of what the mind names. */
export const COVER_GUARD = coveringPart({ kind: "cover-guard", label: "Guard and cover",
  // A shield.
  icon: "M12 2l8 3v6c0 5-3.4 9-8 11c-4.6-2-8-6-8-11V5Z",
  named: "guard and cover", wards: false });

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "cover-guard": CoveringConfig<"cover-guard">;
  }
}
