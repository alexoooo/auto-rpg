// The Arena on the core (`src/arena/duel.ts`, docs/plans/2026-09-30-old-path-removal.md step 4): the
// arena's solids are fixed colliders in a core world, and a bout of two core bodies runs to its
// verdict (Node, core world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { ARENA_POSTS, addArenaSolids, arenaSolids } from "../src/arena-room.ts";
import { CAP_SECONDS, Duel } from "../src/arena/duel.ts";
import { DEFAULT_MATCHUP, matchupSearch, readMatchup } from "../src/arena/matchup.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function arena() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  return { scene, world, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("an_arena_link_names_its_matchup_and_an_old_one_falls_back", () => {
  assert.deepEqual(readMatchup("?play=arena&matchup=crypt-skeleton,workshop-fighter"), { left: "crypt-skeleton", right: "workshop-fighter" });
  assert.deepEqual(readMatchup("?matchup=workshop-rogue"), { left: "workshop-rogue", right: DEFAULT_MATCHUP.right });
  assert.deepEqual(readMatchup("?matchup=%7B%22left%22%3A1%7D"), DEFAULT_MATCHUP, "a link from the old arena");
  assert.deepEqual(readMatchup(""), DEFAULT_MATCHUP);
  const written = matchupSearch("?play=arena&matchup=x", { left: "workshop-rogue", right: "crypt-skeleton" });
  assert.equal(written, "?play=arena&matchup=workshop-rogue,crypt-skeleton");
  assert.deepEqual(readMatchup(written), { left: "workshop-rogue", right: "crypt-skeleton" });
});

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

test("a_bout_in_the_arena_runs_to_its_verdict", async () => {
  const { world, dispose } = await arena();
  let duel;
  try {
    duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
    const verdict = duel.run(CAP_SECONDS + 1);
    assert.ok(verdict, "the bout is decided by its cap");
    const wounds = (from, to) => duel.blows.filter(b => !b.clash && b.attacker === from && b.target === to)
      .reduce((sum, b) => sum + b.damage, 0);
    assert.ok(wounds("left", "right") > 0 && wounds("right", "left") > 0, "blows land both ways, and wound");
    const { left, right } = duel.duelists;
    if (verdict.winner) {
      const winner = duel.duelists[verdict.winner], loser = verdict.winner === "left" ? right : left;
      assert.ok(verdict.ending === "time" ? winner.pool.bar() > loser.pool.bar() : winner.standing && !loser.standing,
        `the verdict names the side that is up: ${JSON.stringify(verdict)}`);
    } else {
      assert.ok(verdict.ending === "time" ? left.pool.bar() === right.pool.bar() : !left.standing && !right.standing,
        `a draw is both down, or both even at the cap: ${JSON.stringify(verdict)}`);
    }
    // Recorded for the plan: which side, how, and when.
    console.log(`verdict ${JSON.stringify(verdict)}; bars ${left.pool.bar().toFixed(2)} / ${right.pool.bar().toFixed(2)}; blows ${duel.blows.length}`);
    const time = duel.clock;
    world.step(world.hz);
    assert.deepEqual(duel.verdict, verdict, "and it stands once given");
    assert.ok(duel.clock > time);
    // A replay is a new bout in the same world: the last one's bodies are gone, and nothing is in the way.
    duel.dispose();
    duel = new Duel(world, { left: "crypt-skeleton", right: "workshop-fighter" });
    duel.run(1);
    assert.equal(duel.verdict, null);
    for (const side of ["left", "right"]) {
      const { body } = duel.duelists[side];
      assert.ok(body.view.head.y > 1 && Math.abs(body.view.stance.centre.x) > 1, `the replay's ${side} stands where it was built`);
    }
  } finally { duel?.dispose(); dispose(); }
});
