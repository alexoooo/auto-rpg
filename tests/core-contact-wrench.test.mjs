/**
 * The ground's wrench shared among bearing patches (`src/core/control/contact-wrench.ts`): every
 * wrench a sole's corners can make, each pushing inside the friction pyramid, is given with no
 * miss; a twist past what the corners' friction can give, a centre of pressure past the sole and a
 * pull are not, and what is given lies inside the limits; a sole that bears nothing gives nothing,
 * twist included; two recorded shares at degenerate corners (a Rogue shoved 15 N s at 315 degrees,
 * friction limits meeting at a light sole; a Rogue striking in its routine's fourteenth loop) come
 * back finite; and so do 20000 random two-sole problems shaped like the stance's, each inside its
 * soles' limits. The control, run by hand: with a blocking limit's dependence on the working set
 * judged by its cosine with the step, 34 of those 20000 come back NaN. Points: three give every
 * wrench whose pressure falls inside them, each a force and no moment, and nothing past their
 * limits; and a sole among points shares with them as their levers say. Patches given parts bear
 * by them where the wrench leaves the split open. A work used for fewer patches than it is made
 * for answers to the bit as one made for them, whatever it was used for before. A patch's corners
 * (`patchCorners`) are where its centre of pressure may go.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { groundWrenchWork, patchCorners, shareGroundWrench } from "../src/core/control/contact-wrench.ts";

const MU = 0.5, PYRAMID = MU / Math.SQRT2;
/** One work for every share below, made for the most patches any asks. */
const WORK = groundWrenchWork(4, 0);
const out = (k) => Array.from({ length: k }, () => ({ force: new Vector3(), moment: new Vector3() }));
const missOf = () => ({ force: new Vector3(), moment: new Vector3() });
/** A sole's frame: along it, across it (up x along), and its limits read in it. */
function inSole(sole, share) {
  const u = sole.along, w = new Vector3(u.z, 0, -u.x), f = share.force, m = share.moment;
  return { f1: Vector3.Dot(f, u), f2: Vector3.Dot(f, w), f3: f.y, t1: Vector3.Dot(m, u), t2: Vector3.Dot(m, w), t3: m.y };
}
/** How far `share` is outside `sole`'s limits (Caron et al. 2015), N or N m; 0 inside. */
function outside(sole, share) {
  const { f1, f2, f3, t1, t2, t3 } = inSole(sole, share), X = sole.length, Y = sole.width;
  const over = [-f3, Math.abs(f1) - PYRAMID * f3, Math.abs(f2) - PYRAMID * f3, Math.abs(t1) - Y * f3, Math.abs(t2) - X * f3,
    -PYRAMID * (X + Y) * f3 + Math.abs(Y * f1 - PYRAMID * t1) + Math.abs(X * f2 - PYRAMID * t2) - t3,
    t3 - PYRAMID * (X + Y) * f3 + Math.abs(Y * f1 + PYRAMID * t1) + Math.abs(X * f2 + PYRAMID * t2)];
  return Math.max(0, ...over);
}
/** How far `share` is outside a point's limits, N or N m: no pull, the friction pyramid along x and z, and no moment. */
function outsidePoint(share) {
  const f = share.force;
  return Math.max(0, -f.y, Math.abs(f.x) - PYRAMID * f.y, Math.abs(f.z) - PYRAMID * f.y, share.moment.length());
}

