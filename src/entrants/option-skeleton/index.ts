import type { ActionConfig, ExecutorEntry } from "../../core/skills/config.ts";
import type { Entrant } from "../../core/parts/entrant.ts";
import { OPTION_MIND, type OptionMindConfig } from "../../core/option/mind.ts";
import { deepFreeze } from "../../core/state.ts";

/** The low front kick, as its body's record has it (`assets/core/front-kick.json`): a trunk below the punch's height band. */
const LOW_KICK: ExecutorEntry = deepFreeze({ name: "low-kick", kind: "front-kick" });

/** **The low kick**: its kick with either foot at the trunk's middle, aimed at its centre. */
const LOW_KICK_ACTION: ActionConfig = deepFreeze({ name: "low-kick", executor: "low-kick", effectors: ["foot.right", "foot.left"],
  regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } });

/**
 * The toolkit's Option Mind (`OPTION_MIND`) with the low kick and the support fold; no straight
 * punch, the Skeleton's body having no punch record (`PunchRecord`).
 */
const SKELETON: OptionMindConfig = deepFreeze({ ...(OPTION_MIND.defaults as OptionMindConfig), support: { kind: "support-fold" },
  executors: [LOW_KICK], actions: [LOW_KICK_ACTION] });

/** **Option Mind for the Skeleton**: one preset of the toolkit's Option Mind, on the Skeleton. */
export const OPTION_SKELETON: Entrant = Object.freeze({
  name: "option-skeleton",
  presets: deepFreeze({ "option-skeleton": { label: "Option Mind — Skeleton", config: SKELETON, models: ["crypt-skeleton"] } }),
});
