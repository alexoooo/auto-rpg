import { atan2, cos, hypot, sin } from "../../math/real.ts";
import type { BodySpec } from "../../spec/body.ts";
import { clearanceExit, clearMove } from "../clear-step.ts";
import { bodyClearance } from "../sensed-bounds.ts";
import type { Situation } from "./option.ts";

/**
 * A walk keeps its body `margin` m clear of the solids over the next `ahead` m, and its centre
 * `fallen` m from every segment of a fallen body; with no measured walk it goes at `pace` m/s.
 */
const SPACE = Object.freeze({ margin: .08, ahead: .5, pace: .3, fallen: .9 });

type Move = readonly [number, number] | null;

/**
 * **How a standing option walks** a body of `spec`: toward a ground direction at its fastest walk,
 * no faster than its orders' pace, facing as asked; and which way its focus is. Whatever an option
 * asks, the walk the body is given keeps it out of what it must keep clear of (`constrain`).
 */
export function walker(spec: BodySpec) {
  const radius = bodyClearance(spec) + SPACE.margin;
  const pace = (now: Situation): number => Math.min(now.sight.envelope?.walk.value ?? SPACE.pace, now.orders?.pace ?? Infinity);
  /** Along the ground direction (`x`, `z`) at the walk's pace, as (forward, right) in the body's heading; null for no direction. */
  const along = (now: Situation, x: number, z: number): Move => {
    const distance = hypot(x, z), h = now.sight.report.heading, speed = pace(now);
    return distance > 0 ? [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance] : null;
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
  return {
    radius,
    pace,
    /**
     * The walk the body is given for `move` (forward, right, m/s): out of a solid's clearance or a
     * fallen body's reach (`away`) if it is in one, but `exempt`'s, the body the option means to be
     * near; else `move`, or the nearest to it that keeps clear of the solids (`clearMove`).
     */
    constrain(now: Situation, move: Move, exempt: string | null): Move {
      const out = away(now, exempt), { view, report } = now.sight;
      return clearMove(view.stance.centre, view.senses.solids, report.heading, out ? along(now, out[0], out[1]) : move, radius, SPACE.ahead);
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
  };
}

export type Walker = ReturnType<typeof walker>;
