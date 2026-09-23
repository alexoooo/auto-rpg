// The bone look: a skeleton's shells, and the proof that a look is cosmetic.
//
// Every module here is built through its own definition from a table with `look` set, on the stand,
// under real Havok, and nothing is stepped. None of these definitions is registered.
import test from "node:test";
import assert from "node:assert/strict";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";

import {
  boneFootShell, bonePelvisShell, ribcageShell, skullShell,
} from "../src/golem/bone-shells.ts";
import {
  CHAIN_REACH, CHAIN_WRIST, HEAD_NECK, HEAD_PLAIN, LOCOMOTION_BIPED, TERMINAL_FIST, TORSO_PLAIN,
  TORSO_WAIST,
} from "../src/golem/config.ts";
import { wristChainFrom } from "../src/golem/effectors/chains/wrist.ts";
import { effectorModule } from "../src/golem/effectors/effector.ts";
import { JOINT_SHELL, LIMB_SHELL } from "../src/golem/effectors/shell.ts";
import { fistDefinition } from "../src/golem/effectors/terminals/fist.ts";
import { headModule } from "../src/golem/head/head.ts";
import { bipedDefinition } from "../src/golem/locomotion/biped.ts";
import { golemMaterials, hasGolemMaterials } from "../src/golem/materials.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { torsoModule } from "../src/golem/torso/torso.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

/** The members of `ShellLook`, which an `.mjs` test cannot read off the type. */
const LOOKS = ["carved", "bone"];

/** One of each builder that reads a look, every table it reads set to `look`. */
const modulesIn = (look) => [
  ["biped", "locomotion", bipedDefinition("locomotion.test", "test", { ...LOCOMOTION_BIPED, look })],
  ["torso", "torso", torsoModule("torso.test", "test", { ...TORSO_PLAIN, look }, { ...TORSO_WAIST, look })],
  ["head", "head", headModule("head.test", "test", { guardPitch: HEAD_PLAIN.guardPitch, ram: null },
    { ...HEAD_NECK, look })],
  ["wrist and fist", "primary", effectorModule(
    wristChainFrom("wrist", "test", { ...CHAIN_REACH, look }, { ...CHAIN_WRIST, look }),
    fistDefinition({ ...TERMINAL_FIST, look }))],
];

/**
 * Build one module in a fresh arena, hand it to `read`, and take everything down again. A fresh
 * arena each time, so the two looks of one module are built into identical worlds.
 */
async function withBuilt(slot, definition, read) {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, {
    side: "left", slot,
    ...(definition.heightRange ? { socketHeight: definition.heightRange.standM } : {}),
  });
  const bodiesBefore = arena.scene.meshes.filter((mesh) => mesh.physicsBody).length;
  const built = definition.build({
    scene: arena.scene, side: "left", name: "look", socket: stand.socket(slot),
    ...(slot === "primary" ? { companion: stand.socket("secondary") } : {}),
    layers: golemLayers("left"), materials: stand.materials,
    ...(slot === "locomotion" ? { world: flatSupportedWorldRegistry() } : {}),
  });
  try {
    const bodies = arena.scene.meshes.filter((mesh) => mesh.physicsBody).length - bodiesBefore;
    return read(built, { scene: arena.scene, materials: stand.materials, bodies });
  } finally {
    built.dispose();
    stand.dispose();
    arena.dispose();
  }
}

const numbers = (vector) => (vector ? [vector.x, vector.y, vector.z, ...(vector.w === undefined ? [] : [vector.w])] : null);

/** Everything physical about a built part, as plain numbers compared exactly. */
function physical(part) {
  const mass = part.part.body.getMassProperties();
  const box = part.part.shape.getBoundingBox();
  return {
    id: part.id,
    mass: mass.mass,
    inertia: numbers(mass.inertia),
    inertiaOrientation: numbers(mass.inertiaOrientation),
    centerOfMass: numbers(mass.centerOfMass),
    position: numbers(part.part.mesh.position),
    rotation: numbers(part.part.mesh.rotationQuaternion),
    shapeType: part.part.shape.type,
    min: numbers(box.minimum),
    max: numbers(box.maximum),
    health: part.health,
    vitalityWeight: part.vitalityWeight,
    fatal: part.fatal,
  };
}

