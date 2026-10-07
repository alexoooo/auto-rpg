import test from "node:test";
import assert from "node:assert/strict";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { equipHands } from "../src/core/human/equipment.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { drawBody, drawEquipment } from "../src/render/body-shapes.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("one item view follows the released physical item and owns only its visual resources", async () => {
  const s = await coreStand(modelSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk" });
  const item = equipHands(s.world, s.built, { id: "visible-club", item: woodenClub(), primary: "right",
    grips: [{ side: "right", at: [0, 0, 0] }], capture: { distance: 0.002, rotationError: 0.00001 }, ccd: true });
  let view, bodyView;
  try {
    const before = s.world.physics.save();
    bodyView = drawBody(s.built, s.scene, new Color3(0.4, 0.6, 0.7));
    view = drawEquipment(item, s.scene);
    assert.deepEqual(s.world.physics.save(), before, "drawing adds no physical authority");
    assert.equal(view.meshes.length, item.spec.shapes.length);
    assert.ok(view.meshes.every((m) => m.parent === item.node));
    const material = view.meshes[0].material, otherMaterial = bodyView.meshes[0].material;
    assert.notEqual(material, otherMaterial);
    const at = item.node.position.clone();
    item.release("right"); item.body.applyImpulse(new Vector3(0.4, 0, 0), item.node.position); s.step(20);
    assert.ok(Vector3.Distance(item.node.position, at) > 0.01);
    assert.ok(view.meshes.every((m) => m.parent === item.node));
    assert.equal(item.observe().grips[0].attached, false);
    const released = s.world.physics.save();
    view.dispose();
    assert.deepEqual(s.world.physics.save(), released, "visual disposal leaves item physics intact");
    assert.ok(!s.scene.materials.includes(material));
    assert.ok(s.scene.materials.includes(otherMaterial));
    assert.equal(item.node.isDisposed(), false);
  } finally { bodyView?.dispose(); item.dispose(); s.dispose(); }
});
