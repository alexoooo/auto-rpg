/**
 * The core's own functions of a real number (`src/core/math/real.ts`) and the turns built on them
 * (`src/core/math/turn.ts`). A bout is the same bout in every JavaScript engine only while these
 * return the same doubles in each, so their values are held to a record: a digest of each function
 * over a sweep whose arguments no engine can draw differently (`tests/fixtures/real-sweep.mjs`).
 * The record was taken where every value was also the running engine's own `Math`'s, bit for bit
 * (`docs/reference/real-functions.md`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { acos, asin, atan2, cbrt, cos, cosh, exp, hypot, norm, sin, sinh, square, tan } from "../src/core/math/real.ts";
import { turnAboutToRef, turnBetweenToRef } from "../src/core/math/turn.ts";
import { SWEEP_EACH, sweep, sweepPlan } from "./fixtures/real-sweep.mjs";

/** Each function's digest over the sweep. */
const RECORD = {
  sin: "4ef381875144599e", cos: "4172a72c56641437", tan: "ddce364157c7e9df", asin: "ced4c68b4c3b4d46",
  acos: "1682aba7f549d809", atan2: "432983c6797932a0", exp: "2c0504682e3dbb97", sinh: "9fed25d1fccce4fd",
  cosh: "915e27012a17c2b7", cbrt: "60c43808021c7bfc", "hypot of 2": "7abec255701024b4", "hypot of 3": "67d7c13c60016686",
  "norm of 6": "cb8918bb6f88c8e0",
};

/** The running engine's function for each row of the sweep: right to about a unit in the last place, whichever engine. */
const ENGINE = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan2: Math.atan2, exp: Math.exp,
  sinh: Math.sinh, cosh: Math.cosh, cbrt: Math.cbrt, "hypot of 2": Math.hypot, "hypot of 3": Math.hypot, "norm of 6": Math.hypot,
};

const view = new DataView(new ArrayBuffer(8));
/** A double's place among the doubles, counted from zero; infinity is the place after the largest. */
const place = (x) => { view.setFloat64(0, Math.abs(x)); return x < 0 ? -view.getBigInt64(0) : view.getBigInt64(0); };

test("each function's values over the sweep are the record's, and each is within a unit in the last place of the engine's", () => {
  const far = [];
  let calls = 0;
  const digests = sweep((name, args, value) => {
    calls += 1;
    const theirs = ENGINE[name](...args);
    if (value !== value || theirs !== theirs) { if ((value !== value) !== (theirs !== theirs)) far.push(`${name}(${args}) is ${value}, the engine's ${theirs}`); return; }
    const apart = place(value) - place(theirs);
    if (apart > 1n || apart < -1n) far.push(`${name}(${args}) is ${value}, the engine's ${theirs}`);
  });
  assert.ok(calls > 1e6, "the sweep ran");
  assert.deepEqual(far.slice(0, 5), [], "a value is not the function's");
  assert.deepEqual(digests, RECORD);
});

test("the sweep's digest tells one value a unit in the last place off from none", () => {
  // The control: the same sweep over a sine that is one unit in the last place high at one call of its 100 000.
  let calls = 0;
  const nudged = (x) => {
    const value = sin(x);
    if (++calls !== 31415) return value;
    view.setFloat64(0, value);
    view.setBigUint64(0, view.getBigUint64(0) + 1n);
    return view.getFloat64(0);
  };
  const off = sweep(() => {}, SWEEP_EACH, (d) => sweepPlan(d).map((row) => row.name === "sin" ? { ...row, call: nudged } : row));
  assert.equal(calls, 100000);
  assert.notEqual(off.sin, RECORD.sin, "the digest moved with the one value");
  assert.deepEqual({ ...off, sin: RECORD.sin }, RECORD, "and nothing else did");
});

