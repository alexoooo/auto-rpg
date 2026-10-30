import type { Position } from "../recovery/ground/reading.ts";
import type { Situation } from "./option.ts";
import { edgeOf, pressureAt } from "./percepts.ts";
import type { Terms } from "./value.ts";

/**
 * **How a way up from the ground is priced**: how long it runs, s; the chance it ends with the body
 * standing; and the share of a near focus's blows it keeps off while it runs.
 */
export interface DownModel {
  readonly seconds: number;
  readonly stands: number;
  readonly shelter: number;
}

/**
 * The terms of a way up of `model`: the blows it does not keep off of a focus within its pressure's
 * reach (`edgeOf`), the blow coming, and the chance it leaves the body still down, in `posture`
 * where it names one (`Place.posture`), else where a fall leaves it.
 */
export const downTerms = (model: DownModel, posture?: Position) => (now: Situation): Terms => ({ duration: model.seconds, dealt: 0, orders: 0,
  exit: { range: now.range, down: 1 - model.stands, ...(posture === undefined ? {} : { posture }) },
  taken: now.predictions.danger + (now.range <= edgeOf(now, now.predictions.pressure) ? pressureAt(now.predictions.pressure, 0, model.seconds * (1 - model.shelter)) : 0) });
