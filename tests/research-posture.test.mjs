/**
 * **The posture audit's statics** (`research/core-posture-trials.mjs`): that a posture is written in
 * the joints' own measure, that the least share is the body's statics, and that the controls come
 * out as they must. Node, statics. Whether the engine's body put in a posture stays or falls as the
 * statics say is `research-posture-capability.test.mjs`'s.
 */
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { jointAngles } from "../src/core/build/joint-state.ts";
import { pointAtToRef } from "../src/core/control/kinematics.ts";
import { pointOfToRef } from "../src/core/control/support.ts";
import {
  knobsOf, leastShare, linearProgramme, posed, project, random, rangesOf, recordOf, rowNamed, search, simplex, staticBody, statics, TOE, TOE_ON,
} from "../research/core-posture-trials.mjs";

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

test("the simplex solves the audit's hard programmes, their stops as shares and in N m, in any order", () => {
  // Least shares the simplex once failed by its rounding (each its `what`), the stops' torques
  // written as shares of 10^4 N m; then the same written in N m. One marked `bare` is solved by
  // the simplex itself in its own order; the rest need another order.
  for (const lp of JSON.parse(readFileSync(new URL("./fixtures/posture-programme.json", import.meta.url), "utf8"))) hard(lp);
});

/**
 * The orders a hard programme is given in: its own, two drawn, and the one in which the third's
 * tableau calls it infeasible.
 */
const ORDERED = [0, 1, 2, 46];

/** One hard programme solved in both forms and four orders: each answer within its constraints, one least. */
function hard(lp) {
  if (lp.bare) assert.equal(simplex(lp.cost, lp.Aub, lp.bub, lp.Aeq, lp.beq).status, "optimal", `${lp.what}, by the simplex alone`);
  const stop = new Set(lp.stops), unit = (a) => a.filter((v) => v !== 0).length === 1 && a.some((v, j) => v !== 0 && stop.has(j));
  const nm = (a) => a.map((v, j) => (stop.has(j) ? v / 1e4 : v));
  const inNm = { ...lp, Aub: lp.Aub.map((a) => (unit(a) ? a : nm(a))), bub: lp.bub.map((b, i) => (unit(lp.Aub[i]) ? b * 1e4 : b)), Aeq: lp.Aeq.map(nm) };
  const dot = (a, x) => a.reduce((sum, v, k) => sum + v * x[k], 0);
  const values = [];
  for (const form of [lp, inNm]) for (const seed of ORDERED) {
    // The first order is the programme's own.
    const draw = random(seed), order = [...lp.cost.keys()].map((j) => [seed === 0 ? j : draw(), j]).sort((a, b) => a[0] - b[0]).map(([, j]) => j);
    const P = (a) => order.map((j) => a[j]), Aub = form.Aub.map(P), Aeq = form.Aeq.map(P);
    const r = linearProgramme(P(form.cost), Aub, form.bub, Aeq, form.beq);
    const what = `${lp.what}, seed ${seed}`;
    assert.equal(r.status, "optimal", what);
    assert.ok(r.x.every((v) => v >= -1e-9), `${what}: ${Math.min(...r.x)}`);
    Aub.forEach((a, i) => assert.ok(dot(a, r.x) <= form.bub[i] + 1e-9 * (1 + Math.abs(form.bub[i])), `${what}, row ${i}`));
    Aeq.forEach((a, i) => near(dot(a, r.x), form.beq[i], 1e-9, `${what}, equality ${i}`));
    values.push(r.value);
  }
  assert.ok(values[0] > 0.1, `${lp.what}: the least share ${values[0]}`);
  for (const v of values) near(v, values[0], 1e-9, `${lp.what}: the least share in every order and form`);
}

/** A row's searched answer, few evaluations, seed 0, as its record. */
function answer(row, { height, evals = 300, variant } = {}) {
  return recordOf(body, row, search(body, row, { evals, height, variant }), { height, variant });
}

