/**
 * **Boosted trees** (`research/minds/boosted-trees.mjs`), as the fitted value keeps them
 * (`FittedValue`): what they read at none, and each tree, flat: a node
 * `[worth]` ends it, `[feature, threshold, below, above]` goes to the node at `below` where the
 * feature is at most the threshold, else at `above`.
 */
export interface Trees { readonly base: number; readonly trees: readonly (readonly (readonly number[])[])[] }

/** Whether `t` is boosted trees. */
export const validTrees = (t: Trees | undefined): boolean => !!t && Number.isFinite(t.base) && Array.isArray(t.trees);

/**
 * **Trees laid out to walk**: every tree's nodes in one run, each node's feature (-1 at an end), its
 * threshold or, at an end, its worth, and where below and above lead; and where each tree starts.
 * The same numbers as the trees, kept in typed arrays so a walk reads no nested arrays.
 */
interface Laid { readonly roots: Int32Array; readonly feature: Int32Array; readonly value: Float64Array; readonly below: Int32Array; readonly above: Int32Array }

/** Each kept model's layout, made the first time it is walked: its trees are frozen data, so it never changes. */
const LAID = new WeakMap<Trees, Laid>();

/** `model`'s trees laid out to walk (`Laid`). */
function laid(model: Trees): Laid {
  const known = LAID.get(model);
  if (known) return known;
  const count = model.trees.reduce((sum, nodes) => sum + nodes.length, 0);
  const roots = new Int32Array(model.trees.length), feature = new Int32Array(count), value = new Float64Array(count), below = new Int32Array(count), above = new Int32Array(count);
  let at = 0;
  model.trees.forEach((nodes, t) => {
    roots[t] = at;
    nodes.forEach((node, i) => {
      const k = at + i;
      if (node.length > 1) { feature[k] = node[0]!; value[k] = node[1]!; below[k] = at + node[2]!; above[k] = at + node[3]!; }
      else { feature[k] = -1; value[k] = node[0]!; }
    });
    at += nodes.length;
  });
  const made = { roots, feature, value, below, above };
  LAID.set(model, made);
  return made;
}

/** Trees' worth at features `x`: what they read at none, and each tree's end in turn. */
export function treesAt(model: Trees, x: readonly number[]): number {
  const { roots, feature, value, below, above } = laid(model);
  let worth = model.base;
  for (let t = 0; t < roots.length; t++) {
    let k = roots[t]!;
    for (let f = feature[k]!; f >= 0; f = feature[k]!) k = x[f]! <= value[k]! ? below[k]! : above[k]!;
    worth += value[k]!;
  }
  return worth;
}
