import assert from "node:assert/strict";
import test from "node:test";

import { flatSupportedWorldRegistry, isStandableUpwardNormalY, PhysicalSupportedLocomotionPort,
  RECOVERY_RING_STEP_M, RECOVERY_SEPARATION_MARGIN_M, resolvePhysicalSupportedPair } from "../src/supported-locomotion-production.ts";
import { deriveLocomotionFootprint, StandableWorldRegistry, SUPPORTED_CARRIER_V1,
  VirtualLocomotionCarrier } from "../src/supported-locomotion-runtime.ts";
import { SUPPORTED_LOCOMOTION_V1 } from "../src/supported-locomotion-state.ts";

const point = (x, y, z) => ({ x, y, z });
const normal = (degrees) => Object.freeze([
  Math.sin(degrees * Math.PI / 180), Math.cos(degrees * Math.PI / 180), 0,
]);
const hit = (id, fraction, at, upwardNormal = [0, 1, 0]) => Object.freeze({ colliderId: id,
  fraction, point: Object.freeze({ ...at }), upwardNormal });
const footprint = (id = "obstacle-fixture", heightM = 1.8, radiusM = 0.5) =>
  deriveLocomotionFootprint({ radiusM, heightM, provenance: { profileId: id,
    source: "construct-bind-geometry", measuredAt: "declared obstacle fixture envelope" } });
const authority = Object.freeze({ carrierPartId: "pelvis",
  supportBindings: Object.freeze([{ role: "left-foot" }, { role: "right-foot" }]),
  braceCapacityMultiplier: 1.5, gaitStabilityScale: 1 });
const STOP = Object.freeze({ localForward: 0, localRight: 0, yaw: 0 });

const floorRegistry = (support = () => true) => {
  const registry = new StandableWorldRegistry();
  registry.register({ id: "floor", category: "standable-world", ownerPartId: null,
    upwardNormal: [0, 1, 0], sweep: () => null,
    support: (at) => support(at) ? hit("floor", 1, point(at.x, 0, at.z)) : null });
  return registry;
};

const physical = (id, x, registry, overrides = {}) => {
  const rootState = overrides.rootState ?? { motionType: "dynamic", position: point(x, 0.9, 0),
    velocity: point(0, 0, 0), massKg: 10, released: false };
  const forces = [];
  const port = new PhysicalSupportedLocomotionPort({ id, position: rootState.position, yaw: 0,
    footprint: overrides.footprint ?? footprint(id), ownerPartIds: new Set([`${id}.root`]),
    root: overrides.root ?? { sample: () => rootState, applyForce: (force) => forces.push(force),
      clearDrive() {} }, registry, supportedMassKg: rootState.massKg,
    authority: () => authority, liveSupport: () => true, postureSupported: () => true,
    supportBindings: ["left-foot", "right-foot"],
    supportPoint: overrides.supportPoint ?? (() => point(x, 0.04, 0)),
    releaseRoot: overrides.releaseRoot, restoreRoot: overrides.restoreRoot,
    releaseAnatomyCollision: overrides.releaseAnatomyCollision,
    restoreSupportedAnatomyCollision: overrides.restoreSupportedAnatomyCollision,
  });
  return { port, forces, rootState };
};

const advance = (port, dt, request = STOP, allowed = null) => {
  port.request(request);
  const proposal = port.proposal(dt);
  port.commitPhysical(proposal, allowed ?? proposal.displacement, dt);
  port.beginControlStep();
  return proposal;
};

