/**
 * `jointAngles` reads a joint in the engine's own coordinates: the angles a Havok limit acts on.
 * Node stand, two rods.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { anglesOf, jointTracker, motionAxesToRef, ratesToRef, relativeRotationToRef, rotationOfToRef, turningToRef } from "../src/core/build/joint-state.ts";
import { servo } from "../src/core/control/servo.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the joint-state tests");

/** Axes tilted off the world's, so a decomposition that forgot them cannot pass by accident. */
const X = [0.8, 0.6, 0], Y = [-0.6, 0.8, 0], Z = [0, 0, 1];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const turned = (rotation, v) => new Vector3(...v).applyRotationQuaternion(rotation).asArray();

/** A seeded generator in [0, 1). */
const random = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/**
 * Havok's limits measure a joint as its ragdoll constraint does: the swing is the shortest turn
 * taking the parent's X to the child's, read as its rotation vector along Y and Z; the twist is the
 * angle between the parent's Y and the child's, both laid flat on the plane square to the axis
 * halfway between the two X's. Each is built here from those words, against rotations drawn at
 * random and read by `anglesOf`, and the angles turned back into a rotation give the rotation.
 */
test("a rotation reads as its swing of X and its twist about the halfway axis, and turns back into itself", () => {
  const next = random(11);
  let worst = 0, undone = 0, twistApart = 0, drawn = 0;
  while (drawn < 200) {
    const rotation = new Quaternion(next() - 0.5, next() - 0.5, next() - 0.5, next() - 0.5).normalize();
    const cx = turned(rotation, X), axis = cross(X, cx), sine = Math.hypot(...axis), swing = Math.atan2(sine, dot(X, cx));
    // A swing near a half turn leaves the halfway axis undefined.
    if (swing > 3) continue;
    drawn++;
    const n = axis.map((v) => v / sine), b = swing * dot(n, Y), c = swing * dot(n, Z);
    const half = [X[0] + cx[0], X[1] + cx[1], X[2] + cx[2]], h = half.map((v) => v / Math.hypot(...half));
    const flat = (v) => v.map((x, i) => x - dot(v, h) * h[i]);
    const py = flat(Y), cy = flat(turned(rotation, Y)), a = Math.atan2(dot(cross(py, cy), h), dot(py, cy));
    const read = anglesOf(rotation, { x: X, y: Y, z: Z }, [0, 0, 0]);
    worst = Math.max(worst, Math.abs(read[0] - a), Math.abs(read[1] - b), Math.abs(read[2] - c));
    const back = rotationOfToRef({ x: X, y: Y, z: Z }, ...read, new Quaternion());
    undone = Math.max(undone, 1 - Math.abs(Quaternion.Dot(back, rotation)));
    // The child's own turn about its X, the quaternion's part along X, is not this twist once it swings.
    const s = rotation.w < 0 ? -1 : 1, own = 2 * Math.atan2(s * dot([rotation.x, rotation.y, rotation.z], X), s * rotation.w);
    twistApart = Math.max(twistApart, Math.abs(own - a));
  }
  console.log(`MUT reading ${worst.toExponential(1)} rad off, turned back ${undone.toExponential(1)}; own turn apart ${twistApart.toFixed(2)} rad`);
  assert.ok(twistApart > 0.1, `the drawn rotations do not tell the halfway twist from the child's own: ${twistApart}`);
  assert.ok(worst < 1e-9, `the angles read ${worst} rad off the swing and the halfway twist`);
  assert.ok(undone < 1e-12, `the angles turned back into a rotation ${undone} off`);
});

/**
 * A joint's angles change at rates its speeds do not equal once it is off its reference pose: the
 * speeds are the relative angular velocity along the motors' fixed axes (`turningToRef`), and the
 * angular velocity is the speeds along the motion axes (`motionAxesToRef`). Each is read against a
 * rotation composed at the angles and again a moment on (the first test holds the composition), with
 * freedoms in both senses, at swings past a quarter turn.
 */
