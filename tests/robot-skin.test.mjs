import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { dressRobot } from "../src/render/robot-skin.ts";
import { APPEARANCES, appearanceFor, appearancesFor, wearsClothing } from "../src/render/appearance.ts";
import { dresserFor } from "../src/render/dress.ts";
import { modelSpec } from "../src/core/models.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createWorld } from "../src/core/world.ts";
import { Duel } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const clothing = { boots: true, armour: true };
const robots = APPEARANCES.filter(row => row.id !== "default");

test("Industrial retains its recorded geometry, attachment and material finishes", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  try {
    const skin = dressRobot(stand.built, stand.scene, "industrial", { clothing });
    const record = skin.meshes.map(m => ({
      part: m.name.split(".").slice(3).join("."), parent: [...stand.built.segments].find(([, s]) => s.node === m.parent)[0],
      positions: Array.from(m.getVerticesData("position")), normals: Array.from(m.getVerticesData("normal")), indices: Array.from(m.getIndices()),
      at: m.position.asArray(), turn: m.rotationQuaternion?.asArray() ?? null,
      material: { colour: m.material.albedoColor.asArray(), metallic: m.material.metallic, roughness: m.material.roughness,
        emission: m.material.emissiveColor.asArray(), unlit: m.material.unlit },
    }));
    const fingerprint = () => createHash("sha256").update(JSON.stringify(record)).digest("hex");
    const reference = "7bfa15f857583a9542f68b1bfff3fe844069e3a7c578846c0f89b34336e4086b";
    assert.equal(fingerprint(), reference);
    record[0].positions[0] += .01;
    assert.notEqual(fingerprint(), reference);
    skin.dispose();
  } finally { stand.dispose(); }
});

test("robot designs use distinct geometry for each major body region", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  try {
    const skins = robots.map(row => dressRobot(stand.built, stand.scene, row.id, { clothing }));
    for (const name of ["head", "upperTrunk", "middleTrunk", "lowerTrunk", "upperArm.right", "forearm.right", "thigh.right", "shank.right", "foot.right"]) {
      const segment = stand.built.segments.get(name);
      assert.ok(segment, name);
      const geometry = skins.map(skin => skin.meshes.filter(m => m.parent === segment.node)
        .flatMap(m => Array.from(m.getVerticesData("position"))));
      for (const positions of geometry) assert.ok(positions.length > 0 && positions.every(Number.isFinite));
      assert.equal(new Set(geometry.map(p => createHash("sha256").update(JSON.stringify(p)).digest("hex"))).size, 3, name);
    }
    for (const skin of skins) skin.dispose();
  } finally { stand.dispose(); }
});

test("appearance compatibility and clothing support belong to the catalog", () => {
  assert.deepEqual(appearancesFor("workshop-fighter").map(row => row.id), ["default", "industrial", "relic", "duelist"]);
  for (const model of ["workshop-rogue", "crypt-skeleton"]) {
    assert.deepEqual(appearancesFor(model).map(row => row.id), ["default"]);
    for (const row of robots) assert.equal(appearanceFor(model, row.id), "default");
  }
  for (const value of [null, undefined, "", "Industrial", "unknown"]) assert.equal(appearanceFor("workshop-fighter", value), "default");
  assert.equal(wearsClothing("workshop-fighter", "default"), true);
  assert.equal(wearsClothing("crypt-skeleton", "default"), false);
  for (const row of robots) assert.equal(wearsClothing("workshop-fighter", row.id), false);
});

