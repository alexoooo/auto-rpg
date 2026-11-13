import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import meta from "../../../../assets/skills/strikes/stomp/stomp.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll } from "../../../parts/parts.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { variationFault, variationMaker } from "../../framework/variations.ts";
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
interface Config {
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
 * ahead, its settings its body's record (`assets/skills/strikes/stomp/stomp.json`, `dataOf("stomp/stomp")`; the Warrior's,
 * [stomp settings](../../../../docs/reference/front-kicks.md#stomp-settings)): a body with none
 * does not throw it. A research `tuning` sets settings over the record's, all of them where the
 * body has none.
 */
export const STOMP_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Stomp", stage: "experimental", defaults: { kind: "stomp" },
  keys: { kind: true, tuning: true }, fields: [], slots: [], tuning: Object.keys(STOMP_PATH),
  fits: fitsAll(variationFault("stomp", "stomp", VARIATIONS), stompRefusal, recordFault("stomp", deepFreeze(meta.bodies), wholeStomp),
    (spec, config) => validStompTuning(tunedSettings(dataOf("stomp/stomp"), spec, config)) ? null : "invalid stomp executor settings"),
  faults: (config) => config.tuning === undefined || validStompPart(config.tuning) ? [] : ["invalid stomp tuning"],
  fitReads: ["stomp/stomp"], reads: () => ["stomp/stomp"], effectors: ["foot.left", "foot.right"], aims: true,
  make: variationMaker("stomp", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "stomp": Config;
  }
}
