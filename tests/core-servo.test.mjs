/**
 * The joint servo (`src/core/control/servo.ts`): a freedom pulled toward its goal follows the
 * critically damped motion it asks for, from rest and while braking a joint turning fast, at the
 * game's 120 Hz and at 480 Hz; and a chain does, alike at 120 Hz and 960 Hz. Node stand: one rod
 * hung from a fixed post, and the Rogue's arm on its held upper trunk, gravity on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { servo } from "../src/core/control/servo.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the servo tests");

/**
 * A 1 kg rod hung by one freedom square to gravity, so its weight loads the servo. Its muscles are
 * strong and fast enough that the motion asked for stays within them; `peak` weakens them.
 */
function rod(peak = 400) {
  const speed = { unloadedSpeed: q(60, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) }, surface: { stiffness: q(1e5, "N/m") },
  });
  return {
    family: "test", model: "rod", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.5, 0], [0, 1, 0], 2), segment("rod", [0, 1, 0], [0.3, 0.6, 0], 1)],
    joints: [{ name: "pin", parent: "post", child: "rod", centre: q([0, 1, 0]),
      dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-3, "rad"), max: q(3, "rad"),
        muscle: { peakPositive: q(peak, "N m"), peakNegative: q(peak, "N m"), speedPositive: speed, speedNegative: speed } }] }],
  };
}

/**
 * Where a critically damped joint is `t` seconds after it stood `e` rad past its goal turning at
 * `w` rad/s, with n = 1 / time constant: e(t) = (e + (w + n e) t) exp(-n t).
 */
const damped = (e, w, n, t) => (e + (w + n * e) * t) * Math.exp(-n * t);

/**
 * Run the rod: `swing` seconds with its muscles pulling toward positive angles at a tenth of their
 * strength, then the servo toward `goal` for `seconds`. Returns the servo's path, one row per step
 * (seconds since it took over, error, speed), and the error and speed it took the rod at.
 */
async function servoRun(hz, { goal, swing = 0, seconds = 0.6, timeConstant = 0.1, peak }) {
  const stand = await coreStand(rod(peak), { ground: false, pinned: "post", hz });
  let time = 0;
  const driver = driveMuscles(stand.built, stand.world, (d, dt) => {
    if (time + dt / 2 < swing) { d.velocity[0] = Infinity; d.activation[0] = 0.1; } else servo(d, () => goal, timeConstant, dt);
    time += dt;
  });
  try {
    stand.step(stand.seconds(swing));
    const e0 = driver.angle(0) - goal, w0 = driver.speed(0);
    const path = [];
    for (let k = 1; k <= stand.seconds(seconds); k++) {
      stand.step(1);
      path.push([k / stand.seconds(1), driver.angle(0) - goal, driver.speed(0)]);
    }
    return { path, e0, w0 };
  } finally { driver.dispose(); stand.dispose(); }
}

/** The largest gap between a run's path and the damped motion from where the servo took it. */
const gapOf = ({ path, e0, w0 }, timeConstant = 0.1) =>
  Math.max(...path.map(([t, e]) => Math.abs(e - damped(e0, w0, 1 / timeConstant, t))));

/**
 * The servo gives the torque the damped motion takes, and the rod follows it without overshoot, at
 * 120 Hz and 480 Hz, toward goals either side.
 */
test("a joint servoed from rest follows the critically damped motion toward its goal, holding its weight", async () => {
  for (const hz of [120, 480]) {
    for (const goal of [1, -0.8]) {
      const run = await servoRun(hz, { goal });
      const overshoot = Math.max(...run.path.map(([, e]) => -Math.sign(run.e0) * e));
      assert.ok(gapOf(run) < 0.025, `${hz} Hz toward ${goal}: ${gapOf(run)} rad off the damped motion`);
      assert.ok(overshoot < 0.005, `${hz} Hz toward ${goal}: overshot by ${overshoot} rad`);
    }
  }
});

/**
 * A rod swung fast, then servoed to 0. The servo asks for one step of the damped motion's
 * acceleration at a time, so no step changes the speed by much more than that, and 120 Hz and
 * 480 Hz brake alike. Asked for (goal - angle) / t instead, the rod would reverse within a step.
 */
