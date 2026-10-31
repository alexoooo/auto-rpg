import type { Entrant } from "../../core/parts/entrant.ts";
import { OPTION_MIND, type OptionMindConfig } from "../../core/option/mind.ts";
import { deepFreeze } from "../../core/state.ts";
import { RECOVERY_ACTIONS, RECOVERY_EXECUTOR } from "./executor.ts";
import { RECOVERY_OPTIONS } from "./options.ts";

const config: OptionMindConfig = deepFreeze({ ...OPTION_MIND.defaults as OptionMindConfig,
  chooser: { kind: "ranked", depth: 1 }, support: null,
  options: [...RECOVERY_OPTIONS.map(part => part.defaults), { kind: "orders" }, { kind: "hold-position" }, { kind: "hands-at-guard" }],
  executors: [RECOVERY_EXECUTOR.defaults],
  actions: Object.values(RECOVERY_ACTIONS).map(name => ({ name, executor: RECOVERY_EXECUTOR.defaults.name, effectors: ["foot.left"] })),
});

/** Separately selected Option Minds using the entrant's new recovery actions. */
export const RISER: Entrant = deepFreeze({ name: "riser", parts: [RECOVERY_EXECUTOR, ...RECOVERY_OPTIONS], presets: {
  "riser-rogue": { label: "Option Mind · new rise (experimental)", config, models: ["workshop-rogue"] },
  "riser-skeleton": { label: "Option Mind · new rise (experimental)", config, models: ["crypt-skeleton"] },
} });
