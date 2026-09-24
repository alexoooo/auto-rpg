/**
 * The Depths' level generator, after Diablo's Cathedral (devilution's `Source/drlg_l1.cpp`).
 *
 * The level is laid out on a coarse grid of `LEVEL.block`-metre blocks and carved into the fine
 * grid the run reads, so every corridor and every arch is at least one block wide and a body never
 * meets a passage narrower than itself. The layout is Diablo's: a spine of rooms (`L5firstRoom`),
 * rooms branched off their sides depth first (`L5roomGen`), and walls with a gap drawn across the
 * longer rooms (`L5AddWall`), which is what makes the Cathedral read as ambushes and half-seen
 * spaces rather than as boxes. A layout that comes out too small is thrown away and drawn again, as
 * `L5GetArea` does.
 *
 * Anything drawn inside a room after carving -- a wall here, a set piece later -- is taken back
 * unless every corridor into that room is still a way through (`linksHold`). Carving is connected
 * by construction, and every link holding keeps it so, which `tests/dungeon-level.test.mjs` checks
 * on the finished level with `standingComponents`.
 */
import { mulberry32 } from "../rng.ts";
import { distance, isFloor, walkable, type Door, type DungeonMap, type Point, type Room } from "./map.ts";

/**
 * The generator's table. A level rule is not a console dial, so this is not in `src/config.ts`.
 * The overview (`docs/plans/2026-09-23-depths-00-overview.md`) gives each value's reason.
 */
export const LEVEL = Object.freeze({
  blocks: 17,
  block: 3,
  clearance: 0.65,
  roomMin: 2,
  roomMax: 4,
  corridorMax: 2,
  maxRooms: 11,
  minRooms: 6,
  branchChance: 0.75,
  branchDecay: 0.8,
  /** Room sizes tried on one side of a room before that side is given up. */
  attempts: 4,
  dividerChance: 0.6,
  dividerMinBlocks: 3,
  doorChance: 0.6,
  spawnCount: 8,
  /** Metres from the start a spawn must be, as the old generator's test asked. */
  spawnFromStart: 10,
  spawnSpacing: 2,
  /** Metres walked cell to cell (`walkField`). The shortest measured over seeds 0-23 is 50. */
  minExitPath: 24,
  /** Layouts drawn for one seed before the seed is refused. */
  tries: 40,
});

/** A rectangle of blocks: `x`, `z` its lowest block, `w`, `d` its size along x and z. */
export interface BlockRect { x: number; z: number; w: number; d: number }
/** Which way a corridor leaves the room it grew from: 0 +x, 1 -x, 2 +z, 3 -z. */
export type Heading = 0 | 1 | 2 | 3;
const STEP: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Room `a` grew room `b` through `corridor`. `door` indexes `map.doors`, or null. */
export interface RoomLink { a: number; b: number; corridor: BlockRect; heading: Heading; door: number | null }
export interface LevelMetrics { rooms: number; floorCells: number; exitPath: number; dividers: number; doors: number }
export interface Level {
  map: DungeonMap;
  /** `map.rooms[i]` as blocks. */
  roomBlocks: readonly BlockRect[];
  links: readonly RoomLink[];
  metrics: LevelMetrics;
}

interface Layout { rooms: BlockRect[]; links: RoomLink[]; open: Uint8Array }

/** Fisher-Yates with the seeded generator. Never `Array.sort(random)`. */
const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Diablo's spine and branches, on blocks. `open` holds 1 for a room block and 2 for a corridor
 * block. Every room keeps at least one solid block between itself and every other space, so two
 * rooms meet only through a corridor, and a corridor never runs alongside anything.
 */
