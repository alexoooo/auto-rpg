import type { BodyView } from "../../control/body.ts";
import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import { wrap } from "../../core/math/turn.ts";
import type { Window } from "../framework/action.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import { groundRoute } from "../perception/downed/route.ts";
import { ARRIVED, placeMovement, stands, SWAY, type GroundPoint, type MovementRequest } from "./movement.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import { lyingAxis } from "./targets.ts";
import { stepObstacle } from "../locomotion/navigation/sensed-bounds.ts";
import { CROWD } from "../locomotion/navigation/crowd.ts";
import { hold, letGo, stillHeld, unheld, type Drift, type Held } from "../../control/held.ts";

/** Braking begins one second before the centre would enter its window. */
const RESPONSE = 1;

/**
 * **The pace of a walk to a spot**, m/s: `ceiling`, braking to arrive as it closes the `distance`
 * left, m, in `RESPONSE`, where the place it walks to moves along the way there at `drift` m/s (a
 * foe coming on, less than 0), so that the two closing on each other close it in that time; none
 * where the place comes on that fast itself. What the legs go on once asked to slow is the speed
 * rule's to count (`travelSpeed`, `Locomotion.lag`).
 */
export const approachPace = (ceiling: number, distance: number, drift = 0): number =>
  Math.max(0, Math.min(ceiling, distance / RESPONSE + drift));

/**
 * A walk into a window on a body lying (`Window.on`): how far each foot's middle keeps from that
 * body's colliders, m, past its sole's reach from its middle (a Warrior's sole is 0.26 m long), so
 * no foot stands on a limb, up to how high over the ground, m (a shin to the knee,
 * read at its foot, middle and top), how many bearings about the window's target it tries for a
 * place where both feet are clear of them, and, where none is in the window's middle, how far back
 * from it a place is tried at a time and at most, m (a lying body is about 1.8 m long); what a turn
 * of the body's facing to a place's costs beside the walk there, m a radian, and how far ahead of
 * the body's motion the walk is reckoned from, s, so a place the body has turned or set off toward
 * stays its choice.
 */
const LYING = Object.freeze({ footRadius: .18, column: .5, bearings: 16, back: .1, farthest: 1, turn: .25, lead: .5, shift: .2, rethink: 1 });

/** The most speed over the ground a standing body has once a walk's sway has died out, m/s. */
export const SETTLED = .06;

/** How long a body stays that slow before it counts as settled, s: a centre of mass slows that long before the feet stop stepping. */
export const STILL_FOR = .25;

/** `window` widened by `by` m along and across. */
export function widened(window: Window, by: number): Window {
  return { ...window, along: [window.along[0] - by, window.along[1] + by], across: [window.across[0] - by, window.across[1] + by] };
}

/**
 * **A walk into a window as it ends**: since when its body has been at most `SETTLED` fast (null
 * while it moves faster), and whether it has arrived (`arrivedIn`); plain data in its walker's state.
 */
export interface WindowArrival { still: number | null; arrived: boolean }

/** A walk into a window that has not arrived. */
export const windowArrival = (): WindowArrival => ({ still: null, arrived: false });

/** **Whether a body `speed` m/s over the ground at `time` s has stayed at most `SETTLED` fast for `STILL_FOR` s**, as `arrival` keeps it: read once a step. */
export function settledAt(arrival: WindowArrival, speed: number, time: number): boolean {
  arrival.still = speed > SETTLED ? null : arrival.still ?? time;
  return arrival.still !== null && time - arrival.still >= STILL_FOR;
}

/**
 * **Whether a body at (`x`, `z`) facing `heading`, walking into `window`, has arrived**, as
 * `arrival` keeps it: come within `near` of its place, `distance` m off (`stands`), it stays
 * arrived while it sways no further than `SWAY` out of the window, until it stands `settled`
 * outside the window itself, when it walks again. A body stopped at the window's edge is admitted
 * where the action reaches least, and one walked again for each centimetre it sways steps on and
 * never settles.
 */
export function arrivedIn(arrival: WindowArrival, window: Window, x: number, z: number, heading: number, distance: number, settled: boolean, near = ARRIVED): boolean {
  arrival.arrived = arrival.arrived ? windowHolds(widened(window, SWAY), x, z, heading) && !(settled && !windowHolds(window, x, z, heading)) : stands(distance, near, false);
  return arrival.arrived;
}

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
 * **Where in `window` a body at (`x`, `z`) on the ground, facing `heading`, stands**: its target's
 * offset from the window's middle, ahead along `heading` and across to its right, m, as
 * `windowHolds` reads the two (0, 0 at the middle).
 */
