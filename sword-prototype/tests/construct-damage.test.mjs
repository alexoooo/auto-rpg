import assert from "node:assert/strict";
import test from "node:test";

import { deriveCapabilities } from "../src/construct/capabilities.ts";
import { ConstructResources } from "../src/construct/resources.ts";
import { ConstructDamageState } from "../src/construct/damage.ts";
import { wardenBlueprint, wardenControl } from "../src/construct/warden.ts";
import { BOOTSTRAP_CONTROLLERS } from "../src/construct/controllers.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { LiveConstructState } from "../src/construct/live-state.ts";
import { distanceToModulePrimitive, jointAtContact } from "../src/construct/damage-target.ts";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Combat } from "../src/combat.ts";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { ConstructMountedContactStriker, ConstructMountedSword } from "../src/construct/striker.ts";

const graph = Object.freeze({
  version: 1,
  groups: Object.freeze([
    Object.freeze({ id: "mount", joints: Object.freeze(["yaw", "pitch"]), modules: Object.freeze(["launcher"]), bindings: Object.freeze({}) }),
  ]),
  actions: Object.freeze([
    Object.freeze({ id: "fire", controller: "hold-joints", group: "mount",
      claims: Object.freeze(["resource:power-mount", "resource:ammo-bolts", "resource:sensor-line-of-sight"]),
      parameters: Object.freeze({}) }),
  ]),
});

const resources = () => new ConstructResources(
  { id: "core", capacityJ: 100, maxOutputW: 50 },
  [{ id: "mount-motor", drawW: 30, heatPerJ: 0.2 }, { id: "launcher", drawW: 30, heatPerJ: 0.2 }],
  { capacityJ: 100, coolingW: 1, maxHeatJ: 20 },
  [{ id: "bolts", capacity: 2, reloadS: 0.5 }],
);

test("an_exact_divide_by_twenty_fixture_preserves_post_armour_Construct_damage", () => {
  const legacy = new ConstructDamageState({ ...wardenBlueprint(),
    parts: wardenBlueprint().parts.map((part) => ({ ...part, health: part.health * 20, armour: part.armour * 20 })),
    joints: wardenBlueprint().joints.map((joint) => ({ ...joint, health: joint.health * 20, armour: joint.armour * 20 })),
    modules: wardenBlueprint().modules.map((module) => ({ ...module, health: module.health * 20, armour: module.armour * 20 })),
  });
  const migrated = new ConstructDamageState(wardenBlueprint());
  const old = legacy.damagePart("limb-front-left-upper", 40);
  const next = migrated.damagePart("limb-front-left-upper", 2);
  assert.equal(next.applied, old.applied / 20);
  assert.equal(migrated.partHealth("limb-front-left-upper"), legacy.partHealth("limb-front-left-upper") / 20);
});

const hardware = (view, overrides = {}) => ({
  joints: new Set(["yaw", "pitch"]), modules: new Set(["launcher"]),
  sensors: new Set(["line-of-sight"]), resources: view, ...overrides,
});

test("capability_rows_name_missing_hardware_ammunition_power_and_heat_separately", () => {
  const live = resources();
  assert.equal(deriveCapabilities(graph, hardware(live.view))[0].reason, null);
  assert.match(deriveCapabilities(graph, hardware(live.view, { joints: new Set(["yaw"]) }))[0].reason, /missing joint "pitch"/);
  assert.match(deriveCapabilities(graph, hardware(live.view, { modules: new Set() }))[0].reason, /missing module "launcher"/);
  assert.match(deriveCapabilities(graph, hardware(live.view, { sensors: new Set() }))[0].reason, /missing sensor "line-of-sight"/);
  live.fire("bolts"); live.step(0.5, []); live.fire("bolts");
  assert.match(deriveCapabilities(graph, hardware(live.view))[0].reason, /ammunition "bolts" exhausted/);
  assert.match(deriveCapabilities(graph, hardware({ ...live.view, chargeJ: 0,
    ammunition: { bolts: 1 }, reloadS: { bolts: 0 } }))[0].reason, /power charge exhausted/);
  assert.match(deriveCapabilities(graph, hardware({ ...live.view, chargeJ: 1, overheated: true,
    ammunition: { bolts: 1 }, reloadS: { bolts: 0 } }))[0].reason, /thermal limit reached/);
  assert.match(deriveCapabilities(graph, hardware({ ...live.view, chargeJ: 1, overheated: false,
    ammunition: { bolts: 1 }, reloadS: { bolts: 0.2 } }))[0].reason, /is reloading/);
});

