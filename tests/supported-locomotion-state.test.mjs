import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_LOCOMOTION_V1 as V1,
  constructPostureIsSupported,
  fallenDwellS,
  initialSupportedLocomotionState,
  isFreshStandableSupport,
  ledgerFalls,
  recoveredRiseS,
  RISE_POSTURE_DEADLINE,
  risingEligibility,
  risingFloorS,
  stabilityLines,
  stepSupportedLocomotionState,
} from "../src/supported-locomotion.ts";
import { recoveryHitInterrupted } from "../src/supported-locomotion-production.ts";
import { rockingDecayMps2, TIPPING, tippingLineMps } from "../src/tipping.ts";

// Physical contact session 08: the ledger's lines are the body's own. A stated body -- its centre of
// mass 1 m up, a 0.5 m gyration, a square base 0.2 m from the centre each way -- and every crossing
// below is written against the lines that geometry gives, through the functions the ledger reads.
const H = 1, K = 0.5, R = 0.2;
const square = (r) => Object.freeze([[-r, -r], [r, -r], [r, r], [-r, r]].map((point) => Object.freeze(point)));
const geometry = (overrides = {}) => Object.freeze({ comHeightM: H, gyrationM: K, groundY: 0, hull: square(R), ...overrides });
const tipping = geometry();
const authority = Object.freeze({ carrierPartId: "carrier", supportBindings: Object.freeze([{ role: "left" }, { role: "right" }]) });
/** The fall line of a geometry along x, as the ledger reads it. */
const fallAlong = (shape, x = 1, z = 0) => stabilityLines(authority, shape, x, z).fallAtMps;
const { fallAtMps: F, staggerAtMps: S, decayMps2: D } = stabilityLines(authority, tipping, 1, 0);
const contact = (overrides = {}) => ({ safeBoundarySequence: 7, supportBinding: "left", contactedOwner: "arena-floor",
  category: "standable-world", point: [0, 0, 0], upwardNormal: [0, 1, 0], freshness: "current", ...overrides });
const boundary = (overrides = {}) => ({ dt: 0.001, safeBoundarySequence: 7, authority, liveSupport: true,
  postureSupported: true, supportEvidence: [contact()], supportedMassKg: 1, contactShoves: [], tipping,
  recoveryGroundAvailable: true, occupancyClear: true,
  hitInterrupted: false, fallSettled: true, risingDurationS: V1.RISING_DURATION_S, ...overrides });
const state = (overrides = {}) => ({ ...initialSupportedLocomotionState(), ...overrides });

test("the_v1_recovery_constants_are_frozen_and_no_stability_line_is_one_of_them", () => {
  assert.deepEqual(V1, {
    FALLEN_DWELL_S: 0.35,
    SUPPORT_GRACE_S: 0.35,
    RISING_DURATION_S: 0.45,
  });
  // The stagger line is a stated fraction of the body's own fall line, the one number session 06's
  // two lines left behind.
  assert.equal(TIPPING.STAGGER_FRACTION, 0.12 / 0.28);
  assert.ok(Math.abs(F - tippingLineMps(H, K, R)) < 1e-12, "the fall line is the rocking body's");
  assert.ok(Math.abs(S - F * 0.12 / 0.28) < 1e-12);
  assert.ok(Math.abs(D - rockingDecayMps2(H, R)) < 1e-12);
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
    contactShoves: [{ horizontalShoveNs: [specific, 0] }], ...extra,
  }));
  const shaky = { ...authority, stabilityScale: 0.5 };
  assert.equal(shove(S * 0.5 - 1e-6, { authority: shaky }).state, "supported");
  assert.equal(shove(S * 0.5, { authority: shaky }).state, "staggered");
  assert.equal(shove(F * 0.5, { authority: shaky }).state, "fallen");
  const steady = { ...authority, stabilityScale: 2 };
  assert.equal(shove(S * 2 - 1e-6, { authority: steady }).state, "supported");
  assert.equal(shove(F, { authority: steady }).state, "staggered", "x1's fall is x2's stagger");
  assert.equal(shove(F * 2, { authority: steady }).state, "fallen");
  assert.equal(shove(F).state, "fallen", "the control: the same shove fells a body at x1");
  assert.ok(Math.abs(stabilityLines(steady, tipping, 1, 0).fallAtMps - 2 * F) < 1e-12, "the stat scales the line");
  assert.equal(stabilityLines(steady, tipping, 1, 0).decayMps2, D, "and gravity rights the body as fast as before");

  const hit = (specific) => [{ horizontalShoveNs: [specific, 0] }];
  assert.equal(recoveryHitInterrupted(hit(S), 1, authority, tipping), true);
  assert.equal(recoveryHitInterrupted(hit(S * 0.99), 1, authority, tipping), false);
  assert.equal(recoveryHitInterrupted(hit(S), 1, steady, tipping), false, "the rise is interrupted on the same rule");
  assert.equal(recoveryHitInterrupted(hit(S * 0.5), 1, shaky, tipping), true);

  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => shove(0, { authority: { ...authority, stabilityScale: bad } }), /invalid stability scaling/, String(bad));
  }
});

