import { STALK_PART } from "./tactics.ts";

/**
 * **Every quadruped's tactics, by its kind** (`QuadrupedTacticsPart`), in the order a picker offers
 * them. This module holds its imports and this list and nothing else (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const QUADRUPED_PLANNERS = { stalk: STALK_PART };
