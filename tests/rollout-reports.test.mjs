import test from "node:test";
import assert from "node:assert/strict";
import { captureCombatReports } from "./harness/rollout-reports.mjs";

test("rollout observer forwards each report once with its receiver and restores both callbacks", () => {
  const seen = [];
  const leftCombat = { onReport(event) { assert.equal(this, leftCombat); seen.push(event); } };
  const rightCombat = { onReport: undefined };
  const original = leftCombat.onReport;
  const capture = captureCombatReports({ forkWorld: () => ({ roots: { leftCombat, rightCombat } }) });
  const event = { hand: "secondary", effectorId: "off-hand", blocked: false, guarded: true,
    report: { at: 2, weapon: "sword", kind: "cut", key: "torso", speed: 8, closingSpeed: 3,
      energyJ: 4, edgeAlignment: 0.5, bladeAlignment: 0.3, tipDistanceM: 0.2,
      preArmourDamage: 2, postArmourDamage: 1, damage: 1 } };
  try { leftCombat.onReport(event); rightCombat.onReport(event); }
  finally { capture.stop(); }
  assert.deepEqual(seen, [event]);
  assert.equal(leftCombat.onReport, original);
  assert.equal(rightCombat.onReport, undefined);
  assert.deepEqual(capture.reports.map(r => r.side), ["left", "right"]);
  assert.equal(capture.reports[0].hand, "secondary");
  assert.equal(capture.reports[0].guarded, true);
  assert.equal(capture.reports[0].preArmourDamage, 2);
  event.report.speed = 90;
  assert.equal(capture.reports[0].speed, 8, "the observation must own its values");
  leftCombat.onReport(event);
  assert.equal(capture.reports.length, 2, "stopped observer must not keep collecting");
});
