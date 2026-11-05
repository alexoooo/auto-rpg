import { MOVE_PART } from "../../skills/locomotion/move-part.ts";

/**
 * **Every locomotion, by its kind** (`LocomotionPart`), in the order a picker offers them: the legs
 * a body goes by its gaits on, a line here registering one. This module holds its imports and this
 * list and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const LOCOMOTIONS = { move: MOVE_PART };
