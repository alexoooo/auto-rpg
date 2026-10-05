import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sourced } from "../src/core/spec/quantity.ts";
import { jointTracker } from "../src/core/build/joint-state.ts";
import { wholeBodyTracking } from "../src/core/control/whole-body.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { applyAction } from "../src/core/mind/actions.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic spherical rotor for coordinate-acceleration testing");
function rotorSpec() {
  const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name) => ({ name, proximal: q([0, 0.9, 0]), distal: q([0, 1.1, 0]), mass: q(1, "kg"),
    centreOfMass: q([0, 1, 0]), inertia: q([0.02, 0.02, 0.02], "kg m2"),
    shape: { kind: "capsule", from: q([0, 0.92, 0]), to: q([0, 1.08, 0]), radius: q(0.02) }, surface: { stiffness: q(1e5, "N/m") } });
  return { family: "test", model: "spherical-rotor", mass: q(2, "kg"), stature: q(1.1),
    segments: [segment("post"), segment("rotor")],
    joints: [{ name: "ball", parent: "post", child: "rotor", centre: q([0, 1, 0]),
      dofs: [[1, 0, 0], [0, -1, 0], [0, 0, 1]].map((axis, k) => ({ positive: `p${k}`, negative: `n${k}`, axis: q(axis, "1"),
        min: q(-2.5, "rad"), max: q(2.5, "rad"), muscle: { peakPositive: q(2, "N m"), peakNegative: q(2, "N m"), speedPositive: speed, speedNegative: speed } })) }] };
}

test("a moving spherical joint holds its angle rates through the real bounded actuator path", async (t) => {
  const stand = await coreStand(rotorSpec(), { pinned: "post", gravity: false, ground: false, hz: 1920, actuation: "directional" });
  const rotor = stand.built.segments.get("rotor").body, joint = stand.built.joints.get("ball");
  const state = { enabled: false, before: [], torque: [] };
  let tracking;
  const driver = driveMuscles(stand.built, stand.world, (d) => {
    state.before = d.channels.map((_, i) => d.rate(i));
    if (!state.enabled) return;
    const command = { frames: [], grips: [], joints: d.channels.map((c, i) => ({ channel: c.name,
      angle: d.angle(i), rate: d.rate(i), acceleration: 0, seconds: 0.2, weight: 1 })) };
    state.torque = Array.from(tracking.track(command));
    applyAction(d, { kind: "torque", torque: state.torque });
  });
  tracking = wholeBodyTracking(stand.built, driver, [0, 0, 0], [], [stand.built.segments.get("post").body], { capacity: 1, effortCost: 1e-8 });
  const read = jointTracker(joint), spins = new Map([...stand.built.segments.values()].map((s) => [s, new Vector3()]));
  const measured = () => {
    for (const [part, spin] of spins) part.body.angularVelocityToRef(spin);
    read.update((part) => spins.get(part));
    return read.rates.map((v, k) => (v - state.before[k]) / stand.world.dt);
  };
  try {
    rotor.applyTorqueImpulse(new Vector3(0.04, -0.06, 0.08)); stand.step(288);
    const states = { driver: driver.state, tracking: tracking.state, controller: state }, saved = saveStand(stand.world, states);
    stand.step(); const coast = measured();
    loadStand(stand.world, states, saved); state.enabled = true; stand.step(); const controlled = measured();
    t.diagnostic(JSON.stringify({ coast, controlled, torque: state.torque }));
    assert.ok(Math.max(...coast.map(Math.abs)) > 1, "coasting changes angle rates even at constant motor speeds");
    assert.ok(Math.max(...controlled.map(Math.abs)) < 0.05, "the tracker cancels coordinate acceleration through muscles");
    assert.ok(state.torque.some((v) => Math.abs(v) > 0.01));
    assert.equal(tracking.report().saturated, 0);
  } finally { driver.dispose(); stand.dispose(); }
});