test("the controls: standing and on all fours held, a deep squat at a tenth of its strength not", () => {
  const stand = answer(rowNamed("stand")), fours = answer(rowNamed("fours")), squat = answer(rowNamed("squat"), { height: 0.5 });
  assert.deepEqual(Object.keys(stand), [
    "row", "route", "variant", "friction", "seed", "envelope", "engine", "limitModel", "found", "balanced", "held", "share", "miss", "binds", "ratios", "stops",
    "forces", "margin", "off", "overlap", "height", "pitch", "roll", "angles", "toes", "posture",
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
  // The rear foot on its ball, where the search folds the light knee onto its stop; on its instep
  // (`half kneel, knee light`) a lunge off the stop asks less of these legs.
  const row = rowNamed("half kneel on toes, knee light"), record = answer(row);
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

test("a toe that bears nothing rests, and the toe's body then reads as the rigid bare foot's", async () => {
  const bare = await staticBody(undefined, undefined, "barefoot"), toe = await staticBody(undefined, undefined, "toe");
  try {
    const stand = rowNamed("stand"), kneel = rowNamed("kneel on toes");
    // A toe is a knob only where the row may bear on it: a symmetric row's two as one, mirrored.
    assert.equal(knobsOf(toe, stand).length, knobsOf(bare, stand).length);
    assert.deepEqual(knobsOf(toe, kneel).slice(knobsOf(bare, kneel).length), [toe.toe.sides.map((t) => t.index).reverse()]);
    const placed = project(bare, stand, { height: 1, pitch: 0, roll: 0, angles: bare.freedoms.map(() => 0) }, { knobs: [] }).posture;
    const withToes = (left, right) => ({ ...placed, angles: [...placed.angles, left, right] });
    const read = (posture) => (posed(toe, posture), leastShare(toe, stand, posture));
    posed(bare, placed);
    const rigid = leastShare(bare, stand, placed), rest = read(withToes(TOE.rest, TOE.rest));
    assert.ok(rigid.balanced && rest.balanced);
    near(rest.share, rigid.share, 1e-9, "the share at rest");
    assert.deepEqual(rest.toes.map((t) => [t.angle, t.spring, t.ground]), [[TOE.rest, 0, 0], [TOE.rest, 0, 0]]);
    // The spring's rows are live: a toe that bears nothing holds within `TOE_ON` of rest and not beyond.
    assert.equal(read(withToes(TOE.rest + TOE_ON / 2, TOE.rest)).balanced, true);
    assert.equal(read(withToes(TOE.rest, TOE.rest - 2 * TOE_ON)).balanced, false);
  } finally { bare.dispose(); toe.dispose(); }
});

test("a loaded toe holds a squat on the toes that neither rigid foot holds, at its spring's moment", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/man-loaded-toe.json", import.meta.url), "utf8"));
  const row = rowNamed(fixture.row), bodies = await Promise.all(["toe", "barefoot", "boot"].map((envelope) => staticBody(undefined, undefined, envelope)));
  const [toe, bare, boot] = bodies;
  try {
    const read = (body, angles) => statics(body, row, { ...fixture.posture, angles }, { height: fixture.height });
    const held = read(toe, fixture.posture.angles);
    assert.equal(held.score, held.solved.share, "on its ground, apart and balanced");
    near(held.solved.share, fixture.share, 1e-3, "the share");
    // Each toe bears the ground's push at the spring's moment, within `TOE_ON`'s, and that push is
    // many times the band: the spring's rows decide where the toe stands.
    const band = TOE.stiffness * TOE_ON;
    for (const t of held.solved.toes) {
      assert.ok(Math.abs(t.ground - t.spring) <= band + 1e-9, `the ground's moment ${t.ground} N m, the spring's ${t.spring}`);
      assert.ok(Math.abs(t.ground) > 10 * band, `the toe bears ${t.ground} N m`);
    }
    // Both toes turned 0.2 rad further down, the rest as it was: the ground's push moves about the
    // hinge to follow the spring, and the legs pay for it. The lumbar's flexion binds the least share
    // both ways, the legs paying beneath it, so what is read is the legs' largest share, each posture's
    // spread over the least sum of shares (`leastShare`).
    posed(toe, held.posture);
    const before = leastShare(toe, row, held.posture);
    const turned = { ...held.posture, angles: held.posture.angles.map((a, i) => (toe.toe.sides.some((t) => t.index === i) ? a + 0.2 : a)) };
    posed(toe, turned);
    const following = leastShare(toe, row, turned);
    assert.ok(following.balanced);
    for (const t of following.toes) assert.ok(Math.abs(t.ground - t.spring) <= band + 1e-9, `turned, the ground's moment ${t.ground} N m, the spring's ${t.spring}`);
    const legs = (solved) => Math.max(...solved.ratios.map((r, f) => (/^(hip|knee|ankle)\./.test(toe.freedoms[f].name) ? Math.abs(r) : 0)));
    assert.ok(following.share >= held.solved.share - 1e-9 && legs(following) > legs(before) + 0.02,
      `turned, the share ${following.share} against ${held.solved.share}, the legs' largest ${legs(following)} against ${legs(before)}`);
    // The same posture with the toes rigid: the bare foot cannot balance it, the boots overlap.
    const angles = fixture.posture.angles.slice(0, bare.freedoms.length);
    const rigid = read(bare, angles), booted = read(boot, angles);
    assert.ok(rigid.score >= 100 && !rigid.solved.balanced, `bare, the score ${rigid.score}`);
    assert.ok(booted.score >= 1000 && booted.overlap.depth > 0.01, `booted, the score ${booted.score}`);
  } finally { for (const body of bodies) body.dispose(); }
});
