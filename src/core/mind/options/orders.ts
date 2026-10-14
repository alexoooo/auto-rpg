import { NO_COVER } from "../intent.ts";
import { orderedIntent } from "../ordered.ts";
import type { StandingOption } from "./option.ts";
import { exposed, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/**
 * **Follow orders**: walk and face as ordered (`orderedIntent`), and strike nothing. On offer while the body stands and its orders walk it, or name no foe; orders
 * that name only a foe are carried out by fighting it. It always yields. Its model: a walk ordered
 * goes on at its pace (`Walker.pace`) for `AHEAD` s, short of where it is told to go, and a stand
 * ordered is kept for as long, worth as much; through the blow coming and the focus's reach where
 * it stands in it.
 */
export function followOrders(walk: Pick<Walker, "pace">): StandingOption {
  return {
    name: "follow orders", posture: "standing", state: {},
    available: (now) => !now.down && now.orders !== null && (now.orders.move !== null || now.orders.foe === undefined),
    yields: () => true,
    ended: () => false,
    begin() {},
    end() {},
    models: { "hand-built": (now): Terms => {
      const orders = now.orders!, kept = walk.pace(now) * AHEAD, followed = orders.move === null ? kept : Math.min(kept, orders.destination ?? Infinity);
      return { duration: AHEAD, dealt: 0, taken: now.danger + exposed(now, AHEAD), orders: followed, fall: 0 };
    } },
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      return ordered;
    },
  };
}
