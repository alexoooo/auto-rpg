import { NO_COVER } from "../../../mind/intent.ts";
import { orderedIntent } from "../../../mind/ordered.ts";
import { legsReadiness } from "../../../skills/locomotion.ts";
import { asking, blocked, READY, type Option } from "./option.ts";
import { threatened } from "./percepts.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { ActionConfig } from "../../../mind/config.ts";
import { remainingOf } from "../../../mind/movement.ts";
import { regionSegments } from "../../../mind/action-aim.ts";
import { around } from "./strike.ts";
import type { ActionRequest } from "../../../skills/action.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/**
 * **Follow orders**: walk or stop and face as ordered (`orderedIntent`), continuing admitted blows
 * and asking for a ready action against the explicitly selected foe. On offer while the legs can
 * carry the body (`legsReadiness`) and it has an explicit movement, stop or facing order. It claims the legs and the
 * trunk, and holds the legs and what its blows hold (a cover of a hand a blow holds dropped,
 * `stepSet`); it always yields. Its
 * model: a walk ordered goes on at its pace (`Walker.pace`) for `AHEAD` s, short of where it is
 * told to go, and a stand or a facing ordered, or a place or range it is already in, is kept for
 * as long, worth as much; through the
 * blow coming and the focus's reach where it stands in it; where the orders take it is theirs, so
 * it is priced as leaving the body where it is, and what it follows as the share of it the body is
 * up there (`here`): a body counted down while its rise runs follows none.
 */
export function followOrders(walk: Pick<Walker, "pace" | "kept">, actions: readonly ActionConfig[] = []): Option {
  const UNORDERED = blocked("no orders to move, stand or face"), LEGS_HELD: readonly string[] = Object.freeze(["legs"]);
  const claims: readonly string[] = Object.freeze(["legs", "trunk"]);
  return {
    name: "follow orders", claims, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return now.orders && (now.orders.move !== undefined || now.orders.face !== undefined) ? READY : UNORDERED;
    },
    status: () => "yields",
    begin() {},
    end() {},
    model: (now): Terms => {
      const orders = now.orders!, kept = walk.pace(now) * AHEAD, view = now.sight.view, at = here(now);
      const left = orders.move ? remainingOf(orders.move, view.stance.centre, view.senses.others) : 0;
      const followed = left > 0 ? Math.min(kept, left) : kept;
      return { duration: AHEAD, dealt: 0, taken: now.predictions.danger + threatened(now, AHEAD), orders: followed * (1 - at.down), exit: at };
    },
    step(now) {
      const { guard: _, ...ordered } = orderedIntent(now.sight, now.orders!, NO_COVER);
      const asks: ActionRequest[] = now.sight.report.actions.map(action => ({ id: action.id, action: action.action, effector: action.effector, target: structuredClone(action.target) }));
      if (now.focus && now.orders?.foe === now.focus.id) outer: for (const action of actions) {
        if (!action.regions) continue;
        const regions = now.orders.region === undefined ? action.regions : [{ kind: "segment" as const, segment: now.orders.region }];
        const region = regions.find(region => regionSegments(now.focus!.spec, region).length > 0);
        if (!region) continue;
        const target = { kind: "body" as const, body: now.focus.id, region };
        for (const effector of action.effectors) if (now.sight.readiness(now.sight.view, action.name, effector, target, around(now.sight)).kind === "ready") {
          asks.push({ id: now.sight.instance(), action: action.name, effector, target });
          break outer;
        }
      }
      const asked = walk.kept(now, { ...ordered, actions: asks });
      return { asked, holds: [...LEGS_HELD, ...asking(now, asked).filter((resource) => resource !== "legs")] };
    },
  };
}
