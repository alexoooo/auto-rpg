import { NO_COVER } from "../intent.ts";
import { orderedIntent } from "../ordered.ts";
import type { StandingOption } from "./option.ts";

/**
 * **Follow orders**: walk and face as ordered (`orderedIntent`), and strike nothing. On offer while the body stands and its orders walk it, or name no foe; orders
 * that name only a foe are carried out by fighting it. It always yields.
 */
export function followOrders(): StandingOption {
  return {
    name: "follow orders", posture: "standing", state: {},
    available: (now) => !now.down && now.orders !== null && (now.orders.move !== null || now.orders.foe === undefined),
    yields: () => true,
    ended: () => false,
    begin() {},
    end() {},
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      return ordered;
    },
  };
}
