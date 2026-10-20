import type { BodySpec, Side } from "../spec/body.ts";

/** Prefer the hand with a covering face; with two or none, preserve the threat's side. */
export function coveringHand(spec: BodySpec, preferred: Side): Side {
  const hands = (spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => segment);
  if (hands.includes(`hand.${preferred}`)) return preferred;
  const other = preferred === "left" ? "right" : "left";
  return hands.includes(`hand.${other}`) ? other : preferred;
}
