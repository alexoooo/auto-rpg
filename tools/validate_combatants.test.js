"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { canonicalBytes, parseGlb } = require("./validate_assets.js");
const {
  parseCombatantSidecar, validateCombatantAsset, validateCombatantPresentation,
  validateManifest, validateSemanticClosure,
} = require("./validate_combatants.js");

const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "web", "assets3d", "combatants.glb");
const SIDECAR = path.join(ROOT, "web", "assets3d", "combatants.json");
const MANIFEST = path.join(ROOT, "tools", "art", "combatants-manifest.json");
const REPORT = path.join(ROOT, "web", "assets3d", "combatants.validator.json");
const options = () => ({ glb: GLB, sidecar: SIDECAR, manifest: MANIFEST });

function archetype(kind) {
  return parseCombatantSidecar(fs.readFileSync(SIDECAR)).archetypes.find((value) => value.kind === kind);
}

function extent(mesh, axis) {
  return mesh.bounds.max[axis] - mesh.bounds.min[axis];
}

function lodMeshes(archetypeValue, level = "mid") {
  const lod = archetypeValue.lods.find((value) => value.level === level);
  assert.ok(lod, `missing ${archetypeValue.kind} ${level} LOD`);
  return lod.meshes;
}

function nodeWorld(archetypeValue, semantic, cache = new Map()) {
  if (cache.has(semantic)) return cache.get(semantic);
  const node = archetypeValue.nodes.find((value) => value.semantic === semantic);
  assert.ok(node, `missing node ${semantic}`);
  const parentSemantic = node.parent?.slice(archetypeValue.nodePrefix.length);
  const parent = parentSemantic === "armature" || parentSemantic === undefined
    ? [0, 0, 0] : nodeWorld(archetypeValue, parentSemantic, cache);
  const world = node.translation.map((value, axis) => value + parent[axis]);
  cache.set(semantic, world);
  return world;
}

function posedBounds(archetypeValue, meshSemantic, boneSemantic) {
  const mesh = lodMeshes(archetypeValue).find((value) => value.semantic === meshSemantic);
  assert.ok(mesh, `missing mesh ${meshSemantic}`);
  const origin = nodeWorld(archetypeValue, boneSemantic);
  return {
    min: mesh.bounds.min.map((value, axis) => value + origin[axis]),
    max: mesh.bounds.max.map((value, axis) => value + origin[axis]),
  };
}

function boxGap(left, right) {
  return Math.hypot(...[0, 1, 2].map((axis) =>
    Math.max(0, left.min[axis] - right.max[axis], right.min[axis] - left.max[axis])));
}

test("the_combatant_glb_sidecar_and_validator_report_match_the_pinned_manifest", async () => {
  const result = await validateCombatantAsset(options());
  assert.equal(result.issues.numErrors, 0);
  assert.equal(result.issues.numWarnings, 0);
  assert.equal(result.counts.skins, 2);
  assert.equal(result.counts.animations, 8);
  assert.deepEqual(fs.readFileSync(REPORT), canonicalBytes(result));
});

test("every_combatant_mesh_is_bound_to_one_exact_sixteen_bone_skin", () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const sidecar = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  validateSemanticClosure(parsed, sidecar, manifest);
  assert.equal(parsed.gltf.skins.length, 2);
  for (const archetype of sidecar.archetypes) {
    const skinIndex = parsed.gltf.skins.findIndex(({ name }) => name === archetype.skeleton.skin);
    assert.notEqual(skinIndex, -1);
    assert.equal(parsed.gltf.skins[skinIndex].joints.length, 16);
    const meshes = parsed.gltf.nodes.filter(({ name }) =>
      name.startsWith(archetype.nodePrefix + "lod_"));
    assert.equal(meshes.length, archetype.lods.reduce((sum, lod) => sum + lod.meshes.length, 0));
    assert.ok(meshes.every(({ skin }) => skin === skinIndex));
  }
});

test("a_changed_bone_closure_or_validator_warning_is_refused", async () => {
  const parsed = parseGlb(fs.readFileSync(GLB));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const changed = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  changed.archetypes[0].skeleton.bones.pop();
  assert.throws(() => validateSemanticClosure(parsed, changed, manifest), /semantic closure/);
  const extra = JSON.parse(fs.readFileSync(SIDECAR, "utf8"));
  extra.undeclared = true;
  assert.throws(() => parseCombatantSidecar(Buffer.from(JSON.stringify(extra))), /extra or missing/);
  assert.throws(() => validateManifest({ ...manifest, export: { ...manifest.export, skins: false } }),
    /export contract/);
  const unskinned = { ...parsed, gltf: structuredClone(parsed.gltf) };
  delete unskinned.gltf.nodes.find(({ name }) =>
    name === "FIGHTER_lod_high_mesh_pelvis_skirt").skin;
  assert.throws(() => validateSemanticClosure(unskinned,
    parseCombatantSidecar(fs.readFileSync(SIDECAR)), manifest), /not bound/);
  const duplicate = { ...parsed, gltf: structuredClone(parsed.gltf) };
  duplicate.gltf.nodes[1].name = duplicate.gltf.nodes[0].name;
  assert.throws(() => validateSemanticClosure(duplicate,
    parseCombatantSidecar(fs.readFileSync(SIDECAR)), manifest), /duplicated|closure drifted/);
  const warningValidator = { validateBytes: async () => ({ validatorVersion: "test", issues: {
    messages: [{ code: "TEST_WARNING", message: "warning", severity: 1 }],
  } }) };
  await assert.rejects(
    validateCombatantAsset({ ...options(), skipExpectedHashes: true, validator: warningValidator }),
    /warning/,
  );
});

