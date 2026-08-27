import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkWarrior,
  checkWarriorBuilder,
  checkWarriorDocument,
  SKIN_BONE_PARENT,
} from "../scripts/check-warrior.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const warrior = await readFile(process.env.SWORD_WARRIOR_UNDER_TEST ?? resolve(ROOT, "public/assets/warrior.glb"));
const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
const provenance = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));
const REJECTED = "c08f09fa564b6b84b24a2b25442f3c51fd167d20f0c8d4f777e5bd25943c1afd";
const BONE_NAMES = Object.keys(SKIN_BONE_PARENT);

test("the_asset_checker_uses_the_runtime_BoneName_hierarchy_verbatim", async () => {
  const source = await readFile(resolve(ROOT, "src/figure.ts"), "utf8");
  const block = source.match(/export const SKIN_BONE_PARENT[^=]*= Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(block, "src/figure.ts exposes a readable SKIN_BONE_PARENT table");
  const runtime = Object.fromEntries([...block[1].matchAll(/^\s*(\w+):\s*(null|"\w+"),/gm)]
    .map(([, name, parent]) => [name, parent === "null" ? null : parent.slice(1, -1)]));
  assert.deepEqual(runtime, SKIN_BONE_PARENT);
});

test("every_selected_character_source_has_a_pinned_cc0_license_record", async () => {
  assert.ok(Array.isArray(provenance.selected) && provenance.selected.length >= 1);
  for (const id of provenance.selected) {
    const selected = provenance.sources.find((source) => source.id === id);
    assert.ok(selected, `selected character source ${id} has a row`);
    assert.equal(selected.license, "CC0-1.0");
    assert.match(selected.licenseUrl, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
    assert.match(selected.archiveSha256, /^[0-9a-f]{64}$/);
    assert.ok(Object.keys(selected.extracts ?? {}).length >= 1);
    for (const [filename, expected] of Object.entries(selected.extracts)) {
      const bytes = await readFile(resolve(ROOT, selected.extractRoot, filename));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expected,
        `${filename} matches its selected-extract pin`);
    }
  }
});

test("the_shipping_warrior_is_one_coherent_skinned_person", () => {
  const result = checkWarrior(warrior, dimensions);
  assert.equal(result.ok, true, result.failures.join("\n"));
});

test("the_disconnected_rigid_warrior_digest_can_never_be_accepted_again", () => {
  const fixture = coherentFixture();
  const result = checkWarriorDocument(fixture.json, fixture.bin, dimensions, REJECTED);
  assert.ok(result.failures.some((failure) => failure.includes("explicitly rejected disconnected rigid Warrior")));
});

test("the_mutation_fixture_satisfies_the_complete_skin_contract_before_it_is_broken", () => {
  const checked = result(coherentFixture());
  assert.equal(checked.ok, true, checked.failures.join("\n"));
});

test("the_shipping_builder_authors_the_exact_skinned_rig_from_pinned_sources", async () => {
  const source = await readFile(resolve(ROOT, "asset-src/build_warrior.py"), "utf8");
  assert.deepEqual(checkWarriorBuilder(source, provenance), []);

  const withoutRig = source.replaceAll("WarriorRig", "LooseParts");
  assert.ok(checkWarriorBuilder(withoutRig, provenance).some((failure) => failure.includes("one armature")));
  const primitive = `${source}\nbpy.ops.mesh.primitive_cube_add()`;
  assert.ok(checkWarriorBuilder(primitive, provenance).some((failure) => failure.includes("primitive constructor")));
});

test("missing_skin_is_refused_by_the_contract_it_removes", () => {
  const fixture = coherentFixture();
  delete fixture.json.skins;
  assertFailure(fixture, /exactly one skin; found 0/);
});

test("a_wrong_bone_parent_is_refused_by_name", () => {
  const fixture = coherentFixture();
  const head = fixture.json.nodes.findIndex((node) => node.name === "head");
  const torso = fixture.json.nodes.find((node) => node.name === "torso");
  torso.children = torso.children.filter((index) => index !== head);
  fixture.json.nodes.find((node) => node.name === "pelvis").children.push(head);
  assertFailure(fixture, /bone "head" must be a direct child of "torso"/);
});

test("a_bone_authored_at_its_joint_instead_of_its_physics_centre_is_refused", () => {
  const fixture = coherentFixture();
  fixture.json.nodes.find((node) => node.name === "swordForearm").translation[1] += 0.05;
  assertFailure(fixture, /bone "swordForearm" bind origin .* 50\.0 mm from its physics centre/);
});

test("non_normalized_and_non_finite_weights_are_refused_at_the_vertex", () => {
  const low = coherentFixture();
  low.bin.writeFloatLE(0.6, low.weightOffsets[0]);
  assertFailure(low, /unnormalized weights/);

  const nan = coherentFixture();
  nan.bin.writeFloatLE(Number.NaN, nan.weightOffsets[0]);
  assertFailure(nan, /non-finite, negative, or unnormalized weights/);
});

test("more_than_four_influences_and_an_unskinned_mesh_are_refused", () => {
  const fixture = coherentFixture();
  const node = fixture.json.nodes.find((candidate) => candidate.mesh !== undefined);
  delete node.skin;
  const primitive = fixture.json.meshes[node.mesh].primitives[0];
  primitive.attributes.JOINTS_1 = primitive.attributes.JOINTS_0;
  primitive.attributes.WEIGHTS_1 = primitive.attributes.WEIGHTS_0;
  const failures = result(fixture).failures;
  assert.ok(failures.some((failure) => failure.includes("not attached to the one Warrior skin")), failures.join("\n"));
  assert.ok(failures.some((failure) => failure.includes("four-influence")), failures.join("\n"));
});

test("trousers_hood_and_the_closed_helmet_are_each_required", () => {
  for (const [pattern, expected] of [
    [/trouser/i, /missing trousers geometry/],
    [/hood/i, /missing hood geometry/],
    [/helmet3/i, /missing closed Helmet3 geometry/],
  ]) {
    const fixture = coherentFixture();
    fixture.json.nodes.find((node) => pattern.test(node.name ?? "")).name = "anonymous_garment";
    assertFailure(fixture, expected);
  }
});

test("both_boots_are_required", () => {
  const fixture = coherentFixture();
  const boots = fixture.json.nodes.filter((node) => /boot/i.test(node.name ?? ""));
  boots[1].name = "anonymous_lower_leg";
  assertFailure(fixture, /does not contain both boots/);
});

test("adult_sized_hands_must_reach_the_two_weapon_roots", () => {
  const small = coherentFixture();
  for (const offset of small.handPositionOffsets.swordHand) {
    small.bin.writeFloatLE(0.21, offset);
    small.bin.writeFloatLE(0.73, offset + 4);
    small.bin.writeFloatLE(0.005, offset + 8);
  }
  assertFailure(small, /swordHand" is only .* adult hand must be at least 75 mm/);

  const disconnected = coherentFixture();
  const grip = disconnected.json.nodes.find((node) => node.name === "grip.secondary");
  grip.translation[1] -= 0.08;
  assertFailure(disconnected, /offHand" geometry stops .* disconnected from its weapon/);
});

test("a_missing_explicit_grip_marker_is_not_repaired_by_guessing", () => {
  const fixture = coherentFixture();
  fixture.json.nodes.find((node) => node.name === "grip.primary").name = "lost.primary";
  assertFailure(fixture, /missing explicit weapon root "grip.primary"/);
});

test("a_grip_marker_at_the_palm_centre_does_not_redefine_the_weapon_root", () => {
  const fixture = coherentFixture();
  const grip = fixture.json.nodes.find((node) => node.name === "grip.primary");
  grip.translation[1] += dimensions.arm.handLength / 2;
  assertFailure(fixture, /grip\.primary" is not at the physical bind weapon root/);
});

test("dead_mesh_and_accessor_payload_remain_refused", () => {
  const fixture = coherentFixture();
  fixture.json.meshes.push(structuredClone(fixture.json.meshes[0]));
  fixture.json.accessors.push(structuredClone(fixture.json.accessors[0]));
  const failures = result(fixture).failures;
  assert.ok(failures.some((failure) => /mesh .* dead payload/.test(failure)), failures.join("\n"));
  assert.ok(failures.some((failure) => /accessor .* dead payload/.test(failure)), failures.join("\n"));
});

test("textured_geometry_keeps_uvs_and_normal_mapped_geometry_keeps_tangents", () => {
  const fixture = coherentFixture();
  const node = fixture.json.nodes.find((candidate) => candidate.mesh !== undefined);
  const primitive = fixture.json.meshes[node.mesh].primitives[0];
  fixture.json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } }];
  primitive.material = 0;
  const failures = result(fixture).failures;
  assert.ok(failures.some((failure) => failure.includes("textured material without TEXCOORD_0")), failures.join("\n"));
  assert.ok(failures.some((failure) => failure.includes("normal map without TANGENT")), failures.join("\n"));
});

function result(fixture) {
  fixture.json.buffers[0].byteLength = fixture.bin.length;
  return checkWarriorDocument(fixture.json, fixture.bin, dimensions);
}

function assertFailure(fixture, pattern) {
  const failures = result(fixture).failures;
  assert.ok(failures.some((failure) => pattern.test(failure)), failures.join("\n"));
}

/**
 * A deliberately plain but structurally valid glTF document. It is not an art
 * substitute and never ships; it makes every guard independently mutable, so a
 * green mutation test cannot be an accidental property of the current asset.
 */
function coherentFixture() {
  const json = {
    asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0,
    nodes: [], meshes: [], skins: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
  };
  const chunks = [];
  let byteLength = 0;
  const weightOffsets = [];
  const handPositionOffsets = { swordHand: [], offHand: [] };
  const addAccessor = (buffer, componentType, type, count, extra = {}) => {
    const padding = (4 - byteLength % 4) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length });
    const accessor = json.accessors.length;
    json.accessors.push({ bufferView: view, componentType, count, type, ...extra });
    chunks.push(buffer);
    const offset = byteLength;
    byteLength += buffer.length;
    return { accessor, offset };
  };

  const boneIndex = new Map();
  for (const name of BONE_NAMES) {
    boneIndex.set(name, json.nodes.length);
    json.nodes.push({ name, children: [] });
  }
  for (const [name, parent] of Object.entries(SKIN_BONE_PARENT)) {
    if (parent) json.nodes[boneIndex.get(parent)].children.push(boneIndex.get(name));
  }
  const gltfCentre = (name) => {
    const centre = dimensions.bones[name].centre;
    return [-centre[0], centre[1], centre[2]];
  };
  for (const [name, parent] of Object.entries(SKIN_BONE_PARENT)) {
    const origin = gltfCentre(name);
    const parentOrigin = parent ? gltfCentre(parent) : [0, 0, 0];
    json.nodes[boneIndex.get(name)].translation = origin.map((value, axis) => value - parentOrigin[axis]);
  }
  json.scenes[0].nodes.push(boneIndex.get("torso"));

  const meshNames = new Map([
    ["torso", "Male_Ranger_Chest__region_torso"],
    ["head", "Male_Ranger_Hood__region_head"],
    ["pelvis", "Male_Ranger_Trousers__region_pelvis"],
    ["swordUpperArm", "Male_Ranger_Sleeve__region_swordUpperArm"],
    ["swordForearm", "Male_Ranger_Bracer__region_swordForearm"],
    ["swordHand", "Male_Ranger_Arms__region_swordHand"],
    ["offUpperArm", "Male_Ranger_Sleeve__region_offUpperArm"],
    ["offForearm", "Male_Ranger_Bracer__region_offForearm"],
    ["offHand", "Male_Ranger_Arms__region_offHand"],
    ["thighLeft", "Male_Ranger_Legs__region_thighLeft"],
    ["shinLeft", "Male_Ranger_Boot_L__region_shinLeft"],
    ["thighRight", "Male_Ranger_Legs__region_thighRight"],
    ["shinRight", "Male_Ranger_Boot_R__region_shinRight"],
  ]);

  const centreFor = (bone) => gltfCentre(bone);
  const pointsFor = (bone) => {
    const [x, y, z] = centreFor(bone);
    if (bone === "swordHand" || bone === "offHand") {
      const gripY = y - dimensions.arm.handLength / 2;
      return [[x - 0.04, gripY, z - 0.02], [x + 0.04, gripY, z - 0.02],
        [x - 0.04, gripY + 0.10, z + 0.02], [x - 0.04, gripY + 0.10, z + 0.02],
        [x + 0.04, gripY, z - 0.02], [x + 0.04, gripY + 0.10, z + 0.02]];
    }
    return [[x - 0.02, y - 0.02, z], [x + 0.02, y - 0.02, z], [x, y + 0.02, z + 0.02]];
  };

  const addMesh = (name, bone) => {
    const slot = BONE_NAMES.indexOf(bone);
    const points = pointsFor(bone);
    const positionBuffer = Buffer.alloc(points.length * 12);
    points.forEach((point, vertex) => point.forEach((value, axis) => positionBuffer.writeFloatLE(value, vertex * 12 + axis * 4)));
    const position = addAccessor(positionBuffer, 5126, "VEC3", points.length,
      { min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))) });
    if (bone in handPositionOffsets) {
      for (let vertex = 0; vertex < points.length; vertex += 1) handPositionOffsets[bone].push(position.offset + vertex * 12);
    }
    const jointsBuffer = Buffer.alloc(points.length * 4);
    for (let vertex = 0; vertex < points.length; vertex += 1) jointsBuffer.writeUInt8(slot, vertex * 4);
    const joints = addAccessor(jointsBuffer, 5121, "VEC4", points.length);
    const weightsBuffer = Buffer.alloc(points.length * 16);
    for (let vertex = 0; vertex < points.length; vertex += 1) weightsBuffer.writeFloatLE(1, vertex * 16);
    const weights = addAccessor(weightsBuffer, 5126, "VEC4", points.length);
    for (let vertex = 0; vertex < points.length; vertex += 1) weightOffsets.push(weights.offset + vertex * 16);
    const mesh = json.meshes.length;
    json.meshes.push({ name, primitives: [{ attributes: {
      POSITION: position.accessor, JOINTS_0: joints.accessor, WEIGHTS_0: weights.accessor,
    } }] });
    const node = json.nodes.length;
    json.nodes.push({ name, mesh, skin: 0 });
    json.scenes[0].nodes.push(node);
  };

  for (const bone of BONE_NAMES) addMesh(meshNames.get(bone), bone);
  addMesh("Helmet3__region_head", "head");
  for (const [bone, name] of [["swordHand", "grip.primary"], ["offHand", "grip.secondary"]]) {
    const marker = json.nodes.length;
    json.nodes.push({ name, translation: [0, -dimensions.arm.handLength / 2, 0] });
    json.nodes[boneIndex.get(bone)].children.push(marker);
  }
  const matrices = Buffer.alloc(BONE_NAMES.length * 16 * 4);
  for (let matrix = 0; matrix < BONE_NAMES.length; matrix += 1) {
    for (let diagonal = 0; diagonal < 4; diagonal += 1) matrices.writeFloatLE(1, (matrix * 16 + diagonal * 5) * 4);
  }
  const inverse = addAccessor(matrices, 5126, "MAT4", BONE_NAMES.length);
  json.skins.push({ name: "WarriorRig", joints: BONE_NAMES.map((name) => boneIndex.get(name)),
    skeleton: boneIndex.get("torso"), inverseBindMatrices: inverse.accessor });
  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  return { json, bin, weightOffsets, handPositionOffsets };
}
