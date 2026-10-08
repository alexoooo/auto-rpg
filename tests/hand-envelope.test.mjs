/**
 * **The workshop humans' hands** (`scripts/core/hand-envelope.mjs`, `assets/humanoid/<model>-hands.json`):
 * measured again from each GLB and compared; the two sides mirror each other; each hull is
 * convex; the strike lies on the fist's surface and the knuckle inside it; the palm's centre lies
 * on its patch; and the knuckle is the one the figure's hand carries. Node, no world.
 */
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { handGeometry, handsFile, HAND_MODELS } from "../scripts/core/hand-envelope.mjs";
import { FIT_SCALE } from "../src/core/human/model.ts";
import { modelSpec } from "../src/core/models.ts";
import { convexHull } from "../src/core/spec/hull.ts";
import { cross, dot, length, scale, sub } from "../src/core/spec/vec.ts";

const SIDES = ["left", "right"];
const stored = Object.fromEntries(HAND_MODELS.map((model) => [model, JSON.parse(readFileSync(handsFile(model), "utf8"))]));
const mirror = ([x, y, z]) => [-x, y, z];
/** How far a point stands outside a hull, m: its largest signed distance past a face's plane. */
const outside = (hull, point) => Math.max(...convexHull(hull).planes.map(({ normal, offset }) => dot(normal, point) - offset));

test("each artifact is what the script measures", async () => {
  assert.deepEqual(HAND_MODELS, ["workshop-fighter", "workshop-rogue"]);
  for (const model of HAND_MODELS) assert.deepEqual(stored[model], JSON.parse(JSON.stringify(await handGeometry(model))), model);
});

test("left mirrors right", () => {
  for (const model of HAND_MODELS) {
    const [left, right] = SIDES.map((side) => stored[model][side]);
    for (const key of ["knuckles", "strike"]) {
      assert.ok(length(sub(mirror(left.fist[key]), right.fist[key])) <= 1e-4, `${model} fist ${key}`);
    }
    assert.ok(length(sub(mirror(left.palm.patch.centre), right.palm.patch.centre)) <= 1e-3, `${model} palm centre`);
    assert.equal(left.fist.hull.length, right.fist.hull.length, `${model} fist corners`);
  }
});

test("each hull is convex: every stored point is a corner of its own hull", () => {
  for (const model of HAND_MODELS) for (const side of SIDES) for (const piece of ["palm", "fist"]) {
    const { hull } = stored[model][side][piece];
    // Rounding to 0.1 mm can leave a near-coplanar corner inside; at most a few percent may drop.
    assert.ok(hull.length >= 4 && convexHull(hull).vertices.length >= 0.95 * hull.length,
      `${model} ${side} ${piece}: ${convexHull(hull).vertices.length} of ${hull.length}`);
  }
});

test("the strike is on the fist's surface ahead of the knuckle, which the fist holds", () => {
  for (const model of HAND_MODELS) for (const side of SIDES) {
    const { hull, knuckles, strike } = stored[model][side].fist;
    assert.ok(Math.abs(outside(hull, strike)) <= 1e-4, `${model} ${side} strike ${outside(hull, strike)} m from the surface`);
    assert.ok(outside(hull, knuckles) < -1e-3, `${model} ${side} knuckle inside the fist`);
    assert.ok(length(sub(strike, knuckles)) > 1e-3, `${model} ${side} strike ahead of the knuckle`);
  }
});

test("the palm's centre lies on its patch's face, inside its outline", () => {
  for (const model of HAND_MODELS) for (const side of SIDES) {
    const { hull, patch: { normal, outline, centre } } = stored[model][side].palm;
    const far = Math.max(...hull.map((p) => dot(p, normal)));
    assert.ok(Math.abs(dot(centre, normal) - far) <= 2e-4, `${model} ${side} centre on the patch's plane`);
    // Inside the outline: on the inner side of every edge, seen from the normal.
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length];
      assert.ok(dot(cross(sub(b, a), sub(centre, a)), normal) > 0, `${model} ${side} centre inside edge ${i}`);
    });
  }
});

test("each model's knuckle at the fit scale is its figure's", () => {
  for (const model of HAND_MODELS) {
    const spec = modelSpec(model);
    for (const side of SIDES) {
      const segment = spec.segments.find((s) => s.name === `hand.${side}`);
      const at = scale(stored[model][side].fist.knuckles, FIT_SCALE.value);
      assert.ok(length(sub(at, segment.points.knuckles.value)) <= 1e-4, `${model} ${side}: ${at} against ${segment.points.knuckles.value}`);
    }
  }
});
