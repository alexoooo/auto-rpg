/**
 * `jointAngles` reads a joint in the engine's own coordinates: the angles a Rapier limit acts on.
 * Node stand, two rods.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { anglesOf, jointTracker, motionAxesToRef, ratesToRef, rateBiasToRef, relativeRotationToRef, rotationOfToRef, turningToRef } from "../src/core/build/joint-state.ts";
import { servo } from "../src/core/control/servo.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, CORE_ENGINE } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the joint-state tests");

/** Axes tilted off the world's, so a decomposition that forgot them cannot pass by accident. */
const X = [0.8, 0.6, 0], Y = [-0.6, 0.8, 0], Z = [0, 0, 1];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A seeded generator in [0, 1). */
const random = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/**
 * Rapier's limits measure a joint on its own axes: with the rotation's parts (w, x, y, z) along
 * them, w >= 0, the angle about each is 2 atan2(part, w). Built here from those words against
 * rotations drawn at random short of a half turn and read by `anglesOf`, and the angles turned back
 * into a rotation give the rotation. The control: the sine reading, 2 asin(part), which a limit
 * compared against sin(half the bound) would make, is not this one.
 */
test("a rotation reads as twice the atan2 of each axis's part against the scalar part, and turns back into itself", () => {
  const next = random(11);
  let worst = 0, undone = 0, sineApart = 0;
  for (let drawn = 0; drawn < 200; drawn++) {
    const rotation = new Quaternion(next() - 0.5, next() - 0.5, next() - 0.5, next() - 0.5).normalize();
    const s = rotation.w < 0 ? -1 : 1, v = [rotation.x, rotation.y, rotation.z], w = s * rotation.w;
    const want = [X, Y, Z].map((axis) => 2 * Math.atan2(s * dot(v, axis), w));
    const read = anglesOf(rotation, { x: X, y: Y, z: Z }, [0, 0, 0]);
    worst = Math.max(worst, ...read.map((r, k) => Math.abs(r - want[k])));
    const back = rotationOfToRef({ x: X, y: Y, z: Z }, ...read, new Quaternion());
    undone = Math.max(undone, 1 - Math.abs(Quaternion.Dot(back, rotation)));
    sineApart = Math.max(sineApart, ...[X, Y, Z].map((axis, k) => Math.abs(2 * Math.asin(s * dot(v, axis)) - want[k])));
  }
  assert.ok(sineApart > 0.1, `the drawn rotations do not tell the atan2 reading from the sine's: ${sineApart}`);
  assert.ok(worst < 1e-12, `the angles read ${worst} rad off`);
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
        // Own-sense angles and rates; the engine's are these times each freedom's sign.
        const angles = pose.slice(0, count), rates = pace.slice(0, count);
        const engine = (list) => list.map((x, k) => signs[k] * x);
        const before = compose(count, engine(angles));
        const after = compose(count, engine(angles.map((x, k) => x + h * rates[k])));
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
  assert.ok(apart > 1, `the poses turn speeds off the rates: at most ${apart} rad/s apart`);
  assert.ok(worst < 1e-4, `turning, rates and motion axes against the composed rotation: ${worst} rad/s off`);
});

