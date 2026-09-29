/**
 * The muscle actuator (`src/core/muscle/`): the force-velocity curve as written, and the driver
 * making Havok's motors follow it. Node stand, at the game's 120 Hz and at finer rates as a
 * reference: the driver sets each sub-step's ceiling from the speed at its start and holds its
 * target to where the curve's tangent there reaches zero, so its error shrinks with the step (the
 * driver's doc comment has the tables).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { forceVelocityFactor, forceVelocityReach } from "../src/core/muscle/force-velocity.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { servo } from "../src/core/control/servo.ts";
import { bodyDynamics } from "../src/core/build/dynamics.ts";
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

test("the curve's tangent reaches zero where forceVelocityReach says, and from rest when lengthening", () => {
  for (const c of CURVES) {
    const f = (w) => forceVelocityFactor(w, c), h = 1e-7;
    for (const r of [0, 0.2, 0.5, 0.9, 0.99]) {
      const w = r * c.unloadedSpeed;
      // The tangent through (w, f(w)), with the shortening branch's slope.
      const slope = (f(w + h) - f(w)) / h, zero = w - f(w) / slope;
      const reach = forceVelocityReach(w, c);
      assert.ok(Math.abs(reach - zero) < 1e-4 * c.unloadedSpeed, `r ${r}: reach ${reach}, tangent's zero ${zero}`);
      assert.ok(reach <= c.unloadedSpeed && reach > w, `r ${r}: reach ${reach} outside (${w}, ${c.unloadedSpeed}]`);
    }
    const fromRest = forceVelocityReach(0, c);
    assert.ok(Math.abs(fromRest - c.unloadedSpeed * c.curvature / (1 + c.curvature)) < 1e-12);
    for (const r of [-0.01, -0.5, -3]) assert.equal(forceVelocityReach(r * c.unloadedSpeed, c), fromRest, `lengthening at r ${r}`);
    assert.equal(forceVelocityReach(c.unloadedSpeed, c), c.unloadedSpeed);
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
 * the two cases: 120 Hz reads +5.8, +2.1, -1.0 and +2.1, +1.2, -0.3 %; 480 Hz +1.1, +0.3, -0.6 and
 * -0.3, -0.1, -0.5 %; 960 Hz within 0.7 %.
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
 * Held flat out, the rod closes on its unloaded speed and passes it only by Havok's ring: the motor
 * is never asked for more than the tangent's zero, short of the unloaded speed, but asked with room
 * to spare it overshoots what it is asked for. At the game's rate, where the ring is largest: the
 * rod was asked for 2.77, 6.52 and 10.82 rad/s and turned at 2.76, 7.72 and 12.55, peaking at
 * 12.63 against 12. With the target held only to the unloaded speed it peaked at 12.32; with no
 * hold, 17.6.
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
    assert.ok(fastest <= curve.unloadedSpeed * 1.06, `fastest ${fastest} rad/s against ${curve.unloadedSpeed}`);
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

/**
 * A hand on a forearm, a forearm on a static post, both driven flat out: the forearm is heavy for
 * its muscles and the hand light for its own (its muscles' time constant, inertia x unloaded speed
 * over peak x (1 + 1/k), is 1.6 ms against a step of 8.3 ms at 120 Hz). A motor asked for the
 * unloaded speed carried the hand across its whole curve in one step: the hand read 4.71 m/s at
 * 0.025 s at 120 Hz against 3.64 at 1920 Hz, and 5.3 against 4.5 at 0.083 s when the hand started
 * 0.06 s after the forearm, its wrist then being stretched at 28 rad/s. Held to the tangent's zero,
 * and to the reach from rest while braked: 3.69 and 4.7.
 */
