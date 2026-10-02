/**
 * Motor control's kinematics and hand goals (`src/core/control/kinematics.ts`, `motor.ts`): the
 * chain's forward kinematics put the knuckles where the built body has them; the Jacobian in
 * closed form is their derivative; the inverse kinematics find a
 * reachable place and stretch toward one out of reach without crossing the arm's straight
 * singularity; a solve says its passes and whether it ended, motor control counts its hands'
 * solves, and of the solves a bout asked (`research/reach-bed.mjs`) those at their place end and
 * those at the cap are the ones out of reach; a hand goal is followed and reached alike at the game's 120 Hz and at 1920 Hz; its
 * path may run on through its place, and keep its start and its clock while its place moves; and
 * a goal may name a point of what the hand holds, or two of them, which lay the held thing's line.
 * Node stand: the Warrior and the Rogue, lower trunk held, gravity on, no ground.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { chainTo, pointAtToRef, pointNowToRef, reachJacobianTo, solveReach } from "../src/core/control/kinematics.ts";
import { motorControl } from "../src/core/control/motor.ts";
import { servo } from "../src/core/control/servo.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec, modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { AT_PLACE, reachBed } from "../research/reach-bed.mjs";
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

test("the_jacobian_is_the_kinematics_derivative", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk" });
  try {
    // The arm's chain has joints of three freedoms and of one; the leg's ankle has two, whose axes lean with its angles.
    const hand = stand.built.segments.get("hand.right"), foot = stand.built.segments.get("foot.right");
    for (const [segment, point, counts] of [[hand, hand.spec.points.knuckles.value, [3, 3, 3, 1, 3]], [foot, foot.spec.distal.value, [3, 1, 2]]]) {
      const chain = chainTo(stand.built, segment), next = random(11);
      assert.deepEqual(chain.map((joint) => joint.dofs.length), counts);
      // Every freedom of the chain, the trunk's included, over its range short of a half turn.
      const free = chain.flatMap((joint, j) => joint.dofs.map((dof, k) => ({ joint: j, k, min: Math.max(dof.spec.min.value, -3), max: Math.min(dof.spec.max.value, 3), preferred: 0 })));
      const J = [];
      let worst = 0, least = Infinity, most = 0;
      for (let n = 0; n < 200; n++) {
        const angles = chain.map((joint) => joint.dofs.map(() => 0));
        for (const f of free) angles[f.joint][f.k] = f.min + (0.02 + 0.96 * next()) * (f.max - f.min);
        const was = JSON.stringify(angles);
        assert.equal(reachJacobianTo(J, chain, angles, free, point), J);
        assert.equal(JSON.stringify(angles), was, "the angles are read, not written");
        assert.equal(J.length, free.length);
        free.forEach((f, c) => {
          // Central differences of 1e-5 rad: their error is the third derivative's, 1e-10 of a column.
          const at = (h) => { const moved = angles.map((row) => [...row]); moved[f.joint][f.k] += h; return pointAtToRef(chain, moved, point, new Vector3()); };
          const column = at(1e-5).subtract(at(-1e-5)).scale(1 / 2e-5);
          worst = Math.max(worst, Vector3.Distance(Vector3.FromArray(J[c]), column));
          least = Math.min(least, column.length()); most = Math.max(most, column.length());
        });
      }
      assert.ok(worst < 1e-8, `${segment.spec.name}: a column is ${worst.toExponential(2)} m/rad from the kinematics' derivative`);
      // The control: the columns are not all small, so the bound says something of every one.
      assert.ok(most > 0.5 && least < 0.05, `${segment.spec.name}: the columns run from ${least.toFixed(3)} to ${most.toFixed(3)} m/rad`);
    }
  } finally { stand.dispose(); }
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
      worst = Math.max(worst, solveReach(arm.chain, arm.at(GUARD), arm.free, [{ point: arm.knuckles, target }]));
    }
    // Out of reach: a straight path from the guard running 0.6 m forward and 0.2 m up, each solve from the last.
    const angles = arm.at(GUARD), start = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3());
    let jump = 0, left = 0;
    for (let s = 1; s <= 30; s++) {
      const was = angles.map((row) => [...row]);
      left = solveReach(arm.chain, angles, arm.free, [{ point: arm.knuckles, target: [start.x, start.y + 0.2 * s / 30, start.z + 0.6 * s / 30] }]);
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

/** The most passes a solve takes (`IK_PASSES`). */
const CAP = 200;

