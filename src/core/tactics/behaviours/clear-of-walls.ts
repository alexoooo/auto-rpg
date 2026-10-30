import { deepFreeze } from "../../state.ts";
import { walking, type BehaviourPart } from "../behaviour-part.ts";
import { anyBody } from "../../parts/parts.ts";

/** **Clear walls**: step out of a solid's clearance the shortest way out, as the body's navigator finds it (`Clearance.exit`). */
interface ClearOfWallsConfig { readonly kind: "clear-of-walls" }

export const CLEAR_OF_WALLS: BehaviourPart<ClearOfWallsConfig> = deepFreeze({
  role: "behaviour", label: "Clear walls", stage: "game", phases: { clear: "Making room" }, fields: [], slots: [], defaults: { kind: "clear-of-walls" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make() {
    return { decide(turn) {
      if (turn.legs) return;
      const exit = turn.sight.clearance.exit(turn.sight.view);
      if (exit) { turn.legs = walking(exit[0], exit[1], turn.face, turn.pace); turn.phase = "clear"; }
    } };
  },
});
