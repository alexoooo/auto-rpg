import test from "node:test";
import assert from "node:assert/strict";
import { findPath, walkable, clearSegment, canSee, reveal, explorationGoal, distance } from "../src/dungeon/map.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { DungeonCommands, composeIntent, neutralIntent, mouseOrdersEnabled, screenMovement } from "../src/dungeon/commands.ts";
import { resolveGroupMoves } from "../src/dungeon/locomotion.ts";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { frameDungeon, pickingCoordinates } from "../src/dungeon/camera.ts";

test("fog blocks enemy sight through closed doors and exploration uses known frontiers", () => {
  const map = classicDungeon(42), door = map.doors[0];
  const a = { x: door.point.x - (door.axis === "x" ? 2 : 0), z: door.point.z - (door.axis === "z" ? 2 : 0) };
  const b = { x: door.point.x + (door.axis === "x" ? 2 : 0), z: door.point.z + (door.axis === "z" ? 2 : 0) };
  assert.equal(canSee(map, a, b), false); door.open = true; assert.equal(canSee(map, a, b), true);
  const explored = new Set(); const visible = reveal(map, map.start, explored);
  assert.ok(visible.size > 10); assert.ok(explored.size < map.floor.reduce((a, b) => a + b, 0));
  const goal = explorationGoal(map, map.start, explored, 0.5); assert.ok(goal);
  const before = structuredClone(goal); map.exit = { x: 45, z: 45 };
  assert.deepEqual(explorationGoal(map, map.start, explored, 0.5), before, "hidden exit cannot affect frontier choice");
  assert.deepEqual(findPath(map, map.start, { x: 0, z: 0 }, 0.5), []);
  assert.deepEqual(findPath(map, new Vector3(9, 0, 9), new Vector3(10, 0, 9), 0.5), [{ x: 10, z: 9 }]);
});

test("all four input modes, click lock, live drag and cancellation have distinct ownership", () => {
  for (const keyboard of [false, true]) for (const facing of [false, true]) {
    const commands = new DungeonCommands(); commands.setMode({ keyboard, facing });
    assert.equal(mouseOrdersEnabled(commands.mode), !keyboard && !facing);
    commands.down({ x: 0, z: 0 }, { x: 9, z: 9 }, "enemy-2"); commands.upPointer();
    assert.equal(commands.order.kind, keyboard || facing ? "idle" : "lock");
  }
  const c = new DungeonCommands(); c.down({ x: 100, z: 100 }, { x: 9, z: 9 }, "enemy-1");
  c.move({ x: 104, z: 100 }, { x: 10, z: 9 }); assert.equal(c.order.kind, "idle");
  c.move({ x: 107, z: 100 }, { x: 11, z: 9 });
  assert.deepEqual(c.order, { kind: "force", points: [{ x: 9, z: 9 }, { x: 11, z: 9 }], drawing: true });
  c.upPointer(); assert.equal(c.order.kind, "force"); assert.equal(c.order.drawing, false);
  c.down({ x: 0, z: 0 }, { x: 12, z: 9 }, null); c.cancelPointer(); c.upPointer(); assert.equal(c.order.kind, "force");
  c.right = 1; c.setMode({ keyboard: true, facing: true }); assert.deepEqual(c.order, { kind: "idle" }); assert.equal(c.right, 0);
});

test("screen movement is normalized and remains independent of facing and automatic attacks", () => {
  assert.ok(screenMovement(1, 0).x < 0 && screenMovement(1, 0).z > 0);
  assert.ok(screenMovement(0, 1).x < 0 && screenMovement(0, 1).z < 0);
  assert.ok(Math.abs(Math.hypot(...Object.values(screenMovement(1, 1))) - 1) < 1e-10);
  const base = neutralIntent(); base.primary.thrust = true; base.forward = -1;
  for (const facing of [-2, -0.5, 0, 1.5, 3]) {
    const movement = screenMovement(1, 0), command = composeIntent(base, facing, movement, { x: 0, z: -1 });
    const x = command.forward * Math.sin(facing) + command.strafe * Math.cos(facing);
    const z = command.forward * Math.cos(facing) - command.strafe * Math.sin(facing);
    assert.ok(Math.abs(x - movement.x) < 1e-9 && Math.abs(z - movement.z) < 1e-9);
    assert.equal(command.primary.thrust, true); assert.equal(base.forward, -1);
    assert.deepEqual(composeIntent(base, facing, null, null), base);
  }
});

