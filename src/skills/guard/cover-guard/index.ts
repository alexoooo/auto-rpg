import { coveringPart, type CoveringConfig } from "../shared/cover.ts";

/** **The cover guard** (`coveringPart`): the arms' posture, and a guarding hand's cover of what the mind names. */
export const COVER_GUARD = coveringPart({ kind: "cover-guard", label: "Guard and cover", named: "guard and cover", wards: false });

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "cover-guard": CoveringConfig<"cover-guard">;
  }
}