export function placeInWindow(window: Window, x: number, z: number, heading: number): [number, number] {
  const dx = window.at[0] - x, dz = window.at[2] - z;
  return [dx * sin(heading) + dz * cos(heading) - (window.along[0] + window.along[1]) / 2, dx * cos(heading) - dz * sin(heading) - (window.across[0] + window.across[1]) / 2];
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
 * body (`by`, `MovementRequest`'s). The body stands there (`atSpot`) within `near` m of it
 * (`ARRIVED` unless given), facing within `facing` rad of its way where that is given, and a walk to
 * it (`approachSpot`) arrives there. Where the spot moves with a body, its `velocity` on the ground, m/s.
 */
export interface Spot {
  readonly x: number;
  readonly z: number;
  readonly face: number;
  readonly route?: readonly GroundPoint[];
  readonly by?: string;
  readonly near?: number;
  readonly facing?: number;
  readonly velocity?: GroundPoint;
}

/** **Whether a body at (`x`, `z`) facing `heading` stands at `spot`** (`Spot`): within its `near`, facing within its `facing` where it names one. */
export function atSpot(spot: Spot, x: number, z: number, heading: number): boolean {
  return hypot(spot.x - x, spot.z - z) <= (spot.near ?? ARRIVED) && (spot.facing === undefined || Math.abs(wrap(spot.face - heading)) <= spot.facing);
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
 * than a stride moves the sole a stomp's window is read from), the place's feet or its way stop
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
 * **A side of a body's length**: 1 to its right, -1 to its left, as it lies facing along its length
 * from its base to its head (`lyingAxis`). A window on a body lying has a spot on each; one on a
 * body standing, one, side 1's (`windowSpot`).
 */
export type Side = 1 | -1;

/** The sides of a body's length (`Side`). */
export const SIDES: readonly Side[] = Object.freeze([1, -1]);

/**
 * Where a walk into `window` on the body `lying` stands, and its way there: of the places turned
 * about the window's target, `LYING.bearings` of them from facing along that body (`lyingAxis`), so
 * they stay put while it lies still,
 * those where each foot, as far to its side as the soles stand now, keeps `LYING.footRadius` clear
 * of that body's colliders over its column (`stepObstacle`), backed off from the window's middle
 * `LYING.back` m a ring at a time where no place in the ring clears (so no place is over that body,
 * and where none in the window clears, the nearest clear one stands outside it), on `side` of that
 * body's length (`Side`; on either with none, where one there clears on the side `going`, a walk
 * under way to a place beside that body, goes to), the one whose way
 * round that body over the column, from where the body's motion carries it `LYING.lead` s on, and turn from
 * `heading` to its facing cost least (a walk along its way, turning to it, keeps it the cheapest);
 * null where none is. With `kept`, the place it holds while it holds (`HeldBeside`).
 */
function besideLying(view: BodyView, window: Window, lying: BodySense, heading: number, side: Side | null, kept?: HeldBeside, going?: MovementRequest | null): Beside | null {
  const obstacle = stepObstacle(view, lying), clear = obstacle.clear, axis = lyingAxis(lying), { ends, centre } = view.stance, y = view.stance.support.y;
  const supports = Object.values(ends), velocity = view.stance.velocity, facing = view.stance.facing;
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
    const turn = face - facing, c = cos(turn), s = sin(turn);
    for (const end of supports) {
      const dx = end.middle.x - centre.x, dz = end.middle.z - centre.z;
      if (!stands(x + dx * c + dz * s, z - dx * s + dz * c)) return false;
    }
    return supports.length > 0 || stands(x, z);
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
  // How far a point stands to one side of that body's length, m; the side its place is held on.
  const across = (x: number, z: number): number => (x - lying.centre.x) * cos(axis) - (z - lying.centre.z) * sin(axis);
  const end = going?.kind === "place" && going.by === lying.id ? going.points[going.points.length - 1] : undefined;
  const wanted = side ?? (end ? across(end.x, end.z) : 0);
  // The nearest ring back from the window's middle where a place clears: in the window where one does; on its side, and where it names none, then on either.
  for (const sided of side === null ? [true, false] : [true]) for (let ring = 0; !best && ring * LYING.back <= LYING.farthest; ring++) {
    const back = ring * LYING.back;
    for (let k = 0; k < LYING.bearings; k++) {
      const middle = offsetAt(view, window, axis + k * 2 * Math.PI / LYING.bearings), face = middle.face;
      const at: Offset = { x: middle.x - back * sin(face), z: middle.z - back * cos(face), face };
      const x = centre.x + at.x, z = centre.z + at.z;
      if (sided && across(x, z) * wanted < 0 || !feetClear(x, z, face)) continue;
      const route = groundRoute(obstacle, from, [x, y, z], LYING.footRadius, LYING.column);
      if (!route) continue;
      let walked = 0, past = from;
      for (const point of route) { walked += hypot(point[0] - past[0], point[2] - past[2]); past = point; }
      const cost = walked + LYING.turn * Math.abs(wrap(face - heading));
      if (cost < least) { best = { offset: at, route, by: lying.id }; least = cost; }
    }
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

/**
 * Where a walk into `window` stands: beside the body its target is on, where that body lies, on
 * `side` of it (`besideLying`, held in `kept` where given; on either with none, the side `going`
 * goes to first where given); else straight (`windowOffset`), `beside` null, on side 1 or with none
 * and nowhere on side -1. None where that body lies and no place beside it clears the feet: the
 * window's middle is then over that body, where no walk stands.
 */
function placeOf(view: BodyView, window: Window, heading: number, side: Side | null, kept?: HeldBeside, going?: MovementRequest | null): { readonly offset: Offset; readonly beside: Beside | null } | null {
  const lying = lyingUnder(view, window);
  if (!lying) return side === -1 ? null : { offset: windowOffset(view, window), beside: null };
  const beside = besideLying(view, window, lying, heading, side, kept, going);
  return beside ? { offset: beside.offset, beside } : null;
}

/**
 * **Where a walk into `window` stands**, from where the body stands facing `heading`, as a spot:
 * beside the body its target is on where that body lies, on `side` of it (`Side`), with the way
 * round it, held in `kept` where given (`HeldBeside`), else, with no side, on the side `going`
 * goes to, a walk under way beside that body, first (`besideLying`); none where that body lies and
 * no place on the side asked clears the feet, or where it stands and side -1 is asked (`placeOf`).
 * The body is there facing within the window's facing, and the spot moves with the body the
 * window's target is on (`Window.on`), as the senses show it.
 */
export function windowSpot(view: BodyView, window: Window, heading: number, side: Side | null, kept?: HeldBeside, going?: MovementRequest | null): Spot | null {
  const place = placeOf(view, window, heading, side, kept, going);
  if (!place) return null;
  const { offset: { x, z, face }, beside } = place, centre = view.stance.centre;
  const on = window.on === undefined ? undefined : view.senses.others.find((other) => other.id === window.on);
  const at = { x: centre.x + x, z: centre.z + z, face, facing: window.facing, ...(on ? { velocity: { x: on.velocity.x, z: on.velocity.z } } : {}) };
  return beside ? { ...at, route: beside.route.map((point) => ({ x: point[0], z: point[2] })), by: beside.by } : at;
}

/**
 * **A walk to `spot`** (`Spot`), facing its way: a place goal there (its route where it has one,
 * round the body it names, which is not kept off as a fallen one, `MovementRequest`'s `by`) under
 * `ceiling` and no faster than it closes in `RESPONSE`, the spot moving at its velocity along the way
 * there (`approachPace`). It counts as arrived within the spot's `near` (`stands`, as the navigator
 * reads it) once the body, facing `heading`, faces within its `facing`, and not before, since the
 * legs turn only as they step.
 */
export function approachSpot(view: BodyView, spot: Spot, ceiling: number, heading: number): {
  readonly move: null; readonly face: number; readonly movement?: MovementRequest; readonly pace?: number;
} {
  const x = spot.x - view.stance.centre.x, z = spot.z - view.stance.centre.z, distance = hypot(x, z), velocity = spot.velocity;
  const drift = velocity && distance > 0 ? (velocity.x * x + velocity.z * z) / distance : 0;
  const near = spot.facing !== undefined && Math.abs(wrap(spot.face - heading)) > spot.facing ? 0 : spot.near ?? ARRIVED;
  const movement: MovementRequest = spot.route ? { kind: "place", points: spot.route.map((point) => ({ x: point.x, z: point.z })), near, ...(spot.by === undefined ? {} : { by: spot.by }) }
    : placeMovement({ x: spot.x, z: spot.z }, near);
  return { move: null, face: spot.face, movement, pace: approachPace(ceiling, distance, drift) };
}