test("a joint's speeds are its angles' rates turned through where it stands, and turn it about its motion axes", () => {
  const compose = (count, [a, b, c]) => rotationOfToRef({ x: X, y: Y, z: Z }, a, count > 1 ? b : 0, count > 2 ? c : 0, new Quaternion());
  const poses = [[0.5, 0.4, 0.3], [2.5, -1.2, 1.5], [-3, 1.3, -2.2], [0.1, -0.9, 0.7], [0.6, 2.4, 0.3]];
  const paces = [[0.7, -1.1, 0.4], [-0.3, 0.5, 1.6]];
  const h = 1e-6;
  let worst = 0, apart = 0;
  for (const count of [3, 2]) {
    for (const signs of [[1, 1, 1], [-1, 1, -1]]) {
      const joint = { dofs: signs.slice(0, count).map((sign) => ({ sign })), axes: { x: X, y: Y, z: Z } };
      for (const pose of poses) for (const pace of paces) {
        // Own-sense angles and rates; Havok's are these times each freedom's sign.
        const angles = pose.slice(0, count), rates = pace.slice(0, count);
        const havok = (list) => list.map((x, k) => signs[k] * x);
        const before = compose(count, havok(angles));
        const after = compose(count, havok(angles.map((x, k) => x + h * rates[k])));
        const change = after.multiply(Quaternion.Inverse(before));
        if (change.w < 0) change.scaleInPlace(-1);
        const sin = Math.hypot(change.x, change.y, change.z), scale = 2 * Math.atan2(sin, change.w) / (sin * h);
        const spin = [change.x * scale, change.y * scale, change.z * scale];
        const axes = [X, Y, Z].slice(0, count).map((axis, k) => axis.map((c) => c * signs[k]));
        const speeds = axes.map((axis) => spin[0] * axis[0] + spin[1] * axis[1] + spin[2] * axis[2]);
        const turning = turningToRef(joint, angles, []);
        turning.forEach((row, k) => { worst = Math.max(worst, Math.abs(row.reduce((sum, t, j) => sum + t * rates[j], 0) - speeds[k])); });
        ratesToRef(joint, angles, speeds, []).forEach((rate, k) => { worst = Math.max(worst, Math.abs(rate - rates[k])); });
        const motion = motionAxesToRef(joint, angles, []);
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(motion.reduce((sum, m, k) => sum + speeds[k] * m[i], 0) - spin[i]));
        apart = Math.max(apart, ...speeds.map((speed, k) => Math.abs(speed - rates[k])));
      }
    }
  }
  console.log(`MUT turning ${worst.toExponential(1)} rad/s off; speeds and rates up to ${apart.toFixed(2)} apart`);
  assert.ok(apart > 1, `the poses turn speeds off the rates: at most ${apart} rad/s apart`);
  assert.ok(worst < 1e-4, `turning, rates and motion axes against the composed rotation: ${worst} rad/s off`);
});

function rods(dofs) {
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) },
  });
  return {
    family: "test", model: "rods", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("upper", [0, 1.5, 0], [0, 1, 0], 2), segment("lower", [0, 1, 0], [0.1, 0.55, 0.05], 1)],
    joints: [{ name: "middle", parent: "upper", child: "lower", centre: q([0, 1, 0]),
      dofs: dofs.map(([positive, axis]) => ({ positive, negative: `not ${positive}`, axis: q(axis, "1"),
        min: q(-1.5, "rad"), max: q(1.5, "rad"), muscle: { peakPositive: q(50, "N m"), peakNegative: q(50, "N m") } })) }],
  };
}

/**
 * A rod on the Rogue's right shoulder's axes (its internal rotation runs against its constraint
 * axis), one freedom limited to +-`limit` rad and the others free to +-3.1, weightless, servoed
 * toward `goal` over 1.5 s and held a second more at 480 Hz: the angles it ends at.
 */
