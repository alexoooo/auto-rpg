import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { wristTargetBench } from "./harness/wrist-target-bench.mjs";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork } from "./harness/fork.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

test("stone and skeleton wrists return three rigid business ends to a reachable world target", async () => {
  for (const family of ["stone", "skeleton"]) for (const terminal of ["blade", "fist", "mace"]) {
    for (const slot of ["primary", "secondary"]) {
      const result = await wristTargetBench({ family, terminal, slot });
      assert.ok(result.channels.some(c => ["target", "speed", "force"].every(f => c.features.includes(f))));
      assert.ok(result.legacyStray < .005, `${family} ${terminal} ${slot}: fixture must reach its own legacy pose`);
      assert.ok(result.tipError < .005, `${family} ${terminal} ${slot}: actual tip ${result.tipError} m`);
      assert.ok(result.orientationError < .01, `${family} ${terminal} ${slot}: orientation ${result.orientationError} rad`);
      assert.ok(result.withinStops);
    }
  }
  for (const family of ["stone", "skeleton"]) {
    const control = await wristTargetBench({ family, enabled: false });
    assert.ok(control.channels.every(c => !c.features.includes("target")));
    assert.ok(control.tipError > .05, "without the channel the idle command does not find the target");
  }
});

test("wrist task speed and force narrow real motors and a legacy aim restores full drive", async () => {
  const full = await wristTargetBench();
  const stopped = await wristTargetBench({ speed: 0 });
  const loose = await wristTargetBench({ force: 0, returnToAim: true });
  const toneless = await wristTargetBench({ tone: 0 });
  const tonelessControl = await wristTargetBench({ tone: 0, enabled: false });
  assert.deepEqual(stopped.commanded, stopped.initial, "zero speed holds all five commanded axes");
  assert.ok(stopped.tipError > .05);
  assert.deepEqual(loose.commanded, full.commanded, "effort cannot change the target geometry");
  assert.ok(loose.tipError > .5 && full.tipError < .005);
  assert.deepEqual(toneless.positions, tonelessControl.positions,
    "a full task force cannot move a body with zero motor tone from the same passive start");
  assert.deepEqual(loose.taskDrive, { speed: 1, force: 0 });
  assert.deepEqual(loose.restoredDrive, { speed: 1, force: 1 });
});

test("unreachable wrist requests remain finite within the published stops", async () => {
  for (const family of ["stone", "skeleton"]) {
    const result = await wristTargetBench({ family, impossible: true });
    assert.ok(result.tipError > 10);
    assert.ok(result.withinStops);
    assert.ok(result.commanded.every(Number.isFinite));
    assert.ok(result.positions.flat().every(Number.isFinite));
  }
});

test("world wrist targets survive the production dispatch and an exact fork", async () => {
  for (const setup of [defaultGolemSetup(), skeletonSetup()]) {
    const flags = setChannelFlags({ effector: true });
    const options = { left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
      seeds: [19, 31], separation: 12, locomotionMode: "supported", maxSeconds: 3 };
    const bout = createBout({ ...options, physics: await freshHavok() });
    try {
      bout.step();
      const shoulder = bout.left.view.self.hands.primary.shoulder;
      const command = freshBodyCommand();
      command.effectors.primary.target = { position: { x: shoulder.x + .3, y: shoulder.y + .1, z: shoulder.z + .5 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }, speed: .25, force: .4 };
      const driver = bout.left.control.driver;
      driver.held = command; driver.heldIntent = null;
      bout.left.locomotion.beginControlStep();
      driver.hold(1 / 120);
      const state = bout.left.effectorModules[0].module.captureState().built.captureState();
      assert.deepEqual(state.taskTarget, command.effectors.primary.target);
      assert.deepEqual({ speed: state.taskSpeed, force: state.taskForce }, { speed: .25, force: .4 });
      assert.ok(bout.left.view.self.capabilities.channels.some(c => c.hand === "primary" && c.features.includes("target")));
      const fork = await exactFork(options, captureBout(bout, { heap: true }));
      try {
        const restored = fork.left.effectorModules[0].module.captureState().built.captureState();
        assert.deepEqual(restored.taskTarget, state.taskTarget);
        assert.equal(restored.taskTipOffset, state.taskTipOffset);
        assert.equal(restored.taskSpeed, state.taskSpeed);
        assert.equal(restored.taskForce, state.taskForce);
        assert.deepEqual(fork.left.control.driver.held, driver.held);
      } finally { fork.dispose(); }
    } finally { bout.dispose(); setChannelFlags(flags); }
  }
});
