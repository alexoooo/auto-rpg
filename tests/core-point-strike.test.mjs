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

test("a sensed strike compensates sample age and returns from observation when its target disappears", () => {
  const policy = pointStrike({ ...settings, effectors: [{ ...settings.effectors[0], targetObject: { id: "moving", point: "aim" } }] });
  const target = { id: "moving", time: 0, position: [2, 0, 0], rotation: identity, centre: [2, 0, 0],
    velocity: [0.2, 0, 0], spin: zero, points: { aim: zero } };
  const seen = (time, objects, at = [1, 0, 0], velocity = zero) => ({ ...observation(at, velocity), time, senses: { objects } });
  policy.step(seen(0.1, []), 0.5); assert.equal(policy.state.phase, "prepare");
  policy.step(seen(0.1, [target]), 0.5); assert.equal(policy.state.phase, "strike");
  const middle = policy.step(seen(0.6, [target]), 0.5).frames[0].translation;
  assert.ok(Math.abs(middle.target[0] - 1.57875) < 1e-12, JSON.stringify(middle));
  assert.ok(Math.abs(middle.velocity[0] - 2.2) < 1e-12);
  const lost = policy.step(seen(1.1, [], [1.4, 0, 0], [0.3, 0, 0]), 0.1).frames[0].translation;
  assert.equal(policy.state.phase, "return");
  assert.deepEqual(lost.target, [1.4, 0, 0]); assert.deepEqual(lost.velocity, [0.3, 0, 0]);
});

test("impact braking replans only the contacted effector from its measured motion", () => {
  const effectors = ["left", "right"].map((side) => ({ ...settings.effectors[0], id: side, frame: { kind: "segment", name: side } }));
  const policy = pointStrike({ ...settings, effectors, impact: { impulse: 0.005, seconds: 0.15 } });
  const seen = (time, contacts = [], position = [1, 0, 0], velocity = zero) => ({ time, contacts,
    segments: ["left", "right"].map((name) => ({ ...observation(position, velocity).segments[0], name })) });
  policy.step(seen(0), 0.25);
  const impacted = policy.step(seen(0.25, [{ segment: "left", impulse: 0.01 }], [1.2, 0, 0], [0.5, 0, 0]), 0.25);
  assert.deepEqual(impacted.frames[0].translation.target, [1.2, 0, 0]);
  assert.deepEqual(impacted.frames[0].translation.velocity, [0.5, 0, 0]);
  assert.notDeepEqual(impacted.frames[1].translation.target, [1.2, 0, 0]);
  assert.equal(policy.state.impacts[1], null);
  const held = policy.step(seen(0.5), 0.25).frames[0].translation;
  assert.deepEqual(held.target, [1.2, 0, 0]); assert.deepEqual(held.velocity, zero);
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

test("sensed swinging targets are struck and the body returns with either hand or independent items", async () => {
  for (const held of ["empty", "club"]) for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const hands of ["left", "right", "both"]) {
    const f = await fixture({ model, hands, held, swing: { angle: 0, speed: 0.7, delay: 3, tracking: true, braking: true } });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      const result = f.task.observe().task;
      assert.ok(f.task.complete && !result.fell && result.rejectedSteps === 0, `${model}/${hands}/${held}: ${JSON.stringify(result)}`);
      for (const row of result.strikes) {
        assert.ok(row.contacts > 0 && row.closing > 0.05 && row.peakImpulse > 0);
        assert.ok(row.targetTravel > 0.15 && row.targetSpeed > 0.6, "target motion is measured before any contact");
        assert.ok(row.returnError < 0.02);
      }
      assert.ok(f.task.body.state.mind.policy.impacts.every((p) => p !== null));
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});

test("moving targets, delayed senses and impact replanning replay in another world", async () => {
  const config = { model: "crypt-skeleton", hands: "both", held: "club", swing: { angle: 0.1, speed: 0.7, delay: 3, tracking: true, braking: true } };
  const f = await fixture(config), other = await fixture(config);
  try {
    f.task.world.step(120);
    const saved = saveStand(f.task.world, f.task.state);
    const run = (task) => { while (!task.complete && task.world.time < 8) task.world.step(); return { observation: task.observe(), state: saveStand(task.world, task.state).state }; };
    const expected = run(f.task);
    assert.ok(f.task.complete && !expected.observation.task.fell);
    loadStand(f.task.world, f.task.state, saved); assert.deepEqual(run(f.task), expected);
    loadStand(other.task.world, other.task.state, saved); assert.deepEqual(run(other.task), expected);
  } finally { f.dispose(); other.dispose(); }
});
