import type { GaitLimits, GaitStop } from "../../framework/locomotion-part.ts";
import type { GroundPoint } from "../../framework/movement.ts";
import { heldPace, turnAt } from "../../../control/stance/stance-envelope.ts";
import { hypot } from "../../../core/math/real.ts";

/** How near a corner of its way a body counts it passed at the least, m: about where a walk's step lands past it. */
export const WAYPOINT = .18;

/** How far a route keeps a body's centre beyond its clearance, m: as far as a turn may cut inside a route's corner. */
export const ROUTE_MARGIN = .08;

/**
 * How far before a corner of a route a body turns onto the next leg, m, on the widest arc that
 * cuts no more than `ROUTE_MARGIN` inside it (radius `r`, cutting `r (sec h - 1)`, starting
 * `r tan h` before it, `h` half the turn), and no farther than the next leg is long.
 */
export function cornerRoom(halfTurn: number, next: number): number {
  const room = halfTurn === Infinity ? ROUTE_MARGIN : ROUTE_MARGIN * halfTurn / (Math.sqrt(1 + halfTurn * halfTurn) - 1);
  return Math.min(room, next);
}

/** How near a route's corner `at`, from `before` and on to `after`, a body counts it passed, m: where it turns onto the next leg (`cornerRoom`), `WAYPOINT` at the least. */
export function passedWithin(before: GroundPoint, at: GroundPoint, after: GroundPoint): number {
  return Math.max(WAYPOINT, cornerRoom(halfTurnOf(before, at, after), hypot(after.x - at.x, after.z - at.z)));
}

/** The tangent of half the angle a way turns at `at`, from `before` on to `after`: 0 where a leg has no length, Infinity turned right back. */
function halfTurnOf(before: GroundPoint, at: GroundPoint, after: GroundPoint): number {
  const ax = at.x - before.x, az = at.z - before.z, bx = after.x - at.x, bz = after.z - at.z, la = hypot(ax, az), lb = hypot(bx, bz);
  const sum = la * lb + ax * bx + az * bz;
  return la === 0 || lb === 0 ? 0 : sum > 0 ? Math.abs(ax * bz - az * bx) / sum : Infinity;
}

/**
 * A corner of a route ahead: how far along the route it is, m; the tangent of half the angle the
 * route turns there; and how far before it the body turns onto the next leg, m.
 */
export interface Corner {
  readonly distance: number;
  readonly halfTurn: number;
  readonly room: number;
}

/**
 * The fastest a gait takes a corner, m/s: turning at what it holds at that speed (`turnAt`), on an
 * arc that begins `room` m before the corner, the arc's radius (speed over turn) times the tangent of
 * half the corner's angle being no more than `room`. A gait that states no envelope turns at any speed.
 */
function cornerSpeed(gait: GaitLimits, halfTurn: number, room: number): number {
  const envelope = gait.envelope;
  if (!envelope || halfTurn <= 0) return Infinity;
  if (envelope.turns.length === 0) return 0;
  // A speed turns at the rate of the slowest speed of the table at or above it, past the table at its
  // last (`turnAt`): the fastest speed of each band that turns enough, the fastest of the bands.
  let best = 0, below = -Infinity;
  for (let k = 0; k < envelope.turns.length; k++) {
    const { speed, turn } = envelope.turns[k]!, most = Math.min(speed.value, room * turn.value / halfTurn);
    if (most > below) best = Math.max(best, most);
    below = speed.value;
  }
  const past = room * turnAt(envelope, Infinity) / halfTurn;
  return past > below ? Math.max(best, past) : best;
}

/**
 * The rate `stop` is braked at to come to a place no farther past it than `near` m, m/s²: the
 * fastest of its rates that, with every slower one, went no farther past at its worst; its slowest
 * where none did.
 */
export function stoppingWithin(stop: GaitStop, near: number): number {
  let rate = stop.rates[0]?.stopping ?? 0;
  for (const one of stop.rates) {
    if (one.past > near) break;
    rate = one.stopping;
  }
  return rate;
}

/**
 * The speed a gait comes down from to `end` m/s within `distance` m, coming no farther past than
 * `near` m, m/s: in each stretch of its speeds (`GaitStop`), going on at `on` m/s, the speed it has
 * the way it goes, for that stretch's lag first, then slowing at the rate the stretch is braked at
 * for `near` (`stoppingWithin`), no faster than the stretch goes; a stretch past the first counts
 * only where it goes faster than the one before it, so a gait is asked a speed of a stretch only
 * where that stretch's own stop allows it. Any, with no end ahead; the end itself, for legs that
 * state no stop. A body still goes on nothing, so a walk from a stand is asked what it stops from,
 * and comes to its place.
 */
function slowFrom(gait: GaitLimits, distance: number, on: number, near: number, end = 0): number {
  if (distance === Infinity) return Infinity;
  let speed = end, below = 0;
  for (const stop of gait.stops) {
    const most = Math.min(stop.below, Math.sqrt(end * end + 2 * stoppingWithin(stop, near) * Math.max(0, distance - Math.max(0, on) * stop.lag)));
    if (below === 0 || most > below) speed = Math.max(speed, most);
    below = stop.below;
  }
  return speed;
}

