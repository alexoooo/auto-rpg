import test from "node:test";
import assert from "node:assert/strict";
import { toeSupport } from "./fixtures/toe-support.mjs";
import { saveStand, loadStand } from "./harness/core-stand.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { readFileSync } from "node:fs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

test("normal feedback and a toe load floor retain the actual kneel for five seconds", async () => {
  const baseline = await toeSupport({ stabilize: false });
  try {
    baseline.stand.step(12);
    assert.equal(baseline.load("foot.left"), 0, "the captured real posture exposes the unstabilized controller's toe loss");
  } finally { baseline.dispose(); }
  const f = await toeSupport();
  try {
    for (let step = 0; step < 600; step++) {
      f.stand.step(); const sample = f.sample();
      assert.ok(Object.values(sample.loads).every(load => load > 0), `step ${step}: ${JSON.stringify(sample)}`);
      assert.deepEqual(sample.bodyFloor, []);
      assert.ok(sample.effortExcess < 1e-4, `step ${step}: ${sample.effortExcess}`);
      assert.deepEqual(sample.assist, { force: 0, moment: 0 });
      assert.equal(f.body.mind.state.tracking.contact.status, "accepted");
    }
    assert.ok(f.sample().speed < .001);
  } finally { f.dispose(); }
});

test("the production native half-kneel from a standing host forks into a fresh world and hands over", async () => {
  const make = async () => {
    const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
      { engine: "rapier-coordinate", posture: guardPosture(spec), groundSize: 40 });
    const mind = { ...LAB_PRESETS.script.config, subs: [{ kind: "dynamic-rise" }] };
    const stance = startStance(labActor(stand.built, stand.world, { mind }));
    stand.world.step(240);
    return { stand, stance, dispose() { stance.dispose(); stand.dispose(); } };
  };
  const a = await make(), b = await make();
  try {
    a.stand.world.physics.load(new Uint8Array(readFileSync(new URL("fixtures/inactive-contact-world.bin", import.meta.url))));
    a.stand.world.step(240);
    const sub = a.stance.body.state.mind.subs[0];
    assert.deepEqual({ transfer: sub.policy.handTransfer.stage, half: sub.halfKneel.active, lunge: sub.lunge.phase },
      { transfer: "inactive", half: false, lunge: "raise" }, "the checkpoint is inside the physical native bearing path");
    const saved = saveStand(a.stand.world, { body: a.stance.body.state });
    const finish = ({ stand, stance }) => {
      const trace = []; let completed = null;
      const p = stance.body.state.mind.subs[0].policy;
      for (let step = 0; step < 1200; step++) {
        stand.world.step(); const o = stance.body.observe(); trace.push(o);
        for (const j of o.joints) assert.ok(j.effort <= j.positive + 1e-4 && -j.effort <= j.negative + 1e-4, j.name);
        assert.deepEqual({ force: stance.body.assist.meter.force, moment: stance.body.assist.meter.moment }, { force: 0, moment: 0 });
        assert.equal(o.contacts.some(c => c.fixed !== null && c.impulse > 0 && /Trunk|head/.test(c.segment)), false);
        if (p.completed && completed === null) {
          completed = stand.world.time;
          assert.ok(p.ready >= .5); assert.equal(p.retries, 0);
          const load = name => o.contacts.filter(c => c.fixed !== null && c.segment === name)
            .reduce((n, c) => n + c.impulse / stand.world.dt, 0);
          assert.ok(load("foot.left") > 50 && load("foot.right") > 50);
        }
        if (completed !== null) {
          assert.equal(o.down, false, "the resumed standing host stays upright");
          if (stand.world.time - completed >= 2) break;
        }
      }
      assert.notEqual(completed, null);
      assert.equal(stance.body.has, "command");
      return { trace, completed, state: saveStand(stand.world, { body: stance.body.state }).state };
    };
    const expected = finish(a);
    loadStand(b.stand.world, { body: b.stance.body.state }, saved);
    assert.deepEqual(finish(b), expected);
    const o = expected.trace.at(-1), load = name => o.contacts.filter(c => c.segment === name && c.fixed !== null)
      .reduce((sum, c) => sum + c.impulse / a.stand.world.dt, 0);
    assert.deepEqual([load("hand.left"), load("hand.right"), load("shank.left")], [0, 0, 0]);
    assert.equal(o.contacts.some(c => /Trunk|head/.test(c.segment) && c.fixed !== null && c.impulse > 0), false);
    const parts = [...a.stand.built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
    const speed = o.segments.reduce((sum, part) => sum.addInPlace(new Vector3(...part.velocity)
      .scale(a.stand.built.segments.get(part.name).rigid.mass / mass)), new Vector3()).length();
    const root = a.stand.built.segments.get("lowerTrunk"), up = Vector3.UpReadOnly.applyRotationQuaternionToRef(
      root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)), new Vector3()).y;
    assert.ok(up > .9 && speed < .2, JSON.stringify({ up, speed }));
    assert.deepEqual({ completed: sub.policy.completed, phase: sub.policy.phase, down: a.stance.body.down },
      { completed: 1, phase: "complete", down: false });
  } finally { a.dispose(); b.dispose(); }
});

test("tapering hand pressure transfers the actual kneel onto both boots and replays", async () => {
  const f = await toeSupport({ transfer: true });
  try {
    f.stand.step(600);
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const branch = () => {
      const observations = [];
      for (let step = 0; step < 120; step++) { f.stand.step(); observations.push(f.observe()); }
      return { sample: f.sample(), observations, state: saveStand(f.stand.world, states).state };
    };
    const expected = branch(); loadStand(f.stand.world, states, saved); assert.deepEqual(branch(), expected);
    const { loads, bodyFloor, up, speed, effortExcess, assist } = expected.sample;
    assert.equal(f.body.mind.state.finished, true);
    assert.equal(f.body.mind.state.phase, "lift");
    assert.deepEqual([loads["hand.left"], loads["hand.right"], loads["shank.left"]], [0, 0, 0]);
    assert.ok(loads["foot.left"] > 50 && loads["foot.right"] > 50, JSON.stringify(loads));
    assert.deepEqual(bodyFloor, []);
    assert.ok(up > .75 && speed < .05, JSON.stringify({ up, speed }));
    assert.ok(effortExcess < 1e-4);
    assert.deepEqual(assist, { force: 0, moment: 0 });
  } finally { f.dispose(); }
});
