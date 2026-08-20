//! The guard that watches the blow: what it reads, when it refuses to move, and
//! the two rules that stop it eating the strike.
//!
//! Every fixture here is a hand-placed `ObservedOpponent` built from `BLANK`
//! field by field rather than a fight that happened to go a certain way. That is
//! the whole point of the exercise: a guard height that came out right in a
//! driven world is evidence about the world as much as about the read, and the
//! claim being made is about the read.
//!
//! **The subject stands exactly two world units tall**, which is not the
//! fixture's Fighter and is deliberate. A reading is `(tip.z - foe.z) /
//! standing_height` and a band is a fraction of the same height, so at exactly
//! two the two are one number scaled by two, exactly, in both directions. Every
//! assertion below is then about the rule rather than about where 16.16 division
//! truncated.

use fx::{Angle, Fx, Vec3};
use policy::{
    incoming_height, EmbodiedPolicy, TacticalConfig, TacticalEmbodiedPolicy, TacticalPhase,
    GUARD_COMMIT_TICKS, GUARD_READ_DEADBAND_RAW,
};
use sim::{
    ArticulatedObservation, BodyPart, CombatHeight, EntityId, ObservedOpponent, RegionVolume,
    Scenario, SegmentPose, ARM_MIN_REACH_RAW,
};

const ARM: Fx = Fx::from_ratio(3, 4);
const STANDING: Fx = Fx::from_int(2);
/// The subject's own blade. With [`ARM`] it makes the reach envelope the guard's
/// range gate is measured against exactly 1.75 world units.
const OWN_BLADE: Fx = Fx::ONE;
const TORSO_RADIUS: Fx = Fx::from_ratio(2, 5);

/// The deadband fixture's three numbers, shared by the test that uses them and
/// the test that checks they still straddle the constant.
///
/// `START` sits 576 raw under the LOW/MID boundary at 24,576, so *both* steps
/// below carry the blade into the MID band and neither half of the deadband test
/// can be satisfied by the band rule instead.
const START: i32 = 24_000;
const SMALL: i32 = 2_000;
const LARGE: i32 = 5_000;

/// What the planner leaves in an arm it is not using, and what a refused guard
/// therefore looks like: `neutral_articulated_command`'s row.
const NEUTRAL_REACH: Fx = Fx::ZERO;
/// What a guard carrying something asks for. `embodied_guard`'s `GUARD_REACH`,
/// written out here because the constant is private and the number is the whole
/// difference between "the guard wrote this arm" and "the planner did".
const GUARD_REACH: Fx = Fx::from_ratio(3, 4);

/// A subject facing `+x` at the origin, armed in the right hand and carrying a
/// plate in the left.
///
/// Its guard arm is therefore index 0, which is `1 - weapon` -- the arm
/// `embodied_script.rs` assembles a guard into and the arm `lab embodied` reads
/// as the guard.
fn subject() -> ArticulatedObservation {
    let mut obs = ArticulatedObservation::BLANK;
    obs.subject = EntityId::new(0, 0);
    obs.capabilities = ArticulatedObservation::RIGHT_WEAPON
        | ArticulatedObservation::RIGHT_GRIP
        | ArticulatedObservation::LEFT_GRIP
        | ArticulatedObservation::SHIELD;
    obs.body_position = Vec3::ZERO;
    obs.body_yaw = Angle::ZERO;
    obs.arm_length = ARM;
    obs.standing_height = STANDING;
    obs.arms[0].equipment = Some(2);
    obs.arms[1].equipment = Some(1);
    obs.weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(ARM, Fx::ZERO, Fx::ONE),
        tip: Vec3::new(ARM + OWN_BLADE, Fx::ZERO, Fx::ONE),
        radius: Fx::from_ratio(1, 32),
    });
    obs
}

/// An opponent standing `gap` ahead on the same floor, with a torso to aim at.
fn opponent(gap: Fx) -> ObservedOpponent {
    let mut foe = ObservedOpponent::BLANK;
    foe.id = EntityId::new(1, 0);
    foe.body_position = Vec3::new(gap, Fx::ZERO, Fx::ZERO);
    foe.regions[BodyPart::Torso as usize] = RegionVolume {
        lower: foe.body_position + Vec3::new(Fx::ZERO, Fx::ZERO, Fx::ONE),
        upper: foe.body_position + Vec3::new(Fx::ZERO, Fx::ZERO, Fx::from_ratio(3, 2)),
        radius: TORSO_RADIUS,
        present: true,
    };
    foe
}

