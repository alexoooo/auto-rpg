import test from "node:test";
import assert from "node:assert/strict";
import { pointStrike } from "../src/core/control/point-strike.ts";
import { createPointStrikeProbe } from "../src/core/tasks/point-strike.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], identity = [0, 0, 0, 1];
const settings = { effectors: [{ id: "strike", frame: { kind: "segment", name: "hand" }, at: zero, guard: [1, 0, 0], target: [2, 0, 0] }],
  joints: [], hold: [], seconds: 0.15, weight: 1, tolerance: 0.02, readySeconds: 0.25, strikeSeconds: 1, followSeconds: 1, returnSeconds: 1 };
const observation = (position = [1, 0, 0], velocity = zero) => ({ segments: [{ name: "hand", position, centre: position, rotation: identity, velocity, spin: zero }] });

test("point strike uses measured readiness, analytic path derivatives and a return after a miss", () => {
  const policy = pointStrike(settings);
  policy.step(observation(zero), 0.5); assert.equal(policy.state.phase, "prepare");
  const start = policy.step(observation(), 0.5).frames[0].translation;
  assert.deepEqual([start.target, start.velocity, start.acceleration], [[1, 0, 0], zero, zero]);
  const middle = policy.step(observation(), 0.5).frames[0].translation;
  assert.deepEqual([middle.target, middle.velocity, middle.acceleration], [[1.5, 0, 0], [1.875, 0, 0], zero]);
  const end = policy.step(observation(), 1).frames[0].translation;
  assert.equal(policy.state.phase, "follow");
  assert.deepEqual([end.target, end.velocity, end.acceleration], [[2, 0, 0], zero, zero]);
  policy.step(observation([1.7, 0, 0]), 1);
  assert.equal(policy.state.phase, "return");
  assert.deepEqual(policy.state.start[0].position, [1.7, 0, 0], "return starts at the observed effector after the miss");
  policy.step(observation(), 0.25); assert.equal(policy.state.phase, "complete");
  policy.idle(); policy.step(observation(), 1); assert.equal(policy.state.phase, "complete");
});

test("a rotating point's initial velocity includes the lever from the centre of mass", () => {
  for (const kind of ["segment", "item"]) {
    const frame = kind === "segment" ? { kind, name: "hand" } : { kind, id: "club" };
    const policy = pointStrike({ ...settings, effectors: [{ ...settings.effectors[0], frame, at: [1, 0, 0] }] }, [{ id: "club", centre: [0.5, 0, 0] }]);
    const part = { name: "hand", id: "club", position: zero, rotation: identity, centre: [0.5, 0, 0], velocity: [1, 2, 0], spin: [0, 0, 2] };
    const first = policy.step({ segments: [part], equipment: [part] }, 0.25).frames[0].translation;
    assert.deepEqual(first.velocity, [1, 3, 0]);
    assert.ok(first.acceleration.every((v) => v === 0));
    policy.idle(); assert.equal(policy.state.phase, "prepare"); assert.deepEqual(policy.state.start, []);
  }
});

async function fixture(config) {
  const render = new NullEngine(), scene = new Scene(render);
  const task = createPointStrikeProbe(scene, await freshEngine(), { hz: 120, actuation: "directional", offset: 0, held: "empty", miss: false, ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); render.dispose(); } };
}

test("standing point strikes hit with either hand or independent items and return on all three bodies", async () => {
  for (const held of ["empty", "club"]) for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const hands of ["left", "right", "both"]) {
    const f = await fixture({ model, hands, held });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      const { task: result } = f.task.observe();
      assert.ok(f.task.complete, `${model}/${hands}: ${JSON.stringify(result)}`);
      assert.equal(result.fell, false); assert.equal(result.rejectedSteps, 0);
      for (const strike of result.strikes) {
        assert.ok(strike.contacts > 0 && strike.peakImpulse > 0 && strike.closing > 0.05);
        assert.ok(strike.returnError < 0.02);
      }
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});

test("a missed target scores no hit and the strike's continuation replays in another world", async () => {
  for (const held of ["empty", "club"]) {
  const config = { model: "workshop-fighter", hands: "both", held, miss: true }, f = await fixture(config), other = await fixture(config);
  try {
    while (f.task.observe().task.phase !== "strike" && f.task.world.time < 3) f.task.world.step();
    assert.equal(f.task.observe().task.phase, "strike");
    f.task.world.step(15);
    const saved = saveStand(f.task.world, f.task.state);
    const run = (task) => { while (!task.complete && task.world.time < 8) task.world.step(); return { observation: task.observe(), saved: saveStand(task.world, task.state).state }; };
    const expected = run(f.task);
    assert.ok(f.task.complete); assert.equal(expected.observation.task.fell, false);
    assert.ok(expected.observation.task.strikes.every((s) => s.contacts === 0 && s.firstHit === -1 && s.returnError < 0.02));
    loadStand(f.task.world, f.task.state, saved); assert.deepEqual(run(f.task), expected);
    loadStand(other.task.world, other.task.state, saved); assert.deepEqual(run(other.task), expected);
  } finally { f.dispose(); other.dispose(); }
  }
});
