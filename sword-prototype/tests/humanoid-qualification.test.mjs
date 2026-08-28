import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LANDMARK_LIMIT_MM, attributeDigests, qualifyHumanoidDocument,
  qualifySelectedHumanoid, structureDigests } from "../scripts/qualify-humanoid.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

test("the_untouched_universal_ranger_is_rejected_instead_of_stretched_onto_the_physics_rig", async () => {
  const report = await qualifySelectedHumanoid(ROOT);
  const recorded = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-ranger/qualification.json"), "utf8"));
  assert.equal(report.status, "rejected");
  assert.equal(report.integrity.ok, true, report.integrity.failures.join("\n"));
  assert.equal(report.landmarkLimitMm, 25);
  assert.equal(report.uniformScale, 0.963078);
  const primary = report.limbs.find((limb) => limb.name === "primary arm");
  const secondary = report.limbs.find((limb) => limb.name === "secondary arm");
  assert.ok(primary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(primary));
  assert.ok(secondary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(secondary));
  assert.ok(report.failures.some((failure) => failure.includes("primary arm misses")));
  assert.ok(report.failures.some((failure) => failure.includes("no creator-authored sword grip")));
  assert.deepEqual(recorded, report, "the durable rejection report is the executable result, not a parallel summary");
});

test("the_source_attribute_digest_changes_when_even_one_weight_byte_moves", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const before = attributeDigests(gltf, binary);
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.WEIGHTS_0];
  const view = gltf.bufferViews[accessor.bufferView];
  const mutated = Buffer.from(binary);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  mutated[offset] ^= 1;
  const after = attributeDigests(gltf, mutated);
  assert.notEqual(after.WEIGHTS_0.sha256, before.WEIGHTS_0.sha256);
  assert.equal(after.POSITION.sha256, before.POSITION.sha256,
    "the mutation proves the protected stream rather than perturbing unrelated geometry");

  const indexAccessor = gltf.accessors[gltf.meshes[0].primitives[0].indices];
  const indexView = gltf.bufferViews[indexAccessor.bufferView];
  const changedIndex = Buffer.from(binary);
  changedIndex[(indexView.byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0)] ^= 1;
  const afterIndex = attributeDigests(gltf, changedIndex);
  assert.notEqual(afterIndex.INDICES.sha256, before.INDICES.sha256);
  assert.equal(afterIndex.WEIGHTS_0.sha256, before.WEIGHTS_0.sha256);
});

test("a_named_decoy_bone_outside_the_character_skin_is_refused", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const head = gltf.nodes.findIndex((node) => node.name === "Head");
  const before = structureDigests(gltf);
  gltf.skins[0].joints = gltf.skins[0].joints.filter((joint) => joint !== head);
  const report = qualifyHumanoidDocument(gltf, binary, dimensions);
  assert.ok(report.failures.includes("creator bone Head is not a joint in the character skin"));
  assert.notEqual(report.structureDigests.SKELETON, before.SKELETON);
});

test("a_named_mesh_that_is_not_instantiated_on_the_character_skin_is_refused", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  delete gltf.nodes.find((node) => node.name === "Male_Ranger_Body").skin;
  const report = qualifyHumanoidDocument(gltf, binary, dimensions);
  assert.ok(report.failures.includes("creator mesh Male_Ranger_Body is not attached to the character skin"));

  const unreachable = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const body = unreachable.nodes.findIndex((node) => node.name === "Male_Ranger_Body");
  for (const node of unreachable.nodes) if (node.children) node.children = node.children.filter((child) => child !== body);
  const unreachableReport = qualifyHumanoidDocument(unreachable, binary, dimensions);
  assert.ok(unreachableReport.failures.includes("creator mesh Male_Ranger_Body is unreachable from the active scene"));

  const invalid = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  invalid.nodes.find((node) => node.name === "Male_Ranger_Body").mesh = 999_999;
  const invalidReport = qualifyHumanoidDocument(invalid, binary, dimensions);
  assert.ok(invalidReport.failures.includes("creator mesh Male_Ranger_Body has no valid mesh record"));

  const invisible = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const bodyMesh = invisible.meshes[invisible.nodes.find((node) => node.name === "Male_Ranger_Body").mesh];
  for (const primitive of bodyMesh.primitives) delete primitive.attributes.POSITION;
  const invisibleReport = qualifyHumanoidDocument(invisible, binary, dimensions);
  assert.ok(invisibleReport.failures.includes(
    "creator mesh Male_Ranger_Body has a non-renderable primitive: missing or invalid POSITION"));
});