test("the functions' exact values: zeros, signs, ends of ranges, and what is not a number", () => {
  const exact = [
    [sin(0), 0], [sin(-0), -0], [cos(0), 1], [tan(0), 0], [tan(-0), -0],
    [asin(1), Math.PI / 2], [asin(-1), -Math.PI / 2], [asin(0), 0], [acos(1), 0], [acos(-1), Math.PI], [acos(0), Math.PI / 2],
    [atan2(0, 1), 0], [atan2(-0, 1), -0], [atan2(0, -1), Math.PI], [atan2(-0, -1), -Math.PI], [atan2(1, 0), Math.PI / 2],
    [atan2(-1, 0), -Math.PI / 2], [atan2(1, 1), Math.PI / 4], [atan2(0, 0), 0], [atan2(Infinity, -Infinity), 3 * Math.PI / 4],
    [exp(0), 1], [exp(1), Math.E], [exp(-Infinity), 0], [exp(Infinity), Infinity], [exp(710), Infinity], [exp(-746), 0],
    [sinh(0), 0], [sinh(-0), -0], [cosh(0), 1], [sinh(Infinity), Infinity], [sinh(-Infinity), -Infinity], [cosh(-Infinity), Infinity],
    [cbrt(27), 3], [cbrt(-8), -2], [cbrt(0), 0], [cbrt(-0), -0], [cbrt(Infinity), Infinity], [cbrt(1e-300), 1e-100],
    [hypot(3, 4), 5], [hypot(-3, 4), 5], [hypot(2, 3, 6), 7], [hypot(0, 0), 0], [hypot(1e200, 1e200, 0), 1.414213562373095e200],
    [hypot(Infinity, NaN), Infinity], [hypot(NaN, 1, -Infinity), Infinity], [norm([]), 0], [norm([-5]), 5], [norm([1, 2, 2, 4]), 5],
    [norm([NaN, Infinity, 1, 1]), Infinity], [square(-3), 9],
  ];
  for (const [index, [value, wanted]] of exact.entries()) assert.ok(Object.is(value, wanted), `row ${index}: ${value}, wanted ${wanted}`);
  const unknown = [sin(Infinity), cos(-Infinity), tan(NaN), asin(1.0000001), acos(-2), atan2(NaN, 1), atan2(1, NaN), exp(NaN),
    sinh(NaN), cosh(NaN), cbrt(NaN), hypot(NaN, 1), hypot(1, 2, NaN), norm([1, NaN])];
  for (const [index, value] of unknown.entries()) assert.ok(Number.isNaN(value), `row ${index}: ${value}`);
});

/** `v` turned by the unit quaternion `q`. */
const turned = (q, v) => v.applyRotationQuaternionToRef(q, new Vector3());
const near = (a, b, within = 1e-15) => Math.abs(a - b) <= within;
const sameTurn = (a, b, within = 1e-15) => near(a.x, b.x, within) && near(a.y, b.y, within) && near(a.z, b.z, within) && near(a.w, b.w, within);

test("a turn about an axis is the axis's sine and the angle's cosine, whatever the axis's length", () => {
  const axis = new Vector3(1, -2, 2), angle = 0.7, q = turnAboutToRef(axis, angle, new Quaternion());
  assert.deepEqual([q.x, q.y, q.z, q.w], [sin(angle / 2) / 3, -2 * (sin(angle / 2) / 3), 2 * (sin(angle / 2) / 3), cos(angle / 2)]);
  assert.ok(near(hypot(hypot(q.x, q.y, q.z), q.w), 1), "it is a unit turn");
  assert.ok(sameTurn(turnAboutToRef(axis.scale(7), angle, new Quaternion()), q, 1e-16), "a longer axis is the same turn");
  // A quarter turn about up carries forward onto right, and leaves up where it is.
  const quarter = turnAboutToRef(new Vector3(0, 1, 0), Math.PI / 2, new Quaternion());
  const forward = turned(quarter, new Vector3(0, 0, 1)), up = turned(quarter, new Vector3(0, 1, 0));
  assert.ok(near(forward.x, 1) && near(forward.y, 0) && near(forward.z, 0), `${forward}`);
  assert.ok(near(up.x, 0) && near(up.y, 1) && near(up.z, 0), `${up}`);
});

test("a turn between two is each at its end, the half turn half way, and goes the short way round", () => {
  const up = new Vector3(0, 1, 0), from = turnAboutToRef(up, 0.2, new Quaternion()), to = turnAboutToRef(up, 1.4, new Quaternion());
  const at = (amount, end = to) => turnBetweenToRef(from, end, amount, new Quaternion());
  assert.ok(sameTurn(at(0), from) && sameTurn(at(1), to), "the ends");
  assert.ok(sameTurn(at(0.5), turnAboutToRef(up, 0.8, new Quaternion())), "half way is the turn of the mean angle");
  assert.ok(sameTurn(at(0.25), turnAboutToRef(up, 0.5, new Quaternion())), "a quarter of the way, a quarter of the angle");
  // The same turn written with the other sign is 2 pi less 1.2 rad round the long way: the short way is taken.
  const other = new Quaternion(-to.x, -to.y, -to.z, -to.w), half = at(0.5, other), mean = turnAboutToRef(up, 0.8, new Quaternion());
  assert.ok(sameTurn(half, mean) || sameTurn(half, mean.scale(-1)), `${half}`);
  // Two turns all but the same: the line between them, which is still a unit turn to a part in a million.
  const close = turnAboutToRef(up, 0.2004, new Quaternion()), between = at(0.5, close);
  assert.ok(sameTurn(between, turnAboutToRef(up, 0.2002, new Quaternion()), 1e-8), `${between}`);
  // It writes into the turn it is given, which may be one of its ends.
  const into = from.clone();
  assert.equal(turnBetweenToRef(into, to, 1, into), into);
  assert.ok(sameTurn(into, to));
});
