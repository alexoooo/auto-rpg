//! Pure coupled impulse resolution for articulated contact groups.
//!
//! World integration supplies generalized collider rows and commits the result.
//! This module deliberately knows nothing about world columns or scheduling.

use crate::combat::contact::{
    contact_at_pose, map_local_to_global, put_u32, put_u64, scan_candidates_into,
    try_reserve_exact, write_fact, write_impulse, Candidate, ContactCapacityError,
    ContactCollectionScratch, ContactCollider, ContactFact,
    ContactImpulse, ContactKey, ContactKind, ContactResolution, ContactShape, ContactSolverState,
    EnergyLedger, RegionSweep, BODY_SLOT, MAX_CONTACT_FACTS_PER_GROUP, MAX_CONTACT_GROUPS_PER_TICK,
    MAX_CONTACT_RESOLUTIONS_PER_TICK,
};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::contact::{exact_contact_at_pose, exact_response_velocity,
                             scan_exact_candidates_into};
#[cfg(feature = "cartesian-recoil")]
pub use crate::combat::contact::{ExactWideComparisonDiagnostic, ExactWidePrimitiveDiagnostic,
    ExactWideToiDiagnostic, ExactCompatibilityPrimitiveDiagnostic,
    ExactCompatibilitySweepDiagnostic, ExactScanPairRejectionDiagnostic,
    ExactScanShapeDiagnostic, ExactScanBranchDiagnostic, ExactScanRejectDiagnostic,
    ExactSegmentBodyProgressDiagnostic, ExactSegmentBodyDiagnosticTarget, ExactSegmentBodyOrientationDiagnostic, ExactSegmentBodyPairDiagnostic, ExactSegmentBodyPairResultDiagnostic, ExactSegmentBodyRegionDiagnostic, ExactSegmentBodyRegionTerminalDiagnostic, ExactSegmentBodyTargetDiagnostic, ExactSegmentBodyVisitDiagnostic,
    ExactWideWordDiagnostic, ExactWideRationalDiagnostic, ExactPairAabbSideDiagnostic,
    ExactPairAabbPointSourceDiagnostic, ExactPairAabbEndpointDiagnostic,
    ExactPairAabbPointDiagnostic, ExactPairAabbAxisDiagnostic,
    ExactPairAabbComparisonDiagnostic, ExactPairAabbBoundRowDiagnostic,
    ExactPairAabbGapRowDiagnostic, ExactPairAabbTerminalDiagnostic,
    ExactPairAabbRecorderInvalidDiagnostic, ExactPairAabbDiagnostic,
    ExactPointXEventRoleDiagnostic, ExactPointXEventScopeDiagnostic,
    ExactPointXEventFieldDiagnostic, ExactPointXEventStageDiagnostic,
    ExactPointXEventAtomDiagnostic, ExactPointXEventDiagnostic,
    ExactPointXAdmissionDiagnostic, ExactPointXRecorderInvalidDiagnostic,
    ExactSegmentHiltStartXDiagnostic, ExactSegmentHiltStartXTargetDiagnostic};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::trajectory::{advance_exact_into, apply_exact_group_into, ExactContactTrajectory,
                                ExactOwnerTrajectory, ExactTrajectoryWork, FloorReaction};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::wide::WideRational4096;
#[cfg(feature = "cartesian-recoil")]
use crate::combat::lifted_solver::{solve_lifted_group, LiftedContact, LiftedSolverReject,
                                  LiftedSolverScratch};
use crate::combat::spec::{SurfaceSpec, BODY_VOLUME_COUNT};
// Anatomy is a fixture vocabulary here: the resolver names swept volumes.
#[cfg(test)]
use crate::combat::spec::AnatomyRegion;
use crate::{EntityId, Faction};
use fx::{Fx, TimeOfImpact, Vec3};

pub const CONTACT_ENERGY_FLOOR: u64 = 144;

