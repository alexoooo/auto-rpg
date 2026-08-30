import assert from "node:assert/strict";
import test from "node:test";

import {
  FistTriggerFollower,
  RisingActuator,
  StandableWorldRegistry,
  SUPPORTED_CARRIER_V1,
  SupportedRuntimeResourceCensus,
  SupportedRootMotor,
  VirtualLocomotionCarrier,
  boundedRootMotorCommand,
  deriveLocomotionFootprint,
  resolveCarrierPair,
} from "../src/supported-locomotion-runtime.ts";
import {
  COLLIDES,
  LAYER,
  collisionFilterIsExact,
  supportedLayersFor,
  writeCollisionFilter,
} from "../src/physics.ts";

const footprint = (id = "fixture") => deriveLocomotionFootprint({
  radiusM: 0.5,
  heightM: 1.8,
  provenance: { profileId: id, source: "fighter-bind-geometry", measuredAt: "fixture bind AABB" },
});

const point = (x, y, z) => ({ x, y, z });
const noHit = () => null;
const hit = (id, fraction, normal = [0, 1, 0]) => ({
  colliderId: id,
  fraction,
  point: point(0, 0, 0),
  upwardNormal: normal,
});
const collider = (id, category, { ownerPartId = null, normal = [0, 1, 0], sweep = noHit,
  support = noHit } = {}) => ({ id, category, ownerPartId, upwardNormal: normal, sweep, support });
const registryWithFloor = () => {
  const registry = new StandableWorldRegistry();
  registry.register(collider("floor", "standable-world", { support: () => hit("floor", 0) }));
  return registry;
};
const carrier = (x, yaw = 0, id = "body") => new VirtualLocomotionCarrier(
  { position: point(x, 0.9, 0), yaw }, footprint(id),
  { maxSpeedMps: 1, maxAccelerationMps2: 10, maxYawSpeedRadS: 2, maxYawAccelerationRadS2: 20 },
  new Set([`${id}.root`, `${id}.torso`, `${id}.head`]),
);
const request = (overrides = {}) => ({ localForward: 0, localRight: 0, yaw: 0, recover: false, ...overrides });

test("a_test_enabled_carrier_moves_at_zero_and_pi_without_roll_or_vertical_drift", () => {
  const registry = registryWithFloor();
  const zero = carrier(0, 0, "zero");
  const pi = carrier(0, Math.PI, "pi");
  const leftProposal = zero.propose(request({ localForward: 1 }), 0.1);
  const rightProposal = pi.propose(request({ localForward: 1 }), 0.1);
  const allowed = resolveCarrierPair(leftProposal, rightProposal, registry);
  zero.commit(leftProposal, allowed.left);
  pi.commit(rightProposal, allowed.right);
  assert.ok(zero.state.z > 0);
  assert.ok(pi.state.z < 0);
  assert.equal(zero.state.y, 0.9);
  assert.equal(pi.state.y, 0.9);
  assert.deepEqual(Object.keys(zero.state).sort(),
    ["velocityX", "velocityZ", "x", "y", "yaw", "yawVelocity", "z"].sort(),
    "a virtual carrier has yaw but cannot acquire roll or pitch state");
  assert.equal("body" in zero, false, "the navigation carrier never materializes solver geometry");
  assert.equal("shape" in zero, false);
});

test("pair_resolution_is_symmetric_under_side_order_and_mirror", () => {
  const registry = registryWithFloor();
  const a = carrier(-0.8, 0, "a");
  const b = carrier(0.8, 0, "b");
  const pa = a.propose(request({ localRight: 1 }), 0.1, 1);
  const pb = b.propose(request({ localRight: -1 }), 0.1, 2);
  const forward = resolveCarrierPair(pa, pb, registry);
  const reverse = resolveCarrierPair(pb, pa, registry);
  assert.deepEqual(reverse.left, forward.right);
  assert.deepEqual(reverse.right, forward.left);

  const mirroredA = carrier(0.8, Math.PI, "ma");
  const mirroredB = carrier(-0.8, Math.PI, "mb");
  const mirrored = resolveCarrierPair(
    mirroredA.propose(request({ localRight: 1 }), 0.1, 1),
    mirroredB.propose(request({ localRight: -1 }), 0.1, 2), registry);
  assert.ok(Math.abs(mirrored.left.x + forward.left.x) < 1e-12);
  assert.ok(Math.abs(mirrored.right.x + forward.right.x) < 1e-12);
});