test("every wrench a sole's corners can make inside the friction pyramid is given, with no miss", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let worst = 0, largestTwist = 0;
  for (let trial = 0; trial < 200; trial++) {
    const a = random() * 2 * Math.PI, u = new Vector3(Math.sin(a), 0, Math.cos(a)), w = new Vector3(u.z, 0, -u.x);
    const sole = { kind: "sole", middle: new Vector3(random() - 0.5, 0, random() - 0.5), along: u, length: 0.12, width: 0.05 };
    const centre = new Vector3(0, 0.9, 0), force = new Vector3(), moment = new Vector3();
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const fz = 100 * random();
      const f = u.scale(PYRAMID * fz * (2 * random() - 1)).addInPlace(w.scale(PYRAMID * fz * (2 * random() - 1))).addInPlaceFromFloats(0, fz, 0);
      const at = sole.middle.add(u.scale(i * sole.length)).addInPlace(w.scale(j * sole.width));
      force.addInPlace(f);
      moment.addInPlace(Vector3.Cross(at.subtract(centre), f));
    }
    const shares = out(1), miss = missOf();
    shareGroundWrench(WORK, [sole], centre, force, moment, MU, 0.9, shares, miss);
    worst = Math.max(worst, miss.force.length() / force.length(), miss.moment.length() / (0.9 * force.length()));
    largestTwist = Math.max(largestTwist, Math.abs(shares[0].moment.y) / force.y);
  }
  assert.ok(worst < 1e-4, `a wrench the corners made was missed by ${worst.toExponential(2)} of it`);
  assert.ok(largestTwist > 0.01, `the corners' wrenches twisted at most ${largestTwist} N m per newton: the case exercised no twist`);
});

test("a twist, a centre of pressure or a pull past the sole is not given, and what is given is inside the limits", () => {
  const sole = { kind: "sole", middle: new Vector3(0, 0, 0), along: new Vector3(0, 0, 1), length: 0.12, width: 0.05 };
  // Straight down 100 N at the middle: the corners' friction twists at most mu (X + Y) f3.
  const most = PYRAMID * (sole.length + sole.width) * 100;
  const cases = [
    ["a twist within reach", new Vector3(0, 100, 0), new Vector3(0, 0.5 * most, 0), true],
    ["a twist past reach", new Vector3(0, 100, 0), new Vector3(0, 1.5 * most, 0), false],
    // A moment about x of 20 N m on 100 N puts the centre of pressure 0.2 m along: past 0.12.
    ["a centre of pressure past the toe", new Vector3(0, 100, 0), new Vector3(-20, 0, 0), false],
    ["a centre of pressure past the side", new Vector3(0, 100, 0), new Vector3(0, 0, 8), false],
    ["a pull", new Vector3(0, -50, 0), new Vector3(0, 0, 0), false],
    ["a level force past friction", new Vector3(60, 100, 0), new Vector3(0, 0, 0), false],
  ];
  for (const [what, force, moment, reachable] of cases) {
    const shares = out(1), miss = missOf();
    shareGroundWrench(WORK, [sole], sole.middle, force, moment, MU, 0.9, shares, miss);
    const missed = miss.force.length() + miss.moment.length() / 0.9, over = outside(sole, shares[0]);
    assert.ok(over < 1e-6 * (1 + force.length()), `${what}: the share is outside the sole's limits by ${over}`);
    if (reachable) assert.ok(missed < 1e-3, `${what}: missed by ${missed}`);
    else assert.ok(missed > 0.5, `${what}: given, missed by only ${missed}`);
  }
});

test("a sole that bears nothing gives nothing, twist included; a recorded share at a light sole's friction limits is finite", () => {
  // Recorded from a Rogue shoved 15 N s at 315 degrees, 0.1 s after (Node stand, Rapier, 120 Hz):
  // more level force than friction gives, the friction limits of a light sole meeting at once.
  const soles = [
    { middle: new Vector3(-0.16885133114635587, -0.006462237483764022, 0.06559793217555063), along: new Vector3(0.0002746066032038252, 0, 0.999999962295606) },
    { middle: new Vector3(0.1700979549712681, -0.0035022077774349678, 0.06669322717143379), along: new Vector3(-0.0199250429646959, 0, 0.9998014766256624) },
  ].map((s) => ({ kind: "sole", ...s, length: 0.12283175088321414, width: 0.06353366424993835 }));
  const centre = new Vector3(-0.0033824566134876615, 0.8845580465087064, 0.05188870879901126);
  const force = new Vector3(176.1958980324399, 521.7417948696399, -191.1676020859362), moment = new Vector3(29.989128553603337, -3.051744522216977, -8.73631347122803);
  const shares = out(2), miss = missOf();
  shareGroundWrench(WORK, soles, centre, force, moment, MU, 0.8895402691393058, shares, miss);
  const values = shares.flatMap((s) => [...s.force.asArray(), ...s.moment.asArray()]);
  assert.ok(values.every(Number.isFinite), `the share came back ${values}`);
  soles.forEach((sole, k) => assert.ok(outside(sole, shares[k]) < 1e-6 * force.length(), `sole ${k} is outside its limits by ${outside(sole, shares[k])}`));
  const light = shares.findIndex((s) => s.force.y < 1e-6 * force.length());
  assert.ok(light >= 0, "neither sole was unloaded: the case does not exercise a sole bearing nothing");
  assert.ok(shares[light].moment.length() < 1e-6 * force.length(), `a sole bearing nothing gave ${shares[light].moment.length()} N m`);
});