test("two_clean_pinned_combatant_exports_are_byte_identical", () => {
  const toolchain = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "toolchain.json"), "utf8"));
  const blender = path.join(ROOT, toolchain.downloads.blenderWindowsX64Zip.localExecutablePath);
  const run = spawnSync(blender, ["--background", "--factory-startup", "--python",
    "tools/art/build_slice.py", "--", "--target", "combatants", "--verify"], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 180000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /combatant asset verified: [0-9a-f]{64}/);
});

test("fighter_and_brute_lods_preserve_rig_socket_and_region_closure", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const sidecar = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  const levels = ["high", "mid", "low"];
  const budgets = {
    fighter: { high: 45_000, mid: 14_000, low: 3_000 },
    brute: { high: 55_000, mid: 18_000, low: 4_000 },
  };
  for (const kind of ["fighter", "brute"]) {
    const declared = manifest.archetypes.find((value) => value.kind === kind);
    const exported = sidecar.archetypes.find((value) => value.kind === kind);
    assert.deepEqual(declared.lods.map(({ level }) => level), levels);
    assert.deepEqual(exported.lods.map(({ level }) => level), levels);
    for (const lod of exported.lods) {
      assert.deepEqual(lod.meshes.map(({ semantic }) => semantic), declared.meshNames,
        kind + " " + lod.level + " semantic mesh closure");
      assert.ok(lod.meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0) <=
        budgets[kind][lod.level], kind + " " + lod.level + " exceeds its triangle budget");
    }
    assert.deepEqual(exported.skeleton.bones.map((name) => name.slice(exported.nodePrefix.length)),
      ["root", "pelvis", "torso", "head", "arm_left", "hand_left", "socket_weapon_left",
        "arm_right", "hand_right", "socket_weapon_right", "socket_shield",
        "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs"]);
    assert.deepEqual(exported.nodes.filter(({ semantic }) =>
      semantic.startsWith("socket_") || semantic.startsWith("region_")).map(({ semantic }) => semantic),
    ["socket_weapon_left", "socket_weapon_right", "socket_shield",
      "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs"]);
  }
});

test("the_game_camera_reads_head_hands_feet_and_equipment_at_100_pixels", () => {
  const sidecar = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  for (const kind of ["fighter", "brute"]) {
    const value = sidecar.archetypes.find((archetypeValue) => archetypeValue.kind === kind);
    const mid = value.lods.find(({ level }) => level === "mid");
    const pixels = (semantic, axis) =>
      extent(mid.meshes.find((mesh) => mesh.semantic === semantic), axis) / value.height * 100;
    const names = kind === "fighter"
      ? ["head_helmet", "hand_left", "hand_right", "boot_left", "boot_right", "shield", "sword"]
      : ["head", "hand_left", "hand_right", "boot_left", "boot_right", "club"];
    for (const semantic of names) {
      assert.ok(Math.max(pixels(semantic, 0), pixels(semantic, 1)) >= 5,
        kind + " " + semantic + " is unreadable at 100 pixels");
    }
  }
});

test("fighter_and_brute_bounds_have_human_proportions_and_distinct_silhouettes", () => {
  const fighter = archetype("fighter");
  const brute = archetype("brute");
  const shoulderWidth = (value) => {
    const left = value.nodes.find((node) => node.semantic === "arm_left").translation[0];
    const right = value.nodes.find((node) => node.semantic === "arm_right").translation[0];
    return right - left;
  };
  const fighterHelmet = lodMeshes(fighter).find((mesh) => mesh.semantic === "head_helmet");
  const bruteHead = lodMeshes(brute).find((mesh) => mesh.semantic === "head");
  assert.ok(shoulderWidth(fighter) >= 0.72 && shoulderWidth(fighter) <= 0.86);
  assert.ok(shoulderWidth(brute) >= 1.02 && shoulderWidth(brute) <= 1.20);
  assert.ok(extent(fighterHelmet, 1) >= 0.38 && extent(bruteHead, 1) >= 0.50);
  assert.ok(shoulderWidth(brute) / brute.height - shoulderWidth(fighter) / fighter.height >= 0.04,
    "the Brute must stay detectably broader after equal-height scaling");
  const shoulderMutation = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  shoulderMutation.archetypes[0].nodes.find((node) => node.semantic === "arm_left").translation[0] = -0.20;
  assert.throws(() => validateCombatantPresentation(shoulderMutation), /shoulder proportions/);
  const headMutation = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  const helmet = lodMeshes(headMutation.archetypes[0]).find((mesh) => mesh.semantic === "head_helmet");
  helmet.bounds.max[1] = helmet.bounds.min[1] + 0.20;
  assert.throws(() => validateCombatantPresentation(headMutation), /head height/);
});

