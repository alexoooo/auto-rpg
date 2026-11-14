import { STOMP_PART } from "../../skills/strikes/stomp/index.ts";
import { PUNCH_PART } from "../../skills/strikes/straight-punch/index.ts";
import { SWORD_THRUST_PART } from "../../skills/strikes/sword-thrust/index.ts";
import { CLUB_BLOW_PART } from "../../skills/strikes/club-blow/index.ts";
import { BONK_PART } from "../../skills/strikes/bonk/index.ts";

/**
 * **Every executor, by its kind** (`ExecutorPart`), in the order a picker offers them: what a
 * fighter's executors list holds, a kind its own module and a line here.
 */
export const EXECUTORS = { "stomp": STOMP_PART,
  "straight-punch": PUNCH_PART,
  "club-blow": CLUB_BLOW_PART, bonk: BONK_PART, "sword-thrust": SWORD_THRUST_PART };
