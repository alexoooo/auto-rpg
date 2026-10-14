import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { isOrders } from "../src/core/mind/orders.ts";
import { rayTarget, personOrders } from "../src/arena/orders-input.ts";
import { centreOfToRef } from "../src/core/control/support.ts";

test("pointer attack selects sensed anatomy and an empty ray cannot create a point attack", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter")), hub = createSenses(stand.world);
  const read = hub.add({ id: "actor", side: "actor", built: stand.built, out: () => false, down: () => false });
  try {
    const foe = { ...read(), side: "other", others: [hub.state] };
    const target = { id: "actor", side: "actor", out: false, down: false, spec: stand.built.spec, segments: new Map(), centre: new Vector3() };
    for (const [name, segment] of stand.built.segments) target.segments.set(name, { position: segment.node.position.clone(), rotation: segment.node.rotationQuaternion.clone(), centre: centreOfToRef(segment, new Vector3()), velocity: new Vector3(), spin: new Vector3() });
    foe.others = [target];
    const head = target.segments.get("head").centre;
    const hit = rayTarget(foe, [head.x, head.y, head.z - 3], [0, 0, 1], 6);
    assert.deepEqual(hit, { foe: "actor", region: "head" });
    assert.deepEqual(personOrders(null, [0, 1, 0], hit, { x: 0, z: 0 }), { move: null, face: { x: 0, z: 0 }, ...hit });
    assert.equal(rayTarget(foe, [head.x + 5, head.y, head.z - 3], [0, 0, 1], 6), null);
    assert.deepEqual(personOrders(null, [5, 1, 0], null, { x: 0, z: 0 }), { move: null, face: { x: 5, z: 0 } });
  } finally { hub.dispose(); stand.dispose(); }
});

test("external orders validate identity and reject point attacks and nonfinite distances", () => {
  const order = { move: null, face: null, foe: "foe", region: "head" };
  assert.equal(isOrders(order), true);
  for (const invalid of [{ ...order, attack: [1, 2, 3] }, { ...order, foe: undefined }, { ...order, destination: Infinity }, { ...order, region: "" }]) assert.equal(isOrders(invalid), false);
});
