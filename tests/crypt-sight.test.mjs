/**
 * The crypt's sight read through an index (`SightIndex`, `src/dungeon/map.ts`): the index changes
 * no answer of `canSee` or `reveal`, with its doors closed, as they open, and when it was made
 * before they opened; an obstacle and a cell's edge stop sight through it as they do without it;
 * a party's sight read into one set lists the cells it listed member by member; and the index
 * vouches for most of the floor, so the answers it does not change are the ones it reads.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { canSee, reveal, sightIndex } from "../src/dungeon/map.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** The crypt whose rack and column `tests/crypt-detail.test.mjs` reads. */
const REPORTED_SEED = 2124530852;
const random = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const floorCells = (map) => {
  const cells = [];
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) if (map.floor[z * map.size + x] === 1) cells.push({ x, z });
  return cells;
};

/**
 * Sight with an index against sight without, on the levels of `SEEDS`: each level with its doors
 * closed and then opened one by one, `indexAt(map, opened)` the index read through at each. From
 * 60 seeded points a level, off the cells' middles: the cells revealed, in order, and a line of
 * up to 14 m to another such point. What was compared, and how many answers differ.
 */
function compared(indexAt) {
  const read = { cells: 0, lines: 0, seen: 0, differ: 0, doors: 0 };
  for (const seed of SEEDS) {
    const map = generateLevel(seed).map, next = random(seed), floor = floorCells(map);
    const place = () => { const c = floor[Math.floor(next() * floor.length)]; return { x: c.x + (next() - 0.5) * 0.98, z: c.z + (next() - 0.5) * 0.98 }; };
    read.doors += map.doors.length;
    for (let opened = 0; opened <= map.doors.length; opened++) {
      const index = indexAt(map, opened);
      for (let n = 0; n < 60; n++) {
        const at = place(), plain = [...reveal(map, at, new Set())], indexed = [...reveal(map, at, new Set(), 12, index)];
        read.cells += plain.length;
        if (plain.join() !== indexed.join()) read.differ++;
        const to = place(), sees = canSee(map, at, to, 14);
        read.lines++;
        if (sees) read.seen++;
        if (sees !== canSee(map, at, to, 14, index)) read.differ++;
      }
      if (opened < map.doors.length) map.doors[opened].open = true;
    }
  }
  return read;
}

/** What was read is enough to show a difference: cells by the hundred thousand, lines seen and lines stopped, doors that opened. */
function assertRead(read) {
  assert.equal(read.differ, 0, `${read.differ} answers differ over ${read.cells} cells and ${read.lines} lines`);
  assert.ok(read.cells > 300000 && read.lines > 3000 && read.doors > 20, JSON.stringify(read));
  assert.ok(read.seen > read.lines / 20 && read.seen < read.lines / 2, `${read.seen} of ${read.lines} lines are seen along`);
}

test("the_index_changes_no_answer", () => {
  assertRead(compared((map) => sightIndex(map)));
});

test("a_stale_index_is_right_as_doors_open", () => {
  let made = null;
  assertRead(compared((map, opened) => (opened === 0 ? made = sightIndex(map) : made)));
});

