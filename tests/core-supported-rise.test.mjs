import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { readFileSync } from "node:fs";
import { uprightKneel } from "./fixtures/upright-kneel.mjs";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { embody } from "../src/core/mind/mind.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { centreOfToRef, footStatesOf } from "../src/core/control/support.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";

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

test("a fresh two-shove Lab fall reaches and retains an upright knee support with exact continuation", {
  todo: "the snapshot `actual-fours-world.bin` was saved on legs the body no longer has, and loading it restores their foot friction (0.5, averaged) over the body's (0.8, the larger), and the supported bearing reaches the handoff at 0.37 m/s, faster than the tracker's hold catches",
}, async () => {
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

test("a supported handoff preserves a captured legal posture while an actual rear sole acquires load", {
  todo: "the snapshot `actual-rear-sole-world.bin` was saved on legs the body no longer has, and loading it restores their foot friction (0.5, averaged) over the body's (0.8, the larger), and on today's legs its rear boot bears from the first step",
}, async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", groundSize: 40, posture: guardPosture(spec) });
  let body;
  try {
    stand.step(240);
    stand.world.physics.load(new Uint8Array(readFileSync(new URL("./fixtures/actual-rear-sole-world.bin", import.meta.url))));
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
    const observe = observeBody(stand.built, body.own.muscles, stand.world, clockSenses(stand.world), undefined, () => upright.down(), true);
    const load = name => observe().contacts.filter(c => c.segment === name && c.fixed !== null)
      .reduce((sum, c) => sum + c.impulse / stand.world.dt, 0);
    assert.equal(load("foot.right"), 0, "the ordinary ankle curl leaves the actual rear boot airborne");
    assert.ok(load("shank.left") > 100 && load("shank.right") > 100);
    const muscles = body.own.muscles, captured = Object.fromEntries(muscles.channels.map((c, i) => [c.name,
      Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, muscles.angle(i))) + c.dof.spec.bind.value]));
    const states = { body: body.state }, initial = saveStand(stand.world, states);
    for (const invalid of [{}, { ...captured, "ankle.right dorsiflexion": NaN },
      { ...captured, "ankle.right dorsiflexion": muscles.channels[muscles.channel("ankle.right dorsiflexion")].dof.spec.max.value + .2 }]) {
      assert.throws(() => body.mind.rise.beginSupported(invalid), /within every actual joint range/);
      assert.deepEqual(saveStand(stand.world, states), initial);
    }
    body.mind.rise.beginSupported(); stand.step();
    const defaultReading = { observation: observe(), saved: saveStand(stand.world, states) };
    loadStand(stand.world, states, initial);
    body.mind.rise.beginSupported(captured);
    assert.deepEqual(body.mind.state.supportedPosture, captured);
    const expectedPosture = { ...captured }; captured["ankle.right dorsiflexion"] = 0;
    assert.deepEqual(body.mind.state.supportedPosture, expectedPosture, "the handoff detaches its caller's angles");
    const checkpoint = saveStand(stand.world, states);
    const branch = () => {
      const observations = [];
      for (let step = 0; step < 240 && body.mind.state.stage !== 1; step++) {
        stand.step(); const o = observe(); observations.push(o);
        assert.deepEqual(o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && /Trunk|head/.test(c.segment)), []);
        assert.deepEqual({ force: body.own.assist.meter.force, moment: body.own.assist.meter.moment }, { force: 0, moment: 0 });
        for (const j of o.joints) assert.ok(j.effort <= j.positive + 1e-4 && -j.effort <= j.negative + 1e-4, j.name);
      }
      assert.deepEqual({ phase: body.mind.state.phase, stage: body.mind.state.stage }, { phase: "rise", stage: 1 },
        "the actual loaded handoff finishes the supported acquisition and enters its recipe's next stage");
      assert.ok(load("foot.right") > 20 && load("shank.left") > 20 && load("shank.right") > 20);
      const foot = footStatesOf(stand.built).find(f => f.side === "right"),
        heights = foot.ahead.slice(0, 2).map(i => foot.sole[i].applyRotationQuaternionToRef(foot.segment.node.rotationQuaternion, new Vector3())
          .addInPlace(foot.segment.node.position).y);
      assert.ok(Math.min(...heights) < .005, `the actual front sole corner reaches the floor: ${heights}`);
      return { observations, saved: saveStand(stand.world, states) };
    };
    const expected = branch();
    loadStand(stand.world, states, initial); body.mind.rise.beginSupported(); stand.step();
    assert.deepEqual({ observation: observe(), saved: saveStand(stand.world, states) }, defaultReading,
      "captured goals cannot overwrite the recipe's goals");
    loadStand(stand.world, states, checkpoint); assert.deepEqual(branch(), expected);
    const laterStage = saveStand(stand.world, states); loadStand(stand.world, states, laterStage); stand.step();
    const retainedLater = { observation: observe(), physics: stand.world.physics.save() };
    loadStand(stand.world, states, laterStage); body.mind.state.supportedPosture = null; stand.step();
    assert.deepEqual({ observation: observe(), physics: stand.world.physics.save() }, retainedLater,
      "the completed handoff's captured angles do not replace the later stage's recipe goals");
  } finally { body?.dispose(); stand.dispose(); }
});

