//! Fixed-envelope grammar for the lifted contact solver.
//!
//! This module owns integer impulse words and exact comparisons only. The
//! production exact resolver calls the bounded visit algorithm below; keeping
//! the grammar independently executable makes the circular cone and its
//! refusal boundaries reviewable without making damage part of selection.

#![allow(dead_code)]

use core::cmp::Ordering;

use crate::combat::contact::{ContactFact, ContactResolution};
use crate::combat::trajectory::{apply_exact_group_into, ExactAffine3, ExactContactTrajectory,
    ExactOwnerTrajectory, ExactTrajectoryWork, MAX_EXACT_OWNERS};
use crate::combat::resolution::{exact_physical_energy_delta, ExactPhysicalEnergyDelta};
use crate::combat::contact::{ContactImpulse, EnergyLedger};
use fx::{Fx, Vec3};
use crate::combat::wide::{SignedWide4096, UnsignedWide4096, WideRational4096};

pub(crate) const MAX_LIFTED_SOLVER_FACTS: usize = 16;
pub(crate) const MAX_LIFTED_SOLVER_ROWS: usize = 42;
pub(crate) const LIFTED_SOLVER_SWEEPS: usize = 8;
pub(crate) const LIFTED_LIFTS_PER_VISIT: usize = 96;

const FX_ONE_RAW: i128 = 65_536;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub(crate) struct LiftedImpulse { pub(crate) raw: [i32; 3] }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct LiftedContact {
    pub(crate) fact: ContactFact,
    pub(crate) a_trajectory: usize,
    pub(crate) b_trajectory: usize,
    pub(crate) restitution_raw: i32,
    pub(crate) friction_raw: i32,
    pub(crate) pre_relative_velocity: [WideRational4096; 3],
}

impl LiftedContact {
    pub(crate) fn from_state(
        fact: ContactFact, a_trajectory: usize, b_trajectory: usize,
        trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
        motor: &[[i32; 3]],
    ) -> Result<Self, LiftedSolverReject> {
        let a = *trajectories.get(a_trajectory).ok_or(LiftedSolverReject::Identity)?;
        let b = *trajectories.get(b_trajectory).ok_or(LiftedSolverReject::Identity)?;
        let va = response_velocity(a, *owners.get(a.owner_index)
            .ok_or(LiftedSolverReject::Identity)?, *motor.get(a_trajectory)
            .ok_or(LiftedSolverReject::Identity)?)?;
        let vb = response_velocity(b, *owners.get(b.owner_index)
            .ok_or(LiftedSolverReject::Identity)?, *motor.get(b_trajectory)
            .ok_or(LiftedSolverReject::Identity)?)?;
        let mut relative = [WideRational4096::zero(); 3];
        for axis in 0..3 { relative[axis] = sub(vb[axis], va[axis])?; }
        Ok(Self { fact, a_trajectory, b_trajectory,
            restitution_raw: a.surface.restitution.min(b.surface.restitution).raw(),
            friction_raw: a.surface.friction.min(b.surface.friction).raw(),
            pre_relative_velocity: relative })
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct LiftedGroup {
    pub(crate) impulses: [LiftedImpulse; MAX_LIFTED_SOLVER_FACTS],
    pub(crate) len: usize,
    pub(crate) signed_energy_delta: WideRational4096,
    pub(crate) loss_raw: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum LiftedSolverReject {
    Identity, FactEnvelope, RowEnvelope, CandidateEnvelope, ImpulseEnvelope,
    ArithmeticEnvelope, NoRestitutionCandidate, NoDissipativeCandidate,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct CandidateScore {
    slip: WideRational4096,
    overshoot: WideRational4096,
    impulse: WideRational4096,
}

#[derive(Clone, PartialEq, Eq, Debug)]
struct LiftedCandidate {
    impulses: [LiftedImpulse; MAX_LIFTED_SOLVER_FACTS],
    len: usize,
    score: CandidateScore,
}

pub(crate) struct LiftedSolverScratch {
    impulses: Vec<LiftedImpulse>,
    trial_rows: Vec<ContactResolution>,
    trial_velocities: Vec<[WideRational4096; 3]>,
    candidates: Vec<LiftedCandidate>,
    normal_candidates: Vec<LiftedCandidate>,
    trajectory_work: ExactTrajectoryWork,
    accepted_owner_stage: Vec<ExactOwnerTrajectory>,
}

impl Default for LiftedSolverScratch {
    fn default() -> Self {
        Self { impulses: Vec::new(), trial_rows: Vec::new(), trial_velocities: Vec::new(),
               candidates: Vec::new(), normal_candidates: Vec::new(),
               trajectory_work: ExactTrajectoryWork::default(), accepted_owner_stage: Vec::new() }
    }
}

impl Clone for LiftedSolverScratch {
    fn clone(&self) -> Self {
        let mut cloned = Self::default();
        cloned.try_reserve().expect("cloning reserved lifted scratch must reserve its bounds");
        cloned.impulses.extend_from_slice(&self.impulses);
        cloned.trial_rows.extend_from_slice(&self.trial_rows);
        cloned.trial_velocities.extend_from_slice(&self.trial_velocities);
        cloned.candidates.extend_from_slice(&self.candidates);
        cloned.normal_candidates.extend_from_slice(&self.normal_candidates);
        cloned.trajectory_work = self.trajectory_work.clone();
        cloned.trajectory_work.try_reserve()
            .expect("cloning exact trajectory work must reserve its bounds");
        cloned.accepted_owner_stage.extend_from_slice(&self.accepted_owner_stage);
        cloned
    }
}

impl LiftedSolverScratch {
    pub(crate) fn try_reserve(&mut self) -> Result<(), LiftedSolverReject> {
        reserve_to(&mut self.impulses, MAX_LIFTED_SOLVER_FACTS,
                   LiftedSolverReject::FactEnvelope)?;
        reserve_to(&mut self.trial_rows, MAX_LIFTED_SOLVER_ROWS,
                   LiftedSolverReject::RowEnvelope)?;
        reserve_to(&mut self.trial_velocities, MAX_LIFTED_SOLVER_FACTS,
                   LiftedSolverReject::FactEnvelope)?;
        reserve_to(&mut self.candidates, LIFTED_LIFTS_PER_VISIT,
                   LiftedSolverReject::CandidateEnvelope)?;
        reserve_to(&mut self.normal_candidates, LIFTED_LIFTS_PER_VISIT,
                   LiftedSolverReject::CandidateEnvelope)?;
        self.trajectory_work.try_reserve().map_err(|_| LiftedSolverReject::RowEnvelope)?;
        reserve_to(&mut self.accepted_owner_stage, MAX_EXACT_OWNERS,
                   LiftedSolverReject::RowEnvelope)?;
        Ok(())
    }

    pub(crate) fn capacities(&self) -> [usize; 9] {
        [self.impulses.capacity(), self.trial_rows.capacity(), self.trial_velocities.capacity(),
         self.candidates.capacity(), self.normal_candidates.capacity(),
         self.trajectory_work.capacities()[0], self.trajectory_work.capacities()[1],
         self.trajectory_work.capacities()[2], self.accepted_owner_stage.capacity()]
    }

    pub(crate) fn selected_rows(&self) -> &[ContactResolution] { &self.trial_rows }

    /// Logical bounds are checked before previous scratch is cleared. A
    /// refused group therefore cannot turn retained diagnostic state into an
    /// empty, superficially successful trial.
    fn check_bounds(&self, facts: usize, rows: usize) -> Result<(), LiftedSolverReject> {
        if facts > MAX_LIFTED_SOLVER_FACTS { return Err(LiftedSolverReject::FactEnvelope); }
        if rows > MAX_LIFTED_SOLVER_ROWS { return Err(LiftedSolverReject::RowEnvelope); }
        Ok(())
    }

    fn begin(&mut self, facts: usize, rows: usize) -> Result<(), LiftedSolverReject> {
        self.check_bounds(facts, rows)?;
        self.impulses.clear(); self.trial_rows.clear(); self.trial_velocities.clear();
        self.candidates.clear(); self.normal_candidates.clear();
        Ok(())
    }

    fn push_candidate(&mut self, candidate: LiftedCandidate) -> Result<(), LiftedSolverReject> {
        if candidate.len > MAX_LIFTED_SOLVER_FACTS {
            return Err(LiftedSolverReject::FactEnvelope);
        }
        if self.candidates.iter().any(|row| row.len == candidate.len
            && row.impulses[..row.len] == candidate.impulses[..candidate.len]) { return Ok(()); }
        if self.candidates.len() == LIFTED_LIFTS_PER_VISIT {
            return Err(LiftedSolverReject::CandidateEnvelope);
        }
        self.candidates.push(candidate);
        Ok(())
    }
}

fn response_velocity(row: ExactContactTrajectory, owner: ExactOwnerTrajectory,
                     motor: [i32; 3])
    -> Result<[WideRational4096; 3], LiftedSolverReject>
{
    fn affine(affine: ExactAffine3, scale: i128, axis: usize)
        -> Result<WideRational4096, LiftedSolverReject>
    {
        if scale <= 0 { return Err(LiftedSolverReject::Identity); }
        let numerator = scale.checked_mul(affine.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(affine.momentum[axis].remainder))
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
        WideRational4096::new(numerator, scale)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)
    }
    let held = row.held_index.and_then(|at| owner.held_response.get(at))
        .and_then(|held| *held);
    let mut out = [WideRational4096::zero(); 3];
    for axis in 0..3 {
        out[axis] = add(affine(owner.common_response, owner.common_scale, axis)?,
                        rational_i128(motor[axis] as i128)?)?;
        if let Some(held) = held {
            out[axis] = add(out[axis], affine(held.affine, held.affine.mass_raw as i128, axis)?)?;
        }
    }
    Ok(out)
}

fn trial(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    contacts: &[LiftedContact], impulses: &[LiftedImpulse], time_raw: u32,
    motor: &[[i32; 3]], rows: &mut Vec<ContactResolution>,
    velocities: &mut Vec<[WideRational4096; 3]>,
    work: &mut ExactTrajectoryWork,
) -> Result<(), LiftedSolverReject> {
    rows.clear();
    for (contact, impulse) in contacts.iter().zip(impulses) {
        let on_a = Vec3::new(Fx::from_raw(impulse.raw[0]), Fx::from_raw(impulse.raw[1]),
                             Fx::from_raw(impulse.raw[2]));
        rows.push(ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536,
            fact: contact.fact, impulse: ContactImpulse { key: contact.fact.key,
                on_a, on_b: -on_a }, energy: EnergyLedger::default(), cut_raw: 0,
            thrust_raw: 0, pressure_raw: 0, deflected_raw: 0, severed: false });
    }
    apply_exact_group_into(trajectories, owners, rows, time_raw, work)
        .map_err(|_| LiftedSolverReject::ArithmeticEnvelope)?;
    velocities.clear();
    for (at, contact) in contacts.iter().enumerate() {
        let a = trajectories[contact.a_trajectory];
        let b = trajectories[contact.b_trajectory];
        let va = response_velocity(a, *work.owner_stage.get(a.owner_index)
            .ok_or(LiftedSolverReject::Identity)?, motor[contact.a_trajectory])?;
        let vb = response_velocity(b, *work.owner_stage.get(b.owner_index)
            .ok_or(LiftedSolverReject::Identity)?, motor[contact.b_trajectory])?;
        let mut relative = [WideRational4096::zero(); 3];
        for axis in 0..3 { relative[axis] = sub(vb[axis], va[axis])?; }
        if at != velocities.len() { return Err(LiftedSolverReject::Identity); }
        velocities.push(relative);
    }
    Ok(())
}

fn constraints_hold(contact: LiftedContact, impulse: LiftedImpulse,
                    velocity: [WideRational4096; 3]) -> Result<bool, LiftedSolverReject> {
    Ok(circular_cone(contact, impulse)? && restitution_holds(contact, velocity)?)
}

fn retain_dissipative_trial(energy: ExactPhysicalEnergyDelta, scratch: &mut LiftedSolverScratch)
    -> Result<(), LiftedSolverReject>
{
    if energy.signed.checked_cmp(WideRational4096::zero())
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)? == Ordering::Greater {
        return Err(LiftedSolverReject::NoDissipativeCandidate);
    }
    core::mem::swap(&mut scratch.trajectory_work.owner_stage,
                    &mut scratch.accepted_owner_stage);
    Ok(())
}

fn lifted_ray(origin: [WideRational4096; 3], direction: [WideRational4096; 3], scale: u32,
              out: &mut Vec<LiftedImpulse>) -> Result<(), LiftedSolverReject> {
    let scalar = WideRational4096::new(scale as i128, 65_536)
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
    let mut value = [WideRational4096::zero(); 3];
    for axis in 0..3 {
        value[axis] = add(origin[axis], mul(direction[axis], scalar)?)?;
    }
    component_lifts(value, out)
}

fn normal_direction(contact: LiftedContact) -> Result<[WideRational4096; 3], LiftedSolverReject> {
    let n = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(), contact.fact.normal.z.raw()];
    Ok([WideRational4096::new(-(n[0] as i128), 1)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?,
        WideRational4096::new(-(n[1] as i128), 1)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?,
        WideRational4096::new(-(n[2] as i128), 1)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?])
}

