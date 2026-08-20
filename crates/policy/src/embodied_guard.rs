//! The guard that watches the blow, instead of the clock that guesses at it.
//!
//! `embodied_script.rs` picks its guard height from `tick + GUARD_LEAD_TICKS`
//! and the corpus reports a 52.06% diagonal for it. That number has been read as
//! competence and is not: it is the arithmetic of two clocks half a step apart,
//! on a table `lab embodied` fills from *commanded* heights, and the file that
//! introduced the lead says so itself. Nothing in this repository has ever
//! looked at an incoming weapon and answered it.
//!
//! This file is that read. Nothing new is published to make it possible, and
//! the columns come from two different places for a reason worth knowing: every
//! *opponent* quantity below is one [`ObservedOpponent`] already carries and has
//! been through the perception noise, while `standing_height`, `arm_length`,
//! `body_yaw` and `tick` are the subject's own and sit on
//! [`ArticulatedObservation`] beside it, exact. An earlier draft of this
//! paragraph said all of them were `ObservedOpponent` columns; the correction is
//! here rather than applied silently, because which side of that line a column
//! sits on is the whole argument for the gate below.
//!
//! # Four departures from the session plan
//!
//! Each was found by reading the simulator rather than by running the corpus,
//! and each is written down here because the next reader will otherwise reach
//! for the same wrong thing. `docs/plans/fight-03-the-guard-that-watches.md`
//! carries the same four and the same count.
//!
//! **1. [`GUARD_COMMIT_TICKS`] is thirteen and not the plan's twelve.** The
//! arithmetic is on the constant, off `sim`'s two published actuator rates.
//!
//! **2. Rule 1 is a range gate, and two of the plan's three cases are not
//! implemented.** The plan spells "a guard is only read while something is
//! coming" as three cases -- *receding, stationary, or further away than a
//! stride* -- and asks for the gate to be `contact_timing` leaving its
//! saturating one. Only the third case landed, as [`within_reach`]. The other
//! two are not a shortcut: **no column this observation publishes separates an
//! approaching body from a receding one at the fixture's stats**, and that is a
//! fact about the perception channel rather than about this file.
//!
//! - `contact_timing` cannot carry it. `World::observe_articulated` blurs the
//!   column by `jitter[6] * noise / 8` on *both* branches of its formula -- the
//!   saturating one included, deliberately, because "nothing is closing" is a
//!   judgement like any other -- and `Rng::signed_unit` is symmetric over
//!   `[-1, 1)`. A genuinely saturated column therefore reads strictly below one
//!   on about half of all ticks **at every range**, so `contact_timing < ONE` is
//!   a coin flip.
//! - Recomputing the sim's own `closing` term from the published columns does
//!   not rescue it, which is the obvious next idea and was measured rather than
//!   assumed. `ObservedOpponent::body_velocity` is the true velocity plus
//!   `jitter[3..5] * noise / 4`, and the sim feeds *that* blurred velocity into
//!   `closing` before the scalar blur above is applied. `Stats::perception_noise`
//!   is 0.9 for the fixture's Fighter and 1.2 for its Brute, so the velocity
//!   error is 0.225 and 0.3 world units per tick against a `Stats::move_speed`
//!   sum of 0.0994 -- the entire range of closing speed the two bodies can
//!   produce between them. The signal sits 2.3x to 3.0x under the noise floor.
//!
//! Measured on 2026-08-18 over 9,689 decision ticks of twenty driven seeds of
//! `embodied-duel-v1`: the sign of a closing term recomputed from the published
//! columns agrees with `World::articulated_pose`'s ground truth on **51.59%** of
//! ticks, a body that is genuinely receding or stationary reads as closing on
//! **49.47%**, and exactly one of the 9,689 ticks has a true closing speed that
//! clears the noise. No deadband rescues it: at a threshold above the noise the
//! gate refuses 90% of genuine approaches and still admits 6% of the receding
//! ones. That is a landed test rather than a remembered sweep --
//! `no_published_column_separates_an_approach_from_a_retreat`, in
//! `crates/policy/tests/closing_channel.rs`, which re-drives the same twenty
//! seeds and bounds the answer from both sides. The table is in
//! `docs/performance/embodied-tactical-policy.md`.
//!
//! The limit is the fixture's eyes and not the engine. `perception_noise` is
//! `(15 - perception) / 10`, so a body at perception 12 or better carries a
//! velocity term under the closing range and could make the judgement honestly;
//! the Fighter is 6 and the Brute 3, and nothing in this corpus is close.
//! `the_closing_judgement_rule_1_asks_for_is_under_the_noise_it_would_read`
//! holds that arithmetic against `sim`'s own published stats.
//!
//! So the gate is range, off columns whose noise cancels, and rule 1 says range
//! rather than saying "coming". A gate that flickered on a coin flip every
//! [`GUARD_COMMIT_TICKS`] would be exactly the chatter
//! [`GUARD_READ_DEADBAND_RAW`] exists to prevent.
//!
//! **3. The guard arm is `1 - weapon` and not [`ArmRoles::guard`].** On a body
//! carrying no plate the two roles collapse onto the same hand -- the fixture's
//! Brute is exactly that, a club in the right hand and an empty left -- and a
//! guard written to [`ArmRoles::guard`] there would be written over the strike.
//! `embodied_script.rs` assembles its arms the same way and `lab embodied` reads
//! the same column, so this is one arm index across the policy, the control and
//! the report rather than three.
//!
//! **4. Rule 3 stands the guard aside for a chamber as well as a commit.** The
//! plan names `TacticalPhase::Commit` alone. The argument for the enlargement is
//! at the rule itself; what belongs here is that it *is* an enlargement, that
//! the corpus was measured with it in place, and that the chamber half was never
//! separately measured -- the performance record says so too.
//!
//! # And one correction to the plan's rationale, which is not a departure
//!
//! **A blade's tip and its hilt are at the same height, by construction.**
//! `combat::geometry::segment_pose` builds the tip as the hilt plus
//! `(cos, sin, ZERO) * length`, so every segment this simulation can produce is
//! horizontal and both ends share a `z` exactly. The plan justifies reading the
//! tip with "a guard placed on the hilt is a guard placed on the attacker's
//! wrist"; that is a real claim about the *bearing* and about the *range*, where
//! the two ends differ by the whole length of the blade, and an unfalsifiable
//! one about the height. The height read still takes the tip, because the day a
//! weapon is posed off the horizontal the tip is the end that arrives -- but no
//! fight in this repository can currently tell the two apart, and
//! `the_guard_reads_the_tip_and_not_the_hilt` says so in its own comment rather
//! than passing quietly.

