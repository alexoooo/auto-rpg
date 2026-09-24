import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_LOCOMOTION_V1 as V1,
  constructPostureIsSupported,
  fallenDwellS,
  fighterPostureIsSupported,
  initialSupportedLocomotionState,
  isFreshStandableSupport,
  recoveredRiseS,
  RISE_POSTURE_DEADLINE,
  risingEligibility,
  risingFloorS,
  stabilityCapacity,
  stepSupportedLocomotionState,
} from "../src/supported-locomotion.ts";
import { recoveryHitInterrupted } from "../src/supported-locomotion-production.ts";

const authority = Object.freeze({ carrierPartId: "carrier", supportBindings: Object.freeze([{ role: "left" }, { role: "right" }]),
  braceCapacityMultiplier: 1, gaitStabilityScale: 1 });
const contact = (overrides = {}) => ({ safeBoundarySequence: 7, supportBinding: "left", contactedOwner: "arena-floor",
  category: "standable-world", point: [0, 0, 0], upwardNormal: [0, 1, 0], freshness: "current", ...overrides });
const boundary = (overrides = {}) => ({ dt: 0.001, safeBoundarySequence: 7, authority, liveSupport: true,
  postureSupported: true, supportEvidence: [contact()], supportedMassKg: 1, authoredShoves: [],
  recoveryGroundAvailable: true, occupancyClear: true,
  hitInterrupted: false, fallSettled: true, risingDurationS: V1.RISING_DURATION_S, ...overrides });
const state = (overrides = {}) => ({ ...initialSupportedLocomotionState(), ...overrides });

test("the_v1_stability_and_recovery_constants_are_frozen_as_measured_literals", () => {
  assert.deepEqual(V1, {
    STABILITY_DECAY_MPS_PER_S: 0.020,
    STAGGER_SPECIFIC_IMPULSE_MPS: 0.006,
    FALL_SPECIFIC_IMPULSE_MPS: 0.014,
    BRACE_CAPACITY_MULTIPLIER: 1.50,
    FALLEN_DWELL_S: 0.35,
    SUPPORT_GRACE_S: 0.35,
    RISING_DURATION_S: 0.45,
  });
});

test("the_recovery_stat_divides_the_dwell_and_the_rise_floor_on_every_reader_and_refuses_a_rise_under_its_own_floor", () => {
  const fast = { ...authority, recoveryScale: 2 };
  const slow = { ...authority, recoveryScale: 0.5 };
  assert.equal(fallenDwellS(authority), V1.FALLEN_DWELL_S, "absent reads as 1");
  assert.equal(fallenDwellS(null), V1.FALLEN_DWELL_S);
  assert.equal(fallenDwellS(fast), V1.FALLEN_DWELL_S / 2);
  assert.equal(risingFloorS(slow), V1.RISING_DURATION_S * 2);

  // The dwell, read by eligibility, by both request helpers and by a rise that has begun.
  const lying = (elapsed) => state({ state: "fallen", fallenElapsedS: elapsed });
  const ask = (auth, extra = {}) => boundary({ authority: auth,
    risingDurationS: risingFloorS(auth), ...extra });
  const justUnder = V1.FALLEN_DWELL_S / 2 - 1e-6;
  assert.equal(risingEligibility(lying(justUnder), ask(fast)).eligible, false);
  assert.equal(risingEligibility(lying(V1.FALLEN_DWELL_S / 2), ask(fast)).eligible, true);
  assert.equal(risingEligibility(lying(V1.FALLEN_DWELL_S / 2), ask(authority)).eligible, false,
    "the control: the same lie is short of the dwell at x1");
  assert.equal(risingEligibility(lying(V1.FALLEN_DWELL_S), ask(slow)).eligible, false, "x0.5 lies twice as long");

  // A fast body rises to supported at its own floor, and a slow one is still rising there.
  const risen = (auth) => {
    let next = stepSupportedLocomotionState(lying(fallenDwellS(auth)), ask(auth, { dt: 1e-6 }));
    assert.equal(next.state, "rising");
    next = stepSupportedLocomotionState({ ...next, risingElapsedS: risingFloorS(auth) - 1e-3 }, ask(auth, { dt: 2e-3 }));
    return next.state;
  };
  assert.equal(risen(fast), "supported");
  assert.equal(risen(slow), "supported");
  assert.equal(stepSupportedLocomotionState({ ...lying(V1.FALLEN_DWELL_S), state: "rising", risingElapsedS: V1.RISING_DURATION_S },
    ask(slow, { dt: 1e-3 })).state, "rising", "x0.5 is still rising where x1 would be up");

  // The floor the boundary holds a rise to is the body's own.
  assert.doesNotThrow(() => stepSupportedLocomotionState(state(), boundary({ authority: fast, risingDurationS: V1.RISING_DURATION_S / 2 })));
  assert.throws(() => stepSupportedLocomotionState(state(), boundary({ risingDurationS: V1.RISING_DURATION_S / 2 })),
    /never shorter than RISING_DURATION_S/, "the control: x1's floor refuses the same rise");
  assert.throws(() => stepSupportedLocomotionState(state(), boundary({ authority: slow, risingDurationS: V1.RISING_DURATION_S })),
    /never shorter than RISING_DURATION_S/, "and x0.5 may not rise as fast as x1");
  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => stepSupportedLocomotionState(state(), boundary({ authority: { ...authority, recoveryScale: bad } })),
      /invalid recovery scale/, String(bad));
  }
});

