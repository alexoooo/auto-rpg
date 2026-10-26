import type { BodyView } from "../body.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Window } from "../skills/action.ts";
import { placeMovement, type MovementRequest } from "./movement.ts";

/** Braking begins one second before the centre would enter its window. */
const RESPONSE = 1;

/** How near the window's middle a walk into it counts as arrived, m, unless its caller asks nearer. */
const ARRIVED = .04;

/** Pure geometric admission, in the same ground frame the approach controller uses. */
export function withinActionWindow(view: BodyView, window: Window, heading: number): boolean {
  const dx = window.at[0] - view.stance.centre.x, dz = window.at[2] - view.stance.centre.z;
  const along = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading);
  return along >= window.along[0] && along <= window.along[1] && across >= window.across[0] && across <= window.across[1]
    && Math.abs(wrap(atan2(dx, dz) - heading)) <= window.facing
    && hypot(view.stance.velocity.x, view.stance.velocity.z) <= window.speed;
}

/**
 * Bring a pending target into its declared entry window without taking an action's controls: a
 * place goal at the window's middle, under `ceiling` and no faster than it closes in `RESPONSE`;
 * while that place is more than `travel` m off, the body faces its way there (`travelFacing`), and
 * turns to the target within it. The walk counts as arrived `near` m from that place.
 */
export function approachActionWindow(view: BodyView, window: Window, heading: number, ceiling: number, travel = Infinity, near = ARRIVED): {
  readonly move: null; readonly face: number; readonly movement?: MovementRequest; readonly pace?: number; readonly travelFacing?: true;
} {
  const dx = window.at[0] - view.stance.centre.x, dz = window.at[2] - view.stance.centre.z;
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  const face = atan2(dx, dz) - atan2(across, along);
  if (withinActionWindow(view, window, heading)) return { move: null, face };
  const x = dx - along * sin(face) - across * cos(face), z = dz - along * cos(face) + across * sin(face);
  const distance = hypot(x, z);
  if (distance === 0) return { move: null, face };
  return { move: null, face, movement: placeMovement({ x: view.stance.centre.x + x, z: view.stance.centre.z + z }, near),
    pace: Math.min(Math.max(0, ceiling), distance / RESPONSE), ...(distance > travel ? { travelFacing: true as const } : {}) };
}
