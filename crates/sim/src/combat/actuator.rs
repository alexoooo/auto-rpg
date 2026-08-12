use crate::{ArmTarget, BodyAnatomySpec, CombatHeight, EquipmentSpec, Stats};
use fx::{Angle, Fx, Vec2, Vec3};

pub const BODY_YAW_MAX_SPEED_RAW: i32 = 546;
pub const BODY_YAW_ACCEL_RAW: i32 = 91;
pub const ARM_BEARING_MAX_SPEED_RAW: i32 = 1_092;
pub const ARM_BEARING_ACCEL_RAW: i32 = 182;
pub const ARM_LINEAR_MAX_SPEED_RAW: i32 = 1_638;
pub const ARM_LINEAR_ACCEL_RAW: i32 = 273;
pub const ARM_MIN_REACH_RAW: i32 = 16_384;
pub const FATIGUE_WORK_SCALE_RAW: i32 = 256;
pub const FATIGUE_RECOVERY_RAW: i32 = 4;

/// The two bearing rates varied by Lab's clean-strike experiment. This is not
/// scenario or world state: ordinary stepping always supplies [`PRODUCTION_ARM_CALIBRATION`].
#[cfg(feature = "lab-calibration")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArmCalibration {
    pub bearing_max_speed_raw: i32,
    pub bearing_accel_raw: i32,
}

#[cfg(feature = "lab-calibration")]
pub const PRODUCTION_ARM_CALIBRATION: ArmCalibration = ArmCalibration {
    bearing_max_speed_raw: ARM_BEARING_MAX_SPEED_RAW,
    bearing_accel_raw: ARM_BEARING_ACCEL_RAW,
};

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

pub(crate) fn shoulder(anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize) -> Vec3 {
    let side = if limb == 0 { anatomy.shoulder_half_width } else { -anatomy.shoulder_half_width };
    Vec3::new(-yaw.sin() * side, yaw.cos() * side, anatomy.shoulder_height)
}

pub(crate) fn hand_position(
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    bearing: Angle,
    height: CombatHeight,
    reach: Fx,
) -> Vec3 {
    let shoulder = shoulder(anatomy, yaw, limb);
    let physical_reach = anatomy.arm_length * reach.max(Fx::from_raw(ARM_MIN_REACH_RAW));
    Vec3::new(
        shoulder.x + bearing.cos() * physical_reach,
        shoulder.y + bearing.sin() * physical_reach,
        anatomy.standing_height * Fx::from_raw(height.raw()),
    )
}

/// The inverse of [`hand_position`]: the joint pose that puts the hand where
/// contact left it, clamped to the joint's own limits.
///
/// Contact moves an absolute hand while the authoritative state is a joint
/// pose, so something has to run this direction -- and it cannot be exact. A
/// shoulder cannot reach past its arm and height is a bounded fraction of
/// standing height, so the pose that comes back may put the hand somewhere
/// else. That is why the caller must re-derive the hand from this answer rather
/// than keep the one it asked for, and why the contract makes the *clamped*
/// hand the state the energy check reads.
///
/// `fallback_bearing` is answered when the hand lands exactly on the shoulder
/// axis, where the horizontal vector is zero and carries no direction at all.
/// Reusing the current bearing there is the only choice that does not invent
/// one; the hand is on the axis either way, so nothing observable turns on it.
pub(crate) fn inverse_hand(
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    hand: Vec3,
    fallback_bearing: Angle,
) -> (Angle, CombatHeight, Fx) {
    let shoulder = shoulder(anatomy, yaw, limb);
    let planar = Vec2::new(hand.x - shoulder.x, hand.y - shoulder.y);
    let bearing = if planar.is_zero() { fallback_bearing } else { planar.angle() };
    let height = if anatomy.standing_height.is_positive() {
        (hand.z / anatomy.standing_height).clamp(Fx::ZERO, Fx::ONE)
    } else {
        Fx::ZERO
    };
    let reach = if anatomy.arm_length.is_positive() {
        planar.length() / anatomy.arm_length
    } else {
        Fx::ONE
    };
    (
        bearing,
        CombatHeight::try_from_raw(height.raw()).expect("height clamped into range"),
        reach.clamp(Fx::from_raw(ARM_MIN_REACH_RAW), Fx::ONE),
    )
}