test("a light limb on a heavy one speeds up at 120 Hz as it does at a fine rate", async () => {
  const q2 = (w0) => ({ unloadedSpeed: q(w0, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") });
  const muscle = (peak, w0) => ({ peakPositive: q(peak, "N m"), peakNegative: q(peak, "N m"), speedPositive: q2(w0), speedNegative: q2(w0) });
  const segment = (name, proximal, distal, mass, inertia) => ({ name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)), inertia: q(inertia, "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.03) } });
  const pin = (name, parent, child, centre, m) => ({ name, parent, child, centre: q(centre),
    dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-30, "rad"), max: q(30, "rad"), muscle: m }] });
  const spec = { family: "test", model: "arm", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.5, 0], [0, 1.2, 0], 2, [0.02, 0.004, 0.02]),
      segment("forearm", [0, 1.2, 0], [0.19, 1.01, 0], 1.2, [0.0012, 0.0073, 0.0073]),
      segment("hand", [0.19, 1.01, 0], [0.32, 0.88, 0], 0.45, [0.0004, 0.0013, 0.0014])],
    joints: [pin("elbow", "post", "forearm", [0, 1.2, 0], muscle(70, 20)), pin("wrist", "forearm", "hand", [0.19, 1.01, 0], muscle(25, 20.7))] };
  const handAt = async (hz, delay, seconds) => {
    const stand = await coreStand(spec, { gravity: false, ground: false, pinned: "post", hz });
    let t = 0;
    const driver = driveMuscles(stand.built, stand.scene, (d, dt) => {
      d.activation[0] = 1; d.velocity[0] = 1e3;
      d.activation[1] = t + dt / 2 >= delay ? 1 : 0; d.velocity[1] = 1e3;
      t += dt;
    });
    try {
      stand.step(stand.seconds(seconds));
      const v = new Vector3();
      stand.built.segments.get("hand").body.getLinearVelocityToRef(v);
      return v.length();
    } finally { driver.dispose(); stand.dispose(); }
  };
  for (const [delay, at] of [[0, 0.025], [0.06, 0.085]]) {
    const coarse = await handAt(120, delay, at), fine = await handAt(1920, delay, at);
    assert.ok(Math.abs(coarse / fine - 1) < 0.1, `hand started at ${delay} s, at ${at} s: ${coarse} m/s at 120 Hz, ${fine} at 1920 Hz`);
  }
});

/**
 * The driver reads the torque each motor applied over the last step (`MuscleDriver.pulled`, from
 * the constraint's applied impulse), positive when the positive muscles pulled. Driven flat out it
 * is the ceiling the step was given, either way; holding the rod still it is its weight's moment
 * about the pin, opposed, but only roughly: Havok's reading of a holding motor was -12 % to +14 %
 * of the moment across six rods (`appliedAngularImpulseToRef`), and 1.327 times it on this one. The
 * pairs are read in the controller, where `pulled` and `ceiling` both still belong to the step just
 * run.
 */
test("the driver reads the torque its motor applied, and its sign is the side that pulled", async () => {
  const peak = { positive: 6, negative: 4 };
  const spec = rod(CURVES[0], peak);
  const stand = await coreStand(spec, { gravity: true, ground: false, pinned: "post", hz: 120 });
  let mode = "positive";
  const seen = [];
  const driver = driveMuscles(stand.built, stand.scene, (d, dt) => {
    seen.push([d.pulled[0], d.ceiling[0]]);
    if (mode === "hold") servo(d, () => 0, 0.1, dt);
    else { d.activation[0] = 1; d.velocity[0] = mode === "positive" ? 1e3 : -1e3; }
  });
  try {
    for (const [m, sign] of [["positive", 1], ["negative", -1]]) {
      mode = m;
      seen.length = 0;
      stand.step(4);
      // From the second step of a mode on, the step before was driven the same way.
      for (const [pulled, ceiling] of seen.slice(2)) {
        assert.ok(ceiling > 0.5 * (sign > 0 ? peak.positive : peak.negative), `${m}: ceiling ${ceiling}`);
        assert.ok(Math.abs(pulled - sign * ceiling) < 0.01 * ceiling, `${m}: pulled ${pulled} N m against a ceiling of ${ceiling}`);
      }
    }
    mode = "hold";
    stand.step(stand.seconds(1));
    // The weight's moment about the pin's axis, from where the rod's centre of mass now is.
    const s = spec.segments[1], frame = frameOf(s), axis = new Vector3(...spec.joints[0].dofs[0].axis.value).normalize();
    const node = stand.built.segments.get("rod").node;
    const offset = s.centreOfMass.value.map((x, i) => x - frame.origin[i]);
    const local = new Vector3(...[frame.x, frame.y, frame.z].map((e) => e[0] * offset[0] + e[1] * offset[1] + e[2] * offset[2]));
    const r = local.applyRotationQuaternion(node.rotationQuaternion).add(node.position).subtract(new Vector3(...spec.joints[0].centre.value));
    const weight = Vector3.Dot(Vector3.Cross(r, new Vector3(0, -9.81 * s.mass.value, 0)), axis);
    const [pulled] = seen.at(-1);
    assert.ok(Math.abs(weight) > 0.1, `the weight's moment ${weight} N m`);
    assert.ok(Math.abs(pulled + weight) < 0.4 * Math.abs(weight), `holding: pulled ${pulled} N m against the weight's ${weight}`);
  } finally { driver.dispose(); stand.dispose(); }
});

