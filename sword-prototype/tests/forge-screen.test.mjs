import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { ForgeScreen, forgeScreenMarkup } from "../src/forge/screen.ts";
import { partAttachmentSockets } from "../src/forge/catalog.ts";
import { starterCoreBlueprint, starterCoreConstruct } from "../src/forge/starter.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { CONFIG } from "../src/config.ts";

class FakeHost {
  innerHTML = "";
  listeners = new Map();
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  click(action, dataset = {}) {
    this.listeners.get("click")?.({ target: { closest: (selector) => selector.includes("data-forge-action")
      ? { dataset: { forgeAction: action, ...dataset } } : null } });
  }
}
const bareCore = () => {
  const source = structuredClone(wardenBlueprint());
  return { ...source, id: "bare-preview-core", parts: source.parts.filter(({ id }) => id === "core"),
    joints: [], sockets: [], modules: [] };
};

test("ordinary_catalog_parts_use_declared_frames_and_refuse_an_occupied_socket", () => {
  const host = new FakeHost(); const starter = starterCoreConstruct();
  const screen = new ForgeScreen(host, { blueprint: starter.blueprint, control: starter.control,
    program: starter.program, sensors: WARDEN_SENSORS });
  host.click("select-part", { part: "core" });
  host.click("select-part-socket", { partSocket: "right" });
  host.click("attach-part", { catalog: "straight-plate" });
  const attached = screen.blueprint.parts.find(({ id }) => id === "straight-plate");
  const joint = screen.blueprint.joints.find(({ childPart }) => childPart === attached?.id);
  assert.ok(attached); assert.ok(joint);
  assert.deepEqual(joint.parentFrame, partAttachmentSockets(screen.blueprint.parts.find(({ id }) => id === "core"))
    .find(({ id }) => id === "right").frame);
  assert.deepEqual(joint.childFrame, partAttachmentSockets(attached).find(({ id }) => id === "left").frame);

  host.click("select-part", { part: "core" });
  host.click("select-part-socket", { partSocket: "right" });
  host.click("attach-part", { catalog: "piston-link" });
  assert.equal(screen.blueprint.parts.length, starterCoreBlueprint().parts.length + 1,
    "the occupied declared socket cannot silently overlap another branch");
  assert.match(host.innerHTML, /core\/right.*occupied|right -- structural \(occupied\)/s);
  screen.dispose();
});

test("ordinary_Forge_controls_build_save_and_run_a_new_mounted_weapon_and_sensor_branch", async () => {
  const host = new FakeHost(); const starter = starterCoreConstruct(); let saved = null;
  const screen = new ForgeScreen(host, { blueprint: starter.blueprint, control: starter.control,
    program: starter.program, sensors: WARDEN_SENSORS, onSaved: (artifact) => { saved = artifact; } });
  host.click("select-part", { part: "core" });
  host.click("select-part-socket", { partSocket: "right" });
  host.click("attach-two-axis-mount");
  host.click("mount-module", { catalog: "sword" });
  const pitch = screen.blueprint.parts.find(({ id }) => id.startsWith("forge-mount-pitch"));
  assert.ok(pitch);
  host.click("select-part", { part: pitch.id });
  host.click("select-part-socket", { partSocket: "top" });
  host.click("add-module-socket", { catalog: "sensor" });
  host.click("mount-module", { catalog: "opponent-sensor" });
  host.click("save");
  assert.ok(saved, host.innerHTML);
  const yawJoint = saved.blueprint.joints.find(({ id }) => id.startsWith("forge-mount-yaw-joint"));
  const pitchJoint = saved.blueprint.joints.find(({ id }) => id.startsWith("forge-mount-pitch-joint"));
  assert.equal(yawJoint.angularAxes[0].id, "y"); assert.equal(pitchJoint.angularAxes[0].id, "x");
  const swordId = saved.blueprint.modules.find(({ kind, id }) => kind === "sword" && id.startsWith("sword"))?.id;
  const sensorId = saved.blueprint.modules.find(({ kind, id }) => kind === "opponent-sensor" && id.startsWith("opponent-sensor"))?.id;
  assert.ok(swordId); assert.ok(sensorId);

  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved, saved, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    for (let step = 0; step < 4; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    assert.ok(bout.construct("left").runtime.modules.has(swordId));
    assert.ok(bout.construct("left").runtime.modules.has(sensorId));
  } finally { bout.dispose(); arena.dispose(); screen.dispose(); }
});