const fn damages_body(kind: ContactKind) -> bool {
    matches!(kind, ContactKind::WeaponBody | ContactKind::ProjectileBody)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GeneralizedCollider {
    pub entity: EntityId,
    pub slot: u8,
    pub kind: GeneralizedKind,
    pub mass: Fx,
    pub velocity: Vec3,
    /// Carried through from [`ContactCollider::velocity_offset`] and used by
    /// nothing in here. A projector that inverse-maps a row through a joint
    /// needs to know which part of that velocity is the sample point's rather
    /// than the hand's, and the trial is handed generalized rows and nothing
    /// else -- so the offset has to ride along beside the velocity it belongs
    /// to. `closure_energy` deliberately ignores it: the row's kinetic energy
    /// is the energy of the point it is sampled at, which is the whole subject
    /// of sampling it somewhere else.
    pub velocity_offset: Vec3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum GeneralizedKind { Body, Equipment, Projectile }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct WeaponBodyChannel {
    pub weapon_axis: Vec3,
    pub weapon_relative_velocity: Vec3,
    pub edge_factor: Fx,
    pub point_factor: Fx,
    /// Blunt conversion, from the weapon's [`crate::combat::spec::Material`].
    /// Unlike its two neighbours this is not a shape term; see
    /// `Material::crush_factor` for why it hangs off the material instead.
    pub crush_factor: Fx,
    pub zero_length: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ProposedContact {
    pub fact: ContactFact,
    pub a_collider: usize,
    pub b_collider: usize,
    pub impulse_on_a: Vec3,
    pub channel: Option<WeaponBodyChannel>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy)]
struct DriverContact { fact: ContactFact, a_collider: usize, b_collider: usize,
                       channel: Option<WeaponBodyChannel> }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResolutionError {
    ColliderIndex, EnergyNumerator, ResolutionCount, Mass, Projector, DuplicateIdentity,
    ExactScan, ExactUnsupportedSweep, ExactResponsePending, ExactLifecyclePending,
    ExactEnergyEnvelope, ExactSolver,
}

/// Where the feature-only exact contact path first refused a tick.
///
/// Evidence rather than authority: this vocabulary is not hashed, recorded, or
/// published through the browser ABI.  It exists so an empty resolution stream
/// can still name the operation that refused it.
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactContactRejectPhase {
    BuildTrajectories, Preflight, Scan, Recompute, Closure, SolveGroup,
    ApplyGroup, Lifecycle, Finish, StageCommit,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactContactRejectionDiagnostic {
    pub tick: u32,
    pub phase: ExactContactRejectPhase,
    pub cause: ResolutionError,
    /// Present only when the refusing operation owned one unambiguous fact.
    /// A coupled group does not accuse its first sorted row by convenience.
    pub key: Option<(EntityId, u8, EntityId, u8, ContactKind)>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactContactKeyDiagnostic {
    pub a: EntityId, pub a_slot: u8, pub b: EntityId, pub b_slot: u8,
    pub kind: ContactKind,
}

#[cfg(feature = "cartesian-recoil")]
impl From<ContactKey> for ExactContactKeyDiagnostic {
    fn from(key: ContactKey) -> Self {
        Self { a: key.a, a_slot: key.a_slot, b: key.b, b_slot: key.b_slot, kind: key.kind }
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactSolveGroupRejectDetail {
    EmptyDriverSet, LiftedIdentity, LiftedFactEnvelope, LiftedRowEnvelope,
    LiftedCandidateEnvelope, LiftedImpulseEnvelope, LiftedArithmeticEnvelope,
    LiftedNoRestitutionCandidate, LiftedNoDissipativeCandidate,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactContactGroupDiagnostic {
    pub tick: u32, pub group_ordinal: u8, pub selected_time_raw: u32,
    pub scan_candidates: u32, pub mapped_time_members: u32,
    pub recomputed_facts: u8, pub closure_entities: u8, pub closure_rows: u8,
    pub driver_contacts: u8, pub lifted_contacts: u8, pub output_rows: u8,
    pub reject: Option<ExactSolveGroupRejectDetail>,
    pub mapped_member_keys: [Option<ExactContactKeyDiagnostic>; 16],
    pub recomputed_keys: [Option<ExactContactKeyDiagnostic>; 16],
    pub wide_toi: [Option<ExactWideToiDiagnostic>; 16],
    pub compatibility_sweep: [Option<ExactCompatibilitySweepDiagnostic>; 16],
}

#[cfg(feature = "cartesian-recoil")]
impl Default for ExactContactGroupDiagnostic {
    fn default() -> Self {
        Self { tick: 0, group_ordinal: 0, selected_time_raw: 0, scan_candidates: 0,
            mapped_time_members: 0, recomputed_facts: 0, closure_entities: 0,
            closure_rows: 0, driver_contacts: 0, lifted_contacts: 0, output_rows: 0,
            reject: None, mapped_member_keys: [None; 16], recomputed_keys: [None; 16],
            wide_toi: [None; 16], compatibility_sweep: [None; 16] }
    }
}

/// Diagnostics have a fixed public bound, but keeping every group's full
/// provenance inline made `World` large enough to exhaust Rust's test-thread
/// stack. Build the fixed-length backing directly on the heap once; the driver
/// only overwrites rows and therefore still allocates nothing after reserve.
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone)]
struct ExactContactGroupDiagnosticRows(Box<[ExactContactGroupDiagnostic]>);

#[cfg(feature = "cartesian-recoil")]
impl Default for ExactContactGroupDiagnosticRows {
    fn default() -> Self {
        Self(core::iter::repeat(ExactContactGroupDiagnostic::default())
            .take(MAX_CONTACT_GROUPS_PER_TICK as usize).collect::<Vec<_>>().into_boxed_slice())
    }
}

#[cfg(feature = "cartesian-recoil")]
impl core::ops::Deref for ExactContactGroupDiagnosticRows {
    type Target = [ExactContactGroupDiagnostic];
    fn deref(&self) -> &Self::Target { &self.0 }
}

#[cfg(feature = "cartesian-recoil")]
impl core::ops::DerefMut for ExactContactGroupDiagnosticRows {
    fn deref_mut(&mut self) -> &mut Self::Target { &mut self.0 }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactContactFailure {
    pub cause: ResolutionError,
    pub phase: ExactContactRejectPhase,
    pub key: Option<ContactKey>,
}

#[cfg(feature = "cartesian-recoil")]
fn exact_solver_error(_error: LiftedSolverReject) -> ResolutionError {
    ResolutionError::ExactSolver
}

#[cfg(feature = "cartesian-recoil")]
fn lifted_reject_detail(error: LiftedSolverReject) -> ExactSolveGroupRejectDetail {
    match error {
        LiftedSolverReject::Identity => ExactSolveGroupRejectDetail::LiftedIdentity,
        LiftedSolverReject::FactEnvelope => ExactSolveGroupRejectDetail::LiftedFactEnvelope,
        LiftedSolverReject::RowEnvelope => ExactSolveGroupRejectDetail::LiftedRowEnvelope,
        LiftedSolverReject::CandidateEnvelope => ExactSolveGroupRejectDetail::LiftedCandidateEnvelope,
        LiftedSolverReject::ImpulseEnvelope => ExactSolveGroupRejectDetail::LiftedImpulseEnvelope,
        LiftedSolverReject::ArithmeticEnvelope => ExactSolveGroupRejectDetail::LiftedArithmeticEnvelope,
        LiftedSolverReject::NoRestitutionCandidate => ExactSolveGroupRejectDetail::LiftedNoRestitutionCandidate,
        LiftedSolverReject::NoDissipativeCandidate => ExactSolveGroupRejectDetail::LiftedNoDissipativeCandidate,
    }
}

#[cfg(feature = "cartesian-recoil")]
fn exact_scan_error(error: crate::combat::contact::ExactScanReject) -> ResolutionError {
    match error {
        crate::combat::contact::ExactScanReject::UnsupportedExactSweep =>
            ResolutionError::ExactUnsupportedSweep,
        _ => ResolutionError::ExactScan,
    }
}

pub fn proposed_impulse(
    mass_a: Fx,
    mass_b: Fx,
    surface_a: SurfaceSpec,
    surface_b: SurfaceSpec,
    velocity_a: Vec3,
    velocity_b: Vec3,
    normal: Vec3,
) -> Vec3 {
    let relative = velocity_b - velocity_a;
    let normal_speed = relative.dot(normal);
    let closing = (-normal_speed).max(Fx::ZERO);
    if closing == Fx::ZERO || mass_a <= Fx::ZERO || mass_b <= Fx::ZERO {
        return Vec3::ZERO;
    }
    let restitution = surface_a.restitution.min(surface_b.restitution);
    let friction = surface_a.friction.min(surface_b.friction);
    let inverse_sum = Fx::ONE / mass_a + Fx::ONE / mass_b;
    if inverse_sum == Fx::ZERO { return Vec3::ZERO; }
    let normal_impulse = (Fx::ONE + restitution) * closing / inverse_sum;
    let tangent = relative - normal * normal_speed;
    let friction_impulse = (friction * normal_impulse).min(tangent.length() / inverse_sum);
    -normal * normal_impulse + tangent.normalized_or_zero() * friction_impulse
}

/// Exact 16.16 kinetic-energy raw value for a generalized closure.
pub fn closure_energy(rows: &[GeneralizedCollider]) -> Result<u64, ResolutionError> {
    let mut numerator = 0i128;
    for row in rows {
        // Checked here as well as in the projector, so that a non-positive mass
        // reports what it is from whichever side reaches it first. `Fx::MIN`
        // otherwise drove the numerator negative and came back as an energy
        // overflow, while `-1` came back as `Mass` -- one defect, two names.
        if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
        let v = row.velocity;
        let square = v.x.raw() as i128 * v.x.raw() as i128
            + v.y.raw() as i128 * v.y.raw() as i128
            + v.z.raw() as i128 * v.z.raw() as i128;
        let term = (row.mass.raw() as i128).checked_mul(square)
            .ok_or(ResolutionError::EnergyNumerator)?;
        numerator = numerator.checked_add(term).ok_or(ResolutionError::EnergyNumerator)?;
    }
    if numerator < 0 { return Err(ResolutionError::EnergyNumerator); }
    let quotient = numerator / (2i128 * 65_536 * 65_536);
    u64::try_from(quotient).map_err(|_| ResolutionError::EnergyNumerator)
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ExactPhysicalEnergyDelta {
    pub(crate) signed: WideRational4096,
    pub(crate) loss_raw: u64,
}

#[cfg(feature = "cartesian-recoil")]
fn exact_energy_add(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ResolutionError>
{
    a.checked_add_divisible(b).ok_or(ResolutionError::ExactEnergyEnvelope)
}

#[cfg(feature = "cartesian-recoil")]
fn exact_energy_mul(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ResolutionError>
{
    a.checked_mul(b).ok_or(ResolutionError::ExactEnergyEnvelope)
}

#[cfg(feature = "cartesian-recoil")]
fn exact_physical_row_energy(
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, motor_velocity_raw: [i32; 3],
) -> Result<WideRational4096, ResolutionError> {
    if row.entity != owner.entity || row.mass_raw <= 0 || owner.common_scale <= 0 {
        return Err(ResolutionError::ExactEnergyEnvelope);
    }
    let held = match row.kind {
        GeneralizedKind::Projectile if row.held_index.is_none() && owner.projectile
            && row.mass_raw == owner.body_mass_raw => None,
        GeneralizedKind::Body if row.held_index.is_none() && row.mass_raw == owner.body_mass_raw => None,
        GeneralizedKind::Equipment => {
            let at = row.held_index.ok_or(ResolutionError::ExactEnergyEnvelope)?;
            let held = owner.held_response.get(at).and_then(|held| *held)
                .ok_or(ResolutionError::ExactEnergyEnvelope)?;
            if held.slot != row.slot || held.affine.mass_raw != row.mass_raw {
                return Err(ResolutionError::ExactEnergyEnvelope);
            }
            Some(held.affine)
        }
        _ => return Err(ResolutionError::ExactEnergyEnvelope),
    };
    let mut square = WideRational4096::zero();
    for axis in 0..3 {
        let common = owner.common_scale
            .checked_mul(owner.common_response.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(owner.common_response.momentum[axis].remainder))
            .ok_or(ResolutionError::ExactEnergyEnvelope)?;
        let mut velocity = WideRational4096::new(common, owner.common_scale)
            .ok_or(ResolutionError::ExactEnergyEnvelope)?;
        velocity = exact_energy_add(velocity, WideRational4096::new(
            motor_velocity_raw[axis] as i128, 1,
        ).ok_or(ResolutionError::ExactEnergyEnvelope)?)?;
        if let Some(held) = held {
            let scale = held.mass_raw as i128;
            let relative = scale.checked_mul(held.momentum[axis].velocity_raw as i128)
                .and_then(|word| word.checked_add(held.momentum[axis].remainder))
                .ok_or(ResolutionError::ExactEnergyEnvelope)?;
            velocity = exact_energy_add(velocity, WideRational4096::new(relative, scale)
                .ok_or(ResolutionError::ExactEnergyEnvelope)?)?;
        }
        square = exact_energy_add(square, exact_energy_mul(velocity, velocity)?)?;
    }
    exact_energy_mul(square, WideRational4096::new(row.mass_raw as i128,
        2i128 * 65_536 * 65_536).ok_or(ResolutionError::ExactEnergyEnvelope)?)
}

/// Streams physical-row changes through the fixed 4,096-bit word. The caller
/// supplies the single owning row for two-handed equipment rather than asking
/// this layer to infer ownership from mirrored contact geometry.
#[cfg(feature = "cartesian-recoil")]
pub(crate) fn exact_physical_energy_delta(
    trajectories: &[ExactContactTrajectory], physical_rows: &[usize],
    before: &[ExactOwnerTrajectory], after: &[ExactOwnerTrajectory],
    motor_velocity_raw: &[[i32; 3]],
) -> Result<ExactPhysicalEnergyDelta, ResolutionError> {
    if motor_velocity_raw.len() != trajectories.len() || before.len() != after.len() {
        return Err(ResolutionError::ExactEnergyEnvelope);
    }
    let mut signed = WideRational4096::zero();
    let mut owner_delta = WideRational4096::zero();
    let mut active_owner = None;
    let mut previous_row = None;
    for &at in physical_rows {
        if previous_row.is_some_and(|previous| previous >= at) {
            return Err(ResolutionError::DuplicateIdentity);
        }
        previous_row = Some(at);
        let row = trajectories.get(at).ok_or(ResolutionError::ExactEnergyEnvelope)?;
        if active_owner.is_some_and(|owner| owner > row.owner_index) {
            return Err(ResolutionError::DuplicateIdentity);
        }
        if active_owner.is_some_and(|owner| owner != row.owner_index) {
            signed = exact_energy_add(signed, owner_delta)?;
            owner_delta = WideRational4096::zero();
        }
        active_owner = Some(row.owner_index);
        let old = before.get(row.owner_index).ok_or(ResolutionError::ExactEnergyEnvelope)?;
        let new = after.get(row.owner_index).ok_or(ResolutionError::ExactEnergyEnvelope)?;
        if old.entity != new.entity { return Err(ResolutionError::ExactEnergyEnvelope); }
        let old_energy = exact_physical_row_energy(row, old, motor_velocity_raw[at])?;
        let new_energy = exact_physical_row_energy(row, new, motor_velocity_raw[at])?;
        owner_delta = exact_energy_add(owner_delta, new_energy.checked_sub(old_energy)
            .ok_or(ResolutionError::ExactEnergyEnvelope)?)?;
    }
    if active_owner.is_some() { signed = exact_energy_add(signed, owner_delta)?; }
    let loss_raw = if signed.numerator.is_negative() {
        let loss = signed.checked_neg().and_then(WideRational4096::trunc_i128)
            .ok_or(ResolutionError::ExactEnergyEnvelope)?;
        u64::try_from(loss).map_err(|_| ResolutionError::ExactEnergyEnvelope)?
    } else { 0 };
    Ok(ExactPhysicalEnergyDelta { signed, loss_raw })
}

/// The exact applied raw delta for one accumulator component. Shared with
/// `World`'s coupled projector rather than re-spelled there: the alpha and mass
/// fixed-point scales cancel with no extra factor of 65,536, and two copies of
/// that arithmetic is two chances to grow one.
pub(crate) fn scaled_delta(sum: [i128; 3], alpha_raw: u32, mass_raw: i32) -> Vec3 {
    debug_assert!(mass_raw > 0);
    let component = |value: i128| {
        let raw = value * alpha_raw as i128 / mass_raw as i128;
        Fx::from_raw(raw.clamp(i32::MIN as i128, i32::MAX as i128) as i32)
    };
    Vec3::new(component(sum[0]), component(sum[1]), component(sum[2]))
}

pub trait ContactTrialProjector {
    /// Rebuild one trial from the immutable pre-group rows. Implementations may
    /// project body Z into the floor, propagate a body delta to held equipment,
    /// and inverse-map/clamp joint poses before writing their final velocities.
    ///
    /// `out` must end up the same length as `before`, row for row: the greedy
    /// alpha search calls this up to eighteen times per group and treats the
    /// last call as authoritative, so a projector that dropped or added a row
    /// would silently re-index the closure. `resolve_group_into` checks rather
    /// than trusts, because the interesting implementation is World's and it
    /// runs a joint clamp that can fail.
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError>;
    /// Apply one resolved group to whatever authoritative state the *next*
    /// re-sweep has to see, and finish the group's rows.
    ///
    /// This is where wounds land. It is a hook rather than a pass after the
    /// driver returns because severance has to reach the geometry inside the
    /// tick: an arm taken off by the first group must not still be swinging in
    /// the second, and the second group's candidate scan is three lines below
    /// this call. `rows` is handed over mutably for the same reason -- the
    /// deflected budget and the severance flag are facts about what the wound
    /// did, and only the implementation that applies the wound knows them.
    ///
    /// The default does nothing, which is exactly right for a fixture with no
    /// anatomy behind its colliders: the pure driver stays pure.
    fn after_group(
        &mut self,
        _colliders: &mut [ContactCollider],
        _rows: &mut [ContactResolution],
    ) -> Result<(), ResolutionError> {
        Ok(())
    }
}

pub struct IndependentPointProjector;

impl ContactTrialProjector for IndependentPointProjector {
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError> {
        out.clear();
        out.extend_from_slice(before);
        for (row, sum) in out.iter_mut().zip(sums) {
            // Not merely a bad ledger: `scaled_delta` divides by this.
            if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
            let delta = scaled_delta(*sum, alpha_raw, row.mass.raw());
            row.velocity = clamp_vec(row.velocity + delta);
        }
        Ok(())
    }
}

fn clamp_vec(value: Vec3) -> Vec3 {
    const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
    Vec3::new(value.x.clamp(-L, L), value.y.clamp(-L, L), value.z.clamp(-L, L))
}

/// Resolve one immutable simultaneous group. Facts must already be key-sorted.
/// Every accumulator is applied once; the output rows preserve that order.
///
/// **A `Vec`-returning `resolve_group` wrapper stood in front of this and is
/// gone.** It allocated five scratch vectors per call, handed them here with an
/// [`IndependentPointProjector`], and returned the output -- and nothing but one
/// test ever called it, because the whole point of the `_into` shape is that a
/// world driving a contact tick owns its scratch and allocates none. A test
/// against the wrapper was a test of a call shape the sim does not make; that
/// test drives this signature now.
pub fn resolve_group_into<P: ContactTrialProjector>(
    colliders: &mut [GeneralizedCollider],
    contacts: &[ProposedContact],
    group_ordinal: u8,
    projector: &mut P,
    sums: &mut Vec<[i128; 3]>,
    trial_rows: &mut Vec<GeneralizedCollider>,
    weights: &mut Vec<u128>,
    shares: &mut Vec<u64>,
    output: &mut Vec<ContactResolution>,
) -> Result<(), ResolutionError> {
    let before = closure_energy(colliders)?;
    build_group_sums(colliders.len(), contacts, sums)?;

    projector.project(colliders, sums, 65_536, trial_rows)?;
    let full_energy = closure_energy(trial_rows)?;
    let alpha_raw = if full_energy <= before {
        65_536
    } else {
        let mut accepted = 0u32;
        for bit in (0..=15).rev() {
            let candidate = accepted | (1 << bit);
            projector.project(colliders, sums, candidate, trial_rows)?;
            if closure_energy(trial_rows)? <= before { accepted = candidate; }
        }
        accepted
    };
    projector.project(colliders, sums, alpha_raw, trial_rows)?;
    // `after <= before` is the whole point of the alpha search, and alpha zero
    // has to satisfy it: no impulse is applied there, so a projector that
    // answers anything but the rows it was handed is reporting its own
    // arithmetic. A violation is therefore a broken projector rather than a
    // hard input. Say so with an error instead of a release-mode subtraction
    // that would wrap, or a `copy_from_slice` that would panic on a short row.
    //
    // "Alpha zero *always* satisfies it" is what this said until 2026-08-10,
    // and it was true only of the projector two lines up. `World`'s coupled one
    // sent every equipment row out to a hand, back through the joint's inexact
    // inverse map and out again at every alpha including zero, and the round
    // trip is worth up to 68 raw units of hand movement -- which is velocity,
    // which is energy. Measured on the articulated corpus at 400 seeds
    // mirrored: 188,654 of 2,880,000 ticks refused here, 6.5%, every first
    // cause `Projector`, and 156 of the first 166 with no joint limit involved
    // at all. The fix is in `ContactProjector::project`: an unmoved hand is not
    // re-derived. Note what the number was, because the check is worth nothing
    // if the next projector's drift is quietly re-recorded as the new normal.
    finalize_projected_group(colliders, trial_rows, contacts, group_ordinal, alpha_raw,
        weights, shares, output)?;
    Ok(())
}

pub(crate) fn build_group_sums(
    collider_count: usize, contacts: &[ProposedContact], sums: &mut Vec<[i128; 3]>,
) -> Result<(), ResolutionError> {
    sums.clear();
    sums.resize(collider_count, [0i128; 3]);
    for contact in contacts {
        if contact.a_collider >= collider_count || contact.b_collider >= collider_count {
            return Err(ResolutionError::ColliderIndex);
        }
        add(&mut sums[contact.a_collider], contact.impulse_on_a);
        add(&mut sums[contact.b_collider], -contact.impulse_on_a);
    }
    Ok(())
}

/// Finish an already selected projected group without choosing its response.
///
/// This is deliberately response-law agnostic: production hands it the row set
/// selected above, while tests may hand it a frozen candidate. It owns the
/// energy check, allocation and diagnostic construction so those two callers
/// cannot drift into subtly different anatomy inputs.
pub(crate) fn finalize_projected_group(
    colliders: &mut [GeneralizedCollider], projected: &[GeneralizedCollider],
    contacts: &[ProposedContact], group_ordinal: u8, alpha_raw: u32,
    weights: &mut Vec<u128>, shares: &mut Vec<u64>, output: &mut Vec<ContactResolution>,
) -> Result<(), ResolutionError> {
    if alpha_raw > 65_536 || projected.len() != colliders.len() {
        return Err(ResolutionError::Projector);
    }
    for (before, after) in colliders.iter().zip(projected) {
        if before.entity != after.entity || before.slot != after.slot || before.kind != after.kind
            || before.mass != after.mass || before.velocity_offset != after.velocity_offset {
            return Err(ResolutionError::Projector);
        }
    }
    if contacts.is_empty() { return Err(ResolutionError::ResolutionCount); }
    let mut previous = None;
    for contact in contacts {
        if contact.a_collider >= colliders.len() || contact.b_collider >= colliders.len()
            || contact.a_collider == contact.b_collider
            || previous.is_some_and(|key| key >= contact.fact.key) {
            return Err(if contact.a_collider >= colliders.len() || contact.b_collider >= colliders.len() {
                ResolutionError::ColliderIndex
            } else { ResolutionError::DuplicateIdentity });
        }
        let matches = |row: GeneralizedCollider, entity, slot| row.entity == entity
            && row.slot == slot && (slot != BODY_SLOT || row.kind == GeneralizedKind::Body);
        if !matches(colliders[contact.a_collider], contact.fact.key.a, contact.fact.key.a_slot)
            || !matches(colliders[contact.b_collider], contact.fact.key.b, contact.fact.key.b_slot) {
            return Err(ResolutionError::ColliderIndex);
        }
        previous = Some(contact.fact.key);
    }
    let before = closure_energy(colliders)?;
    let after = closure_energy(projected)?;
    if after > before { return Err(ResolutionError::Projector); }
    let ledger = EnergyLedger { before_raw: before, after_raw: after, dissipated_raw: before - after };
    allocate_shares_into(ledger.dissipated_raw, contacts, alpha_raw, weights, shares)?;
    if ledger.dissipated_raw > 0 && weights.iter().all(|&weight| weight == 0) {
        return Err(ResolutionError::EnergyNumerator);
    }
    output.clear();
    for (contact, &share) in contacts.iter().zip(shares.iter()) {
        let on_a = scale_impulse(contact.impulse_on_a, alpha_raw);
        let (cut_raw, thrust_raw, crush_raw, pressure_raw) = match contact.channel {
            Some(channel) if damages_body(contact.fact.key.kind) => channels(share, channel),
            _ => (0, 0, 0, 0),
        };
        output.push(ContactResolution {
            group_ordinal,
            group_alpha_raw: alpha_raw,
            fact: contact.fact,
            impulse: ContactImpulse { key: contact.fact.key, on_a, on_b: -on_a },
            energy: ledger,
            cut_raw,
            thrust_raw,
            crush_raw,
            pressure_raw,
            deflected_raw: 0,
            severed: false,
        });
    }
    colliders.copy_from_slice(projected);
    Ok(())
}

/// Apply selected generalized velocities to their authoritative collider rows.
/// Endpoint translation keeps the production Fx parenthesization exactly.
pub(crate) fn apply_projected_rows(
    colliders: &mut [ContactCollider], closure_rows: &[usize], old_velocities: &[Vec3],
    projected: &[GeneralizedCollider], remaining_raw: u32,
) -> Result<(), ResolutionError> {
    if remaining_raw > 65_536 || closure_rows.len() != old_velocities.len()
        || closure_rows.len() != projected.len() {
        return Err(ResolutionError::Projector);
    }
    let remaining = Fx::from_raw(remaining_raw as i32);
    for pair in closure_rows.windows(2) {
        if pair[0] >= pair[1] { return Err(ResolutionError::DuplicateIdentity); }
    }
    for ((&index, &old), generalized) in closure_rows.iter()
        .zip(old_velocities).zip(projected) {
        let Some(row) = colliders.get(index) else { return Err(ResolutionError::ColliderIndex) };
        let expected_kind = if matches!(row.shape, ContactShape::Body { .. }) {
            GeneralizedKind::Body
        } else if matches!(row.shape, ContactShape::Projectile { .. }) {
            GeneralizedKind::Projectile
        } else { GeneralizedKind::Equipment };
        if row.entity != generalized.entity || row.slot != generalized.slot
            || expected_kind != generalized.kind || row.mass != generalized.mass
            || row.velocity_offset != generalized.velocity_offset || row.velocity != old {
            return Err(ResolutionError::Projector);
        }
    }
    for ((&index, &old), generalized) in closure_rows.iter()
        .zip(old_velocities).zip(projected) {
        let row = &mut colliders[index];
        translate_requested(row, (generalized.velocity - old) * remaining);
        row.velocity = generalized.velocity;
    }
    Ok(())
}

fn add(sum: &mut [i128; 3], value: Vec3) {
    sum[0] += value.x.raw() as i128;
    sum[1] += value.y.raw() as i128;
    sum[2] += value.z.raw() as i128;
}

fn scale_impulse(value: Vec3, alpha_raw: u32) -> Vec3 {
    let scale = |raw: i32| Fx::from_raw((raw as i128 * alpha_raw as i128 / 65_536) as i32);
    Vec3::new(scale(value.x.raw()), scale(value.y.raw()), scale(value.z.raw()))
}

fn allocate_shares_into(
    total: u64, contacts: &[ProposedContact], alpha_raw: u32,
    weights: &mut Vec<u128>, shares: &mut Vec<u64>,
) -> Result<(), ResolutionError> {
    weights.clear();
    for row in contacts {
        let applied = scale_impulse(row.impulse_on_a, alpha_raw);
        let normal = (-applied).dot(row.fact.normal).raw().max(0) as u128;
        let closing = (-(row.fact.velocity_b - row.fact.velocity_a).dot(row.fact.normal))
            .raw().max(0) as u128;
        weights.push(normal.checked_mul(closing).ok_or(ResolutionError::EnergyNumerator)?);
    }
    if total > 0 && weights.iter().all(|&weight| weight == 0) {
        // Several sub-raw contact impulses may add to one representable owner
        // velocity change even though each separately rounds to zero. The
        // closure then genuinely loses a raw energy unit, but weighting the
        // already-rounded public impulses refuses because it has erased every
        // contributor. Retain their pre-rounding normal numerators only for
        // this otherwise-unattributable case. `alpha_raw` is common to every
        // row, so leaving its 65,536 denominator uncancelled changes no share.
        weights.clear();
        for row in contacts {
            let normal = (-row.impulse_on_a).dot(row.fact.normal)
                .raw().max(0) as u128;
            let closing = (-(row.fact.velocity_b - row.fact.velocity_a)
                .dot(row.fact.normal)).raw().max(0) as u128;
            let scaled = normal.checked_mul(alpha_raw as u128)
                .and_then(|value| value.checked_mul(closing))
                .ok_or(ResolutionError::EnergyNumerator)?;
            weights.push(scaled);
        }
    }
    allocate_weighted_into(total, weights, shares)
}

/// Split `total` across `weights`, giving the last nonzero weight the remainder
/// so the parts sum to the whole exactly.
///
/// **An `allocate_weighted` wrapper returning a fresh `Vec` stood here**, with
/// an `.expect("bounded contact weights")` swallowing the overflow arm. Two
/// tests called it and nothing else did: the solver allocates its share vector
/// once per tick and passes it in, and a wrapper that panics where the caller
/// gets a `Result` is a second error contract for one function. Both tests read
/// this signature now, which is the one that ships.
pub fn allocate_weighted_into(
    total: u64, weights: &[u128], result: &mut Vec<u64>,
) -> Result<(), ResolutionError> {
    let sum = weights.iter().try_fold(0u128, |sum, &weight| sum.checked_add(weight))
        .ok_or(ResolutionError::EnergyNumerator)?;
    result.clear();
    result.resize(weights.len(), 0);
    if sum == 0 { return Ok(()); }
    let last = weights.iter().rposition(|&weight| weight > 0).unwrap();
    let mut used = 0u64;
    for index in 0..last {
        if weights[index] == 0 { continue; }
        let product = (total as u128).checked_mul(weights[index]).ok_or(ResolutionError::EnergyNumerator)?;
        let share = (product / sum) as u64;
        result[index] = share;
        used = used.checked_add(share).ok_or(ResolutionError::EnergyNumerator)?;
    }
    result[last] = total - used;
    Ok(())
}

/// Split one allocated share into `(cut, thrust, crush, pressure)`.
///
/// The first two are directional: the blow's energy is divided between the
/// weapon's axis and everything perpendicular to it, and each half is then
/// scaled by whether the weapon has the shape to exploit it -- a point for the
/// axial half, an edge for the transverse one.
///
/// **Crush is what those two declined.** A sword has both shapes and claims the
/// whole budget, so it declines nothing and crushes nothing. A club has no edge,
/// so a swing -- which is almost entirely transverse -- declines almost
/// everything, and that is the energy a blunt weapon is *for*. Billing crush on
/// the remainder rather than on the budget is what keeps the three channels a
/// partition instead of three helpings of the same energy.
///
/// Two properties follow from taking the remainder rather than the share, and
/// both are load-bearing:
///
/// - **The floor still bites.** `declined` is measured against `available`,
///   which already has [`CONTACT_ENERGY_FLOOR`] withheld, so the 144 raw cannot
///   come back as crush. Billing crush on `share - cut - thrust` would have
///   handed it straight back and quietly retired the floor.
/// - **A weapon that already converts is untouched.** Where `edge` and `point`
///   are both one the two floor divisions sum to `available` or one less, so
///   `declined` is 0 or 1 and any factor below one floors it to zero crush.
///   `a_sword_is_not_made_stronger_by_the_crush_channel` asserts that as an
///   equality rather than a tolerance, and it is why the behaviour corpus --
///   whose every surface is edge one, point one -- cannot move.
pub fn channels(share: u64, channel: WeaponBodyChannel) -> (u64, u64, u64, u64) {
    if channel.zero_length { return (0, 0, 0, share); }
    let axial = channel.weapon_relative_velocity.dot(channel.weapon_axis).max(Fx::ZERO);
    let axial_sq = axial.raw() as u128 * axial.raw() as u128;
    let velocity = channel.weapon_relative_velocity;
    let total_sq = velocity.x.raw() as i128 * velocity.x.raw() as i128
        + velocity.y.raw() as i128 * velocity.y.raw() as i128
        + velocity.z.raw() as i128 * velocity.z.raw() as i128;
    let transverse_sq = (total_sq - axial_sq as i128).max(0) as u128;
    let denominator = axial_sq + transverse_sq;
    if denominator == 0 { return (0, 0, 0, share); }
    let available = share.saturating_sub(CONTACT_ENERGY_FLOOR);
    let thrust_base = available as u128 * axial_sq / denominator;
    let cut_base = available as u128 * transverse_sq / denominator;
    // `thrust_base + cut_base` is at most `available`, so `share - cut - thrust`
    // cannot underflow while both factors are at most one. `validate_surface`
    // guarantees that for every spec-built surface, but this function is public
    // and takes a raw `SurfaceSpec`, so the bound is enforced here rather than
    // assumed -- an above-one factor would otherwise panic on the subtraction,
    // in release too, since the workspace keeps overflow checks on.
    let factor = |value: Fx| value.raw().clamp(0, 65_536) as u128;
    let thrust = (thrust_base * factor(channel.point_factor) / 65_536) as u64;
    let cut = (cut_base * factor(channel.edge_factor) / 65_536) as u64;
    // Both scaled channels are at most their base and the bases sum to at most
    // `available`, so this subtraction is the same guarded shape as the one
    // below it and cannot underflow either.
    let declined = available - thrust - cut;
    let crush = (declined as u128 * factor(channel.crush_factor) / 65_536) as u64;
    (cut, thrust, crush, share - cut - thrust - crush)
}

#[derive(Clone, Default)]
pub struct ContactTickScratch {
    collection: ContactCollectionScratch,
    group_facts: Vec<ContactFact>,
    closure_entities: Vec<EntityId>,
    closure_rows: Vec<usize>,
    generalized: Vec<GeneralizedCollider>,
    proposed: Vec<ProposedContact>,
    sums: Vec<[i128; 3]>,
    trial: Vec<GeneralizedCollider>,
    weights: Vec<u128>,
    shares: Vec<u64>,
    group_rows: Vec<ContactResolution>,
    old_velocities: Vec<Vec3>,
    #[cfg(feature = "cartesian-recoil")]
    motor_velocities: Vec<[i32; 3]>,
    #[cfg(feature = "cartesian-recoil")]
    driver_contacts: Vec<DriverContact>,
    #[cfg(feature = "cartesian-recoil")]
    lifted_contacts: Vec<LiftedContact>,
    #[cfg(feature = "cartesian-recoil")]
    lifted_solver: LiftedSolverScratch,
    #[cfg(feature = "cartesian-recoil")]
    exact_reject_phase: Option<ExactContactRejectPhase>,
    #[cfg(feature = "cartesian-recoil")]
    exact_reject_key: Option<ContactKey>,
    #[cfg(feature = "cartesian-recoil")]
    exact_group_diagnostics: ExactContactGroupDiagnosticRows,
    #[cfg(feature = "cartesian-recoil")]
    exact_group_diagnostics_len: usize,
    #[cfg(feature = "cartesian-recoil")]
    exact_diagnostic_tick: u32,
    #[cfg(feature = "cartesian-recoil")]
    exact_trajectory_work: ExactTrajectoryWork,
    #[cfg(feature = "cartesian-recoil")]
    exact_solve_owner_entry: Vec<ExactOwnerTrajectory>,
    #[cfg(feature = "cartesian-recoil")]
    exact_solve_trajectory_entry: Vec<ExactContactTrajectory>,
    suppressed: Vec<Resolved>,
    capped_entities: Vec<EntityId>,
}

impl ContactTickScratch {
    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn begin_exact_diagnostics(&mut self, tick: u32) {
        self.exact_group_diagnostics_len = 0; self.collection.begin_segment_body_target_tick();
        self.exact_diagnostic_tick = tick;
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn exact_group_diagnostics(&self) -> &[ExactContactGroupDiagnostic] {
        &self.exact_group_diagnostics[..self.exact_group_diagnostics_len]
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn exact_scan_pair_rejection(&self)
        -> Option<crate::combat::contact::ExactScanPairRejectionDiagnostic>
    {
        self.collection.first_pair_rejection()
    }

    #[cfg(feature = "cartesian-recoil")]
    fn exact_context(&mut self, phase: ExactContactRejectPhase, key: Option<ContactKey>) {
        self.exact_reject_phase = Some(phase);
        self.exact_reject_key = key;
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn exact_rejection_context(&self)
        -> (ExactContactRejectPhase, Option<ContactKey>)
    {
        (self.exact_reject_phase.unwrap_or(ExactContactRejectPhase::Preflight),
         self.exact_reject_key)
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn exact_context_for_world(
        &mut self, phase: ExactContactRejectPhase, key: Option<ContactKey>,
    ) {
        self.exact_context(phase, key);
    }

    /// `collider_bound` is `n*3` and `candidate_bound` is `pairs*16` for the
    /// allocated-slot high water `n`. Every other bound in here is a frozen
    /// constant rather than the caller's to choose, so it is not a parameter:
    /// a caller that could pass a small fact bound could make the driver
    /// reallocate inside a tick, which is the one thing this reservation buys.
    pub fn try_reserve(
        &mut self, collider_bound: usize, candidate_bound: usize,
    ) -> Result<(), ContactCapacityError> {
        self.collection.try_reserve(candidate_bound)?;
        try_reserve_exact(&mut self.group_facts, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.closure_entities, collider_bound)?;
        try_reserve_exact(&mut self.closure_rows, collider_bound)?;
        try_reserve_exact(&mut self.generalized, collider_bound)?;
        try_reserve_exact(&mut self.proposed, MAX_CONTACT_FACTS_PER_GROUP)?;
        // The contract reserves accumulators at the fact bound, but they are
        // sized to the closure, so honour whichever is larger: the two bounds
        // are independent and only happen to be ordered at today's ceiling.
        try_reserve_exact(&mut self.sums, MAX_CONTACT_FACTS_PER_GROUP.max(collider_bound))?;
        try_reserve_exact(&mut self.trial, collider_bound)?;
        try_reserve_exact(&mut self.weights, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.shares, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.group_rows, MAX_CONTACT_FACTS_PER_GROUP)?;
        try_reserve_exact(&mut self.old_velocities, collider_bound)?;
        #[cfg(feature = "cartesian-recoil")]
        {
            try_reserve_exact(&mut self.motor_velocities, collider_bound)?;
            try_reserve_exact(&mut self.driver_contacts,
                              crate::combat::lifted_solver::MAX_LIFTED_SOLVER_FACTS)?;
            try_reserve_exact(&mut self.lifted_contacts,
                              crate::combat::lifted_solver::MAX_LIFTED_SOLVER_FACTS)?;
            self.lifted_solver.try_reserve().map_err(|_| ContactCapacityError::Allocation)?;
            self.exact_trajectory_work.try_reserve()
                .map_err(|_| ContactCapacityError::Allocation)?;
            try_reserve_exact(&mut self.exact_solve_owner_entry,
                              crate::combat::contact::MAX_ENTITIES)?;
            try_reserve_exact(&mut self.exact_solve_trajectory_entry,
                              crate::combat::contact::MAX_ENTITIES * 3)?;
        }
        try_reserve_exact(&mut self.suppressed, candidate_bound)?;
        try_reserve_exact(&mut self.capped_entities, collider_bound)?;
        Ok(())
    }

    /// The infallible form, for callers holding their own scratch who would
    /// have nothing useful to do with the failure. `World` uses the fallible
    /// one: its caller is a browser that has already handed a page typed-array
    /// views into linear memory, and aborting there blanks the screen.
    pub fn reserve(&mut self, collider_bound: usize, candidate_bound: usize) {
        self.try_reserve(collider_bound, candidate_bound).expect("contact scratch reservation");
    }

    /// The entities the iteration cap froze on the last solved tick, in the
    /// order the closure discovered them. World needs this to zero the arm
    /// scalar speeds and mirror `Both`, neither of which a collider row can
    /// express.
    pub fn capped_entities(&self) -> &[EntityId] { &self.capped_entities }

    /// Every retained capacity, so a test can prove a solved tick grew none of
    /// them. Capacity is not state, which is why this is not public.
    #[cfg(test)]
    pub(crate) fn capacities(&self) -> Vec<usize> {
        let mut capacities = self.collection.capacities().to_vec();
        capacities.extend([
            self.group_facts.capacity(), self.closure_entities.capacity(),
            self.closure_rows.capacity(), self.generalized.capacity(),
            self.proposed.capacity(), self.sums.capacity(), self.trial.capacity(),
            self.weights.capacity(), self.shares.capacity(), self.group_rows.capacity(),
            self.old_velocities.capacity(), self.suppressed.capacity(),
            self.capped_entities.capacity(),
        ]);
        #[cfg(feature = "cartesian-recoil")]
        {
            capacities.push(self.motor_velocities.capacity());
            capacities.push(self.driver_contacts.capacity());
            capacities.push(self.lifted_contacts.capacity());
            capacities.extend(self.lifted_solver.capacities());
            capacities.extend(self.exact_trajectory_work.capacities());
            capacities.push(self.exact_solve_owner_entry.capacity());
            capacities.push(self.exact_solve_trajectory_entry.capacity());
        }
        capacities
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ContactTimeBasis {
    RemainingTick,
    /// **Live production code, constructed only behind `cartesian-recoil`.**
    /// `ExactKinematics::time_basis` -- the whole `impl` is
    /// `#[cfg(feature = "cartesian-recoil")]` -- answers this, because an exact
    /// fact carries absolute tick time rather than a remainder to be mapped. The
    /// default build still *reads* the variant, in
    /// `exact_time_basis_bypasses_mapping_for_membership_and_suppression`, which
    /// is why this is an `allow` narrowed to the default build rather than a
    /// `cfg` on the variant: a `cfg` would delete it out from under an ungated
    /// test. Removing the allow when the feature is on is deliberate -- there
    /// the variant must be constructed, and a warning is the right answer if it
    /// stops being.
    #[cfg_attr(not(feature = "cartesian-recoil"), allow(dead_code))]
    AbsoluteTick,
}

fn candidate_global_time(basis: ContactTimeBasis, global: u32, fact: ContactFact) -> u32 {
    match basis {
        ContactTimeBasis::RemainingTick =>
            map_local_to_global(global, fact.toi.get().raw() as u32),
        ContactTimeBasis::AbsoluteTick => fact.toi.get().raw() as u32,
    }
}

trait ContactKinematics {
    fn time_basis(&self) -> ContactTimeBasis;
    fn scan(
        &mut self, colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch,
    ) -> Result<(), ResolutionError>;
    fn advance_to(&mut self, colliders: &mut [ContactCollider], global: u32, time: u32);
    fn recompute(
        &mut self, colliders: &[ContactCollider], a: usize, b: usize, time: u32,
        scratch: &mut ContactCollectionScratch,
    ) -> Result<Option<ContactFact>, ResolutionError>;
    fn finish(&mut self, colliders: &mut [ContactCollider]) -> Result<(), ResolutionError>;
    fn generalized_velocity(
        &mut self, colliders: &[ContactCollider], index: usize,
    ) -> Result<Vec3, ResolutionError> { Ok(colliders[index].velocity) }
    #[cfg(feature = "cartesian-recoil")]
    fn resolve_group<P: ContactTrialProjector>(
        &mut self, colliders: &[ContactCollider], _closure_rows: &[usize], _motor: &[[i32; 3]],
        generalized: &mut [GeneralizedCollider], drivers: &[DriverContact],
        proposed: &mut Vec<ProposedContact>, _lifted: &mut Vec<LiftedContact>,
        _solver: &mut LiftedSolverScratch, ordinal: u8,
        _time: u32, projector: &mut P, sums: &mut Vec<[i128; 3]>, trial: &mut Vec<GeneralizedCollider>,
        weights: &mut Vec<u128>, shares: &mut Vec<u64>, output: &mut Vec<ContactResolution>,
        _diagnostic: &mut ExactContactGroupDiagnostic,
    ) -> Result<(), ResolutionError> {
        proposed.clear();
        for driver in drivers {
            let a = colliders[driver.a_collider]; let b = colliders[driver.b_collider];
            proposed.push(ProposedContact { fact: driver.fact,
                a_collider: closure_index(generalized, driver.fact.key.a, driver.fact.key.a_slot)
                    .ok_or(ResolutionError::ColliderIndex)?,
                b_collider: closure_index(generalized, driver.fact.key.b, driver.fact.key.b_slot)
                    .ok_or(ResolutionError::ColliderIndex)?,
                impulse_on_a: proposed_impulse(a.mass, b.mass, a.surface, b.surface,
                    driver.fact.velocity_a, driver.fact.velocity_b, driver.fact.normal),
                channel: driver.channel });
        }
        resolve_group_into(generalized, proposed, ordinal, projector, sums, trial,
                           weights, shares, output)
    }
    fn apply_group(
        &mut self, colliders: &mut [ContactCollider], closure_rows: &[usize],
        old_velocities: &[Vec3], projected: &[GeneralizedCollider],
        _rows: &[ContactResolution], time: u32,
    ) -> Result<(), ResolutionError> {
        apply_projected_rows(colliders, closure_rows, old_velocities, projected, 65_536 - time)
    }
    fn accept_lifecycle(
        &mut self, _colliders: &[ContactCollider],
    ) -> Result<(), ResolutionError> { Ok(()) }
    fn refuses_cap(&self) -> bool { false }
    fn resolved_relative_velocity(
        &mut self, colliders: &[ContactCollider], a: usize, b: usize,
        _fact: ContactFact, _time: u32, _scratch: &mut ContactCollectionScratch,
    ) -> Result<Vec3, ResolutionError> {
        Ok(colliders[b].velocity - colliders[a].velocity)
    }
}

struct CompatibilityKinematics;

impl ContactKinematics for CompatibilityKinematics {
    fn time_basis(&self) -> ContactTimeBasis { ContactTimeBasis::RemainingTick }

    fn scan(
        &mut self, colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch,
    ) -> Result<(), ResolutionError> {
        scan_candidates_into(colliders, scratch);
        Ok(())
    }

    fn advance_to(&mut self, colliders: &mut [ContactCollider], global: u32, time: u32) {
        advance_all(colliders, time - global, 65_536 - global);
    }

    fn recompute(
        &mut self, colliders: &[ContactCollider], a: usize, b: usize, time: u32,
        _scratch: &mut ContactCollectionScratch,
    ) -> Result<Option<ContactFact>, ResolutionError> {
        Ok(contact_at_pose(&colliders[a], &colliders[b],
                           TimeOfImpact::new_clamped(Fx::from_raw(time as i32))))
    }

    fn finish(&mut self, colliders: &mut [ContactCollider]) -> Result<(), ResolutionError> {
        finish_all(colliders); Ok(())
    }
}

#[cfg(feature = "cartesian-recoil")]
struct ExactKinematics<'a> {
    trajectories: &'a mut [ExactContactTrajectory],
    owners: &'a mut Vec<ExactOwnerTrajectory>,
    floor_reactions: &'a mut Vec<FloorReaction>,
    work: &'a mut ExactTrajectoryWork,
}

#[cfg(feature = "cartesian-recoil")]
impl ContactKinematics for ExactKinematics<'_> {
    fn time_basis(&self) -> ContactTimeBasis { ContactTimeBasis::AbsoluteTick }

    fn scan(
        &mut self, colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch,
    ) -> Result<(), ResolutionError> {
        scan_exact_candidates_into(self.trajectories, self.owners, colliders, scratch)
            .map_err(exact_scan_error)
    }

    fn advance_to(&mut self, _colliders: &mut [ContactCollider], _global: u32, _time: u32) {
        // Exact facts carry absolute tick time and evaluate immutable motor
        // geometry there. Moving the rounded compatibility pose would create
        // a second trajectory before checkpoint D owns its commit.
    }

    fn recompute(
        &mut self, colliders: &[ContactCollider], a: usize, b: usize, time: u32,
        scratch: &mut ContactCollectionScratch,
    ) -> Result<Option<ContactFact>, ResolutionError> {
        exact_contact_at_pose(self.trajectories, self.owners, colliders, a, b, time, scratch)
            .map_err(exact_scan_error)
    }

    fn finish(&mut self, colliders: &mut [ContactCollider]) -> Result<(), ResolutionError> {
        // This first integration slice has no exact response commit. Keeping
        // the compatibility rows motor-only lets the existing World commit
        // finish an otherwise untouched tick without manufacturing response.
        finish_all(colliders);
        advance_exact_into(self.owners, 65_536, &mut self.work.owner_stage)
            .map_err(|_| ResolutionError::ExactScan)?;
        self.owners.clear();
        self.owners.extend_from_slice(&self.work.owner_stage);
        self.work.owner_stage.clear();
        Ok(())
    }

    fn generalized_velocity(
        &mut self, colliders: &[ContactCollider], index: usize,
    ) -> Result<Vec3, ResolutionError> {
        let row = self.trajectories.get(index).ok_or(ResolutionError::ColliderIndex)?;
        let owner = self.owners.get(row.owner_index).ok_or(ResolutionError::ColliderIndex)?;
        Ok(colliders[index].velocity
            + exact_response_velocity(row, owner).map_err(exact_scan_error)?)
    }

    fn resolve_group<P: ContactTrialProjector>(
        &mut self, _colliders: &[ContactCollider], closure_rows: &[usize], motor: &[[i32; 3]],
        generalized: &mut [GeneralizedCollider], drivers: &[DriverContact],
        proposed: &mut Vec<ProposedContact>, lifted: &mut Vec<LiftedContact>,
        solver: &mut LiftedSolverScratch, ordinal: u8,
        time: u32, _projector: &mut P, _sums: &mut Vec<[i128; 3]>, _trial: &mut Vec<GeneralizedCollider>,
        weights: &mut Vec<u128>, shares: &mut Vec<u64>, output: &mut Vec<ContactResolution>,
        diagnostic: &mut ExactContactGroupDiagnostic,
    ) -> Result<(), ResolutionError> {
        if drivers.is_empty() {
            diagnostic.reject = Some(ExactSolveGroupRejectDetail::EmptyDriverSet);
            return Err(ResolutionError::ResolutionCount);
        }
        lifted.clear();
        proposed.clear();
        for driver in drivers {
            lifted.push(LiftedContact::from_state(driver.fact, driver.a_collider,
                driver.b_collider, self.trajectories, self.owners, motor)
                .map_err(|error| { diagnostic.reject = Some(lifted_reject_detail(error));
                                   exact_solver_error(error) })?);
        }
        diagnostic.lifted_contacts = lifted.len() as u8;
        let solved = solve_lifted_group(self.trajectories, self.owners, closure_rows,
            lifted, time, motor, solver).map_err(|error| {
                diagnostic.reject = Some(lifted_reject_detail(error)); exact_solver_error(error)
            })?;
        for (at, driver) in drivers.iter().enumerate() {
            let word = solved.impulses[at].raw;
            proposed.push(ProposedContact { fact: driver.fact,
                a_collider: closure_index(generalized, driver.fact.key.a, driver.fact.key.a_slot)
                    .ok_or(ResolutionError::ColliderIndex)?,
                b_collider: closure_index(generalized, driver.fact.key.b, driver.fact.key.b_slot)
                    .ok_or(ResolutionError::ColliderIndex)?,
                impulse_on_a: Vec3::new(Fx::from_raw(word[0]), Fx::from_raw(word[1]),
                                        Fx::from_raw(word[2])), channel: driver.channel });
        }
        let dissipated = solved.loss_raw;
        allocate_shares_into(dissipated, proposed, 65_536, weights, shares)?;
        if dissipated > 0 && weights.iter().all(|&weight| weight == 0) {
            return Err(ResolutionError::EnergyNumerator);
        }
        let before_raw = closure_energy(generalized)?;
        let after_raw = before_raw.checked_sub(dissipated)
            .ok_or(ResolutionError::EnergyNumerator)?;
        let ledger = EnergyLedger { before_raw, after_raw,
                                    dissipated_raw: dissipated };
        output.clear();
        let mut previous = None;
        for (contact, &share) in proposed.iter().zip(shares.iter()) {
            if contact.a_collider >= generalized.len() || contact.b_collider >= generalized.len()
                || contact.a_collider == contact.b_collider
                || previous.is_some_and(|key| key >= contact.fact.key) {
                return Err(ResolutionError::DuplicateIdentity);
            }
            previous = Some(contact.fact.key);
            let on_a = contact.impulse_on_a;
            let channels = match contact.channel {
                Some(channel) if damages_body(contact.fact.key.kind) => channels(share, channel),
                _ => (0, 0, 0, 0),
            };
            output.push(ContactResolution { group_ordinal: ordinal, group_alpha_raw: 65_536,
                fact: contact.fact, impulse: ContactImpulse { key: contact.fact.key, on_a, on_b: -on_a },
                energy: ledger, cut_raw: channels.0, thrust_raw: channels.1,
                crush_raw: channels.2, pressure_raw: channels.3, deflected_raw: 0, severed: false });
        }
        diagnostic.output_rows = output.len() as u8;
        Ok(())
    }

    fn apply_group(
        &mut self, _colliders: &mut [ContactCollider], _closure_rows: &[usize],
        _old_velocities: &[Vec3], _projected: &[GeneralizedCollider],
        rows: &[ContactResolution], time: u32,
    ) -> Result<(), ResolutionError> {
        apply_exact_group_into(self.trajectories, self.owners, rows, time, self.work)
            .map_err(|_| ResolutionError::ExactScan)?;
        if self.floor_reactions.len() + self.work.reaction_stage.len()
                > self.floor_reactions.capacity() {
            return Err(ResolutionError::ExactScan);
        }
        self.floor_reactions.extend_from_slice(&self.work.reaction_stage);
        self.owners.clear();
        self.owners.extend_from_slice(&self.work.owner_stage);
        self.work.owner_stage.clear();
        Ok(())
    }

    fn accept_lifecycle(
        &mut self, colliders: &[ContactCollider],
    ) -> Result<(), ResolutionError> {
        if self.trajectories.len() != colliders.len() {
            return Err(ResolutionError::ColliderIndex);
        }
        if self.trajectories.iter().zip(colliders).any(|(trajectory, collider)| {
            trajectory.entity != collider.entity || trajectory.slot != collider.slot
                || matches!(trajectory.motor,
                    crate::combat::trajectory::MotorShape::Body { .. })
                    != matches!(collider.shape, ContactShape::Body { .. })
        }) {
            return Err(ResolutionError::ColliderIndex);
        }
        for (trajectory, collider) in self.trajectories.iter_mut().zip(colliders) {
            trajectory.present = collider.present;
            match (&mut trajectory.motor, collider.shape) {
                (crate::combat::trajectory::MotorShape::Body { parts, .. },
                 ContactShape::Body { parts: collider_parts, .. }) => {
                    for (part, collider_part) in parts.iter_mut().zip(collider_parts) {
                        part.present = collider_part.present;
                    }
                }
                (crate::combat::trajectory::MotorShape::Body { .. }, _)
                | (_, ContactShape::Body { .. }) => unreachable!("preflighted shape identity"),
                _ => {}
            }
        }
        Ok(())
    }

    fn refuses_cap(&self) -> bool { true }

    fn resolved_relative_velocity(
        &mut self, colliders: &[ContactCollider], a: usize, b: usize,
        _fact: ContactFact, time: u32, scratch: &mut ContactCollectionScratch,
    ) -> Result<Vec3, ResolutionError> {
        let fact = exact_contact_at_pose(self.trajectories, self.owners,
            colliders, a, b, time, scratch).map_err(exact_scan_error)?
            .ok_or(ResolutionError::ExactScan)?;
        Ok(fact.velocity_b - fact.velocity_a)
    }
}

/// Pure multi-group driver over explicit collider trajectories. World supplies
/// rows, the projector that knows how a body delta reaches its held equipment,
/// and retained scratch; the driver performs no authoritative allocation when
/// those capacities were reserved for the high-water bound.
pub fn solve_contact_tick<P: ContactTrialProjector>(
    colliders: &mut [ContactCollider],
    projector: &mut P,
    state: &mut ContactSolverState,
    resolutions: &mut Vec<ContactResolution>,
    scratch: &mut ContactTickScratch,
) -> Result<u8, ResolutionError> {
    solve_contact_tick_with(colliders, projector, state, resolutions, scratch,
                            &mut CompatibilityKinematics)
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn solve_exact_contact_tick<P: ContactTrialProjector>(
    colliders: &mut [ContactCollider], trajectories: &mut [ExactContactTrajectory],
    owners: &mut Vec<ExactOwnerTrajectory>, floor_reactions: &mut Vec<FloorReaction>,
    projector: &mut P, state: &mut ContactSolverState,
    resolutions: &mut Vec<ContactResolution>, scratch: &mut ContactTickScratch,
) -> Result<u8, ExactContactFailure> {
    scratch.exact_context(ExactContactRejectPhase::Preflight, None);
    let failed = |cause, scratch: &ContactTickScratch| {
        let (phase, key) = scratch.exact_rejection_context();
        ExactContactFailure { cause, phase, key }
    };
    const MAX_EXACT_TRAJECTORIES: usize =
        crate::combat::contact::MAX_ENTITIES * 3 + crate::rules::MAX_SHOTS;
    if trajectories.len() > MAX_EXACT_TRAJECTORIES {
        return Err(failed(ResolutionError::ExactScan, scratch));
    }
    if scratch.exact_solve_trajectory_entry.capacity() < trajectories.len()
        || scratch.exact_solve_owner_entry.capacity() < owners.len() {
        return Err(failed(ResolutionError::ExactScan, scratch));
    }
    scratch.exact_solve_trajectory_entry.clear();
    scratch.exact_solve_trajectory_entry.extend_from_slice(trajectories);
    scratch.exact_solve_owner_entry.clear();
    scratch.exact_solve_owner_entry.extend_from_slice(owners);
    floor_reactions.clear();
    let mut trajectory_work = core::mem::take(&mut scratch.exact_trajectory_work);
    let result = solve_contact_tick_with(colliders, projector, state, resolutions, scratch,
        &mut ExactKinematics { trajectories, owners, floor_reactions,
                               work: &mut trajectory_work });
    scratch.exact_trajectory_work = trajectory_work;
    if result.is_err() {
        floor_reactions.clear();
        owners.clear(); owners.extend_from_slice(&scratch.exact_solve_owner_entry);
        trajectories.copy_from_slice(&scratch.exact_solve_trajectory_entry);
    }
    result.map_err(|cause| failed(cause, scratch))
}

fn solve_contact_tick_with<P: ContactTrialProjector, K: ContactKinematics>(
    colliders: &mut [ContactCollider], projector: &mut P,
    state: &mut ContactSolverState, resolutions: &mut Vec<ContactResolution>,
    scratch: &mut ContactTickScratch, kinematics: &mut K,
) -> Result<u8, ResolutionError> {
    // Identity is the full `(EntityId, LimbSlot)` pair, and this is checked in
    // release rather than merely asserted in debug. A duplicated row makes the
    // index lookups resolve a candidate onto whichever row is found first, so
    // the impulse lands on the wrong collider while its twin sits unmoved -- and
    // since the candidate scan sorts in place, "found first" then depends on the
    // sort's handling of equal keys, which turns a silently wrong answer into a
    // silently *nondeterministic* one. Measured: 13 of 24 row permutations of a
    // three-row duplicate fixture disagreed. The in-place sort's soundness
    // argument is exactly this precondition, so the precondition cannot be
    // debug-only. `n` is at most 224 and the pair scan below is already
    // quadratic with geometry in the inner loop, so this costs nothing worth
    // measuring.
    for i in 0..colliders.len() {
        for j in i + 1..colliders.len() {
            if colliders[i].entity == colliders[j].entity && colliders[i].slot == colliders[j].slot {
                return Err(ResolutionError::DuplicateIdentity);
            }
        }
    }
    resolutions.clear();
    scratch.suppressed.clear();
    scratch.capped_entities.clear();
    let mut global = 0u32;
    let mut groups = 0u8;

    loop {
        let basis = kinematics.time_basis();
        #[cfg(feature = "cartesian-recoil")]
        scratch.exact_context(ExactContactRejectPhase::Scan, None);
        kinematics.scan(colliders, &mut scratch.collection)?;
        forget_closing_keys(basis, global, &mut scratch.suppressed,
                            scratch.collection.candidates());

        let Some(time) = earliest_group_time(
            basis, global, scratch.collection.candidates(), &scratch.suppressed)
        else {
            #[cfg(feature = "cartesian-recoil")]
            scratch.exact_context(ExactContactRejectPhase::Finish, None);
            kinematics.finish(colliders)?;
            return Ok(groups);
        };

        // Counting before the advance is what makes the overflow rule's
        // "restore the tentative pose" unnecessary rather than merely undone:
        // the pose has not left the last-safe `g` yet. Membership is mapped-time
        // equality, and the map is many-to-one, so distinct local fractions that
        // land on one global time are simultaneous -- which is what the contract
        // asks for and what a test on local equality would miss.
        let members = count_group_members(
            basis, global, time, scratch.collection.candidates(), &scratch.suppressed)?;

        #[cfg(feature = "cartesian-recoil")]
        {
            let at = groups as usize;
            if let Some(row) = scratch.exact_group_diagnostics.get_mut(at) {
            *row = ExactContactGroupDiagnostic {
                tick: scratch.exact_diagnostic_tick, group_ordinal: groups,
                selected_time_raw: time,
                scan_candidates: scratch.collection.candidates().len() as u32,
                mapped_time_members: members as u32, ..ExactContactGroupDiagnostic::default()
            };
            for candidate in scratch.collection.candidates() {
                if suppressed(basis, &candidate.fact, global, &scratch.suppressed) { continue; }
                if candidate_global_time(basis, global, candidate.fact) != time { continue; }
                let key_at = row.mapped_member_keys.iter().position(Option::is_none);
                if let Some(key_at) = key_at {
                    row.mapped_member_keys[key_at] = Some(candidate.fact.key.into());
                    row.wide_toi[key_at] = candidate.wide_toi;
                    row.compatibility_sweep[key_at] = candidate.compatibility_sweep;
                }
            }
            scratch.exact_group_diagnostics_len = at + 1;
            }
        }

        // No ordinal left, or a simultaneous set too large to resolve as one
        // system. Neither is truncation: no prefix of a group is privileged.
        if groups == MAX_CONTACT_GROUPS_PER_TICK || members > MAX_CONTACT_FACTS_PER_GROUP {
            if kinematics.refuses_cap() { return Err(ResolutionError::ExactLifecyclePending); }
            cap_at_last_safe_pose(basis, colliders, global, time, scratch, state);
            return Ok(groups);
        }

        kinematics.advance_to(colliders, global, time);

        scratch.group_facts.clear();
        for index in 0..scratch.collection.candidates().len() {
            let fact = scratch.collection.candidates()[index].fact;
            if suppressed(basis, &fact, global, &scratch.suppressed) { continue; }
            if candidate_global_time(basis, global, fact) != time { continue; }
            #[cfg(feature = "cartesian-recoil")]
            scratch.exact_context(ExactContactRejectPhase::Recompute, Some(fact.key));
            let a = collider_index(colliders, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = collider_index(colliders, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let recomputed = kinematics.recompute(
                colliders, a, b, time, &mut scratch.collection,
            )?;
            #[cfg(feature = "cartesian-recoil")]
            {
                let recomputed = recomputed.ok_or(ResolutionError::ExactScan)?;
                if recomputed.key != fact.key
                    || (recomputed.volume != fact.volume
                        && fact.key.kind != ContactKind::ProjectileBody) {
                    return Err(ResolutionError::ExactScan);
                }
                scratch.group_facts.push(recomputed);
            }
            #[cfg(not(feature = "cartesian-recoil"))]
            if let Some(recomputed) = recomputed { scratch.group_facts.push(recomputed); }
        }
        // Unstable for the same reason as the candidate scan: one member per
        // key, so the key is a strict total order and the stable sort would only
        // buy a heap allocation the driver is not allowed to make.
        scratch.group_facts.sort_unstable_by_key(|fact| fact.key);
        scratch.group_facts.dedup_by_key(|fact| fact.key);

        #[cfg(feature = "cartesian-recoil")]
        {
            let row = &mut scratch.exact_group_diagnostics[groups as usize];
            row.recomputed_facts = scratch.group_facts.len() as u8;
            for (at, fact) in scratch.group_facts.iter().take(16).enumerate() {
                row.recomputed_keys[at] = Some(fact.key.into());
            }
        }

        #[cfg(feature = "cartesian-recoil")]
        {
            let key = if scratch.group_facts.len() == 1 {
                Some(scratch.group_facts[0].key)
            } else { None };
            scratch.exact_context(ExactContactRejectPhase::Closure, key);
        }

        // Whole-entity closure. A body impulse drags every collider that body
        // holds, so that equipment's kinetic energy has to be inside the ledger
        // even when it carries no fact of its own -- otherwise the group could
        // "pay" for its own energy gain out of a bystander's clamp. Rows
        // outside the closure are neither measured nor moved.
        scratch.closure_entities.clear();
        for fact in &scratch.group_facts {
            push_unique(&mut scratch.closure_entities, fact.key.a);
            push_unique(&mut scratch.closure_entities, fact.key.b);
        }
        scratch.closure_rows.clear();
        for (index, row) in colliders.iter().enumerate() {
            if scratch.closure_entities.contains(&row.entity) { scratch.closure_rows.push(index); }
        }

        #[cfg(feature = "cartesian-recoil")]
        {
            let row = &mut scratch.exact_group_diagnostics[groups as usize];
            row.closure_entities = scratch.closure_entities.len() as u8;
            row.closure_rows = scratch.closure_rows.len() as u8;
        }

        scratch.generalized.clear();
        for &index in &scratch.closure_rows {
            let row = colliders[index];
            scratch.generalized.push(GeneralizedCollider {
                entity: row.entity, slot: row.slot,
                kind: if matches!(row.shape, ContactShape::Body { .. }) {
                    GeneralizedKind::Body
                } else if matches!(row.shape, ContactShape::Projectile { .. }) {
                    GeneralizedKind::Projectile
                } else { GeneralizedKind::Equipment },
                mass: row.mass, velocity: kinematics.generalized_velocity(colliders, index)?,
                velocity_offset: row.velocity_offset,
            });
        }

        scratch.proposed.clear();
        #[cfg(feature = "cartesian-recoil")]
        scratch.driver_contacts.clear();
        for index in 0..scratch.group_facts.len() {
            let fact = scratch.group_facts[index];
            let a = closure_index(&scratch.generalized, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = closure_index(&scratch.generalized, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let (row_a, row_b) = (colliders[scratch.closure_rows[a]], colliders[scratch.closure_rows[b]]);
            #[cfg(not(feature = "cartesian-recoil"))]
            let impulse_on_a = proposed_impulse(
                row_a.mass, row_b.mass, row_a.surface, row_b.surface,
                fact.velocity_a, fact.velocity_b, fact.normal,
            );
            let channel = if damages_body(fact.key.kind) {
                Some(weapon_body_channel(row_a, row_b))
            } else { None };
            #[cfg(not(feature = "cartesian-recoil"))]
            scratch.proposed.push(ProposedContact { fact, a_collider: a, b_collider: b, impulse_on_a, channel });
            #[cfg(feature = "cartesian-recoil")]
            scratch.driver_contacts.push(DriverContact { fact,
                a_collider: scratch.closure_rows[a], b_collider: scratch.closure_rows[b], channel });
        }

        #[cfg(feature = "cartesian-recoil")]
        { scratch.exact_group_diagnostics[groups as usize].driver_contacts =
              scratch.driver_contacts.len() as u8; }

        scratch.old_velocities.clear();
        #[cfg(feature = "cartesian-recoil")]
        scratch.motor_velocities.clear();
        #[cfg(feature = "cartesian-recoil")]
        scratch.motor_velocities.resize(colliders.len(), [0; 3]);
        for &index in &scratch.closure_rows {
            #[cfg(feature = "cartesian-recoil")]
            { let velocity = colliders[index].velocity;
              scratch.motor_velocities[index] = [velocity.x.raw(), velocity.y.raw(), velocity.z.raw()]; }
            scratch.old_velocities.push(kinematics.generalized_velocity(colliders, index)?);
        }

        #[cfg(feature = "cartesian-recoil")]
        {
        let key = if scratch.group_facts.len() == 1 {
            Some(scratch.group_facts[0].key)
        } else { None };
        scratch.exact_context(ExactContactRejectPhase::SolveGroup, key);
        kinematics.resolve_group(colliders, &scratch.closure_rows, &scratch.motor_velocities,
            &mut scratch.generalized, &scratch.driver_contacts, &mut scratch.proposed,
            &mut scratch.lifted_contacts, &mut scratch.lifted_solver, groups, time, projector,
            &mut scratch.sums, &mut scratch.trial, &mut scratch.weights, &mut scratch.shares,
            &mut scratch.group_rows, &mut scratch.exact_group_diagnostics[groups as usize])?;
        }
        #[cfg(not(feature = "cartesian-recoil"))]
        resolve_group_into(
            &mut scratch.generalized, &scratch.proposed, groups, projector,
            &mut scratch.sums, &mut scratch.trial, &mut scratch.weights, &mut scratch.shares,
            &mut scratch.group_rows,
        )?;

        // The contract's parenthesization is `delta * (65_536-t)/65_536` in
        // saturated Fx, and Fx multiplication floors. A truncate-toward-zero
        // helper agrees on every positive delta and disagrees by one raw unit
        // on negative ones, which is exactly the byte the behavioral corpus
        // pins in case 2.
        #[cfg(feature = "cartesian-recoil")]
        {
            let key = if scratch.group_facts.len() == 1 {
                Some(scratch.group_facts[0].key)
            } else { None };
            scratch.exact_context(ExactContactRejectPhase::ApplyGroup, key);
        }
        kinematics.apply_group(colliders, &scratch.closure_rows, &scratch.old_velocities,
                               &scratch.generalized, &scratch.group_rows, time)?;

        // The group is settled: hand it to the projector before the next scan
        // sees the colliders, so a severance can take an arm out of the tick it
        // happened in rather than the one after.
        #[cfg(feature = "cartesian-recoil")]
        {
            let key = if scratch.group_facts.len() == 1 {
                Some(scratch.group_facts[0].key)
            } else { None };
            scratch.exact_context(ExactContactRejectPhase::Lifecycle, key);
        }
        projector.after_group(colliders, &mut scratch.group_rows)?;

        // Eight groups of at most 512 rows fit the 4,096 ceiling exactly, so
        // this is an invariant rather than a live limit -- and it is checked
        // rather than assumed, because a silent reallocation here is precisely
        // what the browser no-growth proof would fail to see.
        if resolutions.len().saturating_add(scratch.group_rows.len()) > MAX_CONTACT_RESOLUTIONS_PER_TICK {
            return Err(ResolutionError::ResolutionCount);
        }
        resolutions.extend_from_slice(&scratch.group_rows);

        // Record against the velocities the group actually left behind, not the
        // pre-group ones the fact carries.
        for index in 0..scratch.group_facts.len() {
            let fact = scratch.group_facts[index];
            #[cfg(feature = "cartesian-recoil")]
            scratch.exact_context(ExactContactRejectPhase::Recompute, Some(fact.key));
            let a = collider_index(colliders, fact.key.a, fact.key.a_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            let b = collider_index(colliders, fact.key.b, fact.key.b_slot)
                .ok_or(ResolutionError::ColliderIndex)?;
            remember_resolved(&mut scratch.suppressed, Resolved {
                key: fact.key, global: time, normal: fact.normal,
                relative_velocity: kinematics.resolved_relative_velocity(
                    colliders, a, b, fact, time, &mut scratch.collection)?,
            });
        }
        // Finish the resolved facts before hiding anything they name. The
        // lifecycle change is nevertheless accepted before the next scan, so
        // later groups see the region or held row as absent without making the
        // group that caused the removal impossible to record.
        #[cfg(feature = "cartesian-recoil")]
        {
            let key = if scratch.group_facts.len() == 1 {
                Some(scratch.group_facts[0].key)
            } else { None };
            scratch.exact_context(ExactContactRejectPhase::Lifecycle, key);
        }
        kinematics.accept_lifecycle(colliders)?;
        global = time;
        groups += 1;
    }
}

/// The earliest global time any unsuppressed candidate maps onto.
fn earliest_group_time(
    basis: ContactTimeBasis, global: u32, candidates: &[Candidate], resolved: &[Resolved],
) -> Option<u32> {
    candidates.iter()
        .filter(|candidate| !suppressed(basis, &candidate.fact, global, resolved))
        .map(|candidate| candidate_global_time(basis, global, candidate.fact))
        .min()
}

fn count_group_members(
    basis: ContactTimeBasis, global: u32, time: u32,
    candidates: &[Candidate], resolved: &[Resolved],
) -> Result<usize, ResolutionError> {
    let mut members = 0usize;
    for candidate in candidates {
        if suppressed(basis, &candidate.fact, global, resolved) { continue; }
        if candidate_global_time(basis, global, candidate.fact) != time { continue; }
        members = members.checked_add(1).ok_or(ResolutionError::ResolutionCount)?;
    }
    Ok(members)
}

/// One key already resolved: the global time it resolved at, the normal it
/// resolved on, and the relative velocity it was left with.
#[derive(Clone, Copy)]
struct Resolved { key: ContactKey, global: u32, normal: Vec3, relative_velocity: Vec3 }

/// Zero-time suppression, remembered for the whole tick rather than for one
/// group. A pair that has come to rest against itself stays at the same point
/// and re-sweeps at local zero every group thereafter; if an unrelated group
/// could clear the memory, the pair would resolve again, burn an ordinal, and
/// drive the tick into a spurious cap.
///
/// Two conditions retire a repeat, and the second is not optional. The stored
/// normal is what makes the first survivable at a coincident point --
/// recomputing the degenerate velocity-derived normal after a bounce would flip
/// it and call a separating pair closing.
fn suppressed(
    basis: ContactTimeBasis, fact: &ContactFact, global: u32, resolved: &[Resolved],
) -> bool {
    if candidate_global_time(basis, global, *fact) != global { return false; }
    let Ok(index) = resolved.binary_search_by_key(&fact.key, |row| row.key) else { return false };
    let relative = fact.velocity_b - fact.velocity_a;
    // Separating, or sliding tangentially: the ordinary case.
    if relative.dot(resolved[index].normal) >= Fx::ZERO { return true; }
    // Still closing, but genuinely nothing has changed since the group that
    // resolved it, so resolving it again must produce the identical result.
    // That case is reachable and common: an impulse is `closing/inv_sum` in
    // truncating fixed point, so any residual closing speed small enough to
    // truncate to zero leaves the pair closing and unresolvable. Left alone it
    // re-resolves once per remaining ordinal, all of them no-ops, and ends in a
    // `cap_hits` increment -- hashed state, invented out of a rounding floor.
    //
    // Both halves of "nothing has changed" are load-bearing, and the time half
    // was learned the hard way. Testing the velocity alone suppressed contacts
    // that had every right to resolve: a group elsewhere advances global time,
    // which slides both of these colliders along their trajectories, and the
    // recomputed normal can rotate under an unchanged relative velocity. A
    // randomised sweep put that at 3,376 wrongly suppressed closing contacts,
    // one of them closing at 3.95 units per tick. Comparing the normal instead
    // does not work -- at a coincident point it is derived from that same
    // velocity, so it agrees precisely when the velocity does. Only an
    // unmoved pose makes "identical state" true, and time is what moves it.
    global == resolved[index].global && relative == resolved[index].relative_velocity
}

/// A positive local time means the pair separated and is closing again, so the
/// key leaves the set and may resolve normally.
fn forget_closing_keys(
    basis: ContactTimeBasis, global: u32,
    resolved: &mut Vec<Resolved>, candidates: &[Candidate],
) {
    for candidate in candidates {
        if candidate_global_time(basis, global, candidate.fact) == global { continue; }
        if let Ok(index) = resolved.binary_search_by_key(&candidate.fact.key, |row| row.key) {
            resolved.remove(index);
        }
    }
}

fn remember_resolved(resolved: &mut Vec<Resolved>, row: Resolved) {
    match resolved.binary_search_by_key(&row.key, |entry| entry.key) {
        Ok(index) => resolved[index] = row,
        Err(index) => resolved.insert(index, row),
    }
}

fn push_unique(entities: &mut Vec<EntityId>, entity: EntityId) {
    if !entities.contains(&entity) { entities.push(entity); }
}

fn collider_index(rows: &[ContactCollider], entity: EntityId, slot: u8) -> Option<usize> {
    rows.iter().position(|row| row.entity == entity &&
        if slot == BODY_SLOT { matches!(row.shape, ContactShape::Body { .. }) } else { row.slot == slot })
}

fn closure_index(rows: &[GeneralizedCollider], entity: EntityId, slot: u8) -> Option<usize> {
    rows.iter().position(|row| row.entity == entity &&
        if slot == BODY_SLOT { row.kind == GeneralizedKind::Body } else { row.slot == slot })
}

fn weapon_body_channel(weapon: ContactCollider, body: ContactCollider) -> WeaponBodyChannel {
    let (axis, zero_length) = match weapon.shape {
        ContactShape::Projectile { .. } => {
            let axis = weapon.velocity.normalized_or_zero();
            (axis, axis == Vec3::ZERO)
        }
        ContactShape::Segment { previous_hilt, previous_tip, .. } => {
            let delta = previous_tip - previous_hilt;
            (delta.normalized_or_zero(), delta == Vec3::ZERO)
        }
        _ => (Vec3::ZERO, true),
    };
    WeaponBodyChannel { weapon_axis: axis, weapon_relative_velocity: weapon.velocity - body.velocity,
                        edge_factor: weapon.surface.edge_factor, point_factor: weapon.surface.point_factor,
                        crush_factor: weapon.surface.material.crush_factor(),
                        zero_length }
}

fn freeze_sweep(mut row: ContactCollider) -> ContactCollider {
    row.shape = match row.shape {
        ContactShape::Projectile { previous, radius, shielded_body, .. } =>
            ContactShape::Projectile {
                previous, requested: previous, radius, shielded_body,
            },
        ContactShape::Segment { previous_hilt, previous_tip, radius, .. } => ContactShape::Segment {
            previous_hilt, previous_tip, requested_hilt: previous_hilt, requested_tip: previous_tip, radius,
        },
        ContactShape::Shield { previous, .. } => ContactShape::Shield { previous, requested: previous },
        ContactShape::Body { previous_origin, parts, .. } => ContactShape::Body {
            previous_origin, requested_origin: previous_origin,
            parts: parts.map(|part| RegionSweep {
                requested_lower: part.previous_lower, requested_upper: part.previous_upper, ..part
            }),
        },
    };
    row
}

fn advance_all(rows: &mut [ContactCollider], numerator: u32, denominator: u32) {
    for row in rows { advance_shape(&mut row.shape, numerator, denominator); }
}

fn advance_shape(shape: &mut ContactShape, numerator: u32, denominator: u32) {
    match shape {
        ContactShape::Projectile { previous, requested, .. } => {
            *previous = interpolate_raw(*previous, *requested, numerator, denominator);
        }
        ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, .. } => {
            *previous_hilt = interpolate_raw(*previous_hilt, *requested_hilt, numerator, denominator);
            *previous_tip = interpolate_raw(*previous_tip, *requested_tip, numerator, denominator);
        }
        ContactShape::Shield { previous, requested } => {
            for i in 0..4 { previous[i] = interpolate_raw(previous[i], requested[i], numerator, denominator); }
        }
        ContactShape::Body { previous_origin, requested_origin, parts } => {
            *previous_origin = interpolate_raw(*previous_origin, *requested_origin, numerator, denominator);
            for part in parts.iter_mut() {
                part.previous_lower = interpolate_raw(part.previous_lower, part.requested_lower, numerator, denominator);
                part.previous_upper = interpolate_raw(part.previous_upper, part.requested_upper, numerator, denominator);
            }
        }
    }
}

fn interpolate_raw(a: Vec3, b: Vec3, numerator: u32, denominator: u32) -> Vec3 {
    // A zero denominator means the tick is fully consumed, so there is no
    // remaining time to advance through and the answer is the current pose. It
    // can only arrive alongside a zero numerator, and returning the requested
    // end instead would jump a collider forward on a step that asked for
    // nothing -- inert today only because the two coincide at tick end.
    if denominator == 0 { return a; }
    let component = |a: Fx, b: Fx| {
        let delta = b.raw() as i128 - a.raw() as i128;
        Fx::from_raw((a.raw() as i128 + delta * numerator as i128 / denominator as i128) as i32)
    };
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

fn translate_requested(row: &mut ContactCollider, delta: Vec3) {
    match &mut row.shape {
        ContactShape::Projectile { requested, .. } => *requested += delta,
        ContactShape::Segment { requested_hilt, requested_tip, .. } => { *requested_hilt += delta; *requested_tip += delta; }
        ContactShape::Shield { requested, .. } => for point in requested { *point += delta; },
        ContactShape::Body { requested_origin, parts, .. } => {
            *requested_origin += delta;
            for part in parts.iter_mut() { part.requested_lower += delta; part.requested_upper += delta; }
        }
    }
}

fn finish_all(rows: &mut [ContactCollider]) {
    for row in rows { advance_shape(&mut row.shape, 1, 1); }
}

/// Stop the contact that has no ordinal left -- or whose simultaneous set is
/// too large to resolve as one system -- and let the rest of the tick finish.
///
/// Seeding is the earliest remaining group only. A contact scheduled for later
/// in the tick has not happened yet and has no reason to be frozen by this one;
/// seeding from every surviving fact would freeze bystanders and make the
/// transitive step below vacuous, since every fact would already have
/// contributed both of its entities.
fn cap_at_last_safe_pose(
    basis: ContactTimeBasis, colliders: &mut [ContactCollider], global: u32, time: u32,
    scratch: &mut ContactTickScratch, state: &mut ContactSolverState,
) {
    scratch.capped_entities.clear();
    for candidate in scratch.collection.candidates() {
        if suppressed(basis, &candidate.fact, global, &scratch.suppressed) { continue; }
        if candidate_global_time(basis, global, candidate.fact) != time { continue; }
        push_unique(&mut scratch.capped_entities, candidate.fact.key.a);
        push_unique(&mut scratch.capped_entities, candidate.fact.key.b);
    }
    // Transitive by whole owning entity: a remaining fact that touches anything
    // already frozen drags its other entity in too, or that entity would sweep
    // through the thing its opponent just stopped against.
    loop {
        let before = scratch.capped_entities.len();
        for candidate in scratch.collection.candidates() {
            if suppressed(basis, &candidate.fact, global, &scratch.suppressed) { continue; }
            let key = candidate.fact.key;
            let (a, b) = (scratch.capped_entities.contains(&key.a),
                          scratch.capped_entities.contains(&key.b));
            if a && !b { scratch.capped_entities.push(key.b); }
            else if b && !a { scratch.capped_entities.push(key.a); }
        }
        if scratch.capped_entities.len() == before { break; }
    }
    for row in colliders.iter_mut() {
        if scratch.capped_entities.contains(&row.entity) {
            row.velocity = Vec3::ZERO;
            // The sample point's share of a velocity that no longer exists.
            // Left behind it would say this row's hand is moving backwards at
            // the blade's swing rate, which is the one reading of "stopped"
            // nobody meant.
            row.velocity_offset = Vec3::ZERO;
            row.shape = freeze_sweep(*row).shape;
        } else {
            advance_shape(&mut row.shape, 1, 1);
        }
    }
    state.cap_hits = state.cap_hits.saturating_add(1);
}

/// The `ARPG-CONTACT-V1` portable serialization corpus, written out for the one
/// test that pins its byte order.
///
/// **Gated rather than deleted, and gated rather than kept shipping.** It has no
/// consumer: no wasm export answers these bytes, no golden registry row names
/// them, and `CONTACT_BEHAVIOR_DIGEST` is [`contact_behavior_corpus`]'s
/// `ARPG-CONTACT-BEHAVIOR-V2` stream, which is a different grammar over a
/// different fixture and is what `tools/wasm_check.js` rebuilds. What this does
/// have is a *documented* grammar -- "Portable serialization corpus" in
/// `docs/reference/contact-solver.md`, down to the 591-byte length and the
/// `0x1adfa9e01e36edf9` digest -- and a test that constructs every expected byte
/// independently before comparing. Deleting the writer would delete the only
/// thing that can fail when that section drifts; shipping it put a serializer
/// nobody calls into every artifact.
#[cfg(test)]
pub fn serialize_contact_corpus(ticks: &[(u32, &[ContactResolution], u32)]) -> Vec<u8> {
    let mut bytes = b"ARPG-CONTACT-V1".to_vec();
    for &(tick, rows, cap_hits) in ticks {
        put_u32(&mut bytes, tick);
        put_u32(&mut bytes, rows.len() as u32);
        put_u32(&mut bytes, if rows.is_empty() { 0 } else { 1 });
        put_u32(&mut bytes, rows.len() as u32);
        put_u32(&mut bytes, if rows.is_empty() { 0 } else { 1 });
        for row in rows { write_fact(&mut bytes, row.fact); }
        for row in rows { write_impulse(&mut bytes, row.impulse); }
        if let Some(row) = rows.first() {
            put_u64(&mut bytes, row.energy.before_raw);
            put_u64(&mut bytes, row.energy.after_raw);
            put_u64(&mut bytes, row.energy.dissipated_raw);
        }
        put_u32(&mut bytes, cap_hits);
    }
    bytes
}

/// The portable behavioral proof is generated through the same collector,
/// grouping driver, and resolver used by World integration.
pub fn contact_behavior_corpus() -> Result<Vec<u8>, ResolutionError> {
    let mut bytes = b"ARPG-CONTACT-BEHAVIOR-V2".to_vec();
    for case_id in 0..=6u32 {
        let mut colliders = behavior_case(case_id);
        // One collider per label here, so the label count is the allocated-slot
        // high water the documented bounds are written against.
        let high_water = colliders.len();
        let pairs = if high_water < 2 { 0 } else { high_water * (high_water - 1) / 2 };
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::with_capacity(MAX_CONTACT_RESOLUTIONS_PER_TICK);
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(high_water * 3, pairs * 16);
        let groups = solve_contact_tick(&mut colliders, &mut IndependentPointProjector,
                                        &mut state, &mut resolutions, &mut scratch)?;
        put_u32(&mut bytes, case_id);
        put_u32(&mut bytes, colliders.len() as u32);
        put_u32(&mut bytes, resolutions.len() as u32);
        put_u32(&mut bytes, groups as u32);
        put_u32(&mut bytes, state.cap_hits);
        for row in &resolutions {
            put_u32(&mut bytes, row.group_ordinal as u32);
            put_u32(&mut bytes, row.group_alpha_raw);
            write_fact(&mut bytes, row.fact);
            write_impulse(&mut bytes, row.impulse);
            put_u64(&mut bytes, row.energy.before_raw);
            put_u64(&mut bytes, row.energy.after_raw);
            put_u64(&mut bytes, row.energy.dissipated_raw);
            put_u64(&mut bytes, row.cut_raw);
            put_u64(&mut bytes, row.thrust_raw);
            put_u64(&mut bytes, row.pressure_raw);
            put_u64(&mut bytes, row.deflected_raw);
        }
        for row in &colliders {
            // A segment reports its tip. Every case but the sword is built from
            // zero-length rows where that is also the hilt, so this is one rule
            // rather than a case number smuggled into the serializer.
            let x = match row.shape {
                ContactShape::Projectile { previous, .. } => previous.x,
                ContactShape::Segment { previous_tip, .. } => previous_tip.x,
                ContactShape::Body { previous_origin, .. } => previous_origin.x,
                ContactShape::Shield { previous, .. } => previous[0].x,
            };
            put_u32(&mut bytes, x.raw() as u32);
            put_u32(&mut bytes, row.velocity.x.raw() as u32);
        }
    }
    Ok(bytes)
}

fn behavior_case(case_id: u32) -> Vec<ContactCollider> {
    use crate::combat::spec::Material;
    // Restitution is the only surface coefficient the case table varies.
    let restitution = if case_id == 1 || case_id == 6 { Fx::ZERO } else { Fx::ONE };
    let surface = SurfaceSpec { restitution, friction: Fx::ZERO,
        edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel };
    let point = |label: u32, faction: Faction, x: i32, velocity: i32| ContactCollider {
        entity: EntityId::new(label, 0), faction, slot: 1, mass: Fx::ONE, surface,
        velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
        // No anatomy behind these rows and therefore no hand: the corpus drives
        // the pure `IndependentPointProjector`, which maps nothing through a
        // joint, so every row here is sampled where it is carried.
        velocity_offset: Vec3::ZERO,
        present: true,
        shape: ContactShape::Segment {
            previous_hilt: Vec3::new(Fx::from_raw(x), Fx::ZERO, Fx::ZERO),
            previous_tip: Vec3::new(Fx::from_raw(x), Fx::ZERO, Fx::ZERO),
            requested_hilt: Vec3::new(Fx::from_raw(x.saturating_add(velocity)), Fx::ZERO, Fx::ZERO),
            requested_tip: Vec3::new(Fx::from_raw(x.saturating_add(velocity)), Fx::ZERO, Fx::ZERO),
            radius: Fx::ZERO,
        },
    };
    match case_id {
        0 => Vec::new(),
        1 | 2 => vec![
            point(0, Faction::Heroes, 0, 65_536),
            point(1, Faction::Monsters, 16_384, 0),
            point(2, Faction::Monsters, 16_384, 0),
        ],
        3 => vec![
            point(0, Faction::Heroes, 0, 65_536),
            point(1, Faction::Monsters, 16_384, 0),
            point(2, Faction::Heroes, 32_768, 0),
        ],
        4 => vec![
            point(0, Faction::Heroes, 0, 16_384),
            point(1, Faction::Monsters, 0, -16_384),
        ],
        5 => (0..10).map(|label| point(
            label, if label % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
            label as i32 * 4_096, if label == 0 { 65_536 } else { 0 },
        )).collect(),
        6 => {
            let mut weapon = point(0, Faction::Heroes, 0, 65_536);
            weapon.shape = ContactShape::Segment {
                previous_hilt: Vec3::ZERO,
                previous_tip: Vec3::new(Fx::HALF, Fx::ZERO, Fx::ZERO),
                requested_hilt: Vec3::X,
                requested_tip: Vec3::new(Fx::from_ratio(3, 2), Fx::ZERO, Fx::ZERO),
                radius: Fx::ZERO,
            };
            // Five coincident zero-radius points, so the body is geometrically
            // the single point v2-14's row was and the whole regional apparatus
            // shows up in exactly one byte: the tie-break falls through time
            // and medial distance to `BodyPart` order and answers Head.
            let body_point = Vec3::X;
            let part = RegionSweep {
                previous_lower: body_point, previous_upper: body_point,
                requested_lower: body_point, requested_upper: body_point,
                radius: Fx::ZERO, present: true,
            };
            let body = ContactCollider { entity: EntityId::new(1, 0), faction: Faction::Monsters,
                slot: BODY_SLOT, mass: Fx::ONE, surface, velocity: Vec3::ZERO,
                velocity_offset: Vec3::ZERO, present: true,
                shape: ContactShape::Body { previous_origin: body_point, requested_origin: body_point,
                    parts: [part; BODY_VOLUME_COUNT] } };
            vec![weapon, body]
        }
        _ => unreachable!(),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::combat::contact::{
        scan_exact_candidates_into, zero_response_compatibility, BODY_SLOT, ContactKey,
    };
    #[cfg(feature = "cartesian-recoil")]
    use crate::combat::contact::{exact_contact_at_pose, ExactScanReject,
        ExactWideComparisonDiagnostic, ExactWideToiDiagnostic};
    use crate::combat::spec::Material;
    use crate::EntityId;
    use fx::{Angle, Hash64, TimeOfImpact};

    fn surface(restitution: Fx) -> SurfaceSpec {
        SurfaceSpec { restitution, friction: Fx::ZERO, edge_factor: Fx::ONE,
                      point_factor: Fx::ONE, material: Material::Steel }
    }

    fn state(index: u32, velocity: Vec3) -> GeneralizedCollider {
        GeneralizedCollider { entity: EntityId::new(index, 0), slot: 1,
            kind: GeneralizedKind::Equipment, mass: Fx::ONE, velocity,
            velocity_offset: Vec3::ZERO }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn energy_body(index: u32, owner_index: usize) -> ExactContactTrajectory {
        use crate::combat::trajectory::{ExactMotorBounds, ExactMotorPoint, MotorShape};
        let point = ExactMotorPoint { at_tick_start_raw: [0; 3], tick_delta_raw: [0; 3] };
        let bound = ExactMotorBounds { lower: point, upper: point, radius_raw: 0, present: false };
        ExactContactTrajectory { entity: EntityId::new(index, 0), faction: Faction::Heroes,
            slot: BODY_SLOT, kind: GeneralizedKind::Body, mass_raw: 65_536,
            surface: surface(Fx::ZERO), motor: MotorShape::Body {
                origin: point, parts: [bound; BODY_VOLUME_COUNT],
            }, owner_index, held_index: None, equipment_spec: None, present: true }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn energy_owner(index: u32, velocity_raw: i32) -> ExactOwnerTrajectory {
        use crate::combat::trajectory::{ExactAffine3, ExactMomentum, ExactPosition};
        ExactOwnerTrajectory { entity: EntityId::new(index, 0), projectile: false,
            body_mass_raw: 65_536,
            common_scale: 65_536, common_response: ExactAffine3 { mass_raw: 65_536,
                at_group: [ExactPosition::default(); 3], momentum: [ExactMomentum {
                    velocity_raw, remainder: 0,
                }, ExactMomentum::default(), ExactMomentum::default()], group_time_raw: 0 },
            held_response: [None; 2] }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_physical_energy_floors_the_mixed_sign_total_once() {
        let rows = [energy_body(0, 0), energy_body(1, 1), energy_body(2, 2)];
        let mut before = [energy_owner(0, 65_536), energy_owner(1, 65_536),
                          energy_owner(2, 65_536)];
        let mut after = before;
        // Owners zero and one each lose just over 3/4 of one public raw
        // energy unit, while owner two gains just over 1/4. The exact total is
        // just below -1.25: flooring endpoints or owner deltas independently
        // reports zero loss, while the required one final floor reports one.
        before[0].common_response.momentum[0].remainder = 49_152;
        before[1].common_response.momentum[0].remainder = 49_152;
        after[2].common_response.momentum[0].remainder = 16_384;
        let delta = exact_physical_energy_delta(&rows, &[0, 1, 2], &before,
                                                &after,
                                                &[[0; 3]; 3]).unwrap();
        assert_eq!(delta.signed.as_i128_pair(), Some((-2_621_457, 2_097_152)));
        assert_eq!(delta.loss_raw, 1);
        let independently_floored = rows.iter().enumerate().map(|(at, row)| {
            let old = exact_physical_row_energy(row, &before[at], [0; 3])
                .unwrap().trunc_i128().unwrap();
            let new = exact_physical_row_energy(row, &after[at], [0; 3])
                .unwrap().trunc_i128().unwrap();
            new - old
        }).sum::<i128>();
        assert_eq!(independently_floored, 0,
                   "the endpoint-flooring implementation this fixture rejects must disagree");
    }

    #[cfg(feature = "cartesian-recoil")]
    fn stream_envelope_terms(count: usize, denominator_bits: u32)
        -> Result<WideRational4096, ResolutionError>
    {
        let ceiling = 1i128.checked_shl(denominator_bits)
            .ok_or(ResolutionError::ExactEnergyEnvelope)?;
        let mut total = WideRational4096::zero();
        for at in 0..count {
            let denominator = ceiling.checked_sub((at as i128) * 2 + 1)
                .ok_or(ResolutionError::ExactEnergyEnvelope)?;
            total = exact_energy_add(total, WideRational4096::new(1, denominator)
                .ok_or(ResolutionError::ExactEnergyEnvelope)?)?;
        }
        Ok(total)
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn forty_two_worst_case_terms_fit_and_the_forty_third_refuses_by_name() {
        assert!(stream_envelope_terms(42, 96).is_ok());
        assert_eq!(stream_envelope_terms(43, 96), Err(ResolutionError::ExactEnergyEnvelope));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn sixty_four_smaller_owner_terms_remain_inside_the_same_envelope() {
        assert!(stream_envelope_terms(64, 32).is_ok());
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn sixty_four_alternating_shipped_denominator_families_pay_for_each_factor_once() {
        // The browser high-water corpus alternates Fighter and Brute owners.
        // Their rows are independent but their construction scales repeat;
        // multiplying the same denominator in once per owner rejects a result
        // whose reduced denominator has only these two factors.
        let fighter = (1i128 << 92) - 3;
        let brute = (1i128 << 69) - 9;
        let mut total = WideRational4096::zero();
        for at in 0..64 {
            let denominator = if at % 2 == 0 { fighter } else { brute };
            total = exact_energy_add(total, WideRational4096::new(1, denominator).unwrap())
                .unwrap();
        }
        assert!(total.trunc_i128().is_some());
    }

    struct RejectAfterGroup;

    impl ContactTrialProjector for RejectAfterGroup {
        fn project(
            &mut self, before: &[GeneralizedCollider], sums: &[[i128; 3]], alpha_raw: u32,
            out: &mut Vec<GeneralizedCollider>,
        ) -> Result<(), ResolutionError> {
            IndependentPointProjector.project(before, sums, alpha_raw, out)
        }

        fn after_group(
            &mut self, _colliders: &mut [ContactCollider], _rows: &mut [ContactResolution],
        ) -> Result<(), ResolutionError> { Err(ResolutionError::Projector) }
    }

    #[cfg(feature = "cartesian-recoil")]
    struct RejectProjection;

    #[cfg(feature = "cartesian-recoil")]
    impl ContactTrialProjector for RejectProjection {
        fn project(&mut self, _before: &[GeneralizedCollider], _sums: &[[i128; 3]],
                   _alpha_raw: u32, _out: &mut Vec<GeneralizedCollider>)
            -> Result<(), ResolutionError> { Err(ResolutionError::Projector) }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn empty_recomputed_group_is_named_empty_driver_set_not_a_count_envelope() {
        let mut trajectories = Vec::new();
        let mut owners = Vec::new();
        let mut reactions = Vec::new();
        let mut work = ExactTrajectoryWork::default();
        work.try_reserve().unwrap();
        let mut kinematics = ExactKinematics { trajectories: &mut trajectories,
            owners: &mut owners, floor_reactions: &mut reactions, work: &mut work };
        let mut generalized = Vec::new();
        let mut proposed = Vec::new();
        let mut lifted = Vec::new();
        let mut solver = LiftedSolverScratch::default();
        let mut sums = Vec::new();
        let mut trial = Vec::new();
        let mut weights = Vec::new();
        let mut shares = Vec::new();
        let mut output = Vec::new();
        let mut diagnostic = ExactContactGroupDiagnostic::default();
        let result = kinematics.resolve_group(&[], &[], &[], &mut generalized, &[],
            &mut proposed, &mut lifted, &mut solver, 0, 0,
            &mut IndependentPointProjector, &mut sums, &mut trial, &mut weights,
            &mut shares, &mut output, &mut diagnostic);
        assert_eq!(result, Err(ResolutionError::ResolutionCount));
        assert_eq!(diagnostic.reject, Some(ExactSolveGroupRejectDetail::EmptyDriverSet));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_reject_variants_survive_the_public_diagnostic_mapping() {
        let cases = [
            (LiftedSolverReject::Identity, ExactSolveGroupRejectDetail::LiftedIdentity),
            (LiftedSolverReject::FactEnvelope, ExactSolveGroupRejectDetail::LiftedFactEnvelope),
            (LiftedSolverReject::RowEnvelope, ExactSolveGroupRejectDetail::LiftedRowEnvelope),
            (LiftedSolverReject::CandidateEnvelope, ExactSolveGroupRejectDetail::LiftedCandidateEnvelope),
            (LiftedSolverReject::ImpulseEnvelope, ExactSolveGroupRejectDetail::LiftedImpulseEnvelope),
            (LiftedSolverReject::ArithmeticEnvelope, ExactSolveGroupRejectDetail::LiftedArithmeticEnvelope),
            (LiftedSolverReject::NoRestitutionCandidate,
             ExactSolveGroupRejectDetail::LiftedNoRestitutionCandidate),
            (LiftedSolverReject::NoDissipativeCandidate,
             ExactSolveGroupRejectDetail::LiftedNoDissipativeCandidate),
        ];
        for (private, public) in cases { assert_eq!(lifted_reject_detail(private), public); }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn group_provenance_counts_the_production_rows_at_each_boundary() {
        let mut rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        scratch.begin_exact_diagnostics(37);
        solve_exact_contact_tick(&mut rows, &mut exact.trajectories, &mut exact.owners,
            &mut reactions, &mut IndependentPointProjector, &mut state, &mut resolutions,
            &mut scratch).unwrap();
        let diagnostic = scratch.exact_group_diagnostics();
        assert!(!diagnostic.is_empty());
        for (ordinal, row) in diagnostic.iter().enumerate() {
            assert_eq!((row.tick, row.group_ordinal), (37, ordinal as u8));
            assert!(row.scan_candidates >= row.mapped_time_members);
            assert_eq!(row.mapped_member_keys.iter().flatten().count() as u32,
                       row.mapped_time_members.min(16));
            assert_eq!(row.wide_toi.iter().flatten().count(),
                       row.mapped_member_keys.iter().flatten().count());
            assert!(row.compatibility_sweep.iter().flatten().count()
                    <= row.mapped_member_keys.iter().flatten().count(),
                    "optional compatibility evidence outnumbered exact members");
            assert_eq!(row.recomputed_keys.iter().flatten().count(), row.recomputed_facts as usize);
            assert!(row.closure_rows >= row.closure_entities);
            assert_eq!(row.driver_contacts, row.lifted_contacts);
            assert_eq!(row.output_rows, resolutions.iter()
                .filter(|output| output.group_ordinal == row.group_ordinal).count() as u8);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn group_provenance_is_fixed_bounded_unhashed_and_cleared_each_tick() {
        let mut scratch = ContactTickScratch::default();
        assert_eq!(scratch.exact_group_diagnostics.len(), MAX_CONTACT_GROUPS_PER_TICK as usize);
        let retained = scratch.exact_group_diagnostics.as_ptr();
        scratch.exact_group_diagnostics_len = 1;
        scratch.exact_group_diagnostics[0].tick = 11;
        scratch.begin_exact_diagnostics(12);
        assert!(scratch.exact_group_diagnostics().is_empty());
        assert_eq!(scratch.exact_group_diagnostics.as_ptr(), retained);
        assert_eq!(scratch.exact_diagnostic_tick, 12);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn rejected_group_provenance_survives_whole_tick_rollback() {
        let mut rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        scratch.begin_exact_diagnostics(19);
        let failure = solve_exact_contact_tick(&mut rows, &mut exact.trajectories,
            &mut exact.owners, &mut reactions, &mut RejectAfterGroup, &mut state,
            &mut resolutions, &mut scratch).unwrap_err();
        assert_eq!(failure.phase, ExactContactRejectPhase::Lifecycle);
        let evidence = scratch.exact_group_diagnostics();
        assert_eq!(evidence.len(), 1);
        assert_eq!(evidence[0].tick, 19);
        assert!(evidence[0].driver_contacts > 0);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_feature_resolution_no_longer_calls_the_proposal_alpha_ray() {
        let mut exact_rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&exact_rows).unwrap();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(exact_rows.len() * 3, 64);
        solve_exact_contact_tick(&mut exact_rows, &mut exact.trajectories, &mut exact.owners,
            &mut reactions, &mut RejectProjection, &mut state, &mut resolutions, &mut scratch)
            .expect("the lifted route must not ask the compatibility projector");
        assert!(!resolutions.is_empty());

        let mut compatible = behavior_case(4);
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(compatible.len() * 3, 64);
        assert_eq!(solve_contact_tick(&mut compatible, &mut RejectProjection, &mut state,
            &mut resolutions, &mut scratch), Err(ResolutionError::Projector));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn a_solved_group_grows_no_retained_scratch() {
        let mut rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        let before = scratch.capacities();
        solve_exact_contact_tick(&mut rows, &mut exact.trajectories, &mut exact.owners,
            &mut reactions, &mut IndependentPointProjector, &mut state, &mut resolutions,
            &mut scratch).unwrap();
        assert_eq!(scratch.capacities(), before);
    }

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn zero_response_exact_scan_is_byte_equal_to_every_behavior_case() {
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut legacy = ContactCollectionScratch::default();
            let mut compatible = ContactCollectionScratch::default();
            // Smart94's direct certification prototype consumes the retained
            // wide buffers even when the production proven-zero dispatcher
            // legitimately stays on compatibility geometry. Keep the direct
            // oracle honest about that caller-owned precondition.
            compatible.try_reserve(64).unwrap();
            scan_candidates_into(&rows, &mut legacy);
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut compatible).unwrap();
            let serialize = |scratch: &ContactCollectionScratch| {
                let mut bytes = Vec::new();
                put_u32(&mut bytes, scratch.candidates().len() as u32);
                for candidate in scratch.candidates() { write_fact(&mut bytes, candidate.fact); }
                bytes
            };
            assert_eq!(serialize(&compatible), serialize(&legacy), "behavior case {case_id}");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_domain_contains_every_supported_hostile_pair_not_only_compatibility_members() {
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut domain = ContactCollectionScratch::default();
            scan_candidates_into(&rows, &mut domain);
            let domain_keys: Vec<_> = domain.candidates().iter().map(|row| row.fact.key).collect();
            let mut certified = ContactCollectionScratch::default();
            certified.try_reserve(64).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut certified).unwrap();
            let certified_keys: Vec<_> = certified.candidates().iter()
                .map(|row| row.fact.key).collect();
            assert!(domain_keys.iter().all(|key| certified_keys.contains(key)),
                    "behavior case {case_id} lost a supported compatibility key");
            for at in 0..certified.candidates().len() {
                let candidate = certified.candidates()[at];
                let evidence = candidate.wide_toi.expect("exact time lacked parallel evidence");
                assert_eq!(evidence.accepted_root_raw,
                           candidate.fact.toi.get().raw() as u32);
                let a = collider_index(&rows, candidate.fact.key.a, candidate.fact.key.a_slot)
                    .unwrap();
                let b = collider_index(&rows, candidate.fact.key.b, candidate.fact.key.b_slot)
                    .unwrap();
                let canonical = exact_contact_at_pose(&exact.trajectories, &exact.owners,
                    &rows, a, b, evidence.accepted_root_raw, &mut certified).unwrap().unwrap();
                assert_eq!(candidate.fact, canonical,
                           "behavior case {case_id} published a sweep witness");
            }
        }
    }

    #[test]
    fn explicit_compatibility_input_still_returns_the_legacy_candidate_bytes() {
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let mut expected = ContactCollectionScratch::default();
            let mut actual = ContactCollectionScratch::default();
            scan_candidates_into(&rows, &mut expected);
            scan_candidates_into(&rows, &mut actual);
            let serialize = |scratch: &ContactCollectionScratch| {
                let mut bytes = Vec::new();
                put_u32(&mut bytes, scratch.candidates().len() as u32);
                for candidate in scratch.candidates() { write_fact(&mut bytes, candidate.fact); }
                bytes
            };
            assert_eq!(serialize(&actual), serialize(&expected), "behavior case {case_id}");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct AuditCertifiedSelection {
        time_raw: u32, key: ContactKey, region: u8,
        medial_order_only: u32,
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct AuditCertifiedProvenance {
        key: ContactKey, time_raw: u32, wide_toi: ExactWideToiDiagnostic,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn audit_selection_and_provenance(
        scratch: &ContactCollectionScratch,
    ) -> Result<(Vec<AuditCertifiedSelection>, Vec<AuditCertifiedProvenance>), ExactScanReject> {
        if scratch.candidate_capacity() < 64 { return Err(ExactScanReject::CompatibilityIdentity); }
        let mut selections = Vec::new();
        let mut provenance = Vec::new();
        for candidate in scratch.candidates() {
            let time_raw = candidate.fact.toi.get().raw() as u32;
            selections.push(AuditCertifiedSelection { time_raw, key: candidate.fact.key,
                region: candidate.fact.volume, medial_order_only: 0 });
            provenance.push(AuditCertifiedProvenance { key: candidate.fact.key, time_raw,
                wide_toi: candidate.wide_toi.ok_or(ExactScanReject::CompatibilityIdentity)? });
        }
        selections.sort_unstable_by_key(|row| (row.time_raw, row.key));
        provenance.sort_unstable_by_key(|row| (row.time_raw, row.key));
        if selections.len() != provenance.len() || selections.iter().zip(&provenance)
            .any(|(selection, evidence)| (selection.key, selection.time_raw)
                != (evidence.key, evidence.time_raw)) {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        Ok((selections, provenance))
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn every_zero_response_behavior_case_has_a_complete_exact_grammar_inventory() {
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut scan = ContactCollectionScratch::default();
            scan.try_reserve(64).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut scan).unwrap();
            let (selection, evidence) = audit_selection_and_provenance(&scan).unwrap();
            assert_eq!(selection.len(), evidence.len(), "behavior case {case_id}");
            assert!(selection.iter().all(|row| exact.trajectories.iter().any(|trajectory|
                trajectory.entity == row.key.a && trajectory.slot == row.key.a_slot)
                && exact.trajectories.iter().any(|trajectory|
                    trajectory.entity == row.key.b && trajectory.slot == row.key.b_slot)),
                "behavior case {case_id} has an unresolved candidate key");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn zero_response_direct_audit_requires_the_declared_scratch_reservation() {
        let rows = behavior_case(4);
        let exact = zero_response_compatibility(&rows).unwrap();
        let mut unreserved = ContactCollectionScratch::default();
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                              &mut unreserved),
                   Err(ExactScanReject::CompatibilityIdentity));
        let mut reserved = ContactCollectionScratch::default();
        reserved.try_reserve(64).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut reserved).unwrap();
        assert!(audit_selection_and_provenance(&reserved).is_ok());
    }

    #[cfg(feature = "cartesian-recoil")]
    fn project_audit_provenance(
        diagnostic: &mut ExactContactGroupDiagnostic,
        selection: AuditCertifiedSelection, evidence: Option<AuditCertifiedProvenance>,
    ) -> Result<(), ExactScanReject> {
        diagnostic.mapped_member_keys[0] = None;
        diagnostic.wide_toi[0] = None;
        let evidence = evidence.ok_or(ExactScanReject::CompatibilityIdentity)?;
        if (selection.key, selection.time_raw) != (evidence.key, evidence.time_raw) {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        diagnostic.mapped_member_keys[0] = Some(selection.key.into());
        diagnostic.wide_toi[0] = Some(evidence.wide_toi);
        Ok(())
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn certified_wide_toi_provenance_is_parallel_to_not_inside_selection() {
        let rows = behavior_case(4);
        let exact = zero_response_compatibility(&rows).unwrap();
        let mut scan = ContactCollectionScratch::default(); scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scan).unwrap();
        let (selection, evidence) = audit_selection_and_provenance(&scan).unwrap();
        assert_eq!((selection.len(), evidence.len()), (1, 1));
        assert_eq!((selection[0].key, selection[0].time_raw),
                   (evidence[0].key, evidence[0].time_raw));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn provenance_poison_cannot_change_time_key_fact_or_suppression() {
        let rows = behavior_case(4);
        let exact = zero_response_compatibility(&rows).unwrap();
        let mut scan = ContactCollectionScratch::default(); scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scan).unwrap();
        let (selection, mut evidence) = audit_selection_and_provenance(&scan).unwrap();
        let selected = selection[0];
        let mut pose = ContactCollectionScratch::default(); pose.try_reserve(64).unwrap();
        let canonical = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, selected.time_raw, &mut pose).unwrap().unwrap();
        let suppression_before = suppressed(ContactTimeBasis::AbsoluteTick, &canonical,
                                             selected.time_raw, &[]);
        evidence[0].wide_toi.accepted_root_raw ^= 0xffff;
        evidence[0].wide_toi.closest_feature ^= 0xff;
        evidence[0].wide_toi.visited_times_raw = [u32::MAX; 8];
        evidence[0].wide_toi.comparison = ExactWideComparisonDiagnostic::EarliestTimeThenMedialThenRegion;
        let canonical_after = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, selected.time_raw, &mut pose).unwrap().unwrap();
        assert_eq!((selected, canonical_after, suppressed(ContactTimeBasis::AbsoluteTick,
            &canonical_after, selected.time_raw, &[])),
                   (selection[0], canonical, suppression_before));
        let mut diagnostic = ExactContactGroupDiagnostic::default();
        project_audit_provenance(&mut diagnostic, selected, Some(evidence[0])).unwrap();
        assert_eq!(diagnostic.wide_toi[0], Some(evidence[0].wide_toi));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn refusal_or_rescan_cannot_publish_stale_or_partial_wide_toi() {
        let rows = behavior_case(4);
        let exact = zero_response_compatibility(&rows).unwrap();
        let mut scan = ContactCollectionScratch::default(); scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scan).unwrap();
        let (selection, evidence) = audit_selection_and_provenance(&scan).unwrap();
        let mut diagnostic = ExactContactGroupDiagnostic::default();
        assert_eq!(project_audit_provenance(&mut diagnostic, selection[0], None),
                   Err(ExactScanReject::CompatibilityIdentity));
        assert!(diagnostic.mapped_member_keys[0].is_none() && diagnostic.wide_toi[0].is_none());
        project_audit_provenance(&mut diagnostic, selection[0], Some(evidence[0])).unwrap();
        let mut stale = evidence[0]; stale.time_raw += 1;
        assert_eq!(project_audit_provenance(&mut diagnostic, selection[0], Some(stale)),
                   Err(ExactScanReject::CompatibilityIdentity));
        assert!(diagnostic.mapped_member_keys[0].is_none() && diagnostic.wide_toi[0].is_none());
    }

    #[test]
    fn exact_time_basis_bypasses_mapping_for_membership_and_suppression() {
        let global = 20_000;
        let absolute = fact(0, 1, ContactKind::WeaponWeapon, 40_000, 1, -1);
        assert_eq!(candidate_global_time(ContactTimeBasis::AbsoluteTick, global, absolute), 40_000);
        assert_ne!(candidate_global_time(ContactTimeBasis::RemainingTick, global, absolute), 40_000,
                   "the mutation to remaining-tick mapping was invisible");

        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(64).unwrap();
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let exact = zero_response_compatibility(&rows).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut scratch).unwrap();
            if !scratch.candidates().is_empty() { break; }
        }
        let time = earliest_group_time(ContactTimeBasis::AbsoluteTick, 0,
            scratch.candidates(), &[]).expect("an exact candidate");
        let expected = scratch.candidates().iter()
            .filter(|row| row.fact.toi.get().raw() as u32 == time).count();
        assert_eq!(count_group_members(ContactTimeBasis::AbsoluteTick, 0, time,
            scratch.candidates(), &[]).unwrap(), expected);

        let at_current = fact(0, 1, ContactKind::WeaponWeapon,
                              global as i32, 65_536, -65_536);
        let remembered = [Resolved { key: at_current.key, global,
            normal: at_current.normal,
            relative_velocity: at_current.velocity_b - at_current.velocity_a }];
        assert!(suppressed(ContactTimeBasis::AbsoluteTick, &at_current, global, &remembered));
        assert!(!suppressed(ContactTimeBasis::RemainingTick, &at_current, global, &remembered));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_group_failure_restores_staged_owners_and_output_atomically() {
        let mut rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let before = rows.clone();
        let before_owners = exact.owners.clone();
        let before_trajectories = exact.trajectories.clone();
        let mut state = ContactSolverState::default();
        let before_state = state;
        let mut resolutions = Vec::new();
        let mut floor_reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        // Smart89 lets this fixture reach its one exact group instead of
        // refusing during publication, so reserve the same bounded trial
        // width the production tick uses before measuring rollback growth.
        scratch.reserve(rows.len() * 3, 64);
        let capacities = scratch.capacities();
        let failure = solve_exact_contact_tick(&mut rows, &mut exact.trajectories, &mut exact.owners,
            &mut floor_reactions, &mut RejectAfterGroup, &mut state, &mut resolutions,
            &mut scratch).expect_err("the single group was not refused");
        assert_eq!(rows, before);
        assert_eq!(exact.owners, before_owners);
        assert_eq!(exact.trajectories, before_trajectories);
        assert_eq!(state, before_state);
        assert!(resolutions.is_empty());
        assert_eq!((failure.phase, failure.cause),
                   (ExactContactRejectPhase::Lifecycle, ResolutionError::Projector));
        assert!(failure.key.is_some(), "the one-fact refusal lost its canonical contact key");
        assert_eq!(scratch.capacities(), capacities,
                   "recording rejection evidence changed retained capacity");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn coupled_rejection_context_does_not_accuse_the_first_sorted_contact() {
        let mut fixture = None;
        for case_id in 0..=6 {
            let rows = behavior_case(case_id);
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut scan = ContactCollectionScratch::default();
            scan.try_reserve(64).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scan)
                .unwrap();
            let Some(first) = scan.candidates().first() else { continue };
            let time = first.fact.toi.get().raw();
            if scan.candidates().iter().filter(|row| row.fact.toi.get().raw() == time).count() > 1 {
                fixture = Some((rows, exact)); break;
            }
        }
        let (mut rows, mut exact) = fixture.expect("behavior corpus has no coupled exact group");
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        let failure = solve_exact_contact_tick(&mut rows, &mut exact.trajectories,
            &mut exact.owners, &mut reactions, &mut RejectAfterGroup, &mut state,
            &mut resolutions, &mut scratch).expect_err("coupled group was not refused");
        assert_eq!((failure.phase, failure.cause, failure.key),
                   (ExactContactRejectPhase::Lifecycle, ResolutionError::Projector, None));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_scan_refusal_names_scan_without_a_contact_key() {
        let mut rows = behavior_case(4);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        exact.trajectories[0].owner_index = exact.owners.len();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        let failure = solve_exact_contact_tick(&mut rows, &mut exact.trajectories,
            &mut exact.owners, &mut reactions, &mut IndependentPointProjector, &mut state,
            &mut resolutions, &mut scratch).expect_err("malformed scan was accepted");
        assert_eq!((failure.phase, failure.cause, failure.key),
                   (ExactContactRejectPhase::Scan, ResolutionError::ExactScan, None));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn a_second_exact_group_scans_the_first_response_and_finishes_each_interval_once() {
        let mut rows = behavior_case(3);
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut floor_reactions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(rows.len() * 3, 64);
        let groups = solve_exact_contact_tick(&mut rows, &mut exact.trajectories,
            &mut exact.owners, &mut floor_reactions, &mut IndependentPointProjector, &mut state,
            &mut resolutions, &mut scratch).unwrap();
        assert_eq!(groups, 2, "removing the first exact response hid the second group");
        assert_eq!(resolutions.iter().map(|row| (row.group_ordinal,
            row.fact.key.a.index, row.fact.key.b.index)).collect::<Vec<_>>(),
            vec![(0, 0, 1), (1, 1, 2)]);
        assert_ne!(resolutions[1].fact.velocity_a, rows[1].velocity,
                   "group two read motor-only compatibility velocity");
        assert!(exact.owners.iter().all(|owner| owner.common_response.group_time_raw == 65_536
            && owner.held_response.iter().flatten()
                .all(|held| held.affine.group_time_raw == 65_536)),
            "one owner was not finished exactly once to tick end");
        let middle = exact.owners.iter().find(|owner| owner.entity.index == 1).unwrap();
        assert_ne!(middle.held_response[1].unwrap().affine.at_group[0],
                   crate::combat::trajectory::ExactPosition::default(),
                   "the first-to-second interval was never integrated");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn accepted_exact_group_retains_its_floor_reaction_for_world_commit() {
        let colliders = behavior_case(6);
        let mut exact = zero_response_compatibility(&colliders).unwrap();
        let mut scan = ContactCollectionScratch::default();
        scan.try_reserve(64).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &colliders, &mut scan)
            .unwrap();
        let fact = scan.candidates()[0].fact;
        let impulse = Vec3::new(Fx::ZERO, Fx::ZERO, Fx::ONE);
        let row = ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536, fact,
            impulse: ContactImpulse { key: fact.key, on_a: impulse, on_b: -impulse },
            energy: EnergyLedger::default(), cut_raw: 0, thrust_raw: 0, crush_raw: 0,
            pressure_raw: 0, deflected_raw: 0, severed: false };
        let mut reactions = Vec::with_capacity(4);
        let mut work = ExactTrajectoryWork::default();
        work.try_reserve().unwrap();
        let mut kinematics = ExactKinematics { trajectories: &mut exact.trajectories,
            owners: &mut exact.owners, floor_reactions: &mut reactions, work: &mut work };
        kinematics.apply_group(&mut [], &[], &[], &[], &[row], fact.toi.get().raw() as u32)
            .unwrap();
        assert_eq!(reactions.len(), 1);
        assert_eq!((reactions[0].entity, reactions[0].rejected_impulse_raw),
                   (fact.key.b, -65_536));
        assert!(reactions[0].energy_change.numerator < 0);
    }

    #[test]
    fn projected_group_finalizer_refuses_unattributed_loss_before_mutation() {
        let mut before = vec![state(0, Vec3::X), state(1, -Vec3::X)];
        let projected = vec![state(0, Vec3::ZERO), state(1, Vec3::ZERO)];
        let f = fact(0, 1, ContactKind::WeaponWeapon, 0, 65_536, -65_536);
        let contact = ProposedContact { fact: f, a_collider: 0, b_collider: 1,
            impulse_on_a: Vec3::ZERO, channel: None };
        let saved = before.clone(); let mut weights = Vec::new(); let mut shares = Vec::new();
        let mut output = Vec::new();
        assert_eq!(finalize_projected_group(&mut before, &projected, &[contact], 0, 65_536,
            &mut weights, &mut shares, &mut output), Err(ResolutionError::EnergyNumerator));
        assert_eq!(before, saved);
        assert!(output.is_empty());
        assert_eq!(finalize_projected_group(&mut before, &projected, &[], 0, 65_536,
            &mut weights, &mut shares, &mut output), Err(ResolutionError::ResolutionCount));
    }

    #[test]
    fn sub_raw_contact_impulses_still_attribute_the_energy_their_sum_dissipates() {
        let f = fact(0, 1, ContactKind::WeaponBody, 0, 1, 0);
        let contact = ProposedContact { fact: f, a_collider: 0, b_collider: 1,
            impulse_on_a: Vec3::new(Fx::from_raw(-1), Fx::ZERO, Fx::ZERO), channel: None };
        let mut weights = Vec::new();
        let mut shares = Vec::new();
        assert_eq!(scale_impulse(contact.impulse_on_a, 1), Vec3::ZERO,
            "the fixture's public impulse stopped rounding below one raw unit");
        allocate_shares_into(1, &[contact], 1, &mut weights, &mut shares).unwrap();
        assert_eq!(weights, [1], "pre-rounding attribution lost its normal/closing product");
        assert_eq!(shares, [1], "a real raw-unit loss became an unattributed refusal");
    }

    #[test]
    fn finalized_resolution_preserves_the_canonical_fact_geometry() {
        let mut before = vec![state(0, Vec3::X), state(1, -Vec3::X)];
        let projected = before.clone();
        let mut canonical = fact(0, 1, ContactKind::WeaponWeapon, 38_127, 65_536, -65_536);
        canonical.point = Vec3::new(Fx::from_raw(514_088), Fx::from_raw(534_488),
                                    Fx::from_raw(26_213));
        canonical.normal = Vec3::new(Fx::from_raw(-26_352), Fx::from_raw(59_997), Fx::ZERO);
        let contact = ProposedContact { fact: canonical, a_collider: 0, b_collider: 1,
            impulse_on_a: Vec3::ZERO, channel: None };
        let mut weights = Vec::new(); let mut shares = Vec::new(); let mut output = Vec::new();
        finalize_projected_group(&mut before, &projected, &[contact], 3, 32_768,
            &mut weights, &mut shares, &mut output).unwrap();
        assert_eq!(output.len(), 1);
        assert_eq!((output[0].fact.point, output[0].fact.normal),
                   (canonical.point, canonical.normal));
    }

    #[test]
    fn projected_group_seams_refuse_wrong_identity_and_duplicate_mapping_atomically() {
        let mut before = vec![state(0, Vec3::X), state(1, -Vec3::X)];
        let projected = vec![state(0, Vec3::ZERO), state(1, Vec3::ZERO)];
        let f = fact(0, 1, ContactKind::WeaponWeapon, 0, 65_536, -65_536);
        let wrong = proposed(f, 1, 0, Fx::ZERO);
        let saved = before.clone(); let mut weights = Vec::new(); let mut shares = Vec::new();
        let mut output = Vec::new();
        assert_eq!(finalize_projected_group(&mut before, &projected, &[wrong], 0, 65_536,
            &mut weights, &mut shares, &mut output), Err(ResolutionError::ColliderIndex));
        assert_eq!(before, saved);

        let mut colliders = behavior_case(4); let saved_colliders = colliders.clone();
        let old = [colliders[0].velocity, colliders[0].velocity];
        let projected = [GeneralizedCollider { entity: colliders[0].entity,
            slot: colliders[0].slot, kind: GeneralizedKind::Equipment,
            mass: colliders[0].mass, velocity: Vec3::ZERO,
            velocity_offset: colliders[0].velocity_offset }; 2];
        assert_eq!(apply_projected_rows(&mut colliders, &[0, 0], &old, &projected, 32_768),
                   Err(ResolutionError::DuplicateIdentity));
        assert_eq!(colliders, saved_colliders);
    }

    #[test]
    fn a_group_translates_a_segment_without_moving_its_swing_differential() {
        // What makes `ContactCollider::velocity_offset` legitimate to *carry*
        // rather than recompute. A held blade's sample offset is
        // `balance * ((requested.tip - previous.tip) - (requested.hilt -
        // previous.hilt))`, built once when the row is built and then
        // subtracted and re-added by every joint round trip for the rest of the
        // tick -- which is only sound while nothing a group does can change the
        // quantity it came from.
        //
        // A group's entire effect on a collider's geometry is this function,
        // and it moves hilt and tip by the *same* delta, so the differential
        // cancels it exactly. The other mutation in the driver is the advance,
        // and it is checked here too for the opposite reason: it rescales the
        // remaining geometry and deliberately does not rescale `velocity`, so
        // velocity and offset stay the same kind of per-tick quantity as each
        // other. If either of those ever stops holding, the offset is a
        // snapshot going stale and this is the test that says so.
        let at = |x: i32, y: i32| Vec3::new(Fx::from_raw(x), Fx::from_raw(y), Fx::ZERO);
        let mut row = ContactCollider {
            entity: EntityId::new(0, 0), faction: Faction::Heroes, slot: 1, mass: Fx::ONE,
            surface: surface(Fx::ZERO), velocity: at(1_000, 0),
            velocity_offset: at(48, -16), present: true,
            shape: ContactShape::Segment {
                previous_hilt: at(0, 0), previous_tip: at(65_536, 0),
                requested_hilt: at(1_000, 0), requested_tip: at(66_136, 3_000),
                radius: Fx::ZERO },
        };
        let differential = |row: &ContactCollider| {
            let ContactShape::Segment { previous_hilt, previous_tip,
                                        requested_hilt, requested_tip, .. } = row.shape
                else { panic!("a segment row") };
            (requested_tip - previous_tip) - (requested_hilt - previous_hilt)
        };
        let before = differential(&row);
        assert_ne!(before, Vec3::ZERO, "a still blade cannot detect a translation");

        // Deliberately asymmetric in X and Y, and large against the pose: a
        // delta that cancelled by symmetry would pass this whatever the code
        // did with it.
        translate_requested(&mut row, at(-4_096, 12_288));
        assert_eq!(differential(&row), before, "a group translation moved the swing");
        assert_eq!(row.velocity_offset, at(48, -16), "a group translation moved the offset");

        let velocity = row.velocity;
        advance_all(core::slice::from_mut(&mut row), 32_768, 65_536);
        assert_eq!(row.velocity, velocity, "the advance rescaled a per-tick velocity");
        assert_eq!(row.velocity_offset, at(48, -16), "the advance rescaled the offset");
    }

    fn fact(a: u32, b: u32, kind: ContactKind, toi: i32, va: i32, vb: i32) -> ContactFact {
        ContactFact {
            key: ContactKey { a: EntityId::new(a, 0), a_slot: 1,
                              b: EntityId::new(b, 0), b_slot: if kind == ContactKind::WeaponBody { BODY_SLOT } else { 1 }, kind },
            toi: TimeOfImpact::new_clamped(Fx::from_raw(toi)), volume: 0xff,
            point: Vec3::new(Fx::from_raw(toi), Fx::ZERO, Fx::ZERO), normal: Vec3::X,
            velocity_a: Vec3::new(Fx::from_raw(va), Fx::ZERO, Fx::ZERO),
            velocity_b: Vec3::new(Fx::from_raw(vb), Fx::ZERO, Fx::ZERO),
        }
    }

    fn proposed(fact: ContactFact, a: usize, b: usize, restitution: Fx) -> ProposedContact {
        ProposedContact { fact, a_collider: a, b_collider: b,
            impulse_on_a: proposed_impulse(Fx::ONE, Fx::ONE, surface(restitution), surface(restitution),
                                           fact.velocity_a, fact.velocity_b, fact.normal), channel: None }
    }

    struct Solved {
        colliders: Vec<ContactCollider>,
        resolutions: Vec<ContactResolution>,
        groups: u8,
        cap_hits: u32,
        grew: bool,
    }

    impl Solved {
        /// The serialized final row per collider, in the corpus's own terms.
        fn finals(&self) -> Vec<(i32, i32)> {
            self.colliders.iter().map(|row| {
                let x = match row.shape {
                    ContactShape::Projectile { previous, .. } => previous.x,
                    ContactShape::Segment { previous_tip, .. } => previous_tip.x,
                    ContactShape::Body { previous_origin, .. } => previous_origin.x,
                    ContactShape::Shield { previous, .. } => previous[0].x,
                };
                (x.raw(), row.velocity.x.raw())
            }).collect()
        }

        fn ledgers(&self) -> Vec<(u64, u64, u64)> {
            self.resolutions.iter()
                .map(|row| (row.energy.before_raw, row.energy.after_raw, row.energy.dissipated_raw))
                .collect()
        }

        /// `(group ordinal, alpha, A index, B index, global TOI raw)` per row.
        fn shape(&self) -> Vec<(u8, u32, u32, u32, i32)> {
            self.resolutions.iter().map(|row| (
                row.group_ordinal, row.group_alpha_raw,
                row.fact.key.a.index, row.fact.key.b.index, row.fact.toi.get().raw(),
            )).collect()
        }
    }

    /// Drive explicit collider rows through the production driver at the
    /// documented reservation bounds, and report whether any retained capacity
    /// grew on the way.
    ///
    /// `grew` is weaker than "allocated nothing" and must not be read as that
    /// claim: it compares `Vec::capacity()` before and after, so it is blind to
    /// a buffer allocated and freed inside a call -- which is exactly how a
    /// stable sort's scratch space hid here until an allocator-counting probe
    /// found it. The browser no-growth proof in checkpoint C is the real check.
    fn solve_rows(mut colliders: Vec<ContactCollider>) -> Solved {
        let high_water = colliders.len();
        let pairs = if high_water < 2 { 0 } else { high_water * (high_water - 1) / 2 };
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::with_capacity(MAX_CONTACT_RESOLUTIONS_PER_TICK);
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(high_water * 3, pairs * 16);
        let reserved = scratch.capacities();
        let groups = solve_contact_tick(&mut colliders, &mut IndependentPointProjector,
                                        &mut state, &mut resolutions, &mut scratch).unwrap();
        Solved { colliders, resolutions, groups, cap_hits: state.cap_hits,
                 grew: scratch.capacities() != reserved }
    }

    fn solve_case(case_id: u32) -> Solved { solve_rows(behavior_case(case_id)) }

    #[test]
    fn a_true_simultaneous_group_uses_one_pre_group_state() {
        let solved = solve_case(1);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        // Both targets sit at the same x, so one mapped time carries both facts
        // and both rows carry ordinal zero and one shared ledger.
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 16_384), (0, 65_536, 0, 2, 16_384)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 16_384, 16_384); 2]);
        // The pre-group state is what makes this one group rather than two: the
        // second fact still sees the striker at full speed, not at the speed the
        // first fact would have left it.
        for row in &solved.resolutions {
            assert_eq!(row.fact.velocity_a.x.raw(), 65_536);
            assert_eq!(row.fact.velocity_b, Vec3::ZERO);
            assert_eq!(row.impulse.on_a.x.raw(), -32_768);
        }
        assert_eq!(solved.finals(), vec![(16_384, 0), (40_960, 32_768), (40_960, 32_768)]);
    }

    #[test]
    fn shared_limb_group_energy_is_clamped_as_one_system() {
        let solved = solve_case(2);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        // Full alpha would hand the pair more energy than it arrived with, so
        // the greedy search backs the whole group off together -- one alpha for
        // both facts, not one per fact.
        assert_eq!(solved.shape(), vec![(0, 43_691, 0, 1, 16_384), (0, 43_691, 0, 2, 16_384)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.finals(), vec![(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);
    }

    #[test]
    fn one_sweep_recomputes_after_two_sequential_contacts() {
        let solved = solve_case(3);
        assert_eq!((solved.groups, solved.cap_hits), (2, 0));
        // The second contact is only reachable if the sweep was rebuilt from the
        // pose and velocity the first group left behind. Re-interpolating from
        // tick start would leave entity 1 stationary and find nothing.
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 16_384), (1, 65_536, 1, 2, 32_768)]);
        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.finals(), vec![(16_384, 0), (32_768, 0), (65_536, 65_536)]);
        assert!(!solved.grew);
    }

    #[test]
    fn persistent_zero_time_contacts_do_not_livelock() {
        let solved = solve_case(4);
        assert_eq!((solved.groups, solved.cap_hits), (1, 0));
        assert_eq!(solved.shape(), vec![(0, 65_536, 0, 1, 0)]);
        assert_eq!(solved.ledgers(), vec![(4_096, 4_096, 0)]);
        assert_eq!(solved.finals(), vec![(-16_384, -16_384), (16_384, 16_384)]);

        // The harder half: a suppressed pair has to stay suppressed across a
        // group it has nothing to do with. Entities 0 and 1 meet head-on and
        // stop dead against each other, so they stay coincident with zero
        // relative approach and re-sweep at local zero forever; entities 2 and 3
        // meet later, off in Y. If that unrelated group could clear the memory,
        // the dead pair would resolve again every ordinal until the tick capped.
        let dead_pair = |index: u32, faction, velocity: i32| ContactCollider {
            entity: EntityId::new(index, 0), faction, slot: 1, mass: Fx::ONE,
            surface: surface(Fx::ZERO), velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Segment {
                previous_hilt: Vec3::ZERO, previous_tip: Vec3::ZERO,
                requested_hilt: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                requested_tip: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                radius: Fx::ZERO } };
        let elsewhere = |index: u32, faction, x: i32, velocity: i32| {
            let at = |x: i32| Vec3::new(Fx::from_raw(x), Fx::ONE, Fx::ZERO);
            ContactCollider {
                entity: EntityId::new(index, 0), faction, slot: 1, mass: Fx::ONE, present: true,
                surface: surface(Fx::ZERO), velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                velocity_offset: Vec3::ZERO,
                shape: ContactShape::Segment {
                    previous_hilt: at(x), previous_tip: at(x),
                    requested_hilt: at(x + velocity), requested_tip: at(x + velocity),
                    radius: Fx::ZERO } }
        };
        let crowded = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 16_384),
            dead_pair(1, Faction::Monsters, -16_384),
            elsewhere(2, Faction::Heroes, 0, 65_536),
            elsewhere(3, Faction::Monsters, 16_384, 0),
        ]);
        assert_eq!((crowded.groups, crowded.cap_hits), (2, 0));
        assert_eq!(crowded.shape(), vec![(0, 65_536, 0, 1, 0), (1, 65_536, 2, 3, 16_384)]);

        // The third way in, and the one the separating rule alone cannot close:
        // a pair that is still closing but whose impulse rounds away. An impulse
        // is `closing/inv_sum` in truncating fixed point, so at equal unit
        // masses every odd raw closing speed leaves the pair exactly where it
        // was. Nothing separates, nothing is suppressed by velocity sign, and
        // the pair re-resolves once per remaining ordinal until the cap invents
        // a `cap_hits` increment out of a rounding floor.
        // At equal unit masses an odd closing speed always leaves one raw unit
        // behind, whatever it started at: 65,535 dissipates properly on its
        // first group and still ends up stalled on the residual.
        for closing in [1, 3, 7, 9, 65_535] {
            let stalled = solve_rows(vec![
                dead_pair(0, Faction::Heroes, closing),
                dead_pair(1, Faction::Monsters, 0),
            ]);
            assert_eq!((stalled.groups, stalled.cap_hits), (1, 0),
                       "closing {closing} raw re-resolved instead of settling");
            assert_eq!(stalled.resolutions.len(), 1);
        }
        // Closing one raw unit is the pure case: the impulse rounds entirely
        // away, so the single group is a no-op and there is nothing to dissipate.
        let inert = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 1), dead_pair(1, Faction::Monsters, 0)]);
        assert_eq!(inert.resolutions[0].impulse.on_a, Vec3::ZERO);
        assert_eq!(inert.resolutions[0].energy.dissipated_raw, 0);

        // Soundness costs an ordinal, and this pins the price. The unresolvable
        // pair is suppressed only while global time stands still; once an
        // unrelated group advances it, both colliders have moved along their
        // trajectories and the pair is genuinely new state, so it is re-examined
        // rather than assumed inert. Skipping that re-examination is what a
        // randomised sweep caught suppressing 3,376 real closing contacts, one
        // of them at nearly four units per tick.
        let revisited = solve_rows(vec![
            dead_pair(0, Faction::Heroes, 1),
            dead_pair(1, Faction::Monsters, 0),
            elsewhere(2, Faction::Heroes, 0, 65_536),
            elsewhere(3, Faction::Monsters, 16_384, 0),
        ]);
        assert_eq!((revisited.groups, revisited.cap_hits), (3, 0));
    }

    #[test]
    fn cap_exhaustion_stops_at_the_last_safe_pose() {
        let solved = solve_case(5);
        assert_eq!((solved.groups, solved.cap_hits), (8, 1));
        assert_eq!(solved.resolutions.len(), 8);
        assert_eq!(solved.shape(), (0..8u32).map(|k|
            (k as u8, 65_536, k, k + 1, 4_096 * (k as i32 + 1))).collect::<Vec<_>>());
        // Label 8 took the eighth group's momentum and had a requested end of
        // 65,536 pending. The cap freezes it where it stood rather than letting
        // it finish the sweep that had nothing left to resolve it against.
        assert_eq!(solved.finals(), vec![
            (4_096, 0), (8_192, 0), (12_288, 0), (16_384, 0), (20_480, 0),
            (24_576, 0), (28_672, 0), (32_768, 0), (32_768, 0), (36_864, 0),
        ]);
        assert!(!solved.grew);
    }

    #[test]
    fn contact_results_survive_entity_and_limb_index_permutations() {
        // Case 1 with labels 0 and 2 exchanged, the right slot swapped for the
        // left, and the rows handed over in the opposite order. Nothing here is
        // identity except the full `(EntityId, LimbSlot)` pair.
        let relabel = |label: u32| match label { 0 => 2, 2 => 0, other => other };
        let permuted: Vec<ContactCollider> = behavior_case(1).into_iter().rev()
            .map(|mut row| {
                row.entity = EntityId::new(relabel(row.entity.index), 0);
                row.slot = 0;
                row
            }).collect();
        let (original, permuted) = (solve_case(1), solve_rows(permuted));

        assert_eq!(original.groups, permuted.groups);
        assert_eq!(original.cap_hits, permuted.cap_hits);
        assert_eq!(original.ledgers(), permuted.ledgers());

        // Facts mirror rather than match: relabelling makes the striker the
        // higher identity, so it becomes B, and the normal and impulse flip with
        // it. What has to survive is the unordered pair, and what each entity
        // actually receives.
        let pairs = |solved: &Solved, map: &dyn Fn(u32) -> u32| {
            let mut rows: Vec<(u32, u32)> = solved.resolutions.iter().map(|row| {
                let (a, b) = (map(row.fact.key.a.index), map(row.fact.key.b.index));
                (a.min(b), a.max(b))
            }).collect();
            rows.sort();
            rows
        };
        assert_eq!(pairs(&original, &|label| label), pairs(&permuted, &relabel));

        let received = |solved: &Solved, map: &dyn Fn(u32) -> u32| {
            let mut rows: Vec<(u32, i32)> = solved.resolutions.iter().flat_map(|row| [
                (map(row.fact.key.a.index), row.impulse.on_a.x.raw()),
                (map(row.fact.key.b.index), row.impulse.on_b.x.raw()),
            ]).collect();
            rows.sort();
            rows
        };
        assert_eq!(received(&original, &|label| label), received(&permuted, &relabel));

        let mut mapped: Vec<(u32, (i32, i32))> = permuted.colliders.iter()
            .map(|row| relabel(row.entity.index)).zip(permuted.finals()).collect();
        mapped.sort();
        assert_eq!(mapped.into_iter().map(|(_, row)| row).collect::<Vec<_>>(), original.finals());
    }

    #[test]
    fn a_bystander_outside_the_group_closure_stays_out_of_its_ledger() {
        // Case 2 plus one hostile row parked far away and moving fast across the
        // group's axis. It touches nothing, so nothing about the group may
        // change -- and in particular its kinetic energy must not appear in a
        // ledger it has no part in, where it would be serialized as evidence and
        // could pay for the group's own energy gain during the alpha search.
        let mut rows = behavior_case(2);
        let far = Vec3::from_ints(8, 8, 0);
        rows.push(ContactCollider {
            entity: EntityId::new(9, 0), faction: Faction::Monsters, slot: 1, mass: Fx::ONE,
            present: true, surface: surface(Fx::ONE), velocity: Vec3::Y * Fx::TWO,
            velocity_offset: Vec3::ZERO,
            shape: ContactShape::Segment {
                previous_hilt: far, previous_tip: far,
                requested_hilt: far + Vec3::Y * Fx::TWO, requested_tip: far + Vec3::Y * Fx::TWO,
                radius: Fx::ZERO } });
        let solved = solve_rows(rows);

        assert_eq!(solved.ledgers(), vec![(32_768, 32_768, 0); 2]);
        assert_eq!(solved.shape(), vec![(0, 43_691, 0, 1, 16_384), (0, 43_691, 0, 2, 16_384)]);
        assert_eq!(&solved.finals()[..3], &[(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);
        // The bystander finished its own sweep untouched.
        assert_eq!(solved.colliders[3].velocity, Vec3::Y * Fx::TWO);
        assert_eq!(solved.finals()[3], (Fx::from_int(8).raw(), 0));
    }

    #[test]
    fn an_oversized_simultaneous_group_caps_instead_of_truncating() {
        // 23 against 23, every one of them coincident at the origin, makes 529
        // simultaneous facts against a 512 ceiling. No prefix of a simultaneous
        // group is privileged, so the answer is to resolve none of it and cap.
        let crowd: Vec<ContactCollider> = (0..46u32).map(|index| {
            let velocity = if index % 2 == 0 { 4_096 } else { -4_096 };
            ContactCollider {
                entity: EntityId::new(index, 0),
                faction: if index % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
                slot: 1, mass: Fx::ONE, present: true, surface: surface(Fx::ZERO),
                velocity: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                velocity_offset: Vec3::ZERO,
                shape: ContactShape::Segment {
                    previous_hilt: Vec3::ZERO, previous_tip: Vec3::ZERO,
                    requested_hilt: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                    requested_tip: Vec3::new(Fx::from_raw(velocity), Fx::ZERO, Fx::ZERO),
                    radius: Fx::ZERO } }
        }).collect();
        let solved = solve_rows(crowd);

        assert_eq!((solved.groups, solved.cap_hits), (0, 1));
        assert!(solved.resolutions.is_empty());
        // Everything is inside the closure, so everything holds its last-safe
        // pose at the origin instead of finishing its sweep.
        assert!(solved.finals().iter().all(|&row| row == (0, 0)));
        assert!(!solved.grew);
    }

    /// One length-1 sword lying along +X with its tip resting on a zero-radius
    /// body capsule at the origin: the shared fixture for the channel proofs.
    fn braced_sword(sword: Vec3, body: Vec3) -> Vec<ContactCollider> {
        let steel = SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO,
            edge_factor: Fx::ONE, point_factor: Fx::ONE, material: Material::Steel };
        let hilt = Vec3::new(-Fx::ONE, Fx::ZERO, Fx::ZERO);
        vec![
            ContactCollider {
                entity: EntityId::new(0, 0), faction: Faction::Heroes, slot: 1,
                mass: Fx::ONE, surface: steel, velocity: sword,
                velocity_offset: Vec3::ZERO, present: true,
                shape: ContactShape::Segment {
                    previous_hilt: hilt, previous_tip: Vec3::ZERO,
                    requested_hilt: hilt + sword, requested_tip: sword, radius: Fx::ZERO } },
            ContactCollider {
                entity: EntityId::new(1, 0), faction: Faction::Monsters, slot: BODY_SLOT,
                mass: Fx::ONE, surface: steel, velocity: body,
                velocity_offset: Vec3::ZERO, present: true,
                shape: ContactShape::Body {
                    previous_origin: Vec3::ZERO, requested_origin: body,
                    parts: [RegionSweep {
                        previous_lower: Vec3::ZERO, previous_upper: Vec3::ZERO,
                        requested_lower: body, requested_upper: body,
                        radius: Fx::ZERO, present: true,
                    }; BODY_VOLUME_COUNT] } },
        ]
    }

    #[test]
    fn a_stationary_edge_does_not_cut() {
        // Resting steel is still a contact -- the fact exists -- but nothing
        // closes, so there is no dissipated energy to allocate and no channel
        // can be nonzero. An edge that cuts by mere presence is the bug.
        let solved = solve_rows(braced_sword(Vec3::ZERO, Vec3::ZERO));
        assert_eq!(solved.resolutions.len(), 1);
        let row = solved.resolutions[0];
        assert_eq!(row.fact.key.kind, ContactKind::WeaponBody);
        assert_eq!(row.energy.dissipated_raw, 0);
        assert_eq!((row.cut_raw, row.thrust_raw, row.pressure_raw), (0, 0, 0));
    }

    #[test]
    fn running_onto_a_braced_point_records_positive_thrust() {
        // The sword does not move; the body runs onto it. Relative motion is
        // purely along the blade, so the whole share above the floor is thrust
        // and none of it is cut.
        let quarter = Fx::from_ratio(1, 4);
        let solved = solve_rows(braced_sword(Vec3::ZERO, Vec3::new(-quarter, Fx::ZERO, Fx::ZERO)));
        assert_eq!(solved.resolutions.len(), 1);
        let row = solved.resolutions[0];
        assert_eq!((row.energy.before_raw, row.energy.after_raw, row.energy.dissipated_raw),
                   (2_048, 1_024, 1_024));
        assert!(row.thrust_raw > 0);
        assert_eq!(row.cut_raw, 0);
        // The 144 floor never reaches a channel; it lands in pressure.
        assert_eq!((row.cut_raw, row.thrust_raw, row.pressure_raw), (0, 880, 144));
    }

    #[test]
    fn the_greedy_alpha_keeps_only_individually_valid_bits() {
        let mut states = [state(0, Vec3::X), state(1, Vec3::ZERO), state(2, Vec3::ZERO)];
        let contacts = [proposed(fact(0, 1, ContactKind::WeaponWeapon, 0, 65_536, 0), 0, 1, Fx::ONE),
                        proposed(fact(0, 2, ContactKind::WeaponWeapon, 0, 65_536, 0), 0, 2, Fx::ONE)];
        let (mut sums, mut trial) = (Vec::new(), Vec::new());
        let (mut weights, mut shares, mut output) = (Vec::new(), Vec::new(), Vec::new());
        resolve_group_into(&mut states, &contacts, 0, &mut IndependentPointProjector,
            &mut sums, &mut trial, &mut weights, &mut shares, &mut output).unwrap();
        assert_eq!(output[0].group_alpha_raw, 43_691);
    }

    #[test]
    fn group_energy_accumulation_never_saturates() {
        let rows = vec![GeneralizedCollider { entity: EntityId::new(0, 0), slot: 1,
            kind: GeneralizedKind::Equipment, mass: Fx::from_int(8),
            velocity: Vec3::from_ints(4, 4, 4), velocity_offset: Vec3::ZERO }; 192];
        let numerator: i128 = rows.iter().map(|row| row.mass.raw() as i128 *
            (row.velocity.x.raw() as i128 * row.velocity.x.raw() as i128 * 3)).sum();
        assert_eq!(numerator, 20_752_587_082_923_245_568);
        assert_eq!(closure_energy(&rows), Ok(2_415_919_104));
    }

    #[test]
    fn contact_resolution_channels_do_not_narrow() {
        let total = u64::from(u32::MAX) + 1;
        let mut whole = Vec::new();
        allocate_weighted_into(total, &[1], &mut whole).unwrap();
        assert_eq!(whole, vec![total]);
        let row = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::ZERO,
                                      edge_factor: Fx::ONE, point_factor: Fx::ONE,
                                      crush_factor: Fx::ONE, zero_length: true };
        assert_eq!(channels(total, row), (0, 0, 0, total));

        // The zero-length row above returns before any widened arithmetic runs,
        // so on its own it cannot prove the products stay `u64`. Drive a real
        // decomposition of the same above-`u32` share: purely axial, so the
        // whole of it above the 144 floor has to survive in thrust.
        let axial = WeaponBodyChannel { weapon_relative_velocity: Vec3::X, zero_length: false, ..row };
        assert_eq!(channels(total, axial), (0, total - CONTACT_ENERGY_FLOOR, 0, CONTACT_ENERGY_FLOOR));

        // A factor above one would drive `share - cut - thrust - crush` negative
        // and panic on the subtraction, in release too. `validate_surface`
        // cannot produce one, but this allocator is public and takes a raw
        // surface. All three factors are clamped, and crush needs its own case
        // because it is billed on what the other two declined: with an edge and
        // a point of one there is nothing left for it to overrun.
        let unbounded = WeaponBodyChannel { edge_factor: Fx::from_int(8),
                                            point_factor: Fx::from_int(8), ..axial };
        assert_eq!(channels(total, unbounded), (0, total - CONTACT_ENERGY_FLOOR, 0, CONTACT_ENERGY_FLOOR));
        let transverse = WeaponBodyChannel { weapon_relative_velocity: Vec3::Y, ..unbounded };
        let (cut, thrust, crush, pressure) = channels(1_000, transverse);
        assert_eq!((cut, thrust, crush), (856, 0, 0));
        assert_eq!(pressure, 144);

        // Shapeless and above-one crush: everything is declined, so an
        // unclamped factor would claim more than the budget holds.
        let blunt = WeaponBodyChannel { edge_factor: Fx::ZERO, point_factor: Fx::ZERO,
                                        crush_factor: Fx::from_int(8), ..transverse };
        assert_eq!(channels(total, blunt), (0, 0, total - CONTACT_ENERGY_FLOOR, CONTACT_ENERGY_FLOOR));
    }

    #[test]
    fn a_sword_is_not_made_stronger_by_the_crush_channel() {
        // The trap this session was written around. A blade's `pressure` is
        // identically `CONTACT_ENERGY_FLOOR`, so a crush channel billed on the
        // *share* rather than on what the edge and point declined would have
        // handed every sword contact a constant bonus on every tick it touched
        // -- including the 99.5% that carry no cut at all. That is a far larger
        // change to the blade than to the club it was meant for.
        //
        // **The tolerance is zero, not "small".** With `edge` and `point` both
        // one, `thrust_base + cut_base` is `available` or one less -- the two
        // floor divisions share a numerator that sums to `available` exactly --
        // so at most one raw unit is ever declined, and `1 * f / 65_536` floors
        // to zero for every factor below one. Steel's `7/8` is below one. This
        // is also why the behaviour corpus cannot move: every surface in it is
        // edge one, point one.
        let steel = crate::sword().surface;
        assert_eq!((steel.edge_factor, steel.point_factor), (Fx::ONE, Fx::ONE),
                   "the shipped blade stopped claiming the whole budget");
        for share in [145u64, 200, 1_000, 16_384, 1_000_000, u64::from(u32::MAX) + 1] {
            for velocity in [Vec3::X, Vec3::Y, Vec3::new(Fx::ONE, Fx::ONE, Fx::ZERO),
                             Vec3::new(Fx::ONE, Fx::from_ratio(1, 3), Fx::from_ratio(2, 7))] {
                let channel = WeaponBodyChannel {
                    weapon_axis: Vec3::X, weapon_relative_velocity: velocity,
                    edge_factor: steel.edge_factor, point_factor: steel.point_factor,
                    crush_factor: steel.material.crush_factor(), zero_length: false };
                let (cut, thrust, crush, pressure) = channels(share, channel);
                assert_eq!(crush, 0, "a blade declined enough to crush with at share {share}");
                assert_eq!(cut + thrust + crush + pressure, share);
                assert!(pressure <= CONTACT_ENERGY_FLOOR + 1,
                        "a blade's pressure is the floor plus at most one unit of rounding");
            }
        }
    }

    #[test]
    fn the_three_channels_still_sum_to_the_allocated_share() {
        // Four columns now, and the partition is unchanged: `channels` never
        // creates a raw unit and never lets the floor wound. Billing crush on
        // the remainder rather than on the share is what buys both -- the
        // second assertion is the one that would fail if crush were ever
        // computed from `share - cut - thrust`, because the 144 the floor
        // withholds would come straight back.
        for surface in [crate::sword().surface, crate::club().surface, crate::shield().surface] {
            for share in [0u64, 1, 143, 144, 145, 1_000, 65_536, u64::from(u32::MAX) + 1] {
                for velocity in [Vec3::ZERO, Vec3::X, Vec3::Y,
                                 Vec3::new(Fx::ONE, Fx::from_ratio(1, 3), Fx::from_ratio(2, 7))] {
                    for zero_length in [false, true] {
                        let channel = WeaponBodyChannel {
                            weapon_axis: Vec3::X, weapon_relative_velocity: velocity,
                            edge_factor: surface.edge_factor, point_factor: surface.point_factor,
                            crush_factor: surface.material.crush_factor(), zero_length };
                        let (cut, thrust, crush, pressure) = channels(share, channel);
                        assert_eq!(cut + thrust + crush + pressure, share,
                                   "the split stopped being a partition at share {share}");
                        assert!(pressure >= share.min(CONTACT_ENERGY_FLOOR),
                                "the floor was converted into a wound at share {share}");
                    }
                }
            }
        }
    }

    #[test]
    fn a_zero_length_segment_still_sends_everything_to_pressure() {
        // Both early returns predate crush and have to keep their meaning now
        // that pressure is no longer the inert column. A segment with no
        // direction has no axis to split about, so there is no honest way to
        // call any of its energy a cut, a thrust *or* a crush -- and a blunt
        // weapon is exactly the case where letting it through would look
        // reasonable.
        let club = crate::club().surface;
        let channel = WeaponBodyChannel {
            weapon_axis: Vec3::ZERO, weapon_relative_velocity: Vec3::Y,
            edge_factor: club.edge_factor, point_factor: club.point_factor,
            crush_factor: club.material.crush_factor(), zero_length: true };
        assert_eq!(channels(10_000, channel), (0, 0, 0, 10_000));
        // The other early return: a still weapon has a zero denominator, and
        // dividing the budget by it is undefined rather than blunt.
        let still = WeaponBodyChannel { weapon_axis: Vec3::X,
                                        weapon_relative_velocity: Vec3::ZERO,
                                        zero_length: false, ..channel };
        assert_eq!(channels(10_000, still), (0, 0, 0, 10_000));
    }

    #[test]
    fn transverse_motion_records_cut_and_axial_motion_records_thrust() {
        let transverse = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::Y,
                                             edge_factor: Fx::ONE, point_factor: Fx::ONE,
                                             crush_factor: Fx::ZERO, zero_length: false };
        let axial = WeaponBodyChannel { weapon_axis: Vec3::X, weapon_relative_velocity: Vec3::X,
                                       ..transverse };
        let (cut, thrust, _, _) = channels(16_384, transverse);
        assert!(cut > thrust);
        let (cut, thrust, _, _) = channels(16_384, axial);
        assert!(thrust > cut);
    }

    #[test]
    fn the_contact_corpus_has_a_documented_byte_order() {
        let zero = EnergyLedger::default();
        let mut all = Vec::new();
        for (tick, kind) in [ContactKind::WeaponWeapon, ContactKind::WeaponShield, ContactKind::WeaponBody].into_iter().enumerate() {
            let base = fact(0, 1, kind, 0, 0, 0);
            let f = ContactFact {
                key: ContactKey {
                    b_slot: match kind { ContactKind::WeaponShield => 0, ContactKind::WeaponBody => BODY_SLOT, _ => 1 },
                    ..base.key
                },
                volume: if kind == ContactKind::WeaponBody { 1 } else { 0xff },
                point: Vec3::Z,
                ..base
            };
            let row = ContactResolution { group_ordinal: 0, group_alpha_raw: 65_536, fact: f,
                impulse: ContactImpulse { key: f.key, on_a: Vec3::ZERO, on_b: Vec3::ZERO }, energy: zero,
                cut_raw: 0, thrust_raw: 0, crush_raw: 0, pressure_raw: 0,
                deflected_raw: 0, severed: false };
            all.push((tick as u32 + 1, row));
        }
        let ticks = [(0, &[][..], 0), (all[0].0, core::slice::from_ref(&all[0].1), 0),
                     (all[1].0, core::slice::from_ref(&all[1].1), 0),
                     (all[2].0, core::slice::from_ref(&all[2].1), 0)];
        let bytes = serialize_contact_corpus(&ticks);
        let mut hash = Hash64::new(); hash.write_bytes(&bytes);
        assert_eq!(bytes.len(), 591);
        assert_eq!(hash.finish(), 0x1adf_a9e0_1e36_edf9);
    }

    /// One expected resolution, transcribed from the reference's case table.
    /// Everything constant across the whole corpus -- generation zero, A in the
    /// right slot, normal +X, zero Y/Z, `deflected=0` -- is supplied by the
    /// writer rather than repeated eighteen times.
    struct Expected {
        ordinal: u32, alpha: u32,
        a_index: u32, b_index: u32, b_slot: u32, kind: u32,
        toi: i32, region: u32, point_x: i32,
        velocity_a: i32, velocity_b: i32, on_a: i32,
        energy: (u64, u64, u64),
        channels: (u64, u64, u64),
    }

    /// A weapon/weapon row at `toi`, whose contact point rides the global time.
    /// It names no region, because there is no anatomy on the far side of it.
    fn ww(ordinal: u32, alpha: u32, a_index: u32, toi: i32, on_a: i32,
          energy: (u64, u64, u64)) -> Expected {
        Expected { ordinal, alpha, a_index, b_index: a_index + 1, b_slot: 1, kind: 0,
                   toi, region: 0xff, point_x: toi, velocity_a: 65_536, velocity_b: 0, on_a,
                   energy, channels: (0, 0, 0) }
    }

    fn expect_u32(bytes: &mut Vec<u8>, value: u32) { bytes.extend_from_slice(&value.to_le_bytes()); }
    fn expect_u64(bytes: &mut Vec<u8>, value: u64) { bytes.extend_from_slice(&value.to_le_bytes()); }

    /// An XYZ vector whose Y and Z are zero, written as raw `i32` bits.
    fn expect_axial(bytes: &mut Vec<u8>, x: i32) {
        expect_u32(bytes, x as u32);
        expect_u32(bytes, 0);
        expect_u32(bytes, 0);
    }

    fn expect_key(bytes: &mut Vec<u8>, row: &Expected) {
        expect_u32(bytes, row.a_index);
        expect_u32(bytes, 0);
        expect_u32(bytes, 1);
        expect_u32(bytes, row.b_index);
        expect_u32(bytes, 0);
        expect_u32(bytes, row.b_slot);
        expect_u32(bytes, row.kind);
    }

    /// 8 ordinal/alpha + 84 fact + 52 impulse + 24 ledger + 32 channels = 200.
    fn expect_row(bytes: &mut Vec<u8>, row: &Expected) {
        expect_u32(bytes, row.ordinal);
        expect_u32(bytes, row.alpha);
        expect_key(bytes, row);
        expect_u32(bytes, row.toi as u32);
        expect_u32(bytes, row.region);
        expect_axial(bytes, row.point_x);
        expect_axial(bytes, 65_536);
        expect_axial(bytes, row.velocity_a);
        expect_axial(bytes, row.velocity_b);
        expect_key(bytes, row);
        expect_axial(bytes, row.on_a);
        expect_axial(bytes, -row.on_a);
        expect_u64(bytes, row.energy.0);
        expect_u64(bytes, row.energy.1);
        expect_u64(bytes, row.energy.2);
        expect_u64(bytes, row.channels.0);
        expect_u64(bytes, row.channels.1);
        expect_u64(bytes, row.channels.2);
        expect_u64(bytes, 0);
    }

    fn expect_case(bytes: &mut Vec<u8>, case_id: u32, groups: u32, cap_hits: u32,
                   rows: &[Expected], finals: &[(i32, i32)]) {
        expect_u32(bytes, case_id);
        expect_u32(bytes, finals.len() as u32);
        expect_u32(bytes, rows.len() as u32);
        expect_u32(bytes, groups);
        expect_u32(bytes, cap_hits);
        for row in rows { expect_row(bytes, row); }
        for &(x, velocity) in finals {
            expect_u32(bytes, x as u32);
            expect_u32(bytes, velocity as u32);
        }
    }

    /// The behavioral corpus written out by hand from
    /// `docs/reference/contact-solver.md`, with no solver in the loop. This is
    /// the point of the fixture: a corpus that re-serialized production rows
    /// would agree with a drifting solver by construction and prove nothing.
    fn expected_behavior_corpus() -> Vec<u8> {
        let mut bytes = b"ARPG-CONTACT-BEHAVIOR-V2".to_vec();

        expect_case(&mut bytes, 0, 0, 0, &[], &[]);

        // Both targets sit at the same x, so one mapped time carries two facts
        // and they share group ordinal zero, one alpha, and one ledger.
        expect_case(&mut bytes, 1, 1, 0, &[
            ww(0, 65_536, 0, 16_384, -32_768, (32_768, 16_384, 16_384)),
            Expected { b_index: 2, ..ww(0, 65_536, 0, 16_384, -32_768, (32_768, 16_384, 16_384)) },
        ], &[(16_384, 0), (40_960, 32_768), (40_960, 32_768)]);

        // Restitution 1 doubles the demanded impulse, so the group cannot take
        // full alpha and the greedy 16-bit search settles on 43,691.
        expect_case(&mut bytes, 2, 1, 0, &[
            ww(0, 43_691, 0, 16_384, -43_691, (32_768, 32_768, 0)),
            Expected { b_index: 2, ..ww(0, 43_691, 0, 16_384, -43_691, (32_768, 32_768, 0)) },
        ], &[(-1, -21_846), (49_152, 43_691), (49_152, 43_691)]);

        // Label 2 is an ally of label 0, so the momentum reaches it only
        // through label 1 -- two mapped times, two ordinals.
        expect_case(&mut bytes, 3, 2, 0, &[
            ww(0, 65_536, 0, 16_384, -65_536, (32_768, 32_768, 0)),
            ww(1, 65_536, 1, 32_768, -65_536, (32_768, 32_768, 0)),
        ], &[(16_384, 0), (32_768, 0), (65_536, 65_536)]);

        // Coincident at tick start, so the normal is the unconditional +X and
        // the post-exchange repeat is suppressed against that stored normal.
        expect_case(&mut bytes, 4, 1, 0, &[
            Expected { velocity_a: 16_384, velocity_b: -16_384,
                       ..ww(0, 65_536, 0, 0, -32_768, (4_096, 4_096, 0)) },
        ], &[(-16_384, -16_384), (16_384, 16_384)]);

        // A Newton's cradle exactly one group longer than the tick allows: the
        // ninth contact has no ordinal left and caps instead of resolving.
        let cradle: Vec<Expected> = (0..8)
            .map(|k| ww(k as u32, 65_536, k as u32, 4_096 * (k + 1), -65_536, (32_768, 32_768, 0)))
            .collect();
        expect_case(&mut bytes, 5, 8, 1, &cradle, &[
            (4_096, 0), (8_192, 0), (12_288, 0), (16_384, 0), (20_480, 0),
            (24_576, 0), (28_672, 0), (32_768, 0), (32_768, 0), (36_864, 0),
        ]);

        // The one row with widened channels: a purely axial strike puts every
        // dissipated raw above the 144 floor into thrust, and the floor itself
        // into pressure. Its point is where the tip lands, not the global time.
        // Its region is Head, and the zero is load-bearing: the body's five
        // volumes are coincident, so the choice falls all the way through the
        // contract's tuple to `BodyPart` order.
        expect_case(&mut bytes, 6, 1, 0, &[
            Expected { b_index: 1, b_slot: 0xff, kind: 2, point_x: 65_536,
                       region: AnatomyRegion::Head as u32, channels: (0, 16_240, 144),
                       ..ww(0, 65_536, 0, 32_768, -32_768, (32_768, 16_384, 16_384)) },
        ], &[(81_920, 32_768), (81_920, 32_768)]);

        bytes
    }

    #[test]
    fn the_behavioral_contact_corpus_has_literal_outcomes() {
        let expected = expected_behavior_corpus();
        assert_eq!(expected.len(), 3_548, "hand-built corpus is not the pinned length");
        let bytes = contact_behavior_corpus().unwrap();
        if let Some(offset) = (0..bytes.len().min(expected.len()))
            .find(|&index| bytes[index] != expected[index]) {
            // Report the containing 4-byte word: every field in this grammar is
            // word-aligned, so the word index is what locates the bad field.
            let word = offset / 4 * 4;
            panic!("production corpus differs at byte {offset} (word {}): produced {:02x?}, expected {:02x?}",
                   word / 4, &bytes[word..word + 4], &expected[word..word + 4]);
        }
        assert_eq!(bytes.len(), expected.len(), "production corpus has a different length");
        let mut hash = Hash64::new(); hash.write_bytes(&bytes);
        // Moved by v2-15, and by exactly one byte: case 6's body is now five
        // regional volumes rather than one anonymous capsule, so its fact names
        // the region it chose. The geometry is unchanged -- the five volumes
        // are the same coincident point the single capsule was -- and the
        // region byte went from `0xff` to Head's zero. Previously
        // `0xfe6ce41ec023c1e5`.
        assert_eq!(hash.finish(), 0x587b_0259_e877_105a);
    }

    #[test]
    fn contact_corpus_matches_on_eight_native_threads() {
        let expected = contact_behavior_corpus().unwrap();
        std::thread::scope(|scope| {
            let mut handles = Vec::new();
            for _ in 0..8 { handles.push(scope.spawn(contact_behavior_corpus)); }
            for handle in handles { assert_eq!(handle.join().unwrap().unwrap(), expected); }
        });
    }

    // Stage-1 normal LCP prototype. It is deliberately test-owned: World's
    // measured response columns, friction, and scratch ownership are still
    // gates before this arithmetic can enter authority.
    pub(crate) const DIRECTIONAL_MAX: usize = 8;

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum DirectionalReject { Capacity, Singular, Overflow, NoSolution }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct Rational { pub(crate) n: i128, pub(crate) d: i128 }

    impl Rational {
        fn new(n: i128, d: i128) -> Result<Rational, DirectionalReject> {
            if d == 0 { return Err(DirectionalReject::Singular); }
            let (n, d) = if d < 0 {
                (n.checked_neg().ok_or(DirectionalReject::Overflow)?,
                 d.checked_neg().ok_or(DirectionalReject::Overflow)?)
            } else { (n, d) };
            let mut a = n.unsigned_abs(); let mut b = d as u128;
            while b != 0 { let r = a % b; a = b; b = r; }
            let g = a.max(1) as i128;
            Ok(Rational { n: n / g, d: d / g })
        }
        fn integer(value: i64) -> Rational { Rational { n: value as i128, d: 1 } }
        fn sub(self, rhs: Rational) -> Result<Rational, DirectionalReject> {
            Rational::new(
                self.n.checked_mul(rhs.d).and_then(|a| rhs.n.checked_mul(self.d)
                    .and_then(|b| a.checked_sub(b))).ok_or(DirectionalReject::Overflow)?,
                self.d.checked_mul(rhs.d).ok_or(DirectionalReject::Overflow)?)
        }
        fn mul(self, rhs: Rational) -> Result<Rational, DirectionalReject> {
            Rational::new(self.n.checked_mul(rhs.n).ok_or(DirectionalReject::Overflow)?,
                          self.d.checked_mul(rhs.d).ok_or(DirectionalReject::Overflow)?)
        }
        fn div(self, rhs: Rational) -> Result<Rational, DirectionalReject> {
            Rational::new(self.n.checked_mul(rhs.d).ok_or(DirectionalReject::Overflow)?,
                          self.d.checked_mul(rhs.n).ok_or(DirectionalReject::Overflow)?)
        }
        fn nonnegative(self) -> bool { self.n >= 0 }
    }

    fn directional_linear_solve(
        matrix: &[[i64; DIRECTIONAL_MAX]; DIRECTIONAL_MAX], rhs: &[i64; DIRECTIONAL_MAX],
        indices: &[usize],
    ) -> Result<[Rational; DIRECTIONAL_MAX], DirectionalReject> {
        let zero = Rational::integer(0);
        let mut rows = [[zero; DIRECTIONAL_MAX + 1]; DIRECTIONAL_MAX];
        for (r, &i) in indices.iter().enumerate() {
            for (c, &j) in indices.iter().enumerate() { rows[r][c] = Rational::integer(matrix[i][j]); }
            rows[r][indices.len()] = Rational::integer(rhs[i]);
        }
        for column in 0..indices.len() {
            let pivot = (column..indices.len()).filter(|&r| rows[r][column].n != 0)
                .max_by_key(|&r| (rows[r][column].n.unsigned_abs(), core::cmp::Reverse(r)))
                .ok_or(DirectionalReject::Singular)?;
            rows.swap(column, pivot);
            for r in column + 1..indices.len() {
                if rows[r][column].n == 0 { continue; }
                let factor = rows[r][column].div(rows[column][column])?;
                for c in column..=indices.len() {
                    rows[r][c] = rows[r][c].sub(factor.mul(rows[column][c])?)?;
                }
            }
        }
        let mut answer = [zero; DIRECTIONAL_MAX];
        for r in (0..indices.len()).rev() {
            let mut value = rows[r][indices.len()];
            for c in r + 1..indices.len() { value = value.sub(rows[r][c].mul(answer[indices[c]])?)?; }
            answer[indices[r]] = value.div(rows[r][r])?;
        }
        Ok(answer)
    }

    pub(crate) fn directional_normal_lcp(
        matrix: &[[i64; DIRECTIONAL_MAX]; DIRECTIONAL_MAX],
        bias: &[i64; DIRECTIONAL_MAX], count: usize,
    ) -> Result<([Rational; DIRECTIONAL_MAX], u16), DirectionalReject> {
        if count > DIRECTIONAL_MAX { return Err(DirectionalReject::Capacity); }
        if count == 0 { return Ok(([Rational::integer(0); DIRECTIONAL_MAX], 0)); }
        let indices: Vec<usize> = (0..count).collect();
        directional_linear_solve(matrix, &[0; DIRECTIONAL_MAX], &indices)?;
        let mut saw_singular = false;
        for mask in 0u16..(1u16 << count) {
            let mut indices = [0usize; DIRECTIONAL_MAX]; let mut len = 0;
            for i in 0..count { if mask & (1 << i) != 0 { indices[len] = i; len += 1; } }
            let mut rhs = [0i64; DIRECTIONAL_MAX];
            for i in 0..count { rhs[i] = bias[i].checked_neg().ok_or(DirectionalReject::Overflow)?; }
            let lambda = if len == 0 { [Rational::integer(0); DIRECTIONAL_MAX] }
                else { match directional_linear_solve(matrix, &rhs, &indices[..len]) {
                    Ok(value) => value, Err(DirectionalReject::Singular) => { saw_singular = true; continue; },
                    Err(error) => return Err(error),
                }};
            if (0..count).any(|i| !lambda[i].nonnegative()) { continue; }
            let mut valid = true;
            for i in 0..count {
                let mut w = Rational::integer(bias[i]);
                for j in 0..count {
                    w = w.sub(Rational::integer(-matrix[i][j]).mul(lambda[j])?)?;
                }
                if !w.nonnegative() || (mask & (1 << i) != 0 && w.n != 0) { valid = false; break; }
            }
            if valid { return Ok((lambda, mask)); }
        }
        Err(if saw_singular { DirectionalReject::Singular } else { DirectionalReject::NoSolution })
    }

    pub(crate) fn directional_integerize(
        matrix: &[[i64; DIRECTIONAL_MAX]; DIRECTIONAL_MAX],
        bias: &[i64; DIRECTIONAL_MAX], rational: &[Rational; DIRECTIONAL_MAX], count: usize,
    ) -> Result<[i64; DIRECTIONAL_MAX], DirectionalReject> {
        if count > DIRECTIONAL_MAX { return Err(DirectionalReject::Capacity); }
        let mut classes = [[usize::MAX; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        let mut class_len = [0usize; DIRECTIONAL_MAX]; let mut classes_len = 0;
        let mut floor = [0i64; DIRECTIONAL_MAX];
        for i in 0..count {
            let quotient = rational[i].n.div_euclid(rational[i].d);
            floor[i] = i64::try_from(quotient).map_err(|_| DirectionalReject::Overflow)?;
            if rational[i].n.rem_euclid(rational[i].d) != 0 {
                let transposes = |a: usize, b: usize| {
                    bias[a] == bias[b]
                        && matrix[a][a] == matrix[b][b]
                        && matrix[a][b] == matrix[b][a]
                        && (0..count).filter(|k| *k != a && *k != b).all(|k| {
                            matrix[a][k] == matrix[b][k] && matrix[k][a] == matrix[k][b]
                        })
                };
                let same = (0..classes_len).find(|&class| {
                    let representative = classes[class][0];
                    rational[representative] == rational[i]
                        && transposes(representative, i)
                });
                let class = same.unwrap_or_else(|| { let class = classes_len; classes_len += 1; class });
                classes[class][class_len[class]] = i; class_len[class] += 1;
            }
        }
        let mut best: Option<((i64, [i64; DIRECTIONAL_MAX]), [i64; DIRECTIONAL_MAX])> = None;
        for choices in 0u16..(1u16 << classes_len) {
            let mut impulse = floor;
            for bit in 0..classes_len {
                if choices & (1 << bit) != 0 {
                    for member in 0..class_len[bit] {
                        let at = classes[bit][member];
                        impulse[at] = impulse[at].checked_add(1).ok_or(DirectionalReject::Overflow)?;
                    }
                }
            }
            if impulse[..count].iter().any(|value| *value < 0) { continue; }
            let mut maximum = 0i64; let mut valid = true;
            for i in 0..count {
                let mut residual = bias[i] as i128;
                for j in 0..count {
                    residual = residual.checked_add((matrix[i][j] as i128)
                        .checked_mul(impulse[j] as i128).ok_or(DirectionalReject::Overflow)?)
                        .ok_or(DirectionalReject::Overflow)?;
                }
                let residual = i64::try_from(residual).map_err(|_| DirectionalReject::Overflow)?;
                if residual < -1 || (impulse[i] > 0 && residual.abs() > 1) {
                    valid = false; break;
                }
                if impulse[i] > 0 { maximum = maximum.max(residual.abs()); }
            }
            if !valid { continue; }
            // Actual closure energy includes masses, initial velocities and
            // cross terms and belongs to the final World projection. A sum of
            // squared impulse words is not that energy. Pure integerization
            // scores target residual then canonical words; checkpoint A adds
            // projected energy between them.
            let score = (maximum, impulse);
            if best.as_ref().map_or(true, |old| score < old.0) { best = Some((score, impulse)); }
        }
        best.map(|row| row.1).ok_or(DirectionalReject::NoSolution)
    }

    fn three_equal_mass_energy(striker: i64, targets: i64) -> u64 {
        ((striker as i128 * striker as i128 + 2 * targets as i128 * targets as i128)
            / (2 * 65_536)) as u64
    }

    #[test]
    fn directional_response_cross_terms_are_load_bearing() {
        let mut matrix = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        matrix[0][0] = 2; matrix[0][1] = 1; matrix[1][0] = 1; matrix[1][1] = 2;
        let mut bias = [0; DIRECTIONAL_MAX]; bias[0] = -9; bias[1] = -9;
        let (answer, mask) = directional_normal_lcp(&matrix, &bias, 2).unwrap();
        assert_eq!((answer[0], answer[1], mask),
                   (Rational::integer(3), Rational::integer(3), 3));
        matrix[0][1] = 0; matrix[1][0] = 0;
        assert_ne!(directional_normal_lcp(&matrix, &bias, 2).unwrap().0[..2], answer[..2]);
    }

    #[test]
    fn directional_response_singular_blocks_are_rejected() {
        let mut matrix = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        matrix[0][0] = 1; matrix[0][1] = 2; matrix[1][0] = 2; matrix[1][1] = 4;
        let mut bias = [0; DIRECTIONAL_MAX]; bias[0] = -3; bias[1] = -6;
        assert_eq!(directional_normal_lcp(&matrix, &bias, 2), Err(DirectionalReject::Singular));
    }

    #[test]
    fn directional_response_opening_rows_are_inactive() {
        let matrix = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        let bias = [0; DIRECTIONAL_MAX];
        assert_eq!(directional_normal_lcp(&matrix, &bias, 0).unwrap().1, 0);
    }

    #[test]
    fn directional_response_refuses_more_than_eight_facts() {
        assert_eq!(directional_normal_lcp(&[[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX],
            &[0; DIRECTIONAL_MAX], 9), Err(DirectionalReject::Capacity));
    }

    #[test]
    fn directional_response_is_permutation_deterministic() {
        let mut a = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        a[0][0] = 2; a[0][1] = 1; a[1][0] = 1; a[1][1] = 3;
        let mut b = [0; DIRECTIONAL_MAX]; b[0] = -5; b[1] = -7;
        let original = directional_normal_lcp(&a, &b, 2).unwrap().0;
        let mut p = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        p[0][0] = 3; p[0][1] = 1; p[1][0] = 1; p[1][1] = 2;
        let mut pb = [0; DIRECTIONAL_MAX]; pb[0] = -7; pb[1] = -5;
        let permuted = directional_normal_lcp(&p, &pb, 2).unwrap().0;
        assert_eq!((original[0], original[1]), (permuted[1], permuted[0]));
    }

    #[test]
    fn directional_response_matches_the_two_simultaneous_restitution_cases() {
        let mut w = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        w[0][0] = 2; w[0][1] = 1; w[1][0] = 1; w[1][1] = 2;
        for (closing, expected, applied, q, energy) in [
            (65_536, Rational::new(65_536, 3).unwrap(), 21_845, -1, 10_922),
            (131_072, Rational::new(131_072, 3).unwrap(), 43_691, 1, 32_768),
        ] {
            let mut b = [0; DIRECTIONAL_MAX]; b[0] = -closing; b[1] = -closing;
            let (lambda, mask) = directional_normal_lcp(&w, &b, 2).unwrap();
            assert_eq!((lambda[0], lambda[1], mask), (expected, expected, 3));
            let integer = directional_integerize(&w, &b, &lambda, 2).unwrap();
            assert_eq!((integer[0], integer[1]), (applied, applied));
            assert_eq!(-closing + 3 * applied, q);
            assert_eq!(three_equal_mass_energy(65_536 - 2 * applied, applied), energy);
        }
    }

    #[test]
    fn directional_response_integerization_does_not_floor_every_coordinate() {
        let mut w = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        w[0][0] = 3; w[0][1] = 1; w[1][0] = 1; w[1][1] = 3;
        let mut b = [0; DIRECTIONAL_MAX]; b[0] = -3; b[1] = -5;
        let (lambda, _) = directional_normal_lcp(&w, &b, 2).unwrap();
        assert_eq!((lambda[0], lambda[1]),
                   (Rational::new(1, 2).unwrap(), Rational::new(3, 2).unwrap()));
        // Floor/floor is invalid at (-2,-2). The unequal rational coordinates
        // are not a symmetry class, so the bounded choices may round them in
        // opposite directions; canonical words choose (0,2).
        let integer = directional_integerize(&w, &b, &lambda, 2).unwrap();
        assert_eq!((integer[0], integer[1]), (0, 2));
    }

    #[test]
    fn directional_response_symmetric_rounding_survives_identity_permutation() {
        let mut w = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        w[0][0] = 2; w[0][1] = 1; w[1][0] = 1; w[1][1] = 2;
        let mut b = [0; DIRECTIONAL_MAX]; b[0] = -131_072; b[1] = -131_072;
        let rational = directional_normal_lcp(&w, &b, 2).unwrap().0;
        let original = directional_integerize(&w, &b, &rational, 2).unwrap();
        // Swapping the two physical contacts leaves W and b byte-identical.
        // Mapping the answer back must therefore also be identical; assigning
        // the extra raw unit by lexicographic coordinate would fail here.
        let permuted = directional_integerize(&w, &b, &rational, 2).unwrap();
        assert_eq!((original[0], original[1]), (permuted[1], permuted[0]));
        assert_eq!((original[0], original[1]), (43_691, 43_691));
    }

    #[test]
    fn directional_response_equal_lambdas_are_not_automatically_one_symmetry_class() {
        let mut w = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX];
        w[0][0] = 3; w[1][1] = 3; w[2][2] = 5;
        w[0][1] = 1; w[1][0] = 1;
        w[0][2] = 2; w[2][0] = 3;
        w[1][2] = 3; w[2][1] = 2;
        let mut b = [0; DIRECTIONAL_MAX]; b[0] = -2; b[1] = -2; b[2] = 0;
        let rational = [Rational::new(1, 2).unwrap(), Rational::new(1, 2).unwrap(),
                        Rational::integer(0), Rational::integer(0), Rational::integer(0),
                        Rational::integer(0), Rational::integer(0), Rational::integer(0)];
        // Rows and columns 0/1 have equal sorted multisets, but swapping the
        // coordinates changes their indexed coupling to row 2. They must keep
        // independent rounding bits; otherwise this valid canonical (0,1)
        // choice is unavailable.
        // The important contract is availability, not which choice wins once
        // World's projected energy joins the score. Independent bits include
        // both mixed rows; forcing one shared bit would leave only (0,0)/(1,1).
        // Exercise the real classifier through the number of combinations it
        // makes available: independent classes offer four choices. If a false
        // multiset match merges them, only two remain and this asymmetric
        // fixture has no valid integerization.
        let value = directional_integerize(&w, &b, &rational, 3)
            .expect("distinct indexed couplings must retain independent rounding choices");
        assert_eq!((value[0], value[1]), (0, 1));
    }

    #[test]
    fn directional_response_keeps_opening_constraints_inactive() {
        let mut w = [[0; DIRECTIONAL_MAX]; DIRECTIONAL_MAX]; w[0][0] = 1; w[1][1] = 1;
        let mut b = [0; DIRECTIONAL_MAX]; b[0] = 4; b[1] = -7;
        let (lambda, mask) = directional_normal_lcp(&w, &b, 2).unwrap();
        assert_eq!((lambda[0], lambda[1], mask),
                   (Rational::integer(0), Rational::integer(7), 2));
    }

    #[test]
    fn directional_response_checked_products_reject_overflow() {
        let huge = Rational { n: i128::MAX, d: 1 };
        assert_eq!(huge.mul(Rational::integer(2)), Err(DirectionalReject::Overflow));
    }

    // Stage-2 friction vocabulary, still test-only. These helpers deliberately
    // do not call the production proposal or group resolver: the actual World
    // projector fixture will supply their normal and tangent coordinates once
    // session 13's bounded normal search is stable.
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct CanonicalTangents {
        pub(crate) axis: usize, pub(crate) first: Vec3, pub(crate) second: Vec3,
    }

    pub(crate) fn canonical_tangents(normal: Vec3) -> Result<CanonicalTangents, DirectionalReject> {
        let normal = normal.normalized_or_zero();
        if normal == Vec3::ZERO { return Err(DirectionalReject::NoSolution); }
        let alignments = [normal.x.raw().abs(), normal.y.raw().abs(), normal.z.raw().abs()];
        // `min_by_key` keeps the first equal element: X, then Y, then Z is the
        // tie rule rather than an accident of a later sort.
        let axis = (0..3).min_by_key(|&at| alignments[at])
            .expect("three Cartesian axes");
        let cartesian = [Vec3::X, Vec3::Y, Vec3::Z][axis];
        let first = cartesian.cross(normal).normalized_or_zero();
        let second = normal.cross(first).normalized_or_zero();
        if first == Vec3::ZERO || second == Vec3::ZERO {
            return Err(DirectionalReject::NoSolution);
        }
        Ok(CanonicalTangents { axis, first, second })
    }

    pub(crate) fn tangent_limit_raw(friction_raw: i32, normal_impulse_raw: i64)
        -> Result<i64, DirectionalReject>
    {
        if friction_raw < 0 || normal_impulse_raw < 0 {
            return Err(DirectionalReject::NoSolution);
        }
        let product = (friction_raw as i128).checked_mul(normal_impulse_raw as i128)
            .ok_or(DirectionalReject::Overflow)?;
        i64::try_from(product / Fx::ONE.raw() as i128)
            .map_err(|_| DirectionalReject::Overflow)
    }

    pub(crate) fn inside_friction_box_and_cone(
        first_raw: i64, second_raw: i64, limit_raw: i64,
    ) -> Result<bool, DirectionalReject> {
        if limit_raw < 0 { return Err(DirectionalReject::NoSolution); }
        if first_raw.unsigned_abs() > limit_raw as u64
            || second_raw.unsigned_abs() > limit_raw as u64 {
            return Ok(false);
        }
        let square = (first_raw as i128).checked_mul(first_raw as i128)
            .and_then(|value| (second_raw as i128).checked_mul(second_raw as i128)
                .and_then(|other| value.checked_add(other)))
            .ok_or(DirectionalReject::Overflow)?;
        let limit_square = (limit_raw as i128).checked_mul(limit_raw as i128)
            .ok_or(DirectionalReject::Overflow)?;
        Ok(square <= limit_square)
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct FrictionClassification {
        pub(crate) normal_valid: bool,
        pub(crate) cone_valid: bool,
        pub(crate) static_valid: bool,
        pub(crate) sliding_valid: bool,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum StaticSearchReject {
        Attribution, UnsupportedNonPlanar, MissingNormalBracket, MissingTangentBracket,
        NonAdjacentBracket, Arithmetic, Saturation, Capacity, Budget, Projector,
        RestitutionGap, Cone, Energy, NoCandidate, Ambiguous, Permutation,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum FullDomainContactReject {
        Attribution, UnsupportedGeometry, Arithmetic, Saturation, Capacity, Budget,
        Range, UnsupportedNonlinear, NormalGap, NormalEnergy, Ambiguous, Projector,
        MissingTangentBracket, TangentGap, Cone, UnsupportedCoupling, StaticEnergy,
        NoStaticCandidate, Permutation,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum ResidualTrustReject {
        Attribution, UnsupportedGeometry, Arithmetic, Saturation, Capacity, Budget,
        Projector, Nonlinear, Singular, Plateau, Cone, Energy, Ambiguous,
        NoConvergence, Permutation,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum SeedProvenanceReject {
        Attribution, Arithmetic, Saturation, Capacity, Budget, Projector, Ambiguous,
        Plateau, Nonlinear, Singular, Cone, Energy,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct LiftedCoordinate {
        velocity_raw: i32, momentum_remainder: i64,
        position_raw: i32, position_remainder: i64,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum LiftedReject { Mass, NonCanonical, Arithmetic, Saturation, Capacity, UnsupportedAlpha,
                        UnsupportedInterval }

    fn validate_lifted(value: LiftedCoordinate, mass_raw: i32) -> Result<(), LiftedReject> {
        if mass_raw <= 0 { return Err(LiftedReject::Mass); }
        let position_denominator = (mass_raw as i64).checked_mul(65_536)
            .ok_or(LiftedReject::Arithmetic)?;
        if value.momentum_remainder.unsigned_abs() >= mass_raw as u64
            || value.position_remainder.unsigned_abs() >= position_denominator as u64 {
            return Err(LiftedReject::NonCanonical);
        }
        if (value.velocity_raw > 0 && value.momentum_remainder < 0)
            || (value.velocity_raw < 0 && value.momentum_remainder > 0)
            || (value.position_raw > 0 && value.position_remainder < 0)
            || (value.position_raw < 0 && value.position_remainder > 0) {
            return Err(LiftedReject::NonCanonical);
        }
        Ok(())
    }

    fn lifted_impulse(
        value: LiftedCoordinate, mass_raw: i32, impulse_raw: i64, alpha_raw: u32,
    ) -> Result<LiftedCoordinate, LiftedReject> {
        validate_lifted(value, mass_raw)?;
        if alpha_raw != 65_536 { return Err(LiftedReject::UnsupportedAlpha); }
        let momentum = (mass_raw as i128).checked_mul(value.velocity_raw as i128)
            .and_then(|word| word.checked_add(value.momentum_remainder as i128))
            .and_then(|word| (impulse_raw as i128).checked_mul(65_536)
                .and_then(|impulse| word.checked_add(impulse)))
            .ok_or(LiftedReject::Arithmetic)?;
        let quotient = momentum / mass_raw as i128;
        let velocity_raw = i32::try_from(quotient).map_err(|_| LiftedReject::Saturation)?;
        let remainder = momentum.checked_sub((mass_raw as i128).checked_mul(quotient)
            .ok_or(LiftedReject::Arithmetic)?).ok_or(LiftedReject::Arithmetic)?;
        let momentum_remainder = i64::try_from(remainder).map_err(|_| LiftedReject::Saturation)?;
        Ok(LiftedCoordinate { velocity_raw, momentum_remainder, ..value })
    }

    fn integrate_lifted(
        value: LiftedCoordinate, mass_raw: i32, dt_raw: u32,
    ) -> Result<LiftedCoordinate, LiftedReject> {
        validate_lifted(value, mass_raw)?;
        if dt_raw > 65_536 { return Err(LiftedReject::UnsupportedInterval); }
        let momentum = (mass_raw as i128).checked_mul(value.velocity_raw as i128)
            .and_then(|word| word.checked_add(value.momentum_remainder as i128))
            .ok_or(LiftedReject::Arithmetic)?;
        let position_denominator = (mass_raw as i128).checked_mul(65_536)
            .ok_or(LiftedReject::Arithmetic)?;
        let numerator = position_denominator.checked_mul(value.position_raw as i128)
            .and_then(|word| word.checked_add(value.position_remainder as i128))
            .and_then(|word| momentum.checked_mul(dt_raw as i128)
                .and_then(|step| word.checked_add(step))).ok_or(LiftedReject::Arithmetic)?;
        let quotient = numerator / position_denominator;
        let position_raw = i32::try_from(quotient).map_err(|_| LiftedReject::Saturation)?;
        let remainder = numerator.checked_sub(position_denominator.checked_mul(quotient)
            .ok_or(LiftedReject::Arithmetic)?).ok_or(LiftedReject::Arithmetic)?;
        let position_remainder = i64::try_from(remainder).map_err(|_| LiftedReject::Saturation)?;
        Ok(LiftedCoordinate { position_raw, position_remainder, ..value })
    }

    fn lifted_energy(value: LiftedCoordinate, mass_raw: i32)
        -> Result<(i128, i128), LiftedReject>
    {
        validate_lifted(value, mass_raw)?;
        let momentum = (mass_raw as i128).checked_mul(value.velocity_raw as i128)
            .and_then(|word| word.checked_add(value.momentum_remainder as i128))
            .ok_or(LiftedReject::Arithmetic)?;
        Ok((momentum.checked_mul(momentum).ok_or(LiftedReject::Arithmetic)?,
            (mass_raw as i128).checked_mul(2).ok_or(LiftedReject::Arithmetic)?))
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct LiftedOwner {
        body_mass: i32, common: LiftedCoordinate,
        held_count: usize, held_mass: [i32; 2], relative: [LiftedCoordinate; 2],
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    struct LiftedOwner3 { axes: [LiftedOwner; 3] }

    fn validate_owner3(value: LiftedOwner3) -> Result<(), LiftedReject> {
        for axis in &value.axes { validate_owner(*axis)?; }
        if value.axes[2].common != (LiftedCoordinate {
            velocity_raw: 0, momentum_remainder: 0,
            position_raw: 0, position_remainder: 0,
        }) { return Err(LiftedReject::NonCanonical); }
        if value.axes[1].body_mass != value.axes[0].body_mass
            || value.axes[2].body_mass != value.axes[0].body_mass
            || value.axes[1].held_count != value.axes[0].held_count
            || value.axes[2].held_count != value.axes[0].held_count
            || value.axes[1].held_mass != value.axes[0].held_mass
            || value.axes[2].held_mass != value.axes[0].held_mass {
            return Err(LiftedReject::NonCanonical);
        }
        Ok(())
    }

    fn owner3_impulse(
        value: LiftedOwner3, body: [i64; 3], held: [[i64; 3]; 2],
    ) -> Result<LiftedOwner3, LiftedReject> {
        if body[2] != 0 { return Err(LiftedReject::NonCanonical); }
        validate_owner3(value)?;
        let mut next = value;
        for axis in 0..3 {
            next.axes[axis] = owner_impulse(value.axes[axis], body[axis],
                [held[0][axis], held[1][axis]])?;
        }
        Ok(next)
    }

    fn integrate_owner3(value: LiftedOwner3, dt_raw: u32)
        -> Result<LiftedOwner3, LiftedReject>
    {
        validate_owner3(value)?;
        let mut next = value;
        for axis in 0..3 { next.axes[axis] = integrate_owner(value.axes[axis], dt_raw)?; }
        Ok(next)
    }

    fn owner3_momentum(value: LiftedOwner3) -> Result<[i128; 3], LiftedReject> {
        validate_owner3(value)?;
        Ok([owner_momentum(value.axes[0])?, owner_momentum(value.axes[1])?,
            owner_momentum(value.axes[2])?])
    }

    fn owner3_energy(value: LiftedOwner3) -> Result<Rational, LiftedReject> {
        validate_owner3(value)?;
        let mut total = Rational { n: 0, d: 1 };
        for axis in value.axes {
            let (numerator, denominator) = owner_energy_numerator(axis)?;
            let next_n = total.n.checked_mul(denominator)
                .and_then(|left| numerator.checked_mul(total.d)
                    .and_then(|right| left.checked_add(right)))
                .ok_or(LiftedReject::Arithmetic)?;
            let next_d = total.d.checked_mul(denominator).ok_or(LiftedReject::Arithmetic)?;
            total = Rational::new(next_n, next_d).map_err(|_| LiftedReject::Arithmetic)?;
        }
        Ok(total)
    }

    fn validate_owner(value: LiftedOwner) -> Result<(), LiftedReject> {
        if value.held_count > 2 { return Err(LiftedReject::Capacity); }
        if value.body_mass <= 0 { return Err(LiftedReject::Mass); }
        for at in value.held_count..2 {
            if value.held_mass[at] != 0 || value.relative[at] != (LiftedCoordinate {
                velocity_raw: 0, momentum_remainder: 0, position_raw: 0, position_remainder: 0,
            }) { return Err(LiftedReject::NonCanonical); }
        }
        let owner_mass = value.held_mass[..value.held_count].iter()
            .try_fold(value.body_mass as i64, |sum, mass| {
                if *mass <= 0 { None } else { sum.checked_add(*mass as i64) }
            }).ok_or(LiftedReject::Mass)?;
        let owner_mass = i32::try_from(owner_mass).map_err(|_| LiftedReject::Saturation)?;
        validate_lifted(value.common, owner_mass)?;
        for at in 0..value.held_count { validate_lifted(value.relative[at], value.held_mass[at])?; }
        Ok(())
    }

    fn owner_impulse(
        value: LiftedOwner, body_impulse: i64, held_impulse: [i64; 2],
    ) -> Result<LiftedOwner, LiftedReject> {
        validate_owner(value)?;
        if held_impulse[value.held_count..].iter().any(|word| *word != 0) {
            return Err(LiftedReject::NonCanonical);
        }
        let mut next = value;
        let owner_mass = value.held_mass[..value.held_count].iter()
            .fold(value.body_mass, |sum, mass| sum.checked_add(*mass).unwrap());
        next.common = lifted_impulse(value.common, owner_mass, body_impulse, 65_536)?;
        for at in 0..value.held_count {
            next.relative[at] = lifted_impulse(value.relative[at], value.held_mass[at],
                                               held_impulse[at], 65_536)?;
        }
        Ok(next)
    }

    fn owner_momentum(value: LiftedOwner) -> Result<i128, LiftedReject> {
        validate_owner(value)?;
        let owner_mass = value.held_mass[..value.held_count].iter()
            .fold(value.body_mass, |sum, mass| sum + *mass);
        let momentum = |coordinate: LiftedCoordinate, mass: i32| (mass as i128)
            * coordinate.velocity_raw as i128 + coordinate.momentum_remainder as i128;
        let mut total = momentum(value.common, owner_mass);
        for at in 0..value.held_count { total += momentum(value.relative[at], value.held_mass[at]); }
        Ok(total)
    }

    fn owner_energy_numerator(value: LiftedOwner) -> Result<(i128, i128), LiftedReject> {
        validate_owner(value)?;
        let owner_mass = value.held_mass[..value.held_count].iter()
            .fold(value.body_mass, |sum, mass| sum + *mass);
        let momentum = |coordinate: LiftedCoordinate, mass: i32| (mass as i128)
            * coordinate.velocity_raw as i128 + coordinate.momentum_remainder as i128;
        let common_p = momentum(value.common, owner_mass);
        // Common velocity is common_p/owner_mass. Each held absolute velocity
        // adds relative_p/m; the shared denominator keeps the cross term exact.
        let held_product = value.held_mass[..value.held_count].iter()
            .try_fold(1i128, |product, mass| product.checked_mul(*mass as i128))
            .ok_or(LiftedReject::Arithmetic)?;
        let mut numerator = (value.body_mass as i128).checked_mul(common_p)
            .and_then(|word| word.checked_mul(common_p))
            .and_then(|word| word.checked_mul(held_product)).ok_or(LiftedReject::Arithmetic)?;
        let denominator = (2i128).checked_mul(owner_mass as i128)
            .and_then(|word| word.checked_mul(owner_mass as i128))
            .and_then(|word| word.checked_mul(held_product)).ok_or(LiftedReject::Arithmetic)?;
        for at in 0..value.held_count {
            let mass = value.held_mass[at] as i128;
            let relative_p = momentum(value.relative[at], value.held_mass[at]);
            let absolute_n = common_p * mass + relative_p * owner_mass as i128;
            numerator = numerator.checked_add(absolute_n.checked_mul(absolute_n)
                .and_then(|word| word.checked_mul(held_product / mass))
                .ok_or(LiftedReject::Arithmetic)?).ok_or(LiftedReject::Arithmetic)?;
        }
        let reduced = Rational::new(numerator, denominator).map_err(|_| LiftedReject::Arithmetic)?;
        Ok((reduced.n, reduced.d))
    }

    fn held_absolute_velocity(value: LiftedOwner, at: usize)
        -> Result<(i128, i128), LiftedReject>
    {
        validate_owner(value)?; if at >= value.held_count { return Err(LiftedReject::NonCanonical); }
        let owner_mass = value.held_mass[..value.held_count].iter()
            .fold(value.body_mass, |sum, mass| sum + *mass) as i128;
        let mass = value.held_mass[at] as i128;
        let common = owner_mass * value.common.velocity_raw as i128
            + value.common.momentum_remainder as i128;
        let relative = mass * value.relative[at].velocity_raw as i128
            + value.relative[at].momentum_remainder as i128;
        let numerator = common * mass + relative * owner_mass;
        let denominator = owner_mass * mass;
        Ok((numerator / denominator, numerator % denominator))
    }

    fn integrate_owner(value: LiftedOwner, dt_raw: u32) -> Result<LiftedOwner, LiftedReject> {
        validate_owner(value)?; let mut next = value;
        let owner_mass = value.held_mass[..value.held_count].iter()
            .try_fold(value.body_mass, |sum, mass| sum.checked_add(*mass))
            .ok_or(LiftedReject::Saturation)?;
        next.common = integrate_lifted(value.common, owner_mass, dt_raw)?;
        for at in 0..value.held_count {
            next.relative[at] = integrate_lifted(value.relative[at], value.held_mass[at], dt_raw)?;
        }
        Ok(next)
    }

    fn held_absolute_position(value: LiftedOwner, at: usize)
        -> Result<(i128, i128), LiftedReject>
    {
        validate_owner(value)?; if at >= value.held_count { return Err(LiftedReject::NonCanonical); }
        let owner_mass = value.held_mass[..value.held_count].iter()
            .try_fold(value.body_mass, |sum, mass| sum.checked_add(*mass))
            .ok_or(LiftedReject::Saturation)? as i128;
        let mass = value.held_mass[at] as i128; let scale = 65_536i128;
        let common = owner_mass * scale * value.common.position_raw as i128
            + value.common.position_remainder as i128;
        let relative = mass * scale * value.relative[at].position_raw as i128
            + value.relative[at].position_remainder as i128;
        let numerator = common * mass + relative * owner_mass;
        let denominator = owner_mass * mass * scale;
        Ok((numerator / denominator, numerator % denominator))
    }

    pub(crate) fn invariant_perturbation_pair(direction: Vec3, h: i32)
        -> Result<(Vec3, Vec3), SeedProvenanceReject>
    {
        if direction == Vec3::ZERO { return Err(SeedProvenanceReject::Plateau); }
        if h <= 0 { return Err(SeedProvenanceReject::Arithmetic); }
        let ideal = [direction.x.raw(), direction.y.raw(), direction.z.raw()];
        let error = |value: Vec3| -> Result<i128, SeedProvenanceReject> {
            let words = [value.x.raw(), value.y.raw(), value.z.raw()];
            let mut sum = 0i128;
            for axis in 0..3 {
                let delta = (65_536i128).checked_mul(words[axis] as i128)
                    .and_then(|word| (h as i128).checked_mul(ideal[axis] as i128)
                        .and_then(|target| word.checked_sub(target)))
                    .ok_or(SeedProvenanceReject::Arithmetic)?;
                sum = sum.checked_add(delta.checked_mul(delta)
                    .ok_or(SeedProvenanceReject::Arithmetic)?)
                    .ok_or(SeedProvenanceReject::Arithmetic)?;
            }
            Ok(sum)
        };
        let mut toward = [0i32; 3]; let mut fractional = [usize::MAX; 3]; let mut classes = 0;
        for axis in 0..3 {
            let product = (ideal[axis] as i128).checked_mul(h as i128)
                .ok_or(SeedProvenanceReject::Arithmetic)?;
            toward[axis] = i32::try_from(product / 65_536)
                .map_err(|_| SeedProvenanceReject::Saturation)?;
            if product % 65_536 != 0 {
                if classes == 2 { return Err(SeedProvenanceReject::Capacity); }
                fractional[axis] = classes; classes += 1;
            }
        }
        let mut selected = None; let mut minimum = i128::MAX; let mut tied = false;
        for mask in 0..(1usize << classes) {
            let mut words = toward;
            for axis in 0..3 {
                if fractional[axis] != usize::MAX && mask & (1 << fractional[axis]) != 0 {
                    words[axis] = words[axis].checked_add(if ideal[axis] < 0 { -1 } else { 1 })
                        .ok_or(SeedProvenanceReject::Saturation)?;
                }
            }
            let plus = Vec3::new(Fx::from_raw(words[0]), Fx::from_raw(words[1]), Fx::from_raw(words[2]));
            if plus == Vec3::ZERO { continue; }
            let pair = (plus, -plus);
            let score = error(pair.0)?;
            if score < minimum { minimum = score; selected = Some(pair); tied = false; }
            else if score == minimum && selected != Some(pair) { tied = true; }
        }
        if tied { return Err(SeedProvenanceReject::Ambiguous); }
        selected.ok_or(SeedProvenanceReject::Plateau)
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct RationalColumn {
        pub(crate) numerator: [i128; 3],
        pub(crate) denominator: i128,
    }

    pub(crate) const RESIDUAL_TRUST_RADII: [i32; 4] = [64, 16, 4, 1];

    pub(crate) fn solve_rational_columns(
        columns: [RationalColumn; 3], residual: [i128; 3],
    ) -> Result<[Rational; 3], ResidualTrustReject> {
        if columns.iter().any(|column| column.numerator == [0; 3]) {
            return Err(ResidualTrustReject::Plateau);
        }
        let common = columns[0].denominator;
        if common <= 0 || columns.iter().any(|column| column.denominator != common) {
            return Err(ResidualTrustReject::Arithmetic);
        }
        let a = |row: usize, column: usize| columns[column].numerator[row];
        let det = |m: [[i128; 3]; 3]| -> Result<i128, ResidualTrustReject> {
            let positive = m[0][0].checked_mul(m[1][1]).and_then(|v| v.checked_mul(m[2][2]))
                .and_then(|v| m[0][1].checked_mul(m[1][2]).and_then(|w| w.checked_mul(m[2][0])).and_then(|w| v.checked_add(w)))
                .and_then(|v| m[0][2].checked_mul(m[1][0]).and_then(|w| w.checked_mul(m[2][1])).and_then(|w| v.checked_add(w)))
                .ok_or(ResidualTrustReject::Arithmetic)?;
            let negative = m[0][2].checked_mul(m[1][1]).and_then(|v| v.checked_mul(m[2][0]))
                .and_then(|v| m[0][0].checked_mul(m[1][2]).and_then(|w| w.checked_mul(m[2][1])).and_then(|w| v.checked_add(w)))
                .and_then(|v| m[0][1].checked_mul(m[1][0]).and_then(|w| w.checked_mul(m[2][2])).and_then(|w| v.checked_add(w)))
                .ok_or(ResidualTrustReject::Arithmetic)?;
            positive.checked_sub(negative).ok_or(ResidualTrustReject::Arithmetic)
        };
        let matrix = [[a(0,0),a(0,1),a(0,2)], [a(1,0),a(1,1),a(1,2)],
                      [a(2,0),a(2,1),a(2,2)]];
        let denominator = det(matrix)?;
        if denominator == 0 { return Err(ResidualTrustReject::Singular); }
        let mut rhs = [0i128; 3];
        for row in 0..3 {
            rhs[row] = residual[row].checked_neg().and_then(|v| v.checked_mul(common))
                .ok_or(ResidualTrustReject::Arithmetic)?;
        }
        let mut answer = [Rational { n: 0, d: 1 }; 3];
        for column in 0..3 {
            let mut replaced = matrix;
            for row in 0..3 { replaced[row][column] = rhs[row]; }
            let numerator = det(replaced)?;
            answer[column] = Rational::new(numerator, denominator)
                .map_err(|_| ResidualTrustReject::Arithmetic)?;
        }
        Ok(answer)
    }

    pub(crate) fn symmetric_residual_column(
        plus: [i32; 3], minus: [i32; 3], h: i32,
    ) -> Result<RationalColumn, ResidualTrustReject> {
        if h <= 0 { return Err(ResidualTrustReject::Arithmetic); }
        let mut numerator = [0i128; 3];
        for axis in 0..3 {
            numerator[axis] = (plus[axis] as i128).checked_sub(minus[axis] as i128)
                .ok_or(ResidualTrustReject::Arithmetic)?;
        }
        Ok(RationalColumn { numerator, denominator: (h as i128).checked_mul(2)
            .ok_or(ResidualTrustReject::Arithmetic)? })
    }

    pub(crate) fn midpoint_is_central(
        plus: [i32; 3], centre: [i32; 3], minus: [i32; 3], slack: i32,
    ) -> Result<(), ResidualTrustReject> {
        if slack < 0 { return Err(ResidualTrustReject::Arithmetic); }
        for axis in 0..3 {
            let curvature = plus[axis] as i64 + minus[axis] as i64
                - 2i64 * centre[axis] as i64;
            if curvature.unsigned_abs() > slack as u64 {
                return Err(ResidualTrustReject::Nonlinear);
            }
        }
        Ok(())
    }

    pub(crate) fn rational_floor_ceil(value: Rational)
        -> Result<[i128; 2], ResidualTrustReject>
    {
        if value.d <= 0 { return Err(ResidualTrustReject::Arithmetic); }
        let floor = value.n.div_euclid(value.d);
        let ceil = if value.n.rem_euclid(value.d) == 0 { floor }
            else { floor.checked_add(1).ok_or(ResidualTrustReject::Arithmetic)? };
        Ok([floor, ceil])
    }

    pub(crate) fn opposed_coordinate_perturbations(
        direction: Vec3, h: i32,
    ) -> Result<Vec<(Vec3, Vec3)>, ResidualTrustReject> {
        if h <= 0 { return Err(ResidualTrustReject::Arithmetic); }
        let components = [direction.x.raw(), direction.y.raw(), direction.z.raw()];
        let mut toward = [0i32; 3]; let mut fractional = [usize::MAX; 3]; let mut classes = 0;
        for axis in 0..3 {
            let product = (components[axis] as i128).checked_mul(h as i128)
                .ok_or(ResidualTrustReject::Arithmetic)?;
            toward[axis] = i32::try_from(product / 65_536)
                .map_err(|_| ResidualTrustReject::Saturation)?;
            if product % 65_536 != 0 {
                if classes == 2 { return Err(ResidualTrustReject::Capacity); }
                fractional[axis] = classes; classes += 1;
            }
        }
        let mut pairs: Vec<(Vec3, Vec3)> = Vec::new();
        for mask in 0..(1usize << classes) {
            let mut words = toward;
            for axis in 0..3 {
                if fractional[axis] != usize::MAX && mask & (1 << fractional[axis]) != 0 {
                    words[axis] = words[axis].checked_add(if components[axis] < 0 { -1 } else { 1 })
                        .ok_or(ResidualTrustReject::Saturation)?;
                }
            }
            let plus = Vec3::new(Fx::from_raw(words[0]), Fx::from_raw(words[1]), Fx::from_raw(words[2]));
            if plus != Vec3::ZERO && !pairs.iter().any(|pair| pair.0 == plus) {
                pairs.push((plus, -plus));
            }
        }
        if pairs.is_empty() { return Err(ResidualTrustReject::Plateau); }
        Ok(pairs)
    }

    /// Expand the session-29 grammar without observing any response. Keeping
    /// routes here, before deduplication by their final XYZ words, makes the
    /// declared 2 * 4 * 4 * 5 bound independently measurable.
    pub(crate) fn static_candidate_grammar(
        normal: Vec3, magnitudes: [i32; 2], tangent_brackets: [[i32; 2]; 2],
    ) -> Result<Vec<Vec3>, StaticSearchReject> {
        if normal.z != Fx::ZERO { return Err(StaticSearchReject::UnsupportedNonPlanar); }
        if magnitudes[0] <= 0 || magnitudes[1].checked_sub(magnitudes[0]) != Some(1) {
            return Err(StaticSearchReject::MissingNormalBracket);
        }
        for pair in tangent_brackets {
            if pair[1].checked_sub(pair[0]) != Some(1) {
                return Err(StaticSearchReject::NonAdjacentBracket);
            }
        }
        let basis = canonical_tangents(normal).map_err(|_| StaticSearchReject::Arithmetic)?;
        let mut out = Vec::with_capacity(160);
        for magnitude in magnitudes {
            let components = [normal.x.raw(), normal.y.raw(), normal.z.raw()];
            let mut lower = [0i32; 3]; let mut fractional = [usize::MAX; 3]; let mut classes = 0;
            for axis in 0..3 {
                let product = -(components[axis] as i128).checked_mul(magnitude as i128)
                    .ok_or(StaticSearchReject::Arithmetic)?;
                let toward_zero = product / 65_536;
                lower[axis] = i32::try_from(toward_zero).map_err(|_| StaticSearchReject::Saturation)?;
                if product % 65_536 != 0 {
                    if classes == 2 { return Err(StaticSearchReject::UnsupportedNonPlanar); }
                    fractional[axis] = classes; classes += 1;
                }
            }
            let class_count = 1usize << classes;
            for mask in 0..class_count {
                let mut words = lower;
                for axis in 0..3 {
                    if fractional[axis] != usize::MAX && mask & (1 << fractional[axis]) != 0 {
                        words[axis] = words[axis].checked_add(if components[axis] > 0 { -1 } else { 1 })
                            .ok_or(StaticSearchReject::Saturation)?;
                    }
                }
                let normal_vector = Vec3::new(Fx::from_raw(words[0]), Fx::from_raw(words[1]), Fx::from_raw(words[2]));
                for first in tangent_brackets[0] {
                    for second in tangent_brackets[1] {
                        for offset in [(0,0),(-1,0),(1,0),(0,-1),(0,1)] {
                            let first = first.checked_add(offset.0).ok_or(StaticSearchReject::Saturation)?;
                            let second = second.checked_add(offset.1).ok_or(StaticSearchReject::Saturation)?;
                            let mut final_words = [normal_vector.x.raw(), normal_vector.y.raw(), normal_vector.z.raw()];
                            let first_basis = [basis.first.x.raw(), basis.first.y.raw(), basis.first.z.raw()];
                            let second_basis = [basis.second.x.raw(), basis.second.y.raw(), basis.second.z.raw()];
                            for axis in 0..3 {
                                let tangent = (first_basis[axis] as i128).checked_mul(first as i128)
                                    .and_then(|value| (second_basis[axis] as i128).checked_mul(second as i128)
                                        .and_then(|other| value.checked_add(other)))
                                    .ok_or(StaticSearchReject::Arithmetic)? / 65_536;
                                let tangent = i32::try_from(tangent).map_err(|_| StaticSearchReject::Saturation)?;
                                final_words[axis] = final_words[axis].checked_add(tangent)
                                    .ok_or(StaticSearchReject::Saturation)?;
                            }
                            out.push(Vec3::new(Fx::from_raw(final_words[0]), Fx::from_raw(final_words[1]),
                                               Fx::from_raw(final_words[2])));
                        }
                    }
                }
            }
        }
        if out.len() > 160 { return Err(StaticSearchReject::Capacity); }
        Ok(out)
    }

    /// Classify measured contact words without choosing a response. The
    /// neighbor crosses come from two adjacent `u16 Angle` probes; accepting a
    /// least-bad same-sign pair would turn a failed angular search into KKT by
    /// vocabulary alone.
    pub(crate) fn classify_committed_friction(
        q_pre: i32, q_post: i32, restitution_raw: i32,
        normal_impulse_raw: i64, friction_raw: i32,
        physical_tangent: [i64; 3], physical_outward_neighbors: [[i64; 3]; 2],
        post_slip: [i32; 2], neighbor_cross: [i128; 2], tangent_dot: i128,
        initial_numerator: i128, normal_numerator: i128, combined_numerator: i128,
        mirror_tie: bool,
    ) -> Result<FrictionClassification, DirectionalReject> {
        if q_pre >= 0 || !(0..=Fx::ONE.raw()).contains(&restitution_raw)
            || normal_impulse_raw <= 0 || !(0..=Fx::ONE.raw()).contains(&friction_raw)
            || initial_numerator < 0 || normal_numerator < 0
            || combined_numerator < 0 {
            return Err(DirectionalReject::NoSolution);
        }
        let cone_limit = tangent_limit_raw(friction_raw, normal_impulse_raw)?;
        let target = -((restitution_raw as i128 * q_pre as i128) / Fx::ONE.raw() as i128);
        let target = i32::try_from(target).map_err(|_| DirectionalReject::Overflow)?;
        let normal_valid = (q_post as i64 - target as i64).unsigned_abs() <= 1;
        let squared_length = |words: [i64; 3]| words.into_iter().try_fold(0i128, |sum, word| {
            sum.checked_add((word as i128).checked_mul(word as i128)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)
        });
        let physical_square = squared_length(physical_tangent)?;
        let limit_square = (cone_limit as i128).checked_mul(cone_limit as i128)
            .ok_or(DirectionalReject::Overflow)?;
        let cone_valid = physical_square <= limit_square;
        let energy_valid = combined_numerator <= normal_numerator
            && normal_numerator <= initial_numerator;
        let static_valid = normal_valid && cone_valid && energy_valid
            && post_slip.into_iter().all(|word| word.unsigned_abs() <= 1);

        // The rounded tangent basis is not exactly orthonormal. Boundary is
        // therefore a statement about the next physical world-space vector,
        // not about incrementing either coefficient of an idealized disk.
        let boundary = cone_valid && physical_outward_neighbors.into_iter()
            .try_fold(true, |all_outside, neighbor| {
                Ok(all_outside && squared_length(neighbor)? > limit_square)
            })?;
        let bracket = (neighbor_cross[0] <= 0 && neighbor_cross[1] >= 0)
            || (neighbor_cross[1] <= 0 && neighbor_cross[0] >= 0);
        let residual_nonzero = post_slip.into_iter().any(|word| word.unsigned_abs() > 1);
        let sliding_valid = normal_valid && cone_valid && energy_valid && residual_nonzero
            && boundary && bracket && tangent_dot > 0 && !mirror_tie;
        Ok(FrictionClassification { normal_valid, cone_valid, static_valid, sliding_valid })
    }

    fn directional_residuals(
        matrix: &[[i64; 3]; 3], before: [i64; 3], impulse: [i64; 3],
    ) -> Result<[i64; 3], DirectionalReject> {
        let mut answer = before;
        for row in 0..3 {
            let mut value = before[row] as i128;
            for column in 0..3 {
                value = value.checked_add((matrix[row][column] as i128)
                    .checked_mul(impulse[column] as i128)
                    .ok_or(DirectionalReject::Overflow)?)
                    .ok_or(DirectionalReject::Overflow)?;
            }
            answer[row] = i64::try_from(value).map_err(|_| DirectionalReject::Overflow)?;
        }
        Ok(answer)
    }

    fn friction_residuals_valid(residuals: [i64; 3]) -> bool {
        residuals[0].abs() <= 1 && residuals[1].abs() <= 1 && residuals[2].abs() <= 1
    }

    fn physical_tangent_impulse_inside_cone(
        basis: CanonicalTangents, first_raw: i32, second_raw: i32, limit_raw: i32,
    ) -> Result<bool, DirectionalReject> {
        if !inside_friction_box_and_cone(
            first_raw as i64, second_raw as i64, limit_raw as i64,
        )? {
            return Ok(false);
        }
        let impulse = basis.first * Fx::from_raw(first_raw)
            + basis.second * Fx::from_raw(second_raw);
        let mut square = 0i128;
        for raw in [impulse.x.raw(), impulse.y.raw(), impulse.z.raw()] {
            square = square.checked_add((raw as i128).checked_mul(raw as i128)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)?;
        }
        let limit_square = (limit_raw as i128).checked_mul(limit_raw as i128)
            .ok_or(DirectionalReject::Overflow)?;
        Ok(square <= limit_square)
    }

    fn sliding_friction_kkt(
        impulse_on_a: [i64; 2], post_slip: [i64; 2], limit_raw: i64,
    ) -> Result<bool, DirectionalReject> {
        if limit_raw < 0 { return Err(DirectionalReject::NoSolution); }
        let impulse_square = (impulse_on_a[0] as i128).checked_mul(impulse_on_a[0] as i128)
            .and_then(|value| (impulse_on_a[1] as i128).checked_mul(impulse_on_a[1] as i128)
                .and_then(|other| value.checked_add(other)))
            .ok_or(DirectionalReject::Overflow)?;
        let limit_square = (limit_raw as i128).checked_mul(limit_raw as i128)
            .ok_or(DirectionalReject::Overflow)?;
        let cross = (impulse_on_a[0] as i128).checked_mul(post_slip[1] as i128)
            .and_then(|a| (impulse_on_a[1] as i128).checked_mul(post_slip[0] as i128)
                .and_then(|b| a.checked_sub(b))).ok_or(DirectionalReject::Overflow)?;
        let dot = (impulse_on_a[0] as i128).checked_mul(post_slip[0] as i128)
            .and_then(|a| (impulse_on_a[1] as i128).checked_mul(post_slip[1] as i128)
                .and_then(|b| a.checked_add(b))).ok_or(DirectionalReject::Overflow)?;
        Ok(impulse_square == limit_square && post_slip != [0, 0]
            && cross == 0 && dot > 0)
    }

    pub(crate) fn widened_kinetic_numerator(
        rows: &[(i64, [i64; 3])],
    ) -> Result<i128, DirectionalReject> {
        let mut total = 0i128;
        for &(mass_raw, velocity) in rows {
            if mass_raw <= 0 { return Err(DirectionalReject::NoSolution); }
            let mut speed_square = 0i128;
            for raw in velocity {
                speed_square = speed_square.checked_add((raw as i128)
                    .checked_mul(raw as i128).ok_or(DirectionalReject::Overflow)?)
                    .ok_or(DirectionalReject::Overflow)?;
            }
            total = total.checked_add((mass_raw as i128).checked_mul(speed_square)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(total)
    }

    pub(crate) fn friction_energy_order_is_valid(
        initial: &[(i64, [i64; 3])], normal_only: &[(i64, [i64; 3])],
        combined: &[(i64, [i64; 3])],
    ) -> Result<bool, DirectionalReject> {
        let initial = widened_kinetic_numerator(initial)?;
        let normal_only = widened_kinetic_numerator(normal_only)?;
        let combined = widened_kinetic_numerator(combined)?;
        Ok(normal_only <= initial && combined <= normal_only && combined <= initial)
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct EquipmentComSample {
        pub(crate) mass_raw: i64,
        pub(crate) body_velocity_raw: [i64; 3],
        pub(crate) hand_velocity_raw: [i64; 3],
        pub(crate) velocity_offset_raw: [i64; 3],
        /// One equipment item contributes one row. A `Both` grip marks its
        /// right-owned row true and its mirrored left arm false.
        pub(crate) owns_equipment: bool,
    }

    fn equipment_com_velocity_raw(
        row: EquipmentComSample,
    ) -> Result<[i128; 3], DirectionalReject> {
        let relative = equipment_com_relative_velocity_raw(row)?;
        let mut answer = [0i128; 3];
        for axis in 0..3 {
            answer[axis] = (row.body_velocity_raw[axis] as i128)
                .checked_add(relative[axis])
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(answer)
    }

    pub(crate) fn equipment_com_relative_velocity_raw(
        row: EquipmentComSample,
    ) -> Result<[i128; 3], DirectionalReject> {
        let mut answer = [0i128; 3];
        for axis in 0..3 {
            answer[axis] = (row.hand_velocity_raw[axis] as i128)
                .checked_add(row.velocity_offset_raw[axis] as i128)
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(answer)
    }

    /// Exact `mass * |body + hand + COM offset|^2`, before the public energy
    /// divisor floors away sub-unit differences. Non-owning mirror rows are
    /// deliberately absent from the sum rather than cancelled afterwards.
    pub(crate) fn widened_equipment_com_numerator(
        rows: &[EquipmentComSample],
    ) -> Result<i128, DirectionalReject> {
        let mut total = 0i128;
        for &row in rows {
            if !row.owns_equipment { continue; }
            if row.mass_raw <= 0 { return Err(DirectionalReject::NoSolution); }
            let velocity = equipment_com_velocity_raw(row)?;
            let mut square = 0i128;
            for component in velocity {
                square = square.checked_add(component.checked_mul(component)
                    .ok_or(DirectionalReject::Overflow)?)
                    .ok_or(DirectionalReject::Overflow)?;
            }
            total = total.checked_add((row.mass_raw as i128).checked_mul(square)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(total)
    }

    /// A motor may retain or remove energy for free, but every positive raw
    /// numerator delta must fit inside its separately derived supplied-work
    /// budget. The helper does not invent that budget from an effort scalar.
    pub(crate) fn equipment_com_energy_fits_supplied_work(
        before: &[EquipmentComSample], after: &[EquipmentComSample],
        supplied_work_numerator: i128,
    ) -> Result<bool, DirectionalReject> {
        if supplied_work_numerator < 0 { return Err(DirectionalReject::NoSolution); }
        let before = widened_equipment_com_numerator(before)?;
        let after = widened_equipment_com_numerator(after)?;
        Ok(after <= before.checked_add(supplied_work_numerator)
            .ok_or(DirectionalReject::Overflow)?)
    }

    pub(crate) fn widened_equipment_com_discrete_work(
        before: &[EquipmentComSample], after: &[EquipmentComSample],
    ) -> Result<i128, DirectionalReject> {
        if before.len() != after.len() { return Err(DirectionalReject::NoSolution); }
        let mut work = 0i128;
        for (&old, &new) in before.iter().zip(after) {
            if old.mass_raw != new.mass_raw || old.owns_equipment != new.owns_equipment {
                return Err(DirectionalReject::NoSolution);
            }
            if !old.owns_equipment { continue; }
            if old.mass_raw <= 0 { return Err(DirectionalReject::NoSolution); }
            let old_velocity = equipment_com_velocity_raw(old)?;
            let new_velocity = equipment_com_velocity_raw(new)?;
            let mut identity = 0i128;
            for axis in 0..3 {
                let delta = new_velocity[axis].checked_sub(old_velocity[axis])
                    .ok_or(DirectionalReject::Overflow)?;
                let sum = new_velocity[axis].checked_add(old_velocity[axis])
                    .ok_or(DirectionalReject::Overflow)?;
                identity = identity.checked_add(delta.checked_mul(sum)
                    .ok_or(DirectionalReject::Overflow)?)
                    .ok_or(DirectionalReject::Overflow)?;
            }
            work = work.checked_add((old.mass_raw as i128).checked_mul(identity)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(work)
    }

    /// Motor-stage identity with body translation held fixed:
    /// `Delta N = mass * Delta c dot (V1 + V0)`, where stored `c` is the
    /// equipment COM velocity relative to the body, never the hand velocity.
    pub(crate) fn widened_equipment_com_motor_work(
        before: &[EquipmentComSample], after: &[EquipmentComSample],
    ) -> Result<i128, DirectionalReject> {
        if before.len() != after.len() { return Err(DirectionalReject::NoSolution); }
        let mut work = 0i128;
        for (&old, &new) in before.iter().zip(after) {
            if old.mass_raw != new.mass_raw || old.owns_equipment != new.owns_equipment
                || old.body_velocity_raw != new.body_velocity_raw {
                return Err(DirectionalReject::NoSolution);
            }
            if !old.owns_equipment { continue; }
            if old.mass_raw <= 0 { return Err(DirectionalReject::NoSolution); }
            let c0 = equipment_com_relative_velocity_raw(old)?;
            let c1 = equipment_com_relative_velocity_raw(new)?;
            let v0 = equipment_com_velocity_raw(old)?;
            let v1 = equipment_com_velocity_raw(new)?;
            let mut identity = 0i128;
            for axis in 0..3 {
                let delta_c = c1[axis].checked_sub(c0[axis])
                    .ok_or(DirectionalReject::Overflow)?;
                let velocity_sum = v1[axis].checked_add(v0[axis])
                    .ok_or(DirectionalReject::Overflow)?;
                identity = identity.checked_add(delta_c.checked_mul(velocity_sum)
                    .ok_or(DirectionalReject::Overflow)?)
                    .ok_or(DirectionalReject::Overflow)?;
            }
            work = work.checked_add((old.mass_raw as i128).checked_mul(identity)
                .ok_or(DirectionalReject::Overflow)?)
                .ok_or(DirectionalReject::Overflow)?;
        }
        Ok(work)
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct EquipmentComWorkLedger {
        pub(crate) initial_numerator: i128,
        pub(crate) coast_numerator: i128,
        pub(crate) final_numerator: i128,
        pub(crate) transport_delta: i128,
        pub(crate) motor_work: i128,
    }

    pub(crate) fn equipment_com_work_ledger(
        initial: &[EquipmentComSample], coast: &[EquipmentComSample],
        final_state: &[EquipmentComSample],
    ) -> Result<EquipmentComWorkLedger, DirectionalReject> {
        let initial_numerator = widened_equipment_com_numerator(initial)?;
        let coast_numerator = widened_equipment_com_numerator(coast)?;
        let final_numerator = widened_equipment_com_numerator(final_state)?;
        let transport_delta = widened_equipment_com_discrete_work(initial, coast)?;
        let motor_work = widened_equipment_com_motor_work(coast, final_state)?;
        if coast_numerator.checked_sub(initial_numerator) != Some(transport_delta)
            || final_numerator.checked_sub(coast_numerator) != Some(motor_work) {
            return Err(DirectionalReject::Overflow);
        }
        Ok(EquipmentComWorkLedger { initial_numerator, coast_numerator, final_numerator,
                                    transport_delta, motor_work })
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) struct NeighborKktSample {
        pub(crate) angle: Angle,
        pub(crate) signed_cross: i64,
        pub(crate) alignment: i64,
    }

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub(crate) enum NeighborKktReject {
        NotNeighbors, NoSignBracket, NonPositiveAlignment, AmbiguousMirrorTie,
    }

    pub(crate) fn accept_neighbor_angle_kkt(
        left: NeighborKktSample, right: NeighborKktSample,
    ) -> Result<Angle, NeighborKktReject> {
        if left.angle.raw().wrapping_add(1) != right.angle.raw() {
            return Err(NeighborKktReject::NotNeighbors);
        }
        if left.alignment <= 0 || right.alignment <= 0 {
            return Err(NeighborKktReject::NonPositiveAlignment);
        }
        let bracketed = left.signed_cross == 0 || right.signed_cross == 0
            || (left.signed_cross < 0) != (right.signed_cross < 0);
        if !bracketed { return Err(NeighborKktReject::NoSignBracket); }
        match left.signed_cross.unsigned_abs().cmp(&right.signed_cross.unsigned_abs()) {
            core::cmp::Ordering::Less => Ok(left.angle),
            core::cmp::Ordering::Greater => Ok(right.angle),
            core::cmp::Ordering::Equal => Err(NeighborKktReject::AmbiguousMirrorTie),
        }
    }

    #[test]
    fn canonical_tangents_use_the_least_aligned_axis_and_xyz_ties() {
        let z = canonical_tangents(Vec3::Z).unwrap();
        assert_eq!((z.axis, z.first, z.second), (0, -Vec3::Y, Vec3::X));
        let x = canonical_tangents(Vec3::X).unwrap();
        assert_eq!((x.axis, x.first, x.second), (1, -Vec3::Z, Vec3::Y));

        // All three alignments are equal, so X must win. The cross-product
        // orientation is checked independently rather than pinning rounded
        // normalized components as though they were the contract.
        let diagonal = Vec3::from_ints(1, 1, 1).normalized_or_zero();
        let tied = canonical_tangents(diagonal).unwrap();
        assert_eq!(tied.axis, 0);
        assert_eq!(tied.first, Vec3::X.cross(diagonal).normalized_or_zero());
        assert_eq!(tied.second, diagonal.cross(tied.first).normalized_or_zero());
        assert!(tied.first.dot(diagonal).raw().abs() <= 1);
        assert!(tied.second.dot(diagonal).raw().abs() <= 1);
        assert_eq!(canonical_tangents(Vec3::ZERO), Err(DirectionalReject::NoSolution));
    }

    #[test]
    fn friction_box_constraints_bound_each_signed_tangent_coordinate() {
        let limit = tangent_limit_raw(Fx::from_ratio(1, 2).raw(), 20).unwrap();
        assert_eq!(limit, 10);
        assert!(inside_friction_box_and_cone(6, -8, limit).unwrap());
        assert!(!inside_friction_box_and_cone(11, 0, limit).unwrap());
        assert!(!inside_friction_box_and_cone(0, -11, limit).unwrap());
        assert_eq!(tangent_limit_raw(-1, 20), Err(DirectionalReject::NoSolution));
    }

    #[test]
    fn committed_friction_static_requires_both_residual_coordinates() {
        let classify = |slip| classify_committed_friction(
            -8, 0, 0, 10, Fx::ONE.raw(), [3, 4, 0], [[11, 0, 0]; 2], slip, [-1, 1], 1,
            100, 90, 80, false,
        ).unwrap();
        let stuck = classify([0, 0]);
        assert_eq!(stuck, FrictionClassification {
            normal_valid: true, cone_valid: true, static_valid: true, sliding_valid: false,
        });
        let second_coordinate = classify([0, 2]);
        assert!(!second_coordinate.static_valid,
                "static friction ignored the second residual coordinate");
    }

    #[test]
    fn static_candidate_grammar_has_exact_order_count_and_mirror_opposition() {
        let normal = Vec3::new(Fx::from_raw(2_256), Fx::from_raw(65_497), Fx::ZERO);
        let brackets = [[101, 102], [-1, 0]];
        let candidates = static_candidate_grammar(normal, [5_623, 5_624], brackets).unwrap();
        assert_eq!(candidates.len(), 160);
        assert_eq!(candidates[20].x.raw(), candidates[0].x.raw() - 1,
                   "positive normal X did not enumerate the adjacent negative floor");
        assert_eq!(candidates[40].y.raw(), candidates[0].y.raw() - 1,
                   "positive normal Y did not enumerate the adjacent negative floor");
        assert_eq!(candidates[0], static_candidate_grammar(
            normal, [5_623, 5_624], brackets).unwrap()[0]);
        let mirrored = static_candidate_grammar(
            -normal, [5_623, 5_624],
            [brackets[0], [-brackets[1][1], -brackets[1][0]]],
        ).unwrap();
        for candidate in candidates {
            assert!(mirrored.contains(&-candidate),
                    "toward-zero integerization lost mirror opposition for {candidate:?}");
        }
        assert_eq!(static_candidate_grammar(normal, [5_623, 5_624], [[0, 2], [-1, 0]]),
                   Err(StaticSearchReject::NonAdjacentBracket));
        assert_eq!(static_candidate_grammar(
            Vec3::new(normal.x, normal.y, Fx::from_raw(1)), [5_623, 5_624], brackets),
            Err(StaticSearchReject::UnsupportedNonPlanar));
    }

    #[test]
    fn residual_probe_ladder_is_exactly_64_16_4_1_and_opposition_closed() {
        assert_eq!(RESIDUAL_TRUST_RADII, [64, 16, 4, 1]);
        let direction = Vec3::new(Fx::from_raw(-2_256), Fx::from_raw(-65_497), Fx::ZERO);
        for h in [64, 16, 4, 1] {
            let pairs = opposed_coordinate_perturbations(direction, h).unwrap();
            assert!(!pairs.is_empty() && pairs.len() <= 4);
            for (plus, minus) in pairs { assert_eq!(plus, -minus); }
        }
    }

    #[test]
    fn seed_perturbation_pair_uses_unique_invariant_rational_error() {
        let direction = Vec3::new(Fx::from_raw(20_000), Fx::from_raw(30_001), Fx::ZERO);
        let pair = invariant_perturbation_pair(direction, 64).unwrap();
        assert_eq!([pair.0.x.raw(), pair.0.y.raw(), pair.0.z.raw()], [20, 29, 0]);
        assert_eq!(pair.0, -pair.1);
        assert_ne!(pair.0, Vec3::ZERO);
        let mirrored = invariant_perturbation_pair(-direction, 64).unwrap();
        assert_eq!(mirrored.0, -pair.0);
    }

    #[test]
    fn seed_perturbation_ties_refuse_a_handed_rounding() {
        let half = Vec3::new(Fx::from_raw(32_768), Fx::from_raw(32_768), Fx::ZERO);
        assert_eq!(invariant_perturbation_pair(half, 1),
                   Err(SeedProvenanceReject::Ambiguous));
        assert_eq!(invariant_perturbation_pair(Vec3::ZERO, 1),
                   Err(SeedProvenanceReject::Plateau));
    }

    fn lifted_zero() -> LiftedCoordinate {
        LiftedCoordinate { velocity_raw: 0, momentum_remainder: 0,
                           position_raw: 0, position_remainder: 0 }
    }

    #[test]
    fn lifted_coordinate_makes_split_and_combined_impulses_one_exact_state() {
        let mass = 3 * Fx::ONE.raw();
        let split = lifted_impulse(lifted_impulse(lifted_zero(), mass, 2, 65_536).unwrap(),
                                   mass, 2, 65_536).unwrap();
        let combined = lifted_impulse(lifted_zero(), mass, 4, 65_536).unwrap();
        assert_eq!(split, combined);
        assert_eq!((combined.velocity_raw, combined.momentum_remainder), (1, 65_536));
        let split_tick = integrate_lifted(split, mass, 65_536).unwrap();
        let combined_tick = integrate_lifted(combined, mass, 65_536).unwrap();
        assert_eq!(split_tick, combined_tick);
        assert_eq!((split_tick.position_raw, split_tick.position_remainder),
                   (1, 4_294_967_296));
        let split_partial = integrate_lifted(split, mass, 9_832).unwrap();
        let combined_partial = integrate_lifted(combined, mass, 9_832).unwrap();
        assert_eq!(split_partial, combined_partial);
        assert_eq!((split_partial.position_raw, split_partial.position_remainder),
                   (0, 2_577_399_808));
        let first = integrate_lifted(split, mass, 55_704).unwrap();
        assert_eq!((first.position_raw, first.position_remainder), (1, 1_717_567_488));
        let completed = integrate_lifted(first, mass, 9_832).unwrap();
        assert_eq!(completed, split_tick);
    }

    #[test]
    fn lifted_coordinate_integrates_subraw_momentum_without_hidden_motion() {
        let mass = 3 * Fx::ONE.raw();
        let mut split = lifted_impulse(lifted_zero(), mass, 2, 65_536).unwrap();
        let mut combined = split;
        split = integrate_lifted(split, mass, 65_536).unwrap(); combined = integrate_lifted(combined, mass, 65_536).unwrap();
        assert_eq!(split, combined);
        assert_eq!((split.position_raw, split.position_remainder), (0, 8_589_934_592));
        split = integrate_lifted(split, mass, 65_536).unwrap(); combined = integrate_lifted(combined, mass, 65_536).unwrap();
        assert_eq!(split, combined);
        assert_eq!((split.position_raw, split.position_remainder), (1, 4_294_967_296));
    }

    #[test]
    fn lifted_coordinate_negation_is_exact_with_toward_zero_remainders() {
        let mass = 3 * Fx::ONE.raw();
        let mut positive = lifted_impulse(lifted_zero(), mass, 4, 65_536).unwrap();
        let mut negative = lifted_impulse(lifted_zero(), mass, -4, 65_536).unwrap();
        for _ in 0..123 { positive = integrate_lifted(positive, mass, 65_536).unwrap();
                          negative = integrate_lifted(negative, mass, 65_536).unwrap(); }
        assert_eq!((negative.velocity_raw, negative.momentum_remainder,
                    negative.position_raw, negative.position_remainder),
                   (-positive.velocity_raw, -positive.momentum_remainder,
                    -positive.position_raw, -positive.position_remainder));
    }

    #[test]
    fn lifted_coordinate_energy_uses_the_complete_momentum_numerator_once() {
        let mass = 3 * Fx::ONE.raw();
        let half = lifted_impulse(lifted_zero(), mass, 2, 65_536).unwrap();
        assert_eq!(lifted_energy(half, mass).unwrap(), (17_179_869_184, 393_216));
        let value = lifted_impulse(lifted_zero(), mass, 4, 65_536).unwrap();
        assert_eq!(lifted_energy(value, mass).unwrap(), (68_719_476_736, 393_216));
        let coast = integrate_lifted(value, mass, 65_536).unwrap();
        assert_eq!(lifted_energy(coast, mass).unwrap(), (68_719_476_736, 393_216));
    }

    #[test]
    fn lifted_coordinate_refuses_noncanonical_overflow_and_fractional_alpha_atomically() {
        let mass = 3 * Fx::ONE.raw(); let before = lifted_zero();
        assert_eq!(lifted_impulse(before, mass, 1, 65_535),
                   Err(LiftedReject::UnsupportedAlpha));
        assert_eq!(integrate_lifted(before, mass, 65_537),
                   Err(LiftedReject::UnsupportedInterval));
        let position_denominator = mass as i64 * 65_536;
        let invalid_position = LiftedCoordinate {
            position_remainder: position_denominator, ..before
        };
        assert_eq!(integrate_lifted(invalid_position, mass, 0),
                   Err(LiftedReject::NonCanonical));
        let maximum_position = LiftedCoordinate { position_raw: i32::MAX, ..before };
        assert_eq!(integrate_lifted(maximum_position, mass, 65_536), Ok(maximum_position));
        let moving_maximum = LiftedCoordinate { velocity_raw: 1, position_raw: i32::MAX,
                                                ..before };
        assert_eq!(integrate_lifted(moving_maximum, mass, 65_536),
                   Err(LiftedReject::Saturation));
        assert_eq!(lifted_impulse(before, 0, 1, 65_536), Err(LiftedReject::Mass));
        let invalid = LiftedCoordinate { momentum_remainder: mass as i64, ..before };
        assert_eq!(lifted_impulse(invalid, mass, 0, 65_536), Err(LiftedReject::NonCanonical));
        for invalid in [
            LiftedCoordinate { velocity_raw: 1, momentum_remainder: -1, ..before },
            LiftedCoordinate { velocity_raw: -1, momentum_remainder: 1, ..before },
            LiftedCoordinate { position_raw: 1, position_remainder: -1, ..before },
            LiftedCoordinate { position_raw: -1, position_remainder: 1, ..before },
        ] {
            assert_eq!(lifted_impulse(invalid, mass, 0, 65_536),
                       Err(LiftedReject::NonCanonical));
        }
        let maximum = LiftedCoordinate { velocity_raw: i32::MAX, ..before };
        assert_eq!(lifted_impulse(maximum, 1, 1, 65_536), Err(LiftedReject::Saturation));
        assert_eq!(before, lifted_zero(), "a rejected pure transition mutated its input value");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_owner_and_held_channels_conserve_every_external_impulse_word() {
        let zero = lifted_zero();
        let owner = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let split = owner_impulse(owner_impulse(owner, 4, [0,0]).unwrap(), 0, [2,0]).unwrap();
        let combined = owner_impulse(owner, 4, [2,0]).unwrap();
        assert_eq!(split, combined);
        assert_eq!((combined.common.velocity_raw, combined.common.momentum_remainder,
                    combined.relative[0].velocity_raw, combined.relative[0].momentum_remainder),
                   (1, 65_536, 2, 0));
        assert_eq!(owner_momentum(combined).unwrap(), 393_216);
        assert_eq!(owner_energy_numerator(combined).unwrap(), (1_441_792, 3));
        assert_eq!(1_441_792i128 * 131_072, 188_978_561_024);

        let two = LiftedOwner { body_mass: 65_536, common: zero, held_count: 2,
            held_mass: [65_536, 131_072], relative: [zero; 2] };
        let two = owner_impulse(two, 3, [2,-1]).unwrap();
        assert_eq!((two.common.momentum_remainder, two.relative[0].momentum_remainder,
                    two.relative[1].momentum_remainder, owner_momentum(two).unwrap()),
                   (196_608, 0, -65_536, 262_144));
        assert_eq!(owner_energy_numerator(two).unwrap(), (270_336, 1));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_owner_energy_includes_absolute_cross_terms_without_double_counting() {
        let zero = lifted_zero();
        let owner = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let positive = owner_impulse(owner, 4, [2,0]).unwrap();
        let negative = owner_impulse(owner, -4, [-2,0]).unwrap();
        assert_eq!(owner_energy_numerator(positive).unwrap(),
                   owner_energy_numerator(negative).unwrap());
        let opposed = owner_impulse(owner, 4, [-2,0]).unwrap();
        assert_eq!(owner_energy_numerator(opposed).unwrap(), (131_072, 1));
        assert_ne!(owner_energy_numerator(positive).unwrap(), (917_504, 3),
                   "energy omitted the common-relative cross term");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_source_and_target_holds_combine_full_rational_velocity_once() {
        let zero = lifted_zero();
        let owner = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let cancellation = owner_impulse(owner, 2, [-1,0]).unwrap();
        assert_eq!((cancellation.common.velocity_raw, cancellation.common.momentum_remainder,
                    cancellation.relative[0].velocity_raw), (0, 131_072, -1));
        assert_eq!(held_absolute_velocity(cancellation, 0).unwrap(), (0, -4_294_967_296));
        let target = owner_impulse(owner, -2, [1,0]).unwrap();
        assert_eq!(held_absolute_velocity(target, 0).unwrap(), (0, 4_294_967_296));

        let moved = integrate_owner(cancellation, 9_832).unwrap();
        let mirrored = integrate_owner(target, 9_832).unwrap();
        let position = held_absolute_position(moved, 0).unwrap();
        let mirror_position = held_absolute_position(mirrored, 0).unwrap();
        assert_eq!(mirror_position, (-position.0, -position.1));
        assert_ne!(position.1, 0, "fractional common-relative motion was rounded away");

        let two = LiftedOwner { body_mass: 65_536, common: zero, held_count: 2,
            held_mass: [65_536, 131_072], relative: [zero; 2] };
        let original = owner_impulse(two, 3, [2,-1]).unwrap();
        let permuted = LiftedOwner { held_mass: [131_072,65_536],
            relative: [original.relative[1], original.relative[0]], ..original };
        assert_eq!(owner_momentum(original).unwrap(), owner_momentum(permuted).unwrap());
        assert_eq!(owner_energy_numerator(original).unwrap(), owner_energy_numerator(permuted).unwrap());
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_generalized_validation_is_atomic_for_every_row() {
        let zero = lifted_zero();
        let owner = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        assert_eq!(owner_impulse(owner, 0, [0,1]), Err(LiftedReject::NonCanonical));
        let dirty_inactive = LiftedOwner { held_mass: [65_536, 1], ..owner };
        assert_eq!(owner_impulse(dirty_inactive, 0, [0,0]), Err(LiftedReject::NonCanonical));
        let invalid = LiftedOwner { held_count: 3, ..owner };
        assert_eq!(owner_impulse(invalid, 1, [0,0]), Err(LiftedReject::Capacity));
        let overflow = LiftedOwner { body_mass: i32::MAX, held_mass: [1,0], ..owner };
        assert_eq!(owner_impulse(overflow, 0, [0,0]), Err(LiftedReject::Saturation));
        assert_eq!(owner.common, zero, "a rejected pure owner transition mutated its input");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_xyz_owner_and_held_channels_conserve_each_external_impulse_axis() {
        let zero = lifted_zero();
        let axis = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let owner = LiftedOwner3 { axes: [axis; 3] };
        let body = [4, -3, 0]; let held = [[2, 1, -2], [0; 3]];
        let split = owner3_impulse(owner3_impulse(owner, body, [[0; 3]; 2]).unwrap(),
                                   [0; 3], held).unwrap();
        let combined = owner3_impulse(owner, body, held).unwrap();
        assert_eq!(split, combined);
        assert_eq!(owner3_momentum(combined).unwrap(), [393_216, -131_072, -131_072]);
        assert_eq!(owner3_energy(combined).unwrap(), Rational { n: 2_031_616, d: 3 });
        assert_eq!((combined.axes[2].common.velocity_raw,
                    combined.axes[2].common.momentum_remainder,
                    combined.axes[2].relative[0].velocity_raw,
                    combined.axes[2].relative[0].momentum_remainder),
                   (0, 0, -2, 0), "held-relative Z was not kept distinct from body Z");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_xyz_fractional_intervals_compose_common_and_relative_position_once() {
        let zero = lifted_zero();
        let axis = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let owner = owner3_impulse(LiftedOwner3 { axes: [axis; 3] }, [4,-3,0],
                                   [[2,1,-2],[0;3]]).unwrap();
        let whole = integrate_owner3(owner, 65_536).unwrap();
        let split = integrate_owner3(integrate_owner3(owner, 55_704).unwrap(), 9_832).unwrap();
        assert_eq!(split, whole);
        let partial = integrate_owner3(owner, 9_832).unwrap();
        let absolute = [
            held_absolute_position(partial.axes[0], 0).unwrap(),
            held_absolute_position(partial.axes[1], 0).unwrap(),
            held_absolute_position(partial.axes[2], 0).unwrap(),
        ];
        assert_eq!(absolute, [(0, 422_281_184_542_720), (0, 0),
                              (0, -253_368_710_725_632)]);

        let two_axis = LiftedOwner { body_mass: 65_536, common: zero, held_count: 2,
            held_mass: [65_536, 131_072], relative: [zero; 2] };
        let two = owner3_impulse(LiftedOwner3 { axes: [two_axis; 3] }, [3,-2,0],
                                 [[2,-1,1],[-1,2,-2]]).unwrap();
        let two_whole = integrate_owner3(two, 65_536).unwrap();
        let two_split = integrate_owner3(integrate_owner3(two, 55_704).unwrap(), 9_832).unwrap();
        assert_eq!(two_split, two_whole);
        assert_eq!([
            held_absolute_position(two_split.axes[0], 0).unwrap(),
            held_absolute_position(two_split.axes[0], 1).unwrap(),
            held_absolute_position(two_split.axes[2], 0).unwrap(),
            held_absolute_position(two_split.axes[2], 1).unwrap(),
        ], [(2, 844_424_930_131_968), (0, 562_949_953_421_312),
            (1, 0), (-1, 0)]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_xyz_state_maps_exactly_under_sign_mirror_and_xy_permutation() {
        let zero = lifted_zero();
        let axis = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let owner = LiftedOwner3 { axes: [axis; 3] };
        let positive = owner3_impulse(owner, [4,-3,0], [[2,1,-2],[0;3]]).unwrap();
        let negative = owner3_impulse(owner, [-4,3,0], [[-2,-1,2],[0;3]]).unwrap();
        for axis in 0..3 {
            assert_eq!((negative.axes[axis].common.velocity_raw,
                        negative.axes[axis].common.momentum_remainder,
                        negative.axes[axis].relative[0].velocity_raw,
                        negative.axes[axis].relative[0].momentum_remainder),
                       (-positive.axes[axis].common.velocity_raw,
                        -positive.axes[axis].common.momentum_remainder,
                        -positive.axes[axis].relative[0].velocity_raw,
                        -positive.axes[axis].relative[0].momentum_remainder));
        }
        assert_eq!(owner3_energy(negative).unwrap(), owner3_energy(positive).unwrap());

        let permuted = owner3_impulse(owner, [-3,4,0], [[1,2,-2],[0;3]]).unwrap();
        assert_eq!(permuted.axes, [positive.axes[1], positive.axes[0], positive.axes[2]]);
        assert_eq!(owner3_energy(permuted).unwrap(), owner3_energy(positive).unwrap());
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_xyz_validation_refuses_body_z_and_malformed_axes_atomically() {
        let zero = lifted_zero();
        let axis = LiftedOwner { body_mass: 131_072, common: zero, held_count: 1,
            held_mass: [65_536, 0], relative: [zero; 2] };
        let owner = LiftedOwner3 { axes: [axis; 3] };
        assert_eq!(owner3_impulse(owner, [0,0,1], [[0;3];2]),
                   Err(LiftedReject::NonCanonical));
        let held_z = owner3_impulse(owner, [0;3], [[0,0,1],[0;3]]).unwrap();
        assert_eq!((held_z.axes[2].relative[0].velocity_raw,
                    held_z.axes[2].relative[0].momentum_remainder), (1, 0));
        let malformed = LiftedOwner3 { axes: [axis, axis,
            LiftedOwner { body_mass: 65_536, ..axis }] };
        assert_eq!(owner3_impulse(malformed, [0;3], [[0;3];2]),
                   Err(LiftedReject::NonCanonical));
        assert_eq!(integrate_owner3(malformed, 9_832), Err(LiftedReject::NonCanonical));
        assert_eq!(owner3_momentum(malformed), Err(LiftedReject::NonCanonical));
        assert_eq!(owner3_energy(malformed), Err(LiftedReject::NonCanonical));
        for bad_z in [
            LiftedCoordinate { velocity_raw: 1, ..zero },
            LiftedCoordinate { momentum_remainder: 1, ..zero },
            LiftedCoordinate { position_raw: 1, ..zero },
            LiftedCoordinate { position_remainder: 1, ..zero },
        ] {
            let malformed_z = LiftedOwner3 { axes: [axis, axis,
                LiftedOwner { common: bad_z, ..axis }] };
            assert_eq!(owner3_impulse(malformed_z, [0;3], [[0;3];2]),
                       Err(LiftedReject::NonCanonical));
            assert_eq!(integrate_owner3(malformed_z, 0), Err(LiftedReject::NonCanonical));
            assert_eq!(owner3_momentum(malformed_z), Err(LiftedReject::NonCanonical));
            assert_eq!(owner3_energy(malformed_z), Err(LiftedReject::NonCanonical));
        }
        assert_eq!(owner.axes, [axis; 3], "a rejected XYZ transition mutated its input");
    }

    #[test]
    fn symmetric_response_columns_preserve_rational_numerators_until_solve() {
        let column = symmetric_residual_column([7, -3, 5], [-5, 9, 1], 4).unwrap();
        assert_eq!(column, RationalColumn { numerator: [12, -12, 4], denominator: 8 });
        let swapped = symmetric_residual_column([-5, 9, 1], [7, -3, 5], 4).unwrap();
        assert_eq!(swapped.numerator, [-12, 12, -4]);
        assert_eq!(swapped.denominator, column.denominator);
        let half = symmetric_residual_column([1, 0, 0], [0, 0, 0], 1).unwrap();
        assert_eq!((half.numerator[0], half.denominator), (1, 2),
                   "central half-slope was divided before the solve");
        assert_eq!(symmetric_residual_column([0; 3], [0; 3], 0),
                   Err(ResidualTrustReject::Arithmetic));
    }

    #[test]
    fn residual_trust_region_solves_rationals_and_names_plateau_and_singular() {
        let columns = [
            RationalColumn { numerator: [30, 0, 12], denominator: 60 },
            RationalColumn { numerator: [20, 40, 0], denominator: 60 },
            RationalColumn { numerator: [0, 15, 45], denominator: 60 },
        ];
        assert_eq!(solve_rational_columns(columns, [-5, 15, -21]).unwrap(), [
            Rational { n: 30, d: 1 }, Rational { n: -30, d: 1 }, Rational { n: 20, d: 1 }]);
        let thirds = [
            RationalColumn { numerator: [3, 0, 0], denominator: 1 },
            RationalColumn { numerator: [0, 3, 0], denominator: 1 },
            RationalColumn { numerator: [0, 0, 3], denominator: 1 },
        ];
        let fractional = solve_rational_columns(thirds, [-5, 5, -2]).unwrap();
        assert_eq!(fractional, [Rational { n: 5, d: 3 }, Rational { n: -5, d: 3 },
                                Rational { n: 2, d: 3 }]);
        assert_eq!([2, -2, 1], [
            (fractional[0].n + fractional[0].d - 1) / fractional[0].d,
            fractional[1].n / fractional[1].d - 1,
            (fractional[2].n + fractional[2].d - 1) / fractional[2].d,
        ]);
        assert_eq!(rational_floor_ceil(Rational { n: -6, d: 3 }).unwrap(), [-2, -2]);
        assert_eq!(rational_floor_ceil(Rational { n: -5, d: 3 }).unwrap(), [-2, -1]);
        assert_eq!(rational_floor_ceil(Rational { n: 5, d: 3 }).unwrap(), [1, 2]);
        assert_eq!([3 * 2 - 5, 3 * -2 + 5, 3 * 1 - 2], [1, -1, 1]);
        assert_ne!([3 * 1 - 5, 3 * -1 + 5, 3 * 0 - 2], [0; 3],
                   "toward-zero integerization accidentally solved the fractional system");
        let zero = RationalColumn { numerator: [0; 3], denominator: 60 };
        assert_eq!(solve_rational_columns([zero; 3], [1, 0, 0]), Err(ResidualTrustReject::Plateau));
        assert_eq!(solve_rational_columns([zero, columns[1], columns[2]], [1, 0, 0]),
                   Err(ResidualTrustReject::Plateau),
                   "one flat response coordinate was hidden by two live columns");
        let repeated = RationalColumn { numerator: [1, 2, 3], denominator: 60 };
        assert_eq!(solve_rational_columns([repeated; 3], [1, 0, 0]), Err(ResidualTrustReject::Singular));
    }

    #[test]
    fn residual_trust_midpoint_rejects_quadratic_curvature() {
        assert_eq!(midpoint_is_central([3, 2, 1], [2, 1, 0], [1, 0, -1], 0), Ok(()));
        assert_eq!(midpoint_is_central([4, 2, 1], [2, 1, 0], [1, 0, -1], 0),
                   Err(ResidualTrustReject::Nonlinear));
    }

    #[test]
    fn committed_friction_sliding_requires_boundary_bracket_alignment_energy_and_no_tie() {
        let classify = |physical, outward, crosses, dot, energy, tie| classify_committed_friction(
            -8, 0, 0, 5, Fx::ONE.raw(), physical, [outward; 2], [2, 3], crosses, dot,
            100, 90, energy, tie,
        ).unwrap();
        assert!(classify([3, 4, 0], [4, 4, 0], [-1, 1], 10, 80, false).sliding_valid);
        assert!(!classify([2, 4, 0], [3, 4, 0], [-1, 1], 10, 80, false).sliding_valid,
                "an impulse inside the cone was called sliding friction");
        assert!(!classify_committed_friction(
            -8, 0, 0, 5, Fx::ONE.raw(), [3, 4, 0], [[4, 4, 0], [3, 4, 0]],
            [2, 3], [-1, 1], 10, 100, 90, 80, false,
        ).unwrap().sliding_valid, "one unchecked outward axis fabricated a boundary");
        assert!(!classify([4, 4, 0], [5, 4, 0], [-1, 1], 10, 80, false).cone_valid,
                "rounded world tangent escaped a cone checked only in coordinates");
        assert!(!classify([3, 4, 0], [4, 4, 0], [1, 2], 10, 80, false).sliding_valid,
                "a least-bad angle passed without a sign bracket");
        assert!(!classify([3, 4, 0], [4, 4, 0], [-1, 1], 0, 80, false).sliding_valid,
                "zero alignment passed the production impulse sign convention");
        assert!(!classify([3, 4, 0], [4, 4, 0], [-1, 1], 10, 91, false).sliding_valid,
                "combined friction exceeded the normal-only energy");
        assert!(!classify([3, 4, 0], [4, 4, 0], [-1, 1], 10, 80, true).sliding_valid,
                "an ambiguous mirror tie selected an orientation");
        let min_word = classify_committed_friction(
            -8, 0, 0, 10, Fx::ONE.raw(), [3, 4, 0], [[11, 0, 0]; 2], [i32::MIN, 0],
            [-1, 1], 1, 100, 90, 80, false,
        ).unwrap();
        assert!(!min_word.static_valid, "i32::MIN residual was treated as one raw unit");
    }

    #[test]
    fn committed_friction_binds_the_physical_cone_to_mu_times_nonzero_jn() {
        assert_eq!(classify_committed_friction(
            -8, 0, 0, 0, Fx::ONE.raw(), [0; 3], [[1, 0, 0]; 2], [0; 2],
            [-1, 1], 1, 100, 90, 80, false,
        ), Err(DirectionalReject::NoSolution));
        let zero_mu = classify_committed_friction(
            -8, 0, 0, 10, 0, [0; 3], [[1, 0, 0]; 2], [0; 2],
            [-1, 1], 1, 100, 90, 80, false,
        ).unwrap();
        assert!(zero_mu.static_valid);
        assert!(!classify_committed_friction(
            -8, 0, 0, 10, 0, [1, 0, 0], [[2, 0, 0]; 2], [0; 2],
            [-1, 1], 1, 100, 90, 80, false,
        ).unwrap().cone_valid);
    }

    #[test]
    fn a_box_corner_outside_the_coulomb_cone_is_rejected() {
        // Both coordinates independently fit the box. Accepting only those
        // comparisons admits sqrt(2) times the Coulomb budget at a corner.
        assert!(!inside_friction_box_and_cone(10, 10, 10).unwrap());
        assert!(inside_friction_box_and_cone(6, 8, 10).unwrap());
    }

    #[test]
    fn fixed_point_basis_rounding_is_rechecked_in_world_space() {
        let basis = canonical_tangents(Vec3::from_ints(1, 1, 1)).unwrap();
        let limit = Fx::from_int(5).raw();
        assert!(inside_friction_box_and_cone(limit as i64, 0, limit as i64).unwrap());
        assert!(!physical_tangent_impulse_inside_cone(basis, limit, 0, limit).unwrap(),
            "coordinate-space boundary overstated the rounded physical cone");
        assert!(physical_tangent_impulse_inside_cone(basis, limit - 16, 0, limit).unwrap());
    }

    #[test]
    fn sliding_friction_lies_on_the_boundary_and_is_parallel_to_nonzero_slip() {
        // Unit tangent response q_after = q_before - J: cancelling (6,8)
        // would require magnitude ten, outside the five-unit cone. The physical
        // impulse_on_a (3,4) leaves slip (3,4), parallel with J under the
        // production q = vb - va sign convention. Sliding must not inherit
        // static friction's zero residual.
        let before = [6, 8];
        let impulse = [3, 4];
        let residual = [before[0] - impulse[0], before[1] - impulse[1]];
        assert_eq!(residual, [3, 4]);
        assert!(sliding_friction_kkt(impulse, residual, 5).unwrap());
        assert!(!sliding_friction_kkt(impulse, residual, 6).unwrap(),
            "an interior impulse is not a sliding boundary solution");
        assert!(!sliding_friction_kkt([6, 8], [0, 0], 10).unwrap(),
            "sliding friction must not fake the static zero-residual condition");
        assert!(!sliding_friction_kkt([2, 4], [4, 4], 5).unwrap());
    }

    #[test]
    fn friction_energy_is_ordered_before_public_u64_flooring() {
        let initial = [(1, [10, 0, 0])];
        let normal_only = [(1, [9, 0, 0])];
        let combined = [(1, [8, 4, 0])];
        let invalid_combined = [(1, [9, 1, 0])];
        assert_eq!((widened_kinetic_numerator(&initial).unwrap(),
                    widened_kinetic_numerator(&normal_only).unwrap(),
                    widened_kinetic_numerator(&combined).unwrap(),
                    widened_kinetic_numerator(&invalid_combined).unwrap()),
                   (100, 81, 80, 82));
        assert!(friction_energy_order_is_valid(&initial, &normal_only, &combined).unwrap());
        assert!(!friction_energy_order_is_valid(
            &initial, &normal_only, &invalid_combined,
        ).unwrap());

        // Every numerator is below one public closure-energy unit. Comparing
        // those already-divided u64 values accepts the invalid 82 > 81 row.
        let denominator = 2i128 * 65_536 * 65_536;
        for rows in [&initial[..], &normal_only[..], &combined[..], &invalid_combined[..]] {
            assert_eq!(widened_kinetic_numerator(rows).unwrap() / denominator, 0);
        }
        assert_eq!(widened_kinetic_numerator(&[(0, [1, 0, 0])]),
                   Err(DirectionalReject::NoSolution));
        assert_eq!(widened_kinetic_numerator(&[(i64::MAX, [i64::MAX; 3])]),
                   Err(DirectionalReject::Overflow));
    }

    #[test]
    fn equipment_com_energy_includes_offset_changes_and_every_cross_term() {
        let before = [EquipmentComSample { mass_raw: 3,
            body_velocity_raw: [10, -2, 0], hand_velocity_raw: [4, 5, 0],
            velocity_offset_raw: [2, -1, 0], owns_equipment: true }];
        let after = [EquipmentComSample { mass_raw: 3,
            body_velocity_raw: [11, -2, 0], hand_velocity_raw: [5, 4, 0],
            velocity_offset_raw: [3, 3, 0], owns_equipment: true }];
        assert_eq!(equipment_com_velocity_raw(before[0]).unwrap(), [16, 2, 0]);
        assert_eq!(equipment_com_velocity_raw(after[0]).unwrap(), [19, 5, 0]);
        assert_eq!((widened_equipment_com_numerator(&before).unwrap(),
                    widened_equipment_com_numerator(&after).unwrap()), (780, 1_158));

        // Squaring body, hand and offset separately would answer 450 -> 552.
        // Both numbers and their delta disagree with the COM row, so deleting
        // any cross term cannot leave this test green.
        assert_eq!(1_158 - 780, 378);
        assert_ne!((780, 1_158), (450, 552));
    }

    #[test]
    fn zero_effort_cannot_fund_positive_com_energy_but_exact_work_can() {
        let before = [EquipmentComSample { mass_raw: 3,
            body_velocity_raw: [10, -2, 0], hand_velocity_raw: [4, 5, 0],
            velocity_offset_raw: [2, -1, 0], owns_equipment: true }];
        let after = [EquipmentComSample { mass_raw: 3,
            body_velocity_raw: [11, -2, 0], hand_velocity_raw: [5, 4, 0],
            velocity_offset_raw: [3, 3, 0], owns_equipment: true }];
        assert!(!equipment_com_energy_fits_supplied_work(&before, &after, 0).unwrap());
        assert!(!equipment_com_energy_fits_supplied_work(&before, &after, 377).unwrap());
        assert!(equipment_com_energy_fits_supplied_work(&before, &after, 378).unwrap());
        assert!(equipment_com_energy_fits_supplied_work(&after, &before, 0).unwrap(),
            "dissipation does not require motor work");
        assert_eq!(equipment_com_energy_fits_supplied_work(&before, &after, -1),
                   Err(DirectionalReject::NoSolution));
    }

    #[test]
    fn changing_com_offset_is_zero_work_when_the_free_hand_velocity_is_corrected() {
        let initial = [EquipmentComSample { mass_raw: 3,
            body_velocity_raw: [2, 0, 0], hand_velocity_raw: [5, 0, 0],
            velocity_offset_raw: [3, 0, 0], owns_equipment: true }];
        // Persisted COM-relative velocity is hand+offset = 8. When the next
        // scalar pose changes the offset to -2, the free hand velocity is
        // therefore 8-(-2)=10 before the motor contributes any work.
        let coast = [EquipmentComSample { hand_velocity_raw: [10, 0, 0],
            velocity_offset_raw: [-2, 0, 0], ..initial[0] }];
        let final_state = [EquipmentComSample { hand_velocity_raw: [11, 0, 0],
            ..coast[0] }];
        let ledger = equipment_com_work_ledger(&initial, &coast, &final_state).unwrap();
        assert_eq!(ledger, EquipmentComWorkLedger { initial_numerator: 300,
            coast_numerator: 300, final_numerator: 363, transport_delta: 0, motor_work: 63 });
        assert_eq!(equipment_com_velocity_raw(initial[0]).unwrap(), [10, 0, 0]);
        assert_eq!(equipment_com_velocity_raw(coast[0]).unwrap(), [10, 0, 0]);
        assert_eq!(equipment_com_velocity_raw(final_state[0]).unwrap(), [11, 0, 0]);
        assert_eq!(equipment_com_relative_velocity_raw(initial[0]).unwrap(), [8, 0, 0]);
        assert_eq!(equipment_com_relative_velocity_raw(coast[0]).unwrap(), [8, 0, 0]);
        assert_eq!(equipment_com_relative_velocity_raw(final_state[0]).unwrap(), [9, 0, 0]);
        assert_eq!(widened_equipment_com_motor_work(&coast, &final_state), Ok(63));
        assert!(!equipment_com_energy_fits_supplied_work(&coast, &final_state, 62).unwrap());
        assert!(equipment_com_energy_fits_supplied_work(&coast, &final_state, 63).unwrap());

        let uncorrected = [EquipmentComSample { hand_velocity_raw: [5, 0, 0],
            ..coast[0] }];
        let wrong = equipment_com_work_ledger(&initial, &uncorrected, &uncorrected).unwrap();
        assert_eq!((wrong.coast_numerator, wrong.transport_delta), (75, -225));
        assert_ne!(wrong.transport_delta, 0,
            "changing the offset without correcting the hand silently changed COM energy");
    }

    #[test]
    fn discrete_com_work_is_the_signed_widened_energy_difference() {
        let before = [EquipmentComSample { mass_raw: 5,
            body_velocity_raw: [1, -2, 3], hand_velocity_raw: [4, 6, -1],
            velocity_offset_raw: [-2, 1, 2], owns_equipment: true }];
        let after = [EquipmentComSample { mass_raw: 5,
            body_velocity_raw: [2, -1, 3], hand_velocity_raw: [5, 3, -2],
            velocity_offset_raw: [1, 2, 1], owns_equipment: true }];
        let before_energy = widened_equipment_com_numerator(&before).unwrap();
        let after_energy = widened_equipment_com_numerator(&after).unwrap();
        assert_eq!((equipment_com_velocity_raw(before[0]).unwrap(),
                    equipment_com_velocity_raw(after[0]).unwrap()),
                   ([3, 5, 4], [8, 4, 2]));
        assert_eq!((before_energy, after_energy), (250, 420));
        assert_eq!(widened_equipment_com_discrete_work(&before, &after), Ok(170));
        assert_eq!(widened_equipment_com_discrete_work(&after, &before), Ok(-170));
        assert_eq!(after_energy - before_energy, 170);
        assert_eq!(widened_equipment_com_motor_work(&before, &after),
                   Err(DirectionalReject::NoSolution),
                   "body work must not be charged to the relative COM motor state");
    }

    #[test]
    fn a_zero_offset_shield_is_the_body_plus_hand_control() {
        let shield = [EquipmentComSample { mass_raw: 5,
            body_velocity_raw: [7, -3, 2], hand_velocity_raw: [-2, 5, -2],
            velocity_offset_raw: [0, 0, 0], owns_equipment: true }];
        assert_eq!(equipment_com_velocity_raw(shield[0]).unwrap(), [5, 2, 0]);
        assert_eq!(widened_equipment_com_numerator(&shield), Ok(145));
        let changed_offset = [EquipmentComSample { velocity_offset_raw: [1, 0, 0],
            ..shield[0] }];
        assert_eq!(widened_equipment_com_numerator(&changed_offset), Ok(200));
    }

    #[test]
    fn two_handed_equipment_contributes_only_its_right_owned_com_row() {
        let right = EquipmentComSample { mass_raw: 7,
            body_velocity_raw: [3, 4, 0], hand_velocity_raw: [5, -2, 1],
            velocity_offset_raw: [1, 3, 0], owns_equipment: true };
        let left_mirror = EquipmentComSample { mass_raw: 7,
            body_velocity_raw: [3, 4, 0], hand_velocity_raw: [5, 2, 1],
            velocity_offset_raw: [1, -3, 0], owns_equipment: false };
        assert_eq!(widened_equipment_com_numerator(&[right]), Ok(749));
        assert_eq!(widened_equipment_com_numerator(&[right, left_mirror]), Ok(749));
        let mutated_mirror = EquipmentComSample {
            hand_velocity_raw: [i64::MAX, i64::MAX, i64::MAX], ..left_mirror };
        assert_eq!(widened_equipment_com_numerator(&[right, mutated_mirror]), Ok(749));
        assert_eq!(widened_equipment_com_numerator(&[EquipmentComSample {
            owns_equipment: true, ..left_mirror }]), Ok(637));
        assert_eq!(widened_equipment_com_numerator(&[EquipmentComSample {
            mass_raw: 0, ..right }]), Err(DirectionalReject::NoSolution));
    }

    #[test]
    fn neighbor_angle_kkt_wraps_at_the_u16_seam() {
        let left = NeighborKktSample { angle: Angle::from_raw(u16::MAX),
            signed_cross: -5, alignment: 9 };
        let right = NeighborKktSample { angle: Angle::ZERO,
            signed_cross: 1, alignment: 9 };
        assert_eq!(accept_neighbor_angle_kkt(left, right), Ok(Angle::ZERO));
        assert_eq!(accept_neighbor_angle_kkt(right, left), Err(NeighborKktReject::NotNeighbors));
    }

    #[test]
    fn neighbor_angle_kkt_selection_mirrors_without_a_handed_tie_break() {
        let left = NeighborKktSample { angle: Angle::from_raw(100),
            signed_cross: -2, alignment: 11 };
        let right = NeighborKktSample { angle: Angle::from_raw(101),
            signed_cross: 7, alignment: 13 };
        let chosen = accept_neighbor_angle_kkt(left, right).unwrap();
        let mirrored_left = NeighborKktSample { angle: -right.angle,
            signed_cross: -right.signed_cross, alignment: right.alignment };
        let mirrored_right = NeighborKktSample { angle: -left.angle,
            signed_cross: -left.signed_cross, alignment: left.alignment };
        let mirrored = accept_neighbor_angle_kkt(mirrored_left, mirrored_right).unwrap();
        assert_eq!(mirrored, -chosen);
    }

    #[test]
    fn a_least_bad_neighbor_without_a_sign_bracket_is_rejected() {
        let left = NeighborKktSample { angle: Angle::from_raw(400),
            signed_cross: -7, alignment: 5 };
        let less_bad = NeighborKktSample { angle: Angle::from_raw(401),
            signed_cross: -2, alignment: 5 };
        assert_eq!(accept_neighbor_angle_kkt(left, less_bad),
                   Err(NeighborKktReject::NoSignBracket));
    }

    #[test]
    fn equal_neighbor_errors_reject_an_ambiguous_mirror_tie() {
        let left = NeighborKktSample { angle: Angle::from_raw(u16::MAX),
            signed_cross: -3, alignment: 8 };
        let right = NeighborKktSample { angle: Angle::ZERO,
            signed_cross: 3, alignment: 8 };
        assert_eq!(accept_neighbor_angle_kkt(left, right),
                   Err(NeighborKktReject::AmbiguousMirrorTie));
    }

    #[test]
    fn friction_uses_two_projected_tangent_directions() {
        let matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        let before = [-8, 3, -4];
        let impulse = [8, -3, 4];
        assert_ne!((impulse[1], impulse[2]), (0, 0));
        assert_eq!(directional_residuals(&matrix, before, impulse).unwrap(), [0, 0, 0]);

        let without_first = directional_residuals(&matrix, before, [8, 0, 4]).unwrap();
        let without_second = directional_residuals(&matrix, before, [8, -3, 0]).unwrap();
        assert!(without_first[1].abs() > 1, "the first tangent column became optional");
        assert!(without_second[2].abs() > 1, "the second tangent column became optional");
    }

    #[test]
    fn friction_rechecks_the_normal_after_both_tangent_coordinates() {
        // Normal-only reaches zero. The first tangent does not disturb it, but
        // the second has a cross response and reopens closing by four raw
        // units. A validator that checks normal before friction accepts this.
        let matrix = [[1, 0, -1], [0, 1, 0], [0, 0, 1]];
        let before = [-8, 3, -4];
        let normal_only = directional_residuals(&matrix, before, [8, 0, 0]).unwrap();
        assert_eq!(normal_only[0], 0);
        let combined = directional_residuals(&matrix, before, [8, -3, 4]).unwrap();
        assert_eq!((combined[1], combined[2]), (0, 0));
        assert_eq!(combined[0], -4, "the final projection must recheck normal restitution");
        assert!(!friction_residuals_valid(combined));
    }
}

#[cfg(test)]
pub(crate) fn advance_projected_fixture_to_group(
    rows: &mut [ContactCollider], numerator: u32, denominator: u32,
) -> Result<(), ResolutionError> {
    if denominator == 0 || numerator > denominator { return Err(ResolutionError::Projector); }
    advance_all(rows, numerator, denominator);
    Ok(())
}

#[cfg(test)]
pub(crate) fn finish_projected_fixture(rows: &mut [ContactCollider]) {
    finish_all(rows);
}

#[cfg(feature = "cartesian-recoil")]
impl ContactTickScratch {
    pub(crate) fn request_exact_segment_body_target(&mut self,
        target: crate::combat::contact::ExactSegmentBodyDiagnosticTarget) -> bool
    { self.collection.request_segment_body_target(target) }

    pub(crate) fn request_exact_segment_body_pair_aabb_target(&mut self,
        target: crate::combat::contact::ExactSegmentBodyDiagnosticTarget) -> bool
    { self.collection.request_segment_body_pair_aabb_target(target) }

    pub(crate) fn request_exact_segment_hilt_start_x_target(&mut self,
        target: crate::combat::contact::ExactSegmentBodyDiagnosticTarget) -> bool
    { self.collection.request_segment_hilt_start_x_target(target) }

    pub(crate) fn exact_segment_body_target_diagnostic(&self)
        -> Option<crate::combat::contact::ExactSegmentBodyTargetDiagnostic<'_>>
    { self.collection.segment_body_target_diagnostic() }

    pub(crate) fn exact_segment_body_pair_aabb_diagnostic(&self)
        -> Option<crate::combat::contact::ExactSegmentBodyTargetDiagnostic<'_>>
    { self.collection.segment_body_pair_aabb_diagnostic() }

    pub(crate) fn exact_segment_hilt_start_x_diagnostic(&self)
        -> Option<crate::combat::contact::ExactSegmentHiltStartXTargetDiagnostic<'_>>
    { self.collection.segment_hilt_start_x_diagnostic() }

    #[cfg(test)]
    pub(crate) fn set_segment_body_test_mutation(&mut self,
        mutation: crate::combat::contact::ExactSegmentBodyTestMutation)
    { self.collection.set_segment_body_test_mutation(mutation); }

    #[cfg(test)]
    pub(crate) fn segment_body_test_mutation_fired(&self) -> bool
    { self.collection.segment_body_test_mutation_fired() }
}