/// A horizontal blade in the opponent's right hand, its tip `raw` up the
/// subject's own height scale and `tip_x` in front of the subject.
///
/// Horizontal because every blade this simulation can pose is:
/// `combat::geometry::segment_pose` gives the tip the hilt's `z` exactly. The
/// hilt is placed a blade's length further out so that a reader taking the wrong
/// end of the segment is taking a genuinely different point.
fn armed(foe: &mut ObservedOpponent, raw: i32, tip_x: Fx, length: Fx) {
    let z = foe.body_position.z + Fx::from_raw(raw) * STANDING;
    foe.weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(tip_x + length, Fx::ZERO, z),
        tip: Vec3::new(tip_x, Fx::ZERO, z),
        radius: Fx::from_ratio(1, 32),
    });
}

/// The whole situation: a subject, an opponent `gap` ahead, and a blade whose
/// tip sits at `raw` and `tip_x` in front.
fn situation(gap: Fx, raw: i32, tip_x: Fx) -> ArticulatedObservation {
    let mut obs = subject();
    let mut foe = opponent(gap);
    armed(&mut foe, raw, tip_x, Fx::from_ratio(3, 2));
    obs.opponent_count = 1;
    obs.opponents[0] = foe;
    obs
}

fn at_tick(obs: &ArticulatedObservation, tick: u32) -> ArticulatedObservation {
    ArticulatedObservation { tick, ..*obs }
}

/// What the policy commands the guard arm this tick.
fn guard_arm(policy: &mut TacticalEmbodiedPolicy, obs: &ArticulatedObservation) -> sim::ArmTarget {
    policy.decide(obs).articulated.arms[0]
}

/// Reading raw for a band's own centre, so a test can name a band and get the
/// number that produces it.
fn at_band(height: CombatHeight) -> i32 {
    height.raw()
}

/// **A high cut is met with a high guard.**
///
/// The blade is the only thing that differs between this test and the next one:
/// same tick, same gap, same body, same everything else. So the guard height is
/// a function of the blade or of nothing.
#[test]
fn a_high_cut_is_met_with_a_high_guard() {
    let obs = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::HIGH), Fx::ONE);
    assert_eq!(
        incoming_height(&obs, &obs.opponents()[0]),
        Some(CombatHeight::HIGH),
        "the fixture does not present a high blade",
    );
    let mut policy = TacticalEmbodiedPolicy::default();
    let guard = guard_arm(&mut policy, &obs);
    assert_eq!(guard.height, CombatHeight::HIGH);
    assert_eq!(guard.reach, GUARD_REACH, "the guard arm was not written at all");
}

/// **A low cut is met with a low guard**, from the same fixture with one field
/// moved.
#[test]
fn a_low_cut_is_met_with_a_low_guard() {
    let obs = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::LOW), Fx::ONE);
    assert_eq!(incoming_height(&obs, &obs.opponents()[0]), Some(CombatHeight::LOW));
    let mut policy = TacticalEmbodiedPolicy::default();
    assert_eq!(guard_arm(&mut policy, &obs).height, CombatHeight::LOW);
}

