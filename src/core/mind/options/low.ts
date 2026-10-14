import type { Side, BodySpec } from "../../spec/body.ts";
import type { Region, TargetRef } from "../../skills/action.ts";
import { regionSegments } from "../action-aim.ts";
import type { ActionConfig } from "../config.ts";
import { groundPosition } from "../ground-position.ts";
import { lowOpponent } from "../sensed-bounds.ts";
import type { Situation, StandingOption } from "./option.ts";
import { around } from "./strike.ts";
import type { Walker } from "./walk.ts";

/**
 * **Strike a low foe**: `action`, a blow from low support, at the focus while it is down or low,
 * from beside it (`groundPosition`): walking there, lowering through the support fold and striking
 * once placed, then rising. It is on offer while the focus is low or the placement is under way,
 * and yields only before the placement begins; its walk need not keep out of the focus's reach.
 */
export function strikeLow(action: ActionConfig, spec: BodySpec, walk: Walker): StandingOption {
  const ground = groundPosition(spec, walk.clear, {}, true);
  const state = { ground: ground.state, hand: "right" as Side, id: null as number | null };
  const placing = (): boolean => ground.state.near.active || ground.state.wide.active;
  const low = (now: Situation): boolean => !now.down && !!now.focus && (lowOpponent(now.sight.view, now.focus) || placing());
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const targetOf = (now: Situation): TargetRef | null => {
    const focus = now.focus!, region = action.regions.find((r: Region) => regionSegments(focus.spec, r).length > 0);
    return region ? { kind: "body", body: focus.id, region } : null;
  };
  return {
    name: "strike a low foe", posture: "standing", state,
    available: low,
    yields: () => !placing(),
    ended: (now) => !low(now),
    begin() { state.id = null; },
    end() { ground.reset(); state.id = null; },
    near: (now) => now.focus?.id ?? null,
    step(now, dt) {
      const { view, report } = now.sight, focus = now.focus!;
      const placement = ground.decide(view, report, focus, state.hand, dt);
      if (!placement) return { move: null, face: walk.facing(now), actions: [] };
      state.hand = placement.hand;
      const asked = { move: placement.move, face: placement.face };
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
