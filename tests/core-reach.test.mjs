/**
 * Motor control's kinematics and hand goals (`src/core/control/kinematics.ts`, `motor.ts`): the
 * chain's forward kinematics put the knuckles where the built body has them; they are exact far
 * below a millimetre, so a Jacobian differenced by 1e-7 rad is sound; the inverse kinematics find a
 * reachable place and stretch toward one out of reach without crossing the arm's straight
 * singularity; and a hand goal is followed and reached alike at the game's 120 Hz and at 1920 Hz.
 * Node stand: the Warrior and the Rogue, lower trunk held, gravity on, no ground.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { chainTo, pointAtToRef, pointNowToRef, solveReach } from "../src/core/control/kinematics.ts";
import { motorControl } from "../src/core/control/motor.ts";
import { servo } from "../src/core/control/servo.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { coreStand } from "./harness/core-stand.mjs";

const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/** The right arm's chain, its knuckles, and its shoulder's and elbow's freedoms for `solveReach`, drawn toward `pose`. */
function rightArm(built, pose = GUARD) {
  const hand = built.segments.get("hand.right"), chain = chainTo(built, hand);
  const name = (j, k) => `${chain[j].spec.name} ${chain[j].dofs[k].spec.positive}`;
  const free = chain.flatMap((joint, j) => joint.spec.name === "shoulder.right" || joint.spec.name === "elbow.right"
    ? joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: pose[name(j, k)] ?? 0 }))
    : []);
  const at = (angles) => chain.map((joint, j) => joint.dofs.map((_, k) => angles[name(j, k)] ?? 0));
  return { hand, chain, knuckles: hand.spec.points.knuckles.value, free, name, at };
}

/** A seeded generator in [0, 1). */
const random = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("the kinematics put the knuckles and the toes where the body has them, trunk and limbs turned", async () => {
  // At 1920 Hz, where the solver holds a hinge's locked axes: at 120 Hz the elbow gives 0.7 deg
  // about them under the forearm's weight, 3.8 mm at the knuckles (none with gravity off).
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk", hz: 1920 });
  const arm = rightArm(stand.built), foot = stand.built.segments.get("foot.right");
  // The arm's chain has a joint of one freedom and joints of three; the leg's ankle has two.
  const ends = [{ segment: arm.hand, point: arm.knuckles }, { segment: foot, point: foot.spec.distal.value }]
    .map((end) => ({ ...end, chain: chainTo(stand.built, end.segment) }));
  // A pose with every freedom of both chains off its reference, the trunk's included.
  const pose = { ...GUARD, "lumbar flexion": 0.15, "lumbar lateral flexion right": -0.1, "lumbar rotation right": 0.2,
    "thoracic flexion": 0.1, "thoracic rotation right": -0.15, "shoulder.right internal rotation": 0.4,
    "wrist.right flexion": 0.3, "wrist.right radial deviation": 0.1, "wrist.right pronation": 0.5,
    "hip.right flexion": 0.6, "hip.right abduction": 0.2, "hip.right internal rotation": -0.3, "knee.right flexion": 0.9,
    "ankle.right dorsiflexion": 0.25, "ankle.right inversion": 0.3 };
  const driver = driveMuscles(stand.built, stand.world, (d, dt) => servo(d, (i) => pose[d.channels[i].name] ?? 0, 0.1, dt));
  try {
    const worst = [];
    for (let read = 0; read < 3; read++) {
      stand.step(stand.seconds(0.3));
      for (const { segment, point, chain } of ends) {
        const angles = chain.map((joint) => joint.dofs.map((dof) => driver.angle(driver.channel(`${joint.spec.name} ${dof.spec.positive}`))));
        const fk = pointAtToRef(chain, angles, point, new Vector3());
        const body = pointNowToRef(segment, chain[0].parent, point, new Vector3());
        worst.push(Vector3.Distance(fk, body));
      }
    }
    // The first readings are taken while the limbs still move (0.5 mm), the others at rest.
    for (const w of worst) assert.ok(w < 0.001, `the kinematics put an end ${(1000 * w).toFixed(2)} mm from the body's`);
  } finally {
    driver.dispose(); stand.dispose();
  }
});