export function layRooms(random: () => number): Layout {
  const B = LEVEL.blocks, open = new Uint8Array(B * B);
  const rooms: BlockRect[] = [], links: RoomLink[] = [];
  const filled = (x: number, z: number) => x >= 0 && z >= 0 && x < B && z < B && open[z * B + x] !== 0;
  const within = (r: BlockRect) => r.x >= 1 && r.z >= 1 && r.x + r.w <= B - 1 && r.z + r.d <= B - 1;
  const clear = (r: BlockRect, margin: number) => {
    for (let z = r.z - margin; z < r.z + r.d + margin; z++)
      for (let x = r.x - margin; x < r.x + r.w + margin; x++) if (filled(x, z)) return false;
    return true;
  };
  const alongside = (r: BlockRect, alongX: boolean) => {
    for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++)
      if (alongX ? filled(x, z - 1) || filled(x, z + 1) : filled(x - 1, z) || filled(x + 1, z)) return true;
    return false;
  };
  const mark = (r: BlockRect, value: number) => {
    for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) open[z * B + x] = value;
  };
  const side = () => LEVEL.roomMin + Math.floor(random() * (LEVEL.roomMax - LEVEL.roomMin + 1));

  const attach = (parent: number, heading: Heading): number | null => {
    const p = rooms[parent], [dx, dz] = STEP[heading];
    for (let attempt = 0; attempt < LEVEL.attempts; attempt++) {
      const w = side(), d = side(), length = 1 + Math.floor(random() * LEVEL.corridorMax);
      // The corridor leaves from one block of the parent's side, and meets the new room somewhere
      // along the new room's facing side.
      const along = dx !== 0 ? p.z + Math.floor(random() * p.d) : p.x + Math.floor(random() * p.w);
      const offset = Math.floor(random() * (dx !== 0 ? d : w));
      let corridor: BlockRect, room: BlockRect;
      if (dx > 0) {
        corridor = { x: p.x + p.w, z: along, w: length, d: 1 };
        room = { x: p.x + p.w + length, z: along - offset, w, d };
      } else if (dx < 0) {
        corridor = { x: p.x - length, z: along, w: length, d: 1 };
        room = { x: p.x - length - w, z: along - offset, w, d };
      } else if (dz > 0) {
        corridor = { x: along, z: p.z + p.d, w: 1, d: length };
        room = { x: along - offset, z: p.z + p.d + length, w, d };
      } else {
        corridor = { x: along, z: p.z - length, w: 1, d: length };
        room = { x: along - offset, z: p.z - length - d, w, d };
      }
      if (!within(room) || !within(corridor) || !clear(room, 1) || !clear(corridor, 0)
        || alongside(corridor, dx !== 0)) continue;
      mark(room, 1); mark(corridor, 2); rooms.push(room);
      links.push({ a: parent, b: rooms.length - 1, corridor, heading, door: null });
      return rooms.length - 1;
    }
    return null;
  };

  const w = side(), d = side();
  const first = { x: Math.floor((B - w) / 2), z: Math.floor((B - d) / 2), w, d };
  mark(first, 1); rooms.push(first);
  // The spine: a room either side of the first, on one axis.
  const axis: Heading = random() < 0.5 ? 0 : 2;
  attach(0, axis); attach(0, (axis + 1) as Heading);
  // The branches, depth first: each side of each room may grow a room, less often the deeper it is.
  const stack = rooms.map((_, room) => ({ room, depth: 0 }));
  while (stack.length > 0 && rooms.length < LEVEL.maxRooms) {
    const { room, depth } = stack.pop()!;
    const chance = LEVEL.branchChance * LEVEL.branchDecay ** depth;
    for (const heading of shuffled<Heading>([0, 1, 2, 3], random)) {
      if (rooms.length >= LEVEL.maxRooms) break;
      if (random() >= chance) continue;
      const child = attach(room, heading);
      if (child !== null) stack.push({ room: child, depth: depth + 1 });
    }
  }
  return { rooms, links, open };
}

/** Every open block as `LEVEL.block` x `LEVEL.block` fine floor cells. */
function carve(open: Uint8Array): Uint8Array {
  const B = LEVEL.blocks, k = LEVEL.block, n = B * k, floor = new Uint8Array(n * n);
  for (let bz = 0; bz < B; bz++) for (let bx = 0; bx < B; bx++) {
    if (!open[bz * B + bx]) continue;
    for (let z = bz * k; z < bz * k + k; z++) for (let x = bx * k; x < bx * k + k; x++) floor[z * n + x] = 1;
  }
  return floor;
}

