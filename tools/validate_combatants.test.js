"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { canonicalBytes, parseGlb } = require("./validate_assets.js");
const {
  parseCombatantSidecar, validateCombatantAsset, validateManifest, validateSemanticClosure,
} = require("./validate_combatants.js");

const ROOT = path.resolve(__dirname, "..");
const GLB = path.join(ROOT, "web", "assets3d", "combatants.glb");
const SIDECAR = path.join(ROOT, "web", "assets3d", "combatants.json");
const MANIFEST = path.join(ROOT, "tools", "art", "combatants-manifest.json");
const REPORT = path.join(ROOT, "web", "assets3d", "combatants.validator.json");
const options = () => ({ glb: GLB, sidecar: SIDECAR, manifest: MANIFEST });

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
      name.startsWith(archetype.nodePrefix + "mesh_"));
    assert.ok(meshes.length >= 16);
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
  delete unskinned.gltf.nodes.find(({ name }) => name === "FIGHTER_mesh_pelvis_skirt").skin;
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
