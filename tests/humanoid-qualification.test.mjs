import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HUMANOID_PROFILES, LANDMARK_LIMIT_MM, attributeDigests, qualifyHumanoidDocument,
  qualifyHumanoidCandidate, qualifySelectedHumanoid, reportPathFor, requireSeveranceAdmission,
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
  {
    candidateId: "quaternius-male-ranger",
    id: "2026-08-27-untouched-humanoid-v1-rig-df5f4489ef01-source-55451f9bb52d-evaluator-b2c96af940be",
    reportSha256: "f8a5eaad34d62fcf943913dd499550ac2f2ad55107a145022b26dc48e0aa7ca1",
  },
  {
    candidateId: "quaternius-animated-knight",
    id: "2026-08-28-untouched-humanoid-v1-rig-df5f4489ef01-source-3487be1230e3-evaluator-b2c96af940be",
    reportSha256: "1470a4b7bec1ec56301f771c38a436d711ee86f9bd27e6e35424b59ed0f6b1ca",
  },
  {
    candidateId: "quaternius-female-ranger",
    id: "2026-08-28-untouched-humanoid-v1-rig-df5f4489ef01-source-9d8470efb679-evaluator-b2c96af940be",
    reportSha256: "8d961ea021358f896c74c8d7227c6abf72395f8e466ea16599eeb1a733a9c00f",
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

test("the_untouched_female_ranger_is_rejected_but_becomes_the_closest_geometry", async () => {
  const report = await qualifyHumanoidCandidate("quaternius-female-ranger", ROOT);
  const recorded = JSON.parse(await readFile(resolve(ROOT, reportPathFor(report)), "utf8"));
  assert.equal(report.status, "rejected");
  assert.equal(report.integrity.ok, true, report.integrity.failures.join("\n"));
  assert.equal(report.sourceHeightM, 1.798047);
  assert.equal(report.uniformScale, 1.001086);
  assert.deepEqual(report.axisMapping, ["+X", "+Y", "+Z"]);
  assert.deepEqual(report.sideMapping.primary, ["upperarm_l", "lowerarm_l", "hand_l"]);
  assert.deepEqual(report.sideMapping.secondary, ["upperarm_r", "lowerarm_r", "hand_r"]);
  assert.deepEqual(report.fit, { complete: true, expectedChecks: 17, checks: 17,
    overLimit: 15, maxErrorMm: 79.822, rmsErrorMm: 47.048 });
  assert.equal(report.animationCount, 0);
  assert.deepEqual(report.poses.map(({ authored, qualified }) => ({ authored, qualified })), [
    { authored: false, qualified: false }, { authored: false, qualified: false },
  ]);
  assert.deepEqual(report.sourceTechnical, {
    qualified: true,
    authority: "creator-published glTF attributes",
    creatorVertices: 24808,
    creatorIndices: 80898,
    skinJoints: 65,
    maxJointIndex: 64,
    weightRange: [0, 1],
    weightSumRange: [0.999999857, 1.000000144],
    inverseBindMatricesFinite: true,
    weightNormalizationRequired: false,
    failures: [],
  });
  assert.deepEqual(recorded, report, "the Female Ranger rejection must remain executable evidence");
});

test("the_generic_gltf_gate_decodes_skin_values_instead_of_assuming_their_validity", async () => {
  const original = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-female-ranger/female-ranger-source.gltf"), "utf8"));
  const source = await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-female-ranger/female-ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const profile = HUMANOID_PROFILES["quaternius-female-ranger"];
  const firstPrimitive = original.meshes[0].primitives[0];
  const offsetOf = (document, accessorIndex, component = 0) => {
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const bytes = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
    return (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + component * bytes;
  };

  const badJoint = Buffer.from(source);
  const jointAccessor = original.accessors[firstPrimitive.attributes.JOINTS_0];
  const jointOffset = offsetOf(original, firstPrimitive.attributes.JOINTS_0);
  if (jointAccessor.componentType === 5121) badJoint.writeUInt8(255, jointOffset);
  else badJoint.writeUInt16LE(65535, jointOffset);
  assert.ok(qualifyHumanoidDocument(original, badJoint, dimensions, null, profile).sourceTechnical.failures
    .includes("creator joint indices exceed the active skin palette"));

  const badIndex = Buffer.from(source);
  const indexAccessor = original.accessors[firstPrimitive.indices];
  const indexOffset = offsetOf(original, firstPrimitive.indices);
  const invalidIndex = original.accessors[firstPrimitive.attributes.POSITION].count;
  if (indexAccessor.componentType === 5121) badIndex.writeUInt8(invalidIndex, indexOffset);
  else if (indexAccessor.componentType === 5123) badIndex.writeUInt16LE(invalidIndex, indexOffset);
  else badIndex.writeUInt32LE(invalidIndex, indexOffset);
  assert.ok(qualifyHumanoidDocument(original, badIndex, dimensions, null, profile).sourceTechnical.failures
    .includes("creator triangle indices exceed their primitive vertex count"));

  const badWeights = Buffer.from(source);
  const weightOffset = offsetOf(original, firstPrimitive.attributes.WEIGHTS_0);
  badWeights.writeUInt32LE(0x7fc00000, weightOffset);
  const weightReport = qualifyHumanoidDocument(original, badWeights, dimensions, null, profile);
  assert.ok(weightReport.sourceTechnical.failures.includes("creator skin weights contain non-finite values"));
  assert.equal(weightReport.sourceTechnical.qualified, false);

  const zeroWeights = Buffer.from(source);
  for (let influence = 0; influence < 4; influence += 1) zeroWeights.writeFloatLE(0, weightOffset + influence * 4);
  assert.ok(qualifyHumanoidDocument(original, zeroWeights, dimensions, null, profile).sourceTechnical.failures
    .includes("creator four-influence weight sums differ from 1 by more than 0.001"));

  const badMatrices = structuredClone(original);
  badMatrices.accessors[badMatrices.skins[0].inverseBindMatrices].count -= 1;
  assert.ok(qualifyHumanoidDocument(badMatrices, source, dimensions, null, profile).sourceTechnical.failures
    .includes("creator inverse-bind matrix layout disagrees with its skin"));

  const extraInfluences = structuredClone(original);
  extraInfluences.meshes[0].primitives[0].attributes.JOINTS_1 = firstPrimitive.attributes.JOINTS_0;
  extraInfluences.meshes[0].primitives[0].attributes.WEIGHTS_1 = firstPrimitive.attributes.WEIGHTS_0;
  assert.ok(qualifyHumanoidDocument(extraInfluences, source, dimensions, null, profile).sourceTechnical.failures
    .includes("generic creator glTF uses skin influence sets beyond JOINTS_0/WEIGHTS_0"));
});

test("profile_labels_and_unreachable_accessor_bounds_cannot_silently_change_the_fit", async () => {
  const original = JSON.parse(await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-female-ranger/female-ranger-source.gltf"), "utf8"));
  const binary = await readFile(resolve(ROOT,
    "asset-src/armour/quaternius-female-ranger/female-ranger-source.bin"));
  const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
  const profile = HUMANOID_PROFILES["quaternius-female-ranger"];
  const control = qualifyHumanoidDocument(original, binary, dimensions, null, profile);

  const decoy = structuredClone(original);
  const copiedMesh = structuredClone(decoy.meshes[0]);
  const positionAccessor = decoy.accessors[copiedMesh.primitives[0].attributes.POSITION];
  positionAccessor.min[1] = -999;
  positionAccessor.max[1] = 999;
  decoy.meshes.push(copiedMesh);
  const decoyReport = qualifyHumanoidDocument(decoy, binary, dimensions, null, profile);
  assert.equal(decoyReport.sourceHeightM, control.sourceHeightM);
  assert.deepEqual(decoyReport.fit, control.fit);

  const falseAxis = structuredClone(profile);
  falseAxis.axisMapping = ["+X", "+Z", "-Y"];
  assert.ok(qualifyHumanoidDocument(original, binary, dimensions, null, falseAxis).failures.includes(
    "generic glTF profile declares a non-identity axis mapping that the evaluator cannot execute"));
  const crossedSides = structuredClone(profile);
  crossedSides.landmarks.primaryShoulder = "upperarm_r";
  assert.ok(qualifyHumanoidDocument(original, binary, dimensions, null, crossedSides).failures.some((failure) =>
    failure.includes("primary shoulder profile landmark")));
  const missingFeet = structuredClone(profile);
  missingFeet.requiredMeshes = missingFeet.requiredMeshes.filter((name) => name !== "Female_Ranger_Feet");
  const missingFeetReport = qualifyHumanoidDocument(original, binary, dimensions, null, missingFeet);
  assert.ok(missingFeetReport.failures.includes("profile omits active skinned mesh Female_Ranger_Feet"));
  assert.equal(missingFeetReport.sourceHeightM, control.sourceHeightM,
    "profile omissions cannot alter rejected-candidate ranking measurements");
});

test("an_otherwise_clean_candidate_cannot_qualify_while_severance_is_deferred", () => {
  const failures = [];
  requireSeveranceAdmission(failures, { status: "deferred-after-admission-failure" });
  assert.deepEqual(failures, [
    "severance compatibility has not been admitted for this otherwise-qualified source",
  ]);
  const admitted = [];
  requireSeveranceAdmission(admitted, { status: "qualified" });
  assert.deepEqual(admitted, []);
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
    if (sourceCandidate.binaryMemberSha256) {
      assert.ok(candidate.sourceFiles.some((file) => file.sha256 === sourceCandidate.binaryMemberSha256),
        `${candidate.id} does not commit its exact creator binary member`);
    }
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
      assert.equal(report.integrity.binaryMemberSha256Actual, report.integrity.binaryMemberSha256);
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
          evaluation.rig.sha256 === ledger.comparison.rigSha256 &&
          evaluation.evaluatorSha256 === ledger.comparison.evaluatorSha256 && report.fit.complete) {
        ranked.push({ id: candidate.id, eligible: report.status === "qualified",
          max: report.fit.maxErrorMm, rms: report.fit.rmsErrorMm });
      }
    }
  }
  ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.max - b.max || a.rms - b.rms);
  assert.equal(ledger.comparison.closestGeometrySoFar, ranked[0]?.id ?? null);
  assert.equal(ledger.comparison.qualifiedCandidate, ranked[0]?.eligible ? ranked[0].id : null);
});

test("the_closest_geometry_boundary_is_female_then_male_and_not_a_qualification", async () => {
  const ledger = JSON.parse(await readFile(resolve(ROOT, "asset-src/humanoid-candidates.json"), "utf8"));
  const latest = (id) => ledger.candidates.find((candidate) => candidate.id === id).evaluations.at(-1);
  const male = latest("quaternius-male-ranger");
  const female = latest("quaternius-female-ranger");
  const closest = (rows) => [...rows].filter((row) => row.fit.complete)
    .sort((a, b) => Number(b.status === "qualified") - Number(a.status === "qualified")
      || a.fit.maxErrorMm - b.fit.maxErrorMm || a.fit.rmsErrorMm - b.fit.rmsErrorMm)[0];
  assert.equal(closest([male, female]), female);
  const movedPastMale = structuredClone(female);
  movedPastMale.fit.maxErrorMm = male.fit.maxErrorMm + 0.001;
  assert.equal(closest([male, movedPastMale]), male,
    "the comparison test must fail in the direction that would erase the Female result");
  assert.equal(ledger.comparison.closestGeometrySoFar, "quaternius-female-ranger");
  assert.equal(ledger.comparison.qualifiedCandidate, null);
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
