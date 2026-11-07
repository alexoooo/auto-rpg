import type { Entrant } from "../minds/catalog/entrant.ts";
import { OPTION } from "../entrants/option/index.ts";
import { WALKER } from "../entrants/walker/index.ts";
import { BARE } from "../entrants/bare/index.ts";

/**
 * **Every entrant** (`Entrant`), in the order a picker offers their presets: a line here registers
 * one. This module holds its imports and this list and nothing else: a case's code reads it as
 * where each entrant's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const ENTRANTS: readonly Entrant[] = [OPTION, WALKER, BARE];
