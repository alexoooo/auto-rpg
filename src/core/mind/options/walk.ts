import { atan2, cos, hypot, sin } from "../../math/real.ts";
import type { BodyView } from "../../body.ts";
import type { BodySpec } from "../../spec/body.ts";
import { paceToward } from "../../control/stance-envelope.ts";
import { clearanceExit, clearMove } from "../clear-step.ts";
import { bodyClearance } from "../sensed-bounds.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../intent.ts";

/**
 * A walk keeps its body `margin` m clear of the solids over the next `ahead` m, and its centre
 * `fallen` m from every segment of a fallen body; with no measured walk it goes at `pace` m/s. Going
 * toward a place, it goes at the fastest that held `share` of its trials that way, and no faster
 * than it slows from to its walk before it, at `brake` m/s².
 */
const SPACE = Object.freeze({ margin: .08, ahead: .5, pace: .3, fallen: .9, brake: .3, share: .8 });

type Move = readonly [number, number] | null;

/**
 * **How a standing option walks** a body of `spec`: along a ground direction at its fastest walk,
 * and to a place at the fastest that held `SPACE.share` of its trials that way (`paceToward`), no slower than that walk and
 * no faster than it slows from to that walk before the place (`SPACE.brake`), so that a gait that runs runs to what
 * is far; either no faster than its orders' pace, facing as asked; and which way its focus is. Whatever an option
 * asks, the walk the body is given keeps it out of what it must keep clear of (`constrain`).
 */
export function walker(spec: BodySpec) {
  const radius = bodyClearance(spec) + SPACE.margin;
  const pace = (now: Situation): number => Math.min(now.sight.envelope?.walk.value ?? SPACE.pace, now.orders?.pace ?? Infinity);
  /** Along the ground direction (`x`, `z`) at `speed`, as (forward, right) in the body's heading; null for no direction. */
  const along = (now: Situation, x: number, z: number, speed = pace(now)): Move => {
    const distance = hypot(x, z), h = now.sight.report.heading;
    return distance > 0 ? [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance] : null;
  };
  /** The pace toward the place (`x`, `z`) from the body: as fast as its walk holds that way and it slows from to its walk before it, but no slower than its walk. */
  const going = (now: Situation, x: number, z: number): number => {
    const envelope = now.sight.envelope, h = now.sight.report.heading, distance = hypot(x, z);
    if (!envelope || distance === 0) return pace(now);
    const holds = paceToward(envelope, (x * sin(h) + z * cos(h)) / distance, (x * cos(h) - z * sin(h)) / distance, SPACE.share);
    const walk = pace(now);
    return Math.min(Math.max(walk, Math.min(holds, Math.sqrt(walk * walk + 2 * SPACE.brake * distance))), now.orders?.pace ?? Infinity);
  };
  /**
   * The ground direction out of what the body must keep clear of: a solid's clearance it stands
   * in, else the nearest segment within `fallen` m of a fallen body other than `exempt`; null with
   * neither.
   */
  const away = (now: Situation, exempt: string | null): readonly [number, number] | null => {
    const { centre } = now.sight.view.stance, { solids, others } = now.sight.view.senses;
    const exit = clearanceExit([centre.x, centre.y, centre.z], radius, solids ?? []);
    if (exit) return exit;
    let near: number = SPACE.fallen, from: { readonly x: number; readonly z: number } | null = null;
    for (const other of others) {
      if (!other.down || other.id === exempt) continue;
      for (const segment of other.segments.values()) {
        const distance = hypot(segment.centre.x - centre.x, segment.centre.z - centre.z);
        if (distance < near) { near = distance; from = segment.centre; }
      }
    }
    return from ? [centre.x - from.x, centre.z - from.z] : null;
  };
  /** `move` (forward, right, m/s) for a body heading `heading`, or the nearest to it that keeps clear of the solids. */
  const clear = (view: BodyView, heading: number, move: Move): Move => clearMove(view.stance.centre, view.senses.solids, heading, move, radius, SPACE.ahead);
  return {
    radius,
    pace,
    /** The pace it goes to the place (`x`, `z`) from the body: the fastest its walk holds that way and it stops from before it, but no slower than its walk. */
    paceTo: going,
    clear,
    /**
     * The walk the body is given for `move` (forward, right, m/s): out of a solid's clearance or a
     * fallen body's reach (`away`) if it is in one, but `exempt`'s, the body the option means to be
     * near; else `move`, or the nearest to it that keeps clear of the solids (`clearMove`).
     */
    constrain(now: Situation, move: Move, exempt: string | null): Move {
      const out = away(now, exempt), { view, report } = now.sight;
      return out ? clear(view, report.heading, along(now, out[0], out[1])) : move;
    },
    /** The heading to the focus, or the body's own with none. */
    facing(now: Situation): number {
      const { focus, sight } = now;
      return focus ? atan2(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : sight.report.heading;
    },
    /** A walk along the ground direction (`x`, `z`), facing `face`. */
    toward(now: Situation, x: number, z: number, face: number): { readonly move: Move; readonly face: number } {
      return { move: along(now, x, z), face };
    },
    /** Seek a reachable centre-distance band around the sensed focus, keeping tactical facing. */
    range(now: Situation, near: number, far: number, face: number): Pick<Intent, "move" | "face" | "movement" | "pace"> {
      const focus = now.focus;
      if (!focus) return { move: null, face };
      const centre = now.sight.view.stance.centre, x = focus.centre.x - centre.x, z = focus.centre.z - centre.z, speed = going(now, x, z);
      return { move: along(now, x, z, speed), face, pace: speed, movement: { kind: "range", focus: focus.id, near, far } };
    },
  };
}

export type Walker = ReturnType<typeof walker>;
