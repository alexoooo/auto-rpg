import type { Position } from "../control/ground-reading.ts";
import type { Situation } from "./option.ts";
import { downSecond } from "./percepts.ts";
import type { Terms } from "./value.ts";

/**
 * **How a way up from the ground is priced**: how long the body is down through it, s; the chance
 * it ends with the body standing; and the share of a foe's blows it keeps off while it runs.
 */
export interface DownModel {
  readonly seconds: number;
  readonly stands: number;
  readonly shelter: number;
}

/**
 * The terms of a way up of `model`: its seconds down, each costing what a second down where the
 * body lies costs (`downSecond`, `Predictions.downRate`), as a posture's price counts them
 * (`downCostAt`), the blow coming, and the chance it leaves the body still down, in `posture`
 * where it names one (`Place.posture`), else where a fall leaves it.
 */
export const downTerms = (model: DownModel, posture?: Position) => (now: Situation): Terms => ({ duration: model.seconds, dealt: 0, orders: 0,
  exit: { range: now.range, down: 1 - model.stands, ...(posture === undefined ? {} : { posture }) },
  taken: now.predictions.danger + downSecond(now.predictions.downRate(now.posture), model) * model.seconds });
