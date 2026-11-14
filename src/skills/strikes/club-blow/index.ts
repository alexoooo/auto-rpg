import { handConfigurationRefusal } from "../../reach/hand.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/club-blow/swing.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll, strikesWithOneOf } from "../../../parts/parts.ts";
import { deepFreeze } from "../../../core/state.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { variationFault, variationMaker, type Varied } from "../../framework/variations.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../../framework/records.ts";
import { heldFace, type StrikingFace } from "../shared/held-face.ts";
import { swingChannelFault, swingExecutor, SWING_KEYS, validSwing, validSwingPart, type Swing } from "../shared/swing.ts";
import { SIDES, type Side } from "../../../core/bodies/bilateral.ts";

/** The club blow swings the club at the trunk and meets the target with its head. */
const ITEM = "club", MECHANISM = "blunt";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's club blow record, its swing variation's (`assets/skills/strikes/club-blow/swing.json`). */
    "club-blow/swing": Readonly<Record<string, SkillRecord<Swing>>>;
  }
}

/** The club blow's config: a research `tuning` over its body's record (all of its settings where the body has none). */
interface Config extends Varied {
  readonly kind: "club-blow";
  readonly tuning?: Partial<Swing>;
}

/** The club blow's variations: the swing (`shared/swing.ts`). */
const VARIATIONS = {
  swing({ body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) {
    const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
    for (const hand of SIDES) { const face = heldFace(spec, `hand.${hand}`, ITEM, MECHANISM); if (face) faces[hand] = face; }
    return swingExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf("club-blow/swing"), spec, config), aimedPoint(aim), faces);
  },
};

/**
 * **The club blow** (`swingExecutor`): the club swung on an arc that meets the target with its
 * head, its settings its body's record of the swing (`assets/skills/strikes/club-blow/swing.json`):
 * the windup and the schedule of pushes searched for that body. A body with no record does not
 * throw it; a hand holding another item, or nothing, does not. A research `tuning` sets settings
 * over the record's.
 */
export const CLUB_BLOW_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Club blow", stage: "experimental", defaults: { kind: "club-blow" },
  keys: { kind: true, variation: true, tuning: true }, tuning: SWING_KEYS,
  fields: [], slots: [],
  fits: fitsAll(variationFault("club-blow", "club blow", VARIATIONS), (spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"), strikesWithOneOf("hand.left", "hand.right"),
    recordFault("club blow", deepFreeze(meta.bodies), validSwing), (spec, config) => config.tuning ? swingChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validSwingPart(config.tuning) ? [] : ["invalid club blow tuning"],
  reads: () => ["club-blow/swing"], effectors: ["hand.left", "hand.right"], aims: true, meets: MECHANISM,
  strikesWith: (spec, _config, effector) => heldFace(spec, effector, ITEM, MECHANISM) !== null,
  make: variationMaker("club-blow", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "club-blow": Config;
  }
}