test("wall_brace_blocks_the_declared_footprint_while_held_weapon_queries_remain_non_authoritative", () => {
  const registry = floorRegistry();
  const wallPlaneX = 1.1;
  registry.register({ id: "held-sword", category: "weapon", ownerPartId: null,
    upwardNormal: [0, 1, 0], support: () => null,
    sweep: (from) => hit("held-sword", 0, from) });
  registry.register({ id: "brace-wall", category: "wall", ownerPartId: null,
    upwardNormal: [0, 1, 0], support: () => null,
    sweep: (from, to, body) => {
      const centreLimit = wallPlaneX - body.radiusM;
      if (to.x <= centreLimit || to.x === from.x) return null;
      return hit("brace-wall", Math.max(0, Math.min(1,
        (centreLimit - from.x) / (to.x - from.x))), point(centreLimit, from.y, from.z));
    } });
  const fixture = physical("wall-brace", 0, registry);
  try {
    fixture.port.beginControlStep();
    fixture.port.request({ ...STOP, localRight: 1 });
    const raw = fixture.port.proposal(1);
    const centreLimit = wallPlaneX - raw.footprint.radiusM;
    assert.ok(raw.next.x + raw.footprint.radiusM > wallPlaneX,
      "the unswept fixture must intersect the wall envelope");
    const allowedFraction = registry.allowedFraction(raw.prior, raw.next, raw.footprint,
      raw.ownerPartIds);
    assert.ok(allowedFraction > 0 && allowedFraction < 1);
    fixture.port.commitPhysical(raw, { x: raw.displacement.x * allowedFraction, z: 0, yaw: 0 }, 1);
    assert.ok(Math.abs(fixture.port.carrierGround().x - centreLimit) < 1e-12);
    fixture.port.beginControlStep();
    const second = advance(fixture.port, 1, { ...STOP, localRight: 1 }, { x: 0, z: 0, yaw: 0 });
    assert.ok(second.next.x > second.prior.x, "held pressure still requests motion through the wall");
    assert.equal(fixture.port.carrierGround().x, centreLimit);
    assert.ok(fixture.forces.every((force) => Math.hypot(force.x, force.y, force.z) <=
      fixture.rootState.massKg * SUPPORTED_CARRIER_V1.ROOT_MAX_ACCELERATION_MPS2 + 1e-9));
  } finally { fixture.port.dispose(); }
});

test("a_ledge_removes_live_terminal_support_only_after_the_frozen_grace", () => {
  const ledgeX = 0.5;
  let terminal = point(ledgeX - 0.01, 0.04, 0);
  const registry = floorRegistry((at) => at.x <= ledgeX);
  const releases = [];
  const fixture = physical("ledge", 0, registry, { supportPoint: () => terminal,
    releaseRoot: () => releases.push("root"), releaseAnatomyCollision: () => releases.push("collision") });
  try {
    fixture.port.beginControlStep();
    assert.equal(fixture.port.diagnostic().freshSupportBindings.length, 2);
    terminal = point(ledgeX + 0.01, 0.04, 0);
    assert.ok(terminal.x > ledgeX, "the terminal fixture must lie beyond the declared ledge");
    advance(fixture.port, SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S);
    assert.equal(fixture.port.state, "supported", "the exact boundary is still inside the frozen grace");
    assert.ok(Math.abs(fixture.port.diagnostic().state.supportMissingS -
      SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S) < 1e-12);
    advance(fixture.port, 0.001);
    assert.equal(fixture.port.state, "fallen");
    assert.deepEqual(releases, ["root", "collision"]);
  } finally { fixture.port.dispose(); }
});

