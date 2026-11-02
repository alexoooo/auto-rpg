import type { BodyView } from "../body.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Window } from "../skills/framework/action.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { groundRoute } from "../perception/downed/route.ts";
import { placeMovement, type GroundPoint, type MovementRequest } from "./movement.ts";
import type { BodySense } from "../mind/senses.ts";
import { lyingAxis } from "./targets.ts";
import { stepObstacle } from "../navigation/sensed-bounds.ts";
import { CROWD } from "../navigation/crowd.ts";
import { hold, letGo, stillHeld, unheld, type Drift, type Held } from "../mind/held.ts";

/** Braking begins one second before the centre would enter its window. */
const RESPONSE = 1;

/** **The pace of a walk into a window**, m/s: `ceiling`, braking to arrive as it closes the `distance` left, m, in `RESPONSE`. */
export const approachPace = (ceiling: number, distance: number): number => Math.min(Math.max(0, ceiling), distance / RESPONSE);

/** How near the window's middle a walk into it counts as arrived, m, unless its caller asks nearer: about where a walk's last step lands. */
export const ARRIVED = .04;

/**
 * A walk into a window on a body lying (`Window.on`): how far each foot's middle keeps from that
 * body's colliders, m, past its sole's reach from its middle (a Warrior's sole is 0.26 m long), so
 * no foot stands on a limb, up to how high over the ground, m (a shin to the knee,
 * read at its foot, middle and top), how many bearings about the window's target it tries for a
 * place where both feet are clear of them; what a turn of the body's facing to a place's costs
 * beside the walk there, m a radian, and how far ahead of the body's motion the walk is reckoned
 * from, s, so a place the body has turned or set off toward stays its choice.
 */
const LYING = Object.freeze({ footRadius: .18, column: .5, bearings: 16, turn: .25, lead: .5, shift: .2, rethink: 1 });

/** Pure geometric admission, in the same ground frame the approach controller uses. */
export function withinActionWindow(view: BodyView, window: Window, heading: number): boolean {
  return windowHolds(window, view.stance.centre.x, view.stance.centre.z, heading)
    && hypot(view.stance.velocity.x, view.stance.velocity.z) <= window.speed;
}

/** **Whether a body still at (`x`, `z`) on the ground, facing `heading`, stands within `window`**: its target ahead and aside within its bands, and within its facing. */
export function windowHolds(window: Window, x: number, z: number, heading: number): boolean {
  const dx = window.at[0] - x, dz = window.at[2] - z;
  const along = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading);
  return along >= window.along[0] && along <= window.along[1] && across >= window.across[0] && across <= window.across[1]
    && Math.abs(wrap(atan2(dx, dz) - heading)) <= window.facing;
}

/**
 * **Where a body at `from` stands with `window`'s middle on it**, walking straight: the ground point
 * and the way it faces there, rad. What a body tells of its window, a leader can walk it to.
 */
export function straightSpot(window: Window, from: GroundPoint): { readonly x: number; readonly z: number; readonly face: number } {
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  const face = atan2(window.at[0] - from.x, window.at[2] - from.z) - atan2(across, along);
  return { x: window.at[0] - along * sin(face) - across * cos(face), z: window.at[2] - along * cos(face) + across * sin(face), face };
}

/**
 * **A spot**: where a walk ends on the ground (`x`, `z`) and the way the body faces there (`face`,
 * rad); where the walk goes round a body, the way there (`route`, its last point the spot) and that
 * body (`by`, `MovementRequest`'s).
 */