/// **The deadband, bounded from both sides.**
///
/// A test that only checked the first half is satisfied by a guard that never
/// moves at all, which is precisely the bug this session exists to fix, and this
/// repository has shipped that shape of test twice.
///
/// The blade starts just below the LOW/MID boundary and both steps cross it, so
/// neither half of this test can be satisfied by the band rule: the small step
/// puts the blade in a *different band* and the guard must still refuse it, and
/// the large step is the same crossing with more travel behind it. The only
/// thing that separates the two is [`GUARD_READ_DEADBAND_RAW`].
///
/// Both reads are taken far outside [`GUARD_COMMIT_TICKS`] of the first, or the
/// window would be the thing refusing the small step and the deadband would go
/// unexercised.
///
/// Demonstrated rather than assumed, on 2026-08-18: widening the deadband to
/// 6,000 leaves this test failing on `a blade that moved 5000 raw -- more than
/// the deadband -- did not move the guard`, and narrowing it to zero leaves it
/// failing on the assertion above that.
#[test]
fn a_blade_that_has_not_moved_does_not_move_the_guard() {
    let gap = Fx::from_ratio(3, 2);
    let mut policy = TacticalEmbodiedPolicy::default();

    let first = situation(gap, START, Fx::ONE);
    assert_eq!(guard_arm(&mut policy, &at_tick(&first, 0)).height, CombatHeight::LOW);

    // Under the deadband. The blade is now nearer MID than LOW -- so the band
    // rule alone would move the guard -- and the guard holds anyway.
    let nudged = situation(gap, START + SMALL, Fx::ONE);
    assert_eq!(
        incoming_height(&nudged, &nudged.opponents()[0]),
        Some(CombatHeight::MID),
        "the small step must cross a band boundary or this test proves nothing",
    );
    assert_eq!(
        guard_arm(&mut policy, &at_tick(&nudged, 100)).height,
        CombatHeight::LOW,
        "a blade that moved {SMALL} raw -- under the deadband -- moved the guard",
    );

    // Over it. Measured from the reading that *set* the guard and not from the
    // one just refused, which is what makes a slow drift eventually answerable.
    let moved = situation(gap, START + LARGE, Fx::ONE);
    assert_eq!(
        guard_arm(&mut policy, &at_tick(&moved, 200)).height,
        CombatHeight::MID,
        "a blade that moved {LARGE} raw -- more than the deadband -- did not move the guard",
    );
}

/// The two steps the test above is built out of straddle the deadband.
///
/// **A separate test and not an assertion inside that one**, which is a
/// deliberate choice about what a failure says. Folded in, a deadband widened
/// past `LARGE` would fail on the precondition and never reach the assertion
/// that carries the claim, so the failure message would name the fixture instead
/// of naming the guard. Split out, the mutation fails the claim and this test
/// fails beside it, and the pair says both things.
#[test]
fn the_deadband_steps_straddle_the_deadband_they_are_measuring() {
    assert!(
        SMALL < GUARD_READ_DEADBAND_RAW,
        "the small step is no longer under the deadband, so its half proves nothing",
    );
    assert!(
        LARGE > GUARD_READ_DEADBAND_RAW,
        "the large step is no longer over the deadband, so its half proves nothing",
    );
    // And both cross the LOW/MID boundary, which is what stops the band rule
    // standing in for either half.
    assert!(START < 24_576 && START + SMALL > 24_576 && START + LARGE > 24_576);
}

/// **The commit window, bounded from both sides in ticks.**
///
/// The same over-the-deadband step, offered once inside the window and once
/// outside it. Inside, the arm has not arrived and the guard holds; outside, it
/// answers. A one-sided version of this passes for a window of any length,
/// including one that never expires.
#[test]
fn a_read_guard_holds_for_the_commit_window_before_it_is_re_read() {
    let gap = Fx::from_ratio(3, 2);
    let mut policy = TacticalEmbodiedPolicy::default();
    let low = situation(gap, at_band(CombatHeight::LOW), Fx::ONE);
    let high = situation(gap, at_band(CombatHeight::HIGH), Fx::ONE);

    assert_eq!(guard_arm(&mut policy, &at_tick(&low, 0)).height, CombatHeight::LOW);
    // The last tick the window still owns.
    assert_eq!(
        guard_arm(&mut policy, &at_tick(&high, GUARD_COMMIT_TICKS - 1)).height,
        CombatHeight::LOW,
        "the guard was re-read before its arm could have arrived",
    );
    // And the first tick it does not.
    assert_eq!(
        guard_arm(&mut policy, &at_tick(&high, GUARD_COMMIT_TICKS)).height,
        CombatHeight::HIGH,
        "the guard held past the window and never answered the blade",
    );
}

