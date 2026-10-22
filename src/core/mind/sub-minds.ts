import { GET_AWAY_PART } from "./ground/get-away-part.ts";
import { GROUND_FIGHT_PART } from "./ground/ground-fight-part.ts";
import { STAND_UP_PART } from "./ground/stand-up-part.ts";
import { LIE_PART } from "./lie-part.ts";
import { RESEARCH_RISE_PART } from "./rise/research-part.ts";
import { SUPPORT_RECOVERY_PART } from "./rise/support-recovery-part.ts";

/**
 * **Every sub-mind, by its kind** (`SubMindPart`), in the order a picker offers them: what a
 * host's slot may hold, a line here registering one. This module holds its imports and this list
 * and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const SUB_MINDS = { "stand-up": STAND_UP_PART, "get-away": GET_AWAY_PART, "ground-fight": GROUND_FIGHT_PART, "lie": LIE_PART,
  "support-recovery": SUPPORT_RECOVERY_PART, "research-rise": RESEARCH_RISE_PART };
