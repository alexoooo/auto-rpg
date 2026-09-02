import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalControlJson } from "../src/construct/actions.ts";
import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { canonicalProgramJson, parseProgram } from "../src/construct/program.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { CONSTRUCT_PLAYTEST_PROTOCOL, CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST } from "../src/construct/playtest.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { instantiateConnectedPart } from "../src/forge/catalog.ts";
import { reduceForge } from "../src/forge/model.ts";
import { ForgeScreen } from "../src/forge/screen.ts";
import {
  actionParametersForDescriptor,
  controlEditorMarkup,
  controllerChoicesForSelection,
  replaceControlAction,
  replaceControlGroup,
} from "../src/forge/control-editor.ts";
import {
  defaultRuleParameters,
  programEditorMarkup,
  replaceProgramExpression,
} from "../src/forge/program-editor.ts";
import {
  ConstructOnboarding,
  constructOnboardingMarkup,
  onboardingProgress,
  programIsDeliberatelyWeak,
} from "../src/forge/onboarding.ts";
import { starterCoreBlueprint, starterCoreConstruct } from "../src/forge/starter.ts";

class FakeHost {
  innerHTML = "";
  listeners = new Map();
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  click(action, dataset = {}) {
    const listener = this.listeners.get("click");
    listener?.({ target: { closest: (selector) => selector.includes("data-forge-action") ||
      selector.includes("data-guide-action") ? { dataset: { forgeAction: action, guideAction: action, ...dataset } } : null } });
  }
}

test("a_player_can_recreate_the_committed_Warden_control_graph_through_the_reducer", () => {
  const expected = wardenControl();
  let graph = { version: 1, groups: [], actions: [] };
  for (const group of expected.groups) graph = replaceControlGroup(graph, structuredClone(group));
  for (const action of expected.actions) {
    const group = graph.groups.find(({ id }) => id === action.group);
    const descriptor = controllerChoicesForSelection(group).find(({ controller }) => controller === action.controller);
    assert.ok(descriptor, `${action.controller} is offered for ${group.id}`);
    for (const required of descriptor.requiredParameters) assert.ok(required in action.parameters);
    graph = replaceControlAction(graph, structuredClone(action));
  }
  assert.equal(canonicalControlJson(graph), canonicalControlJson(expected));
});

test("descriptor_forms_seed_required_roles_and_parameter_descriptors_without_a_name_switch", () => {
  const graph = wardenControl();
  const group = graph.groups.find(({ id }) => id === "dorsal-mount");
  const sweep = controllerChoicesForSelection(group).find(({ controller }) => controller === "sweep-arc");
  assert.deepEqual(sweep.bindings.map(({ role }) => role), ["yaw", "pitch", "output"]);
  assert.deepEqual(actionParametersForDescriptor(sweep, group), {
    direction: { kind: "number", min: -1, max: 1, unit: "scalar" },
  });
  const markup = controlEditorMarkup(graph, group.joints, group.modules, null, group.id, sweep.controller,
    group.bindings, actionParametersForDescriptor(sweep, group));
  for (const marker of ["data-workshop-role-id", "data-workshop-action-id", "data-workshop-claims",
    "data-workshop-parameter", "data-parameter-min", "data-parameter-max", "data-parameter-unit",
    "data-workshop-action=\"add-action\""]) assert.match(markup, new RegExp(marker));
  assert.match(markup, /yaw: 1j\/0m/);
  assert.match(markup, /output: 0j\/1m/);
});

test("a_controller_is_not_offered_when_member_counts_pass_but_required_role_bindings_do_not", () => {
  const group = { id: "unbound", joints: Array.from({ length: 16 }, (_, index) => `joint-${index}`),
    modules: ["one", "two", "three", "four"], bindings: {} };
  const choices = controllerChoicesForSelection(group).map(({ controller }) => controller);
  assert.equal(choices.includes("quadruped-move"), false);
  assert.equal(choices.includes("fire-projectile"), false);
  assert.equal(choices.includes("hold-joints"), true);
});

test("an_action_form_cannot_retype_a_controller_owned_parameter_into_a_command_the_factory_would_refuse", () => {
  const graph = wardenControl();
  const move = graph.actions.find(({ id }) => id === "move");
  assert.throws(() => replaceControlAction(graph, { ...structuredClone(move), parameters: {
    ...structuredClone(move.parameters), speed: { kind: "boolean" },
  } }), /parameter "speed" must use number, got boolean/);
});

