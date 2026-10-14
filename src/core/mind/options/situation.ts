import { hypot } from "../../math/real.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { PREDICTION, THREAT, threatReader } from "../threat.ts";
import type { Situation } from "./option.ts";

/**
 * **A body's situation reader** (`Situation`), its orders read through `ordersOf`. The focus is the
 * foe the orders name; else the one it fought, while it is still in the fight; else the nearest,
 * a standing one where any stands. Its memory is the focus's id.
 */
export function situationReader(ordersOf: (sight: Sight) => Orders | null) {
  const threat = threatReader(), state = { focus: null as string | null };
  const focusOf = (sight: Sight, orders: Orders | null): BodySense | null => {
    const { senses, stance } = sight.view;
    const foe = (id: string | null) => id === null ? null : senses.others.find((other) => other.id === id && !other.out && other.side !== senses.side) ?? null;
    if (orders?.foe !== undefined) return foe(orders.foe);
    const current = foe(state.focus);
    if (current) return current;
    let near: BodySense | null = null, distance = Infinity;
    const standing = senses.others.some((other) => !other.out && other.side !== senses.side && !other.down);
    for (const other of senses.others) {
      if (other.out || other.side === senses.side || standing && other.down) continue;
      const apart = hypot(other.centre.x - stance.centre.x, other.centre.z - stance.centre.z);
      if (apart < distance) { near = other; distance = apart; }
    }
    return near;
  };
  return {
    state,
    read(sight: Sight): Situation {
      const orders = ordersOf(sight), focus = focusOf(sight, orders), centre = sight.view.stance.centre;
      state.focus = focus?.id ?? null;
      return { sight, time: sight.view.time, down: sight.view.down, orders, focus,
        apart: focus ? hypot(focus.centre.x - centre.x, focus.centre.z - centre.z) : Infinity, threat: threat.threatOf(sight.view, THREAT), incoming: threat.threatOf(sight.view, THREAT, PREDICTION) };
    },
  };
}
