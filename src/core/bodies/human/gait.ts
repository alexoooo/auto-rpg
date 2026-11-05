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
 * (`huber-2022`) from the slowest pace it was found to hold at (`WALK_RATIO_SLOWEST`). A step of
 * length L at rate f walks at v = L f, so at pace v a person steps at f = sqrt(v / ratio) and as long
 * as ratio f (`personStep`).
 */
const WALK_RATIO: Quantity<number> = si(sourced(0.6, "cm min", "huber-2022", "walk ratio of healthy people, about 0.6 cm/(step/min)"));
const WALK_RATIO_SLOWEST: Quantity<number> = si(sourced(53, "m/min", "huber-2022", "men, the slowest free walk the walk ratio held at (Sekiya et al. 1996)"));

/**
 * A person's step at `pace`, m/s: its rate, steps a second, by the walk ratio (`WALK_RATIO`), and
 * no slower than at the slowest pace the ratio holds at; and its length, the pace over the rate.
 */
export function personStep(pace: number): { readonly length: number; readonly rate: number } {
  const rate = Math.sqrt(Math.max(pace, WALK_RATIO_SLOWEST.value) / WALK_RATIO.value);
  return { length: Math.max(pace, 0) / rate, rate };
}
