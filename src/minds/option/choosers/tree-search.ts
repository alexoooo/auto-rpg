import type { Option } from "../contract/option.ts";
import type { Situation, Pressure } from "../contract/situation.ts";
import type { Tally } from "../contract/objective.ts";
import { exp, log } from "../../../core/math/real.ts";
import type { Terms } from "../contract/terms.ts";
import { type Pair, type Searched, space, type Step, UNBEGUN } from "./space.ts";
import type { Leaf } from "./leaves.ts";
import { END_UNPRICED, foeSource, type Lines, type PricedLine } from "./search.ts";

/** A completed tree's lookup captures only root prices, without its nodes or search workspace. */
export function pricedLines(prices: readonly PricedLine[]): Lines {
  return (option, target) => {
    for (let i = 0; i < prices.length; i++) {
      const priced = prices[i]!;
      if (priced.pair.option === option && priced.pair.target === target) return priced;
    }
    return null;
  };
}

/**
 * **A state in the tree** (`treeSearch`): the state, the path to it (life dealt and taken, orders,
 * s), the runs through it, an edge for each Option on offer there (made when first run through),
 * what its leaf is worth (`floor`), and what it is worth (`worth`, `backedUp`).
 */
interface TreeNode extends Tally { readonly at: Situation; readonly floor: number;
  runs: number; worth: number; edges: TreeEdge[] | null }

/**
 * **An Option in the tree** (`treeSearch`), at its target from its state: its step (`Step`), the
 * state each way it ends leads to (made when first drawn), the runs through it, and what it is
 * worth: cut, its ways of ending priced where they leave the body; else the worths of the states
 * drawn by their chances among those drawn.
 */
interface TreeEdge { readonly pair: Pair; readonly step: Step; readonly ends: (TreeNode | null)[]; runs: number; worth: number; readonly kept?: Kept }

/** **What a search starts an Option at its root from** (`RootStart`): its worth, and how many runs it is worth as evidence now. */
interface Kept { readonly worth: number; readonly weight: number }

/**
 * **Where a tree search starts its root** (`treeSearch`), one search at a time: each Option and
 * target's evidence before it runs (`Kept`), none where it has none; and, the search over, what it
 * keeps of the root's Options (`TreeEdge`), each its worth and the runs it stood on, its evidence's
 * among them.
 */
type RootStart = (root: Situation) => {
  kept(pair: Pair): Kept | undefined;
  keep(edges: readonly TreeEdge[]): void;
};

/** **A cold start**: no evidence, nothing kept. */
const COLD_ROOT: ReturnType<RootStart> = Object.freeze({ kept: () => undefined, keep: () => {} });
export const COLD: RootStart = () => COLD_ROOT;

/**
 * **A tree chooser's kept work** (`TreeConfig.keeps`), by the focus searched against (its id, or
 * none): when its last search was, s, and each Option and target at its root then, by its place
 * in the options and its target, its worth and the runs it stood on. Plain numbers, in the
 * chooser's state, so a bout saved and loaded searches on from the same.
 */
interface Warm { byFocus: Record<string, { at: number; keys: string[]; worths: number[]; weights: number[] }> }

/**
 * **A warm start** (`RootStart`): what the last search against the same focus kept of its root
 * (`Warm`, its `state`), each Option at the root by its worth and runs, the runs fading by half
 * each `keeps` s since.
 */
export function warmStart(options: readonly Option[], keeps: number): { readonly start: RootStart; readonly state: Warm } {
  const keyOf = (pair: Pair): string => `${options.indexOf(pair.option)}:${pair.target}`, state: Warm = { byFocus: {} };
  return { state, start: (root) => {
    const kept = new Map<string, Kept>(), focus = root.focus?.id ?? "", last = state.byFocus[focus];
    if (last && root.time >= last.at) {
      const fade = exp(-log(2) * (root.time - last.at) / keeps);
      last.keys.forEach((key, i) => kept.set(key, { worth: last.worths[i]!, weight: last.weights[i]! * fade }));
    }
    return {
      kept: (pair) => kept.get(keyOf(pair)),
      keep: (edges) => { state.byFocus[focus] = { at: root.time, keys: edges.map((edge) => keyOf(edge.pair)), worths: edges.map((edge) => edge.worth), weights: edges.map((edge) => edge.runs + (edge.kept?.weight ?? 0)) }; },
    };
  } };
}

