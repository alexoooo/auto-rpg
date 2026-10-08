import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sourced } from "../src/core/spec/quantity.ts";
import { createMotionBody } from "../src/core/mind/motion.ts";
import { contactTracking } from "../src/core/control/contact-tracking.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { trackingRejected } from "../src/core/control/whole-body.ts";
import { jointStopProbeSettings } from "../src/core/tasks/stop-settings.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic ground-lift fixture");
const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(.25, "1"),
  eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
const part = (name, from, to, mass, radius) => ({ name, proximal: q(from), distal: q(to), mass: q(mass, "kg"),
  centreOfMass: q(from.map((v, i) => (v + to[i]) / 2)), inertia: q([.1, .1, .1], "kg m2"),
  shape: { kind: "capsule", from: q(from), to: q(to), radius: q(radius) }, surface: { stiffness: q(1e5, "N/m") } });
const spec = { model: "ground-lift", mass: q(3, "kg"), stature: q(1.3), down: { kind: "asked", fallen: q(0.25) },
  segments: [part("parent", [0, 1.3, 0], [0, 1, 0], 2, .03), part("child", [0, 1, 0], [.6, .1, 0], 1, .1)],
  joints: [{ name: "hinge", parent: "parent", child: "child", centre: q([0, 1, 0]), dofs: [{
    positive: "lift", negative: "lower", axis: q([0, 0, 1], "1"), min: q(-1, "rad"), max: q(1, "rad"),
    muscle: { peakPositive: q(10, "N m"), peakNegative: q(10, "N m"), speedPositive: speed, speedNegative: speed },
  }] }] };

const settings = { maxPoints: 8, gap: .005, minUpNormal: .9, forceTolerance: 1e-5,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 };

