import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import { fitsAll } from "../../../parts/parts.ts";
import type { Body } from "../../../control/body.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { standingFooting } from "../../../control/support.ts";
import type { GaitPart } from "../../framework/locomotion-part.ts";
import { stanceFeetOf, stanceSegmentsOf } from "../shared/stance-feet.ts";
import { fitsSoles } from "../../../control/stance/stance-balance.ts";
import { deepFreeze } from "../../../core/state.ts";
import { locomotion, validCarriage, validTurnLimit, validTurnStartup, type Carriage, type TurnStartup } from "../shared/locomotion.ts";

/** **The walk** within the body's stance envelope (`locomotion`). */
interface StanceWalkConfig extends Varied {
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

/** Walk in the stance's variations: walk in the stance. */
const VARIATIONS = {
  "stance-walk": (body: Body, config: StanceWalkConfig) => locomotion(stanceFeetOf(body.built.spec), body.envelope, { turnLimit: config.tuning?.turnLimit,
    turnStartup: config.tuning?.turnStartup, carriage: config.carriage, segments: stanceSegmentsOf(body.built.spec), idleFooting: standingFooting(body.built) }),
};

/** **Walk in the stance** (`locomotion`): it holds the body's stance envelope (`Body.envelope`) and stops at `STANCE_STOPPING`. */
export const STANCE_WALK_PART = deepFreeze<GaitPart<StanceWalkConfig>>({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Walk in the stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance-walk" },
  keys: { kind: true, variation: true, tuning: true, carriage: true }, tuning: ["turnLimit", "turnStartup"],
  fits: fitsAll(variationFault("stance-walk", "walk in the stance", VARIATIONS), fitsSoles),
  faults: (config) => [
    ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
    ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
  ],
  make: variedMake("stance-walk", VARIATIONS, (body, config) => [body.built.spec, config]),
  skillGroup: "Travel", variations: Object.keys(VARIATIONS),
});

declare module "../../config.ts" {
  interface GaitConfigs {
    readonly "stance-walk": StanceWalkConfig;
  }
}