test("priority_resolves_a_power_shortfall_without_partial_hidden_throttling", () => {
  const live = resources();
  const decisions = live.step(1, [
    { consumer: "mount-motor", priority: 1, declarationIndex: 1 },
    { consumer: "launcher", priority: 2, declarationIndex: 0 },
  ]);
  assert.deepEqual(decisions, [
    { consumer: "launcher", admitted: true, reason: null },
    { consumer: "mount-motor", admitted: false, reason: "power output exhausted" },
  ]);
  assert.equal(live.view.chargeJ, 70, "one whole admitted consumer spent power");
});

test("shooting_consumes_finite_ammunition_and_reload_time", () => {
  const live = resources();
  live.fire("bolts");
  assert.deepEqual(live.view.ammunition, { bolts: 1 });
  assert.throws(() => live.fire("bolts"), /reloading/);
  live.step(0.5, []);
  live.fire("bolts");
  assert.deepEqual(live.view.ammunition, { bolts: 0 });
  assert.throws(() => live.fire("bolts"), /no ammunition/);
});

test("reload_and_thermal_capabilities_enable_on_the_exact_passive_resource_edge", () => {
  const blueprint = wardenBlueprint();
  const runtime = { blueprint, detachSubtree() { return []; },
    modules: new Map(blueprint.modules.map(({ id }) => [id, { disable() {} }])) };
  const make = (coolingW = 10) => new ConstructResources(
    { id: "warden-power", capacityJ: 100, maxOutputW: 50 },
    [{ id: "action:fire", drawW: 10, heatPerJ: 1 }],
    { capacityJ: 10, coolingW, maxHeatJ: 10 },
    [{ id: "dorsal-magazine", capacity: 2, reloadS: 0.5 }],
  );
  const graph = wardenControl();
  const empty = Object.freeze({ version: 1, requests: Object.freeze([]) });

  const reload = make(); reload.fire("dorsal-magazine");
  const reloadState = new LiveConstructState(runtime, reload);
  assert.match(reloadState.capabilities(graph).find(({ action }) => action === "fire").reason, /reloading/);
  assert.equal(reloadState.capabilitiesForCommand(graph, empty, 0.5)
    .find(({ action }) => action === "fire").reason, null);

  const thermal = make(); thermal.step(1, [{ consumer: "action:fire", priority: 0, declarationIndex: 0 }]);
  const thermalState = new LiveConstructState(runtime, thermal);
  assert.match(thermalState.capabilities(graph).find(({ action }) => action === "fire").reason, /thermal limit/);
  assert.equal(thermalState.capabilitiesForCommand(graph, empty, 1)
    .find(({ action }) => action === "fire").reason, null);
});

test("severing_one_joint_detaches_exactly_its_child_subtree", () => {
  const blueprint = wardenBlueprint();
  const damage = new ConstructDamageState(blueprint);
  const result = damage.damageJoint("bearing-front-left-upper", 1000);
  assert.deepEqual(new Set(result.severedParts), new Set([
    "limb-front-left-upper", "limb-front-left-lower", "limb-front-left-ankle", "limb-front-left-foot",
  ]));
  assert.equal(damage.installedModules().has("foot-front-left"), false);
  assert.equal(damage.installedModules().has("foot-front-right"), true);
});

test("core_and_part_vitality_come_from_blueprint_weights_not_humanoid_names", () => {
  const blueprint = structuredClone(wardenBlueprint());
  blueprint.parts.find((part) => part.id === "core").fatal = false;
  blueprint.parts.find((part) => part.id === "core").vitalityWeight = 0;
  blueprint.parts.find((part) => part.id === "sensor-mast").fatal = true;
  blueprint.parts.find((part) => part.id === "sensor-mast").vitalityWeight = 1;
  const damage = new ConstructDamageState(blueprint);
  damage.damagePart("sensor-mast", 1000);
  assert.equal(damage.vitality(), 0);
});

