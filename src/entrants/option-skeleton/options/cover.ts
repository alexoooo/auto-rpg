import { cos, sin } from "../../../core/math/real.ts";
import type { BodySpec, Side } from "../../../core/spec/body.ts";
import { coveringHand } from "../../../core/mind/cover-hand.ts";
import type { Resource } from "../../../core/skills/action.ts";
import { blocked, NOTHING, READY, type Situation, type Option } from "./option.ts";
import { here } from "./position.ts";

/** The longest cover holds a hand up against one run of blows, s. */
const LONGEST = 1;

/**
 * The share of a blow's life on the head a cover keeps off: on the Cover drill at `680f281f`
 * (Option Mind on the Warrior, both rungs, 24 trials each, Node, rapier-coordinate, 120 Hz), its covers
 * lost 0.60 hit points on the head where its hands held the guard lost 1.54.
 */
const STOPS = .6;

/**
 * **The cover**: one option of a body of `spec`, its target the blow predicted to reach the head
 * (`Situation.incoming`, `READINGS.predicted`), carried out by the hand on the side the blow closes
 * from (`coveringHand`). On offer while there is such a hand and no action under way holds it,
 * down or standing, for at most `LONGEST` s of one run of blows, then not until the threat has
 * gone. It claims that hand, asks it between the blow and the head, and is priced by the share of
 * the blow's life it keeps off (`STOPS` of `Situation.danger`), leaving the body where it is. It
 * always yields. Its memory is when the run began, whether it is spent, and the hand, read once a
 * step.
 */
export function covers(spec: BodySpec): { readonly options: readonly Option[]; readonly state: object } {
  const state = { read: -Infinity, since: null as number | null, spent: false, hand: null as Side | null };
  /** The run of blows at `now`, once a step: which hand covers it, or null where none does. */
  const handAt = (now: Situation): Side | null => {
    if (state.read === now.time) return state.hand;
    state.read = now.time; state.hand = null;
    const threat = now.incoming;
    if (!threat) { state.since = null; state.spent = false; return null; }
    if (state.spent) return null;
    state.since ??= now.time;
    if (now.time - state.since >= LONGEST) { state.spent = true; return null; }
    const h = now.sight.report.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
    return state.hand = coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left");
  };
  const OFF = blocked("no blow for a hand to cover"), HELD = blocked("an action holds the covering hand");
  const claims: Readonly<Record<Side, readonly Resource[]>> = { left: Object.freeze(["hand.left"]), right: Object.freeze(["hand.right"]) };
  const sides = (["left", "right"] as const).filter((side) => spec.segments.some((segment) => segment.name === `hand.${side}`));
  const option: Option = {
    name: "cover", state: {},
    /** The hand on the blow's side, as the entry last read it. */
    get claims() { return state.hand ? claims[state.hand] : NOTHING; },
    entry: (now) => {
      const side = handAt(now);
      if (side === null || !sides.includes(side)) return OFF;
      return now.sight.report.actions.some((action) => action.holds.includes(`hand.${side}`)) ? HELD : READY;
    },
    status: () => "yields", begin() {}, end() {},
    model: (now) => ({ duration: 0, dealt: 0, taken: (1 - STOPS) * now.predictions.danger, orders: 0, exit: here(now) }),
    step: (now) => ({ asked: { move: null, face: now.sight.report.heading, actions: [], guard: { [`hand.${handAt(now)}`]: now.incoming! } }, holds: NOTHING }),
  };
  return { options: sides.length ? [option] : [], state };
}