use crate::{ArmRoles, StrikePlanner, TacticalPhase};
use fx::{Angle, Fx, Vec2, Vec3};
use sim::{
    ArmTarget, ArticulatedObservation, CombatHeight, ObservedOpponent, SegmentPose,
    ARM_MIN_REACH_RAW,
};

/// The three bands a guard is commanded in.
///
/// `lab embodied`'s guard column drops any commanded height that is not exactly
/// one of these, so a guard answering a continuous fraction of standing height
/// would be a guard the corpus cannot see. That is a real constraint on the
/// answer and not a rounding convenience, and it is why [`band`] exists at all.
const HEIGHTS: [CombatHeight; 3] = [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH];

/// How far an observed blade must move before the guard follows it.
///
/// **A deadband and not hysteresis**, on `embodied_script.rs`'s argument
/// exactly: a deadband needs no memory of its own decisions, makes "neither" a
/// real state, and cannot chatter. The value is a fraction of standing height
/// rather than a world length, because a Brute's HIGH and a Fighter's HIGH are
/// not the same height off the floor.
///
/// **Two derivations, agreeing to one raw unit, and that is the provenance.**
/// The session plan proposed 0.05 of standing height, which is 3,276.8 and
/// rounds to this. Independently, `ARM_LINEAR_MAX_SPEED_RAW` is 1,638 raw of
/// height per tick, so a deadband of one tick of arm travel is crossed every
/// tick by any blade already under way and is not a deadband at all; two ticks
/// is the smallest that is, and two ticks is 3,276. The two answers land one raw
/// unit apart, so the number is not a preference.
///
/// `the_guard_constants_are_bounded_by_the_actuator_they_are_chosen_against`
/// holds both ends: below by one tick of that travel, above by half a band --
/// past a half band a blade that had crossed a whole band could be refused,
/// which is the bug this session exists to fix.
pub const GUARD_READ_DEADBAND_RAW: i32 = 3_277;

/// How long a read guard holds before it may be re-read.
///
/// The plate does not teleport. A guard that re-decided every tick would spend
/// the whole fight travelling between two answers and arrive at neither, so this
/// is the smallest window that lets the arm finish -- and "finish" is arithmetic
/// off the actuator rather than a feel.
///
/// **Thirteen and not the twelve the session plan proposed, and the plan is
/// wrong by one tick.** `combat::actuator::chase` moves the arm's speed by at
/// most `ARM_LINEAR_ACCEL_RAW` (273 raw) a tick toward a desired speed of
/// `error.clamp(-ARM_LINEAR_MAX_SPEED_RAW, ARM_LINEAR_MAX_SPEED_RAW)`, then
/// clamps the step to the remaining error. One band of height is therefore six
/// ticks of ramp covering 5,733 raw and seven more of cruise at 1,638:
/// thirteen, at the best authority any body in the fixture can bring. Twelve
/// leaves the arm 823 raw short of the band it was sent to and frees it to be
/// sent somewhere else, which is the chatter the constant exists to prevent.
///
/// **This comment said `chase` "never decelerates" until 2026-08-18, and that
/// was false** -- superseded here rather than deleted, because the wrong
/// version is the intuitive one. The first line of `chase` *is* a deceleration:
/// once the remaining error drops below the speed the arm is carrying,
/// `desired` becomes that error and the step shrinks toward it. What survives
/// the correction is the number, and that is not luck -- the step clamp lands
/// the arm exactly on its target on the tick it would otherwise overshoot, so
/// the arrival tick is the same either way. `band_travel_ticks_at` below is now
/// `chase` written out in full, deceleration included, and still answers
/// thirteen.
/// `a_read_guard_holds_for_the_commit_window_before_it_is_re_read` bounds the
/// window in ticks from both sides, and
/// `the_guard_constants_are_bounded_by_the_actuator_they_are_chosen_against`
/// re-derives the thirteen from `sim`'s own two published rates.
///
/// The window has a second job it was not chosen for and now earns: it damps the
/// range gate. [`within_reach`] compares a perception-noised opponent position
/// against a threshold of about its own size, so it flickers near the boundary;
/// a guard that has just been read holds through the flicker rather than
/// snapping back to the centre line and out again.
pub const GUARD_COMMIT_TICKS: u32 = 13;