test("two_carriers_stop_at_their_footprints_without_penetration_or_launch", () => {
  const registry = registryWithFloor();
  const left = carrier(-0.6, 0, "left");
  const right = carrier(0.6, 0, "right");
  const lp = left.propose(request({ localRight: 1 }), 1);
  const rp = right.propose(request({ localRight: -1 }), 1);
  const allowed = resolveCarrierPair(lp, rp, registry);
  left.commit(lp, allowed.left);
  right.commit(rp, allowed.right);
  assert.ok(right.state.x - left.state.x >= 1 - 1e-12);
  assert.ok(Math.abs(left.state.velocityX) <= 1);
  assert.ok(Math.abs(right.state.velocityX) <= 1);
});

test("a_carrier_cannot_bulldoze_a_braced_opponent_through_a_wall", () => {
  const registry = registryWithFloor();
  registry.register(collider("right-wall", "wall", { sweep: (from) =>
    from.x > 0 ? hit("right-wall", 0) : null }));
  const attacker = carrier(-0.7, 0, "attacker");
  const braced = carrier(0.5, 0, "braced");
  const allowed = resolveCarrierPair(
    attacker.propose(request({ localRight: 1 }), 1, 1),
    braced.propose(request({ localRight: 1 }), 1, 1.5), registry);
  assert.equal(allowed.right.x, 0, "world clipping precedes pair resistance");
  assert.ok(allowed.left.x <= 0.2 + 1e-12, "the remaining footprint gap bounds the pusher");
});

test("the_world_query_excludes_every_owner_part_and_still_finds_standable_world", () => {
  const registry = registryWithFloor();
  for (const id of ["root", "torso", "head", "left-foot", "right-foot"]) {
    // A broad engine cast can report an owner's foot against the arena registry's floor
    // classification. The explicit complete articulation exclusion, not this fixture's label,
    // must be what keeps that hit from becoming support.
    registry.register(collider(`owner.${id}`, "standable-world", { ownerPartId: id,
      sweep: () => hit(`owner.${id}`, 0), support: () => hit(`owner.${id}`, 0) }));
  }
  registry.register(collider("weapon", "weapon", { support: () => hit("weapon", 0) }));
  registry.register(collider("opponent", "opponent", { support: () => hit("opponent", 0) }));
  registry.register(collider("debris", "debris", { support: () => hit("debris", 0) }));
  registry.register(collider("fifty-degree", "standable-world", { normal:
    [Math.sin(50 * Math.PI / 180), Math.cos(50 * Math.PI / 180), 0], support: () =>
      hit("fifty-degree", 0, [Math.sin(50 * Math.PI / 180), Math.cos(50 * Math.PI / 180), 0]) }));
  const evidence = registry.supportEvidence(point(0, 0.9, 0), footprint(),
    new Set(["root", "torso", "head", "left-foot", "right-foot"]), "left-foot", 8);
  assert.deepEqual(evidence.map(({ contactedOwner }) => contactedOwner), ["floor"]);
  assert.equal(evidence[0].safeBoundarySequence, 8);
  assert.equal(evidence[0].category, "standable-world");
  assert.equal(footprint().stepHeightM, 0.18);
  assert.equal(footprint().maxSlopeDeg, 35);
  assert.equal(SUPPORTED_CARRIER_V1.REFUSAL_SLOPE_DEG, 50);
});