test("a measured ground contact can lift, bear weight and lift again through bounded muscles", async (t) => {
  const readings = [];
  for (const [engine, stops, liftOff] of [["rapier-coordinate", false, true], ["rapier-coordinate", true, true],
    ["rapier", false, true], ["rapier-coordinate", false, false]]) {
    const stand = await coreStand(spec, { pinned: "parent", ground: true, engine, actuation: "directional" });
    let body;
    try {
      stand.step(120); const state = { angle: .3 };
      assert.ok(stand.world.physics.contactManifoldsOf(stand.built.segments.get("child").body, (other) => other === null).length > 0);
      body = createMotionBody(stand.built, stand.world, (model) => ({ name: "ground-cycle", state, step() {
        return { joints: [{ channel: model.channels[0].name, angle: state.angle, rate: 0,
          acceleration: 0, seconds: .15, weight: 1 }], frames: [], grips: [] };
      } }), { items: [], grants: [], fixed: [stand.built.segments.get("parent").body], capacity: 1,
        effortCost: 1e-6, ...(stops ? { jointStops: jointStopProbeSettings(true) } : {}),
        contact: { ...settings, ...(liftOff ? { liftOff: { accelerationTolerance: 1e-4 } } : {}) } });
      const snapshot = saveStand(stand.world, { body: body.state });
      const branch = () => {
        const rows = [];
        for (const goal of liftOff ? [.3, -.15, .3, -.15, .3] : [.3]) {
          state.angle = goal; let contactSteps = 0, releasedSteps = 0, rejectedSteps = 0, work = 0, peakEffort = 0;
          for (let i = 0; i < 240; i++) {
            stand.step(); const observation = body.observe(), report = body.report();
            if (trackingRejected(report)) { rejectedSteps++; assert.ok(Math.abs(observation.joints[0].effort) < 1e-8); }
            assert.ok(observation.joints[0].angle > -.002, "the actual ground prevents penetration");
            peakEffort = Math.max(peakEffort, Math.abs(observation.joints[0].effort));
            contactSteps += Number(observation.contacts.some((c) => c.segment === "child"));
            releasedSteps += Number((report.contact.motion?.released.length ?? 0) > 0);
            work = Math.max(work, report.contact.motion?.work ?? 0);
            if (report.contact.motion && !trackingRejected(report)) assert.ok(report.contact.motion.accelerationViolation <= 1e-4);
          }
          const angle = body.observe().joints[0].angle;
          if (liftOff && goal > 0) {
            assert.ok(Math.abs(angle - goal) < .002, "the grounded limb reaches the lifted goal");
            assert.ok(releasedSteps > 0); assert.ok(contactSteps < 30);
          } else {
            assert.ok(Math.abs(angle) < .002); assert.ok(contactSteps > 150);
            assert.ok(body.report().contact.forces.reduce((sum, f) => sum + f.force[1], 0) > 0);
          }
          assert.ok(peakEffort <= 14.0001, "fixture's 10 Nm muscle has a sourced 1.4 eccentric ceiling");
          assert.ok(work <= settings.maxPoints + 3);
          assert.ok(rejectedSteps <= 1, "the measured landing transient must not become sustained rejection");
          assert.equal(body.assist.meter.force, 0); assert.equal(body.assist.meter.moment, 0);
          rows.push({ goal, angle, contactSteps, releasedSteps, rejectedSteps, work, peakEffort });
        }
        return { rows, observation: body.observe(), state: saveStand(stand.world, { body: body.state }).state };
      };
      const first = branch(); loadStand(stand.world, { body: body.state }, snapshot); assert.deepEqual(branch(), first);
      const saved = saveStand(stand.world, { body: body.state });
      const detached = body.report().contact.motion; if (detached) detached.released.push("outside");
      assert.deepEqual(saveStand(stand.world, { body: body.state }), saved);
      readings.push({ engine, stops, liftOff, rows: first.rows });
    } finally { body?.dispose(); stand.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});

test("lift-off requires explicit finite step, geometry and acceleration tolerance", async () => {
  const stand = await coreStand(spec, { pinned: "parent", ground: true });
  try {
    const frames = new Map([["segment:child", stand.built.segments.get("child").body]]);
    const valid = { dt: stand.world.dt, radius: (frame, collider) => frame === "segment:child" && collider === 0 ? .1 : NaN };
    for (const motion of [undefined, { ...valid, dt: 0 }, { ...valid, dt: Infinity }, { dt: stand.world.dt },
      { ...valid, radius: () => NaN }, { ...valid, radius: () => -.1 }, { ...valid, radius: () => Infinity }]) {
      assert.throws(() => contactTracking(stand.world.physics, frames, 1,
        { ...settings, liftOff: { accelerationTolerance: 1e-4 } }, 8, motion), /lift-off settings/);
    }
    for (const accelerationTolerance of [0, -1, NaN, Infinity]) assert.throws(() => contactTracking(
      stand.world.physics, frames, 1, { ...settings, liftOff: { accelerationTolerance } }, 8, valid), /lift-off settings/);
  } finally { stand.dispose(); }
});

test("released contact rejects a torque that accelerates through its measured normal bound", async () => {
  const stand = await coreStand(spec, { pinned: "parent", ground: true, engine: "rapier-coordinate", actuation: "directional" });
  try {
    stand.step(120);
    const child = stand.built.segments.get("child").body, parent = stand.built.segments.get("parent").body;
    const config = { ...settings, liftOff: { accelerationTolerance: 1e-4 } };
    const motion = { dt: stand.world.dt, radius: () => .1 };
    const contacts = contactTracking(stand.world.physics, new Map([["segment:child", child]]), 1, config, 8, motion);
    config.liftOff.accelerationTolerance = -1; motion.dt = 0; motion.radius = () => NaN;
    const model = coupledDynamics(stand.built, stand.world.physics.gravity, [], [parent]);
    const command = { joints: [], frames: [], grips: [] };
    const snapshot = stand.world.physics.save();
    for (const effort of [10, -10]) {
      contacts.begin(); model.update(contacts.read(command, new Set(), true));
      assert.ok(contacts.releasedRows().length > 0);
      const torque = new Float64Array([effort]); contacts.verify(model, torque);
      if (effort > 0) {
        assert.notEqual(contacts.report().status, "rejected"); assert.equal(torque[0], effort);
      } else {
        assert.equal(contacts.report().status, "rejected"); assert.equal(torque[0], 0);
        assert.ok(contacts.report().motion.accelerationViolation > 1e-4);
      }
    }
    assert.deepEqual(stand.world.physics.save(), snapshot, "mode prediction cannot move the physical body");
  } finally { stand.dispose(); }
});

test("a spinning flat support cannot claim mutually incompatible sticking accelerations", async (t) => {
  const slab = { model: "spinning-support", mass: q(3, "kg"), stature: q(1), down: { kind: "asked", fallen: q(0.25) },
    joints: [{ name: "spin", parent: "parent", child: "slab", centre: q([0, .05, 0]), dofs: [{
      positive: "turn", negative: "return", axis: q([0, 1, 0], "1"), min: q(-1, "rad"), max: q(1, "rad"),
      muscle: { peakPositive: q(10, "N m"), peakNegative: q(10, "N m"), speedPositive: speed, speedNegative: speed },
    }] }], segments: [part("parent", [0, 1, 0], [0, .8, 0], 2, .03), {
      name: "slab", proximal: q([0, .1, 0]), distal: q([0, 0, 0]), mass: q(1, "kg"), centreOfMass: q([0, .05, 0]),
      inertia: q([.02, .04, .04], "kg m2"), shape: { kind: "box", centre: q([0, .05, 0]), size: q([.6, .1, .4]) },
      surface: { stiffness: q(1e5, "N/m") },
    }] };
  const stand = await coreStand(slab, { pinned: "parent", ground: true, engine: "rapier-coordinate" });
  try {
    stand.step(120); const segment = stand.built.segments.get("slab").body;
    const contacts = contactTracking(stand.world.physics, new Map([["segment:slab", segment]]), 1,
      { ...settings, liftOff: { accelerationTolerance: 1e-4 } }, 8,
      { dt: stand.world.dt, radius: () => 0 });
    const model = coupledDynamics(stand.built, stand.world.physics.gravity, [], [stand.built.segments.get("parent").body]);
    const check = () => {
      contacts.begin(); const rows = contacts.read({ joints: [], frames: [], grips: [] });
      assert.ok(rows.length >= 9, "several measured contacts constrain the same rigid body");
      model.update(rows, contacts.targets()); const torque = new Float64Array([0]); contacts.verify(model, torque);
      return contacts.report();
    };
    const resting = check(); assert.notEqual(resting.status, "rejected");
    segment.applyTorque(new Vector3(0, 20, 0)); stand.step();
    assert.ok(Math.abs(segment.angularVelocityToRef(new Vector3()).y) > 1);
    const before = stand.world.physics.save(), spinning = check();
    assert.equal(spinning.status, "rejected"); assert.ok(spinning.motion.accelerationViolation > .1);
    assert.deepEqual(stand.world.physics.save(), before);
    t.diagnostic(JSON.stringify({ resting: resting.motion, spinning: spinning.motion }));
  } finally { stand.dispose(); }
});
