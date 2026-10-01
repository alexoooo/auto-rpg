/**
 * The body (`src/core/body.ts`): commanded by goals and read through its view. A posture is held, a
 * hand goal given afresh each step keeps its path and is reached, a push drives its freedom flat
 * out, a released hand goes back to the posture, and the view's two readings of the knuckles, the
 * world's and the body frame's, agree. Node stand: the Warrior, lower trunk held, gravity on, no
 * ground, 120 Hz. And a body walking on the ground under the command layers goes on from an
 * engine's load as it went on from the save (`PhysicsWorld.save`, `load`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { chainTo } from "../src/core/control/kinematics.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";

const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

test("a body obeys its command and shows what it does", async () => {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, { ground: false, pinned: "lowerTrunk", hz: 120 });
  const straight = spec.joints.find((j) => j.name === "elbow.left").dofs[0].min.value;
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  const root = chainTo(stand.built, stand.built.segments.get("hand.right"))[0].parent;
  try {
    // The phases, by the view's clock: the guard; the right hand sent forward and up; the left
    // elbow pushed open; the right hand released.
    const posture = { ...GUARD, "wrist.left flexion": 0.3 };
    let goal = null, times = [], seen = { gap: 0, peak: 0 };
    body.drive((view) => {
      times.push(view.time);
      // The view's knuckles in the body frame (the reference pose's world), carried to the world by
      // the root's turn since then, against its fists.
      for (const hand of ["left", "right"]) {
        const turn = root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest));
        const world = view.knuckles[hand].subtract(Vector3.FromArray(root.frame.origin)).applyRotationQuaternion(turn).addInPlace(root.node.position);
        seen.gap = Math.max(seen.gap, Vector3.Distance(world, view.fists[hand].position));
      }
      const t = view.time;
      if (t >= 1 && !goal) goal = view.knuckles.right.add(new Vector3(0, 0.1, 0.25)).asArray();
      // A goal equal to the last, made afresh each step, as the skills would.
      const right = t >= 1 && t < 3 ? { position: [...goal], seconds: 0.4 } : null;
      const pushing = t >= 2 && t < 2.15;
      if (pushing) seen.peak = Math.max(seen.peak, view.fists.left.velocity.length());
      return { posture, hands: { left: null, right },
        pushes: pushing ? [{ channel: "elbow.left flexion", sense: -1, level: 1 }] : [], stance: null };
    });
    const angles = body.view.angles, off = (names) => Math.max(...names.map((n) => Math.abs(angles[n] - posture[n])));

    stand.step(stand.seconds(1));
    const held = off(Object.keys(posture));
    stand.step(stand.seconds(1));
    const reached = Vector3.Distance(body.view.knuckles.right, Vector3.FromArray(goal));
    stand.step(stand.seconds(0.15));
    const opened = angles["elbow.left flexion"] - straight;
    stand.step(stand.seconds(1.85));
    const released = off(["shoulder.right flexion", "shoulder.right abduction", "elbow.right flexion"]);

    const steady = times.every((t, k) => k === 0 || Math.abs(t - times[k - 1] - 1 / 120) < 1e-9);
    assert.ok(steady && times[0] === 0, "the view's clock is not the world's, a step apart");
    assert.ok(held < 0.05, `the posture was held ${held.toFixed(3)} rad off`);
    assert.ok(reached < 0.01, `the hand stopped ${(1000 * reached).toFixed(1)} mm from its goal`);
    // Opened from the guard's 1.3 rad (2.2 from straight) to near its end, the fist fast.
    assert.ok(opened < 0.2 && seen.peak > 5, `the pushed elbow stopped ${opened.toFixed(2)} rad from straight, the fist at ${seen.peak.toFixed(2)} m/s`);
    assert.ok(released < 0.05, `the released arm was ${released.toFixed(3)} rad off the posture`);
    assert.ok(seen.gap < 1e-6, `the view's knuckles were ${(1000 * seen.gap).toFixed(3)} mm apart`);
  } finally { body.dispose(); stand.dispose(); }
});

/**
 * The Warrior on the ground under the command layers, walking forward at half its fastest walk:
 * its stand, its skills, and a running digest of its poses (`traceOf`).
 */
async function walker() {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const skills = driveBy(body, { name: "walk", decide: ({ envelope }) => ({ ...standIntent(0), move: [0.5 * envelope.walk.value, 0] }) });
  const trace = traceOf([stand.built]);
  return {
    stand, skills, physics: stand.world.physics,
    /** `n` steps, each taken into the digest; the digest after the first of them, and after the last. */
    walk(n) {
      let first = null;
      for (let i = 0; i < n; i++) { stand.step(); trace.take(); first ??= trace.digest(); }
      return { first, last: trace.digest() };
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
}

test("a driven body goes on from a load as it went on from the save", async () => {
  // Triplets, built alike and walked alike: the engine's half of a fork alone, every body's controllers at one step.
  const a = await walker(), b = await walker(), c = await walker();
  try {
    a.walk(230); b.walk(230); c.walk(230);
    const early = a.physics.save();
    const before = a.walk(10);
    assert.deepEqual([b.walk(10), c.walk(10)], [before, before], "built alike, they agree to the bit before any load");
    const root = a.stand.built.segments.get("lowerTrunk").node.position, far = Math.hypot(root.x, root.z);
    assert.ok(far > 0.3, `it walked ${far} m in 2 s`);
    b.physics.load(a.physics.save());
    // The control: a save taken ten steps earlier parts them at the first step.
    c.physics.load(early);
    const went = a.walk(240);
    assert.deepEqual(b.walk(240), went, "loaded with another's save of the same step, it walks on as the other does");
    assert.notEqual(c.walk(240).first, went.first);
    assert.deepEqual([a.skills.report.fallen, b.skills.report.fallen], [false, false], "and its muscles still hold it up");
  } finally { a.dispose(); b.dispose(); c.dispose(); }
});
