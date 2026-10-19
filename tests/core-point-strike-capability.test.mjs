/**
 * **How the point strike lands** (`createPointStrikeProbe`, `src/core/tasks/point-strike.ts`; Node,
 * core world, Rapier, 120 Hz, no assist): standing, at sensed swinging targets and under
 * combined-centre control, on the Warrior, the Rogue and the skeleton, empty-handed and with
 * clubs: every strike hits or misses as placed and returns, and the body stands.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createPointStrikeProbe } from "../src/core/tasks/point-strike.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "./harness/core-stand.mjs";

async function fixture(config) {
  const render = new NullEngine(), scene = new Scene(render);
  const task = createPointStrikeProbe(scene, await freshEngine(), { hz: 120, actuation: "directional", offset: 0, held: "empty", miss: false, ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); render.dispose(); } };
}

test("standing point strikes hit with either hand or independent items and return on all three bodies", async () => {
  for (const held of ["empty", "club"]) for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const hands of ["left", "right", "both"]) {
    const f = await fixture({ model, hands, held });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      const { task: result } = f.task.observe();
      assert.ok(f.task.complete, `${model}/${hands}: ${JSON.stringify(result)}`);
      assert.equal(result.fell, false); assert.equal(result.rejectedSteps, 0);
      for (const strike of result.strikes) {
        assert.ok(strike.contacts > 0 && strike.peakImpulse > 0 && strike.closing > 0.05);
        assert.ok(strike.returnError < 0.02);
      }
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});


test("a missed strike completes and returns standing, empty-handed and with clubs", async () => {
  for (const held of ["empty", "club"]) {
    const f = await fixture({ model: "workshop-fighter", hands: "both", held, miss: true });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      const result = f.task.observe().task;
      assert.ok(f.task.complete, JSON.stringify(result)); assert.equal(result.fell, false);
      assert.ok(result.strikes.every((s) => s.contacts === 0 && s.returnError < 0.02), JSON.stringify(result.strikes));
    } finally { f.dispose(); }
  }
});

test("sensed swinging targets are struck and the body returns with either hand or independent items", async () => {
  for (const held of ["empty", "club"]) for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const hands of ["left", "right", "both"]) {
    const f = await fixture({ model, hands, held, swing: { angle: 0, speed: 0.7, delay: 3, tracking: true, braking: true } });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      const result = f.task.observe().task;
      assert.ok(f.task.complete && !result.fell && result.rejectedSteps === 0, `${model}/${hands}/${held}: ${JSON.stringify(result)}`);
      for (const row of result.strikes) {
        assert.ok(row.contacts > 0 && row.closing > 0.05 && row.peakImpulse > 0);
        assert.ok(row.targetTravel > 0.15 && row.targetSpeed > 0.6, "target motion is measured before any contact");
        assert.ok(row.returnError < 0.02);
      }
      assert.ok(f.task.body.state.mind.policy.impacts.every((p) => p !== null));
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});


test("moving targets with delayed senses and impact replanning complete with the skeleton standing", async () => {
  for (const centreControl of [false, true]) {
    const f = await fixture({ model: "crypt-skeleton", hands: "both", held: "club", centreControl, swing: { angle: 0.1, speed: 0.7, delay: 3, tracking: true, braking: true } });
    try {
      while (!f.task.complete && f.task.world.time < 8) f.task.world.step();
      assert.ok(f.task.complete && !f.task.observe().task.fell, JSON.stringify(f.task.observe().task));
    } finally { f.dispose(); }
  }
});

test("combined-centre control sustains two-hand strikes and misses for ten seconds after return", async () => {
  const fraction = 2654435761 / 4294967296;
  for (const moving of [false, true]) for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const miss of [false, true]) {
    const f = await fixture({ model, hands: "both", held: "empty", miss, centreControl: true, continueSeconds: 10,
      offset: (fraction * 2 - 1) * 0.002,
      ...(moving ? { swing: { angle: (fraction * 2 - 1) * 0.12, speed: 0.7, delay: 3, tracking: true, braking: true } } : {}) });
    try {
      while (!f.task.complete && f.task.world.time < 17) f.task.world.step();
      const result = f.task.observe().task;
      assert.ok(f.task.complete && !result.fell && result.rejectedSteps === 0, `${model}/${miss}: ${JSON.stringify(result)}`);
      assert.ok(result.steps - result.completeAt >= 1200);
      assert.ok(result.strikes.every((s) => s.returnError < 0.02));
      assert.ok(result.strikes.every((s) => miss ? s.contacts === 0 : s.contacts > 0));
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});
