# Session 02: rooms after the Cathedral, on 3 m blocks

## Goal

A new generator, `generateLevel(seed)` in `src/dungeon/level.ts`. It lays out the level on a
coarse grid of 3 m blocks:

1. A spine of up to three rooms.
2. Rooms branched off it, depth first.
3. The blocks carved into the 51 x 51 fine grid the run already uses.
4. A wall with a 3 m arch drawn across the longer rooms.
5. Doors in some corridors.
6. The start in a leaf room, the exit in the room farthest on foot, and eight spawns.

Three invariants are checked, not hoped for, all at the widest hero's clearance:

- **One region.** Every cell the widest hero can stand on is reachable from every other.
- **Every link is a way through.** For each corridor, its two rooms and the corridor itself form
  one standing region. The first invariant does not imply this one once session 03 adds loops: a
  wall across a corridor mouth leaves the level connected the long way round and the corridor
  dead. Measured on a scratch prototype of sessions 02-03 with only the global check, 25 dead links
  in 24 levels.
- **No floor out of reach.** Every floor cell is next to a cell the hero can stand on, so no wall
  leaves a strip too narrow to enter. A wall drawn on a block boundary without care leaves a strip
  two cells wide (measured: 168 such cells in 24 levels), and two metres is floor the widest hero
  can see and never reach.

An ASCII printer lets the owner read layouts before anything plays on them. The run does not use
this yet (session 05). Nothing a player sees changes.

## Files

| File | Change |
|---|---|
| `src/dungeon/level.ts` | New. Node-loadable, `.ts` imports. |
| `src/dungeon/map.ts` | `Room` becomes a rectangle, and `generateDungeon` fills it. |
| `scripts/dungeon/print-level.mjs` | New. Prints levels as text. |
| `tests/dungeon-level.test.mjs` | New. |

## `src/dungeon/map.ts`

`Room` today is `{ id; centre; half }`, a square. Nothing outside `generateDungeon` reads `half`.
The tests read `centre`, and `JSON.stringify(map.rooms)` as a layout fingerprint. It becomes an
inclusive rectangle of fine cells:

```ts
/** A room's floor, as inclusive fine-cell bounds; `centre` is a cell a body can stand on. */
export interface Room { id: number; centre: Point; min: Point; max: Point }
```

In `generateDungeon`, the `rooms` map becomes:

```ts
  const rooms = slots.map((slot, id) => {
    const centre = { x: 9 + slot % 3 * 16, z: 9 + Math.floor(slot / 3) * 16 };
    const half = random() < 0.5 ? 4 : 5;
    return { id, centre, min: { x: centre.x - half, z: centre.z - half }, max: { x: centre.x + half, z: centre.z + half } };
  });
```