pub(crate) fn integrate_yaw(state: &mut BodyYawState, target: Angle, authority: Fx) {
    let error = target.delta(state.angle);
    let desired = error.clamp(-BODY_YAW_MAX_SPEED_RAW, BODY_YAW_MAX_SPEED_RAW);
    let n = BODY_YAW_ACCEL_RAW as i64 * authority.raw() as i64
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
) -> (Fx, Fx) {
    let inertia = equipment_inertia(item);
    let power = stat_factor(stats.power);
    let available = ((((target.effort * authority) * (Fx::ONE - state.fatigue)) * power) / inertia)
        .clamp(Fx::ZERO, Fx::ONE);
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
    let (step, inertia, _, _) = integrate_arm_unbilled(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw,
    );
    bill_fatigue(state, inertia, target.effort, step);
    step
}

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

    let (inertia, available) = arm_available(*state, target, item, stats, authority);
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
    let entry_bearing = state.bearing;
    let entry_hand = state.hand;
    let entry_com = state.post_contact_com_velocity;
    let was_active = state.post_contact_active;
    let (step, inertia, com_accel, com_max) = integrate_arm_unbilled(
        state, anatomy, yaw, limb, target, item, stats, authority,
        bearing_max_speed_raw, bearing_accel_raw,
    );
    let next_offset = item.and_then(|item| {
        let crate::EquipmentGeometry::Segment { length, .. } = item.geometry else { return None };
        let old = Vec3::new(entry_bearing.cos(), entry_bearing.sin(), Fx::ZERO) * length;
        let new = Vec3::new(state.bearing.cos(), state.bearing.sin(), Fx::ZERO) * length;
        Some((new - old) * item.balance)
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
        if was_active { next_com - entry_com } else { Vec3::ZERO }, anatomy.arm_length);
    step
}

pub(crate) fn bill_fatigue(state: &mut ArmState, inertia: Fx, effort: Fx, step: ArmStep) {
    bill_fatigue_with_com_delta(state, inertia, effort, step, Vec3::ZERO, Fx::ONE);
}

fn bill_fatigue_with_com_delta(
    state: &mut ArmState, inertia: Fx, effort: Fx, step: ArmStep,
    delta_com_velocity: Vec3, arm_length: Fx,
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
    let work = ((inertia * inertia) * effort) * sum;
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

    const ACTUATOR_CANDIDATES: [(i32, i32); 4] = [
        (1_092, 182), (2_184, 364), (4_368, 728), (8_736, 1_456),
    ];

    fn cartesian_com_caps(
        state: ArmState, target: ArmTarget, item: Option<EquipmentSpec>, stats: Stats,
        authority: Fx, arm_length: Fx,
    ) -> (i32, i32) {
        let (_, available) = arm_available(state, target, item, stats, authority);
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
        bill_fatigue(&mut ordinary, inertia, effort, step);
        bill_fatigue_with_com_delta(&mut extended, inertia, effort, step, Vec3::ZERO, Fx::ONE);
        assert_eq!(extended, ordinary);
        let mut ordinary_idle = ordinary; let mut extended_idle = ordinary;
        bill_fatigue(&mut ordinary_idle, inertia, effort, idle_step());
        bill_fatigue_with_com_delta(&mut extended_idle, inertia, effort, idle_step(), Vec3::ZERO, Fx::ONE);
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
        let (_, available) = arm_available(state, target, sword, stats, Fx::from_ratio(2, 3));
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
            Vec3::new(Fx::from_raw(205), Fx::from_raw(-102), Fx::from_raw(51)), arm_length);
        assert_eq!((arm.fatigue.raw(), arm.work_residue.raw()), (101, 11));
        let mut scalar_idle = tucked_arm(Vec3::ZERO);
        scalar_idle.fatigue = Fx::from_raw(100); scalar_idle.work_residue = Fx::from_raw(255);
        bill_fatigue_with_com_delta(&mut scalar_idle, Fx::ONE, Fx::ONE, idle_step(),
            Vec3::new(Fx::from_raw(10), Fx::from_raw(-20), Fx::from_raw(30)), Fx::ONE);
        assert_eq!((scalar_idle.fatigue.raw(), scalar_idle.work_residue.raw()), (101, 59),
                   "scalar idle recovered instead of billing active COM reconciliation");
        let mut zero_effort = tucked_arm(Vec3::ZERO);
        zero_effort.fatigue = Fx::from_raw(100); zero_effort.work_residue = Fx::from_raw(255);
        bill_fatigue_with_com_delta(&mut zero_effort, Fx::ONE, Fx::ZERO, step,
            Vec3::new(Fx::from_raw(10), Fx::from_raw(-20), Fx::from_raw(30)), Fx::ONE);
        assert_eq!((zero_effort.fatigue.raw(), zero_effort.work_residue.raw()), (100, 255));
    }

    #[test]
    fn two_handed_com_work_is_billed_once_to_the_right_owner() {
        let mut arms = [tucked_arm(Vec3::ZERO); 2];
        arms[0].fatigue = Fx::from_raw(17); arms[0].work_residue = Fx::from_raw(19);
        bill_fatigue_with_com_delta(&mut arms[1], Fx::ONE, Fx::ONE, idle_step(),
            Vec3::new(Fx::from_raw(256), Fx::ZERO, Fx::ZERO), Fx::ONE);
        assert_eq!((arms[0].fatigue.raw(), arms[0].work_residue.raw()), (17, 19));
        assert_eq!((arms[1].fatigue.raw(), arms[1].work_residue.raw()), (1, 0));
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
        // A raw angle unit is 1/65,536 of a turn, so 15 of them is 0.082
        // degrees; 53 raw of hand movement is 0.0008 of a world unit, against a
        // body radius of about a half. The error is real and it does not
        // accumulate: the caller re-derives the hand from the pose that comes
        // back, so what lands in world state is `again`, not `hand`.
        assert_eq!((worst_bearing, worst_reach.raw(), worst_hand.raw()), (15, 2, 53));

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