/** 1 for each fine cell a body of `clearance` can stand on, among `cells` (default: all). */
export function standingMask(map: DungeonMap, clearance = LEVEL.clearance, cells?: readonly number[]): Uint8Array {
  const n = map.size, out = new Uint8Array(n * n);
  const test = (i: number) => {
    const x = i % n, z = Math.floor(i / n);
    if (isFloor(map, x, z) && walkable(map, { x, z }, clearance)) out[i] = 1;
  };
  if (cells) for (const i of cells) test(i);
  else for (let i = 0; i < n * n; i++) test(i);
  return out;
}

/**
 * How many separate regions the cells a body of `clearance` can stand on form, joined the way
 * `findPath` joins them: four neighbours. Only cells inside `inside` count, if it is given.
 *
 * `findPath` also asks `clearSegment` of each step. Between two standing cells a unit step apart
 * that is always true, so it is not asked here: the distance from a point on an axis-aligned unit
 * step to an integer-centred cell is least at one of the step's ends, and both ends stand.
 * `standing_neighbours_need_no_sweep` pins that, because this function is 25 times faster without
 * the sweep and its callers run it hundreds of times per seed.
 */
export function standingComponents(map: DungeonMap, clearance = LEVEL.clearance, inside?: readonly BlockRect[]): number {
  const n = map.size, k = LEVEL.block, seen = new Uint8Array(n * n);
  let cells: number[] | undefined;
  if (inside) {
    cells = [];
    for (const r of inside)
      for (let z = r.z * k; z < (r.z + r.d) * k; z++) for (let x = r.x * k; x < (r.x + r.w) * k; x++) cells.push(z * n + x);
  }
  const stands = standingMask(map, clearance, cells);
  let components = 0;
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || !stands[start]) continue;
    components++; seen[start] = 1;
    const queue = [start];
    while (queue.length > 0) {
      const at = queue.pop()!, x = at % n, z = Math.floor(at / n);
      for (const [dx, dz] of STEP) {
        const nx = x + dx, nz = z + dz, key = nz * n + nx;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || seen[key] || !stands[key]) continue;
        seen[key] = 1; queue.push(key);
      }
    }
  }
  return components;
}

/**
 * Whether every corridor into `room` is still a way through: its two rooms and the corridor are
 * one standing region. A wall or a set piece in a room is kept only if this holds.
 */
function linksHold(layout: Layout, map: DungeonMap, room: number): boolean {
  return layout.links.every((l) => (l.a !== room && l.b !== room) ||
    standingComponents(map, LEVEL.clearance, [layout.rooms[l.a], layout.rooms[l.b], l.corridor]) === 1);
}

/**
 * Diablo's walls across rooms: one fine-cell wall across the room's long axis, with a gap one
 * block wide. The wall sits on a block boundary, on the boundary's near side in the room's first
 * half and its far side in the second, so the floor either side is at least one block wide: a wall
 * on the far side of the last boundary would leave a strip two cells wide that nobody can enter.
 * A wall is taken down unless `linksHold` -- which is what refuses one across a corridor mouth.
 * Returns how many walls stand.
 */
function divide(layout: Layout, map: DungeonMap, random: () => number): number {
  const k = LEVEL.block, n = map.size;
  let placed = 0;
  layout.rooms.forEach((r, index) => {
    if (Math.max(r.w, r.d) < LEVEL.dividerMinBlocks || random() >= LEVEL.dividerChance) return;
    // A room long in x gets a wall that is a fine column; a room long in z gets a fine row.
    const acrossX = r.w >= r.d;
    const span = acrossX ? r.w : r.d, other = acrossX ? r.d : r.w, low = acrossX ? r.x : r.z;
    const at = 1 + Math.floor(random() * (span - 1));
    const line = at * 2 <= span ? (low + at) * k : (low + at) * k - 1;
    const arch = Math.floor(random() * other);
    const from = (acrossX ? r.z : r.x) * k, to = from + other * k;
    const cells: number[] = [];
    for (let t = from; t < to; t++) {
      if (t >= from + arch * k && t < from + arch * k + k) continue;
      cells.push(acrossX ? t * n + line : line * n + t);
    }
    for (const cell of cells) map.floor[cell] = 0;
    if (!linksHold(layout, map, index)) { for (const cell of cells) map.floor[cell] = 1; return; }
    placed++;
  });
  return placed;
}

