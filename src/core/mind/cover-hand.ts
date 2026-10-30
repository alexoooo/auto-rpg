import type { BodySpec, Side } from "../spec/body.ts";

/** The hands of `spec` that hold an item with a covering face (`ItemSpec.coverNormal`), as segments (`hand.left`). */
export const shieldHands = (spec: BodySpec): readonly string[] => (spec.held ?? []).filter(({ item }) => item.coverNormal !== undefined).map(({ segment }) => segment);

/** Prefer the hand with a covering face; with two or none, preserve the threat's side. */
export function coveringHand(spec: BodySpec, preferred: Side): Side {
  const hands = shieldHands(spec);
  if (hands.includes(`hand.${preferred}`)) return preferred;
  const other = preferred === "left" ? "right" : "left";
  return hands.includes(`hand.${other}`) ? other : preferred;
}
