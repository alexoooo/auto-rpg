import assert from "node:assert/strict";
import test from "node:test";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import {
  bindCorrectedSkinWorldToRef,
  redirectedSkinWeights,
  SKIN_BONE_PARENT,
  skinLocalMatrixToRef,
} from "../src/figure.ts";

const nearMatrix = (actual, expected, epsilon = 1e-6) => {
  for (let index = 0; index < 16; index += 1) {
    assert.ok(Math.abs(actual.m[index] - expected.m[index]) <= epsilon,
      `matrix[${index}] ${actual.m[index]} != ${expected.m[index]}`);
  }
};

test("the_skin_has_exactly_thirteen_physics_driven_bones_in_severable_subtrees", () => {
  assert.equal(Object.keys(SKIN_BONE_PARENT).length, 13);
  assert.equal(SKIN_BONE_PARENT.torso, null);
  assert.equal(SKIN_BONE_PARENT.pelvis, "torso");
  assert.equal(SKIN_BONE_PARENT.thighLeft, "pelvis");
  assert.equal(SKIN_BONE_PARENT.shinLeft, "thighLeft");
  assert.equal(SKIN_BONE_PARENT.swordUpperArm, "torso");
  assert.equal(SKIN_BONE_PARENT.swordForearm, "swordUpperArm");
  assert.equal(SKIN_BONE_PARENT.swordHand, "swordForearm");
});

test("a_skin_bone_recovers_its_local_pose_from_two_independent_world_roots", () => {
  const parent = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(0.71, -0.18, 0.09),
    new Vector3(3.2, 1.1, -4.7),
  );
  const expected = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(-0.32, 0.44, -0.21),
    new Vector3(0.24, -0.31, 0.08),
  );
  const world = expected.multiply(parent);
  const actual = Matrix.Identity();
  skinLocalMatrixToRef(world, parent, Matrix.Identity(), actual);
  nearMatrix(actual, expected);

  // Mutation control: the tempting column-vector order is observably wrong on
  // this translated, rotated parent even though it passes an identity bind pose.
  const inverse = parent.clone().invert();
  const reversed = inverse.multiply(world);
  assert.ok(reversed.m.some((value, index) => Math.abs(value - expected.m[index]) > 1e-3));
});

test("an_offset_rotated_armature_bind_is_exact_when_the_physics_is_still_at_bind", () => {
  const boneBind = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(-0.63, 0.29, 0.41),
    new Vector3(-1.7, 2.8, 0.44),
  );
  const physicsBind = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(0.18, -0.37, 0.22),
    new Vector3(4.1, 1.3, -2.6),
  );
  const actual = Matrix.Identity();
  bindCorrectedSkinWorldToRef(
    boneBind,
    physicsBind.clone().invert(),
    physicsBind,
    Matrix.Identity(),
    actual,
  );
  nearMatrix(actual, boneBind);
});

test("a_physical_quarter_turn_is_applied_after_the_authored_bone_bind_frame", () => {
  const boneBind = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(0.52, -0.24, 0.31),
    new Vector3(-0.7, 1.9, 0.3),
  );
  const physicsBind = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(-0.16, 0.38, -0.09),
    new Vector3(3.4, 1.2, -2.1),
  );
  const physicalDelta = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationAxis(Vector3.Forward(), Math.PI / 2),
    new Vector3(0.12, -0.04, 0.27),
  );
  const physicsCurrent = physicsBind.multiply(physicalDelta);
  const expected = boneBind.multiply(physicalDelta);
  const actual = Matrix.Identity();
  bindCorrectedSkinWorldToRef(
    boneBind,
    physicsBind.clone().invert(),
    physicsCurrent,
    Matrix.Identity(),
    actual,
  );
  nearMatrix(actual, expected);

  const wrongOrder = physicalDelta.multiply(boneBind);
  assert.ok(wrongOrder.m.some((value, index) => Math.abs(value - expected.m[index]) > 1e-3),
    "the test distinguishes applying the delta before the authored bind");
});

test("a_cut_transfers_every_crossing_weight_to_the_correct_side_of_the_joint", () => {
  const names = Object.keys(SKIN_BONE_PARENT);
  const boneIndices = new Map(names.map((name, index) => [name, index]));
  const indexBones = new Map(names.map((name, index) => [index, name]));
  const torso = boneIndices.get("torso");
  const upper = boneIndices.get("swordUpperArm");
  const forearm = boneIndices.get("swordForearm");
  const hand = boneIndices.get("swordHand");

  const loose = redirectedSkinWeights(
    "swordForearm",
    ["swordUpperArm"],
    boneIndices,
    indexBones,
    [torso, upper, forearm, hand],
    [0.15, 0.25, 0.45, 0.15],
  );
  assert.deepEqual(loose.indices, [upper, upper, forearm, hand],
    "the detached forearm keeps no torso influence across its severed shoulder");
  assert.ok(Math.abs(loose.weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);

  const retained = redirectedSkinWeights(
    "torso",
    ["swordUpperArm"],
    boneIndices,
    indexBones,
    [torso, upper, forearm, hand],
    [0.7, 0.1, 0.1, 0.1],
  );
  assert.deepEqual(retained.indices, [torso, torso, torso, torso],
    "the retained chest keeps no influence from the detached arm subtree");
});

test("several_cuts_are_recomputed_from_authored_weights_instead_of_an_earlier_rewrite", () => {
  const names = Object.keys(SKIN_BONE_PARENT);
  const boneIndices = new Map(names.map((name, index) => [name, index]));
  const indexBones = new Map(names.map((name, index) => [index, name]));
  const torso = boneIndices.get("torso");
  const upper = boneIndices.get("swordUpperArm");
  const forearm = boneIndices.get("swordForearm");
  const hand = boneIndices.get("swordHand");
  const result = redirectedSkinWeights(
    "swordHand",
    ["swordUpperArm", "swordHand"],
    boneIndices,
    indexBones,
    [torso, upper, forearm, hand],
    [0.1, 0.2, 0.3, 0.4],
  );
  assert.deepEqual(result.indices, [hand, hand, hand, hand]);
});
