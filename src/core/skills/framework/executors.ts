import { PATH_PART } from "../strikes/path-part.ts";
import { KICK_PART } from "../strikes/kick-part.ts";
import { STOMP_PART } from "../strikes/stomp-part.ts";
import { PUNCH_PART } from "../strikes/punch-part.ts";
import { BLADE_CUT_PART, BLADE_THRUST_PART } from "../strikes/blade-part.ts";

/**
 * **Every executor, by its kind** (`ExecutorPart`), in the order a picker offers them: what a
 * fighter's executors list holds, a kind its own module and a line here. This module holds its
 * imports and this list and nothing else: a case's code reads it as where each kind's own code
 * begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const EXECUTORS = { "path-strike": PATH_PART, "front-kick": KICK_PART, "stomp": STOMP_PART,
  "straight-punch": PUNCH_PART, "blade-cut": BLADE_CUT_PART, "blade-thrust": BLADE_THRUST_PART };
