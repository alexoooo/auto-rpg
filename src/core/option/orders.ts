import { NO_COVER } from "../intent/intent.ts";
import { orderedIntent } from "../intent/ordered.ts";
import { legsReadiness } from "../skills/locomotion/locomotion.ts";
import { asking, blocked, READY, type Option, type Situation } from "./option.ts";
import { threatened } from "./percepts.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/** Whether `now`'s orders are to stand and fight a foe: they name one and walk nowhere, so the strikes, which stand, carry them out. */
const fights = (now: Situation): boolean => now.orders?.foe !== undefined && (now.orders.move ?? null) === null;

/**
 * **Follow orders**: walk or stop and face as ordered (`orderedIntent`), and nothing else: it asks
 * no blow, so an ordered foe is struck by the strike options (`strike`, which keep to the orders'
 * region, action and limb, `orderedTarget`, `orderAllows`). On offer while the legs can carry the
 * body (`legsReadiness`) and it has an explicit movement, stop or facing order. It claims the legs
 * and the trunk, and holds the legs and what its walk holds; it yields, but to firm orders to move
 * or stand that name no foe (`Orders.firm`), which it keeps: a foe's are its strikes' to carry out.
 * Its model: carrying out the orders for `AHEAD` s, a walk, a stand or a facing, is worth the metres
 * its gait would walk as long (`Walker.stride`), whatever pace the orders set and however near the
 * walk ends, but none where they are to stand and fight a foe (`fights`); through the blow coming and the focus's reach where it stands in it; where the orders
 * take it is theirs, so it is priced as leaving the body where it is, and what it follows as the
 * share of it the body is up there (`here`): a body counted down while its rise runs follows none.
 */
export function followOrders(walk: Pick<Walker, "stride" | "kept">): Option {
  const UNORDERED = blocked("no orders to move, stand or face"), LEGS_HELD: readonly string[] = Object.freeze(["legs"]);
  const claims: readonly string[] = Object.freeze(["legs", "trunk"]);
  return {
    name: "follow orders", claims, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return now.orders && (now.orders.move !== undefined || (now.orders.face ?? null) !== null) ? READY : UNORDERED;
    },
    // Firm orders to move or stand keep the legs and the trunk: nothing of its own takes them over.
    status: (now) => now.orders?.firm && now.orders.move !== undefined && now.orders.foe === undefined ? "committed" : "yields",
    begin() {},
    end() {},
    model: (now): Terms => {
      const kept = fights(now) ? 0 : walk.stride(now) * AHEAD, at = here(now);
      return { duration: AHEAD, dealt: 0, taken: now.predictions.danger + threatened(now, AHEAD), orders: kept * (1 - at.down), exit: at };
    },
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      // The body an ordered way goes round (`MovementRequest`'s `by`) is not kept off as a fallen one.
      const move = now.orders?.move, by = move?.kind === "place" ? move.by ?? null : null;
      const asked = walk.kept(now, { ...ordered, actions: [] }, by);
      return { asked, holds: [...LEGS_HELD, ...asking(now, asked).filter((resource) => resource !== "legs")] };
    },
  };
}
