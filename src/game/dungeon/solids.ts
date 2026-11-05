import type { FixedCollider, PhysicsWorld } from "../../core/physics/engine.ts";
import { hypot } from "../../core/math/real.ts";
import { solidSenses } from "../../core/bodies/object-senses.ts";
import { boundary, WALL_HEIGHT } from "./fog.ts";
import type { Door, DungeonMap, Point } from "./map.ts";

/** A body inside this distance opens a door, m; interaction staging stays inside the same radius. */
export const DOOR_OPEN_DISTANCE = 2.5;

/** A fixed box the level puts in the physics world: its name, and its centre and full size, world, m. */
interface DungeonSolid {
  readonly name: string;
  readonly centre: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

/**
 * **The level's solids**, nothing drawn: fixed boxes in `physics` (`solids`), the floor's slab, each obstacle, the
 * walls in runs of up to four cells, and each door until it opens (`opened` is told of each it opens). With no
 * `physics`, `solids` still says what it would have put there. A crypt run is built on these alone (`DungeonRun`).
 */
export function dungeonSolids(map: DungeonMap, physics?: PhysicsWorld, opened: (door: Door) => void = () => {}) {
  const colliders: FixedCollider[] = [], solids: DungeonSolid[] = [];
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number): FixedCollider | null => {
    solids.push({ name, centre: [x, y, z], size: [width, height, depth] });
    if (!physics) return null;
    const collider = physics.addFixedBox([x, y, z], [width, height, depth]);
    colliders.push(collider); return collider;
  };
  box("dungeon slab", (map.size - 1) / 2, -0.5, (map.size - 1) / 2, map.size, 1, map.size);
  for (const o of map.obstacles ?? []) box(o.id, o.x, o.height / 2, o.z, o.width, o.height, o.depth);
  // `wallSurface` draws the walls' outer skin; these are what a body meets.
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size;) {
    if (!boundary(map, x, z)) { x++; continue; }
    const start = x; while (x < map.size && x - start < 4 && boundary(map, x, z)) x++;
    box(`wall.${z}.${start}`, (start + x - 1) / 2, WALL_HEIGHT / 2, z, x - start, WALL_HEIGHT, 1);
  }
  const doors = map.doors.map(d => d.open ? null : box(`door.${d.id}`, d.point.x, 1.25, d.point.z, d.axis === "x" ? 0.35 : 3, 2.5, d.axis === "z" ? 0.35 : 3));
  const senseSolids = () => solidSenses(solids.filter(solid => !solid.name.startsWith("door.") || !map.doors.find(door => solid.name === `door.${door.id}`)?.open)
    .map(solid => ({ ...solid, kind: "box" as const })));
  let sensed = senseSolids();
  /** Opens each of `opening` still closed: its collider gone. */
  const open = (opening: readonly Door[]) => {
    let changed = false;
    for (const door of opening) if (!door.open) {
      door.open = true;
      changed = true;
      doors[door.id]?.dispose();
      opened(door);
    }
    if (changed) sensed = senseSolids();
  };
  return {
    /** Every fixed box the level put in the physics world, in the order it was built; an opened door's stays listed. */
    solids: solids as readonly DungeonSolid[],
    /** Current detached collision geometry, replaced only when a door opens. */
    get sensedSolids() { return sensed; },
    openNearby(actors: readonly Point[]) {
      open(map.doors.filter(door => actors.some(p => hypot(p.x - door.point.x, p.z - door.point.z) < DOOR_OPEN_DISTANCE)));
    },
    /** Rebuild detached observations after the owning state is restored. */
    refresh() { sensed = senseSolids(); },
    /** Opens the doors of these ids, as a run in another world says it opened them. */
    opened(ids: readonly number[]) { open(map.doors.filter(door => ids.includes(door.id))); },
    dispose() { for (const collider of colliders) collider.dispose(); },
  };
}