/// **A blade out of the subject's own reach returns the guard to the centre
/// line.**
///
/// A body that tracks a blade across the room has told its opponent where its
/// plate is going. Out of the subject's own reach envelope the guard goes back
/// to the centre line -- MID, bearing zero -- and both halves are asserted,
/// because "it is on the centre line" is true of a guard that never left it.
///
/// **Named for what it does and not for what the plan asked for.** It shipped
/// as `a_receding_opponent_returns_the_guard_to_the_centre_line` over a fixture
/// holding a *stationary* opponent placed out of range, which is a green test
/// asserting something the code does not do -- the exact shape `AGENTS.md` warns
/// is invisible by construction. Nothing here reads a velocity, and departure 2
/// in `embodied_guard.rs`'s header carries the measurement that says nothing can.
#[test]
fn a_blade_out_of_reach_returns_the_guard_to_the_centre_line() {
    let mut policy = TacticalEmbodiedPolicy::default();
    let near = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::HIGH), Fx::ONE);
    let near_guard = guard_arm(&mut policy, &at_tick(&near, 0));
    assert_eq!(near_guard.height, CombatHeight::HIGH, "the guard never left the centre line");

    // Four units out, tip and all: past the 1.75-unit envelope by more than the
    // blade is long, and standing still, because standing still is all this
    // fixture can express. Read after the window has expired, so the window is
    // not what is being measured.
    let away = situation(Fx::from_int(6), at_band(CombatHeight::HIGH), Fx::from_int(4));
    let guard = guard_arm(&mut policy, &at_tick(&away, GUARD_COMMIT_TICKS));
    assert_eq!(guard.height, CombatHeight::MID, "the guard tracked a blade across the room");
    assert_eq!(guard.bearing, Angle::ZERO, "the plate was still turned at a blade out of reach");
    assert_eq!(guard.reach, GUARD_REACH, "the centre-line guard is a guard and not a slack arm");
}

/// **A severed guard arm is not a guard.**
///
/// The fallback is the weapon arm covering its own line -- whatever the planner
/// was already doing -- and not a stump held out in front. Two-sided: the same
/// situation with the arm intact writes a guard, so the difference is the
/// severance and not the fixture.
#[test]
fn a_severed_guard_arm_does_not_hold_a_guard() {
    let obs = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::HIGH), Fx::ONE);
    let mut policy = TacticalEmbodiedPolicy::default();
    assert_eq!(guard_arm(&mut policy, &obs).reach, GUARD_REACH);

    let mut severed = obs;
    severed.arms[0].severed = true;
    severed.severed_mask |= 1 << BodyPart::LeftArm as u8;
    let mut policy = TacticalEmbodiedPolicy::default();
    let arm = guard_arm(&mut policy, &severed);
    assert_eq!(arm.reach, NEUTRAL_REACH, "a stump was held out at a guard's reach");
    assert_eq!(arm.effort, Fx::ZERO, "a severed arm was asked for effort");
}

/// A subject with a blade in **each** hand, so that the planner's chosen hand
/// and the guard's arm are the same arm.
///
/// `ArmRoles::of` names the right hand the weapon when both are armed, so the
/// guard wants index 0; `choose_plan` breaks its ties on the hand index, so the
/// planner wants index 0 as well. That collision is the only situation in which
/// rule 3 has anything to say, and it cannot be produced with the shipped
/// sword-and-plate arrangement at all.
fn dual_wielding(gap: Fx) -> ArticulatedObservation {
    let mut obs = situation(gap, at_band(CombatHeight::HIGH), Fx::ONE);
    obs.capabilities = ArticulatedObservation::LEFT_WEAPON
        | ArticulatedObservation::RIGHT_WEAPON
        | ArticulatedObservation::LEFT_GRIP
        | ArticulatedObservation::RIGHT_GRIP;
    obs.weapons[0] = obs.weapons[1];
    obs
}

