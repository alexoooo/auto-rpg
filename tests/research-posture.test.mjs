/**
 * **The posture audit's statics** (`research/core-posture-trials.mjs`): that a posture is written in
 * the joints' own measure, that the least share is the body's statics and the engine's, and that
 * the controls come out as they must. Node, statics; the engine's check on the core world, Rapier,
 * 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { jointAngles } from "../src/core/build/joint-state.ts";
import { pointAtToRef } from "../src/core/control/kinematics.ts";
import { pointOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import {
  AUDITED, jointMomentsOf, leastShare, linearProgramme, placeLike, posed, project, random, rangesOf, recordOf, rowNamed, search, staticBody,
} from "../research/core-posture-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const body = await staticBody();
test.after(() => body.dispose());

/** The angles of `posture` by joint, as `jointAngles` gives them. */
const byJoint = (posture) => body.joints.map((joint, j) => body.freedoms.flatMap((f, i) => (f.j === j ? [posture.angles[i]] : [])));
const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what}: ${a} against ${b}`);

test("a posture is written in the joints' own measure", () => {
  const draw = random(11);
  for (let trial = 0; trial < 5; trial++) {
    const angles = body.freedoms.map((f) => f.lo + (0.1 + 0.8 * draw()) * (f.hi - f.lo));
    const posture = { height: 0.5 + draw(), pitch: 2 * draw() - 1, roll: draw() - 0.5, angles };
    posed(body, posture);
    const want = byJoint(posture);
    body.joints.forEach((joint, j) => jointAngles(joint).forEach((a, k) => near(a, want[j][k], 1e-9, `${joint.spec.name} freedom ${k}`)));
    // A point of a hand's, off its frame's origin, where the chain's kinematics put it.
    const hand = body.built.segments.get("hand.left"), chain = body.chains.get(hand), point = [0.02, -0.05, 0.03];
    const R = Quaternion.RotationYawPitchRoll(0, posture.pitch, posture.roll);
    const from = pointAtToRef(chain, chain.map((joint) => want[body.jointIndex.get(joint)]), point, new Vector3()).applyRotationQuaternion(R).addInPlaceFromFloats(0, posture.height, 0);
    const at = pointOfToRef(hand, point, new Vector3());
    // Within the rounding of a turn read back through the segment's rest turn.
    for (const k of ["x", "y", "z"]) near(at[k], from[k], 1e-8, `the hand's point, ${k}`);
  }
  // The reference pose: every angle zero, every node where the body was built.
  posed(body, { height: 0, pitch: 0, roll: 0, angles: body.freedoms.map(() => 0) });
  for (const joint of body.joints) for (const a of jointAngles(joint)) near(a, 0, 1e-12, joint.spec.name);
  for (const segment of body.segments) {
    const origin = segment.frame.origin;
    [0, 1, 2].forEach((k) => near(segment.node.position.asArray()[k], origin[k], 1e-12, segment.spec.name));
  }
});

/** The reference pose put on both soles. */
function standing() {
  const row = rowNamed("stand"), start = { height: 1, pitch: 0, roll: 0, angles: body.freedoms.map(() => 0) };
  return { row, posture: project(body, row, start, { knobs: [] }).posture };
}

test("standing is a sum anyone can do", () => {
  const { row, posture } = standing();
  const solved = leastShare(body, row, posture);
  assert.ok(solved.balanced);
  // The soles bear the weight, 79 kg's.
  const g = new Vector3(...body.gravity);
  near(body.mass, 79, 1e-9, "the mass, kg");
  near(solved.forces.reduce((sum, f) => sum + f.y, 0), -79 * g.y, 1e-6, "the ground's push, N");
  // The right knee's torque reckoned by hand from what lies under it: the shank's and the foot's
  // weights and the sole's push, each's moment about the knee's axis.
  const f = body.channel.get("knee.right flexion"), axis = new Vector3(...body.dynamics.axis(f)), pivot = new Vector3(...body.dynamics.pivot(f));
  let moment = 0;
  for (const name of ["shank.right", "foot.right"]) {
    const segment = body.built.segments.get(name), c = pointOfToRef(segment, segment.rigid.centre, new Vector3());
    moment += Vector3.Dot(axis, Vector3.Cross(c.subtract(pivot), g.scale(segment.rigid.mass)));
  }
  solved.bearing.forEach((b, k) => { if (b.touch.segment.spec.name === "foot.right") moment += Vector3.Dot(axis, Vector3.Cross(b.point.subtract(pivot), solved.forces[k])); });
  near(solved.torques[f], -moment, 1e-6, "the knee's torque, N m");
  assert.ok(Math.abs(moment) > 1, `the sum is not empty: ${moment} N m`);
  // A half kneel on the ball of the rear foot and its mirror, the left knee down: one share. (The
  // boots' tops differ by 2 mm, so an instep is no mirror of the other.)
  const half = { ...rowNamed("half kneel"), touch: ["knee.right", "ball.right", "sole.left"] }, record = answer(half);
  const swap = (name) => name.replace(/\.(left|right) /, (_, side) => `.${side === "left" ? "right" : "left"} `);
  const mirror = {
    ...record.posture, roll: -record.posture.roll,
    angles: body.freedoms.map((f) => (/\.(left|right) /.test(f.name) ? record.posture.angles[body.channel.get(swap(f.name))] : / right$/.test(f.name) ? -record.posture.angles[body.channel.get(f.name)] : record.posture.angles[body.channel.get(f.name)])),
  };
  const mirrored = { ...half, touch: half.touch.map((name) => name.replace(/left|right/, (side) => (side === "left" ? "right" : "left"))) };
  posed(body, record.posture);
  const one = leastShare(body, half, record.posture);
  posed(body, mirror);
  const other = leastShare(body, mirrored, mirror);
  assert.ok(one.balanced && other.balanced && one.share > 0.01);
  near(other.share, one.share, 1e-6, "the two sides' shares");
});