test("a share whose last step is rounding comes back finite, as do 20000 two-sole problems shaped like the stance's", () => {
  // Recorded from a Rogue in its routine's fourteenth loop, striking (seed 24, Node stand, Rapier,
  // 120 Hz): the active set's step fell to rounding (6e-9 N) at a degenerate corner, and a limit
  // that is a combination of the working ones seemed to block it.
  const soles = [
    { middle: new Vector3(-0.093511201539401, -0.005475106883502039, 1.9189550655586372), along: new Vector3(-0.01792728309757968, 0, 0.9998392933470555) },
    { middle: new Vector3(0.19453189860768572, -0.005219573794148877, 1.7896073784288162), along: new Vector3(-0.021872588459735602, 0, 0.9997607663206588) },
  ].map((s) => ({ kind: "sole", ...s, length: 0.12283175088321414, width: 0.06353366424993835 }));
  const centre = new Vector3(0.03070985993772695, 0.882219516156343, 1.827376574952522);
  const force = new Vector3(89.19496503463537, 559.2146823551765, -92.52064792619704), moment = new Vector3(-14.566345399287933, -26.90184635293252, 19.225789044201118);
  const shares = out(2), miss = missOf();
  shareGroundWrench(WORK, soles, centre, force, moment, MU, 0.8875668564951684, shares, miss);
  const values = shares.flatMap((s) => [...s.force.asArray(), ...s.moment.asArray()]);
  assert.ok(values.every(Number.isFinite), `the share came back ${values}`);
  soles.forEach((sole, k) => assert.ok(outside(sole, shares[k]) < 1e-6 * force.length(), `sole ${k} is outside its limits by ${outside(sole, shares[k])}`));
  let seed = 11, broken = 0, worst = 0;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 20000; trial++) {
    const pair = [-1, 1].map((side) => {
      const a = 0.6 * (random() - 0.5);
      return { kind: "sole", middle: new Vector3(0.15 * side + 0.1 * (random() - 0.5), -0.005 * random(), 0.4 * (random() - 0.5)), along: new Vector3(Math.sin(a), 0, Math.cos(a)), length: 0.1228, width: 0.0635 };
    });
    const at = new Vector3(0.1 * (random() - 0.5), 0.88, 0.1 * (random() - 0.5));
    const f = new Vector3(300 * (random() - 0.5), 600 * random(), 300 * (random() - 0.5)), m = new Vector3(80 * (random() - 0.5), 60 * (random() - 0.5), 80 * (random() - 0.5));
    const given = out(2);
    shareGroundWrench(WORK, pair, at, f, m, MU, 0.88, given);
    if (!given.flatMap((s) => [...s.force.asArray(), ...s.moment.asArray()]).every(Number.isFinite)) { broken++; continue; }
    pair.forEach((sole, k) => { worst = Math.max(worst, outside(sole, given[k]) / (1 + f.length())); });
  }
  assert.equal(broken, 0, `${broken} of 20000 shares came back not finite`);
  assert.ok(worst < 1e-6, `a share is outside its sole's limits by ${worst} of its force`);
});

