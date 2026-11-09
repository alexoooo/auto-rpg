import type { Resource } from "../../skills/framework/action.ts";
import { sameResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../skills/framework/action.ts";
import { NO_COVER } from "../../skills/framework/intent.ts";
import { orderedIntent } from "../ordered.ts";
import { legsReadiness } from "../../skills/locomotion/locomotion.ts";
import { asking, blocked, READY, standing, type Option, type Situation } from "./option.ts";
import { threatened } from "./percepts.ts";
import { UNMOVED } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { GaitName } from "../../skills/framework/skill.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/** Whether `now`'s orders are to move, stand or face: an explicit movement, stop or facing. */
const ordered = (now: Situation): boolean => now.orders !== null && (now.orders.move !== undefined || (now.orders.face ?? null) !== null);

/** Whether `now`'s orders are to stand and fight a foe: they name one and walk nowhere, so the strikes, which stand, carry them out. */
const fights = (now: Situation): boolean => now.orders?.foe !== undefined && (now.orders.move ?? null) === null;

/** A gait as an option goes by it: its name and its label. */
interface Gait {
  readonly name: GaitName;
  readonly label: string;
}

/**
 * **Follow orders by `gait`**: walk or stop and face as ordered (`orderedIntent`) by that gait, or
 * by the legs' own where they go by none, and nothing else: it asks no blow, so an ordered foe is
 * struck by the strike options (`strike`, which keep to the orders' region, skill and limb,
 * `orderedTarget`, `orderAllows`). On offer while the legs can carry the body (`legsReadiness`)
 * and it has an explicit movement, stop or facing order that names no other gait. It claims the
 * legs and the trunk, holds the legs and what its walk holds, and yields: firm orders are weighed
 * first (`Orders.firm`, `FIRST`), not kept from the mind's choice of gait. Its model: carrying out
 * the orders for `AHEAD` s, a walk, a stand or a facing, is worth the metres its gait goes as
 * ordered as long (`Walker.obeying`); none where they are to stand and fight a foe (`fights`);
 * through the blow coming and the focus's reach where it stands in it; where the orders take it is
 * theirs, so it is priced as leaving the body where it is. On offer at a state where the body
 * stands (`standing`) with such orders. Named for its gait.
 */
export function followOrders(gait: Gait | null, walk: Pick<Walker, "obeying" | "kept">): Option {
  const UNORDERED = blocked("no orders to move, stand or face"), OTHER = blocked("orders name another gait"), LEGS_HELD: readonly Resource[] = Object.freeze([LEG_RESOURCE]);
  const claims: readonly Resource[] = Object.freeze([LEG_RESOURCE, TRUNK_RESOURCE]), named = gait?.name ?? null;
  return {
    name: gait ? `follow orders by ${gait.label.toLowerCase()}` : "follow orders", claims, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return !ordered(now) ? UNORDERED : named !== null && now.orders!.gait !== undefined && now.orders!.gait !== named ? OTHER : READY;
    },
    status: () => "yields",
    begin() {},
    end() {},
    model: (at) => standing(at) && ordered(at) ? { duration: AHEAD, dealt: 0, taken: at.predictions.danger + threatened(at, AHEAD), orders: fights(at) ? 0 : walk.obeying(at, named) * AHEAD,
      outcomes: UNMOVED } : null,
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      // The body an ordered way goes round (`MovementRequest`'s `by`) is not kept off as a fallen one.
      const move = now.orders?.move, by = move?.kind === "place" ? move.by ?? null : null;
      const kept = walk.kept(now, { ...ordered, actions: [] }, by), asked = named === null ? kept : { ...kept, gait: named };
      return { asked, holds: [...LEGS_HELD, ...asking(now, asked).filter((resource) => !sameResource(resource, LEG_RESOURCE))] };
    },
  };
}