test("skeleton_and_material_structure_are_protected_separately_from_vertex_bytes", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const before = structureDigests(gltf);
  const materialChanged = structuredClone(gltf);
  materialChanged.materials[0].doubleSided = false;
  assert.notEqual(structureDigests(materialChanged).MATERIALS, before.MATERIALS);
  assert.equal(structureDigests(materialChanged).SKELETON, before.SKELETON);

  const skeletonChanged = structuredClone(gltf);
  skeletonChanged.nodes.find((node) => node.name === "Head").translation[1] += 0.001;
  assert.notEqual(structureDigests(skeletonChanged).SKELETON, before.SKELETON);
  assert.equal(structureDigests(skeletonChanged).MATERIALS, before.MATERIALS);
});

test("a_failed_source_pin_is_an_admission_failure_instead_of_a_warning", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const report = qualifyHumanoidDocument(gltf, binary, dimensions,
    { ok: false, failures: ["source digest moved"] });
  assert.ok(report.failures.includes("source digest moved"));
  assert.equal(report.status, "rejected");
});

test("moving_a_whole_arm_cannot_preserve_a_false_pass_by_preserving_its_segment_lengths", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const shoulder = gltf.nodes.find((node) => node.name === "upperarm_l");
  shoulder.translation[0] += 10;
  const report = qualifyHumanoidDocument(gltf, binary, dimensions);
  const landmark = report.landmarks.find((row) => row.name === "primary shoulder");
  assert.ok(landmark.errorMm > 9_000, JSON.stringify(landmark));
  assert.ok(report.failures.some((failure) => failure.includes("primary shoulder misses")));
});

test("an_unrelated_animation_cannot_pretend_to_be_an_authored_weapon_grip", async () => {
  const gltf = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT, "asset-src/armour/quaternius-ranger/ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  gltf.animations = [{ name: "Blink", samplers: [], channels: [] }];
  const report = qualifyHumanoidDocument(gltf, binary, dimensions);
  assert.deepEqual(report.poses.map(({ label, qualified }) => ({ label, qualified })), [
    { label: "sword grip", qualified: false },
    { label: "shield grip", qualified: false },
  ]);

  gltf.animations = [
    { name: "Sword Weapon Idle", samplers: [], channels: [0, 1, 2].map((at) =>
      ({ sampler: at, target: { node: gltf.nodes.findIndex((node) => node.name === ["index_01_l", "middle_01_l", "thumb_01_l"][at]) } })) },
    { name: "Shield Guard", samplers: [], channels: [0, 1, 2].map((at) =>
      ({ sampler: at, target: { node: gltf.nodes.findIndex((node) => node.name === ["index_01_r", "middle_01_r", "thumb_01_r"][at]) } })) },
  ];
  const malformed = qualifyHumanoidDocument(gltf, binary, dimensions);
  assert.equal(malformed.poses.every((pose) => !pose.qualified), true,
    "names and target nodes are not poses without rotation paths and sampled motion");

  const position = gltf.meshes[0].primitives[0].attributes.POSITION;
  const fakeTime = gltf.accessors.push({ ...gltf.accessors[position], type: "SCALAR", count: 1 }) - 1;
  const fakeRotation = gltf.accessors.push({ ...gltf.accessors[position], type: "VEC4", count: 1 }) - 1;
  const fake = (name, side) => ({ name, samplers: [{ input: fakeTime, output: fakeRotation }],
    channels: ["index", "middle", "ring", "pinky", "thumb"].map((digit) => ({ sampler: 0,
      target: { path: "rotation", node: gltf.nodes.findIndex((node) => node.name === `${digit}_01_${side}`) } })) });
  gltf.animations = [fake("Sword Weapon Idle", "l"), fake("Shield Guard", "r")];
  const relabelledGeometry = qualifyHumanoidDocument(gltf, binary, dimensions);
  assert.equal(relabelledGeometry.poses.every((pose) => !pose.qualified), true,
    "ordinary vertex bytes are not normalized authored quaternion samples");
});
