import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactTracking } from "../src/core/control/contact-tracking.ts";
import { wholeBodyTracking, trackingRejected } from "../src/core/control/whole-body.ts";
import { embody } from "../src/core/mind/mind.ts";
import { applyAction } from "../src/core/mind/actions.ts";
import { observeBody } from "../src/core/observation.ts";
import { modelSpec } from "../src/core/models.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { coreStand, freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";
import { saveState, loadState } from "../src/core/state.ts";

const settings = { maxPoints: 4, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 };
const command = { joints: [], frames: [], grips: [] };

test("a bounded contact solve preserves real hands-and-knees support before choosing lift-off", async () => {
  const placement = poses.find(p => p.model === "workshop-fighter" && p.id === "fours").placement;
  const stand = await coreStand(modelSpec("workshop-fighter"), { ...placement, engine: "rapier-coordinate" });
  let body;
  try {
    body = embody(stand.built, stand.world, own => {
      const muscles = own.muscles, goals = muscles.channels.map(c => placement.joints[c.joint.spec.name][c.index]);
      const tracking = wholeBodyTracking(own.built, muscles, stand.world.physics.gravity, [], [], {
        capacity: 1, effortCost: 1e-6, contact: { physics: stand.world.physics, dt: stand.world.dt,
          settings: { ...settings, maxPoints: 64, redistributionCost: 1e-6, liftOff: { accelerationTolerance: .1 } } },
      });
      const state = { steps: 0, tracking: tracking.state, first: null };
      const observe = observeBody(own.built, muscles, stand.world, () => ({ time: stand.world.time, others: [] }));
      return { name: "supported controller handoff", state, observe, step() {
        state.steps++;
        own.built.handPoses.request([{ hand: "left", pose: "open" }, { hand: "right", pose: "open" }]);
        if (state.steps <= 36) {
          const rates = goals.map((goal, i) => (goal - muscles.angle(i)) / .08);
          muscles.channels.forEach((c, i) => {
            let speed = 0;
            for (let k = 0; k < c.joint.dofs.length; k++) speed += muscles.turning(i, k) * rates[i - c.index + k];
            muscles.activation[i] = 1; muscles.velocity[i] = speed;
          });
          return;
        }
        const torque = tracking.track({ joints: muscles.channels.map((c, i) => ({ channel: c.name,
          angle: goals[i], rate: 0, acceleration: 0, seconds: .08, weight: 1 })), frames: [], grips: [] });
        if (state.steps === 37) state.first = tracking.report();
        applyAction(muscles, { kind: "torque", torque: Array.from(torque) });
      } };
    });
    stand.world.step(36);
    const saved = saveStand(stand.world, { body: body.state });
    const finish = () => {
      const trace = [];
      for (let step = 0; step < 24; step++) {
        stand.world.step(); const observation = body.mind.observe(); trace.push(observation);
        const loaded = observation.contacts.filter(c => c.fixed !== null && c.impulse > 0).map(c => c.segment);
        assert.ok(["hand.left", "hand.right", "shank.left", "shank.right"].every(name => loaded.includes(name)));
        assert.ok(!loaded.some(name => /Trunk|head/.test(name)), "the controller preserves clearance through the handoff");
        assert.ok(observation.centre[1] > .32, "the support pose does not collapse");
        assert.deepEqual({ force: body.own.assist.meter.force, moment: body.own.assist.meter.moment }, { force: 0, moment: 0 });
        for (const joint of observation.joints) assert.ok(joint.effort <= joint.positive + .0001
          && -joint.effort <= joint.negative + .0001, joint.name);
      }
      assert.equal(trackingRejected(body.mind.state.first), false, "the bounded solution can carry the initial support pose");
      assert.ok(body.mind.state.first.contact.points >= 4);
      assert.ok(body.mind.state.first.contact.motion.released.every(id => !/hand|shank/.test(id)),
        "the initial effort guess cannot release support that the bounded solution carries");
      return { trace, state: saveState(body.state) };
    };
    const expected = finish(); loadStand(stand.world, { body: body.state }, saved);
    assert.deepEqual(finish(), expected);
  } finally { body?.dispose(); stand.dispose(); }
});
async function fixture(box = false, duplicate = false, rotation = Quaternion.Identity()) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const physics = (await freshEngine()).createPhysics({ hz: 120, gravity: true });
  physics.addFixedBox([0, -0.5, 0], [5, 1, 5]);
  const node = new TransformNode("support", scene);
  node.position.set(0, 0.05, 0); node.rotationQuaternion = rotation;
  const shape = box ? { kind: "box", centre: [0, 0, 0], size: [0.2, 0.1, 0.2] } : { kind: "sphere", centre: [0, 0, 0], radius: 0.05 };
  const body = physics.addBody(node, duplicate ? [shape, { ...shape, centre: [1e-7, 0, 0] }] : [shape], {
    mass: 1, centre: [0, 0, 0], moments: [0.001, 0.001, 0.001], orientation: Quaternion.Identity(),
  });
  return { physics, body, frames: new Map([["segment:support", body]]),
    dispose() { physics.dispose(); scene.dispose(); rendering.dispose(); } };
}