test("angle acceleration includes the changing speed-to-rate map on one, two and three axes", (t) => {
  const h = 1e-4, axes = { x: X, y: Y, z: Z };
  let worst = 0, omitted = 0;
  for (const count of [1, 2, 3]) for (const signs of [[1, 1, 1], [-1, 1, -1]]) {
    const joint = { axes, dofs: signs.slice(0, count).map((sign) => ({ sign })) };
    for (const pose of [[0.7, -0.4, 0.8], [2.2, -1.2, 1.5], [-2, 1.3, -2.2]]) {
      const rates = [2, -3, 4], accelerations = [-0.4, 0.6, -0.2];
      const orientation = (time) => {
        const tangent = pose.map((a, k) => k < count ? Math.tan(signs[k] * (a + rates[k] * time + accelerations[k] * time * time / 2) / 2) : 0);
        const w = 1 / Math.sqrt(1 + tangent.reduce((sum, v) => sum + v * v, 0));
        const p = [0, 1, 2].map((k) => [X, Y, Z].reduce((sum, axis, j) => sum + axis[k] * tangent[j] * w, 0));
        return new Quaternion(...p, w);
      };
      const speedsAt = (time) => {
        const turn = orientation(time + h).multiply(Quaternion.Inverse(orientation(time - h)));
        const length = Math.hypot(turn.x, turn.y, turn.z), scale = 2 * Math.atan2(length, turn.w) / (length * 2 * h);
        const spin = [turn.x * scale, turn.y * scale, turn.z * scale];
        return [X, Y, Z].slice(0, count).map((axis, k) => signs[k] * dot(axis, spin));
      };
      const speeds = speedsAt(0), before = speedsAt(-h), after = speedsAt(h);
      const changing = after.map((v, k) => (v - before[k]) / (2 * h));
      const mapped = ratesToRef(joint, pose, changing, []), bias = rateBiasToRef(joint, pose, speeds, []);
      mapped.forEach((value, k) => {
        worst = Math.max(worst, Math.abs(value + bias[k] - accelerations[k]));
        omitted = Math.max(omitted, Math.abs(value - accelerations[k]));
      });
      assert.ok(rateBiasToRef(joint, pose, new Array(count).fill(0), []).every((v) => v === 0));
    }
  }
  t.diagnostic(JSON.stringify({ worst, omitted }));
  assert.ok(worst < 1e-4, `mapped speed acceleration plus coordinate bias: ${worst}`);
  assert.ok(omitted > 1, "the fixture must distinguish omitting the coordinate bias");
});

