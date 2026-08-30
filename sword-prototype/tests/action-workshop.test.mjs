import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateConstructCommand } from "../src/construct/actions.ts";
import { compatibleControllers } from "../src/construct/controllers.ts";
import { canonicalProgramJson } from "../src/construct/program.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import {
  constructProbeCommand,
  constructProbeCommands,
  controllerChoicesForSelection,
  controlEditorMarkup,
  updateOrderedSelection,
} from "../src/forge/control-editor.ts";
import { diagnosticsMarkup } from "../src/forge/diagnostics.ts";
import {
  programEditorMarkup,
  programExpressionError,
  reorderProgramRule,
} from "../src/forge/program-editor.ts";
import { boundAimModuleIds } from "../src/construct/construct.ts";
import { summarizeProbeSnapshots } from "../src/forge/probe.ts";

test("controller_choices_are_derived_from_compatibility_descriptors_not_names", async () => {
  const selection = { joints: Array.from({ length: 12 }, (_, index) => `joint-${index}`), modules: ["one", "two", "three"] };
  assert.deepEqual(controllerChoicesForSelection(selection), compatibleControllers(12, 3));
  const source = await readFile(new URL("../src/forge/control-editor.ts", import.meta.url), "utf8");
  assert.match(source, /compatibleControllers\(/);
  assert.doesNotMatch(source, /case\s+["']hold-joints|case\s+["']quadruped-move/);
});

test("controller_choices_require_real_leg_contact_and_mount_hardware_not_only_matching_counts", () => {
  const blueprint = wardenBlueprint(); const graph = wardenControl();
  const mount = structuredClone(graph.groups.find(({ id }) => id === "dorsal-mount"));
  mount.modules = ["warden-shield"]; mount.bindings.output.modules = ["warden-shield"];
  mount.bindings.launcher.modules = ["warden-shield"];
  const choices = controllerChoicesForSelection(mount, blueprint).map(({ controller }) => controller);
  for (const id of ["aim-direction", "track-target", "sweep-arc", "fire-projectile"]) assert.equal(choices.includes(id), false);
  const locomotion = graph.groups.find(({ id }) => id === "locomotion");
  assert.equal(controllerChoicesForSelection(locomotion, blueprint).some(({ controller }) => controller === "quadruped-move"), true);
  const fake = { ...structuredClone(locomotion), bindings: Object.fromEntries(Object.entries(locomotion.bindings)
    .map(([role, binding]) => [role, { ...binding, modules: ["warden-shield"] }])) };
  assert.equal(controllerChoicesForSelection(fake, blueprint).some(({ controller }) => controller === "quadruped-move"), false);
});

test("the_Action_Workshop_offers_guard_only_for_a_real_sword_binding", () => {
  const swordBlueprint = wardenBlueprint("sword");
  const swordMount = wardenControl("sword").groups.find(({ id }) => id === "dorsal-mount");
  assert.equal(controllerChoicesForSelection(swordMount, swordBlueprint)
    .some(({ controller }) => controller === "guard-mount"), true);
  const crossbowBlueprint = wardenBlueprint("crossbow");
  const crossbowMount = wardenControl("crossbow").groups.find(({ id }) => id === "dorsal-mount");
  assert.equal(controllerChoicesForSelection(crossbowMount, crossbowBlueprint)
    .some(({ controller }) => controller === "guard-mount"), false);
});

test("two_axis_templates_refuse_disjoint_yaw_pitch_and_output_hardware", () => {
  const blueprint = wardenBlueprint("sword"); const graph = wardenControl("sword");
  const mount = structuredClone(graph.groups.find(({ id }) => id === "dorsal-mount"));
  mount.joints = ["bearing-sensor-mast", "bearing-dorsal-pitch"];
  mount.bindings.yaw.joints = ["bearing-sensor-mast"];
  assert.deepEqual(controllerChoicesForSelection(mount, blueprint)
    .filter(({ role }) => role === "two-axis-mount").map(({ controller }) => controller), []);
});

test("renamed_Forge_weapons_remain_the_runtime_aim_output", () => {
  const blueprint = structuredClone(wardenBlueprint("sword"));
  blueprint.modules.find(({ id }) => id === "dorsal-sword").id = "player-forged-blade";
  const control = structuredClone(wardenControl("sword"));
  const mount = control.groups.find(({ id }) => id === "dorsal-mount");
  mount.modules = mount.modules.map((id) => id === "dorsal-sword" ? "player-forged-blade" : id);
  for (const binding of Object.values(mount.bindings)) binding.modules = binding.modules
    .map((id) => id === "dorsal-sword" ? "player-forged-blade" : id);
  assert.equal(boundAimModuleIds(blueprint, control)[0], "player-forged-blade");
});

test("joint_binding_order_follows_click_order_and_multi_action_probe_keeps_stable_source_order", () => {
  let order = []; order = updateOrderedSelection(order, "pitch", true); order = updateOrderedSelection(order, "yaw", true);
  assert.deepEqual(order, ["pitch", "yaw"]);
  const command = constructProbeCommands(wardenControl(), ["aim", "fire"]);
  assert.deepEqual(command.requests.map(({ request, sourceIndex }) => [request.action, sourceIndex]), [["aim", 0], ["fire", 1]]);
});

test("the_live_probe_and_battle_runtime_receive_identical_ConstructCommand_bytes", () => {
  const graph = wardenControl();
  const probe = constructProbeCommand(graph, "aim", { yaw: 0.4, pitch: -0.2 });
  assert.strictEqual(validateConstructCommand(graph, probe), probe);
  assert.deepEqual(probe, { version: 1, requests: [{
    request: { action: "aim", parameters: { yaw: 0.4, pitch: -0.2 } },
    priority: 0,
    sourceIndex: 0,
  }] });
  const markup = controlEditorMarkup(graph, graph.groups.flatMap(({ joints }) => joints),
    graph.groups.flatMap(({ modules }) => modules));
  assert.match(markup, /Probe exact command/);
  assert.match(markup, /Probe queued requests together/);
  assert.match(markup, /No motor handle is exposed/);
});

test("physical_probe_timeline_retains_early_terminal_events_progress_and_motor_limit_metrics", () => {
  const base = { command: { version: 1, requests: [] }, facts: {}, capabilities: [], decision: null };
  const snapshots = [
    { ...base, events: [{ kind: "completed", action: "aim", group: "mount", reason: null }],
      active: [{ action: "guard", group: "mount", phase: "guard-tracking", detail: "early",
        progress: 0.4, epsilon: 0.04 }], motorTargets: [
        { joint: "yaw", angleRad: 1, minRad: -1, maxRad: 1, maxSpeedRadS: 4, maxForceNm: 20, targetAtLimit: true },
      ] },
    { ...base, events: [{ kind: "refused", action: "fire", group: "mount", reason: "claim held" }],
      active: [], motorTargets: [
        { joint: "yaw", angleRad: 0, minRad: -1, maxRad: 1, maxSpeedRadS: 4, maxForceNm: 20, targetAtLimit: false },
      ] },
    { ...base, events: [], active: [], motorTargets: [] },
  ];
  const timeline = summarizeProbeSnapshots(snapshots);
  assert.deepEqual(timeline.scheduler.map(({ step, kind, action }) => [step, kind, action]),
    [[0, "completed", "aim"], [1, "refused", "fire"]]);
  assert.equal(timeline.active[0].phase, "guard-tracking");
  assert.deepEqual(timeline.motors, { writes: 2, targetsAtLimit: 1, targetLimitFraction: 0.5,
    byJoint: { yaw: { writes: 2, targetsAtLimit: 1 } } });
});

test("the_program_editor_cannot_compare_incompatible_sensor_units", () => {
  const invalid = {
    op: "lt",
    left: { op: "sensor", id: "opponent-range" },
    right: { op: "sensor", id: "line-of-sight" },
  };
  assert.match(programExpressionError(invalid, WARDEN_SENSORS), /compares metres with boolean/);
  const markup = programEditorMarkup(wardenProgram(), wardenControl(), WARDEN_SENSORS);
  assert.match(markup, /Resolved group/);
  assert.doesNotMatch(markup, /data-program-group|name="group"/);
});

test("the_program_editor_names_runtime_action_commitment_separately_from_installed_facts", () => {
  const committed = structuredClone(wardenProgram());
  committed.rules[0].condition = { op: "active", action: "fire" };
  const markup = programEditorMarkup(committed, wardenControl(), WARDEN_SENSORS);
  assert.match(markup, /Active action/);
  assert.match(markup, /data-expression-active/);
  assert.match(markup, /<option value="fire" selected>fire<\/option>/);
});

test("rule_reordering_changes_canonical_program_bytes_and_the_visible_order_together", () => {
  const original = wardenProgram();
  const moved = reorderProgramRule(original, 0, 1);
  assert.notEqual(canonicalProgramJson(moved), canonicalProgramJson(original));
  assert.deepEqual(moved.rules.slice(0, 2).map(({ id }) => id), ["attack-in-range", "recover-when-fallen"]);
  const markup = programEditorMarkup(moved, wardenControl(), WARDEN_SENSORS);
  assert.ok(markup.indexOf("attack-in-range") < markup.indexOf("recover-when-fallen"));
});

test("a_pause_keeps_the_machine_and_decision_timeline_visible", () => {
  const markup = diagnosticsMarkup({
    at: 4.25, paused: true,
    rules: [{ rule: "attack-in-range", utility: 20, selected: true, decisiveFacts: { "opponent-range": 3.5 } }],
    scheduler: [{ kind: "refused", action: "fire", group: "dorsal-mount", reason: "magazine empty" }],
    active: [{ action: "cover", group: "shield", phase: "converging", detail: "0.1 rad remaining" }],
    capabilities: [{ id: "warden-crossbow", available: false, reason: "dorsal joint severed" }],
    resources: { "power-charge-j": 640, "heat-j": 20, "ammo:warden-magazine": 7 },
    combat: [{ effectorId: "dorsal-crossbow/projectile-2", target: "core", damage: 18,
      severed: false, blocked: false }],
  });
  assert.match(markup, /data-paused="true"/);
  assert.match(markup, /Paused -- evidence stays visible/);
  assert.match(markup, /magazine empty/);
  assert.match(markup, /dorsal joint severed/);
  assert.match(markup, /power-charge-j/);
  assert.match(markup, /dorsal-crossbow\/projectile-2/);
  assert.match(markup, /18\.00 damage/);
  assert.doesNotMatch(markup, /hidden/);
});

const locomotionDiagnostic = (overrides = {}) => ({
  state: { state: "rising", specificImpulseMps: 0.004, supportMissingS: 0,
    fallenElapsedS: 0.5, risingElapsedS: 0.225, driveStaged: true },
  stability: { specificImpulseMps: 0.004, staggerAtMps: 0.006, fallAtMps: 0.014 },
  authority: true, activeGroup: "locomotion-left", liveSupport: true, postureSupported: true,
  supportGroups: [{ id: "locomotion-full", live: false, reason: "right leg detached",
    bindings: [{ id: "left-foot", live: true, reason: null },
      { id: "right-foot", live: false, reason: "right foot detached" }] },
  { id: "locomotion-left", live: true, reason: null,
    bindings: [{ id: "left-foot", live: true, reason: null }] }],
  freshSupportBindings: ["left-foot"],
  requested: { localForward: 0.35, localRight: 0, yaw: -0.2, recover: true },
  allowed: { localForward: 0.1, localRight: 0, yaw: -0.2, recover: true },
  blockedReason: "carrier motion is constrained by world <wall>",
  releaseReason: "supported posture was lost", recoveryProgress: 0.5,
  ...overrides,
});

test("diagnostics_report_requested_and_allowed_motion_without_exposing_a_body_handle", () => {
  const locomotion = locomotionDiagnostic();
  const markup = diagnosticsMarkup({ at: 1, paused: false, rules: [], scheduler: [], active: [],
    capabilities: [], locomotion });
  assert.match(markup, /data-support-state="rising"/);
  assert.match(markup, /stability impulse.*0\.00400 m\/s/);
  assert.match(markup, /locomotion-full/);
  assert.match(markup, /left-foot=live/);
  assert.match(markup, /Requested motion.*forward 0\.350/);
  assert.match(markup, /Allowed motion.*forward 0\.100/);
  assert.match(markup, /carrier motion is constrained by world &lt;wall&gt;/);
  assert.match(markup, /supported posture was lost/);
  assert.match(markup, /Recovery progress<\/b> 50\.0%/);
  for (const forbidden of ["body", "shape", "carrierHandle", "motor"]) {
    assert.equal(Object.hasOwn(locomotion, forbidden), false, `${forbidden} must not cross the diagnostic snapshot`);
  }
});

test("physical_probe_retains_release_and_recovery_transitions_instead_of_only_its_final_tick", () => {
  const base = { command: { version: 1, requests: [] }, facts: {}, capabilities: [], decision: null,
    events: [], active: [], motorTargets: [] };
  const timeline = summarizeProbeSnapshots([
    { ...base, locomotion: locomotionDiagnostic({ state: { ...locomotionDiagnostic().state, state: "fallen" },
      recoveryProgress: 0, releaseReason: "stability threshold was exceeded" }) },
    { ...base, locomotion: locomotionDiagnostic({ recoveryProgress: 0.25 }) },
    { ...base, locomotion: locomotionDiagnostic({ state: { ...locomotionDiagnostic().state, state: "supported" },
      recoveryProgress: null, releaseReason: null }) },
  ]);
  assert.deepEqual(timeline.locomotion.map(({ step, diagnostic }) =>
    [step, diagnostic.state.state, diagnostic.recoveryProgress]),
  [[0, "fallen", 0], [1, "rising", 0.25], [2, "supported", null]]);
  assert.equal(timeline.locomotion[0].diagnostic.releaseReason, "stability threshold was exceeded");
});
