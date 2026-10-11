import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { uprightKneel } from "./fixtures/upright-kneel.mjs";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { embody } from "../src/core/mind/mind.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";

test("a supported rise refuses missing support and a pose entry without changing the world or its state", async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", posture: guardPosture(spec) });
  let body;
  try {
    const view = { down: false, stance: { centre: new Vector3(), velocity: new Vector3() } };
    body = embody(stand.built, stand.world, own => {
      const bearing = stagedRise(own, view, { ...RISE, rise: [RISE.rise.find(stage => stage.name === "fours")] });
      const pose = stagedRise(own, view);
      return { name: "support entry guard", state: { bearing: bearing.state, pose: pose.state }, step() {}, bearing, pose };
    });
    const states = { body: body.state }, before = saveStand(stand.world, states);
    assert.throws(() => body.mind.bearing.beginSupported(), /requires its actual supports and trunk clearance/);
    assert.deepEqual(saveStand(stand.world, states), before);
    assert.throws(() => body.mind.pose.beginSupported(), /begins with a bearing stage/);
    assert.deepEqual(saveStand(stand.world, states), before);
    body.mind.pose.begin();
    assert.deepEqual({ phase: body.mind.pose.state.phase, tries: body.mind.pose.state.tries, furthest: body.mind.pose.state.furthest },
      { phase: "settle", tries: 0, furthest: -1 });
    assert.deepEqual(stand.world.physics.save(), before.physics);
  } finally { body?.dispose(); stand.dispose(); }
});

test("a fresh two-shove Lab fall reaches and retains an upright knee support with exact continuation", async () => {
  const f = await uprightKneel();
  try {
    const bounded = sample => {
      assert.deepEqual(sample.bodyFloor, []);
      assert.ok(sample.effortExcess < 1e-4, JSON.stringify(sample));
      assert.deepEqual(sample.assist, { force: 0, moment: 0 });
    };
    for (let step = 0; step < 960 && f.body.mind.state.phase !== "handoff"; step++) { f.stand.step(); bounded(f.sample()); }
    assert.equal(f.body.mind.state.phase, "handoff", "the actual fall reaches the supported handoff");
    assert.ok(f.body.mind.state.captured.up > .9);
    assert.deepEqual({ tries: f.body.mind.state.bearing.tries, furthest: f.body.mind.state.bearing.furthest }, { tries: 1, furthest: 0 });
    for (let step = 0; step < 360; step++) { f.stand.step(); bounded(f.sample()); }
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const branch = () => {
      const observations = [], samples = [];
      for (let step = 0; step < 360; step++) {
        f.stand.step(); const sample = f.sample(); bounded(sample);
        assert.ok(sample.up > .9, JSON.stringify(sample));
        assert.deepEqual([sample.loads["hand.left"], sample.loads["hand.right"]], [0, 0]);
        assert.ok(sample.loads["shank.left"] > 100 && sample.loads["shank.right"] > 100, JSON.stringify(sample));
        assert.ok(sample.loads["foot.left"] > 1 && sample.loads["foot.right"] > 1, JSON.stringify(sample));
        assert.equal(sample.down, true, "knee support is an intermediate recovery state");
        observations.push(f.observe()); samples.push(sample);
      }
      assert.equal(f.body.mind.state.rejected, 0);
      return { observations, samples, state: saveStand(f.stand.world, states).state };
    };
    const expected = branch(); loadStand(f.stand.world, states, saved); assert.deepEqual(branch(), expected);
  } finally { f.dispose(); }
});
