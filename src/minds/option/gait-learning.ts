import type { Refused } from "../../core/refusal.ts";
import type { MindConfig } from "../catalog/config.ts";
import { withLegs, type OptionMindConfig } from "./config.ts";
import { GOING } from "../../skills/locomotion/move/index.ts";
import { STOCK_GAITS, type Gait } from "../../skills/locomotion/move/gaits.ts";
import type { ConfigFor } from "../../parts/lookup.ts";
import type { StanceTuning } from "../../control/stance/stance-tuning.ts";

/**
 * **A gait given research settings**: `preset` on Move's stock gaits (`GOING`), the one called
 * `gait` given `tuning` over its own research tuning (`WalkRunConfig.tuning` for the run), as a
 * search over a gait's settings scores it in a drill. A gait Move has not is refused; a setting the
 * gait's part does not list is a fault where the tree is checked (`Part.tuning`).
 */
export function withGaitTuning(preset: OptionMindConfig, gait: string, tuning: object): OptionMindConfig | Refused {
  if (!STOCK_GAITS.some((one) => one.name === gait)) return { refused: `Move has no gait ${gait}: ${STOCK_GAITS.map((one) => one.name).join(", ")}` };
  const gaits = STOCK_GAITS.map((one): Gait => one.name !== gait ? one
    : { ...one, legs: { ...one.legs, tuning: { ...(one.legs as { readonly tuning?: object }).tuning, ...tuning } } as ConfigFor<"gait"> });
  return withLegs(preset, { ...GOING, gaits });
}

/**
 * **A stance given research settings**: `preset` on the whole-body motor whose balance is the
 * stance, `tuning` over its body's calibration (`stanceBalance`), as a search over the stance's
 * settings scores it in a drill.
 */
export const withStanceTuning = (preset: OptionMindConfig, tuning: StanceTuning): OptionMindConfig =>
  ({ ...preset, tuning: { ...preset.tuning, parts: { ...preset.tuning?.parts, motor: { kind: "whole-body", balance: { kind: "stance", tuning } } } } });

/**
 * **A gait's training adapter**, the counterpart of a strike's (`profileLearningMind`): `preset` on
 * Move's stock gaits, the one called `gait` in learning mode where `steered` (its research `tuning`
 * of `{ steered: true }`: its record's settings, its actor's learner answered by a trainer).
 * Refused for a mind that is no Option Mind or a gait Move has not.
 */
export function gaitLearningMind(preset: MindConfig, request: { readonly gait: string; readonly steered?: true }): MindConfig | Refused {
  if (preset.kind !== "option") return { refused: `${preset.kind} is not an Option Mind` };
  return withGaitTuning(preset as OptionMindConfig, request.gait, request.steered ? { steered: true } : {});
}
