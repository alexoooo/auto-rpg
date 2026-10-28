import { atan2, hypot } from "../../math/real.ts";
import type { BodySpec } from "../../spec/body.ts";
import { paceToward } from "../../control/stance-envelope.ts";
import { directMovement } from "../movement.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../intent.ts";

/** What an option asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **How a standing option walks** a body of `spec`: a movement goal, along a ground direction or into
 * a range of its focus, which the body's navigator goes at the speed rule's speed (`travelSpeed`)
 * under its orders' pace, facing as asked; and which way its focus is.
 */
export function walker(_spec: BodySpec) {
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
  return {
    pace,
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
