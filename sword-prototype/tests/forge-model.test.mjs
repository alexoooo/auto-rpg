import assert from "node:assert/strict";
import test from "node:test";

import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { parseSavedConstruct, saveConstruct } from "../src/construct/codec.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { ForgeHistory, reduceForge } from "../src/forge/model.ts";
import { partAttachmentSockets } from "../src/forge/catalog.ts";

const bareCore = () => {
  const source = structuredClone(wardenBlueprint());
  return { ...source, id: "bare-resize-core", parts: source.parts.filter(({ id }) => id === "core"),
    joints: [], sockets: [], modules: [] };
};

test("every_Forge_command_returns_a_valid_new_blueprint_or_the_original_with_a_refusal", () => {
  const original = wardenBlueprint();
  const failed = reduceForge(original, { kind: "resize-box", part: "missing", sizeM: [1, 1, 1] });
  assert.strictEqual(failed.blueprint, original);
  assert.match(failed.refusal, /missing part "missing"/);
  const removed = reduceForge(original, { kind: "remove-subtree", part: "sensor-mast" });
  assert.equal(removed.refusal, null);
  assert.equal(removed.blueprint.parts.some((part) => part.id === "sensor-mast"), false);
  assert.equal(removed.blueprint.modules.some((module) => module.id === "warden-sensor"), false);
});

test("attach_fragment_is_atomic_and_never_publishes_a_disconnected_part", () => {
  const original = wardenBlueprint();
  const part = { ...structuredClone(original.parts[0]), id: "extra-bearing", fatal: false, vitalityWeight: 0 };
  const joint = { ...structuredClone(original.joints[0]), id: "bearing-extra", parentPart: "core",
    childPart: "extra-bearing", parentFrame: { positionM: [0, 0, 0.39], rotation: [0, 0, 0, 1] } };
  const result = reduceForge(original, { kind: "attach-fragment", part, joint });
  assert.equal(result.refusal, null);
  assert.equal(result.blueprint.parts.some((row) => row.id === "extra-bearing"), true);
  assert.equal(result.blueprint.joints.some((row) => row.childPart === "extra-bearing"), true);

  const invalid = reduceForge(original, { kind: "attach-fragment", part,
    joint: { ...joint, childPart: "wrong-part" } });
  assert.strictEqual(invalid.blueprint, original);
  assert.match(invalid.refusal, /wrong-part/);
});

test("catalog_attachment_rejects_a_joint_frame_that_does_not_match_its_declared_socket", () => {
  const original = wardenBlueprint();
  const part = { ...structuredClone(original.parts[0]), id: "catalog-child", fatal: false, vitalityWeight: 0 };
  const parentFrame = partAttachmentSockets(original.parts.find(({ id }) => id === "core")).find(({ id }) => id === "right").frame;
  const childFrame = partAttachmentSockets(part).find(({ id }) => id === "left").frame;
  const joint = { ...structuredClone(original.joints[0]), id: "catalog-joint", parentPart: "core",
    childPart: part.id, parentFrame, childFrame };
  const accepted = reduceForge(original, { kind: "attach-catalog-fragment", part, joint,
    parentSocket: "right", childSocket: "left", attachmentTag: "structural" });
  assert.equal(accepted.refusal, null);
  const misaligned = reduceForge(original, { kind: "attach-catalog-fragment", part,
    joint: { ...joint, parentFrame: { ...parentFrame, positionM: [parentFrame.positionM[0] + 0.01, 0, 0] } },
    parentSocket: "right", childSocket: "left", attachmentTag: "structural" });
  assert.strictEqual(misaligned.blueprint, original);
  assert.match(misaligned.refusal, /frames do not match declared sockets/);
  const resizedParent = reduceForge(accepted.blueprint, { kind: "resize-box", part: "core", sizeM: [1.4, 0.58, 0.82] });
  assert.strictEqual(resizedParent.blueprint, accepted.blueprint);
  assert.match(resizedParent.refusal, /custom non-face frame/);
  const resizedChild = reduceForge(accepted.blueprint, { kind: "resize-box", part: "catalog-child", sizeM: [1.4, 0.58, 0.82] });
  assert.equal(resizedChild.refusal, null);
  const resizedJoint = resizedChild.blueprint.joints.find(({ id }) => id === "catalog-joint");
  assert.deepEqual(resizedJoint.childFrame,
    partAttachmentSockets(resizedChild.blueprint.parts.find(({ id }) => id === "catalog-child"))
      .find(({ id }) => id === "left").frame,
    "face-bound joint frame follows the resized collider transactionally");
});

test("undo_redo_round_trips_canonical_blueprint_bytes", () => {
  const original = bareCore();
  const history = new ForgeHistory(original);
  const result = history.apply({ kind: "resize-box", part: "core", sizeM: [1.2, 0.6, 0.82] });
  assert.equal(result.refusal, null);
  const changed = canonicalBlueprintJson(history.blueprint);
  assert.notEqual(changed, canonicalBlueprintJson(original));
  assert.equal(canonicalBlueprintJson(history.undo()), canonicalBlueprintJson(original));
  assert.equal(canonicalBlueprintJson(history.redo()), changed);
});

test("saved_construct_import_recomputes_all_three_digests_and_refuses_unknown_versions", () => {
  const saved = saveConstruct("Stone Warden", wardenBlueprint(), wardenControl(), wardenProgram(), WARDEN_SENSORS);
  assert.deepEqual(parseSavedConstruct(JSON.stringify(saved), WARDEN_SENSORS).digests, saved.digests);
  const corrupt = structuredClone(saved);
  corrupt.digests.program = "00000000";
  assert.throws(() => parseSavedConstruct(JSON.stringify(corrupt), WARDEN_SENSORS), /program digest/);
  const future = structuredClone(saved); future.version = 2;
  assert.throws(() => parseSavedConstruct(JSON.stringify(future), WARDEN_SENSORS), /version 2 is unsupported/);
});

test("a_saved_construct_refuses_a_digest_valid_control_graph_that_names_absent_hardware", () => {
  const control = structuredClone(wardenControl());
  const locomotion = control.groups.find(({ id }) => id === "locomotion");
  const replaced = locomotion.joints[0];
  locomotion.joints[0] = "ghost-joint";
  for (const binding of Object.values(locomotion.bindings)) {
    binding.joints = binding.joints.map((id) => id === replaced ? "ghost-joint" : id);
  }
  assert.throws(() => saveConstruct("Ghost hardware", wardenBlueprint(), control, wardenProgram(), WARDEN_SENSORS),
    /blueprint-missing joint "ghost-joint"/);
  const missingModule = structuredClone(wardenBlueprint());
  missingModule.modules = missingModule.modules.filter(({ id }) => id !== "dorsal-crossbow");
  assert.throws(() => saveConstruct("Stale module", missingModule, wardenControl(), wardenProgram(), WARDEN_SENSORS),
    /blueprint-missing module "dorsal-crossbow"/);
});
