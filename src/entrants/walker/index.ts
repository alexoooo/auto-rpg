import type { Entrant } from "../../minds/index.ts";
import type { MindPreset } from "../../minds/index.ts";
import type { ConfigFor } from "../../parts/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { BRACE_OPTION, GUARD_OPTION, HOLD_OPTION, RISE_OPTIONS, type WalkConfig } from "../../minds/option/index.ts";
import { deepFreeze } from "../../core/state.ts";

/** The gaits this fighter may walk by, in preference order. */
const WALKS: readonly WalkConfig[] = deepFreeze(["braced", "run", "trot", "crawl"].map((gait) => ({ kind: "walk" as const, gait })));

/** Where it walks to, m on the ground from where it starts: ahead and to its left, so it turns on the way. */
const PLACE = deepFreeze({ x: 2, z: 6 });

/** How near its centre comes to the place to hold there, m. */
const WITHIN = .3;

/**
 * Its options: holding at the place, which names it as its site (`hold-at-place`), the walk to the
 * sites by each gait (`WALKS`), the rise (`RISE_OPTIONS`), and the rest options, with no blow
 * and nothing that answers a foe.
 */
const OPTIONS: readonly ConfigFor<"option">[] = deepFreeze([{ kind: "hold-at-place", ...PLACE, within: WITHIN }, ...WALKS, ...RISE_OPTIONS,
  HOLD_OPTION.defaults, GUARD_OPTION.defaults, BRACE_OPTION.defaults]);

/**
 * The Option framework whose objective is reaching a place (`reach-place`),
 * by worth, looking no further than the option it takes.
 */
const WALKER_CONFIG: OptionMindConfig = deepFreeze({ kind: "option",
  chooser: { kind: "valued", depth: 1, objective: { kind: "reach-place", ...PLACE } }, options: OPTIONS });

/** **The walker**: one preset of the toolkit's Option Mind that fights no one and walks to its place; on no menu but the Lab's. */
export const WALKER: Entrant = Object.freeze({
  name: "walker",
  presets: deepFreeze<Record<string, MindPreset>>({ walker: { label: "Walker", config: WALKER_CONFIG, offered: false } }),
});
