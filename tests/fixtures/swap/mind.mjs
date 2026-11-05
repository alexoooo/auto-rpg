/** Named calibrations narrower than their configurations' physical fit. */
import { OPTION_MIND } from "../../../src/core/option/mind.ts";
import { OPTION_PRESETS } from "../../../src/entrants/option/mind.ts";

const defaults = Object.freeze({ ...OPTION_PRESETS.option.config, kind: "swap:option" });
const unarmed = Object.freeze({ ...defaults,
  options: defaults.options.filter(option => !option.kind.startsWith("strike-") || option.kind === "strike-straight-punch") });

export const SWAP = Object.freeze({
  name: "swap",
  minds: Object.freeze([{ ...OPTION_MIND, label: "Calibration fixture", stage: "experimental", defaults }]),
  presets: Object.freeze({
    "swap-stub": Object.freeze({ label: "Warrior calibration", config: defaults, models: Object.freeze(["workshop-fighter"]) }),
    "swap-unarmed": Object.freeze({ label: "Bare-hand calibration", config: unarmed, models: Object.freeze(["workshop-fighter"]) }),
    "swap-skeleton": Object.freeze({ label: "Skeleton calibration", config: defaults, models: Object.freeze(["crypt-skeleton"]) }),
  }),
});
