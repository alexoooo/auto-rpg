import type { MindPreset } from "../../core/mind/controller.ts";
import { OPTION_MIND, type OptionMindConfig } from "../../core/option/mind.ts";
import { CLUB_BLOW_OPTION, CUT_OPTION, OPTIONS, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION, type StrikeConfig } from "../../core/option/kinds.ts";
import type { PartConfig } from "../../core/parts/parts.ts";
import { deepFreeze } from "../../core/state.ts";

/** Its low support, under every blow of its hands: the support fold. */
const SUPPORT: PartConfig = deepFreeze({ kind: "support-fold" });

/**
 * **The straight punch** (`assets/core/straight-punch.json`, the toed Warrior's trained): with
 * either hand at the trunk's opening, aimed as the learned puncher aims, from its low support.
 */
const STRAIGHT_PUNCH: StrikeConfig = deepFreeze({ ...STRAIGHT_PUNCH_OPTION.defaults,
  aim: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } }, support: SUPPORT });

/**
 * **The held blows**, each as its body's record has it (`assets/core/<kind>.json`): the club's
 * swing, the sword's cut and its thrust, each with the hand that holds its item, aimed at the trunk's
 * opening as the straight punch is.
 */
const HELD_BLOWS: readonly StrikeConfig[] = deepFreeze([CLUB_BLOW_OPTION, CUT_OPTION, SWORD_THRUST_OPTION].map((part) =>
  ({ ...part.defaults, aim: STRAIGHT_PUNCH.aim, support: SUPPORT })));

/**
 * **The stomp** (`assets/core/stomp.json`): its chamber high over the target, its height band low,
 * so it strikes down on a body lying ahead and nothing standing; with either foot at the trunk's
 * middle, aimed at its centre.
 */
const STOMP: StrikeConfig = STOMP_OPTION.defaults;

/**
 * As it starts: the toolkit's Option Mind (`OPTION_MIND`) with every blow (the straight punch, the
 * held blows and the stomp) after following orders, then the standard options (`OPTIONS`). A body
 * offers those whose skill it fits, with the limbs it has (`skillsOf`). It decides at 60 Hz, every
 * other control step (`OptionMindConfig.rate`), where its strike and gait profiles are measured.
 */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ ...(OPTION_MIND.defaults as OptionMindConfig), rate: 60,
  options: [OPTIONS[0]!, STRAIGHT_PUNCH, ...HELD_BLOWS, STOMP, ...OPTIONS.slice(1)] });

/** Its one config, on any body it fits. */
export const OPTION_PRESETS: Readonly<Record<string, MindPreset>> = deepFreeze({
  option: { label: "Option Mind", config: OPTION_DEFAULTS },
});
