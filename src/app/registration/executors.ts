import { STOMP_PART } from "../../skills/strikes/stomp-part.ts";
import { PUNCH_PART } from "../../skills/strikes/punch-part.ts";
import { SWORD_THRUST_PART } from "../../skills/strikes/held-blow.ts";
import { BONK_PART, CLUB_BLOW_PART } from "../../skills/strikes/swing-part.ts";

/**
 * **Every executor, by its kind** (`ExecutorPart`), in the order a picker offers them: what a
 * fighter's executors list holds, a kind its own module and a line here. This module holds its
 * imports and this list and nothing else: a case's code reads it as where each kind's own code
 * begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const EXECUTORS = { "stomp": STOMP_PART,
  "straight-punch": PUNCH_PART,
  "club-blow": CLUB_BLOW_PART, bonk: BONK_PART, "sword-thrust": SWORD_THRUST_PART };
