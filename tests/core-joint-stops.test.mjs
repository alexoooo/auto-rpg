import test from "node:test";
import assert from "node:assert/strict";
import { effortBounds } from "../src/core/control/effort-bounds.ts";
import { checkedJointStopSettings, nearJointStops } from "../src/core/control/joint-stops.ts";
import { trackingRejected } from "../src/core/control/whole-body.ts";
import { jointStopProbeSettings } from "../src/core/tasks/stop-settings.ts";
import { createMotionBody } from "../src/core/mind/motion.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const settings = jointStopProbeSettings(true), array = (values) => new Float64Array(values);

test("affine effort bounds constrain actual torques and reject an infeasible candidate", () => {
  const solver = effortBounds(2, 2, settings), candidate = array([0.4, 0.3]);
  const H = array([1, 0, 0, 1]), rhs = array([0.4, 0.3]), scale = array([2, 4]), lo = array([-1, -0.5]), hi = array([0.5, 1]);
  const bounds = [{ coefficients: [1, 1], lower: -Infinity, upper: 0.5 }, { coefficients: [0, 1], lower: 0.2, upper: Infinity }];
  solver.solve(H, rhs, scale, lo, hi, candidate, bounds);
  assert.equal(solver.state.status, "accepted");
  assert.ok(Math.abs(candidate[0] - 0.15) < 1e-7 && Math.abs(candidate[1] - 0.05) < 1e-7);
  const accepted = [...candidate];
  for (const invalid of [[{ coefficients: [NaN, 1], lower: 0, upper: 1 }], new Array(1),
    [{ coefficients: new Array(2), lower: 0, upper: 1 }], [...bounds, bounds[0]]]) {
    assert.throws(() => solver.solve(H, rhs, scale, lo, hi, candidate, invalid), /invalid additional effort bounds/);
    assert.deepEqual([...candidate], accepted, "invalid rows cannot change the prior candidate");
  }
  solver.solve(H, rhs, scale, lo, hi, candidate, [{ coefficients: [1, 0], lower: 3, upper: Infinity }]);
  assert.equal(solver.state.status, "rejected"); assert.deepEqual([...candidate], [0, 0]);
  assert.throws(() => effortBounds(2, -1, settings), /capacity/);
});

test("stop settings are explicit, immutable and reject invalid numerical inputs", () => {
  const source = { ...settings }, checked = checkedJointStopSettings(source); source.margin = 99;
  assert.equal(checked.margin, settings.margin); assert.ok(Object.isFrozen(checked));
  assert.equal(jointStopProbeSettings(false), undefined); assert.equal(jointStopProbeSettings(undefined), undefined);
  assert.throws(() => jointStopProbeSettings("true"), /selection/);
  for (const bad of [{ margin: -1 }, { margin: Infinity }, { forceTolerance: 0 }, { accelerationTolerance: NaN }, { iterations: 0 }]) {
    assert.throws(() => checkedJointStopSettings({ ...settings, ...bad }), /tracking settings/);
  }
  for (const contact of [null, { status: "accepted" }, { status: "rejected" }]) for (const stops of [null, { status: "accepted" }, { status: "rejected" }]) {
    assert.equal(trackingRejected({ contact, stops }), contact?.status === "rejected" || stops?.status === "rejected");
  }
});

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic gravity-loaded stop fixture");
function hinge(sense) {
  const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name, proximal, distal, mass) => ({ name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((v, i) => (v + distal[i]) / 2)), inertia: q([0.02, 0.004, 0.02], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.03) }, surface: { stiffness: q(1e5, "N/m") } });
  return { family: "test", model: "loaded-hinge", mass: q(3, "kg"), stature: q(1),
    segments: [segment("parent", [0, 1, 0], [0, 0.6, 0], 2), segment("child", [0, 0.6, 0], [0, 0.2, sense * 0.2], 1)],
    joints: [{ name: "hinge", parent: "parent", child: "child", centre: q([0, 0.6, 0]), dofs: [{
      positive: "bend", negative: "extend", axis: q([1, 0, 0], "1"), min: q(-0.3, "rad"), max: q(0.3, "rad"),
      muscle: { peakPositive: q(2, "N m"), peakNegative: q(2, "N m"), speedPositive: speed, speedNegative: speed },
    }] }] };
}

