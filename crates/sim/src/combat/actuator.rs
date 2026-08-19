use crate::{ArmTarget, BodyAnatomySpec, CombatHeight, EquipmentSpec, Stats};
use fx::{Angle, Fx, Vec3};
// Both are read only from feature-gated bodies, which is why the default build
// prunes them and the feature build needs them back.
#[cfg(feature = "cartesian-recoil")]
use fx::{mul_div, Vec2};

pub const BODY_YAW_MAX_SPEED_RAW: i32 = 546;
pub const BODY_YAW_ACCEL_RAW: i32 = 91;

// ---------------------------------------------------------------- stance
//
// The legs' constraint on the torso, for `CombatModel::Embodied`. Legs are
// automatically controlled and there is no leg command; what these five
// constants buy is the *cost* the legs impose, which is the whole of what the
// source material's footwork is.
//
// **Every one is a placeholder until a sweep produces it, and every one is
// bounded from both sides by the decision it encodes rather than by one side
// of a range.** The sweep they owe is
// `lab articulated --seeds 400 --mirrored` against the embodied corpus; the
// tests named below are what would catch them drifting in the meantime.

/// How far an embodied torso may turn away from its hips before the legs have
/// to move. A sixth of a turn.
///
/// - **Below about a tenth of a turn** an ordinary guard change would force a
///   step, so footwork would stop being a choice and become a tax on aiming.
/// - **At or above a quarter turn** a fighter could cover both flanks without
///   moving its feet, and the constraint would buy nothing a free torso did not
///   already give.
///
/// `the_twist_limit_is_bounded_from_both_sides` asserts both ends.
pub const STANCE_TWIST_LIMIT_RAW: i32 = 10_922;

/// How fast the hips turn while the body is translating or stepping: the same
/// rate the torso gets, because a body that is already moving its feet is not
/// paying for the turn twice.
pub const STANCE_HIP_MOVING_SPEED_RAW: i32 = BODY_YAW_MAX_SPEED_RAW;

/// How fast the hips turn while the body is standing still. Half.
///
/// **This asymmetry is the mechanic.** A moving body reorients for free because
/// it is already committing its feet; a standing one pays, which is what makes
/// "step to bring the weapon round" a decision rather than a formality. Equal
/// rates would delete the decision; a standing rate near zero would make a
/// stationary fighter unable to answer anything off its centre line.
/// `a_moving_body_turns_its_hips_faster_than_a_standing_one` asserts the strict
/// inequality, and `the_standing_hip_rate_is_bounded_from_both_sides` the range.
pub const STANCE_HIP_STANDING_SPEED_RAW: i32 = BODY_YAW_MAX_SPEED_RAW / 2;

/// Hip angular acceleration. The torso's, unchanged: what differs between hips
/// and torso is the ceiling they accelerate towards, not how hard they can push.
pub const STANCE_HIP_ACCEL_RAW: i32 = BODY_YAW_ACCEL_RAW;

/// How long a forced step lasts, in ticks.
///
/// Long enough that the hips actually arrive -- a sixth of a turn at the moving
/// rate takes `10_922 / 546`, twenty ticks, so a step shorter than that would
/// end with the twist still saturated and re-arm immediately, which is a stutter
/// rather than a step. Short enough that a fighter is not committed for a
/// visible fraction of a second at 60Hz.
pub const STANCE_STEP_TICKS: u8 = 24;

/// What a forced step costs in movement authority while it runs.
///
/// **Not zero and not one**, and both ends matter: zero would make a forced step
/// a stun, which is a much heavier mechanic than "your feet are busy"; one would
/// make it free and the constraint would be decorative.
/// `a_forced_step_reduces_move_authority_for_exactly_its_duration` asserts the
/// duration, and `the_step_authority_is_bounded_from_both_sides` the value.
pub const STANCE_STEP_MOVE_AUTHORITY_RAW: i32 = 32_768;

/// Standing pelvis height, as a fraction of standing height.
pub const PELVIS_HEIGHT_RAW: i32 = 32_768;

/// How far the pelvis sinks at full planar speed, as a fraction of standing
/// height, and how far again at a saturated twist.
///
/// Small on purpose: this is a crouch that shifts weight, not one that changes
/// what a blow can reach. The two terms are separate constants because they are
/// separate claims -- a body can be sprinting square-on or standing wound up --
/// and one combined number could not express either.
pub const PELVIS_SPEED_DROP_RAW: i32 = 3_277;
pub const PELVIS_TWIST_DROP_RAW: i32 = 3_277;
/// How fast an arm may slew its bearing, and how hard it may accelerate into it.
///
/// **Doubled from `1_092`/`182` on 2026-08-15, and the pair moves together**
/// because the ladder that measured it varied them together -- an acceleration
/// that cannot reach the new ceiling inside a phase would have bought nothing.
///
/// Session 04 measured this exact candidate and parked it: it took wounding rows
/// from 6 in 3,600 to 860, and was refused because a "tunnelling" counter rose
/// from 64 to 68. That counter turned out to hold no defect at all. Split into
/// its two halves it is a benign neighbouring-region hit (66 of 66 rows cross a
/// real region) plus a false positive of the corpus's own crossing test (372 of
/// 372 rows are crossings under the solver's inputs), and the half that grew
/// with slew grew because the harness sweeps the contact-*clamped* blade pose
/// rather than the requested one. See the
/// [calibration record](../../../../docs/performance/smart-ai-actuator-calibration.md).
///
/// What it buys, on `articulated --seeds 100 --mirrored`: the windmill control
/// goes from 3.0% of fights decided by a body to 96.5%, which is the first
/// configuration ever to clear the mechanical gate's "fewer than 10% reach the
/// clock" criterion. The composed script barely moves, and that is a script
/// defect rather than a mechanics one -- it commands `effort: Fx::ZERO` on eight
/// of twelve phases and arrives inside the other four, so it spends 68.6% of its
/// ticks with a bearing step of exactly zero and cannot use a ceiling it never
/// reaches.
///
/// **Do not read this as a tuning knob.** It is a rate ceiling, and the measured
/// shape is that speed only pays while the blade is on the line: widening the
/// commanded arc to +-3/8 of a turn *lowered* decided fights below baseline even
/// though it raised tip speed.
pub const ARM_BEARING_MAX_SPEED_RAW: i32 = 2_184;
pub const ARM_BEARING_ACCEL_RAW: i32 = 364;

/// How fast an embodied elbow may swing its plane about the arm's own axis.
///
/// **Derived from a number that was measured rather than invented as a third
/// one.** The elbow rotating about the shoulder-to-hand axis is the shoulder
/// swinging the *whole arm* about that axis; nothing in this model lets an arm
/// rotate faster than [`ARM_BEARING_MAX_SPEED_RAW`], so a plane that could
/// outrun it would be an elbow overtaking the shoulder that carries it. Equality
/// is the honest reading of "no faster", and a separate constant here would be a
/// number with no sweep behind it pretending to be a measurement.
///
/// **It is a rate bound and deliberately not a bill.** The work an arm does
/// about its own axis is not modelled -- `bill_fatigue_for_grip` charges the hand's
/// travel and the bearing's sweep, both of which move the hand -- so charging
/// the plane to the fatigue or effort budget would be inventing a cost with
/// nothing behind it. A plane change is free and slow, which is the pair of
/// properties the swept forearm actually needs.
pub const ELBOW_PLANE_MAX_SPEED_RAW: i32 = ARM_BEARING_MAX_SPEED_RAW;
pub const ARM_LINEAR_MAX_SPEED_RAW: i32 = 1_638;
pub const ARM_LINEAR_ACCEL_RAW: i32 = 273;
pub const ARM_MIN_REACH_RAW: i32 = 16_384;
pub const FATIGUE_WORK_SCALE_RAW: i32 = 256;
pub const FATIGUE_RECOVERY_RAW: i32 = 4;

/// What the legs are doing, for a body whose legs are automatic.
///
/// There is no leg command and there will not be one: with locomotion automatic
/// and no jump or crouch, the depth of legs in the source material is stance and
/// footwork -- where your weight is, which way your hips face, and whether you
/// can bring a weapon round without repositioning. Knee angle is a thing a
/// renderer solves from foot and pelvis positions and it changes no decision.
///
/// **Twist is not a field.** It is `body_yaw.delta(hip_yaw)`, derived wherever
/// it is wanted, because a stored copy is a second thing that can disagree with
/// the two angles it is a function of -- and the clamp that bounds it already
/// lives on the torso's target.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StanceState {
    /// Hip bearing, world space: the feet direction.
    pub hip_yaw: Angle,
    pub hip_yaw_speed_turns: Fx,
    pub hip_authority_residue: Fx,
    /// Pelvis height as a fraction of standing height. **Derived, never
    /// commanded**: `PELVIS_HEIGHT_RAW` less a speed term less a twist term,
    /// each clamped, evaluated left to right. The grouping is written down
    /// because `Fx` truncates and a reordering is a different number.
    pub pelvis: Fx,
    /// Ticks remaining in a forced step. Zero when the body is settled.
    pub step_left: u8,
}

