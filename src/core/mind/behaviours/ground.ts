import { deepFreeze } from "../../state.ts";
import { footRadius, SPACE, type BehaviourPart } from "../behaviour-part.ts";
import { clearMove } from "../clear-step.ts";
import { groundPosition } from "../ground-position.ts";
import { walkGoal } from "../movement.ts";
import { takesCommands } from "../parts.ts";
import { lowOpponent } from "../sensed-bounds.ts";

/** **Ground positioning**: against a low focus, place the body for a lowered action (`groundPosition`), choosing its hand. */
interface GroundConfig { readonly kind: "ground" }

export const GROUND: BehaviourPart<GroundConfig> = deepFreeze({
  role: "behaviour", label: "Ground positioning", stage: "game", fields: [], slots: [], defaults: { kind: "ground" },
  keys: { kind: true }, fits: takesCommands, faults: () => [],
  make({ spec, actions }) {
    const radius = footRadius(spec);
    const ground = groundPosition(spec, (view, heading, move) => clearMove(view.stance.centre, view.senses.solids, heading, move, radius, SPACE.ahead), {}, true);
    return { state: ground.state, refocus: ground.reset, interrupted: ground.reset, decide(turn) {
      const { focus, sight } = turn;
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
