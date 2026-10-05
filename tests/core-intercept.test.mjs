import test from "node:test";
import assert from "node:assert/strict";
import { intercept, predictIntercept } from "../src/core/control/intercept.ts";
import { saveState, loadState } from "../src/core/state.ts";

const zero = [0, 0, 0], identity = [0, 0, 0, 1];
const plane = { point: zero, normal: [0, 0, 1] };
const part = (name, position = zero, velocity = zero) => ({ name, position, centre: position, rotation: identity, velocity, spin: zero });
const threat = (time, position = [0, 0, 1], velocity = [0, 0, -1]) => ({ id: "incoming", time, position,
  centre: position, rotation: identity, velocity, spin: zero, points: { tip: zero }, mass: 1, owner: "opponent" });
const seen = (time, objects, contacts = [], segments = [part("hand.left", [-0.2, 0, 0]), part("hand.right", [0.2, 0, 0])]) => ({
  time, senses: { objects }, segments, contacts, joints: [{ name: "elbow", angle: 0.5 }],
});
const settings = (extra = {}) => ({ effectors: ["left", "right"].map((side) => ({ id: side,
  frame: { kind: "segment", name: `hand.${side}` }, at: zero, guard: [side === "left" ? -0.2 : 0.2, 0, 0],
  threat: { id: "incoming", point: "tip" }, plane, reach: { frame: { kind: "segment", name: `hand.${side}` }, at: zero, distance: 2 },
  travelSpeed: 10, braceRotation: true })),
  joints: [{ channel: "elbow", angle: 0.5, rate: 0, acceleration: 0, seconds: 0.2, weight: 0.03 }], hold: [],
  seconds: 0.08, weight: 1, horizon: 2, contactImpulse: 0.005, braceWeight: 0.2, returnSeconds: 0.5,
  retreatDistance: 0.1, marginFraction: 0.1, marginWeight: 1, ...extra });
const model = { channels: [{ name: "elbow", min: 0, max: 1 }], frames: ["left", "right"].map((side) => ({ kind: "segment", name: `hand.${side}` })) };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("plane interception compensates sample age and accelerating motion without knowing the mechanism", () => {
  const sample = { time: 0, position: [0, 2, 1], velocity: [0, 0.2, -1] }, acceleration = [0, -4, -2];
  const collision = predictIntercept(sample, acceleration, plane, 0.1, 2), time = (Math.sqrt(5) - 1) / 2;
  close(collision.seconds, time - 0.1); close(collision.position[2], 0);
  close(collision.position[1], 2 + 0.2 * time - 2 * time * time);
  assert.equal(predictIntercept(sample, acceleration, plane, 0.1, 0.5), null);
  assert.equal(predictIntercept(sample, [0, 0, 2], plane, 0, 2), null, "slowing motion never reaches the plane");
  assert.equal(predictIntercept({ ...sample, position: [0, 0, 0.25] }, [0, 0, 2], plane, 0, 2), null, "tangency is not a closing crossing");
  assert.equal(predictIntercept({ ...sample, velocity: [0, 0, 1] }, zero, plane, 0, 2), null);
  assert.equal(predictIntercept({ ...sample, position: [0, 0, -1] }, zero, plane, 0, 2), null);
  const diagonal = predictIntercept({ time: 0, position: [1, 1, 0], velocity: [-1, -1, 0] }, zero,
    { point: zero, normal: [1, 1, 0] }, 0, 2);
  close(diagonal.seconds, 1); assert.deepEqual(diagonal.position, zero);
});

test("interception learns acceleration from actual sample times and replays its measurement history", () => {
  const policy = intercept(settings(), model);
  policy.step(seen(0.1, [threat(0.05)]));
  policy.step(seen(0.2, [threat(0.15, [0, 0, 0.89], [0, 0, -1.2])]));
  close(policy.state.effectors[0].previous.acceleration[2], -2);
  const previous = structuredClone(policy.state.effectors[0].previous);
  policy.step(seen(0.21, [threat(0.15, [0, 0, 0.89], [0, 0, -1.2])]));
  assert.deepEqual(policy.state.effectors[0].previous, previous, "repeated delayed samples retain their acceleration estimate");
  const saved = saveState(policy.state);
  const branch = () => ({ command: policy.step(seen(0.3, [threat(0.25, [0, 0, 0.76], [0, 0, -1.4])])), state: saveState(policy.state) });
  const expected = branch(); loadState(policy.state, saved); assert.deepEqual(branch(), expected);
});