test("thirty_five_degree_support_is_accepted_and_fifty_degree_support_and_drive_are_refused", () => {
  assert.equal(isStandableUpwardNormalY(Math.cos(35 * Math.PI / 180)), true);
  assert.equal(isStandableUpwardNormalY(Math.cos(50 * Math.PI / 180)), false);
  assert.equal(isStandableUpwardNormalY(-1), false, "a ceiling normal cannot become support through abs(y)");
  const registry = new StandableWorldRegistry();
  const acceptedNormal = normal(35); const refusedNormal = normal(50);
  registry.register({ id: "slope-35", category: "standable-world", ownerPartId: null,
    upwardNormal: acceptedNormal, sweep: () => null,
    support: (at) => at.x < 0 ? hit("slope-35", 1, at, acceptedNormal) : null });
  registry.register({ id: "slope-50", category: "standable-world", ownerPartId: null,
    upwardNormal: refusedNormal,
    sweep: (from, to) => from.x < 0 && to.x >= 0
      ? hit("slope-50", (0 - from.x) / (to.x - from.x), point(0, from.y, from.z), refusedNormal) : null,
    support: (at) => at.x >= 0 ? hit("slope-50", 1, at, refusedNormal) : null });
  const body = footprint("slope");
  const accepted = registry.supportEvidence(point(-0.1, 0.04, 0), body, new Set(), "left-foot", 1);
  const refused = registry.supportEvidence(point(0.1, 0.04, 0), body, new Set(), "left-foot", 2);
  assert.deepEqual(accepted.map(({ contactedOwner }) => contactedOwner), ["slope-35"]);
  assert.deepEqual(refused, []);
  const carrier = new VirtualLocomotionCarrier({ position: point(-0.1, 0.9, 0), yaw: 0 }, body,
    { maxSpeedMps: 1, maxAccelerationMps2: 10, maxYawSpeedRadS: 2, maxYawAccelerationRadS2: 20 },
    new Set());
  const proposal = carrier.propose({ ...STOP, localRight: 1 }, 1);
  assert.ok(proposal.prior.x < 0 && proposal.next.x > 0,
    "the proposed footprint path must intersect the refused slope boundary");
  assert.equal(registry.allowedFraction(proposal.prior, proposal.next, body, new Set()), 0.1);
});

test("a_registered_snag_stalls_the_carrier_before_the_bounded_root_drive_can_launch", () => {
  const registry = floorRegistry();
  const snagX = 0.08;
  registry.register({ id: "snag", category: "wall", ownerPartId: null, upwardNormal: [0, 1, 0],
    support: () => null, sweep: (from, to) => to.x > snagX
      ? hit("snag", (snagX - from.x) / (to.x - from.x), point(snagX, from.y, from.z)) : null });
  const fixture = physical("snagged", 0, registry);
  try {
    fixture.port.beginControlStep();
    fixture.port.request({ ...STOP, localRight: 1 });
    const proposal = fixture.port.proposal(1);
    assert.ok(proposal.next.x > snagX, "the raw path must intersect the declared snag");
    const fraction = registry.allowedFraction(proposal.prior, proposal.next, proposal.footprint,
      proposal.ownerPartIds);
    fixture.port.commitPhysical(proposal, { x: proposal.displacement.x * fraction, z: 0, yaw: 0 }, 1);
    assert.equal(fixture.port.carrierGround().x, snagX);
    assert.ok(fixture.forces.length > 0);
    assert.ok(fixture.forces.every((force) => Math.hypot(force.x, force.y, force.z) <=
      fixture.rootState.massKg * SUPPORTED_CARRIER_V1.ROOT_MAX_ACCELERATION_MPS2 + 1e-9));
  } finally { fixture.port.dispose(); }
});