test("module_health_and_armour_are_blueprint_authority_for_installed_hardware", () => {
  const blueprint = wardenBlueprint();
  const shield = blueprint.modules.find(({ id }) => id === "warden-shield");
  const damage = new ConstructDamageState(blueprint);
  const first = damage.damageModule(shield.id, shield.armour + 2);
  assert.deepEqual(first, { target: shield.id, absorbed: shield.armour, applied: 2, severedParts: [] });
  assert.equal(damage.installedModuleHealth(shield.id), shield.health - 2);
  damage.damageModule(shield.id, 1000);
  assert.equal(damage.installedModules().has(shield.id), false);
});

test("losing_a_required_joint_cancels_the_action_before_another_motor_write", () => {
  const blueprint = wardenBlueprint();
  const detached = [];
  const runtime = {
    blueprint,
    detachSubtree: (root) => { detached.push(root); return [root]; },
    modules: new Map(blueprint.modules.map((module) => [module.id, { detachAsDebris() {} }])),
  };
  const live = new LiveConstructState(runtime, null);
  const actionGraph = {
    version: 1,
    groups: [{ id: "damaged-bank", joints: ["bearing-front-left-upper"], modules: [], bindings: {} }],
    actions: [{ id: "hold-damaged-bank", controller: "hold-joints", group: "damaged-bank", claims: [], parameters: {} }],
  };
  const writes = [];
  const scheduler = new ActionScheduler(actionGraph, BOOTSTRAP_CONTROLLERS, { write: (row) => writes.push(row) });
  const view = { joints: { "bearing-front-left-upper": {
    angleRad: 0, speedRadS: 0, minRad: -1, maxRad: 1, maxSpeedRadS: 2, maxForceNm: 20,
  } }, facts: {} };
  const command = { version: 1, requests: [{ request: { action: "hold-damaged-bank", parameters: {} },
    priority: 0, sourceIndex: 0 }] };
  scheduler.step(command, view, 1 / 240, live.capabilities(actionGraph));
  assert.equal(writes.length, 1);

  live.damageJoint("bearing-front-left-upper", 1000);
  live.beforeControlStep(1 / 240);
  const events = scheduler.step(command, view, 1 / 240, live.capabilities(actionGraph));
  assert.equal(writes.length, 1, "the severed joint received no post-damage motor write");
  assert.deepEqual(detached, ["limb-front-left-upper"]);
  assert.equal(events.some((row) => row.kind === "cancelled" &&
    row.reason === 'missing joint "bearing-front-left-upper"'), true);
});

test("a_destroyed_sensor_removes_only_the_actions_that_declared_that_sensor", () => {
  const blueprint = wardenBlueprint();
  const runtime = {
    blueprint,
    detachSubtree: () => [],
    modules: new Map(blueprint.modules.map((module) => [module.id, { detachAsDebris() {} }])),
  };
  const live = new LiveConstructState(runtime, null);
  const sensorGraph = {
    version: 1,
    groups: [{ id: "empty", joints: [], modules: [], bindings: {} }],
    actions: [
      { id: "observed", controller: "hold-joints", group: "empty",
        claims: ["resource:sensor-line-of-sight"], parameters: {} },
      { id: "blind", controller: "hold-joints", group: "empty", claims: [], parameters: {} },
    ],
  };
  live.damageModule("warden-sensor", 1000);
  assert.equal(live.hardware().sensors.has("line-of-sight"), false,
    "destroyed hardware no longer publishes a Mind sensor");
  const rows = live.capabilities(sensorGraph);
  assert.equal(rows.find(({ action }) => action === "observed").reason, 'missing sensor "line-of-sight"');
  assert.equal(rows.find(({ action }) => action === "blind").reason, null);
});