/**
 * **What a state in the tree is worth** (`TreeNode.worth`): its best line by `best` and the mean of
 * its lines by the rest. Its best line, the more of its floor and its best Option run or kept: the
 * models are the mind's own, so its best line found, never less than its leaf. The mean of its
 * lines: its floor as one run and each Option by the runs it stood on, a kept one's evidence among
 * them.
 */
function backedUp(node: TreeNode, best: number): number {
  let top = node.floor, sum = node.floor, weight = 1;
  const edges = node.edges;
  if (edges) for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!, runs = edge.runs + (edge.kept?.weight ?? 0);
    if (edge.runs > 0 || edge.kept) top = Math.max(top, edge.worth);
    sum += edge.worth * runs; weight += runs;
  }
  return top + (1 - best) * (sum / weight - top);
}

/**
 * **The tree chooser's search at `root`**: `runs` runs of a Monte Carlo tree search over the
 * states its Options' models lead to (`space`), `stream` drawing the ways they end. A run goes down
 * from `root`, at each state taking the first Option on offer there that no run has taken, else the
 * one of best bound (its worth and `exploration` times the spread of its siblings' worths, by how
 * few of the state's runs it has had), the fewer runs on a tie. At each Option one way it ends,
 * drawn by its chance. It ends at the first state it makes, worth its leaf (`leaf`, whole), or where
 * its Option is cut (`cutWorth`); then each Option and state it went through is worth again what
 * lies below it (`TreeEdge`; a state its best line by `best`, `backedUp`). Every Option on offer
 * at `root` is run at least once. Its root's Options start from what `start` gives them, as
 * evidence of as many runs as it says. Where `alike`, Options made on one model at one target (a
 * search's slot, `Pair.slot`) are one line at each state, the first's, and each priced as it.
 */
