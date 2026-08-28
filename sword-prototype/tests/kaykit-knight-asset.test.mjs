import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";

import { deriveKayKit, parseGlb, sha256, verifyDerivative }
  from "../scripts/derive-kaykit-knight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ASSET_ROOT = resolve(ROOT, "asset-src/armour/kaykit-adventurers-1.0");
const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, "manifest.json"), "utf8"));
const source = await readFile(resolve(ASSET_ROOT, manifest.source.file));
const license = await readFile(resolve(ASSET_ROOT, manifest.license.file));
const runtime = await readFile(resolve(ROOT, manifest.derivative.glb));
const profile = await readFile(resolve(ROOT, manifest.derivative.profile));
const sourceProfile = await readFile(resolve(ROOT, manifest.derivative.sourceProfile));

test("the_KayKit_Knight_source_commit_archive_member_and_CC0_license_are_pinned", () => {
  assert.equal(manifest.source.commit, "672074b73ba276876a19e8816ecdc5241817ab47");
  assert.equal(manifest.source.archiveRetrievedAtCommit, manifest.source.commit);
  assert.match(manifest.source.archiveUrl, /archive\/refs\/heads\/main\.zip$/);
  assert.equal(manifest.source.member,
    "addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb");
  assert.equal(manifest.source.archiveSha256,
    "e19176d799036452bc783c00dd1036e158c66c5a43b7285ccbfea3466d6f57bf");
  assert.equal(source.length, 3659532);
  assert.equal(sha256(source), "60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168");
  assert.equal(manifest.license.spdx, "CC0-1.0");
  assert.equal(sha256(license), "ae322141814056dda0deea7540d74c41d87aee1da319977cd1bd84ee5a923629");
  assert.match(license.toString("utf8"), /free to use in personal, educational and commercial projects/);
});

test("the_runtime_Knight_is_the_reproducible_mechanical_derivative", () => {
  const result = verifyDerivative(source, license, runtime, profile, manifest);
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.report.sourceTriangleCount, 4148);
  assert.equal(result.report.derivedTriangleCount, 4148);
  assert.ok(result.report.positiveWeightJoints.length > 0);
  assert.ok(result.report.unweightedJoints.includes("root"),
    "source root is an unweighted hierarchy joint, not a deformation joint");
  assert.deepEqual(result.report.regions, {
    torso: 934, head: 956, pelvis: 118,
    swordUpperArm: 234, swordForearm: 210, swordHand: 150,
    offUpperArm: 234, offForearm: 210, offHand: 150,
    thighLeft: 171, shinLeft: 305, thighRight: 171, shinRight: 305,
  });
  assert.deepEqual(sourceProfile, profile,
    "the durable source profile and runtime-served profile are one artifact");
});

test("the_derivative_exposes_only_selected_art_and_the_frozen_combat_clips", () => {
  const { json } = parseGlb(runtime);
  const names = new Set(json.nodes.map((node) => node.name));
  assert.deepEqual(json.animations.map((animation) => animation.name), manifest.selection.animations);
  for (const name of manifest.selection.rigidNodes) assert.ok(names.has(name), name);
  for (const name of [...manifest.selection.removedAccessoryNodes,
    ...manifest.selection.skinnedBodyNodes]) assert.ok(!names.has(name), name);
  for (const region of manifest.regionInfluenceRule.regionOrder) {
    const name = `Knight__region_${region}`;
    const node = json.nodes.find((candidate) => candidate.name === name);
    assert.ok(node, name);
    assert.equal(node.skin, 0);
    assert.equal(json.meshes[node.mesh].extras.autoRpgRegion, region);
    assert.ok(json.meshes[node.mesh].primitives.every((primitive) =>
      primitive.extras.autoRpgRegion === region));
  }
  assert.equal(json.materials.length, 1);
  assert.equal(json.materials[0].name, "knight_texture");
});

