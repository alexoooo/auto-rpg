import { distance, walkable, clearSegment, type DungeonMap, type Point } from "./map.ts";

/**
 * Where a companion stands at the start: the first of twelve bearings on a ring about the start, then a
 * wider ring, whose floor clears a large body and lies at least 1.4 m from everybody already placed.
 * Fixed bearings rather than a draw, so a companion costs the enemies none of their seeds.
 */
export function companionSpawn(map: DungeonMap, taken: readonly Point[]): Point | null {
  for (const ring of [1.6, 2.4, 3.2]) for (let i = 0; i < 12; i++) {
    const angle = Math.PI + i * Math.PI / 6;
    const at = { x: map.start.x + Math.sin(angle) * ring, z: map.start.z + Math.cos(angle) * ring };
    if (walkable(map, at, 0.7, true) && clearSegment(map, map.start, at, 0.7, true) && taken.every(other => distance(other, at) >= 1.4)) return at;
  }
  return null;
}