/** A part's drawn meshes, less its own collider when a shell lists the collider as its drawing. */
const drawn = (part) => part.shell.filter((mesh) => mesh !== part.part.mesh);

test("a_look_changes_no_body", async () => {
  const carved = modulesIn("carved");
  const bone = modulesIn("bone");
  for (const [index, [label, slot, definition]] of carved.entries()) {
    const before = await withBuilt(slot, definition, (built, world) =>
      ({ parts: built.parts.map(physical), bodies: world.bodies }));
    const after = await withBuilt(slot, bone[index][2], (built, world) =>
      ({ parts: built.parts.map(physical), bodies: world.bodies }));
    assert.ok(before.parts.length > 0, `${label} built no parts`);
    assert.equal(after.bodies, before.bodies, `${label}: the bone look built a different number of bodies`);
    assert.deepEqual(after.parts, before.parts, `${label}: the bone look moved a body`);
  }
});

test("a_bone_look_hides_its_hosts_and_draws_only_bone_and_rune", async () => {
  for (const [label, slot, definition] of modulesIn("bone")) {
    await withBuilt(slot, definition, (built, { materials }) => {
      const bone = materials.bone;
      for (const part of built.parts) {
        assert.equal(part.part.mesh.isVisible, false, `${label}: ${part.id}'s collider shows`);
        assert.ok(drawn(part).length > 0, `${label}: ${part.id} draws nothing`);
        for (const mesh of drawn(part)) {
          assert.ok(mesh.material === bone || mesh.material === materials.rune,
            `${label}: ${mesh.name} is ${mesh.material?.name}`);
          // `ok` rather than `equal`: a failing `equal` inspects the whole body graph to print it.
          assert.ok(!mesh.physicsBody, `${label}: ${mesh.name} has a body`);
          assert.equal(mesh.isPickable, false, `${label}: ${mesh.name} is pickable`);
          // Parented to the collider, directly or through another shell mesh, so it goes with it.
          let up = mesh.parent;
          while (up && up !== part.part.mesh) up = up.parent;
          assert.equal(up, part.part.mesh, `${label}: ${mesh.name} is not under its collider`);
          // Forge art replaces a 24-vertex box in the rune material with a carved inlay.
          if (mesh.material === materials.rune) {
            assert.notEqual(mesh.getTotalVertices(), 24, `${label}: ${mesh.name} is a rune box`);
          }
        }
      }
    });
  }
});

// Every module above builds its limb and joint colliders hidden already, so a bone builder that
// forgot to hide its host would pass the test above on them. This hands each builder a host that
// is visible, which is the only fixture that can show the defect.
test("every_bone_builder_hides_its_host_and_a_carved_one_does_not", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const materials = golemMaterials(arena.scene, "left");
  const host = (name) => MeshBuilder.CreateBox(name, { size: 0.1 }, arena.scene);
  try {
    const limb = { length: 0.4, radius: 0.03, taper: 0.3, materials };
    const joint = { radius: 0.05, axleLength: 0.08, band: "along", materials };
    const size = { width: 0.4, height: 0.2, depth: 0.3, length: 0.3, materials };
    for (const [name, build, hides] of [
      ["LIMB_SHELL.bone", (h) => LIMB_SHELL.bone(arena.scene, { name: h.name, host: h, ...limb }), true],
      ["JOINT_SHELL.bone", (h) => JOINT_SHELL.bone(arena.scene, { name: h.name, host: h, ...joint }), true],
      ["ribcageShell", (h) => ribcageShell(arena.scene, { name: h.name, host: h, tuning: TORSO_PLAIN, materials }), true],
      ["skullShell", (h) => skullShell(arena.scene, { name: h.name, host: h, table: HEAD_NECK, materials }), true],
      ["bonePelvisShell", (h) => bonePelvisShell(arena.scene, { name: h.name, host: h, ...size }), true],
      ["boneFootShell", (h) => boneFootShell(arena.scene, { name: h.name, host: h, ...size }), true],
      ["LIMB_SHELL.carved", (h) => LIMB_SHELL.carved(arena.scene, { name: h.name, host: h, ...limb }), false],
      ["JOINT_SHELL.carved", (h) => JOINT_SHELL.carved(arena.scene, { name: h.name, host: h, ...joint }), false],
    ]) {
      const h = host(`hide.${name}`);
      assert.equal(h.isVisible, true);
      const made = build(h);
      assert.ok(made.length > 0, `${name} drew nothing`);
      assert.equal(h.isVisible, !hides, `${name} ${hides ? "left its host showing" : "hid its host"}`);
      h.dispose(false, false);
    }
  } finally {
    materials.dispose();
    arena.dispose();
  }
});

