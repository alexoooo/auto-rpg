import test from "node:test";
import assert from "node:assert/strict";
import { cellFigures, HARNESS, RULER } from "../research/headroom.mjs";
import { channelReport, rulerControl, sameProtocol } from "../research/command-surface-report.mjs";

// Result-ledger fixtures, not physical body views. Each A side is swapped explicitly.
function rows() {
  return [0, 1].flatMap(k => ["left", "right"].map(aSide => {
    const a = { targetedShare: aSide === "left" ? .2 : .4, targetSpeed: .6, targetForce: .5 };
    const b = { targetedShare: 0, targetSpeed: null, targetForce: null };
    return { status: "ok", k, aSide, winner: null, vitality: [1, 1], seconds: 6, wallSeconds: 1,
      ending: "time", leadChanges: 0, sides: aSide === "left" ? { left: a, right: b } : { left: b, right: a } };
  }));
}
function cell(run, cap, a = "expert-effector@c8,h1", b = "humanoid-duelist") {
  return { run, name: `human-warrior|${b === RULER ? "h2h" : "vs-duelist"}|${a}`,
    ...cellFigures(rows()), harness: HARNESS,
    protocol: { maxSeconds: cap, settleSeconds: 0, locomotionMode: "supported" },
    meta: { a, b, body: "human-warrior" } };
}

test("channel summaries attribute targets to the swapped subject and retain unavailable effort", () => {
  const data = rows();
  data.push({ ...data[0], k: 2, sides: { left: { targetedShare: 1 }, right: { targetedShare: 1 } } });
  const summary = cellFigures(data);
  assert.equal(summary.halfPairs, 1);
  assert.equal(summary.behaviour.targetedShare?.b, 0);
  assert.ok(Math.abs(summary.behaviour.targetedShare.a - .3) < 1e-12);
  assert.equal(summary.behaviour.targetedShare.b, 0);
  assert.equal(summary.behaviour.targetSpeed.a, .6);
  assert.equal(summary.behaviour.targetForce.a, .5);
  assert.ok(Number.isNaN(summary.behaviour.targetSpeed.b));
  assert.ok(Number.isNaN(summary.behaviour.targetForce.b));
});

test("ruler reuse requires matching cap, settling, locomotion and harness", () => {
  const a = cell("screen", 6), b = cell("control", 6);
  assert.ok(sameProtocol(a, b));
  for (const patch of [{ maxSeconds: 150 }, { maxSeconds: null }, { settleSeconds: 1 }, { locomotionMode: "free" }]) {
    assert.equal(sameProtocol(a, { ...b, protocol: { ...b.protocol, ...patch } }), false);
  }
  assert.equal(sameProtocol(a, { ...b, harness: "another harness" }), false);
  assert.equal(sameProtocol(a, { ...b, protocol: undefined }), false);
});

test("a run uses its own ruler and never picks an ambiguous external control", () => {
  const subject = cell("new-screen", 6), local = cell("new-screen", 6, RULER);
  const old = cell("old-screen", 6, RULER), full = cell("full", 150, RULER);
  assert.equal(rulerControl([full, old, local], subject), local);
  assert.equal(rulerControl([full, old], subject), old);
  assert.equal(rulerControl([full], subject), null);
  const second = cell("another-screen", 6, RULER);
  assert.equal(rulerControl([old, second, full], subject), null);
  assert.equal(rulerControl([old, second, full], subject, "another-screen"), second);
  assert.equal(rulerControl([full], subject, "full"), null);
});

test("reports retain repeated policy runs and never compare head-to-head cells across caps", () => {
  const screen = cell("screen", 6), full = cell("full", 150);
  const report = channelReport([screen, full, cell("screen", 6, RULER), cell("full", 150, RULER)]);
  assert.match(report, /expert-effector@c8,h1 on human-warrior \(screen\)/);
  assert.match(report, /expert-effector@c8,h1 on human-warrior \(full\)/);
  assert.match(report, /cap 6 s/); assert.match(report, /cap 150 s/);
  assert.match(report, /targeted 30\.0 % \(speed 0\.600, force 0\.500\)/);
  const a = cell("screen", 6, "expert-effector@c8,h1", RULER);
  const b = cell("full", 150, "expert-step@c8,h1", RULER);
  assert.doesNotMatch(channelReport([a, b]), / minus /);
  assert.match(channelReport([a, { ...b, protocol: a.protocol }]), /\(screen\) minus .*\(full\)/);
});
