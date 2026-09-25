import { isFloor, type DungeonMap, type Point } from "./map.ts";

/** What the fog mask holds for a cell: never seen, seen before, in sight now. */
export const FOG = Object.freeze({ unexplored: 0, remembered: 128, visible: 255 });

/**
 * How the fog shader reads the mask, which `fogSample` repeats on the CPU for the tests. A fragment reads from a
 * point pulled `pull` metres back along its normal, into the solid it belongs to: a wall face, on a cell's edge,
 * 0.3 m into its wall cell; a door's broad face, 0.175 m off its cell's centre, to within 0.025 of it; a floor or
 * a top where it lies. Whether it is drawn at all is the mask of the cell that point is in, unfiltered, so no
 * pixel shows ground the fog hides. Only the tint is bilinear, which is what softens the fog's edge -- and a pull
 * of half a cell would have tinted a door from the ground behind it.
 */
export const FOG_SAMPLE = Object.freeze({ pull: 0.2, drawnFrom: 0.02 });

/**
 * One byte per cell, row-major like `map.floor`, for the fog shader to sample. A floor cell is visible,
 * remembered or unexplored. A rock cell shows as much as the brightest floor cell among its eight
 * neighbours, so a wall appears cell by cell beside explored ground -- not a whole run of wall at once, as
 * the boxes did when any floor cell along them was explored.
 */
export function fogMask(map: DungeonMap, visible: ReadonlySet<number>, explored: ReadonlySet<number>,
  into = new Uint8Array(map.size * map.size)): Uint8Array {
  const floorValue = (key: number) =>
    visible.has(key) ? FOG.visible : explored.has(key) ? FOG.remembered : FOG.unexplored;
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
    const key = z * map.size + x;
    if (map.floor[key] === 1) { into[key] = floorValue(key); continue; }
    let brightest: number = FOG.unexplored;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      if ((dx || dz) && isFloor(map, x + dx, z + dz)) brightest = Math.max(brightest, floorValue((z + dz) * map.size + x + dx));
    into[key] = brightest;
  }
  // A closed door blocks sight, so its own cells are never seen; like a wall, it shows as its brightest neighbour.
  // Those cells are floor, and their 0.98 m tiles are drawn with the 0.35 m door: a strip of plain floor shows past
  // its far side, which tells nobody anything the door did not.
  for (const door of map.doors) if (!door.open) for (const cell of doorCells(door)) {
    const key = cell.z * map.size + cell.x;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      if (isFloor(map, cell.x + dx, cell.z + dz)) into[key] = Math.max(into[key], floorValue((cell.z + dz) * map.size + cell.x + dx));
  }
  return into;
}

/** The cells a door's box stands in: 0.35 m thick across its axis and three cells long along it (`buildDungeonWorld`). */
export function doorCells(door: DungeonMap["doors"][number]): Point[] {
  return [-1, 0, 1].map(i => door.axis === "x" ? { x: door.point.x, z: door.point.z + i } : { x: door.point.x + i, z: door.point.z });
}

/** The fog shader's decision for a fragment at world `x`, `z` facing `nx`, `nz` (`FOG_SAMPLE`): whether it is
 * drawn, and how lit it is, 0 the remembered tint and 1 full light. */
export function fogSample(map: DungeonMap, mask: Uint8Array, x: number, z: number, nx = 0, nz = 0): { drawn: boolean; lit: number } {
  const at = { x: x - FOG_SAMPLE.pull * nx, z: z - FOG_SAMPLE.pull * nz };
  const clampCell = (v: number) => Math.min(map.size - 1, Math.max(0, v));
  const byte = (cx: number, cz: number) => mask[clampCell(cz) * map.size + clampCell(cx)] / 255;
  const drawn = byte(Math.floor(at.x + 0.5), Math.floor(at.z + 0.5)) >= FOG_SAMPLE.drawnFrom;
  const x0 = Math.floor(at.x), z0 = Math.floor(at.z), fx = at.x - x0, fz = at.z - z0;
  const m = (byte(x0, z0) * (1 - fx) + byte(x0 + 1, z0) * fx) * (1 - fz) + (byte(x0, z0 + 1) * (1 - fx) + byte(x0 + 1, z0 + 1) * fx) * fz;
  const t = Math.min(1, Math.max(0, (m - 0.5) / 0.5));
  return { drawn, lit: t * t * (3 - 2 * t) };
}

/** How tall a wall stands, its collider and its drawn skin alike. */
export const WALL_HEIGHT = 2.8;

/** How deep in front of the hero, along the view, a wall is cut away: a 2.8 m wall covers `2.8 / tan(pitch)` of
 * ground behind it, plus a margin for the body. 8.98 at the default pitch, where it was 9. */
export function fadeDepth(pitch: number): number {
  return Math.SQRT2 * (WALL_HEIGHT / Math.tan(pitch) + 1.5);
}

/** A rock cell with floor among its eight neighbours: where a wall stands, and a collider with it. */
export function boundary(map: DungeonMap, x: number, z: number): boolean {
  return !isFloor(map, x, z) && [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => isFloor(map, x + dx, z + dz)));
}

export type WallFace = "top" | "x+" | "x-" | "z+" | "z-";
export interface WallQuad { cell: Point; face: WallFace }
export const SIDE_FACES = Object.freeze([
  { face: "x+", dx: 1, dz: 0 }, { face: "x-", dx: -1, dz: 0 }, { face: "z+", dx: 0, dz: 1 }, { face: "z-", dx: 0, dz: -1 },
] as const);

/**
 * The outer skin of the wall colliders, one quad at a time: a top on every boundary cell, and a side on each face
 * that does not meet another boundary cell. Faces into solid rock are kept, as the boxes had them: rock beyond
 * the boundary is drawn as nothing, so such a face can be seen past it.
 */
export function wallSurface(map: DungeonMap): WallQuad[] {
  const quads: WallQuad[] = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
    if (!boundary(map, x, z)) continue;
    quads.push({ cell: { x, z }, face: "top" });
    for (const { face, dx, dz } of SIDE_FACES) if (!boundary(map, x + dx, z + dz)) quads.push({ cell: { x, z }, face });
  }
  return quads;
}

/** Every reason the visible walls disagree with the colliders; empty when they agree. */
export function validateDungeonVisuals(map: DungeonMap, quads: readonly WallQuad[]): string[] {
  const problems: string[] = [], seen = new Set<string>();
  for (const { cell, face } of quads) {
    const name = `${face} at (${cell.x}, ${cell.z})`;
    if (!boundary(map, cell.x, cell.z)) problems.push(`${name} stands on a cell with no collider`);
    if (seen.has(name)) problems.push(`${name} is drawn twice`);
    seen.add(name);
  }
  return problems;
}
