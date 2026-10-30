import { PLANT_UP_TECHNIQUE } from "./plant-up.ts";
import { ROLL_BACK } from "./roll-back.ts";
import { ROLL } from "./roll.ts";
import { STAGED_DOWN, STAGED_KNEEL_UP, STAGED_LUNGE, STAGED_ROLL, SIT_BACK_EDGE, FRONT_SIT_BACK, STAGED_STEP_THROUGH } from "./staged-edges.ts";
import { STEP_UP_TECHNIQUE } from "./step-up.ts";

/**
 * **Every technique, by its kind** (`TechniquePart`), in the order a picker offers them: what a
 * stand-up's list holds, a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const TECHNIQUES = { "step-up": STEP_UP_TECHNIQUE, "plant-up": PLANT_UP_TECHNIQUE, roll: ROLL, "roll-back": ROLL_BACK,
  "staged-roll": STAGED_ROLL, "staged-down": STAGED_DOWN, "staged-kneel-up": STAGED_KNEEL_UP, "staged-step-through": STAGED_STEP_THROUGH, "staged-lunge": STAGED_LUNGE, "sit-back": SIT_BACK_EDGE, "front-sit-back": FRONT_SIT_BACK };
