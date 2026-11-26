import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import meta from "../../../../assets/skills/strikes/stomp/stomp.meta.json" with { type: "json" };
import kickMeta from "../../../../assets/skills/strikes/stomp/kick.meta.json" with { type: "json" };
import frontMeta from "../../../../assets/skills/strikes/stomp/front.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { aimedPoint, type ExecutorMaking, type ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import type { Executor, TargetResolver } from "../../framework/action.ts";
import type { Body } from "../../../control/body.ts";
import { executorOf, makersOf, varied, variationReads, variationRecordFault, chosenVariation, type RecordedVariation, type Varied, type Variations } from "../../framework/variations.ts";
import { tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import { stompExecutor, STOMP_PATH, validStompTuning, type StompTuning } from "./stomp/stomp.ts";
import { FRONT_KICK_PATH, frontKickExecutor, kickExecutor, kickRefusal, KICK_PATH, validFrontKickPart, validFrontKickTuning, validKickPart, validKickTuning, wholeFrontKick, wholeKick,
  type FrontKickTuning, type KickTuning } from "../shared/kick.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's stomp record. */
    "stomp/stomp": SkillRecords<StompTuning>;
    /** Every body's low kick record (`assets/skills/strikes/stomp/kick.json`): the kick's settings (`KickTuning`). */
    "stomp/kick": SkillRecords<KickTuning>;
    /** Every body's low front kick record (`assets/skills/strikes/stomp/front.json`): the front kick's settings (`FrontKickTuning`). */
    "stomp/front": SkillRecords<FrontKickTuning>;
  }
}

/**
 * A stomp's config: its kind, and an experiment's research `tuning`, which a link does not carry:
 * the stomp's settings for the stomp, the push kick's for the low kick, the front kick's for the low
 * front kick (`VARIATIONS`).
 */
interface Config extends Varied {
  readonly kind: "stomp";
  readonly tuning?: Partial<StompTuning> | Partial<KickTuning> | Partial<FrontKickTuning>;
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

/**
 * A variation of the stomp: its executor (`executor`) made with the settings of the record of `key`
 * (`S`) on each of `bodies`, a research tuning over them; the body it needs (`refusal`); and whether
 * a research tuning names only its settings (`part`), is whole (`whole`), and its settings are valid (`valid`).
 */
interface StompVariation extends RecordedVariation<(making: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) => Executor> {
  readonly refusal: (spec: BodySpec) => string | null;
  readonly part: (tuning: Config["tuning"]) => boolean;
  readonly whole: (tuning: Config["tuning"]) => boolean;
  readonly valid: (spec: BodySpec, config: Config) => boolean;
}

/** The variation of `executor` by the record of `key` on `bodies` (`StompVariation`). */
function variation<S>(key: "stomp/stomp" | "stomp/kick" | "stomp/front", bodies: readonly string[], executor: (body: Body, actions: readonly string[], settings: S, resolve: TargetResolver) => Executor,
  refusal: (spec: BodySpec) => string | null, part: (tuning: Partial<S>) => boolean, whole: (tuning: Partial<S>) => boolean, valid: (settings: S) => boolean): StompVariation {
  const settings = (spec: BodySpec, config: Config): S => tunedSettings(dataOf(key) as SkillRecords<S>, spec, config as { readonly tuning?: Partial<S> });
  return { reads: [key], bodies, refusal, part: (tuning) => part(tuning as Partial<S>), whole: (tuning) => whole(tuning as Partial<S>), valid: (spec, config) => valid(settings(spec, config)),
    make: ({ body, aim }, config, actions) => executor(body, actions.map((a) => a.name), settings(body.built.spec, config), aimedPoint(aim)) };
}

/**
 * The stomp's variations, each by its own record: the stomp (`stomp/stomp`), a stroke of the foot
 * down from a high chamber; the low kick (`stomp/kick`), the push kick (`kickExecutor`) with its
 * height band low, its foot driven out low at a body lying, as a ball is kicked; and the low front
 * kick (`stomp/front`), the front kick (`frontKickExecutor`) with its height band low, its leg
 * chambered and carried straight through a body lying.
 */
const VARIATIONS: Variations<StompVariation> = {
  stomp: variation("stomp/stomp", deepFreeze(meta.bodies), stompExecutor, stompRefusal, validStompPart, wholeStomp, validStompTuning),
  kick: variation("stomp/kick", deepFreeze(kickMeta.bodies), kickExecutor, kickRefusal, validKickPart, wholeKick, validKickTuning),
  front: variation("stomp/front", deepFreeze(frontMeta.bodies), frontKickExecutor, kickRefusal, validFrontKickPart, wholeFrontKick, validFrontKickTuning),
};

/** The variation of the stomp a body of `spec` runs as `config` names it (`chosenVariation`), or null where it runs no one. */
const variationOf = (spec: BodySpec, config: Config): StompVariation | null => {
  const chosen = chosenVariation(spec, "stomp", config);
  return chosen !== undefined && Object.hasOwn(VARIATIONS, chosen) ? VARIATIONS[chosen]! : null;
};

/**
 * **The stomp**: a strike of either foot at a body lying ahead, by its variation (`VARIATIONS`):
 * the stomp (`stompExecutor`), a stroke down from a high chamber, or the low kick
 * (`kickExecutor`), each with its settings its body's record of it (`dataOf("stomp/<variation>")`):
 * a body with none does not throw it. A research `tuning` sets settings over the record's, all of
 * them where the body has none.
 *
 * The low kick's record is the push kick's (`kick/push`) with its window's height band lowered to
 * a lying body's trunk and the rest searched there (its row's `made`).
 *
 * Where the Warrior's and the Rogue's stomp records differ from `STOMP_PATH`, each is set for a blow down
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
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Stomp", defaults: { kind: "stomp" },
  // A boot from the side, over its sole.
  icon: "M8 2.5h6.5v9.8l4.6 2.5a3 3 0 0 1 1.6 2.6V19H8ZM6.5 20h15v1.8h-15Z",
  keys: { kind: true, variation: true, tuning: true }, fields: [], slots: [], tuning: [...new Set([...Object.keys(STOMP_PATH), ...Object.keys(KICK_PATH), ...Object.keys(FRONT_KICK_PATH)])],
  ...varied({ skill: "stomp", label: "stomp", variations: makersOf(VARIATIONS), of: executorOf, fits: [
    (spec, config) => variationOf(spec, config)?.refusal(spec) ?? null,
    variationRecordFault("stomp", "stomp", VARIATIONS, (tuning: Config["tuning"], name) => VARIATIONS[name]!.whole(tuning)),
    (spec, config) => { const variation = variationOf(spec, config); return variation === null || variation.valid(spec, config) ? null : "invalid stomp executor settings"; }] }),
  faults: (config) => config.tuning === undefined || (config.variation === undefined ? Object.values(VARIATIONS) : Object.hasOwn(VARIATIONS, config.variation) ? [VARIATIONS[config.variation]!] : [])
    .some((variation) => variation.part(config.tuning)) ? [] : ["invalid stomp tuning"],
  fitReads: ["stomp/stomp", "stomp/kick", "stomp/front"], reads: variationReads(VARIATIONS), effectors: ["foot.left", "foot.right"], aims: true,
  asSkill: { group: "Strikes", ends: ["standing"] },
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "stomp": Config;
  }
}
