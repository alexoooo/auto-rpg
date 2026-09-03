import assert from "node:assert/strict";
import test from "node:test";

import { humanoidBlueprint, humanoidControl } from "../src/construct/humanoid.ts";
import {
  deriveLocomotionAuthority,
  resolveSupportCarrier,
  resolveSupportCarrierSet,
  supportCarrierIsLive,
} from "../src/construct/assisted-locomotion.ts";
import { ActionScheduler, LocomotionWriter } from "../src/construct/scheduler.ts";
import { ConstructLocomotionPort } from "../src/construct/assisted-locomotion.ts";
import { ConstructControlEndpoint, CONSTRUCT_CONTROL_SURFACE } from "../src/construct/control.ts";
import { HumanoidControlEndpoint, HUMANOID_CONTROL_SURFACE } from "../src/humanoid-control.ts";
import { StagedSupportedLocomotionPort } from "../src/supported-locomotion.ts";
import { supportedLocomotionControllerDescriptor } from "../src/construct/controllers.ts";

const locomotion = () => humanoidControl().groups.find(({ id }) => id === "locomotion");
const mutableBlueprint = () => structuredClone(humanoidBlueprint());

test("support_bindings_derive_one_carrier_from_topology_not_part_names", () => {
  const blueprint = humanoidBlueprint();
  const resolved = resolveSupportCarrier(blueprint, locomotion());
  assert.equal(resolved.carrierPartId, "pelvis");
  assert.deepEqual(resolved.carrierToRootJointIds, ["waist"]);
  assert.deepEqual(resolved.supportBindings.map(({ role, terminalPartId }) => [role, terminalPartId]), [
    ["left-foot", "left-foot"], ["right-foot", "right-foot"],
  ]);
  assert.deepEqual(resolved.supportBindings.map(({ socketId }) => socketId),
    ["socket-left-foot", "socket-right-foot"]);

  const renamed = mutableBlueprint();
  const partName = (id) => `renamed-${id}`;
  renamed.rootPart = partName(renamed.rootPart);
  renamed.parts = renamed.parts.map((part) => ({ ...part, id: partName(part.id) }));
  renamed.joints = renamed.joints.map((joint) => ({ ...joint,
    parentPart: partName(joint.parentPart), childPart: partName(joint.childPart) }));
  renamed.sockets = renamed.sockets.map((socket) => ({ ...socket, part: partName(socket.part) }));
  const again = resolveSupportCarrier(renamed, locomotion());
  assert.equal(again.carrierPartId, "renamed-pelvis");
  assert.deepEqual(again.supportBindings.map(({ terminalPartId }) => terminalPartId),
    ["renamed-left-foot", "renamed-right-foot"]);
});

test("mixed_parents_discontinuous_chains_and_detached_contact_modules_are_refused", () => {
  const mixed = mutableBlueprint();
  mixed.joints.find(({ id }) => id === "right-hip").parentPart = "torso";
  assert.throws(() => resolveSupportCarrier(mixed, locomotion()), /mixed carrier parents "pelvis" and "torso"/);

  const discontinuous = structuredClone(locomotion());
  discontinuous.bindings["left-foot"].joints = ["left-hip", "left-ankle", "left-knee", "left-sole"];
  assert.throws(() => resolveSupportCarrier(humanoidBlueprint(), discontinuous),
    /support binding "left-foot" is discontinuous/);

  const detached = mutableBlueprint();
  detached.sockets.find(({ id }) => id === "socket-left-foot").part = "left-ankle";
  assert.throws(() => resolveSupportCarrier(detached, locomotion()),
    /contact module "contact-left-foot" is attached to "left-ankle" instead of terminal part "left-foot"/);
});

test("two_supported_groups_resolving_to_different_carriers_are_refused_by_name", () => {
  const blueprint = mutableBlueprint();
  blueprint.sockets.find(({ id }) => id === "socket-right-foot").part = "left-hand";
  const left = { id: "leg-support", joints: ["left-hip", "left-knee", "left-ankle", "left-sole"],
    modules: ["contact-left-foot"], bindings: { support: { joints: ["left-hip", "left-knee", "left-ankle", "left-sole"],
      modules: ["contact-left-foot"] } } };
  const hand = { id: "hand-support", joints: ["left-shoulder", "left-elbow", "left-wrist", "left-palm"],
    modules: ["contact-right-foot"], bindings: { support: {
      joints: ["left-shoulder", "left-elbow", "left-wrist", "left-palm"], modules: ["contact-right-foot"] } } };
  assert.throws(() => resolveSupportCarrierSet(blueprint, [left, hand]),
    /groups "leg-support" and "hand-support" resolve different carriers "pelvis" and "torso"/);
});

