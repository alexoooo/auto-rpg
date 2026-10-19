/**
 * **The point strike's policy** (`pointStrike`, `src/core/control/point-strike.ts`), stepped on
 * observations it is handed: its readiness, path, return, sensed targets and impact braking.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pointStrike } from "../src/core/control/point-strike.ts";

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
