import { deepFreeze } from "../../state.ts";
import { atan2 } from "../../math/real.ts";
import { walking, type BehaviourPart } from "../behaviour-part.ts";
import { anyBody } from "../parts.ts";

/** **Run away** from the focus, facing away. */
interface FleeConfig { readonly kind: "flee" }

export const FLEE: BehaviourPart<FleeConfig> = deepFreeze({
  role: "behaviour", label: "Run away", stage: "game", fields: [], slots: [], defaults: { kind: "flee" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make: () => ({ decide(turn) {
    if (turn.legs || !turn.focus) return;
    turn.legs = walking(-turn.dx, -turn.dz, atan2(-turn.dx, -turn.dz), turn.pace); turn.phase = "flee";
  } }),
});
