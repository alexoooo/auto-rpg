// The arena (`src/arena/duel.ts`): its solids are fixed colliders in a world, and a bout of two
// bodies runs to its verdict (Node, core world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { ARENA_POSTS, addArenaSolids, arenaSolids } from "../src/arena/room.ts";
import { CAP_SECONDS, Duel } from "../src/arena/duel.ts";
import { DEFAULT_MATCHUP, matchupSearch, readBalance, readCap, readGap, readMatchup, readTape, readYou, tapeHash, youSearch } from "../src/arena/matchup.ts";
import { ORBIT, orbitPosition } from "../src/arena/orbit.ts";
import { aimPoint, keysToMove, personOrders } from "../src/arena/orders-input.ts";
import { STAND_ORDERS, isOrders } from "../src/core/mind/orders.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { playBout } from "../research/bout.mjs";

async function arena() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  return { scene, world, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("an_arena_link_names_its_matchup_and_a_malformed_one_falls_back", () => {
  assert.deepEqual(readMatchup("?play=arena&matchup=crypt-skeleton,workshop-fighter"), { left: "crypt-skeleton", right: "workshop-fighter" });
  assert.deepEqual(readMatchup("?matchup=workshop-rogue"), { left: "workshop-rogue", right: DEFAULT_MATCHUP.right });
  assert.deepEqual(readMatchup("?matchup=%7B%22left%22%3A1%7D"), DEFAULT_MATCHUP, "a malformed link");
  assert.deepEqual(readMatchup(""), DEFAULT_MATCHUP);
  const written = matchupSearch("?play=arena&matchup=x", { left: "workshop-rogue", right: "crypt-skeleton" });
  assert.equal(written, "?play=arena&matchup=workshop-rogue,crypt-skeleton");
  assert.deepEqual(readMatchup(written), { left: "workshop-rogue", right: "crypt-skeleton" });
  // The side a person fights: named, or nobody.
  assert.deepEqual(["?you=left", "?play=arena&you=right", "?you=both", "?you=", ""].map(readYou), ["left", "right", null, null, null]);
  assert.equal(youSearch(written, "right"), "?play=arena&matchup=workshop-rogue,crypt-skeleton&you=right");
  assert.equal(youSearch("?play=arena&you=left&matchup=a,b", null), "?play=arena&matchup=a,b");
  // Each side's balance: left then right, one number for both, or the characters' own.
  assert.deepEqual(["?balance=5,2", "?play=arena&balance=5", "?balance=0,20.5", "?balance=%205%20,%202"].map(readBalance),
    [{ left: 5, right: 2 }, { left: 5, right: 5 }, { left: 0, right: 20.5 }, { left: 5, right: 2 }]);
  assert.deepEqual(["", "?balance=", "?balance=5,", "?balance=,5", "?balance=-1", "?balance=5,-1", "?balance=1,2,3", "?balance=many", "?balance=Infinity"].map(readBalance),
    Array(9).fill(undefined));
});

test("a_tape_rides_in_a_link's_fragment", () => {
  const toward = { x: 0.6, z: -0.8 };
  const tape = [
    { step: 0, side: "left", orders: { move: toward, face: null, attack: null } },
    { step: 60, side: "right", orders: { move: null, face: { x: 1 / 3, z: 2e-17 }, attack: [1.9, 1.6180339887, -0.25] } },
    { step: 120, side: "left", orders: null },
  ];
  const hash = tapeHash(tape);
  assert.match(hash, /^#tape=%5B/);
  assert.deepEqual(readTape(hash), tape);
  assert.deepEqual(readTape(hash.slice(1)), tape, "with or without its #");
  assert.deepEqual(["", "#", "#tape=", "#tape=%7B%7D", "#tape=nonsense", "#other=1"].map(readTape), Array(6).fill([]));
  // One entry that is not an entry and the tape is none: a tape played in part is another bout.
  const wrong = [
    { step: 1.5, side: "left", orders: null }, { step: -1, side: "left", orders: null }, { side: "left", orders: null },
    { step: 1, side: "top", orders: null }, { step: 1, side: "left" }, { step: 1, side: "left", orders: 3 }, null,
    { step: 1, side: "left", orders: { move: { x: "1", z: 0 }, face: null, attack: null } },
    { step: 1, side: "left", orders: { move: null, face: { x: 1 }, attack: null } },
    { step: 1, side: "left", orders: { move: null, face: null, attack: [1, 2] } },
    { step: 1, side: "left", orders: { move: null, face: null, attack: [1, 2, null] } },
    { step: 1, side: "left", orders: { move: null, face: null } },
  ];
  for (const entry of wrong) assert.deepEqual(readTape(tapeHash([tape[0], entry])), [], JSON.stringify(entry));
  assert.deepEqual([STAND_ORDERS, tape[1].orders, null, [], { move: null, face: null, attack: "head" }].map(isOrders), [true, true, false, false, false]);
  // The gap and the cap a link asks for, each within its range or not at all.
  assert.deepEqual(["?gap=3.5", "?play=arena&gap=1", "?gap=8"].map(readGap), [3.5, 1, 8]);
  assert.deepEqual(["", "?gap=", "?gap=0", "?gap=0.99", "?gap=8.01", "?gap=x", "?gap=Infinity", "?cap=4"].map(readGap), Array(8).fill(undefined));
  assert.deepEqual(["?cap=30", "?cap=1", "?cap=600"].map(readCap), [30, 1, 600]);
  assert.deepEqual(["", "?cap=", "?cap=0", "?cap=601", "?cap=x", "?gap=4"].map(readCap), Array(6).fill(undefined));
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

test("a_bout_capped_before_a_blow_lands_is_a_draw", async () => {
  // Every pairing: each side's bar is of its own parts, and two whole bodies are even whatever they are.
  for (const [left, right] of [["workshop-fighter", "workshop-rogue"], ["workshop-rogue", "crypt-skeleton"], ["crypt-skeleton", "workshop-fighter"]]) {
    const row = await playBout({ left, right, capSeconds: 1 }, 2);
    assert.deepEqual([row.winner, row.ending, row.bars, row.blows], [null, "time", [1, 1], 0], `${left} v ${right}`);
  }
});

test("a_bout's_recipe_is_plain_data_that_builds_the_same_bout", async () => {
  const recipe = { left: "workshop-rogue", right: "crypt-skeleton", gap: 3, capSeconds: 1 };
  const { world, dispose } = await arena();
  let duel;
  try {
    duel = new Duel(world, structuredClone(recipe));
    assert.deepEqual(duel.recipe, recipe);
    assert.ok(Object.isFrozen(duel.recipe));
    const { left, right } = duel.duelists;
    assert.deepEqual([left.model, right.model], ["workshop-rogue", "crypt-skeleton"]);
    const apart = right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    assert.ok(Math.abs(apart - 3) < 0.05, `they stand the recipe's gap apart: ${apart}`);
    const verdict = duel.run(2);
    assert.deepEqual([verdict?.ending, verdict?.time], ["time", 1], "and its cap is the recipe's");
  } finally { duel?.dispose(); dispose(); }
});

test("the_same_bout_built_twice_is_the_same_to_the_bit", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  // Ten seconds: the two have met, and blows have landed.
  const first = await playBout(recipe, 10), second = await playBout(recipe, 10);
  assert.ok(first.blows + first.clashes > 0, "the fixture reaches contact between the two");
  assert.deepEqual(second, first);
  // The control: a bout that differs differs in its digest.
  const other = await playBout({ ...recipe, gap: 4.001 }, 10);
  assert.notEqual(other.digest, first.digest);
});

test("each_side_of_a_bout_sees_the_other_and_closes_on_it", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists;
    const seen = (duelist) => duelist.body.view.senses.others.map((other) => [other.id, other.side, other.spec.model, other.out]);
    assert.deepEqual(seen(left), [["right", "right", "workshop-rogue", false]]);
    assert.deepEqual(seen(right), [["left", "left", "workshop-fighter", false]]);
    assert.deepEqual([left.body.view.senses.side, right.body.view.senses.side], ["left", "right"]);
    const gap = () => right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    const before = gap();
    duel.run(3);
    assert.ok(gap() < before - 0.5, `they close: ${before} to ${gap()}`);
    // Each sees the other where its own reading has it.
    const other = left.body.view.senses.others[0].centre, own = right.body.view.stance.centre;
    assert.ok(Math.hypot(other.x - own.x, other.y - own.y, other.z - own.z) < 1e-9);
  } finally { duel.dispose(); dispose(); }
});

test("a_side_is_out_to_the_other_once_the_bout_is_decided", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 1 });
  try {
    const { left, right } = duel.duelists;
    const out = () => [left.body.view.senses.out, right.body.view.senses.out, left.body.view.senses.others[0].out, right.body.view.senses.others[0].out];
    duel.run(0.5);
    assert.deepEqual(out(), [false, false, false, false]);
    assert.equal(duel.run(2)?.ending, "time");
    // Its own it knows at once; the other is shown it at the next step, and both then stand.
    assert.deepEqual(out(), [true, true, false, false]);
    world.step();
    assert.deepEqual(out(), [true, true, true, true]);
    const at = () => [left, right].map((duelist) => duelist.body.view.stance.centre.x);
    const before = at();
    world.step(240);
    for (const [k, x] of at().entries()) assert.ok(Math.abs(x - before[k]) < 0.15, `a side that is out walks no further: ${before[k]} to ${x}`);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout's_sense_delay_is_a_dial_that_changes_the_bout", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const now = await playBout(recipe, 10), late = await playBout({ ...recipe, senseDelay: 24 }, 10);
  assert.notEqual(late.digest, now.digest);
  assert.deepEqual(await playBout({ ...recipe, senseDelay: 0 }, 10), { ...now, recipe: { ...recipe, senseDelay: 0 } });
});

