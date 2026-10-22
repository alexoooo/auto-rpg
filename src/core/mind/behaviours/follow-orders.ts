import { deepFreeze } from "../../state.ts";
import type { BehaviourPart } from "../behaviour-part.ts";
import { orderedIntent } from "../ordered.ts";
import { takesCommands } from "../parts.ts";

/** **Follow orders**: a person's move order takes the legs, and while it names no foe, the hands are held from blows. */
interface FollowOrdersConfig { readonly kind: "follow-orders" }

export const FOLLOW_ORDERS: BehaviourPart<FollowOrdersConfig> = deepFreeze({
  role: "behaviour", label: "Follow orders", stage: "game", fields: [], slots: [], defaults: { kind: "follow-orders" },
  keys: { kind: true }, fits: takesCommands, faults: () => [],
  make: () => ({ decide(turn) {
    const { orders } = turn;
    if (!orders) return;
    if (orders.move !== undefined && (orders.move || orders.foe === undefined)) turn.interrupt();
    if (!turn.legs && orders.move !== undefined) turn.legs = orderedIntent(turn.sight, orders, { left: null, right: null });
    if (orders.move !== undefined && orders.foe === undefined) turn.requested ??= [];
    if (orders.move) turn.phase = "move";
  } }),
});