test("the_generated_profile_is_an_exact_native_proportion_and_mount_seam", () => {
  const parsed = JSON.parse(profile);
  assert.deepEqual(parsed.coordinateSystem,
    { handedness: "right", up: "+Y", forward: "+Z", unit: "metre" });
  assert.equal(parsed.bounds, undefined,
    "an ambiguous selected-art/global bound must not masquerade as body height");
  assert.equal(parsed.bodyOnlyBounds.heightM, parsed.bodyOnlyBounds.sizeM[1]);
  assert.equal(parsed.regions.length, 13);
  assert.deepEqual(parsed.regions.map(({ region }) => region),
    manifest.regionInfluenceRule.regionOrder);
  assert.ok(Object.values(parsed.lengthsM).every((length) =>
    Number.isFinite(length) && length > 0));
  assert.deepEqual(Object.keys(parsed.weaponMounts), ["primary", "secondary"]);
  assert.deepEqual(Object.keys(parsed.physics.regionBounds),
    manifest.regionInfluenceRule.regionOrder);
  for (const bounds of Object.values(parsed.physics.regionBounds)) {
    assert.ok(bounds.sizeM.every((length) => Number.isFinite(length) && length > 0));
    assert.ok(bounds.centreM.every((value, axis) =>
      Math.abs(value - (bounds.minM[axis] + bounds.maxM[axis]) / 2) <= 1e-9));
  }
  for (const mount of Object.values(parsed.weaponMounts)) {
    assert.equal(mount.handFromSlotMatrix.length, 16);
    assert.equal(mount.slotFromVisualMatrix.length, 16);
    assert.equal(mount.handFromVisualMatrix.length, 16);
    assert.deepEqual(mount.handFromSlotMatrix, mount.handToSlotMatrix);
    assert.deepEqual(mount.slotFromVisualMatrix, mount.slotToVisualMatrix);
    assert.deepEqual(mount.handFromVisualMatrix, mount.handToVisualMatrix);
    assert.equal(mount.handToSlotMatrix.length, 16);
    assert.equal(mount.slotToVisualMatrix.length, 16);
    assert.equal(mount.handToVisualMatrix.length, 16);
    assert.ok([...mount.handToSlotMatrix, ...mount.slotToVisualMatrix,
      ...mount.handToVisualMatrix].every(Number.isFinite));
  }
});

test("weapon_collider_facts_are_exact_creator_geometry_in_each_hand_slot_frame", () => {
  const parsed = JSON.parse(profile);
  const expected = {
    primary: {
      visual: "1H_Sword", frame: "handslot.r", vertices: 359, triangles: 300,
      components: [229, 73, 57], sizeM: [0.503444434, 1.775261521, 0.130633472],
    },
    secondary: {
      visual: "Round_Shield", frame: "handslot.l", vertices: 322, triangles: 284,
      components: [266, 56], sizeM: [0.882606864, 0.882607132, 0.331945562],
    },
  };
  const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const [side, pinned] of Object.entries(expected)) {
    const mount = parsed.weaponMounts[side];
    const geometry = mount.geometryInSlotFrame;
    assert.equal(mount.visualNode, pinned.visual);
    assert.equal(geometry.frame, pinned.frame);
    assert.equal(geometry.vertexCount, pinned.vertices);
    assert.equal(geometry.triangleCount, pinned.triangles);
    assert.deepEqual(geometry.aabb.sizeM, pinned.sizeM);
    assert.deepEqual(geometry.connectedComponents.components.map(({ vertexCount }) => vertexCount),
      pinned.components);
    assert.equal(geometry.connectedComponents.components.reduce((sum, component) =>
      sum + component.vertexCount, 0), geometry.vertexCount);
    assert.equal(geometry.connectedComponents.components.reduce((sum, component) =>
      sum + component.triangleCount, 0), geometry.triangleCount);
    const axes = geometry.principalAxes.map(({ directionUnit }) => directionUnit);
    axes.forEach((axis) => assert.ok(Math.abs(dot(axis, axis) - 1) < 2e-9));
    assert.ok(Math.abs(dot(axes[0], axes[1])) < 2e-9);
    assert.ok(Math.abs(dot(axes[0], axes[2])) < 2e-9);
    assert.ok(Math.abs(dot(axes[1], axes[2])) < 2e-9);
    assert.ok(dot(cross(axes[0], axes[1]), axes[2]) > 0.999999998,
      "principal axes must form a deterministic right-handed collider frame");
  }
});

