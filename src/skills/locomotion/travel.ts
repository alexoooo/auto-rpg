import type { GaitLimits } from "../framework/locomotion-part.ts";
import type { GroundPoint } from "../framework/movement.ts";
import { heldPace, turnAt } from "../../control/stance/stance-envelope.ts";
import { hypot } from "../../core/math/real.ts";

/** How far before a corner of its way a body turns onto the next leg, m: where a route's corner counts as passed. */
export const WAYPOINT = .18;

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

/** Each corner of the way from `from` through `way`: how far along the way it is, and the tangent of half its turn, turned `WAYPOINT` m before it. */
export function cornersOf(from: GroundPoint, way: readonly GroundPoint[]): Corner[] {
  const corners: Corner[] = [];
  let to = way.length ? hypot(way[0]!.x - from.x, way[0]!.z - from.z) : 0;
  for (let k = 0; k + 1 < way.length; k++) {
    const before = k === 0 ? from : way[k - 1]!, at = way[k]!, after = way[k + 1]!;
    const ax = at.x - before.x, az = at.z - before.z, bx = after.x - at.x, bz = after.z - at.z, la = hypot(ax, az), lb = hypot(bx, bz);
    const sum = la * lb + ax * bx + az * bz;
    corners.push({ distance: to, halfTurn: la === 0 || lb === 0 ? 0 : sum > 0 ? Math.abs(ax * bz - az * bx) / sum : Infinity, room: WAYPOINT });
    to += lb;
  }
  return corners;
}

/** The length of the pieces a way is timed over (`legSeconds`), m: a numeric setting. */
const PIECE = .25;

/**
 * How long each leg of the way from `from` through `way` takes, s, the body going at the speed
 * rule's speed for `gait` all along it (`travelSpeed`: what it holds the way each leg goes, `frame`
 * giving that way, forward and to the right, of a leg's ground direction; stopping at the way's end
 * and slowing for its corners), from `on` m/s, under `ceiling`: the speed asked at the middle of
 * each piece of `PIECE` m. Infinity for a leg the gait does not go.
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
      speed = travelSpeed(gait, facing, total - middle, ahead, speed, ceiling);
      time += speed > 0 ? step / speed : Infinity;
    }
    seconds.push(length > 0 ? time : 0);
    gone += length; at = point;
  }
  return seconds;
}
