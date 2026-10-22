import { cos, sin } from "../../math/real.ts";
import type { Orders } from "../../mind/orders.ts";
import type { Sight, Tactics } from "../../mind/tactics.ts";

/** Ask the navigator for another point at fighting range when the exact entry point is unreachable. */
export function routeAround(base: Tactics, orders: (sight: Sight) => Orders | null): Tactics {
  const state = { base: base.state ?? null, focus: null as string | null, active: false };
  return { ...base, state, get engagement() { return base.engagement; },
    decide(sight, dt) {
      const intent = base.decide(sight, dt), view = sight.view, engagement = base.engagement;
      const foe = view.senses.others.find(foe => foe.id === engagement?.focus && !foe.out);
      const pending = engagement?.candidates?.find(candidate => candidate.key === engagement.pending?.key);
      if (!foe || view.down || view.resumed || view.senses.out || orders(sight)?.move !== undefined
        || engagement?.phase !== "approach" || intent.actions.length || pending?.readiness.kind !== "position") {
        state.active = false; state.focus = foe?.id ?? null; return intent;
      }
      if (state.focus !== foe.id) { state.focus = foe.id; state.active = false; }
      if (sight.report.navigation?.status === "arrived" && state.active) { state.active = false; return intent; }
      if (sight.report.navigation?.status === "unreachable" && intent.movement?.kind === "place") state.active = true;
      if (!state.active) return intent;
      const window = pending.readiness.window, heading = sight.report.heading;
      const offset = (window.at[0] - foe.centre.x) * sin(heading) + (window.at[2] - foe.centre.z) * cos(heading);
      const near = Math.max(0, window.along[0] - offset), far = Math.max(near, window.along[1] - offset);
      return { ...intent, move: null, movement: { kind: "range", focus: foe.id, near, far } };
    },
  };
}