test("Babylon_9_loads_the_exact_runtime_Knight_skin_texture_regions_and_actions", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const container = await LoadAssetContainerAsync(new Uint8Array(runtime), scene,
      { pluginExtension: ".glb" });
    assert.equal(container.skeletons.length, 1);
    assert.equal(container.skeletons[0].name, "Rig");
    assert.equal(container.skeletons[0].bones.length, 41);
    assert.deepEqual(container.animationGroups.map((group) => group.name),
      manifest.selection.animations);
    assert.equal(container.animationGroups.find((group) => group.isStarted)?.name,
      manifest.selection.animationRuntime.loaderStartsFirstClip,
      "Babylon's measured auto-start makes an explicit adapter stop mandatory");
    assert.ok(scene.animatables.length > 0);
    container.animationGroups.forEach((group) => group.stop());
    assert.ok(container.animationGroups.every((group) => !group.isStarted));
    assert.equal(scene.animatables.length, 0,
      "the required explicit stop must clear every native animatable before publication");
    assert.ok(container.materials.some((material) => material.name === "knight_texture"));
    const meshNames = container.meshes.map((mesh) => mesh.name);
    for (const region of manifest.regionInfluenceRule.regionOrder) {
      assert.ok(meshNames.some((name) => name.startsWith(`Knight__region_${region}`)), region);
    }
    const second = container.instantiateModelsToScene((name) => `copy:${name}`, true);
    assert.equal(second.skeletons.length, 1);
    assert.notEqual(second.skeletons[0], container.skeletons[0]);
    second.animationGroups.forEach((group) => group.stop());
    second.rootNodes.forEach((node) => node.dispose());
    second.skeletons.forEach((skeleton) => skeleton.dispose());
    container.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("source_output_and_region_rule_mutations_are_detected_instead_of_reblessed", () => {
  const movedSource = Buffer.from(source);
  movedSource[movedSource.length - 1] ^= 1;
  assert.throws(() => deriveKayKit(movedSource, manifest), /source Knight\.glb hash/);

  const movedOutput = Buffer.from(runtime);
  movedOutput[movedOutput.length - 1] ^= 1;
  const result = verifyDerivative(source, license, movedOutput, profile, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes("deterministic derivative")));

  const movedRule = structuredClone(manifest);
  movedRule.regionInfluenceRule.sourceBoneToRegion.head = "torso";
  assert.throws(() => deriveKayKit(source, movedRule), /no geometry for head/,
    "changing the frozen influence rule must be refused before it can be reblessed");

  const movedGeometryContract = structuredClone(manifest);
  movedGeometryContract.weaponMounts.primary.geometryContract.aabbSizeM[1] += 0.001;
  assert.throws(() => deriveKayKit(source, movedGeometryContract), /slot-frame AABB contract moved/);

  const movedProfile = JSON.parse(profile);
  movedProfile.weaponMounts.secondary.geometryInSlotFrame.aabb.maxM[0] += 0.001;
  const movedProfileBytes = Buffer.from(`${JSON.stringify(movedProfile, null, 2)}\n`);
  const profileResult = verifyDerivative(source, license, runtime, movedProfileBytes, manifest);
  assert.equal(profileResult.ok, false);
  assert.ok(profileResult.failures.some((failure) => failure.includes("runtime profile")));
});