impl StanceState {
    /// A body standing square, feet under it, at full height.
    pub const fn squared(hip_yaw: Angle) -> StanceState {
        StanceState {
            hip_yaw,
            hip_yaw_speed_turns: Fx::ZERO,
            hip_authority_residue: Fx::ZERO,
            pelvis: Fx::from_raw(PELVIS_HEIGHT_RAW),
            step_left: 0,
        }
    }

    /// Signed hip-to-torso twist in raw angle units, always within the budget.
    pub fn twist(&self, body_yaw: Angle) -> i32 {
        body_yaw.delta(self.hip_yaw)
    }
}

/// The plane an embodied arm folds its elbow into, commanded and held.
///
/// Two angles rather than one for the reason every other actuator row here keeps
/// a target beside a state: a command is a *request*, and the thing that makes
/// the request survivable is that the arm chases it at a bounded rate instead of
/// snapping. One field would have to be either the request -- with the elbow
/// teleporting -- or the pose, with the request forgotten between decisions.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ElbowPlaneState {
    /// The plane as submitted, retained because a stored command is re-read
    /// every tick until a new decision replaces it.
    pub commanded: Angle,
    /// The plane the elbow is actually in.
    pub held: Angle,
}

impl ElbowPlaneState {
    /// Both zero: the plane `elbow_point` defaulted to before the field existed,
    /// which is the elbow hanging below the shoulder-to-hand line. It is also
    /// what a *refused* command stores, so a refusal leaves the arm where it was
    /// rather than swinging it to a plane nobody asked for.
    pub const NEUTRAL: ElbowPlaneState =
        ElbowPlaneState { commanded: Angle::ZERO, held: Angle::ZERO };