/**
 * **A body going along its way, as the speed rule reads it** (`travelSpeed`): the way it goes,
 * `way`, forward and to the right in its heading's frame (any length); how far it has `left` to
 * go, m; its way's `corners` (`cornersOf`), it `gone` m along them; the speed it has the way it
 * goes, `on`, m/s; the goal's own `ceiling`, m/s (Infinity where it gives none); and how near
 * its end it stands, m (`near`: how far past the end it may come). Called in a step, its caller
 * fills one it made once.
 */
export interface Going {
  way: readonly [forward: number, right: number];
  left: number;
  corners: readonly Corner[];
  gone: number;
  on: number;
  ceiling: number;
  near: number;
}

/**
 * **The speed rule**: how fast the body going (`Going`) goes, m/s, the least of
 *
 * - the gait's top speed the way it is going, relative to where it faces (`heldPace` on its
 *   envelope; none stated, no bound);
 * - the speed it stops from in the m it has left, coming no farther past than it stands near its
 *   end, by how its gait stops (`Locomotion.stops`, `slowFrom`);
 * - for each corner ahead, the speed it slows from to that corner's (`cornerSpeed`) by the corner, the
 *   same way: each one past the m it has gone along the way, that much nearer;
 * - its ceiling, the goal's own.
 */
export function travelSpeed(gait: GaitLimits, { way, left, corners, gone, on, ceiling, near }: Readonly<Going>): number {
  const envelope = gait.envelope;
  let speed = Math.min(ceiling, envelope ? heldPace(envelope, way[0], way[1]) : Infinity, slowFrom(gait, left, on, near));
  for (let k = 0; k < corners.length; k++) {
    const corner = corners[k]!;
    if (!(corner.distance > gone)) continue;
    const at = cornerSpeed(gait, corner.halfTurn, corner.room);
    if (at < speed) speed = Math.min(speed, slowFrom(gait, corner.distance - gone, on, near, at));
  }
  return speed;
}

/** Each corner of the way from `from` through `way`: how far along the way it is, the tangent of half its turn, and how far before it the body turns (`cornerRoom`). */
export function cornersOf(from: GroundPoint, way: readonly GroundPoint[]): Corner[] {
  const corners: Corner[] = [];
  let to = way.length ? hypot(way[0]!.x - from.x, way[0]!.z - from.z) : 0;
  for (let k = 0; k + 1 < way.length; k++) {
    const before = k === 0 ? from : way[k - 1]!, at = way[k]!, after = way[k + 1]!, halfTurn = halfTurnOf(before, at, after), next = hypot(after.x - at.x, after.z - at.z);
    corners.push({ distance: to, halfTurn, room: cornerRoom(halfTurn, next) });
    to += next;
  }
  return corners;
}

/** The length of the pieces a way is timed over (`legSeconds`), m: a numeric setting. */
const PIECE = .25;

/**
 * How long each leg of the way from `from` through `way` takes, s, the body going at the speed
 * rule's speed for `gait` all along it (`travelSpeed`: what it holds the way each leg goes, `frame`
 * giving that way, forward and to the right, of a leg's ground direction; stopping at the way's end
 * and slowing for its corners), from `on` m/s, under `ceiling`, standing within `near` m of its end: each piece of `PIECE` m crossed at
 * the mean of the speed it is entered at and the speed asked at its middle. Infinity for a leg the
 * gait does not go.
 */
export function legSeconds(gait: GaitLimits, { from, way, frame, on, ceiling, near }: {
  readonly from: GroundPoint; readonly way: readonly GroundPoint[]; readonly frame: (x: number, z: number) => readonly [number, number];
  readonly on: number; readonly ceiling: number; readonly near: number;
}): number[] {
  const corners = cornersOf(from, way), seconds: number[] = [];
  let total = 0, at = from;
  for (const point of way) { total += hypot(point.x - at.x, point.z - at.z); at = point; }
  let gone = 0, speed = on;
  const going: Going = { way: [1, 0], left: total, corners, gone: 0, on, ceiling, near };
  at = from;
  for (const point of way) {
    const x = point.x - at.x, z = point.z - at.z, length = hypot(x, z), pieces = Math.max(1, Math.ceil(length / PIECE)), step = length / pieces;
    going.way = length > 0 ? frame(x / length, z / length) : [1, 0] as const;
    let time = 0;
    for (let i = 0; i < pieces; i++) {
      const middle = gone + (i + .5) * step;
      // A piece is crossed at the mean of the speed it is entered at and the speed asked at its middle:
      // near the end the speed asked comes to 0, and the body brakes across the piece from what it had.
      const entered = speed;
      going.left = total - middle; going.gone = middle; going.on = speed;
      speed = travelSpeed(gait, going);
      time += entered + speed > 0 ? 2 * step / (entered + speed) : Infinity;
    }
    seconds.push(length > 0 ? time : 0);
    gone += length; at = point;
  }
  return seconds;
}