The carve loop reads `r.min`/`r.max` instead of `r.centre +- r.half`. The door placement reads
`half` twice (`room.half + 1`); give it a local `const half = room.max.x - room.centre.x`, which is
the same number. The generator consumes the same random draws in the same order, so every classic
layout is bit-identical (the reviewer checked 200 of 200 seeds against a copy of today's function).
`dungeon seeds produce connected, clear rooms, doors and eight nonoverlapping spawns` fingerprints
the rooms by JSON, and still passes because it compares a map with itself.

## `src/dungeon/level.ts`

```ts
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
```

The wall test in `levelRows` is `boundary` in `buildDungeonWorld` (`src/dungeon/world.ts`), so the
text shows the walls the page will build.

Notes for the implementer:

- **Where the wall goes.** A room `span` blocks long has boundaries `at` = 1 to `span - 1`. A wall
  on the near side of boundary `at` leaves `3 * at` cells before it and `3 * (span - at) - 1`
  after. Using the near side for `at * 2 <= span` and the far side (`- 1`) otherwise makes both at
  least 3: for a 3-block room, 3 and 5 or 5 and 3; for a 4-block room, 3 and 8, 6 and 5, or 8 and
  3. The draft of this plan used the near side always, and the last boundary then left two cells.
- **No refusal of walls where a corridor enters.** The draft picked a boundary that no corridor
  entered through. With `linksHold`, the refusal changed nothing a test can see (on the prototype
  it moved the wall count from 94 to 90 over 24 levels), so it went: `linksHold` is the rule, and
  there is one copy of it.
- **Cost.** On the prototype, session 02's generation is 1.6 ms per seed. `standingComponents` over
  the whole map is about 1 ms without the per-step sweep and about 25 ms with it; the masked
  calls in `linksHold` cost a fraction of that.
- `STEP` is typed as a readonly tuple list so `const [dx, dz] = STEP[heading]` is two numbers.
- If `tsc` objects to `shuffled<Heading>([0, 1, 2, 3], random)`, write the array as
  `[0, 1, 2, 3] as Heading[]`.

## `scripts/dungeon/print-level.mjs`

```js
// Print generated levels as text, to judge layouts before they are played.
//   node scripts/dungeon/print-level.mjs            seeds 1 to 4
//   node scripts/dungeon/print-level.mjs 7 42 99    those seeds
import { generateLevel, levelRows } from "../../src/dungeon/level.ts";

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length > 0 ? seeds : [1, 2, 3, 4]) {
  const started = performance.now();
  const { map, metrics } = generateLevel(seed);
  const ms = performance.now() - started;
  console.log(`\nseed ${seed}  ${Object.entries(metrics).map(([k, v]) => `${k} ${Math.round(v)}`).join("  ")}  (${ms.toFixed(0)} ms)`);
  for (const row of levelRows(map)) console.log(row.trimEnd());
}
```

## `tests/dungeon-level.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { generateLevel, LEVEL, levelRows, standingComponents, standingMask, walkField } from "../src/dungeon/level.ts";
import { clearSegment, findPath, isFloor, walkable, distance } from "../src/dungeon/map.ts";

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const LEVELS = SEEDS.map((seed) => generateLevel(seed));
const R = LEVEL.clearance;
/** A map of `rows`, `.` floor and `#` rock, for controls. */
const drawn = (rows) => {
  const size = rows.length, floor = new Uint8Array(size * size);
  rows.forEach((row, z) => [...row].forEach((c, x) => { floor[z * size + x] = c === "." ? 1 : 0; }));
  return { seed: 0, size, floor, rooms: [], doors: [], start: { x: 0, z: 0 }, exit: { x: 0, z: 0 }, spawns: [] };
};

test("a_seed_is_always_the_same_level_and_seeds_differ", () => {
  for (const seed of [0, 7, 4242]) assert.deepEqual(generateLevel(seed), generateLevel(seed));
  const floors = new Set(LEVELS.map(({ map }) => Buffer.from(map.floor).toString("base64")));
  assert.ok(floors.size >= 22, `${floors.size} distinct levels of 24`);
});

test("every_place_the_widest_hero_can_stand_reaches_every_other", () => {
  for (const { map } of LEVELS) assert.equal(standingComponents(map), 1, `seed ${map.seed}`);
  // The control: two rooms with rock between them are two regions, not one.
  const size = 20, floor = new Uint8Array(size * size);
  for (const x0 of [2, 12]) for (let z = 2; z < 8; z++) for (let x = x0; x < x0 + 6; x++) floor[z * size + x] = 1;
  const apart = { seed: 0, size, floor, rooms: [], doors: [], start: { x: 4, z: 4 }, exit: { x: 14, z: 4 }, spawns: [] };
  assert.equal(standingComponents(apart), 2);
});

test("every_link_is_a_way_through", () => {
  for (const { map, links, roomBlocks } of LEVELS) for (const [i, l] of links.entries()) {
    assert.equal(standingComponents(map, R, [roomBlocks[l.a], roomBlocks[l.b], l.corridor]), 1, `seed ${map.seed} link ${i}`);
  }
  // The control: one fine line of rock across a corridor, and that link is two regions.
  const { map, links, roomBlocks } = LEVELS[0], l = links[0], k = LEVEL.block, c = l.corridor;
  const cut = { ...map, floor: map.floor.slice() };
  for (let z = c.z * k; z < (c.z + c.d) * k; z++) for (let x = c.x * k; x < (c.x + c.w) * k; x++) {
    if (l.heading < 2 ? x === c.x * k + 1 : z === c.z * k + 1) cut.floor[z * map.size + x] = 0;
  }
  assert.equal(standingComponents(cut, R, [roomBlocks[l.a], roomBlocks[l.b], c]), 2);
});

test("every_floor_cell_is_next_to_a_place_to_stand", () => {
  const stranded = (map) => {
    const n = map.size, stands = standingMask(map), out = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      if (!isFloor(map, x, z)) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < n && nz < n && stands[nz * n + nx]) near = true;
      }
      if (!near) out.push(`${x},${z}`);
    }
    return out;
  };
  for (const { map } of LEVELS) assert.deepEqual(stranded(map), [], `seed ${map.seed}`);
  // The control: a strip two cells wide beside a room three wide.
  assert.deepEqual(stranded(drawn(["########", "#...#..#", "#...#..#", "#...#..#", "########", "########", "########", "########"])),
    ["5,1", "6,1", "5,2", "6,2", "5,3", "6,3"]);
});

