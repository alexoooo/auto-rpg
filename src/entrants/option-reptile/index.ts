import type { MindPreset } from "../../core/mind/controller.ts";
import type { FramedOptionMindConfig } from "../../core/option/mind.ts";
import type { Entrant } from "../../core/parts/entrant.ts";
import { QUADRUPED } from "../../core/reptile/config.ts";
import { QUADRUPED_VALUED } from "../../core/reptile/frame.ts";
import { QUADRUPED_OPTIONS } from "../../core/reptile/options.ts";
import { deepFreeze } from "../../core/state.ts";

/** The toolkit's Option Mind over the quadruped's frame, every layer the stock one: by worth, over the quadruped's options. */
const OVER_QUADRUPED: FramedOptionMindConfig = deepFreeze({ kind: "option", frame: QUADRUPED, chooser: QUADRUPED_VALUED.defaults, options: QUADRUPED_OPTIONS });

/**
 * **The Option Reptile**: the toolkit's Option Mind on a second body family, a chooser over the
 * reptile's crawl, bite and righting as option kinds, over the quadruped's frame (`QUADRUPED_FRAME`).
 */
export const OPTION_REPTILE: Entrant = Object.freeze({
  name: "option-reptile",
  presets: deepFreeze({ "option-reptile": { label: "Option Reptile", config: OVER_QUADRUPED, models: ["reptile", "rat"] } } satisfies Record<string, MindPreset>),
});
