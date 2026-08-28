import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LANDMARK_LIMIT_MM, attributeDigests, qualifyHumanoidDocument,
  qualifyHumanoidCandidate, qualifySelectedHumanoid, reportPathFor,
  structureDigests } from "../scripts/qualify-humanoid.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HISTORICAL_EVALUATIONS = Object.freeze([
  {
    candidateId: "quaternius-male-ranger",
    id: "2026-08-27-untouched-humanoid-v1-rig-df5f4489ef01-source-55451f9bb52d-evaluator-0512551c9118",
    reportSha256: "2ab8c7b66e5f2b8060cd92ef38fcd36159e718dde226ce87516bbff408fd7076",
  },
  {
    candidateId: "quaternius-animated-knight",
    id: "2026-08-28-untouched-humanoid-v1-rig-df5f4489ef01-source-3487be1230e3-evaluator-0512551c9118",
    reportSha256: "8672ebd44097bf950d26ca38832010ade902007278efccc52d6dbe93d6ff81d2",
  },
]);
const HISTORICAL_LEGACY_REPORT = Object.freeze({
  candidateId: "quaternius-male-ranger",
  path: "asset-src/armour/quaternius-ranger/qualification.json",
  sha256: "7c4cdcf29339819f6009b440f01a3963a21e0103dcc64ad838a7b16f41db1370",
});

test("the_untouched_universal_ranger_is_rejected_instead_of_stretched_onto_the_physics_rig", async () => {
  const report = await qualifySelectedHumanoid(ROOT);
  const recorded = JSON.parse(await readFile(resolve(ROOT, reportPathFor(report)), "utf8"));
  assert.equal(report.status, "rejected");
  assert.equal(report.integrity.ok, true, report.integrity.failures.join("\n"));
  assert.equal(report.landmarkLimitMm, 25);
  assert.equal(report.uniformScale, 0.963078);
  const primary = report.limbs.find((limb) => limb.name === "primary arm");
  const secondary = report.limbs.find((limb) => limb.name === "secondary arm");
  assert.ok(primary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(primary));
  assert.ok(secondary.wristErrorMm > LANDMARK_LIMIT_MM, JSON.stringify(secondary));
  assert.ok(report.failures.some((failure) => failure.includes("primary arm misses")));
  assert.ok(report.failures.some((failure) => failure.includes("no qualifying creator-authored sword grip")));
  assert.deepEqual(recorded, report, "the durable rejection report is the executable result, not a parallel summary");
});

test("the_untouched_animated_knight_is_measured_from_its_creator_blend_and_rejected", async () => {
  const report = await qualifyHumanoidCandidate("quaternius-animated-knight", ROOT);
  const recorded = JSON.parse(await readFile(resolve(ROOT, reportPathFor(report)), "utf8"));
  assert.equal(report.status, "rejected");
  assert.equal(report.integrity.ok, true, report.integrity.failures.join("\n"));
  assert.equal(report.sourceHeightM, 5.598826);
  assert.equal(report.uniformScale, 0.321496);
  assert.deepEqual(report.axisMapping, ["+X", "+Z", "-Y"]);
  assert.deepEqual(report.fit, { complete: true, expectedChecks: 17, checks: 17,
    overLimit: 16, maxErrorMm: 346.585, rmsErrorMm: 215.827 });
  assert.equal(report.poses.find((pose) => pose.label === "sword grip").authored, true);
  assert.equal(report.poses.find((pose) => pose.label === "sword grip").qualified, false);
  assert.equal(report.poses.find((pose) => pose.label === "shield grip").authored, false);
  assert.equal(report.sourceTechnical.weightNormalizationRequired, true);
  assert.deepEqual(recorded, report, "the Knight rejection report must remain executable evidence");
});

