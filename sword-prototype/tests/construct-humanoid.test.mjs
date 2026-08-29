import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { humanoidBlueprint, humanoidControl, humanoidProgram, humanoidSavedConstruct,
  HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
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

test("the_humanoid_saved_character_exposes_only_physically_supported_leg_and_sword_actions", () => {
  const control = humanoidControl();
  const controllers = new Map(control.actions.map(({ id, controller }) => [id, controller]));
  assert.deepEqual(Object.fromEntries([...controllers].filter(([id]) =>
    ["move", "turn", "recover", "aim", "sweep", "guard"].includes(id))), {
    aim: "aim-direction", sweep: "sweep-compact-arc", guard: "guard-mount",
  });
  const locomotion = control.groups.find(({ id }) => id === "locomotion");
  assert.deepEqual(Object.keys(locomotion.bindings), ["left-foot", "right-foot"]);
  for (const binding of Object.values(locomotion.bindings)) {
    assert.equal(binding.joints.length, 4); assert.equal(binding.modules.length, 1);
  }
  const sword = control.groups.find(({ id }) => id === "sword-arm");
  assert.deepEqual(sword.bindings.yaw.joints, ["sword-yaw"]);
  assert.deepEqual(sword.bindings.pitch.joints, ["sword-pitch"]);
  assert.deepEqual(sword.bindings.sword.modules, ["effigy-sword"]);
  assert.deepEqual([...new Set(humanoidProgram().rules.map(({ action }) => action))].sort(),
    ["brace", "guard", "stabilize", "sweep"]);
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

test("biped_support_actions_command_only_the_declared_leg_axes_through_MotorWriter", () => {
  const control = humanoidControl(); const group = control.groups.find(({ id }) => id === "locomotion");
  const joints = Object.fromEntries(group.joints.flatMap((id) => [
    [`${id}:x`, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5, maxSpeedRadS: 4, maxForceNm: 240 }],
    ...(id.endsWith("hip") ? [[`${id}:y`, { angleRad: 0, speedRadS: 0, minRad: -0.45,
      maxRad: 0.45, maxSpeedRadS: 4, maxForceNm: 220 }]] : []),
  ]));
  const supported = { "contact:contact-left-foot": true, "contact:contact-right-foot": true,
    "core-upright": true, "core-roll-rad": 0, "core-pitch-rad": 0 };
  const writes = [];
  const scheduler = new ActionScheduler(control, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
  scheduler.step({ version: 1, requests: [{ request: { action: "brace",
    parameters: {} }, priority: 0, sourceIndex: 0 }] },
  { joints, facts: supported }, 1 / 240);
  assert.equal(writes.length, 10, "four sagittal joints plus one hip-yaw target per physical leg");
  assert.equal(writes.every(({ joint }) => /^(left|right)-(hip|knee|ankle|sole):(x|y)$/.test(joint)), true);

  const unsupported = new ActionScheduler(control, CONSTRUCT_CONTROLLERS, { write() {} });
  const events = unsupported.step({ version: 1, requests: [{ request: { action: "brace", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints, facts: { ...supported,
      "contact:contact-left-foot": false, "contact:contact-right-foot": false } }, 1 / 240);
  assert.equal(events.some(({ kind, reason }) => kind === "refused" && /at least one measured foot contact/.test(reason)), true);
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
    const bindCrownHeight = bind.part("head").node.position.y + 0.22;
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
    const contacts = Object.entries(left.control.snapshot().facts)
      .filter(([id, value]) => id.startsWith("contact:") && value === true);
    assert.equal(contacts.length, 2, `the biped settles on exactly its two real feet: ${JSON.stringify(contacts)}`);
    const view = { unit: "warrior", reach: 0, crownHeight: 0, vitalHeight: 0, collisionRadius: 0,
      naturalAttacks: {}, ground: new Vector3(), facing: 0, shoulder: new Vector3(), tip: new Vector3(),
      tipSpeed: 0, hands: {}, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 0, health: {} };
    left.describe(view);
    assert.deepEqual({ unit: view.unit, reach: view.reach, crownHeight: view.crownHeight,
      vitalHeight: view.vitalHeight, collisionRadius: view.collisionRadius }, {
      unit: "swordbearer-effigy", reach: 1.3, crownHeight: 2.532, vitalHeight: 1.542, collisionRadius: 0.62,
    });
    assert.ok(Math.abs(bindCrownHeight - view.crownHeight) < 1e-9,
      "published crown height is the resolved head geometry above the contact pads");
    assert.ok(Math.abs(bindVitalHeight - view.vitalHeight) < 1e-9,
      "published vital height is the fatal torso centre above the contact pads");
    assert.ok(Vector3.Distance(left.feetPosition(), view.ground) < 1e-6,
      "published ground uses the explicit two-foot profile rather than the old Warden core shortcut");

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
