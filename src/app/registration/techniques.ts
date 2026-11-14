import { FLATTEN } from "../../skills/recovery/flatten/index.ts";
import { BRACE_MODE } from "../../skills/recovery/brace/index.ts";
import { LAND_MODE } from "../../skills/recovery/land/index.ts";
import { STEADY_MODE } from "../../skills/recovery/steady/index.ts";
import { ROLL_BACK } from "../../skills/recovery/roll-back/index.ts";
import { ROLL } from "../../skills/recovery/roll/index.ts";
import { STAGED_DOWN } from "../../skills/recovery/staged-down/index.ts";
import { STAGED_ROLL } from "../../skills/recovery/staged-roll/index.ts";
import { SIT_BACK_EDGE } from "../../skills/recovery/sit-back/index.ts";
import { FRONT_SIT_BACK } from "../../skills/recovery/front-sit-back/index.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: the ways
 * up, then the modes of the ground (`isWayUp`); a line here registering one.
 */
export const TECHNIQUES = { roll: ROLL, "roll-back": ROLL_BACK,
  "staged-roll": STAGED_ROLL, "staged-down": STAGED_DOWN, "sit-back": SIT_BACK_EDGE, "front-sit-back": FRONT_SIT_BACK,
  flatten: FLATTEN, brace: BRACE_MODE, land: LAND_MODE, steady: STEADY_MODE };
