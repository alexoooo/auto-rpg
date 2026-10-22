import { CRAWL_PART } from "./crawl.ts";
import { TROT_PART } from "./trot.ts";

/**
 * **Every gait over support chains, by its kind** (`GaitPart`), in the order a picker offers them.
 * This module holds its imports and this list and nothing else (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const GAITS = { "paw-trot": TROT_PART, "paw-crawl": CRAWL_PART };
