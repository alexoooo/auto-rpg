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
