/** Named calibrations narrower than their configurations' physical fit. */
import { optionMind } from "../../../../src/minds/option/mind.ts";
import { OPTION } from "../../../../src/entrants/option/index.ts";
const OPTION_MIND = optionMind({ options: OPTION.presets.option.config.options, chooser: { kind: "tree" }, predictions: { kind: "measured" } });

const defaults = Object.freeze({ ...OPTION.presets.option.config, kind: "swap:option" });
const unarmed = Object.freeze({ ...defaults,
  options: defaults.options.filter(option => !option.kind.startsWith("strike-") || option.kind === "strike-straight-punch") });

export const SWAP = Object.freeze({
  name: "swap",
  minds: Object.freeze([{ ...OPTION_MIND, label: "Calibration fixture", stage: "experimental", defaults,
    // This calibration admits held attacks only when its configuration names them; an ablation can widen that declared scope.
    strikes: (spec, config, parts) => (config.options ?? []).flatMap(option => parts.of("option", option).strikes?.(spec, option, parts) ?? []),
  }]),
  presets: Object.freeze({
    "swap-stub": Object.freeze({ label: "Warrior calibration", config: defaults, models: Object.freeze(["man"]) }),
    "swap-unarmed": Object.freeze({ label: "Bare-hand calibration", config: unarmed, models: Object.freeze(["man"]) }),
    "swap-skeleton": Object.freeze({ label: "Skeleton calibration", config: defaults, models: Object.freeze(["skeleton"]) }),
  }),
});
