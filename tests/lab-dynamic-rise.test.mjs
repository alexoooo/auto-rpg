import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { withinSupport } from "../src/core/control/support.ts";
import { riseCanPlace } from "../src/core/mind/rise/dynamic.ts";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

async function doubleFrontShove(script) {
  const spec = modelSpec("workshop-fighter");
  const stand = await coreStand(spec, { engine: "rapier-coordinate", groundSize: 40, posture: guardPosture(spec) });
  const mind = { ...LAB_PRESETS.script.config, subs: [{ kind: "dynamic-rise" }] };
  const stance = startStance(labActor(stand.built, stand.world, { mind }));
  try {
    stand.world.step(240);
    assert.equal(stance.body.down, false, "the Lab starts from a standing Warrior");
    stance.shove(60, 0);
    stand.world.step(24);
    stance.shove(60, 0);
    return await script(stance, stand.world);
  } finally { stance.dispose(); stand.dispose(); }
}

test("a new dynamic-rise stage measures its own progress after two Lab Front shoves", async () => {
  await doubleFrontShove((stance, world) => {
    const p = stance.body.state.mind.subs[0].policy;
    let transition = null;
    for (let step = 0; step < 240; step++) {
      const before = { phase: p.phase, stage: p.stage };
      world.step();
      if (before.phase === "acquire" && before.stage === 0 && p.phase === "acquire" && p.stage === 1) {
        transition = { phase: p.phase, stage: p.stage, time: p.time, retries: p.retries };
        assert.equal(p.retries, 0, "the physical fall advances without a stall retry");
        break;
      }
    }
    assert.deepEqual(transition, { phase: "acquire", stage: 1, time: 0, retries: 0 });
    const knee = () => stance.body.observe().joints.find(j => j.name === "knee.left flexion").angle;
    const from = knee();
    world.step(122);
    assert.deepEqual({ phase: p.phase, stage: p.stage, attempts: p.attempts, retries: p.retries },
      { phase: "acquire", stage: 1, attempts: 1, retries: 0 }, "the incoming pose keeps progressing past the outgoing error's stall deadline");
    assert.ok(knee() - from > .5, "the tuck moves the actual knee through the physics solver");
    assert.equal(stance.body.down, true);
    assert.deepEqual({ landed: p.landed, force: stance.body.assist.meter.force, moment: stance.body.assist.meter.moment },
      { landed: true, force: 0, moment: 0 });
  });
});

test("two Lab Front shoves reach supported hand-and-knee placement without repeating the fall", async () => {
  await doubleFrontShove((stance, world) => {
    const p = stance.body.state.mind.subs[0].policy, root = stance.body.built.segments.get("lowerTrunk");
    const model = { held: null, rest: root.rest.asArray() };
    const inverse = Quaternion.Inverse(root.rest), turn = new Quaternion(), up = new Vector3();
    const supports = ["hand.left", "hand.right", "shank.left", "shank.right"];
    let fellAt = null, inverted = false;
    for (let step = 0; step < 480; step++) {
      world.step();
      if (stance.body.down && fellAt === null) fellAt = world.time;
      const o = stance.body.observe(), loaded = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && Math.abs(c.normal[1]) >= .9);
      turn.copyFrom(root.node.rotationQuaternion).multiplyToRef(inverse, turn);
      up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up);
      if (up.y < 0 && supports.every(name => loaded.some(c => c.segment === name))
        && !loaded.some(c => /Trunk|head/.test(c.segment))) {
        inverted = true;
        assert.equal(riseCanPlace(o, model), false, "loaded hands and knees cannot start placement with an inverted pelvis");
      }
      if (p.phase === "place") break;
    }
    assert.notEqual(fellAt, null);
    assert.deepEqual({ phase: p.phase, attempts: p.attempts, retries: p.retries }, { phase: "place", attempts: 1, retries: 0 });
    assert.ok(world.time - fellAt <= 3, "hand-and-knee acquisition completes without another roll attempt");
    assert.equal(inverted, true, "the physical fall exercises the inverted tuck before acquisition");
    const o = stance.body.observe(), loaded = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && Math.abs(c.normal[1]) >= .9);
    assert.deepEqual(supports.map(name => loaded.some(c => c.segment === name)), [true, true, true, true]);
    assert.equal(loaded.some(c => /Trunk|head/.test(c.segment)), false);
    assert.ok(up.y > .15, "the pelvis is above its prone orientation");
    assert.equal(riseCanPlace(o, model), true);
    const parts = [...stance.body.built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
    const velocity = o.segments.reduce((v, segment) => v.map((value, k) => value
      + segment.velocity[k] * stance.body.built.segments.get(segment.name).rigid.mass / mass), [0, 0, 0]);
    const span = Math.sqrt(o.centre[1] / -world.physics.gravity[1]), x = o.centre[0] + velocity[0] * span, z = o.centre[2] + velocity[2] * span;
    const patches = loaded.filter(c => supports.includes(c.segment)).map(c => ({
      corners: c.pairs.length ? c.pairs.map(pair => new Vector3(...pair.point)) : [new Vector3(...c.point)],
    }));
    assert.deepEqual(withinSupport(patches, x, z, 0), [x, z], "the actual support contacts carry the capture point");
    assert.deepEqual({ force: stance.body.assist.meter.force, moment: stance.body.assist.meter.moment }, { force: 0, moment: 0 });
  });
});

test("dynamic rise stands and hands back control within six seconds after two Lab Front shoves", {
  todo: "the Warrior loses hand-and-knee support during foot placement and repeats recovery",
}, async () => {
  await doubleFrontShove((stance, world) => {
    const p = stance.body.state.mind.subs[0].policy;
    let fellAt = null;
    for (let step = 0; step < 840; step++) {
      world.step();
      if (stance.body.down && fellAt === null) fellAt = world.time;
      if (fellAt !== null && (p.completed > 0 || world.time - fellAt >= 6)) break;
    }
    assert.notEqual(fellAt, null, "both shoves produce an actual fall");
    assert.deepEqual({ completed: p.completed, phase: p.phase, down: stance.body.down },
      { completed: 1, phase: "complete", down: false }, "the quiet two-foot recovery gate completes before the deadline");
    assert.ok(p.finished - fellAt <= 6);
    for (let step = 0; step < 240; step++) {
      world.step();
      assert.equal(stance.body.down, false, "the resumed host keeps the Warrior standing");
    }
    const from = stance.body.observe().centre;
    stance.orders.forward = .3;
    for (let step = 0; step < 120; step++) {
      world.step();
      assert.equal(stance.body.down, false, "walking after recovery remains supported");
    }
    const to = stance.body.observe().centre;
    assert.ok((to[0] - from[0]) * (to[0] - from[0]) + (to[2] - from[2]) * (to[2] - from[2]) > .01);
  });
});