// **A rise relocates** (physical contact session 02). A fallen body whose own spot is inside another
// footprint rises to the nearest clear spot in reach, and one with no such spot is still refused;
// the two are a pair, because a fixture that relocated anything would pass the first alone.
test("an_occupied_recovery_relocates_to_the_nearest_spot_clear_of_the_intersecting_pair_footprint", () => {
  const registry = floorRegistry();
  const fallen = physical("occupied-fallen", 0, registry);
  const blocker = physical("occupied-blocker", 0.2, registry);
  try {
    const required = 1;
    fallen.port.beginControlStep(); blocker.port.beginControlStep();
    fallen.port.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fallen.port.beginControlStep();
    assert.equal(fallen.port.state, "fallen");
    for (let step = 0; step < 5 && fallen.port.state === "fallen"; step += 1) {
      fallen.port.updatePairOccupancy(blocker.port);
      advance(fallen.port, 0.1, STOP);
    }
    assert.equal(fallen.port.state, "rising", "the occupied body never rose");
    assert.equal(fallen.port.riseGate().relocated, true);
    // The carrier is set to the recovery target as the rise begins.
    const target = fallen.port.carrierGround();
    const clearance = Math.hypot(target.x - 0.2, target.z);
    assert.ok(clearance >= required + RECOVERY_SEPARATION_MARGIN_M - 1e-9,
      `the rise went to ${target.x.toFixed(3)}, ${clearance.toFixed(3)} m from the blocker`);
    // The nearest ring that clears it, 0.82 m needed and rings 0.1 m apart, straight away from it.
    const ring = Math.ceil((required + RECOVERY_SEPARATION_MARGIN_M - 0.2) / RECOVERY_RING_STEP_M) * RECOVERY_RING_STEP_M;
    assert.ok(Math.abs(target.x + ring) < 1e-9 && Math.abs(target.z) < 1e-9,
      `the rise went to (${target.x.toFixed(3)}, ${target.z.toFixed(3)}), not ${ring.toFixed(1)} m straight away`);
    // The census reads `relocated` on whichever boundary it samples, so it holds for the whole rise.
    fallen.port.updatePairOccupancy(blocker.port);
    advance(fallen.port, 0.05, STOP);
    assert.equal(fallen.port.state, "rising");
    assert.equal(fallen.port.riseGate().relocated, true, "the rise forgot it had relocated");
  } finally { fallen.port.dispose(); blocker.port.dispose(); }
  // The control: a body nobody stands over rises where it lies, and says so on every boundary.
  const free = physical("unoccupied-fallen", 0, floorRegistry());
  try {
    free.port.beginControlStep();
    free.port.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    free.port.beginControlStep();
    for (let step = 0; step < 5 && free.port.state === "fallen"; step += 1) advance(free.port, 0.1, STOP);
    assert.equal(free.port.state, "rising");
    assert.equal(free.port.riseGate().relocated, false, "an unoccupied rise read as relocated as it began");
    advance(free.port, 0.05, STOP);
    assert.equal(free.port.state, "rising");
    assert.equal(free.port.riseGate().relocated, false, "an unoccupied rise read as relocated under way");
  } finally { free.port.dispose(); }
});

// **A rising carrier stands still** (2026-09-24). The rise owns the root and drives it to a fixed
// target; a carrier that walked on its mind's request during the rise left that target, the other
// body followed it through the pair resolver at exact contact, and so stood inside the spot the rise
// was bound for and had it refused. Here the rising body is asked to back away across the whole
// rise and the other to follow it, through `resolvePhysicalSupportedPair` as a bout steps them.
test("a_rising_body_that_is_asked_to_walk_keeps_its_carrier_on_its_rise_and_gets_up", () => {
  const registry = floorRegistry();
  const riser = physical("riser", 0, registry);
  const follower = physical("follower", 1.2, registry);
  const dt = 1 / 60;
  try {
    riser.port.beginControlStep();
    follower.port.beginControlStep();
    riser.port.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    riser.port.beginControlStep();
    assert.equal(riser.port.state, "fallen", "the fixture did not knock the body down");
    const back = { ...STOP, localRight: -1 };
    const seen = new Set();
    let heldAt = null;
    for (let step = 0; step < 6 / dt && riser.port.state !== "supported"; step += 1) {
      riser.port.request(back);
      follower.port.request(back);
      assert.equal(resolvePhysicalSupportedPair(riser.port, follower.port, dt), true);
      riser.port.beginControlStep();
      follower.port.beginControlStep();
      seen.add(riser.port.state);
      if (riser.port.state === "rising") {
        const at = riser.port.proposal(dt).prior;
        heldAt ??= { x: at.x, z: at.z };
        assert.ok(Math.hypot(at.x - heldAt.x, at.z - heldAt.z) < 1e-9,
          `the rising carrier walked ${Math.hypot(at.x - heldAt.x, at.z - heldAt.z).toFixed(4)} m off its rise`);
      }
    }
    assert.ok(seen.has("rising"), "the body never began to rise");
    assert.equal(riser.port.riseGate()?.riseAbort ?? null, null, "a rise was put back down");
    assert.equal(riser.port.state, "supported", "the body never got up");
  } finally { riser.port.dispose(); follower.port.dispose(); }
});