/// The reach a hand carrying something holds a guard at.
///
/// `embodied_script.rs`'s three quarters and its argument, copied rather than
/// imported for that file's own reason -- it is the frozen control now and this
/// policy's constants must not become casualties of whatever happens to it.
/// Three quarters is clear of both ends of `[ARM_MIN_REACH_RAW, 1]`, so a shoved
/// hand is chased back rather than clamped, and full extension would be a joint
/// limit and a straight arm rather than a guard.
const GUARD_REACH: Fx = Fx::from_ratio(3, 4);

/// Where an *empty* guard hand sits: the joint's own floor, read from `sim`.
///
/// The script's rule and the measurement behind it, which is worth carrying over
/// verbatim because the intuition points the wrong way: `body_region_volumes`
/// builds an arm from the shoulder to the hand, so extending an empty hand
/// lengthens a torso-grade interceptor out of the shoulder and into the line --
/// 1.49x on the articulated roster, measured. An empty hand held out is not a
/// guard, it is a target. The fixture's Brute has exactly one of these -- its
/// `equipment` row is `[Some(3), None]`, so on half of every body in the corpus
/// the guard arm is the empty hand and takes this branch.
///
/// **Bounded from both sides by `sim` rather than by preference.** Below the
/// joint's floor `integrate_arm_unbilled` clamps the target back up to
/// `ARM_MIN_REACH_RAW` anyway, so a smaller number is a command the body does
/// not honour and a record that says otherwise; above it the arm is extended
/// and becomes the interceptor the paragraph above measured. The floor is
/// therefore the only answer, and
/// `an_empty_guard_hand_is_held_at_the_joints_own_floor` asserts it on the
/// commanded row rather than on the constant, so the branch has to be reached
/// for the test to pass at all.
const REST_REACH: Fx = Fx::from_raw(ARM_MIN_REACH_RAW);

/// How far the guard may leave the body's own centre line, either way.
///
/// An eighth of a turn, and the same argument the script makes: the plate's
/// normal comes off the carrying arm's bearing, so this arc is how far the plate
/// may turn away from the direction the body faces. A quarter would put it
/// edge-on to a frontal attack and past a quarter it would face behind the body.
/// Centred on zero because an embodied arm bearing is measured from the torso,
/// where zero *is* the body's facing.
///
/// `the_guard_arc_is_an_eighth_turn_and_is_pinned_from_both_sides` holds it
/// through [`clamp_arc`] and against *literal* angles rather than against this
/// constant, so a mutation either way is caught: a blade an eighth off the
/// centre line must arrive unclamped, and one a quarter off must arrive clamped
/// to the eighth.
const GUARD_ARC: Angle = Angle::from_raw(8_192);

/// What the guard arm asks of its actuator.
///
/// **Full, where `embodied_script.rs` asks for a half, and the difference is
/// what the two arms are for.** The script's guard holds a pose; this one is
/// asked to *arrive*, and [`GUARD_COMMIT_TICKS`] is the arithmetic of arriving
/// at the best authority a body can bring. `arm_available` multiplies the
/// acceleration by effort, so a half-effort guard takes sixteen ticks to cross a
/// band rather than thirteen and would miss the window it is committed to.
/// `embodied_tactics.rs`'s own `Guard` intent asks for full effort for the same
/// reason -- it was written in `articulated_tactics.rs` and moved into this
/// crate's surviving tactics file with the planner in session 05.
///
/// It costs little to *hold*, which is not the same as costing nothing.
/// `bill_fatigue_with_com_delta` recovers fatigue outright only when **both** of
/// its conditions hold -- `step.idle_at_entry` *and*
/// `delta_com_velocity == Vec3::ZERO`, which are one `if` -- so a converged
/// guard on a body standing still recovers, and the same guard on a body that
/// is walking pays for the walk. This comment named only the first condition
/// until 2026-08-18. Otherwise the bill is the *change in speeds* scaled by
/// effort rather than the effort alone. What full effort buys is the travel;
/// what it costs is the travel's bill, and an arm that is not striking has
/// nothing better to spend it on -- but the performance record's standing
/// hypothesis for why this guard lost its own measurement is exactly that bill,
/// so this is a reason and not a result.
///
/// **Bounded from both sides, and the pair admits `[0.861, 1]`.** Above:
/// `validate_articulated` refuses an effort outside `[0, 1]` by field name, so a
/// larger value is a refused submission on every tick rather than a stronger
/// arm. Below: `arm_available` multiplies the acceleration by effort, and under
/// 0.861 the arm no longer crosses a band inside [`GUARD_COMMIT_TICKS`] -- at
/// the half `embodied_script.rs` asks for it takes sixteen ticks against
/// thirteen and misses the window it committed to.
/// `the_guard_effort_is_what_arriving_inside_the_window_costs` holds both ends
/// and names that range rather than leaving it to be read off two inequalities.
const GUARD_EFFORT: Fx = Fx::ONE;

