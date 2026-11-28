import type { FollowedBy, Offered, ValuePredictor } from "../contract/predictors.ts";
import type { Situation } from "../contract/situation.ts";
import type { Tally } from "../contract/objective.ts";
import { graceAt } from "../situation/reach-memory.ts";
import { fittedValue, offeredOf } from "../predictions/value/fitted-value.ts";
import { dataOf, type DataKey } from "../../../core/data/store.ts";
import type { Space } from "./space.ts";
import { END_UNPRICED } from "./search.ts";
import type { Source } from "../../../skills/framework/profile/source.ts";

/**
 * **What a search's leaf is worth**, made once a search at its `root` over the states it reads
 * (`search`): the worth of a state, after what the path to it brought (`worth`), and where that
 * comes from (`source`), which is where a line that reaches a leaf has its end priced from. It
 * is said once a search, so it is a bound: a state the leaf has no reading of is priced as the
 * tail prices it, and a line cut before it reaches a leaf is not priced at its end at all.
 */
export type Leaf = (search: Space, root: Situation) => LeafAt;
interface LeafAt {
  worth(at: Situation, from: Tally): number;
  readonly source: Source;
}

/**
 * **A kind of leaf** (`TreeConfig.leaf`): its name on the page, the mind data it reads, and the
 * leaf it makes for a chooser's `body` (`bodyOf`), once a chooser.
 */
interface LeafKind {
  readonly label: string;
  readonly reads: readonly DataKey[];
  make(body: string): Leaf;
}

/** **The tail**: the best of each Option on offer run again to the horizon or held, and of a walk to each site (`space`'s `leaf`, whole). */
const tailLeaf: Leaf = (search) => ({ worth: (at, from) => search.leaf(at, "whole", from), source: END_UNPRICED });

/**
 * **The kinds of leaf**: `tail`, the game's (`tailLeaf`); `fitted`, the path's price and a
 * value fitted to what followed the states bouts reached (`predictedLeaf` of `fittedValue`),
 * what follows weighed as traded evenly to the horizon (`evenly`); `fitted-when`, that value
 * weighed by when it says the life comes (`byWhen`). The fitted kinds read their data
 * (`dataOf("fitted-value")`) as the chooser is made.
 */
export const LEAVES = Object.freeze({
  tail: Object.freeze({ label: "Tail", reads: Object.freeze([]), make: () => tailLeaf }),
  fitted: Object.freeze({ label: "Fitted to what followed", reads: Object.freeze(["fitted-value"] as const), make: (body: string) => predictedLeaf(fittedValue(dataOf("fitted-value"), body), evenly) }),
  "fitted-when": Object.freeze({ label: "Fitted to what followed, by when it comes", reads: Object.freeze(["fitted-value"] as const), make: (body: string) => predictedLeaf(fittedValue(dataOf("fitted-value"), body), byWhen) }),
} satisfies Readonly<Record<string, LeafKind>>);

/**
 * **A leaf worth its path priced with what `value` says follows there** (`ValuePredictor`): the
 * life dealt and taken over the seconds the path leaves to the horizon added to the path's, as if
 * it ran there, each weighed by `weighing`;
 * the state read with the Options on offer as their models price one try, and the reach's grace
 * its own where its Option reckoned it, else the root's. The tail's where `value` has no reading
 * of the state, and through a search it has no reader for.
 */
function predictedLeaf(value: ValuePredictor, weighing: Weighing): Leaf {
  return (search, root) => {
    // The root's grace is read at every search, one with no reader too: reading it counts the reach memory to now.
    const grace = graceAt(root), valued = value.from(root), tail = tailLeaf(search, root);
    if (!valued) return tail;
    const read = valued.read;
    return { source: valued.source, worth: (at, from) => {
      const offered: Offered[] = [];
      for (const pair of search.pairsAt(at)) { const terms = search.modelAt(pair, at); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
      const left = search.horizon - from.seconds, followed = read(at, at.grace ?? grace, offered, left);
      if (!followed) return tail.worth(at, from);
      const dealt = from.dealt + weighing(followed, "dealt", from.seconds, search.dealtWeight), taken = from.taken + weighing(followed, "taken", from.seconds, search.takenWeight);
      return search.price({ dealt, taken, orders: from.orders, seconds: Math.max(from.seconds, search.horizon) }, at);
    } };
  };
}
export type LeafName = keyof typeof LEAVES;

/**
 * **How a leaf counts the life on `side` of what followed** (`FollowedBy`, rising, the last by the
 * horizon) a state `from` s into a line, `weight` weighing life traded evenly over a span (the
 * objective's, `Objective.weigh`); none where nothing is read.
 */
type Weighing = (followed: readonly FollowedBy[], side: "dealt" | "taken", from: number, weight: (from: number, span: number) => number) => number;

/** **The whole as though traded evenly from `from` to the horizon.** */
const evenly: Weighing = (followed, side, from, weight) => {
  const last = followed.at(-1);
  return last ? weight(from, last.by) * last[side] : 0;
};

/** **Each span between two of its times as though traded evenly over that span**: the whole as read where every span weighs as itself. */
const byWhen: Weighing = (followed, side, from, weight) => {
  let total = followed.at(-1)?.[side] ?? 0, was = 0, by = 0;
  for (const read of followed) { total += (weight(from + by, read.by - by) - 1) * (read[side] - was); was = read[side]; by = read.by; }
  return total;
};
