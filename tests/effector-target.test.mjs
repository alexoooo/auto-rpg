import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { checkedEffectorTarget } from "../src/effector-target.ts";
import { cloneBodyCommand, copyBodyCommand, freshBodyCommand, intentToCommand, setChannelFlags } from "../src/body-command.ts";
import { freshGolemIntent } from "../src/golem/tactics.ts";
import { targetBench } from "./harness/effector-target-bench.mjs";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork } from "./harness/fork.mjs";
import { humanSetup } from "../src/golem/humanoid/presets.ts";

test("task targets copy all fields, normalize orientation and narrow finite motor requests", () => {
  const input = { position: new Vector3(1, 2, 3), orientation: new Quaternion(0, 0, 0, 2), speed: 4, force: -.2 };
  const checked = checkedEffectorTarget(input);
  assert.deepEqual(checked, { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, speed: 1, force: 0 });
  input.position.x = 9; input.orientation.w = 3;
  assert.equal(checked.position.x, 1); assert.equal(checked.orientation.w, 1);
  for (const field of ["speed", "force"]) {
    assert.throws(() => checkedEffectorTarget({ ...input, [field]: NaN }), /finite/);
  }
  assert.throws(() => checkedEffectorTarget({ ...input, position: { x: 0, y: Infinity, z: 0 } }), /finite/);
  assert.throws(() => checkedEffectorTarget({ ...input, orientation: { x: 0, y: 0, z: 0, w: 0 } }), /nonzero/);
});

test("task commands survive a deep copy and the legacy adapter clears them on both hands", () => {
  const source = freshBodyCommand();
  for (const [i, hand] of ["primary", "secondary"].entries()) source.effectors[hand].target = {
    position: new Vector3(i, 2, 3), orientation: new Quaternion(.1, .2, .3, .4), speed: .4, force: .6,
  };
  const copied = cloneBodyCommand(source);
  for (const [i, hand] of ["primary", "secondary"].entries()) {
    assert.deepEqual(copied.effectors[hand].target, {
      position: { x: i, y: 2, z: 3 }, orientation: { x: .1, y: .2, z: .3, w: .4 }, speed: .4, force: .6,
    });
    source.effectors[hand].target.position.x = 99;
    source.effectors[hand].target.orientation.y = 99;
    assert.equal(copied.effectors[hand].target.position.x, i);
    assert.equal(copied.effectors[hand].target.orientation.y, .2);
    source.effectors[hand].target = null;
  }
  assert.deepEqual(copyBodyCommand(source, copied), source);
  assert.deepEqual(intentToCommand(freshGolemIntent(), copied), freshBodyCommand());
});

test("world targets reach both anatomical business ends from a rotated socket with physical motors", async () => {
  for (const terminal of ["blade", "fist", "mace"]) for (const slot of ["primary", "secondary"]) {
    const result = await targetBench({ terminal, slot, yaw: .7 });
    assert.ok(result.channels.some(c => c.features.includes("target") && c.features.includes("speed") && c.features.includes("force")));
    assert.ok(result.tipError < .003, `${terminal} ${slot} actual tip ${result.tipError} m`);
    assert.ok(result.commandError < .001, `${slot} commanded tip ${result.commandError} m`);
    assert.ok(result.orientationError < .005, `${slot} orientation ${result.orientationError} rad`);
    assert.ok(result.withinStops);
    const control = await targetBench({ terminal, slot, yaw: .7, enabled: false });
    assert.ok(control.channels.every(c => !c.features.includes("target")));
    assert.ok(control.tipError > .05, "the uncommanded control must be outside the target tolerance");
  }
  const shield = await targetBench({ terminal: "plate", seconds: 0 });
  assert.ok(shield.channels.every(c => !c.features.includes("target")), "a forearm-mounted shield needs its own target mapping");
  const paired = await targetBench({ terminal: "maul", seconds: 0 });
  assert.ok(paired.channels.every(c => !c.features.includes("target")), "a paired grip needs a joint task envelope");
});

test("target speed narrows joint target rates and zero speed holds the commanded pose", async () => {
  const full = await targetBench();
  const slow = await targetBench({ speed: .25 });
  const stopped = await targetBench({ speed: 0 });
  assert.ok(full.peakRateFraction > .99);
  assert.ok(Math.abs(slow.peakRateFraction / full.peakRateFraction - .25) < 1e-10);
  assert.deepEqual(stopped.commanded, stopped.initial);
  assert.ok(slow.tipError < .003, "the slower arm still arrives");
});

