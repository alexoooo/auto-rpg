import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_LOCOMOTION_V1 as V1,
  constructPostureIsSupported,
  constructRequestsRising,
  fighterPostureIsSupported,
  fighterRequestsRising,
  initialSupportedLocomotionState,
  isFreshStandableSupport,
  risingEligibility,
  stepSupportedLocomotionState,
} from "../src/supported-locomotion.ts";

const authority = Object.freeze({ carrierPartId: "carrier", supportBindings: Object.freeze([{ role: "left" }, { role: "right" }]),
  braceCapacityMultiplier: 1, gaitStabilityScale: 1 });
const contact = (overrides = {}) => ({ safeBoundarySequence: 7, supportBinding: "left", contactedOwner: "arena-floor",
  category: "standable-world", point: [0, 0, 0], upwardNormal: [0, 1, 0], freshness: "current", ...overrides });
const boundary = (overrides = {}) => ({ dt: 0.001, safeBoundarySequence: 7, authority, liveSupport: true,
  postureSupported: true, supportEvidence: [contact()], supportedMassKg: 1, authoredShoves: [],
  recoverRequested: false, occupancyClear: true, hitInterrupted: false, ...overrides });
const state = (overrides = {}) => ({ ...initialSupportedLocomotionState(), ...overrides });

test("the_v1_stability_and_recovery_constants_are_frozen_as_measured_literals", () => {
  assert.deepEqual(V1, {
    STABILITY_DECAY_MPS_PER_S: 0.020,
    STAGGER_SPECIFIC_IMPULSE_MPS: 0.006,
    FALL_SPECIFIC_IMPULSE_MPS: 0.014,
    BRACE_CAPACITY_MULTIPLIER: 1.50,
    FALLEN_DWELL_S: 0.35,
    SUPPORT_GRACE_S: 0.10,
    RISING_DURATION_S: 0.45,
  });
});

test("wall_opponent_weapon_debris_and_stale_contacts_are_not_standable_ground", () => {
  const roles = new Set(["left", "right"]);
  assert.equal(isFreshStandableSupport(contact(), 7, roles), true);
  for (const category of ["wall", "opponent", "weapon", "proxy", "detached-part", "debris"]) {
    assert.equal(isFreshStandableSupport(contact({ category }), 7, roles), false, category);
  }
  assert.equal(isFreshStandableSupport(contact({ freshness: "stale" }), 7, roles), false);
  assert.equal(isFreshStandableSupport(contact({ safeBoundarySequence: 6 }), 7, roles), false);
  assert.equal(isFreshStandableSupport(contact({ supportBinding: "foreign" }), 7, roles), false);
});

test("authored_shove_not_solver_impulse_drives_supported_staggered_and_fallen", () => {
  const solverOnly = stepSupportedLocomotionState(state(), boundary({ solverImpulse: 999 }));
  assert.equal(solverOnly.state, "supported");
  assert.equal(solverOnly.specificImpulseMps, 0);
  const staggered = stepSupportedLocomotionState(state(), boundary({
    authoredShoves: [{ horizontalShoveNs: [0.0061, 0] }], supportedMassKg: 1,
  }));
  assert.equal(staggered.state, "staggered");
  const fallen = stepSupportedLocomotionState(state(), boundary({
    authoredShoves: [{ horizontalShoveNs: [1.41, 0] }], supportedMassKg: 100,
  }));
  assert.equal(fallen.state, "fallen");
});

test("an_upright_carrier_with_folded_torso_or_inverted_head_is_not_supported", () => {
  assert.equal(fighterPostureIsSupported({ pelvisUpDot: 1, torsoHeightAbovePelvisM: 0.5,
    headHeightAboveTorsoM: 0.2 }), true);
  assert.equal(fighterPostureIsSupported({ pelvisUpDot: 1, torsoHeightAbovePelvisM: 0.01,
    headHeightAboveTorsoM: 0.2 }), false);
  assert.equal(fighterPostureIsSupported({ pelvisUpDot: 1, torsoHeightAbovePelvisM: 0.5,
    headHeightAboveTorsoM: -0.2 }), false);
  assert.equal(constructPostureIsSupported({ chainContinuous: true, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.2 }), true);
  assert.equal(constructPostureIsSupported({ chainContinuous: false, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.2 }), false);
});