test("only the matched threat braces the touched effector and the other hand continues its path", () => {
  const policy = intercept(settings(), model), object = threat(0);
  policy.step(seen(0, [object]));
  const contact = { segment: "hand.left", other: "own-forearm", impulse: 0.1 };
  policy.step(seen(0.1, [threat(0.1)], [contact]));
  assert.equal(policy.state.effectors[0].phase, "intercept");
  policy.step(seen(0.15, [threat(0.15)], [{ ...contact, other: "incoming", impulse: 0.001 }]));
  assert.equal(policy.state.effectors[0].phase, "intercept");
  const parts = [part("hand.left"), part("hand.right")]; parts[0].rotation = [0, 0, Math.sqrt(0.5), Math.sqrt(0.5)];
  const command = policy.step(seen(0.2, [threat(0.2)], [{ ...contact, other: "incoming" }], parts));
  assert.deepEqual(command.frames[0].orientation.target, parts[0].rotation);
  assert.equal(command.frames[1].orientation, undefined);
  assert.equal(policy.state.effectors[0].phase, "hold"); assert.equal(policy.state.effectors[1].phase, "intercept");
  assert.deepEqual(command.frames[0].translation.velocity, zero);
});

test("stationary preparation contact cannot latch the guard before a closing threat", () => {
  const policy = intercept(settings(), model), contact = { segment: "hand.left", other: "incoming", impulse: 0.1 };
  policy.step(seen(0, [threat(0, [0, 0, 1], zero)], [contact]));
  assert.equal(policy.state.effectors[0].phase, "guard");
  policy.step(seen(0.1, [threat(0.1, [0, 0, 0.9], [0, 0, -1])]));
  assert.equal(policy.state.effectors[0].phase, "intercept");
  const baseline = intercept(settings({ enabled: false }), model);
  const command = baseline.step(seen(0.1, [threat(0.1)], [contact]));
  assert.ok(baseline.state.effectors.every((e) => e.phase === "guard" && e.previous === null));
  assert.deepEqual(command.frames.map((f) => f.translation.target), settings().effectors.map((e) => e.guard));
});

test("reach and travel-time filters retain the guard and expose rejected candidates", () => {
  for (const kind of ["reach", "time"]) {
    const config = settings();
    for (const e of config.effectors) {
      if (kind === "reach") e.reach.distance = 0.01;
      else e.travelSpeed = 0.01;
    }
    const policy = intercept(config, model), command = policy.step(seen(0, [threat(0)]));
    assert.ok(policy.state.effectors.every((e) => e.phase === "guard" && e.rejectedCandidates === 1));
    assert.deepEqual(command.frames.map((g) => g.translation.target), config.effectors.map((e) => e.guard));
  }
});

test("missing or retreating threats and an idle interval return from measured point motion", () => {
  for (const cause of ["missing", "retreat", "idle"]) {
    const policy = intercept(settings(), model); policy.step(seen(0, [threat(0)]));
    if (cause === "idle") policy.idle();
    const parts = [part("hand.left", [0.1, 0.2, 0.3], [0.4, 0, 0]), part("hand.right")];
    const command = policy.step(seen(0.1, cause === "retreat" ? [threat(0.1, [0, 0, 0.5], [0, 0, 1])] : [], [], parts));
    assert.equal(policy.state.effectors[0].phase, "return");
    assert.deepEqual(command.frames[0].translation.target, parts[0].position);
    assert.deepEqual(command.frames[0].translation.velocity, parts[0].velocity);
    const end = policy.step(seen(0.7, [], [], parts));
    assert.equal(policy.state.effectors[0].phase, "guard");
    assert.deepEqual(end.frames[0].translation.target, settings().effectors[0].guard);
  }
});

test("the posture preference rises near either joint limit without changing anatomical bounds", () => {
  const config = settings(), policy = intercept(config, model);
  config.marginWeight = 999; model.channels[0].min = -999;
  try {
    for (const [angle, weight] of [[0, 1.03], [0.5, 0.03], [1, 1.03]]) {
      const observation = seen(0, []); observation.joints[0].angle = angle;
      close(policy.step(observation).joints[0].weight, weight);
    }
  } finally { model.channels[0].min = 0; }
  const bad = settings(); bad.effectors[0].plane.normal = zero;
  assert.throws(() => intercept(bad, model), /invalid interception effector/);
});
