import { FLATTEN } from "../../skills/recovery/implementations/flatten/index.ts";
import { BRACE_MODE, LAND_MODE, STEADY_MODE } from "../../skills/recovery/implementations/modes/index.ts";
import { ROLL_BACK } from "../../skills/recovery/implementations/roll-back/index.ts";
import { ROLL } from "../../skills/recovery/implementations/roll/index.ts";
import { STAGED_DOWN, STAGED_ROLL, SIT_BACK_EDGE, FRONT_SIT_BACK } from "../../skills/recovery/implementations/staged/index.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: the ways
 * up, then the modes of the ground (`isWayUp`); a line here registering one.
 */
export const TECHNIQUES = { roll: ROLL, "roll-back": ROLL_BACK,
  "staged-roll": STAGED_ROLL, "staged-down": STAGED_DOWN, "sit-back": SIT_BACK_EDGE, "front-sit-back": FRONT_SIT_BACK,
  flatten: FLATTEN, brace: BRACE_MODE, land: LAND_MODE, steady: STEADY_MODE };
