import { STANCE_WALK_PART } from "../locomotion/stance-walk-part.ts";
import { WALK_RUN_PART } from "../locomotion/walk-run-part.ts";

/**
 * **Every gait's legs, by its kind** (`GaitPart`), in the order a picker offers them: what a gait
 * walks by (`Gait.legs`), a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const GAIT_PARTS = { "stance-walk": STANCE_WALK_PART, "walk-run": WALK_RUN_PART };
