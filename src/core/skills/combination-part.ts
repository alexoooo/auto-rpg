import { takesCommands, fitsAll, fitsWhen } from "../mind/parts.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { COMBINATION, combinationExecutor, combinationFits, validCombination } from "./combination.ts";
import { holdsNothing } from "./strikes.ts";

type Config = Extract<ExecutorConfig, { kind: "combination" }>;
/** A combination owns its body fit and its two straight drives' settings. */
export const COMBINATION_PART: ExecutorPart<Config> = {
  role: "executor", label: "Combination", stage: "game", defaults: { kind: "combination", name: "combination", ...COMBINATION },
  fields: [text("name", "Name")], slots: [], fits: fitsAll(takesCommands, fitsWhen(combinationFits, "needs both arms on the upper trunk and a thoracic joint")),
  faults: config => validCombination(config) ? [] : ["invalid combination settings"], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  // Its punches are thrown by hands that hold nothing: of two drives, the hand asked for and the other.
  strikesWith: (spec, config, effector) => config.drives === 2 ? holdsNothing(spec, "hand.left") && holdsNothing(spec, "hand.right") : holdsNothing(spec, effector),
  make(body, _world, config, actions, resolve) {
    const { kind: _, name: __, ...settings } = config;
    return combinationExecutor(body, actions.map(a => a.name), settings, resolve);
  },
};