test("a_solve_says_its_passes_and_whether_it_ended", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk" });
  const bed = await reachBed();
  try {
    // A place the arm can take, from the guard: the solve stops of itself, short of the cap.
    const arm = rightArm(stand.built), angles = arm.at(GUARD);
    for (const f of arm.free) angles[f.joint][f.k] = f.min + 0.4 * (f.max - f.min);
    const target = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3()).asArray();
    const end = { passes: 0, still: false };
    const left = solveReach(arm.chain, arm.at(GUARD), arm.free, [{ point: arm.knuckles, target }], end);
    assert.ok(left < 1e-6 && end.still && end.passes > 1 && end.passes < CAP, `${1000 * left} mm left after ${end.passes} passes, still ${end.still}`);
    // A place out of reach, as a bout asked it: the solve runs to the cap, and says so.
    const far = bed.solve(120);
    assert.ok(far.left > 0.4, `the fixture's place is ${(1000 * far.left).toFixed(0)} mm out of reach`);
    assert.deepEqual(far.end, { passes: CAP, still: false });
  } finally { stand.dispose(); bed.dispose(); }
});

test("motor_control_meters_its_hands_solves", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk" });
  const motor = motorControl(stand.built, 0.1, GUARD);
  const driver = driveMuscles(stand.built, stand.world, motor.control);
  try {
    stand.step(stand.seconds(1));
    assert.deepEqual(motor.state.reach, { solves: 0, passes: 0, capped: 0 }, "no hand has a goal: nothing is solved");
    // A place the hand can take: three solves a step (the step before, the step, the step after), each ending.
    const from = motor.knucklesToRef("right", new Vector3()), steps = stand.seconds(0.4);
    motor.reach("right", { places: [{ point: "knuckles", position: [from.x, from.y + 0.05, from.z + 0.2] }], seconds: 0.4 });
    stand.step(steps);
    const near = { ...motor.state.reach };
    assert.equal(near.solves, 3 * steps);
    assert.equal(near.capped, 0);
    // Every solve takes a pass at least, and the first of a path, from the guard's angles, many.
    assert.ok(near.passes > near.solves + 10 && near.passes < CAP * near.solves, `${near.passes} passes in ${near.solves} solves`);
    // A place two metres ahead, which no arm reaches: its solves run to the cap and are counted so.
    motor.reach("right", { places: [{ point: "knuckles", position: [from.x, from.y, from.z + 2] }], seconds: 0.4 });
    stand.step(steps);
    const far = motor.state.reach;
    assert.equal(far.solves, 6 * steps);
    const capped = far.capped - near.capped;
    assert.ok(capped > 2 * steps && capped <= 3 * steps, `${capped} of the second path's ${3 * steps} solves ran to the cap`);
    assert.ok(far.passes - near.passes >= CAP * capped, `${far.passes - near.passes} passes with ${capped} at the cap`);
  } finally {
    driver.dispose(); stand.dispose();
  }
});

test("the_bed_s_solves_at_the_cap_are_no_more_than", async () => {
  const bed = await reachBed();
  try {
    assert.equal(bed.solves.length, 144);
    const answers = bed.solves.map((_, k) => bed.solve(k)), capped = answers.filter(({ end }) => !end.still);
    // The bed's count (`docs/reference/step-cost.md#the-reach-solver-at-its-cap`): a change of the solve lowers it, and none raises it.
    assert.ok(capped.length <= 43, `${capped.length} of the bed's 144 solves ran to the cap`);
    // The control: those left are of a place out of reach, half a centimetre or more, but for one.
    assert.equal(capped.filter(({ left }) => left > 0.005).length, 42);
  } finally { bed.dispose(); }
});