/// One tick's worth of guard, in the torso frame.
///
/// The arm index travels with the target because the two are decided together --
/// the guard hand is `1 - weapon` and a caller that re-derived it would be a
/// second copy of the rule that keeps this policy, its control and
/// `lab embodied`'s guard column reading the same arm.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GuardCommand {
    /// Which arm row to write. Torso frame, so `bearing` zero is straight ahead.
    pub arm: usize,
    pub target: ArmTarget,
}

/// The one row of memory a read guard keeps.
///
/// Three numbers and no more: the band being held, the reading that chose it,
/// and the tick it was chosen on. The deadband is measured against the *reading*
/// and not against the band's centre, which is the difference between a guard
/// that answers a blade drifting across a boundary and one that flips every time
/// the blade crosses it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct HeldGuard {
    height: CombatHeight,
    read_raw: i32,
    since: u32,
}

/// The guard, as a policy component.
///
/// **`read` is configuration and survives [`GuardRead::reset`]**, on
/// `StrikePlanner::reset`'s precedent and for its reason: a corpus runner calls
/// `reset` between seeds, and a reset that restored `Default` wholesale would
/// quietly promote the control to the subject from the second seed onwards.
/// That is the one substitution the measurement this session exists for cannot
/// survive.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GuardRead {
    read: bool,
    held: Option<HeldGuard>,
}

impl Default for GuardRead {
    fn default() -> GuardRead {
        GuardRead::new(true)
    }
}

impl GuardRead {
    /// `read` false is the fixed-guard control: the same arm, the same reach and
    /// the same effort, permanently on the body's own centre line at MID. It
    /// never so much as *stores* a reading, on `EmbodiedScriptConfig::LEVEL`'s
    /// argument -- a control that kept a number it had decided not to act on
    /// would be one edit away from acting on it.
    pub fn new(read: bool) -> GuardRead {
        GuardRead { read, held: None }
    }

    /// Whether this guard reads the incoming blade at all.
    pub fn reads(&self) -> bool {
        self.read
    }

    /// The band currently being held, or `None` on the centre line.
    ///
    /// Public so a test can say *which* rule moved a guard rather than only that
    /// one did -- `ScriptedEmbodiedPolicy::ground`'s reason exactly.
    pub fn held_height(&self) -> Option<CombatHeight> {
        self.held.map(|held| held.height)
    }

    pub fn reset(&mut self) {
        self.held = None;
    }

