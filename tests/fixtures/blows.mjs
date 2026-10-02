/** **Readings of a fight's blows** (`LandedBlow`, `src/core/rules/blows.ts`) that more than one test takes. */
import { woundedIn } from "../../src/core/rules/blows.ts";

/** The hit points `to` lost to the blows of `blows` whose other side was `from`'s: fighters by their ids. */
export const woundsBy = (blows, from, to) => blows
  .filter((blow) => blow.sides.some((side) => side.fighter === from))
  .flatMap((blow) => woundedIn(blow).filter((side) => side.fighter === to))
  .reduce((sum, side) => sum + side.damage, 0);
