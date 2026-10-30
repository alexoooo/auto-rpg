import type { Orders } from "../../core/mind/orders.ts";
import { clearMove } from "../../core/mind/clear-step.ts";
import { bodyClearance, lowOpponent } from "../../core/mind/sensed-bounds.ts";
import { engagementWithDetails, type Sight, type Tactics } from "../../core/mind/tactics.ts";
import type { BodySpec } from "../../core/spec/body.ts";
import { cos, sin } from "../../core/math/real.ts";
import { limitPace } from "./pace.ts";

/** Two blocked strokes ask for a one-second lateral step at 0.3 m/s, with a half-second clearance sweep. */
const BLOCKS = 2, SECONDS = 1, PACE = .3, AHEAD = .5;

/** Change the standing attack's angle after consecutive blocks, without interrupting a live stroke. */
export function flank(base: Tactics, spec: BodySpec, orders: (sight: Sight) => Orders | null): Tactics {
  const state = { base: base.state ?? null, sequence: 0, blocked: 0, until: 0, side: -1,
    focus: null as string | null, covers: [] as string[], time: 0, decision: "waiting for blocks" };
  const radius = bodyClearance(spec) + .05;
  const engagement = engagementWithDetails(() => base.engagement, () => [
    { label: "Blocked step", value: state.decision },
    { label: "Consecutive blocks", value: String(state.blocked) },
    ...state.decision === "stepping" ? [{ label: "Lateral step", value: `${state.side < 0 ? "left" : "right"} · ${Math.max(0, state.until - state.time).toFixed(2)} s remaining` }] : [],
  ]);
  return { ...base, state, engagement, get decision() { return base.decision; },
    decide(sight, dt) {
      const intent = base.decide(sight, dt), view = sight.view, ordered = orders(sight);
      state.time = view.time;
      const foe = view.senses.others.find(foe => foe.id === base.decision?.focus && !foe.out);
      if (state.focus !== (foe?.id ?? null)) {
        state.focus = foe?.id ?? null; state.blocked = 0; state.until = 0; state.covers = [];
      }
      if (view.resumed) {
        state.blocked = 0; state.until = 0; state.covers = [];
        state.sequence = sight.report.ledger.at(-1)?.sequence ?? 0;
      }
      for (const record of sight.report.ledger) if (record.sequence > state.sequence) {
        state.sequence = record.sequence;
        if (record.target.body !== foe?.id || !record.committed) continue;
        if (record.contacts.counts.commit.target > 0) state.blocked = 0;
        else if (record.contacts.counts.commit.block > 0) { state.blocked++; state.covers = [...record.contacts.blockedSegments]; }
      }
      if (!foe || lowOpponent(view, foe) || view.down || view.senses.out || ordered?.move !== undefined) {
        state.decision = !foe ? "no sensed target" : view.down || view.senses.out ? "body unavailable"
          : lowOpponent(view, foe) ? "low target" : "movement ordered";
        state.blocked = 0; state.until = 0; return intent;
      }
      if (sight.report.actions.length) { state.decision = "waiting for stroke release"; return intent; }
      if (state.blocked >= BLOCKS && view.time >= state.until) {
        state.blocked = 0; state.until = view.time + SECONDS;
        let widest = 0;
        for (const name of state.covers) {
          const part = foe.segments.get(name);
          if (!part) continue;
          const across = (part.centre.x - foe.centre.x) * cos(sight.report.heading) - (part.centre.z - foe.centre.z) * sin(sight.report.heading);
          if (Math.abs(across) > Math.abs(widest)) widest = across;
        }
        if (widest !== 0) state.side = widest > 0 ? -1 : 1;
      }
      if (view.time >= state.until) { state.decision = view.resumed ? "resumed without a step" : "waiting for blocks"; return intent; }
      state.decision = "stepping";
      const move = clearMove(view.stance.centre, view.senses.solids, sight.report.heading, [0, state.side * PACE], radius, AHEAD);
      return limitPace({ ...intent, move, movement: undefined, actions: [] }, ordered, PACE);
    },
  };
}
