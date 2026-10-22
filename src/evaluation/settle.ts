/**
 * **Settled**: when a paired comparison has its answer. Two one-sided sequential probability ratio
 * tests on the mean of per-pair differences, read in a fixed order: is it `delta` better than
 * nothing, is it `delta` worse? Settled once one says it is, or both say it is not (within).
 * Computed with the core's `log`, so a verdict is the same in Node and a page.
 */
import { log } from "../core/math/real.ts";

/** A comparison's stopping rule, in its figure's units. */
export interface SettleRule {
  /** The figure the verdict reads (`Figure.name`). */
  readonly figure: string;
  /** The smallest difference worth finding. */
  readonly delta: number;
  /** The chance of calling a difference where there is none, both directions together. */
  readonly alpha: number;
  /** The chance of missing a difference of `delta`. */
  readonly beta: number;
  /** No verdict before this many pairs. */
  readonly minimum: number;
  /** The spread assumed before any pair, sd, and how many pairs it counts as: the variance is pooled with it. */
  readonly prior: { readonly sd: number; readonly weight: number };
}

type Verdict = "better" | "worse" | "within";

/** A verdict and the number of pairs that gave it, or none yet over the pairs read. */
export type Settled = { readonly verdict: Verdict; readonly at: number } | { readonly verdict: null; readonly at: number };

/**
 * The verdict on `differences` (each a pair's, higher better), read in order: the first count of
 * pairs at or past `minimum` where a test decides. Its variance is the sample's pooled with the
 * prior's, so a few equal pairs cannot settle it alone.
 */
export function settle(differences: readonly number[], rule: SettleRule): Settled {
  const { delta, alpha, beta, minimum, prior } = rule;
  const upper = log((1 - beta) / (alpha / 2)), lower = log(beta / (1 - alpha / 2));
  let sum = 0, mean = 0, squares = 0;
  for (let n = 1; n <= differences.length; n++) {
    const x = differences[n - 1], step = x - mean;
    sum += x; mean += step / n; squares += step * (x - mean);
    if (n < minimum) continue;
    const variance = (squares + prior.weight * prior.sd * prior.sd) / (n - 1 + prior.weight);
    const up = delta / variance * (sum - n * delta / 2), down = delta / variance * (-sum - n * delta / 2);
    if (up >= upper) return { verdict: "better", at: n };
    if (down >= upper) return { verdict: "worse", at: n };
    if (up <= lower && down <= lower) return { verdict: "within", at: n };
  }
  return { verdict: null, at: differences.length };
}
