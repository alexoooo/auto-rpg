import { atan2, hypot } from "../../math/real.ts";
import type { BodyView } from "../../body.ts";
import type { BodySpec } from "../../spec/body.ts";
import { paceToward } from "../../control/stance-envelope.ts";
import { clearanceExit, clearMove } from "../clear-step.ts";
import { bodyClearance } from "../sensed-bounds.ts";
import { directMovement } from "../movement.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../intent.ts";

/**
 * A walk keeps its body `margin` m clear of the solids over the next `ahead` m, and its centre
 * `fallen` m from every segment of a fallen body.
 */
const SPACE = Object.freeze({ margin: .08, ahead: .5, fallen: .9 });

type Move = readonly [number, number] | null;

/** What an option asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **How a standing option walks** a body of `spec`: a movement goal, along a ground direction or into
 * a range of its focus, which the body's navigator goes at the speed rule's speed (`travelSpeed`)
 * under its orders' pace, facing as asked; and which way its focus is. Whatever an option asks, the
 * body is kept out of what it must keep clear of (`constrain`).
 */
export function walker(spec: BodySpec) {
  const radius = bodyClearance(spec) + SPACE.margin;
  /** The orders' pace as a ceiling. */
  const ceiling = (now: Situation): Pick<Intent, "pace"> => now.orders?.pace === undefined ? {} : { pace: now.orders.pace };
  /**
   * The speed the rule asks going forward with nothing ahead to stop for, m/s: what the gait holds
   * forward (`paceToward`), under the orders' pace; what an option prices a walk by.
   */
  const pace = (now: Situation): number => {
    const envelope = now.sight.envelope;
    return Math.min(envelope ? paceToward(envelope, 1, 0) : Infinity, now.orders?.pace ?? Infinity);
  };
  /** Along the ground direction (`x`, `z`), facing `face`; standing for no direction. */
  const toward = (now: Situation, x: number, z: number, face: number): Walk =>
    hypot(x, z) > 0 ? { move: null, face, movement: directMovement(x, z), ...ceiling(now) } : { move: null, face };
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
    pace,
    clear,
    /**
     * The walk the body is given for `asked`: out of a solid's clearance or a fallen body's reach
     * (`away`) if it is in one, but `exempt`'s, the body the option means to be near, facing as asked;
     * else `asked`.
     */
    constrain<A extends Walk>(now: Situation, asked: A, exempt: string | null): A {
      const out = away(now, exempt);
      if (!out) return asked;
      const { movement: _, pace: __, travelFacing: ___, ...rest } = asked;
      return { ...rest, ...toward(now, out[0], out[1], asked.face) } as A;
    },
    /** The heading to the focus, or the body's own with none. */
    facing(now: Situation): number {
      const { focus, sight } = now;
      return focus ? atan2(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : sight.report.heading;
    },
    /** A walk along the ground direction (`x`, `z`), facing `face`. */
    toward,
    /** Seek a reachable centre-distance band around the sensed focus, keeping tactical facing. */
    range(now: Situation, near: number, far: number, face: number): Walk {
      const focus = now.focus;
      if (!focus) return { move: null, face };
      return { move: null, face, movement: { kind: "range", focus: focus.id, near, far }, ...ceiling(now) };
    },
  };
}

export type Walker = ReturnType<typeof walker>;