test("every_critical_carrier_root_and_support_joint_is_live_gated", () => {
  const blueprint = humanoidBlueprint();
  const support = resolveSupportCarrier(blueprint, locomotion());
  const livingJointIds = new Set(blueprint.joints.map(({ id }) => id));
  const installedModuleIds = new Set(blueprint.modules.map(({ id }) => id));
  const detached = new Set();
  const available = { livingJointIds, installedModuleIds, isPartAttached: (id) => !detached.has(id) };
  assert.equal(supportCarrierIsLive(support, available).live, true);
  for (const id of support.criticalJointIds) {
    livingJointIds.delete(id);
    assert.match(supportCarrierIsLive(support, available).reason, new RegExp(`joint "${id}"`));
    livingJointIds.add(id);
  }
  installedModuleIds.delete("contact-left-foot");
  assert.match(supportCarrierIsLive(support, available).reason, /module "contact-left-foot"/);
  installedModuleIds.add("contact-left-foot");
  detached.add("left-thigh");
  assert.match(supportCarrierIsLive(support, available).reason, /part "left-thigh"/);
});

test("a_detached_grounded_foot_cannot_authorize_locomotion", () => {
  const blueprint = humanoidBlueprint();
  const support = resolveSupportCarrier(blueprint, locomotion());
  const available = { livingJointIds: new Set(blueprint.joints.map(({ id }) => id)),
    installedModuleIds: new Set(blueprint.modules.map(({ id }) => id)),
    isPartAttached: (id) => id !== "left-foot" };
  assert.deepEqual(supportCarrierIsLive(support, available), {
    live: false, reason: 'critical locomotion part "left-foot" is detached',
  });
});

test("unrelated_hand_or_weapon_loss_does_not_cancel_walking", () => {
  const blueprint = humanoidBlueprint();
  const support = resolveSupportCarrier(blueprint, locomotion());
  const missing = new Set(["left-hand", "sword-arm-pitch"]);
  assert.equal(supportCarrierIsLive(support, {
    livingJointIds: new Set(blueprint.joints.map(({ id }) => id).filter((id) => id !== "sword-pitch")),
    installedModuleIds: new Set(blueprint.modules.map(({ id }) => id).filter((id) => id !== "effigy-sword")),
    isPartAttached: (id) => !missing.has(id),
  }).live, true);
});

test("a_controller_cannot_name_a_carrier_or_support_outside_its_group", () => {
  const graph = humanoidControl();
  const group = { ...locomotion(), bindings: { ...locomotion().bindings,
    "balance-chain": { joints: ["waist", "neck-bearing", "head-bearing"], modules: [] } } };
  const action = graph.actions.find(({ id }) => id === "brace");
  const authority = deriveLocomotionAuthority(humanoidBlueprint(), group, action, {
    controller: action.controller, gaitStabilityScale: 1, brace: true,
  });
  assert.equal(authority.carrierPartId, "pelvis");
  assert.equal(authority.braceCapacityMultiplier, 1.5);
  const submissions = [];
  const writer = new LocomotionWriter(action, group, authority, (row) => submissions.push(row));
  writer.request({ localForward: 0.4, localRight: 0.2, yaw: -0.1, recover: false,
    carrierPartId: "left-hand", supportBindings: ["weapon"] });
  assert.equal(submissions[0].authority.carrierPartId, "pelvis");
  assert.deepEqual(submissions[0].request,
    { localForward: 0.4, localRight: 0.2, yaw: -0.1, recover: false });
  assert.throws(() => writer.request({ localForward: 1, localRight: 1, yaw: 0, recover: false }), /normalized/);
});