test("a_solve_at_its_place_ends", async () => {
  const bed = await reachBed();
  try {
    const answers = bed.solves.map((_, k) => bed.solve(k));
    const placed = answers.map((answer, k) => ({ ...answer, k })).filter(({ left }) => left < AT_PLACE);
    assert.equal(placed.length, 102, "the bed's solves that are at their place");
    // All but one end, and soon. That one stands with a wrist's freedom at its stop and is still
    // closing at the cap, a nanometre from its place: a second solve from its answer ends, having moved it under 1e-9 rad.
    const slow = placed.filter(({ end }) => !end.still);
    assert.deepEqual(slow.map(({ k }) => k), [98]);
    const most = Math.max(...placed.filter(({ end }) => end.still).map(({ end }) => end.passes));
    assert.ok(most < 120, `a solve at its place took ${most} passes`);
    const again = bed.solve(98, slow[0].angles);
    const turned = Math.max(...again.angles.flatMap((row, j) => row.map((angle, i) => Math.abs(angle - slow[0].angles[j][i]))));
    assert.ok(again.end.still && again.end.passes < 60 && turned < 1e-9, `solved again: ${again.end.passes} passes, ${turned} rad`);
  } finally { bed.dispose(); }
});

test("a range that reaches a half turn is solved short of it: an arm drawn up and far behind stops there", async () => {
  // How far short of a half turn the solve keeps an angle (`IK_SHORT`).
  const most = Math.PI - 0.1;
  for (const model of ["workshop-rogue", "crypt-skeleton"]) {
    const stand = await coreStand(modelSpec(model), { ground: false, pinned: "lowerTrunk" });
    try {
      const arm = rightArm(stand.built);
      const wide = arm.free.filter((f) => f.max > most);
      assert.ok(wide.length > 0, `${model}: no freedom of the fixture's arm has a range that reaches a half turn`);
      // From the guard, up and far behind, out of reach: the shoulder turns as far as it may.
      const angles = arm.at(GUARD), start = pointAtToRef(arm.chain, angles, arm.knuckles, new Vector3());
      for (let s = 1; s <= 40; s++) {
        solveReach(arm.chain, angles, arm.free, [{ point: arm.knuckles, target: [start.x, start.y + s / 40, start.z - 2 * s / 40] }]);
      }
      const reached = wide.map((f) => angles[f.joint][f.k]);
      assert.ok(reached.some((angle) => angle === most), `${model}: the path drew no wide freedom to the end of its range: ${reached.map((a) => a.toFixed(3))}`);
      for (const f of arm.free) assert.ok(Math.abs(angles[f.joint][f.k]) <= most, `${model}: ${arm.name(f.joint, f.k)} is at ${angles[f.joint][f.k]}`);
    } finally { stand.dispose(); }
  }
});

