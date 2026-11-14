import { guardVariations, type GuardPart } from "../../framework/guard.ts";
import { variationFault } from "../../framework/variations.ts";
import { fitsAll } from "../../../parts/parts.ts";
import type { ReadBody } from "../../../core/bodies/read-body.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { guardPosture } from "../shared/guard.ts";
import { COVERING_TUNING, coveringFaults, coveringFit, coveringSkill, coversWithHands, type CoveringConfig } from "../shared/cover.ts";

/** **The cover guard**: the arms' posture (`guardPosture`), and a guarding hand's cover of what the mind names (`guardSkill`). */
type CoverGuardConfig = CoveringConfig<"cover-guard">;

/** The cover guard's variations: the cover guard. */
const VARIATIONS = { "cover-guard": { posture: (spec: BodySpec) => guardPosture(spec), make: (built: ReadBody, config: CoverGuardConfig) => coveringSkill(built, config, false) } };

export const COVER_GUARD: GuardPart<CoverGuardConfig> = {
  covering: true,
  role: "guard", label: "Guard and cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-guard" }, keys: { kind: true, variation: true, tuning: true },
  tuning: COVERING_TUNING, fits: fitsAll(variationFault("cover-guard", "guard and cover", VARIATIONS), coveringFit, coversWithHands), faults: coveringFaults,
  supportedEquipment: (spec) => (spec.held ?? []).filter(({ item }) => item.cover !== undefined).map(({ segment }) => segment),
  skillGroup: "Guard", ...guardVariations("cover-guard", VARIATIONS),
};

declare module "../../config.ts" {
  interface GuardConfigs {
    readonly "cover-guard": CoverGuardConfig;
  }
}