test("the_Forge_is_complete_without_console_or_source_editing", () => {
  const markup = forgeScreenMarkup(wardenBlueprint(), "core", "socket-dorsal-output", null, "Stone Warden");
  for (const marker of [
    'data-forge-action="undo"', 'data-forge-action="redo"', 'data-forge-action="attach-part"',
    'data-forge-action="remove-selected"', 'data-forge-action="mount-module"',
    'data-forge-action="save"', 'data-forge-action="export"', "data-forge-import", "data-forge-dimension",
  ]) assert.match(markup, new RegExp(marker));
  assert.doesNotMatch(markup, /textarea|console|source edit/i);
  assert.match(markup, /Transactional 3D preview/);
  assert.match(markup, /Build the body, then program it/);
});

test("Forge_reports_parts_joints_modules_and_armour_without_a_fake_total_HP_pool", () => {
  const markup = forgeScreenMarkup(wardenBlueprint(), "core", "socket-dorsal-output", null, "Stone Warden");
  for (const label of ["Part durability", "Joint durability", "Module durability", "Armour"]) {
    assert.match(markup, new RegExp(`<dt>${label}</dt>`));
  }
  assert.doesNotMatch(markup, /<dt>(?:Health|HP)<\/dt>/i);
  assert.doesNotMatch(markup, /\d+\.\d{3,}/, "combat values render with at most two decimal places");
});

test("a_failed_import_or_preview_leaves_the_library_and_last_valid_scene_unchanged", () => {
  const host = new FakeHost();
  const disposed = [];
  let previews = 0;
  const screen = new ForgeScreen(host, {
    blueprint: bareCore(), control: wardenControl(), program: wardenProgram(), sensors: WARDEN_SENSORS,
    preview(blueprint) {
      previews += 1;
      if (blueprint.parts.find(({ id }) => id === "core").shape.sizeM[0] > 1.5) throw new Error("preview too wide");
      const index = previews;
      return { dispose: () => disposed.push(index) };
    },
  });
  const before = canonicalBlueprintJson(screen.blueprint);
  const failed = screen.apply({ kind: "resize-box", part: "core", sizeM: [1.6, 0.58, 0.82] });
  assert.match(failed.refusal, /preview too wide/);
  assert.equal(canonicalBlueprintJson(screen.blueprint), before);
  assert.deepEqual(disposed, [], "the last valid preview remains live");
  assert.equal(screen.importText('{"version":99}'), null);
  assert.equal(canonicalBlueprintJson(screen.blueprint), before);
  assert.deepEqual(disposed, []);
  screen.dispose();
  assert.deepEqual(disposed, [1]);
});

test("saved_import_controls_publish_the_exact_validated_construct_without_a_fallback", () => {
  const host = new FakeHost();
  const imported = [];
  const screen = new ForgeScreen(host, {
    blueprint: wardenBlueprint(), control: wardenControl(), program: wardenProgram(), sensors: WARDEN_SENSORS,
    publisher: { capture: () => imported.length, publish: ({ saved }) => imported.push(saved.digests),
      rollback: (length) => { imported.length = length; } },
  });
  const alternate = structuredClone(wardenBlueprint());
  alternate.id = "alternate-warden";
  const saved = saveConstruct("Alternate", alternate, wardenControl(), wardenProgram(), WARDEN_SENSORS);
  assert.deepEqual(screen.importText(JSON.stringify(saved)).digests, saved.digests);
  assert.equal(screen.blueprint.id, "alternate-warden");
  assert.deepEqual(imported, [saved.digests]);
});

