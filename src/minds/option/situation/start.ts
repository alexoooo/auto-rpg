import { startVelocity } from "../../../skills/framework/profile/numbers.ts";
import type { Situation } from "../contract/situation.ts";

/** Still: the start's velocity with no focus. */
const AT_REST: readonly [number, number] = Object.freeze([0, 0]) as readonly [number, number];

/**
 * **The start's velocity at `now`** (`startVelocity`, what a profile reads a start by): the body's
 * velocity (`velocity`) against the focus's, along the line from where it stands to the focus and
 * across it, which reads the same from the focus; still with no focus.
 */
export function startOf(now: Pick<Situation, "focus" | "where" | "velocity">): readonly [number, number] {
  const focus = now.focus;
  return focus ? startVelocity({ x: focus.centre.x - now.where.x, z: focus.centre.z - now.where.z },
    { x: now.velocity.x - focus.velocity.x, z: now.velocity.z - focus.velocity.z }) : AT_REST;
}
