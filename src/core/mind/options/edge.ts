import { blocked, LEGS, READY, type Situation, type StandingOption } from "./option.ts";
import { clinched, exposed, type Terms } from "./value.ts";
import type { Readiness } from "../../skills/action.ts";
import type { Walker } from "./walk.ts";

/** How far ahead holding the edge is priced, s, short of its patience. */
const AHEAD = 1;

/** How the edge is held: how far past the foe's reach it stands, m, and how long it waits there for the foe to come in, s. */
interface Edge {
  readonly band: number;
  readonly patience: number;
}

/** How the options fighter holds the edge: a quarter metre past the foe's reach, waiting there up to two minutes. */
export const EDGE: Edge = Object.freeze({ band: .25, patience: 120 });

/**
 * **The walk to the edge** of the focus's reach (`Reach`), facing it: in from farther than `band` m
 * past its outer bound, head to head, back from inside it, and standing between.
 */
export function toEdge(now: Situation, band: number, walk: Walker): ReturnType<Walker["toward"]> {
  const face = walk.facing(now), { theirs: outside, apart } = now.reach, focus = now.focus!, centre = now.sight.view.stance.centre;
  const x = focus.centre.x - centre.x, z = focus.centre.z - centre.z;
  if (apart > outside + band) {
    const near = Math.max(0, outside + now.apart - apart);
    return walk.range(now, near, near + band, face);
  }
  if (apart < outside) return walk.toward(now, -x, -z, face);
  return { move: null, face };
}

/**
 * **Hold at the edge**: stand just outside a standing, two-handed foe's reach, from its outer
 * bound to `band` m past it, head to head, walking in from farther and back from nearer, facing
 * it. On offer with no blow of its own under way, until it has waited `patience` s at the edge for
 * the same foe; it has run its course once a blow is `ready`, so that the chooser decides
 * again at once, or once its patience is spent. It is footwork, always yields, and asks for no blow;
 * its exit is the band, where it stands at the edge. Its model:
 * the rest of its patience, at most `AHEAD` s, through the blow coming, and the focus's reach
 * where it stands in it: a foe within reach strikes while it backs away.
 */
export function holdEdge(edge: Edge, walk: Walker, ready: (now: Situation) => boolean): StandingOption {
  const state = { focus: null as string | null, since: null as number | null };
  const reach = (now: Situation) => ({ outside: now.reach.theirs, apart: now.reach.apart });
  const spent = (now: Situation): boolean => state.focus === now.focus?.id && state.since !== null && now.time - state.since >= edge.patience;
  const UNFIT = blocked("no standing, two-handed focus without a blow under way"), SPENT = blocked("its patience is spent");
  const AWAY: Readiness = Object.freeze({ kind: "waiting", reason: "not at the edge" });
  return {
    name: "hold at the edge", posture: "standing", layer: "footwork", state,
    entry(now) {
      const focus = now.focus;
      const fits = !now.down && !!focus && !focus.down && !now.sight.report.actions.length
        && !!focus.spec.effectors?.some((effector) => effector.segment === "hand.left") && !!focus.spec.effectors.some((effector) => effector.segment === "hand.right");
      return !fits ? UNFIT : spent(now) ? SPENT : READY;
    },
    exit(now) { const { outside, apart } = reach(now); return apart >= outside && apart <= outside + edge.band ? READY : AWAY; },
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => spent(now) || ready(now),
    begin(now) { if (state.focus !== now.focus?.id) { state.focus = now.focus?.id ?? null; state.since = null; } },
    end() {},
    models: { "hand-built": (now): Terms => {
      const waited = state.focus === now.focus?.id && state.since !== null ? now.time - state.since : 0, duration = Math.min(AHEAD, Math.max(0, edge.patience - waited));
      return { duration, dealt: 0, taken: now.danger + exposed(now, duration), orders: 0, fall: clinched(now, duration) };
    } },
    step(now) {
      const { outside, apart } = reach(now);
      if (apart >= outside && apart <= outside + edge.band) state.since ??= now.time;
      else if (!spent(now)) state.since = null;
      return { ...toEdge(now, edge.band, walk), actions: [] };
    },
  };
}
