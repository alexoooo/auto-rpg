import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { impactScreenCell } from "../research/effector-impact-screen.mjs";
import { orientationScreenPlans } from "../research/effector-orientation-screen.mjs";
import { chamberScreenPlans, chamberRotationPlans } from "../research/effector-chamber-screen.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

test("a continuous chamber changes a real blade contact from the same warmed state", async () => {
  const straight = orientationScreenPlans().find(p => p.label === "tilt0/roll0/to-0.5");
  const chamber = chamberScreenPlans().find(p => p.label === "chamber/t0.15/r0.45/a0.8");
  const first = chamber.segs[0], second = chamber.segs[1];
  assert.equal(chamber.switchAt, first.duration);
  assert.equal(first.extend, second.retract, "the hand reaches the same distance at the boundary");
  assert.equal(first.sweepTo, second.sweep, "the hand keeps its bearing across the boundary");
  const a = await impactScreenCell({ terminal: "blade", plan: straight });
  const b = await impactScreenCell({ terminal: "blade", plan: chamber });
  assert.equal(a.start.pose, b.start.pose);
  assert.deepEqual(b.targetHands, ["primary"]);
  // On the Warrior at a typical adult's size and de Leva's masses (Node bout runner, 2026-09-28) the
  // straight plan touches nothing and this chamber lands one weak contact of 2.038 J at edge
  // alignment 0.892. On the 1.88 m, 107 kg Warrior it was 3.105 J at 0.661, read whole, and 0.974 J
  // billed at 0.56 of its speed; on the legacy human, chamber/t0.3 at 6.0 to 6.5 J, billed. Three of
  // the twelve chambers reach the opponent now: this one, a1.2 at t0.15 (5.8 J) and a1.2 at t0.3,
  // which cuts at 50.7 J.
  assert.ok(b.maxBodyEnergyJ > a.maxBodyEnergyJ + 1.5,
    "the chamber must produce a measurably different body contact");
  assert.ok(b.maxBodyEnergyJ > 1.9 && b.maxBodyEnergyJ < 2.2);
  assert.equal(b.strongestBodyContact.kind, "weak");
  assert.ok(b.strongestBodyContact.edgeAlignment > .85 && b.strongestBodyContact.edgeAlignment < .93);
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
