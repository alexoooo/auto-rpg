import { armed, canHold } from "../human/grip.ts";
import type { BodySpec, ItemSpec, Side } from "../spec/body.ts";
import { woodenClub } from "./club.ts";

/** **What a hand may hold**: nothing, or the wooden club. */
export const HELD = ["empty", "club"] as const;
export type Held = (typeof HELD)[number];

/** The item `held` names; null for an empty hand. */
export function heldItem(held: Held): ItemSpec | null {
  switch (held) {
    case "empty": return null;
    case "club": return woodenClub();
    default: {
      const never: never = held;
      throw new Error(`a hand holds nothing called ${String(never)}`);
    }
  }
}

/** Whether the `hand` of `spec` can hold `held`: anything can hold nothing, and only a hand that closes on a haft (`canHold`) a club. */
const canHoldIn = (spec: BodySpec, hand: Side, held: Held): boolean => held === "empty" || canHold(spec, hand);

/** `spec` with `held` in its `hand`; a body whose hand cannot hold it is refused (`canHoldIn`). */
export function armedWith(spec: BodySpec, hand: Side, held: Held): BodySpec {
  if (!canHoldIn(spec, hand, held)) throw new Error(`${spec.model}'s ${hand} hand cannot hold ${held}`);
  const item = heldItem(held);
  return item ? armed(spec, hand, item) : spec;
}