test("module_contact_targeting_uses_blueprint_collision_geometry_not_visual_bounds", () => {
  const box = { id: "plate", frame: { positionM: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
    shape: { kind: "box", sizeM: [0.4, 0.6, 0.2] }, shell: { style: "plate", visualClearanceM: 0.3 } };
  assert.ok(distanceToModulePrimitive(new Vector3(0.7, 0, 0), box) < 1e-9);
  assert.ok(distanceToModulePrimitive(new Vector3(1.0, 0, 0), box) > 0.25,
    "visual clearance never widens the damage target");
});

test("a_physical_contact_at_a_bearing_resolves_to_joint_integrity_before_the_owner_part", () => {
  const body = {};
  const other = {};
  const near = { id: "bearing-near", attached: true, parent: { body }, child: { body: other },
    liveFrames: () => ({ parent: { position: new Vector3(1, 2, 3) } }) };
  const far = { id: "bearing-far", attached: true, parent: { body }, child: { body: other },
    liveFrames: () => ({ parent: { position: new Vector3(4, 2, 3) } }) };
  const runtime = { joints: new Map([[near.id, near], [far.id, far]]) };
  assert.equal(jointAtContact(runtime, body, new Vector3(1.04, 2, 3)), near);
  assert.equal(jointAtContact(runtime, body, new Vector3(1.3, 2, 3)), null);
});

test("destroying_a_joint_twice_does_not_detach_the_same_subtree_twice", () => {
  const damage = new ConstructDamageState(wardenBlueprint());
  assert.ok(damage.damageJoint("bearing-front-left-upper", 1000).severedParts.length > 0);
  assert.deepEqual(damage.damageJoint("bearing-front-left-upper", 1000).severedParts, []);
});

test("combat_routes_a_compound_contact_through_the_explicit_armoured_module_target", () => {
  let contact;
  const striker = {
    kind: "sword", hand: null, effectorId: "attacker-blade", spent: false,
    body: { getCollisionObservable: () => ({ add: (callback) => { contact = callback; return {}; }, remove() {} }) },
    velocityAt: () => new Vector3(20, 0, 0), edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 0, 1), tipPosition: () => new Vector3(3, 0, 0),
  };
  const ownerBody = {};
  const part = { key: "owner-part", label: "owner part", health: 100, maxHealth: 100,
    severed: false, lastHitAt: -999, part: { body: { applyImpulse() {} } } };
  const module = { key: "mounted-module", label: "mounted module", health: 40, maxHealth: 40,
    severed: false, lastHitAt: -999, part: { body: { applyImpulse() {} } } };
  let pointSeen = null;
  let rawSeen = 0;
  const combat = new Combat("left", [striker]);
  combat.attach({
    limbFor: () => part,
    damageTargetFor: (body, point) => { assert.equal(body, ownerBody); pointSeen = point.clone(); return module; },
    applyDamage: (target, raw) => { assert.equal(target, module); rawSeen = raw; const applied = Math.max(0, raw - 0.35);
      target.health -= applied; return applied; },
    parriedBy: () => null,
    sever: () => {},
  });
  const point = new Vector3(1, 2, 3);
  contact({ type: PhysicsEventType.COLLISION_STARTED, point, impulse: 1, collidedAgainst: ownerBody });
  assert.deepEqual(pointSeen.asArray(), point.asArray());
  assert.equal(combat.lastHit.key, "mounted-module");
  assert.equal(combat.lastHit.damage, rawSeen - 0.35, "the report and health use applied post-armour damage");
  assert.equal(module.health, 40 - combat.lastHit.damage);
  assert.equal(part.health, 100);
});

test("two_distinct_projectiles_are_not_collapsed_by_one_limb_cooldown", () => {
  const callbacks = [];
  const projectile = (poolIndex) => ({
    kind: "arrow", hand: null, effectorId: `bolt:${poolIndex}`, spent: false,
    projectileImpact: { massKg: 0.12, lengthM: 0.5, radiusM: 0.01,
      penetrationEfficiency: 1 },
    projectilePoolIndex: poolIndex, shotSerial: 0,
    body: { getCollisionObservable: () => ({ add: (callback) => {
      callbacks[poolIndex] = callback; return {}; }, remove() {} }) },
    velocityAt: () => new Vector3(0, 0, 42), edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 0, 1), tipPosition: () => new Vector3(0, 0, 1),
  });
  const bolts = [projectile(0), projectile(1)];
  const limb = { key: "torso", label: "torso", health: 20, maxHealth: 20,
    severed: false, lastHitAt: -999, part: { body: { applyImpulse() {} } } };
  const reports = [];
  const combat = new Combat("left", bolts, (event) => reports.push(event));
  combat.attach({ limbFor: () => limb, parriedBy: () => null, sever: () => {},
    applyDamage: (_target, damage) => { limb.health -= damage; return damage; } });
  const event = { type: PhysicsEventType.COLLISION_STARTED, point: new Vector3(0, 0, 0.99),
    impulse: 1, collidedAgainst: {} };
  callbacks[0](event);
  callbacks[1](event);
  assert.equal(reports.length, 2);
  assert.equal(reports.every(({ report }) => report.damage === 3), true);
  assert.equal(limb.health, 14);
});