test("three points give every wrench whose pressure falls inside them, and no moment each", () => {
  const corners = [new Vector3(-0.3, 0, -0.2), new Vector3(0.35, 0, -0.1), new Vector3(0.05, 0, 0.45)];
  const points = corners.map((at) => ({ kind: "point", at }));
  const centre = new Vector3(0.02, 0.9, 0.04), lever = 0.9, weight = 700;
  /** The wrench about `centre` of the force `f` pressing at `p` of the ground. */
  const pressing = (p, f) => ({ force: f, moment: Vector3.Cross(p.subtract(centre), f) });
  const shared = ({ force, moment }) => {
    const shares = out(3), miss = missOf();
    // A share is written whole: what its moment held before is gone.
    for (const share of shares) share.moment.setAll(7);
    shareGroundWrench(WORK, points, centre, force, moment, MU, lever, shares, miss);
    return { shares, miss, over: Math.max(...shares.map(outsidePoint)) };
  };
  let seed = 5, worst = 0, level = 0, least = Infinity;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 20; trial++) {
    // A place inside the triangle, no nearer an edge than a twentieth of the way in; a force inside the pyramid.
    const w = [random(), random(), random()].map((v) => 0.05 + v), sum = w[0] + w[1] + w[2];
    const p = corners.reduce((at, corner, k) => at.addInPlace(corner.scale(w[k] / sum)), new Vector3());
    const f = new Vector3(0.9 * PYRAMID * weight * (2 * random() - 1), weight, 0.9 * PYRAMID * weight * (2 * random() - 1));
    const { shares, miss, over } = shared(pressing(p, f));
    worst = Math.max(worst, miss.force.length() / weight, miss.moment.length() / (lever * weight));
    level = Math.max(level, Math.hypot(f.x, f.z) / weight);
    least = Math.min(least, ...shares.map((share) => share.force.y / weight));
    for (const share of shares) assert.deepEqual(share.moment.asArray(), [0, 0, 0]);
    assert.ok(over < 1e-6 * weight, `inside, a share is outside its point's limits by ${over}`);
  }
  // The miss is the regularizer's: a few parts in a million.
  assert.ok(worst < 1e-5, `a wrench pressing inside the three points was missed by ${worst.toExponential(2)} of it`);
  assert.ok(level > 0.2 && least > 0.01, `the cases pushed level by at most ${level} of the weight, and a point bore as little as ${least} of it`);

  // Pressing outside the three, the moment is missed; pushed level past friction, the force is.
  const outside = shared(pressing(new Vector3(0.6, 0, 0.5), new Vector3(0, weight, 0)));
  assert.ok(outside.miss.moment.length() > 0.02 * lever * weight, `pressing outside the points, the moment missed is ${outside.miss.moment.length()} N m`);
  assert.ok(outside.over < 1e-6 * weight, `pressing outside, a share is outside its point's limits by ${outside.over}`);
  const pushed = shared(pressing(new Vector3(0.03, 0, 0.05), new Vector3(0.6 * weight, weight, 0)));
  assert.ok(pushed.miss.force.length() > 0.1 * weight, `pushed level past friction, the force missed is ${pushed.miss.force.length()} N`);
  assert.ok(pushed.over < 1e-6 * weight, `pushed past friction, a share is outside its point's limits by ${pushed.over}`);
  const level0 = Math.max(...pushed.shares.map((share) => Math.abs(share.force.x) / share.force.y));
  assert.ok(level0 > 0.99 * PYRAMID, `pushed past friction, no point is at its pyramid: ${level0} against ${PYRAMID}`);

  // A pull is not given at all.
  const pulled = shared(pressing(new Vector3(0.03, 0, 0.05), new Vector3(0, -weight, 0)));
  assert.ok(Math.max(...pulled.shares.map((share) => share.force.length())) < 1e-6 * weight, `a pull was given ${pulled.shares.map((share) => share.force.y)} N`);
  assert.ok(Math.abs(pulled.miss.force.y - weight) < 1e-5 * weight, `a pull of ${weight} N was missed by ${pulled.miss.force.y}`);
});