test("standing_neighbours_need_no_sweep", () => {
  // standingComponents and walkField skip findPath's clearSegment on a unit step; this is why.
  for (const { map } of LEVELS.slice(0, 4)) {
    const n = map.size, stands = standingMask(map);
    for (let z = 0; z < n; z++) for (let x = 0; x + 1 < n; x++) {
      if (stands[z * n + x] && stands[z * n + x + 1]) assert.ok(clearSegment(map, { x, z }, { x: x + 1, z }, R), `seed ${map.seed} ${x},${z} +x`);
      if (z + 1 < n && stands[z * n + x] && stands[(z + 1) * n + x]) assert.ok(clearSegment(map, { x, z }, { x, z: z + 1 }, R), `seed ${map.seed} ${x},${z} +z`);
    }
  }
});

test("the_start_the_exit_every_room_and_every_spawn_is_a_place_to_stand_on_the_route", () => {
  for (const { map } of LEVELS) {
    for (const p of [map.exit, ...map.rooms.map((r) => r.centre), ...map.spawns]) {
      assert.ok(walkable(map, p, R), `seed ${map.seed}: ${JSON.stringify(p)} is clear`);
      if (distance(p, map.start) > 0) assert.ok(findPath(map, map.start, p, R).length, `seed ${map.seed}: reachable`);
    }
  }
});

test("the_level_is_rock_all_round", () => {
  for (const { map } of LEVELS) {
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) {
      const edge = x < LEVEL.block || z < LEVEL.block || x >= map.size - LEVEL.block || z >= map.size - LEVEL.block;
      if (edge) assert.equal(isFloor(map, x, z), false, `seed ${map.seed}: floor at ${x},${z}`);
    }
  }
});

test("a_door_shuts_its_corridor_across_its_whole_width_and_opens", () => {
  let doors = 0;
  for (const level of LEVELS) {
    // A copy of the doors: this test opens them, and LEVELS is shared.
    const map = { ...level.map, doors: level.map.doors.map((d) => ({ ...d })) };
    for (const door of map.doors) {
      doors++;
      const { x, z } = door.point;
      assert.ok(walkable(map, door.point, R));
      assert.equal(walkable(map, door.point, R, true), false, "a closed door blocks");
      // Rock two cells either side across the door's plane: the door spans the corridor.
      const across = door.axis === "x" ? [[x, z - 2], [x, z + 2]] : [[x - 2, z], [x + 2, z]];
      for (const [cx, cz] of across) assert.equal(isFloor(map, cx, cz), false, `seed ${map.seed} door ${door.id}`);
      door.open = true;
      assert.ok(walkable(map, door.point, R, true), "an open door does not");
    }
  }
  assert.ok(doors >= 96, `${doors} doors over ${SEEDS.length} levels`); // 115 on the prototype
});

test("eight_spawns_stand_apart_and_away_from_the_start", () => {
  for (const { map } of LEVELS) {
    assert.equal(map.spawns.length, LEVEL.spawnCount);
    for (let i = 0; i < map.spawns.length; i++) {
      assert.ok(distance(map.start, map.spawns[i]) > LEVEL.spawnFromStart);
      for (let j = i + 1; j < map.spawns.length; j++) assert.ok(distance(map.spawns[i], map.spawns[j]) >= LEVEL.spawnSpacing);
    }
  }
});

test("the_exit_is_the_room_farthest_on_foot_and_far_enough", () => {
  for (const { map, metrics } of LEVELS) {
    assert.ok(metrics.exitPath >= LEVEL.minExitPath, `seed ${map.seed}: ${metrics.exitPath} m`);
    const field = walkField(map, map.start), at = (p) => field[p.z * map.size + p.x];
    assert.equal(at(map.exit), metrics.exitPath, `seed ${map.seed}`);
    for (const room of map.rooms) assert.ok(at(room.centre) >= 0 && at(room.centre) <= metrics.exitPath, `seed ${map.seed} room ${room.id}`);
  }
});

test("walls_cross_the_long_rooms_and_the_count_is_the_walls_that_stand", () => {
  let divided = 0;
  for (const { map, metrics } of LEVELS) {
    // A room with rock inside its own bounds is a room with a wall across it.
    const walled = map.rooms.filter((r) => {
      for (let z = r.min.z; z <= r.max.z; z++) for (let x = r.min.x; x <= r.max.x; x++) if (!isFloor(map, x, z)) return true;
      return false;
    }).length;
    assert.equal(walled, metrics.dividers, `seed ${map.seed}`);
    if (walled > 0) divided++;
  }
  assert.ok(divided >= 20, `${divided} of 24 levels have a wall across a room`); // 24 on the prototype
});