    /// This tick's guard, or `None` when the strike owns the arm.
    ///
    /// `planner` is borrowed rather than its phase copied in, because two of the
    /// three rules below are about what the strike is doing and a caller that
    /// passed a phase could pass last tick's.
    pub fn decide(
        &mut self,
        obs: &ArticulatedObservation,
        planner: &StrikePlanner,
    ) -> Option<GuardCommand> {
        if !obs.present() {
            self.held = None;
            return None;
        }
        // The arm the script assembles its guard into and the arm `lab embodied`
        // reads as the guard. See the module header for why it is not
        // `ArmRoles::guard`.
        let arm = 1 - ArmRoles::of(obs).weapon;

        // **Rule 2: a severed guard arm is not a guard.** Severance is exact and
        // categorical, and it is published twice -- `ObservedArm::severed` and a
        // bit of `severed_mask` -- so reading either reads the same fact; the
        // arm row is the one that does not need the `BodyPart` mapping. The
        // fallback is the weapon arm covering its own line, which is whatever
        // the planner was already doing, and not a stump held out in front.
        if obs.arms[arm].severed {
            self.held = None;
            return None;
        }

        // **Rule 3: the guard never overrides a commit.** `StrikePlanner` may
        // plan with either hand, so the strike and the guard land on the same
        // arm whenever it chose this one; while it is winding up or cutting with
        // that arm, the strike owns the tick. A fighter that abandoned a
        // committed cut to answer a feint is worse than one that takes the
        // trade, and this is the one place the two arms are not independent.
        //
        // **The chamber is refused beside the commit, and the session plan
        // names the commit alone** -- departure 4 in the module header, and it
        // is an enlargement of the rule rather than a reading of it. The
        // argument is the commit's own, one phase earlier: a chamber
        // overwritten is a commit that never happens, because the planner keeps
        // counting ticks toward a windup the arm was never sent on. It is kept
        // rather than reverted because the corpus was measured with it in
        // place, and reverting it would invalidate every number in the record.
        // Dropping `Chamber` here left all thirteen shipped tests green, which
        // is why `a_chambered_cut_is_not_overwritten_by_a_guard` now exists;
        // the performance record says the chamber half was never separately
        // measured.
        if matches!(planner.phase(), TacticalPhase::Chamber | TacticalPhase::Commit)
            && planner.context().plan.is_some_and(|plan| plan.hand as usize == arm)
        {
            return None;
        }

        let carried = obs.arms[arm].equipment.is_some();
        if !self.read {
            self.held = None;
            return Some(GuardCommand { arm, target: centre_line(carried) });
        }

        // **Rule 1: a guard is only read for a blade inside the body's own
        // reach.** A body that tracks a blade across the room is a body that
        // has told its opponent where its plate is going, and the tracking
        // costs the arm's fatigue budget for nothing.
        //
        // **This is a range gate, and the plan asked for "while something is
        // coming"** -- departure 2 in the module header. Of the plan's three
        // cases, *receding, stationary, or further away than a stride*, only
        // the third is implemented and the header carries the measurement that
        // says why: no published column separates an approach from a retreat at
        // the fixture's perception, neither `contact_timing` nor a closing term
        // recomputed from `body_velocity`. The rule's name here is the rule the
        // code performs.
        let blade = obs
            .opponents()
            .first()
            .and_then(|foe| nearest_blade(obs, foe).map(|blade| (foe, blade)));
        let reading = blade
            .filter(|&(_, blade)| within_reach(obs, blade))
            .and_then(|(foe, blade)| blade_reading(obs, foe, blade));

        let committed = self
            .held
            .is_some_and(|held| obs.tick.saturating_sub(held.since) < GUARD_COMMIT_TICKS);
        let height = match (reading, self.held) {
            // Inside the window the arm has not arrived yet, whatever the blade
            // has done since. This branch is first on purpose: it also holds the
            // guard through a gate that has flickered off, which is what stops
            // the noisy range comparison from snapping the plate back to centre
            // for one tick and out again.
            (_, Some(held)) if committed => Some(held.height),
            // A reading inside the deadband is a blade that has not moved far
            // enough to be worth an arm. The reading that set the guard stays
            // the mark, so a slow drift accumulates and is eventually answered
            // rather than being forgiven one tick at a time.
            (Some(read), Some(held)) if (read - held.read_raw).abs() <= GUARD_READ_DEADBAND_RAW => {
                Some(held.height)
            }
            (Some(read), _) => {
                let height = band(read);
                self.held = Some(HeldGuard { height, read_raw: read, since: obs.tick });
                Some(height)
            }
            // Nothing within reach and no window left to run: back to the centre
            // line.
            (None, _) => {
                self.held = None;
                None
            }
        };

        let target = match height {
            Some(height) => ArmTarget {
                // Turned onto the incoming line rather than clamped at the
                // body's centre, because the plate's normal comes off this
                // bearing: the difference between a shield in front of the blow
                // and one edge-on to it. Clamped to the arc and never wrapped,
                // on the script's argument -- a threat from behind is held at
                // one end of the arc rather than folded across the chest.
                bearing: match blade {
                    Some((_, blade)) => clamp_arc(torso_bearing(obs, blade.tip), GUARD_ARC),
                    None => Angle::ZERO,
                },
                height,
                reach: if carried { GUARD_REACH } else { REST_REACH },
                effort: GUARD_EFFORT,
            },
            None => centre_line(carried),
        };
        Some(GuardCommand { arm, target })
    }
}

/// The guard a body holds when nothing is coming: its own centre line, at MID.
///
/// Zero bearing is straight ahead in the torso frame, so this needs no yaw at
/// all -- the frame's own simplification, and the reason `embodied_script.rs`
/// exists as a sibling of the world-frame file rather than a mode of it.
///
/// MID because the centre of three bands is the answer that is wrong by the
/// least when the question has not been asked. It is also, deliberately, an
/// *exact* band: `lab embodied`'s guard column drops any commanded height that
/// is not exactly LOW, MID or HIGH, so a fallback at some continuous fraction
/// would quietly shrink the denominator of the number this session is measured
/// on.
fn centre_line(carried: bool) -> ArmTarget {
    ArmTarget {
        bearing: Angle::ZERO,
        height: CombatHeight::MID,
        reach: if carried { GUARD_REACH } else { REST_REACH },
        effort: GUARD_EFFORT,
    }
}

/// The height band the nearest live blade occupies, as a fraction of the
/// subject's own standing height.
///
/// Reads the **tip** and not the hilt -- and the plan's reason for that is
/// wrong about *this* function, which is recorded rather than quietly fixed.
/// "A cut arrives edge-first and the hilt is behind the hand; a guard placed on
/// the hilt is a guard placed on the attacker's wrist" is true of the bearing
/// and of the range, where the two ends of a blade differ by its whole length.
/// It is not true of the height: `combat::geometry::segment_pose` builds the
/// tip as
/// `hilt + (cos, sin, ZERO) * length`, so every blade this simulation can pose
/// is horizontal and its two ends share a `z` exactly. The height read still
/// takes the tip, because the day a weapon is posed off the horizontal the tip
/// is the end that arrives; on today's roster the choice is unfalsifiable. The
/// module header and `the_guard_reads_the_tip_and_not_the_hilt` both say so.
///
/// The datum is the *opponent's* floor and not the subject's, which looks like
/// the wrong body and is not. Perception displaces a whole observed body
/// rigidly, so `tip.z - foe.body_position.z` cancels the noise exactly and
/// `tip.z - obs.body_position.z` does not: the duel's fighters carry 0.9 and 1.2
/// world units of it against a sculpted fixture whose entire relief is 0.75.
/// `embodied_tactics::height_for` takes the same difference for the same
/// reason, and `GroundSense` is the measured record of what reading two floors
/// against each other costs. What is given up is the elevation difference
/// between the two bodies, which on every flat fixture is zero and on the
/// sculpted one is smaller than the noise that would be let in to see it.
pub fn incoming_height(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
) -> Option<CombatHeight> {
    let blade = nearest_blade(obs, foe)?;
    blade_reading(obs, foe, blade).map(band)
}

