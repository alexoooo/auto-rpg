/**
 * The ground's wrench shared among bearing soles (`src/core/control/contact-wrench.ts`): every
 * wrench a sole's corners can make, each pushing inside the friction pyramid, is given with no
 * miss; a twist past what the corners' friction can give, a centre of pressure past the sole and a
 * pull are not, and what is given lies inside the limits; a sole that bears nothing gives nothing,
 * twist included; and the share that once came back NaN (a Rogue shoved 15 N s at 315 degrees, two
 * soles, friction limits meeting at a light sole) comes back finite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { shareGroundWrench } from "../src/core/control/contact-wrench.ts";

const MU = 0.5, PYRAMID = MU / Math.SQRT2;
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

test("every wrench a sole's corners can make inside the friction pyramid is given, with no miss", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let worst = 0, largestTwist = 0;
  for (let trial = 0; trial < 200; trial++) {
    const a = random() * 2 * Math.PI, u = new Vector3(Math.sin(a), 0, Math.cos(a)), w = new Vector3(u.z, 0, -u.x);
    const sole = { middle: new Vector3(random() - 0.5, 0, random() - 0.5), along: u, length: 0.12, width: 0.05 };
    const centre = new Vector3(0, 0.9, 0), force = new Vector3(), moment = new Vector3();
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const fz = 100 * random();
      const f = u.scale(PYRAMID * fz * (2 * random() - 1)).addInPlace(w.scale(PYRAMID * fz * (2 * random() - 1))).addInPlaceFromFloats(0, fz, 0);
      const at = sole.middle.add(u.scale(i * sole.length)).addInPlace(w.scale(j * sole.width));
      force.addInPlace(f);
      moment.addInPlace(Vector3.Cross(at.subtract(centre), f));
    }
    const shares = out(1), miss = missOf();
    shareGroundWrench([sole], centre, force, moment, MU, 0.9, shares, miss);
    worst = Math.max(worst, miss.force.length() / force.length(), miss.moment.length() / (0.9 * force.length()));
    largestTwist = Math.max(largestTwist, Math.abs(shares[0].moment.y) / force.y);
  }
  console.log(`MUT contact wrench corners: worst relative miss ${worst.toExponential(2)}, largest twist per newton ${largestTwist.toFixed(4)} m`);
  assert.ok(worst < 1e-4, `a wrench the corners made was missed by ${worst.toExponential(2)} of it`);
  assert.ok(largestTwist > 0.01, `the corners' wrenches twisted at most ${largestTwist} N m per newton: the case exercised no twist`);
});

test("a twist, a centre of pressure or a pull past the sole is not given, and what is given is inside the limits", () => {
  const sole = { middle: new Vector3(0, 0, 0), along: new Vector3(0, 0, 1), length: 0.12, width: 0.05 };
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
    shareGroundWrench([sole], sole.middle, force, moment, MU, 0.9, shares, miss);
    const missed = miss.force.length() + miss.moment.length() / 0.9, over = outside(sole, shares[0]);
    console.log(`MUT contact wrench ${what}: missed ${missed.toFixed(3)}, outside the limits by ${over.toExponential(1)}`);
    assert.ok(over < 1e-6 * (1 + force.length()), `${what}: the share is outside the sole's limits by ${over}`);
    if (reachable) assert.ok(missed < 1e-3, `${what}: missed by ${missed}`);
    else assert.ok(missed > 0.5, `${what}: given, missed by only ${missed}`);
  }
});

test("a sole that bears nothing gives nothing, twist included; the share that came back NaN is finite", () => {
  // Recorded from a Rogue shoved 15 N s at 315 degrees, 0.1 s after (Node stand, Rapier, 120 Hz):
  // more level force than friction gives, the friction limits of a light sole meeting at once.
  const soles = [
    { middle: new Vector3(-0.16885133114635587, -0.006462237483764022, 0.06559793217555063), along: new Vector3(0.0002746066032038252, 0, 0.999999962295606) },
    { middle: new Vector3(0.1700979549712681, -0.0035022077774349678, 0.06669322717143379), along: new Vector3(-0.0199250429646959, 0, 0.9998014766256624) },
  ].map((s) => ({ ...s, length: 0.12283175088321414, width: 0.06353366424993835 }));
  const centre = new Vector3(-0.0033824566134876615, 0.8845580465087064, 0.05188870879901126);
  const force = new Vector3(176.1958980324399, 521.7417948696399, -191.1676020859362), moment = new Vector3(29.989128553603337, -3.051744522216977, -8.73631347122803);
  const shares = out(2), miss = missOf();
  shareGroundWrench(soles, centre, force, moment, MU, 0.8895402691393058, shares, miss);
  const values = shares.flatMap((s) => [...s.force.asArray(), ...s.moment.asArray()]);
  console.log(`MUT contact wrench recorded: ${shares.map((s) => `${s.force.y.toFixed(1)} N, twist ${s.moment.y.toFixed(3)}`).join("; ")}; missed ${miss.force.length().toFixed(1)} N`);
  assert.ok(values.every(Number.isFinite), `the share came back ${values}`);
  soles.forEach((sole, k) => assert.ok(outside(sole, shares[k]) < 1e-6 * force.length(), `sole ${k} is outside its limits by ${outside(sole, shares[k])}`));
  const light = shares.findIndex((s) => s.force.y < 1e-6 * force.length());
  assert.ok(light >= 0, "neither sole was unloaded: the case does not exercise a sole bearing nothing");
  assert.ok(shares[light].moment.length() < 1e-6 * force.length(), `a sole bearing nothing gave ${shares[light].moment.length()} N m`);
});
