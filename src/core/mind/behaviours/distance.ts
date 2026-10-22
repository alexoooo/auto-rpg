import { deepFreeze } from "../../state.ts";
import { hypot } from "../../math/real.ts";
import { nonnegative, SPACE, walking, type Behaviour, type BehaviourPart } from "../behaviour-part.ts";
import { number } from "../fields.ts";
import { anyBody } from "../parts.ts";

/** A behaviour that holds the focus `metres` away, within `SPACE.band`. */
interface DistanceConfig<K extends string> { readonly kind: K; readonly metres: number }

/**
 * What a distance behaviour of `kind` does: it advances where too far unless it only breaks a
 * clinch, retreats where too near unless it only closes in, and otherwise stands unless it only
 * breaks a clinch.
 */
function distance(kind: "close-in" | "keep-distance" | "break-clinch", metres: number): Behaviour {
  return { decide(turn) {
    const { focus } = turn;
    if (turn.legs || !focus) return;
    const delta = hypot(turn.dx, turn.dz) - metres;
    const retreat = delta < -SPACE.band && kind !== "close-in";
    const advance = delta > SPACE.band && kind !== "break-clinch";
    if (retreat || advance) {
      turn.legs = advance ? { move: null, face: turn.face, movement: { kind: "range" as const, focus: focus.id, near: Math.max(0, metres - SPACE.band), far: metres + SPACE.band }, ...(turn.pace === undefined ? {} : { pace: turn.pace }) }
        : walking(-turn.dx, -turn.dz, turn.face, turn.pace);
      turn.phase = kind;
    }
    else if (kind !== "break-clinch") turn.legs = { move: null, face: turn.face };
  } };
}

/** **Close in** to `metres` from the focus. */
export const CLOSE_IN: BehaviourPart<DistanceConfig<"close-in">> = deepFreeze({
  role: "behaviour", label: "Close in", stage: "game", phases: { "close-in": "Closing in" }, slots: [], defaults: { kind: "close-in", metres: .6 },
  fields: [number<DistanceConfig<"close-in">, "metres">("metres", "Distance", 0, 5, .1, "m")],
  keys: { kind: true, metres: true }, fits: anyBody, faults: nonnegative,
  make: (_making, config) => distance(config.kind, config.metres),
});

/** **Keep distance**: hold `metres` from the focus. */
export const KEEP_DISTANCE: BehaviourPart<DistanceConfig<"keep-distance">> = deepFreeze({
  role: "behaviour", label: "Keep distance", stage: "game", phases: { "keep-distance": "Keeping distance" }, slots: [], defaults: { kind: "keep-distance", metres: 2.5 },
  fields: [number<DistanceConfig<"keep-distance">, "metres">("metres", "Distance", 0, 10, .1, "m")],
  keys: { kind: true, metres: true }, fits: anyBody, faults: nonnegative,
  make: (_making, config) => distance(config.kind, config.metres),
});

/** **Break clinch**: back off to `metres` from the focus where nearer. */
export const BREAK_CLINCH: BehaviourPart<DistanceConfig<"break-clinch">> = deepFreeze({
  role: "behaviour", label: "Break clinch", stage: "game", phases: { "break-clinch": "Breaking clinch" }, slots: [], defaults: { kind: "break-clinch", metres: .65 },
  fields: [number<DistanceConfig<"break-clinch">, "metres">("metres", "Clearance", 0, 2, .05, "m")],
  keys: { kind: true, metres: true }, fits: anyBody, faults: nonnegative,
  make: (_making, config) => distance(config.kind, config.metres),
});