/// **The guard never overrides a commit.**
///
/// A fighter that abandons a committed cut to answer a feint is worse than one
/// that takes the trade, and this is the one place the two arms are not
/// independent. Two-sided: before the planner takes the arm the guard owns it,
/// and while the planner is chambering and committing it does not.
///
/// Demonstrated rather than assumed, on 2026-08-18: deleting the rule leaves
/// this test failing on `the guard overwrote a committed cut`.
#[test]
fn a_committed_cut_is_not_abandoned_for_an_incoming_one() {
    let obs = dual_wielding(Fx::from_ratio(3, 2));
    let mut policy = TacticalEmbodiedPolicy::default();

    let mut measured: Option<Fx> = None;
    let mut committed: Option<Fx> = None;
    for tick in 0..200 {
        let command = policy.decide(&at_tick(&obs, tick));
        let phase = policy.planner().phase();
        let hand = policy.planner().context().plan.map(|plan| plan.hand as usize);
        match phase {
            TacticalPhase::Seek | TacticalPhase::Measure => {
                measured.get_or_insert(command.articulated.arms[0].reach);
            }
            TacticalPhase::Commit if hand == Some(0) => {
                committed.get_or_insert(command.articulated.arms[0].reach);
            }
            _ => {}
        }
    }

    assert_eq!(
        measured.expect("the planner must spend some ticks measuring"),
        GUARD_REACH,
        "the guard did not own the arm while the planner was measuring",
    );
    let committed = committed.expect("the planner must commit with hand 0 in this fixture");
    assert_ne!(committed, GUARD_REACH, "the guard overwrote a committed cut");
    assert_eq!(
        committed,
        Fx::from_raw(61_440),
        "the committed arm is not `embodied_tactics::STRIKE_COMMIT_REACH`",
    );
}

/// **A chambered cut is not overwritten by a guard either**, which the session
/// plan does not ask for.
///
/// The plan's rule 3 names `TacticalPhase::Commit` alone; the shipped rule
/// refuses `Chamber` beside it, and that enlargement had **no test at all** --
/// dropping `Chamber` from the `matches!` left all thirteen tests of this file
/// green. This is the test that fails when it is dropped, which is the only
/// reason the enlargement is allowed to stay.
///
/// The argument for it is the commit's own, one phase earlier: a chamber
/// overwritten is a commit that never happens, because the planner keeps
/// counting ticks toward a windup the arm was never sent on. The corpus was
/// measured with it in place and the performance record says the chamber half
/// was never separately measured.
///
/// Demonstrated rather than assumed, on 2026-08-18: with `Chamber` dropped from
/// the rule this test fails on `the guard overwrote a chambering cut`.
#[test]
fn a_chambered_cut_is_not_overwritten_by_a_guard() {
    let obs = dual_wielding(Fx::from_ratio(3, 2));
    let mut policy = TacticalEmbodiedPolicy::default();

    let mut chambered: Option<Fx> = None;
    for tick in 0..200 {
        let command = policy.decide(&at_tick(&obs, tick));
        let hand = policy.planner().context().plan.map(|plan| plan.hand as usize);
        if policy.planner().phase() == TacticalPhase::Chamber && hand == Some(0) {
            chambered.get_or_insert(command.articulated.arms[0].reach);
        }
    }

    let chambered = chambered.expect("the planner must chamber with hand 0 in this fixture");
    assert_ne!(chambered, GUARD_REACH, "the guard overwrote a chambering cut");
    assert_eq!(
        chambered,
        Fx::ONE,
        "the chambering arm is not `embodied_tactics::STRIKE_CHAMBER_REACH`",
    );
}

/// A subject armed in the right hand with **nothing in the left**: the fixture's
/// Brute, which is half of every body in the corpus.
///
/// `Scenario::articulated_duel` gives it `equipment: [Some(3), None]`, so its
/// guard arm is the empty hand and takes `REST_REACH`'s branch. Nothing
/// exercised that branch before 2026-08-18 -- every fixture in this file carried
/// a plate -- which is why the constant could be mutated with the whole
/// workspace still green.
fn bare_guard_hand(gap: Fx) -> ArticulatedObservation {
    let mut obs = situation(gap, at_band(CombatHeight::HIGH), Fx::ONE);
    obs.capabilities = ArticulatedObservation::RIGHT_WEAPON | ArticulatedObservation::RIGHT_GRIP;
    obs.arms[0].equipment = None;
    obs.weapons[0] = None;
    obs
}