test("the least share is no more than a least-squares push's", () => {
  const { row, posture } = standing();
  const solved = leastShare(body, row, posture);
  // The soles' corners pushing straight up, least squares under the weight and its moments.
  const points = solved.bearing.map((b) => b.point), W = body.weight;
  const centre = body.segments.reduce((sum, s) => sum.addInPlace(pointOfToRef(s, s.rigid.centre, new Vector3()).scale(s.rigid.mass)), new Vector3()).scale(1 / body.mass);
  const A = [points.map(() => 1), points.map((p) => p.x), points.map((p) => p.z)], b = [W, W * centre.x, W * centre.z];
  const G = A.map((r) => A.map((s) => r.reduce((sum, v, k) => sum + v * s[k], 0)));
  const z = solve3(G, b), push = points.map((_, k) => A.reduce((sum, r, i) => sum + r[k] * z[i], 0));
  assert.ok(push.every((p) => p >= 0), `every corner pushes: ${push}`);
  // Its share: each freedom's torque over its side's peak.
  const share = Math.max(...body.freedoms.map((fr, f) => {
    let t = -body.dynamics.gravity[f];
    points.forEach((x, k) => {
      if (!body.moves[f].has(solved.bearing[k].touch.segment)) return;
      const m = new Vector3(...body.dynamics.axis(f)), p = new Vector3(...body.dynamics.pivot(f));
      t -= Vector3.Dot(Vector3.Cross(m, x.subtract(p)), new Vector3(0, push[k], 0));
    });
    return t >= 0 ? t / fr.plus : -t / fr.minus;
  }));
  assert.ok(solved.share <= share + 1e-9, `least ${solved.share}, least squares ${share}`);
  assert.ok(share > 0, `the least squares' share is ${share}`);
});

/** Solve a 3 by 3 system by Cramer's rule. */
function solve3(G, b) {
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(G);
  return [0, 1, 2].map((c) => det(G.map((row, r) => row.map((v, k) => (k === c ? b[r] : v)))) / D);
}

test("the simplex solves programmes small enough to solve by hand", () => {
  // The least of -x - 2y under x + y <= 4 and y - x <= 1: the corner (1.5, 2.5).
  const corner = linearProgramme([-1, -2], [[1, 1], [-1, 1]], [4, 1], [], []);
  assert.equal(corner.status, "optimal");
  near(corner.x[0], 1.5, 1e-12, "x"); near(corner.x[1], 2.5, 1e-12, "y"); near(corner.value, -6.5, 1e-12, "the least");
  // An equality, and a bound written with its sign turned: x + 2y = 3, y >= 1, the least of x + y.
  const equal = linearProgramme([1, 1], [[0, -1]], [-1], [[1, 2]], [3]);
  assert.equal(equal.status, "optimal");
  near(equal.x[0], 0, 1e-12, "x"); near(equal.x[1], 1.5, 1e-12, "y");
  // y >= 2 cannot meet x + 2y = 3 with x >= 0: at best y = 1.5 meets the equality and falls 0.5 short of the bound.
  const none = linearProgramme([1, 1], [[0, -1]], [-2], [[1, 2]], [3]);
  assert.equal(none.status, "infeasible");
  near(none.infeasibility, 0.5, 1e-12, "how far short");
  assert.equal(linearProgramme([-1, 0], [[1, -1]], [1], [], []).status, "unbounded");
});

/** A row's searched answer, few evaluations, seed 0, as its record. */
function answer(row, { height, evals = 300, variant } = {}) {
  return recordOf(body, row, search(body, row, { evals, height, variant }), { height, variant });
}

