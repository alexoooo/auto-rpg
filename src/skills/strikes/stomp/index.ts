import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import meta from "../../../../assets/skills/strikes/stomp/stomp.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll } from "../../../parts/parts.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { variationFault, variationMaker, type Varied } from "../../framework/variations.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import { stompExecutor, STOMP_PATH, validStompTuning, type StompTuning } from "./stomp/stomp.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's stomp record. */
    "stomp/stomp": SkillRecords<StompTuning>;
  }
}

/** A stomp's config: its kind, and an experiment's research `tuning`, which a link does not carry. */
interface Config extends Varied {
  readonly kind: "stomp";
  readonly tuning?: Partial<StompTuning>;
}

/** Whether `tuning` holds every stomp setting, each valid (`validStompTuning`). */
const wholeStomp = (tuning: Partial<StompTuning>): boolean => validStompPart(tuning) && Object.keys(STOMP_PATH).every((key) => Object.hasOwn(tuning, key)) && validStompTuning(tuning as StompTuning);

/** Whether each setting `tuning` names is a known one, finite and nonnegative. */
const validStompPart = (tuning: Partial<StompTuning>): boolean =>
  !!tuning && typeof tuning === "object" && !Array.isArray(tuning) && Object.entries(tuning).every(([key, value]) => key in STOMP_PATH && Number.isFinite(value) && value! >= 0);

/** The bilateral stance geometry and observed strike points used by this stomp. */
function stompRefusal(spec: BodySpec): string | null {
  const soles = soleRefusal(spec);
  if (soles) return soles;
  for (const side of SIDES) {
    const segment = spec.segments.find(one => one.name === "foot." + side);
    if (!spec.joints.some(joint => joint.name === "hip." + side) || !segment?.points?.sole || !segment.points.strike
      || !spec.effectors?.some(effector => effector.segment === segment.name))
      return "the stomp needs bilateral named hips and foot effectors with sole and strike points";
  }
  return null;
}

/** The stomp's variations: the stomp (`stomp/`). */
const VARIATIONS = {
  stomp: ({ body, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) =>
    stompExecutor(body, actions.map(a => a.name), tunedSettings(dataOf("stomp/stomp"), body.built.spec, config), aimedPoint(aim)),
};

/**
 * **The stomp** (`stompExecutor`): a stroke of either foot down from a high chamber on a body lying
 * ahead, its settings its body's record (`assets/skills/strikes/stomp/stomp.json`, `dataOf("stomp/stomp")`): a body with none
 * does not throw it. A research `tuning` sets settings over the record's, all of them where the
 * body has none.
 *
 * Where the Warrior's and the Rogue's records differ from `STOMP_PATH`, each is set for a blow down
 * on a body lying ahead, the stroke and window searched on the Strike drill's `stomping` rung
 * (`research/skills/skill-search.mjs`, each row's `made`), the Rogue's `across` and `returnNear`
 * the Warrior's scaled by its stature:
 * - `over` 1 or near it: the chamber over the target, so the stroke comes down on it.
 * - `windup` and `soleTurn` 0: a stroke straight down, the sole level with the pelvis; a turned
 *   sole meets the trunk with its toes.
 * - `lift` higher: a long stroke down, short of where the chamber leaves the hip's reach.
 * - `top` 0.4: the height band low over the sole, a lying body's trunk and never a standing one's.
 * - `alongNear` and `alongFar` further ahead: places where both feet stand clear of a lying
 *   body's splayed limbs.
 * - `contactSpeed` 8 to 10 m/s, `swingSeconds` and `chamberSeconds` under 0.3 s: a fast stroke
 *   down.
 * - `brace` over 0: braced before contact, more mass is behind the foot.
 * - `returnNear` wider: the leg comes to rest short of the chamber after a blow, and a nearer
 *   mark stalls the return.
 *
 * So set, the Warrior's blows at a lying Warrior carry 15 to 52 J on that rung (Node, core world,
 * `rapier-coordinate`, 120 Hz, each command a step late). Braced at contact alone and with a
 * slower stroke (`brace` 0, `contactSpeed` 7 m/s, `swingSeconds` 0.25 s, `chamberSeconds` 0.6 s,
 * `lift` 0.7 m, `over` 1), they carry 9.7 to 26.6 J.
 */
export const STOMP_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Stomp", stage: "experimental", defaults: { kind: "stomp" },
  keys: { kind: true, variation: true, tuning: true }, fields: [], slots: [], tuning: Object.keys(STOMP_PATH),
  fits: fitsAll(variationFault("stomp", "stomp", VARIATIONS), stompRefusal, recordFault("stomp", deepFreeze(meta.bodies), wholeStomp),
    (spec, config) => validStompTuning(tunedSettings(dataOf("stomp/stomp"), spec, config)) ? null : "invalid stomp executor settings"),
  faults: (config) => config.tuning === undefined || validStompPart(config.tuning) ? [] : ["invalid stomp tuning"],
  fitReads: ["stomp/stomp"], reads: () => ["stomp/stomp"], effectors: ["foot.left", "foot.right"], aims: true,
  make: variationMaker("stomp", VARIATIONS),
  skillGroup: "Strikes", variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "stomp": Config;
  }
}
