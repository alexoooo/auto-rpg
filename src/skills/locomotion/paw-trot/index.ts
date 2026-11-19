import { REPTILE_TROT } from "../shared/quadruped/tuning.ts";
import { pawGaitPart } from "../shared/quadruped/parts.ts";
import { trot, validTrot } from "./paw-trot/trot.ts";

/** **The trot** as a gait (`pawGaitPart`): the quadruped's travel. */
export const TROT_PART = pawGaitPart({ kind: "paw-trot", label: "Trot", gait: "trot", settings: REPTILE_TROT, valid: validTrot, make: trot });

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-trot": PawGaitConfig<"paw-trot", typeof REPTILE_TROT>;
  }
}
