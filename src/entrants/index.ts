import type { Entrant } from "../core/parts/entrant.ts";
import { OPTION } from "./option/index.ts";
import { WALKER } from "./walker/index.ts";
import { BARE } from "./bare/index.ts";

/**
 * **Every entrant** (`Entrant`), in the order a picker offers their presets: a line here registers
 * one. This module holds its imports and this list and nothing else: a case's code reads it as
 * where each entrant's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const ENTRANTS: readonly Entrant[] = [OPTION, WALKER, BARE];
