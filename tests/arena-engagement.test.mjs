import test from "node:test";
import assert from "node:assert/strict";
import { targetWindow } from "../src/core/control/target-window.ts";
import { engagementArena, engagementTrial, orderOpponent } from "../research/arena-engagement.mjs";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { traceOf } from "./harness/trace.mjs";
import { controlArena, attackCycles, shoveControlFighter } from "../research/arena-control-trials.mjs";
import { handFeedback, newHandContact } from "../src/core/control/hand-feedback.ts";
import { trackedEngagement } from "../src/core/mind/engagement.ts";
import { engagementComparison } from "../research/arena-engagement-score.mjs";

test("engagement window measures forward range and lateral clearance, including targets behind", () => {
  const range = { reach: .5, along: [-.1, .2] };
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .5], range, .1).inside, true);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .35], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .75], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [.11, 1, .5], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, -.5], range, .1).inside, false);
});

test("promotion compares actual exposure and keeps early victories distinct from three completed cycles", () => {
  const row = { config: { held: "club", hand: "right", motion: "stationary", gap: 2.4, mirror: false }, simulatedSeconds: 40,
    attempts: 8, usefulReturns: 2, falls: 0, timeouts: 2, verdict: null };
  const winner = { ...row, simulatedSeconds: 10, attempts: 3, timeouts: 0, verdict: { winner: "left", ending: "fatal" } };
  assert.equal(engagementComparison([row], [winner]).eligible, false);
  const comparison = engagementComparison([row], [winner], { earlyVictory: true });
  assert.equal(comparison.eligible, true);
  assert.equal(comparison.earlyVictories.length, 1);
  assert.equal(comparison.candidate.usefulPerSecond, .2);
  assert.equal(engagementComparison([row], [{ ...winner, falls: 1 }], { earlyVictory: true }).eligible, false);
  assert.equal(engagementComparison([row], [{ ...winner, verdict: { winner: "right", ending: "fatal" } }], { earlyVictory: true }).eligible, false);
  assert.throws(() => engagementComparison([row], []), /same unique cases/);
});

test("hand feedback excludes self contacts and distinguishes an incoming touch from existing pressure", async () => {
  const stand = await controlArena();
  try {
    stand.world.step(180);
    const built = stand.fighter.built;
    const reading = handFeedback({ ...built, physics: { ...built.physics, contactsOf() { return [
      { other: built.segments.get("middleTrunk").body, impulse: 100, point: [1, 2, 3] },
      { other: null, fixed: 0, impulse: 3, point: [4, 5, 6] },
      { other: null, fixed: 1, impulse: 0, point: [7, 8, 9] },
    ]; } } });
    reading.read();
    for (const hand of ["left", "right"]) {
      assert.equal(reading.state[hand].impulse, 3);
      assert.deepEqual(reading.state[hand].contactPoint, [4, 5, 6]);
      assert.ok([...reading.state[hand].point, ...reading.state[hand].velocity].every(Number.isFinite));
    }
    assert.deepEqual([newHandContact(false, { impulse: 3 }), newHandContact(true, { impulse: 3 }),
      newHandContact(false, { impulse: 0 }), newHandContact(false, undefined)], [true, false, false, false]);
  } finally { stand.dispose(); }
});

test("tracked engagement makes repeated useful right-hand cycles against a guarded arena opponent", async () => {
  const result = await engagementTrial({ engagement: "tracked", held: "empty", hand: "right", motion: "stationary", gap: 2.4 });
  assert.ok(result.usefulReturns >= 3, JSON.stringify(result));
  assert.equal(result.falls, 0);
});

