import { MOVE_PART } from "../../skills/locomotion/move/index.ts";
import { GAIT_CHOICE } from "../../skills/locomotion/gait-choice/index.ts";

/**
 * **Every locomotion, by its kind** (`LocomotionPart`), in the order a picker offers them: the legs
 * a body goes by its gaits on, a line here registering one.
 */
export const LOCOMOTIONS = { move: MOVE_PART, "gait-choice": GAIT_CHOICE };