/**
 * A door in the block of each chosen corridor nearest the room it leaves, closing the corridor's
 * whole width: `walkable` blocks 1.5 m plus the body's radius across a door's axis.
 */
function hang(links: RoomLink[], random: () => number): Door[] {
  const k = LEVEL.block, doors: Door[] = [];
  for (const link of links) {
    if (random() >= LEVEL.doorChance) continue;
    const c = link.corridor, [dx, dz] = STEP[link.heading];
    const bx = dx < 0 ? c.x + c.w - 1 : c.x, bz = dz < 0 ? c.z + c.d - 1 : c.z;
    link.door = doors.length;
    doors.push({ id: doors.length, axis: dx !== 0 ? "x" : "z", open: false,
      point: { x: bx * k + 1, z: bz * k + 1 } });
  }
  return doors;
}

/**
 * Steps on foot from `from` to every fine cell for a body of `clearance`, searched as `findPath`
 * searches (four neighbours, one metre each), and -1 where it cannot go. Doors are ignored, as
 * they open. It is one search where asking `findPath` for each room was ten, and `findPath`'s open
 * list is a linear scan: over a scratch prototype of session 03, the per-room `findPath` calls
 * were 1.8 s of 2.9 s of generation. `findPath` also pulls its route straight afterwards, so a
 * hero walks a little less than this.
 */
export function walkField(map: DungeonMap, from: Point, clearance = LEVEL.clearance): Int32Array {
  const n = map.size, steps = new Int32Array(n * n).fill(-1), start = Math.round(from.z) * n + Math.round(from.x);
  const stands = standingMask(map, clearance);
  steps[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head], x = at % n, z = Math.floor(at / n);
    for (const [dx, dz] of STEP) {
      const nx = x + dx, nz = z + dz, key = nz * n + nx;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || steps[key] >= 0 || !stands[key]) continue;
      steps[key] = steps[at] + 1; queue.push(key);
    }
  }
  return steps;
}

/** The standing cell within `bounds` nearest `target`, or null if none stands. */
export function standingNear(map: DungeonMap, bounds: { min: Point; max: Point }, target: Point): Point | null {
  let best: Point | null = null, off = Infinity;
  for (let z = bounds.min.z; z <= bounds.max.z; z++) for (let x = bounds.min.x; x <= bounds.max.x; x++) {
    if (!isFloor(map, x, z) || !walkable(map, { x, z }, LEVEL.clearance)) continue;
    const d = distance({ x, z }, target);
    if (d < off) { off = d; best = { x, z }; }
  }
  return best;
}

/** Each room's fine bounds, and as its centre the standing cell nearest its middle. */
function roomsOf(layout: Layout, map: DungeonMap): Room[] {
  const k = LEVEL.block;
  return layout.rooms.map((r, id) => {
    const min = { x: r.x * k, z: r.z * k }, max = { x: (r.x + r.w) * k - 1, z: (r.z + r.d) * k - 1 };
    const centre = standingNear(map, { min, max }, { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 });
    // Unreachable: `linksHold` keeps every room one standing region.
    if (!centre) throw new Error(`room ${id} has nowhere to stand`);
    return { id, centre, min, max };
  });
}

/** Spawns, one per room round the rooms in a shuffled order, until there are enough. */
function spawnsFor(map: DungeonMap, startRoom: number, random: () => number): Point[] {
  const spawns: Point[] = [];
  const pools = shuffled(map.rooms.filter((r) => r.id !== startRoom), random).map((r) => {
    const cells: Point[] = [];
    for (let z = r.min.z; z <= r.max.z; z++) for (let x = r.min.x; x <= r.max.x; x++) {
      const p = { x, z };
      if (isFloor(map, x, z) && walkable(map, p, LEVEL.clearance) && distance(p, map.start) > LEVEL.spawnFromStart) cells.push(p);
    }
    return cells;
  });
  for (let round = 0; round < LEVEL.spawnCount && spawns.length < LEVEL.spawnCount; round++) {
    for (const pool of pools) {
      if (spawns.length >= LEVEL.spawnCount) break;
      const free = pool.filter((p) => spawns.every((s) => distance(s, p) >= LEVEL.spawnSpacing));
      if (free.length > 0) spawns.push(free[Math.floor(random() * free.length)]);
    }
  }
  return spawns;
}

