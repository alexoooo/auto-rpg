import { CONDITIONS } from "../../intent/conditions.ts";
import { deepFreeze } from "../../state.ts";
import type { GaitName } from "./gaits.ts";
import { distanceRule } from "./move.ts";
import { moveRulePart, withGait } from "./move-rule-part.ts";

/**
 * A rule of Move: while what `of` names is `than` `metres` away, `gait`: the nearest standing
 * foe, where the body's walk is taking it (`Intent.destination`), or the nearest standing body of
 * its own side. Where there is none, it is infinitely far.
 */
interface WhenDistanceConfig {
  readonly kind: "when-distance";
  readonly of: "foe" | "destination" | "ally";
  readonly than: "under" | "over";
  readonly metres: number;
  readonly gait: GaitName;
}

export const WHEN_DISTANCE = deepFreeze(moveRulePart<WhenDistanceConfig>({
  label: "While a distance", defaults: { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" },
  keys: { kind: true, of: true, than: true, metres: true, gait: true },
  fields: withGait(CONDITIONS["when-distance"].fields),
  faults: (config) => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["a rule's distance must be finite and positive"],
  make: (config, gait) => distanceRule(gait, config.of, config.than, config.metres),
}));