test("a_side_under_orders_does_what_it_is_told_and_the_other_fights_on", async () => {
  const { world, dispose } = await arena();
  // The bout counts its own steps, not the world's.
  world.step(7);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists, x = (duelist) => duelist.body.view.stance.centre.x;
    const start = x(left), there = x(right);
    duel.order("left", STAND_ORDERS);
    duel.run(4);
    assert.equal(duel.steps, 480);
    assert.ok(Math.abs(x(left) - start) < 0.05, `ordered to stand, it stands: ${start} to ${x(left)}`);
    assert.ok(x(right) < there - 0.6, `while the other side walks at it: ${there} to ${x(right)}`);
    assert.equal(left.skills.report.strike.thrown.right, 0, "and it throws nothing unasked");
    assert.deepEqual(duel.tape, [{ step: 0, side: "left", orders: STAND_ORDERS }]);
    duel.order("left", { move: null, face: null, attack: null });
    assert.equal(duel.tape.length, 1, "an order repeated is not recorded again");
    duel.order("left", null);
    assert.deepEqual(duel.tape[1], { step: 480, side: "left", orders: null });
    const held = x(left);
    duel.run(3);
    assert.ok(x(left) > held + 0.3, `handed back, it walks at the other side: ${held} to ${x(left)}`);
    // A tape played takes the place of one still queued.
    assert.equal(duel.verdict, null);
    const now = duel.steps;
    duel.play([{ step: now + 4000, side: "right", orders: STAND_ORDERS }]);
    duel.play([{ step: now + 2, side: "left", orders: STAND_ORDERS }]);
    world.step(2);
    assert.equal(duel.tape.length, 2, "an order is given before the step it names, not sooner");
    world.step();
    assert.deepEqual(duel.tape.slice(2), [{ step: now + 2, side: "left", orders: STAND_ORDERS }]);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout_plays_again_from_its_recipe_and_its_tape", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const back = { move: { x: -1, z: 0 }, face: null, attack: null };
  // The first order comes once the left side is turning to its walk: before that the stance holds
  // its heading (`TURN_LEAD`), and an order to walk another way a step later is the same bout.
  const tape = [{ step: 200, side: "left", orders: back }, { step: 360, side: "left", orders: null },
    { step: 480, side: "right", orders: { move: null, face: { x: -1, z: -0 }, attack: null } }];
  const first = await playBout(recipe, 8, tape), second = await playBout(recipe, 8, first.tape);
  // A side is given its orders as JSON carries them, a negative zero as zero: the tape that has been
  // through a link's fragment is the bout's tape, and plays the bout.
  const carried = readTape(tapeHash(tape));
  assert.equal(carried.length, 3);
  assert.deepEqual(first.tape, carried);
  assert.notDeepEqual(tape, carried, "the fixture's negative zero is what the fragment does not carry");
  assert.deepEqual(second, first);
  // The controls: no tape, and the same orders a step later, are other bouts.
  const untold = await playBout(recipe, 8);
  assert.deepEqual(untold.tape, []);
  assert.notEqual(untold.digest, first.digest);
  const late = tape.map((entry, i) => i === 0 ? { ...entry, step: 201 } : entry);
  assert.notEqual((await playBout(recipe, 8, late)).digest, first.digest);
});

