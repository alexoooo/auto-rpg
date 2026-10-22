import { LEARNED_RISE } from "./learned-rise.ts";
import { PLANT_UP_TECHNIQUE } from "./plant-up.ts";
import { POST_UP } from "./post-up.ts";
import { ROLL_BACK } from "./roll-back.ts";
import { ROLL } from "./roll.ts";
import { SIT_UP } from "./sit-up.ts";
import { STEP_UP_TECHNIQUE } from "./step-up.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: what a
 * stand-up's list holds, a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const TECHNIQUES = { "step-up": STEP_UP_TECHNIQUE, "learned-rise": LEARNED_RISE, "plant-up": PLANT_UP_TECHNIQUE, roll: ROLL, "roll-back": ROLL_BACK, "sit-up": SIT_UP, "post-up": POST_UP };
