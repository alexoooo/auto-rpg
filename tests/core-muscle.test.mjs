/**
 * The muscle actuator (`src/core/muscle/`): the force-velocity curve as written, and the driver
 * making Havok's motors follow it. Node stand, at the game's 120 Hz and at 480 Hz as a finer
 * reference: the driver sets each sub-step's ceiling from the speed at its start, so its error
 * shrinks with the step (the driver's doc comment has the table).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { forceVelocityFactor } from "../src/core/muscle/force-velocity.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { frameOf } from "../src/core/spec/body.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the muscle tests");

/** Two curves unlike each other and unlike any human's, so a test cannot pass on a remembered number. */
const CURVES = [
  { unloadedSpeed: 12, curvature: 0.3, eccentricCeiling: 1.5, eccentricSlopeRatio: 3 },
  { unloadedSpeed: 20, curvature: 0.15, eccentricCeiling: 1.3, eccentricSlopeRatio: 1.5 },
];

test("the curve is Hill's hyperbola shortening, and rises continuously to its ceiling lengthening", () => {
  for (const c of CURVES) {
    const f = (w) => forceVelocityFactor(w, c);
    assert.equal(f(0), 1);
    assert.equal(f(c.unloadedSpeed), 0);
    assert.equal(f(1.5 * c.unloadedSpeed), 0);
    // Hill's (T + a)(w + b) = (T0 + a) b, with a = k T0 and b = k w0, at a sample of speeds.
    for (const r of [0.1, 0.3, 0.5, 0.8]) {
      const w = r * c.unloadedSpeed, a = c.curvature, b = c.curvature * c.unloadedSpeed;
      assert.ok(Math.abs((f(w) + a) * (w + b) - (1 + a) * b) < 1e-9, `Hill at r ${r}: ${f(w)}`);
    }
    // Lengthening: no step at rest, the stated slope ratio there, rising to the ceiling.
    const h = 1e-6;
    const concentricSlope = (f(0) - f(h)) / h, eccentricSlope = (f(-h) - f(0)) / h;
    assert.ok(Math.abs(eccentricSlope / concentricSlope - c.eccentricSlopeRatio) < 1e-3, `slope ratio ${eccentricSlope / concentricSlope}`);
    let last = 1;
    for (const r of [0.05, 0.2, 0.5, 1, 3, 30]) {
      const now = f(-r * c.unloadedSpeed);
      assert.ok(now > last && now < c.eccentricCeiling, `lengthening at r ${r}: ${now}`);
      last = now;
    }
    assert.ok(c.eccentricCeiling - f(-1e4 * c.unloadedSpeed) < 1e-3);
  }
});

/** A rod hung on a weightless static post by one freedom, its muscles `curve` both ways. */
function rod(curve, peak) {
  const speed = () => Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, q(v, k === "unloadedSpeed" ? "rad/s" : "1")]));
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) },
  });
  return {
    family: "test", model: "rod", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.5, 0], [0, 1, 0], 2), segment("rod", [0, 1, 0], [0.1, 0.55, 0.05], 1)],
    joints: [{ name: "pin", parent: "post", child: "rod", centre: q([0, 1, 0]),
      dofs: [{ positive: "flexion", negative: "extension", axis: q([0.8, 0.6, 0], "1"), min: q(-3, "rad"), max: q(3, "rad"),
        muscle: { peakPositive: q(peak.positive, "N m"), peakNegative: q(peak.negative, "N m"), speedPositive: speed(), speedNegative: speed() } }] }],
  };
}

/** The rod's moment of inertia about the pin's axis, from its spec: its own, turned, plus m d^2. */
function inertiaAboutPin(spec) {
  const s = spec.segments[1], axis = spec.joints[0].dofs[0].axis.value, frame = frameOf(s);
  const inFrame = [frame.x, frame.y, frame.z].map((e) => e[0] * axis[0] + e[1] * axis[1] + e[2] * axis[2]);
  const own = s.inertia.value.reduce((sum, i, k) => sum + i * inFrame[k] ** 2, 0);
  const r = s.centreOfMass.value.map((c, i) => c - spec.joints[0].centre.value[i]);
  const across = [r[1] * axis[2] - r[2] * axis[1], r[2] * axis[0] - r[0] * axis[2], r[0] * axis[1] - r[1] * axis[0]];
  return own + s.mass.value * across.reduce((sum, v) => sum + v * v, 0);
}

async function onStand(spec, control, hz) {
  const stand = await coreStand(spec, { gravity: false, ground: false, pinned: "post", hz });
  const driver = driveMuscles(stand.built, stand.scene, control);
  return { stand, driver };
}

/** Integrate I dw/dt = torque(w) finely from w = 0 over `seconds`. */
function integrate(inertia, torque, seconds) {
  const h = 1e-5;
  let w = 0;
  for (let t = 0; t < seconds; t += h) w += (h * torque(w)) / inertia;
  return w;
}