test("the_candidate_ledger_preserves_every_evaluation_and_derives_its_comparison", async () => {
  const ledger = JSON.parse(await readFile(resolve(ROOT, "asset-src/humanoid-candidates.json"), "utf8"));
  const provenance = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));
  assert.equal(ledger.schema, 1);
  assert.equal(new Set(ledger.bundles.map((bundle) => bundle.id)).size, ledger.bundles.length);
  assert.equal(new Set(ledger.candidates.map((candidate) => candidate.id)).size, ledger.candidates.length);
  for (const historical of HISTORICAL_EVALUATIONS) {
    const candidate = ledger.candidates.find((row) => row.id === historical.candidateId);
    const evaluation = candidate?.evaluations.find((row) => row.id === historical.id);
    assert.ok(evaluation, `historical evaluation ${historical.id} was deleted`);
    assert.equal(evaluation.reportSha256, historical.reportSha256,
      `historical evaluation ${historical.id} was rewritten`);
  }
  const legacyCandidate = ledger.candidates.find((row) => row.id === HISTORICAL_LEGACY_REPORT.candidateId);
  assert.ok(legacyCandidate?.legacyReports.some((report) =>
    report.path === HISTORICAL_LEGACY_REPORT.path && report.sha256 === HISTORICAL_LEGACY_REPORT.sha256),
  "the original Ranger rejection report was deleted or rewritten");
  for (const bundle of ledger.bundles) {
    const source = provenance.sources.find((candidate) => candidate.id === bundle.id);
    assert.ok(source, `ledger bundle ${bundle.id} has no armour provenance`);
    for (const field of ["title", "author", "officialPage", "license", "licenseEvidence", "archiveSha256"]) {
      assert.equal(bundle[field], source[field], `${bundle.id} disagrees on ${field}`);
    }
  }
  const ranked = [];
  for (const candidate of ledger.candidates) {
    const bundle = ledger.bundles.find((row) => row.id === candidate.bundleId);
    assert.ok(bundle, `${candidate.id} names an unknown bundle`);
    const source = provenance.sources.find((row) => row.id === candidate.bundleId);
    const sourceCandidate = source.qualificationCandidates.find((row) => row.id === candidate.id);
    assert.ok(sourceCandidate, `${candidate.id} has no qualification provenance`);
    for (const file of candidate.sourceFiles) {
      assert.match(file.sha256, /^[0-9a-f]{64}$/);
      if (file.path.includes("#")) {
        const [, member] = file.path.split("#");
        assert.equal(member, sourceCandidate.sourceMember);
        assert.equal(file.sha256, sourceCandidate.sourceMemberSha256);
      } else {
        const bytes = await readFile(resolve(ROOT, file.path));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
      }
    }
    assert.ok(candidate.sourceFiles.some((file) => file.sha256 === sourceCandidate.sourceMemberSha256),
      `${candidate.id} does not commit its exact creator member`);
    for (const legacy of candidate.legacyReports ?? []) {
      assert.match(legacy.sha256, /^[0-9a-f]{64}$/);
      const bytes = await readFile(resolve(ROOT, legacy.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), legacy.sha256);
    }
    assert.ok(candidate.evaluations.length > 0, `${candidate.id} has no durable evaluation`);
    const ids = candidate.evaluations.map((evaluation) => evaluation.id);
    assert.equal(new Set(ids).size, ids.length, `${candidate.id} reuses an evaluation id`);
    for (const evaluation of candidate.evaluations) {
      assert.match(evaluation.rig.sha256, /^[0-9a-f]{64}$/);
      assert.match(evaluation.reportSha256, /^[0-9a-f]{64}$/);
      const bytes = await readFile(resolve(ROOT, evaluation.report));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), evaluation.reportSha256);
      const report = JSON.parse(bytes);
      assert.equal(report.candidateId, candidate.id);
      assert.equal(report.contract, evaluation.contract);
      assert.equal(report.evaluated, evaluation.evaluated);
      assert.equal(report.integrity.rig.sha256, evaluation.rig.sha256);
      assert.equal(report.integrity.evaluator.sha256, evaluation.evaluatorSha256);
      assert.equal(report.integrity.sourceInputSha256, evaluation.sourceInputSha256);
      assert.equal(report.integrity.sourceMemberSha256Actual, report.integrity.sourceMemberSha256);
      assert.equal(report.status, evaluation.status);
      assert.equal(report.integrity.ok, evaluation.integrityOk);
      assert.equal(report.sourceTechnical.qualified, evaluation.sourceTechnicalOk);
      assert.deepEqual(report.fit, {
        complete: evaluation.fit.complete,
        expectedChecks: evaluation.fit.expectedChecks,
        checks: evaluation.fit.checks,
        overLimit: evaluation.fit.overLimit,
        maxErrorMm: evaluation.fit.maxErrorMm,
        rmsErrorMm: evaluation.fit.rmsErrorMm,
      });
      const primary = report.limbs.find((limb) => limb.name === "primary arm");
      const secondary = report.limbs.find((limb) => limb.name === "secondary arm");
      assert.equal(evaluation.fit.primaryElbowMm, primary.elbowErrorMm);
      assert.equal(evaluation.fit.primaryWristMm, primary.wristErrorMm);
      assert.equal(evaluation.fit.secondaryElbowMm, secondary.elbowErrorMm);
      assert.equal(evaluation.fit.secondaryWristMm, secondary.wristErrorMm);
      const sword = report.poses.find((pose) => pose.label === "sword grip");
      const shield = report.poses.find((pose) => pose.label === "shield grip");
      if ("swordGrip" in evaluation.authoredPoses) assert.equal(evaluation.authoredPoses.swordGrip, sword.qualified);
      if ("swordActionPresent" in evaluation.authoredPoses) assert.equal(evaluation.authoredPoses.swordActionPresent, sword.authored);
      if ("swordGripQualified" in evaluation.authoredPoses) assert.equal(evaluation.authoredPoses.swordGripQualified, sword.qualified);
      assert.equal(evaluation.authoredPoses.shieldGrip, shield.qualified);
      if (evaluation.contract === ledger.comparison.contract &&
          evaluation.rig.sha256 === ledger.comparison.rigSha256 && report.fit.complete) {
        ranked.push({ id: candidate.id, eligible: report.status === "qualified",
          max: report.fit.maxErrorMm, rms: report.fit.rmsErrorMm });
      }
    }
  }
  ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.max - b.max || a.rms - b.rms);
  assert.equal(ledger.comparison.closestGeometrySoFar, ranked[0]?.id ?? null);
  assert.equal(ledger.comparison.qualifiedCandidate, ranked[0]?.eligible ? ranked[0].id : null);
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