test("a_side_out_of_the_fight_is_no_longer_under_its_orders", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 1 });
  try {
    // Ordered to walk away, the left side walks until the bell; then it stands, as the right does.
    duel.order("left", { move: { x: -1, z: 0 }, face: null, attack: null });
    const { left } = duel.duelists;
    assert.notEqual(duel.run(), null);
    assert.equal(duel.verdict.ending, "time");
    assert.ok(left.skills.report.pace > 0.5, `it was walking as the bell went: ${left.skills.report.pace}`);
    world.step();
    assert.equal(left.skills.report.pace, 0, "and stands once it is out");
    assert.equal(duel.tape.length, 1, "its orders were not taken back: it is the tactics that set them aside");
  } finally { duel.dispose(); dispose(); }
});

test("a_side's_assist_is_its_balance_in_its_own_weight_and_none_at_zero", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const weight = (duelist) => [...duelist.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * 9.80665;
  const none = await playBout({ ...recipe, balance: { left: 0, right: 0 } }, 10);
  assert.deepEqual(none.assist, [[0, 0], [0, 0]]);
  const helped = await playBout({ ...recipe, balance: { left: 5, right: 2 } }, 10);
  assert.notEqual(helped.digest, none.digest);
  for (const [force, moment] of helped.assist) assert.ok(force > 0 && moment > 0, `each side is given some: ${force}, ${moment}`);
  const { world, dispose } = await arena();
  const built = [];
  try {
    // With no balance in the recipe, each side's is its character's.
    const own = new Duel(world, recipe);
    built.push(own);
    for (const duelist of Object.values(own.duelists)) {
      const points = duelist.built.spec.attributes.balance.value;
      assert.ok(Math.abs(duelist.body.assist.most.force / weight(duelist) - points * 0.05) < 1e-9, `${duelist.model}'s own ${points} points`);
    }
  } finally { for (const duel of built) duel.dispose(); dispose(); }
  const second = await arena();
  const duel = new Duel(second.world, { ...recipe, balance: { left: 5, right: 2 }, balancePoint: { force: 0.1, moment: 0.02 } });
  try {
    // Each side's own points, at the recipe's worth of a point, in its own weight.
    for (const [side, points] of [["left", 5], ["right", 2]]) {
      const duelist = duel.duelists[side], most = duelist.body.assist.most;
      assert.ok(Math.abs(most.force / weight(duelist) - points * 0.1) < 1e-9, `${side}'s force`);
      assert.ok(Math.abs(most.moment / weight(duelist) - points * 0.02) < 1e-9, `${side}'s moment`);
      assert.ok(duelist.body.assist.on);
    }
    duel.run();
    for (const duelist of Object.values(duel.duelists)) assert.equal(duelist.body.assist.on, false, "withdrawn at the verdict");
  } finally { duel.dispose(); second.dispose(); }
});

