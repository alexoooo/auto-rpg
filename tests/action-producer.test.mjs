import test from "node:test";
import assert from "node:assert/strict";
import { actionProducer } from "../src/core/mind/action-producer.ts";

test("a script retains live identity, withdraws irreversibly and retries only fresh readiness", () => {
  const producer = actionProducer();
  let id = 0, ready = { kind: "ready" };
  const sight = { view: {}, report: { actions: [] }, instance: () => ++id, readiness: () => ready };
  const choice = { action: "jab", effector: "hand.right", target: { kind: "point", body: "foe", at: [0, 1, 1] } };
  const first = producer.request(sight, choice, {});
  assert.deepEqual(first, { requests: [{ ...choice, id: 1 }], readiness: ready });
  sight.report.actions = first.requests;
  const moved = { ...choice, target: { ...choice.target, at: [0, 1, 2] } };
  assert.deepEqual(producer.request(sight, moved, {}).requests, [{ ...moved, id: 1 }]);
  assert.deepEqual(producer.request(sight, null, {}), { requests: [], readiness: null });
  ready = { kind: "waiting", reason: "resources held" };
  assert.deepEqual(producer.request(sight, moved, {}), { requests: [], readiness: ready });
  assert.equal(id, 1);
  sight.report.actions = [];
  ready = { kind: "position", window: { at: [0, 1, 2], along: [.5, 1], across: [-.1, .1], facing: .2, speed: 1 } };
  assert.deepEqual(producer.request(sight, moved, {}), { requests: [], readiness: ready });
  assert.equal(id, 1);
  ready = { kind: "ready" };
  assert.deepEqual(producer.request(sight, moved, {}).requests, [{ ...moved, id: 2 }]);
});

test("changed target identity withdraws the old request and gets a new id", () => {
  const producer = actionProducer();
  let id = 0;
  const sight = { view: {}, report: { actions: [] }, instance: () => ++id, readiness: () => ({ kind: "ready" }) };
  const choice = { action: "jab", effector: "hand.left", target: { kind: "body", body: "foe", region: { kind: "mark", mark: "high" } } };
  sight.report.actions = producer.request(sight, choice, {}).requests;
  const changed = { ...choice, target: { ...choice.target, region: { kind: "mark", mark: "middle" } } };
  assert.deepEqual(producer.request(sight, changed, {}).requests, [{ ...changed, id: 2 }]);
  assert.deepEqual(producer.state.current, { ...changed, id: 2 });
});