test("an_occupied_recovery_with_no_clear_ground_in_reach_is_refused", () => {
  // Ground only on a patch too small to hold both footprints apart: every spot in reach is either
  // inside the blocker's footprint or off the floor.
  const registry = floorRegistry((at) => Math.abs(at.x) <= 0.5 && Math.abs(at.z) <= 0.5);
  const restored = [];
  const fallen = physical("occupied-fallen", 0, registry, {
    restoreRoot: () => restored.push("root"), restoreSupportedAnatomyCollision: () => restored.push("collision") });
  const blocker = physical("occupied-blocker", 0.2, registry);
  try {
    const required = 1;
    assert.ok(Math.abs(blocker.port.carrierGround().x - fallen.port.carrierGround().x) < required,
      "the recovery fixture must intersect the sum of both declared radii");
    fallen.port.beginControlStep(); blocker.port.beginControlStep();
    fallen.port.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fallen.port.beginControlStep();
    assert.equal(fallen.port.state, "fallen");
    for (let step = 0; step < 5; step += 1) {
      fallen.port.updatePairOccupancy(blocker.port);
      advance(fallen.port, 0.1, STOP);
    }
    assert.equal(fallen.port.state, "fallen");
    assert.equal(fallen.port.diagnostic().recoveryProgress, 0);
    assert.deepEqual(restored, []);
  } finally { fallen.port.dispose(); blocker.port.dispose(); }
});

test("a_body_fallen_against_the_arena_wall_rises_inward_off_it", () => {
  // Physical contact session 02. The flat arena's wall refused every sweep that started inside its
  // band, including the rise's own, so a body lying against it could never get up.
  const registry = flatSupportedWorldRegistry();
  const radius = footprint("against-wall").radiusM;
  const limit = 13 - radius;
  const band = point(limit + 0.4, 0.3, 0);
  const inward = registry.allowedFraction(band, point(limit - 0.1, 0.3, 0), footprint("against-wall"), new Set());
  assert.equal(inward, 1, "a footprint inside the band could not leave it inward");
  for (const [label, to] of [["stays in the band", point(limit + 0.1, 0.3, 0)],
    ["runs along the wall", point(limit + 0.4, 0.3, 1)], ["stays put", band]]) {
    assert.equal(registry.allowedFraction(band, to, footprint("against-wall"), new Set()), 0, label);
  }
  const rootState = { motionType: "dynamic", position: band, velocity: point(0, 0, 0), massKg: 10, released: false };
  const fixture = physical("against-wall", band.x, registry, { rootState });
  try {
    fixture.port.beginControlStep();
    fixture.port.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fixture.port.beginControlStep();
    assert.equal(fixture.port.state, "fallen");
    for (let step = 0; step < 5 && fixture.port.state === "fallen"; step += 1) advance(fixture.port, 0.1, STOP);
    assert.equal(fixture.port.state, "rising", "a body against the wall never rose");
    const target = fixture.port.carrierGround();
    assert.ok(target.x <= limit + 1e-9, `the rise went to x ${target.x.toFixed(3)}, inside the wall's band`);
    assert.ok(band.x - target.x <= 0.4 + RECOVERY_RING_STEP_M + 1e-9,
      `the rise went ${(band.x - target.x).toFixed(3)} m, past the nearest ring that leaves the band`);
  } finally { fixture.port.dispose(); }
});
