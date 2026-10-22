import type { Orders } from "../../mind/orders.ts";
import { clearMove } from "../../mind/clear-step.ts";
import { bodyClearance, lowOpponent } from "../../mind/sensed-bounds.ts";
import type { Sight, Tactics } from "../../mind/tactics.ts";
import type { BodySpec } from "../../spec/body.ts";
import { cos, sin } from "../../math/real.ts";

/** Two blocked strokes ask for a one-second lateral step at 0.3 m/s, with a half-second clearance sweep. */
const BLOCKS = 2, SECONDS = 1, PACE = .3, AHEAD = .5;

/** Change the standing attack's angle after consecutive blocks, without interrupting a live stroke. */
export function flank(base: Tactics, spec: BodySpec, orders: (sight: Sight) => Orders | null): Tactics {
  const state = { base: base.state ?? null, sequence: 0, blocked: 0, until: 0, side: -1,
    focus: null as string | null, covers: [] as string[] };
  const radius = bodyClearance(spec) + .05;
  return { ...base, state, get engagement() { return base.engagement; },
    decide(sight, dt) {
      const intent = base.decide(sight, dt), view = sight.view;
      const foe = view.senses.others.find(foe => foe.id === base.engagement?.focus && !foe.out);
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
      if (!foe || lowOpponent(view, foe) || view.down || view.senses.out || orders(sight)?.move !== undefined) {
        state.blocked = 0; state.until = 0; return intent;
      }
      if (sight.report.actions.length) return intent;
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
      if (view.time >= state.until) return intent;
      const move = clearMove(view.stance.centre, view.senses.solids, sight.report.heading, [0, state.side * PACE], radius, AHEAD);
      return { ...intent, move, movement: undefined, pace: PACE, actions: [] };
    },
  };
}
