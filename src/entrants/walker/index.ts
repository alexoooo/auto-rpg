import type { Entrant } from "../../core/parts/entrant.ts";
import type { MindPreset } from "../../core/mind/controller.ts";
import type { PartConfig } from "../../core/parts/parts.ts";
import { OPTION_MIND, type OptionMindConfig } from "../../core/option/mind.ts";
import { GUARD_OPTION, HOLD_OPTION, WALK_OPTION } from "../../core/option/kinds.ts";
import { BRACE_OPTION, RISE_OPTIONS } from "../../core/option/rise.ts";
import { deepFreeze } from "../../core/state.ts";

/** Where it walks to, m on the ground from where it starts: ahead and to its left, so it turns on the way. */
const PLACE = deepFreeze({ x: 2, z: 6 });

/** How near its centre comes to the place to hold there, m. */
const WITHIN = .3;

/**
 * Its options: holding at the place, which names it as its site (`hold-at-place`), the walk to the
 * sites by each gait (`WALK_OPTION`), the rise (`RISE_OPTIONS`), and the rest options, with no blow
 * and nothing that answers a foe.
 */
const OPTIONS: readonly PartConfig[] = deepFreeze([{ kind: "hold-at-place", ...PLACE, within: WITHIN }, WALK_OPTION.defaults, ...RISE_OPTIONS,
  HOLD_OPTION.defaults, GUARD_OPTION.defaults, BRACE_OPTION.defaults]);

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