function rods(dofs) {
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) }, surface: { stiffness: q(1e5, "N/m") },
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
async function pressed(limited, limit, goal, { engine = CORE_ENGINE, centre = 0, hz = 480 } = {}) {
  const shoulder = humanSpec("workshop-rogue").joints.find((j) => j.name === "shoulder.right"), c0 = shoulder.centre.value;
  const speed = { unloadedSpeed: q(60, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name, p, d, mass) => ({ name, proximal: q(p), distal: q(d), mass: q(mass, "kg"), centreOfMass: q(p.map((v, i) => (v + d[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"), shape: { kind: "capsule", from: q(p), to: q(d), radius: q(0.03) }, surface: { stiffness: q(1e5, "N/m") } });
  const spec = { family: "test", model: "rods", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("post", [c0[0], c0[1] + 0.4, c0[2]], c0, 2), segment("arm", c0, [c0[0] + 0.05, c0[1] - 0.3, c0[2]], 1)],
    joints: [{ name: "shoulder", parent: "post", child: "arm", centre: q(c0),
      dofs: shoulder.dofs.map((dof, k) => ({ ...dof, min: q(k === limited ? centre - limit : -3.1, "rad"), max: q(k === limited ? centre + limit : 3.1, "rad"),
        muscle: { peakPositive: q(100, "N m"), peakNegative: q(100, "N m"), speedPositive: speed, speedNegative: speed } })) }] };
  const stand = await coreStand(spec, { ground: false, pinned: "post", gravity: false, hz, engine });
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
 * where the Euler angles Rx Ry Rz would put it up to a radian off; and a pose within the limit, at
 * 0.5, is reached. The servo stays within its measure of the limit: a goal past it drives the other
 * freedoms off theirs, since the limit's push leans on them.
 *
 * Rapier passes the limit by up to 0.046 rad: its limit pushes along its axis as fixed in the
 * parent, while the angle 2 atan2(q_k, w) grows along row k of (E - [t]x + t t') / (1 + t_k^2)
 * (`ratesToRef`), so the other freedoms' turning carries the limited angle past its stop while the
 * limit sees no motion.
 */
for (const engineName of ["rapier", "rapier-coordinate"]) test(`${engineName}: a joint pressed against its limit stops where its reading says the range ends`,
  { todo: engineName === "rapier" ? "parent-axis limits remain the gameplay reference pending controller migration" : false }, async (t) => {
  const limit = 0.6;
  let stopped = 0, euler = 0, reached = 0;
  for (const limited of [0, 1, 2]) {
    const others = [0, 1, 2].filter((k) => k !== limited);
    for (const other of [0, 1.4]) for (const sense of [1, -1]) {
      const goal = [0, 0, 0];
      goal[limited] = 1.2 * sense; goal[others[0]] = other; goal[others[1]] = -0.6 * other;
      const got = await pressed(limited, limit, goal, { engine: engineName });
      stopped = Math.max(stopped, Math.abs(Math.abs(got[limited]) - limit));
      // The Euler angle of the same pose, the Rogue's third freedom running against its axis.
      const engine = got.map((v, k) => (k === 2 ? -v : v)), rotation = rotationOfToRef({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, ...engine, new Quaternion());
      const eulerAngles = eulerXyz(rotation);
      euler = Math.max(euler, Math.abs(Math.abs(eulerAngles[limited]) - limit));
      goal[limited] = 0.5 * sense;
      if (sense > 0 && other > 0) {
        const within = await pressed(limited, limit, goal, { engine: engineName });
        reached = Math.max(reached, ...within.map((v, k) => Math.abs(v - goal[k])));
      }
    }
  }
  t.diagnostic(JSON.stringify({ engine: engineName, stopped, euler, reached }));
  assert.ok(euler > 0.3, `the Euler angles would read these stops at the limit too: ${euler}`);
  assert.ok(stopped < 0.015, `a freedom stopped ${stopped} rad off its limit`);
  assert.ok(reached < 0.012, `a pose within the limit was missed by ${reached} rad`);
});

test("coordinate limits stop at asymmetric bounds at gameplay and fine rates", async (t) => {
  const rows = [];
  for (const engine of ["rapier", "rapier-coordinate"]) for (const hz of [120, 480]) for (const centre of [-0.4, 0.4]) for (const limited of [0, 1, 2]) for (const sense of [-1, 1]) {
    const others = [0, 1, 2].filter((k) => k !== limited), goal = [0, 0, 0];
    goal[limited] = centre + 1.2 * sense; goal[others[0]] = 1.4; goal[others[1]] = -0.84;
    const got = await pressed(limited, 0.6, goal, { engine, centre, hz });
    rows.push({ engine, hz, centre, limited, sense, got, error: Math.abs(got[limited] - (centre + 0.6 * sense)) });
  }
  t.diagnostic(JSON.stringify(rows));
  const corrected = rows.filter((row) => row.engine === "rapier-coordinate");
  assert.equal(rows.length, 48); assert.equal(corrected.length, 24);
  assert.ok(corrected.every((row) => row.error < 0.015), JSON.stringify(rows));
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
      stand.built.segments.get("upper").body.setFixed(true);
      joint.dofs.forEach((dof, k) => { if (rates[k] !== null) joint.joint.setMotor(k, dof.sign * rates[k], 200); });
      stand.built.segments.get("lower").body.applyImpulse(new Vector3(0.3, 0.1, -0.4), new Vector3(0.1, 0.55, 0.05));
      stand.step(stand.seconds(0.25));
      const tracker = jointTracker(joint);
      const angularVelocity = (segment) => { const w = new Vector3(); segment.body.angularVelocityToRef(w); return w; };
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
 * With both rods tumbling free and no motor, the engine moves the nodes with the bodies' velocities,
 * so the change of the joint's relative rotation across a step is its speed: the tracker, reading
 * velocities, agrees with it. The parent turns and spins here, so a reading that ignored the
 * parent's spin or read the axes in the world would not. A finite rotation of a tumbling pair is
 * not quite its rate, so the two agree to a few per cent, not exactly.
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
    const angularVelocity = (segment) => { const w = new Vector3(); segment.body.angularVelocityToRef(w); return w; };
    const dt = 1 / stand.seconds(1);
    const axes = joint.dofs.map((dof, k) => [joint.axes.x, joint.axes.y, joint.axes.z][k].map((c) => c * dof.sign));
    const relative = () => relativeRotationToRef(joint, new Quaternion());
    let before = relative(), worst = 0, parentSpin = 0, largest = 0;
    for (let i = 0; i < stand.seconds(0.08); i++) {
      stand.step(1);
      // The engine integrates positions with the velocity the step ends with, which the next step begins with.
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