test("one_recycled_projectile_serial_scores_at_most_once", () => {
  let contact;
  const bolt = {
    kind: "arrow", hand: null, effectorId: "bolt:0", spent: false,
    projectileImpact: { massKg: 0.12, lengthM: 0.5, radiusM: 0.01,
      penetrationEfficiency: 1 },
    projectilePoolIndex: 0, shotSerial: 7,
    body: { getCollisionObservable: () => ({ add: (callback) => { contact = callback; return {}; }, remove() {} }) },
    velocityAt: () => new Vector3(0, 0, 42), edgeDirection: () => new Vector3(1, 0, 0),
    bladeDirection: () => new Vector3(0, 0, 1), tipPosition: () => new Vector3(0, 0, 1),
  };
  const limb = { key: "torso", label: "torso", health: 20, maxHealth: 20,
    severed: false, lastHitAt: -999, part: { body: { applyImpulse() {} } } };
  const combat = new Combat("left", [bolt]);
  combat.attach({ limbFor: () => limb, parriedBy: () => null, sever: () => {},
    applyDamage: (_target, damage) => { limb.health -= damage; return damage; } });
  const event = { type: PhysicsEventType.COLLISION_STARTED, point: new Vector3(0, 0, 0.99),
    impulse: 1, collidedAgainst: {} };
  contact(event);
  contact(event);
  assert.equal(limb.health, 17);
  bolt.shotSerial = 8;
  contact(event);
  assert.equal(limb.health, 14, "the recycled slot becomes eligible only under its new serial");
});

test("a_destroyed_mounted_effector_loses_scorer_ownership_without_waiting_for_debris_motion", () => {
  let available = true;
  const module = {
    id: "blade", spec: { kind: "sword", striker: { damageScale: 1, localTipM: [0, 1, 0],
      localEdgeDirection: [1, 0, 0], localFlatDirection: [0, 0, 1] } },
    socket: { part: { attached: true, body: { setCollisionCallbackEnabled() {} } } },
  };
  const striker = new ConstructMountedSword(module, () => available);
  striker.setActionState("sweep:1", true);
  assert.equal(striker.spent, false);
  available = false;
  assert.equal(striker.spent, true);
});

test("a_mounted_sword_scores_only_during_its_declared_attack_Action", () => {
  let contact;
  const ownerBody = {
    setCollisionCallbackEnabled() {},
    getCollisionObservable: () => ({ add: (callback) => { contact = callback; return {}; }, remove() {} }),
    getLinearVelocityToRef: (value) => value.set(8, 0, 0),
    getAngularVelocityToRef: (value) => value.set(0, 0, 0),
  };
  const targetBody = {};
  const module = {
    id: "blade", spec: { kind: "sword", striker: { damageScale: 1, localTipM: [0, 1, 0],
      localEdgeDirection: [1, 0, 0], localFlatDirection: [0, 0, 1] } },
    root: { computeWorldMatrix: () => Matrix.Identity() },
    socket: { part: { attached: true, body: ownerBody, node: { position: Vector3.Zero() } } },
  };
  const striker = new ConstructMountedSword(module);
  const limb = { key: "torso", label: "torso", health: 20, maxHealth: 20,
    severed: false, lastHitAt: -999, part: { body: { applyImpulse() {} } } };
  const reports = []; const refusals = [];
  const combat = new Combat("left", [striker], (event) => reports.push(event),
    (event) => refusals.push(event));
  combat.attach({ limbFor: () => limb, parriedBy: () => null, sever: () => {} });
  const event = { type: PhysicsEventType.COLLISION_STARTED, point: new Vector3(0, 1, 0),
    impulse: 1, collidedAgainst: targetBody };
  contact(event);
  striker.setActionState("sweep:1", true);
  contact(event);
  striker.setActionState(null, false);
  combat.advance(1);
  contact(event);
  assert.equal(reports.length, 1, "only the armed physical stroke owns sword damage");
  assert.deepEqual(refusals.map(({ reason }) => reason), ["inactive-action", "inactive-action"]);
});

