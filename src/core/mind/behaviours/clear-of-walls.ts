import { deepFreeze } from "../../state.ts";
import { footRadius, walking, type BehaviourPart } from "../behaviour-part.ts";
import { clearanceExit } from "../clear-step.ts";
import { takesCommands } from "../parts.ts";

/** **Clear walls**: step out of a solid's clearance (`footRadius`) the shortest way out. */
interface ClearOfWallsConfig { readonly kind: "clear-of-walls" }

export const CLEAR_OF_WALLS: BehaviourPart<ClearOfWallsConfig> = deepFreeze({
  role: "behaviour", label: "Clear walls", stage: "game", fields: [], slots: [], defaults: { kind: "clear-of-walls" },
  keys: { kind: true }, fits: takesCommands, faults: () => [],
  make({ spec }) {
    const radius = footRadius(spec);
    return { decide(turn) {
      if (turn.legs) return;
      const centre = turn.sight.view.stance.centre, exit = clearanceExit([centre.x, centre.y, centre.z], radius, turn.sight.view.senses.solids ?? []);
      if (exit) { turn.legs = walking(exit[0], exit[1], turn.face, turn.pace); turn.phase = "clear"; }
    } };
  },
});