    /// One tick of the chase: `held` toward `commanded`, shortest way round, by
    /// at most [`ELBOW_PLANE_MAX_SPEED_RAW`].
    ///
    /// **The bound is not polish.** The forearm is about to become a swept
    /// collider, and a plane that jumped half a turn in one tick would sweep the
    /// forearm bodily across the body inside that tick and hand the contact
    /// solver a closing speed no arm can produce -- an absurd energy from a
    /// command that only changed a number. Clamping the *step* rather than the
    /// command is what keeps the arriving pose exact: once the remaining delta
    /// is inside the budget the step is the whole delta, so it lands on
    /// `commanded` and stops, with no overshoot and no limit cycle.
    pub fn chase(self) -> ElbowPlaneState {
        let delta = self.commanded.delta(self.held);
        let step = delta.clamp(-ELBOW_PLANE_MAX_SPEED_RAW, ELBOW_PLANE_MAX_SPEED_RAW);
        ElbowPlaneState {
            commanded: self.commanded,
            held: Angle::from_raw(self.held.raw().wrapping_add(step as u16)),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct BodyYawState {
    pub angle: Angle,
    pub speed_turns: Fx,
    pub authority_residue: Fx,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArmState {
    pub bearing: Angle,
    pub bearing_speed_turns: Fx,
    pub height: CombatHeight,
    pub height_speed: Fx,
    pub reach: Fx,
    pub reach_speed: Fx,
    pub previous_hand: Vec3,
    pub hand: Vec3,
    pub linear_velocity: Vec3,
    pub fatigue: Fx,
    pub work_residue: Fx,
    #[cfg(feature = "cartesian-recoil")]
    pub post_contact_com_velocity: Vec3,
    #[cfg(feature = "cartesian-recoil")]
    pub post_contact_active: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GripState { pub equipment_slot: Option<u8> }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ShieldPose {
    pub centre: Vec3,
    pub normal: Vec3,
    pub half_width: Fx,
    pub half_height: Fx,
    pub thickness: Fx,
}

pub(crate) fn tucked_arm(hand: Vec3) -> ArmState {
    ArmState {
        bearing: Angle::ZERO,
        bearing_speed_turns: Fx::ZERO,
        height: CombatHeight::MID,
        height_speed: Fx::ZERO,
        reach: Fx::from_raw(ARM_MIN_REACH_RAW),
        reach_speed: Fx::ZERO,
        previous_hand: hand,
        hand,
        linear_velocity: Vec3::ZERO,
        fatigue: Fx::ZERO,
        work_residue: Fx::ZERO,
        #[cfg(feature = "cartesian-recoil")]
        post_contact_com_velocity: Vec3::ZERO,
        #[cfg(feature = "cartesian-recoil")]
        post_contact_active: false,
    }
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn clear_post_contact(arm: &mut ArmState) -> Vec3 {
    let removed = if arm.post_contact_active { arm.post_contact_com_velocity } else { Vec3::ZERO };
    arm.post_contact_com_velocity = Vec3::ZERO;
    arm.post_contact_active = false;
    removed
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn settle_post_contact_com(c: Vec3, solved_body: Vec2, settled_body: Vec2) -> Vec3 {
    let mut absolute = Vec3::new(solved_body.x, solved_body.y, Fx::ZERO) + c;
    if settled_body.x != solved_body.x { absolute.x = Fx::ZERO; }
    if settled_body.y != solved_body.y { absolute.y = Fx::ZERO; }
    absolute - Vec3::new(settled_body.x, settled_body.y, Fx::ZERO)
}

// Where an arm is now belongs to `limb`, and is re-exported here so no caller
// changed when it moved. The arm's collision volume was being built a second
// time in `geometry.rs` from these same two points; one owner is what stops the
// two answers drifting apart.
pub(crate) use super::limb::{hand_position, inverse_hand, shoulder};

pub(crate) fn integrate_yaw(state: &mut BodyYawState, target: Angle, authority: Fx) {
    integrate_yaw_with_rates(state, target, authority, BODY_YAW_MAX_SPEED_RAW, BODY_YAW_ACCEL_RAW)
}

/// The same integrator at a rate the caller names.
///
/// Exists because hips are not a torso: they turn slower when a body is
/// standing and at the full rate when it is stepping, and the alternative --
/// a second copy of this arithmetic -- is how the two would come to disagree
/// about what a saturated speed does. Same shape as
/// [`integrate_arm_with_rates`], and for the same reason.
pub(crate) fn integrate_yaw_with_rates(
    state: &mut BodyYawState,
    target: Angle,
    authority: Fx,
    max_speed_raw: i32,
    accel_raw: i32,
) {
    let error = target.delta(state.angle);
    let desired = error.clamp(-max_speed_raw, max_speed_raw);
    let n = accel_raw as i64 * authority.raw() as i64
        + state.authority_residue.raw() as i64;
    let acceleration = n / Fx::ONE.raw() as i64;
    state.authority_residue = Fx::from_raw((n - acceleration * Fx::ONE.raw() as i64) as i32);
    let speed = state.speed_turns.raw();
    let delta = (desired - speed).clamp(-(acceleration.abs() as i32), acceleration.abs() as i32);
    let next_speed = speed + delta;
    let step = next_speed.clamp(error.min(0), error.max(0));
    state.angle = Angle::from_raw(state.angle.raw().wrapping_add(step as u16));
    state.speed_turns = Fx::from_raw(if step == error { 0 } else { next_speed });
}

pub(crate) fn movement_traction(stats: Stats, authority: Fx) -> Fx {
    stats.traction() * authority
}

#[derive(Clone, Copy)]
pub(crate) struct ArmStep {
    pub delta_bearing_speed: Fx,
    pub delta_height_speed: Fx,
    pub delta_reach_speed: Fx,
    pub idle_at_entry: bool,
}

pub(crate) fn equipment_inertia(item: Option<EquipmentSpec>) -> Fx {
    match item {
        None => Fx::from_ratio(1, 4),
        Some(item) => (item.mass * (Fx::from_ratio(1, 4) + item.balance)).max(Fx::from_ratio(1, 4)),
    }
}

/// How much of the gripped item's inertia two hands take off the driving arm.
///
/// **Not an arbitrary constant.** [`equipment_inertia`] gives the shipped Club
/// `2.23 * (1/4 + 0.61) = 1.918` against the Sword's `1.24 * (1/4 + 0.55) =
/// 0.992`, and [`arm_available`] divides acceleration by it -- so a one-handed
/// Club accelerates at about half a Sword's rate, with nothing anywhere to
/// compensate. Halving lands the Club at `0.959`, within a hair of the Sword's
/// `0.992`: a two-handed Club accelerates about as well as a one-handed Sword,
/// which is the entire claim this number makes. It is chosen from that
/// comparison and from no fight outcome -- `AGENTS.md`'s standing rule is not to
/// select mechanics by wound outcome.
pub const TWO_HANDED_INERTIA_DIVISOR: i32 = 2;

/// How many fatigue accounts split one item's work on a two-handed grip.
///
/// The arms that share an item share its cost. Before this each arm was billed
/// the whole of the same work, which was not a decision anybody made: the mirror
/// was written before anyone asked what it should cost.
pub const TWO_HANDED_FATIGUE_SHARES: i32 = 2;

/// How many arms drive the gripped item this tick.
///
/// The two levers a two-handed grip pulls, and it pulls no others: the inertia
/// the driving arm overcomes, and how that arm's work is billed. Ownership, the
/// authoritative target, and whose effort, fatigue, stats and authority are read
/// are all unchanged and all still the right arm's --
/// `a_two_handed_trajectory_uses_right_authority_effort_and_target_only` in
/// `crates/sim/src/world/articulated.rs` is the standing proof of the half that
/// did not move.
///
/// [`Grip::OneHanded`] is **inert by construction**: both methods below return
/// their argument untouched. That is what lets every one-handed caller keep its
/// signature and stay provably unaffected, and it is what
/// `a_one_handed_grip_is_unchanged_by_the_two_handed_term` asserts from outside.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Grip {
    /// One arm on the haft: every one-handed item, and an empty hand.
    OneHanded,
    /// Both arms on one haft -- a [`crate::GripBinding::Both`] row.
    TwoHanded,
}

impl Grip {
    /// The inertia the driving arm actually works against.
    ///
    /// The `1/4` floor is [`equipment_inertia`]'s own, reapplied after the
    /// division because that floor is the bare arm and a second hand on the haft
    /// does not make the arm weightless. It is unreachable for the shipped
    /// equipment, whose halved inertia stays above `1/4`.
    fn driven_inertia(self, inertia: Fx) -> Fx {
        match self {
            Grip::OneHanded => inertia,
            Grip::TwoHanded => Fx::from_raw(inertia.raw() / TWO_HANDED_INERTIA_DIVISOR)
                .max(Fx::from_ratio(1, 4)),
        }
    }

    /// This arm's share of one item's work.
    ///
    /// Each account keeps its own `work_residue`, so two halves rejoin to within
    /// one raw unit of the undivided bill rather than exactly.
    fn share_work(self, work: Fx) -> Fx {
        match self {
            Grip::OneHanded => work,
            Grip::TwoHanded => Fx::from_raw(work.raw() / TWO_HANDED_FATIGUE_SHARES),
        }
    }
}

fn stat_factor(value: u8) -> Fx {
    Fx::from_ratio(8 + value as i32, 28).clamp(Fx::from_ratio(1, 4), Fx::ONE)
}

fn chase(error: i32, speed: i32, max_speed: i32, acceleration: i32) -> (i32, i32) {
    let desired = error.clamp(-max_speed, max_speed);
    let next_speed = speed + (desired - speed).clamp(-acceleration, acceleration);
    let step = next_speed.clamp(error.min(0), error.max(0));
    (step, if step == error { 0 } else { next_speed })
}

fn arm_available(
    state: ArmState, target: ArmTarget, item: Option<EquipmentSpec>, stats: Stats, authority: Fx,
    grip: Grip,
) -> (Fx, Fx) {
    let inertia = equipment_inertia(item);
    let power = stat_factor(stats.power);
    let available = ((((target.effort * authority) * (Fx::ONE - state.fatigue)) * power)
        / grip.driven_inertia(inertia))
        .clamp(Fx::ZERO, Fx::ONE);
    // The **undivided** inertia goes back to the caller, because that is what
    // bills fatigue: the two-handed divisor is an acceleration term and is
    // deliberately not also a discount on the work.
    (inertia, available)
}

pub(crate) fn integrate_arm_with_rates(
    state: &mut ArmState,
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    target: ArmTarget,
    item: Option<EquipmentSpec>,
    stats: Stats,
    authority: Fx,
    bearing_max_speed_raw: i32,
    bearing_accel_raw: i32,
) -> ArmStep {
    integrate_arm_for_grip(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw, Grip::OneHanded,
    )
}

/// [`integrate_arm_with_rates`] for an arm that may be sharing its item.
///
/// The one-handed entry point above is this with [`Grip::OneHanded`], which is
/// inert, so every existing caller keeps both its signature and its behaviour.
#[allow(clippy::too_many_arguments)]
pub(crate) fn integrate_arm_for_grip(
    state: &mut ArmState,
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    target: ArmTarget,
    item: Option<EquipmentSpec>,
    stats: Stats,
    authority: Fx,
    bearing_max_speed_raw: i32,
    bearing_accel_raw: i32,
    grip: Grip,
) -> ArmStep {
    let (step, inertia, _, _) = integrate_arm_unbilled(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw, grip,
    );
    bill_fatigue_for_grip(state, inertia, target.effort, step, grip);
    step
}

#[allow(clippy::too_many_arguments)]
fn integrate_arm_unbilled(
    state: &mut ArmState,
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    target: ArmTarget,
    item: Option<EquipmentSpec>,
    stats: Stats,
    authority: Fx,
    bearing_max_speed_raw: i32,
    bearing_accel_raw: i32,
    grip: Grip,
) -> (ArmStep, Fx, i32, i32) {
    let reach_target = target.reach.clamp(Fx::from_raw(ARM_MIN_REACH_RAW), Fx::ONE);
    let bearing_error = target.bearing.delta(state.bearing);
    let height_error = target.height.raw() - state.height.raw();
    let reach_error = reach_target.raw() - state.reach.raw();
    let entry_bearing_speed = state.bearing_speed_turns.raw();
    let entry_height_speed = state.height_speed.raw();
    let entry_reach_speed = state.reach_speed.raw();
    let idle_at_entry = bearing_error == 0 && height_error == 0 && reach_error == 0
        && entry_bearing_speed == 0 && entry_height_speed == 0 && entry_reach_speed == 0;

    let (inertia, available) = arm_available(*state, target, item, stats, authority, grip);
    let agility = stat_factor(stats.agility);
    let bearing_accel = (Fx::from_raw(bearing_accel_raw) * available).raw().abs();
    let linear_accel = (Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * available).raw().abs();
    let bearing_max = (Fx::from_raw(bearing_max_speed_raw) * agility).raw().abs();
    let linear_max = (Fx::from_raw(ARM_LINEAR_MAX_SPEED_RAW) * agility).raw().abs();

    let (bearing_step, bearing_speed) = chase(bearing_error, entry_bearing_speed, bearing_max, bearing_accel);
    state.bearing = Angle::from_raw(state.bearing.raw().wrapping_add(bearing_step as u16));
    state.bearing_speed_turns = Fx::from_raw(bearing_speed);
    let (height_step, height_speed) = chase(height_error, entry_height_speed, linear_max, linear_accel);
    state.height = CombatHeight::try_from_raw(state.height.raw() + height_step)
        .expect("bounded articulated height");
    state.height_speed = Fx::from_raw(height_speed);
    let (reach_step, reach_speed) = chase(reach_error, entry_reach_speed, linear_max, linear_accel);
    state.reach = Fx::from_raw(state.reach.raw() + reach_step);
    state.reach_speed = Fx::from_raw(reach_speed);

    let step = ArmStep {
        delta_bearing_speed: Fx::from_raw(bearing_speed - entry_bearing_speed),
        delta_height_speed: Fx::from_raw(height_speed - entry_height_speed),
        delta_reach_speed: Fx::from_raw(reach_speed - entry_reach_speed),
        idle_at_entry,
    };
    state.previous_hand = state.hand;
    state.hand = hand_position(anatomy, yaw, limb, state.bearing, state.height, state.reach);
    state.linear_velocity = state.hand - state.previous_hand;
    let com_accel = (Fx::from_raw(linear_accel) * anatomy.arm_length).raw().abs();
    let com_max = (Fx::from_raw(linear_max) * anatomy.arm_length).raw().abs();
    (step, inertia, com_accel, com_max)
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn integrate_arm_with_recoil(
    state: &mut ArmState, anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize,
    target: ArmTarget, item: Option<EquipmentSpec>, stats: Stats, authority: Fx,
    bearing_max_speed_raw: i32, bearing_accel_raw: i32,
) -> ArmStep {
    integrate_arm_with_recoil_for_grip(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw, Grip::OneHanded,
    )
}

/// [`integrate_arm_with_recoil`] for an arm that may be sharing its item. The
/// one-handed entry point above is this with the inert [`Grip::OneHanded`].
#[cfg(feature = "cartesian-recoil")]
#[allow(clippy::too_many_arguments)]
pub(crate) fn integrate_arm_with_recoil_for_grip(
    state: &mut ArmState, anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize,
    target: ArmTarget, item: Option<EquipmentSpec>, stats: Stats, authority: Fx,
    bearing_max_speed_raw: i32, bearing_accel_raw: i32, grip: Grip,
) -> ArmStep {
    let entry_bearing = state.bearing;
    let entry_hand = state.hand;
    let entry_com = state.post_contact_com_velocity;
    let was_active = state.post_contact_active;
    let (step, inertia, com_accel, com_max) = integrate_arm_unbilled(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw, grip,
    );
    let next_offset = item.and_then(|item| {
        let crate::EquipmentGeometry::Segment { length, .. } = item.geometry else { return None };
        let old = Vec3::new(entry_bearing.cos(), entry_bearing.sin(), Fx::ZERO) * length;
        let new = Vec3::new(state.bearing.cos(), state.bearing.sin(), Fx::ZERO) * length;
        let delta = new - old;
        Some(Vec3::new(
            mul_div(delta.x, item.balance, Fx::ONE),
            mul_div(delta.y, item.balance, Fx::ONE),
            mul_div(delta.z, item.balance, Fx::ONE),
        ))
    }).unwrap_or(Vec3::ZERO);
    let forward = state.hand;
    let mut next_com = entry_com;
    if was_active {
        let update = |error: Fx, offset: Fx, current: Fx| {
            let desired_hand = error.raw();
            let desired_com = desired_hand.saturating_add(offset.raw()).clamp(-com_max, com_max);
            Fx::from_raw(current.raw() + (desired_com - current.raw()).clamp(-com_accel, com_accel))
        };
        next_com = Vec3::new(
            update(forward.x - entry_hand.x, next_offset.x, entry_com.x),
            update(forward.y - entry_hand.y, next_offset.y, entry_com.y),
            update(forward.z - entry_hand.z, next_offset.z, entry_com.z),
        );
        let free_hand = next_com - next_offset;
        let requested = entry_hand + free_hand;
        let crosses = |entry: Fx, target: Fx, next: Fx| {
            let error = target.raw() as i64 - entry.raw() as i64;
            let delta = next.raw() as i64 - entry.raw() as i64;
            error == 0 || (delta.signum() == error.signum() && delta.unsigned_abs() >= error.unsigned_abs())
        };
        state.hand = if crosses(entry_hand.x, forward.x, requested.x)
            && crosses(entry_hand.y, forward.y, requested.y)
            && crosses(entry_hand.z, forward.z, requested.z) { forward } else { requested };
        state.linear_velocity = state.hand - entry_hand;
        state.previous_hand = entry_hand;
        let desired_com = state.linear_velocity + next_offset;
        state.post_contact_active = state.hand != forward || next_com != desired_com;
        state.post_contact_com_velocity = if state.post_contact_active { next_com } else { Vec3::ZERO };
    }
    bill_fatigue_with_com_delta(state, inertia, target.effort, step,
        if was_active { next_com - entry_com } else { Vec3::ZERO }, anatomy.arm_length, grip);
    step
}

/// Charge one tick of arm work against `state`'s fatigue, for an arm whose
/// centre of mass did not move relative to its hand.
///
/// **The one-argument `bill_fatigue` that stood here is gone.** It was this call
/// with `Grip::OneHanded` written in, and the only caller it had left was the
/// test below -- which was comparing it against
/// `bill_fatigue_with_com_delta(.., Vec3::ZERO, ..)`, an expression it had
/// itself become. That test now drives this function, which is what
/// `world/articulated.rs` calls, so the byte-identity claim is about a path
/// something ships.
pub(crate) fn bill_fatigue_for_grip(
    state: &mut ArmState, inertia: Fx, effort: Fx, step: ArmStep, grip: Grip,
) {
    bill_fatigue_with_com_delta(state, inertia, effort, step, Vec3::ZERO, Fx::ONE, grip);
}

fn bill_fatigue_with_com_delta(
    state: &mut ArmState, inertia: Fx, effort: Fx, step: ArmStep,
    delta_com_velocity: Vec3, arm_length: Fx, grip: Grip,
) {
    if step.idle_at_entry && delta_com_velocity == Vec3::ZERO {
        state.fatigue = Fx::from_raw((state.fatigue.raw() - FATIGUE_RECOVERY_RAW).max(0));
        return;
    }
    let com_l1 = (delta_com_velocity.x.abs() + delta_com_velocity.y.abs())
        + delta_com_velocity.z.abs();
    let normalized_com = if com_l1 == Fx::ZERO { Fx::ZERO }
        else if arm_length.is_positive() { com_l1 / arm_length }
        else { Fx::MAX };
    let sum = (step.delta_bearing_speed.abs() + step.delta_height_speed.abs())
        + step.delta_reach_speed.abs() + normalized_com;
    // The share is taken on the finished work rather than on any of its factors,
    // so a one-handed bill is bit-identical to what it was and a shared one is
    // exactly half of it before the residue arithmetic below.
    let work = grip.share_work(((inertia * inertia) * effort) * sum);
    let accumulated = work.raw() as i64 + state.work_residue.raw() as i64;
    let increment = accumulated / FATIGUE_WORK_SCALE_RAW as i64;
    let residue = accumulated - increment * FATIGUE_WORK_SCALE_RAW as i64;
    state.work_residue = Fx::from_raw(residue as i32);
    state.fatigue = Fx::from_raw((state.fatigue.raw() as i64 + increment)
        .clamp(0, Fx::ONE.raw() as i64) as i32);
}

/// Where the off hand lands on a two-handed grip: the driving hand reflected
/// through the body's own forward plane, shoulder for shoulder.
///
/// Lifted out of [`mirror_two_handed`] because the published pose owes a
/// *target* hand for an arm that chases no target of its own -- a `Both` grip
/// mirrors the left arm off the right every tick, so the only honest target for
/// it is this reflection of the right arm's. Two copies of the reflection would
/// be two chances for the hand a renderer draws and the hand the state carries
/// to diverge, and they would diverge silently.
pub(crate) fn mirror_hand(anatomy: &BodyAnatomySpec, yaw: Angle, right_hand: Vec3) -> Vec3 {
    let left_shoulder = shoulder(anatomy, yaw, 0);
    let right_shoulder = shoulder(anatomy, yaw, 1);
    let forward = Vec3::new(yaw.cos(), yaw.sin(), Fx::ZERO);
    let body_left = Vec3::new(-yaw.sin(), yaw.cos(), Fx::ZERO);
    let d = right_hand - right_shoulder;
    left_shoulder + forward * d.dot(forward) - body_left * d.dot(body_left)
        + Vec3::new(Fx::ZERO, Fx::ZERO, d.z)
}

pub(crate) fn mirror_two_handed(
    left: &mut ArmState,
    right: ArmState,
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
) {
    left.bearing = Angle::from_raw(yaw.raw().wrapping_mul(2).wrapping_sub(right.bearing.raw()));
    left.bearing_speed_turns = -right.bearing_speed_turns;
    left.height = right.height;
    left.height_speed = right.height_speed;
    left.reach = right.reach;
    left.reach_speed = right.reach_speed;
    left.hand = mirror_hand(anatomy, yaw, right.hand);
    left.linear_velocity = left.hand - left.previous_hand;
    #[cfg(feature = "cartesian-recoil")]
    {
        left.post_contact_com_velocity = Vec3::ZERO;
        left.post_contact_active = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actuator_y_products_are_odd_under_reflection() {
        let anatomy = crate::fighter_anatomy();
        let yaw = Angle::from_raw(9_001);
        let bearing = Angle::from_raw(21_845);
        let left = shoulder(&anatomy, yaw, 0);
        let right = shoulder(&anatomy, -yaw, 1);
        assert_eq!(left.y, -right.y);
        let left_hand = hand_position(&anatomy, yaw, 0, bearing,
            CombatHeight::MID, Fx::from_ratio(3, 4));
        let right_hand = hand_position(&anatomy, -yaw, 1, -bearing,
            CombatHeight::MID, Fx::from_ratio(3, 4));
        assert_eq!(left_hand.y, -right_hand.y);
    }

    const ACTUATOR_CANDIDATES: [(i32, i32); 4] = [
        (1_092, 182), (2_184, 364), (4_368, 728), (8_736, 1_456),
    ];

    fn cartesian_com_caps(
        state: ArmState, target: ArmTarget, item: Option<EquipmentSpec>, stats: Stats,
        authority: Fx, arm_length: Fx,
    ) -> (i32, i32) {
        let (_, available) = arm_available(state, target, item, stats, authority, Grip::OneHanded);
        let acceleration = ((Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * available) * arm_length).raw().abs();
        let maximum = ((Fx::from_raw(ARM_LINEAR_MAX_SPEED_RAW) * stat_factor(stats.agility))
            * arm_length).raw().abs();
        (acceleration, maximum)
    }

    fn idle_step() -> ArmStep {
        ArmStep { delta_bearing_speed: Fx::ZERO, delta_height_speed: Fx::ZERO,
                  delta_reach_speed: Fx::ZERO, idle_at_entry: true }
    }

    #[test]
    fn zero_com_delta_is_byte_identical_to_the_existing_fatigue_bill() {
        let mut ordinary = tucked_arm(Vec3::ZERO);
        ordinary.fatigue = Fx::from_raw(777); ordinary.work_residue = Fx::from_raw(251);
        let mut extended = ordinary;
        let step = ArmStep { delta_bearing_speed: Fx::from_raw(-31),
            delta_height_speed: Fx::from_raw(17), delta_reach_speed: Fx::from_raw(9),
            idle_at_entry: false };
        let inertia = Fx::from_ratio(3, 4); let effort = Fx::from_ratio(7, 8);
        bill_fatigue_for_grip(&mut ordinary, inertia, effort, step, Grip::OneHanded);
        bill_fatigue_with_com_delta(&mut extended, inertia, effort, step, Vec3::ZERO, Fx::ONE,
            Grip::OneHanded);
        assert_eq!(extended, ordinary);
        let mut ordinary_idle = ordinary; let mut extended_idle = ordinary;
        bill_fatigue_for_grip(&mut ordinary_idle, inertia, effort, idle_step(), Grip::OneHanded);
        bill_fatigue_with_com_delta(&mut extended_idle, inertia, effort, idle_step(), Vec3::ZERO,
            Fx::ONE, Grip::OneHanded);
        assert_eq!(extended_idle, ordinary_idle);
        assert_eq!((ordinary.fatigue.raw(), ordinary.work_residue.raw()), (778, 23));
        assert_eq!((ordinary_idle.fatigue.raw(), ordinary_idle.work_residue.raw()), (774, 23));
    }

    #[test]
    fn cartesian_com_acceleration_uses_the_existing_available_order_exactly() {
        let mut state = tucked_arm(Vec3::ZERO); state.fatigue = Fx::from_ratio(1, 4);
        let target = ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID,
            reach: Fx::ONE, effort: Fx::from_ratio(3, 4) };
        let stats = Stats::new(12, 16, 0, 0, 0);
        let sword = Some(crate::sword());
        let (_, available) =
            arm_available(state, target, sword, stats, Fx::from_ratio(2, 3), Grip::OneHanded);
        let expected = ((((target.effort * Fx::from_ratio(2, 3))
            * (Fx::ONE - state.fatigue)) * stat_factor(stats.power))
            / equipment_inertia(sword)).clamp(Fx::ZERO, Fx::ONE);
        assert_eq!(available, expected);
        let arm_length = crate::fighter_anatomy().arm_length;
        assert_eq!(cartesian_com_caps(state, target, sword, stats, Fx::from_ratio(2, 3), arm_length),
            (((Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * expected) * arm_length).raw().abs(),
             ((Fx::from_raw(ARM_LINEAR_MAX_SPEED_RAW) * stat_factor(stats.agility))
                 * arm_length).raw().abs()));
        let full = cartesian_com_caps(tucked_arm(Vec3::ZERO), ArmTarget { effort: Fx::ONE, ..target },
            None, Stats::new(20, 20, 0, 0, 0), Fx::ONE, arm_length);
        assert_eq!(full, (204, 1_228), "world COM caps forgot the non-unit arm length");
        assert_eq!(cartesian_com_caps(state, ArmTarget { effort: Fx::ZERO, ..target },
            sword, stats, Fx::ONE, arm_length).0, 0);
        assert_eq!(cartesian_com_caps(state, target, sword, stats, Fx::ZERO, arm_length).0, 0);
        let mut tired = state; tired.fatigue = Fx::ONE;
        assert_eq!(cartesian_com_caps(tired, target, sword, stats, Fx::ONE, arm_length).0, 0);
        assert!(cartesian_com_caps(state, target, None, stats, Fx::ONE, arm_length).0
            >= cartesian_com_caps(state, target, sword, stats, Fx::ONE, arm_length).0,
            "equipment inertia stopped dividing available authority before the clamp");
    }

    #[test]
    fn scalar_and_com_work_share_one_aggregate_before_the_residue_fold() {
        let mut arm = tucked_arm(Vec3::ZERO);
        arm.fatigue = Fx::from_raw(100); arm.work_residue = Fx::from_raw(200);
        let step = ArmStep { delta_bearing_speed: Fx::from_raw(100),
            delta_height_speed: Fx::from_raw(200), delta_reach_speed: Fx::from_raw(300),
            idle_at_entry: false };
        let arm_length = crate::fighter_anatomy().arm_length;
        bill_fatigue_with_com_delta(&mut arm, Fx::from_raw(16_384), Fx::ONE, step,
            Vec3::new(Fx::from_raw(205), Fx::from_raw(-102), Fx::from_raw(51)), arm_length,
            Grip::OneHanded);
        assert_eq!((arm.fatigue.raw(), arm.work_residue.raw()), (101, 11));
        let mut scalar_idle = tucked_arm(Vec3::ZERO);
        scalar_idle.fatigue = Fx::from_raw(100); scalar_idle.work_residue = Fx::from_raw(255);
        bill_fatigue_with_com_delta(&mut scalar_idle, Fx::ONE, Fx::ONE, idle_step(),
            Vec3::new(Fx::from_raw(10), Fx::from_raw(-20), Fx::from_raw(30)), Fx::ONE,
            Grip::OneHanded);
        assert_eq!((scalar_idle.fatigue.raw(), scalar_idle.work_residue.raw()), (101, 59),
                   "scalar idle recovered instead of billing active COM reconciliation");
        let mut zero_effort = tucked_arm(Vec3::ZERO);
        zero_effort.fatigue = Fx::from_raw(100); zero_effort.work_residue = Fx::from_raw(255);
        bill_fatigue_with_com_delta(&mut zero_effort, Fx::ONE, Fx::ZERO, step,
            Vec3::new(Fx::from_raw(10), Fx::from_raw(-20), Fx::from_raw(30)), Fx::ONE,
            Grip::OneHanded);
        assert_eq!((zero_effort.fatigue.raw(), zero_effort.work_residue.raw()), (100, 255));
    }

    #[test]
    fn two_handed_com_work_is_billed_once_to_the_right_owner() {
        let mut arms = [tucked_arm(Vec3::ZERO); 2];
        arms[0].fatigue = Fx::from_raw(17); arms[0].work_residue = Fx::from_raw(19);
        bill_fatigue_with_com_delta(&mut arms[1], Fx::ONE, Fx::ONE, idle_step(),
            Vec3::new(Fx::from_raw(256), Fx::ZERO, Fx::ZERO), Fx::ONE, Grip::OneHanded);
        assert_eq!((arms[0].fatigue.raw(), arms[0].work_residue.raw()), (17, 19));
        assert_eq!((arms[1].fatigue.raw(), arms[1].work_residue.raw()), (1, 0));
    }

    /// The first tick's bearing advance from rest, which is the acceleration
    /// term with nothing else in it: `tucked_arm` starts at bearing zero with
    /// zero speed, so the step is `chase`'s first acceleration clamp.
    fn first_bearing_step(item: Option<EquipmentSpec>, grip: Grip) -> i32 {
        let anatomy = crate::fighter_anatomy();
        let stats = Stats::new(12, 12, 0, 0, 0);
        let target = ArmTarget { bearing: Angle::QUARTER, height: CombatHeight::MID,
            reach: Fx::ONE, effort: Fx::ONE };
        let mut arm = tucked_arm(Vec3::ZERO);
        assert_eq!(arm.bearing.raw(), 0, "the fixture no longer starts from rest at zero");
        let _ = integrate_arm_for_grip(&mut arm, &anatomy, Angle::ZERO, 1, target, item, stats,
            Fx::ONE, ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW, grip);
        arm.bearing.raw() as i32
    }

    #[test]
    fn a_two_handed_grip_accelerates_the_club_like_a_one_handed_sword() {
        // **The claim [`TWO_HANDED_INERTIA_DIVISOR`] is chosen to make**, bounded
        // from both sides rather than as "faster than one-handed" -- a one-sided
        // bound here is satisfied by a factor of a thousand.
        //
        // `equipment_inertia` gives the Club `1.918` and the Sword `0.992` and
        // `arm_available` divides by it, so a one-handed Club must come in far
        // under a Sword and a two-handed Club must land beside it. Halved, the
        // Club is `0.959` against the Sword's `0.992`, which is 3.4% *more*
        // available acceleration and not less -- so the band is deliberately
        // asymmetric, and a symmetric one would be claiming the wrong thing.
        let sword = first_bearing_step(Some(crate::sword()), Grip::OneHanded);
        let club_one = first_bearing_step(Some(crate::club()), Grip::OneHanded);
        let club_two = first_bearing_step(Some(crate::club()), Grip::TwoHanded);
        assert!(sword > 0 && club_one > 0 && club_two > 0,
            "a fixture that does not move cannot bound an acceleration: \
             sword {sword}, club one-handed {club_one}, club two-handed {club_two}");

        // Within [0.95, 1.10] of the Sword: the stated fraction.
        assert!(club_two * 100 >= sword * 95 && club_two * 100 <= sword * 110,
            "a two-handed Club left the Sword's band: club two-handed {club_two}, \
             sword {sword}, ratio {}%", club_two * 100 / sword);

        // **The teeth.** The same band must reject the one-handed Club, or the
        // assertion above is measuring nothing: it is the handicap this session
        // exists to cancel.
        assert!(club_one * 100 < sword * 95,
            "a one-handed Club is already inside the Sword's band, so the band \
             cannot be evidence of the coupling: club {club_one}, sword {sword}");
        assert!(club_two > club_one, "two hands did not accelerate the Club at all");
    }

    #[test]
    fn a_two_handed_grip_bills_one_arm_of_fatigue_and_not_two() {
        // One item's work billed once across the pair, against the same work
        // billed to a single arm. The two shares carry their own residues, so
        // they rejoin to within one raw unit rather than exactly, which the
        // contract says in as many words.
        let step = ArmStep { delta_bearing_speed: Fx::from_raw(120),
            delta_height_speed: Fx::from_raw(60), delta_reach_speed: Fx::from_raw(30),
            idle_at_entry: false };
        let inertia = equipment_inertia(Some(crate::club()));
        let ticks = 64;
        let bill = |grip: Grip| {
            let mut arm = tucked_arm(Vec3::ZERO);
            for _ in 0..ticks { bill_fatigue_for_grip(&mut arm, inertia, Fx::ONE, step, grip); }
            arm
        };
        let alone = bill(Grip::OneHanded);
        let left = bill(Grip::TwoHanded);
        let right = bill(Grip::TwoHanded);
        assert!(alone.fatigue.raw() > 0, "the fixture billed no fatigue to compare");

        // Equal halves, which is what keeps the two accounts identical at world
        // level -- `a_two_handed_target_mirrors_the_off_hand` asserts that.
        assert_eq!(left.fatigue, right.fatigue);
        let shared = left.fatigue.raw() + right.fatigue.raw();
        assert!((shared - alone.fatigue.raw()).abs() <= 1,
            "the pair's summed fatigue is not one arm's bill: shared {shared}, \
             one-handed {}", alone.fatigue.raw());

        // **The teeth.** Billing each arm in full -- what this session replaced --
        // sums to twice the bill, and must fail the bound above.
        let doubled = alone.fatigue.raw() * 2;
        assert!((doubled - alone.fatigue.raw()).abs() > 1,
            "the old whole-bill-to-each behaviour would satisfy the bound above, \
             so the bound is not evidence of the sharing");
        assert!(shared < doubled, "the pair still pays more than one arm's work");
    }

    #[test]
    fn a_one_handed_grip_is_unchanged_by_the_two_handed_term() {
        // **The scoping control.** Both levers are the identity on
        // `Grip::OneHanded`, so no one-handed path anywhere can move, and the
        // one-handed entry points are that value applied to the shared body.
        for value in [Fx::from_ratio(1, 4), Fx::from_ratio(31, 25), Fx::from_ratio(223, 100),
                      Fx::ONE, Fx::from_raw(1), Fx::ZERO] {
            assert_eq!(Grip::OneHanded.driven_inertia(value), value, "the divisor is not inert");
            assert_eq!(Grip::OneHanded.share_work(value), value, "the share is not inert");
        }

        // Bounded on the other side: the two-handed value must actually move,
        // or both levers are wired to nothing.
        let club = equipment_inertia(Some(crate::club()));
        assert_eq!(Grip::TwoHanded.driven_inertia(club),
            Fx::from_raw(club.raw() / TWO_HANDED_INERTIA_DIVISOR));
        assert!(Grip::TwoHanded.driven_inertia(club) < club);
        assert!(Grip::TwoHanded.share_work(club) < club);

        // The bare-arm floor survives the division. An empty hand's `1/4` is the
        // arm itself, and a second hand does not make the arm weightless.
        let bare = equipment_inertia(None);
        assert_eq!(Grip::TwoHanded.driven_inertia(bare), bare,
            "the two-handed divisor cut below the bare-arm floor");

        // And the whole integration agrees through both entry points.
        let anatomy = crate::fighter_anatomy();
        let stats = Stats::new(12, 12, 0, 0, 0);
        let target = ArmTarget { bearing: Angle::QUARTER, height: CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::from_ratio(3, 4) };
        let (mut plain, mut explicit) = (tucked_arm(Vec3::ZERO), tucked_arm(Vec3::ZERO));
        for _ in 0..8 {
            let _ = integrate_arm_with_rates(&mut plain, &anatomy, Angle::ZERO, 1, target,
                Some(crate::club()), stats, Fx::ONE,
                ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW);
            let _ = integrate_arm_for_grip(&mut explicit, &anatomy, Angle::ZERO, 1, target,
                Some(crate::club()), stats, Fx::ONE,
                ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW, Grip::OneHanded);
        }
        assert_eq!(plain, explicit, "the one-handed entry point stopped agreeing with OneHanded");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn two_handed_mirror_clears_the_nonowning_left_recoil() {
        let anatomy = crate::fighter_anatomy();
        let mut left = tucked_arm(Vec3::ZERO); let mut right = tucked_arm(Vec3::X);
        left.post_contact_active = true;
        left.post_contact_com_velocity = Vec3::new(
            Fx::from_raw(5), Fx::from_raw(7), Fx::from_raw(-11));
        right.post_contact_active = true;
        right.post_contact_com_velocity = Vec3::new(
            Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3));
        mirror_two_handed(&mut left, right, &anatomy, Angle::ZERO);
        assert_eq!((left.post_contact_active, left.post_contact_com_velocity),
                   (false, Vec3::ZERO));
        assert_eq!((right.post_contact_active, right.post_contact_com_velocity),
                   (true, Vec3::new(Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3))));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn inactive_recoil_and_non_segment_items_are_byte_identical() {
        let anatomy = crate::fighter_anatomy();
        let target = ArmTarget { bearing: Angle::from_raw(8_192),
            height: CombatHeight::HIGH, reach: Fx::from_ratio(3, 4), effort: Fx::ONE };
        let stats = Stats::new(14, 13, 0, 0, 0);
        for item in [None, Some(crate::sword()), Some(crate::shield())] {
            let mut recoil = tucked_arm(hand_position(&anatomy, Angle::ZERO, 1,
                Angle::ZERO, CombatHeight::MID, Fx::from_raw(ARM_MIN_REACH_RAW)));
            let mut ordinary = recoil;
            let recoil_step = integrate_arm_with_recoil(&mut recoil, &anatomy, Angle::ZERO, 1,
                target, item, stats, Fx::ONE, ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW);
            let ordinary_step = integrate_arm_with_rates(&mut ordinary, &anatomy, Angle::ZERO, 1,
                target, item, stats, Fx::ONE, ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW);
            assert_eq!((recoil_step.delta_bearing_speed, recoil_step.delta_height_speed,
                        recoil_step.delta_reach_speed, recoil_step.idle_at_entry),
                       (ordinary_step.delta_bearing_speed, ordinary_step.delta_height_speed,
                        ordinary_step.delta_reach_speed, ordinary_step.idle_at_entry));
            assert_eq!(recoil, ordinary);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn wall_settlement_removes_only_the_clipped_absolute_com_component() {
        let c = Vec3::new(Fx::from_raw(-7), Fx::from_raw(11), Fx::from_raw(13));
        let solved = Vec2::new(Fx::from_raw(19), Fx::from_raw(23));
        let settled = Vec2::new(Fx::ZERO, Fx::from_raw(23));
        let after = settle_post_contact_com(c, solved, settled);
        assert_eq!(after, Vec3::new(Fx::ZERO, Fx::from_raw(11), Fx::from_raw(13)));
        assert_eq!(Vec3::new(settled.x, settled.y, Fx::ZERO) + after,
                   Vec3::new(Fx::ZERO, Fx::from_raw(34), Fx::from_raw(13)));
    }

    #[test]
    fn bearing_speed_reaches_the_selected_sweep_without_overshoot() {
        for (max_speed, acceleration) in ACTUATOR_CANDIDATES {
            let (mut error, mut speed) = (16_384, 0);
            let mut previous = error;
            for _ in 0..64 {
                let (step, next_speed) = chase(error, speed, max_speed, acceleration);
                assert!(step >= 0 && step <= error, "the bearing passed its target");
                error -= step;
                speed = next_speed;
                assert!(error <= previous, "the selected sweep moved away from its target");
                previous = error;
                if error == 0 { break; }
            }
            assert_eq!((error, speed), (0, 0));
        }
    }

    #[test]
    fn the_selected_pair_preserves_the_measured_speed_to_acceleration_ratio() {
        for (max_speed, acceleration) in ACTUATOR_CANDIDATES {
            assert_eq!(max_speed, acceleration * 6);
        }
    }

    #[test]
    fn the_hand_inverse_recovers_a_reachable_pose_and_clamps_the_rest() {
        let anatomy = crate::combat::spec::fighter_anatomy();
        // Round trip: every pose `hand_position` can produce must come back
        // close enough that re-deriving the hand lands on the same point. Not
        // bit-exact and it cannot be -- the forward map goes through a sine
        // table and the inverse through `Vec2::angle`, so the two round at
        // different places. What matters is that the error does not accumulate
        // into a pose the joint would refuse.
        let (mut worst_bearing, mut worst_reach, mut worst_hand) = (0i32, Fx::ZERO, Fx::ZERO);
        for yaw_raw in [0u16, 9_001, 32_768, 61_111] {
            let yaw = Angle::from_raw(yaw_raw);
            for limb in 0..2 {
                for bearing_raw in [0u16, 4_096, 21_845, 40_000] {
                    let bearing = Angle::from_raw(bearing_raw);
                    let reach = Fx::from_ratio(3, 4);
                    let hand = hand_position(&anatomy, yaw, limb, bearing, CombatHeight::MID, reach);
                    let (back, height, back_reach) =
                        inverse_hand(&anatomy, yaw, limb, hand, Angle::ZERO);
                    assert_eq!(height, CombatHeight::MID);
                    let again = hand_position(&anatomy, yaw, limb, back, height, back_reach);
                    worst_bearing = worst_bearing.max(back.delta(bearing).abs());
                    worst_reach = worst_reach.max((back_reach - reach).abs());
                    worst_hand = worst_hand.max((again - hand).length());
                }
            }
        }
        // The measured worst over this grid, pinned rather than loosely bounded
        // so a change in either direction shows up here rather than downstream.
        // Smart51's odd-symmetric shoulder/hand products reduced the measured
        // maximum from 15/53 to 14/49. A raw angle unit is 1/65,536 of a turn,
        // so 14 of them is 0.077 degrees; 49 raw of hand movement is 0.0007 of a world unit, against a
        // body radius of about a half. The error is real and it does not
        // accumulate: the caller re-derives the hand from the pose that comes
        // back, so what lands in world state is `again`, not `hand`.
        assert_eq!((worst_bearing, worst_reach.raw(), worst_hand.raw()), (14, 2, 49));

        // And the clamps. A hand hauled far past the arm's length comes back at
        // full reach rather than as an impossible pose, and one dragged under
        // the floor comes back at height zero.
        let yaw = Angle::ZERO;
        let far = hand_position(&anatomy, yaw, 1, Angle::ZERO, CombatHeight::MID, Fx::ONE)
            + Vec3::from_ints(50, 0, 0);
        let (_, _, reach) = inverse_hand(&anatomy, yaw, 1, far, Angle::ZERO);
        assert_eq!(reach, Fx::ONE);
        let under = Vec3::new(Fx::ONE, Fx::ZERO, Fx::from_int(-9));
        let (_, height, _) = inverse_hand(&anatomy, yaw, 1, under, Angle::ZERO);
        assert_eq!(height.raw(), 0);

        // A hand exactly on the shoulder axis has no direction to report, so it
        // keeps the one it was given rather than inventing east.
        let shoulder = shoulder(&anatomy, yaw, 0);
        let (kept, _, _) = inverse_hand(&anatomy, yaw, 0, shoulder, Angle::QUARTER);
        assert_eq!(kept, Angle::QUARTER);
    }

    #[test]
    fn yaw_raw_vectors_match_the_frozen_contract() {
        let mut half = BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
        let mut speeds = Vec::new();
        for _ in 0..6 {
            integrate_yaw(&mut half, Angle::HALF, Fx::ONE);
            speeds.push(half.speed_turns.raw());
        }
        assert_eq!(half.angle.raw(), 63_625);
        assert_eq!(speeds, [-91, -182, -273, -364, -455, -546]);
        let mut short = BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
        integrate_yaw(&mut short, Angle::from_raw(100), Fx::ONE);
        assert_eq!((short.angle.raw(), short.speed_turns.raw()), (91, 91));
        integrate_yaw(&mut short, Angle::from_raw(100), Fx::ONE);
        assert_eq!((short.angle.raw(), short.speed_turns.raw()), (100, 0));

        let mut impaired = BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
        integrate_yaw(&mut impaired, Angle::QUARTER, Fx::HALF);
        assert_eq!((impaired.speed_turns.raw(), impaired.authority_residue.raw()), (45, 32_768));
        integrate_yaw(&mut impaired, Angle::QUARTER, Fx::HALF);
        assert_eq!((impaired.speed_turns.raw(), impaired.authority_residue.raw()), (91, 0));
    }

    #[test]
    fn fatigue_bills_snap_deceleration_carries_residue_and_recovers_next_idle_tick() {
        let anatomy = crate::fighter_anatomy();
        let hand = hand_position(&anatomy, Angle::ZERO, 0, Angle::ZERO,
            CombatHeight::MID, Fx::from_raw(ARM_MIN_REACH_RAW));
        let mut arm = tucked_arm(hand);
        arm.bearing_speed_turns = Fx::from_raw(4_096);
        arm.fatigue = Fx::from_raw(100);
        arm.work_residue = Fx::from_raw(255);
        let target = ArmTarget {
            bearing: Angle::from_raw(1),
            height: CombatHeight::MID,
            reach: Fx::from_raw(ARM_MIN_REACH_RAW),
            effort: Fx::ONE,
        };
        let step = integrate_arm_with_rates(
            &mut arm, &anatomy, Angle::ZERO, 0, target, None,
            Stats::new(20, 20, 0, 0, 0), Fx::ONE,
            ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW,
        );
        assert_eq!(step.delta_bearing_speed.raw(), -4_096, "snap did not bill final minus entry speed");
        assert_eq!((arm.bearing.raw(), arm.bearing_speed_turns.raw()), (1, 0));
        assert_eq!((arm.fatigue.raw(), arm.work_residue.raw()), (101, 255),
            "arrival tick recovered or the /256 quotient and residue drifted");
        let idle = integrate_arm_with_rates(
            &mut arm, &anatomy, Angle::ZERO, 0, target, None,
            Stats::new(20, 20, 0, 0, 0), Fx::ONE,
            ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW,
        );
        assert!(idle.idle_at_entry);
        assert_eq!((arm.fatigue.raw(), arm.work_residue.raw()), (97, 255));
    }

    #[test]
    #[ignore]
    fn regenerate_actuator_evidence() {
        use std::fmt::Write as _;

        let scenario = crate::Scenario::articulated_duel();
        assert_eq!(scenario.name, "articulated-duel-v1");
        let _seed_one_world = crate::World::new(&scenario, 1);
        let table = scenario.combat_specs.as_ref().unwrap();
        assert_eq!(table.anatomy(1), Some(&crate::fighter_anatomy()));
        assert_eq!(table.anatomy(2), Some(&crate::combat::spec::brute_anatomy()));
        assert_eq!(table.equipment(1), Some(&crate::sword()));
        assert_eq!(table.equipment(2), Some(&crate::shield()));
        assert_eq!(table.equipment(3), Some(&crate::club()));
        assert_eq!(scenario.units[0].stats, crate::Body::Fighter.base_stats());
        assert_eq!(scenario.units[1].stats, crate::Body::Brute.base_stats());

        let mut out = String::new();
        writeln!(out, "## Yaw traces\n").unwrap();
        writeln!(out, "Columns: `tick,target,entry_angle,entry_error,desired_speed,accel_cap,final_speed,step,final_angle,residue`.\n").unwrap();
        for target in [Angle::QUARTER, Angle::HALF] {
            writeln!(out, "### Target {}\n\n```csv", target.raw()).unwrap();
            writeln!(out, "tick,target,entry_angle,entry_error,desired_speed,accel_cap,final_speed,step,final_angle,residue").unwrap();
            let mut yaw = BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
            let mut tick = 0;
            while yaw.angle != target || yaw.speed_turns != Fx::ZERO {
                tick += 1;
                let entry = yaw;
                let error = target.delta(entry.angle);
                let desired = error.clamp(-BODY_YAW_MAX_SPEED_RAW, BODY_YAW_MAX_SPEED_RAW);
                let n = BODY_YAW_ACCEL_RAW as i64 * Fx::ONE.raw() as i64
                    + entry.authority_residue.raw() as i64;
                let acceleration = n / Fx::ONE.raw() as i64;
                integrate_yaw(&mut yaw, target, Fx::ONE);
                let step = yaw.angle.delta(entry.angle);
                writeln!(out, "{},{},{},{},{},{},{},{},{},{}", tick, target.raw(), entry.angle.raw(),
                    error, desired, acceleration.abs(), yaw.speed_turns.raw(), step, yaw.angle.raw(),
                    yaw.authority_residue.raw()).unwrap();
            }
            writeln!(out, "```\n\nSettled in {} ticks.\n", tick).unwrap();
            assert_eq!(tick, if target == Angle::QUARTER { 33 } else { 63 });
        }
        writeln!(out, "The quarter turn is within `(1,40]`; the half-turn rows prove the negative exact-tie direction. The separately pinned half-authority speed/residue vector is `45/32768`, then `91/0`.\n").unwrap();
        writeln!(out, "## Arm traces\n").unwrap();
        writeln!(out, "Columns are target bearing/height/reach; entry errors and speeds; bearing/height/reach acceleration caps; final speeds and scalar steps; fatigue/residue; and previous/current hand plus velocity.\n").unwrap();
        let cases = [
            ("Fighter left MID-to-HIGH", crate::fighter_anatomy(), Some(crate::shield()), crate::Body::Fighter.base_stats(), Angle::ZERO, 0usize,
                ArmTarget { bearing: Angle::ZERO, height: CombatHeight::HIGH, reach: Fx::from_raw(ARM_MIN_REACH_RAW), effort: Fx::ONE }),
            ("Fighter right Sword tuck-to-full", crate::fighter_anatomy(), Some(crate::sword()), crate::Body::Fighter.base_stats(), Angle::ZERO, 1usize,
                ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID, reach: Fx::ONE, effort: Fx::ONE }),
            ("Brute right Club tuck-to-full", crate::combat::spec::brute_anatomy(), Some(crate::club()), crate::Body::Brute.base_stats(), Angle::HALF, 1usize,
                ArmTarget { bearing: Angle::ZERO, height: CombatHeight::MID, reach: Fx::ONE, effort: Fx::ONE }),
            ("Fighter Shield MID-to-HIGH", crate::fighter_anatomy(), Some(crate::shield()), crate::Body::Fighter.base_stats(), Angle::ZERO, 0usize,
                ArmTarget { bearing: Angle::ZERO, height: CombatHeight::HIGH, reach: Fx::from_raw(ARM_MIN_REACH_RAW), effort: Fx::ONE }),
        ];
        for (name, anatomy, item, stats, yaw, limb, target) in cases {
            writeln!(out, "### {}\n\n```csv", name).unwrap();
            writeln!(out, "tick,limb,tb,th,tr,eb,eh,er,ibs,ihs,irs,capb,caph,capr,fbs,fhs,frs,sb,sh,sr,fatigue,residue,prev_x,prev_y,prev_z,hand_x,hand_y,hand_z,vel_x,vel_y,vel_z").unwrap();
            let hand = hand_position(&anatomy, yaw, limb, Angle::ZERO,
                CombatHeight::MID, Fx::from_raw(ARM_MIN_REACH_RAW));
            let mut arm = tucked_arm(hand);
            let mut tick = 0;
            while arm.bearing != target.bearing || arm.height != target.height || arm.reach != target.reach
                || arm.bearing_speed_turns != Fx::ZERO || arm.height_speed != Fx::ZERO || arm.reach_speed != Fx::ZERO {
                tick += 1;
                let entry = arm;
                let eb = target.bearing.delta(entry.bearing);
                let eh = target.height.raw() - entry.height.raw();
                let er = target.reach.raw().max(ARM_MIN_REACH_RAW) - entry.reach.raw();
                let inertia = equipment_inertia(item);
                let available = ((((target.effort * Fx::ONE) * (Fx::ONE - entry.fatigue))
                    * stat_factor(stats.power)) / inertia).clamp(Fx::ZERO, Fx::ONE);
                let capb = (Fx::from_raw(ARM_BEARING_ACCEL_RAW) * available).raw();
                let capl = (Fx::from_raw(ARM_LINEAR_ACCEL_RAW) * available).raw();
                integrate_arm_with_rates(
                    &mut arm, &anatomy, yaw, limb, target, item, stats, Fx::ONE,
                    ARM_BEARING_MAX_SPEED_RAW, ARM_BEARING_ACCEL_RAW,
                );
                writeln!(out, "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
                    tick, limb, target.bearing.raw(), target.height.raw(), target.reach.raw(), eb, eh, er,
                    entry.bearing_speed_turns.raw(), entry.height_speed.raw(), entry.reach_speed.raw(), capb, capl, capl,
                    arm.bearing_speed_turns.raw(), arm.height_speed.raw(), arm.reach_speed.raw(),
                    arm.bearing.delta(entry.bearing), arm.height.raw() - entry.height.raw(), arm.reach.raw() - entry.reach.raw(),
                    arm.fatigue.raw(), arm.work_residue.raw(), arm.previous_hand.x.raw(), arm.previous_hand.y.raw(),
                    arm.previous_hand.z.raw(), arm.hand.x.raw(), arm.hand.y.raw(), arm.hand.z.raw(),
                    arm.linear_velocity.x.raw(), arm.linear_velocity.y.raw(), arm.linear_velocity.z.raw()).unwrap();
                assert!(tick <= 100);
            }
            writeln!(out, "```\n\nSettled in {} ticks.\n", tick).unwrap();
            assert!((2..=90).contains(&tick));
        }
        writeln!(out, "All stored speeds remain within the frozen maxima. Every arm sweep settles in `(1,90]`.\n").unwrap();

        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../docs/performance/v2-actuator-sweep.md");
        let document = std::fs::read_to_string(&path).unwrap();
        let start = document.find("<!-- GENERATED_TRACES_START -->").unwrap();
        let end = document.find("<!-- GENERATED_TRACES_END -->").unwrap();
        let replacement = format!("<!-- GENERATED_TRACES_START -->\n{}<!-- GENERATED_TRACES_END -->", out);
        let mut regenerated = document[..start].to_string();
        regenerated.push_str(&replacement);
        regenerated.push_str(&document[end + "<!-- GENERATED_TRACES_END -->".len()..]);
        std::fs::write(path, regenerated).unwrap();
    }
}