test("the_Mind_tree_form_edits_every_runtime_field_and_round_trips_through_the_runtime_parser", () => {
  const graph = wardenControl();
  const original = wardenProgram();
  const weak = replaceProgramExpression(original, 1, "utility", [], { op: "constant", value: 0 });
  assert.equal(programIsDeliberatelyWeak(weak), true);
  const restored = replaceProgramExpression(weak, 1, "utility", [], original.rules[1].utility);
  assert.equal(canonicalProgramJson(parseProgram(JSON.stringify(restored), graph, WARDEN_SENSORS)), canonicalProgramJson(original));
  assert.deepEqual(Object.keys(defaultRuleParameters(graph.actions.find(({ id }) => id === "move"))).sort(),
    Object.keys(original.rules.find(({ action }) => action === "move").parameters).sort());
  const markup = programEditorMarkup(original, graph, WARDEN_SENSORS);
  for (const marker of ["data-expression-op", "data-expression-sensor", "data-expression-constant-number",
    "data-expression-constant-unit", "data-program-priority", "data-program-dwell", "data-program-optional",
    "data-program-action-picker", "data-program-action=\"add-rule\""]) assert.match(markup, new RegExp(marker));
  assert.doesNotMatch(markup, /textarea|JSON editor|source edit/i);
});

test("the_resumable_Forge_guide_is_pinned_to_the_actual_construct_protocol_digest", () => {
  assert.equal(CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST, "eaf5d7ab");
  assert.deepEqual(CONSTRUCT_PLAYTEST_PROTOCOL.assignments.map(({ id }) => id),
    ["build-four-limb", "swap-mount", "author-action", "repair-mind"]);
  const state = {
    version: 3, protocolDigest: CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST, inspectedBody: true, sawFourLimbs: true,
    builtFrontLeft: true, builtFrontRight: true, builtRearLeft: true, builtRearRight: true,
    changedBody: true, sawLauncher: true, swappedToSword: true, hasLocomotion: true, hasAttack: true, changedControl: true,
    probedLocomotion: true, probedAttack: true, sawWeakMind: true, launchedWeakLab: true,
    sawDiagnostic: true, repairedMind: true, launchedLab: false,
    weakSavedId: "b/c/weak", weakLabSide: "left", diagnosedWeakId: "b/c/weak", repairedSavedId: "b/c/repaired",
  };
  assert.deepEqual(onboardingProgress(state), [true, true, true, false]);
  const markup = constructOnboardingMarkup(state, null);
  assert.match(markup, /autosaves locally and resumes/);
  assert.match(markup, /Choose this saved machine in visible Lab/);
  assert.match(markup, /eaf5d7ab/);
  assert.doesNotMatch(markup, /console|motor handle|direct motor/i);
});

test("the_guide_starts_from_a_real_powered_core_without_prebuilt_limb_branches", () => {
  const blueprint = starterCoreBlueprint();
  assert.equal(blueprint.parts.some(({ id }) => id.startsWith("limb-")), false);
  assert.equal(blueprint.joints.some(({ childPart }) => childPart.startsWith("limb-")), false);
  assert.equal(blueprint.modules.some(({ kind }) => kind === "power-core"), true);
  assert.equal(blueprint.modules.some(({ kind }) => kind === "launcher"), true);
  const saved = starterCoreConstruct();
  assert.deepEqual(saved.control.groups.map(({ id }) => id), ["dorsal-mount", "shield"]);
  assert.equal(saved.control.actions.some(({ controller }) => controller.startsWith("quadruped-")), false,
    "locomotion must be authored after the four physical limbs exist");
});

