/**
 * The body's dynamics in its joints' speeds (`src/core/build/dynamics.ts`), read against the
 * engine's own motion: half of u' M u is the kinetic energy of the bodies as the engine moves them, and
 * gravity's term times u is the rate gravity does work on them. Node stand, a chain of a
 * three-, a two- and a one-freedom joint on tilted axes, hung from a fixed post and pushed about
 * by its muscles. Rapier (until 2026-09-29, Havok).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { bodyDynamics } from "../src/core/build/dynamics.ts";
import { jointTracker } from "../src/core/build/joint-state.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the dynamics tests");

/** Orthonormal triads off the world's axes, one per joint, so no term can pass by alignment. */
const TRIADS = [
  [[0.8, 0.6, 0], [-0.6, 0.8, 0], [0, 0, 1]],
  [[0, 0.6, 0.8], [1, 0, 0], [0, 0.8, -0.6]],
  [[0.48, 0.36, 0.8], [-0.6, 0.8, 0], [-0.64, -0.48, 0.6]],
];

function chain() {
  const speed = { unloadedSpeed: q(20, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const muscle = { peakPositive: q(2, "N m"), peakNegative: q(2, "N m"), speedPositive: speed, speedNegative: speed };
  // Each centre of mass off its segment's line and each inertia unequal, so neither is guessed.
  const segment = (name, proximal, distal, mass, inertia) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => 0.55 * p + 0.45 * distal[i] + [0.01, -0.02, 0.015][i])),
    inertia: q(inertia, "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.03) },
  });
  const joint = (name, parent, child, centre, triad, count) => ({
    name, parent, child, centre: q(centre),
    dofs: triad.slice(0, count).map((axis, k) => ({ positive: `p${k}`, negative: `n${k}`, axis: q(axis, "1"),
      min: q(-1.3, "rad"), max: q(1.3, "rad"), muscle })),
  });
  return {
    family: "test", model: "chain", mass: q(5, "kg"), stature: q(1.5),
    segments: [
      segment("post", [0, 1.6, 0], [0, 1.3, 0], 2, [0.02, 0.004, 0.02]),
      segment("upper", [0, 1.3, 0], [0.12, 1.0, 0.05], 1.6, [0.012, 0.003, 0.014]),
      segment("lower", [0.12, 1.0, 0.05], [0.3, 0.8, 0.12], 1.1, [0.006, 0.0015, 0.007]),
      segment("end", [0.3, 0.8, 0.12], [0.38, 0.66, 0.2], 0.5, [0.0012, 0.0005, 0.0014]),
    ],
    joints: [
      joint("root", "post", "upper", [0, 1.3, 0], TRIADS[0], 3),
      joint("middle", "upper", "lower", [0.12, 1.0, 0.05], TRIADS[1], 2),
      joint("tip", "lower", "end", [0.3, 0.8, 0.12], TRIADS[2], 1),
    ],
  };
}

/**
 * The chain holding a rod in its last segment, turned off every axis: the rigid body's inertia has
 * products (`src/core/build/rigid.ts`), which the model must turn with the segment.
 */
function holding() {
  const spec = chain();
  const rod = {
    name: "rod", mass: q(0.9, "kg"), centreOfMass: q([0.004, 0.2, -0.006]), inertia: q([0.011, 0.0008, 0.013], "kg m2"),
    shapes: [{ kind: "capsule", from: q([0, 0.03, 0]), to: q([0, 0.37, 0]), radius: q(0.02) }], points: {},
  };
  return { ...spec, held: [{ segment: "end", item: rod, origin: q([0.38, 0.66, 0.2]), along: q([0.3, -0.2, 0.9], "1"), across: q([1, 0.4, 0], "1") }] };
}

