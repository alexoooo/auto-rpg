import { QUADRUPED_FIGHT, QUADRUPED_FRAME, QUADRUPED_VALUED } from "./frame.ts";
import { QUADRUPED_BITE, QUADRUPED_CRAWL, QUADRUPED_HOLD, QUADRUPED_ORDERS, QUADRUPED_RIGHTING } from "./options.ts";

/**
 * **The quadruped's frame and the parts made for it, by kind**: the frame (`FramePart`), its
 * chooser, objective and kinds of option, in the order a picker offers them: a line here registers
 * one. This module holds its imports and this list and nothing else: a case's code reads it as where
 * each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const QUADRUPED_FRAMES = {
  quadruped: QUADRUPED_FRAME, "quadruped-valued": QUADRUPED_VALUED, "quadruped-fight": QUADRUPED_FIGHT,
  "quadruped-orders": QUADRUPED_ORDERS, "quadruped-bite": QUADRUPED_BITE, "quadruped-crawl": QUADRUPED_CRAWL, "quadruped-righting": QUADRUPED_RIGHTING, "quadruped-hold": QUADRUPED_HOLD,
};
