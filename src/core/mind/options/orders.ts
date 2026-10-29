import { NO_COVER } from "../intent.ts";
import { orderedIntent } from "../ordered.ts";
import { asking, blocked, READY, type StandingOption } from "./option.ts";
import { threatened } from "./percepts.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { ActionConfig } from "../config.ts";
import { remainingOf } from "../movement.ts";
import { regionSegments } from "../action-aim.ts";
import { around } from "./strike.ts";
import type { ActionRequest } from "../../skills/action.ts";

/** How far ahead following orders is priced, s. */
const AHEAD = 1;

/**
 * **Follow orders**: walk or stop and face as ordered (`orderedIntent`), continuing admitted blows
 * and asking for a ready standing action against the explicitly selected foe. On offer while
 * the body stands and has an explicit movement or stop order. A commitment, it holds the legs and
 * what its blows hold; it always yields. Its model: a walk ordered
 * goes on at its pace (`Walker.pace`) for `AHEAD` s, short of where it is told to go, and a stand
 * ordered, or a place or range it is already in, is kept for as long, worth as much; through the
 * blow coming and the focus's reach where it stands in it; where the orders take it is theirs, so
 * it is priced as leaving the body where it is.
 */
export function followOrders(walk: Pick<Walker, "pace">, actions: readonly ActionConfig[] = []): StandingOption {
  const UNORDERED = blocked("no orders to move or stand"), LEGS_HELD: readonly string[] = Object.freeze(["legs"]);
  return {
    name: "follow orders", posture: "standing", layer: "commitment", state: {},
    entry: (now) => !now.down && now.orders?.move !== undefined ? READY : UNORDERED,
    exit: () => null,
    holds: (now, asked) => [...LEGS_HELD, ...asking(now, asked).filter((resource) => resource !== "legs")],
    yields: () => true,
    ended: () => false,
    begin() {},
    end() {},
    models: { "hand-built": (now): Terms => {
      const orders = now.orders!, kept = walk.pace(now) * AHEAD, view = now.sight.view;
      const left = orders.move ? remainingOf(orders.move, view.stance.centre, view.senses.others) : 0;
      const followed = left > 0 ? Math.min(kept, left) : kept;
      return { duration: AHEAD, dealt: 0, taken: now.danger + threatened(now, AHEAD), orders: followed, exit: here(now) };
    } },
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
      return { ...ordered, actions: asks };
    },
  };
}
