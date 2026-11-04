import type { Situation } from "./option.ts";
import { downSecond } from "./percepts.ts";
import type { Outcome, Terms } from "./value.ts";

/**
 * **The terms of `seconds` s down where `at` lies**, ending as `outcomes` say: each second costing
 * what a second down in its posture costs (`downSecond`, `Predictions.downRate`), and the blow
 * coming.
 */
export const downTerms = (at: Situation, seconds: number, outcomes: readonly Outcome[]): Terms => ({ duration: seconds, dealt: 0, orders: 0, outcomes,
  taken: at.predictions.danger + downSecond(at.predictions.downRate(at.posture)) * seconds });
