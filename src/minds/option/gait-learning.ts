import type { Refused } from "../../core/refusal.ts";
import type { MindConfig } from "../catalog/config.ts";
import { withLegs, type OptionMindConfig } from "./config.ts";
import { GOING } from "../../skills/locomotion/move-part.ts";
import { STOCK_GAITS, type Gait } from "../../skills/locomotion/gaits.ts";
import type { ConfigFor } from "../../parts/lookup.ts";

/**
 * **A gait's training adapter**, the counterpart of a strike's (`profileLearningMind`): `preset` on
 * Move's stock gaits (`GOING`), the one called `gait` in learning mode where `steered` (its research
 * `tuning` of `{ steered: true }`: its record's settings, its actor's learner answered by a trainer).
 * Refused for a mind that is no Option Mind or a gait Move has not.
 */
export function gaitLearningMind(preset: MindConfig, request: { readonly gait: string; readonly steered?: true }): MindConfig | Refused {
  if (preset.kind !== "option") return { refused: `${preset.kind} is not an Option Mind` };
  if (!STOCK_GAITS.some((one) => one.name === request.gait)) return { refused: `Move has no gait ${request.gait}: ${STOCK_GAITS.map((one) => one.name).join(", ")}` };
  // The steered gait's own config takes `steered` among its research tuning (`WalkRunConfig.tuning`); a part that lists no such tuning (`Part.tuning`) is refused where the tree is checked.
  const gaits = STOCK_GAITS.map((one): Gait => one.name !== request.gait || !request.steered ? one
    : { ...one, legs: { ...one.legs, tuning: { ...(one.legs as { readonly tuning?: object }).tuning, steered: true } } as ConfigFor<"gait"> });
  return withLegs(preset as OptionMindConfig, { ...GOING, gaits });
}
