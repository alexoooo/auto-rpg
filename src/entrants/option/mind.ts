import type { MindPreset } from "../../minds/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { deepFreeze } from "../../core/state.ts";

/**
 * Its Option configuration names no Options, so it fights by every one registered (`optionsOf`),
 * of which a body offers those whose skill it fits, with the limbs it has (`skillsOf`). It decides
 * at 60 Hz, every other control step (`OptionMindConfig.rate`), where its strike and gait profiles
 * are measured.
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree" }, rate: 60 });

/**
 * Its config, on any body it fits, for fights and for measuring its profiles; and the drills' mind
 * (`option-drill`), on no menu: on its priors (`PRIOR_PREDICTIONS`), its
 * options run by their rank (`RANKED_CHOOSER`), nothing priced, searched or drawn. A drill (the
 * table's cells, their opponents, a skill's search) drives a skill fast and the same each time, and
 * no profile decides what its mind does there.
 */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
  "option-drill": { label: "Option Mind for drills", config: { ...OPTION_DEFAULTS, chooser: { kind: "ranked" }, predictions: { kind: "prior" } }, offered: false },
});
