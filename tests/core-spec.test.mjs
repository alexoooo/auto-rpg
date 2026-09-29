/**
 * The spec's provenance machinery: `Quantity`, the source list, and the rule every spec is held to
 * (`tests/fixtures/spec.mjs`). Each fault the rule names is shown being found here, so a spec test
 * that finds none is known to be looking.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SOURCES } from "../src/core/sources.ts";
import { derive, si, sourced } from "../src/core/spec/quantity.ts";
import { inventory, sourcesOf } from "../src/core/spec/provenance.ts";
import { segmentFrame } from "../src/core/spec/body.ts";
import { convexHull } from "../src/core/spec/hull.ts";
import { claimsIn, specProvenanceFaults } from "./fixtures/spec.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

const thighPercent = () => sourced(14.16, "%", "de-leva-1996", "Table 4, males, thigh, mass");
const bodyMass = () => sourced(79, "kg", "de-leva-1996", "a stand-in leaf for these tests");

function tinySpec() {
  const share = si(thighPercent());
  const body = bodyMass();
  return { family: "test", segments: [{ name: "thigh", mass: derive("kg", "share of body mass", [share, body], (f, m) => f * m) }] };
}

test("a spec whose every number rests on a source keeps the rule", () => {
  assert.deepEqual(specProvenanceFaults(tinySpec()), []);
  const mass = tinySpec().segments[0].mass;
  assert.ok(Math.abs(mass.value - 0.1416 * 79) < 1e-12);
  assert.deepEqual([...sourcesOf(mass)].map((leaf) => leaf.value).sort((a, b) => a - b), [14.16, 79]);
});

test("the rule finds a bare number", () => {
  const spec = { ...tinySpec(), reach: 0.8 };
  assert.deepEqual(specProvenanceFaults(spec), ["reach is a bare number"]);
  assert.deepEqual(inventory({ a: [1, { b: 2 }] }).bare, ["a.0", "a.1.b"]);
});

test("the rule finds a factor written into a rule", () => {
  const body = bodyMass();
  const spec = { neck: derive("kg", "the neck's share", [body], (m) => m * 0.0694 / 7.5) };
  const faults = specProvenanceFaults(spec);
  assert.equal(faults.length, 1);
  assert.match(faults[0], /writes 0\.0694, 7\.5/);
  // A formula's own arithmetic is not a claim.
  assert.deepEqual(claimsIn((r, l) => Math.PI * r ** 2 * (l - 2 * r) + 4 / 3 * Math.PI * r ** 3), []);
  assert.deepEqual(claimsIn((v) => [v[0] * 1e-3, .5 * v[1], v[2]]), ["1e-3", ".5"]);
});

test("the rule finds a derivation whose value is not what its rule gives", () => {
  const good = derive("kg", "double", [bodyMass()], (m) => m * 2);
  const stale = Object.freeze({ ...good, value: 150 });
  assert.deepEqual(specProvenanceFaults({ stale }), [`stale: "double" gives 158, not 150`]);
});

test("the rule finds a source the list does not have, and a leaf that does not say where", () => {
  const unknown = { value: 1, unit: "1", provenance: { kind: "source", source: "hearsay", where: "somewhere" } };
  assert.deepEqual(specProvenanceFaults({ unknown }), [`unknown rests on "hearsay", which SOURCES does not list`]);
  const nowhere = sourced(1, "1", "de-leva-1996", "");
  assert.deepEqual(specProvenanceFaults({ nowhere }), ["nowhere rests on de-leva-1996 without saying where in it"]);
});

test("the rule reads an asset's number back, from a JSON file and from a GLB's JSON chunk", () => {
  const rig = sourced(1.0165272951126099, "m", "workshop-fighter-rig", "/bones/pelvis/head/2");
  const glb = sourced(1.8804991245269775, "m", "workshop-fighter-glb", "/accessors/231/max/1");
  assert.deepEqual(specProvenanceFaults({ rig: derive("m", "the same", [rig, glb], (a) => a) }), []);
  const moved = sourced(1.0166, "m", "workshop-fighter-rig", "/bones/pelvis/head/2");
  assert.deepEqual(specProvenanceFaults({ moved }), ["moved: assets/humanoid/workshop-fighter.json /bones/pelvis/head/2 is 1.0165272951126099, not 1.0166"]);
  const missing = sourced(1, "m", "workshop-fighter-glb", "/accessors/231/max/7");
  assert.deepEqual(specProvenanceFaults({ missing }), ["missing: public/assets/humanoid/workshop-fighter.glb /accessors/231/max/7 is undefined, not 1"]);
});

test("a quantity refuses a number that is not finite, and converts to SI by its unit's definition", () => {
  assert.throws(() => sourced(Number.NaN, "kg", "de-leva-1996", "x"));
  assert.throws(() => derive("kg", "divide", [bodyMass()], (m) => m / 0));
  assert.equal(si(sourced(90, "deg", "de-leva-1996", "x")).value, Math.PI / 2);
  assert.deepEqual(si(sourced([100, 0, -50], "mm", "de-leva-1996", "x")).value, [0.1, 0, -0.05]);
  const kg = bodyMass();
  assert.equal(si(kg), kg, "a quantity already in SI is itself");
  assert.ok(Object.isFrozen(kg) && Object.isFrozen(si(sourced([1, 2, 3], "mm", "de-leva-1996", "x")).value));
});

test("every source is complete, and every file it names exists", () => {
  for (const [key, source] of Object.entries(SOURCES)) {
    switch (source.kind) {
      case "literature": assert.ok(source.cite && /^https?:\/\//.test(source.link), key); break;
      case "decision": assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(source.date) && source.decided && source.record, key); break;
      // An asset's `where` is a JSON pointer, so the rule can read the number back from it.
      case "asset": assert.ok(fs.existsSync(path.join(ROOT, source.file)) && /.(json|glb)$/.test(source.file) && source.what, key); break;
      case "measurement": assert.ok(source.how && source.record, key); break;
      default: assert.fail(`${key} has an unknown kind ${source.kind}`);
    }
  }
});

test("a segment's frame is square, right-handed in its components, and runs from its proximal end", () => {
  const frame = segmentFrame([0.1, 1, 0], [0.15, 0.55, -0.03]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const [a, b] of [["x", "y"], ["y", "z"], ["z", "x"]]) assert.ok(Math.abs(dot(frame[a], frame[b])) < 1e-12);
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(dot(frame[axis], frame[axis]) - 1) < 1e-12);
  assert.ok(frame.y[1] < 0 && frame.x[0] > 0.99, "a thigh's y runs down it and its x stays the body's right");
  assert.deepEqual(segmentFrame([0, 0, 0], [0, 1, 0]), { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  assert.throws(() => segmentFrame([0, 0, 0], [1, 0, 0]), "a segment along the body's right has no frame");
  assert.deepEqual(segmentFrame([0, 0, 0], [0, -1, 0], [0, 0, 1]).x, [0, 0, 1], "a segment that names its right takes it");
});

/**
 * `convexHull` keeps exactly the corners: every point lies inside or on every face's plane, every
 * vertex is a point no face's plane passes beyond, and a point in a face, on an edge or inside is
 * not one, whatever order the points come in. The cube's extra points come first in one order, so
 * they are taken in before the corners around them.
 */
