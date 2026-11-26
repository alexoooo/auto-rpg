import { deepFreeze } from "./state.ts";

/**
 * **What sort of number a person wrote in by hand.**
 *
 * - `guess`: it says what happens in a fight (how often a blow lands, how long getting up
 *   takes). Fights that were played could say it instead, so a guess is waiting to be replaced
 *   by a measurement.
 * - `preference`: it says how a body is told to fight. A player sets it, in the `field` of that
 *   key in the mind editor.
 * - `own`: it says how the code works (a tolerance, how many neighbours a reading takes). It is
 *   the same for every body, and no fight could say it.
 */
export type HandSetSort =
  | { readonly sort: "guess" }
  | { readonly sort: "preference"; readonly field: string }
  | { readonly sort: "own" };

/** One number set by hand, or a few that belong together: the constant it is (`name`), its sort, what it says in one sentence, and its value. */
export type HandSet<T = unknown> = HandSetSort & { readonly name: string; readonly says: string; readonly value: T };

/**
 * Every entry made so far, by its name. A module's entries are made when the module loads, so
 * this holds the entries of the code that has been loaded, and loading a module again puts the
 * same entries back.
 */
const ENTRIES = new Map<string, HandSet>();

/**
 * **A number set by hand**, entered in the one registry of them and given back to be used. The
 * code that prices a fight writes a number of its own this way and no other, so listing the
 * registry (`handSetEntries`) lists every such number from the code that reads it. A scan of the
 * source holds that (`scripts/hand-set.mjs`).
 */
export function handSet<T>(entry: HandSet<T>): T {
  ENTRIES.set(entry.name, deepFreeze(entry));
  return entry.value;
}

/** Every number set by hand in the code loaded so far, in the order it was loaded. */
export const handSetEntries = (): readonly HandSet[] => [...ENTRIES.values()];
