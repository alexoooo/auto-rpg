import { LOADOUTS, type Loadout } from "../core/bodies/items/held.ts";

/**
 * **The loadouts minds are rated on**: bare hands, the club, the club and
 * buckler, the sword, the sword and buckler, each item in the hand it is made for. The rest of
 * `LOADOUTS` is unseen: no mind is rated on it, and how a mind carries to it is read apart.
 */
export const REPRESENTATIVE: readonly Loadout[] = Object.freeze(([["empty", "empty"], ["empty", "club"], ["buckler", "club"], ["empty", "sword"], ["buckler", "sword"]] as const)
  .map(([left, right]) => LOADOUTS.find((loadout) => loadout.left === left && loadout.right === right)!));