test("a supported hold drives its free wrist past bearing readiness, expires and forks exactly", {
  todo: "the snapshot `actual-rear-sole-world.bin` was saved on legs the body no longer has, and loading it restores their foot friction (0.5, averaged) over the body's (0.8, the larger), and on today's legs its right shank leaves the ground for 0.7 s",
}, async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", groundSize: 40, posture: guardPosture(spec) });
  let body;
  try {
    stand.step(240);
    stand.world.physics.load(new Uint8Array(readFileSync(new URL("fixtures/actual-rear-sole-world.bin", import.meta.url))));
    const parts = [...stand.built.segments.values()], mass = parts.reduce((sum, p) => sum + p.rigid.mass, 0),
      centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), upright = uprightness(stand.built);
    const read = () => {
      centre.setAll(0); velocity.setAll(0);
      for (const p of parts) {
        centre.addInPlace(centreOfToRef(p, work).scaleInPlace(p.rigid.mass / mass));
        velocity.addInPlace(p.body.linearVelocityToRef(work).scaleInPlace(p.rigid.mass / mass));
      }
    };
    const stage = { kind: "bear", name: "retained support with a free wrist",
      on: [{ limb: "shin.left", share: .5 }, { limb: "shin.right", share: .5 }], leave: [], overProp: false,
      height: null, pitch: null, posture: "reference", seconds: .4, limit: 4 };
    body = embody(stand.built, stand.world, own => {
      const view = { get down() { return upright.down(); }, stance: { centre, velocity } },
        slow = stagedRise(own, view, { ...RISE, rise: [stage] }),
        fast = stagedRise(own, view, { ...RISE, rise: [{ ...stage, postureSeconds: .12 }] }),
        state = { choice: "slow", slow: slow.state, fast: fast.state };
      for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() =>
        stagedRise(own, view, { ...RISE, rise: [{ ...stage, postureSeconds: invalid }] }), /drives its posture within/);
      return { name: "retained physical support", state, slow, fast,
        step(senses, dt) { read(); (state.choice === "slow" ? slow : fast).step(senses, dt); } };
    });
    const muscles = body.own.muscles, name = "wrist.left pronation", index = muscles.channel(name), channel = muscles.channels[index],
      from = muscles.angle(index), to = from + .4 < channel.dof.spec.max.value ? from + .4 : from - .4,
      captured = Object.fromEntries(muscles.channels.map((c, i) => [c.name,
        Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, muscles.angle(i))) + c.dof.spec.bind.value]));
    captured[name] = to + channel.dof.spec.bind.value;
    const states = { body: body.state }, initial = saveStand(stand.world, states);
    for (const hold of ["yes", 1, null]) {
      assert.throws(() => body.mind.fast.beginSupported(captured, { hold }), /boolean choice/);
      assert.deepEqual(saveStand(stand.world, states), initial, "an invalid hold leaves the physical stand and both controllers untouched");
    }
    body.mind.slow.beginSupported(captured, { hold: true }); stand.step(36);
    const slowError = Math.abs(to - muscles.angle(index));
    loadStand(stand.world, states, initial); body.mind.state.choice = "fast";
    body.mind.fast.beginSupported(captured, { hold: true }); stand.step(36);
    assert.ok(Math.abs(to - muscles.angle(index)) < slowError * .6, "the free wrist responds faster without accelerating the bearing aims");
    const observe = observeBody(stand.built, muscles, stand.world, clockSenses(stand.world), undefined, () => upright.down(), true);
    const checkpoint = saveStand(stand.world, states);
    const branch = () => {
      const trace = []; let readyAt = null;
      for (let step = 0; step < 324; step++) {
        stand.step(); const o = observe(); trace.push(o);
        assert.deepEqual({ phase: body.mind.fast.state.phase, stage: body.mind.fast.state.stage }, { phase: "rise", stage: 0 });
        assert.equal(body.mind.fast.state.holdSupported, true);
        assert.equal(o.contacts.some(c => c.fixed !== null && c.impulse > 0 && /Trunk|head/.test(c.segment)), false);
        for (const side of ["left", "right"]) assert.ok(o.contacts.some(c => c.fixed !== null && c.impulse > 0 && c.segment === `shank.${side}`));
        for (const j of o.joints) assert.ok(j.effort <= j.positive + 1e-4 && -j.effort <= j.negative + 1e-4, j.name);
        assert.deepEqual({ force: body.own.assist.meter.force, moment: body.own.assist.meter.moment }, { force: 0, moment: 0 });
        if (body.mind.fast.state.supportedReady && readyAt === null) readyAt = o.time;
      }
      assert.ok(readyAt !== null && trace.at(-1).time - readyAt > 1, "bearing readiness keeps driving the supported pose");
      assert.ok(Math.abs(to - muscles.angle(index)) < .02, "the actual free wrist reaches its goal while the support is retained");
      return { trace, readyAt, saved: saveStand(stand.world, states) };
    };
    loadStand(stand.world, states, checkpoint); const expected = branch();
    loadStand(stand.world, states, checkpoint); assert.deepEqual(branch(), expected);
    assert.equal(body.mind.fast.state.supportedReady, true);
    const trunk = stand.built.segments.get("lowerTrunk");
    trunk.body.applyImpulse(new Vector3(10, 0, 0), trunk.node.position);
    stand.step();
    assert.equal(body.mind.fast.state.supportedReady, false, "a real impulse revokes readiness on the next control step");
    stand.step(119);
    assert.deepEqual({ phase: body.mind.fast.state.phase, held: body.mind.fast.state.holdSupported, ready: body.mind.fast.state.supportedReady },
      { phase: "settle", held: false, ready: false }, "a held stage still honors its bearing deadline");
    body.mind.fast.end();
    assert.deepEqual({ phase: body.mind.fast.state.phase, held: body.mind.fast.state.holdSupported, ready: body.mind.fast.state.supportedReady },
      { phase: "idle", held: false, ready: false });
    body.mind.fast.begin();
    assert.deepEqual({ held: body.mind.fast.state.holdSupported, ready: body.mind.fast.state.supportedReady, capture: body.mind.fast.state.supportedPosture },
      { held: false, ready: false, capture: null });
  } finally { body?.dispose(); stand.dispose(); }
});