test("a_level_prints_square_with_one_start_and_one_exit", () => {
  const { map } = LEVELS[0], rows = levelRows(map);
  assert.equal(rows.length, map.size);
  for (const row of rows) assert.equal(row.length, map.size * 2);
  const text = rows.join("\n");
  assert.equal(text.split("S ").length - 1, 1); assert.equal(text.split("E ").length - 1, 1);
});
```

The floors (`>= 22` distinct, `>= 96` doors, `>= 20` divided) sit under what a scratch prototype
of this session gave over seeds 0-23: 24 distinct, 115 doors, 94 walls, a wall in all 24 levels,
7 to 11 rooms, exit walks from 50 m. The prototype is not the implementation. Run the file, print
the real figures, and if one is far from these, find out why before moving a floor.

**Mutations, each must go red.** Every one below was run against the prototype with these exact
tests, and went red (or stayed green) as written; the implementation must reproduce that.

- Make the arch two cells wide (`arch * k + k - 1`): every wall is taken down, because the room it
  splits fails `linksHold`, so `walls_cross_the_long_rooms...` goes red.
- The same, with `linksHold` returning true: `every_place_the_widest_hero...` goes red.
- `linksHold` returning true, alone: `every_link_is_a_way_through` goes red (prototype: 14 dead
  links in 24 levels, walls across corridor mouths).
- Always use the near side of the boundary (drop the `- 1`): `every_floor_cell_is_next_to...`
  goes red (prototype: 168 stranded cells in 24 levels).
- Make `standingComponents` return 1 always: its control goes red.
- Give `standingComponents` or `walkField` a diagonal step: `standing_neighbours...` stays green,
  which is right (it is about the sweep, not the neighbours). `the_exit_is_the_room_farthest...`
  stays green too, because both sides move. Nothing pins four-neighbour agreement with `findPath`
  beyond `the_start_the_exit...`; say so in the commit.
- Swap a door's axis in `hang`: `a_door_shuts_its_corridor...` goes red.
- Choose the exit as the first room rather than the farthest: `the_exit_is_the_room_farthest...`
  goes red.
- Drop the `spawnFromStart` filter in `spawnsFor`: `eight_spawns...` goes red.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- `node scripts/dungeon/print-level.mjs 1 2 3 4 5 6`. Paste two of the levels into the commit
  message, and show the owner six.
- Time the whole of `tests/dungeon-level.test.mjs` and put the figure in the commit message. The
  prototype's generation for 24 seeds is under 0.1 s; if the file takes more than about 3 s, find
  what is slow before landing.
- There is no browser check. Nothing on the page reads this module yet.

## What landed, and what the review changed

The code and tests above landed as written. Over seeds 0-23 the figures match the prototype
exactly: 24 distinct levels, 115 doors, 94 walls, every level divided, 7 to 11 rooms, a shortest
exit walk of 50 m. Three mutations above (`linksHold` always true, one component always, a
diagonal step in `standingComponents`) go red as the whole file failing to load rather than in the
named test: `drawLevel` throws "the start reaches no other room" while `LEVELS` is built.

The adversarial review found no defect in the generator (no invariant broke over seeds 0-2000, no
throw over 20,000) and four gaps in the tests, three of them repaired here:

- `every_link_is_a_way_through` passed with `standingComponents` ignoring its blocks, because in a
  tree a cut link splits the whole map too. A masked control on an uncut level now reads 2.
- Where a door hangs was not tested. The door test now asserts each door is in its corridor, in a
  block touching the room the corridor leaves, and that some corridor is long enough for that to
  matter.
- The start being a leaf was not tested. The exit test now asserts it wherever a level has a leaf.
- Not repaired, and pinned by nothing: dropping `spawnSpacing` changes no level in 24 (one spawn
  per room per round rarely comes within 2 m of another), `alongside` changes no floor in 500 seeds
  because the room margin already keeps corridors off everything, and `minExitPath` (24 m) never
  fires -- the shortest exit walk over 20,000 seeds is 42 m. Each is a guard on a construction
  that already holds.

The review also noted that 62 of 16,008 spawns over seeds 0-2000 stand on the exit cell. Nothing
forbids it; it matters only once session 05 puts enemies on these levels.