test("ordered standing suppresses pursuit and moving-opponent engagement forks into a fresh Duel", async () => {
  const config = { engagement: "tracked", gap: 2.4, hand: "alternate" };
  const a = await engagementArena(config), b = await engagementArena(config);
  try {
    a.duel.order(a.side, STAND_ORDERS); a.world.step(180);
    assert.equal(a.fighter.minded.skills.report.engagement.phase, "guard");
    assert.equal(a.fighter.minded.skills.report.strike.hand, null);
    a.duel.order(a.side, null);
    for (let i = 0; i < 240; i++) { orderOpponent(a, "lateral", i); a.world.step(); }
    const saved = a.duel.save(); b.duel.load(saved);
    const traces = [a, b].map(s => traceOf(Object.values(s.duel.duelists).map(d => d.built)));
    for (let i = 240; i < 960; i++) for (const [k, stand] of [a, b].entries()) {
      orderOpponent(stand, "lateral", i); stand.world.step(); traces[k].take();
    }
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
    assert.equal(traces[0].digest(), traces[1].digest());
  } finally { a.dispose(); b.dispose(); }
});

test("a new physical hand contact triggers early return and replays across the pending contact", async () => {
  const a = await controlArena({ engagement: "tracked" }), b = await controlArena({ engagement: "tracked" });
  try {
    const boxes = [];
    for (const stand of [a, b]) {
      stand.world.step(180);
      const head = stand.fighter.body.view.head, target = [head.x, head.y, head.z + .65];
      boxes.push(stand.world.physics.addFixedBox([target[0], target[1], target[2] + .04], [.2, .2, .08]));
      stand.duel.order("left", { move: null, face: null, attack: target });
    }
    const report = a.fighter.minded.skills.report.strike;
    let contacted = false;
    while (a.world.time < 15 && !contacted) {
      a.world.step();
      contacted = report.phase === "swing" && a.world.physics.contactsOf(a.fighter.built.segments.get("hand.right").body)
        .some(c => c.fixed === boxes[0].id && c.impulse > 0);
    }
    assert.equal(contacted, true);
    const saved = a.duel.save(); b.duel.load(saved);
    a.world.step(); b.world.step();
    assert.equal(report.phase, "return");
    assert.ok(report.since < .4, "contact retracts before the outbound timer expires");
    const feedback = a.fighter.body.view.handFeedback.right;
    assert.ok(feedback.impulse > 0); assert.equal(feedback.contactPoint.length, 3);
    assert.ok([...feedback.point, ...feedback.velocity].every(Number.isFinite));
    for (let step = 0; step < 240; step++) { a.world.step(); b.world.step(); }
    assert.ok(report.pointCycle.response.reasons.contact > 0);
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
  } finally { a.dispose(); b.dispose(); }
});

test("tracked misses and cancelled strokes finish separately; recovery discards a committed stroke", async () => {
  for (const cancel of [false, true]) {
    const stand = await controlArena({ engagement: "tracked" });
    try {
      stand.world.step(180);
      const result = attackCycles(stand, { mode: "miss", seconds: 10, cancel });
      const response = stand.fighter.minded.skills.report.strike.pointCycle.response;
      assert.ok(response.reasons[cancel ? "cancelled" : "miss"] > 0, JSON.stringify(response));
      assert.equal(response.reasons.contact, 0); assert.equal(result.fell, false);
    } finally { stand.dispose(); }
  }
  const stand = await controlArena({ engagement: "tracked" });
  try {
    stand.world.step(180);
    const head = stand.fighter.body.view.head;
    stand.duel.order("left", { move: null, face: null, attack: [head.x, head.y, head.z + .65] });
    const report = stand.fighter.minded.skills.report.strike;
    while (stand.world.time < 15 && report.phase !== "swing") stand.world.step();
    assert.equal(report.phase, "swing");
    shoveControlFighter(stand, 0);
    while (stand.world.time < 20 && !stand.fighter.body.down) stand.world.step();
    assert.equal(stand.fighter.body.down, true);
    stand.duel.order("left", STAND_ORDERS);
    while (stand.world.time < 70 && report.pointCycle.response.reasons.interrupted === 0) stand.world.step();
    assert.ok(report.pointCycle.response.reasons.interrupted > 0);
    assert.equal(report.hand, null);
  } finally { stand.dispose(); }
});