/// **An empty guard hand is held at the joint's own floor**, and not out where a
/// hand carrying something is held.
///
/// Bounded from both sides, and the two sides have different owners.
/// Below: `integrate_arm_unbilled` clamps any target under `ARM_MIN_REACH_RAW`
/// back up to it, so a smaller number is a command the body does not honour and
/// a record that claims otherwise. Above: `body_region_volumes` builds an arm
/// from the shoulder to the hand, so an extended empty hand lengthens a
/// torso-grade interceptor into the line -- 1.49x on the articulated roster,
/// measured -- and an empty hand held out is a target rather than a guard. The
/// two leave exactly the floor.
///
/// Asserted on the commanded row rather than on the constant, so the empty-hand
/// branch has to be reached at all for this to pass.
///
/// Demonstrated rather than assumed, on 2026-08-18: at `Fx::ZERO` this fails on
/// the floor assertion and at `GUARD_REACH` on the one above it.
#[test]
fn an_empty_guard_hand_is_held_at_the_joints_own_floor() {
    // The fixture this is about, read off the scenario rather than described:
    // the Brute really does walk in with one hand empty.
    let duel = Scenario::articulated_duel();
    let brute = duel.units[1].articulated.expect("the brute is an articulated unit");
    assert_eq!(brute.equipment, [Some(3), None], "the fixture's Brute now carries two things");

    let obs = bare_guard_hand(Fx::from_ratio(3, 2));
    let mut policy = TacticalEmbodiedPolicy::default();
    let bare = guard_arm(&mut policy, &obs);

    // It is a guard: it read the blade and it is asking for the same effort a
    // carrying hand asks for. Without this the two bounds below are satisfied by
    // an arm nobody wrote.
    assert_eq!(bare.height, CombatHeight::HIGH, "the empty hand did not read the blade");
    assert_eq!(bare.effort, Fx::ONE, "the empty guard hand was not asked for effort");
    assert_eq!(
        bare.reach,
        Fx::from_raw(ARM_MIN_REACH_RAW),
        "an empty guard hand is not at the joint's floor",
    );
    assert!(
        bare.reach < GUARD_REACH,
        "an empty hand is held out at a carrying hand's reach, which is a target",
    );

    // And the control, so the difference is the empty hand and not the fixture:
    // the same situation with something in that hand holds the carrying reach.
    let carried = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::HIGH), Fx::ONE);
    let mut policy = TacticalEmbodiedPolicy::default();
    assert_eq!(guard_arm(&mut policy, &carried).reach, GUARD_REACH);
}

/// **The guard reads the tip and not the hilt** -- in range and in bearing,
/// which are the two places the two ends of a blade differ.
///
/// **In a fight they do not differ in height at all, and cannot.**
/// `combat::geometry::segment_pose` builds the tip as the hilt plus
/// `(cos, sin, ZERO) * length`, so every blade this simulation can pose is
/// horizontal. Measured on 2026-08-18: with `blade.tip.z` changed to
/// `blade.hilt.z` in `blade_reading`, **the entire workspace suite passed** --
/// nothing anywhere could tell the two ends apart. The third block below is the
/// assertion that closes that hole, and it is honest about what it is: a
/// hand-slanted segment that no fixture, no equipment row and no actuator in
/// this repository can currently produce. It guards the *code's* claim for the
/// day a weapon is posed off the horizontal -- a thrust, a spear held low -- and
/// it is not evidence about any fight that has been measured.
#[test]
fn the_guard_reads_the_tip_and_not_the_hilt() {
    // Range. The tip is 1.42 units out and the hilt 2.75, against a 1.75-unit
    // envelope: inside by the tip, outside by the hilt.
    let mut obs = subject();
    let mut foe = opponent(Fx::from_ratio(13, 5));
    let z = Fx::from_raw(at_band(CombatHeight::HIGH)) * STANDING;
    foe.weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(Fx::from_ratio(13, 5), Fx::from_ratio(9, 10), z),
        tip: Vec3::new(Fx::from_ratio(11, 10), Fx::from_ratio(-9, 10), z),
        radius: Fx::from_ratio(1, 32),
    });
    obs.opponent_count = 1;
    obs.opponents[0] = foe;

    let mut policy = TacticalEmbodiedPolicy::default();
    let guard = guard_arm(&mut policy, &obs);
    assert_eq!(
        guard.height,
        CombatHeight::HIGH,
        "the guard did not engage, so the range gate took the hilt",
    );
    // Bearing. The tip is below the centre line and the hilt above it, so the
    // sign of the answer names the end that was read.
    assert!(
        guard.bearing.delta(Angle::ZERO) < 0,
        "the plate turned toward the hilt at {:?}",
        guard.bearing,
    );

    // Height, on a segment the simulation cannot build: hilt down at the knee,
    // tip up at the head. See this test's own header for why it is here and what
    // it is not evidence of.
    let mut slanted = subject();
    let mut foe = opponent(Fx::from_ratio(3, 2));
    foe.weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(
            Fx::from_ratio(5, 2),
            Fx::ZERO,
            Fx::from_raw(at_band(CombatHeight::LOW)) * STANDING,
        ),
        tip: Vec3::new(
            Fx::ONE,
            Fx::ZERO,
            Fx::from_raw(at_band(CombatHeight::HIGH)) * STANDING,
        ),
        radius: Fx::from_ratio(1, 32),
    });
    slanted.opponent_count = 1;
    slanted.opponents[0] = foe;
    let mut policy = TacticalEmbodiedPolicy::default();
    assert_eq!(
        guard_arm(&mut policy, &slanted).height,
        CombatHeight::HIGH,
        "the height read took the hilt's z",
    );
}