test("keys_and_a_pointer_make_orders_in_the_world's_frame", () => {
  const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-12, `${JSON.stringify(a)} is ${JSON.stringify(b)}`);
  const keys = (names) => ({ up: names.includes("up"), down: names.includes("down"), left: names.includes("left"), right: names.includes("right") });
  // The camera looking along +z: up the screen is +z, right is +x.
  near(keysToMove(keys(["up"]), 0), { x: 0, z: 1 });
  near(keysToMove(keys(["down"]), 0), { x: 0, z: -1 });
  near(keysToMove(keys(["right"]), 0), { x: 1, z: 0 });
  near(keysToMove(keys(["left"]), 0), { x: -1, z: 0 });
  near(keysToMove(keys(["up", "right"]), 0), { x: Math.SQRT1_2, z: Math.SQRT1_2 });
  // Turned a quarter to the right, looking along +x: up is +x, right is -z.
  near(keysToMove(keys(["up"]), Math.PI / 2), { x: 1, z: 0 });
  near(keysToMove(keys(["right"]), Math.PI / 2), { x: 0, z: -1 });
  assert.equal(keysToMove(keys([]), 0), null);
  assert.equal(keysToMove(keys(["up", "down"]), 0), null);
  assert.equal(keysToMove(keys(["left", "right"]), 0), null);
  // Up the screen is away from where the orbit camera stands.
  const [cx, , cz] = orbitPosition({ x: 0, y: 1, z: 0 }, 0.7, ORBIT.pitch, ORBIT.distance), up = keysToMove(keys(["up"]), 0.7);
  near(up, { x: -cx / Math.hypot(cx, cz), z: -cz / Math.hypot(cx, cz) });
  // A ray from above, down to the plane at chest height.
  assert.deepEqual(aimPoint([0, 5, -4], [0, -0.8, 0.6], 1), [0, 1, -1]);
  assert.deepEqual(aimPoint([1, 3, 2], [0.5, -1, -0.25], 1), [2, 1, 1.5]);
  assert.equal(aimPoint([0, 5, -4], [0, 0.1, 1], 1), null, "a ray going up meets no plane below it");
  assert.equal(aimPoint([0, 0.5, -4], [0, -0.8, 0.6], 1), null, "nor one that starts under the plane");
  assert.deepEqual(personOrders({ x: 1, z: 0 }, [2, 1, 3], false, { x: 1, z: 1 }), { move: { x: 1, z: 0 }, face: { x: 1, z: 2 }, attack: null });
  assert.deepEqual(personOrders(null, [2, 1, 3], true, { x: 1, z: 1 }), { move: null, face: { x: 1, z: 2 }, attack: [2, 1, 3] });
  assert.deepEqual(personOrders(null, null, true, { x: 1, z: 1 }), { move: null, face: null, attack: null });
});
