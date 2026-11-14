import { guardVariations, type GuardPart } from "../../framework/guard.ts";
import { variationFault } from "../../framework/variations.ts";
import { soleRefusal } from "../../../control/support.ts";
import { fitsAll, fitsWhen } from "../../../parts/parts.ts";
import type { ReadBody } from "../../../core/bodies/read-body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { guardPosture } from "../shared/guard.ts";
import { COVERING_TUNING, coveringFaults, coveringFit, coveringSkill, coversWithHands, wardsWithFace, type CoveringConfig } from "../shared/cover.ts";

/** A cover guard that also wards with an item's declared face: held out at the threat no faster than the body's balance allows (`wardSpeed`), turned toward it. */
type ShieldGuardConfig = CoveringConfig<"shield-guard">;

/** The shield guard's variations: the shield guard. */
const VARIATIONS = { "shield-guard": { posture: (spec: BodySpec) => guardPosture(spec), make: (built: ReadBody, config: ShieldGuardConfig) => coveringSkill(built, config, true) } };

export const SHIELD_GUARD: GuardPart<ShieldGuardConfig> = {
  role: "guard", label: "Guard faces and lines", stage: "game", fields: [], slots: [], defaults: { kind: "shield-guard" }, keys: { kind: true, variation: true, tuning: true },
  tuning: COVERING_TUNING, fits: fitsAll(variationFault("shield-guard", "shield guard", VARIATIONS), coveringFit, coversWithHands, soleRefusal,
    fitsWhen(wardsWithFace, "holds no item with a face to ward with")), faults: coveringFaults,
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  ...guardVariations("shield-guard", VARIATIONS),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "shield-guard": ShieldGuardConfig;
  }
}