/// The nearest of an opponent's live blades, by tip distance to the subject.
///
/// Nearest by the *tip* for the reason the height read takes the tip: the tip is
/// the end that arrives, and on a body winding up it is a whole blade closer
/// than the hand carrying it.
fn nearest_blade(obs: &ArticulatedObservation, foe: &ObservedOpponent) -> Option<SegmentPose> {
    let mut best: Option<(Fx, SegmentPose)> = None;
    for blade in foe.weapons.into_iter().flatten() {
        let range = planar(blade.tip - obs.body_position).length();
        let nearer = match best {
            Some((current, _)) => range < current,
            None => true,
        };
        if nearer {
            best = Some((range, blade));
        }
    }
    best.map(|(_, blade)| blade)
}

/// Where a blade sits on the subject's own height scale, in `CombatHeight` raw.
fn blade_reading(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    blade: SegmentPose,
) -> Option<i32> {
    if !obs.standing_height.is_positive() {
        return None;
    }
    let local = blade.tip.z - foe.body_position.z;
    Some((local / obs.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
}

/// Whether a blade is close enough to be worth answering.
///
/// **The subject's own reach envelope: its arm plus what it is holding.** Both
/// terms are exact proprioception, so the only noisy quantity in the comparison
/// is the blade's position, which no gate over another body can avoid. The claim
/// is that a blade nearer to me than the end of my own weapon is inside the
/// exchange, and that one further out cannot arrive without somebody taking a
/// step first -- at which point the step is the thing to answer and the blade
/// has moved anyway.
///
/// It is measured planar because a bearing has no vertical part and the arm's
/// vertical is the height this whole file is choosing; a blade directly overhead
/// is at zero planar range and is exactly the blade a guard is for.
fn within_reach(obs: &ArticulatedObservation, blade: SegmentPose) -> bool {
    planar(blade.tip - obs.body_position).length() <= reach_envelope(obs)
}

fn reach_envelope(obs: &ArticulatedObservation) -> Fx {
    let held = obs.weapons[ArmRoles::of(obs).weapon];
    obs.arm_length + held.map_or(Fx::ZERO, |blade| blade.tip.distance(blade.hilt))
}

/// Which of the three bands a raw reading falls in: the nearest, with ties going
/// low.
///
/// Nearest and not "the band it is at or above", because the bands are the
/// *centres* of what an arm can cover rather than the floors of three storeys: a
/// blade at 0.74 of standing height is a high cut and answering it at MID would
/// be answering a cut that has already passed over the plate.
fn band(raw: i32) -> CombatHeight {
    let mut best = HEIGHTS[0];
    for candidate in HEIGHTS {
        if (raw - candidate.raw()).abs() < (raw - best.raw()).abs() {
            best = candidate;
        }
    }
    best
}

/// The bearing from the subject's body to a world point, in the torso frame.
///
/// Two points at exactly one place answer "straight ahead", which keeps the
/// guard on the centre line rather than pointing it along a direction derived
/// from a zero vector.
fn torso_bearing(obs: &ArticulatedObservation, at: Vec3) -> Angle {
    let delta = planar(at - obs.body_position);
    if delta.is_zero() {
        Angle::ZERO
    } else {
        delta.angle() - obs.body_yaw
    }
}

/// `bearing`, held inside `arc` of the body's own facing. Clamped, never
/// wrapped: `embodied_script::clamp_arc`'s rule and its reason.
fn clamp_arc(bearing: Angle, arc: Angle) -> Angle {
    let limit = arc.raw() as i32;
    Angle::from_raw(bearing.delta(Angle::ZERO).clamp(-limit, limit) as u16)
}

fn planar(v: Vec3) -> Vec2 {
    Vec2::new(v.x, v.y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{ARM_LINEAR_ACCEL_RAW, ARM_LINEAR_MAX_SPEED_RAW};

    /// The raw gap between two adjacent bands.
    ///
    /// Read off [`CombatHeight`] rather than written down as 16,384, because the
    /// actuator chases `target.height.raw() - state.height.raw()` in exactly
    /// these units, and a second copy of the number would be free to drift from
    /// the one the arm is actually travelling through.
    const GUARD_BAND_RAW: i32 = CombatHeight::MID.raw() - CombatHeight::LOW.raw();

    /// How many ticks the actuator needs to carry a hand one whole band at
    /// `effort`.
    ///
    /// **`combat::actuator::chase` written out in full**, from `sim`'s two
    /// published rates and nothing else. Re-derived here rather than imported
    /// because there is nothing to import: the law is private to `sim`, and the
    /// point of the exercise is that [`GUARD_COMMIT_TICKS`] is the answer to it
    /// rather than a number somebody liked.
    ///
    /// An earlier version of this helper modelled `chase` as "accelerate, cap,
    /// never decelerate" on the strength of a comment that said so. It is not:
    /// `desired` is the *error* clamped to the speed ceiling, so the arm eases
    /// off as it arrives. Written out properly the answer is unchanged at
    /// thirteen -- the step clamp lands the hand exactly on its target on the
    /// tick it would otherwise overshoot -- and now the helper cannot be right
    /// for the wrong reason.
    ///
    /// `effort` enters where `arm_available` puts it: on the acceleration, and
    /// not on the ceiling, which is `agility`'s. Everything else in that product
    /// -- authority, `1 - fatigue`, power over inertia -- is taken at its best,
    /// which is what "at the best authority any body in the fixture can bring"
    /// means on [`GUARD_COMMIT_TICKS`].
    fn band_travel_ticks_at(effort: Fx) -> u32 {
        let acceleration = (Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * effort).raw().abs();
        let mut error = GUARD_BAND_RAW;
        let mut speed = 0i32;
        let mut ticks = 0u32;
        while error != 0 {
            let desired = error.clamp(-ARM_LINEAR_MAX_SPEED_RAW, ARM_LINEAR_MAX_SPEED_RAW);
            let next_speed = speed + (desired - speed).clamp(-acceleration, acceleration);
            let step = next_speed.clamp(error.min(0), error.max(0));
            error -= step;
            speed = if error == 0 { 0 } else { next_speed };
            ticks += 1;
            assert!(ticks < 1_000, "the arm never arrives at effort {effort}");
        }
        ticks
    }

    /// Both constants, bounded from both sides against the arm they were chosen
    /// for.
    ///
    /// A one-sided bound on either would be satisfied by a range far wider than
    /// the decision -- a deadband asserted only to be "under a band" passes at
    /// 16,383, which is a guard that never moves, and that is the bug this
    /// session exists to fix.
    #[test]
    fn the_guard_constants_are_bounded_by_the_actuator_they_are_chosen_against() {
        assert_eq!(GUARD_BAND_RAW, 16_384, "the bands are a quarter of standing height apart");

        // The window *is* the travel. Not "at least": the doc comment says
        // smallest, and an inequality would let it drift up to whatever the
        // upper bound below allows without anything noticing.
        assert_eq!(
            band_travel_ticks_at(Fx::ONE), 13,
            "sim's own rates moved and this constant did not",
        );
        assert_eq!(
            GUARD_COMMIT_TICKS,
            band_travel_ticks_at(Fx::ONE),
            "the window must be exactly the ticks the arm needs to cross one band",
        );
        // And the far side, which the equality above does not cover because it
        // would follow `sim` anywhere: a window longer than the windup it has to
        // answer is a guard that cannot be corrected before the cut lands.
        assert!(
            GUARD_COMMIT_TICKS < crate::ROBUST_STRIKE_TICKS / 2,
            "a guard held for half a chamber-and-commit cannot answer the second cut",
        );

        // Below: one tick of arm travel is not a deadband, because any blade
        // already under way crosses it every tick.
        assert!(
            GUARD_READ_DEADBAND_RAW > ARM_LINEAR_MAX_SPEED_RAW,
            "a deadband inside one tick of travel is crossed on every tick",
        );
        // Above: past half a band, a blade that had crossed a whole band could
        // be refused.
        assert!(
            GUARD_READ_DEADBAND_RAW < GUARD_BAND_RAW / 2,
            "a deadband at half a band refuses a blade that changed bands",
        );
        // The coincidence the doc comment claims, which is the whole provenance:
        // 0.05 of standing height and two ticks of arm travel are the same
        // number to within one raw unit.
        assert_eq!(GUARD_READ_DEADBAND_RAW - 2 * ARM_LINEAR_MAX_SPEED_RAW, 1);
    }

    /// The band rule, at the two places it could be off by a half step.
    #[test]
    fn a_reading_falls_in_the_nearest_band_and_not_the_one_below_it() {
        assert_eq!(band(0), CombatHeight::LOW);
        assert_eq!(band(CombatHeight::LOW.raw()), CombatHeight::LOW);
        // Just under and just over the LOW/MID midpoint.
        assert_eq!(band(24_575), CombatHeight::LOW);
        assert_eq!(band(24_577), CombatHeight::MID);
        assert_eq!(band(CombatHeight::HIGH.raw() - 1), CombatHeight::HIGH);
        assert_eq!(band(Fx::ONE.raw()), CombatHeight::HIGH);
        // The tie goes low, which is a decision and not an accident: `<` rather
        // than `<=` in the scan keeps the first band on an exact tie.
        assert_eq!(band(24_576), CombatHeight::LOW);
    }

    /// [`GUARD_EFFORT`], bounded by the two things that actually constrain it.
    ///
    /// **The pair admits `[0.861, 1]` and nothing outside it**, which is stated
    /// here rather than left to be inferred from two inequalities -- a bound
    /// whose width is not written down is how a field-of-view assertion of
    /// `FOV / 2 > 46` came to pass for anything from 93 to 179 degrees and look
    /// like coverage.
    ///
    /// Above: `validate_articulated` refuses an arm effort outside `[0, 1]` by
    /// field name, so a guard asking for more would be a refused submission on
    /// every tick of every fight -- and the corpus reads `0 refused
    /// submissions`, which is the other half of that claim.
    ///
    /// Below: the whole reason this guard asks for full effort where
    /// `embodied_script.rs`'s asks for a half is that it is asked to *arrive*.
    /// `arm_available` multiplies the acceleration by effort, so the window it
    /// commits to is what prices the constant.
    #[test]
    fn the_guard_effort_is_what_arriving_inside_the_window_costs() {
        assert!(
            GUARD_EFFORT.raw() <= Fx::ONE.raw(),
            "an effort over one is a refused submission and not a stronger arm",
        );
        assert!(GUARD_EFFORT.is_positive(), "a guard at no effort is not a guard");
        // The far side: at this effort the arm crosses a band inside the window
        // it holds for. Equality and not "at most", because the window is
        // itself the travel and the two have to move together.
        assert_eq!(
            band_travel_ticks_at(GUARD_EFFORT),
            GUARD_COMMIT_TICKS,
            "the guard cannot cross a band inside the window it commits to",
        );
        // And the width of what that admits, so the bound is honest: 0.861 is
        // the least effort that still arrives in thirteen ticks, and the tick
        // below it is fourteen.
        let least = Fx::from_raw(56_414);
        assert_eq!(band_travel_ticks_at(least), GUARD_COMMIT_TICKS);
        assert_eq!(band_travel_ticks_at(Fx::from_raw(least.raw() - 1)), GUARD_COMMIT_TICKS + 1);
        // The script's half, which is the comparison the doc comment makes.
        assert_eq!(
            band_travel_ticks_at(Fx::HALF), 16,
            "a half-effort guard no longer misses the window, so the argument is gone",
        );
    }

    /// [`GUARD_ARC`], pinned from both sides through the function that uses it.
    ///
    /// **Against literal angles and never against the constant**, which is the
    /// whole design of this test: an assertion of the form "a blade at
    /// `GUARD_ARC` arrives at `GUARD_ARC`" is true of every arc there is. An
    /// eighth turn must arrive unclamped and a quarter turn must arrive clamped
    /// to an eighth, and no other value of the constant satisfies both.
    #[test]
    fn the_guard_arc_is_an_eighth_turn_and_is_pinned_from_both_sides() {
        let eighth = Angle::from_raw(8_192);
        // Inside: a blade an eighth off the centre line is answered where it is.
        // A narrower arc clamps this and fails.
        assert_eq!(clamp_arc(eighth, GUARD_ARC), eighth, "the arc no longer reaches an eighth");
        // Outside: a quarter is edge-on to a frontal attack, so it is held at the
        // eighth. A wider arc lets this through and fails.
        assert_eq!(
            clamp_arc(Angle::QUARTER, GUARD_ARC), eighth,
            "the plate turned past an eighth, toward edge-on",
        );
        // Both signs, because `clamp_arc` clamps and never wraps and the two
        // ends are separate arithmetic.
        assert_eq!(
            clamp_arc(Angle::from_raw(49_152), GUARD_ARC),
            Angle::from_raw(57_344),
            "the arc is not symmetric about the body's own facing",
        );
    }

    /// **Why rule 1 is a range gate**, in the arithmetic that decided it.
    ///
    /// The session plan asks for the read to be gated on whether the opponent is
    /// closing. Nothing published can answer that at this fixture's stats, and
    /// the reason is a ratio rather than a subtlety: the velocity column's own
    /// error is larger than the entire range of closing speed the two bodies can
    /// produce between them, so the sign of any closing term built from it is a
    /// coin flip. Measured over a driven corpus at 51.59% agreement with ground
    /// truth; the module header carries that sweep and the record carries the
    /// rest.
    ///
    /// Asserted against `sim`'s published stats rather than against the measured
    /// percentage, because a percentage would be a number this test could not
    /// re-derive and the ratio is the thing that has to move for the plan's rule
    /// to become implementable. Bounded from both sides: the noise must exceed
    /// the signal *here*, and it must stop doing so for a sharper eye, or the
    /// claim would be about the engine rather than about these two bodies.
    #[test]
    fn the_closing_judgement_rule_1_asks_for_is_under_the_noise_it_would_read() {
        let fighter = sim::Body::Fighter.base_stats();
        let brute = sim::Body::Brute.base_stats();
        // Everything either body can contribute to a closing speed, both moving
        // flat out along the line between them.
        let closing_range = fighter.move_speed() + brute.move_speed();
        // `World::observe_articulated` blurs `body_velocity` by a quarter of the
        // positional noise, per axis.
        for eye in [fighter, brute] {
            assert!(
                eye.perception_noise() / Fx::from_int(4) > closing_range,
                "the velocity noise no longer swamps the closing range, so rule 1 is implementable",
            );
        }
        // And the other side, so this is a claim about these stats and not about
        // the observation model: a sharp enough eye reads the sign honestly.
        let sharp = sim::Stats::new(6, 6, 8, 12, 8);
        assert!(
            sharp.perception_noise() / Fx::from_int(4) < closing_range,
            "perception 12 no longer buys a readable velocity, so the limit is stated wrongly",
        );
    }
}