test("a tilted support predicts its deepest edge without welding the nearby raised corners", async () => {
  const f = await fixture(true, false, Quaternion.RotationAxis(Vector3.Forward(), .012));
  try {
    f.physics.step(1 / 120);
    const before = f.physics.save(), manifolds = f.physics.contactManifoldsOf(f.body, other => other === null);
    const points = manifolds.flatMap(m => m.points), deepest = Math.min(...points.map(p => p.distance));
    assert.equal(points.length, 4);
    const expected = points.filter(p => p.distance <= deepest + .0001).map(p => p.point);
    assert.equal(expected.length, 2, "the real tilted box has one lower edge and two nearby raised corners");
    const unfiltered = contactTracking(f.physics, f.frames, 1, settings);
    assert.equal(unfiltered.read(command).length, 12);
    const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, supportBand: .0001 });
    assert.deepEqual(tracker.read(command).filter((_, i) => i % 3 === 0).map(row => row[0].point), expected);
    assert.deepEqual(f.physics.contactManifoldsOf(f.body, other => other === null), manifolds);
    assert.deepEqual(f.physics.save(), before, "support selection changes no geometry, load or physical state");
    assert.equal(tracker.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] }).length, 0);
    assert.deepEqual(tracker.read(command).filter((_, i) => i % 3 === 0).map(row => row[0].point), expected);
    assert.deepEqual(unfiltered.read(command, new Set(), false, .0001).filter((_, i) => i % 3 === 0).map(row => row[0].point), expected);
    assert.equal(unfiltered.read(command).length, 12, "a per-call edge choice does not mutate controller tuning");
    for (const supportBand of [-1, NaN, Infinity]) assert.throws(() => contactTracking(f.physics, f.frames, 1,
      { ...settings, supportBand }), /invalid contact support band/);
  } finally { f.dispose(); }
});

test("nearby points from overlapping colliders share prediction rows without changing physical contacts", async () => {
  const f = await fixture(true, true);
  try {
    f.physics.step(1 / 120);
    const before = f.physics.save(), manifolds = f.physics.contactManifoldsOf(f.body, (other) => other === null);
    const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, maxPoints: 8 });
    const raw = tracker.read(command);
    assert.equal(raw.length, 24, "both colliders contribute all four measured floor corners");
    const merged = contactTracking(f.physics, f.frames, 1, { ...settings, maxPoints: 8, pointSeparation: .001 });
    const rows = merged.read(command);
    assert.equal(rows.length, 12, "each distinct floor corner supplies three motion rows");
    const points = rows.filter((_, i) => i % 3 === 0).map(r => r[0].point);
    assert.equal(new Set(points.map(p => `${p[0] > 0},${p[2] > 0}`)).size, 4, "the support outline keeps every corner");
    assert.equal(merged.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] }).length, 0);
    assert.equal(merged.read(command).length, 12, "contact work is rebuilt after a different desired support");
    assert.deepEqual(f.physics.contactManifoldsOf(f.body, (other) => other === null), manifolds);
    assert.deepEqual(f.physics.save(), before, "the model does not delete or move real contacts");
    for (const pointSeparation of [-1, Infinity, NaN]) assert.throws(() => contactTracking(f.physics, f.frames, 1,
      { ...settings, pointSeparation }), /invalid contact point separation/);
  } finally { f.dispose(); }
});

test("desired support neither creates measured contacts nor removes physical contact", async () => {
  const f = await fixture();
  try {
    const tracker = contactTracking(f.physics, f.frames, 1, settings);
    assert.equal(tracker.read(command).length, 0, "no narrowphase measurement before stepping");
    f.physics.step(1 / 120);
    const before = f.physics.save(), manifolds = f.physics.contactManifoldsOf(f.body, (other) => other === null);
    assert.ok(manifolds.some((m) => m.impulse > 0));
    assert.equal(tracker.read(command).length, 3);
    assert.equal(tracker.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] }).length, 0);
    assert.deepEqual(f.physics.contactManifoldsOf(f.body, (other) => other === null), manifolds);
    assert.deepEqual(f.physics.save(), before);
    assert.equal(tracker.read(command).length, 3);
  } finally { f.dispose(); }
});

