import { hypot } from "../../math/real.ts";
import { rangeOf } from "../../skills/strike.ts";
import type { Situation, StandingOption } from "./option.ts";
import type { Walker } from "./walk.ts";

/** How the edge is held: how far past the foe's reach it stands, m, and how long it waits there for the foe to come in, s. */
interface Edge {
  readonly band: number;
  readonly patience: number;
}

/**
 * **Hold at the edge**: stand just outside a standing, two-handed foe's reach, from its outer
 * bound to `band` m past it, head to head, walking in from farther and back from nearer, facing
 * it. On offer with no blow of its own under way, until it has waited `patience` s at the edge for
 * the same foe; it has run its course once a blow is `ready`, so that the meta-controller decides
 * again at once, or once its patience is spent. It always yields, and asks for no blow.
 */
export function holdEdge(edge: Edge, walk: Walker, ready: (now: Situation) => boolean): StandingOption {
  const state = { focus: null as string | null, since: null as number | null };
  const reach = (now: Situation) => {
    const focus = now.focus!, mine = now.sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
    const range = rangeOf(focus.spec, "right", mine.y - theirs.y);
    return { outside: range.reach + range.along[1], apart: hypot(theirs.x - mine.x, theirs.z - mine.z) };
  };
  const spent = (now: Situation): boolean => state.focus === now.focus?.id && state.since !== null && now.time - state.since >= edge.patience;
  return {
    name: "hold at the edge", posture: "standing", state,
    available(now) {
      const focus = now.focus;
      return !now.down && !!focus && !focus.down && !now.sight.report.actions.length && !spent(now)
        && !!focus.spec.effectors?.some((effector) => effector.segment === "hand.left") && !!focus.spec.effectors.some((effector) => effector.segment === "hand.right");
    },
    yields: () => true,
    ended: (now) => spent(now) || ready(now),
    begin(now) { if (state.focus !== now.focus?.id) { state.focus = now.focus?.id ?? null; state.since = null; } },
    end() {},
    step(now) {
      const face = walk.facing(now), { outside, apart } = reach(now), focus = now.focus!, centre = now.sight.view.stance.centre;
      if (apart >= outside && apart <= outside + edge.band) state.since ??= now.time;
      else if (!spent(now)) state.since = null;
      const x = focus.centre.x - centre.x, z = focus.centre.z - centre.z;
      if (apart > outside + edge.band) return { ...walk.toward(now, x, z, face), actions: [] };
      if (apart < outside) return { ...walk.toward(now, -x, -z, face), actions: [] };
      return { move: null, face, actions: [] };
    },
  };
}
