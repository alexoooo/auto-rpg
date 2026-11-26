import type { Option } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import type { Terms } from "../contract/terms.ts";
import { type Pair, type Searched, space, UNBEGUN } from "./space.ts";

/** **A line's price at a decision**: its worth, life, and the model of the Option it begins with there. */
interface Line { readonly worth: number; readonly terms: Terms }

/** What a search prices at a decision: each Option at each target its line from the state decided at (`Line`), null where it is not on offer. */
export type Lines = (option: Option, target: number) => Line | null;

/** **A root's line as a search priced it**: its Option at its target (`Pair`), its worth and its model's terms. */
export type PricedLine = Line & { readonly pair: Pair };

/** **The valued chooser's search at `root`**: each Option's line from there at each of its targets, `depth` Options deep (`space`'s `line`). */
export function search(root: Situation, searched: Searched & { readonly depth: number }): Lines {
  const at = space(root, searched), { depth } = searched, lines = new Map<Option, (Line | null)[]>();
  return (option, target) => {
    let byTarget = lines.get(option);
    if (!byTarget) lines.set(option, byTarget = []);
    let priced = byTarget[target];
    if (priced === undefined) {
      const pair = at.pairAt(option, target);
      byTarget[target] = priced = at.modelAt(pair, root) ? { worth: at.line(pair, root, depth, UNBEGUN), terms: at.termsOf(pair, root, 0) } : null;
    }
    return priced;
  };
}
