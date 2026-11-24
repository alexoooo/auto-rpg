import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import meta from "../../../../assets/skills/strikes/kick/kick.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { executorOf, varied, type Varied } from "../../framework/variations.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import { kickExecutor, KICK_PATH, validKickTuning, type KickTuning } from "./kick/kick.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's kick record. */
    "kick/kick": SkillRecords<KickTuning>;
  }
}

/** A kick's config: its kind, and an experiment's research `tuning`, which a link does not carry. */
interface Config extends Varied {
  readonly kind: "kick";
  readonly tuning?: Partial<KickTuning>;
}

/** Whether each setting `tuning` names is a known one, and finite. */
const validKickPart = (tuning: Partial<KickTuning>): boolean =>
  !!tuning && typeof tuning === "object" && !Array.isArray(tuning) && Object.entries(tuning).every(([key, value]) => key in KICK_PATH && Number.isFinite(value));

/** Whether `tuning` holds every kick setting, each valid (`validKickTuning`). */
const wholeKick = (tuning: Partial<KickTuning>): boolean => validKickPart(tuning) && Object.keys(KICK_PATH).every((key) => Object.hasOwn(tuning, key)) && validKickTuning(tuning as KickTuning);

/** The soles, hips and foot effectors a kick reads. */
function kickRefusal(spec: BodySpec): string | null {
  const soles = soleRefusal(spec);
  if (soles) return soles;
  for (const side of SIDES) {
    const segment = spec.segments.find((one) => one.name === "foot." + side);
    if (!spec.joints.some((joint) => joint.name === "hip." + side) || !segment?.points?.sole || !spec.effectors?.some((effector) => effector.segment === segment.name))
      return "the kick needs bilateral named hips and foot effectors with sole points";
  }
  return null;
}

/** The kick's variations: the kick (`kick/`). */
const VARIATIONS = {
  kick: ({ body, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) =>
    kickExecutor(body, actions.map((a) => a.name), tunedSettings(dataOf("kick/kick"), body.built.spec, config), aimedPoint(aim)),
};

/**
 * **The kick** (`kickExecutor`): a drive of either foot ahead at a standing body's middle, its
 * settings its body's record (`assets/skills/strikes/kick/kick.json`, `dataOf("kick/kick")`): a
 * body with none does not throw it, and none has one yet. A research `tuning` sets settings over
 * the record's, all of them where the body has none.
 */
export const KICK_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Kick", defaults: { kind: "kick" },
  // A leg driven forward from the hip, its foot ahead.
  icon: "M9 2.5h3.2l1.3 7.2 6.8 3.1a1.8 1.8 0 0 1-.7 3.4H12a3 3 0 0 1-3-3ZM6.5 20h9v1.8h-9Z",
  keys: { kind: true, variation: true, tuning: true }, fields: [], slots: [], tuning: Object.keys(KICK_PATH),
  ...varied({ skill: "kick", label: "kick", variations: VARIATIONS, of: executorOf, fits: [kickRefusal, recordFault("kick", deepFreeze(meta.bodies), wholeKick),
    (spec, config) => validKickTuning(tunedSettings(dataOf("kick/kick"), spec, config)) ? null : "invalid kick executor settings"] }),
  faults: (config) => config.tuning === undefined || validKickPart(config.tuning) ? [] : ["invalid kick tuning"],
  fitReads: ["kick/kick"], reads: () => ["kick/kick"], effectors: ["foot.left", "foot.right"], aims: true,
  skillGroup: "Strikes",
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "kick": Config;
  }
}