test("the controls: standing and on all fours held, a deep squat at a tenth of its strength not", () => {
  const stand = answer(rowNamed("stand")), fours = answer(rowNamed("fours")), squat = answer(rowNamed("squat"), { height: 0.5 });
  assert.deepEqual(Object.keys(stand), [
    "row", "route", "variant", "friction", "seed", "found", "balanced", "held", "share", "miss", "binds", "ratios", "stops", "forces", "margin",
    "off", "overlap", "height", "pitch", "roll", "angles", "posture",
  ]);
  for (const record of [stand, fours, squat]) assert.deepEqual([record.found, record.balanced, record.held], [true, true, true], record.row);
  // A share is the strength's inverse: at a tenth of every strength, a share over 0.1 is not held.
  assert.ok(stand.share < 0.1, `standing asks ${stand.share} of its strength`);
  assert.ok(squat.share > 0.1, `squatting at 0.5 m asks ${squat.share} of its strength`);
  assert.deepEqual(Object.keys(fours.forces), ["knee.left", "knee.right", "toes.left", "toes.right", "hand.left", "hand.right"]);
  near(Object.values(fours.forces).reduce((a, b) => a + b, 0), body.weight, 1, "all fours' pushes, N");
  // On all fours bearing on the hands alone, the knees and feet touching: nothing holds it.
  const fours_ = rowNamed("fours"), hands = answer({ ...fours_, name: "fours, hands alone", bear: ["hand.left", "hand.right"] });
  assert.equal(hands.held, false);
});

test("a stop carries what presses on it, and short of it the muscles do", () => {
  const row = rowNamed("half kneel, knee light"), record = answer(row);
  const knee = "knee.right flexion", f = body.channel.get(knee);
  assert.ok(record.held, "the rear knee's stop holds the body");
  const stop = record.stops.find((s) => s.channel === knee);
  assert.ok(stop && stop.at === "hi" && Math.abs(stop.torque) > 50, `the knee's stop bears ${stop?.torque} N m`);
  assert.equal(record.posture.angles[f], body.freedoms[f].hi, "the knee on its stop");
  const on = leastShare(body, row, record.posture, { snap: true });
  near(on.torques[f], 0, 1e-6, "the knee's muscles on the stop, N m");
  // The same posture with the knee's stop stripped: the knee 0.4 rad and more short of its stop, its muscles bear it.
  posed(body, record.posture);
  const off = leastShare(body, row, record.posture, { snap: true, ranges: rangesOf(body, "knee") });
  assert.ok(Math.abs(off.torques[f]) > 50, `short of its stop the knee's muscles give ${off.torques[f]} N m`);
  assert.ok(off.share > on.share, `the share short of the stop ${off.share}, on it ${on.share}`);
});

test("the statics' torques hold the engine's body still", async () => {
  const spec = modelSpec(AUDITED);
  for (const name of ["fours", "half kneel"]) {
    const row = rowNamed(name), record = answer(row, { evals: 300 });
    assert.ok(record.held, name);
    posed(body, record.posture);
    const solved = leastShare(body, row, record.posture, { snap: true });
    const moments = jointMomentsOf(body, record.posture, solved.torques);
    // The segments' mean speed, its most over 0.1 s, the body put on the ground with nothing to fall,
    // its joints given these moments and its motors off. Held by torques that do not answer its motion,
    // on all fours an arm buckles, growing from about 0.1 s.
    const fastest = async (given) => {
      const stand = await coreStand(spec);
      try {
        posed(body, record.posture);
        placeLike(body, stand.built, 0);
        let peak = 0;
        const v = new Vector3();
        for (let step = 0; step < stand.seconds(0.1); step++) {
          body.joints.forEach((joint, j) => {
            const child = stand.built.segments.get(joint.child.spec.name), parent = stand.built.segments.get(joint.parent.spec.name);
            child.body.applyTorque(given[j]);
            parent.body.applyTorque(given[j].scale(-1));
          });
          stand.step(1);
          let mean = 0;
          for (const segment of stand.built.segments.values()) mean += segment.body.linearVelocityToRef(v).length() / stand.built.segments.size;
          peak = Math.max(peak, mean);
        }
        return peak;
      } finally { stand.dispose(); }
    };
    const still = await fastest(moments);
    // The largest torque's sign flipped, and no torque at all.
    const largest = solved.torques.reduce((best, t, i) => (Math.abs(t) > Math.abs(solved.torques[best]) ? i : best), 0);
    const flipped = jointMomentsOf(body, record.posture, solved.torques.map((t, i) => (i === largest ? -t : t)));
    const wrong = await fastest(flipped), limp = await fastest(moments.map(() => new Vector3()));
    assert.ok(still < 0.04, `${name}: held by the statics' torques, the segments moved ${still} m/s`);
    assert.ok(wrong > 3 * still, `${name}: ${body.freedoms[largest].name}'s torque turned, ${wrong} m/s`);
    assert.ok(limp > 8 * still, `${name}: limp, ${limp} m/s`);
  }
});
