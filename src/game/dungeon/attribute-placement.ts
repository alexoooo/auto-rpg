import { distance, findPath, walkable, type DungeonMap, type Point } from "./map.ts";

/** Fit a configured encounter near its authored spawn, retaining its room and reachable floor. */
export function configuredSpawn(map: DungeonMap, desired: Point, radius: number, taken: readonly (Point & { radius: number })[]): Point {
  const room = map.rooms.find(r => desired.x >= r.min.x && desired.x <= r.max.x && desired.z >= r.min.z && desired.z <= r.max.z);
  const fits = (p: Point) => walkable(map, p, radius, true) && taken.every(other => distance(p, other) >= radius + other.radius)
    && findPath(map, map.start, p, radius).length > 0;
  if (fits(desired)) return { ...desired };
  const candidates: Point[] = [];
  for (let z = room?.min.z ?? 1; z <= (room?.max.z ?? map.size - 2); z++)
    for (let x = room?.min.x ?? 1; x <= (room?.max.x ?? map.size - 2); x++) candidates.push({ x, z });
  candidates.sort((a, b) => distance(a, desired) - distance(b, desired) || a.z - b.z || a.x - b.x);
  const found = candidates.find(fits);
  if (!found) throw new Error(`Configured body with radius ${radius.toFixed(3)} m does not fit near spawn ${desired.x}, ${desired.z}.`);
  return found;
}