test("a_faster_rise_is_divided_by_the_stat_but_never_shortened_past_what_the_rising_actuator_can_accelerate", () => {
  const A = 48;
  const at = (recovery) => ({ ...authority, recoveryScale: recovery });
  // x1 is the body's own length, untouched, even where it is already past the limit.
  assert.equal(recoveredRiseS(1.1, 0.8, A, authority), 1.1);
  assert.equal(recoveredRiseS(0.45, 5, A, authority), 0.45);
  // A short lift: the division alone.
  assert.equal(recoveredRiseS(0.45, 0.05, A, at(1.5)), 0.3);
  assert.equal(recoveredRiseS(1.1, 0.8, A, at(0.5)), 2.2, "slower only lengthens");
  // A long lift at x2: stops at the limit, where 6 d / T^2 is the limit, and is admitted by it.
  const long = recoveredRiseS(0.45, 0.8, A, at(2));
  assert.ok(long > 0.225 && Math.abs(long - Math.sqrt(6 * 0.8 / A)) < 1e-6, `${long}`);
  assert.ok(6 * 0.8 / (long * long) <= A, "the port's own check admits the rise it was handed");
  // And never longer than x1's.
  assert.equal(recoveredRiseS(0.45, 2, A, at(2)), 0.45,
    "a lift x1 cannot make either stays at x1's length, and is refused as it always was");
});

