import { commandable } from "../body.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { COMBINATION, combinationExecutor, combinationFits, validCombination } from "./combination.ts";

type Config = Extract<ExecutorConfig, { kind: "combination" }>;
/** A combination owns its body fit and its two straight drives' settings. */
export const COMBINATION_PART: ExecutorPart<Config> = {
  role: "executor", label: "Combination", stage: "game", defaults: { kind: "combination", name: "combination", ...COMBINATION },
  fields: [text("name", "Name")], slots: [], fits: spec => commandable(spec) && combinationFits(spec),
  faults: config => validCombination(config) ? [] : ["invalid combination settings"], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  make(body, _world, config, actions, resolve) {
    const { kind: _, name: __, ...settings } = config;
    return combinationExecutor(body, actions.map(a => a.name), settings, resolve);
  },
};
