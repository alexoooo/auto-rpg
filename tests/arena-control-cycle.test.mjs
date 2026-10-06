import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { recoveryReady } from "../src/core/control/recovery-ready.ts";
import { footStatesOf, readSupport } from "../src/core/control/support.ts";
import { saveState } from "../src/core/state.ts";
import { controlArena, recoveryCycle, strikeCycle, shoveControlFighter, walkAfterRecovery } from "../research/arena-control-trials.mjs";
import { traceOf } from "./harness/trace.mjs";

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

test("Warrior rises from four arena shove directions and executes a commanded walk", async (t) => {
  for (const direction of [0, 1, 2, 3]) {
    const result = await recoveryCycle({ held: "empty", direction });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials[0].acquired, true);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ direction, trial: result.trials[0] }));
  }
});

test("empty hands and a retained club recover twice, walk, and resume actual strike-and-return cycles", async (t) => {
  for (const held of ["empty", "club"]) {
    const result = await recoveryCycle({ held, direction: 0, repeat: 2, attack: true, seconds: 180 });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials.length, 2);
    assert.ok(result.trials.every((r) => r.acquired && r.walk.strides > 0 && !r.walk.fell));
    assert.ok(result.attack.impacts.length >= 2);
    assert.ok(result.attack.returned.right >= 2);
    assert.equal(result.attack.fell, false);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ held, recovery: result.trials.map((r) => r.seconds), returns: result.attack.returned, failedReturns: result.attack.failed }));
  }
});

test("the measured stabilization handover replays into a fresh arena and survives walking", async () => {
  const a = await controlArena(), b = await controlArena();
  try {
    a.world.step(120); shoveControlFighter(a, 0);
    const recovery = a.fighter.body.state.mind.subs[0];
    while (a.world.time < 60 && !(recovery.phase === "stabilize" && recovery.ready > .1)) a.world.step();
    assert.equal(recovery.phase, "stabilize");
    assert.ok(recovery.ready > 0 && recovery.ready < .5);
    const saved = a.duel.save(); b.duel.load(saved);
    const finish = (stand) => {
      const trace = traceOf(Object.values(stand.duel.duelists).map((d) => d.built));
      const hook = stand.world.afterStep(() => trace.take());
      try {
        const r = stand.fighter.body.state.mind.subs[0];
        while (stand.world.time < 65 && r.completed === 0) stand.world.step();
        assert.equal(r.completed, 1);
        const walk = walkAfterRecovery(stand);
        assert.equal(walk.fell, false); assert.ok(walk.strides > 0);
        return { walk, state: saveState(stand.duel.state), digest: trace.digest() };
      } finally { hook.dispose(); }
    };
    const expected = finish(a);
    assert.deepEqual(finish(b), expected);
    a.duel.load(saved); assert.deepEqual(finish(a), expected);
  } finally { a.dispose(); b.dispose(); }
});

test("both hands and the club strike and return repeatedly after contact and misses", async () => {
  for (const mode of ["hit", "miss"]) for (const config of [{ held: "empty", hand: "alternate" }, { held: "club", hand: "right" }]) {
    const result = await strikeCycle({ ...config, mode });
    assert.equal(result.fell, false); assert.equal(result.failed, 0);
    const hands = config.hand === "alternate" ? ["left", "right"] : ["right"];
    for (const hand of hands) {
      assert.ok(result.returned[hand] >= 3, JSON.stringify(result));
      if (mode === "hit") assert.ok(result.impacts.some((i) => i.hand === hand && i.closing > 0), JSON.stringify(result));
    }
    if (mode === "miss") { assert.equal(result.contactSteps, 0); assert.deepEqual(result.impacts, []); }
    for (let i = 0; i < result.transitions.length; i++) if (result.transitions[i].phase === "swing") {
      assert.equal(result.transitions[i + 1]?.phase, "return");
    }
  }
});

test("cancelling a committed point strike returns its hand without counting a finished swing", async () => {
  const result = await strikeCycle({ held: "empty", hand: "right", mode: "miss", cancel: true });
  assert.equal(result.cancelled, true); assert.equal(result.fell, false);
  assert.deepEqual(result.thrown, { left: 0, right: 0 });
  assert.deepEqual(result.returned, { left: 0, right: 1 });
  assert.equal(result.failed, 0); assert.equal(result.interrupted, 1);
});

test("a point-return trajectory and its measured completion survive a fresh-world fork", async () => {
  const a = await controlArena(), b = await controlArena();
  try {
    a.world.step(180);
    const h = a.fighter.body.view.head;
    a.duel.order("left", { move: null, face: null, attack: [h.x, h.y, h.z + .65] });
    const report = a.fighter.minded.skills.report.strike;
    while (a.world.time < 15 && report.phase !== "return") a.world.step();
    assert.equal(report.phase, "return");
    a.world.step(10);
    const saved = a.duel.save(); b.duel.load(saved);
    const trace = traceOf(Object.values(a.duel.duelists).map((d) => d.built)), other = traceOf(Object.values(b.duel.duelists).map((d) => d.built));
    for (let step = 0; step < 600; step++) { a.world.step(); b.world.step(); trace.take(); other.take(); }
    assert.ok(report.pointCycle.returned.right >= 2);
    assert.equal(trace.digest(), other.digest());
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
  } finally { a.dispose(); b.dispose(); }
});