test("a positive support load participates in the initial lift-off prediction", async () => {
  const f = await fixture();
  try {
    f.physics.step(1 / 120);
    const before = f.physics.save(), frame = { kind: "segment", name: "support" };
    const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, liftOff: { accelerationTolerance: .1 } }, 0,
      { dt: 1 / 120, radius: () => .05 });
    assert.deepEqual(tracker.read(command, new Set(), true), []);
    assert.equal(tracker.releasedRows().length, 1);
    const load = normalLoad => ({ ...command, supports: [{ frame, mode: "auto", normalLoad }] });
    const seeded = tracker.read(load({ min: 1 }), new Set(), true);
    assert.equal(seeded.length, 3, "an actually measured positive load request seeds sticking support");
    assert.deepEqual(seeded.filter((_, i) => i % 3 === 0).map(row => row[0].point),
      f.physics.contactManifoldsOf(f.body, other => other === null).flatMap(m => m.points.map(p => p.point)));
    assert.deepEqual(tracker.releasedRows(), []);
    assert.deepEqual(tracker.read(load({ min: 0 }), new Set(), true), []);
    assert.deepEqual(tracker.read(load({ pointMin: 1 }), new Set(), true), [], "a per-selected-point floor alone chooses no support");
    assert.deepEqual(tracker.read(command, new Set(), true), [], "load selection carries no hidden history");
    assert.deepEqual(f.physics.save(), before);
  } finally { f.dispose(); }
});

test("contact redistribution removes artificial tension without changing a body's wrench", async () => {
  const f = await fixture(true);
  try {
    f.physics.step(1 / 120);
    const snapshot = f.physics.save();
    for (const redistributionCost of [undefined, 1e-6]) {
      const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, redistributionCost });
      const rows = tracker.read(command), points = rows.filter((_, i) => i % 3 === 0).map((r) => r[0].point);
      assert.equal(points.length, 4);
      const base = points.flatMap((p) => [0, p[0] * p[2] > 0 ? -1 : 2, 0]);
      tracker.base(base); tracker.column(0, base);
      const candidate = new Float64Array([0]);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      if (redistributionCost === undefined) {
        assert.equal(tracker.report().status, "rejected");
        continue;
      }
      assert.equal(tracker.report().status, "accepted");
      tracker.verify({ reactionMultipliers: () => base }, candidate);
      const report = tracker.report();
      assert.equal(report.status, "accepted");
      assert.ok(report.tension < 1e-8 && report.frictionViolation < 1e-8);
      assert.deepEqual([...candidate], [0]);
      const difference = [0, 0, 0, 0, 0, 0];
      report.forces.forEach(({ point: p, force }, i) => {
        const d = force.map((v, k) => v - base[3 * i + k]);
        for (let k = 0; k < 3; k++) difference[k] += d[k];
        difference[3] += p[1] * d[2] - p[2] * d[1];
        difference[4] += p[2] * d[0] - p[0] * d[2];
        difference[5] += p[0] * d[1] - p[1] * d[0];
      });
      assert.ok(difference.every((v) => Math.abs(v) < 1e-10), JSON.stringify(difference));
      assert.ok(tracker.state.redistribution.some((v) => Math.abs(v) > 0.5));
      const saved = saveState(tracker.state);
      tracker.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] });
      assert.equal(tracker.report().points, 0);
      loadState(tracker.state, saved);
      tracker.read(command); tracker.base(base); tracker.column(0, base);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      tracker.verify({ reactionMultipliers: () => base }, candidate);
      assert.deepEqual(saveState(tracker.state), saved, "cold work is rebuilt after a different contact topology");
    }
    assert.deepEqual(f.physics.save(), snapshot, "predicted load allocation never applies forces");
  } finally { f.dispose(); }
});

test("reaction inequalities change a bounded candidate and rejected solves produce zero action", async () => {
  const f = await fixture();
  try {
    f.physics.step(1 / 120);
    for (const iterations of [2048, 1]) {
      const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, iterations });
      tracker.read(command);
      // An isolated affine load response crosses from tension into compression at torque 0.5.
      tracker.base([0, -1, 0]); tracker.column(0, [0, 1, 0]);
      const candidate = new Float64Array([0]);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      if (iterations === 1) {
        assert.equal(tracker.report().status, "rejected");
        assert.equal(tracker.report().solve.status, "iteration-limit");
        assert.deepEqual([...candidate], [0]);
      } else {
        assert.equal(tracker.report().status, "accepted");
        assert.ok(Math.abs(candidate[0] - 0.5) < 1e-6);
        tracker.verify({ reactionMultipliers: (torque) => [0, -1 + 2 * torque[0], 0] }, candidate);
        assert.equal(tracker.report().status, "accepted");
        const detached = tracker.report(); detached.forces[0].force[1] = 99;
        assert.notEqual(tracker.report().forces[0].force[1], 99);
        tracker.verify({ reactionMultipliers: () => [0, -1, 0] }, candidate);
        assert.equal(tracker.report().status, "rejected");
        assert.deepEqual([...candidate], [0]);
      }
    }
  } finally { f.dispose(); }
});

