import { heldVariation, variationFault, type Varied, type Variations } from "../../framework/variations.ts";
import { fitsAll } from "../../../parts/parts.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { BalancePart } from "../../../control/balance-part.ts";
import { stanceControl } from "../../../control/stance/stance.ts";
import { validGaitTuning, type StanceTuning } from "../../../control/stance/stance-tuning.ts";
import { fitsSoles, standingHeight } from "../../../control/support.ts";
import { stanceCalibration } from "../shared/stance/calibration.ts";
import { stanceEnvelope } from "../shared/stance/envelope.ts";

/**
 * **The stance** (`stanceControl`): the centre of mass carried over two feet, stepping to catch it;
 * with a research `tuning`, which a link does not carry, those settings in place of its body's
 * calibration's and its variation's, as a mind's config carries them into a drill
 * (`OptionMindConfig.tuning.parts.motor`).
 */
interface StanceBalanceConfig extends Varied { readonly kind: "stance"; readonly tuning?: StanceTuning }

/**
 * The stance's variations, each the settings it runs over its body's calibration (`StanceTuning`):
 * the stance as it is calibrated. How its walk steps is a gait's (`GaitTuning`), not a stance's.
 */
const VARIATIONS: Variations<StanceTuning> = deepFreeze({ stance: {} });

/** Whether `config` tunes the stance: a research tuning with a setting in it. */
const tuned = (config: StanceBalanceConfig): boolean => Object.keys(config.tuning ?? {}).length > 0;

/**
 * **The stance** as a balance, the game's, in the variation its body's character holds
 * (`heldVariation`). Each variation reads the one envelope, measured on the stance as it is
 * calibrated (`stanceEnvelope`). A tuned stance, by its config or an experiment's, was not
 * measured, so it reads no envelope, as the envelope's own measurement reads none.
 */
export const STANCE_BALANCE = deepFreeze<BalancePart<StanceBalanceConfig>>({
  role: "balance", label: "Stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance" }, keys: { kind: true, variation: true, tuning: true },
  tuning: ["seconds", "track", "soleMargin", "kneeBend", "ankleSpare", "supportInset", "recovery", "gait", "heelOff"],
  reference: { fits: fitsSoles, read: standingHeight },
  fits: fitsAll(fitsSoles, variationFault("stance", "stance", VARIATIONS)),
  faults: (config) => config.tuning === undefined ? []
    : typeof config.tuning !== "object" || config.tuning === null || Array.isArray(config.tuning) ? ["a stance's tuning is a record of its settings (`StanceTuning`)"]
    : config.tuning.gait !== undefined && !validGaitTuning(config.tuning.gait) ? ["a stance's tuned gait gives every setting of a walk's steps, each valid"] : [],
  make: (config) => (built, tuning, assist) =>
    stanceControl(built, { ...stanceCalibration(built.spec.model), ...heldVariation(built.spec, "stance", config, VARIATIONS), ...config.tuning, ...tuning }, assist),
  envelope: (spec, config, experiment) => !experiment.measuring && !tuned(config) && Object.keys(experiment.stance ?? {}).length === 0 ? stanceEnvelope(spec) : null,
  skillGroup: "Balance", variations: Object.keys(VARIATIONS),
});

declare module "../../../control/balance-part.ts" {
  interface BalanceConfigs {
    readonly stance: StanceBalanceConfig;
  }
}