test("Fighter_movement_input_and_Construct_recover_Action_share_recovery_gates_without_aliasing_hand_recover", () => {
  const fallen = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S });
  assert.equal(fighterRequestsRising(fallen, { localForward: 0, localRight: 0, yaw: 0 }), false);
  assert.equal(fighterRequestsRising(fallen, { localForward: 0.1, localRight: 0, yaw: 0 }), true);
  assert.equal(constructRequestsRising(fallen, false), false, "a humanoid hand recover tactic is irrelevant");
  assert.equal(constructRequestsRising(fallen, true), true, "the locomotion recover Action is authoritative");
  const early = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S - 0.001 });
  assert.equal(fighterRequestsRising(early, { localForward: 1, localRight: 0, yaw: 0 }), false);
  assert.equal(constructRequestsRising(early, true), false);
});

test("rising_eligibility_requires_live_authority_standable_support_dwell_and_clearance", () => {
  const fallen = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S });
  const ready = boundary({ recoverRequested: true });
  assert.deepEqual(risingEligibility(fallen, ready), { eligible: true, reason: null });
  for (const [field, value, reason] of [
    ["authority", null, /authority/], ["liveSupport", false, /support chain/],
    ["occupancyClear", false, /obstructed/],
    ["recoverRequested", false, /not requested/], ["hitInterrupted", true, /hit/],
  ]) assert.match(risingEligibility(fallen, boundary({ recoverRequested: true, [field]: value })).reason, reason);
  assert.match(risingEligibility(fallen, boundary({ recoverRequested: true,
    supportEvidence: [contact({ category: "wall" })] })).reason, /standable/);
  assert.match(risingEligibility(state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S - 0.001 }), ready).reason,
    /dwell/);
  assert.match(risingEligibility(state({ state: "supported", fallenElapsedS: V1.FALLEN_DWELL_S }), ready).reason,
    /fallen or rising/);
  assert.equal(risingEligibility(fallen, boundary({ recoverRequested: true, postureSupported: false })).eligible, true,
    "recovery exists to restore posture; fallen posture cannot be an entry prerequisite");
});

test("a_hit_obstruction_or_lost_support_aborts_rising_state_and_leaves_no_staged_drive", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  for (const rejected of [
    boundary({ recoverRequested: true, hitInterrupted: true }),
    boundary({ recoverRequested: true, occupancyClear: false }),
    boundary({ recoverRequested: true, liveSupport: false }),
    boundary({ recoverRequested: false }),
  ]) {
    const result = stepSupportedLocomotionState(rising, rejected);
    assert.equal(result.state, "fallen");
    assert.equal(result.driveStaged, false);
    assert.equal(result.risingElapsedS, 0);
  }
  const shoved = stepSupportedLocomotionState(rising, boundary({ recoverRequested: true,
    authoredShoves: [{ horizontalShoveNs: [V1.FALL_SPECIFIC_IMPULSE_MPS, 0] }], hitInterrupted: true }));
  assert.equal(shoved.state, "fallen");
  assert.equal(shoved.driveStaged, false);
});

test("the_decaying_fall_ledger_does_not_impersonate_a_fresh_hit_during_rising", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true, specificImpulseMps: V1.FALL_SPECIFIC_IMPULSE_MPS * 2 });
  const result = stepSupportedLocomotionState(rising,
    boundary({ recoverRequested: true, hitInterrupted: false }));
  assert.equal(result.state, "rising");
  assert.equal(result.driveStaged, true);
});

test("zero_authored_shove_is_not_a_hit_and_cannot_interrupt_rising", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  const result = stepSupportedLocomotionState(rising, boundary({ recoverRequested: true,
    authoredShoves: [{ horizontalShoveNs: [0, 0] }], hitInterrupted: false }));
  assert.equal(result.state, "rising");
  assert.equal(result.driveStaged, true);
});

