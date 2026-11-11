import { hasResource, segmentResource } from "../../skills/framework/action.ts";
import { cos, sin } from "../../core/math/real.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { coveringHand } from "./cover-hand.ts";
import type { Resource } from "../../skills/framework/action.ts";
import { blocked, READY, type Situation, type Option } from "./option.ts";
import { NOTHING } from "../choice.ts";
import { holding } from "./rest.ts";
import { type Side, pairedSegment, sidesWith } from "../../core/bodies/bilateral.ts";

/** The share of a blow's life on the head a cover keeps off. */
const STOPS = .6;

/**
 * **The cover**: one option of a body of `spec`, its target the blow predicted to reach the head
 * (`Situation.incoming`, `READINGS.predicted`), carried out by the hand on the side the blow closes
 * from (`coveringHand`: none where that hand holds a covering face, whose ward is the guard's).
 * On offer while there is such a hand and no action under way holds it, down or standing. It claims that hand,
 * asks it between the blow and the head, and is priced as holding the body as it is (`holding`)
 * less the share of the blow's life it keeps off (`STOPS` of `Predictions.danger`), at a state with
 * a blow coming. It runs as long as it is held (`Option.open`) and always yields. Its memory is
 * the hand, read once a step. None for a body without hands.
 */
export function covers(spec: BodySpec): readonly Option[] {
  const state = { read: -Infinity, hand: null as Side | null };
  /** The blow at `now`, once a step: which hand covers it, or null where none does. The blow is asked for at each call, so a chooser watches it (`Cues`). */
  const handAt = (now: Situation): Side | null => {
    const threat = now.incoming;
    if (state.read === now.time) return state.hand;
    state.read = now.time; state.hand = null;
    if (!threat) return null;
    const h = now.sight.report.legs.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
    return state.hand = coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left");
  };
  const OFF = blocked("no blow for a hand to cover"), HELD = blocked("an action holds the covering hand");
  const claims: Readonly<Record<Side, readonly Resource[]>> = { left: Object.freeze([segmentResource(pairedSegment("hand", "left"))]), right: Object.freeze([segmentResource(pairedSegment("hand", "right"))]) };
  const sides = sidesWith(spec, "hand");
  const option: Option = {
    name: "cover", state,
    /** The hand on the blow's side, as the entry last read it. */
    get claims() { return state.hand ? claims[state.hand] : NOTHING; },
    entry: (now) => {
      const side = handAt(now);
      if (side === null || !sides.includes(side)) return OFF;
      return now.sight.report.actions.some((action) => hasResource(action.holds, segmentResource(pairedSegment("hand", side)))) ? HELD : READY;
    },
    open: true, status: () => "yields", begin() {}, end() {},
    model: (at, ask) => at.incoming ? holding(at, ask, (1 - STOPS) * at.predictions.danger) : null,
    step: (now) => {
      const hand = pairedSegment("hand", handAt(now)!);
      return { asked: { move: null, face: now.sight.report.legs.heading, actions: [], guard: { [hand]: now.incoming! } }, holds: NOTHING };
    },
  };
  return sides.length ? [option] : [];
}