test("a sole and two points share as their levers do", () => {
  // A point, a sole behind, a point: a weight over the middle of the three is a third on each,
  // which gives it with no moment from the sole, and is the least share that does.
  const sole = { kind: "sole", middle: new Vector3(0, 0, -0.3), along: new Vector3(0, 0, 1), length: 0.12, width: 0.05 };
  const patches = [{ kind: "point", at: new Vector3(-0.2, 0, 0.25) }, sole, { kind: "point", at: new Vector3(0.2, 0, 0.25) }];
  const middle = new Vector3(0, 0, (0.25 - 0.3 + 0.25) / 3), centre = new Vector3(0.01, 0.6, 0.02), weight = 600;
  const force = new Vector3(0, weight, 0), moment = Vector3.Cross(middle.subtract(centre), force);
  const shares = out(3), miss = missOf();
  shareGroundWrench(WORK, patches, centre, force, moment, MU, 0.6, shares, miss);
  assert.ok(miss.force.length() < 1e-5 * weight && miss.moment.length() < 1e-5 * weight, `missed ${miss.force.length()} N, ${miss.moment.length()} N m`);
  shares.forEach((share, k) => assert.ok(Math.abs(share.force.y - weight / 3) < 1e-5 * weight, `patch ${k} bears ${share.force.y} N of ${weight}`));
  assert.ok(Math.abs(shares[0].force.y + shares[1].force.y + shares[2].force.y - weight) < 1e-5 * weight);
  assert.ok(shares[1].moment.length() < 1e-5 * weight, `the sole gave ${shares[1].moment.length()} N m`);
  assert.deepEqual([shares[0].moment.asArray(), shares[2].moment.asArray()], [[0, 0, 0], [0, 0, 0]]);
  assert.ok(outside(sole, shares[1]) < 1e-6 * weight && outsidePoint(shares[0]) < 1e-6 * weight && outsidePoint(shares[2]) < 1e-6 * weight);

  // Behind the sole's middle, 8 cm toward its heel: no point can help, and the sole gives it alone, by its moment.
  const behind = Vector3.Cross(new Vector3(0, 0, -0.38).subtract(centre), force);
  shareGroundWrench(WORK, patches, centre, force, behind, MU, 0.6, shares, miss);
  // The sole's moment is what the regularizer weighs most: the miss is a few parts in a hundred thousand.
  assert.ok(miss.force.length() < 1e-4 * weight && miss.moment.length() < 1e-4 * weight, `behind, missed ${miss.force.length()} N, ${miss.moment.length()} N m`);
  assert.ok(shares[0].force.y + shares[2].force.y < 1e-4 * weight, `behind, the points bear ${shares[0].force.y + shares[2].force.y} N`);
  assert.ok(Math.abs(shares[1].moment.length() - 0.08 * weight) < 1e-3 * weight, `behind, the sole gives ${shares[1].moment.length()} N m of ${0.08 * weight}`);
  assert.ok(outside(sole, shares[1]) < 1e-6 * weight);
});