test("the_planted_combat_move_declares_its_extra_stability_capacity_through_the_descriptor", () => {
  const graph = humanoidControl();
  const action = graph.actions.find(({ id }) => id === "advance");
  const descriptor = supportedLocomotionControllerDescriptor(action.controller);
  assert.ok(descriptor);
  const authority = deriveLocomotionAuthority(humanoidBlueprint(), locomotion(), action, descriptor);
  assert.equal(authority.braceCapacityMultiplier, 2,
    "combat-move must not silently inherit the weaker stationary brace");
  assert.throws(() => deriveLocomotionAuthority(humanoidBlueprint(), locomotion(), action,
    { ...descriptor, brace: false, braceCapacityMultiplier: 2 }), /brace capacity/);
});

test("one_carrier_accepts_at_most_one_balance_claim_even_across_full_and_limp_groups", () => {
  const groups = ["full-gait", "left-limp"].map((id) => ({ id, joints: [], modules: [], bindings: {} }));
  const actions = groups.map((group, index) => ({ id: index === 0 ? "move-full" : "move-limp",
    controller: index === 0 ? "full" : "limp", group: group.id,
    claims: ["resource:balance"], parameters: {} }));
  const graph = { version: 1, groups, actions };
  const submissions = [];
  const factory = (name) => ({ name, create: (context) => ({ enter() {},
    step() { context.locomotion.request({ localForward: 0.2, localRight: 0, yaw: 0, recover: false }); },
    done: () => false, cancel() {}, diagnostic: () => ({ phase: "move", detail: "", progress: 0, epsilon: 0 }),
  }) });
  const port = { authority: () => ({ carrierPartId: "shared-carrier" }),
    stage: (row) => submissions.push(row), priorSample: () => ({ request: null }),
    clearSubmission() {}, clearAll() {} };
  const events = new ActionScheduler(graph, [factory("full"), factory("limp")], { write() {} }, port).step({
    version: 1, requests: actions.map((action, sourceIndex) => ({ request: { action: action.id, parameters: {} },
      priority: 2 - sourceIndex, sourceIndex })),
  }, { joints: {}, facts: {} }, 1 / 240);
  assert.deepEqual(submissions.map(({ action }) => action), ["move-full"]);
  assert.match(events.find(({ action }) => action === "move-limp").reason,
    /"full-gait\/move-full".*"left-limp\/move-limp"/);
});

test("withdrawal_conflict_failure_capability_loss_handover_verdict_and_dispose_each_clear_drive", () => {
  const group = { id: "gait", joints: [], modules: [], bindings: {} };
  const action = (id, controller = id) => ({ id, controller, group: group.id,
    claims: ["resource:balance"], parameters: {} });
  const command = (id, priority = 0) => ({ version: 1, requests: [{
    request: { action: id, parameters: {} }, priority, sourceIndex: 0,
  }] });
  const build = (actions, fails = null) => {
    const clears = [];
    const factories = actions.map(({ controller }) => ({ name: controller, create: (context) => ({
      enter() {}, step() {
        context.locomotion.request({ localForward: 0.3, localRight: 0, yaw: 0, recover: false });
        if (fails === context.action.id) throw new Error("controller exploded");
      },
      done: () => false, cancel() {}, diagnostic: () => ({ phase: "moving", detail: "", progress: 0, epsilon: 0 }),
    }) }));
    const port = { authority: () => ({ carrierPartId: "carrier" }), stage() {},
      priorSample: () => ({ request: null }),
      clearSubmission: (_action, _group, _authority, reason) => clears.push(reason),
      clearAll: (reason) => clears.push(reason) };
    return { scheduler: new ActionScheduler({ version: 1, groups: [group], actions }, factories,
      { write() {} }, port), clears };
  };

  const withdrawal = build([action("walk")]);
  withdrawal.scheduler.step(command("walk"), { joints: {}, facts: {} }, 1 / 240);
  withdrawal.scheduler.step({ version: 1, requests: [] }, { joints: {}, facts: {} }, 1 / 240);
  assert.ok(withdrawal.clears.includes("request withdrawn or conflicted"));

  const capability = build([action("walk")]);
  capability.scheduler.step(command("walk"), { joints: {}, facts: {} }, 1 / 240);
  capability.scheduler.step(command("walk"), { joints: {}, facts: {} }, 1 / 240,
    [{ action: "walk", available: false, reason: "leg chain lost" }]);
  assert.ok(capability.clears.includes("leg chain lost"));

  const failure = build([action("walk")], "walk");
  failure.scheduler.step(command("walk"), { joints: {}, facts: {} }, 1 / 240);
  assert.ok(failure.clears.includes("controller exploded"));

  const conflictActions = [action("low"), action("high")];
  const conflict = build(conflictActions);
  conflict.scheduler.step(command("low"), { joints: {}, facts: {} }, 1 / 240);
  conflict.scheduler.step({ version: 1, requests: [
    { request: { action: "high", parameters: {} }, priority: 2, sourceIndex: 0 },
    { request: { action: "low", parameters: {} }, priority: 1, sourceIndex: 1 },
  ] }, { joints: {}, facts: {} }, 1 / 240);
  assert.ok(conflict.clears.includes("request withdrawn or conflicted"));

  for (const reason of ["control handover", "verdict", "dispose"]) {
    const terminal = build([action("walk")]);
    terminal.scheduler.step(command("walk"), { joints: {}, facts: {} }, 1 / 240);
    terminal.scheduler.stop(reason);
    assert.ok(terminal.clears.includes(reason), reason);
  }
});