test("an_obstacle_stops_sight_through_the_index_as_it_does_without", () => {
  /** Lines about one obstacle: across it both ways at five places, beside each of its sides within 0.003 m, and ending on it from four sides. */
  const lines = (o) => {
    const w = o.width / 2, d = o.depth / 2, out = [];
    for (const f of [-0.9, -0.5, 0, 0.5, 0.9]) {
      out.push([{ x: o.x + f * w, z: o.z - d - 0.3 }, { x: o.x + f * w, z: o.z + d + 0.3 }]);
      out.push([{ x: o.x - w - 0.3, z: o.z + f * d }, { x: o.x + w + 0.3, z: o.z + f * d }]);
    }
    for (const side of [-1, 1]) for (const off of [0.0005, 0.0015, 0.0025]) {
      out.push([{ x: o.x + side * (w + off), z: o.z - d - 0.3 }, { x: o.x + side * (w + off), z: o.z + d + 0.3 }]);
      out.push([{ x: o.x - w - 0.3, z: o.z + side * (d + off) }, { x: o.x + w + 0.3, z: o.z + side * (d + off) }]);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push([{ x: o.x + dx * (w + 0.6), z: o.z + dz * (d + 0.6) }, { x: o.x, z: o.z }]);
    return out;
  };
  const read = { lines: 0, blocking: 0, stopped: 0, seen: 0 }, differ = [];
  for (const seed of [REPORTED_SEED, 1, 2, 3, 4]) {
    const map = generateCryptDungeon(seed).map, index = sightIndex(map);
    for (const o of map.obstacles) {
      if (o.blocksSight) read.blocking++;
      for (const [a, b] of lines(o)) {
        const sees = canSee(map, a, b);
        read.lines++;
        if (o.blocksSight) read[sees ? "seen" : "stopped"]++;
        if (sees !== canSee(map, a, b, 12, index)) differ.push(`seed ${seed}, ${o.id}: ${JSON.stringify([a, b])} is ${sees ? "seen" : "stopped"} by the map`);
      }
    }
  }
  assert.deepEqual(differ, []);
  // The control: obstacles that stop sight stand in these crypts, and lines about them are stopped and are seen.
  assert.ok(read.blocking >= 10 && read.stopped > read.blocking && read.seen > read.blocking, JSON.stringify(read));

  const map = generateCryptDungeon(REPORTED_SEED).map, index = sightIndex(map);
  const across = (kind) => {
    const o = map.obstacles.find((candidate) => candidate.id.includes(`.${kind}.`));
    return canSee(map, { x: o.x, z: o.z - o.depth / 2 - 0.3 }, { x: o.x, z: o.z + o.depth / 2 + 0.3 }, 12, index);
  };
  assert.deepEqual({ rack: across("rack"), column: across("column") }, { rack: true, column: false }, "sight passes an open rack and not a column");
});

test("a_sample_at_a_cell_s_edge_is_the_map_s", () => {
  // One room, floor from 1 to 9 each way in an 11 by 11 grid, with two rock cells inside it that meet at a corner: (5.5, 5.5).
  const size = 11, floor = new Uint8Array(size * size);
  for (let z = 1; z < 10; z++) for (let x = 1; x < 10; x++) floor[z * size + x] = 1;
  floor[5 * size + 5] = 0; floor[6 * size + 6] = 0;
  const map = { seed: 0, size, floor, rooms: [], doors: [], obstacles: [], start: { x: 1, z: 1 }, exit: { x: 9, z: 9 }, spawns: [] };
  const index = sightIndex(map), both = (a, b) => [canSee(map, a, b), canSee(map, a, b, 12, index)];
  // Along each wall, at 0.4985, 0.4995 and 0.5 m from the middles of the cells beside it: rock stops sight within 0.001 m of itself.
  const along = (off) => [
    both({ x: 1 - off, z: 2 }, { x: 1 - off, z: 8 }), both({ x: 9 + off, z: 2 }, { x: 9 + off, z: 8 }),
    both({ x: 2, z: 1 - off }, { x: 8, z: 1 - off }), both({ x: 2, z: 9 + off }, { x: 8, z: 9 + off }),
  ];
  const seen = [[true, true], [true, true], [true, true], [true, true]], stopped = [[false, false], [false, false], [false, false], [false, false]];
  assert.deepEqual({ "0.4985": along(0.4985), "0.4995": along(0.4995), "0.5": along(0.5) }, { "0.4985": seen, "0.4995": stopped, "0.5": stopped });
  // Through the corner where the two rock cells meet, and past it by `u` toward one cell of floor and `v` away from the other rock cell.
  const past = (u, v) => both({ x: 6 + u, z: 5 - v }, { x: 5 + u, z: 6 - v });
  assert.deepEqual({ through: past(0, 0), clear: past(0.0015, 0.0015), nearOne: past(0.0005, 0.0015), nearOther: past(0.0015, 0.0005) },
    { through: [false, false], clear: [true, true], nearOne: [false, false], nearOther: [false, false] });

  // A column and a closed door each astride the edge between two cells, which no generated level stands: each reaches into both.
  map.obstacles = [{ id: "column", x: 3.5, z: 3, width: 0.8, depth: 0.8, height: 2.65, blocksSight: true }];
  map.doors = [{ id: 0, point: { x: 6.5, z: 7 }, axis: "x", open: false }];
  const astride = () => {
    const index = sightIndex(map), both = (a, b) => [canSee(map, a, b), canSee(map, a, b, 12, index)];
    return { column: [3.3, 3.7].map((x) => both({ x, z: 1.5 }, { x, z: 4.5 })), door: both({ x: 5, z: 7 }, { x: 8, z: 7 }) };
  };
  assert.deepEqual(astride(), { column: [[false, false], [false, false]], door: [false, false] });
  map.doors[0].open = true;
  assert.deepEqual(astride().door, [true, true], "the open door is seen through");
});

test("a_party_s_sight_is_its_members_in_the_order_it_was", () => {
  let added = 0;
  for (const seed of [1, 2, 3, 4]) {
    const map = generateLevel(seed).map, index = sightIndex(map), floor = floorCells(map);
    // Four places a metre apart about the start, off the cells' middles, and one across the level, which sees other cells.
    const near = floor.filter((c) => Math.abs(c.x - map.start.x) <= 1 && Math.abs(c.z - map.start.z) <= 1).slice(0, 4);
    const far = floor.reduce((best, c) => (Math.abs(c.x - map.start.x) + Math.abs(c.z - map.start.z) > Math.abs(best.x - map.start.x) + Math.abs(best.z - map.start.z) ? c : best));
    const from = [...near, far].map((c, i) => ({ x: c.x + 0.3 - 0.15 * i, z: c.z - 0.2 + 0.1 * i }));
    assert.equal(from.length, 5, `seed ${seed}: four cells of floor about the start`);

    const [first, ...rest] = from, byMember = new Set(), visible = reveal(map, first, byMember);
    const alone = visible.size;
    for (const at of rest) for (const cell of reveal(map, at, byMember)) visible.add(cell);
    added += visible.size - alone;

    const explored = new Set(), together = new Set();
    for (const at of from) assert.equal(reveal(map, at, explored, 12, index, together), together, "what is seen is added to the set given, which is returned");
    assert.deepEqual([...together], [...visible], `seed ${seed}: what the party sees, in order`);
    assert.deepEqual([...explored], [...byMember], `seed ${seed}: what the party has explored, in order`);
  }
  // The control: the members after the first see cells it does not, so the order is of more than one member's cells.
  assert.ok(added > 100, `the later members add ${added} cells`);
});

test("the_index_vouches_for_most_of_the_floor", () => {
  const share = (map) => { const { clear } = sightIndex(map); return clear.reduce((sum, c) => sum + c, 0) / floorCells(map).length; };
  for (const seed of SEEDS) {
    const map = generateLevel(seed).map, closed = share(map);
    for (const door of map.doors) door.open = true;
    const open = share(map);
    assert.ok(closed >= 0.8, `seed ${seed}: ${closed.toFixed(3)} of the floor is clear with the doors closed`);
    assert.ok(open > closed && open <= 1, `seed ${seed}: ${open.toFixed(3)} with them open, ${closed.toFixed(3)} closed`);
  }
});
