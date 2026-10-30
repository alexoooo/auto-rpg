import { paceToward, turnAt } from "../control/stance-envelope.ts";
import type { Locomotion } from "../skills/locomotion/locomotion.ts";

/** What the speed rule reads of the gait the body goes by: what it holds, and how fast it stops. */
export type GaitLimits = Pick<Locomotion, "envelope" | "stopping">;

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

/** The speed a gait stopping at `stopping` m/s² stops from in `distance` m; any, with no end ahead. */
const stopFrom = (stopping: number, distance: number): number => distance === Infinity ? Infinity : Math.sqrt(2 * stopping * Math.max(0, distance));

/**
 * **The speed rule**: how fast the body goes, m/s, the least of
 *
 * - the gait's top speed the way it is going, `way` (forward and to the right in its heading's frame,
 *   any length), relative to where it faces (`paceToward` on its envelope; none stated, no bound);
 * - the speed it stops from in `left` m at its stopping deceleration (`Locomotion.stopping`);
 * - for each corner ahead, the speed it slows from to that corner's (`cornerSpeed`) by the corner;
 * - `ceiling`, the goal's own, if it gives one.
 */
export function travelSpeed(gait: GaitLimits, way: readonly [forward: number, right: number], left: number, corners: readonly Corner[], ceiling = Infinity): number {
  const { envelope, stopping } = gait;
  let speed = Math.min(ceiling, envelope ? paceToward(envelope, way[0], way[1]) : Infinity, stopFrom(stopping, left));
  for (const corner of corners) {
    const at = cornerSpeed(gait, corner.halfTurn, corner.room);
    if (at < speed) speed = Math.min(speed, Math.sqrt(at * at + 2 * stopping * Math.max(0, corner.distance)));
  }
  return speed;
}
