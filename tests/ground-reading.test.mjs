/** Ground classifications from the Node stand, Rapier, 120 Hz, after each completed solver step. */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { groundReading, standReady } from "../src/core/mind/ground/reading.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { lowsOf, uprightness } from "../src/core/control/ground.ts";
import { footStatesOf, pointOfToRef } from "../src/core/control/support.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { createBody } from "../src/core/body.ts";
import { createDirectBody } from "../src/core/mind/direct.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };

async function lying(model, lie, posture = GUARD) {
  const axes = { back: [Vector3.Right(), -Math.PI / 2], front: [Vector3.Right(), Math.PI / 2],
    left: [Vector3.Forward(), Math.PI / 2], right: [Vector3.Forward(), -Math.PI / 2] };
  const rotation = Quaternion.RotationAxis(...axes[lie]).asArray();
  const spec = typeof model === "string" ? modelSpec(model) : model;
  const initial = await coreStand(spec, { posture, rotation });
  const height = .02 - uprightness(initial.built).lowest(); initial.dispose();
  return coreStand(spec, { posture, rotation, position: [0, height, 0] });
}

const summary = (built, reading) => ({ position: reading.position, raw: reading.raw, lie: reading.lie, side: reading.side,
  loads: Object.fromEntries(built.spec.segments.map((s, i) => [s.name, reading.load[i]]).filter(([, v]) => v > .01)),
  flat: [...reading.flat], sole: [...reading.sole], height: reading.height, upright: reading.upright });

for (const model of HUMANOID_MODELS) for (const lie of ["back", "front", "left", "right"]) {
  test(`${model} reads ${lie} separately from whether its trunk bears`, async () => {
    const stand = await lying(model, lie), reader = groundReading(stand.built, stand.world.dt);
    try {
      for (let step = 0; step < (lie === "left" || lie === "right" ? 12 : 30); step++) { stand.step(); reader.read(); }
      const g = reader.state.reading, details = JSON.stringify({ model, ...summary(stand.built, g) });
      assert.equal(g.lie, lie, details);
      const trunk = stand.built.spec.segments.reduce((sum, part, i) => sum + (part.name.endsWith("Trunk") ? g.load[i] : 0), 0);
      if (lie === "back") { assert.equal(g.position, lie, details); assert.ok(trunk > .5, details); }
      // A sideways guard lands on its upper arm before its trunk; orientation alone is not support.
      if (lie === "left" || lie === "right") { assert.equal(trunk, 0, details); assert.equal(g.raw, "between", details); }
      if (lie === "front") {
        for (let step = 30; step < 60; step++) { stand.step(); reader.read(); }
        assert.equal(g.position, "front", JSON.stringify(summary(stand.built, g)));
      }
      assert.equal(standReady({ down: true, ground: g }), false);
    } finally { stand.dispose(); }
  });
}