for (const { id } of robots) test(`${id}: every segment is dressed, follows independently and owns no physics`, async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  try {
    const before = stand.world.physics.save(), baseline = stand.scene.meshes.length;
    const dress = await dresserFor("workshop-fighter", stand.scene, { appearance: id });
    const skin = dress(stand.built, { clothing });
    assert.deepEqual(stand.world.physics.save(), before);
    assert.ok(skin.meshes.every(mesh => !mesh.isPickable && mesh.receiveShadows));
    assert.deepEqual(new Set(skin.meshes.map(mesh => mesh.parent)), new Set([...stand.built.segments.values()].map(s => s.node)));
    const attached = () => assert.ok(skin.meshes.every(mesh => [...stand.built.segments.values()].some(s => s.node === mesh.parent)));
    const probe = skin.meshes[0], parent = probe.parent;
    probe.parent = null;
    assert.throws(attached);
    probe.parent = parent;
    for (const side of ["left", "right"]) {
      const segment = stand.built.segments.get(`forearm.${side}`);
      const mesh = skin.meshes.find(m => m.parent === segment.node);
      const local = mesh.position.clone();
      segment.node.position.addInPlace(new Vector3(side === "left" ? -.3 : .2, .1, .2));
      segment.node.rotationQuaternion.copyFrom(Quaternion.RotationAxis(Vector3.Up(), side === "left" ? -.7 : .3));
      segment.node.computeWorldMatrix(true); mesh.computeWorldMatrix(true);
      const expected = local.applyRotationQuaternion(segment.node.rotationQuaternion).add(segment.node.position);
      assert.ok(Vector3.Distance(mesh.getAbsolutePosition(), expected) < 1e-6);
    }
    skin.setEnabled(false); skin.wear({ boots: false, armour: false });
    assert.ok(skin.meshes.every(m => !m.isEnabled()));
    skin.setEnabled(true);
    assert.ok(skin.meshes.every(m => m.isEnabled()));
    skin.dispose();
    assert.equal(stand.scene.meshes.length, baseline);
    assert.ok([...stand.built.segments.values()].every(s => !s.node.isDisposed()));
  } finally { stand.dispose(); }
});

test("robot hands follow closure independently and wrap the actual held grip", async () => {
  const stand = await coreStand(armed(modelSpec("workshop-fighter"), "right", woodenClub()));
  const closure = { left: 0, right: 0 };
  try {
    const a = dressRobot(stand.built, stand.scene, "industrial", { clothing, closure: hand => closure[hand] });
    const b = dressRobot(stand.built, stand.scene, "duelist", { clothing });
    const finger = (skin, side) => skin.meshes.find(m => m.name.endsWith(`hand.${side}.finger.1.2`));
    const right = finger(a, "right").position.clone(), left = finger(a, "left").position.clone();
    closure.left = 1;
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    assert.ok(Vector3.Distance(finger(a, "left").position, left) > .02);
    assert.deepEqual(finger(a, "right").position.asArray(), right.asArray());
    assert.deepEqual(finger(b, "left").position.asArray(), left.asArray());
    const rightHand = stand.built.segments.get("hand.right"), held = stand.built.spec.held[0];
    const delta = Vector3.FromArray(held.origin.value).subtract(Vector3.FromArray(rightHand.frame.origin));
    const gripY = Vector3.Dot(delta, Vector3.FromArray(rightHand.frame.y));
    const gripZ = Vector3.Dot(delta, Vector3.FromArray(rightHand.frame.z));
    const fingerEnd = finger(a, "right"), tip = new Vector3(0, (held.item.grip.value + rightHand.spec.shape.radius.value * .25) / 2, 0)
      .applyRotationQuaternion(fingerEnd.rotationQuaternion).add(fingerEnd.position);
    assert.ok(Math.abs(tip.y - gripY) < 1e-8);
    assert.ok(tip.z < gripZ - held.item.grip.value);
    a.dispose();
    assert.ok(b.meshes.every(m => !m.isDisposed() && stand.scene.materials.includes(m.material)));
    b.dispose();
  } finally { stand.dispose(); }
});

test("an ordered bout has the same complete snapshot through dressing and shell replacement", async () => {
  const run = async (dressed) => {
    const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
    addArenaSolids(world.physics);
    const bout = new Duel(world, { left: "workshop-fighter", right: "workshop-fighter" });
    let skins = [];
    try {
      bout.order("left", { move: { x: 1, z: 0 }, face: null, attack: null });
      bout.order("right", { move: null, face: null, attack: null });
      for (let phase = 0; phase < 3; phase++) {
        if (dressed) {
          for (const skin of skins) skin.dispose();
          skins = ["left", "right"].map((side, index) => dressRobot(bout.duelists[side].built, scene,
            robots[(phase + index) % robots.length].id, { clothing }));
        }
        for (let step = 0; step < 40; step++) { world.step(); scene.onBeforeRenderObservable.notifyObservers(scene); }
      }
      return bout.save();
    } finally {
      for (const skin of skins) skin.dispose();
      bout.dispose(); world.dispose(); scene.dispose(); engine.dispose();
    }
  };
  assert.deepEqual(await run(true), await run(false));
});