test("rising_duration_is_bracketed_on_both_sides_of_the_frozen_boundary", () => {
  const rising = state({ state: "rising", fallenElapsedS: 0.35,
    risingElapsedS: 0.448, driveStaged: true });
  const before = stepSupportedLocomotionState(rising, boundary({ dt: 0.001, recoverRequested: true }));
  assert.equal(before.state, "rising");
  const at = stepSupportedLocomotionState(before, boundary({ dt: 0.001, recoverRequested: true }));
  assert.equal(at.state, "supported");
  const notRestored = stepSupportedLocomotionState(before,
    boundary({ dt: 0.001, recoverRequested: true, postureSupported: false }));
  assert.equal(notRestored.state, "rising", "duration alone cannot relabel a folded body supported");
});

test("a_required_support_lost_mid_stride_cancels_on_the_next_safe_boundary", () => {
  let current = state();
  current = stepSupportedLocomotionState(current, boundary({ dt: V1.SUPPORT_GRACE_S, liveSupport: false }));
  assert.equal(current.state, "supported", "the exact grace edge is retained");
  current = stepSupportedLocomotionState(current, boundary({ dt: 0.001, liveSupport: false }));
  assert.equal(current.state, "fallen");
  assert.equal(current.driveStaged, false);
});

test("renamed_parts_preserve_support_while_tiny_support_spam_cannot_raise_the_action_cap", () => {
  const spam = Array.from({ length: 100 }, (_, index) => contact({ contactedOwner: `grain-${index}` }));
  const result = stepSupportedLocomotionState(state(), boundary({ supportEvidence: spam }));
  assert.equal(result.state, "supported");
  assert.equal(result.specificImpulseMps, 0, "contact count is evidence, never added stability capacity");
  const foreign = spam.map((row) => ({ ...row, supportBinding: "renamed-foreign-binding" }));
  const lost = stepSupportedLocomotionState(state({ supportMissingS: V1.SUPPORT_GRACE_S }),
    boundary({ supportEvidence: foreign }));
  assert.equal(lost.state, "fallen");
});

test("stagger_fall_brace_decay_and_cumulative_shoves_cross_each_frozen_threshold_in_both_directions", () => {
  const shove = (specific, extra = {}) => stepSupportedLocomotionState(state(), boundary({
    authoredShoves: [{ horizontalShoveNs: [specific, 0] }], ...extra,
  }));
  assert.equal(shove(0.006 - 1e-6).state, "supported");
  assert.equal(shove(0.006).state, "staggered");
  assert.equal(shove(0.014 - 1e-6).state, "staggered");
  assert.equal(shove(0.014).state, "fallen");

  const braced = { ...authority, braceCapacityMultiplier: 1.50 };
  assert.equal(shove(0.014 * 1.49, { authority: braced }).state, "staggered");
  assert.equal(shove(0.014 * 1.50, { authority: braced }).state, "fallen");
  const degraded = { ...authority, gaitStabilityScale: 0.5 };
  assert.equal(shove(0.006 * 0.5, { authority: degraded }).state, "staggered");

  let cumulative = stepSupportedLocomotionState(state(), boundary({ dt: 0.000001,
    authoredShoves: [{ horizontalShoveNs: [0.0031, 0] }] }));
  assert.equal(cumulative.state, "supported");
  cumulative = stepSupportedLocomotionState(cumulative, boundary({ dt: 0.000001,
    authoredShoves: [{ horizontalShoveNs: [0.0031, 0] }] }));
  assert.equal(cumulative.state, "staggered");

  const decayed = stepSupportedLocomotionState(state({ state: "staggered", specificImpulseMps: 0.0065 }),
    boundary({ dt: 0.05 }));
  assert.equal(decayed.state, "supported");
  assert.ok(Math.abs(decayed.specificImpulseMps - 0.0055) < 1e-12);
});
