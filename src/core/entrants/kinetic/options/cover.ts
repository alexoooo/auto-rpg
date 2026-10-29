import { cos, sin } from "../../../math/real.ts";
import type { BodySpec, Side } from "../../../spec/body.ts";
import { coveringHand } from "../../../mind/cover-hand.ts";
import { blocked, NOTHING, READY, type Situation, type Option } from "./option.ts";
import { here } from "./position.ts";

/** The longest cover holds a hand up against one run of blows, s. */
const LONGEST = 1;

/**
 * The share of a blow's life on the head a cover keeps off: on the Cover drill at `680f281f`
 * (Kinetic on the Warrior, both rungs, 24 trials each, Node, rapier-coordinate, 120 Hz), its covers
 * lost 0.60 hit points on the head where its hands held the guard lost 1.54.
 */
const STOPS = .6;

/**
 * **The covers**: an option for each hand of `spec`, its target the blow predicted to reach the
 * head (`Situation.incoming`, `READINGS.predicted`). A hand's is on offer while it is the one on the side the blow closes from
 * (`coveringHand`) and no action under way holds it, for at most `LONGEST` s of one run of blows,
 * then not until the threat has gone. It claims its hand, asks it between the blow and the head,
 * and is priced by the share of the blow's life it keeps off (`STOPS` of `Situation.danger`),
 * leaving the body where it is. It always yields. Their memory is when the run began and whether
 * it is spent, read once a step.
 */
export function covers(spec: BodySpec): { readonly options: readonly Option[]; readonly state: object } {
  const state = { read: -Infinity, since: null as number | null, spent: false, hand: null as Side | null };
  /** The run of blows at `now`, once a step: which hand covers it, or null where none does. */
  const handAt = (now: Situation): Side | null => {
    if (state.read === now.time) return state.hand;
    state.read = now.time; state.hand = null;
    const threat = now.incoming;
    if (now.down || !threat) { state.since = null; state.spent = false; return null; }
    if (state.spent) return null;
    state.since ??= now.time;
    if (now.time - state.since >= LONGEST) { state.spent = true; return null; }
    const h = now.sight.report.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
    return state.hand = coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left");
  };
  const option = (side: Side): Option => {
    const hand = `hand.${side}`, OFF = blocked(`no blow for the ${side} hand to cover`), HELD = blocked(`an action holds the ${side} hand`);
    return {
      name: `cover ${side}`, claims: Object.freeze([hand]), state: {},
      entry: (now) => handAt(now) !== side ? OFF : now.sight.report.actions.some((action) => action.holds.includes(hand)) ? HELD : READY,
      status: () => "yields", begin() {}, end() {},
      model: (now) => ({ duration: 0, dealt: 0, taken: (1 - STOPS) * now.danger, orders: 0, exit: here(now) }),
      step: (now) => ({ asked: { move: null, face: now.sight.report.heading, actions: [], guard: { [hand]: now.incoming! } }, holds: NOTHING }),
    };
  };
  const sides = (["left", "right"] as const).filter((side) => spec.segments.some((segment) => segment.name === `hand.${side}`));
  return { options: sides.map(option), state };
}
