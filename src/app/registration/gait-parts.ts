import { STANCE_WALK_PART } from "../../skills/locomotion/stance-walk/index.ts";
import { WALK_RUN_PART } from "../../skills/locomotion/walk-run/index.ts";

/**
 * **Every gait's legs, by its kind** (`GaitPart`), in the order a picker offers them: what a gait
 * walks by (`Gait.legs`), a line here registering one.
 */
export const GAIT_PARTS = { "stance-walk": STANCE_WALK_PART, "walk-run": WALK_RUN_PART };
