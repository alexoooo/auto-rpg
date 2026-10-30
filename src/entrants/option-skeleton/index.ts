import type { Entrant } from "../../core/parts/entrant.ts";
import { SKELETON_GUARD } from "./guard.ts";
import { SKELETON_OPTION_MIND, SKELETON_OPTION_PRESETS } from "./mind.ts";
import { RANKED_CHOOSER, VALUED_CHOOSER } from "./options/chooser.ts";
import { OPTION_KINDS } from "./options/kinds.ts";
import { FEW_TERMS_PART } from "./options/position.ts";
import { MEASURED_PREDICTIONS, PRIOR_PREDICTIONS } from "./options/predictions-part.ts";

/** **Option Mind for the Skeleton**: its own mind, choosers, options, position value, predictions and guard. */
export const OPTION_SKELETON: Entrant = Object.freeze({
  name: "option-skeleton", minds: [SKELETON_OPTION_MIND],
  parts: [VALUED_CHOOSER, RANKED_CHOOSER, ...OPTION_KINDS, FEW_TERMS_PART, MEASURED_PREDICTIONS, PRIOR_PREDICTIONS, SKELETON_GUARD], presets: SKELETON_OPTION_PRESETS,
});
