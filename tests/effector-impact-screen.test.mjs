import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { impactScreenPlans, impactScreenCell } from "../research/effector-impact-screen.mjs";
import { CHANNEL_FLAGS } from "../src/body-command.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

test("forced-plan screen compares the same warmed state and observes changed physical contacts", async () => {
  const plans = impactScreenPlans();
  const flags = { ...CHANNEL_FLAGS };
  const control = await impactScreenCell({ terminal: "blade", plan: plans.find(p => p.label === "cut-mid") });
  const altered = await impactScreenCell({ terminal: "blade",
    plan: plans.find(p => p.label === "sweep/t0.3/y0.35/r0.95") });
  assert.equal(control.start.pose, altered.start.pose);
  assert.deepEqual(control.targetHands, []);
  assert.deepEqual(altered.targetHands, ["primary"]);
  // The control is the duelist's own cut. Since the arm's rates doubled (Session 2 step 4) it lands,
  // where it touched nothing before: 36.4 J at edge alignment 0.45, a slap of 0.038 damage. The forced
  // sweep lands a single glancing contact of 2.15 J at 0.15 (Node bout runner, 2026-09-28). With
  // every joint free (before joint give, Session 2 step 5) the same two contacts read 31.2 J, weak,
  // and 0.572 J. Before the arm, the sweep read
  // 0.946 J, five weak contacts, on the Warrior at a typical adult's size and de Leva's masses; on the
  // 1.88 m, 107 kg Warrior 10.15 J with the arrival read whole and 3.183 J billed at 0.56 of its
  // speed; sweep/t0.3/y-0.35/r0.95 read 3.0 to 3.6 J on the legacy human.
  assert.ok(control.maxBodyEnergyJ > 34 && control.maxBodyEnergyJ < 39, "the duelist's own cut lands");
  assert.ok(altered.maxBodyEnergyJ > 2.0 && altered.maxBodyEnergyJ < 2.3,
    "the changed trajectory must reach a body with the measured energy");
  assert.ok(altered.bodyContacts > 0);
  assert.equal(altered.strongestBodyContact.energyJ, altered.maxBodyEnergyJ,
    "the report explaining the peak comes from the body contact, not a block");
  assert.ok(Number.isFinite(altered.strongestBodyContact.edgeAlignment));
  assert.deepEqual(CHANNEL_FLAGS, flags);
});

test("impact screen names every planned timing, aim and extension cell once", async () => {
  const plans = impactScreenPlans();
  assert.equal(plans.length, 38);
  assert.equal(new Set(plans.map(p => p.label)).size, plans.length);
  assert.deepEqual(plans.slice(0, 2).map(p => p.label), ["duelist", "cut-mid"]);
  for (const plan of plans.slice(2)) {
    assert.equal(plan.segs.length, 1);
    const seg = plan.segs[0];
    assert.equal(seg.kind, "target");
    assert.ok([.15, .3, .6].includes(seg.duration));
    assert.ok([-.35, 0, .35].includes(seg.lift));
    assert.ok([.75, .95].includes(seg.extend));
    assert.equal(seg.force, 1);
    assert.equal(seg.speed, 1);
  }
  await assert.rejects(impactScreenCell({ terminal: "plate", plan: plans[0] }), /invalid impact screen cell/);
});