test("a straight arm with its elbow and wrist at their stops is solved: the way it cannot see is left to the posture", async () => {
  // The Rogue's right arm as a placed blow left it in a bout, a pass from its place: the elbow
  // straight at its stop and two of the wrist's freedoms at theirs, so every freedom left moves
  // the knuckles across the arm's line and none along it.
  const stand = await coreStand(humanSpec("workshop-rogue"), { ground: false, pinned: "lowerTrunk" });
  try {
    const hand = stand.built.segments.get("hand.right"), chain = chainTo(stand.built, hand), knuckles = hand.spec.points.knuckles.value;
    const moved = ["shoulder.right", "elbow.right", "wrist.right"];
    const free = chain.flatMap((joint, j) => moved.includes(joint.spec.name)
      ? joint.dofs.map((dof, k) => ({ joint: j, k, min: dof.spec.min.value, max: dof.spec.max.value, preferred: GUARD[`${joint.spec.name} ${dof.spec.positive}`] ?? 0 }))
      : []);
    const angles = [[0, 0, 0], [0, 0, 0], [2.3576057189622546, 0.041551409595667596, -0.1241796316652358], [-0.8314727849836531],
      [-1.5031210562283344, -0.8970909878475719, -0.2468925408474032]];
    assert.deepEqual(chain.map((joint) => joint.dofs.length), angles.map((row) => row.length));
    const stops = free.filter((f) => angles[f.joint][f.k] === f.min).map((f) => `${chain[f.joint].spec.name} ${f.k}`);
    assert.deepEqual(stops, ["elbow.right 0", "wrist.right 0", "wrist.right 1"], "the fixture's arm stands at these stops");
    const target = [0.046321817712006386, 1.557405804959468, 0.38646868857246497];
    const before = pointAtToRef(chain, angles, knuckles, new Vector3());
    const left = solveReach(chain, angles, free, [{ point: knuckles, target }]);
    assert.ok(angles.flat().every(Number.isFinite) && Number.isFinite(left), `the solve left ${JSON.stringify(angles)}, ${left} m off`);
    for (const f of free) assert.ok(f.min <= angles[f.joint][f.k] && angles[f.joint][f.k] <= f.max, `${chain[f.joint].spec.name} ${f.k} is at ${angles[f.joint][f.k]}`);
    // It began 1.6 mm from its place, along its own line, and stays there: no freedom left lengthens it.
    const began = Vector3.Distance(before, new Vector3(...target));
    assert.ok(began > 0.001 && began < 0.002 && Math.abs(left - began) < 1e-4, `${(1000 * began).toFixed(2)} mm off before and ${(1000 * left).toFixed(2)} after`);
  } finally { stand.dispose(); }
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
    motor.reach("right", { places: [{ point: "knuckles", position: target }], seconds: 0.4 });
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

test("a goal's path runs on through its place, and one that follows keeps its start and its clock as its place moves", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk", hz: 120 });
  const motor = motorControl(stand.built, 0.1, GUARD);
  const driver = driveMuscles(stand.built, stand.world, motor.control);
  try {
    stand.step(stand.seconds(1));
    const from = motor.knucklesToRef("right", new Vector3()).clone();
    const goal = (shift, more) => ({ places: [{ point: "knuckles", position: [from.x + shift, from.y + 0.05, from.z + 0.2] }], seconds: 0.4, ...more });
    const placeOf = ({ places: [{ position }] }) => new Vector3(...position);
    /** The arm let back to its guard, then what `given(s)` gives, if anything, asked before each of `steps` steps: the path's point after the first, and after the last. */
    const run = (steps, given) => {
      motor.release("right");
      stand.step(stand.seconds(1));
      let start = null;
      for (let s = 0; s < steps; s++) {
        const next = given(s);
        if (next) motor.reach("right", next);
        stand.step(1);
        start ??= motor.path("right").clone();
      }
      return { start, end: motor.path("right").clone() };
    };
    const half = stand.seconds(0.2) + 1, whole = stand.seconds(0.4) + 1, shifted = (s) => 0.001 * s;

    // Through: at its time's end the path is that far beyond its place, on the line it came by.
    const once = (made) => (s) => s === 0 ? made : null;
    const through = run(whole, once(goal(0, { through: 0.1 }))), place = placeOf(goal(0));
    const came = place.subtract(through.start).normalize(), beyond = through.end.subtract(place);
    assert.ok(Math.abs(beyond.length() - 0.1) < 1e-9 && Vector3.Distance(beyond.normalize(), came) < 1e-9, `the path ended ${beyond.length()} m beyond its place`);
    // The control: with none, it ends at its place.
    assert.ok(Vector3.Distance(run(whole, once(goal(0))).end, place) < 1e-12);

    // A goal that follows, given each step with its place a millimetre on: half its time gone it
    // is half the way from where it began to the place as last given, and at its time's end at it.
    const midway = run(half, (s) => goal(shifted(s), { follows: true })), last = placeOf(goal(shifted(half - 1)));
    assert.ok(Vector3.Distance(midway.end, midway.start.add(last.subtract(midway.start).scale(0.5))) < 1e-9, `half its time gone the path is at ${midway.end.asArray()}`);
    const followed = run(whole, (s) => goal(shifted(s), { follows: true }));
    assert.ok(Vector3.Distance(followed.end, placeOf(goal(shifted(whole - 1)))) < 1e-12);

    // One that does not, given another place half its time gone, begins again there: after as
    // long again it is half the way from where the knuckles then were, not at its place.
    const again = run(2 * half, (s) => s === 0 ? goal(0) : s === half ? goal(0.05) : null), other = placeOf(goal(0.05));
    const short = Vector3.Distance(again.end, other);
    assert.ok(short > 0.02, `the path is ${short} m from its place`);
    assert.ok(Vector3.Distance(run(2 * half, (s) => goal(s < half ? 0 : 0.05, { follows: true })).end, other) < 1e-12, "the control: following, its time is up");
    // And a goal of another time is another path, though both follow.
    const retimed = run(2 * half, (s) => goal(s < half ? 0 : 0.05, { follows: true, seconds: s < half ? 0.4 : 0.3 }));
    assert.ok(Vector3.Distance(retimed.end, other) > 0.005, `the path is ${Vector3.Distance(retimed.end, other)} m from its place`);
  } finally {
    driver.dispose(); stand.dispose();
  }
});

/** The right arm's seven freedoms, in the order the poses below give them. */
const ARM = ["shoulder.right flexion", "shoulder.right abduction", "shoulder.right internal rotation", "elbow.right flexion",
  "wrist.right flexion", "wrist.right radial deviation", "wrist.right pronation"];

/**
 * Poses of the right arm that lay a held club's swell three ways: across the body, upright, and
 * askew from the guard with the wrist bent. Each is within the arm's ranges, so the two places it
 * gives are ones the arm can take.
 */
const LINES = {
  across: [2.03, 0.69, -0.08, -0.26, -0.82, -0.06, 1.06],
  upright: [1.36, -0.38, -0.11, 0.15, -0.58, -0.60, -0.17],
  askew: [0.5, -0.2, 0, 1.3, 0.6, -0.3, 0.5],
};

/** The Warrior with the club, and where `pose` of his right arm puts each of `names`, body frame. */
async function clubStand(hz, pose, names) {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const stand = await coreStand(spec, { ground: false, pinned: "lowerTrunk", hz });
  const arm = rightArm(stand.built), points = rigidPoints(spec, arm.hand.spec);
  const angles = arm.at({ ...GUARD, ...Object.fromEntries(ARM.map((name, i) => [name, pose[i]])) });
  const places = names.map((point) => ({ point, position: pointAtToRef(arm.chain, angles, points.get(point).value, new Vector3()).asArray() }));
  return { stand, places };
}

/** The Warrior at the guard with the club, then `places` asked of his right hand over 0.6 s: how far each point ends from its place, and the wrist's angles. */
async function placeRun(hz, pose, names, order = (places) => places) {
  const { stand, places } = await clubStand(hz, pose, names);
  const motor = motorControl(stand.built, 0.1, GUARD);
  const driver = driveMuscles(stand.built, stand.world, motor.control);
  try {
    stand.step(stand.seconds(1));
    motor.reach("right", { places: order(places), seconds: 0.6 });
    const now = new Vector3();
    let strayed = 0;
    for (let s = 0; s < stand.seconds(1.2); s++) {
      stand.step(1);
      strayed = Math.max(strayed, Vector3.Distance(motor.path("right"), motor.pointToRef("right", order(places)[0].point, now)));
    }
    return {
      off: places.map(({ point, position }) => Vector3.Distance(motor.pointToRef("right", point, now), Vector3.FromArray(position))),
      end: places.map(({ point }) => motor.pointToRef("right", point, new Vector3())),
      wrist: ARM.slice(4).map((name) => driver.angle(driver.channel(name))),
      strayed,
    };
  } finally {
    driver.dispose(); stand.dispose();
  }
}

test("two points of what a hand holds are put where they are asked", async () => {
  for (const [line, pose] of Object.entries(LINES)) {
    // Either point first: the first is placed, the second lays the line.
    for (const order of [(places) => places, (places) => [places[1], places[0]]]) {
      const run = await placeRun(120, pose, ["swellFrom", "swellTo"], order);
      run.off.forEach((off, i) => assert.ok(off < 0.005, `${line}: ${["swellFrom", "swellTo"][i]} ended ${(1000 * off).toFixed(1)} mm from its place`));
      // The posture holds the wrist straight: a line laid is the wrist's doing.
      assert.ok(Math.max(...run.wrist.map(Math.abs)) > 0.2, `${line}: the wrist's angles are ${run.wrist.map((a) => a.toFixed(2))}`);
    }
  }
});

test("a hand goal on a held point is followed alike at 120 Hz and 1920 Hz", async () => {
  // One place whose pose has the wrist at the end of a range, where a solve that clamps a freedom
  // it has already counted on settles 30 mm short; and two places.
  for (const [line, names] of [["across", ["swell"]], ["upright", ["swellFrom", "swellTo"]]]) {
    const slow = await placeRun(120, LINES[line], names), fast = await placeRun(1920, LINES[line], names);
    for (const [hz, run] of [[120, slow], [1920, fast]]) {
      run.off.forEach((off, i) => assert.ok(off < 0.005, `${line}, ${hz} Hz: ${names[i]} ended ${(1000 * off).toFixed(1)} mm from its place`));
      assert.ok(run.strayed < 0.03, `${line}, ${hz} Hz: ${names[0]} strayed ${(1000 * run.strayed).toFixed(1)} mm from its path`);
    }
    slow.end.forEach((end, i) => {
      const apart = Vector3.Distance(end, fast.end[i]);
      assert.ok(apart < 0.005, `${line}: the two rates ended ${names[i]} ${(1000 * apart).toFixed(1)} mm apart`);
    });
  }
});

test("a hand goal is refused with its reason: no place, three, a point the hand has not, two places one body cannot be at", async () => {
  const { stand, places: [from, to] } = await clubStand(120, LINES.upright, ["swellFrom", "swellTo"]);
  const motor = motorControl(stand.built, 0.1, GUARD);
  try {
    const goal = (places) => () => motor.reach("right", { places, seconds: 0.4 });
    assert.throws(goal([]), /one place or two, not 0/);
    assert.throws(goal([from, to, from]), /one place or two, not 3/);
    assert.throws(goal([{ point: "pommel", position: from.position }]), /the right hand has no point pommel: it has knuckles, .*swellFrom, swellTo, swell/);
    // The left hand holds nothing: the club's points are the right's alone.
    assert.throws(() => motor.reach("left", { places: [from], seconds: 0.4 }), /the left hand has no point swellFrom/);
    // A decimetre farther apart than the swell's ends are; the control is the pair as built.
    const far = { point: to.point, position: [to.position[0], to.position[1] + 0.1, to.position[2]] };
    const apart = Math.hypot(...far.position.map((c, k) => c - from.position[k])), built = Math.hypot(...to.position.map((c, k) => c - from.position[k]));
    assert.ok(apart - built > 0.09, `the fixture's places are ${(apart - built).toFixed(3)} m farther apart than the points`);
    assert.throws(goal([from, far]), /one rigid body cannot be at both/);
    assert.doesNotThrow(goal([from, to]));
    assert.doesNotThrow(goal([from]));
  } finally { stand.dispose(); }
});

test("two tasks with fewer freedoms than rows are solved without the posture's pull: a line the shoulder and elbow can lay is found", async () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const stand = await coreStand(spec, { ground: false, pinned: "lowerTrunk" });
  try {
    const arm = rightArm(stand.built), points = rigidPoints(spec, arm.hand.spec), next = random(11);
    const [a, b] = ["swellFrom", "swellTo"].map((name) => points.get(name).value);
    assert.equal(arm.free.length, 4, "the shoulder's three and the elbow's one: fewer than two tasks' five rows");
    let worst = 0;
    for (let n = 0; n < 10; n++) {
      // A pose near the guard by the four freedoms alone, the wrist as the guard has it: its two places, solved from the guard.
      const angles = arm.at(GUARD);
      for (const f of arm.free) angles[f.joint][f.k] = Math.max(f.min, Math.min(f.max, angles[f.joint][f.k] + 0.6 * (next() - 0.5)));
      const tasks = [a, b].map((point) => ({ point, target: pointAtToRef(arm.chain, angles, point, new Vector3()).asArray() }));
      const found = arm.at(GUARD);
      worst = Math.max(worst, solveReach(arm.chain, found, arm.free, tasks));
      for (const row of found) for (const angle of row) assert.ok(Number.isFinite(angle), "an angle solved is a number");
    }
    assert.ok(worst < 0.002, `a line the four freedoms can lay was missed by ${(1000 * worst).toFixed(2)} mm`);
    assert.throws(() => solveReach(arm.chain, arm.at(GUARD), arm.free, []), /one task or two, not 0/);
  } finally { stand.dispose(); }
});
