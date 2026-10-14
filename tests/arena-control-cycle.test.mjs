import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { recoveryReady } from "../src/core/control/recovery-ready.ts";
import { footStatesOf, readSupport } from "../src/core/control/support.ts";
import { controlArena, recoveryCycle, strikeCycle } from "../research/arena-control-trials.mjs";

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

test("Warrior rises from four arena shove directions and executes a commanded walk", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async (t) => {
  for (const direction of [0, 1, 2, 3]) {
    const result = await recoveryCycle({ held: "empty", direction });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials[0].acquired, true);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ direction, trial: result.trials[0] }));
  }
});

test("empty hands and a retained club recover twice, walk, and resume actual strike-and-return cycles", {
  todo: "the Combat fighter's second empty-handed rise stalls at stage 3 until the allowance ends, and its club cycles land no impact on the box",
}, async (t) => {
  for (const held of ["empty", "club"]) {
    const result = await recoveryCycle({ held, direction: 0, repeat: 2, attack: true, seconds: 180 });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials.length, 2);
    assert.ok(result.trials.every((r) => r.acquired && r.walk.steps > 0 && !r.walk.fell));
    assert.ok(result.attack.impacts.length >= 2);
    assert.ok(result.attack.returned.right >= 2);
    assert.equal(result.attack.fell, false);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ held, recovery: result.trials.map((r) => r.seconds), returns: result.attack.returned, failedReturns: result.attack.failed }));
  }
});

test("both hands strike and return repeatedly after contact and misses", {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async (t) => {
  for (const mode of ["hit", "miss"]) {
    const result = await strikeCycle({ held: "empty", hand: "alternate", mode });
    assert.equal(result.fell, false);
    t.diagnostic(JSON.stringify({ mode, returned: result.returned, failed: result.failed }));
    for (const hand of ["left", "right"]) {
      assert.ok(result.returned[hand] >= 3, JSON.stringify(result));
      if (mode === "hit") assert.ok(result.impacts.some((i) => i.hand === hand && i.closing > 0), JSON.stringify(result));
    }
    if (mode === "miss") { assert.equal(result.contactSteps, 0); assert.deepEqual(result.impacts, []); }
    for (let i = 0; i + 1 < result.transitions.length; i++) if (result.transitions[i].phase === "swing") {
      assert.equal(result.transitions[i + 1]?.phase, "return");
    }
  }
});

test("every return is verified, and the club strikes and returns after contact and misses", {
  todo: "the Combat fighter times out about one return in ten with fists, and its club cycles land no impact on the box",
}, async () => {
  for (const mode of ["hit", "miss"]) for (const config of [{ held: "empty", hand: "alternate" }, { held: "club", hand: "right" }]) {
    const result = await strikeCycle({ ...config, mode });
    assert.equal(result.fell, false); assert.equal(result.failed, 0);
    assert.ok(result.returned.right >= 3, JSON.stringify(result));
    if (mode === "hit") assert.ok(result.impacts.some((i) => i.hand === "right" && i.closing > 0), JSON.stringify(result));
  }
});

test("cancelling a committed strike finishes its swing and returns its hand, and starts no other", async () => {
  const result = await strikeCycle({ held: "empty", hand: "right", mode: "miss", cancel: true });
  assert.equal(result.cancelled, true); assert.equal(result.fell, false);
  assert.deepEqual(result.thrown, { left: 0, right: 1 });
  assert.deepEqual(result.returned, { left: 0, right: 1 });
  assert.equal(result.failed, 0); assert.equal(result.interrupted, 0);
  assert.deepEqual(result.transitions.map((s) => s.phase), ["admitting", "chamber", "swing", "return", null]);
});
