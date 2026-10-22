import { deepFreeze } from "../../state.ts";
import { hypot } from "../../math/real.ts";
import { rangeOf } from "../../skills/strike.ts";
import { nonnegative, walking, type BehaviourPart } from "../behaviour-part.ts";
import { number } from "../fields.ts";
import { takesCommands } from "../parts.ts";

/**
 * **Hold the reach edge**: against a two-handed focus, while nothing is under way or ready, stand
 * just outside its reach, within `band` m; after `patience` s there, it lets the next behaviour lead.
 */
interface EdgeConfig { readonly kind: "edge"; readonly band: number; readonly patience: number }

export const EDGE: BehaviourPart<EdgeConfig> = deepFreeze({
  role: "behaviour", label: "Hold reach edge", stage: "game", slots: [], defaults: { kind: "edge", band: .25, patience: 4 },
  fields: [number<EdgeConfig, "band">("band", "Reach margin", 0, 1, .05, "m"), number<EdgeConfig, "patience">("patience", "Patience", 0, 120, .1, "s")],
  keys: { kind: true, band: true, patience: true }, fits: takesCommands, faults: nonnegative,
  make(_making, config) {
    const state = { since: null as number | null };
    return { state, refocus() { state.since = null; }, decide(turn) {
      const { focus, sight } = turn;
      if (turn.legs || !focus || focus.down || !focus.spec.effectors?.some(effector => effector.segment === "hand.left")
        || !focus.spec.effectors.some(effector => effector.segment === "hand.right") || sight.report.actions.length || turn.pending?.readiness.kind === "ready") return;
      const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
      const reach = rangeOf(focus.spec, "right", mine.y - theirs.y), outside = reach.reach + reach.along[1];
      const apart = hypot(theirs.x - mine.x, theirs.z - mine.z);
      if (apart >= outside && apart <= outside + config.band) state.since ??= sight.view.time;
      else if (state.since === null || sight.view.time - state.since < config.patience) state.since = null;
      if (state.since !== null && sight.view.time - state.since >= config.patience) return;
      const near = Math.max(0, outside + hypot(turn.dx, turn.dz) - apart);
      turn.legs = apart > outside + config.band ? { move: null, face: turn.face, movement: { kind: "range", focus: focus.id, near, far: near + config.band }, ...(turn.pace === undefined ? {} : { pace: turn.pace }) }
        : apart < outside ? walking(-turn.dx, -turn.dz, turn.face, turn.pace) : { move: null, face: turn.face };
      turn.phase = "edge";
    } };
  },
});