test("support load floors and caps constrain torque without creating contacts or applying forces", async () => {
  const f = await fixture();
  try {
    const tracker = contactTracking(f.physics, f.frames, 1, settings), frame = { kind: "segment", name: "support" };
    const loaded = normalLoad => ({ ...command, supports: [{ frame, mode: "auto", normalLoad }] });
    const H = new Float64Array([1]), rhs = new Float64Array([0]), scale = new Float64Array([1]),
      lo = new Float64Array([-1]), hi = new Float64Array([1]), candidate = new Float64Array([0]);
    tracker.read(loaded({ min: 5 })); tracker.solve(H, rhs, scale, lo, hi, candidate);
    assert.equal(tracker.report().points, 0);
    assert.equal(tracker.report().status, "rejected", "positive load requires a measured support point");
    assert.deepEqual([...candidate], [0]);
    f.physics.step(1 / 120); const before = f.physics.save();
    // This isolated torque response spans 10 N at rest to 30 N at torque +1.
    for (const [normalLoad, expected] of [[{ min: 15 }, .25], [{ max: 5 }, -.25], [{ pointMin: 12 }, .1], [{ max: 0 }, -.5]]) {
      tracker.read(loaded(normalLoad)); tracker.base([0, 10, 0]); tracker.column(0, [0, 30, 0]); candidate[0] = 0;
      tracker.solve(H, rhs, scale, lo, hi, candidate);
      assert.equal(tracker.report().status, "accepted");
      assert.ok(Math.abs(candidate[0] - expected) < 1e-6, JSON.stringify({ normalLoad, torque: candidate[0] }));
      tracker.verify({ reactionMultipliers: torque => [0, 10 + 20 * torque[0], 0] }, candidate);
      assert.equal(tracker.report().status, "accepted");
      assert.ok(tracker.report().loadViolation < 1e-5);
    }
    tracker.read(loaded({ min: 31 })); tracker.base([0, 10, 0]); tracker.column(0, [0, 30, 0]);
    tracker.solve(H, rhs, scale, lo, hi, candidate);
    assert.equal(tracker.report().status, "rejected", "a load request cannot exceed the bounded torque's reach");
    assert.deepEqual([...candidate], [0]);
    tracker.read(loaded({ min: 15 })); tracker.base([0, 10, 0]); tracker.column(0, [0, 30, 0]);
    tracker.solve(H, rhs, scale, lo, hi, candidate);
    tracker.verify({ reactionMultipliers: () => [0, 8, 0] }, candidate);
    assert.equal(tracker.report().status, "rejected");
    assert.equal(tracker.report().loadViolation, 7);
    assert.deepEqual([...candidate], [0]);
    assert.deepEqual(f.physics.save(), before);
  } finally { f.dispose(); }
});


test("additional effort bounds share the contact solve and apply before contacts exist", async () => {
  const f = await fixture();
  try {
    const tracker = contactTracking(f.physics, f.frames, 1, settings, 1);
    const H = new Float64Array([1]), rhs = new Float64Array([1]), scale = new Float64Array([20]);
    const lo = new Float64Array([-1]), hi = new Float64Array([1]), candidate = new Float64Array([1]);
    tracker.read(command);
    tracker.solve(H, rhs, scale, lo, hi, candidate, [{ coefficients: [1], lower: -Infinity, upper: 2 }]);
    assert.equal(tracker.report().points, 0); assert.equal(tracker.report().status, "accepted");
    assert.ok(Math.abs(20 * candidate[0] - 2) < 1e-7);
    f.physics.step(1 / 120); const saved = f.physics.save();
    const prepare = () => {
      assert.equal(tracker.read(command).length, 3);
      tracker.base([0, 10, 0]); tracker.column(0, [1, 10, 0]); candidate[0] = 1;
    };
    prepare(); tracker.solve(H, rhs, scale, lo, hi, candidate, [{ coefficients: [1], lower: -Infinity, upper: 2 }]);
    assert.equal(tracker.report().status, "accepted"); assert.ok(Math.abs(20 * candidate[0] - 2) < 1e-7);
    prepare(); tracker.solve(H, rhs, scale, lo, hi, candidate, [{ coefficients: [1], lower: 20, upper: Infinity }]);
    assert.equal(tracker.report().status, "rejected", "a required tangential load cannot bypass contact friction");
    assert.equal(candidate[0], 0); assert.deepEqual(f.physics.save(), saved);
    const before = [...candidate];
    assert.throws(() => tracker.solve(H, rhs, scale, lo, hi, candidate, new Array(2)), /invalid additional effort bounds/);
    assert.deepEqual([...candidate], before);
  } finally { f.dispose(); }
});
