/**
 * The Random Crypt's layout (`generateCryptDungeon`, `src/dungeon/crypt-dungeon.ts`) over a hundred seeds: what a
 * crypt holds, where its furniture and its enemies stand, and that a party can walk it. Each test collects the
 * seeds at fault and asserts once for its claim, so a failure names them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { CRYPT_FURNITURE } from "../src/dungeon/crypt-archetypes.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { LEVEL } from "../src/dungeon/level.ts";
import { distance, findPath, walkable } from "../src/dungeon/map.ts";
import { companionSpawn } from "../src/dungeon/party-placement.ts";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { headlessScene } from "./harness/scene.mjs";

const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);
/** How far a body's middle keeps from rock, furniture and a closed door, m. */
const CLEARANCE = LEVEL.clearance;

let made;
/** The crypt of every seed, made once. A test that changes a crypt makes its own. */
const crypts = () => made ??= SEEDS.map((seed) => ({ seed, plan: generateCryptDungeon(seed) }));

/** `"seed N: what"` for every crypt that `faultOf` finds something wrong with; it answers nothing for a sound one. */
function faults(faultOf) {
  return crypts().flatMap(({ seed, plan }) => {
    const fault = faultOf(plan, seed);
    return fault === undefined || fault === null || fault === false ? [] : [`seed ${seed}: ${JSON.stringify(fault)}`];
  });
}

const kindOf = (plan, kind) => plan.map.rooms[plan.archetypes.find((type) => type.kind === kind).room];
/** How far `point` is from the nearest edge of `obstacle`'s footprint, m. */
const fromFootprint = (point, obstacle) => Math.hypot(
  Math.max(0, Math.abs(point.x - obstacle.x) - obstacle.width / 2),
  Math.max(0, Math.abs(point.z - obstacle.z) - obstacle.depth / 2));

test("a seed makes the same crypt every time", () => {
  assert.deepEqual(faults((plan, seed) => !isDeepStrictEqual(plan, generateCryptDungeon(seed)) && "differs"), [],
    "a crypt made twice of one seed is the same plan, whole");
});

test("a crypt holds four rooms, six doors, seven enemies, eight torches, eighteen obstacles and damp floor", () => {
  const expected = { rooms: 4, doors: 6, spawns: 7, torches: 8, obstacles: 18, damp: true };
  assert.deepEqual(faults((plan) => {
    const counts = {
      rooms: plan.map.rooms.length, doors: plan.map.doors.length, spawns: plan.map.spawns.length,
      torches: plan.torches.length, obstacles: plan.map.obstacles.length, damp: plan.damp.length > 0,
    };
    return !isDeepStrictEqual(counts, expected) && counts;
  }), [], "every crypt holds the same count of each");
});

test("a crypt's rooms are one of each kind, the entrance a guard room, and every kind shows each arrangement", () => {
  assert.deepEqual(faults((plan) => {
    const kinds = plan.archetypes.map((type) => type.kind).sort();
    return !isDeepStrictEqual(kinds, ["burial", "chapel", "guard", "rootbound"]) && kinds;
  }), [], "the four rooms are a burial room, a chapel, a guard room and a rootbound room");
  assert.deepEqual(faults((plan) => {
    const entrance = plan.archetypes.find((type) => type.room === 0).kind;
    return entrance !== "guard" && entrance;
  }), [], "the room the party starts in is the guard room");
  const shown = new Set(crypts().flatMap(({ plan }) => plan.archetypes.map((type) => `${type.kind} ${type.variant}`)));
  assert.deepEqual([...shown].sort(), ["burial", "chapel", "guard", "rootbound"].flatMap((kind) => [0, 1, 2].map((variant) => `${kind} ${variant}`)),
    "over the seeds, each kind of room takes each of its three arrangements");
});

test("an obstacle is its piece's footprint, turned as its piece is, where its piece stands", () => {
  assert.deepEqual(faults((plan) => {
    const wrong = plan.map.obstacles.flatMap((obstacle) => {
      const placed = plan.placements.find((placement) => placement.obstacleId === obstacle.id);
      if (!placed) return [`${obstacle.id} has no piece`];
      const [width, depth, height] = CRYPT_FURNITURE[placed.piece], turned = Math.abs(Math.sin(placed.turn)) > 0.5;
      const expected = { x: placed.x, z: placed.z, width: turned ? depth : width, depth: turned ? width : depth, height };
      const { x, z, width: w, depth: d, height: h } = obstacle;
      return isDeepStrictEqual({ x, z, width: w, depth: d, height: h }, expected) ? [] : [obstacle.id];
    });
    return wrong.length > 0 && wrong;
  }), [], "every obstacle has a placed piece, and stands where it stands with its footprint");
});

test("no furniture stands within a body's clearance of a door", () => {
  assert.deepEqual(faults((plan) => {
    const near = plan.map.obstacles.filter((obstacle) => plan.map.doors.some((door) => fromFootprint(door.point, obstacle) < CLEARANCE));
    return near.length > 0 && near.map((obstacle) => obstacle.id);
  }), [], `every obstacle's footprint is at least ${CLEARANCE} m from every door`);
});

