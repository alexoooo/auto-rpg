import type { Entrant } from "../../core/parts/entrant.ts";
import type { MindPreset } from "../../core/mind/controller.ts";
import type { PartConfig } from "../../core/parts/parts.ts";
import { OPTION_MIND, type OptionMindConfig } from "../../core/option/mind.ts";
import { deepFreeze } from "../../core/state.ts";

/** Where it walks to, m on the ground from where it starts: ahead and to its left, so it turns on the way. */
const PLACE = deepFreeze({ x: 2, z: 6 });

/** How near its centre comes to the place to have reached it, m. */
const WITHIN = .3;

/**
 * Its options: walking to the place by each gait, the rise, and the rest options, with no blow and
 * nothing that answers a foe.
 */
const OPTIONS: readonly PartConfig[] = deepFreeze([{ kind: "walk-to-place", ...PLACE, within: WITHIN }, { kind: "rise" }, { kind: "hold-position" }, { kind: "hands-at-guard" }, { kind: "brace" }]);

/**
 * The toolkit's Option Mind (`OPTION_MIND`) whose objective is reaching a place (`reach-place`),
 * by worth, looking no further than the option it takes.
 */
const WALKER_CONFIG: OptionMindConfig = deepFreeze({ ...(OPTION_MIND.defaults as OptionMindConfig),
  chooser: { kind: "valued", depth: 1, objective: { kind: "reach-place", ...PLACE } }, options: OPTIONS });

/** **The walker**: one preset of the toolkit's Option Mind that fights no one and walks to its place; on no menu but the Lab's. */
export const WALKER: Entrant = Object.freeze({
  name: "walker",
  presets: deepFreeze<Record<string, MindPreset>>({ walker: { label: "Walker", config: WALKER_CONFIG, offered: false } }),
});