/**
 * Driven flat out from rest, the rod's speed follows I dw/dt = activation T0 fv(w), integrated here
 * finely. The driver reads a joint at the start of each sub-step, so after n steps its reading is
 * the speed after n - 1. Measured, as the rod's speed over the curve's at 0.05, 0.15 and 0.4 s for
 * the two cases: 120 Hz reads +5.8, +5.0, +0.3 and +2.1, +5.3, +2.1 %; 480 Hz +1.1, +1.0, -0.2 and
 * -0.3, +0.9, +0.1 %; 960 Hz within 0.7 %.
 */
test("a rod driven flat out speeds up as its muscles' curve says, closer as the step shrinks", async () => {
  for (const [hz, tolerance] of [[120, 0.07], [480, 0.015]]) {
    for (const [curve, activation, sense] of [[CURVES[0], 1, 1], [CURVES[1], 0.5, -1]]) {
      const peak = { positive: 6, negative: 4 };
      const spec = rod(curve, peak);
      const { stand, driver } = await onStand(spec, (d) => { d.activation[0] = activation; d.velocity[0] = sense * 1e3; }, hz);
      try {
        const inertia = inertiaAboutPin(spec), T0 = sense > 0 ? peak.positive : peak.negative;
        const dt = 1 / hz;
        let stepped = 0;
        for (const at of [0.05, 0.15, 0.4]) {
          stand.step(stand.seconds(at) - stepped);
          stepped = stand.seconds(at);
          const expected = integrate(inertia, (w) => activation * T0 * forceVelocityFactor(w, curve), at - dt);
          const read = sense * driver.speed(0);
          assert.ok(Math.abs(read - expected) < tolerance * expected, `${hz} Hz, ${JSON.stringify(curve)} x${activation}, at ${at} s: ${read} rad/s, the curve says ${expected}`);
        }
      } finally { driver.dispose(); stand.dispose(); }
    }
  }
});

/**
 * Held flat out, the rod closes on its unloaded speed and never passes it: the motor is never asked
 * for more than the pushing side's unloaded speed, so a sub-step's ceiling, read at the step's
 * start, cannot carry it over far. At the game's rate, where the overshoot is largest: measured
 * 12.32 rad/s against 12 (1.5 % over at 480 Hz); without the hold, 17.6.
 */
test("a rod held flat out closes on its unloaded speed and never passes it", async () => {
  const curve = CURVES[0], peak = { positive: 2000, negative: 1500 };
  const spec = rod(curve, peak);
  const { stand, driver } = await onStand(spec, (d) => { d.activation[0] = 1; d.velocity[0] = 1e3; }, 120);
  try {
    // A muscle so strong for its rod that one sub-step at the ceiling read at the step's start
    // would carry it past its unloaded speed (peak dt / I above w0 (1 + 1/k)), as a wrist's is.
    let fastest = 0;
    for (let i = 0; i < stand.seconds(0.2); i++) { stand.step(1); fastest = Math.max(fastest, driver.speed(0)); }
    assert.ok(fastest <= curve.unloadedSpeed * 1.03, `fastest ${fastest} rad/s against ${curve.unloadedSpeed}`);
    assert.ok(driver.speed(0) > 0.95 * curve.unloadedSpeed, `after 0.2 s: ${driver.speed(0)} rad/s`);
  } finally { driver.dispose(); stand.dispose(); }
});

/**
 * A muscle asked to hold, stretched by a steady torque above its peak, gives way as its eccentric
 * branch says: the yield speed follows I dw/dt = load - T0 fv(-w). Compared as torque, fv at the
 * speed read against fv at the speed integrated, because the branch is steep near rest: at 1.1 x
 * peak a 1 % torque difference is a 13 % speed difference. Measured differences are under 1.2 % of
 * isometric at both rates.
 */
test("a muscle stretched past its peak yields at the speed its eccentric branch says", async () => {
  const curve = CURVES[0], peak = { positive: 6, negative: 6 };
  for (const hz of [120, 480]) {
    for (const over of [1.1, 1.25, 1.4]) {
      const spec = rod(curve, peak);
      const { stand, driver } = await onStand(spec, (d) => { d.activation[0] = 1; d.velocity[0] = 0; }, hz);
      try {
        const body = stand.built.segments.get("rod").body;
        const axis = new Vector3(...spec.joints[0].dofs[0].axis.value);
        const load = over * peak.positive;
        stand.scene.onBeforePhysicsObservable.add(() => body.applyAngularImpulse(axis.scale(-load / hz)));
        stand.step(stand.seconds(0.4));
        const expected = integrate(inertiaAboutPin(spec), (w) => load - peak.positive * forceVelocityFactor(-w, curve), 0.4 - 1 / hz);
        const read = -driver.speed(0);
        const gap = forceVelocityFactor(-read, curve) - forceVelocityFactor(-expected, curve);
        assert.ok(read > 0 && Math.abs(gap) < 0.015, `${hz} Hz, stretched at ${over} x peak: ${read} rad/s, the curve says ${expected} (torque ${gap} of isometric)`);
      } finally { driver.dispose(); stand.dispose(); }
    }
  }
});