test("a bounded motion policy can press either stop and then move inward without ground contacts", async (t) => {
  const readings = [];
  for (const sense of [-1, 1]) {
    const stand = await coreStand(hinge(sense), { pinned: "parent", ground: false, gravity: true, engine: "rapier-coordinate", actuation: "directional" });
    let body;
    try {
      const joint = stand.built.joints.get("hinge"); joint.joint.setMotor(0, sense * 10, 2); stand.step(120); joint.joint.setMotor(0, 0, 0);
      const state = { angle: sense * 0.3, rate: sense };
      body = createMotionBody(stand.built, stand.world, (model) => ({ name: "stop-release", state, step() {
        return { joints: [{ channel: model.channels[0].name, angle: state.angle, rate: state.rate,
          acceleration: 0, seconds: 0.15, weight: 1 }], frames: [], grips: [] };
      } }), { items: [], grants: [], fixed: [joint.parent.body], capacity: 1, effortCost: 1e-6, jointStops: settings });
      let active = 0, maxWork = 0, peakEffort = 0;
      for (let i = 0; i < 60; i++) {
        stand.step(); const report = body.report();
        assert.equal(trackingRejected(report), false); assert.equal(report.contact, null);
        active += Number(report.stops.active.length > 0); maxWork = Math.max(maxWork, report.stops.work);
        peakEffort = Math.max(peakEffort, Math.abs(body.observe().joints[0].effort));
      }
      assert.ok(active > 50, "an outward rate request uses the existing loaded stop");
      assert.ok(Math.abs(body.observe().joints[0].angle - sense * 0.3) < 0.001);
      assert.ok(peakEffort < 0.001, "gravity loads the stop without a fictitious actuator load");
      const snapshot = saveStand(stand.world, { body: body.state });
      const sampled = nearJointStops(stand.built, settings.margin, stand.world.dt);
      assert.equal(sampled.length, 1); assert.deepEqual(saveStand(stand.world, { body: body.state }), snapshot);
      assert.ok(Math.abs(sampled[0].gap - (0.3 - sense * body.observe().joints[0].angle)) < 1e-12);
      const detached = body.report().stops; detached.active.length = 0; detached.released.push("external");
      assert.deepEqual(saveStand(stand.world, { body: body.state }), snapshot);
      const branch = () => {
        state.angle = 0; state.rate = 0; stand.step();
        const first = body.report().stops;
        assert.ok(first.released.includes("hinge:0"), "an inward goal releases the stop instead of freezing the objective");
        const moving = nearJointStops(stand.built, settings.margin, stand.world.dt)[0];
        assert.ok(moving.rate > 0 && moving.gap > sampled[0].gap, "inward motion increases clearance at either limit");
        assert.ok(Math.abs(moving.rate + sense * body.observe().joints[0].rate) < 1e-10);
        for (let i = 0; i < 179; i++) { stand.step(); assert.equal(trackingRejected(body.report()), false); }
        return { observation: body.observe(), state: saveStand(stand.world, { body: body.state }).state };
      };
      const expected = branch(); loadStand(stand.world, { body: body.state }, snapshot); assert.deepEqual(branch(), expected);
      assert.ok(Math.abs(body.observe().joints[0].angle) < 0.002, `the same actuator path reaches the interior goal: ${body.observe().joints[0].angle}`);
      assert.ok(maxWork <= 3); assert.equal(body.assist.meter.force, 0); assert.equal(body.assist.meter.moment, 0);
      readings.push({ sense, active, maxWork, peakEffort, angle: body.observe().joints[0].angle });
    } finally { body?.dispose(); stand.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});
