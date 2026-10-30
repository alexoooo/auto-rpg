import type { ActionConfig, ExecutorEntry } from "../../mind/config.ts";
import type { Controller } from "../../mind/controller.ts";
import { OPTION_MIND as OPTION_FRAMEWORK, type OptionMindConfig } from "../../option/mind.ts";
import { deepFreeze } from "../../state.ts";

/** The straight punch, as its body's record has it (`PunchRecord`): the toed Warrior's is trained. */
const PUNCH: ExecutorEntry = deepFreeze({ name: "punch", kind: "straight-punch" });

/** **The straight punch**: its punch with either hand at the trunk's opening, aimed as the learned puncher aims. */
const STRAIGHT_PUNCH_ACTION: ActionConfig = deepFreeze({ name: "straight-punch", executor: "punch", effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }],
  aim: { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1, square: 4 } } });

/**
 * **The stomp's stroke**: the front kick's, its chamber high over the target, its height band low,
 * so it strikes down on a body lying ahead and nothing standing, from a window out where both feet
 * stand clear of a lying body's limbs ([stomp settings](../../../../docs/reference/front-kicks.md#stomp-settings)).
 */
const STOMP: ExecutorEntry = deepFreeze({ name: "stomp", kind: "front-kick",
  over: 1, windup: 0, lift: .7, soleTurn: 0, top: .4, alongNear: .55, alongFar: .8, across: .2, contactSpeed: 7, swingSeconds: .25, returnNear: .1 });

/** **The stomp**: its stroke with either foot at the trunk's middle, aimed at its centre. */
const STOMP_ACTION: ActionConfig = deepFreeze({ name: "stomp", executor: "stomp", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "middle" }],
  aim: { kind: "centre", lead: 0 } });

/** As it starts: the toolkit's Option Mind (`OPTION_FRAMEWORK`) with the straight punch, the stomp and the support fold. */
const OPTION_DEFAULTS: OptionMindConfig = deepFreeze({ ...(OPTION_FRAMEWORK.defaults as OptionMindConfig), support: { kind: "support-fold" },
  executors: [PUNCH, STOMP], actions: [STRAIGHT_PUNCH_ACTION, STOMP_ACTION] });

/** **Option Mind** as an entrant: the toolkit's Option Mind, its preset the Warrior's (`option`). */
export const OPTION_MIND: Controller = Object.freeze({ ...OPTION_FRAMEWORK, defaults: OPTION_DEFAULTS,
  presets: deepFreeze({ option: { label: "Option Mind", config: OPTION_DEFAULTS, models: ["workshop-fighter"] } }) });