test("actual_control_endpoints_clear_staged_drive_on_handover_verdict_and_dispose", () => {
  const constructEndpoint = () => {
    const locomotion = new ConstructLocomotionPort();
    const graph = { version: 1, groups: [{ id: "whole", joints: [], modules: [], bindings: {} }],
      actions: [{ id: "hold", controller: "hold-joints", group: "whole", claims: [], parameters: {} }] };
    const endpoint = new ConstructControlEndpoint({}, graph, [], { "construct-hold": null },
      "construct-hold", { locomotion });
    return { endpoint, locomotion };
  };
  for (const terminal of ["handover", "verdict", "dispose"]) {
    const { endpoint, locomotion } = constructEndpoint();
    locomotion.beginControlStep();
    locomotion.request({ localForward: 0.2, localRight: 0, yaw: 0, recover: false });
    if (terminal === "handover") endpoint.install({ surface: CONSTRUCT_CONTROL_SURFACE, name: "replacement",
      step() {}, stop() {} });
    else if (terminal === "verdict") endpoint.stopFighting();
    else endpoint.dispose();
    assert.equal(locomotion.snapshot().staged, null, `construct ${terminal}`);
    assert.match(locomotion.snapshot().lastClearReason, new RegExp(terminal === "handover" ? "control handover" : terminal));
  }

  const intent = { forward: 0, strafe: 0, turn: 0, actingHand: null, posture: {}, hands: {} };
  const humanoidEndpoint = () => {
    const locomotion = new StagedSupportedLocomotionPort();
    const endpoint = new HumanoidControlEndpoint({ initialMind: { name: "idle", decide: () => intent },
      view: {}, canStep: () => true, apply() {}, stopBody() {}, policies: [{ name: "idle", label: "Idle" }],
      policyFactory: () => ({ name: "idle", decide: () => intent }),
      clearLocomotion: (reason) => locomotion.clear(reason) });
    return { endpoint, locomotion };
  };
  for (const terminal of ["handover", "verdict", "dispose"]) {
    const { endpoint, locomotion } = humanoidEndpoint();
    locomotion.beginControlStep();
    locomotion.request({ localForward: 0.2, localRight: 0, yaw: 0, recover: false });
    if (terminal === "handover") endpoint.install({ surface: HUMANOID_CONTROL_SURFACE, name: "replacement",
      step() {}, stop() {} });
    else if (terminal === "verdict") endpoint.stopFighting();
    else endpoint.dispose();
    assert.equal(locomotion.snapshot().staged, null, `Fighter ${terminal}`);
  }
});