/** Half of w' T w, with T a rigid body's tensor in the frame `w` is given in. */
const spinEnergy = ([xx, yy, zz, xy, xz, yz], w) =>
  0.5 * (xx * w.x ** 2 + yy * w.y ** 2 + zz * w.z ** 2) + xy * w.x * w.y + xz * w.x * w.z + yz * w.y * w.z;

/**
 * At 960 Hz and a quarter of these muscles' strength the energy agrees to 0.07 % (0.13 % holding
 * the rod) and the power to 0.19 % (0.11 %) of what gravity could do at those speeds. On Havok the
 * figures were 0.73 % and 0.24 %, and its joints gave when driven harder and coarser: at 8 N m and
 * 120 Hz the one-freedom joint turned 2.8 rad/s about its locked axes at 15 rad/s, and the energy
 * read 23 % off. There, dropping the two-freedom joint's lean read 75 % off in energy and 9 % in
 * power; a composite's parallel axis term, the couplings between joints, or the parent's turn of
 * the axes, 100 % or more; gravity's moment about the wrong joint, 45 % in power.
 */
for (const [what, spec] of [["the chain", chain], ["the chain holding a rod", holding]]) test(`the mass matrix gives ${what}'s kinetic energy and gravity's term its power, as the engine moves it`, async () => {
  const stand = await coreStand(spec(), { ground: false, pinned: "post", hz: 960 });
  const g = new Vector3(...stand.world.physics.gravity);
  let seed = 7, tick = 0;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // A new push on every freedom each tenth of a second, either way, at 30-80 % of its strength.
  const driver = driveMuscles(stand.built, stand.world, (d) => {
    if (tick++ % stand.seconds(0.1) !== 0) return;
    for (let i = 0; i < d.channels.length; i++) { d.velocity[i] = random() > 0 ? 1e3 : -1e3; d.activation[i] = 0.3 + 0.5 * Math.abs(random()); }
  });
  const dynamics = bodyDynamics(stand.built, stand.world.physics.gravity);
  const joints = [...stand.built.joints.values()], trackers = joints.map(jointTracker);
  const segments = [...stand.built.segments.values()].filter((s) => s.spec.name !== "post");
  const angularVelocity = (segment) => { const w = new Vector3(); segment.body.angularVelocityToRef(w); return w; };
  const v = new Vector3(), local = new Vector3(), inverse = new Quaternion();
  let worstEnergy = 0, worstPower = 0, largest = 0, bent = 0;
  try {
    for (let sample = 0; sample < 12; sample++) {
      stand.step(stand.seconds(0.05));
      // The driver reads before the step it commands; read the pose and speeds as the step left them.
      trackers.forEach((tracker) => tracker.update(angularVelocity));
      dynamics.update(trackers.map((tracker) => tracker.angles));
      const speeds = trackers.flatMap((tracker) => tracker.speeds);
      let energy = 0, power = 0, scale = 0;
      for (const s of segments) {
        s.body.linearVelocityToRef(v);
        // The spin in the segment's frame, which its node carries and its inertia lies along.
        Quaternion.InverseToRef(s.node.rotationQuaternion, inverse);
        angularVelocity(s).rotateByQuaternionToRef(inverse, local);
        // The rigid body's: the segment's own numbers, or with what it holds.
        const m = s.rigid.mass;
        energy += 0.5 * m * v.lengthSquared() + spinEnergy(s.rigid.tensor, local);
        power += m * Vector3.Dot(g, v);
        scale += m * g.length() * v.length();
      }
      let modelEnergy = 0, modelPower = 0;
      speeds.forEach((uf, f) => {
        modelPower += dynamics.gravity[f] * uf;
        speeds.forEach((uh, h) => { modelEnergy += 0.5 * uf * dynamics.mass[f][h] * uh; });
      });
      worstEnergy = Math.max(worstEnergy, Math.abs(modelEnergy / energy - 1));
      worstPower = Math.max(worstPower, Math.abs(modelPower - power) / scale);
      largest = Math.max(largest, energy);
      bent = Math.max(bent, Math.abs(trackers[1].angles[1]));
    }
  } finally { driver.dispose(); stand.dispose(); }
  assert.ok(largest > 0.2 && bent > 0.3, `the chain moved: ${largest} J at most, the two-freedom joint's second angle to ${bent} rad`);
  assert.ok(worstEnergy < 0.02, `kinetic energy off by ${(100 * worstEnergy).toFixed(2)} %`);
  assert.ok(worstPower < 0.02, `gravity's power off by ${(100 * worstPower).toFixed(2)} %`);
});

