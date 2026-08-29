import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { resolveConstructBindTransforms } from "../src/construct/compile.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { humanoidBlueprint, humanoidProfileMetrics, humanoidSavedConstruct,
  HUMANOID_SCALE } from "../src/construct/humanoid.ts";
import { twinbladeBlueprint, twinbladeControl, twinbladeProgram, twinbladeProfileMetrics,
  twinbladeSavedConstruct, twinbladeSwordBindMetrics, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { UNITS, unitDefinition } from "../src/units.ts";

const REMOVED_FREE_ARM = ["left-upper-arm", "left-forearm", "left-wrist", "left-hand"];
const supportRadius = (shape, direction) => {
  switch (shape.kind) {
    case "box": return Math.abs(direction.x) * shape.sizeM[0] / 2 +
      Math.abs(direction.y) * shape.sizeM[1] / 2 + Math.abs(direction.z) * shape.sizeM[2] / 2;
    case "sphere": return shape.radiusM;
    case "cylinder": return Math.abs(direction.y) * shape.lengthM / 2 +
      Math.hypot(direction.x, direction.z) * shape.radiusM;
    case "capsule": return Math.abs(direction.y) * Math.max(0, shape.lengthM / 2 - shape.radiusM) + shape.radiusM;
    default: throw new Error(`unsupported primitive ${shape.kind}`);
  }
};
const maximumExposedJointSeam = (blueprint) => {
  const transforms = resolveConstructBindTransforms(blueprint);
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
  return Math.max(...blueprint.joints.map((joint) => {
    const parent = transforms.get(joint.parentPart); const child = transforms.get(joint.childPart);
    const delta = child.position.subtract(parent.position); const distance = delta.length();
    if (distance === 0) return Number.NEGATIVE_INFINITY;
    const towardChild = delta.scale(1 / distance);
    const parentLocal = towardChild.rotateByQuaternionToRef(Quaternion.Inverse(parent.rotation), new Vector3());
    const childLocal = towardChild.scale(-1)
      .rotateByQuaternionToRef(Quaternion.Inverse(child.rotation), new Vector3());
    return distance - supportRadius(parts.get(joint.parentPart).shape, parentLocal) -
      supportRadius(parts.get(joint.childPart).shape, childLocal);
  }));
};

test("the_Twinblade_is_a_distinct_bilateral_A_B_chassis_without_replacing_the_Swordbearer", () => {
  const original = humanoidBlueprint();
  const twin = twinbladeBlueprint();
  assert.equal(original.id, "swordbearer-effigy");
  assert.equal(original.modules.filter(({ kind }) => kind === "sword").length, 1);
  assert.equal(REMOVED_FREE_ARM.every((id) => original.parts.some((part) => part.id === id)), true);
  assert.equal(twin.id, "twinblade-effigy");
  assert.equal(REMOVED_FREE_ARM.every((id) => twin.parts.every((part) => part.id !== id)), true);
  assert.deepEqual(twin.modules.filter(({ kind }) => kind === "sword").map(({ id }) => id).sort(),
    ["effigy-sword", "left-effigy-sword"]);
  assert.deepEqual(twin.modules.filter(({ kind }) => kind === "contact-sensor").map(({ id }) => id).sort(),
    ["contact-left-foot", "contact-right-foot"], "the bilateral chassis still has exactly two support feet");
  assert.ok(maximumExposedJointSeam(twin) <= 0.02);
  const reached = new Set([twin.rootPart]);
  while (true) {
    const before = reached.size;
    for (const joint of twin.joints) if (reached.has(joint.parentPart)) reached.add(joint.childPart);
    if (reached.size === before) break;
  }
  assert.equal(reached.size, twin.parts.length);
  assert.equal(twin.joints.length, twin.parts.length - 1);
  const broken = structuredClone(twin);
  broken.joints.find(({ id }) => id === "left-sword-yaw").parentFrame.positionM[0] -= 0.30;
  assert.ok(maximumExposedJointSeam(broken) > 0.10,
    "the seam gate fails when the mirrored attachment is displaced");
});

test("the_two_mounts_are_independently_resolved_mirrors_with_full_sized_ordinary_swords", () => {
  assert.equal(HUMANOID_SCALE, 0.75);
  const twin = twinbladeBlueprint();
  const part = (id) => twin.parts.find((candidate) => candidate.id === id);
  for (const [left, right] of [["left-sword-shoulder-yaw", "sword-shoulder-yaw"],
    ["left-sword-arm-pitch", "sword-arm-pitch"]]) {
    assert.deepEqual(part(left).shape, part(right).shape);
    assert.equal(part(left).massKg, part(right).massKg);
  }
  const leftYaw = twin.joints.find(({ id }) => id === "left-sword-yaw");
  const rightYaw = twin.joints.find(({ id }) => id === "sword-yaw");
  assert.equal(leftYaw.parentFrame.positionM[0], -rightYaw.parentFrame.positionM[0]);
  assert.deepEqual(leftYaw.parentFrame.positionM.slice(1), rightYaw.parentFrame.positionM.slice(1));
  assert.deepEqual(leftYaw.childFrame, rightYaw.childFrame);
  assert.deepEqual(leftYaw.angularAxes, rightYaw.angularAxes);
  for (const sword of twin.modules.filter(({ kind }) => kind === "sword")) {
    assert.equal(sword.massKg, 1.4);
    assert.equal(sword.striker.damageScale, 1.15,
      "the ordinary Twinblade swords retain the Swordbearer's non-experimental damage scale");
    assert.deepEqual(sword.geometry.find(({ id }) => id === "blade").shape.sizeM, [0.10, 0.05, 1.05]);
    assert.deepEqual(sword.striker.localTipM, [0, 0, 1.105]);
  }
  const left = twinbladeSwordBindMetrics("left");
  const right = twinbladeSwordBindMetrics("right");
  assert.deepEqual(left.yawPivotRootM, [-0.315, 0.1875, 0]);
  assert.deepEqual(right.yawPivotRootM, [0.315, 0.1875, 0]);
  assert.deepEqual(left.pitchPivotRootM, [-0.315, 0.3225, 0]);
  assert.deepEqual(right.pitchPivotRootM, [0.315, 0.3225, 0]);
  assert.equal(left.pitchToSocketM, right.pitchToSocketM);
  assert.equal(left.socketToTipM, right.socketToTipM);
  const profile = twinbladeProfileMetrics();
  const originalProfile = humanoidProfileMetrics();
  for (const key of ["reach", "crownHeight", "vitalHeight", "collisionRadius"]) {
    assert.ok(Math.abs(profile[key] - originalProfile[key]) < 1e-12,
      `${key} stays on the same human-sized 0.75 physical envelope`);
  }
});

test("the_control_surface_declares_disjoint_passive_and_combined_bilateral_Actions", () => {
  const control = twinbladeControl();
  const posture = control.groups.find(({ id }) => id === "posture");
  assert.equal(REMOVED_FREE_ARM.every((id) => !posture.joints.includes(id)), true);
  assert.equal(posture.joints.some((id) => id.includes("sword")), false,
    "posture stabilization cannot claim either independently controlled mount");
  const mounts = control.groups.find(({ id }) => id === "dual-sword-mounts");
  const combined = control.groups.find(({ id }) => id === "dual-sword-braced-body");
  assert.deepEqual(mounts.joints, ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch"]);
  assert.deepEqual(mounts.modules, ["left-effigy-sword", "effigy-sword"]);
  assert.deepEqual(combined.bindings["left-yaw"].joints, ["left-sword-yaw"]);
  assert.deepEqual(combined.bindings["left-pitch"].joints, ["left-sword-pitch"]);
  assert.deepEqual(combined.bindings["left-sword"].modules, ["left-effigy-sword"]);
  assert.deepEqual(combined.bindings["right-yaw"].joints, ["sword-yaw"]);
  assert.deepEqual(combined.bindings["right-pitch"].joints, ["sword-pitch"]);
  assert.deepEqual(combined.bindings["right-sword"].modules, ["effigy-sword"]);
  assert.equal(new Set(combined.joints).size, 12);
  const neutral = control.actions.find(({ id }) => id === "dual-mount-neutral");
  assert.deepEqual({ controller: neutral.controller, group: neutral.group },
    { controller: "twinblade-neutral-hold", group: "dual-sword-mounts" });
  assert.equal(control.actions.find(({ id }) => id === "dual-cut").group, "dual-sword-braced-body");
  assert.equal(twinbladeProgram().id, "twinblade-warrior-scissor-cut");
});

test("idle_and_active_definitions_share_one_exact_Twinblade_body_and_Setup_exposes_both_A_B_choices", () => {
  const active = twinbladeSavedConstruct();
  const constant = (value) => Object.freeze({ op: "constant", value });
  const idle = saveConstruct("Twinblade posture idle", active.blueprint, active.control, {
    version: 1, id: "twinblade-posture-idle", rules: [
      { id: "neutral", action: "dual-mount-neutral", priority: 30, optional: false, dwellS: 0,
        condition: constant(true), utility: constant(3), parameters: {} },
      { id: "brace", action: "brace", priority: 20, optional: false, dwellS: 0,
        condition: constant(true), utility: constant(2), parameters: {} },
      { id: "stabilize", action: "stabilize", priority: 10, optional: false, dwellS: 0,
        condition: constant(true), utility: constant(1), parameters: {} },
    ],
  }, TWINBLADE_SENSORS);
  assert.equal(idle.digests.blueprint, active.digests.blueprint);
  assert.equal(idle.digests.control, active.digests.control);
  assert.notEqual(idle.digests.program, active.digests.program);
  assert.notEqual(active.digests.blueprint, humanoidSavedConstruct().digests.blueprint);
  assert.equal(unitDefinition("swordbearer-effigy").label, "Swordbearer Effigy (Experimental)");
  const twin = unitDefinition("twinblade-effigy");
  assert.equal(twin.label, "Twinblade Effigy (Mechanical A/B)");
  assert.equal(twin.controlSurface, "construct-twinblade-v1");
  assert.equal(UNITS.some(({ name }) => name === "swordbearer-effigy"), true);
  assert.equal(UNITS.some(({ name }) => name === "twinblade-effigy"), true);
});

test("the_Twinblade_physically_compiles_with_two_strikers_and_two_support_feet", async () => {
  const arena = await createConstructHeadlessArena();
  const saved = twinbladeSavedConstruct();
  const bout = new ConstructLabBout(arena.scene, saved, saved, TWINBLADE_SENSORS, CONFIG.fighter.separation);
  try {
    const left = bout.construct("left");
    assert.equal(left.kind, "twinblade-effigy");
    assert.deepEqual(left.strikers.map(({ effectorId }) => effectorId).sort(),
      ["effigy-sword", "left-effigy-sword"]);
    assert.ok(left.runtime.part("left-sword-arm-pitch").node.position.x < left.runtime.part("torso").node.position.x);
    assert.ok(left.runtime.part("sword-arm-pitch").node.position.x > left.runtime.part("torso").node.position.x);
    for (let step = 0; step < 180; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const snapshot = left.control.snapshot();
    assert.equal(["left-sword-yaw", "left-sword-pitch"].every((id) =>
      snapshot.motorTargets.some(({ joint }) => joint === id || joint.startsWith(`${id}:`))), true);
    assert.equal(Object.entries(snapshot.facts).filter(([id, value]) =>
      id.startsWith("contact:contact-") && id.endsWith("-foot") && value === true).length, 2);
  } finally { bout.dispose(); arena.dispose(); }
});
