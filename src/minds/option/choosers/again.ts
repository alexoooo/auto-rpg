import type { Situation } from "../contract/situation.ts";
import type { Tally } from "../contract/objective.ts";
import { exp, log } from "../../../core/math/real.ts";
import { ARRIVED } from "../../../skills/framework/movement.ts";
import type { Leaves, Terms } from "../contract/terms.ts";
import type { Pair, Reach } from "./space.ts";

/** **What an Option run again from a leaf reads of a search** (`space`): its horizon, how it weighs life by when it comes, its models, the states it makes, its price and its leaves. */
export interface Rerun {
  readonly horizon: number;
  dealtWeight(from: number, span: number): number;
  takenWeight(from: number, span: number): number;
  modelAt(pair: Pair, at: Situation): Terms | null;
  child(at: Situation, leaves: Leaves, seconds: number): Situation;
  price(tally: Tally, end: Situation): number;
  leaf(at: Situation, reach: Reach, from: Tally): number;
}

/**
 * **`pair` run again and again from `at` to the horizon**, where a try of it leaves
 * the body where it began (its staying outcome, by the chance it stays): the life each try
 * deals and takes, the tries as many as fit in the time left, and the orders it carries out once
 * (`Terms.orders`: an order carried out is carried out, and a try that leaves the state as it found
 * it carries out nothing more of it); each the chance of leaving compounding, the body leaving after
 * as many tries as it is expected to, then held where it went (`leaf`, an open Option). -Infinity
 * where no outcome stays, or a try takes no time.
 */
export function again({ horizon, dealtWeight, takenWeight, modelAt, child, price, leaf }: Rerun, pair: Pair, at: Situation, from: Tally): number {
  const { dealt, taken, orders, seconds } = from, terms = modelAt(pair, at)!, duration = terms.duration;
  if (!(duration > 0) || seconds >= horizon) return -Infinity;
  let stay = 0, there: Situation | null = null;
  for (let i = 0; i < terms.outcomes.length; i++) {
    const end = child(at, terms.outcomes[i]!.leaves, duration);
    if (end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) { stay += terms.outcomes[i]!.chance; there = end; }
  }
  if (!there) return -Infinity;
  // Of `full` whole tries, the chance all stay (`through`), and the tries the body is expected to run where one leaves (`run`).
  const tries = (horizon - seconds) / duration, full = Math.floor(tries), through = full === 0 ? 1 : stay === 0 ? 0 : exp(full * log(stay)), left = 1 - through;
  const o = orders + Math.min(1, tries) * terms.orders;
  const whole = takenWeight(seconds, horizon - seconds), wholeDealt = dealtWeight(seconds, horizon - seconds);
  let worth = through * price({ dealt: dealt + wholeDealt * tries * terms.dealt, taken: taken + whole * tries * terms.taken, orders: o, seconds: horizon }, there);
  if (left > 0) {
    const run = (1 - (full + 1) * through + full * through * stay) / ((1 - stay) * left), part = takenWeight(seconds, run * duration);
    const ran: Tally = { dealt: dealt + dealtWeight(seconds, run * duration) * run * terms.dealt, taken: taken + part * run * terms.taken, orders: o, seconds: seconds + run * duration };
    for (let i = 0; i < terms.outcomes.length; i++) {
      const outcome = terms.outcomes[i]!, end = child(at, outcome.leaves, duration);
      if (end === there || end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) continue;
      worth += left * outcome.chance / (1 - stay) * leaf(end, "held", ran);
    }
  }
  return worth;
}
