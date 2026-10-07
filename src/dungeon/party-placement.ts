import { distance, walkable, clearSegment, type DungeonMap, type Point } from "./map.ts";

/**
 * A companion's place at the start, m (`docs/reference/play.md#companions`): the rings about the start it is
 * tried on, nearest first; the floor it needs clear about it, as a radius; and how far it stands from
 * everybody already placed.
 */
const COMPANION_SPAWN = Object.freeze({ rings: [1.6, 2.4, 3.2], clearance: 0.7, apart: 1.4 });

/**
 * Where a companion stands at the start: the first of twelve bearings on a ring about the start, then a
 * wider ring, whose floor clears the body's radius and lies at least `COMPANION_SPAWN.apart` from everybody
 * already placed. Fixed bearings rather than a draw, so a companion costs the enemies none of their seeds.
 */
export function companionSpawn(map: DungeonMap, taken: readonly (Point & { readonly radius?: number })[], radius: number = COMPANION_SPAWN.clearance): Point | null {
  const { rings, clearance, apart } = COMPANION_SPAWN, footprint = Math.max(clearance, radius);
  for (const ring of rings) for (let i = 0; i < 12; i++) {
    const angle = Math.PI + i * Math.PI / 6;
    const at = { x: map.start.x + Math.sin(angle) * ring, z: map.start.z + Math.cos(angle) * ring };
    if (walkable(map, at, footprint, true) && clearSegment(map, map.start, at, footprint, true)
      && taken.every(other => distance(other, at) >= Math.max(apart, radius + (other.radius ?? clearance)))) return at;
  }
  return null;
}
