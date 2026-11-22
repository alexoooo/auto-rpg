/**
 * **Boosted trees** (`research/minds/boosted-trees.mjs`), as the fitted value and the move prior
 * keep them (`FittedValue`, `MovePrior`): what they read at none, and each tree, flat: a node
 * `[worth]` ends it, `[feature, threshold, below, above]` goes to the node at `below` where the
 * feature is at most the threshold, else at `above`.
 */
export interface Trees { readonly base: number; readonly trees: readonly (readonly (readonly number[])[])[] }

/** Whether `t` is boosted trees. */
export const validTrees = (t: Trees | undefined): boolean => !!t && Number.isFinite(t.base) && Array.isArray(t.trees);

/** Trees' worth at features `x`. */
export function treesAt(model: Trees, x: readonly number[]): number {
  let worth = model.base;
  for (const nodes of model.trees) {
    let node = nodes[0]!;
    while (node.length > 1) node = nodes[x[node[0]!]! <= node[1]! ? node[2]! : node[3]!]!;
    worth += node[0]!;
  }
  return worth;
}
