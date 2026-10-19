import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { recoveryReady } from "../src/core/control/recovery-ready.ts";
import { footStatesOf, readSupport } from "../src/core/control/support.ts";
import { controlArena, strikeCycle } from "../research/arena-control-trials.mjs";

test("handover requires upright, quiet, loaded foot support rather than a recovery stage", async () => {
  const stand = await controlArena();
  try {
    stand.world.step(240);
    const body = stand.fighter.body, observation = body.observe(), feet = footStatesOf(stand.fighter.built);
    readSupport(feet, feet, new Vector3());
    const supports = feet.map((f) => ({ segment: f.segment.spec.name, corners: f.corners.map((c) => c.asArray()) }));
    const settings = { slow: .1, minUpNormal: .9 };
    assert.equal(recoveryReady(observation, supports, settings), true);
    const cases = [
      { ...observation, down: true },
      { ...observation, contacts: [] },
      { ...observation, contacts: observation.contacts.filter((c) => c.segment !== "foot.left") },
      { ...observation, contacts: observation.contacts.map((c) => ({ ...c, normal: [1, 0, 0] })) },
      { ...observation, contacts: [...observation.contacts, { ...observation.contacts[0], segment: "head", impulse: 1 }] },
      { ...observation, centre: [observation.centre[0] + 2, observation.centre[1], observation.centre[2]] },
      { ...observation, segments: observation.segments.map((s) => ({ ...s, velocity: [.2, 0, 0] })) },
    ];
    for (const candidate of cases) assert.equal(recoveryReady(candidate, supports, settings), false);
    assert.equal(recoveryReady(observation, [], settings), false);
  } finally { stand.dispose(); }
});

test("a miss touches nothing, and every stroke thrown ends but the one under way", async () => {
  const result = await strikeCycle({ held: "empty", hand: "alternate", mode: "miss" });
  assert.ok(result.thrown.left > 0 && result.thrown.right > 0, `${JSON.stringify(result.thrown)} thrown: the fixture did not reach its case`);
  assert.equal(result.contactSteps, 0); assert.deepEqual(result.impacts, []);
  const sum = (record) => record.left + record.right, open = sum(result.thrown) - sum(result.returned) - result.failed - result.interrupted;
  assert.ok(open >= 0 && open <= 1, JSON.stringify(result));
});

test("cancelling a committed strike finishes its swing and returns its hand, and starts no other", async () => {
  const result = await strikeCycle({ held: "empty", hand: "right", mode: "miss", cancel: true });
  assert.equal(result.cancelled, true); assert.equal(result.fell, false);
  assert.deepEqual(result.thrown, { left: 0, right: 1 });
  assert.deepEqual(result.returned, { left: 0, right: 1 });
  assert.equal(result.failed, 0); assert.equal(result.interrupted, 0);
  // One action from first to last: every transition but the last is under way, all of the right hand's.
  const last = result.transitions.at(-1), under = result.transitions.slice(0, -1);
  assert.ok(under.length > 0 && last.phase === null && under.every((t) => t.phase !== null && t.hand === "right"), JSON.stringify(result.transitions));
});
