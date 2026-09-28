import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { humanArmLimitCell } from "../research/human-arm-limits.mjs";
import { strokeProbe } from "./harness/impact-bench.mjs";
import { HUMAN_ARM_DRIVE } from "../src/golem/humanoid/arm.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

test("impact motor-tone control preserves the original stroke and separates force from rate", async () => {
  const original = await strokeProbe({ moduleId: "effector.anatomical.blade", massKg: 90 });
  const explicit = await strokeProbe({ moduleId: "effector.anatomical.blade", massKg: 90,
    tone: 1, attributes: { armSpeed: 1 } });
  assert.deepEqual(explicit, original);
  const weak = await humanArmLimitCell({ tone: 0.5 });
  // Halving the rate, not raising it: past the doubled `RATES` the torques bind, and x1.5 reads
  // 13.1 m/s against 13.7 (Session 2 step 4); x0.5 reads 11.2.
  const slow = await humanArmLimitCell({ armSpeed: 0.5 });
  assert.ok(weak.peakTipMps < original.peakTipMps * 0.85, "halving only force must affect the free stroke");
  assert.ok(slow.peakTipMps < original.peakTipMps * 0.9, "lowering only command rate must affect the free stroke");
  // Pins the second, contact pass too: dropping its tone does not alter pass one's peak.
  assert.ok(Math.abs(weak.momentumNs - 6.4641466344) < 0.02, "contact pass must use the same tone");
  // A cell whose hung sphere overlaps the fist: the placement moves with the stroke, so this is found, not chosen.
  const overlap = await humanArmLimitCell({ terminal: "fist", armSpeed: 0.5, tone: 2 });
  assert.equal(overlap.overlapped, true);
  assert.equal(overlap.momentumNs, null);
  assert.equal(overlap.energyJ, null);
});

test("arm-limit counterfactuals reject invalid inputs before building a world", async () => {
  for (const args of [{ terminal: "plate" }, { tone: -1 }, { tone: NaN }, { armSpeed: 2 },
    { velocityLimit: 0 }, { velocityLimit: Infinity }]) {
    await assert.rejects(humanArmLimitCell(args), /invalid human arm limit cell/);
  }
  await assert.rejects(strokeProbe({ moduleId: "effector.anatomical.blade", tone: Infinity }), /invalid stroke motor tone/);
});

test("servo-clamp counterfactual changes only the requested bound and restores shipped tuning", async () => {
  const before = { ...HUMAN_ARM_DRIVE };
  const low = await humanArmLimitCell({ velocityLimit: 4 });
  assert.deepEqual(HUMAN_ARM_DRIVE, before);
  const normal = await humanArmLimitCell();
  const high = await humanArmLimitCell({ velocityLimit: 16 });
  assert.ok(low.peakTipMps < normal.peakTipMps - 0.4, "lower clamp must affect the free pass");
  assert.ok(Math.abs(low.momentumNs - 7.0452346152) < 0.02, "contact pass must use the same clamp");
  const { velocityLimit: ignoredNormal, ...normalPhysics } = normal;
  const { velocityLimit: ignoredHigh, ...highPhysics } = high;
  assert.deepEqual(highPhysics, normalPhysics, "raising the bound must leave this sub-limit stroke alone");
  assert.deepEqual(HUMAN_ARM_DRIVE, before);
});
