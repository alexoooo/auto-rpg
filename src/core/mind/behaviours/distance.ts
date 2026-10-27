import { deepFreeze } from "../../state.ts";
import { hypot } from "../../math/real.ts";
import { nonnegative, SPACE, walking, type Behaviour, type BehaviourPart } from "../behaviour-part.ts";
import { number } from "../fields.ts";
import { anyBody } from "../parts.ts";

/** A behaviour that keeps the focus at least `metres` away, within `SPACE.band`. */
interface DistanceConfig<K extends string> { readonly kind: K; readonly metres: number }

/** Back off from the focus where it is nearer than `metres`, less the band; otherwise leave the legs alone. */
function breakClinch(metres: number): Behaviour {
  return { decide(turn) {
    if (turn.legs || !turn.focus) return;
    if (hypot(turn.dx, turn.dz) - metres < -SPACE.band) {
      turn.legs = walking(-turn.dx, -turn.dz, turn.face, turn.pace);
      turn.phase = "break-clinch";
    }
  } };
}

/** **Break clinch**: back off to `metres` from the focus where nearer. */
export const BREAK_CLINCH: BehaviourPart<DistanceConfig<"break-clinch">> = deepFreeze({
  role: "behaviour", label: "Break clinch", stage: "game", phases: { "break-clinch": "Breaking clinch" }, slots: [], defaults: { kind: "break-clinch", metres: .65 },
  fields: [number<DistanceConfig<"break-clinch">, "metres">("metres", "Clearance", 0, 2, .05, "m")],
  keys: { kind: true, metres: true }, fits: anyBody, faults: nonnegative,
  make: (_making, config) => breakClinch(config.metres),
});
