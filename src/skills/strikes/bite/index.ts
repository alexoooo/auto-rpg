import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import type { ExecutorMaking, ExecutorPart } from "../../framework/executor-part.ts";
import type { ActionConfig } from "../../config.ts";
import { fitsAll } from "../../../parts/parts.ts";
import { variationFault, variationMaker } from "../../framework/variations.ts";
import { biteExecutor, biteSettings, BITE_SETTINGS, fitsBite, validBite, type BiteTuning } from "./bite/bite.ts";
import { jawOf } from "./jaw.ts";

/** **The bite**'s config: its kind, and an experiment's research `tuning` over its body's record, which a link does not carry. */
interface Config {
  readonly kind: "bite";
  readonly tuning?: Partial<BiteTuning>;
}

/** The bite's variations: the bite (`bite/`). */
const VARIATIONS = {
  bite: ({ body, aim }: ExecutorMaking, config: Config, actions: readonly ActionConfig[]) =>
    biteExecutor(body, actions.map((action) => action.name), biteSettings(body.built.spec, config), aim),
};

/**
 * **The bite** (`biteExecutor`): a stroke of the jaw of a body with one (`fitsJaw`), struck with its
 * head, which carries it, at a point its aim gives; its teeth pierce (`meets` "point").
 */
export const BITE_PART: ExecutorPart<Config> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Bite", stage: "game", defaults: { kind: "bite" }, keys: { kind: true, tuning: true }, fields: [], slots: [],
  tuning: [...BITE_SETTINGS], fits: fitsAll(variationFault("bite", "bite", VARIATIONS), fitsBite), fitReads: ["bite/bite"], reads: () => ["bite/bite"],
  faults: (config) => config.tuning === undefined || validBite(config.tuning) ? [] : ["invalid bite tuning"],
  effectors: ["head"], aims: true, meets: "point",
  strikesWith: (spec, _config, effector) => jawOf(spec).head.name === effector,
  make: variationMaker("bite", VARIATIONS),
  variations: Object.keys(VARIATIONS),
};

declare module "../../config.ts" {
  interface ExecutorConfigs {
    readonly "bite": Config;
  }
}
