import { handConfigurationRefusal } from "../../reach/hand.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/bonk/swing.meta.json" with { type: "json" };
import layoutFile from "../../../../assets/skills/strikes/bonk/swing.layout.json" with { type: "json" };
import { recoveryNetwork, type Network } from "../../../core/math/learning/recovery-network.ts";
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";
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

/** The bonk swings the club overhead at the head, the arm straight as it lands, and meets the target with its head. */
const ITEM = "club", MECHANISM = "blunt";

/** How the bonk's steer reads and pushes, where one is trained (`assets/skills/strikes/bonk/swing.layout.json`). */
export const BONK_LAYOUT: SteerLayout = deepFreeze(checkedLayout(layoutFile as SteerLayout));

/**
 * **A bonk's record for one body** (`dataOf("bonk/swing")`, by model): its settings, whole, and
 * the network that steers it where one was trained (`BONK_LAYOUT`'s inputs in, its outputs out,
 * `recoveryNetwork`), or none.
 */
export interface BonkRecord extends SkillRecord<Swing> {
  readonly network?: Network | null;
}

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's bonk record, its swing variation's (`assets/skills/strikes/bonk/swing.json`). */
    "bonk/swing": Readonly<Record<string, BonkRecord>>;
  }
}

/** The bonk's config: a research `tuning` over its body's record (all of its settings where the body has none). */
interface Config extends Varied {
  readonly kind: "bonk";
  readonly tuning?: Partial<Swing>;
}

/** The bonk's variations: the swing (`swing/`). */
const VARIATIONS = {
  swing({ body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) {
    const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
    for (const hand of SIDES) { const face = heldFace(spec, `hand.${hand}`, ITEM, MECHANISM); if (face) faces[hand] = face; }
    const network = config.tuning === undefined ? dataOf("bonk/swing")[spec.model]?.network : null;
    return swingExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf("bonk/swing"), spec, config), aimedPoint(aim), faces,
      { layout: BONK_LAYOUT, ...(network ? { policy: recoveryNetwork(network) } : {}) });
  },
};

/**
 * **The bonk** (`swingExecutor`): the club swung overhead on an arc that meets the target with its
 * head, its settings its body's record of the swing (`assets/skills/strikes/bonk/swing.json`): the
 * windup and the schedule of pushes searched for that body, steered by its network where it has
 * one. A body with no record does not throw it; a hand holding another item, or nothing, does
 * not. A research `tuning` sets settings over the record's, and then no network steers it: its
 * trainer does, where it is `steered`.
 */
export const BONK_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Bonk", stage: "game", defaults: { kind: "bonk" },
  keys: { kind: true, variation: true, tuning: true }, tuning: SWING_KEYS,
  fields: [], slots: [],
  fits: fitsAll(variationFault("bonk", "bonk", VARIATIONS), (spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"), strikesWithOneOf("hand.left", "hand.right"),
    recordFault("bonk", deepFreeze(meta.bodies), validSwing), (spec, config) => config.tuning ? swingChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validSwingPart(config.tuning) ? [] : ["invalid bonk tuning"],
  reads: () => ["bonk/swing"], effectors: ["hand.left", "hand.right"], aims: true, meets: MECHANISM,
  strikesWith: (spec, _config, effector) => heldFace(spec, effector, ITEM, MECHANISM) !== null,
  make: variationMaker("bonk", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "bonk": Config;
  }
}
