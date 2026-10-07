import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { lyingAxis, nearestFoe } from "../src/core/mind/targets.ts";

test("every body's marks name its own segments", () => {
  for (const model of BODY_MODELS) {
    const spec = modelSpec(model), names = new Set(spec.segments.map((s) => s.name)), { high, middle, base, legs } = spec.marks;
    for (const name of [high, ...middle, base, ...legs]) assert.ok(names.has(name), `${model}: ${name}`);
    assert.ok(middle.length > 0, model);
  }
});

/** A body of `side` at `x` along the ground, in the fight or out. */
const other = (id, side, x, out = false) => ({ id, side, out, centre: new Vector3(x, 1, 0) });

test("the nearest foe is of another side, the first of equals, and an out one only where the rule allows", () => {
  const senses = (...others) => ({ side: "left", others });
  const from = { x: 0, z: 0 };
  const near = (rule, ...others) => nearestFoe(senses(...others), from, rule)?.id ?? null;
  for (const rule of ["standing", "standing-first"]) {
    assert.equal(near(rule, other("friend", "left", 0.5), other("far", "right", 3), other("near", "right", -2)), "near", rule);
    assert.equal(near(rule, other("first", "right", 2), other("second", "right", -2)), "first", rule);
    assert.equal(near(rule), null, rule);
  }
  assert.equal(near("standing", other("down", "right", 1, true), other("up", "right", 4)), "up");
  assert.equal(near("standing-first", other("down", "right", 1, true), other("up", "right", 4)), "up");
  assert.equal(near("standing", other("down", "right", 1, true)), null);
  assert.equal(near("standing-first", other("far", "right", 4, true), other("down", "right", 1, true)), "down");
});

test("a foe lies along the way from its base to its high mark", () => {
  const spec = modelSpec("workshop-fighter");
  const lying = (head, base) => ({ spec, centre: new Vector3(0, 0, 0),
    segments: new Map([[spec.marks.high, { centre: new Vector3(...head) }], [spec.marks.base, { centre: new Vector3(...base) }]]) });
  assert.equal(lyingAxis(lying([0, 0.2, 1], [0, 0.2, 0])), 0);
  assert.ok(Math.abs(lyingAxis(lying([0, 0.2, 0], [1, 0.2, 0])) + Math.PI / 2) < 1e-12);
});
