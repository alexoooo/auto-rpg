//! Pure exact trajectory grammar for the feature-gated contact response.
//!
//! Motors continue to own endpoint rotation. Contact adds only an exact
//! translation shared by an owner and, for equipment, one held-relative exact
//! translation. This module is deliberately below both the detector and the
//! resolver so neither can grow a second evaluator.

// Checkpoint A is intentionally pure and checkpoint B is its first production
// caller. Keeping the feature build warning-clean during that one-checkpoint
// interval is more honest than exporting the grammar merely to manufacture use.
#![allow(dead_code)]

use crate::combat::contact::{
    ContactFact, ContactKind, ContactResolution, BODY_SLOT, MAX_ARTICULATED_ENTITIES, NO_REGION,
};
use crate::combat::resolution::GeneralizedKind;
use crate::combat::spec::{AnatomyRegion, EquipmentSpecId, SurfaceSpec};
use crate::{EntityId, Faction};
use fx::{Fx, Vec3};

const TICK_RAW: i128 = 65_536;
const MAX_EXACT_OWNERS: usize = MAX_ARTICULATED_ENTITIES;
const MAX_FLOOR_REACTIONS: usize = MAX_ARTICULATED_ENTITIES;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub(crate) struct ExactPosition { pub(crate) raw: i32, pub(crate) remainder: i128 }

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub(crate) struct ExactMomentum { pub(crate) velocity_raw: i32, pub(crate) remainder: i128 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactAffine3 {
    pub(crate) mass_raw: i32,
    pub(crate) at_group: [ExactPosition; 3],
    pub(crate) momentum: [ExactMomentum; 3],
    pub(crate) group_time_raw: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactMotorPoint {
    pub(crate) at_tick_start_raw: [i32; 3],
    pub(crate) tick_delta_raw: [i32; 3],
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactMotorBounds {
    pub(crate) lower: ExactMotorPoint,
    pub(crate) upper: ExactMotorPoint,
    pub(crate) radius_raw: i32,
    pub(crate) present: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum MotorShape {
    Body { origin: ExactMotorPoint, parts: [ExactMotorBounds; AnatomyRegion::COUNT] },
    Segment { hilt: ExactMotorPoint, tip: ExactMotorPoint, radius_raw: i32 },
    Shield { corners: [ExactMotorPoint; 4] },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactHeldResponse {
    pub(crate) slot: u8,
    pub(crate) spec_id: EquipmentSpecId,
    pub(crate) affine: ExactAffine3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactOwnerTrajectory {
    pub(crate) entity: EntityId,
    pub(crate) body_mass_raw: i32,
    /// Immutable denominator shared by every legal common-mass state of this
    /// owner. Grip lifecycle changes active mass, never this lattice.
    pub(crate) common_scale: i128,
    pub(crate) common_response: ExactAffine3,
    pub(crate) held_response: [Option<ExactHeldResponse>; 2],
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactContactTrajectory {
    pub(crate) entity: EntityId,
    pub(crate) faction: Faction,
    pub(crate) slot: u8,
    pub(crate) kind: GeneralizedKind,
    pub(crate) mass_raw: i32,
    pub(crate) surface: SurfaceSpec,
    pub(crate) motor: MotorShape,
    pub(crate) owner_index: usize,
    pub(crate) held_index: Option<usize>,
    pub(crate) equipment_spec: Option<EquipmentSpecId>,
    pub(crate) present: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactRational { pub(crate) numerator: i128, pub(crate) denominator: i128 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactPoint(pub(crate) [ExactRational; 3]);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct EvaluatedMotorBounds {
    pub(crate) lower: ExactPoint,
    pub(crate) upper: ExactPoint,
    pub(crate) radius_raw: i32,
    pub(crate) present: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum EvaluatedContactShape {
    Body { origin: ExactPoint, parts: [EvaluatedMotorBounds; AnatomyRegion::COUNT] },
    Segment { hilt: ExactPoint, tip: ExactPoint, radius_raw: i32 },
    Shield { corners: [ExactPoint; 4] },
}

pub(crate) fn exact_point_quotient(value: ExactPoint)
    -> Result<Vec3, ExactTrajectoryReject>
{
    let mut raw = [0; 3];
    for axis in 0..3 {
        if value.0[axis].denominator <= 0 { return Err(ExactTrajectoryReject::NonCanonical); }
        raw[axis] = i32::try_from(value.0[axis].numerator / value.0[axis].denominator)
            .map_err(|_| ExactTrajectoryReject::Arithmetic)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

pub(crate) fn exact_held_velocity(owner: ExactOwnerTrajectory, held_at: usize)
    -> Result<Vec3, ExactTrajectoryReject>
{
    validate_owner(owner)?;
    let held = owner.held_response.get(held_at).and_then(|held| *held)
        .ok_or(ExactTrajectoryReject::InactiveState)?;
    let mut raw = [0; 3];
    for axis in 0..3 {
        let momentum = (held.affine.mass_raw as i128)
            .checked_mul(held.affine.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(held.affine.momentum[axis].remainder as i128))
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        raw[axis] = i32::try_from(momentum / held.affine.mass_raw as i128)
            .map_err(|_| ExactTrajectoryReject::Arithmetic)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct FloorReaction {
    pub(crate) entity: EntityId,
    pub(crate) group_time_raw: u32,
    pub(crate) rejected_impulse_raw: i64,
    pub(crate) energy_change: ExactRational,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum ExactTrajectoryReject {
    Arithmetic, Capacity, DescendingTime, DuplicateIdentity, FactPair, InactiveState, Mass,
    LifecycleNonzeroResponse, NonCanonical, NonCanonicalBodyZ, Radius, SpecIdentity,
    TimePastTick, WrongIdentity,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct FixedExactOwners {
    rows: [Option<ExactOwnerTrajectory>; MAX_EXACT_OWNERS],
    len: usize,
}

impl FixedExactOwners {
    pub(crate) fn from_slice(rows: &[ExactOwnerTrajectory]) -> Result<FixedExactOwners, ExactTrajectoryReject> {
        if rows.len() > MAX_EXACT_OWNERS { return Err(ExactTrajectoryReject::Capacity); }
        let mut out = FixedExactOwners { rows: [None; MAX_EXACT_OWNERS], len: rows.len() };
        for (at, row) in rows.iter().enumerate() { out.rows[at] = Some(*row); }
        Ok(out)
    }

    pub(crate) fn as_slice(&self) -> &[Option<ExactOwnerTrajectory>] { &self.rows[..self.len] }

    pub(crate) fn copy_into(&self, rows: &mut Vec<ExactOwnerTrajectory>)
        -> Result<(), ExactTrajectoryReject>
    {
        if rows.capacity() < self.len { return Err(ExactTrajectoryReject::Capacity); }
        rows.clear();
        for row in self.as_slice() {
            rows.push(row.ok_or(ExactTrajectoryReject::WrongIdentity)?);
        }
        Ok(())
    }

    pub(crate) fn get(&self, at: usize) -> Result<ExactOwnerTrajectory, ExactTrajectoryReject> {
        self.rows.get(at).and_then(|row| *row).ok_or(ExactTrajectoryReject::WrongIdentity)
    }

    fn set(&mut self, at: usize, row: ExactOwnerTrajectory) -> Result<(), ExactTrajectoryReject> {
        let target = self.rows.get_mut(at).ok_or(ExactTrajectoryReject::WrongIdentity)?;
        if target.is_none() { return Err(ExactTrajectoryReject::WrongIdentity); }
        *target = Some(row);
        Ok(())
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct FixedFloorReactions {
    rows: [Option<FloorReaction>; MAX_FLOOR_REACTIONS],
    len: usize,
}

impl FixedFloorReactions {
    fn new() -> FixedFloorReactions {
        FixedFloorReactions { rows: [None; MAX_FLOOR_REACTIONS], len: 0 }
    }

    fn push(&mut self, row: FloorReaction) -> Result<(), ExactTrajectoryReject> {
        if self.len == self.rows.len() { return Err(ExactTrajectoryReject::Capacity); }
        self.rows[self.len] = Some(row); self.len += 1; Ok(())
    }

    pub(crate) fn as_slice(&self) -> &[Option<FloorReaction>] { &self.rows[..self.len] }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct ExactImpulseOutcome {
    pub(crate) owners: FixedExactOwners,
    pub(crate) floor_reactions: FixedFloorReactions,
}

fn validate_coordinate(
    position: ExactPosition, momentum: ExactMomentum, scale: i128,
) -> Result<(), ExactTrajectoryReject> {
    if scale <= 0 { return Err(ExactTrajectoryReject::Mass); }
    let position_denominator = scale.checked_mul(TICK_RAW)
        .ok_or(ExactTrajectoryReject::Arithmetic)?;
    if momentum.remainder.unsigned_abs() >= scale as u128
        || position.remainder.unsigned_abs() >= position_denominator as u128 {
        return Err(ExactTrajectoryReject::NonCanonical);
    }
    if (momentum.velocity_raw > 0 && momentum.remainder < 0)
        || (momentum.velocity_raw < 0 && momentum.remainder > 0)
        || (position.raw > 0 && position.remainder < 0)
        || (position.raw < 0 && position.remainder > 0) {
        return Err(ExactTrajectoryReject::NonCanonical);
    }
    Ok(())
}

fn validate_affine(value: ExactAffine3, scale: i128) -> Result<(), ExactTrajectoryReject> {
    if value.mass_raw <= 0 || scale % value.mass_raw as i128 != 0 {
        return Err(ExactTrajectoryReject::Mass);
    }
    if value.group_time_raw > TICK_RAW as u32 { return Err(ExactTrajectoryReject::TimePastTick); }
    for axis in 0..3 {
        validate_coordinate(value.at_group[axis], value.momentum[axis], scale)?;
    }
    Ok(())
}

fn owner_mass(owner: ExactOwnerTrajectory) -> Result<i32, ExactTrajectoryReject> {
    if owner.body_mass_raw <= 0 { return Err(ExactTrajectoryReject::Mass); }
    owner.held_response.iter().try_fold(owner.body_mass_raw, |sum, held| match held {
        Some(held) if held.affine.mass_raw > 0 => sum.checked_add(held.affine.mass_raw)
            .ok_or(ExactTrajectoryReject::Arithmetic),
        Some(_) => Err(ExactTrajectoryReject::Mass),
        None => Ok(sum),
    })
}

fn validate_owner(owner: ExactOwnerTrajectory) -> Result<(), ExactTrajectoryReject> {
    validate_affine(owner.common_response, owner.common_scale)?;
    if owner.common_response.mass_raw != owner_mass(owner)? {
        return Err(ExactTrajectoryReject::Mass);
    }
    if owner.common_response.at_group[2] != ExactPosition::default()
        || owner.common_response.momentum[2] != ExactMomentum::default() {
        return Err(ExactTrajectoryReject::NonCanonicalBodyZ);
    }
    let group = owner.common_response.group_time_raw;
    for (at, held) in owner.held_response.iter().enumerate() {
        let Some(held) = held else { continue };
        if held.slot == BODY_SLOT || held.slot as usize != at {
            return Err(ExactTrajectoryReject::SpecIdentity);
        }
        validate_affine(held.affine, held.affine.mass_raw as i128)?;
        if held.affine.group_time_raw != group { return Err(ExactTrajectoryReject::DescendingTime); }
    }
    Ok(())
}

fn validate_row_shape(row: &ExactContactTrajectory) -> Result<(), ExactTrajectoryReject> {
    match (row.kind, row.motor) {
        (GeneralizedKind::Body, MotorShape::Body { parts, .. }) => {
            if row.slot != BODY_SLOT || row.held_index.is_some() || row.equipment_spec.is_some() {
                return Err(ExactTrajectoryReject::WrongIdentity);
            }
            if parts.iter().any(|part| part.radius_raw < 0) {
                return Err(ExactTrajectoryReject::Radius);
            }
        }
        (GeneralizedKind::Equipment, MotorShape::Segment { radius_raw, .. }) => {
            if row.slot == BODY_SLOT || row.held_index.is_none() || row.equipment_spec.is_none() {
                return Err(ExactTrajectoryReject::WrongIdentity);
            }
            if radius_raw < 0 { return Err(ExactTrajectoryReject::Radius); }
        }
        (GeneralizedKind::Equipment, MotorShape::Shield { .. }) => {
            if row.slot == BODY_SLOT || row.held_index.is_none() || row.equipment_spec.is_none() {
                return Err(ExactTrajectoryReject::WrongIdentity);
            }
        }
        _ => return Err(ExactTrajectoryReject::WrongIdentity),
    }
    Ok(())
}

fn checked_rational(numerator: i128, denominator: i128) -> Result<ExactRational, ExactTrajectoryReject> {
    if denominator <= 0 { return Err(ExactTrajectoryReject::NonCanonical); }
    Ok(ExactRational { numerator, denominator })
}

fn add_rational(a: ExactRational, b: ExactRational) -> Result<ExactRational, ExactTrajectoryReject> {
    if a.denominator == b.denominator {
        return checked_rational(a.numerator.checked_add(b.numerator)
            .ok_or(ExactTrajectoryReject::Arithmetic)?, a.denominator);
    }
    if a.denominator % b.denominator == 0 {
        let scale = a.denominator / b.denominator;
        return checked_rational(a.numerator.checked_add(b.numerator.checked_mul(scale)
            .ok_or(ExactTrajectoryReject::Arithmetic)?)
            .ok_or(ExactTrajectoryReject::Arithmetic)?, a.denominator);
    }
    if b.denominator % a.denominator == 0 {
        let scale = b.denominator / a.denominator;
        return checked_rational(a.numerator.checked_mul(scale).and_then(|left|
            left.checked_add(b.numerator)).ok_or(ExactTrajectoryReject::Arithmetic)?, b.denominator);
    }
    checked_rational(
        a.numerator.checked_mul(b.denominator).and_then(|left|
            b.numerator.checked_mul(a.denominator).and_then(|right| left.checked_add(right)))
            .ok_or(ExactTrajectoryReject::Arithmetic)?,
        a.denominator.checked_mul(b.denominator).ok_or(ExactTrajectoryReject::Arithmetic)?,
    )
}

fn motor_point(point: ExactMotorPoint, time_raw: u32) -> Result<ExactPoint, ExactTrajectoryReject> {
    if time_raw > TICK_RAW as u32 { return Err(ExactTrajectoryReject::TimePastTick); }
    let mut out = [ExactRational { numerator: 0, denominator: TICK_RAW }; 3];
    for axis in 0..3 {
        let numerator = (point.at_tick_start_raw[axis] as i128).checked_mul(TICK_RAW)
            .and_then(|word| (point.tick_delta_raw[axis] as i128)
                .checked_mul(time_raw as i128).and_then(|step| word.checked_add(step)))
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        out[axis] = checked_rational(numerator, TICK_RAW)?;
    }
    Ok(ExactPoint(out))
}

fn response_point(value: ExactAffine3, scale: i128, time_raw: u32)
    -> Result<ExactPoint, ExactTrajectoryReject>
{
    validate_affine(value, scale)?;
    if time_raw < value.group_time_raw { return Err(ExactTrajectoryReject::DescendingTime); }
    if time_raw > TICK_RAW as u32 { return Err(ExactTrajectoryReject::TimePastTick); }
    let dt = time_raw - value.group_time_raw;
    let denominator = scale.checked_mul(TICK_RAW)
        .ok_or(ExactTrajectoryReject::Arithmetic)?;
    let mut out = [ExactRational { numerator: 0, denominator }; 3];
    for axis in 0..3 {
        let momentum = scale.checked_mul(value.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(value.momentum[axis].remainder))
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        let numerator = denominator.checked_mul(value.at_group[axis].raw as i128)
            .and_then(|word| word.checked_add(value.at_group[axis].remainder))
            .and_then(|word| momentum.checked_mul(dt as i128)
                .and_then(|step| word.checked_add(step))).ok_or(ExactTrajectoryReject::Arithmetic)?;
        out[axis] = checked_rational(numerator, denominator)?;
    }
    Ok(ExactPoint(out))
}

fn translate(point: ExactPoint, response: ExactPoint) -> Result<ExactPoint, ExactTrajectoryReject> {
    let mut out = point;
    for axis in 0..3 { out.0[axis] = add_rational(point.0[axis], response.0[axis])?; }
    Ok(out)
}

fn translated_motor_point(
    point: ExactMotorPoint, common: ExactPoint, held: Option<ExactPoint>, time_raw: u32,
) -> Result<ExactPoint, ExactTrajectoryReject> {
    let mut out = translate(motor_point(point, time_raw)?, common)?;
    if let Some(held) = held { out = translate(out, held)?; }
    Ok(out)
}

pub(crate) fn evaluate_exact(
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, global_time_raw: u32,
) -> Result<EvaluatedContactShape, ExactTrajectoryReject> {
    validate_owner(*owner)?;
    validate_row_shape(row)?;
    if row.entity != owner.entity { return Err(ExactTrajectoryReject::WrongIdentity); }
    if row.mass_raw <= 0 { return Err(ExactTrajectoryReject::Mass); }
    let common = response_point(owner.common_response, owner.common_scale, global_time_raw)?;
    let held = match (row.kind, row.held_index, row.equipment_spec) {
        (GeneralizedKind::Body, None, None) if row.slot == BODY_SLOT
            && row.mass_raw == owner.body_mass_raw => None,
        (GeneralizedKind::Equipment, Some(at), Some(spec)) => {
            let tagged = owner.held_response.get(at).and_then(|held| *held)
                .ok_or(ExactTrajectoryReject::InactiveState)?;
            if tagged.slot != row.slot || tagged.spec_id != spec || tagged.affine.mass_raw != row.mass_raw {
                return Err(ExactTrajectoryReject::SpecIdentity);
            }
            Some(response_point(tagged.affine, tagged.affine.mass_raw as i128, global_time_raw)?)
        }
        _ => return Err(ExactTrajectoryReject::WrongIdentity),
    };
    match row.motor {
        MotorShape::Body { origin, parts } => {
            let origin = translated_motor_point(origin, common, None, global_time_raw)?;
            let mut evaluated = [EvaluatedMotorBounds {
                lower: origin, upper: origin, radius_raw: 0, present: false,
            }; AnatomyRegion::COUNT];
            for at in 0..AnatomyRegion::COUNT {
                evaluated[at] = EvaluatedMotorBounds {
                    lower: translated_motor_point(parts[at].lower, common, None, global_time_raw)?,
                    upper: translated_motor_point(parts[at].upper, common, None, global_time_raw)?,
                    radius_raw: parts[at].radius_raw, present: parts[at].present,
                };
            }
            Ok(EvaluatedContactShape::Body { origin, parts: evaluated })
        }
        MotorShape::Segment { hilt, tip, radius_raw } => Ok(EvaluatedContactShape::Segment {
            hilt: translated_motor_point(hilt, common, held, global_time_raw)?,
            tip: translated_motor_point(tip, common, held, global_time_raw)?, radius_raw,
        }),
        MotorShape::Shield { corners } => {
            let mut evaluated = [translated_motor_point(corners[0], common, held, global_time_raw)?; 4];
            for at in 1..4 {
                evaluated[at] = translated_motor_point(corners[at], common, held, global_time_raw)?;
            }
            Ok(EvaluatedContactShape::Shield { corners: evaluated })
        }
    }
}

fn advance_affine(mut value: ExactAffine3, scale: i128, next_group_raw: u32)
    -> Result<ExactAffine3, ExactTrajectoryReject>
{
    validate_affine(value, scale)?;
    if next_group_raw < value.group_time_raw { return Err(ExactTrajectoryReject::DescendingTime); }
    if next_group_raw > TICK_RAW as u32 { return Err(ExactTrajectoryReject::TimePastTick); }
    let dt = next_group_raw - value.group_time_raw;
    let denominator = scale.checked_mul(TICK_RAW)
        .ok_or(ExactTrajectoryReject::Arithmetic)?;
    for axis in 0..3 {
        let momentum = scale.checked_mul(value.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(value.momentum[axis].remainder))
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        // The whole position is already the quotient. Multiplying it back by
        // the fixed lattice denominator merely to divide it out again made a
        // valid shipped 92-bit endpoint overflow `i128`. Advance the fractional
        // numerator, fold only its carry into the quotient, and retain the
        // signed remainder. This is the same Euclidean identity without the
        // artificial wide product.
        let fractional = momentum.checked_mul(dt as i128)
            .and_then(|step| value.at_group[axis].remainder.checked_add(step))
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        let carry = i32::try_from(fractional / denominator)
            .map_err(|_| ExactTrajectoryReject::Arithmetic)?;
        value.at_group[axis].raw = value.at_group[axis].raw.checked_add(carry)
            .ok_or(ExactTrajectoryReject::Arithmetic)?;
        value.at_group[axis].remainder = fractional % denominator;
    }
    value.group_time_raw = next_group_raw;
    validate_affine(value, scale)?;
    Ok(value)
}

pub(crate) fn advance_exact(
    owners: &[ExactOwnerTrajectory], next_group_raw: u32,
) -> Result<FixedExactOwners, ExactTrajectoryReject> {
    let mut out = FixedExactOwners::from_slice(owners)?;
    for (at, owner) in owners.iter().enumerate() {
        validate_owner(*owner)?;
        let mut next = *owner;
        next.common_response = advance_affine(owner.common_response, owner.common_scale, next_group_raw)?;
        for held in next.held_response.iter_mut().flatten() {
            held.affine = advance_affine(held.affine, held.affine.mass_raw as i128, next_group_raw)?;
        }
        validate_owner(next)?;
        out.set(at, next)?;
    }
    Ok(out)
}

fn apply_impulse_axis(
    mut value: ExactAffine3, scale: i128, axis: usize, impulse_raw: i64,
) -> Result<ExactAffine3, ExactTrajectoryReject> {
    validate_affine(value, scale)?;
    let impulse_scale = scale / value.mass_raw as i128;
    let momentum = scale.checked_mul(value.momentum[axis].velocity_raw as i128)
        .and_then(|word| word.checked_add(value.momentum[axis].remainder))
        .and_then(|word| (impulse_raw as i128).checked_mul(TICK_RAW)
            .and_then(|impulse| impulse.checked_mul(impulse_scale))
            .and_then(|impulse| word.checked_add(impulse)))
        .ok_or(ExactTrajectoryReject::Arithmetic)?;
    let quotient = momentum / scale;
    value.momentum[axis].velocity_raw = i32::try_from(quotient)
        .map_err(|_| ExactTrajectoryReject::Arithmetic)?;
    value.momentum[axis].remainder = momentum % scale;
    validate_affine(value, scale)?;
    Ok(value)
}

fn find_row(rows: &[ExactContactTrajectory], entity: EntityId, slot: u8)
    -> Result<usize, ExactTrajectoryReject>
{
    let mut found = None;
    for (at, row) in rows.iter().enumerate() {
        if row.entity != entity || row.slot != slot { continue; }
        if found.is_some() { return Err(ExactTrajectoryReject::DuplicateIdentity); }
        found = Some(at);
    }
    found.ok_or(ExactTrajectoryReject::WrongIdentity)
}

fn validate_rows(
    rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
) -> Result<(), ExactTrajectoryReject> {
    validate_exact_rows(rows, owners)
}

/// Validate identities and trajectory grammar without evaluating a pose.
///
/// The fixed lattice may be wider than the research evaluator's `i128`
/// intermediate even though every stored word is valid. The production wide
/// detector needs the grammar check independently from that narrower evaluator.
pub(crate) fn validate_exact_rows(
    rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
) -> Result<(), ExactTrajectoryReject> {
    for (at, owner) in owners.iter().enumerate() {
        validate_owner(*owner)?;
        if owners[..at].iter().any(|other| other.entity == owner.entity) {
            return Err(ExactTrajectoryReject::DuplicateIdentity);
        }
    }
    for at in 0..rows.len() {
        if rows[..at].iter().any(|other| other.entity == rows[at].entity
            && other.slot == rows[at].slot) {
            return Err(ExactTrajectoryReject::DuplicateIdentity);
        }
        validate_row_shape(&rows[at])?;
        let owner = owners.get(rows[at].owner_index)
            .ok_or(ExactTrajectoryReject::WrongIdentity)?;
        if rows[at].entity != owner.entity { return Err(ExactTrajectoryReject::WrongIdentity); }
        match (rows[at].kind, rows[at].held_index, rows[at].equipment_spec) {
            (GeneralizedKind::Body, None, None) if rows[at].slot == BODY_SLOT
                && rows[at].mass_raw == owner.body_mass_raw => {}
            (GeneralizedKind::Equipment, Some(held), Some(spec)) => {
                let tagged = owner.held_response.get(held).and_then(|row| *row)
                    .ok_or(ExactTrajectoryReject::InactiveState)?;
                if tagged.slot != rows[at].slot || tagged.spec_id != spec
                    || tagged.affine.mass_raw != rows[at].mass_raw {
                    return Err(ExactTrajectoryReject::SpecIdentity);
                }
            }
            _ => return Err(ExactTrajectoryReject::WrongIdentity),
        }
    }
    Ok(())
}

fn validate_fact_pair(
    fact: ContactFact, a: ExactContactTrajectory, b: ExactContactTrajectory,
) -> Result<(), ExactTrajectoryReject> {
    if !a.present || !b.present { return Err(ExactTrajectoryReject::InactiveState); }
    if a.faction == b.faction || a.entity == b.entity { return Err(ExactTrajectoryReject::FactPair); }
    match (fact.key.kind, a.motor, b.motor) {
        (ContactKind::WeaponBody, MotorShape::Segment { .. }, MotorShape::Body { parts, .. }) => {
            let region = fact.region as usize;
            if fact.key.b_slot != BODY_SLOT || region >= AnatomyRegion::COUNT || !parts[region].present {
                return Err(ExactTrajectoryReject::FactPair);
            }
        }
        (ContactKind::WeaponShield, MotorShape::Segment { .. }, MotorShape::Shield { .. }) => {
            if fact.region != NO_REGION { return Err(ExactTrajectoryReject::FactPair); }
        }
        (ContactKind::WeaponWeapon, MotorShape::Segment { .. }, MotorShape::Segment { .. }) => {
            if fact.region != NO_REGION || (a.entity, a.slot) > (b.entity, b.slot) {
                return Err(ExactTrajectoryReject::FactPair);
            }
        }
        _ => return Err(ExactTrajectoryReject::FactPair),
    }
    Ok(())
}

fn apply_row_impulse(
    output: &mut FixedExactOwners, row: ExactContactTrajectory, impulse: [i64; 3],
    reactions: &mut FixedFloorReactions,
) -> Result<(), ExactTrajectoryReject> {
    let mut owner = output.get(row.owner_index)?;
    match (row.kind, row.held_index) {
        (GeneralizedKind::Body, None) => {
            for axis in 0..2 {
                owner.common_response = apply_impulse_axis(
                    owner.common_response, owner.common_scale, axis, impulse[axis])?;
            }
            if impulse[2] != 0 {
                let rejected = (impulse[2] as i128).checked_mul(TICK_RAW)
                    .ok_or(ExactTrajectoryReject::Arithmetic)?;
                reactions.push(FloorReaction {
                    entity: owner.entity,
                    group_time_raw: owner.common_response.group_time_raw,
                    rejected_impulse_raw: impulse[2],
                    energy_change: checked_rational(
                        rejected.checked_mul(rejected).and_then(|square| square.checked_neg())
                            .ok_or(ExactTrajectoryReject::Arithmetic)?,
                        (owner.common_response.mass_raw as i128).checked_mul(2)
                            .ok_or(ExactTrajectoryReject::Arithmetic)?,
                    )?,
                })?;
            }
        }
        (GeneralizedKind::Equipment, Some(held_at)) => {
            let mut held = owner.held_response.get(held_at).and_then(|held| *held)
                .ok_or(ExactTrajectoryReject::InactiveState)?;
            for axis in 0..3 {
                held.affine = apply_impulse_axis(
                    held.affine, held.affine.mass_raw as i128, axis, impulse[axis])?;
            }
            owner.held_response[held_at] = Some(held);
        }
        _ => return Err(ExactTrajectoryReject::WrongIdentity),
    }
    validate_owner(owner)?;
    output.set(row.owner_index, owner)
}

pub(crate) fn apply_exact_impulse(
    rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory], fact: ContactFact,
    impulse_on_a: [i64; 3],
) -> Result<ExactImpulseOutcome, ExactTrajectoryReject> {
    validate_rows(rows, owners)?;
    let a = find_row(rows, fact.key.a, fact.key.a_slot)?;
    let b = find_row(rows, fact.key.b, fact.key.b_slot)?;
    validate_fact_pair(fact, rows[a], rows[b])?;
    if fact.toi.get().raw() < 0 { return Err(ExactTrajectoryReject::DescendingTime); }
    let group_time = fact.toi.get().raw() as u32;
    let mut output = advance_exact(owners, group_time)?;
    let mut reactions = FixedFloorReactions::new();
    apply_row_impulse(&mut output, rows[a], impulse_on_a, &mut reactions)?;
    let impulse_on_b = [
        impulse_on_a[0].checked_neg().ok_or(ExactTrajectoryReject::Arithmetic)?,
        impulse_on_a[1].checked_neg().ok_or(ExactTrajectoryReject::Arithmetic)?,
        impulse_on_a[2].checked_neg().ok_or(ExactTrajectoryReject::Arithmetic)?,
    ];
    apply_row_impulse(&mut output, rows[b], impulse_on_b, &mut reactions)?;
    Ok(ExactImpulseOutcome { owners: output, floor_reactions: reactions })
}

/// Apply one finalized simultaneous group to exact response state. Resolution
/// rows already carry the selected alpha-scaled physical impulse; accumulating
/// them before advancing or applying is what makes one shared held row one
/// state transition rather than an order of pairwise approximations.
pub(crate) fn apply_exact_group(
    rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    resolutions: &[ContactResolution], group_time: u32,
) -> Result<ExactImpulseOutcome, ExactTrajectoryReject> {
    validate_rows(rows, owners)?;
    if resolutions.is_empty() { return Err(ExactTrajectoryReject::FactPair); }
    let mut impulses = [[0i128; 3]; MAX_EXACT_OWNERS * 3];
    for resolution in resolutions {
        if resolution.fact.toi.get().raw() < 0
            || resolution.fact.toi.get().raw() as u32 != group_time {
            return Err(ExactTrajectoryReject::DescendingTime);
        }
        let a = find_row(rows, resolution.fact.key.a, resolution.fact.key.a_slot)?;
        let b = find_row(rows, resolution.fact.key.b, resolution.fact.key.b_slot)?;
        validate_fact_pair(resolution.fact, rows[a], rows[b])?;
        for (at, impulse) in [(a, resolution.impulse.on_a), (b, resolution.impulse.on_b)] {
            for (axis, raw) in [impulse.x.raw(), impulse.y.raw(), impulse.z.raw()]
                .into_iter().enumerate() {
                impulses[at][axis] = impulses[at][axis].checked_add(raw as i128)
                    .ok_or(ExactTrajectoryReject::Arithmetic)?;
            }
        }
    }
    let mut output = advance_exact(owners, group_time)?;
    let mut floor_reactions = FixedFloorReactions::new();
    for at in 0..rows.len() {
        let impulse = [
            i64::try_from(impulses[at][0]).map_err(|_| ExactTrajectoryReject::Arithmetic)?,
            i64::try_from(impulses[at][1]).map_err(|_| ExactTrajectoryReject::Arithmetic)?,
            i64::try_from(impulses[at][2]).map_err(|_| ExactTrajectoryReject::Arithmetic)?,
        ];
        if impulse != [0; 3] {
            apply_row_impulse(&mut output, rows[at], impulse, &mut floor_reactions)?;
        }
    }
    Ok(ExactImpulseOutcome { owners: output, floor_reactions })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::contact::{ContactKey, ContactKind};
    use crate::combat::spec::Material;
    use fx::{Fx, TimeOfImpact, Vec3};

    fn surface() -> SurfaceSpec {
        SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO, edge_factor: Fx::ONE,
                      point_factor: Fx::ONE, material: Material::Steel }
    }

    fn zero_affine(mass_raw: i32) -> ExactAffine3 {
        ExactAffine3 { mass_raw, at_group: [ExactPosition::default(); 3],
            momentum: [ExactMomentum::default(); 3], group_time_raw: 0 }
    }

    fn point(at: [i32; 3], delta: [i32; 3]) -> ExactMotorPoint {
        ExactMotorPoint { at_tick_start_raw: at, tick_delta_raw: delta }
    }

    fn owner(entity: EntityId) -> ExactOwnerTrajectory {
        owner_with_held_mass(entity, 65_536)
    }

    fn owner_with_held_mass(entity: EntityId, held_mass_raw: i32) -> ExactOwnerTrajectory {
        ExactOwnerTrajectory { entity, body_mass_raw: 131_072,
            common_scale: (131_072 + held_mass_raw) as i128,
            common_response: zero_affine(131_072 + held_mass_raw),
            held_response: [Some(ExactHeldResponse { slot: 0, spec_id: 7,
                affine: zero_affine(held_mass_raw) }), None] }
    }

    fn segment_row(entity: EntityId, owner_index: usize) -> ExactContactTrajectory {
        ExactContactTrajectory { entity, faction: Faction::Heroes, slot: 0,
            kind: GeneralizedKind::Equipment, mass_raw: 65_536, surface: surface(),
            motor: MotorShape::Segment {
                hilt: point([0, 0, 0], [65_536, -32_768, 16_384]),
                tip: point([65_536, 0, 0], [-32_768, 65_536, -16_384]), radius_raw: 1,
            }, owner_index, held_index: Some(0), equipment_spec: Some(7), present: true }
    }

    fn body_row(entity: EntityId, owner_index: usize) -> ExactContactTrajectory {
        ExactContactTrajectory { entity, faction: Faction::Monsters, slot: BODY_SLOT,
            kind: GeneralizedKind::Body, mass_raw: 131_072, surface: surface(),
            motor: MotorShape::Body { origin: point([0; 3], [0; 3]),
                parts: [ExactMotorBounds { lower: point([0; 3], [0; 3]),
                    upper: point([0; 3], [0; 3]), radius_raw: 1, present: true };
                    AnatomyRegion::COUNT] },
            owner_index, held_index: None, equipment_spec: None, present: true }
    }

    fn weapon_body_fact(a: EntityId, b: EntityId) -> ContactFact {
        ContactFact { key: ContactKey { a, a_slot: 0, b, b_slot: BODY_SLOT,
            kind: ContactKind::WeaponBody }, toi: TimeOfImpact::ZERO, region: 0,
            point: Vec3::ZERO, normal: Vec3::Z, velocity_a: Vec3::ZERO, velocity_b: Vec3::ZERO }
    }

    fn resolution(fact: ContactFact, impulse: Vec3) -> ContactResolution {
        ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536, fact,
            impulse: crate::combat::contact::ContactImpulse {
                key: fact.key, on_a: impulse, on_b: -impulse,
            }, energy: crate::combat::contact::EnergyLedger {
                before_raw: 0, after_raw: 0, dissipated_raw: 0,
            }, cut_raw: 0, thrust_raw: 0, pressure_raw: 0,
            deflected_raw: 0, severed: false }
    }

    fn rational_value(value: ExactRational) -> (i128, i128) {
        (value.numerator / value.denominator, value.numerator % value.denominator)
    }

    fn assert_rational(value: ExactRational, numerator: i128, denominator: i128) {
        assert_eq!(value.numerator.checked_mul(denominator),
                   numerator.checked_mul(value.denominator));
    }

    #[test]
    fn exact_motor_rotation_and_response_translation_are_independent() {
        let entity = EntityId::new(1, 4); let row = segment_row(entity, 0);
        let mut owner = owner(entity);
        owner.common_response.momentum[0].remainder = 65_536;
        owner.held_response[0].as_mut().unwrap().affine.momentum[1].remainder = 1;
        let EvaluatedContactShape::Segment { hilt, tip, .. } =
            evaluate_exact(&row, &owner, 32_768).unwrap() else { panic!() };
        assert_rational(hilt.0[0], 32_768 * 6 + 1, 6);
        assert_rational(tip.0[0], 49_152 * 6 + 1, 6);
        assert_rational(hilt.0[1], -16_384 * 131_072 + 1, 131_072);
        assert_rational(tip.0[1], 32_768 * 131_072 + 1, 131_072);
        let motor_difference = add_rational(tip.0[0], ExactRational {
            numerator: -hilt.0[0].numerator, denominator: hilt.0[0].denominator }).unwrap();
        assert_rational(motor_difference, 16_384, 1);
    }

    #[test]
    fn two_breakpoints_integrate_each_momentum_over_only_its_own_interval() {
        let entity = EntityId::new(1, 0); let mut owner = owner(entity);
        owner.common_response.momentum[0].remainder = 131_072;
        let first = advance_exact(&[owner], 55_704).unwrap().get(0).unwrap();
        let mut changed = first;
        changed.common_response = apply_impulse_axis(
            changed.common_response, changed.common_scale, 0, 4).unwrap();
        let finished = advance_exact(&[changed], 65_536).unwrap().get(0).unwrap();
        let old_over_whole_tick = 131_072i128 * 65_536;
        let new_only_after_break = 4i128 * 65_536 * 9_832;
        let expected = old_over_whole_tick + new_only_after_break;
        let denominator = 196_608i128 * 65_536;
        assert_eq!((finished.common_response.at_group[0].raw,
                    finished.common_response.at_group[0].remainder as i128),
                   ((expected / denominator) as i32, expected % denominator));
    }

    #[test]
    fn finalized_group_accumulates_a_shared_held_row_before_applying_it_once() {
        let weapon = EntityId::new(1, 0);
        let first = EntityId::new(2, 0); let second = EntityId::new(3, 0);
        let owners = [owner(weapon), owner(first), owner(second)];
        let rows = [segment_row(weapon, 0), body_row(first, 1), body_row(second, 2)];
        let at = 20_000;
        let f0 = ContactFact { toi: TimeOfImpact::new_clamped(Fx::from_raw(at)),
                               ..weapon_body_fact(weapon, first) };
        let f1 = ContactFact { toi: TimeOfImpact::new_clamped(Fx::from_raw(at)),
                               ..weapon_body_fact(weapon, second) };
        let outcome = apply_exact_group(&rows, &owners,
            &[resolution(f0, Vec3::new(Fx::from_raw(1), Fx::ZERO, Fx::ZERO)),
              resolution(f1, Vec3::new(Fx::from_raw(2), Fx::ZERO, Fx::ZERO))],
            at as u32).unwrap();
        let held = outcome.owners.get(0).unwrap().held_response[0].unwrap().affine;
        assert_eq!(held.group_time_raw, at as u32);
        assert_eq!((held.momentum[0].velocity_raw, held.momentum[0].remainder), (3, 0));
        assert!(outcome.floor_reactions.as_slice().is_empty());

        let staged = outcome.owners.as_slice().iter().map(|row| row.unwrap()).collect::<Vec<_>>();
        let finished = advance_exact(&staged, 65_536).unwrap().get(0).unwrap();
        let expected = 3i128 * 65_536 * (65_536 - at as i128);
        let denominator = 65_536i128 * 65_536;
        assert_eq!((finished.held_response[0].unwrap().affine.at_group[0].raw,
                    finished.held_response[0].unwrap().affine.at_group[0].remainder as i128),
                   ((expected / denominator) as i32, expected % denominator));
    }

    #[test]
    fn retained_toi_55704_leaves_exactly_9832_response_units() {
        let entity = EntityId::new(1, 0); let mut owner = owner(entity);
        owner.common_response.momentum[0].remainder = 65_536;
        let at_contact = advance_exact(&[owner], 55_704).unwrap().get(0).unwrap();
        let at_end = advance_exact(&[at_contact], 65_536).unwrap().get(0).unwrap();
        assert_eq!(at_end.common_response.group_time_raw - at_contact.common_response.group_time_raw, 9_832);
        assert_eq!(at_end.common_response.at_group[0].remainder as i128
                   - at_contact.common_response.at_group[0].remainder as i128,
                   65_536i128 * 9_832);
    }

    #[test]
    fn body_floor_z_is_a_named_external_reaction_and_held_z_is_retained() {
        let a = EntityId::new(1, 2); let b = EntityId::new(2, 3);
        let owners = [owner_with_held_mass(a, 81_264), owner(b)];
        let mut weapon = segment_row(a, 0); weapon.mass_raw = 81_264;
        let rows = [weapon, body_row(b, 1)];
        let fact = weapon_body_fact(a, b);
        let outcome = apply_exact_impulse(&rows, &owners, fact, [0, 0, 3]).unwrap();
        let a_after = outcome.owners.get(0).unwrap(); let b_after = outcome.owners.get(1).unwrap();
        let held = a_after.held_response[0].unwrap().affine;
        assert_eq!((held.momentum[2].velocity_raw, held.momentum[2].remainder), (2, 34_080));
        let advanced = advance_exact(&[a_after, b_after], 9_832).unwrap().get(0).unwrap();
        assert_eq!((advanced.held_response[0].unwrap().affine.at_group[2].raw,
                    advanced.held_response[0].unwrap().affine.at_group[2].remainder),
                   (0, 1_933_049_856));
        assert_eq!(b_after.common_response.momentum[2], ExactMomentum::default());
        let reaction = outcome.floor_reactions.as_slice()[0].unwrap();
        assert_eq!((reaction.entity, reaction.rejected_impulse_raw), (b, -3));
        assert_eq!(reaction.energy_change, ExactRational {
            numerator: -38_654_705_664, denominator: 393_216 });
    }

    #[test]
    fn exact_trajectory_validation_is_atomic_under_identity_time_and_overflow_errors() {
        let entity = EntityId::new(1, 7); let base_owner = owner(entity); let row = segment_row(entity, 0);
        let before = base_owner;
        let mut wrong = row; wrong.equipment_spec = Some(8);
        assert_eq!(evaluate_exact(&wrong, &base_owner, 0), Err(ExactTrajectoryReject::SpecIdentity));
        let mut descending = base_owner; descending.common_response.group_time_raw = 1;
        descending.held_response[0].as_mut().unwrap().affine.group_time_raw = 1;
        assert_eq!(advance_exact(&[descending], 0), Err(ExactTrajectoryReject::DescendingTime));
        let mut floor_poison = base_owner; floor_poison.common_response.momentum[2].remainder = 1;
        assert_eq!(evaluate_exact(&row, &floor_poison, 0), Err(ExactTrajectoryReject::NonCanonicalBodyZ));
        let mut overflow = base_owner; overflow.common_response.at_group[0].raw = i32::MAX;
        overflow.common_response.momentum[0].velocity_raw = i32::MAX;
        assert_eq!(advance_exact(&[overflow], 65_536), Err(ExactTrajectoryReject::Arithmetic));
        let foe = EntityId::new(2, 0); let owners = [base_owner, owner(foe)];
        let rows = [segment_row(entity, 0), body_row(foe, 1)];
        let fact = weapon_body_fact(entity, foe);
        let mut duplicate = vec![rows[0], rows[1], rows[0]];
        assert_eq!(apply_exact_impulse(&duplicate, &owners, fact, [1,0,0]),
                   Err(ExactTrajectoryReject::DuplicateIdentity));
        duplicate.clear();
        let mut absent = rows; absent[0].present = false;
        assert_eq!(apply_exact_impulse(&absent, &owners, fact, [1,0,0]),
                   Err(ExactTrajectoryReject::InactiveState));
        let mut allied = rows; allied[1].faction = Faction::Heroes;
        assert_eq!(apply_exact_impulse(&allied, &owners, fact, [1,0,0]),
                   Err(ExactTrajectoryReject::FactPair));
        let bad_region = ContactFact { region: AnatomyRegion::COUNT as u8, ..fact };
        assert_eq!(apply_exact_impulse(&rows, &owners, bad_region, [1,0,0]),
                   Err(ExactTrajectoryReject::FactPair));
        let stale = ContactFact { key: ContactKey { a: EntityId::new(entity.index, entity.generation + 1),
            ..fact.key }, ..fact };
        assert_eq!(apply_exact_impulse(&rows, &owners, stale, [1,0,0]),
                   Err(ExactTrajectoryReject::WrongIdentity));
        assert_eq!(base_owner, before, "a rejected pure trajectory transition mutated its input");
    }

    #[test]
    fn exact_shape_kind_and_radius_are_validated_before_evaluation() {
        let entity = EntityId::new(1, 0); let owner = owner(entity);
        let mut body_segment = segment_row(entity, 0);
        body_segment.kind = GeneralizedKind::Body; body_segment.slot = BODY_SLOT;
        body_segment.mass_raw = owner.body_mass_raw;
        body_segment.held_index = None; body_segment.equipment_spec = None;
        assert_eq!(evaluate_exact(&body_segment, &owner, 0),
                   Err(ExactTrajectoryReject::WrongIdentity));
        let mut negative = segment_row(entity, 0);
        let MotorShape::Segment { ref mut radius_raw, .. } = negative.motor else { unreachable!() };
        *radius_raw = -1;
        assert_eq!(evaluate_exact(&negative, &owner, 0), Err(ExactTrajectoryReject::Radius));
    }

    #[test]
    fn sign_mirror_and_xy_permutation_map_every_endpoint_and_remainder() {
        let entity = EntityId::new(1, 0); let row = segment_row(entity, 0); let mut owner = owner(entity);
        owner.common_response.at_group[0] = ExactPosition { raw: 1, remainder: 65_536 };
        owner.common_response.at_group[1] = ExactPosition { raw: -2, remainder: -32_768 };
        owner.common_response.momentum[0] = ExactMomentum { velocity_raw: 1, remainder: 65_536 };
        owner.common_response.momentum[1] = ExactMomentum { velocity_raw: -1, remainder: -65_536 };
        let held = &mut owner.held_response[0].as_mut().unwrap().affine;
        held.at_group[0] = ExactPosition { raw: 2, remainder: 1 };
        held.at_group[1] = ExactPosition { raw: -1, remainder: -1 };
        held.momentum[0] = ExactMomentum { velocity_raw: 1, remainder: 1 };
        held.momentum[1] = ExactMomentum { velocity_raw: -1, remainder: -1 };
        held.at_group[2] = ExactPosition { raw: 1, remainder: 1 };
        held.momentum[2] = ExactMomentum { velocity_raw: 1, remainder: 1 };

        let transform_point = |mut point: ExactMotorPoint, mirror: bool, swap: bool| {
            if swap {
                point.at_tick_start_raw.swap(0, 1); point.tick_delta_raw.swap(0, 1);
            }
            if mirror {
                point.at_tick_start_raw = point.at_tick_start_raw.map(|word| -word);
                point.tick_delta_raw = point.tick_delta_raw.map(|word| -word);
            }
            point
        };
        let transform_affine = |mut affine: ExactAffine3, mirror: bool, swap: bool| {
            if swap { affine.at_group.swap(0, 1); affine.momentum.swap(0, 1); }
            if mirror {
                for axis in 0..3 {
                    affine.at_group[axis].raw = -affine.at_group[axis].raw;
                    affine.at_group[axis].remainder = -affine.at_group[axis].remainder;
                    affine.momentum[axis].velocity_raw = -affine.momentum[axis].velocity_raw;
                    affine.momentum[axis].remainder = -affine.momentum[axis].remainder;
                }
            }
            affine
        };
        let transformed = |mirror: bool, swap: bool| {
            let mut transformed_row = row;
            let MotorShape::Segment { hilt, tip, radius_raw } = row.motor else { unreachable!() };
            transformed_row.motor = MotorShape::Segment {
                hilt: transform_point(hilt, mirror, swap), tip: transform_point(tip, mirror, swap), radius_raw };
            let mut transformed_owner = owner;
            transformed_owner.common_response = transform_affine(owner.common_response, mirror, swap);
            transformed_owner.held_response[0].as_mut().unwrap().affine =
                transform_affine(owner.held_response[0].unwrap().affine, mirror, swap);
            evaluate_exact(&transformed_row, &transformed_owner, 9_832).unwrap()
        };
        let EvaluatedContactShape::Segment { hilt, tip, .. } = transformed(false, false) else { panic!() };
        let EvaluatedContactShape::Segment { hilt: mh, tip: mt, .. } = transformed(true, false) else { panic!() };
        let EvaluatedContactShape::Segment { hilt: ph, tip: pt, .. } = transformed(false, true) else { panic!() };
        for (plain, mirrored, permuted) in [(hilt, mh, ph), (tip, mt, pt)] {
            for axis in 0..3 { assert_rational(mirrored.0[axis], -plain.0[axis].numerator, plain.0[axis].denominator); }
            assert_rational(permuted.0[0], plain.0[1].numerator, plain.0[1].denominator);
            assert_rational(permuted.0[1], plain.0[0].numerator, plain.0[0].denominator);
            assert_rational(permuted.0[2], plain.0[2].numerator, plain.0[2].denominator);
        }
    }

    #[test]
    fn shield_corners_keep_independent_motor_paths_under_one_response_translation() {
        let entity = EntityId::new(8, 1); let mut owner = owner(entity);
        owner.common_response.momentum[0].remainder = 65_536;
        let row = ExactContactTrajectory { entity, faction: Faction::Heroes, slot: 0,
            kind: GeneralizedKind::Equipment, mass_raw: 65_536, surface: surface(),
            motor: MotorShape::Shield { corners: [
                point([0,0,0], [65_536,0,0]), point([10,0,0], [0,65_536,0]),
                point([10,10,0], [-65_536,0,0]), point([0,10,0], [0,-65_536,0]),
            ] }, owner_index: 0, held_index: Some(0), equipment_spec: Some(7), present: true };
        let EvaluatedContactShape::Shield { corners } = evaluate_exact(&row, &owner, 32_768).unwrap()
            else { panic!() };
        assert_rational(corners[0].0[0], 32_768 * 6 + 1, 6);
        assert_rational(corners[1].0[0], 10 * 6 + 1, 6);
        assert_rational(corners[2].0[0], (-32_758) * 6 + 1, 6);
        assert_rational(corners[3].0[0], 1, 6);
        assert_rational(corners[1].0[1], 32_768, 1);
        assert_rational(corners[3].0[1], -32_758, 1);
    }
}
