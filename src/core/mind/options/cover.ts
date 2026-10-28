import { cos, sin } from "../../math/real.ts";
import type { Resource } from "../../skills/action.ts";
import type { BodySpec } from "../../spec/body.ts";
import { coveringHand } from "../cover-hand.ts";
import type { Cover } from "../intent.ts";
import type { Situation } from "./option.ts";

/** The longest cover holds a hand up against one run of blows, s. */
const LONGEST = 1;

/**
 * **Cover**: the hand layer's skill, chosen each step for a free hand. The hand on the side a foe's
 * blow closes on the head from (`Situation.threat`, the side's `coveringHand` of `spec`) goes
 * between the two while it is free, for at most `LONGEST` s of one run of blows, then not until the
 * threat has gone. Its memory is when the run began and whether it is spent.
 */
export function cover(spec: BodySpec) {
  const state = { since: null as number | null, spent: false };
  return {
    name: "cover", state,
    /** The cover for the hand it takes now, of those not in `held` and held by no blow; null for none. */
    step(now: Situation, held: readonly Resource[]): Readonly<Record<string, Cover>> | null {
      const threat = now.threat;
      if (!threat) { state.since = null; state.spent = false; return null; }
      if (state.spent) return null;
      state.since ??= now.time;
      if (now.time - state.since >= LONGEST) { state.spent = true; return null; }
      const h = now.sight.report.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
      const hand = `hand.${coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left")}`;
      if (held.includes(hand) || now.sight.report.actions.some((action) => action.holds.includes(hand))) return null;
      return { [hand]: threat };
    },
  };
}