test("specific_impulse_bash_is_mass_independent_and_does_not_double_apply_generic_shove", () => {
  let contact; let impulse = null;
  const ownerBody = {
    setCollisionCallbackEnabled() {},
    getCollisionObservable: () => ({ add: (callback) => { contact = callback; return {}; }, remove() {} }),
    getLinearVelocityToRef: (value) => value.set(5, 0, 0),
    getAngularVelocityToRef: (value) => value.set(0, 0, 0),
  };
  const targetBody = {};
  const module = {
    id: "warden-shield",
    spec: { kind: "shield", geometry: [{
      id: "plate", frame: { positionM: [0, 0, 0], rotation: [0, 0, 0, 1] },
      shape: { kind: "sphere", radiusM: 1 }, shell: { style: "plate" },
    }], mountedContactStriker: { localContactPoint: [1, 0, 0], shoveSpecificImpulseMps: 0.008 } },
    root: { computeWorldMatrix: () => Matrix.Identity() },
    socket: { part: { attached: true, body: ownerBody, node: { position: Vector3.Zero() } } },
  };
  const runtime = { parts: new Map([["core", { body: ownerBody }]]), modules: new Map([[module.id, module]]) };
  const striker = new ConstructMountedContactStriker(runtime, module);
  const limb = { key: "torso", label: "torso", health: 10, maxHealth: 10,
    severed: false, lastHitAt: -999, part: { body: {
      getMassProperties: () => ({ mass: 25 }), applyImpulse: (value) => { impulse = value.clone(); },
    } } };
  const stability = []; const reports = []; const refusals = [];
  const combat = new Combat("left", [striker], (event) => reports.push(event),
    (event) => refusals.push(event));
  combat.attach({ limbFor: () => limb, parriedBy: () => null, sever: () => {},
    queueStabilityEvent: (event) => stability.push(event) });
  const event = { type: PhysicsEventType.COLLISION_STARTED, point: new Vector3(1, 0, 0), impulse: 99,
    collidedAgainst: targetBody };
  contact(event);
  assert.equal(reports.length, 0, "passive shield contact cannot impersonate an armed bash");
  striker.setActionState("bash:1", true);
  contact({ ...event, collidedAgainst: ownerBody });
  assert.equal(reports.length, 0, "an owner-body contact cannot impersonate an opponent bash");
  contact({ ...event, point: new Vector3(5, 0, 0) });
  assert.equal(reports.length, 0, "a bearing/core contact cannot impersonate the shield leaf");
  contact(event); contact(event);
  assert.equal(reports.length, 1, "one target is eligible once per armed action instance");
  assert.deepEqual(refusals.map(({ reason, effectorId }) => ({ reason, effectorId })), [
    { reason: "inactive-action", effectorId: "warden-shield" },
    { reason: "owner-contact", effectorId: "warden-shield" },
    { reason: "module-attribution", effectorId: "warden-shield" },
    { reason: "module-attribution", effectorId: "warden-shield" },
  ], "inactive, owner, source-leaf and duplicate refusals are explicit audit evidence");
  assert.equal(reports[0].report.damage, 0, "the authored shove is never a hidden wound");
  assert.deepEqual(stability, [{ kind: "specific-impulse", specificImpulseMps: 0.008 }]);
  assert.ok(Math.abs(impulse.length() - 25 * 0.008) < 1e-12);
  assert.deepEqual(reports[0].report.stabilityShove,
    { kind: "specific-impulse", specificImpulseMps: 0.008 });
});