test("the_stability_stat_is_a_factor_on_both_thresholds_and_on_the_recovery_interrupt_and_may_go_below_one", () => {
  const shove = (specific, extra = {}) => stepSupportedLocomotionState(state(), boundary({
    authoredShoves: [{ horizontalShoveNs: [specific, 0] }], ...extra,
  }));
  // Brace 1 is a wheel's, and the whole reason the stat is its own field: brace is refused below 1.
  const shaky = { ...authority, stabilityScale: 0.5 };
  assert.equal(shove(0.003 - 1e-6, { authority: shaky }).state, "supported");
  assert.equal(shove(0.003, { authority: shaky }).state, "staggered");
  assert.equal(shove(0.007, { authority: shaky }).state, "fallen");
  const steady = { ...authority, stabilityScale: 2 };
  assert.equal(shove(0.012 - 1e-6, { authority: steady }).state, "supported");
  assert.equal(shove(0.014, { authority: steady }).state, "staggered", "x1's fall is x2's stagger");
  assert.equal(shove(0.028, { authority: steady }).state, "fallen");
  assert.equal(shove(0.014).state, "fallen", "the control: the same shove fells a body at x1");

  const all = { ...authority, braceCapacityMultiplier: 1.5, gaitStabilityScale: 0.8, stabilityScale: 1.25 };
  assert.equal(stabilityCapacity(all), 1.5 * 0.8 * 1.25);
  assert.equal(stabilityCapacity(authority), 1, "absent reads as 1");
  assert.equal(stabilityCapacity(null), 1);

  const hit = (specific) => [{ kind: "specific-impulse", specificImpulseMps: specific }];
  assert.equal(recoveryHitInterrupted(hit(0.006), 1, authority), true);
  assert.equal(recoveryHitInterrupted(hit(0.006), 1, steady), false, "the rise is interrupted on the same rule");
  assert.equal(recoveryHitInterrupted(hit(0.003), 1, shaky), true);

  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => shove(0, { authority: { ...authority, stabilityScale: bad } }), /invalid stability scaling/, String(bad));
  }
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

test("specific_impulse_bash_is_mass_independent", () => {
  const event = Object.freeze({ kind: "specific-impulse", specificImpulseMps: 0.008 });
  const light = stepSupportedLocomotionState(state(), boundary({
    supportedMassKg: 10, authoredShoves: [event],
  }));
  const heavy = stepSupportedLocomotionState(state(), boundary({
    supportedMassKg: 1_000, authoredShoves: [event],
  }));
  assert.equal(light.state, "staggered");
  assert.equal(heavy.state, "staggered");
  assert.equal(light.specificImpulseMps, 0.008);
  assert.equal(heavy.specificImpulseMps, 0.008);
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

test("rising_belongs_to_the_body_and_a_settled_body_past_its_dwell_rises_with_nobody_asking", () => {
  // The boundary carries no request at all; a stray one handed in is ignored, so a mind that holds
  // still on the floor is lifted anyway, and a rise under way keeps going through a boundary where
  // nobody is moving.
  const fallen = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S });
  const still = boundary({ recoverRequested: false });
  assert.deepEqual(risingEligibility(fallen, still), { eligible: true, reason: null });
  const rising = stepSupportedLocomotionState(fallen, still);
  assert.equal(rising.state, "rising");
  assert.equal(stepSupportedLocomotionState(rising, still).state, "rising");
  // The control: the dwell and the settle still gate it.
  const early = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S - 0.001 });
  assert.equal(stepSupportedLocomotionState(early, boundary({ dt: 1e-6 })).state, "fallen");
  assert.equal(stepSupportedLocomotionState(fallen, boundary({ fallSettled: false })).state, "fallen");
});

test("rising_eligibility_requires_live_authority_topology_dwell_and_clearance_not_an_already_planted_foot", () => {
  const fallen = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S });
  const ready = boundary();
  assert.deepEqual(risingEligibility(fallen, ready), { eligible: true, reason: null });
  for (const [field, value, reason] of [
    ["authority", null, /authority/], ["liveSupport", false, /support chain/],
    ["recoveryGroundAvailable", false, /recovery ground/],
    ["occupancyClear", false, /obstructed/],
    ["hitInterrupted", true, /hit/],
  ]) assert.match(risingEligibility(fallen, boundary({ [field]: value })).reason, reason);
  assert.deepEqual(risingEligibility(fallen, boundary({
    supportEvidence: [contact({ category: "wall" })] })), { eligible: true, reason: null },
  "a folded body must be able to begin its bounded righting path before a foot is planted");
  assert.match(risingEligibility(state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S - 0.001 }), ready).reason,
    /dwell/);
  assert.match(risingEligibility(state({ state: "supported", fallenElapsedS: V1.FALLEN_DWELL_S }), ready).reason,
    /fallen or rising/);
  assert.equal(risingEligibility(fallen, boundary({ postureSupported: false })).eligible, true,
    "recovery exists to restore posture; fallen posture cannot be an entry prerequisite");
});

