import { deepFreeze } from "../../state.ts";
import type { BehaviourPart } from "../behaviour-part.ts";
import type { Clearance } from "../../navigation/clear-step.ts";
import { groundPosition } from "../../perception/downed/position.ts";
import { walkGoal } from "../../intent/movement.ts";
import { anyBody } from "../../parts/parts.ts";
import { lowOpponent } from "../../navigation/sensed-bounds.ts";

/** **Ground positioning**: against a low focus, place the body for a lowered action (`groundPosition`), choosing its hand. */
interface GroundConfig { readonly kind: "ground" }

export const GROUND: BehaviourPart<GroundConfig> = deepFreeze({
  role: "behaviour", label: "Ground positioning", stage: "game", fields: [], slots: [], defaults: { kind: "ground" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make({ spec, actions }) {
    // Its walks are kept clear by the body's navigator (`Sight.clearance`), read at each decision.
    let clearance: Clearance | null = null;
    const ground = groundPosition(spec, (view, heading, move) => clearance!.keepClear(view, heading, move));
    return { state: ground.state, refocus: ground.reset, interrupted: ground.reset, decide(turn) {
      const { focus, sight } = turn;
      clearance = sight.clearance;
      if (turn.legs || !focus || !(lowOpponent(sight.view, focus) || ground.state.near.active || ground.state.wide.active)) return;
      const candidates = turn.ranked().filter(candidate => candidate.eligible && actions.find(action => action.name === candidate.action)?.lower !== undefined);
      const selected = candidates.find(candidate => candidate.key === turn.pending?.key) ?? candidates[0];
      if (!selected) return;
      const placement = ground.decide(sight.view, sight.report, focus, selected.effector === "hand.left" ? "left" : "right", turn.dt);
      if (!placement) return;
      const candidate = candidates.find(candidate => candidate.effector === `hand.${placement.hand}`) ?? selected;
      turn.choose(candidate); turn.recheck(candidate);
      turn.legs = { move: null, face: placement.face, ...walkGoal(sight.report.heading, placement.move) }; turn.phase = ground.state.phase;
      if (!placement.allow) turn.requested ??= [];
    } };
  },
});
