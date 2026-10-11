import { si, sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **How fast a person walks**, each way a fighter's walk is measured (`research/locomotion-run.mjs`):
 * a young man's comfortable and fastest forward walk, a young adult's own pace backward, and the
 * pace a person prefers sideways. The targets a walk is read against, not settings of one.
 */
export const PERSON_PACE: Readonly<Record<"forward" | "fast" | "back" | "sideways", Quantity<number>>> = Object.freeze({
  forward: si(sourced(139.3, "cm/s", "bohannon-1997", "men aged 20-29, comfortable speed")),
  fast: si(sourced(253.3, "cm/s", "bohannon-1997", "men aged 20-29, maximum speed")),
  back: si(sourced(82.6, "cm/s", "popelsky-2023", "young adults, backward walking speed")),
  sideways: sourced(0.575, "m/s", "handford-2014", "preferred sideways walking speed"),
});

/**
 * **A person's walk ratio**: their step length over their step rate, the same across walking speeds
 * (`huber-2022`). A step of length L at rate f walks at v = L f, so at pace v a person steps at
 * f = sqrt(v / ratio) and as long as ratio f (`personStep`).
 */
const WALK_RATIO: Quantity<number> = si(sourced(0.6, "cm min", "huber-2022", "walk ratio of healthy people, about 0.6 cm/(step/min)"));

/** A person's step at `pace`, m/s: its length, m, and rate, steps a second (`WALK_RATIO`). */
export function personStep(pace: number): { readonly length: number; readonly rate: number } {
  const rate = Math.sqrt(Math.max(pace, 0) / WALK_RATIO.value);
  return { length: WALK_RATIO.value * rate, rate };
}