test("weapon_and_shield_have_minimum_projected_area_at_gameplay_scale", () => {
  const fighter = archetype("fighter");
  const brute = archetype("brute");
  const sword = lodMeshes(fighter).find((mesh) => mesh.semantic === "sword");
  const shield = lodMeshes(fighter).find((mesh) => mesh.semantic === "shield");
  const club = lodMeshes(brute).find((mesh) => mesh.semantic === "club");
  assert.ok(extent(sword, 0) * extent(sword, 1) >= 0.075, "the sword is line-thin");
  assert.ok(extent(shield, 0) * extent(shield, 1) >= 0.48, "the shield loses its broad read");
  assert.ok(extent(club, 0) * extent(club, 1) >= 0.26, "the club has no heavy striking head");
  const shieldMutation = parseCombatantSidecar(fs.readFileSync(SIDECAR));
  const changedShield = lodMeshes(shieldMutation.archetypes[0]).find((mesh) => mesh.semantic === "shield");
  changedShield.bounds.max[0] = changedShield.bounds.min[0] + 0.20;
  assert.throws(() => validateCombatantPresentation(shieldMutation), /shield projected area/);
});

test("authored_combatant_parts_form_one_connected_body_after_pose_copy", () => {
  const chains = {
    fighter: [
      ["pelvis_skirt", "pelvis", "torso_cuirass", "torso"],
      ["torso_cuirass", "torso", "head_helmet", "head"],
      ["torso_cuirass", "torso", "arm_left", "arm_left"],
      ["torso_cuirass", "torso", "arm_right", "arm_right"],
      ["arm_left", "arm_left", "forearm_left", "hand_left"],
      ["arm_right", "arm_right", "forearm_right", "hand_right"],
      ["forearm_left", "hand_left", "hand_left", "hand_left"],
      ["forearm_right", "hand_right", "hand_right", "hand_right"],
      ["pelvis_skirt", "pelvis", "leg_left", "pelvis"],
      ["pelvis_skirt", "pelvis", "leg_right", "pelvis"],
      ["leg_left", "pelvis", "boot_left", "pelvis"],
      ["leg_right", "pelvis", "boot_right", "pelvis"],
    ],
    brute: [
      ["pelvis_kilt", "pelvis", "torso_hide", "torso"],
      ["torso_hide", "torso", "head", "head"],
      ["torso_hide", "torso", "arm_left", "arm_left"],
      ["torso_hide", "torso", "arm_right", "arm_right"],
      ["arm_left", "arm_left", "forearm_left", "hand_left"],
      ["arm_right", "arm_right", "forearm_right", "hand_right"],
      ["forearm_left", "hand_left", "hand_left", "hand_left"],
      ["forearm_right", "hand_right", "hand_right", "hand_right"],
      ["pelvis_kilt", "pelvis", "leg_left", "pelvis"],
      ["pelvis_kilt", "pelvis", "leg_right", "pelvis"],
      ["leg_left", "pelvis", "boot_left", "pelvis"],
      ["leg_right", "pelvis", "boot_right", "pelvis"],
    ],
  };
  for (const kind of ["fighter", "brute"]) {
    const value = archetype(kind);
    for (const [leftMesh, leftBone, rightMesh, rightBone] of chains[kind]) {
      const gap = boxGap(posedBounds(value, leftMesh, leftBone), posedBounds(value, rightMesh, rightBone));
      assert.ok(gap <= 0.055, `${kind} ${leftMesh} -> ${rightMesh} gap ${gap}`);
    }
  }
});

test("the_40_pixel_shrink_test_distinguishes_fighter_from_brute", () => {
  const fighter = archetype("fighter");
  const brute = archetype("brute");
  const pixels = (value, mesh, axis) =>
    extent(lodMeshes(value, "low").find((part) => part.semantic === mesh), axis) / value.height * 40;
  assert.ok(pixels(fighter, "sword", 0) >= 2.0, "the Fighter sword vanishes at 40 px");
  assert.ok(pixels(fighter, "shield", 0) >= 14.0, "the Fighter shield loses its class silhouette");
  assert.ok(pixels(brute, "club", 0) >= 5.0, "the Brute club loses its class silhouette");
  const fighterShoulders = Math.abs(
    fighter.nodes.find((node) => node.semantic === "arm_right").translation[0] -
    fighter.nodes.find((node) => node.semantic === "arm_left").translation[0]) / fighter.height * 40;
  const bruteShoulders = Math.abs(
    brute.nodes.find((node) => node.semantic === "arm_right").translation[0] -
    brute.nodes.find((node) => node.semantic === "arm_left").translation[0]) / brute.height * 40;
  assert.ok(bruteShoulders - fighterShoulders >= 2.5,
    "equal-height archetypes need visibly different shoulder silhouettes");
});
