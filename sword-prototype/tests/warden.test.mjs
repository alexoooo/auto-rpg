import assert from "node:assert/strict";
import test from "node:test";

import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { validateProgram } from "../src/construct/program.ts";
import {
  WARDEN_LIMB_ATTACHMENTS,
  WARDEN_LIMB_TEMPLATE,
  WARDEN_SENSORS,
  wardenBlueprint,
  wardenControl,
  wardenProgram,
} from "../src/construct/warden.ts";

test("the_Warden_is_valid_generic_compilation_data_without_role_fields", () => {
  const blueprint = wardenBlueprint();
  assert.equal(blueprint.rootPart, "core");
  assert.equal(blueprint.parts.length, 21);
  assert.equal(blueprint.joints.length, blueprint.parts.length - 1);
  assert.equal(canonicalBlueprintJson(blueprint).includes('"role"'), false);
  assert.equal(blueprint.parts.filter((part) => ["plate", "piston", "core"].includes(part.shell.style)).length, 18);
});

test("all_four_repeated_limbs_share_one_template_and_have_unique_attachment_frames", () => {
  const blueprint = wardenBlueprint();
  assert.equal(WARDEN_LIMB_ATTACHMENTS.length, 4);
  assert.deepEqual(Object.keys(WARDEN_LIMB_TEMPLATE), ["upper", "lower", "ankle", "foot"]);
  const roots = WARDEN_LIMB_ATTACHMENTS.map(({ id }) =>
    blueprint.joints.find((joint) => joint.id === `bearing-${id}-upper`).parentFrame.positionM);
  assert.equal(new Set(roots.map((value) => JSON.stringify(value))).size, 4);
  for (const { id } of WARDEN_LIMB_ATTACHMENTS) {
    const pieces = ["upper", "lower", "ankle", "foot"].map((piece) =>
      blueprint.parts.find((part) => part.id === `limb-${id}-${piece}`));
    assert.deepEqual(pieces.map((piece) => piece.shape), [
      WARDEN_LIMB_TEMPLATE.upper.shape, WARDEN_LIMB_TEMPLATE.lower.shape,
      WARDEN_LIMB_TEMPLATE.ankle.shape, WARDEN_LIMB_TEMPLATE.foot.shape,
    ]);
  }
});

test("the_same_Warden_body_mount_accepts_crossbow_and_sword_without_role_specific_physics", () => {
  const crossbow = wardenBlueprint("crossbow");
  const sword = wardenBlueprint("sword");
  assert.deepEqual(crossbow.parts, sword.parts);
  assert.deepEqual(crossbow.joints, sword.joints);
  assert.deepEqual(crossbow.sockets, sword.sockets);
  assert.equal(crossbow.modules.find((module) => module.id === "dorsal-crossbow").kind, "launcher");
  assert.equal(sword.modules.find((module) => module.id === "dorsal-sword").kind, "sword");
  assert.equal(crossbow.modules.find((module) => module.id === "dorsal-crossbow").socket,
    sword.modules.find((module) => module.id === "dorsal-sword").socket);
  for (const graph of [wardenControl("crossbow"), wardenControl("sword")]) {
    const pitch = graph.actions.find(({ id }) => id === "aim").parameters.pitch;
    const limit = crossbow.joints.find(({ id }) => id === "bearing-dorsal-pitch").angularAxes[0];
    assert.deepEqual([pitch.min, pitch.max], [limit.minRad, limit.maxRad],
      "the public aim range must be exactly the shared physical bearing range");
  }
});

test("crossbow_and_sword_modules_publish_different_actions_from_the_same_joint_pair", () => {
  const crossbow = wardenControl("crossbow");
  const sword = wardenControl("sword");
  const mount = (graph) => graph.groups.find((group) => group.id === "dorsal-mount");
  assert.deepEqual(mount(crossbow).joints, mount(sword).joints);
  assert.equal(crossbow.actions.some((action) => action.id === "fire"), true);
  assert.equal(crossbow.actions.some((action) => action.id === "cut"), false);
  assert.equal(sword.actions.some((action) => action.id === "cut"), true);
  assert.equal(sword.actions.some((action) => action.id === "fire"), false);
});

test("four_generic_limbs_become_locomotion_only_through_their_group_and_controller", () => {
  const blueprint = wardenBlueprint();
  const control = wardenControl();
  assert.equal(canonicalBlueprintJson(blueprint).includes("locomotion"), false);
  const group = control.groups.find((candidate) => candidate.id === "locomotion");
  assert.equal(group.joints.length, 16);
  assert.equal(group.modules.length, 4);
  assert.equal(control.actions.some((action) => action.controller === "quadruped-move"), true);
});

test("both_committed_Warden_programs_validate_against_their_own_action_sets", () => {
  for (const variant of ["crossbow", "sword"]) {
    const graph = wardenControl(variant);
    assert.doesNotThrow(() => validateProgram(wardenProgram(variant), graph, WARDEN_SENSORS));
  }
});
