import { atan2, cos, hypot, sin } from "../../math/real.ts";
import type { BodySpec } from "../../spec/body.ts";
import { clearMove } from "../clear-step.ts";
import { bodyClearance } from "../sensed-bounds.ts";
import type { Situation } from "./option.ts";

/** A walk keeps its body `margin` m clear of the solids over the next `ahead` m; with no measured walk it goes at `pace` m/s. */
const SPACE = Object.freeze({ margin: .08, ahead: .5, pace: .3 });

/**
 * **How a standing option walks** a body of `spec`: toward a ground direction at its fastest walk,
 * no faster than its orders' pace, steered clear of the solids, facing as asked; and which way its
 * focus is.
 */
export function walker(spec: BodySpec) {
  const radius = bodyClearance(spec) + SPACE.margin;
  const pace = (now: Situation): number => Math.min(now.sight.envelope?.walk.value ?? SPACE.pace, now.orders?.pace ?? Infinity);
  /** `move` (forward, right, m/s), or the nearest to it that keeps clear of the solids (`clearMove`). */
  const steer = (now: Situation, move: readonly [number, number] | null): readonly [number, number] | null =>
    clearMove(now.sight.view.stance.centre, now.sight.view.senses.solids, now.sight.report.heading, move, radius, SPACE.ahead);
  return {
    radius,
    pace,
    steer,
    /** The heading to the focus, or the body's own with none. */
    facing(now: Situation): number {
      const { focus, sight } = now;
      return focus ? atan2(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : sight.report.heading;
    },
    /** A walk along the ground direction (`x`, `z`), facing `face`. */
    toward(now: Situation, x: number, z: number, face: number): { readonly move: readonly [number, number] | null; readonly face: number } {
      const distance = hypot(x, z), h = now.sight.report.heading, speed = pace(now);
      const move: readonly [number, number] | null = distance > 0
        ? [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance] : null;
      return { move: steer(now, move), face };
    },
  };
}

export type Walker = ReturnType<typeof walker>;