/// The guard answers in the **torso frame**, and is not converted a second time
/// on the way out.
///
/// `into_torso_frame` subtracts the observed yaw from every bearing the planner
/// wrote; the guard is written after that and must not be subtracted again. At a
/// quarter turn a doubly-converted guard would be a whole facing off and would
/// land on the far end of its own arc, so the failure is loud rather than
/// subtle.
#[test]
fn the_guard_is_named_in_the_torso_frame_and_not_converted_twice() {
    let mut obs = subject();
    obs.body_yaw = Angle::QUARTER;
    let mut foe = opponent(Fx::from_ratio(3, 2));
    // Directly ahead of a body facing `+y`, so the torso-frame answer is zero
    // and the world-frame one is a quarter turn.
    foe.body_position = Vec3::new(Fx::ZERO, Fx::from_ratio(3, 2), Fx::ZERO);
    let z = Fx::from_raw(at_band(CombatHeight::HIGH)) * STANDING;
    foe.weapons[1] = Some(SegmentPose {
        hilt: Vec3::new(Fx::ZERO, Fx::from_ratio(3, 2), z),
        tip: Vec3::new(Fx::ZERO, Fx::ONE, z),
        radius: Fx::from_ratio(1, 32),
    });
    obs.opponent_count = 1;
    obs.opponents[0] = foe;

    let mut policy = TacticalEmbodiedPolicy::default();
    let guard = guard_arm(&mut policy, &obs);
    assert_eq!(guard.height, CombatHeight::HIGH, "the guard did not engage at this yaw");
    assert_eq!(
        guard.bearing,
        Angle::ZERO,
        "a blade straight ahead did not answer straight ahead in the torso frame",
    );
}

/// **No tick selects a guard height; the tick only gates the re-read.**
///
/// This session's first acceptance criterion, in the narrow form that is true.
/// The broad one -- "the guard reads no tick, no phase and no counter" -- is
/// false and was written down in three places: `decide` reads `obs.tick` to
/// decide whether [`GUARD_COMMIT_TICKS`] has run out, and it reads
/// `planner.phase()` for rules 2 and 3. What is true, and what the corpus column
/// is about, is that **no tick can produce a height no blade produced**: the
/// tick can only hold the answer a blade already chose, or let a fresh blade be
/// read. The script's guard cannot pass this test at all -- that is what makes
/// it worth writing.
///
/// **Sampled at every consecutive tick and not stepped past the window**, which
/// is the repair. The shipped version took its samples at
/// `step * (GUARD_COMMIT_TICKS + 47)` and admitted in its own comment that it
/// was stepping over the only ticks on which the tick matters, so it asserted
/// the broad claim over exactly the ticks where the narrow one is
/// indistinguishable from it.
#[test]
fn no_tick_selects_a_guard_height_that_no_blade_selected() {
    for band in [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH] {
        let obs = situation(Fx::from_ratio(3, 2), at_band(band), Fx::ONE);
        // A fresh policy per band, so the answer cannot be the previous band
        // held over -- which is the guard working and not the claim being made.
        let mut policy = TacticalEmbodiedPolicy::default();
        for tick in 0..(4 * GUARD_COMMIT_TICKS + 7) {
            assert_eq!(
                guard_arm(&mut policy, &at_tick(&obs, tick)).height,
                band,
                "the guard answered a height this blade did not choose, at tick {tick}",
            );
        }
    }
    // And the other half of the narrow claim, stated where a reader will find
    // it: the tick *does* gate the re-read, which is
    // `a_read_guard_holds_for_the_commit_window_before_it_is_re_read` above.
    // Two tests and one claim; neither is the whole of it.
}