export function treeSearch(root: Situation, searched: Searched & { readonly runs: number; readonly exploration: number; readonly best: number; readonly held: number; readonly stream: { next(): number }; readonly leaf: Leaf; readonly start: RootStart; readonly alike?: boolean }): PricedLine[] {
  const { runs, exploration, best, held, stream, start } = searched;
  const predictions = root.predictions;
  let pressure: Pressure | undefined;
  root = Object.create(root, { predictions: { value: Object.create(predictions, {
    pressure: { get: () => pressure ??= predictions.pressure.cached() },
  }) } }) as Situation;
  const at = space(root, searched), leafAt = searched.leaf(at, root);
  const nodeAt = (state: Situation, from: Tally): TreeNode => {
    const floor = leafAt.worth(state, from);
    return { at: state, dealt: from.dealt, taken: from.taken, orders: from.orders, seconds: from.seconds, floor, runs: 0, worth: floor, edges: null };
  };
  const top = nodeAt(root, UNBEGUN), started = start(root);
  // A cut edge draws no way of ending (`run`): it shares one empty store.
  const edgesOf = (node: TreeNode): TreeEdge[] => {
    if (node.edges) return node.edges;
    const pairs = at.pairsAt(node.at), edges: TreeEdge[] = [], slots = new Set<number>();
    for (const pair of pairs) {
      if (searched.alike) { if (slots.has(pair.slot)) continue; slots.add(pair.slot); }
      const step = at.heldStepOf(pair, node.at, node, held), was = node === top ? started.kept(pair) : undefined;
      edges.push({ pair, runs: 0, worth: was?.worth ?? 0, ends: [], step, ...(was && was.weight > 0 ? { kept: was } : {}) });
    }
    if (node === top) for (const edge of edges) node.runs += edge.kept?.weight ?? 0;
    return node.edges = edges;
  };
  /** The edge a run takes from `node`. */
  const pick = (node: TreeNode, edges: readonly TreeEdge[]): TreeEdge => {
    let low = Infinity, high = -Infinity;
    for (const edge of edges) {
      if (edge.runs === 0 && !edge.kept) return edge;
      low = Math.min(low, edge.worth); high = Math.max(high, edge.worth);
    }
    const scale = exploration * (high - low), total = log(node.runs);
    let chosen = edges[0]!, bound = -Infinity;
    for (const edge of edges) {
      const value = edge.worth + scale * Math.sqrt(total / (edge.runs + (edge.kept?.weight ?? 0)));
      if (value > bound || value === bound && edge.runs < chosen.runs) { chosen = edge; bound = value; }
    }
    return chosen;
  };
  /** The way `terms` ends that a draw takes, by their chances. */
  const draw = (terms: Terms): number => {
    const outcomes = terms.outcomes;
    let u = stream.next();
    for (let k = 0; k < outcomes.length - 1; k++) { u -= outcomes[k]!.chance; if (u < 0) return k; }
    return outcomes.length - 1;
  };
  /** What `edge` is worth from the states drawn of its ways of ending (`TreeEdge`); a cut edge keeps its own. */
  const reprice = (edge: TreeEdge): void => {
    if (edge.step.cut) return;
    let worth = 0, mass = 0;
    const outcomes = edge.step.terms.outcomes;
    for (let k = 0; k < outcomes.length; k++) {
      const end = edge.ends[k], chance = outcomes[k]!.chance;
      if (end) { worth += chance * end.worth; mass += chance; }
    }
    edge.worth = worth / mass;
    // Kept worth weighs as its runs against this search's.
    const kept = edge.kept;
    if (kept) edge.worth = (kept.worth * kept.weight + edge.worth * edge.runs) / (kept.weight + edge.runs);
  };
  const nodes: TreeNode[] = [], taken: TreeEdge[] = [];
  /** One run from the top: down to its first new state or a cut; then every edge and state it went through worth again what lies below. */
  const run = (): void => {
    nodes.length = 0; taken.length = 0;
    let node = top;
    for (;;) {
      nodes.push(node);
      const edges = edgesOf(node);
      if (edges.length === 0) break;
      const edge = pick(node, edges), step = edge.step;
      taken.push(edge);
      if (step.cut) { if (edge.runs === 0) edge.worth = at.cutWorth(node.at, step); break; }
      const k = draw(step.terms), next = edge.ends[k];
      if (next) { node = next; continue; }
      edge.ends[k] = nodeAt(at.child(node.at, step.terms.outcomes[k]!.leaves, step.terms.duration), step);
      break;
    }
    for (let i = taken.length - 1; i >= 0; i--) { const edge = taken[i]!; edge.runs++; reprice(edge); const node = nodes[i]!; node.worth = backedUp(node, best); }
    for (const visited of nodes) visited.runs++;
  };
  for (let k = 0; k < Math.max(runs, edgesOf(top).length); k++) run();
  const edges = top.edges!;
  started.keep(edges);
  // A line cut at its first step is priced by where that step leaves the body (`cutWorth`) and reaches no leaf, so its end is not priced.
  const foe = foeSource(searched.carry);
  const line = (pair: Pair, edge: TreeEdge): PricedLine => ({ pair, worth: edge.worth, terms: edge.step.terms, foe, end: edge.step.cut ? END_UNPRICED : leafAt.source });
  if (!searched.alike) return edges.map((edge) => line(edge.pair, edge));
  // Each pair on offer at the root is priced as its slot's line.
  const bySlot = new Map(edges.map((edge) => [edge.pair.slot, edge]));
  return at.pairsAt(root).map((pair) => line(pair, bySlot.get(pair.slot)!));
}

/** What a tree search is given (`treeSearch`). */
export type TreeSearched = Parameters<typeof treeSearch>[1];