test("a_carved_look_is_unchanged", async () => {
  // Pinned from the build this session started on: most carved colliders are already hidden under
  // their shells, and the three that are their own drawing -- the pelvis and the two feet -- show.
  const ownDrawing = new Set(["look.pelvis", "look.footL", "look.footR"]);
  for (const [label, slot, definition] of modulesIn("carved")) {
    await withBuilt(slot, definition, (built, { scene, materials }) => {
      for (const part of built.parts) {
        assert.equal(part.part.mesh.isVisible, ownDrawing.has(part.id), `${label}: ${part.id}`);
      }
      // Asked for after the build, so it exists for the comparison; the build itself never did.
      const bone = materials.bone;
      for (const mesh of scene.meshes) {
        assert.notEqual(mesh.material, bone, `${label}: ${mesh.name} is drawn in bone`);
      }
    });
  }
});

test("the_bone_material_exists_only_once_asked_for_and_dies_with_its_palette", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const scene = arena.scene;
    assert.equal(hasGolemMaterials(scene, "right"), false, "the arena already had a right palette");
    const before = scene.materials.length;
    const palette = golemMaterials(scene, "right");
    assert.equal(scene.materials.length, before + 4, "a palette made other than its four materials");

    const bone = palette.bone;
    assert.equal(scene.materials.length, before + 5);
    assert.equal(palette.bone, bone, "a second read made a second bone");
    assert.equal(scene.materials.length, before + 5);
    assert.equal(bone.metadata.golemSurfaceFamily, "bone");

    // The modelled skeleton's material, on the same terms.
    const boneModel = palette.boneModel;
    assert.notEqual(boneModel, bone);
    assert.equal(palette.boneModel, boneModel, "a second read made a second modelled bone");
    assert.equal(scene.materials.length, before + 6);

    palette.dispose();
    assert.equal(scene.materials.length, before, "disposing the palette left a material behind");
    assert.equal(scene.materials.includes(bone), false);
    assert.equal(scene.materials.includes(boneModel), false);
    assert.throws(() => palette.bone, /disposed/);
    assert.throws(() => palette.boneModel, /disposed/);
  } finally {
    arena.dispose();
  }
});

test("every_look_has_a_builder_at_every_site", () => {
  assert.deepEqual(Object.keys(LIMB_SHELL).sort(), [...LOOKS].sort());
  assert.deepEqual(Object.keys(JOINT_SHELL).sort(), [...LOOKS].sort());
  for (const table of [LIMB_SHELL, JOINT_SHELL]) {
    for (const look of LOOKS) assert.equal(typeof table[look], "function", look);
  }
  // And every table a look is read from ships as `carved`: stone and human did not move.
  for (const [name, table] of Object.entries({
    LOCOMOTION_BIPED, TORSO_WAIST, TORSO_PLAIN, HEAD_NECK, CHAIN_REACH, CHAIN_WRIST, TERMINAL_FIST,
  })) {
    assert.equal(table.look, "carved", name);
  }
});
