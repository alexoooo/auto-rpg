import { standingFooting } from "../../control/support.ts";
import type { GaitPart } from "../framework/locomotion-part.ts";
import { stanceFeetOf } from "./stance-feet.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { locomotion, validCarriage, validTurnLimit, validTurnStartup, type Carriage, type TurnStartup } from "./locomotion.ts";

/** **The walk** within the body's stance envelope (`locomotion`). */
interface StanceWalkConfig {
  readonly kind: "stance-walk";
  readonly tuning?: {
    /** A heading-speed ceiling, rad/s: it only lowers the envelope's turn, never raises it. */
    readonly turnLimit?: number;
    /** A brief heading-speed ceiling while setting off (`TurnStartup`). */
    readonly turnStartup?: TurnStartup;
  };
  /** The carriage it holds until a legs goal names another (`Carriage`); the square stance where none. */
  readonly carriage?: Carriage;
}

/** **Walk in the stance** (`locomotion`): it holds the body's stance envelope (`Body.envelope`) and stops at `STANCE_STOPPING`. */
export const STANCE_WALK_PART: GaitPart<StanceWalkConfig> = deepFreeze({
  role: "gait", label: "Walk in the stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance-walk" },
  keys: { kind: true, tuning: true, carriage: true }, tuning: ["turnLimit", "turnStartup"], fits: fitsSoles,
  faults: (config) => [
    ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
    ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
  ],
  make: (body, config) => locomotion(stanceFeetOf(body.built.spec), body.envelope, { turnLimit: config.tuning?.turnLimit, turnStartup: config.tuning?.turnStartup, carriage: config.carriage, idleFooting: standingFooting(body.built) }),
});

declare module "../config.ts" {
  interface GaitConfigs {
    readonly "stance-walk": StanceWalkConfig;
  }
}
