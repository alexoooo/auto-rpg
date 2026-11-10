import type { GaitLimits } from "../framework/locomotion-part.ts";
import type { GroundPoint } from "../framework/movement.ts";
import { heldPace, turnAt } from "../../control/stance/stance-envelope.ts";
import { hypot } from "../../core/math/real.ts";

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
  for (const { speed, turn } of envelope.turns) {
    const most = Math.min(speed.value, room * turn.value / halfTurn);
    if (most > below) best = Math.max(best, most);
    below = speed.value;
  }
  const past = room * turnAt(envelope, Infinity) / halfTurn;
  return past > below ? Math.max(best, past) : best;
}

/**
 * The speed a gait comes down from to `end` m/s within `distance` m, m/s, going on at `on` m/s, the
 * speed it has the way it goes, for its `lag` s first, then slowing at its `stopping` m/s²; any,
 * with no end ahead. A body still goes on nothing, so a walk from a stand is asked what it stops
 * from, and comes to its place.
 */
function slowFrom(gait: GaitLimits, distance: number, on: number, end = 0): number {
  if (distance === Infinity) return Infinity;
  return Math.sqrt(end * end + 2 * gait.stopping * Math.max(0, distance - Math.max(0, on) * gait.lag));
}

/**
 * **The speed rule**: how fast the body goes, m/s, the least of
 *
 * - the gait's top speed the way it is going, `way` (forward and to the right in its heading's frame,
 *   any length), relative to where it faces (`heldPace` on its envelope; none stated, no bound);
 * - the speed it stops from in `left` m, going on at `on`, the speed it has the way it goes, for its
 *   lag (`Locomotion.lag`), then slowing at its stopping deceleration (`Locomotion.stopping`);
 * - for each corner ahead, the speed it slows from to that corner's (`cornerSpeed`) by the corner, the
 *   same way;
 * - `ceiling`, the goal's own, if it gives one.
 */
export function travelSpeed(gait: GaitLimits, way: readonly [forward: number, right: number], left: number, corners: readonly Corner[], on: number, ceiling = Infinity): number {
  const envelope = gait.envelope;
  let speed = Math.min(ceiling, envelope ? heldPace(envelope, way[0], way[1]) : Infinity, slowFrom(gait, left, on));
  for (const corner of corners) {
    const at = cornerSpeed(gait, corner.halfTurn, corner.room);
    if (at < speed) speed = Math.min(speed, slowFrom(gait, corner.distance, on, at));
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
 * and slowing for its corners), from `on` m/s, under `ceiling`: each piece of `PIECE` m crossed at
 * the mean of the speed it is entered at and the speed asked at its middle. Infinity for a leg the
 * gait does not go.
 */
export function legSeconds(gait: GaitLimits, from: GroundPoint, way: readonly GroundPoint[], frame: (x: number, z: number) => readonly [number, number],
  on: number, ceiling = Infinity): number[] {
  const corners = cornersOf(from, way), seconds: number[] = [];
  let total = 0, at = from;
  for (const point of way) { total += hypot(point.x - at.x, point.z - at.z); at = point; }
  let gone = 0, speed = on;
  at = from;
  for (const point of way) {
    const x = point.x - at.x, z = point.z - at.z, length = hypot(x, z), pieces = Math.max(1, Math.ceil(length / PIECE)), step = length / pieces;
    const facing = length > 0 ? frame(x / length, z / length) : [1, 0] as const;
    let time = 0;
    for (let i = 0; i < pieces; i++) {
      const middle = gone + (i + .5) * step, ahead = corners.filter((corner) => corner.distance > middle).map((corner) => ({ ...corner, distance: corner.distance - middle }));
      // A piece is crossed at the mean of the speed it is entered at and the speed asked at its middle:
      // near the end the speed asked comes to 0, and the body brakes across the piece from what it had.
      const entered = speed;
      speed = travelSpeed(gait, facing, total - middle, ahead, speed, ceiling);
      time += entered + speed > 0 ? 2 * step / (entered + speed) : Infinity;
    }
    seconds.push(length > 0 ? time : 0);
    gone += length; at = point;
  }
  return seconds;
}