test("a_fall_level_blow_obstruction_or_lost_support_aborts_rising_state_and_leaves_no_staged_drive", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  // The mass is 1 kg and the capacity 1, so a shove of N s is its specific impulse.
  for (const rejected of [
    boundary({ authoredShoves: [{ horizontalShoveNs: [V1.FALL_SPECIFIC_IMPULSE_MPS, 0] }], hitInterrupted: true }),
    boundary({ occupancyClear: false }),
    boundary({ liveSupport: false }),
  ]) {
    const result = stepSupportedLocomotionState(rising, rejected);
    assert.equal(result.state, "fallen");
    assert.equal(result.driveStaged, false);
    assert.equal(result.risingElapsedS, 0);
  }
});

test("a_rise_is_put_down_by_the_standing_fall_line_and_a_staggering_blow_under_it_does_not_stop_it", () => {
  // Physical contact session 02: no immunity and no stagger-level interrupt, just the fall line.
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  const under = stepSupportedLocomotionState(rising, boundary({
    authoredShoves: [{ horizontalShoveNs: [V1.FALL_SPECIFIC_IMPULSE_MPS - 1e-6, 0] }], hitInterrupted: true }));
  assert.equal(under.state, "rising", "a staggering blow under the fall line put the rise down");
  assert.equal(under.driveStaged, true);
  const at = stepSupportedLocomotionState(rising, boundary({
    authoredShoves: [{ horizontalShoveNs: [V1.FALL_SPECIFIC_IMPULSE_MPS, 0] }] }));
  assert.equal(at.state, "fallen", "a blow at the fall line did not put the rise down");
  // Blows accumulate across the rise as they do standing: two under the line that sum over it fell it.
  const half = boundary({ authoredShoves: [{ horizontalShoveNs: [V1.FALL_SPECIFIC_IMPULSE_MPS * 0.6, 0] }] });
  const once = stepSupportedLocomotionState(rising, half);
  assert.equal(once.state, "rising");
  assert.equal(stepSupportedLocomotionState(once, half).state, "fallen");
  // And a staggering blow still keeps a lying body from starting to rise on that boundary.
  const lying = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S });
  assert.match(risingEligibility(lying, boundary({ hitInterrupted: true })).reason, /hit/);
});

test("the_fall_ledger_is_zeroed_as_the_rise_begins_and_does_not_follow_the_body_up", () => {
  // The ledger that put the body down stays on it while it lies, and a rise that inherited it would
  // be felled by the first touch -- or at once, before anything touched it.
  const lying = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S,
    specificImpulseMps: V1.FALL_SPECIFIC_IMPULSE_MPS * 2 });
  const rising = stepSupportedLocomotionState(lying, boundary());
  assert.equal(rising.state, "rising");
  assert.equal(rising.specificImpulseMps, 0);
  const next = stepSupportedLocomotionState(rising, boundary());
  assert.equal(next.state, "rising");
  assert.equal(next.driveStaged, true);
});

test("zero_authored_shove_is_not_a_hit_and_cannot_interrupt_rising", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  const result = stepSupportedLocomotionState(rising, boundary({
    authoredShoves: [{ horizontalShoveNs: [0, 0] }], hitInterrupted: false }));
  assert.equal(result.state, "rising");
  assert.equal(result.driveStaged, true);
});

test("rising_duration_is_bracketed_on_both_sides_of_the_frozen_boundary", () => {
  const rising = state({ state: "rising", fallenElapsedS: 0.35,
    risingElapsedS: 0.448, driveStaged: true });
  const before = stepSupportedLocomotionState(rising, boundary({ dt: 0.001 }));
  assert.equal(before.state, "rising");
  const at = stepSupportedLocomotionState(before, boundary({ dt: 0.001 }));
  assert.equal(at.state, "supported");
  const notRestored = stepSupportedLocomotionState(before,
    boundary({ dt: 0.001, postureSupported: false }));
  assert.equal(notRestored.state, "rising", "duration alone cannot relabel a folded body supported");
});

