import { hypot } from "../math/real.ts";
import type { GroundPoint } from "../intent/movement.ts";
import type { Orders } from "../intent/orders.ts";

/** Release an approach to the ordered foe once in range, leaving the Mind its local combat footwork. */
export function releaseCombatApproach(orders: Orders, from: GroundPoint, target: { readonly id: string; readonly at: GroundPoint } | null): Orders {
  const move = orders.move;
  if (!target || move?.kind !== "range" || move.focus !== orders.foe || target.id !== orders.foe
    || hypot(from.x - target.at.x, from.z - target.at.z) > move.far) return orders;
  const { move: _, ...remaining } = orders;
  return remaining;
}
