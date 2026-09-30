import test from "node:test";
import assert from "node:assert/strict";
import { findPath, walkable, clearSegment, canSee, reveal, explorationGoal, distance } from "../src/dungeon/map.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { DungeonCommands, mouseOrdersEnabled, screenMovement } from "../src/dungeon/commands.ts";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward, frameDungeon, pickingCoordinates } from "../src/dungeon/camera.ts";

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

test("screen movement is normalized", () => {
  const is = (v, x, z) => Math.abs(v.x - x) < 1e-12 && Math.abs(v.z - z) < 1e-12;
  // Square to the walls, each key walks along one axis: right is +x and up is +z.
  assert.ok(is(screenMovement(1, 0), 1, 0) && is(screenMovement(0, 1), 0, 1), "a key walks along an axis");
  // On the diagonal at azimuth pi/4, right is toward -x +z and up toward -x -z.
  const diagonal = cameraToward(Math.PI / 4), h = Math.SQRT1_2;
  assert.ok(is(screenMovement(1, 0, diagonal), -h, h) && is(screenMovement(0, 1, diagonal), -h, -h), "the diagonal's keys");
  for (const toward of [cameraToward(CAMERA_AZIMUTH), diagonal, cameraToward(1)])
    assert.ok(Math.abs(Math.hypot(...Object.values(screenMovement(1, 1, toward))) - 1) < 1e-10);
});

test("keyboard directions project onto screen axes and HiDPI picking is scaled exactly once", () => {
  const engine = new NullEngine({ renderWidth: 1200, renderHeight: 800 }); const scene = new Scene(engine);
  try {
    const camera = new FreeCamera("dungeon", new Vector3(), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // The default, a diagonal, and a bearing that is neither.
    for (const azimuth of [CAMERA_AZIMUTH, Math.PI / 4, 1]) {
      frameDungeon(camera, { x: 9, z: 9 }, 10, 1.5, CAMERA_PITCH, azimuth); scene.render();
      const viewport = camera.viewport.toGlobal(1200, 800);
      const project = p => Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), viewport);
      const centre = project(new Vector3(9, 0, 9));
      for (const [right, up] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const movement = screenMovement(right, up, cameraToward(azimuth));
        const projected = project(new Vector3(9 + movement.x, 0, 9 + movement.z)), at = `azimuth ${azimuth}, key ${right},${up}`;
        if (right) { assert.ok((projected.x - centre.x) * right > 0, at); assert.ok(Math.abs(projected.y - centre.y) < 1e-4, at); }
        else { assert.ok((projected.y - centre.y) * up < 0, at); assert.ok(Math.abs(projected.x - centre.x) < 1e-4, at); }
      }
    }
    for (const scale of [1, 1 / 1.5, 0.5]) {
      assert.deepEqual(pickingCoordinates(420, 310, { left: 20, top: 10, width: 800, height: 600 }, 800 / scale, 600 / scale, scale), { x: 400, y: 300 });
    }
  } finally { scene.dispose(); engine.dispose(); }
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
