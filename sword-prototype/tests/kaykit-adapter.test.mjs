import assert from "node:assert/strict";
import test from "node:test";

import {
  KAYKIT_CREATOR_ACCESSORY,
  KAYKIT_NATIVE_TO_PHYSICS,
  KAYKIT_REGION_ORDER,
  KAYKIT_TARGET_SOURCE,
  assertExactTriangleCoverage,
  assignKayKitTriangleRegions,
  composeKayKitMatrix,
  deriveKayKitAccessoryMount,
  multiplyMatrix4,
  solveKayKitMappedTargets,
} from "../src/kaykit-adapter.ts";

const translation = (x, y, z) => composeKayKitMatrix([x, y, z]);
const position = (matrix) => [matrix[12], matrix[13], matrix[14]];
const near = (actual, expected, epsilon = 1e-12) => {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= epsilon,
      `${actual[index]} != ${expected[index]} at ${index}`);
  }
};

test("the_creator_skin_inventory_has_an_explicit_frozen_answer_for_all_41_joints", () => {
  assert.equal(Object.isFrozen(KAYKIT_NATIVE_TO_PHYSICS), true);
  assert.equal(Object.keys(KAYKIT_NATIVE_TO_PHYSICS).length, 41);
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["upperarm.r"], "swordUpperArm");
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["hand.r"], "swordHand");
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["upperarm.l"], "offUpperArm");
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["hand.l"], "offHand");
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["control-foot-roll.l"], null);
  assert.equal(KAYKIT_NATIVE_TO_PHYSICS["handIK.r"], null);
});

const mappedHierarchy = () => {
  const parent = {
    chest: null,
    head: "chest",
    hips: "chest",
    "upperarm.r": "chest",
    "lowerarm.r": "upperarm.r",
    "hand.r": "lowerarm.r",
    "upperarm.l": "chest",
    "lowerarm.l": "upperarm.l",
    "hand.l": "lowerarm.l",
    "upperleg.l": "hips",
    "lowerleg.l": "upperleg.l",
    "upperleg.r": "hips",
    "lowerleg.r": "upperleg.r",
  };
  return KAYKIT_REGION_ORDER.map((target, index) => ({
    name: KAYKIT_TARGET_SOURCE[target],
    parent: parent[KAYKIT_TARGET_SOURCE[target]],
    local: translation(index + 1, index % 3, 0),
  }));
};

test("mapped_targets_are_solved_through_the_creator_hierarchy_before_the_13_bone_collapse", () => {
  const solved = solveKayKitMappedTargets(mappedHierarchy());
  near(position(solved.world.swordUpperArm), [5, 0, 0]);
  near(position(solved.world.swordForearm), [10, 1, 0]);
  near(position(solved.world.swordHand), [16, 3, 0]);
  near(position(solved.local.swordForearm), [5, 1, 0]);
  near(position(solved.local.swordHand), [6, 2, 0]);
  near(
    multiplyMatrix4(solved.world.swordForearm, solved.local.swordHand),
    solved.world.swordHand,
  );
});

test("a_missing_mapped_source_joint_is_refused_by_target_and_creator_name", () => {
  const nodes = mappedHierarchy().filter((node) => node.name !== "hand.r");
  assert.throws(
    () => solveKayKitMappedTargets(nodes),
    /mapped target "swordHand" is missing source joint "hand\.r"/,
  );
});

test("triangle_regions_sum_all_collapsed_weights_and_break_exact_ties_by_frozen_order", () => {
  const result = assignKayKitTriangleRegions({
    indices: [0, 1, 2, 3, 4, 5],
    jointNames: ["chest", "head", "upperarm.r", "lowerarm.r"],
    joints: [
      0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
      2, 3, 0, 0, 3, 2, 0, 0, 2, 3, 0, 0,
    ],
    weights: [
      0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0,
      0.6, 0.4, 0, 0, 0.6, 0.4, 0, 0, 0.6, 0.4, 0, 0,
    ],
  });
  assert.deepEqual(result.map(({ triangle, region }) => [triangle, region]), [
    [0, "torso"],
    [1, "swordUpperArm"],
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0].indices), true);

  // Mutation control: reversing the declared order would give the equal first
  // triangle to head, so the expected answer is observing the tie contract.
  const reverseWinner = [...KAYKIT_REGION_ORDER].reverse()
    .find((region) => region === "torso" || region === "head");
  assert.equal(reverseWinner, "head");
});