test("a_rise_that_never_reaches_posture_lies_down_at_its_deadline_and_rises_again", () => {
  // Physical contact session 02: a rise stuck without posture used to stay `rising` for ever.
  assert.equal(RISE_POSTURE_DEADLINE, 2);
  const deadline = V1.RISING_DURATION_S * RISE_POSTURE_DEADLINE;
  const folded = boundary({ dt: 0.001, postureSupported: false });
  const stuck = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: deadline - 0.0015, driveStaged: true, specificImpulseMps: 0 });
  const before = stepSupportedLocomotionState(stuck, folded);
  assert.equal(before.state, "rising", "a rise gave up before its deadline");
  const at = stepSupportedLocomotionState(before, folded);
  assert.equal(at.state, "fallen", "a rise stuck without posture outlived its deadline");
  assert.equal(at.driveStaged, false);
  assert.equal(at.fallenElapsedS, 0, "the retry lies its whole dwell again");
  // The control: posture arriving on the same boundary is a rise that finished, not one that failed.
  assert.equal(stepSupportedLocomotionState(before, boundary({ dt: 0.001 })).state, "supported");
  // And the retry is the ordinary fallen state: past its dwell it rises again.
  let body = at;
  for (let t = 0; t < V1.FALLEN_DWELL_S + 0.002 && body.state === "fallen"; t += 0.001) {
    body = stepSupportedLocomotionState(body, folded);
  }
  assert.equal(body.state, "rising", "the body never tried again");
});

test("a_fall_that_has_not_come_to_rest_holds_the_body_down_past_the_dwell_and_cannot_cancel_a_rise", () => {
  const fallen = state({ state: "fallen", fallenElapsedS: V1.FALLEN_DWELL_S * 4 });
  const moving = boundary({ fallSettled: false });
  assert.deepEqual(risingEligibility(fallen, moving), { eligible: false, reason: "the fall has not come to rest" });
  const held = stepSupportedLocomotionState(fallen, moving);
  assert.equal(held.state, "fallen");
  assert.equal(held.driveStaged, false);
  assert.equal(held.fallenElapsedS, fallen.fallenElapsedS + moving.dt, "the lie goes on counting while it waits");
  assert.equal(stepSupportedLocomotionState(fallen, boundary()).state, "rising");
  // A body's settle tracker starts again once it is up, so a rise under way must not read it.
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S, risingElapsedS: 0.1, driveStaged: true });
  assert.equal(stepSupportedLocomotionState(rising, moving).state, "rising");
  assert.throws(() => stepSupportedLocomotionState(fallen, boundary({ fallSettled: undefined })), /come to rest/);
});

test("a_rise_lasts_its_own_duration_and_never_less_than_the_frozen_one", () => {
  // Binary fractions, so the two steps land exactly on the duration.
  const durationS = 1.25;
  const dt = 2 ** -7;
  const along = boundary({ dt, risingDurationS: durationS });
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: durationS - 2 * dt, driveStaged: true });
  const before = stepSupportedLocomotionState(rising, along);
  assert.equal(before.state, "rising");
  assert.equal(stepSupportedLocomotionState(before, along).state, "supported");
  const pastFrozen = state({ ...rising, risingElapsedS: V1.RISING_DURATION_S });
  assert.equal(stepSupportedLocomotionState(pastFrozen, along).state, "rising",
    "the frozen duration is not the end of a lengthened rise");
  for (const bad of [V1.RISING_DURATION_S - 0.001, Number.NaN, Infinity, undefined]) {
    assert.throws(() => stepSupportedLocomotionState(rising, boundary({ risingDurationS: bad })),
      /never shorter than RISING_DURATION_S/, String(bad));
  }
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