/** Solve A x = b by elimination with partial pivoting; A is copied. */
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Let go turning, with no gravity, the chain's joints speed up and slow down only by the motion
 * under way, M u' = -bias. At 480 Hz a step's change of the joints' speeds reads 2.4 % off that at
 * the median; the steps where a joint meets its limit or the chain meets itself read wholly off,
 * and are why the median is taken.
 *
 * Rapier moves each step's speeds by a disturbance of its own that does not shrink with the step
 * (about 0.007 rad/s a step on these joints), so a difference over one step reads it as an
 * acceleration growing with the rate: 2.3 % off at 240 Hz, 2.4 % at 480, 6.7 % at 960, 25 % at 1920
 * and 70 % at 3840, the same with the steps at a stop left out. Its cause is not established (the
 * joints' drift correction is the suspect: their anchors part by under a micrometre). Leaving out
 * the gyroscopic torque, which Rapier applies, read 25.9 % against 25.0 % at 1920 Hz. On Havok, at
 * 1920 Hz, dropping the parent's carrying of the joint axes read 41 % off, the parent's own angular
 * acceleration 20 %, the joint centre's swing with its parent 43 % and the child's centre's 56 %.
 */
test("the motion under way gives the chain's joint accelerations as the engine moves it, let go with no gravity", async () => {
  const stand = await coreStand(chain(), { ground: false, gravity: false, pinned: "post", hz: 480 });
  let seed = 11, tick = 0;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const driver = driveMuscles(stand.built, stand.world, (d) => {
    if (tick++ % stand.seconds(0.1) !== 0) return;
    for (let i = 0; i < d.channels.length; i++) { d.velocity[i] = random() > 0 ? 1e3 : -1e3; d.activation[i] = 0.5 + 0.5 * Math.abs(random()); }
  });
  const dynamics = bodyDynamics(stand.built, [0, 0, 0]);
  const trackers = [...stand.built.joints.values()].map(jointTracker);
  const spin = new Map([...stand.built.segments.values()].map((s) => [s, new Vector3()]));
  const motion = { spin: (s) => spin.get(s) };
  const read = () => {
    for (const [s, w] of spin) s.body.angularVelocityToRef(w);
    trackers.forEach((tracker) => tracker.update(motion.spin));
    dynamics.update(trackers.map((tracker) => tracker.angles), motion);
    return trackers.flatMap((tracker) => tracker.speeds);
  };
  const norm = (a) => Math.hypot(...a);
  const errors = [], sizes = [];
  try {
    stand.step(stand.seconds(0.25));
    driver.dispose();
    let speeds = read();
    for (let s = 0; s < stand.seconds(0.25); s++) {
      const predicted = solve(dynamics.mass.map((row) => [...row]), [...dynamics.bias].map((b) => -b));
      stand.step(1);
      const next = read(), observed = next.map((u, i) => (u - speeds[i]) * stand.world.hz);
      errors.push(norm(observed.map((o, i) => o - predicted[i])) / norm(observed));
      sizes.push(norm(observed));
      speeds = next;
    }
  } finally { stand.dispose(); }
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  assert.ok(median(sizes) > 30, `the joints' speeds changed at ${median(sizes)} rad/s^2 at the median`);
  assert.ok(median(errors) < 0.1, `a step's change of speed read ${(100 * median(errors)).toFixed(1)} % off at the median`);
});
