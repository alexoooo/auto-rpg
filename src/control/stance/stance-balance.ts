import { validGaitTuning, type StanceTuning } from "./stance-tuning.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";
import type { BalancePart } from "../balance-part.ts";
import { stanceControl } from "./stance.ts";
import { soleRefusal, standingHeight } from "../support.ts";
import type { StanceEnvelope } from "./stance-envelope.ts";

/**
 * **The stance** (`stanceControl`): the centre of mass carried over two feet, stepping to catch it;
 * with a research `tuning`, which a link does not carry, those settings in place of its body's
 * calibration's, as a mind's config carries them into a drill (`OptionMindConfig.tuning.parts.motor`).
 */
interface StanceBalanceConfig { readonly kind: "stance"; readonly tuning?: StanceTuning }

/** A part's `fits` for a body the stance stands: a left and a right foot, each with a box sole (`soleRefusal`). */
export function fitsSoles(spec: BodySpec): string | null {
  return soleRefusal(spec);
}

/** Whether `config` tunes the stance: a research tuning with a setting in it. */
const tuned = (config: StanceBalanceConfig): boolean => Object.keys(config.tuning ?? {}).length > 0;

/**
 * **The stance** as a balance: the game's. A tuned stance, by its config or an experiment's, was not
 * measured, so it reads no envelope, as the envelope's own measurement reads none.
 */
export const stanceBalance = (envelope: (spec: BodySpec) => StanceEnvelope | null, calibration?: (spec: BodySpec) => StanceTuning): BalancePart<StanceBalanceConfig> => deepFreeze<BalancePart<StanceBalanceConfig>>({
  role: "balance", label: "Stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance" }, keys: { kind: true, tuning: true },
  tuning: ["seconds", "track", "soleMargin", "kneeBend", "ankleSpare", "supportInset", "recovery", "gait", "heelOff"],
  reference: { fits: fitsSoles, read: standingHeight },
  fits: fitsSoles,
  faults: (config) => config.tuning === undefined ? []
    : typeof config.tuning !== "object" || config.tuning === null || Array.isArray(config.tuning) ? ["a stance's tuning is a record of its settings (`StanceTuning`)"]
    : config.tuning.gait !== undefined && !validGaitTuning(config.tuning.gait) ? ["a stance's tuned gait gives every setting of a walk's steps, each valid"] : [],
  make: (config) => (built, tuning, assist) => stanceControl(built, { ...calibration?.(built.spec), ...config.tuning, ...tuning }, assist),
  envelope: (spec, config, experiment) => !experiment.measuring && !tuned(config) && Object.keys(experiment.stance ?? {}).length === 0 ? envelope(spec) : null,
});

declare module "../balance-part.ts" {
  interface BalanceConfigs {
    readonly stance: StanceBalanceConfig;
  }
}
