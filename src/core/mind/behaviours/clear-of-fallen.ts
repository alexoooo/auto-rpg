import { deepFreeze } from "../../state.ts";
import { hypot } from "../../math/real.ts";
import { SPACE, walking, type BehaviourPart } from "../behaviour-part.ts";
import { takesCommands } from "../parts.ts";

/** **Clear fallen bodies**: with the focus down, back off to `SPACE.fallen` m of its nearest segment and hold the hands. */
interface ClearOfFallenConfig { readonly kind: "clear-of-fallen" }

export const CLEAR_OF_FALLEN: BehaviourPart<ClearOfFallenConfig> = deepFreeze({
  role: "behaviour", label: "Clear fallen bodies", stage: "game", fields: [], slots: [], defaults: { kind: "clear-of-fallen" },
  keys: { kind: true }, fits: takesCommands, faults: () => [],
  make: () => ({ decide(turn) {
    const { focus } = turn;
    if (turn.legs || !focus?.down) return;
    const centre = turn.sight.view.stance.centre;
    let near = Infinity; for (const segment of focus.segments.values()) near = Math.min(near, hypot(segment.centre.x - centre.x, segment.centre.z - centre.z));
    turn.legs = near < SPACE.fallen ? walking(-turn.dx, -turn.dz, turn.face, turn.pace) : { move: null, face: turn.face }; turn.requested ??= []; turn.phase = "clear";
  } }),
});
