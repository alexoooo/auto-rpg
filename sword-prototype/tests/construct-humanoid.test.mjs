import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { CONSTRUCT_BLUEPRINT_LIMITS } from "../src/construct/blueprint.ts";
import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { humanoidBlueprint, humanoidControl, humanoidProgram, humanoidSavedConstruct,
  humanoidProfileMetrics, humanoidSwordBindMetrics, HUMANOID_FATAL_HEALTH,
  HUMANOID_SCALE, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { ConstructLocomotionPort, deriveLocomotionAuthority } from
  "../src/construct/assisted-locomotion.ts";
import { supportedLocomotionControllerDescriptor } from "../src/construct/controllers.ts";
import { resolveConstructBindTransforms } from "../src/construct/compile.ts";
import { wardenBlueprint } from "../src/construct/warden.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { unitDefinition } from "../src/units.ts";
import { HUMANOID_CONSTRUCT_PROFILE } from "../src/construct/construct.ts";

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

test("the_Swordbearer_Effigy_is_a_distinct_connected_humanoid_primitive_blueprint", () => {
  const blueprint = humanoidBlueprint();
  assert.equal(blueprint.id, "swordbearer-effigy");
  assert.notEqual(canonicalBlueprintJson(blueprint), canonicalBlueprintJson(wardenBlueprint("sword")));
  for (const id of ["torso", "pelvis", "neck", "head", "left-upper-arm", "left-hand",
    "right-thigh", "right-foot", "sword-shoulder-yaw", "sword-arm-pitch"]) {
    assert.ok(blueprint.parts.some((part) => part.id === id), `missing humanoid landmark ${id}`);
  }
  assert.equal(blueprint.parts.every(({ shape }) => ["box", "capsule", "cylinder", "sphere"].includes(shape.kind)), true);
  assert.equal(blueprint.modules.some(({ id, kind }) => id === "effigy-sword" && kind === "sword"), true);
  const fatalParts = blueprint.parts.filter(({ fatal }) => fatal);
  assert.deepEqual(fatalParts.map(({ id, health, armour }) => ({ id, health, armour })),
    [{ id: "torso", health: HUMANOID_FATAL_HEALTH, armour: 38 }],
    "the measured curriculum durability belongs only to the declared fatal torso");
  assert.equal(HUMANOID_FATAL_HEALTH, 30);
  const sockets = new Map(blueprint.sockets.map((socket) => [socket.id, socket]));
  const contacts = blueprint.modules.filter(({ kind }) => kind === "contact-sensor");
  assert.deepEqual(contacts.map(({ id }) => id).sort(), ["contact-left-foot", "contact-right-foot"]);
  assert.deepEqual(Object.fromEntries(contacts.map((module) => [module.id,
    sockets.get(module.socket)?.part])), {
    "contact-left-foot": "left-foot",
    "contact-right-foot": "right-foot",
  }, "each and only contact sensor is physically socketed to its correspondingly named foot");

  const reached = new Set([blueprint.rootPart]);
  while (true) {
    const before = reached.size;
    for (const joint of blueprint.joints) if (reached.has(joint.parentPart)) reached.add(joint.childPart);
    if (reached.size === before) break;
  }
  assert.equal(reached.size, blueprint.parts.length, "every head, limb and sword-arm part is physically connected");
  assert.equal(blueprint.joints.length, blueprint.parts.length - 1, "the physical skeleton is one tree");
  assert.ok(maximumExposedJointSeam(blueprint) <= 0.02,
    "no connected limb is separated from its neighbour by a visible collider-scale gap");
  const broken = structuredClone(blueprint);
  broken.joints.find(({ id }) => id === "left-shoulder").parentFrame.positionM[0] -= 0.30;
  assert.ok(maximumExposedJointSeam(broken) > 0.10,
    "the seam gate rejects the old floating-limb failure shape");
});

test("one_similarity_scale_owns_the_human_sized_stone_chassis_but_not_its_ordinary_sword", () => {
  assert.equal(HUMANOID_SCALE, 0.75);
  const blueprint = humanoidBlueprint();
  const part = (id) => blueprint.parts.find((candidate) => candidate.id === id);
  assert.deepEqual(part("torso").shape.sizeM, [0.72 * HUMANOID_SCALE, 0.78 * HUMANOID_SCALE,
    0.34 * HUMANOID_SCALE]);
  assert.equal(part("pelvis").massKg, 180 * HUMANOID_SCALE ** 3);
  assert.equal(part("left-foot").massKg, 80 * HUMANOID_SCALE ** 3);
  const waist = blueprint.joints.find(({ id }) => id === "waist").angularAxes[0];
  assert.equal(waist.maxTorqueNm, 1200 * HUMANOID_SCALE ** 4);
  assert.equal(waist.damping, 18 * HUMANOID_SCALE ** 4);
  assert.deepEqual(blueprint.joints.find(({ id }) => id === "sword-yaw").parentFrame.positionM,
    [0.42 * HUMANOID_SCALE, 0.25 * HUMANOID_SCALE, 0]);
  assert.deepEqual(blueprint.sockets.find(({ id }) => id === "socket-sword-hand").frame.positionM,
    [0, -0.29 * HUMANOID_SCALE, 0]);
  const sword = blueprint.modules.find(({ id }) => id === "effigy-sword");
  assert.equal(sword.massKg, 1.4,
    "the full-sized weapon keeps ordinary longsword mass rather than stone-chassis density");
  assert.deepEqual(sword.geometry.find(({ id }) => id === "blade").shape.sizeM, [0.10, 0.05, 1.05]);
  assert.deepEqual(sword.striker.localTipM, [0, 0, 1.105]);
  const mount = humanoidSwordBindMetrics();
  assert.deepEqual(mount.yawPivotRootM, [0.315, 0.1875, 0]);
  assert.deepEqual(mount.pitchPivotRootM, [0.315, 0.3225, 0]);
  assert.ok(Math.abs(mount.pitchToSocketM - 0.435) < 1e-12);
  assert.equal(mount.socketToTipM, 1.105);
});

test("the_humanoid_sensor_surface_is_the_exact_24_raw_facts_without_a_high_target_conclusion", () => {
  const expected = ["core-upright", "core-roll-rad", "core-pitch-rad", "opponent-range",
    "opponent-relative-speed", "opponent-local-x", "opponent-local-vx", "opponent-local-y",
    "opponent-local-vy", "opponent-local-z", "opponent-local-vz", "opponent-blocker-present",
    "opponent-blocker-local-x", "opponent-blocker-local-y", "opponent-blocker-local-z",
    "opponent-weapon-present", "opponent-weapon-local-x", "opponent-weapon-local-y",
    "opponent-weapon-local-z", "line-of-sight", "contact-left-foot", "slip-left-foot",
    "contact-right-foot", "slip-right-foot"];
  assert.deepEqual(HUMANOID_SENSORS.map(({ id }) => id), expected);
  assert.equal(CONSTRUCT_BLUEPRINT_LIMITS.maxModuleSensorChannels, 24);
  const sight = humanoidBlueprint().modules.find(({ id }) => id === "effigy-sight");
  assert.deepEqual(sight.sensorChannels, expected.slice(0, 20),
    "target choice remains Mind/controller inference rather than installed high-target hardware");
});

test("the_humanoid_saved_character_exposes_only_physically_supported_leg_and_sword_actions", () => {
  const control = humanoidControl();
  const controllers = new Map(control.actions.map(({ id, controller }) => [id, controller]));
  assert.deepEqual(Object.fromEntries([...controllers].filter(([id]) =>
    ["move", "limp-left", "limp-right", "turn", "recover", "aim", "sweep", "guard"].includes(id))), {
    move: "supported-biped-move", turn: "supported-biped-turn",
    "limp-left": "supported-biped-limp-left", "limp-right": "supported-biped-limp-right",
    recover: "supported-biped-recover", aim: "aim-direction",
    sweep: "swordbearer-target-sweep", guard: "guard-mount",
  });
  const locomotion = control.groups.find(({ id }) => id === "locomotion");
  assert.deepEqual(Object.keys(locomotion.bindings), ["left-foot", "right-foot", "balance-chain"]);
  for (const binding of [locomotion.bindings["left-foot"], locomotion.bindings["right-foot"]]) {
    assert.equal(binding.joints.length, 4); assert.equal(binding.modules.length, 1);
  }
  assert.deepEqual(locomotion.bindings["balance-chain"], {
    joints: ["waist", "neck-bearing", "head-bearing"], modules: [] });
  const sword = control.groups.find(({ id }) => id === "sword-arm");
  assert.deepEqual(sword.bindings.yaw.joints, ["sword-yaw"]);
  assert.deepEqual(sword.bindings.pitch.joints, ["sword-pitch"]);
  assert.deepEqual(sword.bindings.sword.modules, ["effigy-sword"]);
  assert.deepEqual([...new Set(humanoidProgram().rules.map(({ action }) => action))].sort(),
    ["brace", "guard", "limp-left", "limp-right", "move", "recover", "stabilize", "sweep", "turn"]);
  assert.equal(humanoidProgram().id, "swordbearer-warrior-duelist");

  const saved = humanoidSavedConstruct();
  assert.equal(saved.name, "Swordbearer Effigy");
  assert.equal(saved.blueprint.id, "swordbearer-effigy");
  assert.equal(Object.values(saved.digests).every((digest) => /^[0-9a-f]{8}$/.test(digest)), true);
  const profile = unitDefinition("swordbearer-effigy");
  assert.equal(profile.label, "Swordbearer Effigy (Experimental)");
  assert.equal(profile.defaultPolicy, "humanoid-authored");
  assert.equal(profile.controlSurface, "construct-humanoid-v1");
  assert.deepEqual({ reach: profile.reach, crownHeight: profile.crownHeight,
    vitalHeight: profile.vitalHeight, collisionRadius: profile.collisionRadius }, {
    reach: HUMANOID_CONSTRUCT_PROFILE.reach,
    crownHeight: HUMANOID_CONSTRUCT_PROFILE.crownHeight,
    vitalHeight: HUMANOID_CONSTRUCT_PROFILE.vitalHeight,
    collisionRadius: HUMANOID_CONSTRUCT_PROFILE.collisionRadius,
  }, "setup and the live Construct publish one physical profile");
});

test("biped_support_actions_cross_private_authority_and_command_only_declared_leg_axes", () => {
  const control = humanoidControl(); const group = control.groups.find(({ id }) => id === "locomotion");
  const blueprint = humanoidBlueprint();
  const locomotionPort = () => new ConstructLocomotionPort((action, selectedGroup) => {
    const descriptor = supportedLocomotionControllerDescriptor(action.controller);
    return descriptor ? deriveLocomotionAuthority(blueprint, selectedGroup, action, descriptor) : null;
  });
  const joints = Object.fromEntries(group.joints.flatMap((id) => [
    [`${id}:x`, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5, maxSpeedRadS: 4, maxForceNm: 240 }],
    ...(id.endsWith("hip") ? [[`${id}:y`, { angleRad: 0, speedRadS: 0, minRad: -0.45,
      maxRad: 0.45, maxSpeedRadS: 4, maxForceNm: 220 }]] : []),
  ]));
  const supported = { "contact:contact-left-foot": true, "contact:contact-right-foot": true,
    "core-upright": true, "core-roll-rad": 0, "core-pitch-rad": 0 };
  const writes = [];
  const port = locomotionPort(); port.beginControlStep();
  const scheduler = new ActionScheduler(control, CONSTRUCT_CONTROLLERS,
    { write: (target) => writes.push(target) }, port);
  scheduler.step({ version: 1, requests: [{ request: { action: "brace",
    parameters: {} }, priority: 0, sourceIndex: 0 }] },
  { joints, facts: supported }, 1 / 240);
  assert.equal(writes.length, 10, "four sagittal joints plus one hip-yaw target per physical leg");
  assert.equal(writes.every(({ joint }) => /^(left|right)-(hip|knee|ankle|sole):(x|y)$/.test(joint)), true);
  assert.deepEqual(port.snapshot().staged, {
    localForward: 0, localRight: 0, yaw: 0, recover: false });

  const unsupportedPort = locomotionPort(); unsupportedPort.beginControlStep();
  const unsupported = new ActionScheduler(control, CONSTRUCT_CONTROLLERS,
    { write() {} }, unsupportedPort);
  const events = unsupported.step({ version: 1, requests: [{ request: { action: "brace", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints, facts: { ...supported,
      "contact:contact-left-foot": false, "contact:contact-right-foot": false } }, 1 / 240);
  assert.equal(events.some(({ kind, reason }) => kind === "refused" && /at least one measured foot contact/.test(reason)), true);
});

test("supported_biped_turn_replants_from_one_physical_foot_while_retaining_yaw_authority", () => {
  const control = humanoidControl();
  const group = control.groups.find(({ id }) => id === "locomotion");
  const blueprint = humanoidBlueprint();
  const port = new ConstructLocomotionPort((action, selectedGroup) => {
    const descriptor = supportedLocomotionControllerDescriptor(action.controller);
    return descriptor ? deriveLocomotionAuthority(blueprint, selectedGroup, action, descriptor) : null;
  });
  const joints = Object.fromEntries(group.joints.flatMap((id) => [
    [`${id}:x`, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5,
      maxSpeedRadS: 4, maxForceNm: 240 }],
    ...(id.endsWith("hip") ? [[`${id}:y`, { angleRad: 0, speedRadS: 0, minRad: -0.45,
      maxRad: 0.45, maxSpeedRadS: 4, maxForceNm: 220 }]] : []),
  ]));
  const writes = [];
  port.beginControlStep();
  const scheduler = new ActionScheduler(control, CONSTRUCT_CONTROLLERS,
    { write: (target) => writes.push(target) }, port);
  scheduler.step({ version: 1, requests: [{ request: { action: "turn", parameters: { yaw: 1 } },
    priority: 0, sourceIndex: 0 }] }, { joints, facts: {
      "contact:contact-left-foot": false, "contact:contact-right-foot": true,
      "core-upright": true, "core-roll-rad": 0, "core-pitch-rad": 0,
    } }, 1 / 240);
  assert.deepEqual(port.snapshot().staged, {
    localForward: 0, localRight: 0, yaw: 1, recover: false,
  }, "the support-preserving leg pose must not reduce carrier turn authority");
  assert.deepEqual(Object.fromEntries(writes.map(({ joint, angleRad }) => [joint, angleRad])), {
    "left-hip:x": 0, "left-knee:x": 0, "left-ankle:x": 0, "left-sole:x": 0,
    "left-hip:y": 0,
    "right-hip:x": 0, "right-knee:x": 0, "right-ankle:x": 0, "right-sole:x": 0,
    "right-hip:y": 0,
  });
});

test("supported_biped_limp_shuffles_on_its_surviving_plant_and_stops_when_that_contact_is_absent", () => {
  const control = humanoidControl();
  const group = control.groups.find(({ id }) => id === "locomotion");
  const blueprint = humanoidBlueprint();
  const port = new ConstructLocomotionPort((action, selectedGroup) => {
    const descriptor = supportedLocomotionControllerDescriptor(action.controller);
    return descriptor ? deriveLocomotionAuthority(blueprint, selectedGroup, action, descriptor) : null;
  });
  const joints = Object.fromEntries(group.joints.flatMap((id) => [
    [`${id}:x`, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5,
      maxSpeedRadS: 4, maxForceNm: 240 }],
    ...(id.endsWith("hip") ? [[`${id}:y`, { angleRad: 0, speedRadS: 0, minRad: -0.45,
      maxRad: 0.45, maxSpeedRadS: 4, maxForceNm: 220 }]] : []),
  ]));
  const writes = [];
  const scheduler = new ActionScheduler(control, CONSTRUCT_CONTROLLERS,
    { write: (target) => writes.push(target) }, port);
  const command = { version: 1, requests: [{ request: { action: "limp-right",
    parameters: { forward: 1, right: 0, yaw: 1, speed: 0.64 } }, priority: 0, sourceIndex: 0 }] };
  const facts = { "contact:contact-left-foot": false, "contact:contact-right-foot": true,
    "core-upright": true, "core-roll-rad": 0, "core-pitch-rad": 0 };
  port.beginControlStep();
  scheduler.step(command, { joints, facts }, 1 / 240);
  assert.deepEqual(port.snapshot().staged, {
    localForward: 0.64 / 1.6, localRight: 0, yaw: 0.45, recover: false,
  }, "the planted shuffle retains the frozen one-support authority fractions");
  assert.deepEqual(Object.fromEntries(writes.map(({ joint, angleRad }) => [joint, angleRad])), {
    "right-hip:x": 0, "right-knee:x": -0.20, "right-ankle:x": 0.10,
    "right-sole:x": 0.08, "right-hip:y": 0,
  }, "the sole surviving leg retains the non-lifting planted brace");

  port.beginControlStep(); writes.length = 0;
  scheduler.step(command, { joints, facts: { ...facts, "contact:contact-right-foot": false } }, 1 / 240);
  assert.deepEqual(port.snapshot().staged, {
    localForward: 0, localRight: 0, yaw: 0, recover: false,
  }, "one-support grace cannot authorize carrier motion without a fresh surviving contact");
  assert.deepEqual(Object.fromEntries(writes.map(({ joint, angleRad }) => [joint, angleRad])), {
    "right-hip:x": 0, "right-knee:x": -0.20, "right-ankle:x": 0.10,
    "right-sole:x": 0.08, "right-hip:y": 0,
  });
});

const supportedRecoveryWrites = (pitchRad) => {
  const control = humanoidControl();
  const group = control.groups.find(({ id }) => id === "locomotion");
  const blueprint = humanoidBlueprint();
  const port = new ConstructLocomotionPort((action, selectedGroup) => {
    const descriptor = supportedLocomotionControllerDescriptor(action.controller);
    return descriptor ? deriveLocomotionAuthority(blueprint, selectedGroup, action, descriptor) : null;
  });
  const joints = Object.fromEntries(group.joints.flatMap((id) => [
    [`${id}:x`, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5,
      maxSpeedRadS: 4, maxForceNm: 240 }],
    ...(id.endsWith("hip") ? [[`${id}:y`, { angleRad: 0, speedRadS: 0, minRad: -0.45,
      maxRad: 0.45, maxSpeedRadS: 4, maxForceNm: 220 }]] : []),
  ]));
  const writes = [];
  port.beginControlStep();
  const scheduler = new ActionScheduler(control, CONSTRUCT_CONTROLLERS,
    { write: (target) => writes.push(target) }, port);
  scheduler.step({ version: 1, requests: [{ request: { action: "recover", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints, facts: {
      "contact:contact-left-foot": false, "contact:contact-right-foot": false,
      "core-upright": false, "core-roll-rad": 0, "core-pitch-rad": pitchRad,
    } }, 1 / 240);
  assert.deepEqual(port.snapshot().staged, {
    localForward: 0, localRight: 0, yaw: 0, recover: true,
  });
  return Object.fromEntries(writes.map(({ joint, angleRad }) => [joint, angleRad]));
};

test("supported_biped_recovery_plants_when_fallen_and_braces_only_inside_the_upright_band", () => {
  assert.deepEqual(supportedRecoveryWrites(0), {
    "left-hip:x": 0, "left-knee:x": -0.20, "left-ankle:x": 0.10, "left-sole:x": 0.08,
    "left-hip:y": 0,
    "right-hip:x": 0, "right-knee:x": -0.20, "right-ankle:x": 0.10, "right-sole:x": 0.08,
    "right-hip:y": 0,
  }, "assisted recovery must not add the legacy scale-sensitive 0.48-rad rocking gait");
  assert.equal(supportedRecoveryWrites(0.30)["left-knee:x"], -0.20,
    "the measured 0.30 rad upright boundary retains the combat brace");
  assert.equal(supportedRecoveryWrites(0.301)["left-knee:x"], 0,
    "outside the measured upright boundary a fallen body uses the neutral plant");
});

test("the_humanoid_saved_character_physically_compiles_and_steps_in_the_shared_Construct_bout", async () => {
  const arena = await createConstructHeadlessArena();
  const saved = humanoidSavedConstruct();
  const bout = new ConstructLabBout(arena.scene, saved, saved, HUMANOID_SENSORS, CONFIG.fighter.separation);
  try {
    const bind = bout.construct("left").runtime;
    assert.ok(bind.part("head").node.position.y > bind.part("torso").node.position.y);
    assert.ok(bind.part("pelvis").node.position.y < bind.part("torso").node.position.y);
    assert.ok(bind.part("left-hand").node.position.x < bind.part("torso").node.position.x);
    assert.ok(bind.part("sword-arm-pitch").node.position.x > bind.part("torso").node.position.x);
    assert.ok(bind.part("left-foot").node.position.y < bind.part("pelvis").node.position.y);
    const headRadius = saved.blueprint.parts.find(({ id }) => id === "head").shape.radiusM;
    const bindCrownHeight = bind.part("head").node.position.y + headRadius;
    const bindVitalHeight = bind.part("torso").node.position.y;
    for (let step = 0; step < 180; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const left = bout.construct("left");
    assert.equal(left.kind, "swordbearer-effigy");
    assert.equal(left.constructProfile.label, "Swordbearer Effigy");
    assert.equal(left.runtime.parts.size, saved.blueprint.parts.length);
    assert.equal(left.runtime.joints.size, saved.blueprint.joints.length);
    assert.equal(left.runtime.modules.has("effigy-sword"), true);
    assert.equal(left.strikers.length, 1, "the mounted sword owns a real combat striker");
    const snapshot = left.control.snapshot();
    assert.equal(snapshot.active.some(({ action }) => action === "stabilize"), true,
      "the non-leg, non-sword joints have a concurrent persistent posture Action");
    assert.equal(snapshot.motorTargets.some(({ joint }) => ["waist", "neck-bearing", "head-bearing",
      "left-shoulder", "left-elbow", "left-wrist", "left-palm"].some((id) => joint === id || joint.startsWith(`${id}:`))), true);
    const locomotion = left.locomotion.diagnostic();
    assert.equal(locomotion.state.state, "supported");
    assert.equal(locomotion.postureSupported, true);
    assert.deepEqual(locomotion.supportGroups.find(({ id }) => id === "locomotion")?.bindings
      .map(({ id }) => id).sort(), ["left-foot", "right-foot"],
    "the full carrier authority is derived from both authored support chains");
    assert.ok(locomotion.freshSupportBindings.length >= 1 &&
      locomotion.freshSupportBindings.every((id) => id === "left-foot" || id === "right-foot"),
    "an arbitrary gait boundary publishes only the authored foot or feet actually planted");
    const view = { unit: "warrior", reach: 0, crownHeight: 0, vitalHeight: 0, collisionRadius: 0,
      naturalAttacks: {}, ground: new Vector3(), facing: 0, shoulder: new Vector3(), tip: new Vector3(),
      tipSpeed: 0, hands: {}, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 0, health: {} };
    left.describe(view);
    const measured = humanoidProfileMetrics();
    assert.deepEqual({ unit: view.unit, reach: view.reach, crownHeight: view.crownHeight,
      vitalHeight: view.vitalHeight, collisionRadius: view.collisionRadius }, {
      unit: "swordbearer-effigy", ...measured,
    });
    assert.ok(Math.abs(view.crownHeight - 1.8995) < 1e-12, "scaled chassis crown is human-sized");
    assert.ok(view.reach > 1.1 && view.reach < 1.2,
      "published reach is measured from the scaled body to the unscaled sword tip");
    assert.ok(Math.abs(bindCrownHeight - view.crownHeight) < 1e-9,
      "published crown height is the resolved head geometry above the contact pads");
    assert.ok(Math.abs(bindVitalHeight - view.vitalHeight) < 1e-9,
      "published vital height is the fatal torso centre above the contact pads");
    const carrierGround = left.locomotion.carrierGround();
    assert.ok(carrierGround && Vector3.Distance(view.ground,
      new Vector3(carrierGround.x, carrierGround.y, carrierGround.z)) < 1e-9,
    "supported publication uses the navigation carrier that the pair resolver actually committed");

    const rightFoot = left.runtime.part("right-foot").node.position.clone();
    left.state.severJoint("left-hip");
    left.state.beforeControlStep(1 / CONFIG.world.physicsHz);
    assert.ok(Vector3.Distance(left.feetPosition(), new Vector3(rightFoot.x, 0, rightFoot.z)) < 1e-9,
      "a severed leg's foot debris cannot move the body's published ground");
    left.state.severJoint("right-hip");
    left.state.beforeControlStep(1 / CONFIG.world.physicsHz);
    const root = left.runtime.part(saved.blueprint.rootPart).node.position;
    assert.ok(Vector3.Distance(left.feetPosition(), new Vector3(root.x, 0, root.z)) < 1e-9,
      "a body with no attached profile foot falls back to its attached root projection");
  } finally { bout.dispose(); arena.dispose(); }
});