test("installed loaded postures classify their actual support", async () => {
  for (const [id, expected] of [["fours", "fours"], ["half-kneel", "half-kneel"], ["squat", "crouch"]]) {
    const pose = poses.find(p => p.id === id && p.model === "workshop-fighter");
    const stand = await coreStand(modelSpec("workshop-fighter"), pose.placement);
    const targets = Object.fromEntries([...stand.built.joints].flatMap(([name, joint]) => joint.dofs.map((dof, i) =>
      [`${name} ${dof.spec.positive}`, pose.placement.joints[name][i]])));
    const body = createDirectBody(stand.built, stand.world, { kind: "direct", targets, seconds: .01, speed: 10, activation: 1 });
    const reader = groundReading(stand.built, stand.world.dt);
    try {
      for (let step = 0; step < 30; step++) { stand.step(); reader.read(); }
      const g = reader.state.reading;
      assert.equal(g.position, expected, JSON.stringify(summary(stand.built, g)));
      if (id === "half-kneel") assert.equal(g.side, "left");
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("a foot losing its load updates facts before the settled label", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { posture: GUARD });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  body.drive(view => ({ posture: GUARD, pushes: [], stance: { feet: ["left", "right"], centre: null,
    height: view.standing - .03, heading: 0 } }));
  const reader = groundReading(stand.built, stand.world.dt);
  try {
    for (let step = 0; step < 120; step++) { stand.step(); reader.read(); }
    assert.equal(reader.state.reading.position, "standing");
    const foot = stand.built.segments.get("foot.left");
    foot.body.applyImpulse(new Vector3(0, 100, 0), foot.node.position);
    let lost = false;
    for (let step = 0; step < 6; step++) {
      stand.step(); const g = reader.read();
      if (g.footLoad[0] < .03) {
        assert.equal(g.flat[0], 0); assert.equal(g.position, "standing");
        assert.equal(standReady({ down: false, ground: g }), false); lost = true; break;
      }
    }
    assert.equal(lost, true);
  } finally { body.dispose(); stand.dispose(); }
});

test("a held club's fixed contacts never count as the hand bearing", async () => {
  const spec = armed(modelSpec("workshop-fighter"), "right", woodenClub());
  const stand = await lying(spec, "back"), reader = groundReading(stand.built, stand.world.dt);
  try {
    const index = spec.segments.findIndex(s => s.name === "hand.right"), hand = stand.built.segments.get("hand.right");
    const weight = [...stand.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * -stand.world.physics.gravity[1];
    let heldTouched = false;
    for (let step = 0; step < 120; step++) {
      stand.step(); const g = reader.read(); let own = 0, held = 0;
      for (const contact of stand.world.physics.contactsOf(hand.body, other => other === null)) for (const pair of contact.pairs) {
        if (-pair.normal[1] < .7) continue;
        const load = pair.impulse * -pair.normal[1] / (stand.world.dt * weight);
        if (hand.rigid.owners[pair.mine].kind === "held") held += load; else own += load;
      }
      assert.equal(g.load[index], own);
      if (held > .03) { heldTouched = true; assert.notEqual(g.load[index], own + held); }
    }
    assert.equal(heldTouched, true);
  } finally { stand.dispose(); }
});

test("quiet guard support is flat, weighs the body, and replays the label's memory", async () => {
  for (const model of HUMANOID_MODELS) {
    const stand = await coreStand(modelSpec(model), { posture: GUARD });
    const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
    body.drive(view => ({ posture: GUARD, pushes: [], stance: { feet: ["left", "right"], centre: null,
      height: view.standing - .03, heading: 0 } }));
    const reader = groundReading(stand.built, stand.world.dt);
    const step = () => { stand.step(); reader.read(); };
    try {
      for (let n = 0; n < 120; n++) step();
      const g = reader.state.reading, details = JSON.stringify({ model, ...summary(stand.built, g) });
      assert.equal(g.position, "standing", details);
      assert.ok(Math.abs(g.load.reduce((a, b) => a + b, 0) - 1) < .05, details);
      assert.equal(standReady({ down: body.view.down, ground: g }), true, details);
      reader.reset(); assert.equal(g.position, "between");
      for (let n = 0; n < 3; n++) step();
      const snapshot = saveStand(stand.world, { body: body.state, ground: reader.state });
      for (let n = 0; n < 4; n++) step();
      const expected = saveStand(stand.world, { body: body.state, ground: reader.state });
      loadStand(stand.world, { body: body.state, ground: reader.state }, snapshot);
      for (let n = 0; n < 4; n++) step();
      assert.deepEqual(saveStand(stand.world, { body: body.state, ground: reader.state }).state, expected.state);
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("an overhead surface pushes down and is never support", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { ground: false, posture: GUARD });
  try {
    const head = stand.built.segments.get("head"), point = new Vector3();
    const top = Math.max(...lowsOf(head.spec.shape, head.frame).map(low => pointOfToRef(head, low.at, point).y + low.radius));
    const ceiling = stand.world.physics.addFixedBox([0, top + .105, 0], [4, .2, 4]);
    const reader = groundReading(stand.built, stand.world.dt);
    head.body.applyImpulse(new Vector3(0, 100, 0), head.node.position);
    let pushedDown = false;
    for (let step = 0; step < 20; step++) {
      stand.step(); const g = reader.read();
      for (const part of stand.built.segments.values()) for (const c of stand.world.physics.contactsOf(part.body))
        if (c.fixed === ceiling.id && c.pairs.some(p => p.impulse > 0 && p.normal[1] > .7)) pushedDown = true;
      assert.deepEqual([...g.load], stand.built.spec.segments.map(() => 0));
    }
    assert.equal(pushedDown, true);
  } finally { stand.dispose(); }
});

test("level feet bearing on their heel halves alone are not flat support", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { ground: false, posture: GUARD });
  try {
    const feet = footStatesOf(stand.built), edge = Math.min(...feet.map(f => f.middle.z)) - .01;
    stand.world.physics.addFixedBox([0, -.5, edge - 1], [4, 1, 2]);
    const reader = groundReading(stand.built, stand.world.dt);
    let loaded = false;
    for (let step = 0; step < 12; step++) {
      stand.step(); const g = reader.read();
      if (g.footLoad[0] > .03 && g.footLoad[1] > .03 && g.sole[0] > .99 && g.sole[1] > .99) {
        assert.deepEqual([...g.flat], [0, 0]); assert.notEqual(g.raw, "standing"); loaded = true;
      }
    }
    assert.equal(loaded, true);
  } finally { stand.dispose(); }
});

test("a wall contact adds no load to a body lying on its back", async () => {
  const stand = await lying("workshop-fighter", "back");
  try {
    const wall = stand.world.physics.addFixedBox([.5, 1, 0], [.1, 2, 6]);
    const reader = groundReading(stand.built, stand.world.dt);
    for (let step = 0; step < 60; step++) { stand.step(); reader.read(); }
    const root = stand.built.segments.get("lowerTrunk");
    root.body.applyImpulse(new Vector3(100, 0, 0), root.node.position);
    let wallTouched = false;
    const weight = [...stand.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * -stand.world.physics.gravity[1];
    for (let step = 0; step < 60; step++) {
      stand.step(); const g = reader.read();
      for (let i = 0; i < stand.built.spec.segments.length; i++) {
        const part = stand.built.segments.get(stand.built.spec.segments[i].name); let floor = 0;
        for (const c of stand.world.physics.contactsOf(part.body, other => other === null)) for (const pair of c.pairs) {
          if (c.fixed === wall.id && pair.impulse > 0) { wallTouched = true; assert.ok(Math.abs(pair.normal[1]) < .7); }
          if (c.fixed === stand.floor.id && -pair.normal[1] >= .7) floor += pair.impulse * -pair.normal[1] / (stand.world.dt * weight);
        }
        assert.equal(g.load[i], floor);
      }
    }
    assert.equal(wallTouched, true); assert.equal(reader.state.reading.position, "back");
  } finally { stand.dispose(); }
});

test("the host reads ground only when needed and samples completed intervals through release and idle", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { posture: GUARD });
  const wants = { take: false };
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true,
    subs: [own => ({ name: "ground-test", state: {}, wants: () => wants.take, begin() {}, end() {},
      step() { own.muscles.activation.fill(0); } })] });
  try {
    assert.equal(body.view.ground, null);
    const seen = [], remove = body.afterPhysics((step, time) => {
      seen.push({ step, time, completed: body.view.effectors["hand.left"].feedback.completedStep });
    });
    stand.step(); assert.equal(body.view.ground, null);
    wants.take = true; stand.step(2);
    assert.equal(body.has, "ground-test"); assert.notEqual(body.view.ground, null);
    body.setLevel("limp"); stand.step();
    assert.deepEqual(seen, Array.from({ length: 4 }, (_, i) => ({ step: i + 1, time: (i + 1) / 120, completed: i + 1 })));
    remove(); stand.step(); assert.equal(seen.length, 4);
    body.dispose(); stand.step(); assert.equal(seen.length, 4);
  } finally { body.dispose(); stand.dispose(); }
});
