/**
 * **Man's contact geometry** (`scripts/core/man-envelope.mjs`, `assets/humanoid/man-contact-geometry.json`):
 * measured again from the GLB and compared; the two sides mirror each other; the palm rests on a
 * face, not a line; the cut foot's pieces meet at the hinge; and the solids' arithmetic is a
 * solid's. Node, no world.
 */
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { hullSolid, MAN_GEOMETRY_FILE, manContactGeometry, PATCH } from "../scripts/core/man-envelope.mjs";
import { convexHull } from "../src/core/spec/hull.ts";
import { cross, dot, length, sub } from "../src/core/spec/vec.ts";

const stored = JSON.parse(readFileSync(MAN_GEOMETRY_FILE, "utf8"));
const SIDES = ["left", "right"];
const mirror = ([x, y, z]) => [-x, y, z];

/** The area of a planar outline, m^2. */
const area = (outline) => {
  let sum = [0, 0, 0];
  for (let i = 1; i + 1 < outline.length; i++) {
    const c = cross(sub(outline[i], outline[0]), sub(outline[i + 1], outline[0]));
    sum = [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]];
  }
  return length(sum) / 2;
};

test("the artifact is what the script measures", async () => {
  assert.deepEqual(stored, JSON.parse(JSON.stringify(await manContactGeometry())));
});

test("left mirrors right", () => {
  const [left, right] = SIDES.map((side) => stored[side]);
  for (const key of ["knuckles", "strike"]) {
    assert.ok(length(sub(mirror(left.fist[key]), right.fist[key])) <= 1e-4, `fist ${key}`);
  }
  assert.ok(length(sub(mirror(left.mtp.centre), right.mtp.centre)) <= 1e-4, "hinge centre");
  assert.ok(Math.abs(area(left.palm.patch.outline) - area(right.palm.patch.outline)) <= 0.01 * area(right.palm.patch.outline), "palm patch area");
  for (const piece of ["foot", "toes"]) {
    const a = left[piece].solid, b = right[piece].solid;
    assert.ok(Math.abs(a.volume - b.volume) <= 0.01 * b.volume, `${piece} volume`);
    assert.ok(length(sub(mirror(a.centre), b.centre)) <= 1e-3, `${piece} centre`);
  }
});

test("the palm rests on a face, not a line", () => {
  for (const side of SIDES) {
    const { hull, patch } = stored[side].palm;
    const normal = patch.normal, far = Math.max(...hull.map((p) => dot(p, normal)));
    // Every outline point lies on the patch's plane, at the hull's surface along its normal.
    for (const p of patch.outline) assert.ok(Math.abs(dot(p, normal) - far) <= 2e-4, `${side} outline on its plane`);
    // A capsule's flat contact is a line; a palm's is a hand's breadth by a hand's length.
    assert.ok(area(patch.outline) >= 0.01, `${side} palm patch ${area(patch.outline)} m2`);
    assert.ok(stored[side].fist.hull.length >= 4 && stored[side].palm.hull.length >= 4, `${side} hulls`);
  }
});

test("each hull is convex: every stored point is a corner of its own hull", () => {
  for (const side of SIDES) {
    for (const hull of [stored[side].palm.hull, stored[side].fist.hull, stored[side].foot.hull, stored[side].toes.hull, stored[side].rigidFoot.hull]) {
      // Rounding to 0.1 mm can leave a near-coplanar corner inside; at most a few percent may drop.
      assert.ok(convexHull(hull).vertices.length >= 0.95 * hull.length, `${side}: ${convexHull(hull).vertices.length} of ${hull.length}`);
    }
  }
});

test("the foot's two pieces meet at the hinge, neither past the cut", () => {
  for (const side of SIDES) {
    const { foot, toes, mtp } = stored[side];
    // The cut plane holds the hinge's axis and the vertical.
    const along = cross(mtp.axis, [0, 1, 0]), at = (p) => dot(sub(p, mtp.centre), along);
    const sign = Math.sign(at(toes.solid.centre));
    assert.ok(sign !== 0 && sign !== Math.sign(at(foot.solid.centre)), `${side}: the pieces lie either side`);
    assert.ok(Math.max(...foot.hull.map((p) => sign * at(p))) <= 1e-3, `${side} foot past the cut`);
    assert.ok(Math.min(...toes.hull.map((p) => sign * at(p))) >= -1e-3, `${side} toes behind the cut`);
    // The sole and the pad are on the ground plane of the bind pose, within the patch tolerance.
    for (const p of [...foot.sole.outline, ...toes.pad.outline]) assert.ok(p[1] <= PATCH, `${side} patch height ${p[1]}`);
    assert.ok(toes.solid.volume > 0.05 * foot.solid.volume && toes.solid.volume < 0.3 * foot.solid.volume, `${side} toe share`);
  }
});

test("a hull's solid is a solid's", () => {
  // A 0.2 x 0.1 x 0.4 m box off the origin: volume, centre, and m (b^2 + c^2) / 12 per unit mass.
  const [a, b, c] = [0.2, 0.1, 0.4], o = [1, -2, 3];
  const corners = [];
  for (const x of [0, a]) for (const y of [0, b]) for (const z of [0, c]) corners.push([o[0] + x, o[1] + y, o[2] + z]);
  const solid = hullSolid(corners);
  const close = (u, v, what) => assert.ok(Math.abs(u - v) <= 1e-12 + 1e-9 * Math.abs(v), `${what}: ${u} against ${v}`);
  close(solid.volume, a * b * c, "volume");
  [o[0] + a / 2, o[1] + b / 2, o[2] + c / 2].forEach((v, k) => close(solid.centre[k], v, `centre ${k}`));
  close(solid.inertia[0][0], (b * b + c * c) / 12, "Ixx");
  close(solid.inertia[1][1], (a * a + c * c) / 12, "Iyy");
  close(solid.inertia[2][2], (a * a + b * b) / 12, "Izz");
  close(solid.inertia[0][1], 0, "Ixy");
});
