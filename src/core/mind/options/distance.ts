import { atan2, hypot } from "../../math/real.ts";
import type { Situation, StandingOption } from "./option.ts";
import { CLINCH, clinched, exposed, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** How far ahead keeping a distance is priced, s. */
const AHEAD = 1;

/** How far past its bounds a correction carries on before it has run its course, m. */
const BAND = .1;

/** A distance to keep from the focus. */
interface Goal {
  readonly name: string;
  /** The focus it is kept from: standing, down, or either. */
  readonly foe: "standing" | "down" | "any";
  /** Measured to the focus's centre of mass, or to the nearest centre of its segments. */
  readonly to: "centre" | "segment";
  /** It backs off while nearer than this, m. */
  readonly near: number;
  /** It closes while farther than this, m; Infinity never closes. */
  readonly far: number;
  /**
   * A correction is on offer only out of its bounds, and has run its course `BAND` m inside them;
   * a keeping is on offer whenever its foe is, and stands still within them.
   */
  readonly correcting: boolean;
  /** Whether it faces the focus, or turns its back on it. */
  readonly facing: "foe" | "away";
}

/** The heading `facing` asks for, the focus (`x`, `z`) away along the ground. */
function facing(how: Goal["facing"], x: number, z: number): number {
  switch (how) {
    case "foe": return atan2(x, z);
    case "away": return atan2(-x, -z);
    default: { const never: never = how; throw new Error(`unknown facing ${JSON.stringify(never)}`); }
  }
}

/**
 * **Set distance**: keep from the focus as `goal` says, facing it or away: backing off while nearer than
 * its near bound, closing while farther than its far one (a correction, until `BAND` m inside
 * them), standing still between. It always yields, and asks for no blow. Its model: a correction
 * walks to `BAND` m inside its bounds, a keeping goes on `AHEAD` s, through the blow coming and
 * the focus's reach while it stands in it; a correction that ends out of a clinch (`CLINCH`) leaves
 * its chance of going down behind.
 */
export function setDistance(goal: Goal, walk: Walker): StandingOption {
  const apart = (now: Situation): number => {
    const { focus } = now, centre = now.sight.view.stance.centre;
    if (!focus) return Infinity;
    if (goal.to === "centre") return now.apart;
    let near = Infinity;
    for (const segment of focus.segments.values()) near = Math.min(near, hypot(segment.centre.x - centre.x, segment.centre.z - centre.z));
    return near;
  };
  const kept = (now: Situation): boolean => !!now.focus && (goal.foe === "any" || (goal.foe === "down") === now.focus.down);
  const outside = (now: Situation, margin: number): boolean => { const d = apart(now); return d < goal.near + margin || d > goal.far - margin; };
  return {
    name: goal.name, posture: "standing", state: {},
    available: (now) => !now.down && kept(now) && (!goal.correcting || outside(now, 0)),
    yields: () => true,
    ended: (now) => goal.correcting && !outside(now, BAND),
    begin() {},
    end() {},
    models: { "hand-built": (now): Terms => {
      const d = apart(now), to = d < goal.near + BAND ? goal.near + BAND : d > goal.far - BAND ? goal.far - BAND : d;
      const duration = goal.correcting ? Math.abs(to - d) / walk.pace(now) : AHEAD, after = now.reach.apart + to - d;
      const leaves = goal.correcting && goal.near >= CLINCH.within;
      return { duration, dealt: 0, taken: now.danger + exposed(now, duration, Math.min(now.reach.apart, after)), orders: 0, fall: leaves ? 0 : clinched(now, duration) };
    } },
    step(now) {
      const d = apart(now), focus = now.focus!, centre = now.sight.view.stance.centre;
      const x = focus.centre.x - centre.x, z = focus.centre.z - centre.z, margin = goal.correcting ? BAND : 0;
      const face = facing(goal.facing, x, z);
      if (d < goal.near + margin) return { ...walk.toward(now, -x, -z, face), actions: [] };
      if (d > goal.far - margin) return { ...walk.toward(now, x, z, face), actions: [] };
      return { move: null, face, actions: [] };
    },
  };
}