fn normal_origin(contact: LiftedContact, impulse: LiftedImpulse)
    -> Result<[WideRational4096; 3], LiftedSolverReject>
{
    let n = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(),
             contact.fact.normal.z.raw()];
    let n2 = dot_i32(n, n)?;
    if n2 <= 0 { return Err(LiftedSolverReject::Identity); }
    let dotq = dot_i32(impulse.raw, n)?;
    let mut out = [WideRational4096::zero(); 3];
    for axis in 0..3 {
        out[axis] = sub(rational_i128(impulse.raw[axis] as i128)?,
            WideRational4096::new(dotq.checked_mul(n[axis] as i128)
                .ok_or(LiftedSolverReject::ArithmeticEnvelope)?, n2)
                .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)?;
    }
    Ok(out)
}

fn reserve_to<T>(rows: &mut Vec<T>, bound: usize, reject: LiftedSolverReject)
    -> Result<(), LiftedSolverReject>
{
    if rows.capacity() < bound {
        rows.try_reserve_exact(bound.saturating_sub(rows.len())).map_err(|_| reject)?;
    }
    Ok(())
}

fn rational_i128(value: i128) -> Result<WideRational4096, LiftedSolverReject> {
    WideRational4096::new(value, 1).ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn add(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, LiftedSolverReject>
{
    a.checked_add_divisible(b).ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn sub(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, LiftedSolverReject>
{
    a.checked_sub(b).ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn mul(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, LiftedSolverReject>
{
    a.checked_mul(b).ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn dot_rational(value: [WideRational4096; 3], vector: [i32; 3])
    -> Result<WideRational4096, LiftedSolverReject>
{
    let mut out = WideRational4096::zero();
    for axis in 0..3 { out = add(out, mul(value[axis], rational_i128(vector[axis] as i128)?)?)?; }
    Ok(out)
}

fn dot_i32(a: [i32; 3], b: [i32; 3]) -> Result<i128, LiftedSolverReject> {
    let mut out = 0i128;
    for axis in 0..3 {
        out = out.checked_add((a[axis] as i128).checked_mul(b[axis] as i128)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
    }
    Ok(out)
}

fn square_word(value: i128) -> Result<UnsignedWide4096, LiftedSolverReject> {
    let word = SignedWide4096::from_i128(value);
    word.checked_mul(word).map(|square| square.abs())
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn circular_cone(contact: LiftedContact, impulse: LiftedImpulse)
    -> Result<bool, LiftedSolverReject>
{
    let normal_raw = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(),
                      contact.fact.normal.z.raw()];
    let n2 = dot_i32(normal_raw, normal_raw)?;
    if n2 <= 0 || !(0..=FX_ONE_RAW as i32).contains(&contact.friction_raw) {
        return Err(LiftedSolverReject::Identity);
    }
    let dotq = dot_i32(impulse.raw, normal_raw)?;
    if dotq > 0 { return Ok(false); }
    let mut tangent = [0i128; 3];
    for axis in 0..3 {
        tangent[axis] = n2.checked_mul(impulse.raw[axis] as i128)
            .and_then(|word| word.checked_sub(dotq.checked_mul(normal_raw[axis] as i128)?))
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
    }
    let mut tangent_sq = UnsignedWide4096::ZERO;
    for word in tangent { tangent_sq = tangent_sq.checked_add(square_word(word)?)
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)?; }
    let scale_sq = UnsignedWide4096::from_u128(FX_ONE_RAW as u128 * FX_ONE_RAW as u128);
    let left = tangent_sq.checked_mul(scale_sq).ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
    let right = square_word(contact.friction_raw as i128)?
        .checked_mul(square_word(dotq)?)
        .and_then(|word| word.checked_mul(UnsignedWide4096::from_u128(n2 as u128)))
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
    Ok(left <= right)
}

fn restitution_target(contact: LiftedContact)
    -> Result<WideRational4096, LiftedSolverReject>
{
    if !(0..=FX_ONE_RAW as i32).contains(&contact.restitution_raw) {
        return Err(LiftedSolverReject::Identity);
    }
    let normal_raw = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(),
                      contact.fact.normal.z.raw()];
    let closing = dot_rational(contact.pre_relative_velocity, normal_raw)?;
    if closing.numerator >= SignedWide4096::ZERO { return Ok(WideRational4096::zero()); }
    mul(closing.checked_neg().ok_or(LiftedSolverReject::ArithmeticEnvelope)?,
        WideRational4096::new(contact.restitution_raw as i128, FX_ONE_RAW)
            .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)
}

fn restitution_holds(contact: LiftedContact, post_velocity: [WideRational4096; 3])
    -> Result<bool, LiftedSolverReject>
{
    let normal_raw = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(),
                      contact.fact.normal.z.raw()];
    dot_rational(post_velocity, normal_raw)?.checked_cmp(restitution_target(contact)?)
        .map(|order| order != Ordering::Less)
        .ok_or(LiftedSolverReject::ArithmeticEnvelope)
}

fn score(
    contacts: &[LiftedContact], post_velocities: &[[WideRational4096; 3]],
    impulses: &[LiftedImpulse],
) -> Result<CandidateScore, LiftedSolverReject> {
    if contacts.len() != post_velocities.len() || contacts.len() != impulses.len() {
        return Err(LiftedSolverReject::Identity);
    }
    let mut slip = WideRational4096::zero();
    let mut overshoot = WideRational4096::zero();
    let mut impulse_score = WideRational4096::zero();
    for at in 0..contacts.len() {
        let contact = contacts[at];
        let normal_raw = [contact.fact.normal.x.raw(), contact.fact.normal.y.raw(),
                          contact.fact.normal.z.raw()];
        let n2 = dot_i32(normal_raw, normal_raw)?;
        if n2 <= 0 { return Err(LiftedSolverReject::Identity); }
        let normal = dot_rational(post_velocities[at], normal_raw)?;
        let mut tangent_sq = WideRational4096::zero();
        for axis in 0..3 {
            let component = sub(mul(post_velocities[at][axis], rational_i128(n2)?)?,
                                mul(normal, rational_i128(normal_raw[axis] as i128)?)?)?;
            tangent_sq = add(tangent_sq, mul(component, component)?)?;
        }
        slip = add(slip, mul(tangent_sq,
            WideRational4096::new(1, n2.checked_mul(n2)
                .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)
                .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)?)?;
        let excess = sub(normal, restitution_target(contact)?)?;
        overshoot = add(overshoot, mul(mul(excess, excess)?,
            WideRational4096::new(1, n2).ok_or(LiftedSolverReject::ArithmeticEnvelope)?)?)?;
        impulse_score = add(impulse_score, rational_i128(dot_i32(impulses[at].raw, impulses[at].raw)?)?)?;
    }
    Ok(CandidateScore { slip, overshoot, impulse: impulse_score })
}

fn compare_score(
    left: CandidateScore, left_impulses: &[LiftedImpulse],
    right: CandidateScore, right_impulses: &[LiftedImpulse],
) -> Result<Ordering, LiftedSolverReject> {
    for (a, b) in [(left.slip, right.slip), (left.overshoot, right.overshoot),
                   (left.impulse, right.impulse)] {
        let order = a.checked_cmp(b).ok_or(LiftedSolverReject::ArithmeticEnvelope)?;
        if order != Ordering::Equal { return Ok(order); }
    }
    Ok(left_impulses.iter().flat_map(|word| word.raw).cmp(
        right_impulses.iter().flat_map(|word| word.raw)))
}

fn floor_ceil(value: WideRational4096) -> Result<(i32, i32), LiftedSolverReject> {
    let (numerator, denominator) = value.as_i128_pair()
        .ok_or(LiftedSolverReject::ImpulseEnvelope)?;
    let quotient = numerator / denominator;
    let remainder = numerator % denominator;
    let floor = if remainder < 0 { quotient.checked_sub(1) } else { Some(quotient) }
        .ok_or(LiftedSolverReject::ImpulseEnvelope)?;
    let ceil = if remainder > 0 { quotient.checked_add(1) } else { Some(quotient) }
        .ok_or(LiftedSolverReject::ImpulseEnvelope)?;
    Ok((i32::try_from(floor).map_err(|_| LiftedSolverReject::ImpulseEnvelope)?,
        i32::try_from(ceil).map_err(|_| LiftedSolverReject::ImpulseEnvelope)?))
}

fn component_lifts(
    values: [WideRational4096; 3], output: &mut Vec<LiftedImpulse>,
) -> Result<(), LiftedSolverReject> {
    let pairs = [floor_ceil(values[0])?, floor_ceil(values[1])?, floor_ceil(values[2])?];
    let words = [[pairs[0].0, pairs[0].1], [pairs[1].0, pairs[1].1],
                 [pairs[2].0, pairs[2].1]];
    let before = output.len();
    for mask in 0..8 {
        let raw = [words[0][(mask & 1) as usize], words[1][((mask >> 1) & 1) as usize],
                   words[2][((mask >> 2) & 1) as usize]];
        if !output[before..].iter().any(|candidate| candidate.raw == raw) {
            output.push(LiftedImpulse { raw });
        }
    }
    Ok(())
}

/// Run the fixed eight-sweep lifted search used by ExactKinematics.
pub(crate) fn solve_lifted_group(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    physical_rows: &[usize], facts: &[LiftedContact], time_raw: u32,
    motor_velocities: &[[i32; 3]], scratch: &mut LiftedSolverScratch,
) -> Result<LiftedGroup, LiftedSolverReject> {
    scratch.check_bounds(facts.len(), physical_rows.len())?;
    if facts.windows(2).any(|rows| rows[0].fact.key >= rows[1].fact.key)
        || physical_rows.windows(2).any(|rows| rows[0] >= rows[1])
        || physical_rows.iter().any(|row| *row >= trajectories.len())
        || facts.iter().any(|row| row.a_trajectory >= trajectories.len()
            || row.b_trajectory >= trajectories.len()
            || trajectories[row.a_trajectory].entity != row.fact.key.a
            || trajectories[row.a_trajectory].slot != row.fact.key.a_slot
            || trajectories[row.b_trajectory].entity != row.fact.key.b
            || trajectories[row.b_trajectory].slot != row.fact.key.b_slot) {
        return Err(LiftedSolverReject::Identity);
    }
    if motor_velocities.len() != trajectories.len() || facts.is_empty() {
        return Err(LiftedSolverReject::Identity);
    }
    scratch.begin(facts.len(), physical_rows.len())?;
    let mut selected = [LiftedImpulse::default(); MAX_LIFTED_SOLVER_FACTS];

    // Each visit searches a bounded integer neighbourhood of the exact normal
    // boundary. A trial always starts from `owners`; candidates therefore
    // cannot inherit an earlier trial's rounding or mutation.
    for _ in 0..LIFTED_SOLVER_SWEEPS {
        for visit in 0..facts.len() {
            let direction = normal_direction(facts[visit])?;
            let origin = normal_origin(facts[visit], selected[visit])?;
            let mut low = 0u32;
            let mut high = u32::MAX;
            'normal_search: for _ in 0..32 {
                let mid = low + ((high - low) >> 1);
                scratch.impulses.clear();
                if let Err(error) = lifted_ray(origin, direction, mid, &mut scratch.impulses) {
                    if error == LiftedSolverReject::ImpulseEnvelope { high = mid; continue; }
                    return Err(error);
                }
                let mut reaches = false;
                for word in scratch.impulses.iter().copied() {
                    let mut attempt = selected;
                    attempt[visit] = word;
                    match trial(trajectories, owners, facts,
                        &attempt[..facts.len()], time_raw, motor_velocities,
                        &mut scratch.trial_rows, &mut scratch.trial_velocities,
                        &mut scratch.trajectory_work) {
                        Ok(_) => {}
                        Err(LiftedSolverReject::ArithmeticEnvelope) => {
                            high = mid; continue 'normal_search;
                        }
                        Err(error) => return Err(error),
                    }
                    if constraints_hold(facts[visit], word,
                                        scratch.trial_velocities[visit])? {
                        reaches = true; break;
                    }
                }
                if reaches { high = mid; } else { low = mid.saturating_add(1); }
            }

            scratch.candidates.clear();
            for scale in [high.saturating_sub(1), high, high.saturating_add(1), 0] {
                scratch.impulses.clear();
                match lifted_ray(origin, direction, scale, &mut scratch.impulses) {
                    Ok(()) => {}
                    Err(LiftedSolverReject::ImpulseEnvelope) => continue,
                    Err(error) => return Err(error),
                }
                for word in scratch.impulses.iter().copied() {
                    let mut attempt = selected;
                    attempt[visit] = word;
                    match trial(trajectories, owners, facts,
                        &attempt[..facts.len()], time_raw, motor_velocities,
                        &mut scratch.trial_rows, &mut scratch.trial_velocities,
                        &mut scratch.trajectory_work) {
                        Ok(_) => {}
                        Err(LiftedSolverReject::ArithmeticEnvelope) => continue,
                        Err(error) => return Err(error),
                    }
                    if !constraints_hold(facts[visit], word,
                                         scratch.trial_velocities[visit])? { continue; }
                    let candidate = LiftedCandidate { impulses: attempt, len: facts.len(),
                        score: score(facts, &scratch.trial_velocities,
                                     &attempt[..facts.len()])? };
                    if !scratch.candidates.iter().any(|row| row.len == candidate.len
                        && row.impulses[..row.len] == candidate.impulses[..candidate.len]) {
                        if scratch.candidates.len() == LIFTED_LIFTS_PER_VISIT {
                            return Err(LiftedSolverReject::CandidateEnvelope);
                        }
                        scratch.candidates.push(candidate);
                    }
                }
            }
            scratch.normal_candidates.clear();
            for at in 0..scratch.candidates.len() {
                scratch.normal_candidates.push(scratch.candidates[at].clone());
            }
            let normal_seed_len = scratch.normal_candidates.len();
            for seed_at in 0..normal_seed_len {
            selected = scratch.normal_candidates[seed_at].impulses;

            // Project one tangent correction through the same exact trial.
            // The cone boundary, rather than independent component clamps,
            // remains the sole admissibility test.
            trial(trajectories, owners, facts,
                &selected[..facts.len()], time_raw, motor_velocities,
                &mut scratch.trial_rows, &mut scratch.trial_velocities,
                &mut scratch.trajectory_work)?;
            let n = [facts[visit].fact.normal.x.raw(), facts[visit].fact.normal.y.raw(),
                     facts[visit].fact.normal.z.raw()];
            let n2 = dot_i32(n, n)?;
            let normal = dot_rational(scratch.trial_velocities[visit], n)?;
            let mut tangent = [WideRational4096::zero(); 3];
            for axis in 0..3 {
                tangent[axis] = mul(sub(mul(scratch.trial_velocities[visit][axis], rational_i128(n2)?)?,
                                    mul(normal, rational_i128(n[axis] as i128)?)?)?,
                                    WideRational4096::new(1, n2)
                                        .ok_or(LiftedSolverReject::ArithmeticEnvelope)?)?;
            }
            let initial_tangent = tangent;
            let tangent_origin = [rational_i128(selected[visit].raw[0] as i128)?,
                rational_i128(selected[visit].raw[1] as i128)?,
                rational_i128(selected[visit].raw[2] as i128)?];
            let mut zero_low = 0u32;
            let mut zero_high = u32::MAX;
            'zero_search: for _ in 0..32 {
                let mid = zero_low + ((zero_high - zero_low) >> 1);
                scratch.impulses.clear();
                if let Err(LiftedSolverReject::ImpulseEnvelope) =
                    lifted_ray(tangent_origin, tangent, mid, &mut scratch.impulses) {
                    zero_high = mid; continue;
                }
                let mut crossed = false;
                for word_at in 0..scratch.impulses.len() {
                    let word = scratch.impulses[word_at];
                    let mut attempt = selected; attempt[visit] = word;
                    match trial(trajectories, owners, facts,
                        &attempt[..facts.len()], time_raw, motor_velocities,
                        &mut scratch.trial_rows, &mut scratch.trial_velocities,
                        &mut scratch.trajectory_work) {
                        Ok(_) => {}
                        Err(LiftedSolverReject::ArithmeticEnvelope) => {
                            zero_high = mid; continue 'zero_search;
                        }
                        Err(error) => return Err(error),
                    }
                    let post_normal = dot_rational(scratch.trial_velocities[visit], n)?;
                    let mut along = WideRational4096::zero();
                    for axis in 0..3 {
                        let residual = sub(mul(scratch.trial_velocities[visit][axis], rational_i128(n2)?)?,
                            mul(post_normal, rational_i128(n[axis] as i128)?)?)?;
                        along = add(along, mul(residual, initial_tangent[axis])?)?;
                    }
                    if along.numerator <= SignedWide4096::ZERO { crossed = true; break; }
                }
                if crossed { zero_high = mid; }
                else if mid == u32::MAX { break; }
                else { zero_low = mid + 1; }
            }
            let mut cone_low = 0u32;
            let mut cone_high = u32::MAX;
            for _ in 0..32 {
                let mid = cone_low + ((cone_high - cone_low) >> 1);
                scratch.impulses.clear();
                if let Err(LiftedSolverReject::ImpulseEnvelope) =
                    lifted_ray(tangent_origin, tangent, mid, &mut scratch.impulses) {
                    cone_high = mid; continue;
                }
                let mut admissible = false;
                for word in scratch.impulses.iter().copied() {
                    if circular_cone(facts[visit], word)? { admissible = true; break; }
                }
                if admissible { cone_low = mid.saturating_add(1); } else { cone_high = mid; }
            }
            for scale in [0, zero_high.saturating_sub(1), zero_high,
                          zero_high.saturating_add(1), cone_low.saturating_sub(2),
                          cone_low.saturating_sub(1), cone_low, cone_low.saturating_add(1)] {
                scratch.impulses.clear();
                match lifted_ray(tangent_origin, tangent, scale, &mut scratch.impulses) {
                    Ok(()) => {}
                    Err(LiftedSolverReject::ImpulseEnvelope) => continue,
                    Err(error) => return Err(error),
                }
                for word_at in 0..scratch.impulses.len() {
                    let word = scratch.impulses[word_at];
                    let mut attempt = selected; attempt[visit] = word;
                    match trial(trajectories, owners, facts,
                        &attempt[..facts.len()], time_raw, motor_velocities,
                        &mut scratch.trial_rows, &mut scratch.trial_velocities,
                        &mut scratch.trajectory_work) {
                        Ok(_) => {}
                        Err(LiftedSolverReject::ArithmeticEnvelope) => continue,
                        Err(error) => return Err(error),
                    }
                    if !constraints_hold(facts[visit], word,
                                         scratch.trial_velocities[visit])? { continue; }
                    let candidate = LiftedCandidate { impulses: attempt, len: facts.len(),
                        score: score(facts, &scratch.trial_velocities,
                                     &attempt[..facts.len()])? };
                    scratch.push_candidate(candidate)?;
                }
            }
            }
            selected = scratch.candidates.iter().try_fold(
                None::<&LiftedCandidate>, |winner, row| {
                let replace = match winner { None => true, Some(old) =>
                    compare_score(row.score, &row.impulses[..row.len], old.score,
                                  &old.impulses[..old.len])? == Ordering::Less };
                Ok::<_, LiftedSolverReject>(if replace { Some(row) } else { winner })
            })?.ok_or(LiftedSolverReject::NoRestitutionCandidate)?.impulses;
        }
    }

    trial(trajectories, owners, facts, &selected[..facts.len()], time_raw,
        motor_velocities, &mut scratch.trial_rows, &mut scratch.trial_velocities,
        &mut scratch.trajectory_work)?;
    for at in 0..facts.len() {
        if !constraints_hold(facts[at], selected[at], scratch.trial_velocities[at])? {
            return Err(LiftedSolverReject::NoRestitutionCandidate);
        }
    }
    let energy = exact_physical_energy_delta(trajectories, physical_rows, owners,
        &scratch.trajectory_work.owner_stage, motor_velocities)
        .map_err(|_| LiftedSolverReject::ArithmeticEnvelope)?;
    retain_dissipative_trial(energy, scratch)?;
    Ok(LiftedGroup { impulses: selected, len: facts.len(),
        signed_energy_delta: energy.signed, loss_raw: energy.loss_raw })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EntityId, Faction};
    use crate::combat::contact::{ContactKey, ContactKind, BODY_SLOT};
    use crate::combat::resolution::GeneralizedKind;
    use crate::combat::spec::{Material, SurfaceSpec};
    use crate::combat::trajectory::{ExactMotorPoint, MotorShape};
    use crate::combat::trajectory::{ExactAffine3, ExactMomentum, ExactPosition};
    use fx::{Fx, TimeOfImpact, Vec3};

    fn key(at: u32) -> ContactKey {
        ContactKey { a: EntityId::new(at, 0), a_slot: 0, b: EntityId::new(at + 100, 0),
                     b_slot: 0xff, kind: ContactKind::WeaponBody }
    }

    fn r(numerator: i128, denominator: i128) -> WideRational4096 {
        WideRational4096::new(numerator, denominator).unwrap()
    }

    fn contact(normal_raw: [i32; 3], friction_raw: i32) -> LiftedContact {
        let _ = Faction::Heroes;
        let fact = ContactFact { key: key(1), toi: TimeOfImpact::ZERO, region: 0,
            point: Vec3::ZERO,
            normal: Vec3::new(Fx::from_raw(normal_raw[0]), Fx::from_raw(normal_raw[1]),
                              Fx::from_raw(normal_raw[2])),
            velocity_a: Vec3::ZERO, velocity_b: Vec3::ZERO };
        LiftedContact { fact, a_trajectory: 0, b_trajectory: 1,
            restitution_raw: 0, friction_raw,
            pre_relative_velocity: [r(0, 1); 3] }
    }

    fn zero_score() -> CandidateScore {
        CandidateScore { slip: r(0, 1), overshoot: r(0, 1), impulse: r(0, 1) }
    }

    fn trajectory(entity: EntityId, slot: u8) -> ExactContactTrajectory {
        let point = ExactMotorPoint { at_tick_start_raw: [0; 3], tick_delta_raw: [0; 3] };
        ExactContactTrajectory { entity, faction: if slot == BODY_SLOT { Faction::Monsters }
            else { Faction::Heroes }, slot,
            kind: if slot == BODY_SLOT { GeneralizedKind::Body } else { GeneralizedKind::Equipment },
            mass_raw: 65_536,
            surface: SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO,
                edge_factor: Fx::ZERO, point_factor: Fx::ZERO, material: Material::Steel },
            motor: if slot == BODY_SLOT {
                let bound = crate::combat::trajectory::ExactMotorBounds {
                    lower: point, upper: point, radius_raw: 0, present: true };
                MotorShape::Body { origin: point,
                    parts: [bound; crate::combat::spec::AnatomyRegion::COUNT] }
            } else { MotorShape::Segment { hilt: point, tip: point, radius_raw: 0 } },
            owner_index: 0, held_index: None, equipment_spec: None, present: true }
    }

    fn owner(entity: EntityId, held: bool) -> ExactOwnerTrajectory {
        let affine = |mass_raw| ExactAffine3 { mass_raw,
            at_group: [ExactPosition::default(); 3],
            momentum: [ExactMomentum::default(); 3], group_time_raw: 0 };
        let common_scale = if held { 131_072 } else { 65_536 };
        ExactOwnerTrajectory { entity, body_mass_raw: 65_536, common_scale,
            common_response: affine(common_scale as i32), held_response: if held {
                [Some(crate::combat::trajectory::ExactHeldResponse { slot: 0, spec_id: 7,
                    affine: affine(65_536) }), None]
            } else { [None; 2] } }
    }

    fn analytic_pair(friction_raw: i32, tangent_raw: i32)
        -> (Vec<ExactContactTrajectory>, Vec<ExactOwnerTrajectory>, Vec<LiftedContact>,
            Vec<[i32; 3]>)
    {
        let a = EntityId::new(1, 0); let b = EntityId::new(2, 0);
        let mut weapon = trajectory(a, 0); weapon.held_index = Some(0);
        weapon.equipment_spec = Some(7); weapon.owner_index = 0;
        weapon.surface.friction = Fx::from_raw(friction_raw);
        let mut body = trajectory(b, BODY_SLOT); body.owner_index = 1;
        body.surface.friction = Fx::from_raw(friction_raw);
        let trajectories = vec![weapon, body];
        let owners = vec![owner(a, true), owner(b, false)];
        let motor = vec![[65_536, tangent_raw, 0], [0; 3]];
        let fact = ContactFact { key: ContactKey { a, a_slot: 0, b, b_slot: BODY_SLOT,
            kind: ContactKind::WeaponBody }, toi: TimeOfImpact::ZERO, region: 0,
            point: Vec3::ZERO, normal: Vec3::X, velocity_a: Vec3::ZERO,
            velocity_b: Vec3::ZERO };
        let contact = LiftedContact::from_state(fact, 0, 1, &trajectories, &owners, &motor)
            .unwrap();
        (trajectories, owners, vec![contact], motor)
    }

    #[test]
    fn one_frictionless_contact_meets_restitution_with_the_smallest_lattice_overshoot() {
        let (rows, owners, facts, motor) = analytic_pair(0, 0);
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let solved = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                        &mut scratch).unwrap();
        assert_ne!(solved.impulses[0], LiftedImpulse::default());
        let impulse = solved.impulses[0].raw;
        assert!(impulse[0] < 0 && impulse[1] == 0 && impulse[2] == 0);
        trial(&rows, &owners, &facts, &solved.impulses[..1], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        assert!(restitution_holds(facts[0], scratch.trial_velocities[0]).unwrap());
        let mut predecessor = solved.impulses[0]; predecessor.raw[0] += 1;
        trial(&rows, &owners, &facts, &[predecessor], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        assert!(!restitution_holds(facts[0], scratch.trial_velocities[0]).unwrap());
    }

    #[test]
    fn static_and_sliding_friction_use_the_circle_not_component_clamps() {
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let (rows, owners, facts, motor) = analytic_pair(65_536, 16_384);
        let sticky = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                        &mut scratch).unwrap();
        assert!(circular_cone(facts[0], sticky.impulses[0]).unwrap());
        assert_ne!(sticky.impulses[0].raw[1], 0);
        let (rows, owners, facts, motor) = analytic_pair(8_192, 65_536);
        let sliding = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                         &mut scratch).unwrap();
        assert!(circular_cone(facts[0], sliding.impulses[0]).unwrap());
        assert!(sliding.impulses[0].raw[1] < 0);
    }

    #[test]
    fn removing_normal_or_friction_response_breaks_the_gate_before_damage_is_read() {
        use core::cell::Cell;

        #[derive(Clone, Copy, PartialEq, Eq, Debug)]
        enum GateExit { Constraints, SelectedScore, Damage }

        fn mechanics_gate(
            rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
            facts: &[LiftedContact], motor: &[[i32; 3]], selected: LiftedImpulse,
            selected_score: CandidateScore, candidate: LiftedImpulse,
            scratch: &mut LiftedSolverScratch,
        ) -> (GateExit, bool) {
            let damage_read = Cell::new(false);
            trial(rows, owners, facts, &[candidate], 0, motor,
                  &mut scratch.trial_rows, &mut scratch.trial_velocities,
                  &mut scratch.trajectory_work).unwrap();
            if !constraints_hold(facts[0], candidate, scratch.trial_velocities[0]).unwrap() {
                return (GateExit::Constraints, damage_read.get());
            }
            let candidate_score = score(facts, &scratch.trial_velocities, &[candidate])
                .unwrap();
            if compare_score(candidate_score, &[candidate], selected_score, &[selected])
                .unwrap() != Ordering::Equal {
                return (GateExit::SelectedScore, damage_read.get());
            }
            damage_read.set(true);
            (GateExit::Damage, damage_read.get())
        }

        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let (rows, owners, facts, motor) = analytic_pair(0, 0);
        let normal = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                        &mut scratch).unwrap().impulses[0];
        trial(&rows, &owners, &facts, &[normal], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        let normal_score = score(&facts, &scratch.trial_velocities, &[normal]).unwrap();
        assert_eq!(mechanics_gate(&rows, &owners, &facts, &motor, normal, normal_score,
                                  normal, &mut scratch), (GateExit::Damage, true));
        let mut no_normal = normal; no_normal.raw[0] = 0;
        trial(&rows, &owners, &facts, &[no_normal], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        assert!(!constraints_hold(facts[0], no_normal, scratch.trial_velocities[0]).unwrap());
        assert_eq!(mechanics_gate(&rows, &owners, &facts, &motor, normal, normal_score,
                                  no_normal, &mut scratch), (GateExit::Constraints, false));

        let (rows, owners, facts, motor) = analytic_pair(65_536, 16_384);
        let friction = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                          &mut scratch).unwrap().impulses[0];
        assert_ne!(friction.raw[1], 0);
        trial(&rows, &owners, &facts, &[friction], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        let friction_score = score(&facts, &scratch.trial_velocities, &[friction]).unwrap();
        assert_eq!(mechanics_gate(&rows, &owners, &facts, &motor, friction, friction_score,
                                  friction, &mut scratch), (GateExit::Damage, true));
        let mut no_friction = friction; no_friction.raw[1] = 0;
        trial(&rows, &owners, &facts, &[no_friction], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        assert!(constraints_hold(facts[0], no_friction, scratch.trial_velocities[0]).unwrap());
        let no_friction_score = score(&facts, &scratch.trial_velocities, &[no_friction]).unwrap();
        assert_eq!(compare_score(no_friction_score, &[no_friction], friction_score, &[friction])
                   .unwrap(), Ordering::Greater);
        assert_eq!(mechanics_gate(&rows, &owners, &facts, &motor, friction, friction_score,
                                  no_friction, &mut scratch),
                   (GateExit::SelectedScore, false));
    }

    #[test]
    fn a_positive_energy_trial_leaves_the_prior_accepted_owner_stage_unchanged() {
        let entity = EntityId::new(9, 0);
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        scratch.accepted_owner_stage.push(owner(entity, false));
        scratch.trajectory_work.owner_stage
            .push(owner(EntityId::new(10, 0), false));
        let prior = scratch.accepted_owner_stage.clone();
        let accepted_pointer = scratch.accepted_owner_stage.as_ptr();
        let capacities = scratch.capacities();
        let increasing = ExactPhysicalEnergyDelta { signed: r(1, 3), loss_raw: 0 };
        assert_eq!(retain_dissipative_trial(increasing, &mut scratch),
                   Err(LiftedSolverReject::NoDissipativeCandidate));
        assert_eq!(scratch.accepted_owner_stage, prior);
        assert_eq!(scratch.accepted_owner_stage.as_ptr(), accepted_pointer);
        assert_eq!(scratch.capacities(), capacities);
    }

    #[test]
    fn retained_lifted_trial_matches_every_by_value_owner_row_velocity_and_refusal() {
        use crate::combat::trajectory::apply_exact_group;
        let (trajectories, owners, facts, motor) = analytic_pair(0, 0);
        let impulse = LiftedImpulse { raw: [-32_768, 0, 0] };
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        trial(&trajectories, &owners, &facts, &[impulse], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        let old = apply_exact_group(&trajectories, &owners, &scratch.trial_rows, 0).unwrap();
        assert_eq!(scratch.trajectory_work.owner_stage.len(), owners.len());
        for at in 0..owners.len() {
            assert_eq!(scratch.trajectory_work.owner_stage[at], old.owners.get(at).unwrap());
        }
        let retained_rows = scratch.trial_rows.clone();
        let retained_velocities = scratch.trial_velocities.clone();
        let mut invalid = facts.clone(); invalid[0].fact.toi = TimeOfImpact::ONE;
        assert_eq!(trial(&trajectories, &owners, &invalid, &[impulse], 0, &motor,
            &mut scratch.trial_rows, &mut scratch.trial_velocities,
            &mut scratch.trajectory_work), Err(LiftedSolverReject::ArithmeticEnvelope));
        assert_eq!(scratch.trial_rows.len(), retained_rows.len());
        assert_eq!(scratch.trial_velocities, retained_velocities);
    }

    #[test]
    fn lifted_acceptance_swaps_owner_vectors_only_after_physical_energy_passes() {
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let accepted = owner(EntityId::new(20, 0), false);
        let candidate = owner(EntityId::new(21, 0), false);
        scratch.accepted_owner_stage.push(accepted);
        scratch.trajectory_work.owner_stage.push(candidate);
        let accepted_pointer = scratch.accepted_owner_stage.as_ptr();
        let working_pointer = scratch.trajectory_work.owner_stage.as_ptr();
        retain_dissipative_trial(ExactPhysicalEnergyDelta {
            signed: WideRational4096::zero(), loss_raw: 0,
        }, &mut scratch).unwrap();
        assert_eq!(scratch.accepted_owner_stage, [candidate]);
        assert_eq!(scratch.trajectory_work.owner_stage, [accepted]);
        assert_eq!(scratch.accepted_owner_stage.as_ptr(), working_pointer);
        assert_eq!(scratch.trajectory_work.owner_stage.as_ptr(), accepted_pointer);
    }

    #[test]
    fn lifted_trial_failure_is_atomic_for_rows_velocities_owners_and_reactions() {
        let (trajectories, owners, facts, motor) = analytic_pair(0, 0);
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let impulse = LiftedImpulse { raw: [-32_768, 0, 0] };
        trial(&trajectories, &owners, &facts, &[impulse], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        scratch.accepted_owner_stage.clone_from(&scratch.trajectory_work.owner_stage);
        let accepted = scratch.accepted_owner_stage.clone();
        let accepted_pointer = scratch.accepted_owner_stage.as_ptr();
        let mut invalid = trajectories.clone(); invalid[0].mass_raw = 0;
        assert_eq!(trial(&invalid, &owners, &facts, &[impulse], 0, &motor,
            &mut scratch.trial_rows, &mut scratch.trial_velocities,
            &mut scratch.trajectory_work), Err(LiftedSolverReject::ArithmeticEnvelope));
        assert_eq!(scratch.accepted_owner_stage, accepted);
        assert_eq!(scratch.accepted_owner_stage.as_ptr(), accepted_pointer);
        assert!(scratch.trajectory_work.owner_stage.is_empty());
        assert!(scratch.trajectory_work.reaction_stage.is_empty());
    }

    #[test]
    fn lifted_scratch_clone_re_reserves_every_empty_and_dirty_stage() {
        let mut empty = LiftedSolverScratch::default(); empty.try_reserve().unwrap();
        let empty_caps = empty.capacities();
        assert_eq!(empty.clone().capacities(), empty_caps);
        empty.accepted_owner_stage.push(owner(EntityId::new(30, 0), false));
        empty.trajectory_work.owner_stage.push(owner(EntityId::new(31, 0), false));
        empty.trajectory_work.reaction_stage.push(crate::combat::trajectory::FloorReaction {
            entity: EntityId::new(30, 0), group_time_raw: 0, rejected_impulse_raw: 1,
            energy_change: crate::combat::trajectory::ExactRational {
                numerator: 0, denominator: 1,
            },
        });
        let dirty = empty.clone();
        assert_eq!(dirty.capacities(), empty_caps);
        assert_eq!(dirty.accepted_owner_stage, empty.accepted_owner_stage);
        assert_eq!(dirty.trajectory_work.owner_stage, empty.trajectory_work.owner_stage);
        assert_eq!(dirty.trajectory_work.reaction_stage, empty.trajectory_work.reaction_stage);
    }

    #[test]
    fn retained_lifted_stages_never_grow_across_two_maximum_groups() {
        let (trajectories, owners, facts, motor) = analytic_pair(0, 0);
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let capacities = scratch.capacities();
        for impulse in [LiftedImpulse { raw: [-32_768, 0, 0] },
                        LiftedImpulse { raw: [-65_536, 0, 0] }] {
            trial(&trajectories, &owners, &facts, &[impulse], 0, &motor,
                  &mut scratch.trial_rows, &mut scratch.trial_velocities,
                  &mut scratch.trajectory_work).unwrap();
            retain_dissipative_trial(ExactPhysicalEnergyDelta {
                signed: WideRational4096::zero(), loss_raw: 0,
            }, &mut scratch).unwrap();
            assert_eq!(scratch.capacities(), capacities);
        }
    }

    #[test]
    fn shared_owner_contacts_pass_the_final_simultaneous_recheck() {
        let a = EntityId::new(1, 0); let b = EntityId::new(2, 0);
        let c = EntityId::new(3, 0);
        let mut weapon = trajectory(a, 0); weapon.held_index = Some(0);
        weapon.equipment_spec = Some(7); weapon.owner_index = 0;
        let mut body_b = trajectory(b, BODY_SLOT); body_b.owner_index = 1;
        let mut body_c = trajectory(c, BODY_SLOT); body_c.owner_index = 2;
        let rows = vec![weapon, body_b, body_c];
        let owners = vec![owner(a, true), owner(b, false), owner(c, false)];
        let motor = vec![[65_536, 65_536, 0], [0; 3], [0; 3]];
        let make = |b_entity, normal| ContactFact {
            key: ContactKey { a, a_slot: 0, b: b_entity, b_slot: BODY_SLOT,
                kind: ContactKind::WeaponBody }, toi: TimeOfImpact::ZERO, region: 0,
            point: Vec3::ZERO, normal, velocity_a: Vec3::ZERO, velocity_b: Vec3::ZERO,
        };
        let facts = vec![
            LiftedContact::from_state(make(b, Vec3::X), 0, 1, &rows, &owners, &motor)
                .unwrap(),
            LiftedContact::from_state(make(c, Vec3::Y), 0, 2, &rows, &owners, &motor)
                .unwrap(),
        ];
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let solved = solve_lifted_group(&rows, &owners, &[0, 1, 2], &facts, 0, &motor,
                                        &mut scratch).unwrap();
        trial(&rows, &owners, &facts, &solved.impulses[..solved.len], 0, &motor,
              &mut scratch.trial_rows, &mut scratch.trial_velocities,
              &mut scratch.trajectory_work).unwrap();
        for at in 0..facts.len() {
            assert!(constraints_hold(facts[at], solved.impulses[at],
                                     scratch.trial_velocities[at]).unwrap());
        }
    }

    #[test]
    fn fixed_sweeps_are_invariant_under_an_xy_mapped_solve() {
        let mut scratch = LiftedSolverScratch::default(); scratch.try_reserve().unwrap();
        let (rows, owners, facts, motor) = analytic_pair(32_768, 20_000);
        let original = solve_lifted_group(&rows, &owners, &[0, 1], &facts, 0, &motor,
                                           &mut scratch).unwrap();
        let mut mapped_rows = rows.clone();
        let mut mapped_facts = facts.clone();
        mapped_facts[0].fact.normal = Vec3::Y;
        mapped_facts[0].pre_relative_velocity = [facts[0].pre_relative_velocity[1],
            facts[0].pre_relative_velocity[0], facts[0].pre_relative_velocity[2]];
        let mapped_motor = vec![[motor[0][1], motor[0][0], motor[0][2]], [0; 3]];
        let mapped = solve_lifted_group(&mapped_rows, &owners, &[0, 1], &mapped_facts, 0,
                                         &mapped_motor, &mut scratch).unwrap();
        assert_eq!(mapped.impulses[0].raw,
                   [original.impulses[0].raw[1], original.impulses[0].raw[0],
                    original.impulses[0].raw[2]]);
        mapped_rows.swap(0, 1);
        mapped_rows[0].owner_index = 0;
        mapped_rows[1].owner_index = 1;
        let permuted_owners = vec![owners[1], owners[0]];
        let mut permuted_facts = mapped_facts.clone();
        permuted_facts[0].a_trajectory = 1;
        permuted_facts[0].b_trajectory = 0;
        let permuted_motor = vec![mapped_motor[1], mapped_motor[0]];
        let permuted = solve_lifted_group(&mapped_rows, &permuted_owners, &[0, 1], &permuted_facts,
            0, &permuted_motor, &mut scratch).unwrap();
        assert_eq!(permuted.impulses[..permuted.len], mapped.impulses[..mapped.len]);
    }


    #[test]
    fn circular_cone_accepts_the_boundary_and_refuses_each_axis_pyramid_corner() {
        let row = contact([65_536, 0, 0], 65_536);
        assert!(circular_cone(row, LiftedImpulse { raw: [-10, 10, 0] }).unwrap());
        // Each point fits independent |tangent axis| <= mu*|normal| clamps;
        // their Euclidean length does not fit the circle.
        assert!(!circular_cone(row, LiftedImpulse { raw: [-10, 10, 10] }).unwrap());
        assert!(!circular_cone(row, LiftedImpulse { raw: [-10, 10, -10] }).unwrap());
        assert!(!circular_cone(row, LiftedImpulse { raw: [-10, -10, 10] }).unwrap());
        assert!(!circular_cone(row, LiftedImpulse { raw: [-10, -10, -10] }).unwrap());
        let oblique = contact([3, 4, 0], 65_536);
        assert!(circular_cone(oblique, LiftedImpulse { raw: [1, -7, 0] }).unwrap());
        assert!(!circular_cone(oblique, LiftedImpulse { raw: [4, 4, 0] }).unwrap());
    }

    #[test]
    fn zero_friction_admits_no_nonzero_tangent_impulse() {
        let row = contact([0, 65_536, 0], 0);
        assert!(circular_cone(row, LiftedImpulse { raw: [0, -7, 0] }).unwrap());
        assert!(!circular_cone(row, LiftedImpulse { raw: [1, -7, 0] }).unwrap());
        assert!(!circular_cone(row, LiftedImpulse { raw: [0, -7, 1] }).unwrap());
    }

    #[test]
    fn restitution_and_score_compare_unreduced_rationals_without_division() {
        let mut row = contact([1, 0, 0], 0);
        row.restitution_raw = 32_768;
        row.pre_relative_velocity[0] = r(-2, 3);
        assert!(restitution_holds(row, [r(3, 9), r(0, 1), r(0, 1)]).unwrap());
        assert!(!restitution_holds(row, [r(1, 4), r(0, 1), r(0, 1)]).unwrap());
        let a = CandidateScore { slip: r(3, 9), overshoot: r(7, 11), impulse: r(9, 13) };
        let b = CandidateScore { slip: r(1, 3), overshoot: r(7, 11), impulse: r(9, 13) };
        assert_eq!(compare_score(a, &[], b, &[]).unwrap(), Ordering::Equal);
        let c = CandidateScore { slip: r(1, 2), ..zero_score() };
        assert_eq!(compare_score(a, &[], c, &[]).unwrap(), Ordering::Less);
    }

    #[test]
    fn component_lifts_cover_all_eight_floor_ceiling_neighbours_once() {
        let mut output = Vec::with_capacity(8);
        component_lifts([r(1, 2), r(-1, 2), r(3, 2)], &mut output).unwrap();
        assert_eq!(output.len(), 8);
        output.sort_by_key(|row| row.raw);
        output.dedup_by_key(|row| row.raw);
        assert_eq!(output.len(), 8);
        assert!(output.iter().any(|row| row.raw == [0, -1, 1]));
        assert!(output.iter().any(|row| row.raw == [1, 0, 2]));
        let mut integral = Vec::new();
        component_lifts([r(2, 1), r(-3, 1), r(4, 1)], &mut integral).unwrap();
        assert_eq!(integral, [LiftedImpulse { raw: [2, -3, 4] }]);
        let mut edge = Vec::new();
        component_lifts([r(i32::MAX as i128, 1), r(i32::MIN as i128, 1), r(0, 1)],
                        &mut edge).unwrap();
        let before = edge.clone();
        assert_eq!(component_lifts([r(i32::MAX as i128 + 1, 1), r(0, 1), r(0, 1)],
                                   &mut edge),
                   Err(LiftedSolverReject::ImpulseEnvelope));
        assert_eq!(edge, before);
        assert_eq!(component_lifts([r(i32::MIN as i128 - 1, 1), r(0, 1), r(0, 1)],
                                   &mut edge),
                   Err(LiftedSolverReject::ImpulseEnvelope));
        assert_eq!(component_lifts([r(i32::MAX as i128 * 2 + 1, 2), r(0, 1), r(0, 1)],
                                   &mut edge),
                   Err(LiftedSolverReject::ImpulseEnvelope));
    }

    #[test]
    fn sign_mirror_and_xy_permutation_select_mapped_impulse_words() {
        let original = [LiftedImpulse { raw: [-7, 2, 1] }, LiftedImpulse { raw: [-9, 0, 0] }];
        let velocities = [[r(0, 1); 3]];
        let row = [contact([1, 0, 0], 65_536)];
        let scores = original.map(|word| score(&row, &velocities, &[word]).unwrap());
        let selected = if compare_score(scores[0], &original[..1], scores[1], &original[1..]).unwrap()
            == Ordering::Less { original[0] } else { original[1] };
        let mapped = original.map(|word| LiftedImpulse {
            raw: [-word.raw[1], word.raw[0], word.raw[2]],
        });
        let mapped_row = [contact([0, 1, 0], 65_536)];
        let mapped_scores = mapped.map(|word| score(&mapped_row, &velocities, &[word]).unwrap());
        let mapped_selected = if compare_score(mapped_scores[0], &mapped[..1], mapped_scores[1],
            &mapped[1..]).unwrap() == Ordering::Less { mapped[0] } else { mapped[1] };
        assert_eq!(selected, original[0]);
        assert_eq!(mapped_selected.raw, [-selected.raw[1], selected.raw[0], selected.raw[2]]);
    }

    #[test]
    fn sixteen_facts_and_forty_two_rows_fit_but_each_next_word_refuses_atomically() {
        let mut scratch = LiftedSolverScratch::default();
        scratch.try_reserve().unwrap();
        assert!(scratch.capacities()[0] >= 16 && scratch.capacities()[1] >= 42
            && scratch.capacities()[2] >= 16 && scratch.capacities()[3] >= 96
            && scratch.capacities()[4] >= 96 && scratch.capacities()[5] >= MAX_EXACT_OWNERS
            && scratch.capacities()[6] >= MAX_EXACT_OWNERS
            && scratch.capacities()[7] >= MAX_EXACT_OWNERS * 3
            && scratch.capacities()[8] >= MAX_EXACT_OWNERS);
        scratch.impulses.push(LiftedImpulse { raw: [4, 5, 6] });
        scratch.trial_rows.push(ContactResolution { group_ordinal: 0, group_alpha_raw: 0,
            fact: contact([1, 0, 0], 0).fact, impulse: ContactImpulse { key: key(1),
                on_a: Vec3::ZERO, on_b: Vec3::ZERO }, energy: EnergyLedger::default(),
            cut_raw: 0, thrust_raw: 0, pressure_raw: 0, deflected_raw: 0, severed: false });
        assert_eq!(scratch.begin(16, 42), Ok(()));
        scratch.impulses.push(LiftedImpulse { raw: [4, 5, 6] });
        scratch.trial_rows.push(ContactResolution { group_ordinal: 0, group_alpha_raw: 0,
            fact: contact([1, 0, 0], 0).fact, impulse: ContactImpulse { key: key(1),
                on_a: Vec3::ZERO, on_b: Vec3::ZERO }, energy: EnergyLedger::default(),
            cut_raw: 0, thrust_raw: 0, pressure_raw: 0, deflected_raw: 0, severed: false });
        assert_eq!(scratch.begin(17, 42), Err(LiftedSolverReject::FactEnvelope));
        assert_eq!(scratch.impulses, [LiftedImpulse { raw: [4, 5, 6] }]);
        assert_eq!(scratch.trial_rows.len(), 1);
        assert_eq!(scratch.begin(16, 43), Err(LiftedSolverReject::RowEnvelope));
        assert_eq!(scratch.impulses, [LiftedImpulse { raw: [4, 5, 6] }]);
        assert_eq!(scratch.trial_rows.len(), 1);
    }

    #[test]
    fn ninety_six_candidates_fit_and_the_ninety_seventh_refuses_instead_of_truncating() {
        let mut scratch = LiftedSolverScratch::default();
        for at in 0..96 {
            let mut candidate = LiftedCandidate { impulses: [LiftedImpulse::default(); 16],
                len: 1, score: zero_score() };
            candidate.impulses[0].raw[0] = at;
            scratch.push_candidate(candidate).unwrap();
        }
        let before = scratch.candidates.clone();
        assert_eq!(scratch.push_candidate(before[0].clone()), Ok(()));
        assert_eq!(scratch.candidates, before);
        let oversized = LiftedCandidate { impulses: [LiftedImpulse::default(); 16], len: 17,
                                         score: zero_score() };
        assert_eq!(scratch.push_candidate(oversized), Err(LiftedSolverReject::FactEnvelope));
        let mut next = before[0].clone(); next.impulses[0].raw[0] = 96;
        assert_eq!(scratch.push_candidate(next), Err(LiftedSolverReject::CandidateEnvelope));
        assert_eq!(scratch.candidates, before);
    }

    #[test]
    fn lifted_contacts_require_strict_keys_and_global_trajectory_indices() {
        let mut first = contact([65_536, 0, 0], 0);
        let mut second = first;
        second.fact.key = key(2);
        first.a_trajectory = 0; first.b_trajectory = 1;
        second.a_trajectory = 2; second.b_trajectory = 3;
        let trajectories = [
            trajectory(first.fact.key.a, first.fact.key.a_slot),
            trajectory(first.fact.key.b, first.fact.key.b_slot),
            trajectory(second.fact.key.a, second.fact.key.a_slot),
            trajectory(second.fact.key.b, second.fact.key.b_slot),
        ];
        let mut scratch = LiftedSolverScratch::default();
        assert_eq!(solve_lifted_group(&trajectories, &[], &[0, 1, 2, 3], &[first, second],
                                     0, &[], &mut scratch), Err(LiftedSolverReject::Identity));
        scratch.impulses.push(LiftedImpulse { raw: [7, 8, 9] });
        assert_eq!(solve_lifted_group(&trajectories, &[], &[0, 1, 2, 3], &[second, first],
                                     0, &[], &mut scratch),
                   Err(LiftedSolverReject::Identity));
        assert_eq!(scratch.impulses, [LiftedImpulse { raw: [7, 8, 9] }]);
        assert_eq!(solve_lifted_group(&trajectories, &[], &[0, 1, 2, 3], &[first, first],
                                     0, &[], &mut scratch),
                   Err(LiftedSolverReject::Identity));
        let mut stale = first; stale.a_trajectory = 1;
        assert_eq!(solve_lifted_group(&trajectories, &[], &[0, 1, 2, 3], &[stale],
                                     0, &[], &mut scratch),
                   Err(LiftedSolverReject::Identity));
    }
}