test("preparation returns without release when its target escapes the window", async () => {
  const stand = await controlArena({ engagement: "tracked" });
  try {
    stand.world.step(180);
    const head = stand.fighter.body.view.head, report = stand.fighter.minded.skills.report.strike;
    stand.duel.order("left", { move: null, face: null, attack: [head.x, head.y, head.z + .65] });
    while (stand.world.time < 15 && report.phase !== "chamber") stand.world.step();
    assert.equal(report.phase, "chamber");
    stand.duel.order("left", { move: null, face: null, attack: [head.x + 2, head.y, head.z + .65] });
    while (stand.world.time < 20 && report.pointCycle.response.completed.right === 0) stand.world.step();
    assert.equal(report.pointCycle.response.last.reason, "target-moved");
    assert.equal(report.pointCycle.response.last.returned, true);
    assert.deepEqual(report.thrown, { left: 0, right: 0 });
  } finally { stand.dispose(); }
});

test("a missing or eliminated sensed opponent clears autonomous pursuit", async () => {
  const stand = await engagementArena({ engagement: "tracked" });
  try {
    stand.world.step(180);
    const sight = { view: stand.fighter.body.view, report: stand.fighter.minded.skills.report, envelope: stand.fighter.body.envelope };
    for (const others of [[], sight.view.senses.others.map(o => ({ ...o, out: true }))]) {
      const tactics = trackedEngagement("test", () => null, "right");
      tactics.decide(sight, stand.world.dt);
      assert.ok(tactics.state.foe);
      const intent = tactics.decide({ ...sight, view: { ...sight.view, senses: { ...sight.view.senses, others } } }, stand.world.dt);
      assert.deepEqual(intent, { move: null, face: sight.report.heading, hands: { left: { kind: "guard" }, right: { kind: "guard" } } });
      assert.equal(tactics.state.foe, null);
    }
  } finally { stand.dispose(); }
});

test("tracked empty hands and club repeat contact and miss cycles against a static target", async () => {
  for (const mode of ["hit", "miss"]) for (const loadout of [{ held: "empty", hand: "alternate" }, { held: "club", hand: "right" }]) {
    const stand = await controlArena({ ...loadout, engagement: "tracked" });
    try {
      stand.world.step(180);
      const result = attackCycles(stand, { mode, seconds: 15 });
      assert.equal(result.fell, false); assert.equal(result.failed, 0);
      for (const hand of loadout.hand === "alternate" ? ["left", "right"] : ["right"]) {
        assert.ok(result.returned[hand] >= 3, JSON.stringify(result));
        if (mode === "hit") assert.ok(result.impacts.some(i => i.hand === hand && i.closing > 0));
      }
      if (mode === "miss") assert.equal(result.impacts.length, 0);
    } finally { stand.dispose(); }
  }
});

test("a crowded club can create space while returning, including the mirrored pressure failures", async () => {
  for (const gap of [1.2, 2.4]) {
    const result = await engagementTrial({ engagement: "tracked", held: "club", hand: "right", motion: "advance", gap, mirror: true });
    assert.ok(result.usefulReturns >= 2, JSON.stringify(result));
    assert.equal(result.falls, 0); assert.equal(result.timeouts, 0);
  }
});

test("returning while stepping backward preserves the entire bout across a fresh-world fork", async () => {
  const config = { engagement: "tracked", held: "club", hand: "right", gap: 2.4, mirror: true };
  const a = await engagementArena(config), b = await engagementArena(config);
  try {
    const report = a.fighter.minded.skills.report.strike;
    while (a.world.time < 20 && !(report.phase === "return" && a.fighter.body.view.stance.phase !== "stand")) {
      orderOpponent(a, "advance", a.world.steps); a.world.step();
    }
    assert.equal(report.phase, "return");
    assert.notEqual(a.fighter.body.view.stance.phase, "stand");
    b.duel.load(a.duel.save());
    const traces = [a, b].map(s => traceOf(Object.values(s.duel.duelists).map(d => d.built)));
    for (let i = 0; i < 720; i++) for (const [k, stand] of [a, b].entries()) {
      orderOpponent(stand, "advance", stand.world.steps); stand.world.step(); traces[k].take();
    }
    assert.ok(report.pointCycle.returned.right > 0);
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
    assert.equal(traces[0].digest(), traces[1].digest());
  } finally { a.dispose(); b.dispose(); }
});