test("patches given parts bear by them where the wrench leaves the split open, and alike without", () => {
  // Four points at a rectangle's corners: three rows of the wrench (the weight, and its moments
  // about the two level axes) leave one way to shift load between the diagonals. Pressing at the
  // middle of the points weighed by `parts`, bearing by the parts gives the wrench; so does
  // bearing 0.35, 0.35, 0.15 and 0.15, the least forces that do.
  const corners = [[-0.2, -0.4], [0.2, -0.4], [0.2, 0.4], [-0.2, 0.4]].map(([x, z]) => new Vector3(x, 0, z));
  const points = corners.map((at) => ({ kind: "point", at })), parts = [0.4, 0.3, 0.2, 0.1];
  const centre = new Vector3(0.01, 0.35, -0.02), weight = 800, force = new Vector3(0, weight, 0);
  const pressed = corners.reduce((at, corner, k) => at.addInPlace(corner.scale(parts[k])), new Vector3());
  const moment = Vector3.Cross(pressed.subtract(centre), force);
  const borne = (given) => {
    const shares = out(4), miss = missOf();
    shareGroundWrench(WORK, points, centre, force, moment, MU, 0.35, shares, miss, given);
    assert.ok(miss.force.length() < 1e-5 * weight && miss.moment.length() < 1e-5 * weight, `missed ${miss.force.length()} N, ${miss.moment.length()} N m`);
    assert.ok(Math.max(...shares.map(outsidePoint)) < 1e-6 * weight);
    return shares.map((share) => share.force.y / weight);
  };
  const off = (found, want) => Math.max(...found.map((v, k) => Math.abs(v - want[k])));
  const byParts = borne(parts), alike = borne(undefined), even = borne([1, 1, 1, 1]), scaled = borne(parts.map((part) => 5 * part));
  assert.ok(off(byParts, parts) < 1e-4, `by parts ${parts}, the points bear ${byParts} of the weight`);
  assert.ok(off(alike, [0.35, 0.35, 0.15, 0.15]) < 1e-4, `with no parts, the points bear ${alike} of the weight`);
  // Parts that are all one are no parts, to the bit; and only their ratios count.
  assert.deepEqual(even, alike);
  assert.ok(off(scaled, parts) < 1e-4, `by five times the parts, the points bear ${scaled} of the weight`);

  // A sole among points takes its part too: a sole and two points, each a third without parts
  // (the least that gives the wrench with no moment of the sole's); pressing where the parts'
  // middle is, they bear by the parts, the sole still giving no moment.
  const sole = { kind: "sole", middle: new Vector3(0, 0, -0.3), along: new Vector3(0, 0, 1), length: 0.12, width: 0.05 };
  const patches = [{ kind: "point", at: new Vector3(-0.2, 0, 0.25) }, sole, { kind: "point", at: new Vector3(0.2, 0, 0.25) }], thirds = [0.25, 0.5, 0.25];
  const middle = new Vector3(0, 0, 0.25 * 0.25 - 0.5 * 0.3 + 0.25 * 0.25), shares = out(3), miss = missOf();
  shareGroundWrench(WORK, patches, centre, force, Vector3.Cross(middle.subtract(centre), force), MU, 0.35, shares, miss, thirds);
  // The parts weigh the regularizer, and the miss with it: a part in a hundred thousand.
  assert.ok(miss.force.length() < 1e-4 * weight && miss.moment.length() < 1e-4 * weight, `missed ${miss.force.length()} N, ${miss.moment.length()} N m`);
  assert.ok(off(shares.map((share) => share.force.y / weight), thirds) < 1e-4 && shares[1].moment.length() < 1e-4 * weight,
    `by parts ${thirds}, the patches bear ${shares.map((share) => share.force.y / weight)} of the weight, and the sole gives ${shares[1].moment.length()} N m`);

  // A sole's moment is weighed by its part as its force is. A sole and a point 0.55 m ahead of
  // it, pressing 0.1 m ahead of the sole's middle: the point bearing t of the weight, the sole
  // bears the rest and a moment of (0.1 - 0.55 t) m of it, about its middle; the least of
  // (1 - t)^2 / sole's part + t^2 / point's part + moment^2 / (length^2 sole's part) is the t below.
  const pair = [sole, { kind: "point", at: new Vector3(0, 0, 0.25) }], [ofSole, ofPoint] = [0.7, 0.3], length2 = sole.length * sole.length;
  const rule = (1 / ofSole + 0.55 * 0.1 / (length2 * ofSole)) / (1 / ofSole + 1 / ofPoint + 0.55 * 0.55 / (length2 * ofSole));
  const two = out(2), missed = missOf();
  shareGroundWrench(WORK, pair, centre, force, Vector3.Cross(new Vector3(0, 0, -0.2).subtract(centre), force), MU, 0.35, two, missed, [ofSole, ofPoint]);
  assert.ok(missed.force.length() < 1e-4 * weight && missed.moment.length() < 1e-4 * weight);
  assert.ok(Math.abs(two[1].force.y / weight - rule) < 1e-4 && Math.abs(Math.abs(two[0].moment.x) / weight - Math.abs(0.1 - 0.55 * rule)) < 1e-4,
    `the point bears ${two[1].force.y / weight} of the weight, by the rule ${rule}, and the sole gives ${two[0].moment.x / weight} m of it`);
});

