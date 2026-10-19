/**
 * **The arena's solids** (`src/arena/room.ts`): fixed colliders in a world, each post the prism its
 * mesh draws and the wall a ring that holds (Node, core world, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ARENA_POSTS, addArenaSolids, arenaSolids } from "../src/arena/room.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function arena() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  return { scene, world, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("each_arena_post_is_the_prism_its_mesh_draws", () => {
  const scene = new Scene(new NullEngine());
  try {
    const posts = arenaSolids().filter(s => s.kind === "hull");
    assert.equal(posts.length, ARENA_POSTS.count);
    for (const post of posts) {
      const { height, diameter, sides } = ARENA_POSTS;
      const mesh = MeshBuilder.CreateCylinder(post.name, { height, diameter, tessellation: sides }, scene);
      const data = mesh.getVerticesData(VertexBuffer.PositionKind);
      const drawn = [];
      for (let i = 0; i < data.length; i += 3) drawn.push([data[i] + post.centre[0], data[i + 1] + post.centre[1], data[i + 2] + post.centre[2]]);
      // Every corner of the hull is a vertex the mesh draws, and every vertex the mesh draws off its axis is a corner.
      const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
      for (const corner of post.points) assert.ok(drawn.some(v => near(v, corner)), `${post.name}: corner ${corner} is drawn`);
      for (const v of drawn) {
        if (Math.hypot(v[0] - post.centre[0], v[2] - post.centre[2]) < 1e-6) continue;
        assert.ok(post.points.some(c => near(v, c)), `${post.name}: drawn vertex ${v} is a corner`);
      }
      mesh.dispose();
    }
  } finally { scene.dispose(); }
});

test("the_circular_wall_stops_outward_motion_at_every_face_and_join", async () => {
  const run = async (walls) => {
    const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine(), { gravity: false });
    try {
      addArenaSolids(world.physics, arenaSolids().filter(solid => walls ? solid.name.includes(".wall.") : false));
      const nodes = [];
      for (let i = 0; i < 48; i++) {
        const angle = i * Math.PI * 2 / 48, x = Math.sin(angle), z = Math.cos(angle);
        const node = new TransformNode(`probe ${i}`, scene);
        node.position.set(x * 12.8, .65, z * 12.8); node.rotationQuaternion = Quaternion.Identity();
        const body = world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: .06 }],
          { mass: 1, centre: [0, 0, 0], moments: [.00144, .00144, .00144], orientation: Quaternion.Identity() });
        body.applyImpulse(new Vector3(x * 4, 0, z * 4), node.position);
        nodes.push(node);
      }
      world.step(60);
      return nodes.map(node => Math.hypot(node.position.x, node.position.z));
    } finally { world.dispose(); scene.dispose(); }
  };
  const contained = await run(true), open = await run(false);
  assert.ok(contained.every(radius => radius < 13.2), `a wall admitted a probe: ${contained}`);
  assert.ok(open.every(radius => radius > 14), "the control must cross the absent boundary");
});

test("a_ball_dropped_on_an_arena_post_rests_on_its_top", async () => {
  const { scene, world, dispose } = await arena();
  try {
    const post = arenaSolids().find(s => s.name === "post3"), radius = 0.05;
    const node = new TransformNode("ball", scene);
    node.position.set(post.centre[0], 2.5, post.centre[2]); node.rotationQuaternion = Quaternion.Identity();
    const moment = 0.4 * radius * radius;
    world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius }],
      { mass: 1, centre: [0, 0, 0], moments: [moment, moment, moment], orientation: Quaternion.Identity() });
    world.step(2 * world.hz);
    assert.ok(Math.abs(node.position.y - ARENA_POSTS.height - radius) < 0.005, `it rests on the post: ${node.position.y}`);
  } finally { dispose(); }
});