/// The control: the same guard, on the centre line, whatever is coming.
///
/// Two claims and both matter to the measurement. It must not read -- or the two
/// arms of the comparison are the same policy -- and it must still *hold a
/// guard*, at the same arm, reach and effort, or the comparison measures having
/// an arm up rather than reading the blade.
#[test]
fn the_fixed_guard_control_holds_the_centre_line_whatever_is_coming() {
    for band in [CombatHeight::LOW, CombatHeight::HIGH] {
        // A fresh pair per band. One subject carried across both would answer
        // the first band twice, because the second read would land inside the
        // window the first one committed -- which is the guard working.
        let mut subject_policy = TacticalEmbodiedPolicy::new(TacticalConfig::READING);
        let mut control = TacticalEmbodiedPolicy::new(TacticalConfig::FIXED_GUARD);
        let obs = situation(Fx::from_ratio(3, 2), at_band(band), Fx::ONE);
        let read = guard_arm(&mut subject_policy, &at_tick(&obs, 0));
        let fixed = guard_arm(&mut control, &at_tick(&obs, 0));
        assert_eq!(read.height, band, "the subject did not read the blade");
        assert_eq!(fixed.height, CombatHeight::MID, "the control read the blade");
        assert_eq!(fixed.bearing, Angle::ZERO, "the control turned its plate");
        assert_eq!(fixed.reach, read.reach, "the control is not holding the same guard");
        assert_eq!(fixed.effort, read.effort, "the control is not holding the same guard");
    }
}

/// `reset` clears the fight and keeps the configuration.
///
/// The corpus runner calls `reset` between seeds, and a reset that restored
/// `Default` wholesale would promote the control to the subject from the second
/// seed onwards -- the one substitution the measurement this session exists for
/// cannot survive.
#[test]
fn a_reset_clears_the_read_and_keeps_the_configuration() {
    let obs = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::HIGH), Fx::ONE);
    let mut control = TacticalEmbodiedPolicy::new(TacticalConfig::FIXED_GUARD);
    assert_eq!(guard_arm(&mut control, &obs).height, CombatHeight::MID);
    control.reset();
    assert_eq!(control.config(), TacticalConfig::FIXED_GUARD, "a reset promoted the control");
    assert_eq!(guard_arm(&mut control, &obs).height, CombatHeight::MID);

    // And the subject's memory really is cleared: a guard inside its window
    // holds, and the same guard after a reset does not.
    let low = situation(Fx::from_ratio(3, 2), at_band(CombatHeight::LOW), Fx::ONE);
    let mut policy = TacticalEmbodiedPolicy::default();
    assert_eq!(guard_arm(&mut policy, &at_tick(&low, 0)).height, CombatHeight::LOW);
    assert_eq!(guard_arm(&mut policy, &at_tick(&obs, 1)).height, CombatHeight::LOW);
    // The row itself and not only the command it produced, which is what says
    // the *memory* was cleared rather than the answer happening to agree.
    assert_eq!(policy.guard().held_height(), Some(CombatHeight::LOW));
    policy.reset();
    assert_eq!(policy.guard().held_height(), None, "a reset left a band held");
    assert_eq!(
        guard_arm(&mut policy, &at_tick(&obs, 2)).height,
        CombatHeight::HIGH,
        "a reset left the previous fight's guard held",
    );
}
