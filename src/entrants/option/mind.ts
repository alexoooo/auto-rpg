import type { MindPreset } from "../../minds/index.ts";
import type { OptionMindConfig } from "../../minds/option/index.ts";
import { BASE_OPTIONS as OPTIONS, BITE_OPTION, BONK_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION, type StrikeConfig } from "../../minds/option/index.ts";
import type { ConfigFor } from "../../parts/index.ts";
import { deepFreeze } from "../../core/state.ts";

/** Its low support, under every blow of its hands: the support fold. */
const SUPPORT: ConfigFor<"support"> = deepFreeze({ kind: "support-fold" });

/**
 * **The straight punch** (`assets/skills/strikes/straight-punch/drive.json`, the Warrior's trained): with
 * either hand at the trunk's opening, aimed as the learned puncher aims, from its low support.
 */
const STRAIGHT_PUNCH: StrikeConfig = deepFreeze({ ...STRAIGHT_PUNCH_OPTION.defaults,
  aim: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } }, support: SUPPORT });

/**
 * **The sword's thrust**, as its body's record has it (`assets/skills/strikes/sword-thrust/drive.json`):
 * with the hand that holds the sword, aimed at the trunk's opening as the straight punch is.
 */
const THRUST: StrikeConfig = deepFreeze({ ...SWORD_THRUST_OPTION.defaults, aim: STRAIGHT_PUNCH.aim, support: SUPPORT });

/** **The bonk**: the club swung overhead at the head, with the hand that holds the club, as its Option's defaults have it. */
const BONK: StrikeConfig = BONK_OPTION.defaults;

/**
 * **The stomp** (`assets/skills/strikes/stomp/stomp.json`): its chamber high over the target, its height band low,
 * so it strikes down on a body lying ahead and nothing standing; with either foot at the trunk's
 * middle, aimed at its centre.
 */
const STOMP: StrikeConfig = STOMP_OPTION.defaults;

/** **The bite**, with the jaw, at any part of a foe, aimed at the first surface its teeth meet as the jaw closes (`first-exposed`). */
const BITE: StrikeConfig = deepFreeze({ ...BITE_OPTION.defaults, regions: [{ kind: "mark", mark: "any" }], aim: { kind: "first-exposed" } });

/**
 * Its Option configuration starts with every blow (the straight punch, the
 * thrust, the bonk, the stomp and the bite) after following orders, then the standard options (`OPTIONS`). A body
 * offers those whose skill it fits, with the limbs it has (`skillsOf`). It decides at 60 Hz, every
 * other control step (`OptionMindConfig.rate`), where its strike and gait profiles are measured.
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ kind: "option", chooser: { kind: "tree" },
  options: [OPTIONS[0]!, STRAIGHT_PUNCH, THRUST, BONK, STOMP, BITE, ...OPTIONS.slice(1)], rate: 60 });

/**
 * Its config, on any body it fits, for fights and for measuring its profiles; the same config on its
 * priors alone (`PRIOR_PREDICTIONS`); and the drills' mind (`option-drill`): on its priors, its
 * options run by their rank (`RANKED_CHOOSER`), nothing priced, searched or drawn. A drill (the
 * table's cells, their opponents, a skill's search) drives a skill fast and the same each time, and
 * no profile decides what its mind does there.
 */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
  "option-prior": { label: "Option Mind on its priors alone", config: { ...OPTION_DEFAULTS, predictions: { kind: "prior" } }, offered: false },
  "option-drill": { label: "Option Mind for drills", config: { ...OPTION_DEFAULTS, chooser: { kind: "ranked" }, predictions: { kind: "prior" } }, offered: false },
});