test("pair_resolution_finds_the_opponent_footprint_without_query_geometry", () => {
  const registry = registryWithFloor();
  const left = carrier(-0.55, 0, "left");
  const right = carrier(0.55, 0, "right");
  const before = registry.size;
  const allowed = resolveCarrierPair(left.propose(request({ localRight: 1 }), 1),
    right.propose(request({ localRight: -1 }), 1), registry);
  assert.equal(registry.size, before, "pair resolution creates no query proxy");
  assert.ok(allowed.left.x + -allowed.right.x <= 0.1 + 1e-12);
});

test("the_virtual_carrier_has_no_body_and_never_enters_the_collision_table", () => {
  const virtual = carrier(0);
  for (const forbidden of ["body", "shape", "trigger", "membership", "collidesWith"]) {
    assert.equal(forbidden in virtual, false, forbidden);
  }
  assert.equal(Object.keys(LAYER).some((name) => name.includes("CARRIER")), false);
});

test("the_supported_collision_table_is_exact_for_both_sides_every_membership_and_every_leaf", () => {
  assert.deepEqual(Object.keys(COLLIDES).sort(), Object.keys(LAYER).sort());
  for (const side of ["left", "right"]) {
    const own = supportedLayersFor(side);
    const other = supportedLayersFor(side === "left" ? "right" : "left");
    assert.equal((own.trunkCollides & other.trunk) !== 0, false);
    assert.equal((own.armCollides & other.arm) !== 0, false);
    assert.equal((own.legCollides & other.leg) !== 0, false);
    assert.ok(own.trunkCollides & LAYER.WORLD);
    assert.ok(own.armCollides & LAYER.DEBRIS);
    assert.equal(own.fistTriggerCollides,
      side === "left"
        ? LAYER.RIGHT_TRUNK | LAYER.RIGHT_ARM | LAYER.RIGHT_SUPPORTED_TRUNK |
          LAYER.RIGHT_SUPPORTED_ARM | LAYER.RIGHT_SUPPORTED_LEG
        : LAYER.LEFT_TRUNK | LAYER.LEFT_ARM | LAYER.LEFT_SUPPORTED_TRUNK |
          LAYER.LEFT_SUPPORTED_ARM | LAYER.LEFT_SUPPORTED_LEG);
  }
  const container = { filterMembershipMask: 0, filterCollideMask: 0 };
  const leaves = Array.from({ length: 3 }, () => ({ filterMembershipMask: 0, filterCollideMask: 0 }));
  const layer = supportedLayersFor("left");
  writeCollisionFilter(container, leaves, layer.arm, layer.armCollides);
  assert.equal(collisionFilterIsExact(container, leaves, layer.arm, layer.armCollides), true);
  leaves[1].filterCollideMask = 0;
  assert.equal(collisionFilterIsExact(container, leaves, layer.arm, layer.armCollides), false,
    "a container-only mask write cannot pass the leaf audit");
});

test("supported_passive_parts_keep_real_sword_shield_arrow_and_fist_contacts", () => {
  const left = supportedLayersFor("left");
  for (const striker of [LAYER.RIGHT_SWORD, LAYER.RIGHT_SHIELD, LAYER.RIGHT_ARROW,
    LAYER.RIGHT_FIST_TRIGGER]) assert.ok(left.armCollides & striker);
  for (const striker of ["RIGHT_SWORD", "RIGHT_SHIELD", "RIGHT_ARROW"]) {
    assert.ok(COLLIDES[striker] & LAYER.LEFT_SUPPORTED_ARM, striker);
  }
  assert.equal(COLLIDES.RIGHT_FIST_TRIGGER & LAYER.LEFT_SUPPORTED_ARM,
    LAYER.LEFT_SUPPORTED_ARM);
});

