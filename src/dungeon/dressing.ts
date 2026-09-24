import { mulberry32 } from "../rng.ts";
import { isFloor, type DungeonMap, type Point } from "./map.ts";

/** Where the dungeon's body-free decoration goes. Every number here is a starting value set by eye; the owner
 * judges density in play (docs/plans/2026-09-24-dungeon-look-01-light-and-air.md). */
export const DRESSING = Object.freeze({
  /** No two torches closer than this, in metres. */
  torchSpacing: 7,
  /** The flame's centre height, and how far proud of the wall face it stands. A flame is translucent light and owns
   * no body -- the body-free case AGENTS.md names for scrims -- so it may hang over the floor. */
  torchHeight: 2.05, torchProud: 0.12,
  /** How far off the wall face the torch's light stands. A light at the flame would sit 0.12 m from the stone, and an
   * inverse-square light that close burns a hot spot into the wall; this one lights the floor the flame looks at. */
  torchLightProud: 0.4,
});

export interface TorchPlacement {
  /** The rock cell the sconce is set into. */
  cell: Point;
  /** Unit step from the rock cell to the floor cell it lights: one of the four axis directions. */
  facing: Point;
  flame: { x: number; y: number; z: number };
  light: { x: number; y: number; z: number };
  room: number;
}

const AXES: readonly Point[] = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];

/** Which room's inclusive bounds hold a cell, or -1. Bounds never touch, so there is at most one. */
function roomAt(map: DungeonMap, x: number, z: number): number {
  return map.rooms.findIndex(r => x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z);
}

/**
 * Torches on the outer walls of rooms, a function of the seed.
 *
 * A torch hangs in a rock cell that lies inside no room's bounds -- so never on a divider or its arch, which
 * are rock inside a room -- facing an axis neighbour that is floor inside a room. A rock cell with any floor
 * outside every room among its eight neighbours is the jamb of a corridor mouth, where a door hangs, and
 * carries none. Candidates are shuffled by a stream of their own and taken greedily while no two flames are
 * closer than `torchSpacing`, the one density rule: it puts at most five in a room on seeds 1-300, and a cap of
 * four per room changed no level on seeds 1-50, so it went. The result is sorted only so that its order does not
 * depend on the draw.
 */
export function torchPlacements(map: DungeonMap, seed: number): TorchPlacement[] {
  const candidates: { cell: Point; facing: Point; room: number }[] = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
    if (isFloor(map, x, z) || roomAt(map, x, z) >= 0) continue;
    let mouth = false;
    for (let dz = -1; dz <= 1 && !mouth; dz++) for (let dx = -1; dx <= 1; dx++)
      if (isFloor(map, x + dx, z + dz) && roomAt(map, x + dx, z + dz) < 0) { mouth = true; break; }
    if (mouth) continue;
    for (const facing of AXES) {
      if (!isFloor(map, x + facing.x, z + facing.z)) continue;
      const room = roomAt(map, x + facing.x, z + facing.z);
      if (room >= 0) candidates.push({ cell: { x, z }, facing, room });
    }
  }
  const random = mulberry32((seed ^ 0x70c4ec) >>> 0);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const taken: TorchPlacement[] = [];
  const at = (cell: Point, facing: Point, proud: number) =>
    ({ x: cell.x + facing.x * (0.5 + proud), y: DRESSING.torchHeight, z: cell.z + facing.z * (0.5 + proud) });
  for (const { cell, facing, room } of candidates) {
    const flame = at(cell, facing, DRESSING.torchProud);
    if (taken.some(t => Math.hypot(t.flame.x - flame.x, t.flame.z - flame.z) < DRESSING.torchSpacing)) continue;
    taken.push({ cell, facing, flame, light: at(cell, facing, DRESSING.torchLightProud), room });
  }
  return taken.sort((a, b) => a.room - b.room || a.cell.z - b.cell.z || a.cell.x - b.cell.x ||
    a.facing.z - b.facing.z || a.facing.x - b.facing.x);
}
