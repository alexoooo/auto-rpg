import { blocked, LEGS, READY, type Situation, type StandingOption } from "./option.ts";
import { threatened } from "./percepts.ts";
import { clinched, type Terms } from "./value.ts";
import type { Readiness } from "../../skills/action.ts";
import type { Walker } from "./walk.ts";
import { toGoal, within, type Goal } from "./goals.ts";

/** How far ahead holding the edge is priced, s, short of its patience. */
const AHEAD = 1;

/** How the edge is held: how long it waits there for the foe to come in, s. */
export interface Edge {
  readonly patience: number;
}

/** How the options fighter holds the edge: waiting there up to two minutes. */
export const EDGE: Edge = Object.freeze({ patience: 120 });

/** The edge: just outside the focus's reach (`Reach.theirs`), by as far as the focus walks in the time the senses show it late (`Situation.closes`). */
const EDGING: Goal = Object.freeze({ near: (now: Situation) => now.reach.theirs, width: (now: Situation) => now.closes });

/**
 * **Hold at the edge**: stand just outside a standing, two-handed foe's reach, head to head, in
 * its band (`EDGING`), walking in from farther and back from nearer, facing it. On offer with no blow of its own under way, until it has waited `patience` s at the edge for
 * the same foe; it has run its course once a blow is `ready`, so that the chooser decides
 * again at once, or once its patience is spent. It is footwork, always yields, and asks for no blow;
 * its exit is the band, where it stands at the edge. Its model:
 * the rest of its patience, at most `AHEAD` s, through the blow coming, and the focus's reach
 * where it stands in it: a foe within reach strikes while it backs away; it leaves the body in its
 * band.
 */
export function holdEdge(edge: Edge, walk: Walker, ready: (now: Situation) => boolean): StandingOption {
  const state = { focus: null as string | null, since: null as number | null };
  const spent = (now: Situation): boolean => state.focus === now.focus?.id && state.since !== null && now.time - state.since >= edge.patience;
  const UNFIT = blocked("no standing, two-handed focus without a blow under way"), SPENT = blocked("its patience is spent");
  const AWAY: Readiness = Object.freeze({ kind: "waiting", reason: "not at the edge" });
  return {
    name: "hold at the edge", posture: "standing", claims: LEGS, state,
    entry(now) {
      const focus = now.focus;
      const fits = !now.down && !!focus && !focus.down && !now.sight.report.actions.length
        && !!focus.spec.effectors?.some((effector) => effector.segment === "hand.left") && !!focus.spec.effectors.some((effector) => effector.segment === "hand.right");
      return !fits ? UNFIT : spent(now) ? SPENT : READY;
    },
    exit: (now) => within(now, EDGING) ? READY : AWAY,
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => spent(now) || ready(now),
    begin(now) { if (state.focus !== now.focus?.id) { state.focus = now.focus?.id ?? null; state.since = null; } },
    end() {},
    model: (now): Terms => {
      const waited = state.focus === now.focus?.id && state.since !== null ? now.time - state.since : 0, duration = Math.min(AHEAD, Math.max(0, edge.patience - waited));
      const near = now.reach.theirs, apart = Math.min(Math.max(now.reach.apart, near), near + now.closes);
      return { duration, dealt: 0, taken: now.danger + threatened(now, duration), orders: 0, exit: { apart, down: clinched(now, duration) } };
    },
    step(now) {
      if (within(now, EDGING)) state.since ??= now.time;
      else if (!spent(now)) state.since = null;
      return { ...toGoal(now, EDGING, walk), actions: [] };
    },
  };
}