test("keyboard directions project onto screen axes and HiDPI picking is scaled exactly once", () => {
  const engine = new NullEngine({ renderWidth: 1200, renderHeight: 800 }); const scene = new Scene(engine);
  try {
    const camera = new FreeCamera("dungeon", new Vector3(), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    frameDungeon(camera, { x: 9, z: 9 }, 10, 1.5); scene.render();
    const viewport = camera.viewport.toGlobal(1200, 800);
    const project = p => Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const centre = project(new Vector3(9, 0, 9));
    for (const [right, up] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const movement = screenMovement(right, up); const projected = project(new Vector3(9 + movement.x, 0, 9 + movement.z));
      if (right) { assert.ok((projected.x - centre.x) * right > 0); assert.ok(Math.abs(projected.y - centre.y) < 1e-4); }
      else { assert.ok((projected.y - centre.y) * up < 0); assert.ok(Math.abs(projected.x - centre.x) < 1e-4); }
    }
    for (const scale of [1, 1 / 1.5, 0.5]) {
      assert.deepEqual(pickingCoordinates(420, 310, { left: 20, top: 10, width: 800, height: 600 }, 800 / scale, 600 / scale, scale), { x: 400, y: 300 });
    }
  } finally { scene.dispose(); engine.dispose(); }
});

const proposal = (x, z, dx, dz) => ({ prior: { x, y: 1, z, yaw: 0 }, next: { x: x + dx, y: 1, z: z + dz, yaw: 0 },
  displacement: { x: dx, z: dz, yaw: 0 }, footprint: { radiusM: 0.5 }, ownerPartIds: new Set(), resistance: 1 });
test("group locomotion constrains swept encounters and queued actors without pair commits", () => {
  const registry = { allowedFraction: () => 1 };
  for (const proposals of [
    [proposal(-2, 0, 5, 0), proposal(2, 0, -5, 0), proposal(0, 2, 0, -5)],
    [proposal(-2, 0, 2, 0), proposal(-1, 0, 1, 0), proposal(0, 0, 0, 0)],
  ]) {
    const moves = resolveGroupMoves(proposals, proposals.map(() => true), registry);
    for (let step = 0; step <= 20; step++) for (let a = 0; a < proposals.length; a++) for (let b = a + 1; b < proposals.length; b++) {
      const t = step / 20;
      assert.ok(Math.hypot(proposals[a].prior.x + moves[a].x * t - proposals[b].prior.x - moves[b].x * t,
        proposals[a].prior.z + moves[a].z * t - proposals[b].prior.z - moves[b].z * t) >= 1 - 1e-8);
    }
  }
  const alone = resolveGroupMoves([proposal(0, 0, 1, 0)], [true], { allowedFraction: () => 0.25 });
  assert.equal(alone[0].x, 0.25);
});

test("two_party_members_slide_past_each_other_where_strangers_stop", () => {
  // Touching (1 m apart at 0.5 m radii), the walker moving obliquely into a body that stands still.
  const open = { allowedFraction: () => 1 };
  const pair = () => [proposal(0, 0, 0.3, 0.3), proposal(1, 0, 0, 0)];
  const strangers = resolveGroupMoves(pair(), [true, true], open);
  assert.deepEqual([strangers[0].x, strangers[0].z], [0, 0], "strangers: the whole move is refused");
  assert.deepEqual(resolveGroupMoves(pair(), [true, true], open, ["enemy", null]), strangers, "no two groups alike: strangers");
  const friends = resolveGroupMoves(pair(), [true, true], open, ["party", "party"]);
  assert.ok(Math.abs(friends[0].x) < 1e-12, "friends: the part that closes on the other is refused");
  assert.equal(friends[0].z, 0.3, "and the part along it is kept");
  assert.deepEqual([friends[1].x, friends[1].z], [0, 0]);
  // Both moving into each other, head on and off-line: each keeps only what does not close on the other.
  const both = resolveGroupMoves([proposal(0, 0, 0.2, 0.1), proposal(1, 0, -0.2, 0.1)], [true, true], open, ["party", "party"]);
  assert.ok(Math.abs(both[0].x) < 1e-12 && Math.abs(both[1].x) < 1e-12);
  assert.equal(both[0].z, 0.1); assert.equal(both[1].z, 0.1);
});

test("a_move_obliquely_into_a_wall_slides_along_it", () => {
  // A wall across +x: any sweep that gains x is refused whole, any other is allowed.
  const wall = { allowedFraction: (from, to) => to.x > from.x + 1e-9 ? 0 : 1 };
  const [slid] = resolveGroupMoves([proposal(0, 0, 0.1, 1)], [true], wall);
  assert.equal(slid.x, 0, "into the wall: refused");
  assert.equal(slid.z, 1, "along the wall: kept");
  const [straight] = resolveGroupMoves([proposal(0, 0, 0.1, 0)], [true], wall);
  assert.deepEqual([straight.x, straight.z], [0, 0], "straight into the wall: nothing to slide along");
  // A corner: rock only where x and z are both gained. Either axis alone is clear, both together
  // are not, so the second axis must be swept from where the first one ended.
  const corner = { allowedFraction: (from, to) => to.x > 0.05 && to.z > 0.05 ? 0 : 1 };
  const [cornered] = resolveGroupMoves([proposal(0, 0, 0.1, 0.1)], [true], corner);
  assert.deepEqual([cornered.x, cornered.z], [0.1, 0], "one axis taken, and not both into the corner");
});

test("a_body_beside_a_wall_plans_from_where_it_stands", () => {
  // At a 0.5 m radius the middle of a cell beside rock is not walkable, but a body can stand in the
  // cell away from the rock. Such a body has a route, and not only when the goal is in sight.
  const map = classicDungeon(42), radius = 0.5;
  let tried = 0;
  for (let z = 0; z < map.size && tried < 12; z++) for (let x = 0; x < map.size && tried < 12; x++) {
    if (walkable(map, { x, z }, radius) || !walkable(map, { x, z }, 0)) continue;
    for (const [ox, oz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const from = { x: x + ox, z: z + oz };
      if (!walkable(map, from, radius) || clearSegment(map, from, map.exit, radius)) continue;
      tried++;
      assert.ok(findPath(map, from, map.exit, radius).length > 0, JSON.stringify(from));
      break;
    }
  }
  assert.equal(tried, 12, "twelve such places, each out of sight of the exit");
});
