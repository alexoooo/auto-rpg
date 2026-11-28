import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import meta from "../../../../assets/skills/strikes/kick/kick.meta.json" with { type: "json" };
import pushMeta from "../../../../assets/skills/strikes/kick/push.meta.json" with { type: "json" };
import frontMeta from "../../../../assets/skills/strikes/kick/front.meta.json" with { type: "json" };
import steppingMeta from "../../../../assets/skills/strikes/kick/stepping.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { chosenVariation, executorOf, makersOf, varied, variationReads, variationRecordFault, type RecordedVariation, type Varied, type Variations } from "../../framework/variations.ts";
import { tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { Executor, TargetResolver } from "../../framework/action.ts";
import type { Body } from "../../../control/body.ts";
import { FRONT_KICK_PATH, frontKickExecutor, kickExecutor, kickRefusal, KICK_PATH, validFrontKickPart, validFrontKickTuning, validKickPart, validKickTuning, wholeFrontKick, wholeKick,
  type FrontKickTuning, type KickTuning } from "../shared/kick.ts";

/** **The kick's records**, each its variation's own (`kick/<variation>`). */
type KickRecordKey = "kick/kick" | "kick/push" | "kick/front" | "kick/stepping";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's record of the kick its schedule throws (`assets/skills/strikes/kick/kick.json`). */
    "kick/kick": SkillRecords<KickTuning>;
    /** Every body's record of the push kick (`assets/skills/strikes/kick/push.json`). */
    "kick/push": SkillRecords<KickTuning>;
    /** Every body's record of the front kick (`assets/skills/strikes/kick/front.json`). */
    "kick/front": SkillRecords<FrontKickTuning>;
    /** Every body's record of the stepping front kick (`assets/skills/strikes/kick/stepping.json`). */
    "kick/stepping": SkillRecords<FrontKickTuning>;
  }
}

/**
 * A kick's config: its kind, and an experiment's research `tuning`, which a link does not carry:
 * the push kick's settings for the kick and the push kick, the front kick's for the front kick (`VARIATIONS`).
 */
interface Config extends Varied {
  readonly kind: "kick";
  readonly tuning?: Partial<KickTuning> | Partial<FrontKickTuning>;
}

/**
 * A variation of the kick: its executor (`executor`) made with the settings of the record of `key`
 * (`S`) on each of `bodies`, a research tuning over them; whether a research tuning names only its
 * settings (`part`), is whole (`whole`), and its settings are valid (`valid`).
 */
interface KickVariation extends RecordedVariation<(making: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) => Executor> {
  readonly part: (tuning: Config["tuning"]) => boolean;
  readonly whole: (tuning: Config["tuning"]) => boolean;
  readonly valid: (spec: BodySpec, config: Config) => boolean;
}

/** The variation of `executor` by the record of `key` on `bodies` (`KickVariation`). */
function variation<S>(key: KickRecordKey, bodies: readonly string[], executor: (body: Body, actions: readonly string[], settings: S, resolve: TargetResolver) => Executor,
  part: (tuning: Partial<S>) => boolean, whole: (tuning: Partial<S>) => boolean, valid: (settings: S) => boolean): KickVariation {
  const settings = (spec: BodySpec, config: Config): S => tunedSettings(dataOf(key) as SkillRecords<S>, spec, config as { readonly tuning?: Partial<S> });
  return { reads: [key], bodies, part: (tuning) => part(tuning as Partial<S>), whole: (tuning) => whole(tuning as Partial<S>), valid: (spec, config) => valid(settings(spec, config)),
    make: ({ body, aim }, config, actions) => executor(body, actions.map((a) => a.name), settings(body.built.spec, config), aimedPoint(aim)) };
}

/**
 * The kick's variations, each by its own record: the kick (`kick/kick`), its leg thrown up on its
 * schedule; the push kick (`kick/push`), its leg the aimed drive's, folded up and driven out
 * level at the foe's middle; and the front kick (`kick/front`), its leg carried along authored paths,
 * chambered, extended at the target and retracted (`frontKickExecutor`), its height band about
 * its own hip's, where a person's push kick meets a body; and the stepping front kick
 * (`kick/stepping`), the front kick lifting its foot as a step does, once the place its centre is
 * going is over the standing foot (`capture`), not once the centre stands still over it.
 */
const VARIATIONS: Variations<KickVariation> = {
  kick: variation("kick/kick", deepFreeze(meta.bodies), kickExecutor, validKickPart, wholeKick, validKickTuning),
  push: variation("kick/push", deepFreeze(pushMeta.bodies), kickExecutor, validKickPart, wholeKick, validKickTuning),
  front: variation("kick/front", deepFreeze(frontMeta.bodies), frontKickExecutor, validFrontKickPart, wholeFrontKick, validFrontKickTuning),
  stepping: variation("kick/stepping", deepFreeze(steppingMeta.bodies), frontKickExecutor, validFrontKickPart, wholeFrontKick, validFrontKickTuning),
};

/** The variation of the kick a body of `spec` runs as `config` names it (`chosenVariation`), or null where it runs no one. */
const variationOf = (spec: BodySpec, config: Config): KickVariation | null => {
  const chosen = chosenVariation(spec, "kick", config);
  return chosen !== undefined && Object.hasOwn(VARIATIONS, chosen) ? VARIATIONS[chosen]! : null;
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
  keys: { kind: true, variation: true, tuning: true }, fields: [], slots: [], tuning: [...new Set([...Object.keys(KICK_PATH), ...Object.keys(FRONT_KICK_PATH)])],
  ...varied({ skill: "kick", label: "kick", variations: makersOf(VARIATIONS), of: executorOf, fits: [kickRefusal, variationRecordFault("kick", "kick", VARIATIONS, (tuning: Config["tuning"], name) => VARIATIONS[name]!.whole(tuning)),
    (spec, config) => { const variation = variationOf(spec, config); return variation === null || variation.valid(spec, config) ? null : "invalid kick executor settings"; }] }),
  faults: (config) => config.tuning === undefined || (config.variation === undefined ? Object.values(VARIATIONS) : Object.hasOwn(VARIATIONS, config.variation) ? [VARIATIONS[config.variation]!] : [])
    .some((variation) => variation.part(config.tuning)) ? [] : ["invalid kick tuning"],
  fitReads: ["kick/kick", "kick/push", "kick/front", "kick/stepping"], reads: variationReads(VARIATIONS), effectors: ["foot.left", "foot.right"], aims: true,
  asSkill: { group: "Strikes", ends: ["standing"] },
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "kick": Config;
  }
}