async function pressed(limited, limit, goal) {
  const shoulder = humanSpec("workshop-rogue").joints.find((j) => j.name === "shoulder.right"), c0 = shoulder.centre.value;
  const speed = { unloadedSpeed: q(60, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name, p, d, mass) => ({ name, proximal: q(p), distal: q(d), mass: q(mass, "kg"), centreOfMass: q(p.map((v, i) => (v + d[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"), shape: { kind: "capsule", from: q(p), to: q(d), radius: q(0.03) } });
  const spec = { family: "test", model: "rods", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [c0[0], c0[1] + 0.4, c0[2]], c0, 2), segment("arm", c0, [c0[0] + 0.05, c0[1] - 0.3, c0[2]], 1)],
    joints: [{ name: "shoulder", parent: "post", child: "arm", centre: q(c0),
      dofs: shoulder.dofs.map((dof, k) => ({ ...dof, min: q(k === limited ? -limit : -3.1, "rad"), max: q(k === limited ? limit : 3.1, "rad"),
        muscle: { peakPositive: q(100, "N m"), peakNegative: q(100, "N m"), speedPositive: speed, speedNegative: speed } })) }] };
  const stand = await coreStand(spec, { ground: false, pinned: "post", gravity: false, hz: 480 });
  let time = 0;
  const driver = driveMuscles(stand.built, stand.world, (d, dt) => {
    time += dt;
    servo(d, (i) => goal[i] * Math.min(1, time / 1.5), 0.08, dt);
  });
  try {
    stand.step(stand.seconds(2.5));
    return driver.channels.map((_, i) => driver.angle(i));
  } finally { driver.dispose(); stand.dispose(); }
}

/**
 * Each freedom in turn limited to +-0.6 rad and driven to 1.2, the other two asked to swing or
 * twist the joint well off its axes: the limited freedom stops at 0.6 as this reading has it,
 * where the Euler angles Rx Ry Rz, the reading before this one, put it up to 1.03 rad off it;
 * and a pose within the limit, at 0.5, is reached. The servo stays within its measure of the limit:
 * a goal past it drives the other freedoms off theirs, since the limit's push leans on them.
 */
test("a joint pressed against its limit stops where its reading says the range ends", async () => {
  const limit = 0.6;
  let stopped = 0, euler = 0, reached = 0;
  for (const limited of [0, 1, 2]) {
    const others = [0, 1, 2].filter((k) => k !== limited);
    for (const other of [0, 1.4]) for (const sense of [1, -1]) {
      const goal = [0, 0, 0];
      goal[limited] = 1.2 * sense; goal[others[0]] = other; goal[others[1]] = -0.6 * other;
      const got = await pressed(limited, limit, goal);
      stopped = Math.max(stopped, Math.abs(Math.abs(got[limited]) - limit));
      // The Euler angle of the same pose, the Rogue's third freedom running against its axis.
      const havok = got.map((v, k) => (k === 2 ? -v : v)), rotation = rotationOfToRef({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, ...havok, new Quaternion());
      const eulerAngles = eulerXyz(rotation);
      euler = Math.max(euler, Math.abs(Math.abs(eulerAngles[limited]) - limit));
      goal[limited] = 0.5 * sense;
      if (sense > 0 && other > 0) {
        const within = await pressed(limited, limit, goal);
        reached = Math.max(reached, ...within.map((v, k) => Math.abs(v - goal[k])));
      }
    }
  }
  console.log(`MUT limit stopped ${stopped.toFixed(3)} off, Euler ${euler.toFixed(2)} off; within reached to ${reached.toFixed(3)}`);
  assert.ok(euler > 0.3, `the Euler angles would read these stops at the limit too: ${euler}`);
  assert.ok(stopped < 0.015, `a freedom stopped ${stopped} rad off its limit`);
  assert.ok(reached < 0.012, `a pose within the limit was missed by ${reached} rad`);
});

/** The Euler angles (a, b, c) of `rotation` = Rx(a) Ry(b) Rz(c) about the world's axes. */
function eulerXyz({ x, y, z, w }) {
  const m02 = 2 * (x * z + y * w), m12 = 2 * (y * z - x * w), m22 = 1 - 2 * (x * x + y * y), m01 = 2 * (x * y - z * w), m00 = 1 - 2 * (y * y + z * z);
  return [Math.atan2(-m12, m22), Math.asin(Math.max(-1, Math.min(1, m02))), Math.atan2(-m01, m00)];
}

/**
 * A velocity motor drives the relative angular velocity along its parent-fixed axis, and the
 * tracker's speed is that component: driven freedoms read their targets while a free one, pushed,
 * makes the joint's spin wander off any fixed axis.
 */
test("a joint driven by velocity motors reads each driven freedom's target as its speed", async () => {
  const cases = [
    [[["x", X], ["y", Y], ["z", Z]], [1, -0.8, null]],
    // X cross (minus Y) is minus Z, so this z runs against its constraint axis.
    [[["x", X], ["minus y", Y.map((c) => -c)], ["z", Z]], [0.8, null, -1]],
    [[["x", X], ["y", Y]], [0.9, -0.7]],
    [[["minus x", X.map((c) => -c)]], [1.2]],
  ];
  for (const [dofs, rates] of cases) {
    const stand = await coreStand(rods(dofs), { gravity: false, ground: false });
    try {
      const joint = stand.built.joints.get("middle");
      stand.built.segments.get("upper").body.setMotionType(0 /* STATIC */);
      joint.dofs.forEach((dof, k) => {
        if (rates[k] === null) return;
        joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.VELOCITY);
        joint.constraint.setAxisMotorTarget(dof.axis, dof.sign * rates[k]);
        joint.constraint.setAxisMotorMaxForce(dof.axis, 200);
      });
      stand.built.segments.get("lower").body.applyImpulse(new Vector3(0.3, 0.1, -0.4), new Vector3(0.1, 0.55, 0.05));
      stand.step(stand.seconds(0.25));
      const tracker = jointTracker(joint);
      const angularVelocity = (segment) => { const w = new Vector3(); segment.body.getAngularVelocityToRef(w); return w; };
      const seen = rates.map(() => 0);
      for (let i = 0; i < stand.seconds(0.25); i++) {
        stand.step(1);
        tracker.update(angularVelocity);
        tracker.speeds.forEach((speed, k) => { if (rates[k] !== null) seen[k] = Math.max(seen[k], Math.abs(speed - rates[k])); });
        // A limit met would stop a motor short of its target: stay clear of the rods' 1.5 rad.
        assert.ok(tracker.angles.every((angle) => Math.abs(angle) < 1.3), `${dofs.map((d) => d[0])} neared a limit at ${tracker.angles}`);
      }
      assert.ok(Math.max(...seen) < 0.005, `${dofs.map((d) => d[0])} driven at ${rates} strayed by ${seen}`);
      if (rates.includes(null)) {
        const free = rates.indexOf(null);
        assert.ok(Math.abs(tracker.speeds[free]) > 0.1, `the free freedom stayed still: ${tracker.speeds}`);
      }
    } finally { stand.dispose(); }
  }
});

/**
 * With both rods tumbling free and no motor, Havok moves the nodes with the bodies' velocities, so
 * the change of the joint's relative rotation across a step is its speed: the tracker, reading
 * velocities, agrees with it. The parent turns and spins here, so a reading that ignored the
 * parent's spin or read the axes in the world would not. Measured, 0.13 rad/s apart at 6 rad/s: a
 * finite rotation of a tumbling pair is not quite its rate.
 */
test("a joint tumbling free reads the speed its relative rotation changes at", async () => {
  const stand = await coreStand(rods([["x", X], ["y", Y], ["z", Z]]), { gravity: false, ground: false });
  try {
    const joint = stand.built.joints.get("middle");
    const upper = stand.built.segments.get("upper").body, lower = stand.built.segments.get("lower").body;
    upper.applyImpulse(new Vector3(0.9, -0.2, 0.5), new Vector3(0.05, 1.45, -0.03));
    lower.applyImpulse(new Vector3(-0.3, 0.4, 0.6), new Vector3(0.1, 0.55, 0.05));
    stand.step(stand.seconds(0.05));
    const tracker = jointTracker(joint);
    const angularVelocity = (segment) => { const w = new Vector3(); segment.body.getAngularVelocityToRef(w); return w; };
    const dt = 1 / stand.seconds(1);
    const axes = joint.dofs.map((dof, k) => [joint.axes.x, joint.axes.y, joint.axes.z][k].map((c) => c * dof.sign));
    const relative = () => relativeRotationToRef(joint, new Quaternion());
    let before = relative(), worst = 0, parentSpin = 0, largest = 0;
    for (let i = 0; i < stand.seconds(0.08); i++) {
      stand.step(1);
      // Havok integrates positions with the velocity the step ends with, which the next step begins with.
      tracker.update(angularVelocity);
      const after = relative();
      const change = after.multiply(Quaternion.Inverse(before));
      if (change.w < 0) change.scaleInPlace(-1);
      const s = Math.hypot(change.x, change.y, change.z), rate = 2 * Math.atan2(s, change.w) / (s * dt);
      axes.forEach((axis, k) => {
        const differenced = rate * (change.x * axis[0] + change.y * axis[1] + change.z * axis[2]);
        worst = Math.max(worst, Math.abs(tracker.speeds[k] - differenced));
        largest = Math.max(largest, Math.abs(differenced));
      });
      parentSpin = Math.max(parentSpin, angularVelocity(joint.parent).length());
      // A limit's impulse, like a motor's, moves the nodes behind the velocity: stay clear of 1.5 rad.
      assert.ok(tracker.angles.every((angle) => Math.abs(angle) < 1.4), `neared a limit at ${tracker.angles}`);
      before = after;
    }
    assert.ok(parentSpin > 1 && largest > 1, `the pair tumbles: parent ${parentSpin}, joint ${largest} rad/s`);
    assert.ok(worst < 0.03 * largest, `tracker against the differenced rotation: ${worst} rad/s off, at up to ${largest}`);
  } finally { stand.dispose(); }
});
