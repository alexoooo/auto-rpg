import meta from "../../../../assets/core/stomp.meta.json" with { type: "json" };
import { dataOf } from "../../data/store.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import { text } from "../../parts/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../framework/records.ts";
import { deepFreeze } from "../../state.ts";
import { stompExecutor, STOMP_PATH, validStompTuning, type StompTuning } from "./stomp.ts";

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's stomp record. */
    "stomp": SkillRecords<StompTuning>;
  }
}

/** A stomp's config: its kind and name, and an experiment's research `tuning`, which a link does not carry. */
interface Config {
  readonly kind: "stomp";
  readonly name: string;
  readonly tuning?: Partial<StompTuning>;
}

/** Whether `tuning` holds every stomp setting, each valid (`validStompTuning`). */
const wholeStomp = (tuning: Partial<StompTuning>): boolean => Object.keys(STOMP_PATH).every((key) => key in tuning) && validStompTuning(tuning as StompTuning);

/** Whether each setting `tuning` names is a known one, finite and nonnegative. */
const validStompPart = (tuning: Partial<StompTuning>): boolean =>
  Object.entries(tuning).every(([key, value]) => key in STOMP_PATH && Number.isFinite(value) && value! >= 0);

/**
 * **The stomp** (`stompExecutor`): a stroke of either foot down from a high chamber on a body lying
 * ahead, its settings its body's record (`assets/core/stomp.json`, `dataOf("stomp")`; the Warrior's,
 * [stomp settings](../../../../docs/reference/front-kicks.md#stomp-settings)): a body with none
 * does not throw it. A research `tuning` sets settings over the record's, all of them where the
 * body has none.
 */
export const STOMP_PART: ExecutorPart<Config> = {
  role: "executor", label: "Stomp", stage: "experimental", defaults: { kind: "stomp", name: "stomp" },
  keys: { kind: true, name: true, tuning: true }, fields: [text("name", "Name")], slots: [], tuning: Object.keys(STOMP_PATH),
  fits: fitsAll(strikesWithOneOf("foot.left", "foot.right"), recordFault("stomp", deepFreeze(meta.bodies), wholeStomp)),
  faults: (config) => config.tuning === undefined || validStompPart(config.tuning) ? [] : ["invalid stomp tuning"],
  reads: () => ["stomp"], effectors: ["foot.left", "foot.right"], ...AIMED_ACTIONS,
  make: ({ body, aim }, config, actions) => stompExecutor(body, actions.map(a => a.name), tunedSettings(dataOf("stomp"), body.built.spec, config), aimedPoint(aim)),
};
