/**
 * The core's world (`src/core/world.ts`): one step is one solver step with its hooks around it,
 * the clock is the count of steps, elapsed time turns into whole steps, a render advances nothing,
 * and the same steps give the same world.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createWorld } from "../src/core/world.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";

/** A stand whose world holds the Warrior in the air, falling freely: no ground, no motors. */
async function airborne(hz = 120) {
  return coreStand(humanSpec("workshop-fighter"), { ground: false, hz });
}

test("a step is one solver step, with the step hooks before it and the after hooks after it, in the order added", async () => {
  const stand = await airborne();
  const { world } = stand, head = stand.built.segments.get("head").body, v = new Vector3();
  const seen = [];
  try {
    // Three steps of falling first, so the head is moving well clear of zero when the hooks read it.
    world.step(3);
    world.beforeStep(() => { head.linearVelocityToRef(v); seen.push(["before 1", world.steps, v.y]); });
    world.beforeStep(() => seen.push(["before 2", world.steps]));
    world.afterStep(() => { head.linearVelocityToRef(v); seen.push(["after", world.steps, v.y]); });
    world.step(2);
    assert.equal(world.steps, 5);
    assert.equal(world.time, 5 / 120);
    assert.deepEqual(seen.map((s) => s.slice(0, 2)), [["before 1", 3], ["before 2", 3], ["after", 4], ["before 1", 4], ["before 2", 4], ["after", 5]]);
    // The whole body falls freely: a step's hooks see the speed the steps before it left, and each
    // step adds one step of gravity.
    const [before4, after4, before5, after5] = seen.filter((s) => s.length === 3).map((s) => s[2]);
    const g = 9.80665 * world.dt;
    assert.ok(before4 < -0.2, `the head falls at ${before4} m/s after three steps`);
    assert.equal(before5, after4, "a step's hooks read what the step before left");
    for (const [from, to] of [[before4, after4], [before5, after5]]) {
      assert.ok(Math.abs(to - from + g) < 5e-4, `a step took the head from ${from} to ${to} m/s; gravity's step is ${g}`);
    }
  } finally { stand.dispose(); }
});

test("a hook added while the world steps runs from the next step, and one removed stops at once", async () => {
  const stand = await airborne();
  const { world } = stand, calls = [];
  try {
    let late = null;
    const second = {};
    world.beforeStep(() => {
      calls.push(`first ${world.steps}`);
      if (world.steps === 0) late = world.beforeStep(() => calls.push(`late ${world.steps}`));
      if (world.steps === 1) second.hook.dispose();
    });
    second.hook = world.beforeStep(() => calls.push(`second ${world.steps}`));
    world.step(3);
    late.dispose();
    world.step(1);
    assert.deepEqual(calls, ["first 0", "second 0", "first 1", "late 1", "first 2", "late 2", "first 3"]);
  } finally { stand.dispose(); }
});

test("sensing runs before every step hook, whenever it was added", async () => {
  const stand = await airborne();
  const { world } = stand, calls = [];
  try {
    world.beforeStep(() => calls.push("before 1"));
    const first = world.sense((dt) => calls.push(`sense 1 ${dt === world.dt}`));
    world.afterStep(() => calls.push("after"));
    world.beforeStep(() => calls.push("before 2"));
    world.sense(() => calls.push("sense 2"));
    world.step(1);
    assert.deepEqual(calls, ["sense 1 true", "sense 2", "before 1", "before 2", "after"]);
    calls.length = 0;
    first.dispose();
    world.step(1);
    assert.deepEqual(calls, ["sense 2", "before 1", "before 2", "after"], "a sensing hook removed stops at once");
  } finally { stand.dispose(); }
});

test("elapsed time becomes whole steps, the remainder is carried, and a page that falls behind runs slow", async () => {
  const stand = await airborne();
  const { world } = stand, dt = world.dt;
  try {
    assert.equal(world.advance(0.6 * dt), 0);
    assert.equal(world.advance(0.6 * dt), 1, "two parts of a step make a step");
    assert.equal(world.advance(0.8 * dt), 1, "the carried 0.2 of a step and 0.8 more make another");
    // A second of frames at 144 Hz takes 120 steps, give or take the one in hand.
    let taken = 0;
    for (let i = 0; i < 144; i++) taken += world.advance(1 / 144);
    assert.ok(taken === 120 || taken === 119, `a second of 144 Hz frames took ${taken} steps`);
    const before = world.steps;
    assert.equal(world.advance(10, 12), 12, "at most the steps allowed");
    assert.equal(world.advance(0), 0, "the time it could not take is dropped, not owed");
    assert.equal(world.steps, before + 12);
  } finally { stand.dispose(); }
});

test("rendering the scene advances neither the world nor its bodies", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const world = createWorld(scene, await freshEngine());
  new FreeCamera("camera", new Vector3(0, 1, -5), scene);
  const { buildBody } = await import("../src/core/build/build-body.ts");
  const built = buildBody(humanSpec("workshop-rogue"), world, { position: [0, 2, 0] });
  try {
    const head = built.segments.get("head").node;
    world.step(3);
    const y = head.position.y, steps = world.steps;
    // Each render 16 ms long, so a scene stepping its own physics would take ten solver steps.
    scene.useConstantAnimationDeltaTime = true;
    for (let i = 0; i < 5; i++) scene.render();
    assert.equal(world.steps, steps);
    assert.equal(head.position.y, y, "the head did not move while the scene rendered");
    world.step(1);
    assert.ok(head.position.y < y, "a step still moves it");
  } finally { world.dispose(); built.dispose(); scene.dispose(); engine.dispose(); }
});

test("the same steps give the same world, however the time arrives", async () => {
  // The lab's routine for 1.5 s, stepped whole, then again from frames of uneven length.
  const run = async (drive) => {
    const stand = await coreStand(humanSpec("workshop-rogue"), { hz: 120 });
    const routine = startRoutine(stand.built, stand.world);
    try {
      drive(stand.world);
      return { steps: stand.world.steps, pose: [...stand.built.segments.values()].flatMap((s) =>
        [...s.node.position.asArray(), ...s.node.rotationQuaternion.asArray()]) };
    } finally { routine.dispose(); stand.dispose(); }
  };
  const whole = await run((world) => world.step(180));
  const frames = await run((world) => {
    let seed = 3;
    while (world.steps < 180) {
      seed = (seed * 16807) % 2147483647;
      world.advance((0.2 + 2.5 * seed / 2147483647) / 120, 180 - world.steps);
    }
  });
  assert.equal(frames.steps, whole.steps);
  assert.deepEqual(frames.pose, whole.pose);
  assert.ok(whole.pose.some((x, i) => i % 7 === 2 && Math.abs(x) > 0.05), "the body moved off the start");
});