test("undo_and_redo_do_not_move_history_when_the_candidate_preview_refuses", () => {
  let refusedWidth = null;
  const disposed = [];
  let serial = 0;
  const screen = new ForgeScreen(new FakeHost(), {
    blueprint: bareCore(), control: wardenControl(), program: wardenProgram(), sensors: WARDEN_SENSORS,
    preview(blueprint) {
      const width = blueprint.parts.find(({ id }) => id === "core").shape.sizeM[0];
      if (width === refusedWidth) throw new Error(`preview refuses ${width}`);
      const id = ++serial;
      return { dispose: () => disposed.push(id) };
    },
  });
  const original = canonicalBlueprintJson(screen.blueprint);
  screen.apply({ kind: "resize-box", part: "core", sizeM: [1.3, 0.58, 0.82] });
  const changed = canonicalBlueprintJson(screen.blueprint);
  refusedWidth = wardenBlueprint().parts.find(({ id }) => id === "core").shape.sizeM[0];
  screen.undo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), changed, "failed undo leaves current/history at changed body");
  refusedWidth = null;
  screen.undo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), original);
  refusedWidth = 1.3;
  screen.redo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), original, "failed redo leaves current/history at original body");
  assert.equal(disposed.includes(2), true, "successful undo replaces the changed preview");
  screen.dispose();
});

test("an_import_callback_failure_rolls_back_editor_state_and_disposes_only_the_candidate_preview", () => {
  const disposed = [];
  let serial = 0;
  const screen = new ForgeScreen(new FakeHost(), {
    blueprint: wardenBlueprint(), control: wardenControl(), program: wardenProgram(), sensors: WARDEN_SENSORS,
    preview: () => { const id = ++serial; return { dispose: () => disposed.push(id) }; },
    publisher: { capture: () => null, publish: () => { throw new Error("library publication refused"); },
      rollback: () => {} },
  });
  const before = canonicalBlueprintJson(screen.blueprint);
  const alternate = structuredClone(wardenBlueprint()); alternate.id = "callback-failure";
  const saved = saveConstruct("Callback failure", alternate, wardenControl(), wardenProgram(), WARDEN_SENSORS);
  assert.equal(screen.importText(JSON.stringify(saved)), null);
  assert.equal(canonicalBlueprintJson(screen.blueprint), before);
  assert.deepEqual(disposed, [2], "candidate was cleaned up and the last valid preview remains live");
  screen.dispose();
  assert.deepEqual(disposed, [2, 1]);
});

test("apply_undo_and_redo_restore_host_state_when_publication_throws_after_its_first_mutation", () => {
  const initial = bareCore();
  const hostState = { blueprint: canonicalBlueprintJson(initial), control: wardenControl(), program: wardenProgram() };
  let failKind = null;
  const publisher = {
    capture: () => ({ ...hostState }),
    publish(publication) {
      hostState.blueprint = canonicalBlueprintJson(publication.blueprint);
      if (publication.kind === failKind) throw new Error(`${publication.kind} host fault after blueprint mutation`);
      hostState.control = publication.control; hostState.program = publication.program;
    },
    rollback(checkpoint) { Object.assign(hostState, checkpoint); },
  };
  const screen = new ForgeScreen(new FakeHost(), {
    blueprint: initial, control: hostState.control, program: hostState.program, sensors: WARDEN_SENSORS, publisher,
  });
  const original = canonicalBlueprintJson(screen.blueprint);
  const resize = { kind: "resize-box", part: "core", sizeM: [1.3, 0.58, 0.82] };

  failKind = "apply";
  assert.match(screen.apply(resize).refusal, /apply host fault after blueprint mutation/);
  assert.equal(canonicalBlueprintJson(screen.blueprint), original);
  assert.equal(hostState.blueprint, original, "failed apply compensates the already-mutated host blueprint");

  failKind = null; screen.apply(resize);
  const changed = canonicalBlueprintJson(screen.blueprint);
  assert.equal(hostState.blueprint, changed);
  failKind = "undo"; screen.undo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), changed);
  assert.equal(hostState.blueprint, changed, "failed undo compensates host state and does not move history");

  failKind = null; screen.undo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), original);
  failKind = "redo"; screen.redo();
  assert.equal(canonicalBlueprintJson(screen.blueprint), original);
  assert.equal(hostState.blueprint, original, "failed redo compensates host state and does not move history");
  screen.dispose();
});

test("the_Forge_screen_source_has_mouse_controls_and_no_free_transform_channel", async () => {
  const source = await readFile(new URL("../src/forge/screen.ts", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("click"/);
  assert.match(source, /attach-catalog-fragment/);
  assert.doesNotMatch(source, /freehand|dragTransform|translateSelected|rotation gizmo/i);
  assert.match(source, /parseSavedConstruct/);
  assert.match(source, /last valid machine/);
});
