/**
 * A tendon in series with a freedom's muscles (`MuscleSpec.tendonPositive`, `tendonNegative`;
 * `src/core/muscle/driver.ts`). Node stand, 120 Hz, no gravity: a rod on a pinned post, its muscles
 * pressing against a steady load as strong as they are, then let go. Its motion follows the
 * series model -- the rod turned by the tendon's pull, k (fibres' angle - joint's angle) while
 * stretched, and the fibres moving at the speed at which activation x peak x force-velocity equals
 * that pull -- integrated here finely; and a rod with no tendon at all is the rigid driver's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { forceVelocityFactor } from "../src/core/muscle/force-velocity.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { frameOf } from "../src/core/spec/body.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the tendon tests");

/** A curve unlike any human's, so a test cannot pass on a remembered number. */
const CURVE = { unloadedSpeed: 12, curvature: 0.3, eccentricCeiling: 1.5, eccentricSlopeRatio: 3 };
const PEAK = 6, STIFFNESS = 20;

/**
 * A rod hung on a static post. `axes` are the joint's freedoms' axes; the first is driven, the
 * others held at zero by their limits; `tendon` puts a tendon of `STIFFNESS` on the driven
 * freedom's positive or negative muscles, or none.
 */
function rod(tendon, axes = [[0.8, 0.6, 0]], driven = 0) {
  const speed = () => Object.fromEntries(Object.entries(CURVE).map(([k, v]) => [k, q(v, k === "unloadedSpeed" ? "rad/s" : "1")]));
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) }, surface: { stiffness: q(1e5, "N/m") },
  });
  const spring = { stiffness: q(STIFFNESS, "N m/rad") };
  const dofs = axes.map((axis, k) => ({
    positive: `p${k}`, negative: `n${k}`, axis: q(axis, "1"), min: q(k === driven ? -3 : 0, "rad"), max: q(k === driven ? 3 : 0, "rad"),
    muscle: { peakPositive: q(PEAK, "N m"), peakNegative: q(PEAK, "N m"), speedPositive: speed(), speedNegative: speed(),
      ...(k === driven && tendon === "positive" ? { tendonPositive: spring } : {}), ...(k === driven && tendon === "negative" ? { tendonNegative: spring } : {}) },
  }));
  return {
    model: "rod", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [0, 1.5, 0], [0, 1, 0], 2), segment("rod", [0, 1, 0], [0.1, 0.55, 0.05], 1)],
    joints: [{ name: "pin", parent: "post", child: "rod", centre: q([0, 1, 0]), dofs }],
  };
}

/** The rod's moment of inertia about `axis` through the pin, from its spec: its own, turned, plus m d^2. */
function inertiaAboutPin(spec, axis) {
  const s = spec.segments[1], n = Math.hypot(...axis), u = axis.map((x) => x / n), frame = frameOf(s);
  const inFrame = [frame.x, frame.y, frame.z].map((e) => e[0] * u[0] + e[1] * u[1] + e[2] * u[2]);
  const own = s.inertia.value.reduce((sum, i, k) => sum + i * inFrame[k] ** 2, 0);
  const r = s.centreOfMass.value.map((c, i) => c - spec.joints[0].centre.value[i]);
  const across = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
  return own + s.mass.value * across.reduce((sum, v) => sum + v * v, 0);
}

