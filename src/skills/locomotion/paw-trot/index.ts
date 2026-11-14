import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { ReadBody, ReadSegment } from "../../../core/bodies/read-body.ts";
import { REPTILE_TROT } from "../shared/quadruped/tuning.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type PawGaitPart } from "../shared/quadruped/parts.ts";
import type { PawReading } from "../../../control/quadruped/paws.ts";
import { trot, validTrot } from "./paw-trot/trot.ts";

/** **The trot**'s config: research settings over `REPTILE_TROT`, none in the game. */
interface TrotConfig extends Varied { readonly kind: "paw-trot"; readonly tuning?: Partial<typeof REPTILE_TROT> }

/** The trot's variations: the trot. */
const VARIATIONS = {
  "paw-trot"(built: ReadBody, root: ReadSegment, paws: PawReading, names: readonly string[], config: TrotConfig) {
    const settings = { ...REPTILE_TROT, ...config.tuning }, skill = trot(built, root, paws, names, settings);
    // It carries the body forward at its speed, no faster than its stance's sweep lets it; aside and back at what it keeps of travel across its heading.
    const reach = { forward: Math.min(settings.speed, skill.fastest), aside: settings.sideways, turn: settings.turnRate };
    return { state: skill.state, settings, reach, travel: { speed: settings.speed, stopping: settings.acceleration }, resume: skill.resume, command: skill.command };
  },
};

/** **The trot** as a gait: the quadruped's travel. */
export const TROT_PART = deepFreeze<PawGaitPart<TrotConfig>>({
  role: "paw-gait", label: "Trot", stage: "game", fields: [], slots: [], defaults: { kind: "paw-trot" }, keys: { kind: true, variation: true, tuning: true },
  tuning: Object.keys(REPTILE_TROT), fits: (spec, config) => variationFault("paw-trot", "trot", VARIATIONS)(spec, config)
    ?? fitsPaws(spec) ?? (validTrot({ ...REPTILE_TROT, ...config.tuning }) ? null : "invalid trot settings"),
  faults: (config: TrotConfig) => config.tuning === undefined || !!config.tuning && typeof config.tuning === "object" && !Array.isArray(config.tuning)
    && validTrot({ ...REPTILE_TROT, ...config.tuning }) ? [] : ["invalid trot settings"],
  make: variedMake("paw-trot", VARIATIONS, (built, _root, _paws, _names, config) => [built.spec, config]),
  skillGroup: "Travel", variations: Object.keys(VARIATIONS),
});

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-trot": TrotConfig;
  }
}
