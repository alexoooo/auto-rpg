import type { SolidSense } from "../core/mind/object-senses.ts";
import { navigationPath } from "../core/mind/route-search.ts";
import { distance, findPath, type DungeonMap, type Point } from "./map.ts";
import { DOOR_OPEN_DISTANCE } from "./world.ts";

/** Earliest contact of a segment with a closed physical door's inflated horizontal box. */
function crossing(from: Point, to: Point, solid: SolidSense, radius: number): number | null {
  if (solid.kind !== "box") throw new Error("a Crypt door must be a box");
  let first = 0, last = 1;
  for (const [axis, k] of [["x", 0], ["z", 2]] as const) {
    const low = solid.centre[k] - solid.size[k] / 2 - radius, high = solid.centre[k] + solid.size[k] / 2 + radius;
    const delta = to[axis] - from[axis];
    if (delta === 0) { if (from[axis] < low || from[axis] > high) return null; }
    else {
      const a = (low - from[axis]) / delta, b = (high - from[axis]) / delta;
      first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b));
      if (first > last) return null;
    }
  }
  return first;
}

/**
 * The map's search identifies the first interactable door toward an objective. It does not
 * drive a path: the common navigator must reach the near-side opening point against actual
 * collider geometry. Staging at four fifths of the opening radius leaves room to stop inside it.
 */
export function doorApproach(map: DungeonMap, solids: readonly SolidSense[], from: Point, goal: Point, radius: number): { door: number; point: Point } | null {
  const route = findPath(map, from, goal, radius);
  let start = from;
  for (const end of route) {
    let found: { door: typeof map.doors[number]; fraction: number } | null = null;
    for (const door of map.doors.filter(door => !door.open)) {
      const solid = solids.find(solid => solid.name === `door.${door.id}`);
      if (!solid) continue;
      const fraction = crossing(start, end, solid, radius);
      if (fraction !== null && (!found || fraction < found.fraction)) found = { door, fraction };
    }
    if (found) {
      const { door } = found, sign = start[door.axis] < door.point[door.axis] ? -1 : 1;
      const point = { ...door.point, [door.axis]: door.point[door.axis] + sign * DOOR_OPEN_DISTANCE * .8 };
      if (distance(from, point) > 0 && navigationPath(from, point, solids, radius).length) return { door: door.id, point };
      return null;
    }
    start = end;
  }
  return null;
}