test("the_lines_are_the_body_s_own_geometry_wider_is_harder_higher_is_easier_and_no_base_is_never_tipped", () => {
  const shove = (specific, extra = {}) => stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [specific, 0] }], ...extra,
  }));
  // The control: F fells the stated body.
  assert.equal(shove(F).state, "fallen");
  // A wider base holds the same blow, and a taller body on the same base does not.
  assert.equal(shove(F, { tipping: geometry({ hull: square(0.3) }) }).state, "staggered");
  assert.ok(tippingLineMps(H, K, 0.3) > F);
  const tall = geometry({ comHeightM: 1.5 });
  assert.equal(shove(fallAlong(tall), { tipping: tall }).state, "fallen");
  assert.ok(fallAlong(tall) < F);
  // A narrow base falls along its narrow way first: 0.1 m across z, 0.3 m along x.
  const narrow = geometry({ hull: Object.freeze([[-0.3, -0.1], [0.3, -0.1], [0.3, 0.1], [-0.3, 0.1]]) });
  const across = fallAlong(narrow, 0, 1);
  assert.ok(Math.abs(across - tippingLineMps(H, K, 0.1)) < 1e-12);
  assert.equal(stepSupportedLocomotionState(state(), boundary({ tipping: narrow,
    contactShoves: [{ horizontalShoveNs: [0, across] }] })).state, "fallen");
  assert.notEqual(shove(across, { tipping: narrow }).state, "fallen", "the same blow along the long way");
  // A body with no tipping reading cannot be tipped: support grace is what puts it down.
  assert.equal(shove(F * 100, { tipping: null }).state, "supported");
  assert.equal(stabilityLines(authority, null).fallAtMps, Infinity);
  // And a centre of mass outside its base with nothing on the ledger is not a fall: its locomotion
  // is holding it up.
  const outside = geometry({ hull: Object.freeze([[0.1, -0.1], [0.3, -0.1], [0.3, 0.1], [0.1, 0.1]]) });
  assert.equal(stepSupportedLocomotionState(state(), boundary({ tipping: outside })).state, "supported");
  assert.equal(ledgerFalls({ specificImpulseMps: 0, leanX: 0, leanZ: 0 }, authority, outside), false);
  assert.equal(shove(1e-9, { tipping: outside }).state, "fallen", "the control: any lean at all tips it");
});

test("the_ledger_is_a_vector_opposite_blows_cancel_and_gravity_rights_a_lean_along_its_own_way", () => {
  const blows = (...pushes) => boundary({ contactShoves: pushes.map((push) => ({ horizontalShoveNs: push })) });
  const cancelled = stepSupportedLocomotionState(state(), blows([F, 0], [-F, 0]));
  assert.equal(cancelled.state, "supported");
  assert.equal(cancelled.specificImpulseMps, 0);
  // The control: the same two blows from one side are a fall.
  assert.equal(stepSupportedLocomotionState(state(), blows([F / 2, 0], [F / 2, 0])).state, "fallen");
  // Two blows at right angles add as a vector: 0.8 F each way is 1.13 F along the diagonal, where
  // the square reaches R sqrt(2) and the line is higher still.
  const diagonal = stepSupportedLocomotionState(state(), blows([F * 0.8, 0], [0, F * 0.8]));
  assert.ok(Math.abs(diagonal.specificImpulseMps - F * 0.8 * Math.SQRT2) < 1e-12);
  assert.equal(diagonal.state, "staggered", "the diagonal line is past 1.13 F");
  assert.ok(stabilityLines(authority, tipping, 1, 1).fallAtMps > F * 0.8 * Math.SQRT2);
  // A lean decays along its own direction at the rate its own reach sets, keeping its direction.
  const leaning = state({ state: "staggered", specificImpulseMps: 0.1, leanX: 0.06, leanZ: 0.08 });
  const next = stepSupportedLocomotionState(leaning, boundary({ dt: 0.01 }));
  const along = stabilityLines(authority, tipping, 0.06, 0.08).decayMps2;
  assert.ok(Math.abs(next.specificImpulseMps - (0.1 - along * 0.01)) < 1e-12, String(next.specificImpulseMps));
  assert.ok(Math.abs(next.leanX / next.leanZ - 0.75) < 1e-12, "the lean turned while it decayed");
  // A blow against the lean rights the body faster than gravity does.
  const struck = stepSupportedLocomotionState(leaning, boundary({ dt: 1e-6,
    contactShoves: [{ horizontalShoveNs: [-0.06, -0.08] }] }));
  assert.ok(Math.abs(struck.specificImpulseMps - along * 1e-6) < 1e-12, String(struck.specificImpulseMps));
});

