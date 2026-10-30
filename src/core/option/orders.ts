import { NO_COVER } from "../intent/intent.ts";
import { orderedIntent } from "../tactics/ordered.ts";
import { legsReadiness } from "../skills/locomotion/locomotion.ts";
import { asking, blocked, READY, type Option } from "./option.ts";
import { threatened } from "./percepts.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { ActionConfig } from "../skills/config.ts";
import { regionSegments } from "../intent/action-aim.ts";
import { orderAllows, orderedRegions } from "../intent/orders.ts";
import { around } from "./strike.ts";
import type { ActionRequest } from "../skills/framework/action.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/**
 * **Follow orders**: walk or stop and face as ordered (`orderedIntent`), continuing the admitted
 * blows the orders allow (`orderAllows`) and asking for a ready action against the explicitly selected foe. On offer while the legs can
 * carry the body (`legsReadiness`) and it has an explicit movement, stop or facing order. It claims the legs and the
 * trunk, and holds the legs and what its blows hold (a cover of a hand a blow holds dropped,
 * `stepSet`); it yields, but to firm orders to move or stand that name no foe (`Orders.firm`), which
 * it keeps: a foe's are its strikes' to carry out. Its
 * model: carrying out the orders for `AHEAD` s, a walk, a stand or a facing, is worth the metres its
 * gait would walk as long (`Walker.stride`), whatever pace the orders set and however near the walk
 * ends; through the
 * blow coming and the focus's reach where it stands in it; where the orders take it is theirs, so
 * it is priced as leaving the body where it is, and what it follows as the share of it the body is
 * up there (`here`): a body counted down while its rise runs follows none.
 */
export function followOrders(walk: Pick<Walker, "stride" | "kept">, actions: readonly ActionConfig[] = []): Option {
  const UNORDERED = blocked("no orders to move, stand or face"), LEGS_HELD: readonly string[] = Object.freeze(["legs"]);
  const claims: readonly string[] = Object.freeze(["legs", "trunk"]);
  return {
    name: "follow orders", claims, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return now.orders && (now.orders.move !== undefined || now.orders.face !== undefined) ? READY : UNORDERED;
    },
    // Firm orders to move or stand keep the legs and the trunk: nothing of its own takes them over.
    status: (now) => now.orders?.firm && now.orders.move !== undefined && now.orders.foe === undefined ? "committed" : "yields",
    begin() {},
    end() {},
    model: (now): Terms => {
      const kept = walk.stride(now) * AHEAD, at = here(now);
      return { duration: AHEAD, dealt: 0, taken: now.predictions.danger + threatened(now, AHEAD), orders: kept * (1 - at.down), exit: at };
    },
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      // Its blows under way go on where the orders allow them; one they do not is let go where it can be.
      const asks: ActionRequest[] = now.sight.report.actions.filter((action) => action.target.kind !== "body" || orderAllows(now.orders, action.target.body, action.action, action.effector))
        .map(action => ({ id: action.id, action: action.action, effector: action.effector, target: structuredClone(action.target) }));
      if (now.focus && now.orders?.foe === now.focus.id) outer: for (const action of actions) {
        if (!action.regions) continue;
        const region = orderedRegions(now.orders, now.focus.id, action.regions).find(region => regionSegments(now.focus!.spec, region).length > 0);
        if (!region) continue;
        const target = { kind: "body" as const, body: now.focus.id, region };
        for (const effector of action.effectors) if (orderAllows(now.orders, now.focus.id, action.name, effector) && now.sight.readiness(now.sight.view, action.name, effector, target, around(now.sight)).kind === "ready") {
          asks.push({ id: now.sight.instance(), action: action.name, effector, target });
          break outer;
        }
      }
      // The body an ordered way goes round (`MovementRequest`'s `by`) is not kept off as a fallen one.
      const move = now.orders?.move, by = move?.kind === "place" ? move.by ?? null : null;
      const asked = walk.kept(now, { ...ordered, actions: asks }, by);
      return { asked, holds: [...LEGS_HELD, ...asking(now, asked).filter((resource) => resource !== "legs")] };
    },
  };
}