test("the kinematics are exact far below a millimetre: a Jacobian differenced by 1e-7 rad agrees with one by 1e-5", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk" });
  const arm = rightArm(stand.built), angles = arm.at(GUARD);
  let worst = 0;
  for (const f of arm.free) {
    const column = (h) => {
      const base = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3());
      angles[f.joint][f.k] += h;
      const moved = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3());
      angles[f.joint][f.k] -= h;
      return moved.subtract(base).scale(1 / h);
    };
    const fine = column(1e-7), coarse = column(1e-5);
    worst = Math.max(worst, fine.subtract(coarse).length() / coarse.length());
  }
  stand.dispose();
  // A float32 step anywhere in the chain reads 1e-8 m of noise: a quarter of a column at 1e-7 rad.
  assert.ok(worst < 1e-3, `the Jacobian's columns differ by ${worst.toExponential(2)} of themselves`);
});

test("the inverse kinematics find a reachable place, and stretch toward one out of reach without flipping", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    const stand = await coreStand(humanSpec(model), { ground: false, pinned: "lowerTrunk" });
    const arm = rightArm(stand.built), next = random(7);
    // Reachable: angles drawn within the middle of each range, their knuckles the target, solved from the guard.
    let worst = 0;
    for (let n = 0; n < 20; n++) {
      const angles = arm.at(GUARD);
      for (const f of arm.free) angles[f.joint][f.k] = f.min + (0.25 + 0.5 * next()) * (f.max - f.min);
      const target = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3()).asArray();
      worst = Math.max(worst, solveReach(arm.chain, arm.at(GUARD), arm.free, arm.knuckles, target));
    }
    // Out of reach: a straight path from the guard running 0.6 m forward and 0.2 m up, each solve from the last.
    const angles = arm.at(GUARD), start = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3());
    let jump = 0, left = 0;
    for (let s = 1; s <= 30; s++) {
      const was = angles.map((row) => [...row]);
      left = solveReach(arm.chain, angles, arm.free, arm.knuckles, [start.x, start.y + 0.2 * s / 30, start.z + 0.6 * s / 30]);
      for (const f of arm.free) jump = Math.max(jump, Math.abs(angles[f.joint][f.k] - was[f.joint][f.k]));
    }
    stand.dispose();
    assert.ok(worst < 0.5e-3, `${model}: a reachable place was missed by ${(1000 * worst).toFixed(2)} mm`);
    // Near full stretch the elbow turns fast per millimetre of reach (0.41 rad over one step here);
    // crossing the singularity throws the shoulder to its far limits, some 3 rad.
    assert.ok(jump < 1, `${model}: the arm turned ${jump.toFixed(2)} rad between neighbouring places on a path`);
    assert.ok(left > 0.05 && left < 0.4, `${model}: the far end of the path was ${(1000 * left).toFixed(0)} mm off`);
  }
});

/** The Warrior at the guard, then his right knuckles sent `move` from where they are over 0.4 s; the worst gap to the path, and where they end. */
async function reachRun(hz, move) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk", hz });
  const motor = motorControl(stand.built, 0.1, GUARD);
  const driver = driveMuscles(stand.built, stand.world, motor.control);
  try {
    stand.step(stand.seconds(1));
    const from = motor.knucklesToRef("right", new Vector3());
    const target = [from.x + move[0], from.y + move[1], from.z + move[2]];
    motor.reach("right", target, 0.4);
    const now = new Vector3();
    let worst = 0;
    for (let s = 0; s < stand.seconds(0.9); s++) {
      stand.step(1);
      worst = Math.max(worst, Vector3.Distance(motor.path("right"), motor.knucklesToRef("right", now)));
    }
    return { worst, end: now.clone(), off: Vector3.Distance(now, Vector3.FromArray(target)) };
  } finally {
    driver.dispose(); stand.dispose();
  }
}

test("a hand goal is followed and reached alike at 120 Hz and 1920 Hz", async () => {
  for (const move of [[0, 0.05, 0.2], [0.15, -0.1, 0.1]]) {
    const slow = await reachRun(120, move), fast = await reachRun(1920, move);
    const apart = Vector3.Distance(slow.end, fast.end);
    // A goal angle a step ahead of the path strays 11 mm at 120 Hz.
    for (const [hz, run, bound] of [[120, slow, 0.010], [1920, fast, 0.004]]) {
      assert.ok(run.worst < bound, `${hz} Hz: the knuckles strayed ${(1000 * run.worst).toFixed(1)} mm from the path`);
      assert.ok(run.off < 0.008, `${hz} Hz: the knuckles ended ${(1000 * run.off).toFixed(1)} mm from the goal`);
    }
    assert.ok(apart < 0.006, `the two rates ended ${(1000 * apart).toFixed(1)} mm apart`);
  }
});