/** One layout drawn from `random`, or null if it fails a rule and another must be drawn. */
function drawLevel(seed: number, random: () => number): Level | null {
  const layout = layRooms(random);
  if (layout.rooms.length < LEVEL.minRooms) return null;
  const size = LEVEL.blocks * LEVEL.block;
  const map: DungeonMap = { seed: seed >>> 0, size, floor: carve(layout.open), rooms: [], doors: [],
    start: { x: 0, z: 0 }, exit: { x: 0, z: 0 }, spawns: [] };
  const dividers = divide(layout, map, random);
  map.doors = hang(layout.links, random);
  map.rooms = roomsOf(layout, map);
  const degree = map.rooms.map((r) => layout.links.filter((l) => l.a === r.id || l.b === r.id).length);
  const leaves = map.rooms.filter((r) => degree[r.id] === 1);
  const startRoom = leaves.length > 0 ? leaves[Math.floor(random() * leaves.length)] : map.rooms[0];
  map.start = { ...startRoom.centre };
  const field = walkField(map, map.start);
  let exitRoom = -1, exitPath = -1;
  for (const room of map.rooms) {
    if (room === startRoom) continue;
    const walked = field[room.centre.z * size + room.centre.x];
    if (walked > exitPath) { exitPath = walked; exitRoom = room.id; }
  }
  if (exitRoom < 0) throw new Error(`seed ${seed >>> 0}: the start reaches no other room`);
  if (exitPath < LEVEL.minExitPath) return null;
  map.exit = { ...map.rooms[exitRoom].centre };
  map.spawns = spawnsFor(map, startRoom.id, random);
  if (map.spawns.length < LEVEL.spawnCount) return null;
  return {
    map, roomBlocks: layout.rooms, links: layout.links,
    metrics: { rooms: map.rooms.length, floorCells: map.floor.reduce((sum, cell) => sum + cell, 0),
      exitPath, dividers, doors: map.doors.length },
  };
}

/** The level for a seed: always the same one. */
export function generateLevel(seed: number): Level {
  const random = mulberry32(seed);
  for (let attempt = 0; attempt < LEVEL.tries; attempt++) {
    const level = drawLevel(seed, random);
    if (level) return level;
  }
  throw new Error(`no level for seed ${seed >>> 0} in ${LEVEL.tries} tries`);
}

/**
 * The level as text, two characters a cell so it reads square in a terminal: `##` wall, `. ` floor,
 * `||` or `==` a door (its plane), `S ` start, `E ` exit, `e ` a spawn, blank rock. Row 0 is z = 0.
 */
export function levelRows(map: DungeonMap): string[] {
  const n = map.size, marks = new Map<number, string>();
  const key = (p: Point) => Math.round(p.z) * n + Math.round(p.x);
  for (const door of map.doors) for (let t = -1; t <= 1; t++) {
    marks.set(key(door.axis === "x" ? { x: door.point.x, z: door.point.z + t } : { x: door.point.x + t, z: door.point.z }),
      door.axis === "x" ? "||" : "==");
  }
  for (const spawn of map.spawns) marks.set(key(spawn), "e ");
  marks.set(key(map.start), "S "); marks.set(key(map.exit), "E ");
  const rows: string[] = [];
  for (let z = 0; z < n; z++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const floorHere = isFloor(map, x, z);
      const wall = !floorHere && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => isFloor(map, x + dx, z + dz)));
      row += marks.get(z * n + x) ?? (floorHere ? ". " : wall ? "##" : "  ");
    }
    rows.push(row);
  }
  return rows;
}