test("an_unmapped_weighted_joint_is_refused_instead_of_becoming_torso", () => {
  assert.throws(() => assignKayKitTriangleRegions({
    indices: [0, 1, 2],
    jointNames: ["chest", "finger.r"],
    joints: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  }), /joint "finger\.r" has no native-to-physics mapping/);
});

test("a_known_control_joint_with_geometry_is_refused_as_source_corruption", () => {
  assert.throws(() => assignKayKitTriangleRegions({
    indices: [0, 1, 2],
    jointNames: ["kneeIK.l"],
    joints: Array(12).fill(0),
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  }), /control joint "kneeIK\.l" carries a positive skin weight/);
});

test("triangle_coverage_refuses_both_a_hole_and_a_duplicate", () => {
  assert.throws(
    () => assertExactTriangleCoverage(3, [{ triangle: 0 }, { triangle: 2 }]),
    /triangle 1 is not assigned/,
  );
  assert.throws(
    () => assertExactTriangleCoverage(3, [{ triangle: 0 }, { triangle: 1 }, { triangle: 1 }, { triangle: 2 }]),
    /triangle 1 is assigned more than once/,
  );
});

const swordMount = (socketX = 0.1) => [
  { name: "root", parent: null, local: translation(4, 0, -2) },
  { name: "hand.r", parent: "root", local: translation(0.5, 1, 0) },
  { name: "handslot.r", parent: "hand.r", local: translation(socketX, 0.2, -0.05) },
  { name: "1H_Sword", parent: "handslot.r", local: translation(0, 0.03, 0.01) },
];

test("the_creator_sword_mount_is_derived_from_hand_to_socket_to_accessory", () => {
  const mount = deriveKayKitAccessoryMount(swordMount(), "1H_Sword");
  near(position(mount.socketFromHand), [0.1, 0.2, -0.05]);
  near(position(mount.accessoryFromSocket), [0, 0.03, 0.01]);
  near(position(mount.accessoryFromHand), [0.1, 0.23, -0.04]);
  near(
    multiplyMatrix4(mount.handWorld, mount.accessoryFromHand),
    mount.accessoryWorld,
  );
  assert.deepEqual(KAYKIT_CREATOR_ACCESSORY["1H_Sword"], {
    hand: "hand.r", socket: "handslot.r",
  });
});

test("perturbing_the_creator_socket_changes_the_derived_grip_instead_of_being_ignored", () => {
  const original = deriveKayKitAccessoryMount(swordMount(0.1), "1H_Sword");
  const moved = deriveKayKitAccessoryMount(swordMount(0.125), "1H_Sword");
  near(
    [position(moved.socketFromHand)[0] - position(original.socketFromHand)[0]],
    [0.025],
  );
  near(
    [position(moved.accessoryFromHand)[0] - position(original.accessoryFromHand)[0]],
    [0.025],
  );
});

test("a_socket_or_accessory_outside_the_creator_parent_chain_is_refused", () => {
  const wrongSocket = swordMount().map((node) =>
    node.name === "handslot.r" ? { ...node, parent: "root" } : node);
  assert.throws(
    () => deriveKayKitAccessoryMount(wrongSocket, "1H_Sword"),
    /socket "handslot\.r" is not a child of "hand\.r"/,
  );
  const wrongSword = swordMount().map((node) =>
    node.name === "1H_Sword" ? { ...node, parent: "hand.r" } : node);
  assert.throws(
    () => deriveKayKitAccessoryMount(wrongSword, "1H_Sword"),
    /accessory "1H_Sword" is not a child of "handslot\.r"/,
  );
});