test("the_winning_request_survives_old_action_clear_and_controllers_read_only_prior_achievement", () => {
  const group = { id: "gait", joints: [], modules: [], bindings: {} };
  const actions = [
    { id: "low", controller: "low", group: "gait", claims: ["resource:balance"], parameters: {} },
    { id: "high", controller: "high", group: "gait", claims: ["resource:balance"], parameters: {} },
  ];
  const prior = [];
  const factories = actions.map((action) => ({ name: action.controller, create: (context) => {
    assert.equal("resetBoundary" in context.locomotion, false, "a controller cannot reset its request cap");
    return { enter() {}, step() {
      prior.push([action.id, context.locomotion.sample().request?.localForward ?? null]);
      context.locomotion.request({ localForward: action.id === "high" ? 0.8 : 0.2,
        localRight: 0, yaw: 0, recover: false });
    }, done: () => false, cancel() {},
    diagnostic: () => ({ phase: "move", detail: "", progress: 0, epsilon: 0 }) };
  } }));
  const locomotion = new ConstructLocomotionPort(() => ({ carrierPartId: "carrier" }));
  const scheduler = new ActionScheduler({ version: 1, groups: [group], actions }, factories,
    { write() {} }, locomotion);
  locomotion.beginControlStep();
  scheduler.step({ version: 1, requests: [{ request: { action: "low", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints: {}, facts: {} }, 1 / 240);
  locomotion.commit({ allowed: locomotion.sample().request, dt: 1 / 240 });

  locomotion.beginControlStep();
  scheduler.step({ version: 1, requests: [
    { request: { action: "high", parameters: {} }, priority: 2, sourceIndex: 0 },
    { request: { action: "low", parameters: {} }, priority: 1, sourceIndex: 1 },
  ] }, { joints: {}, facts: {} }, 1 / 240);
  assert.equal(locomotion.sample().request.localForward, 0.8,
    "cancelling the old low action did not erase the newly staged winner");
  assert.deepEqual(prior, [["low", null], ["high", 0.2]],
    "the high controller saw the prior committed result, never its same-boundary request");
});

test("a_controller_that_stages_in_enter_then_throws_is_cleared", () => {
  const group = { id: "gait", joints: [], modules: [], bindings: {} };
  const action = { id: "move", controller: "exploding-enter", group: "gait",
    claims: ["resource:balance"], parameters: {} };
  const locomotion = new ConstructLocomotionPort(() => ({ carrierPartId: "carrier" }));
  const scheduler = new ActionScheduler({ version: 1, groups: [group], actions: [action] }, [{
    name: action.controller, create: (context) => ({ enter() {
      context.locomotion.request({ localForward: 0.5, localRight: 0, yaw: 0, recover: false });
      throw new Error("enter exploded");
    }, step() {}, done: () => false, cancel() {},
    diagnostic: () => ({ phase: "enter", detail: "", progress: 0, epsilon: 0 }) }),
  }], { write() {} }, locomotion);
  locomotion.beginControlStep();
  const events = scheduler.step({ version: 1, requests: [{ request: { action: "move", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints: {}, facts: {} }, 1 / 240);
  assert.equal(locomotion.snapshot().staged, null);
  assert.match(locomotion.snapshot().lastClearReason, /enter exploded/);
  assert.equal(events.at(-1).kind, "refused");
});

test("throwing_done_and_cancel_hooks_cannot_strand_staged_drive", () => {
  const group = { id: "gait", joints: [], modules: [], bindings: {} };
  const action = { id: "move", controller: "hostile-terminal", group: "gait",
    claims: ["resource:balance"], parameters: {} };
  let throwDone = true;
  const locomotion = new ConstructLocomotionPort(() => ({ carrierPartId: "carrier" }));
  const scheduler = new ActionScheduler({ version: 1, groups: [group], actions: [action] }, [{
    name: action.controller, create: (context) => ({ enter() {}, step() {
      context.locomotion.request({ localForward: 0.4, localRight: 0, yaw: 0, recover: false });
    }, done() { if (throwDone) throw new Error("done exploded"); return false; },
    cancel() { throw new Error("cancel exploded"); },
    diagnostic: () => ({ phase: "move", detail: "", progress: 0, epsilon: 0 }) }),
  }], { write() {} }, locomotion);
  const command = { version: 1, requests: [{ request: { action: "move", parameters: {} },
    priority: 0, sourceIndex: 0 }] };
  locomotion.beginControlStep();
  const failed = scheduler.step(command, { joints: {}, facts: {} }, 1 / 240);
  assert.equal(failed.at(-1).kind, "failed");
  assert.equal(locomotion.snapshot().staged, null, "done and then cancel throws still clear the port");

  throwDone = false;
  locomotion.beginControlStep();
  scheduler.step(command, { joints: {}, facts: {} }, 1 / 240);
  scheduler.stop("verdict");
  assert.equal(locomotion.snapshot().staged, null, "a throwing terminal cancel cannot block verdict clear");
});