test("the rootbound room's corners are rock, and the chapel is longer than it is wide", () => {
  assert.deepEqual(faults((plan) => {
    const room = kindOf(plan, "rootbound"), { size, floor } = plan.map;
    const corners = [[room.min.x, room.min.z], [room.max.x, room.min.z], [room.min.x, room.max.z], [room.max.x, room.max.z]];
    const open = corners.filter(([x, z]) => floor[z * size + x] !== 0);
    return open.length > 0 && open;
  }), [], "each corner cell of the rootbound room is rock");
  assert.deepEqual(faults((plan) => {
    const room = kindOf(plan, "chapel"), along = room.max.z - room.min.z, across = room.max.x - room.min.x;
    return along <= across && { along, across };
  }), [], "the chapel reaches farther along z than along x");
});

test("a body can stand on the exit, on every enemy's place and at every room's centre, and walk there from the start", () => {
  assert.deepEqual(faults((plan) => {
    const { map } = plan;
    const lost = [map.exit, ...map.spawns, ...map.rooms.map((room) => room.centre)]
      .filter((target) => !walkable(map, target, CLEARANCE) || findPath(map, map.start, target, CLEARANCE).length === 0);
    return lost.length > 0 && lost;
  }), [], "every such place clears a body and has a path from the start");
});

test("the exit is at least 20 m from the start, and every enemy more than 15 m", () => {
  assert.deepEqual(faults(({ map }) => distance(map.exit, map.start) < 20 && distance(map.exit, map.start)), [],
    "the exit is in another room: a room's centre is 20 m from its neighbour's");
  assert.deepEqual(faults(({ map }) => {
    const near = map.spawns.filter((spawn) => distance(spawn, map.start) <= 15);
    return near.length > 0 && near;
  }), [], "no enemy starts within 15 m of the party");
});

test("three companions find room beside the start", () => {
  assert.deepEqual(faults(({ map }) => {
    const party = [map.start];
    for (let i = 0; i < 3; i++) {
      const place = companionSpawn(map, party);
      if (!place) return `no place for companion ${i + 1}`;
      party.push(place);
    }
    return false;
  }), [], "each of three companions is given a place");
});

test("a door stands in a portal, bars the way while it is closed and clears it once open", () => {
  assert.deepEqual(faults((plan) => {
    const bare = plan.map.doors.filter((door) =>
      !plan.placements.some((placement) => placement.piece === "portal" && placement.x === door.point.x && placement.z === door.point.z));
    return bare.length > 0 && bare.map((door) => door.id);
  }), [], "every door has a portal placed on its cell");
  assert.deepEqual(faults(({ map }) => {
    const passable = map.doors.filter((door) => walkable(map, door.point, CLEARANCE, true));
    return passable.length > 0 && passable.map((door) => door.id);
  }), [], "a body that minds closed doors cannot stand in a closed one");
  // Opening a door changes its map, so each seed's is made afresh.
  const stuck = SEEDS.flatMap((seed) => {
    const map = generateCryptDungeon(seed).map;
    for (const door of map.doors) door.open = true;
    const barred = map.doors.filter((door) => !walkable(map, door.point, CLEARANCE, true));
    return barred.length ? [`seed ${seed}: ${barred.map((door) => door.id)}`] : [];
  });
  assert.deepEqual(stuck, [], "a body can stand in every open door");
});

test("the doors stand in more than twenty different arrangements over the seeds", () => {
  const layouts = new Set(crypts().map(({ plan }) => JSON.stringify(plan.map.doors.map((door) => door.point))));
  assert.ok(layouts.size > 20, `the hundred seeds place their doors ${layouts.size} ways`);
});

test("a generated crypt's doors open, and its look adds no collider", () => {
  const stage = headlessScene();
  try {
    const solids = [];
    for (const visuals of [false, true]) {
      const map = generateCryptDungeon(12).map, world = buildDungeonWorld(stage.scene, map, visuals);
      solids.push(world.solids.map((solid) => [solid.name, ...solid.centre, ...solid.size].join(" ")));
      world.openNearby(map.doors.map((door) => door.point));
      assert.deepEqual(map.doors.map((door) => door.open), map.doors.map(() => true), "a door with somebody at it opens");
      assert.equal(world.doorVisuals.length, visuals ? map.doors.length : 0, "every door is drawn, and only with visuals");
      for (const leaf of world.doorVisuals) {
        assert.equal(leaf.wood.isVisible, false, "an open door hides its wood");
        assert.equal(leaf.iron.isVisible, false, "an open door hides its iron");
      }
      world.dispose();
    }
    assert.ok(solids[0].length > 0, "the crypt has colliders");
    assert.deepEqual(solids[1], solids[0], "the colliders are the same with visuals and without");
  } finally { stage.dispose(); }
});
