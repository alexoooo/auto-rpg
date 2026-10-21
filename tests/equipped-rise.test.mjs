/**
 * **An equipped fall's floor** (`research/rising-trial.mjs`; Node stand, core World, Rapier, 120 Hz,
 * Balance 0): a Warrior with sword and buckler, shoved down as the equipped falls shove it, is taken
 * over by the game's Stand up, which tries to rise, unassisted, and the trial ends in a verdict.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { risingTrial } from "../research/rising-trial.mjs";

test("a shoved Warrior with sword and buckler is taken over by Stand up, which tries to rise unassisted", async () => {
  const row = await risingTrial({ id: 0, model: "workshop-fighter", loadout: { left: "buckler", right: "sword" }, seed: 1, start: "shoved", degrees: 22.5,
    balance: 0, grit: 0, gusts: false, target: false, equipped: true, sub: "stand-up", cap: 6 });
  assert.notEqual(row.takeover, null, `the fixture never fell to be taken over: ${row.status}`);
  assert.ok(["stood", "failed", "fell after verification"].includes(row.status), `no verdict: ${row.status}`);
  assert.ok(row.attempts.some((attempt) => attempt.technique === "step-up"), `Stand up never tried to step up: ${JSON.stringify(row.attempts)}`);
  assert.deepEqual(row.assist, { forcePeak: 0, momentPeak: 0, forceImpulse: 0, momentImpulse: 0 });
});