test("target force lowers actual effort and never defeats the body's tone", async () => {
  const held = await targetBench();
  const loose = await targetBench({ force: 0 });
  const limp = await targetBench({ tone: 0 });
  assert.deepEqual(loose.commanded, held.commanded, "effort must not alter the target geometry");
  assert.ok(loose.tipError > .5 && held.tipError < .003, "the mass must actually fall without effort");
  assert.deepEqual(limp.positions, loose.positions, "full commanded effort cannot override zero body tone");
  const returned = await targetBench({ force: 0, speed: 0, returnToAim: true });
  assert.equal(returned.restoredDrive, 1, "a legacy command restores the original effort ceiling");
});

test("an unreachable task remains finite and inside every anatomical joint stop", async () => {
  const result = await targetBench({ impossible: true });
  assert.ok(result.tipError > 10, "the body cannot teleport to an unreachable target");
  assert.ok(result.withinStops);
  assert.ok(result.positions.flat().every(Number.isFinite));
  const [x, y, z] = result.commandedPalm, radius = Math.hypot(x, y, z), envelope = result.reachable;
  const swing = Math.atan2(x * result.outboard, z), lift = Math.asin(y / radius);
  assert.ok(radius >= envelope.reachMin - .002 && radius <= envelope.reachMax + .002, `radius ${radius}`);
  assert.ok(swing >= envelope.swingMin - .01 && swing <= envelope.swingMax + .01, `swing ${swing}`);
  assert.ok(lift >= envelope.liftMin - .01 && lift <= envelope.liftMax + .01, `lift ${lift}`);
});

test("task commands reach the whole body's modules, remain inert when disabled and survive an exact fork", async () => {
  async function run(enabled, writesTarget, forkIt = false) {
    const previous = setChannelFlags({ effector: enabled });
    const options = { left: "idle", right: "idle", leftGolem: humanSetup("blade", "whip"),
      seeds: [19, 31], separation: 12, locomotionMode: "supported", maxSeconds: 30 };
    const bout = createBout({ ...options, physics: await freshHavok() });
    try {
      bout.step();
      const command = freshBodyCommand();
      const p = bout.left.view.self.hands.primary.shoulder;
      if (writesTarget) command.effectors.primary.target = {
        position: { x: p.x + .3, y: p.y + .1, z: p.z + .6 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }, speed: .25, force: .4,
      };
      // A held command uses the production driver-to-module dispatch. The idle mind is never
      // asked to replace it during this direct hold; the rest of the world is a real published bout.
      const driver = bout.left.control.driver;
      driver.held = command; driver.heldIntent = null;
      bout.left.locomotion.beginControlStep();
      driver.hold(1 / 120);
      const state = () => bout.left.effectorModules[0].module.captureState().built.captureState();
      const reading = { speed: state().taskSpeed, force: state().taskForce, exact: state().exactTask };
      if (enabled && writesTarget) {
        assert.deepEqual(reading, { speed: .25, force: .4, exact: true });
        const declarations = bout.left.view.self.capabilities.channels;
        assert.ok(declarations.some(c => c.hand === "primary" && c.features.includes("target")));
        assert.ok(declarations.filter(c => c.hand === "secondary").every(c => !c.features.includes("target")),
          "a flexible lash is not a rigid endpoint");
      }
      if (forkIt) {
        const fork = await exactFork(options, captureBout(bout, { heap: true }));
        try {
          const restored = fork.left.effectorModules[0].module.captureState().built.captureState();
          assert.deepEqual({ speed: restored.taskSpeed, force: restored.taskForce, exact: restored.exactTask }, reading);
          assert.deepEqual(restored.forced.asArray(), state().forced.asArray());
          assert.deepEqual(restored.forcedOrientation.asArray(), state().forcedOrientation.asArray());
          assert.ok(state().taskTipOffset > .1, "fixture needs a carried endpoint away from the palm");
          assert.equal(restored.taskTipOffset, state().taskTipOffset);
          assert.deepEqual(fork.left.control.driver.held, driver.held);
        } finally { fork.dispose(); }
      }
      return reading;
    } finally { bout.dispose(); setChannelFlags(previous); }
  }
  assert.deepEqual(await run(false, true), await run(false, false));
  assert.notDeepEqual(await run(true, true, true), await run(false, false));
});