export interface Spot {
  readonly x: number;
  readonly z: number;
  readonly face: number;
  readonly route?: readonly GroundPoint[];
  readonly by?: string;
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
 * **A place beside a body lying, held** (`Held`): the place chosen, its ground x, z and facing, and
 * its way there, plain data in its walker's state. It is chosen again when another body lies under
 * the window, that body's centre moves `CROWD.settled` m, the window's target `LYING.shift` m (more
 * than a stride moves the sole a kick's window is read from), the place's feet or its way stop
 * clearing that body, or `LYING.rethink` s pass.
 */
export interface HeldBeside {
  readonly held: Held;
  readonly place: number[];
  readonly route: number[][];
}

/** A place beside a body lying with none held. */
export const heldBeside = (): HeldBeside => ({ held: unheld(), place: [], route: [] });

/**
 * Where a walk into `window` on the body `lying` stands, and its way there: of the places turned
 * about the window's target, `LYING.bearings` of them from facing along that body (`lyingAxis`), so
 * they stay put while it lies still,
 * those where each foot, as far to its side as the soles stand now, keeps `LYING.footRadius` clear
 * of that body's colliders over its column (`stepObstacle`), the one whose way round that
 * body over the column, from where the body's motion carries it `LYING.lead` s on, and turn from
 * `heading` to its facing cost least (a walk along its way, turning to it, keeps it the cheapest);
 * null where none is. With `kept`, the place it holds while it holds (`HeldBeside`).
 */
function besideLying(view: BodyView, window: Window, lying: BodySense, heading: number, kept?: HeldBeside): Beside | null {
  const obstacle = stepObstacle(view, lying), clear = obstacle.clear, axis = lyingAxis(lying), { soles, centre } = view.stance, y = view.stance.support.y;
  const width = hypot(soles.left.x - soles.right.x, soles.left.z - soles.right.z) / 2, velocity = view.stance.velocity;
  const from: Vec3 = [centre.x + velocity.x * LYING.lead, y, centre.z + velocity.z * LYING.lead];
  const stands = (x: number, z: number): boolean => {
    for (let h = 0; h <= 2; h++) {
      const foot: Vec3 = [x, y + h * LYING.column / 2, z];
      if (!clear(foot, foot, LYING.footRadius)) return false;
    }
    return true;
  };
  // Each foot of a place facing `face` at (`x`, `z`), as far to its side as the soles stand now, clear.
  const feetClear = (x: number, z: number, face: number): boolean => {
    const rx = cos(face), rz = -sin(face);
    return stands(x - width * rx, z - width * rz) && stands(x + width * rx, z + width * rz);
  };
  const drift: readonly Drift[] | null = kept ? [{ at: [lying.centre.x, lying.centre.z], within: CROWD.settled }, { at: [window.at[0], window.at[2]], within: LYING.shift }] : null;
  if (kept && drift) {
    const [x, z, face] = kept.place as [number, number, number];
    // The way still clears the body over its column, from where the body is carried to through each point.
    const wayClear = (): boolean => {
      let past: Vec3 = from;
      for (const point of kept.route) {
        for (let h = 0; h <= 2; h++) {
          const lift = h * LYING.column / 2;
          if (!clear([past[0], y + lift, past[2]], [point[0]!, y + lift, point[2]!], LYING.footRadius)) return false;
        }
        past = point as unknown as Vec3;
      }
      return true;
    };
    if (stillHeld(kept.held, view.time, LYING.rethink, lying.id, drift, () => feetClear(x, z, face) && wayClear()))
      return { offset: { x: x - centre.x, z: z - centre.z, face }, route: kept.route.map((point) => [point[0]!, point[1]!, point[2]!] as Vec3), by: lying.id };
  }
  let best: Beside | null = null, least = Infinity;
  for (let k = 0; k < LYING.bearings; k++) {
    const at = offsetAt(view, window, axis + k * 2 * Math.PI / LYING.bearings);
    const x = centre.x + at.x, z = centre.z + at.z;
    if (!feetClear(x, z, at.face)) continue;
    const route = groundRoute(obstacle, from, [x, y, z], LYING.footRadius, LYING.column);
    if (!route) continue;
    let walked = 0, past = from;
    for (const point of route) { walked += hypot(point[0] - past[0], point[2] - past[2]); past = point; }
    const cost = walked + LYING.turn * Math.abs(wrap(at.face - heading));
    if (cost < least) { best = { offset: at, route, by: lying.id }; least = cost; }
  }
  if (kept && drift) {
    if (!best) letGo(kept.held);
    else {
      kept.place.length = 0; kept.place.push(centre.x + best.offset.x, centre.z + best.offset.z, best.offset.face);
      kept.route.length = 0; for (const point of best.route) kept.route.push([point[0], point[1], point[2]]);
      hold(kept.held, view.time, lying.id, drift);
    }
  }
  return best;
}

/** Where a walk into `window` stands: beside the body its target is on, where that body lies (`besideLying`, held in `kept` where given); else straight (`windowOffset`), `beside` null. */
function placeOf(view: BodyView, window: Window, heading: number, kept?: HeldBeside): { readonly offset: Offset; readonly beside: Beside | null } {
  const lying = lyingUnder(view, window), beside = lying && besideLying(view, window, lying, heading, kept);
  return { offset: beside ? beside.offset : windowOffset(view, window), beside };
}

/** **Where a walk into `window` stands** (`approachActionWindow`), from where the body stands facing `heading`, as a spot: beside the body its target is on where that body lies, with the way round it, held in `kept` where given (`HeldBeside`). */
export function windowSpot(view: BodyView, window: Window, heading: number, kept?: HeldBeside): Spot {
  const { offset: { x, z, face }, beside } = placeOf(view, window, heading, kept), centre = view.stance.centre;
  const at = { x: centre.x + x, z: centre.z + z, face };
  return beside ? { ...at, route: beside.route.map((point) => ({ x: point[0], z: point[2] })), by: beside.by } : at;
}

/**
 * **A walk to `spot`**, facing `face`: a place goal there (its route where it has one) under
 * `ceiling` and no faster than it closes in `RESPONSE`, which counts as arrived `near` m from it;
 * standing once within that.
 */
export function approachSpot(view: BodyView, spot: Spot, ceiling: number, face: number, near = ARRIVED): {
  readonly move: null; readonly face: number; readonly movement?: MovementRequest; readonly pace?: number;
} {
  const distance = hypot(spot.x - view.stance.centre.x, spot.z - view.stance.centre.z);
  if (distance <= near) return { move: null, face };
  const movement: MovementRequest = spot.route ? { kind: "place", points: spot.route.map((point) => ({ x: point.x, z: point.z })), near, ...(spot.by === undefined ? {} : { by: spot.by }) }
    : placeMovement({ x: spot.x, z: spot.z }, near);
  return { move: null, face, movement, pace: approachPace(ceiling, distance) };
}

/**
 * Bring a pending target into its declared entry window without taking an action's controls: a
 * place goal at the window's middle, under `ceiling` and no faster than it closes in `RESPONSE`;
 * while that place is more than `travel` m off, the body faces its way there (`travelFacing`), and
 * turns to the target within it. On a body lying, the place is beside it and the walk goes round it
 * (`besideLying`), held in `kept` where given (`HeldBeside`). The walk counts as arrived `near` m
 * from that place.
 */
export function approachActionWindow(view: BodyView, window: Window, heading: number, ceiling: number, travel = Infinity, near = ARRIVED, kept?: HeldBeside): {
  readonly move: null; readonly face: number; readonly movement?: MovementRequest; readonly pace?: number; readonly travelFacing?: true;
} {
  const { offset: { x, z, face }, beside } = placeOf(view, window, heading, kept);
  if (withinActionWindow(view, window, heading)) return { move: null, face };
  const distance = hypot(x, z);
  if (distance === 0) return { move: null, face };
  // Beside a body lying, its way round that body, which is not kept off as a fallen one (`MovementRequest`'s `by`).
  const movement: MovementRequest = beside ? { kind: "place", points: beside.route.map((point) => ({ x: point[0], z: point[2] })), near, by: beside.by }
    : placeMovement({ x: view.stance.centre.x + x, z: view.stance.centre.z + z }, near);
  return { move: null, face, movement,
    pace: approachPace(ceiling, distance), ...(distance > travel ? { travelFacing: true as const } : {}) };
}
