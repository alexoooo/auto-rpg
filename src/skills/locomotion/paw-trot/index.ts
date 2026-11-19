import { REPTILE_TROT } from "../shared/quadruped/tuning.ts";
import { pawGaitPart } from "../shared/quadruped/parts.ts";
import { trot, validTrot } from "./paw-trot/trot.ts";

/** **The trot** as a gait (`pawGaitPart`): the quadruped's travel. */
export const TROT_PART = pawGaitPart({ kind: "paw-trot", label: "Trot",
  // A paw print, with the marks of its speed behind it.
  icon: "M16 12.2a4 3.4 0 0 1 0 6.8a4 3.4 0 0 1 0-6.8ZM10.6 9.2a1.7 1.7 0 0 1 0 3.4a1.7 1.7 0 0 1 0-3.4ZM13.9 5.8a1.7 1.7 0 0 1 0 3.4a1.7 1.7 0 0 1 0-3.4ZM18.1 5.8a1.7 1.7 0 0 1 0 3.4a1.7 1.7 0 0 1 0-3.4ZM21.4 9.2a1.7 1.7 0 0 1 0 3.4a1.7 1.7 0 0 1 0-3.4ZM2 7h5v1.5H2ZM1 12h5v1.5H1ZM2 17h5v1.5H2Z",
  gait: "trot", settings: REPTILE_TROT, valid: validTrot, make: trot });

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-trot": PawGaitConfig<"paw-trot", typeof REPTILE_TROT>;
  }
}
