import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { impactScreenCell } from "../research/effector-impact-screen.mjs";
import { orientationScreenPlans } from "../research/effector-orientation-screen.mjs";
import { chamberScreenPlans, chamberRotationPlans } from "../research/effector-chamber-screen.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

test("a continuous chamber changes a real blade contact from the same warmed state", async () => {
  const straight = orientationScreenPlans().find(p => p.label === "tilt0/roll0/to-0.5");
  const chamber = chamberScreenPlans().find(p => p.label === "chamber/t0.3/r0.45/a1.2");
  const first = chamber.segs[0], second = chamber.segs[1];
  assert.equal(chamber.switchAt, first.duration);
  assert.equal(first.extend, second.retract, "the hand reaches the same distance at the boundary");
  assert.equal(first.sweepTo, second.sweep, "the hand keeps its bearing across the boundary");
  const a = await impactScreenCell({ terminal: "blade", plan: straight });
  const b = await impactScreenCell({ terminal: "blade", plan: chamber });
  assert.equal(a.start.pose, b.start.pose);
  assert.deepEqual(b.targetHands, ["primary"]);
  // On the Warrior with a human's trunk and arm (Node bout runner, 2026-09-28) the straight plan
  // slaps flat, 7.23 J at edge alignment 0.03, and this chamber turns the edge into line: one weak
  // contact of 4.91 J at 0.919. Before the arm's rates doubled (Session 2 step 4), the straight plan
  // touched nothing and chamber/t0.15/r0.45/a0.8 was the case, at 0.866 J and 0.880; that chamber now
  // touches nothing. The warmed state is a duelist mirror's, so it moves with the body: on the 1.88 m,
  // 107 kg Warrior that chamber read 3.105 J at 0.661, and on the legacy human chamber/t0.3 read
  // 6.0 to 6.5 J, billed. Six of the twelve chambers reach the opponent, as before the arm.
  assert.ok(a.strongestBodyContact.edgeAlignment < 0.1, "the straight plan lands flat");
  assert.ok(b.strongestBodyContact.edgeAlignment > a.strongestBodyContact.edgeAlignment + 0.5,
    "the chamber must produce a measurably different body contact");
  assert.ok(b.maxBodyEnergyJ > 4.5 && b.maxBodyEnergyJ < 5.3);
  assert.equal(b.strongestBodyContact.kind, "weak");
  assert.ok(b.strongestBodyContact.edgeAlignment > .88 && b.strongestBodyContact.edgeAlignment < .95);
  assert.equal(b.preArmourDamage, 0);
});

test("rotation plans preserve the same two phase geometry and vary the hand orientation", () => {
  const plans = chamberRotationPlans();
  assert.equal(plans.length, 15);
  assert.equal(new Set(plans.map(p => p.label)).size, plans.length);
  for (const plan of plans) {
    assert.equal(plan.segs.length, 2);
    assert.equal(plan.switchAt, plan.segs[0].duration);
    assert.equal(plan.segs[0].extend, plan.segs[1].retract);
    assert.equal(plan.segs[0].sweepTo, plan.segs[1].sweep);
    assert.equal(plan.segs[0].tilt, plan.segs[1].tilt);
    assert.equal(plan.segs[0].roll, plan.segs[1].roll);
  }
});
