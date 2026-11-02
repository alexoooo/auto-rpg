import { ROLL_BACK } from "./roll-back.ts";
import { ROLL } from "./roll.ts";
import { STAGED_DOWN, STAGED_ROLL, SIT_BACK_EDGE, FRONT_SIT_BACK } from "./staged-edges.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: what a
 * stand-up's list holds, a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const TECHNIQUES = { roll: ROLL, "roll-back": ROLL_BACK,
  "staged-roll": STAGED_ROLL, "staged-down": STAGED_DOWN, "sit-back": SIT_BACK_EDGE, "front-sit-back": FRONT_SIT_BACK };
