import { varied, type Varied } from "../../framework/variations.ts";
import type { Body } from "../../../control/body.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { GaitPart } from "../../framework/locomotion-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { STAGGERED, validCarriage, validTurnLimit, validTurnStartup, type Carriage, type TurnStartup } from "../shared/locomotion.ts";
import { stanceWalk } from "../shared/stance-walk.ts";
import { STANCE_GAIT, type GaitTuning } from "../../../control/stance/stance-tuning.ts";

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

/**
 * The footwork's steps: the stance's own (`STANCE_GAIT`), a walk started with the foot whose first
 * landing is the further its way (`GaitTuning.startsToward`), so that a step to a side goes
 * the walk's way from its first lift.
 */
const FOOTWORK_STEPS: GaitTuning = deepFreeze({ ...STANCE_GAIT, startsToward: true });

/** The walk in the stance (`stanceWalk`) as `config` sets it, by the stance's own steps or by `steps`. */
const walk = (body: Body, config: StanceWalkConfig, steps?: GaitTuning) =>
  stanceWalk(body, { turnLimit: config.tuning?.turnLimit, turnStartup: config.tuning?.turnStartup, carriage: config.carriage }, steps);

/**
 * Walk in the stance's variations: the walk in the stance, by the steps the stance has; the
 * footwork, a fight's short steps (`FOOTWORK_STEPS`), which it asks of the stance with each goal,
 * so a stance tuned to other steps walks the footwork's under it; and the walk held in the
 * staggered carriage (`STAGGERED`) where its config names none.
 */
const VARIATIONS = {
  "stance-walk": (body: Body, config: StanceWalkConfig) => walk(body, config),
  "footwork": (body: Body, config: StanceWalkConfig) => walk(body, config, FOOTWORK_STEPS),
  "staggered": (body: Body, config: StanceWalkConfig) => walk(body, { ...config, carriage: config.carriage ?? STAGGERED }),
};

/** **Walk in the stance** (`locomotion`): it holds the body's stance envelope (`Body.envelope`) and stops at `STANCE_STOPPING`. */
export const STANCE_WALK_PART = deepFreeze<GaitPart<StanceWalkConfig>>({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Walk in the stance", stage: "game", travels: true, fields: [], slots: [], defaults: { kind: "stance-walk" },
  keys: { kind: true, variation: true, tuning: true, carriage: true }, tuning: ["turnLimit", "turnStartup"],
  ...varied({ skill: "stance-walk", label: "walk in the stance", variations: VARIATIONS, of: (body, config) => [body.built.spec, config], fits: [soleRefusal] }),
  faults: (config) => [
    ...(validTurnLimit(config.tuning?.turnLimit) ? [] : ["locomotion turn limit must be finite and positive"]),
    ...(validTurnStartup(config.tuning?.turnStartup) ? [] : ["invalid combat turn startup settings"]),
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
  ],
  skillGroup: "Travel",
});

declare module "../../config.ts" {
  interface GaitConfigs {
    readonly "stance-walk": StanceWalkConfig;
  }
}
