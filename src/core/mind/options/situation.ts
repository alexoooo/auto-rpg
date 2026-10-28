import { hypot } from "../../math/real.ts";
import type { BodySpec } from "../../spec/body.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { READINGS, threatReader } from "../threat.ts";
import type { DownModel } from "./down.ts";
import type { Situation } from "./option.ts";
import { PERCEPTS, type Seen } from "./percepts.ts";

/**
 * **A body's situation reader** (`Situation`), its orders read through `ordersOf`, for a body of
 * `spec` whose ways up from the ground are priced `downs`: each percept (`PERCEPTS`) read once. The focus is the foe the orders name; else the one
 * it fought, while it is still in the fight; else the nearest, a standing one where any stands.
 * Its memory is the focus's id.
 */
export function situationReader(spec: BodySpec, ordersOf: (sight: Sight) => Orders | null, downs: readonly DownModel[]) {
  const threats = threatReader(), state = { focus: null as string | null };
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
      const orders = ordersOf(sight), focus = focusOf(sight, orders);
      state.focus = focus?.id ?? null;
      const seen: Seen = { sight, spec, orders, focus, blow: threats.blowOf(sight.view, READINGS.predicted), threats, downs };
      const read: Record<string, unknown> = { sight, time: sight.view.time };
      for (const [name, percept] of Object.entries(PERCEPTS)) read[name] = percept.read(seen);
      return read as unknown as Situation;
    },
  };
}
