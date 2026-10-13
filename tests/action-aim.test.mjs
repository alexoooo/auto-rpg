import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { actionAim, regionSegments, sensedActionTarget } from "../src/core/mind/action-aim.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { createBody } from "../src/core/body.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { buildBody } from "../src/core/build/build-body.ts";
import { guardPosture } from "../src/core/skills/guard.ts";

const spec = humanSpec("workshop-fighter");

test("regions preserve anatomical order and absence never becomes any", () => {
  assert.deepEqual(regionSegments(spec, { kind: "mark", mark: "middle" }), spec.segments.filter(s => spec.marks.middle.includes(s.name)).map(s => s.name));
  assert.deepEqual(regionSegments(spec, { kind: "segment", segment: "missing" }), []);
  assert.deepEqual(regionSegments({ ...spec, marks: { ...spec.marks, legs: [] } }, { kind: "mark", mark: "legs" }), []);
  assert.deepEqual(regionSegments(spec, { kind: "mark", mark: "any" }), spec.segments.map(s => s.name));
});

test("centre aims preserve identity, predict only the declared region, and pass point requests exactly", () => {
  const foe = { id: "far", out: false, spec, time: 0, segments: new Map([["head", { centre: new Vector3(0, 1, 2), velocity: new Vector3(1, 0, 0) }]]) };
  const view = { time: 0.1, stance: { centre: new Vector3() }, senses: { others: [{ ...foe, id: "near" }, foe] } };
  const target = { kind: "body", body: "far", region: { kind: "mark", mark: "high" } };
  const aim = actionAim(spec, { kind: "centre", lead: 0.2 });
  assert.equal(sensedActionTarget(view, target), foe);
  assert.deepEqual(aim(view, target, "hand.right"), { at: [0.30000000000000004, 1, 2] });
  assert.equal(aim(view, { ...target, region: { kind: "segment", segment: "missing" } }, "hand.right"), null);
  foe.out = true;
  assert.equal(aim(view, target, "hand.right"), null);
  const point = { kind: "point", at: [1, 2, 3], body: "far", direction: [0, -1, 0] };
  assert.deepEqual(aim(view, point, "hand.right"), { at: point.at, direction: point.direction });
});

test("surface actions score the requested family on only their target region", async () => {
  const stand = await coreStand(spec, { posture: guardPosture(spec) }), hub = createSenses(stand.world);
  const foe = buildBody(spec, stand.world, { position: [0, 0, 0.8] });
  const sense = hub.add({ id: "actor", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "foe", side: "two", built: foe, out: () => false });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, senses: sense });
  try {
    const aim = actionAim(spec, { kind: "surface", tuning: {} }, "cross");
    const target = { kind: "body", body: "foe", region: { kind: "segment", segment: "head" } };
    const result = aim(body.view, target, "hand.right");
    assert.ok(result);
    assert.equal(result.estimate.unit, "opening");
    assert.ok(Number.isFinite(result.estimate.value));
    assert.ok(result.at[1] > sense().others[0].segments.get("upperTrunk").centre.y);
    assert.equal(aim(body.view, { ...target, region: { kind: "segment", segment: "missing" } }, "hand.right"), null);
  } finally { body.dispose(); hub.dispose(); foe.dispose(); stand.dispose(); }
});
