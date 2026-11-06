import type { Resource } from "../../skills/framework/action.ts";
import { sameResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../skills/framework/action.ts";
import { NO_COVER } from "../../skills/intent/intent.ts";
import { orderedIntent } from "../../skills/intent/ordered.ts";
import { legsReadiness } from "../../skills/locomotion/locomotion.ts";
import { asking, blocked, READY, standing, type Option, type Situation } from "./option.ts";
import { threatened } from "./percepts.ts";
import { UNMOVED } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/** Whether `now`'s orders are to move, stand or face: an explicit movement, stop or facing. */
const ordered = (now: Situation): boolean => now.orders !== null && (now.orders.move !== undefined || (now.orders.face ?? null) !== null);

/** Whether `now`'s orders are to stand and fight a foe: they name one and walk nowhere, so the strikes, which stand, carry them out. */
const fights = (now: Situation): boolean => now.orders?.foe !== undefined && (now.orders.move ?? null) === null;

/**
 * **Follow orders**: walk or stop and face as ordered (`orderedIntent`), and nothing else: it asks
 * no blow, so an ordered foe is struck by the strike options (`strike`, which keep to the orders'
 * region, skill and limb, `orderedTarget`, `orderAllows`). On offer while the legs can carry the
 * body (`legsReadiness`) and it has an explicit movement, stop or facing order. It claims the legs
 * and the trunk, and holds the legs and what its walk holds; it yields, but to firm orders to move
 * or stand that name no foe (`Orders.firm`), which it keeps: a foe's are its strikes' to carry out.
 * Its model: carrying out the orders for `AHEAD` s, a walk, a stand or a facing, is worth the metres
 * its gait would walk as long (`Walker.stride`), or the explicitly ordered pace where it has no
 * measured envelope, however near the walk ends; none where they are to stand and fight a foe
 * (`fights`); through the blow coming
 * and the focus's reach where it stands in it; where the orders take it is theirs, so it is priced
 * as leaving the body where it is. On offer at a state where the body stands (`standing`) with
 * such orders.
 */
export function followOrders(walk: Pick<Walker, "stride" | "kept">): Option {
  const UNORDERED = blocked("no orders to move, stand or face"), LEGS_HELD: readonly Resource[] = Object.freeze([LEG_RESOURCE]);
  const claims: readonly Resource[] = Object.freeze([LEG_RESOURCE, TRUNK_RESOURCE]);
  return {
    name: "follow orders", claims, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return ordered(now) ? READY : UNORDERED;
    },
    // Firm orders to move or stand keep the legs and the trunk: nothing of its own takes them over.
    status: (now) => now.orders?.firm && now.orders.move !== undefined && now.orders.foe === undefined ? "committed" : "yields",
    begin() {},
    end() {},
    model: (at) => standing(at) && ordered(at) ? { duration: AHEAD, dealt: 0, taken: at.predictions.danger + threatened(at, AHEAD), orders: fights(at) ? 0 : walk.stride(at) * AHEAD,
      outcomes: UNMOVED } : null,
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      // The body an ordered way goes round (`MovementRequest`'s `by`) is not kept off as a fallen one.
      const move = now.orders?.move, by = move?.kind === "place" ? move.by ?? null : null;
      const asked = walk.kept(now, { ...ordered, actions: [] }, by);
      return { asked, holds: [...LEGS_HELD, ...asking(now, asked).filter((resource) => !sameResource(resource, LEG_RESOURCE))] };
    },
  };
}