test("four_ordinary_connected_catalog_clicks_stay_on_the_core_and_complete_guided_body_step", () => {
  const memory = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  try {
    const starter = starterCoreConstruct();
    const guideHost = new FakeHost();
    const guide = new ConstructOnboarding(guideHost, { initialBlueprint: starter.blueprint,
      initialControl: starter.control, onSection() {}, onVisibleLab: () => true });
    const bodyHost = new FakeHost();
    const screen = new ForgeScreen(bodyHost, { blueprint: starter.blueprint, control: starter.control,
      program: starter.program, sensors: WARDEN_SENSORS,
      publisher: {
        capture: () => guide.checkpoint(),
        publish: ({ blueprint, control, program, command }) => {
          guide.observeBlueprint(blueprint);
          if (command) guide.observeBodyEdit(command);
          guide.observeControl(control); guide.observeProgram(program);
        },
        rollback: (checkpoint) => guide.restore(checkpoint),
      } });
    for (const catalog of ["warden-limb-front-left", "warden-limb-front-right",
      "warden-limb-rear-left", "warden-limb-rear-right"]) {
      bodyHost.click("attach-connected-part", { catalog });
    }
    assert.deepEqual(screen.blueprint.joints.filter(({ parentPart, childPart }) =>
      parentPart === screen.blueprint.rootPart && childPart.startsWith("limb-")).map(({ childPart }) => childPart).sort(), [
      "limb-front-left-upper", "limb-front-right-upper", "limb-rear-left-upper", "limb-rear-right-upper",
    ]);
    guideHost.click("inspected");
    assert.equal(guide.progress[0], true);
    screen.dispose(); guide.dispose();
  } finally { globalThis.localStorage = previous; }
});

test("the_two_corner_setup_panel_is_wide_on_desktop_and_stacks_without_horizontal_overflow_on_mobile", async () => {
  const css = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(css, /#curtain\s*>\s*\.panel\s*{[^}]*max-width:\s*860px;[^}]*width:\s*calc\(100vw - 40px\);/s);
  assert.match(css, /#matchup\s*>\s*\.corner\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*{[^}]*#matchup\s*{[^}]*grid-template-columns:\s*1fr;/s);
});

test("ordinary_unmount_then_sword_mount_reconciles_stale_Actions_and_Mind_and_saves", () => {
  const host = new FakeHost(); const saved = [];
  const screen = new ForgeScreen(host, { blueprint: wardenBlueprint(), control: wardenControl(),
    program: wardenProgram(), sensors: WARDEN_SENSORS, onSaved: (artifact) => saved.push(artifact) });
  host.click("select-socket", { socket: "socket-dorsal-output" });
  host.click("unmount-module", { module: "dorsal-crossbow" });
  host.click("mount-module", { catalog: "sword" });
  host.click("save");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].blueprint.modules.some(({ kind }) => kind === "sword"), true);
  assert.equal(saved[0].control.groups.some(({ modules }) => modules.includes("dorsal-crossbow")), false);
  assert.equal(saved[0].control.actions.some(({ id }) => id === "fire"), false);
  assert.equal(saved[0].program.rules.some(({ action }) => action === "fire"), false);
  screen.dispose();
});

test("a_connected_catalog_limb_adds_four_ordered_joints_and_its_declared_contact_socket_atomically", () => {
  const original = wardenBlueprint();
  const removed = reduceForge(original, { kind: "remove-subtree", part: "limb-front-left-upper" });
  assert.equal(removed.refusal, null);
  const fragment = instantiateConnectedPart(removed.blueprint, "warden-limb-front-left", "core");
  assert.equal(fragment.parts.length, 4);
  assert.equal(fragment.joints.length, 4);
  assert.deepEqual(fragment.joints.map(({ parentPart, childPart }) => [parentPart, childPart]), [
    ["core", "limb-front-left-upper"],
    ["limb-front-left-upper", "limb-front-left-lower"],
    ["limb-front-left-lower", "limb-front-left-ankle"],
    ["limb-front-left-ankle", "limb-front-left-foot"],
  ]);
  assert.deepEqual(fragment.sockets.map(({ part, accepts }) => [part, accepts]),
    [["limb-front-left-foot", ["contact-sensor"]]]);
  const restored = reduceForge(removed.blueprint, { kind: "attach-connected-fragment", ...fragment });
  assert.equal(restored.refusal, null);
  assert.equal(restored.blueprint.parts.length, original.parts.length);
  assert.equal(restored.blueprint.joints.length, original.joints.length);
});

test("connected_Warden_limbs_refuse_generic_parents_resized_roots_and_occupied_corners", () => {
  assert.throws(() => instantiateConnectedPart(wardenBlueprint(), "warden-limb-front-left",
    "limb-front-left-upper"), /exactly one starter-core attachment/);

  const resized = structuredClone(starterCoreBlueprint());
  resized.parts.find(({ id }) => id === resized.rootPart).shape.sizeM[0] += 0.2;
  assert.throws(() => instantiateConnectedPart(resized, "warden-limb-front-left", resized.rootPart),
    /exact unresized starter core schema/);

  const starter = starterCoreBlueprint();
  const fragment = instantiateConnectedPart(starter, "warden-limb-front-left", starter.rootPart);
  const attached = reduceForge(starter, { kind: "attach-connected-fragment", ...fragment });
  assert.equal(attached.refusal, null);
  const duplicate = reduceForge(attached.blueprint, { kind: "attach-connected-fragment", ...fragment });
  assert.strictEqual(duplicate.blueprint, attached.blueprint);
  assert.match(duplicate.refusal, /corner.*occupied/);
});