/**
 * A command lowering a weight slowly asks for speed the way the weight turns it, but the muscles
 * that pull are the ones braking. With the side read from the change asked (target minus speed),
 * the ceiling was the weak side's: on the Rogue's servoed arm at 1920 Hz the motors pulled past the
 * pulling side's ceiling on 1127 steps and were held short of it on 227. Here the rod's positive
 * muscles are far weaker than its weight's moment and its negative ones hold it, so the ceiling
 * each step must be the negative side's. Nor is the side the one that pulled last: asked then to
 * speed up past what its weight gives, the weak side pulls from the first step.
 *
 * The command is a speed within a step's reach, each step a damped move toward a goal (`ask`), as
 * the servo once gave; the servo now gives torques (`servo.ts`), so it is written out here.
 */
test("a command lowering a weight is bounded by the muscles braking it, not those it turns toward", async () => {
  const peak = { positive: 0.02, negative: 6 };
  const spec = rod(CURVES[0], peak);
  const stand = await coreStand(spec, { gravity: true, ground: false, pinned: "post", hz: 120 });
  let goal = 0, timeConstant = 0.1;
  const ask = (d, dt) => {
    const n = 1 / timeConstant, speed = d.speed(0);
    d.velocity[0] = speed + dt * (n * n * (goal - d.angle(0)) - 2 * n * speed);
    d.activation[0] = 1;
  };
  const driver = driveMuscles(stand.built, stand.scene, ask);
  try {
    stand.step(stand.seconds(0.5));
    assert.ok(driver.pulled[0] < -0.1, `held against its weight by the negative muscles: ${driver.pulled[0]} N m`);
    // Lowered toward positive angles, the way its weight turns it, at a pace its weight outruns.
    goal = 0.5; timeConstant = 1;
    const sides = [];
    for (let i = 0; i < stand.seconds(0.3); i++) {
      stand.step(1);
      const w = driver.speed(0), negative = peak.negative * forceVelocityFactor(-w, CURVES[0]);
      sides.push(Math.abs(driver.ceiling[0] - negative) < 1e-9 * negative ? "negative" : `${driver.ceiling[0]} at ${w} rad/s`);
    }
    assert.deepEqual(sides, sides.map(() => "negative"));
    assert.ok(driver.speed(0) > 0 && driver.angle(0) > 0.01, `lowered: ${driver.angle(0)} rad at ${driver.speed(0)} rad/s`);
    // Then asked to speed up past what its weight gives, within a step's reach: from the first step
    // the weak muscles pull, though the strong ones pulled the step before.
    goal = 1.5; timeConstant = 0.3;
    stand.step(1);
    const w = driver.speed(0), positive = peak.positive * forceVelocityFactor(w, CURVES[0]);
    assert.ok(driver.velocity[0] - w < forceVelocityReach(w, CURVES[0]) - w, `the ask ${driver.velocity[0]} rad/s is within reach from ${w}`);
    assert.ok(Math.abs(driver.ceiling[0] - positive) < 1e-9, `turned toward the weak side: ceiling ${driver.ceiling[0]} N m, theirs ${positive}`);
  } finally { driver.dispose(); stand.dispose(); }
});

/**
 * The inertia the driver weighs a change of speed by (the mass matrix's diagonal, `bodyDynamics`):
 * the segments beyond a joint about its axis, at the pose as it stands. On the rod it is `inertiaAboutPin`, and stays so
 * as the rod turns about the pin; on a forearm and hand the elbow's changes as the wrist bends, by
 * the hand's centre moving about the elbow, and the wrist's does not.
 */
