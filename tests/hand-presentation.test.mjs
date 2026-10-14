import test from "node:test";
import assert from "node:assert/strict";
import { handPose } from "../src/render/hand-pose.ts";
import { strikeHands, fighterHands } from "../src/render/strike-hands.ts";
import { commandsBody } from "../src/core/body.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun, WAKE_METRES } from "../src/dungeon/run.ts";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("hand transitions start at their current closure and each hand is independent", () => {
  const pose = handPose();
  assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
  pose.step("left", "close", .05);
  assert.deepEqual(pose.snapshot(), { left: .5, right: 0 });
  const saved = pose.snapshot();
  pose.step("left", "relax", .125);
  near(pose.closure("left"), .25);
  pose.step("left", "close", .05);
  near(pose.closure("left"), .625);
  pose.step("right", "fist", 1 / 120);
  assert.deepEqual(pose.snapshot(), { left: .625, right: 1 });
  pose.step("left", "close", .05);
  pose.step("right", "relax", .25);
  assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
  assert.deepEqual(saved, { left: .5, right: 0 });
  saved.left = 0;
  assert.equal(pose.closure("left"), 1, "editing a snapshot cannot change the live pose");
});

test("closure at simulation times is independent of step partition and render reads", () => {
  const run = hz => {
    const pose = handPose(), frames = [];
    for (const action of ["close", "fist", "relax"]) {
      for (let i = 0; i < hz / 10; i++) {
        pose.step("right", action, 1 / hz);
        for (let read = 0; read < 3; read++) pose.closure("right");
      }
      frames.push(pose.snapshot());
    }
    return frames;
  };
  for (const hz of [120, 240, 480]) {
    const frames = run(hz);
    for (const [i, expected] of [1, 1, .6].entries()) {
      near(frames[i].right, expected);
      assert.equal(frames[i].left, 0);
    }
  }
});

/** Only the scheduling seam is replaced; the adapter sees mutable ownership and real phase names. */
function clock() {
  const hooks = new Set();
  return {
    afterStep(hook) { hooks.add(hook); return { dispose: () => hooks.delete(hook) }; },
    step(dt) { for (const hook of hooks) hook(dt); },
    get observers() { return hooks.size; },
  };
}

test("strike presentation ignores stale reports on takeover, inactivity and elimination", () => {
  const world = clock(), body = { has: "command", level: "full" };
  const strike = { hand: "right", phase: "swing" };
  let ending = null;
  const pose = strikeHands(world, body, () => strike, () => ending === null);
  try {
    assert.equal(commandsBody(body), true);
    world.step(.01);
    assert.deepEqual(pose.snapshot(), { left: 0, right: 1 });
    for (const cause of ["takeover", "inactive", "eliminated"]) {
      if (cause === "takeover") body.has = "rise";
      if (cause === "inactive") body.level = "limp";
      if (cause === "eliminated") ending = "exhausted";
      world.step(.125);
      assert.deepEqual(pose.snapshot(), { left: 0, right: .5 }, cause);
      world.step(.125);
      assert.deepEqual(pose.snapshot(), { left: 0, right: 0 }, cause);
      body.has = "command"; body.level = "full"; ending = null;
      world.step(.01);
      assert.equal(pose.closure("right"), 1);
    }
    const saved = pose.snapshot();
    pose.dispose();
    world.step(1);
    assert.deepEqual(pose.snapshot(), saved);
    assert.equal(world.observers, 0);
  } finally { pose.dispose(); }
});

test("a fighter's fingers are its body's hand poses: shut in a fist or a grip, open else, and open with no pose", () => {
  const state = { left: { applied: "open", requested: "fist" }, right: { applied: "fist", requested: "fist" } };
  const fighter = { minded: { body: { built: { handPoses: { state } } } } };
  const pose = fighterHands(fighter);
  assert.deepEqual(pose.snapshot(), { left: 0, right: 1 });
  state.left.applied = "grip"; state.right.applied = "open";
  assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
  delete state.left;
  assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
  pose.dispose();
});

test("preparation, return, cancelled attacks and alternating hands share one phase adapter", () => {
  const world = clock(), strike = { hand: "left", phase: "chamber" };
  const pose = strikeHands(world, { has: "command", level: "full" }, () => strike);
  try {
    world.step(.05);
    assert.deepEqual(pose.snapshot(), { left: .5, right: 0 });
    strike.phase = "swing"; world.step(.01);
    assert.deepEqual(pose.snapshot(), { left: 1, right: 0 });
    strike.hand = "right"; strike.phase = "chamber"; world.step(.05);
    near(pose.closure("left"), .8); near(pose.closure("right"), .5);
    strike.phase = "return"; world.step(.25);
    assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
    for (const phase of ["approach", "place", "settle", null]) {
      strike.phase = "swing"; world.step(.01);
      strike.phase = phase; world.step(.25);
      assert.deepEqual(pose.snapshot(), { left: 0, right: 0 });
    }
  } finally { pose.dispose(); }
});

test("Crypt supplies the world to presentation during construction and when an enemy wakes later", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), size = 41, floor = new Uint8Array(size * size);
  for (let z = 19; z <= 21; z++) for (let x = 3; x <= 37; x++) floor[z * size + x] = 1;
  const layout = { seed: 42, size, floor, doors: [], rooms: [{ id: 0, centre: { x: 20, z: 20 }, min: { x: 3, z: 19 }, max: { x: 37, z: 21 } }],
    start: { x: 5, z: 20 }, exit: { x: 37, z: 20 }, spawns: [{ x: 5 + WAKE_METRES + .2, z: 20 }] };
  const presentations = [], seen = [];
  const run = new DungeonRun(scene, { seed: 42, engine: await freshEngine(), visuals: false, layout,
    onBuilt(actor, world) {
      seen.push({ id: actor.id, world });
      presentations.push(fighterHands(actor.fighter));
    } });
  try {
    assert.deepEqual(seen.map(s => s.id), ["hero"]);
    run.commands.setMode({ keyboard: true, facing: false });
    run.commands.up = 1; run.toward = { x: -1, z: 0 };
    for (let i = 0; i < 600 && seen.length < 2; i++) run.step();
    assert.deepEqual(seen.map(s => s.id), ["hero", "enemy-0"]);
    assert.ok(seen.every(s => s.world === run.world));
    // Each grips its club in its right hand, and its left is open.
    assert.deepEqual(presentations.map(p => p.snapshot()), [{ left: 0, right: 1 }, { left: 0, right: 1 }]);
  } finally {
    for (const presentation of presentations) presentation.dispose();
    run.dispose(); scene.dispose(); engine.dispose();
  }
});
