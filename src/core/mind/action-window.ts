import type { BodyView } from "../body.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Window } from "../skills/action.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { groundRoute } from "./ground-route.ts";
import { placeMovement, type MovementRequest } from "./movement.ts";
import { sensedFootClearance } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import { lyingAxis } from "./targets.ts";

/** Braking begins one second before the centre would enter its window. */
const RESPONSE = 1;

/** How near the window's middle a walk into it counts as arrived, m, unless its caller asks nearer. */
const ARRIVED = .04;

/**
 * A walk into a window on a body lying (`Window.on`): how far each foot keeps from that body's
 * colliders, m, as the ground approach's do, up to how high over the ground, m (a shin to the knee,
 * read at its foot, middle and top), how many bearings about the window's target it tries for a
 * place where both feet are clear of them; what a turn of the body's facing to a place's costs
 * beside the walk there, m a radian, and how far ahead of the body's motion the walk is reckoned
 * from, s, so a place the body has turned or set off toward stays its choice.
 */
const LYING = Object.freeze({ footRadius: .12, column: .5, bearings: 16, turn: .25, lead: .5 });

/** Pure geometric admission, in the same ground frame the approach controller uses. */
export function withinActionWindow(view: BodyView, window: Window, heading: number): boolean {
  const dx = window.at[0] - view.stance.centre.x, dz = window.at[2] - view.stance.centre.z;
  const along = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading);
  return along >= window.along[0] && along <= window.along[1] && across >= window.across[0] && across <= window.across[1]
    && Math.abs(wrap(atan2(dx, dz) - heading)) <= window.facing
    && hypot(view.stance.velocity.x, view.stance.velocity.z) <= window.speed;
}

type Offset = { readonly x: number; readonly z: number; readonly face: number };

/** The ground offset from the body's centre to where it stands facing `face` with `window`'s middle on it: x, z and the facing, rad. */
function offsetAt(view: BodyView, window: Window, face: number): Offset {
  const dx = window.at[0] - view.stance.centre.x, dz = window.at[2] - view.stance.centre.z;
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  return { x: dx - along * sin(face) - across * cos(face), z: dz - along * cos(face) + across * sin(face), face };
}

/** The ground offset from the body's centre to `window`'s middle, as a walk into it straight faces (`offsetAt`). */
function windowOffset(view: BodyView, window: Window): Offset {
  const dx = window.at[0] - view.stance.centre.x, dz = window.at[2] - view.stance.centre.z;
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  return offsetAt(view, window, atan2(dx, dz) - atan2(across, along));
}

/** The body `window`'s target is on (`Window.on`), where it lies; null where it names none or that body stands. */
function lyingUnder(view: BodyView, window: Window): BodySense | null {
  if (window.on === undefined) return null;
  return view.senses.others.find((other) => other.id === window.on && other.down) ?? null;
}

/** A place beside a body lying: its offset from the body's centre, the way there round that body (`groundRoute`) and that body. */
type Beside = { readonly offset: Offset; readonly route: readonly Vec3[]; readonly by: string };

/**
 * Where a walk into `window` on the body `lying` stands, and its way there: of the places turned
 * about the window's target, `LYING.bearings` of them from facing along that body (`lyingAxis`), so
 * they stay put while it lies still,
 * those where each foot, as far to its side as the soles stand now, keeps `LYING.footRadius` clear
 * of that body's colliders over its column (`sensedFootClearance`), the one whose way round that
 * body over the column, from where the body's motion carries it `LYING.lead` s on, and turn from
 * `heading` to its facing cost least (a walk along its way, turning to it, keeps it the cheapest);
 * null where none is.
 */
function besideLying(view: BodyView, window: Window, lying: BodySense, heading: number): Beside | null {
  const clear = sensedFootClearance(lying), axis = lyingAxis(lying), { soles, centre } = view.stance, y = view.stance.support.y;
  const width = hypot(soles.left.x - soles.right.x, soles.left.z - soles.right.z) / 2, velocity = view.stance.velocity;
  const from: Vec3 = [centre.x + velocity.x * LYING.lead, y, centre.z + velocity.z * LYING.lead];
  const stands = (x: number, z: number): boolean => {
    for (let h = 0; h <= 2; h++) {
      const foot: Vec3 = [x, y + h * LYING.column / 2, z];
      if (!clear(foot, foot, LYING.footRadius)) return false;
    }
    return true;
  };
  let best: Beside | null = null, least = Infinity;
  for (let k = 0; k < LYING.bearings; k++) {
    const at = offsetAt(view, window, axis + k * 2 * Math.PI / LYING.bearings);
    const x = centre.x + at.x, z = centre.z + at.z, rx = cos(at.face), rz = -sin(at.face);
    if (!stands(x - width * rx, z - width * rz) || !stands(x + width * rx, z + width * rz)) continue;
    const route = groundRoute(lying, from, [x, y, z], LYING.footRadius, LYING.column);
    if (!route) continue;
    let walked = 0, past = from;
    for (const point of route) { walked += hypot(point[0] - past[0], point[2] - past[2]); past = point; }
    const cost = walked + LYING.turn * Math.abs(wrap(at.face - heading));
    if (cost < least) { best = { offset: at, route, by: lying.id }; least = cost; }
  }
  return best;
}

/** Where a walk into `window` stands: beside the body its target is on, where that body lies (`besideLying`); else straight (`windowOffset`), `beside` null. */
function placeOf(view: BodyView, window: Window, heading: number): { readonly offset: Offset; readonly beside: Beside | null } {
  const lying = lyingUnder(view, window), beside = lying && besideLying(view, window, lying, heading);
  return { offset: beside ? beside.offset : windowOffset(view, window), beside };
}

/** **How far a walk into `window` goes** from where the body stands facing `heading` (`approachActionWindow`), m across the ground, straight to its place. */
export function windowDistance(view: BodyView, window: Window, heading: number): number {
  const { x, z } = placeOf(view, window, heading).offset;
  return hypot(x, z);
}

/**
 * Bring a pending target into its declared entry window without taking an action's controls: a
 * place goal at the window's middle, under `ceiling` and no faster than it closes in `RESPONSE`;
 * while that place is more than `travel` m off, the body faces its way there (`travelFacing`), and
 * turns to the target within it. On a body lying, the place is beside it and the walk goes round it
 * (`besideLying`). The walk counts as arrived `near` m from that place.
 */
export function approachActionWindow(view: BodyView, window: Window, heading: number, ceiling: number, travel = Infinity, near = ARRIVED): {
  readonly move: null; readonly face: number; readonly movement?: MovementRequest; readonly pace?: number; readonly travelFacing?: true;
} {
  const { offset: { x, z, face }, beside } = placeOf(view, window, heading);
  if (withinActionWindow(view, window, heading)) return { move: null, face };
  const distance = hypot(x, z);
  if (distance === 0) return { move: null, face };
  // Beside a body lying, its way round that body, which is not kept off as a fallen one (`MovementRequest`'s `by`).
  const movement: MovementRequest = beside ? { kind: "place", points: beside.route.map((point) => ({ x: point[0], z: point[2] })), near, by: beside.by }
    : placeMovement({ x: view.stance.centre.x + x, z: view.stance.centre.z + z }, near);
  return { move: null, face, movement,
    pace: Math.min(Math.max(0, ceiling), distance / RESPONSE), ...(distance > travel ? { travelFacing: true as const } : {}) };
}
