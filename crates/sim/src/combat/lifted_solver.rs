//! Fixed-envelope grammar for the lifted contact solver.
//!
//! This module owns integer impulse words and exact comparisons only. The
//! production resolver is deliberately not a caller until the bounded visit
//! algorithm lands; making the grammar independently executable keeps the
//! circular cone and its refusal boundaries reviewable before they can move a
//! fight.

#![allow(dead_code)]

use core::cmp::Ordering;

use crate::combat::contact::{ContactFact, ContactResolution};
use crate::combat::trajectory::{ExactContactTrajectory, ExactOwnerTrajectory, FixedExactOwners};
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

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct LiftedGroup {
    pub(crate) impulses: [LiftedImpulse; MAX_LIFTED_SOLVER_FACTS],
    pub(crate) len: usize,
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
    candidates: Vec<LiftedCandidate>,
    trial_owners: Option<FixedExactOwners>,
}

impl Default for LiftedSolverScratch {
    fn default() -> Self {
        Self { impulses: Vec::new(), trial_rows: Vec::new(), candidates: Vec::new(),
               trial_owners: None }
    }
}

impl LiftedSolverScratch {
    pub(crate) fn try_reserve(&mut self) -> Result<(), LiftedSolverReject> {
        reserve_to(&mut self.impulses, MAX_LIFTED_SOLVER_FACTS,
                   LiftedSolverReject::FactEnvelope)?;
        reserve_to(&mut self.trial_rows, MAX_LIFTED_SOLVER_ROWS,
                   LiftedSolverReject::RowEnvelope)?;
        reserve_to(&mut self.candidates, LIFTED_LIFTS_PER_VISIT,
                   LiftedSolverReject::CandidateEnvelope)?;
        Ok(())
    }

    pub(crate) fn capacities(&self) -> [usize; 3] {
        [self.impulses.capacity(), self.trial_rows.capacity(), self.candidates.capacity()]
    }

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
        self.impulses.clear(); self.trial_rows.clear(); self.candidates.clear();
        Ok(())
    }

    fn push_candidate(&mut self, candidate: LiftedCandidate) -> Result<(), LiftedSolverReject> {
        if self.candidates.iter().any(|row| row.len == candidate.len
            && row.impulses[..row.len] == candidate.impulses[..candidate.len]) { return Ok(()); }
        if self.candidates.len() == LIFTED_LIFTS_PER_VISIT {
            return Err(LiftedSolverReject::CandidateEnvelope);
        }
        self.candidates.push(candidate);
        Ok(())
    }
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

/// Checkpoint A deliberately refuses production use. Checkpoint B replaces
/// this sentinel with the fixed eight-sweep driver and routes ExactKinematics
/// to it in the same change.
pub(crate) fn solve_lifted_group(
    trajectories: &[ExactContactTrajectory], _owners: &[ExactOwnerTrajectory],
    physical_rows: &[usize], facts: &[LiftedContact], _time_raw: u32,
    _motor_velocities: &[[i32; 3]], scratch: &mut LiftedSolverScratch,
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
    scratch.begin(facts.len(), physical_rows.len())?;
    Err(LiftedSolverReject::NoRestitutionCandidate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EntityId, Faction};
    use crate::combat::contact::{ContactKey, ContactKind, BODY_SLOT};
    use crate::combat::resolution::GeneralizedKind;
    use crate::combat::spec::{Material, SurfaceSpec};
    use crate::combat::trajectory::{ExactMotorPoint, MotorShape};
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
        ExactContactTrajectory { entity, faction: Faction::Heroes, slot,
            kind: if slot == BODY_SLOT { GeneralizedKind::Body } else { GeneralizedKind::Equipment },
            mass_raw: 65_536,
            surface: SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO,
                edge_factor: Fx::ZERO, point_factor: Fx::ZERO, material: Material::Steel },
            motor: MotorShape::Segment { hilt: point, tip: point, radius_raw: 0 },
            owner_index: 0, held_index: None, equipment_spec: None, present: true }
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
        assert!(restitution_holds(row, [r(2, 6), r(0, 1), r(0, 1)]).unwrap());
        assert!(!restitution_holds(row, [r(1, 4), r(0, 1), r(0, 1)]).unwrap());
        let a = CandidateScore { slip: r(2, 6), overshoot: r(7, 11), impulse: r(9, 13) };
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
            && scratch.capacities()[2] >= 96);
        scratch.impulses.push(LiftedImpulse { raw: [4, 5, 6] });
        assert_eq!(scratch.begin(16, 42), Ok(()));
        scratch.impulses.push(LiftedImpulse { raw: [4, 5, 6] });
        assert_eq!(scratch.begin(17, 42), Err(LiftedSolverReject::FactEnvelope));
        assert_eq!(scratch.impulses, [LiftedImpulse { raw: [4, 5, 6] }]);
        assert_eq!(scratch.begin(16, 43), Err(LiftedSolverReject::RowEnvelope));
        assert_eq!(scratch.impulses, [LiftedImpulse { raw: [4, 5, 6] }]);
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
                                     0, &[], &mut scratch),
                   Err(LiftedSolverReject::NoRestitutionCandidate));
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
