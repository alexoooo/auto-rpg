import { PROFILE_MODEL } from "../minds/option/index.ts";
import { standUpFaults } from "../skills/recovery/stand-up.ts";
import { withWaysUp, waysUpIn } from "../minds/option/rise.ts";
import { optionMind } from "../minds/option/index.ts";
import { BASE_OPTIONS } from "./option-defaults.ts";

/** The shared root kind with application defaults for omitted options. */
export const OPTION_MIND = optionMind({ options: BASE_OPTIONS, chooser: { kind: "tree" }, predictions: { kind: "measured" }, navigation: { kind: "visibility-navigation" }, replaceRecovery: withWaysUp,
  recovery: waysUpIn,
  validate: (spec, options, _techniques, parts, model) => {
    if (model !== PROFILE_MODEL) return null;
    const ways = waysUpIn(parts, spec, options);
    const fault = standUpFaults(ways, parts)[0];
    return fault ? `options: ${fault}` : null;
  },
});
