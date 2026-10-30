import { deepFreeze } from "../../state.ts";
import { walking, type BehaviourPart } from "../behaviour-part.ts";
import { anyBody } from "../../parts/parts.ts";
import { READINGS, threatReader } from "../threat.ts";

/** **Evade**: back away from the focus while a blow is predicted to reach the head, holding the hands from blows. */
interface EvadeConfig { readonly kind: "evade" }

export const EVADE: BehaviourPart<EvadeConfig> = deepFreeze({
  role: "behaviour", label: "Evade incoming contact", stage: "game", phases: { evade: "Evading" }, fields: [], slots: [], defaults: { kind: "evade" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make() {
    const threat = threatReader();
    return { decide(turn) {
      if (turn.legs || !threat.threatOf(turn.sight.view, READINGS.predicted)) return;
      turn.legs = walking(-turn.dx, -turn.dz, turn.face, turn.pace); turn.requested ??= []; turn.evading = true; turn.phase = "evade";
    } };
  },
});