test("a_connected_fragment_preview_failure_leaves_history_and_the_last_valid_machine_unchanged", () => {
  const blueprint = reduceForge(wardenBlueprint(), { kind: "remove-subtree", part: "limb-front-left-upper" }).blueprint;
  const fragment = instantiateConnectedPart(blueprint, "warden-limb-front-left", "core");
  let previewParts = 0;
  const screen = new ForgeScreen(new FakeHost(), {
    blueprint, control: wardenControl(), program: wardenProgram(), sensors: WARDEN_SENSORS,
    preview(candidate) {
      previewParts = candidate.parts.length;
      if (candidate.parts.length > blueprint.parts.length) throw new Error("fragment preview refused for test");
      return { dispose() {} };
    },
  });
  const before = canonicalBlueprintJson(screen.blueprint);
  const result = screen.apply({ kind: "attach-connected-fragment", ...fragment });
  assert.match(result.refusal, /fragment preview refused/);
  assert.equal(previewParts, blueprint.parts.length + 4);
  assert.equal(canonicalBlueprintJson(screen.blueprint), before);
  screen.dispose();
});

test("the_browser_Forge_wires_the_resumable_guide_only_to_ordinary_saved_data_probe_diagnostics_and_visible_Lab", async () => {
  const [html, main, guide] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/forge/onboarding.ts", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="forge-onboarding-root"/);
  for (const marker of ["new ConstructOnboarding", "observeBlueprint", "observeControl", "observeProbe",
    "observeProgram", "observeSaved", "observeBodyEdit", "observeDiagnostic", "visibleLabStarted"]) assert.match(main, new RegExp(marker));
  assert.match(guide, /localStorage\.setItem\(CONSTRUCT_ONBOARDING_STORAGE_KEY/);
  assert.match(guide, /CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST/);
  assert.doesNotMatch(guide, /\.writeMotor|setAxisMotor|PhysicsConstraint|__sword|console\./);
  assert.doesNotMatch(guide, /human verdict.*complete/i);
});

test("weak_Mind_repair_progress_is_causal_and_cannot_be_completed_out_of_order", () => {
  const memory = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  try {
    const guide = new ConstructOnboarding(new FakeHost(), { initialBlueprint: starterCoreBlueprint(),
      initialControl: wardenControl(), onSection() {}, onVisibleLab: () => true });
    const normal = saveConstruct("normal", wardenBlueprint(), wardenControl(), wardenProgram(), WARDEN_SENSORS);
    const normalId = `${normal.digests.blueprint}/${normal.digests.control}/${normal.digests.program}`;
    guide.observeDiagnostic(normalId, "left", true);
    guide.visibleLabStarted(normalId, "left");
    guide.observeSaved(normal);
    guide.visibleLabStarted(normalId, "left");
    assert.equal(guide.progress[3], false, "a repair and Lab before a weak saved bout do not count");
    const weak = structuredClone(wardenProgram()); weak.rules[0].utility = { op: "constant", value: 0 };
    const weakSaved = saveConstruct("weak", wardenBlueprint(), wardenControl(), weak, WARDEN_SENSORS);
    const weakId = `${weakSaved.digests.blueprint}/${weakSaved.digests.control}/${weakSaved.digests.program}`;
    guide.observeSaved(weakSaved);
    guide.visibleLabStarted(weakId, "left");
    guide.observeDiagnostic(normalId, "left", true);
    guide.observeDiagnostic(weakId, "right", true);
    guide.observeSaved(normal);
    assert.equal(guide.progress[3], false, "an unrelated construct or wrong side cannot diagnose the weak revision");
    guide.observeDiagnostic(weakId, "left", true);
    guide.observeSaved(normal);
    assert.equal(guide.progress[3], false, "the repaired revision still has to run visibly");
    guide.visibleLabStarted(normalId, "right");
    assert.equal(guide.progress[3], false, "an unrelated side cannot stand in for the requested repaired run");
    guide.visibleLabStarted(normalId, "left");
    assert.equal(guide.progress[3], true);
    guide.dispose();
  } finally { globalThis.localStorage = previous; }
});