test("the inertia beyond a joint is its segments' about the axis, at the pose as it stands", async () => {
  const spec = rod(CURVES[0], { positive: 6, negative: 6 });
  const stand = await coreStand(spec, { gravity: false, ground: false, pinned: "post" });
  const driver = driveMuscles(stand.built, stand.scene, (d, dt) => servo(d, () => 1.2, 0.05, dt));
  try {
    const dynamics = bodyDynamics(stand.built, [0, 0, 0]), expected = inertiaAboutPin(spec);
    dynamics.update([[driver.angle(0)]]);
    assert.ok(Math.abs(dynamics.mass[0][0] / expected - 1) < 1e-6, `at rest: ${dynamics.mass[0][0]} against ${expected}`);
    stand.step(stand.seconds(0.5));
    dynamics.update([[driver.angle(0)]]);
    assert.ok(Math.abs(driver.angle(0) - 1.2) < 0.02, `turned to ${driver.angle(0)} rad`);
    assert.ok(Math.abs(dynamics.mass[0][0] / expected - 1) < 1e-5, `turned: ${dynamics.mass[0][0]} against ${expected}`);
  } finally { driver.dispose(); stand.dispose(); }

  const speed = { unloadedSpeed: q(12, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const muscle = { peakPositive: q(20, "N m"), peakNegative: q(20, "N m"), speedPositive: speed, speedNegative: speed };
  const segment = (name, proximal, distal, mass, inertia) => ({ name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => 0.4 * p + 0.6 * distal[i])), inertia: q(inertia, "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.03) } });
  const pin = (name, parent, child, centre) => ({ name, parent, child, centre: q(centre),
    dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-3, "rad"), max: q(3, "rad"), muscle }] });
  const arm = { family: "test", model: "arm", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.5, 0], [0, 1.2, 0], 2, [0.02, 0.004, 0.02]),
      segment("forearm", [0, 1.2, 0], [0.19, 1.01, 0], 1.2, [0.0012, 0.0073, 0.0065]),
      segment("hand", [0.19, 1.01, 0], [0.32, 0.88, 0], 0.45, [0.0004, 0.0013, 0.0011])],
    joints: [pin("elbow", "post", "forearm", [0, 1.2, 0]), pin("wrist", "forearm", "hand", [0.19, 1.01, 0])] };
  const armStand = await coreStand(arm, { gravity: false, ground: false, pinned: "post" });
  const armDriver = driveMuscles(armStand.built, armStand.scene, (d, dt) => servo(d, (i) => [0.4, 1.2][i], 0.05, dt));
  try {
    armStand.step(armStand.seconds(0.5));
    const dynamics = bodyDynamics(armStand.built, [0, 0, 0]);
    dynamics.update([[armDriver.angle(0)], [armDriver.angle(1)]]);
    // Each segment's own moment about z, which turning about z leaves alone, and its centre's
    // distance from the axis, with the hand's centre turned about the wrist by the wrist's angle.
    const own = (s) => { const f = frameOf(s); return s.inertia.value.reduce((sum, i, k) => sum + i * [f.x, f.y, f.z][k][2] ** 2, 0); };
    const across = (v) => v[0] ** 2 + v[1] ** 2;
    const [, forearm, hand] = arm.segments, elbow = arm.joints[0].centre.value, wrist = arm.joints[1].centre.value;
    const bend = armDriver.angle(1), c = Math.cos(bend), s = Math.sin(bend);
    const h = hand.centreOfMass.value.map((x, i) => x - wrist[i]);
    const handFromElbow = [wrist[0] - elbow[0] + c * h[0] - s * h[1], wrist[1] - elbow[1] + s * h[0] + c * h[1]];
    const handAboutWrist = own(hand) + hand.mass.value * across(h);
    const forearmAboutElbow = own(forearm) + forearm.mass.value * across(forearm.centreOfMass.value.map((x, i) => x - elbow[i]));
    assert.ok(Math.abs(bend - 1.2) < 0.05, `wrist at ${bend} rad`);
    assert.ok(Math.abs(dynamics.mass[1][1] / handAboutWrist - 1) < 1e-6, `wrist: ${dynamics.mass[1][1]} against ${handAboutWrist}`);
    const elbowExpected = forearmAboutElbow + own(hand) + hand.mass.value * across(handFromElbow);
    // The joints give a little under load, so the bent chain is read to 1e-3, against the bend's 5 %.
    assert.ok(Math.abs(dynamics.mass[0][0] / elbowExpected - 1) < 1e-3, `elbow: ${dynamics.mass[0][0]} against ${elbowExpected}`);
    const straight = forearmAboutElbow + own(hand) + hand.mass.value * across(hand.centreOfMass.value.map((x, i) => x - elbow[i]));
    assert.ok(Math.abs(elbowExpected / straight - 1) > 0.05, `the bend moves the elbow's inertia: ${elbowExpected} against ${straight} straight`);
  } finally { armDriver.dispose(); armStand.dispose(); }
});
