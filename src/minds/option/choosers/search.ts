import type { Option } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import type { Terms } from "../contract/terms.ts";
import { type Pair, type Searched, space, UNBEGUN } from "./space.ts";
import { byHand, notPriced, type Source } from "../../../skills/framework/profile/source.ts";

/**
 * **A line's price at a decision**: its worth, life, and the model of the Option it begins with
 * there; and where two answers of its price come from that are the line's, not that Option's
 * (`Source`): where the foe goes meanwhile (`foe`), and what the place it ends in is worth (`end`).
 */
interface Line { readonly worth: number; readonly terms: Terms; readonly foe: Source; readonly end: Source }

/** The foe is imagined standing where it is: where it goes is not priced. */
const FOE_STANDS = notPriced("the foe is imagined standing where it is");
/** The foe is imagined carrying on as it moves, for seconds its Mind's config sets (`Searched.carry`): a rule written by hand. */
const FOE_CARRIED = byHand([], "the foe is imagined carrying on as it moves, for the seconds its Mind's config sets");

/** Where the foe's motion comes from in a search that carries the foe on for `carry` s (`Line.foe`). */
export const foeSource = (carry: number): Source => carry > 0 ? FOE_CARRIED : FOE_STANDS;

/** A line ends worth what its Options bring run again to the horizon (the tail): the place it ends in is not priced. */
export const END_UNPRICED = notPriced("the place a line ends in is not priced");

/** What a search prices at a decision: each Option at each target its line from the state decided at (`Line`), null where it is not on offer. */
export type Lines = (option: Option, target: number) => Line | null;

/** **A root's line as a search priced it**: its Option at its target (`Pair`), its worth and its model's terms. */
export type PricedLine = Line & { readonly pair: Pair };

/** **The valued chooser's search at `root`**: each Option's line from there at each of its targets, `depth` Options deep (`space`'s `line`). */
export function search(root: Situation, searched: Searched & { readonly depth: number }): Lines {
  const at = space(root, searched), { depth } = searched, lines = new Map<Option, (Line | null)[]>(), foe = foeSource(searched.carry);
  return (option, target) => {
    let byTarget = lines.get(option);
    if (!byTarget) lines.set(option, byTarget = []);
    let priced = byTarget[target];
    if (priced === undefined) {
      const pair = at.pairAt(option, target);
      byTarget[target] = priced = at.modelAt(pair, root) ? { worth: at.line(pair, root, depth, UNBEGUN), terms: at.termsOf(pair, root, 0), foe, end: END_UNPRICED } : null;
    }
    return priced;
  };
}