test("a_blow_counts_by_its_lever_about_the_base", () => {
  // Struck at twice the centre of mass's height the blow tips twice as hard, at the ground not at all.
  const at = (atY, ns) => stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [ns, 0], atY }] }));
  assert.equal(at(2 * H, F / 2).state, "fallen");
  assert.equal(at(H, F / 2).state, "staggered", "the control: at the centre of mass it is half a fall");
  assert.equal(at(undefined, F / 2).state, "staggered", "no height is the centre of mass");
  assert.equal(at(0, F * 100).specificImpulseMps, 0, "a blow along the floor tips nothing");
  assert.throws(() => at(Number.NaN, 1), /finite height/);
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

test("the_contact_shove_not_solver_impulse_drives_supported_staggered_and_fallen", () => {
  const solverOnly = stepSupportedLocomotionState(state(), boundary({ solverImpulse: 999 }));
  assert.equal(solverOnly.state, "supported");
  assert.equal(solverOnly.specificImpulseMps, 0);
  const staggered = stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [S * 1.02, 0] }], supportedMassKg: 1,
  }));
  assert.equal(staggered.state, "staggered");
  const fallen = stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [F * 101, 0] }], supportedMassKg: 100,
  }));
  assert.equal(fallen.state, "fallen");
});

test("a_shove_is_mass_dependent_and_its_vertical_part_moves_no_ledger", () => {
  // Physical contact session 06 deleted the mass-independent bash: every contact files the impulse
  // it moved, and the ledger divides it by the body's stability mass. One blow that staggers a 10 kg
  // body is a hundredth of that to a 1000 kg one.
  const ns = S * 10 * 1.5;
  const event = Object.freeze({ horizontalShoveNs: [ns * 0.6, ns * 0.8], verticalShoveNs: ns * 5 });
  const light = stepSupportedLocomotionState(state(), boundary({ supportedMassKg: 10, contactShoves: [event] }));
  const heavy = stepSupportedLocomotionState(state(), boundary({ supportedMassKg: 1_000, contactShoves: [event] }));
  assert.equal(light.state, "staggered");
  assert.equal(heavy.state, "supported");
  assert.ok(Math.abs(light.specificImpulseMps - ns / 10) < 1e-12, `${light.specificImpulseMps}`);
  assert.ok(Math.abs(heavy.specificImpulseMps - ns / 1_000) < 1e-12, `${heavy.specificImpulseMps}`);
  // The vertical part is carried for session 07 and read by no threshold: straight up, a body that
  // a horizontal tenth of it would fell stays put.
  const lift = stepSupportedLocomotionState(state(), boundary({ supportedMassKg: 10,
    contactShoves: [{ horizontalShoveNs: [0, 0], verticalShoveNs: F * 10 * 10 }] }));
  assert.equal(lift.state, "supported");
  assert.equal(lift.specificImpulseMps, 0);
  assert.throws(() => stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [0, 0], verticalShoveNs: Number.NaN }] })), /finite vertical/);
});