test("a convex hull keeps exactly the corners, whatever order its points come in", () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const outside = (hull, points) => Math.max(...points.map((p) => Math.max(...hull.planes.map(({ normal, offset }) => dot(normal, p) - offset))));
  const corners = [], extra = [];
  for (const x of [-1, 0, 1]) for (const y of [-2, 0.5, 2]) for (const z of [-3, 0.25, 3]) {
    ([x, y, z].every((c, i) => Math.abs(c) === [1, 2, 3][i]) ? corners : extra).push([x, y, z]);
  }
  for (const points of [[...extra, ...corners], [...corners, ...extra], [...extra.slice(9), ...corners, ...extra.slice(0, 9)]]) {
    const hull = convexHull(points);
    assert.deepEqual(new Set(hull.vertices.map((i) => points[i].join())), new Set(corners.map((c) => c.join())));
    assert.equal(hull.faces.length, 12);
    assert.ok(outside(hull, points) < 1e-9);
  }
  // Points on a sphere, one pseudo-random set, with a smaller copy inside: every outer one a corner, and
  // a triangulated convex surface's 2V - 4 faces (Euler).
  let state = 7;
  const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sphere = Array.from({ length: 200 }, () => {
    const z = 2 * uniform() - 1, a = 2 * Math.PI * uniform(), r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  });
  const inner = sphere.map((p) => p.map((c) => c / 2));
  const round = convexHull([...inner, ...sphere]);
  assert.deepEqual(round.vertices, sphere.map((_, i) => inner.length + i));
  assert.equal(round.faces.length, 2 * sphere.length - 4);
  assert.ok(outside(round, [...inner, ...sphere]) < 1e-9);
  assert.throws(() => convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [2, 3, 0]]), /plane/);
});
