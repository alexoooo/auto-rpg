import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { fitsSoles } from "../control/stance-balance.ts";
import { deepFreeze } from "../state.ts";
import { locomotion, validTurnLimit, validTurnStartup, type TurnStartup } from "./locomotion.ts";

/** **The walk** within the body's stance envelope (`locomotion`). */
interface StanceWalkConfig {
  readonly kind: "stance-walk";
  readonly tuning?: {
    /** A heading-speed ceiling, rad/s: `docs/reference/combat-locomotion.md`. */
    readonly turnLimit?: number;
    /** A brief heading-speed ceiling while setting off: `docs/reference/combat-turn-startup.md`. */
    readonly turnStartup?: TurnStartup;
  };
}

/** **Walk in the stance** (`locomotion`): it holds the body's stance envelope (`Body.envelope`) and stops at `STANCE_STOPPING`. */
export const STANCE_WALK_PART: LocomotionPart<StanceWalkConfig> = deepFreeze({
  role: "locomotion", label: "Walk in the stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance-walk" },
  keys: { kind: true, tuning: true }, tuning: ["turnLimit", "turnStartup"], fits: fitsSoles,
  faults: (config) => [
    ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
    ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
  ],
  make: (body, config) => locomotion(body.envelope, config.tuning?.turnLimit, config.tuning?.turnStartup),
});
