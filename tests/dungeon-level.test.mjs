import test from "node:test";
import assert from "node:assert/strict";
import { deadEnds, generateLevel, LEVEL, levelCandidates, levelRows, levelScore, standingComponents, standingMask, standingNear,
  walkField } from "../src/dungeon/level.ts";
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
  // The controls: without its corridor a link's two rooms are two regions, which only a count that
  // keeps to its blocks can see; and one fine line of rock across a corridor cuts the link.
  const { map, links, roomBlocks } = LEVELS[0], l = links[0], k = LEVEL.block, c = l.corridor;
  assert.equal(standingComponents(map, R, [roomBlocks[l.a], roomBlocks[l.b]]), 2);
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
  let doors = 0, long = 0;
  for (const level of LEVELS) {
    // Each door hangs in its corridor, in a block that touches the room the corridor leaves.
    for (const l of level.links) if (l.door !== null) {
      const { point } = level.map.doors[l.door], k = LEVEL.block, c = l.corridor, a = level.roomBlocks[l.a];
      const bx = Math.floor(point.x / k), bz = Math.floor(point.z / k);
      assert.ok(bx >= c.x && bx < c.x + c.w && bz >= c.z && bz < c.z + c.d, `seed ${level.map.seed} door ${l.door} in its corridor`);
      const gap = Math.max(a.x - bx, bx - (a.x + a.w - 1), 0) + Math.max(a.z - bz, bz - (a.z + a.d - 1), 0);
      assert.equal(gap, 1, `seed ${level.map.seed} door ${l.door} beside room ${l.a}`);
      if (c.w * c.d > 1) long++;
    }
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
  assert.ok(long > 0, "a corridor long enough for its door's end to matter");
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
  let leafStarts = 0;
  for (const { map, metrics, links } of LEVELS) {
    // The start is a room with one way out whenever the level has one.
    const degree = map.rooms.map((r) => links.filter((l) => l.a === r.id || l.b === r.id).length);
    const start = map.rooms.find((r) => r.centre.x === map.start.x && r.centre.z === map.start.z);
    if (degree.includes(1)) { assert.equal(degree[start.id], 1, `seed ${map.seed}: the start is a leaf`); leafStarts++; }
    assert.ok(metrics.exitPath >= LEVEL.minExitPath, `seed ${map.seed}: ${metrics.exitPath} m`);
    const field = walkField(map, map.start), at = (p) => field[p.z * map.size + p.x];
    assert.equal(at(map.exit), metrics.exitPath, `seed ${map.seed}`);
    for (const room of map.rooms) assert.ok(at(room.centre) >= 0 && at(room.centre) <= metrics.exitPath, `seed ${map.seed} room ${room.id}`);
  }  assert.ok(leafStarts > 0, "a level with a leaf to start in");
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

test("every_level_loops_and_each_loop_saves_a_real_walk", () => {
  const k = LEVEL.block;
  // Every candidate, not only the chosen levels: the score passes over most of the loops that only
  // just clear the floor, so the chosen 24 cannot show a loop under it (with the floor lowered by
  // four blocks, 13 of the 719 loops in 288 candidates fall under the measure below, and none of
  // the 68 in the chosen levels).
  const levels = SEEDS.flatMap((seed) => levelCandidates(seed));
  let chosenLoops = 0, fewest = Infinity, loopDoors = 0;
  for (const { map, links, metrics } of levels) {
    assert.ok(metrics.loops >= LEVEL.minLoops, `seed ${map.seed}`);
    assert.equal(metrics.loops, links.length - map.rooms.length + 1);
    const loopLinks = links.filter((l) => l.loop);
    assert.ok(loopLinks.length <= LEVEL.loops, `seed ${map.seed}: ${loopLinks.length} loops`);
    fewest = Math.min(fewest, loopLinks.length);
    for (const l of loopLinks) {
      const c = l.corridor;
      assert.ok(Math.min(c.w, c.d) === 1 && Math.max(c.w, c.d) <= LEVEL.corridorMax, `seed ${map.seed}: loop corridor ${JSON.stringify(c)}`);
      if (l.door !== null) loopDoors++;
    }
    // Every loop shut at once, so no loop is measured against another's shortcut. `addLoops`
    // added them greedily, each against the ones before it; with all of them shut, each one's
    // saving is at least what it was when it was chosen.
    const shut = { ...map, floor: map.floor.slice() };
    for (const { corridor: c } of loopLinks)
      for (let z = c.z * k; z < (c.z + c.d) * k; z++) for (let x = c.x * k; x < (c.x + c.w) * k; x++) shut.floor[z * map.size + x] = 0;
    assert.equal(standingComponents(shut), 1, `seed ${map.seed}: the level without its loops is still one region`);
    for (const l of loopLinks) {
      const c = l.corridor, alongX = l.heading === 0;
      const ends = [
        [map.rooms[l.a], alongX ? { x: c.x - 1, z: c.z } : { x: c.x, z: c.z - 1 }],
        [map.rooms[l.b], alongX ? { x: c.x + c.w, z: c.z } : { x: c.x, z: c.z + c.d }],
      ].map(([room, block]) => standingNear(map, room, { x: block.x * k + 1, z: block.z * k + 1 }));
      const key = ends[1].z * map.size + ends[1].x;
      const through = walkField(map, ends[0])[key], around = walkField(shut, ends[0])[key];
      // 18 m, the rule's own floor, is the least measured; one block of slack for an end moved off
      // its block's middle by a wall.
      assert.ok(around - through >= (LEVEL.loopMinDetour - 1) * k, `seed ${map.seed}: the loop saves ${around - through} m`);
    }
  }
  assert.equal(fewest, LEVEL.minLoops, "a level with no more loops than it must have is kept");
  assert.ok(loopDoors > 0, "loop corridors take doors as grown ones do");
  for (const { links } of LEVELS) chosenLoops += links.filter((l) => l.loop).length;
  assert.ok(chosenLoops >= 60, `${chosenLoops} loops over ${SEEDS.length} levels`); // 69
});

test("no_two_links_join_the_same_two_rooms", () => {
  for (const { map, links } of LEVELS) {
    const pairs = links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`);
    assert.equal(new Set(pairs).size, pairs.length, `seed ${map.seed}: ${pairs}`);
  }
});

test("dead_ends_are_rooms_with_one_way_out_other_than_the_start_and_exit", () => {
  // 0 - 1 - 2, and 1 - 3: rooms 0, 2 and 3 have one link each.
  const link = (a, b) => ({ a, b, corridor: { x: 0, z: 0, w: 1, d: 1 }, heading: 0, door: null, loop: false });
  const links = [link(0, 1), link(1, 2), link(1, 3)];
  assert.equal(deadEnds(links, 4, 0, 2), 1, "room 3");
  assert.equal(deadEnds(links, 4, 0, 3), 1, "room 2");
  assert.equal(deadEnds([...links, { ...link(2, 3), loop: true }], 4, 0, 2), 0, "a loop through 2 and 3 leaves none");
  // And on the levels: the start and exit are the rooms their points are the middles of.
  for (const { map, links, metrics } of LEVELS) {
    const room = (p) => map.rooms.find((r) => r.centre.x === p.x && r.centre.z === p.z).id;
    const start = room(map.start), exit = room(map.exit);
    const one = map.rooms.filter((r) => r.id !== start && r.id !== exit && links.filter((l) => l.a === r.id || l.b === r.id).length === 1);
    assert.equal(metrics.deadEnds, one.length, `seed ${map.seed}`);
  }
});

test("a_seed_keeps_the_best_scoring_of_its_candidates", () => {
  // Seed 55's best score is shared by two candidates; the first of them is kept.
  for (const seed of [3, 11, 19, 55]) {
    const candidates = levelCandidates(seed);
    assert.equal(candidates.length, LEVEL.candidates);
    const best = Math.max(...candidates.map((c) => c.metrics.score));
    assert.deepEqual(generateLevel(seed), candidates.find((c) => c.metrics.score === best));
    for (const c of candidates) assert.equal(c.metrics.score, levelScore(c.metrics));
  }
});

test("the_score_rewards_loops_and_punishes_dead_ends", () => {
  const base = { loops: 1, deadEnds: 2, exitPath: 40, rooms: 8 };
  assert.ok(levelScore({ ...base, loops: 2 }) > levelScore(base));
  assert.ok(levelScore({ ...base, deadEnds: 3 }) < levelScore(base));
  assert.ok(levelScore({ ...base, exitPath: 60 }) > levelScore(base), "a longer way to the exit");
  assert.ok(levelScore({ ...base, rooms: 9 }) > levelScore(base), "more rooms");
  assert.ok(levelScore({ ...base, loops: LEVEL.loops }) > levelScore({ ...base, loops: LEVEL.loops - 1 }), "every loop up to the cap counts");
  assert.equal(levelScore({ ...base, loops: LEVEL.loops + 5 }), levelScore({ ...base, loops: LEVEL.loops }), "loops beyond the cap are not rewarded");
});
