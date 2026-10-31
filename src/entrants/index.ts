import type { Entrant } from "../core/parts/entrant.ts";
import { CLASSIC } from "./classic/index.ts";
import { CRAWL } from "./crawl/index.ts";
import { VANGUARD } from "./vanguard/index.ts";
import { OPTION } from "./option/index.ts";
import { OPTION_SKELETON } from "./option-skeleton/index.ts";
import { OPTION_REPTILE } from "./option-reptile/index.ts";
import { WALKER } from "./walker/index.ts";
import { BARE } from "./bare/index.ts";

/**
 * **Every entrant** (`Entrant`), in the order a picker offers their presets: a line here registers
 * one. This module holds its imports and this list and nothing else: a case's code reads it as
 * where each entrant's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const ENTRANTS: readonly Entrant[] = [CLASSIC, CRAWL, VANGUARD, OPTION, OPTION_SKELETON, OPTION_REPTILE, WALKER, BARE];
