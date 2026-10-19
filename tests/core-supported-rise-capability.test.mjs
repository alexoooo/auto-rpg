/**
 * **How far a supported rise goes** (`stagedRise`'s supported handoff, `src/core/mind/rise/staged.ts`),
 * measured on the Node core stand, the coordinate engine, 120 Hz, and not a gate
 * (`tests/experimental.json`): from all fours (`FOURS`) the rise reaches an upright knee support and
 * holds it, its hands free, and from a placed kneel its curled rear boot comes down and bears within
 * two seconds. What any handoff holds is `core-supported-rise.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { uprightKneel } from "./fixtures/upright-kneel.mjs";
import { kneeling } from "./fixtures/kneeling.mjs";
import { saveStand, loadStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { embody } from "../src/core/mind/mind.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { centreOfToRef, footStatesOf } from "../src/core/control/support.ts";
import { uprightness } from "../src/core/control/ground.ts";

test("from all fours the rise reaches and retains an upright knee support with exact continuation", async () => {
  const f = await uprightKneel();
  try {
    const bounded = sample => {
      assert.deepEqual(sample.bodyFloor, []);
      assert.ok(sample.effortExcess < 1e-4, JSON.stringify(sample));
      assert.deepEqual(sample.assist, { force: 0, moment: 0 });
    };
    for (let step = 0; step < 960 && f.body.mind.state.phase !== "handoff"; step++) { f.stand.step(); bounded(f.sample()); }
    assert.equal(f.body.mind.state.phase, "handoff", "the rise reaches the supported handoff");
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

test("a supported handoff from a placed kneel brings its curled rear sole down to bear and enters its recipe's next stage", async () => {
  const stand = await kneeling(modelSpec("workshop-fighter"), { curled: true });
  let body;
  try {
    const parts = [...stand.built.segments.values()], mass = parts.reduce((sum, p) => sum + p.rigid.mass, 0),
      centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), upright = uprightness(stand.built);
    const read = () => {
      centre.setAll(0); velocity.setAll(0);
      for (const p of parts) {
        centre.addInPlace(centreOfToRef(p, work).scaleInPlace(p.rigid.mass / mass));
        velocity.addInPlace(p.body.linearVelocityToRef(work).scaleInPlace(p.rigid.mass / mass));
      }
    };
    const recipe = { ...RISE, rise: [{ kind: "bear", name: "supported sole acquisition",
      on: [{ limb: "shin.left", share: .5 }, { limb: "shin.right", share: .5 }], leave: [], overProp: false,
      height: null, pitch: null, posture: RISE.rise.find(s => s.name === "tall").posture, seconds: .4, limit: 8 }] };
    recipe.rise.push({ ...recipe.rise[0], name: "supported recipe posture" });
    body = embody(stand.built, stand.world, own => {
      const rise = stagedRise(own, { get down() { return upright.down(); }, stance: { centre, velocity } }, recipe);
      return { name: "captured supported handoff", state: rise.state, rise, step(senses, dt) { read(); rise.step(senses, dt); } };
    });
    const load = name => stand.world.physics.contactsOf(stand.built.segments.get(name).body, other => other === null)
      .reduce((sum, c) => sum + c.impulse / stand.world.dt, 0);
    const muscles = body.own.muscles, captured = Object.fromEntries(muscles.channels.map((c, i) => [c.name,
      Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, muscles.angle(i))) + c.dof.spec.bind.value]));
    body.mind.rise.beginSupported(captured);
    for (let step = 0; step < 240 && body.mind.state.stage !== 1; step++) stand.step();
    assert.deepEqual({ phase: body.mind.state.phase, stage: body.mind.state.stage }, { phase: "rise", stage: 1 },
      "the actual loaded handoff finishes the supported acquisition and enters its recipe's next stage");
    assert.ok(load("foot.right") > 20 && load("shank.left") > 20 && load("shank.right") > 20,
      `its rear boot bears ${load("foot.right")} N, its shanks ${load("shank.left")} and ${load("shank.right")}`);
    const foot = footStatesOf(stand.built).find(f => f.side === "right"),
      heights = foot.ahead.slice(0, 2).map(i => foot.sole[i].applyRotationQuaternionToRef(foot.segment.node.rotationQuaternion, new Vector3())
        .addInPlace(foot.segment.node.position).y);
    assert.ok(Math.min(...heights) < .005, `the actual front sole corner reaches the floor: ${heights}`);
  } finally { body?.dispose(); stand.dispose(); }
});
