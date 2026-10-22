import { LEARNED_RUN_PART } from "../skills/learned-run-part.ts";
import { MOVE_PART } from "../skills/move-part.ts";
import { RUN_PART } from "../skills/run-part.ts";
import { SIMBICON_PART } from "../skills/simbicon-part.ts";
import { STANCE_WALK_PART } from "../skills/stance-walk-part.ts";
import { STRIDE_PART } from "../skills/stride-part.ts";
import { WALK_RUN_PART } from "../skills/walk-run-part.ts";

/**
 * **Every locomotion, by its kind** (`LocomotionPart`), in the order a picker offers them: what a
 * locomotion slot holds, a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const LOCOMOTIONS = { "stance-walk": STANCE_WALK_PART, stride: STRIDE_PART, run: RUN_PART, simbicon: SIMBICON_PART, "walk-run": WALK_RUN_PART, "learned-run": LEARNED_RUN_PART, move: MOVE_PART };
