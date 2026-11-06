import meta from "../../../assets/skills/strikes/bonk/bonk.meta.json" with { type: "json" };
import { dataOf } from "../../core/data/store.ts";
import { heldBy } from "../../core/bodies/items/held.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import { SUPPORT_REFERENCE } from "../../control/support-reference.ts";
import { MOTOR_PATHS } from "../../control/motor-part.ts";
import { aimedPoint, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../framework/records.ts";
import { handConfigurationRefusal } from "./held-strike.ts";
import { BONK_KEYS, bonkExecutor, validBonk, validBonkPart, type BonkSettings } from "./bonk.ts";
import type { BonkTechnique } from "./bonk-course.ts";

interface Config { readonly kind: "bonk"; readonly tuning?: Partial<BonkSettings> }

declare module "../../core/data/store.ts" {
  interface DataOf { readonly bonk: SkillRecords<BonkSettings> }
}
declare module "../config.ts" {
  interface ExecutorConfigs { readonly bonk: Config }
}
declare module "../framework/executor-part.ts" {
  interface MotionReferences { readonly bonk: { readonly kind: "bonk"; readonly technique: BonkTechnique; readonly preparationFrame: "current"; readonly returning: "brake" } }
}

/** A separate held-club bonk, whose declared course is available to independent physical readers. */
export const BONK_PART: ExecutorPart<Config> = {
  role: "executor", label: "Bonk", stage: "experimental", requires: [SUPPORT_REFERENCE, MOTOR_PATHS], defaults: { kind: "bonk" },
  keys: { kind: true, tuning: true }, tuning: BONK_KEYS, fields: [], slots: [], effectors: ["hand.left", "hand.right"], aims: true, meets: "blunt",
  fits: fitsAll((spec) => handConfigurationRefusal(spec, (spec.held ?? []).map(held => held.segment), "grip"), strikesWithOneOf("hand.left", "hand.right"),
    recordFault("bonk", deepFreeze(meta.bodies), validBonk)),
  faults: config => config.tuning === undefined || validBonkPart(config.tuning) ? [] : ["invalid bonk tuning"],
  reads: () => ["bonk"],
  strikesWith: (spec, _config, effector) => effector === "hand.left" && heldBy(spec, "left") === "club" || effector === "hand.right" && heldBy(spec, "right") === "club",
  reference(spec, config, effector) {
    const settings = tunedSettings(dataOf("bonk"), spec, config);
    return effector === "hand.left" || effector === "hand.right" ? { kind: "bonk", technique: settings.techniques[effector === "hand.left" ? "left" : "right"], preparationFrame: "current", returning: "brake" } : null;
  },
  make({ body, guard, aim }, config, actions) {
    return bonkExecutor(body, guard, actions.map(one => one.name), tunedSettings(dataOf("bonk"), body.built.spec, config), aimedPoint(aim));
  },
};
