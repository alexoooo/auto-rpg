import { FLATTEN } from "../implementations/flatten/index.ts";
import { BRACE_MODE, LAND_MODE, STEADY_MODE } from "../implementations/modes/index.ts";
import { ROLL_BACK } from "../implementations/roll-back/index.ts";
import { ROLL } from "../implementations/roll/index.ts";
import { STAGED_DOWN, STAGED_ROLL, SIT_BACK_EDGE, FRONT_SIT_BACK } from "../implementations/staged/techniques.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: the ways
 * up, then the modes of the ground (`isWayUp`); a line here registering one. This module holds its
 * imports and this list and nothing else: a case's code reads it as where each kind's own code
 * begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const TECHNIQUES = { roll: ROLL, "roll-back": ROLL_BACK,
  "staged-roll": STAGED_ROLL, "staged-down": STAGED_DOWN, "sit-back": SIT_BACK_EDGE, "front-sit-back": FRONT_SIT_BACK,
  flatten: FLATTEN, brace: BRACE_MODE, land: LAND_MODE, steady: STEADY_MODE };
