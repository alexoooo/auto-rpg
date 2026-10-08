import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { supportEntry, supportEntryReading } from "../src/core/control/support-entry.ts";
import { createSupportEntryProbe } from "../src/core/tasks/support-entry.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const model = { channels: [{ name: "bend", min: -1, max: 1 }] };
const pose = { targets: { bend: .2 }, seconds: .2 };
const settings = { root: "root", reference: [0, 0, 0, 1], facing: .5, required: ["hand", "shin"], forbidden: ["head"],
  slow: .1, stillSeconds: .2, settleLimit: .4, holdLimit: .3, response: .1, speed: 1,
  roll: { back: [pose], left: [pose], right: [pose] }, prepare: [pose], targets: { bend: .1 } };
const observation = () => ({ segments: [{ name: "root", rotation: [Math.sqrt(.5), 0, 0, Math.sqrt(.5)], velocity: [0, 0, 0] }],
  contacts: ["hand", "shin"].map((segment) => ({ segment, fixed: 0, impulse: 1 })), joints: [{ angle: 0 }] });

test("support entry checks actual orientation/contact and retries without requiring support to begin", () => {
  const o = observation();
  assert.deepEqual(supportEntryReading(o, settings), { lie: "front", supported: true, still: true });
  for (const change of [
    (v) => v.contacts.pop(),
    (v) => v.contacts.push({ segment: "head", fixed: 0, impulse: 1 }),
    (v) => { v.contacts[0].impulse = 0; },
    (v) => { v.contacts[0].fixed = null; },
    (v) => { v.segments[0].rotation = [-Math.sqrt(.5), 0, 0, Math.sqrt(.5)]; },
  ]) { const changed = observation(); change(changed); assert.equal(supportEntryReading(changed, settings).supported, false); }
  const missing = observation(); missing.contacts = [];
  const policy = supportEntry(model, settings);
  assert.deepEqual(policy.step(missing, .1), { kind: "velocity", activation: [0], velocity: [1] });
  assert.deepEqual(policy.step(missing, .1), { kind: "velocity", activation: [1], velocity: [1] });
  assert.equal(policy.state.phase, "prepare");
  policy.step(missing, .1); policy.step(missing, .1); assert.equal(policy.state.phase, "hold");
  for (let i = 0; i < 3; i++) policy.step(missing, .1);
  assert.equal(policy.state.phase, "settle"); assert.equal(policy.state.attempts, 1);
  const back = observation(); back.segments[0].rotation[0] *= -1;
  policy.step(back, .1); policy.step(back, .1); assert.equal(policy.state.phase, "roll");
  const saved = saveState(policy.state);
  const branch = () => { const actions = []; for (let i = 0; i < 10; i++) actions.push(structuredClone(policy.step(o, .1))); return { actions, state: saveState(policy.state) }; };
  const expected = branch(); loadState(policy.state, saved); assert.deepEqual(branch(), expected);
  for (const change of [{ response: 0 }, { reference: [0, 0, 0, 0] }, { reference: [1, , , ] },
    { required: ["head"] }, { targets: { bend: 2 } }, { prepare: [] }]) assert.throws(() => supportEntry(model, { ...settings, ...change }), /invalid/);
  assert.throws(() => policy.step(o, 0), /invalid/);
});

test("a fallen Warrior acquires measured support through the independent policy and replays", {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async (t) => {
  const cells = [["rapier-coordinate", 1, true], ...[0, 1, 2, 3].map((direction) => ["rapier-coordinate-coulomb", direction, direction !== 1])];
  for (const [profile, direction, success] of cells) {
    const render = new NullEngine(), scene = new Scene(render);
    const probe = createSupportEntryProbe(scene, await freshEngine(profile), { model: "workshop-fighter", direction, hz: 120, actuation: "directional" });
    try {
      assert.ok(probe.world.steps > 120); assert.equal(probe.state.task.steps, 0); assert.equal(probe.state.task.fell, true);
      const state = { world: probe.world.state, ...probe.state };
      probe.world.step(240); const saved = { physics: probe.world.physics.save(), state: saveState(state) };
      const branch = () => {
        const hash = createHash("sha256");
        while (!probe.complete) { probe.world.step(); hash.update(JSON.stringify(probe.body.observe())); }
        return { observation: probe.observe(), state: saveState(state), digest: hash.digest("hex") };
      };
      const result = branch(), outcome = result.observation.task;
      assert.equal(outcome.success, success, JSON.stringify(outcome));
      assert.ok(outcome.peakSupportSteps > 1200); assert.equal(outcome.lostSupport, false);
      if (success) { assert.equal(outcome.continuedSteps, 1200); assert.ok(outcome.peakDrift < .02); }
      else { assert.equal(outcome.steps, 4800); assert.ok(outcome.peakDrift > .02); }
      assert.ok(outcome.peakEffortViolation < .0001);
      assert.equal(probe.body.assist.meter.force, 0); assert.equal(probe.body.assist.meter.moment, 0);
      probe.world.physics.load(saved.physics); loadState(state, saved.state); assert.deepEqual(branch(), result);
      t.diagnostic(JSON.stringify({ profile, direction, outcome, digest: result.digest }));
    } finally { probe.dispose(); scene.dispose(); render.dispose(); }
  }
});