test("a_root_motor_is_mass_scaled_bounded_and_refuses_an_ANIMATED_physical_root", () => {
  const root = { motionType: "dynamic", position: point(0, 0, 0), velocity: point(-100, 0, 0),
    massKg: 20, released: false };
  const command = boundedRootMotorCommand(root, point(100, 100, 100), point(100, 100, 100));
  assert.equal(command.enabled, true);
  assert.ok(Math.hypot(command.forceN.x, command.forceN.y, command.forceN.z) <=
    20 * SUPPORTED_CARRIER_V1.ROOT_MAX_ACCELERATION_MPS2 + 1e-9);
  assert.match(boundedRootMotorCommand({ ...root, motionType: "animated" },
    point(0, 0, 0), point(0, 0, 0)).reason, /DYNAMIC/);
  assert.match(boundedRootMotorCommand({ ...root, released: true },
    point(0, 0, 0), point(0, 0, 0)).reason, /released/);

  const census = new SupportedRuntimeResourceCensus();
  const applied = [];
  let clears = 0;
  const motor = new SupportedRootMotor("fixture.root-motor", {
    sample: () => root,
    applyForce: (force) => applied.push(force),
    clearDrive: () => { clears += 1; },
  }, census);
  motor.drive(point(0.1, 0, 0), point(0, 0, 0), "supported");
  assert.equal(applied.length, 1);
  motor.drive(point(0.1, 0, 0), point(0, 0, 0), "fallen");
  assert.equal(clears, 1, "falling clears drive without touching live transform or velocity");
  motor.dispose();
  assert.equal(clears, 2);
  assert.equal(census.balanced, true);
});

test("rising_is_swept_acceleration_limited_and_continuous_at_finish_and_abort", () => {
  const registry = registryWithFloor();
  const actuator = new RisingActuator(point(0, 0.2, 0), point(0, 1.2, 0), 0.7,
    footprint(), registry, new Set(["root", "torso"]));
  const first = actuator.step(1e-6);
  assert.ok(Math.abs(first.position.y - 0.2) < 1e-9);
  let last = first;
  while (!last.complete) last = actuator.step(0.01);
  assert.deepEqual(last.position, point(0, 1.2, 0));
  assert.deepEqual(last.velocity, point(0, 0, 0));
  assert.equal(last.yaw, 0.7);

  const aborted = new RisingActuator(point(0, 0.2, 0), point(0, 1.2, 0), 0,
    footprint(), registry, new Set()).abort(point(0.1, 0.4, -0.2), point(1, 2, 3));
  assert.deepEqual(aborted.position, point(0.1, 0.4, -0.2));
  assert.deepEqual(aborted.velocity, point(1, 2, 3));

  const blocked = registryWithFloor();
  blocked.register(collider("wall", "wall", { sweep: () => hit("wall", 0.5) }));
  assert.throws(() => new RisingActuator(point(0, 0.2, 0), point(0, 1.2, 0), 0,
    footprint(), blocked, new Set()), /obstructed/);
  assert.throws(() => new RisingActuator(point(0, 0, 0), point(0, 3, 0), 0,
    footprint(), registry, new Set()), /acceleration-limited/);
});

test("fist_trigger_follows_real_hand_kinematics_and_twenty_cycles_balance_explicit_resources", () => {
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const census = new SupportedRuntimeResourceCensus();
    census.create("query", `query.${cycle}`);
    census.create("root-motor", `root.${cycle}`);
    census.create("observer", `observer.${cycle}`);
    const fist = new FistTriggerFollower(`fist.${cycle}`, census);
    assert.deepEqual(fist.sample({ position: point(1, 2, 3), velocity: point(4, 5, 6) }), {
      triggerId: `fist.${cycle}`, position: point(1, 2, 3), velocity: point(4, 5, 6),
    });
    assert.equal(census.balanced, false);
    fist.dispose();
    census.dispose("observer", `observer.${cycle}`);
    census.dispose("root-motor", `root.${cycle}`);
    census.dispose("query", `query.${cycle}`);
    assert.equal(census.balanced, true);
  }
  const leaked = new SupportedRuntimeResourceCensus();
  leaked.create("query", "omitted-disposal");
  assert.equal(leaked.balanced, false, "an omitted census disposal fails independently");
});
