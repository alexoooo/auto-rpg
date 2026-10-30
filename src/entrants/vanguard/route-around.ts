import { cos, sin } from "../../core/math/real.ts";
import type { Orders } from "../../core/mind/orders.ts";
import { engagementWithDetails, type Sight, type Tactics } from "../../core/mind/tactics.ts";

/** Ask the navigator for another point at fighting range when the exact entry point is unreachable. */
export function routeAround(base: Tactics, orders: (sight: Sight) => Orders | null): Tactics {
  const state = { base: base.state ?? null, focus: null as string | null, active: false, decision: "ordinary entry" };
  const engagement = engagementWithDetails(() => base.engagement, () => [{ label: "Entry routing", value: state.decision }]);
  return { ...base, state, engagement, get decision() { return base.decision; },
    decide(sight, dt) {
      const intent = base.decide(sight, dt), view = sight.view, window = base.decision?.approach;
      const foe = view.senses.others.find(foe => foe.id === base.decision?.focus && !foe.out);
      if (!foe || view.down || view.resumed || view.senses.out || orders(sight)?.move !== undefined
        || !window || intent.actions.length) {
        state.decision = !foe ? "no sensed target" : view.down || view.senses.out ? "body unavailable" : view.resumed ? "resumed ordinary entry"
          : orders(sight)?.move !== undefined ? "movement ordered" : intent.actions.length ? "action admitted" : "ordinary entry";
        state.active = false; state.focus = foe?.id ?? null; return intent;
      }
      if (state.focus !== foe.id) { state.focus = foe.id; state.active = false; }
      if (sight.report.navigation?.status === "arrived" && state.active) { state.active = false; state.decision = "alternate entry reached"; return intent; }
      if (sight.report.navigation?.status === "unreachable" && intent.movement?.kind === "place") state.active = true;
      if (!state.active) { state.decision = "ordinary entry"; return intent; }
      state.decision = "alternate range entry: exact entry unreachable";
      const heading = sight.report.heading;
      const offset = (window.at[0] - foe.centre.x) * sin(heading) + (window.at[2] - foe.centre.z) * cos(heading);
      const near = Math.max(0, window.along[0] - offset), far = Math.max(near, window.along[1] - offset);
      return { ...intent, move: null, movement: { kind: "range", focus: foe.id, near, far } };
    },
  };
}
