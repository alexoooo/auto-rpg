import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/kick/kick.meta.json" with { type: "json" };
import pushMeta from "../../../../assets/skills/strikes/kick/push.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { chosenVariation, executorOf, makersOf, varied, variationReads, variationRecordFault, type RecordedVariation, type Varied, type Variations } from "../../framework/variations.ts";
import { tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import { kickExecutor, kickRefusal, KICK_PATH, validKickPart, validKickTuning, wholeKick, type KickTuning } from "../shared/kick.ts";

/** **The kick's records**, each its variation's own (`kick/<variation>`). */
type KickRecordKey = "kick/kick" | "kick/push";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's record of the kick its schedule throws (`assets/skills/strikes/kick/kick.json`). */
    "kick/kick": SkillRecords<KickTuning>;
    /** Every body's record of the push kick (`assets/skills/strikes/kick/push.json`). */
    "kick/push": SkillRecords<KickTuning>;
  }
}

/** A kick's config: its kind, and an experiment's research `tuning`, which a link does not carry. */
interface Config extends Varied {
  readonly kind: "kick";
  readonly tuning?: Partial<KickTuning>;
}

/** A variation of the kick: the kick as the record of `key` has it on each of `bodies`. */
const variation = (key: KickRecordKey, bodies: readonly string[]): RecordedVariation<(making: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) => ReturnType<typeof kickExecutor>> & { readonly key: KickRecordKey } => ({
  key, reads: [key], bodies,
  make: ({ body, aim }, config, actions) => kickExecutor(body, actions.map((a) => a.name), tunedSettings(dataOf(key), body.built.spec, config), aimedPoint(aim)),
});

/**
 * The kick's variations, each by its own record: the kick (`kick/kick`), its leg thrown up on its
 * schedule; and the push kick (`kick/push`), its leg the aimed drive's, folded up and driven out
 * level at the foe's middle.
 */
const VARIATIONS: Variations<ReturnType<typeof variation>> = {
  kick: variation("kick/kick", deepFreeze(meta.bodies)),
  push: variation("kick/push", deepFreeze(pushMeta.bodies)),
};

/** The record the kick runs on a body of `spec` as `config` names it (`chosenVariation`), or null where it runs no one. */
const recordOf = (spec: BodySpec, config: Config): SkillRecords<KickTuning> | null => {
  const chosen = chosenVariation(spec, "kick", config);
  return chosen !== undefined && Object.hasOwn(VARIATIONS, chosen) ? dataOf(VARIATIONS[chosen]!.key) : null;
};

/**
 * **The kick** (`kickExecutor`): a drive of either foot ahead at a standing body's middle, its
 * settings its body's record of its variation (`VARIATIONS`): a body with none does not throw it.
 * A research `tuning` sets settings over the record's, all of them where the body has none.
 */
export const KICK_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Kick", defaults: { kind: "kick" },
  // A leg driven forward from the hip, its foot ahead.
  icon: "M9 2.5h3.2l1.3 7.2 6.8 3.1a1.8 1.8 0 0 1-.7 3.4H12a3 3 0 0 1-3-3ZM6.5 20h9v1.8h-9Z",
  keys: { kind: true, variation: true, tuning: true }, fields: [], slots: [], tuning: Object.keys(KICK_PATH),
  ...varied({ skill: "kick", label: "kick", variations: makersOf(VARIATIONS), of: executorOf, fits: [kickRefusal, variationRecordFault("kick", "kick", VARIATIONS, wholeKick),
    (spec, config) => { const records = recordOf(spec, config); return records === null || validKickTuning(tunedSettings(records, spec, config)) ? null : "invalid kick executor settings"; }] }),
  faults: (config) => config.tuning === undefined || validKickPart(config.tuning) ? [] : ["invalid kick tuning"],
  fitReads: ["kick/kick", "kick/push"], reads: variationReads(VARIATIONS), effectors: ["foot.left", "foot.right"], aims: true,
  asSkill: { group: "Strikes", ends: ["standing"] },
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "kick": Config;
  }
}