test("a_carrier_with_a_broken_chain_or_a_folded_body_is_not_supported", () => {
  // Session 08 left one posture predicate for every body.
  assert.equal(constructPostureIsSupported({ chainContinuous: true, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.2 }), true);
  assert.equal(constructPostureIsSupported({ chainContinuous: false, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.2 }), false);
  assert.equal(constructPostureIsSupported({ chainContinuous: true, carrierUpDot: 0.5,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.2 }), false);
  assert.equal(constructPostureIsSupported({ chainContinuous: true, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.05, terminalHeightAboveRootM: 0.2 }), false);
  assert.equal(constructPostureIsSupported({ chainContinuous: true, carrierUpDot: 1,
    rootHeightAboveCarrierM: 0.3, terminalHeightAboveRootM: 0.01 }), false);
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
    boundary({ contactShoves: [{ horizontalShoveNs: [F, 0] }], hitInterrupted: true }),
    boundary({ occupancyClear: false }),
    boundary({ liveSupport: false }),
  ]) {
    const result = stepSupportedLocomotionState(rising, rejected);
    assert.equal(result.state, "fallen");
    assert.equal(result.driveStaged, false);
    assert.equal(result.risingElapsedS, 0);
  }
});

test("a_rise_is_put_down_by_the_fall_line_of_the_body_it_is_and_a_staggering_blow_under_it_does_not_stop_it", () => {
  // Physical contact session 02: no immunity and no stagger-level interrupt, just the fall line.
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  const under = stepSupportedLocomotionState(rising, boundary({
    contactShoves: [{ horizontalShoveNs: [F - 1e-6, 0] }], hitInterrupted: true }));
  assert.equal(under.state, "rising", "a staggering blow under the fall line put the rise down");
  assert.equal(under.driveStaged, true);
  const at = stepSupportedLocomotionState(rising, boundary({
    contactShoves: [{ horizontalShoveNs: [F, 0] }] }));
  assert.equal(at.state, "fallen", "a blow at the fall line did not put the rise down");
  // Session 08: the line is the geometry the boundary hands over. A body half-way up is low on its
  // base, and the blow that fells it standing does not fell it there.
  const low = geometry({ comHeightM: 0.4 });
  assert.equal(stepSupportedLocomotionState(rising, boundary({ tipping: low,
    contactShoves: [{ horizontalShoveNs: [F, 0] }] })).state, "rising");
  assert.equal(stepSupportedLocomotionState(rising, boundary({ tipping: low,
    contactShoves: [{ horizontalShoveNs: [fallAlong(low), 0] }] })).state, "fallen");
  // Blows accumulate across the rise as they do standing: two under the line that sum over it fell it.
  const half = boundary({ dt: 1e-6, contactShoves: [{ horizontalShoveNs: [F * 0.6, 0] }] });
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
    specificImpulseMps: F * 2, leanX: F * 2 });
  const rising = stepSupportedLocomotionState(lying, boundary());
  assert.equal(rising.state, "rising");
  assert.equal(rising.specificImpulseMps, 0);
  assert.equal(rising.leanX, 0);
  const next = stepSupportedLocomotionState(rising, boundary());
  assert.equal(next.state, "rising");
  assert.equal(next.driveStaged, true);
});

test("zero_authored_shove_is_not_a_hit_and_cannot_interrupt_rising", () => {
  const rising = state({ state: "rising", fallenElapsedS: V1.FALLEN_DWELL_S,
    risingElapsedS: 0.1, driveStaged: true });
  const result = stepSupportedLocomotionState(rising, boundary({
    contactShoves: [{ horizontalShoveNs: [0, 0] }], hitInterrupted: false }));
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

test("stagger_fall_decay_and_cumulative_shoves_cross_each_line_in_both_directions", () => {
  const shove = (specific, extra = {}) => stepSupportedLocomotionState(state(), boundary({
    contactShoves: [{ horizontalShoveNs: [specific, 0] }], ...extra,
  }));
  assert.equal(shove(S - 1e-6).state, "supported");
  assert.equal(shove(S).state, "staggered");
  assert.equal(shove(F - 1e-6).state, "staggered");
  assert.equal(shove(F).state, "fallen");


  let cumulative = stepSupportedLocomotionState(state(), boundary({ dt: 0.000001,
    contactShoves: [{ horizontalShoveNs: [S * 0.52, 0] }] }));
  assert.equal(cumulative.state, "supported");
  cumulative = stepSupportedLocomotionState(cumulative, boundary({ dt: 0.000001,
    contactShoves: [{ horizontalShoveNs: [S * 0.52, 0] }] }));
  assert.equal(cumulative.state, "staggered");

  const decayed = stepSupportedLocomotionState(state({ state: "staggered", specificImpulseMps: S + D * 0.025,
    leanX: S + D * 0.025 }), boundary({ dt: 0.05 }));
  assert.equal(decayed.state, "supported");
  assert.ok(Math.abs(decayed.specificImpulseMps - (S - D * 0.025)) < 1e-12);
});
