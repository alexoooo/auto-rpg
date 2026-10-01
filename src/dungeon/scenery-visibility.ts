import { canSee, type DungeonMap, type Point, type Room } from "./map.ts";
import { doorCells } from "./fog.ts";

/** What the scenery's memory reads (`docs/reference/look.md#crypt-fog`). */
const SCENERY = Object.freeze({
  /** How far the hero sees scenery, m: a cell is sampled within this many cells of the hero, each way. */
  reach: 12,
  /** A cell is seen when the hero sees any of four points this far from its middle, toward its corners, m. */
  corner: .35,
  /** An unseen pocket inside a room is filled when it is enclosed and no larger than this many cells. */
  gap: 4,
});
/** The four cells beside a cell, as steps along x and z. */
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The cells a closed door stands in. */
function closedDoorCells(map: DungeonMap): Set<number> {
  return new Set(map.doors.filter(door => !door.open).flatMap(door => doorCells(door).map(p => p.z * map.size + p.x)));
}

/** Remembers every floor cell near the hero with a corner sample in the hero's sight. */
function sampleCorners(map: DungeonMap, hero: Point, blocked: ReadonlySet<number>, memory: Set<number>): void {
  const { reach, corner } = SCENERY;
  const samples = [[-corner, -corner], [corner, -corner], [-corner, corner], [corner, corner]];
  for (let z = Math.max(0, Math.floor(hero.z - reach)); z <= Math.min(map.size - 1, Math.ceil(hero.z + reach)); z++) {
    for (let x = Math.max(0, Math.floor(hero.x - reach)); x <= Math.min(map.size - 1, Math.ceil(hero.x + reach)); x++) {
      const key = z * map.size + x;
      if (!map.floor[key] || memory.has(key) || blocked.has(key)) continue;
      if (samples.some(([dx, dz]) => canSee(map, hero, { x: x + dx, z: z + dz }, reach))) memory.add(key);
    }
  }
}

/** Whether an obstacle that blocks sight stands on the cell at `x`, `z`, or within half a cell of it. */
function opaqueAt(map: DungeonMap, x: number, z: number): boolean {
  return (map.obstacles ?? []).some(o => o.blocksSight && Math.abs(x - o.x) < o.width / 2 + .5 && Math.abs(z - o.z) < o.depth / 2 + .5);
}

/**
 * Remembers each small pocket of unseen floor inside `room`. A pocket is the unseen cells joined to one another;
 * it is filled when it is enclosed, and no larger than `SCENERY.gap`. It is enclosed when every cell beside it is
 * remembered floor of the room: none of its cells touches the room's edge, rock or a closed door, or is under an
 * obstacle that blocks sight. So a pocket never floods into an adjoining corridor.
 */
function fillPockets(map: DungeonMap, room: Room, blocked: ReadonlySet<number>, memory: Set<number>): void {
  const visited = new Set<number>();
  for (let z = room.min.z; z <= room.max.z; z++) for (let x = room.min.x; x <= room.max.x; x++) {
    const first = z * map.size + x;
    if (!map.floor[first] || memory.has(first) || visited.has(first)) continue;
    const pending = [first], pocket: number[] = [];
    let enclosed = true;
    while (pending.length) {
      const key = pending.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);
      pocket.push(key);
      const cellX = key % map.size, cellZ = Math.floor(key / map.size);
      if (blocked.has(key) || opaqueAt(map, cellX, cellZ)) enclosed = false;
      for (const [dx, dz] of NEIGHBOURS) {
        const besideX = cellX + dx, besideZ = cellZ + dz, beside = besideZ * map.size + besideX;
        const outside = besideX < room.min.x || besideX > room.max.x || besideZ < room.min.z || besideZ > room.max.z;
        if (outside || !map.floor[beside] || blocked.has(beside)) { enclosed = false; continue; }
        if (!memory.has(beside) && !visited.has(beside)) pending.push(beside);
      }
    }
    if (enclosed && pocket.length <= SCENERY.gap) for (const key of pocket) memory.add(key);
  }
}

/** Presentation memory only. Never feed this set back to exploration or actor visibility. */
export function revealScenery(map: DungeonMap, hero: Point, visible: ReadonlySet<number>,
  explored: ReadonlySet<number>, memory: Set<number>): Set<number> {
  for (const key of explored) memory.add(key);
  for (const key of visible) memory.add(key);
  const blocked = closedDoorCells(map);
  sampleCorners(map, hero, blocked, memory);
  for (const room of map.rooms) fillPockets(map, room, blocked, memory);
  return memory;
}
