/**
 * The joint servo (`src/core/control/servo.ts`): a freedom pulled toward its goal follows the
 * critically damped motion it asks for, from rest and while braking a joint turning fast, at the
 * game's 120 Hz and at 480 Hz. Node stand, one rod hung from a static post, gravity on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { servoToward } from "../src/core/control/servo.ts";
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
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) },
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
  const driver = driveMuscles(stand.built, stand.scene, (d, dt) => {
    if (time + dt / 2 < swing) { d.velocity[0] = Infinity; d.activation[0] = 0.1; } else servoToward(d, 0, goal, timeConstant, dt);
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
 * Havok's velocity motor adds about a third to each change of speed it is asked for, and returns
 * it over the next steps: a strong rod asked for 0.83 rad/s from rest turned at 1.08. So a servoed
 * rod runs 3-4 % of its move ahead of the damped motion, at 120 Hz and 480 Hz alike (0.027-0.040
 * rad on moves of 0.8 and 1 rad), and the bounds here leave room for that and no more.
 */
test("a joint servoed from rest follows the critically damped motion toward its goal, holding its weight", async () => {
  for (const hz of [120, 480]) {
    for (const goal of [1, -0.8]) {
      const run = await servoRun(hz, { goal });
      const overshoot = Math.max(...run.path.map(([, e]) => -Math.sign(run.e0) * e));
      assert.ok(gapOf(run) < 0.05, `${hz} Hz toward ${goal}: ${gapOf(run)} rad off the damped motion`);
      assert.ok(overshoot < 0.005, `${hz} Hz toward ${goal}: overshot by ${overshoot} rad`);
    }
  }
});

/**
 * The defect this servo replaced: asked for (goal - angle) / t, a rod swung to 1.7 rad at 21 rad/s
 * changed speed by 47 rad/s in one step at 120 Hz (12 at 480), reversing. This servo asks for one
 * step of the damped motion's acceleration, largest at the switch, so no step changes the speed by
 * more than that and the motor's third (6.4 rad/s at 120 Hz, against 5.0 asked; 1.8 at 480,
 * against 1.25), and the two rates brake alike: 0.06 rad apart, where the old servo was 0.11.
 */
test("a joint turning fast is braked a step's acceleration at a time, alike at 120 Hz and 480 Hz", async () => {
  const runs = {};
  for (const hz of [120, 480]) {
    const run = await servoRun(hz, { goal: 0, swing: 0.125, seconds: 0.5 });
    const { path, e0, w0 } = run, n = 1 / 0.1;
    assert.ok(w0 > 15 && e0 > 1, `${hz} Hz: the rod swung, to ${e0} rad at ${w0} rad/s`);
    const asked = (n * n * e0 + 2 * n * w0) / hz;
    const jump = Math.max(...path.map(([, , w], k) => Math.abs(w - (k ? path[k - 1][2] : w0))));
    assert.ok(jump < 2 * asked, `${hz} Hz: the speed changed ${jump} rad/s in a step, where the damped motion asks ${asked}`);
    runs[hz] = path;
  }
  const apart = Math.max(...runs[120].map(([t, e]) => Math.abs(e - runs[480].find(([u]) => Math.abs(u - t) < 1e-9)[1])));
  assert.ok(apart < 0.08, `120 Hz and 480 Hz braked ${apart} rad apart`);
});

test("a servo asking for more than the muscles hold is bounded by them and gets there later", async () => {
  // At 5 N m the rod cannot follow the damped motion toward 1 rad in 0.1 s; it lags and arrives.
  const weak = await servoRun(120, { goal: 1, peak: 5, seconds: 1.5 });
  assert.ok(gapOf(weak) > 0.1, `a weak rod kept up with the damped motion: ${gapOf(weak)} rad`);
  assert.ok(Math.abs(weak.path.at(-1)[1]) < 0.01, `a weak rod did not arrive: ${weak.path.at(-1)[1]} rad short`);
  const slow = await servoRun(120, { goal: 1, peak: 5, seconds: 1.5, timeConstant: 0.4 });
  assert.ok(gapOf(slow, 0.4) < 0.05, `given 0.4 s it follows: ${gapOf(slow, 0.4)} rad`);
});
