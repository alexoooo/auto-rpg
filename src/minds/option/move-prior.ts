import { exp } from "../../core/math/real.ts";
import { FEATURES } from "./fitted-value.ts";
import { treesAt, validTrees, type Trees } from "./boosted-trees.ts";

/**
 * **A move prior** (`assets/minds/move-prior.json`, made by `research/minds/move-prior.mjs`):
 * boosted trees over a state as the fitted value reads it (`FEATURES`) and one of the Options on
 * offer there (`LINE_FEATURES`, `lineFeatures`), scoring it; a softmax over a state's Options of
 * their scores is the share of a tree search's runs fitted to go to each (`priorsOf`). A kind is
 * read by its place in `kinds`, any other after them (`Trees`).
 */
export interface MovePrior {
  readonly origin: string;
  readonly features: readonly string[];
  readonly kinds: readonly string[];
  readonly trees: Trees;
}

/**
 * **An Option on offer as the prior reads it**: its kind, whether it is open, and its first step
 * from the state on a path begun there (`Step`): its seconds, the life it deals and takes, and
 * what the search's objective prices it at.
 */
export interface PriorLine { readonly kind: string; readonly open: boolean; readonly duration: number; readonly dealt: number; readonly taken: number; readonly price: number }

/** What an Option on offer is read as beside its state's `FEATURES`: as `PriorLine`, its price less the best of its state's, and twice its dealt less its taken a second. */
export const LINE_FEATURES = Object.freeze(["kind", "open", "seconds", "dealt", "taken", "price", "priceLessBest", "rate"]);

/** `line` read as `LINE_FEATURES`, its kind by its place in `kinds`, beside a state whose best price is `best`. */
export function lineFeatures(kinds: readonly string[], line: PriorLine, best: number): number[] {
  const kind = kinds.indexOf(line.kind);
  return [kind < 0 ? kinds.length : kind, line.open ? 1 : 0, line.duration, line.dealt, line.taken, line.price, line.price - best,
    line.duration > 0 ? (2 * line.dealt - line.taken) / line.duration : 0];
}

/** Whether `value` is a move prior over today's `FEATURES` and `LINE_FEATURES`. */
export const validPrior = (value: unknown): value is MovePrior => {
  const v = value as MovePrior | null, names = [...FEATURES, ...LINE_FEATURES];
  return !!v && typeof v === "object" && Array.isArray(v.features) && v.features.length === names.length && v.features.every((name, i) => name === names[i])
    && Array.isArray(v.kinds) && v.kinds.every((kind) => typeof kind === "string") && validTrees(v.trees);
};

/** **The shares of a search's runs `prior` reads** for `lines`, on offer at a state read as `state` (`FEATURES`): a softmax of each one's score. */
export function priorsOf(prior: MovePrior, state: readonly number[], lines: readonly PriorLine[]): number[] {
  let best = -Infinity;
  for (const line of lines) best = Math.max(best, line.price);
  const scores = lines.map((line) => treesAt(prior.trees, [...state, ...lineFeatures(prior.kinds, line, best)]));
  const top = Math.max(...scores), weights = scores.map((score) => exp(score - top));
  let sum = 0;
  for (const weight of weights) sum += weight;
  return weights.map((weight) => weight / sum);
}