test("a_work_used_for_fewer_patches_answers_as_one_made_for_them", () => {
  // The two soles of a Rogue striking, as recorded above, and the first alone.
  const soles = [
    { middle: new Vector3(-0.093511201539401, -0.005475106883502039, 1.9189550655586372), along: new Vector3(-0.01792728309757968, 0, 0.9998392933470555) },
    { middle: new Vector3(0.19453189860768572, -0.005219573794148877, 1.7896073784288162), along: new Vector3(-0.021872588459735602, 0, 0.9997607663206588) },
  ].map((s) => ({ kind: "sole", ...s, length: 0.12283175088321414, width: 0.06353366424993835 }));
  const centre = new Vector3(0.03070985993772695, 0.882219516156343, 1.827376574952522);
  const force = new Vector3(89.19496503463537, 559.2146823551765, -92.52064792619704), moment = new Vector3(-14.566345399287933, -26.90184635293252, 19.225789044201118);
  const answer = (work, patches, parts) => {
    const shares = out(patches.length), miss = missOf();
    shareGroundWrench(work, patches, centre, force, moment, MU, 0.8875668564951684, shares, miss, parts);
    return [...shares.flatMap((s) => [...s.force.asArray(), ...s.moment.asArray()]), ...miss.force.asArray(), ...miss.moment.asArray()];
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const used = groundWrenchWork(2, 2), one = [soles[0]], two = soles;
  const asked = [[one, undefined], [two, [0.6, 0.4]], [one, undefined], [two, undefined], [one, [2]]];
  for (const [patches, parts] of asked) {
    const fresh = answer(groundWrenchWork(patches.length, 0), patches, parts), reused = answer(used, patches, parts);
    assert.ok(same(reused, fresh), `${patches.length} soles, parts ${parts}: ${reused} against ${fresh}`);
  }
  assert.throws(() => answer(groundWrenchWork(1, 0), two), /a share of 2 patches in a work made for 1/);
});

test("a patch's corners are where its centre of pressure may go", () => {
  const at = new Vector3(0.3, 0, -0.2);
  assert.deepEqual(patchCorners({ kind: "point", at }).map((corner) => corner.asArray()), [[0.3, 0, -0.2]]);
  const xz = (corners) => corners.map((corner) => [corner.x, corner.y, corner.z].map((v) => Math.round(v * 1e9) / 1e9));
  // A sole along +z: its length's two ends, and across it (up x along, +x) its width's.
  const sole = { kind: "sole", middle: new Vector3(0.1, 0.02, -0.3), along: new Vector3(0, 0, 1), length: 0.12, width: 0.05 };
  assert.deepEqual(xz(patchCorners(sole)), [[0.15, 0.02, -0.18], [0.05, 0.02, -0.18], [0.05, 0.02, -0.42], [0.15, 0.02, -0.42]]);
  // Along +x, across it is -z.
  assert.deepEqual(xz(patchCorners({ ...sole, along: new Vector3(1, 0, 0) })), [[0.22, 0.02, -0.35], [0.22, 0.02, -0.25], [-0.02, 0.02, -0.25], [-0.02, 0.02, -0.35]]);
  // A sole of no width is a line: its two ends, each twice.
  assert.deepEqual(xz(patchCorners({ ...sole, width: 0 })), [[0.1, 0.02, -0.18], [0.1, 0.02, -0.18], [0.1, 0.02, -0.42], [0.1, 0.02, -0.42]]);
});
