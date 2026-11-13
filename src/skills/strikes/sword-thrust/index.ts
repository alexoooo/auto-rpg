import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/sword-thrust/drive.meta.json" with { type: "json" };
import { recoveryNetwork, type Network } from "../../../core/math/learning/recovery-network.ts";
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll, fitsWhen, strikesWithOneOf } from "../../../parts/parts.ts";
import { deepFreeze } from "../../../core/state.ts";
import { aimedPoint, type ExecutorPart } from "../../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../../framework/records.ts";
import { heldFace, type StrikingFace } from "../shared/held-face.ts";
import { SWORD_THRUST_KEYS, swordThrustExecutor, swordThrustFits, timedChannelFault, validSwordThrust, validSwordThrustPart,
  type SwordThrust } from "./drive/drive.ts";
import { type Side, SIDES } from "../../../core/bodies/bilateral.ts";
import { handConfigurationRefusal } from "../../reach/hand.ts";

/** The sword thrust drives the sword and meets the target with its point. */
const ITEM = "sword", MECHANISM = "point";

/**
 * **A sword thrust's record for one body** (`dataOf("sword-thrust/drive")`,
 * `assets/skills/strikes/sword-thrust/drive.json`, by model): its settings, whole, and the network
 * that steers it where it was trained (`SWORD_THRUST_LAYOUT`'s inputs in, its outputs out,
 * `recoveryNetwork`), or null.
 */
export interface SwordThrustRecord extends SkillRecord<SwordThrust> {
  readonly network: Network | null;
}

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's sword thrust record, its drive variation's. */
    "sword-thrust/drive": Readonly<Record<string, SwordThrustRecord>>;
  }
}

/**
 * The sword thrust's config: a research `tuning` over its body's record, which a link does not
 * carry (all of its settings where the body has none).
 */
interface Config {
  readonly kind: "sword-thrust";
  readonly tuning?: Partial<SwordThrust>;
}

/**
 * **The sword thrust** (`swordThrustExecutor`): a whole-body drive thrown with the sword's point
 * (`heldFace`), its settings its body's record of the thrust (`SkillRecord`,
 * `assets/skills/strikes/sword-thrust/drive.json`): a schedule of the trunk's, legs' and arm's
 * pushes, the arm held at its contact pose, the point along the line from the shoulder to the
 * target, steered by its network where it has one. A body with no record does not throw it; a
 * hand holding another item, or nothing, does not. A research `tuning` sets settings over the
 * record's, and then no network steers it: its trainer does, where it is `steered`.
 */
export const SWORD_THRUST_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Sword thrust", stage: "game", defaults: { kind: "sword-thrust" },
  keys: { kind: true, tuning: true }, tuning: SWORD_THRUST_KEYS,
  fields: [], slots: [],
  fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(swordThrustFits, "needs both arms on the upper trunk and a thoracic joint"),
    (spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"),
    recordFault("sword thrust", deepFreeze(meta.bodies), validSwordThrust),
    (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validSwordThrustPart(config.tuning) ? [] : ["invalid sword thrust tuning"],
  reads: () => ["sword-thrust/drive"], effectors: ["hand.left", "hand.right"], aims: true, meets: MECHANISM,
  strikesWith: (spec, _config, effector) => heldFace(spec, effector, ITEM, MECHANISM) !== null,
  make({ body, guard, aim }, config, actions) {
    const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
    for (const hand of SIDES) { const face = heldFace(spec, `hand.${hand}`, ITEM, MECHANISM); if (face) faces[hand] = face; }
    const network = config.tuning === undefined ? dataOf("sword-thrust/drive")[spec.model]?.network : null;
    return swordThrustExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf("sword-thrust/drive"), spec, config), aimedPoint(aim), faces,
      network ? { policy: recoveryNetwork(network) } : {});
  },
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "sword-thrust": Config;
  }
}