test("a joint turning fast is braked a step's acceleration at a time, alike at 120 Hz and 480 Hz", async () => {
  const runs = {};
  for (const hz of [120, 480]) {
    const run = await servoRun(hz, { goal: 0, swing: 0.125, seconds: 0.5 });
    const { path, e0, w0 } = run, n = 1 / 0.1;
    assert.ok(w0 > 15 && e0 > 1, `${hz} Hz: the rod swung, to ${e0} rad at ${w0} rad/s`);
    const asked = (n * n * e0 + 2 * n * w0) / hz;
    const jump = Math.max(...path.map(([, , w], k) => Math.abs(w - (k ? path[k - 1][2] : w0))));
    assert.ok(jump < 1.2 * asked, `${hz} Hz: the speed changed ${jump} rad/s in a step, where the damped motion asks ${asked}`);
    runs[hz] = path;
  }
  const apart = Math.max(...runs[120].map(([t, e]) => Math.abs(e - runs[480].find(([u]) => Math.abs(u - t) < 1e-9)[1])));
  assert.ok(apart < 0.08, `120 Hz and 480 Hz braked ${apart} rad apart`);
});

/**
 * At 5 N m the rod cannot follow the damped motion toward 1 rad in 0.1 s: it lags and still
 * arrives, and given 0.4 s it follows.
 */
test("a servo asking for more than the muscles hold is bounded by them and gets there later", async () => {
  const weak = await servoRun(120, { goal: 1, peak: 5, seconds: 1.5 });
  assert.ok(gapOf(weak) > 0.1, `a weak rod kept up with the damped motion: ${gapOf(weak)} rad`);
  assert.ok(Math.abs(weak.path.at(-1)[1]) < 0.002, `a weak rod did not arrive: ${weak.path.at(-1)[1]} rad short`);
  const slow = await servoRun(120, { goal: 1, peak: 5, seconds: 1.5, timeConstant: 0.4 });
  assert.ok(gapOf(slow, 0.4) < 0.05, `given 0.4 s it follows: ${gapOf(slow, 0.4)} rad`);
});

/**
 * A chain servoed through a pose where its joints' angles and speeds part: the Rogue's right arm on
 * its held upper trunk, gravity on, its shoulder swung 1.9 rad with the elbow bent, then servoed back
 * to its reference pose. On the way back the hand's path and peak speed at 120 Hz match 960 Hz. The
 * pose is held 1.2 s, since raising the arm flings the elbow straight for a moment.
 */
test("a servoed arm moves alike at 120 Hz and 960 Hz, through a pose where angles and speeds part", async () => {
  const full = humanSpec("workshop-rogue");
  const keep = ["upperTrunk", "upperArm.right", "forearm.right", "hand.right"];
  const spec = { ...full, segments: full.segments.filter((s) => keep.includes(s.name)),
    joints: full.joints.filter((j) => keep.includes(j.parent) && keep.includes(j.child)) };
  const pose = { "shoulder.right flexion": 0.8, "shoulder.right abduction": 1.8, "shoulder.right internal rotation": 0.6, "elbow.right flexion": 1.4 };
  const runs = {};
  for (const hz of [120, 960]) {
    const stand = await coreStand(spec, { ground: false, pinned: "upperTrunk", hz });
    let returning = false;
    const driver = driveMuscles(stand.built, stand.world, (d, dt) =>
      servo(d, (i) => (returning ? 0 : pose[d.channels[i].name] ?? 0), 0.1, dt));
    try {
      stand.step(stand.seconds(1.2));
      for (const [name, goal] of Object.entries(pose)) {
        const angle = driver.angle(driver.channel(name));
        assert.ok(Math.abs(angle - goal) < 0.1, `${hz} Hz: ${name} reached ${angle} rad, asked ${goal}`);
      }
      returning = true;
      const hand = stand.built.segments.get("hand.right"), v = new Vector3(), path = [];
      let peak = 0;
      for (let i = 1; i <= stand.seconds(0.5); i++) {
        stand.step(1);
        hand.body.linearVelocityToRef(v);
        peak = Math.max(peak, v.length());
        if (i % stand.seconds(0.05) === 0) path.push(hand.node.position.clone());
      }
      runs[hz] = { peak, path };
    } finally { driver.dispose(); stand.dispose(); }
  }
  const { 120: coarse, 960: fine } = runs;
  const apart = Math.max(...coarse.path.map((p, k) => Vector3.Distance(p, fine.path[k])));
  assert.ok(fine.peak > 1.5, `the hand came back at ${fine.peak} m/s`);
  assert.ok(Math.abs(coarse.peak / fine.peak - 1) < 0.03, `hand peak ${coarse.peak} m/s at 120 Hz against ${fine.peak}`);
  assert.ok(apart < 0.03, `the hand's paths ${apart} m apart`);
});

