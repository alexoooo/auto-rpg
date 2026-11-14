import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/sword-thrust/drive.meta.json" with { type: "json" };
import { recoveryNetwork, type Network } from "../../../core/math/learning/recovery-network.ts";
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll, fitsWhen, strikesWithOneOf } from "../../../parts/parts.ts";
import { deepFreeze } from "../../../core/state.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { recordFault, tunedSettings, type SkillRecord } from "../../framework/records.ts";
import { variationFault, variationMaker, type Varied } from "../../framework/variations.ts";
import { heldFace, type StrikingFace } from "../shared/held-face.ts";
import { STRAIGHT_DRIVE_KEYS, straightDriveExecutor, straightDriveFits, timedChannelFault, validStraightDrive, validStraightDrivePart,
  type StraightDrive } from "../shared/straight-drive.ts";
import { checkedLayout, type SteerLayout } from "../shared/steer.ts";
import layoutFile from "../../../../assets/skills/strikes/sword-thrust/drive.layout.json" with { type: "json" };
import { type Side, SIDES } from "../../../core/bodies/bilateral.ts";
import { handConfigurationRefusal } from "../../reach/hand.ts";

/** The sword thrust drives the sword and meets the target with its point. */
const ITEM = "sword", MECHANISM = "point";

/** **A sword thrust's settings**: a straight drive's (`StraightDrive`) but `fire`, which reads the fist a held face does not strike with. */
export type SwordThrust = Omit<StraightDrive, "fire">;

/** Every setting a sword thrust may name. */
const SWORD_THRUST_KEYS: readonly (keyof SwordThrust)[] = deepFreeze(STRAIGHT_DRIVE_KEYS.filter((key): key is keyof SwordThrust => key !== "fire"));

/** Whether `settings`, some of a sword thrust's, are each valid, and name no `fire`. */
const validSwordThrustPart = (settings: Partial<SwordThrust>): boolean => validStraightDrivePart(settings) && !("fire" in settings);

/** Whether `settings` are a sword thrust's, whole (`validStraightDrive`), with no `fire`. */
export const validSwordThrust = (settings: Partial<SwordThrust>): settings is SwordThrust => validSwordThrustPart(settings) && validStraightDrive(settings);

/** How the sword thrust's steer reads and pushes: its networks' inputs and outputs (`assets/skills/strikes/sword-thrust/drive.layout.json`). */
export const SWORD_THRUST_LAYOUT: SteerLayout = deepFreeze(checkedLayout(layoutFile as SteerLayout));

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
interface Config extends Varied {
  readonly kind: "sword-thrust";
  readonly tuning?: Partial<SwordThrust>;
}

/** The sword thrust's variations: the drive, the straight drive with the sword's point as its record has it. */
const VARIATIONS = {
  drive({ body, guard, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) {
    const spec = body.built.spec, faces: Partial<Record<Side, StrikingFace>> = {};
    for (const hand of SIDES) { const face = heldFace(spec, `hand.${hand}`, ITEM, MECHANISM); if (face) faces[hand] = face; }
    const network = config.tuning === undefined ? dataOf("sword-thrust/drive")[spec.model]?.network : null;
    return straightDriveExecutor(body, guard, actions.map((action) => action.name), tunedSettings(dataOf("sword-thrust/drive"), spec, config), aimedPoint(aim),
      { label: "sword thrust", layout: SWORD_THRUST_LAYOUT, faces, ...(network ? { policy: recoveryNetwork(network) } : {}) });
  },
};

/**
 * **The sword thrust** (`straightDriveExecutor`): a whole-body drive thrown with the sword's point
 * (`heldFace`), its settings its body's record of the thrust (`SkillRecord`,
 * `assets/skills/strikes/sword-thrust/drive.json`): a schedule of the trunk's, legs' and arm's
 * pushes, the arm held at its contact pose, the point along the line from the shoulder to the
 * target, steered by its network where it has one. A body with no record does not throw it; a
 * hand holding another item, or nothing, does not. A research `tuning` sets settings over the
 * record's, and then no network steers it: its trainer does, where it is `steered`.
 */
export const SWORD_THRUST_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Sword thrust", stage: "game", defaults: { kind: "sword-thrust" },
  keys: { kind: true, variation: true, tuning: true }, tuning: SWORD_THRUST_KEYS,
  fields: [], slots: [],
  fits: fitsAll(variationFault("sword-thrust", "sword thrust", VARIATIONS), strikesWithOneOf("hand.left", "hand.right"), fitsWhen(straightDriveFits, "needs both arms on the upper trunk and a thoracic joint"),
    (spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"),
    recordFault("sword thrust", deepFreeze(meta.bodies), validSwordThrust),
    (spec, config) => config.tuning ? timedChannelFault(spec, config.tuning) : null),
  faults: (config) => config.tuning === undefined || validSwordThrustPart(config.tuning) ? [] : ["invalid sword thrust tuning"],
  reads: () => ["sword-thrust/drive"], effectors: ["hand.left", "hand.right"], aims: true, meets: MECHANISM,
  strikesWith: (spec, _config, effector) => heldFace(spec, effector, ITEM, MECHANISM) !== null,
  make: variationMaker("sword-thrust", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "sword-thrust": Config;
  }
}