/** The fibres' speed at which `activation` x peak x force-velocity gives `pull`, by halving. */
function fibreSpeedFor(pull, activation) {
  let lo = -1e3 * CURVE.unloadedSpeed, hi = CURVE.unloadedSpeed;
  if (pull >= activation * PEAK * CURVE.eccentricCeiling) return -Infinity;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (activation * PEAK * forceVelocityFactor(mid, CURVE) > pull) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * The series model integrated finely from rest, in the sense the muscles pull: the rod's angle
 * and speed, the fibres' angle; a load `load(t)` against the pull.
 */
function seriesModel(inertia, activation, load, times) {
  const h = 2e-5;
  let theta = 0, omega = 0, fibre = 0, t = 0;
  const out = [];
  for (const at of times) {
    for (; t < at - h / 2; t += h) {
      const pull = STIFFNESS * Math.max(0, fibre - theta);
      const v = fibreSpeedFor(pull, activation);
      omega += h * (pull - load(t)) / inertia;
      theta += h * omega;
      fibre = Number.isFinite(v) ? fibre + h * v : theta;
    }
    out.push({ theta, omega, pull: STIFFNESS * Math.max(0, fibre - theta) });
  }
  return out;
}

/**
 * The rod pressed by its muscles at `activation` against a load as strong, which lets go at
 * `release` s; read at `times` (s) in the sense the driven muscles pull.
 */
async function pressAndRelease(spec, axis, driven, sense, activation, release, times) {
  const stand = await coreStand(spec, { gravity: false, ground: false, pinned: "post", hz: 120, actuation: "directional" });
  const driver = driveMuscles(stand.built, stand.world, (d) => {
    d.velocity.fill(0); d.activation.fill(0);
    d.activation[driven] = activation; d.velocity[driven] = sense * Infinity;
  });
  try {
    const body = stand.built.segments.get("rod").body, unit = new Vector3(...axis).normalize();
    const load = activation * PEAK;
    stand.world.beforeStep(() => { if (stand.world.time < release - 1e-9) body.applyTorqueImpulse(unit.scale(-sense * load * stand.world.dt)); });
    const out = [];
    let stepped = 0;
    for (const at of times) {
      stand.step(stand.seconds(at) - stepped);
      stepped = stand.seconds(at);
      out.push({ omega: sense * driver.speed(driven), pull: sense * driver.pulled[driven] });
    }
    return out;
  } finally { driver.dispose(); stand.dispose(); }
}

/** When the rod is read, s: twice while it is held, then as it goes. */
const TIMES = [0.5, 1, 1.0417, 1.0833, 1.15, 1.25];

/**
 * The driver reads a joint at the start of each step, so its reading after a step is the motion a
 * step before: the model is read a step early. Measured differences after the release are under
 * 1.6 % of the speed; the rigid driver's, the control, are 7 to 12 %.
 */
test("a rod pressed through a tendon and let go moves as the series model says, both ways round and on an axis run backwards", async () => {
  const cases = [
    { tendon: "positive", sense: 1, axes: [[0.8, 0.6, 0]] },
    { tendon: "negative", sense: -1, axes: [[0.8, 0.6, 0]] },
    // The driven freedom third, its axis against the constraint's Z, X cross Y.
    { tendon: "positive", sense: 1, axes: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], driven: 2 },
    { tendon: null, sense: 1, axes: [[0.8, 0.6, 0]] },
  ];
  const activation = 0.5, release = 1, dt = 1 / 120;
  for (const { tendon, sense, axes, driven = 0 } of cases) {
    const spec = rod(tendon, axes, driven);
    const read = await pressAndRelease(spec, axes[driven], driven, sense, activation, release, TIMES);
    const model = seriesModel(inertiaAboutPin(spec, axes[driven]), activation, (t) => (t < release ? activation * PEAK : 0), TIMES.map((t) => t - dt));
    const label = `${tendon ?? "no"} tendon on ${JSON.stringify(axes[driven])}`;
    // Held: still, and pulling as hard as the load.
    assert.ok(Math.abs(read[1].omega) < 0.01 && Math.abs(read[1].pull - activation * PEAK) < 0.01, `${label}, held: ${JSON.stringify(read[1])}`);
    const gaps = read.slice(2).map((r, k) => Math.abs(r.omega - model[k + 2].omega) / model[k + 2].omega);
    if (tendon === null) assert.ok(gaps.every((g) => g > 0.05), `${label} follows the series model: ${gaps}`);
    else assert.ok(gaps.every((g) => g < 0.03), `${label}: speeds ${read.map((r) => r.omega)}, the model's ${model.map((m) => m.omega)}`);
  }
});