/** Two rods hung on pins about z, from a static post, weightless: `upperPeak` and `lowerPeak` N m. */
function pair(upperPeak, lowerPeak) {
  const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const muscle = (peak) => ({ peakPositive: q(peak, "N m"), peakNegative: q(peak, "N m"), speedPositive: speed, speedNegative: speed });
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.03) }, surface: { stiffness: q(1e5, "N/m") },
  });
  const pin = (name, parent, child, centre, peak) => ({ name, parent, child, centre: q(centre),
    dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-3, "rad"), max: q(3, "rad"), muscle: muscle(peak) }] });
  return {
    family: "test", model: "pair", mass: q(4.5, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.6, 0], [0, 1.3, 0], 2), segment("upper", [0, 1.3, 0], [0, 0.95, 0], 1.5),
      segment("lower", [0, 0.95, 0], [0, 0.6, 0], 1)],
    joints: [pin("shoulder", "post", "upper", [0, 1.3, 0], upperPeak), pin("elbow", "upper", "lower", [0, 0.95, 0], lowerPeak)],
  };
}

/**
 * The servo solves its torques around the joints it does not servo and the ones its muscles cannot
 * drive as asked, since what those do turns the rest: a rod held while the one below it is pushed
 * flat out barely strays, and a rod held below a weak one servoed toward 1 rad barely moves. Taking
 * the push to give nothing, or the weak rod to give the torque its motion asks, fails each. The
 * push is set in the goal callback, before the servo reads it.
 */
test("a servo holds its joints around a push, and around a joint its muscles cannot drive as asked", async () => {
  for (const hz of [120, 960]) {
    const pushed = await coreStand(pair(60, 20), { ground: false, gravity: false, pinned: "post", hz });
    let time = 0, strayed = 0;
    const holding = driveMuscles(pushed.built, pushed.world, (d, dt) => {
      const pushing = time < 0.15;
      time += dt;
      servo(d, (i) => {
        if (i !== 1 || !pushing) return 0;
        d.velocity[1] = 1e3; d.activation[1] = 1;
        return undefined;
      }, 0.1, dt);
    });
    try {
      for (let i = 0; i < pushed.seconds(0.15); i++) { pushed.step(1); strayed = Math.max(strayed, Math.abs(holding.angle(0))); }
      assert.ok(holding.angle(1) > 1, `${hz} Hz: the push turned the lower rod to ${holding.angle(1)} rad`);
      assert.ok(strayed < 0.12, `${hz} Hz: the held rod strayed ${strayed} rad under the push`);
    } finally { holding.dispose(); pushed.dispose(); }

    const weak = await coreStand(pair(3, 30), { ground: false, gravity: false, pinned: "post", hz });
    let moved = 0;
    const lifting = driveMuscles(weak.built, weak.world, (d, dt) => servo(d, (i) => (i === 0 ? 1 : 0), 0.1, dt));
    try {
      for (let i = 0; i < weak.seconds(0.4); i++) { weak.step(1); moved = Math.max(moved, Math.abs(lifting.angle(1))); }
      assert.ok(lifting.angle(0) > 0.3 && lifting.angle(0) < 0.6, `${hz} Hz: the weak rod lagged, at ${lifting.angle(0)} rad after 0.4 s`);
      assert.ok(moved < 0.02, `${hz} Hz: the held rod moved ${moved} rad`);
    } finally { lifting.dispose(); weak.dispose(); }
  }
});
