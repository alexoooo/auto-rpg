import type { Clearance } from "../clear-step.ts";
import { walkGoal } from "../movement.ts";
import type { Side, BodySpec } from "../../spec/body.ts";
import type { Region, TargetRef } from "../../skills/action.ts";
import { regionSegments } from "../action-aim.ts";
import type { ActionConfig } from "../config.ts";
import { groundPosition } from "../ground-position.ts";
import { lowOpponent } from "../sensed-bounds.ts";
import { asking, blocked, READY, type Situation, type StandingOption } from "./option.ts";
import { around } from "./strike.ts";
import { orderedDealt, record, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** The chance a body goes down lowering to strike from low support and rising again. */
const FOLD_FALLS = .05;

/**
 * **Strike a low foe**: `action`, a blow from low support, at the focus while it is down or low,
 * from beside it (`groundPosition`): walking there, lowering through the support fold and striking
 * once placed, then rising. It is on offer while the focus is low or the placement is under way,
 * and yields only before the placement begins; its walk need not keep out of the focus's reach. A
 * commitment, it holds the legs and the trunk, and what its blow holds.
 * Its model: walking beside the focus, then a blow of its record (`record`) from its stronger hand,
 * the fold's own chance of going down (`FOLD_FALLS`), and the blow coming; a low focus's range is
 * not priced, so it is taken as leaving the body where it is.
 */
export function strikeLow(action: ActionConfig, spec: BodySpec, walk: Walker): StandingOption {
  // Its walks are kept clear by the body's navigator (`Sight.clearance`), read at each step.
  let clearance: Clearance | null = null;
  const ground = groundPosition(spec, (view, heading, move) => clearance!.keepClear(view, heading, move));
  const state = { ground: ground.state, hand: "right" as Side, id: null as number | null };
  const placing = (): boolean => ground.state.near.active || ground.state.wide.active;
  const low = (now: Situation): boolean => !now.down && !!now.focus && (lowOpponent(now.sight.view, now.focus) || placing());
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const targetOf = (now: Situation): TargetRef | null => {
    const focus = now.focus!, region = action.regions?.find((r: Region) => regionSegments(focus.spec, r).length > 0);
    return region ? { kind: "body", body: focus.id, region } : null;
  };
  const HIGH = blocked("no low focus"), PLACING: readonly string[] = Object.freeze(["legs", "trunk"]);
  return {
    name: "strike a low foe", posture: "standing", layer: "commitment", state,
    entry: (now) => low(now) ? READY : HIGH,
    exit: () => null,
    holds: (now, asked) => [...PLACING, ...asking(now, asked).filter((resource) => !PLACING.includes(resource))],
    yields: () => !placing(),
    ended: (now) => !low(now),
    begin() { state.id = null; },
    end() { ground.reset(); state.id = null; },
    near: (now) => now.focus?.id ?? null,
    models: { "hand-built": (now): Terms => {
      const { lands, seconds } = record(now.sight.report.ledger, action.name), dealt = lands * Math.max(now.blows.left, now.blows.right);
      return { duration: now.apart / walk.pace(now) + seconds, dealt, taken: now.danger, orders: orderedDealt(now, dealt), exit: { apart: now.reach.apart, down: FOLD_FALLS } };
    } },
    step(now, dt) {
      const { view, report } = now.sight, focus = now.focus!;
      clearance = now.sight.clearance;
      const placement = ground.decide(view, report, focus, state.hand, dt);
      if (!placement) return { move: null, face: walk.facing(now), actions: [] };
      state.hand = placement.hand;
      const asked = { move: null, face: placement.face, ...walkGoal(report.heading, placement.move) };
      if (!placement.allow) return { ...asked, actions: [] };
      const running = live(now);
      if (running) return { ...asked, actions: [{ id: running.id, action: running.action, effector: running.effector, target: structuredClone(running.target) }] };
      const target = targetOf(now), limb = `hand.${placement.hand}`;
      if (!target || !action.effectors.includes(limb) || now.sight.readiness(view, action.name, limb, target, around(now.sight)).kind !== "ready") return { ...asked, actions: [] };
      state.id = now.sight.instance();
      return { ...asked, actions: [{ id: state.id, action: action.name, effector: limb, target: structuredClone(target) }] };
    },
  };
}
