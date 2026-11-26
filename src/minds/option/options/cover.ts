import { hasResource, segmentResource, type Resource } from "../../../skills/framework/action.ts";
import { cos, sin } from "../../../core/math/real.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { coveringHand } from "./cover-hand.ts";
import { STOPS } from "../predictions/by-hand.ts";
import { blocked, READY, NOTHING } from "./readiness.ts";
import type { Situation } from "../contract/situation.ts";
import type { Option } from "../contract/option.ts";
import { GUARDING, holding, PLAIN, type Held } from "./rest.ts";
import { byHand, weaker } from "../../../skills/framework/profile/source.ts";
import type { TakenFrom } from "../contract/terms.ts";
import { type Side, pairedSegment, sidesWith } from "../../../core/bodies/bilateral.ts";

/** No drill measured what a cover keeps off a blow, so a number set by hand says it (`STOPS`). */
const KEPT_OFF = byHand(["STOPS"], "no drill measured what a cover keeps off a blow");

/** Where what a covered hold takes comes from: as the hold's (`held`), and by the cover's number too where a blow is coming for it to keep off. */
const covered = (held: TakenFrom): TakenFrom => (at) => at.predictions.danger.life > 0 ? weaker(held(at), KEPT_OFF) : held(at);

/**
 * **Holding behind a cover** (`Held`): the share of the blow coming that the cover does not keep
 * off gets through, so what it takes is by that number as well as by what any hold's is. The
 * rest is as any hold's (`PLAIN`).
 */
const COVERED: Held = Object.freeze({
  coming: (at: Situation) => (1 - STOPS) * at.predictions.danger.life,
  lying: Object.freeze({ ...PLAIN.lying, taken: covered(PLAIN.lying.taken) }),
  standing: Object.freeze({ ...PLAIN.standing, taken: covered(PLAIN.standing.taken) }),
});

/**
 * **The cover**: one option of a body of `spec`, its target the blow predicted to reach the head
 * (`Situation.incoming`, `READINGS.predicted`), carried out by the hand on the side the blow closes
 * from (`coveringHand`: none where that hand holds a covering face, whose ward is the guard's).
 * On offer while there is such a hand and no action under way holds it, down or standing. It claims the guard (`GUARDING`) and that hand,
 * asks it between the blow and the head, and is priced as holding the body as it is (`holding`)
 * less the share of the blow's life it keeps off (`STOPS` of `Predictions.danger`), at a state with
 * a blow coming; as holding, where the foe's pressure counts the blow already (`ExchangePredictor.danger`). It
 * runs as long as it is held (`Option.open`) and always yields. Its memory is the hand, read once a
 * step. None for a body without hands among `hands` (those its guard covers with, `GuardPart.covers`).
 */
export function covers(spec: BodySpec, hands: readonly string[]): readonly Option[] {
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
  const claimsOf = (side: Side): readonly Resource[] => Object.freeze([segmentResource(pairedSegment("hand", side)), ...GUARDING]);
  const claims: Readonly<Record<Side, readonly Resource[]>> = { left: claimsOf("left"), right: claimsOf("right") };
  const sides = sidesWith(spec, "hand").filter((side) => hands.includes(pairedSegment("hand", side)));
  const option: Option = {
    name: "cover", kind: "cover", state,
    /** The guard, and the hand on the blow's side as the entry last read it. */
    get claims() { return state.hand ? claims[state.hand] : GUARDING; },
    entry: (now) => {
      const side = handAt(now);
      if (side === null || !sides.includes(side)) return OFF;
      return now.sight.report.actions.some((action) => hasResource(action.holds, segmentResource(pairedSegment("hand", side)))) ? HELD : READY;
    },
    open: true, status: () => "yields", begin() {}, end() {},
    model: (at, ask) => at.incoming ? holding(at, ask, COVERED) : null,
    step: (now) => {
      const hand = pairedSegment("hand", handAt(now)!);
      return { asked: { move: null, face: now.sight.report.legs.heading, actions: [], guard: { [hand]: now.incoming! } }, holds: NOTHING };
    },
  };
  return sides.length ? [option] : [];
}
