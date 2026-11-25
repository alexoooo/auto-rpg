/** Named calibrations narrower than their configurations' physical fit. */
import { optionController } from "../../../../src/minds/option/assembly/controller.ts";
import { optionsOf } from "../../../../src/minds/option/assembly/config.ts";
import { OPTION } from "../../../../src/entrants/option/index.ts";
import { OPTION_KINDS } from "../../../../src/app/registration/option-kinds.ts";
import { partOffered } from "../../../../src/parts/fields.ts";
const OPTION_MIND = optionController({ chooser: { kind: "tree" }, predictions: { kind: "measured" } });

const defaults = Object.freeze({ ...OPTION.presets.option.config, kind: "swap:option" });
const unarmed = Object.freeze({ ...defaults,
  options: Object.values(OPTION_KINDS).filter(part => partOffered(part)).map(part => part.defaults)
    .filter(option => !option.kind.startsWith("strike-") || option.kind === "strike-straight-punch") });

export const SWAP = Object.freeze({
  name: "swap",
  minds: Object.freeze([{ ...OPTION_MIND, label: "Calibration fixture", defaults,
    // This calibration admits held attacks only when its configuration names them; an ablation can widen that declared scope.
    strikes: (spec, config, parts) => optionsOf(config, parts).flatMap(option => parts.of("option", option).strikes?.(spec, option, parts) ?? []),
  }]),
  presets: Object.freeze({
    "swap-stub": Object.freeze({ label: "Warrior calibration", config: defaults, models: Object.freeze(["man"]) }),
    "swap-unarmed": Object.freeze({ label: "Bare-hand calibration", config: unarmed, models: Object.freeze(["man"]) }),
    "swap-skeleton": Object.freeze({ label: "Skeleton calibration", config: defaults, models: Object.freeze(["skeleton"]) }),
  }),
});
