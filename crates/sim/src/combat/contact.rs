//! Stable contact evidence and ordering for articulated combat.
//!
//! Collection owns geometry, but resolution owns no geometry at all: this file
//! is the narrow byte-stable handoff between the two.  Keeping the rows plain
//! also lets replay, wasm, and the mechanical proof inspect the same result.

use crate::{EntityId, Faction};
use crate::combat::spec::{AnatomyRegion, SurfaceSpec};
#[cfg(any(test, feature = "cartesian-recoil"))]
use crate::combat::resolution::GeneralizedKind;
#[cfg(any(test, feature = "cartesian-recoil"))]
use crate::combat::trajectory::{
    evaluate_exact, validate_exact_rows, EvaluatedContactShape, ExactAffine3, ExactContactTrajectory,
    ExactHeldResponse, ExactMomentum, ExactMotorBounds, ExactMotorPoint, ExactOwnerTrajectory,
    ExactPoint, ExactPosition, ExactTrajectoryReject, MotorShape,
};
use fx::{
    closest_points_on_segments, closest_points_segment_rectangle,
    swept_segment_rectangle, swept_segment_segment,
    Fx, TimeOfImpact, Vec3,
};
#[cfg(any(test, feature = "cartesian-recoil"))]
use core::cmp::Ordering;
#[cfg(any(test, feature = "cartesian-recoil"))]
use crate::combat::wide::WideRational4096;

#[cfg(any(test, feature = "cartesian-recoil"))]
const EXACT_NUMERATOR_LIMIT: u128 = 1u128 << 94;
#[cfg(any(test, feature = "cartesian-recoil"))]
// A frozen World pose can carry an irreducible squared mass denominator above
// 2^46 (the retained clinch fixture reaches 100_437_541_639_380_625). 2^64 is
// the smallest round binary envelope above that measured witness. Operations
// still use checked i128 and refuse any wider cross-product independently.
const EXACT_DENOMINATOR_LIMIT: i128 = 1i128 << 64;

pub const MAX_CONTACT_GROUPS_PER_TICK: u8 = 8;
pub const MAX_ARTICULATED_ENTITIES: usize = 64;
pub const MAX_CONTACT_FACTS_PER_GROUP: usize = 512;
pub const MAX_CONTACT_RESOLUTIONS_PER_TICK: usize = 4_096;
pub const BODY_SLOT: u8 = 0xff;

/// The region byte a fact that is not against a body carries. Weapon/weapon and
/// weapon/shield have no anatomy to name, and `0xff` is outside every
/// `BodyPart` discriminant rather than aliasing one of them.
pub const NO_REGION: u8 = 0xff;

/// Componentwise entry clamp on every generalized contact velocity.
///
/// Deliberately not four, and the difference is a real defect this number
/// closes.  The clamp is componentwise, but the sweep's envelope is on the
/// *magnitude* and is four -- so a componentwise four admits `4*sqrt(3)` =
/// 6.93, and `fx` fails an out-of-envelope sweep closed by answering
/// `TimeOfImpact::ZERO`.  That is not a dropped contact, it is a manufactured
/// one against every hostile collider in the arena however far away: two
/// zero-radius points 11.3 units apart, one holding `(3,3,0)`, measurably
/// resolved an impulse of -1.
///
/// So this is the largest `L` with `3*L^2 <= (4*ONE_RAW)^2`, which is exactly
/// the condition that three clamped components stay inside the envelope.  It
/// costs nothing measurable: 2.309 is 12.5x the fastest equipment point the
/// shipped roster can produce and 2.4x the fastest any anatomy the validator
/// accepts can produce, and no impulse can exceed those because the alpha
/// search forbids the closure's energy from rising.  Clamping the magnitude
/// to four instead was tried and is unsound -- `Fx` length floors, so for any
/// vector whose raw squared length lands in `(262144^2, 262145^2)` the scale
/// is the identity map and up to 0.999903 raw units of overshoot survive it,
/// which the inclusive envelope test rejects exactly as hard as 6.93 would.
pub const CONTACT_COMPONENT_SPEED_LIMIT: Fx = Fx::from_raw(151_348);

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum ContactKind { WeaponWeapon = 0, WeaponShield = 1, WeaponBody = 2 }

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct ContactKey {
    pub a: EntityId,
    pub a_slot: u8,
    pub b: EntityId,
    pub b_slot: u8,
    pub kind: ContactKind,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactWidePrimitiveDiagnostic {
    CompatibilityFallback, SegmentSegment, SegmentShield, SegmentBodyRegion,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactWideComparisonDiagnostic {
    DistanceLessThanOrEqualRadiusSquared, EarliestTimeThenMedialThenRegion,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactWideToiDiagnostic {
    pub key: ContactKey, pub region: u8,
    pub primitive: ExactWidePrimitiveDiagnostic,
    pub interval_start_raw: u32, pub interval_end_raw: u32,
    pub visited_times_raw: [u32; 8], pub safe_steps_raw: [u32; 8],
    pub visit_count: u8, pub accepted_root_raw: u32, pub closest_feature: u8,
    pub comparison: ExactWideComparisonDiagnostic,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactCompatibilityPrimitiveDiagnostic { SweptSegmentSegment, SweptSegmentRectangle }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactCompatibilitySweepDiagnostic {
    pub key: ContactKey, pub region: u8,
    pub primitive: ExactCompatibilityPrimitiveDiagnostic,
    pub points_raw: [[i32; 3]; 12], pub point_count: u8,
    pub radii_raw: [i32; 2], pub accepted_toi_raw: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactFact {
    pub key: ContactKey,
    pub toi: TimeOfImpact,
    pub region: u8,
    pub point: Vec3,
    pub normal: Vec3,
    pub velocity_a: Vec3,
    pub velocity_b: Vec3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactImpulse { pub key: ContactKey, pub on_a: Vec3, pub on_b: Vec3 }

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct EnergyLedger {
    pub before_raw: u64,
    pub after_raw: u64,
    pub dissipated_raw: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct ContactSolverState { pub cap_hits: u32 }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactResolution {
    pub group_ordinal: u8,
    pub group_alpha_raw: u32,
    pub fact: ContactFact,
    pub impulse: ContactImpulse,
    pub energy: EnergyLedger,
    pub cut_raw: u64,
    pub thrust_raw: u64,
    pub pressure_raw: u64,
    pub deflected_raw: u64,
    pub severed: bool,
}

/// One region's swept capsule for the whole tick.
///
/// Five of these are a body. They are absolute rather than body-relative
/// because two of them -- the arms -- are not rigid against the origin, so
/// there is no one offset that could carry them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct RegionSweep {
    pub previous_lower: Vec3,
    pub previous_upper: Vec3,
    pub requested_lower: Vec3,
    pub requested_upper: Vec3,
    pub radius: Fx,
    /// False for a region severed before or during this tick. Absent regions
    /// are skipped by the sweep entirely; they are not zero-radius points.
    pub present: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ContactShape {
    Segment {
        previous_hilt: Vec3, previous_tip: Vec3,
        requested_hilt: Vec3, requested_tip: Vec3,
        radius: Fx,
    },
    Shield { previous: [Vec3; 4], requested: [Vec3; 4] },
    /// A body is its five regional volumes plus the planar origin they were
    /// built from. The origin is carried rather than recovered from a region,
    /// because the commit needs the body's own settled point and every region
    /// is offset from it by something the spec chose.
    Body {
        previous_origin: Vec3,
        requested_origin: Vec3,
        parts: [RegionSweep; AnatomyRegion::COUNT],
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactCollider {
    pub entity: EntityId,
    pub faction: Faction,
    pub slot: u8,
    pub mass: Fx,
    pub surface: SurfaceSpec,
    pub velocity: Vec3,
    /// How much of `velocity` belongs to the point it is sampled at rather
    /// than to the hand that carries the row.
    ///
    /// Zero for everything except a held segment, whose one point velocity is
    /// sampled at the blade's centre of mass -- so `velocity - velocity_offset`
    /// is exactly the hand velocity, which is the only velocity an arm joint
    /// can be asked about. A trial that maps this row through the joint has to
    /// take the offset off on the way in and put it back on the way out, or it
    /// derives a hand the arm never had and clamps it against the wrong limit.
    /// It is a fixed per-row quantity for the whole tick: the sweep translates
    /// hilt and tip together, which cancels in the differential it is built
    /// from, and the row's velocity is a per-tick displacement that no advance
    /// rescales.
    pub velocity_offset: Vec3,
    pub shape: ContactShape,
    /// False once the limb owning this row has been severed earlier in the same
    /// tick. The row stays in the slice -- removing it would re-index every
    /// candidate the driver is holding -- but it takes no further part in a
    /// sweep. Severance has to reach the geometry inside the tick, not on the
    /// next one, or the arm that was just taken off goes on swinging.
    pub present: bool,
}

#[derive(Clone, Copy)]
pub(crate) struct Candidate {
    pub(crate) fact: ContactFact, distance_sq: Fx, feature: u8,
    #[cfg(feature = "cartesian-recoil")]
    pub(crate) wide_toi: Option<ExactWideToiDiagnostic>,
    #[cfg(feature = "cartesian-recoil")]
    pub(crate) compatibility_sweep: Option<ExactCompatibilitySweepDiagnostic>,
}

/// Candidate storage for one scan. It deliberately holds candidates rather
/// than facts: a scan sees every pair that contacts anywhere in the remaining
/// tick, which at the entity ceiling is 32,256 rows, while a single resolved
/// group is capped at 512. Keeping the two vectors separate is what lets the
/// driver honour the smaller bound without ever truncating a scan.
#[derive(Clone, Default)]
pub struct ContactCollectionScratch {
    candidates: Vec<Candidate>,
    #[cfg(any(test, feature = "cartesian-recoil"))]
    exact_staging: Vec<Candidate>,
    #[cfg(any(test, feature = "cartesian-recoil"))]
    exact_wide: ExactWideScratch,
}

impl ContactCollectionScratch {
    pub fn try_reserve(&mut self, candidate_bound: usize) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.candidates, candidate_bound)?;
        #[cfg(any(test, feature = "cartesian-recoil"))]
        try_reserve_exact(&mut self.exact_staging, candidate_bound)?;
        #[cfg(any(test, feature = "cartesian-recoil"))]
        self.exact_wide.try_reserve()?;
        Ok(())
    }

    pub(crate) fn candidates(&self) -> &[Candidate] { &self.candidates }

    #[cfg(test)]
    pub(crate) fn candidate_capacity(&self) -> usize { self.candidates.capacity() }

    #[cfg(test)]
    pub(crate) fn capacities(&self) -> [usize; 4] {
        [self.candidates.capacity(), self.exact_staging.capacity(),
         self.exact_wide.segment_candidates.capacity(),
         self.exact_wide.rectangle_candidates.capacity()]
    }
}

/// `Vec::reserve*` takes capacity *beyond `len()`*, not beyond `capacity()`.
/// Subtracting the capacity instead is a silent no-op on exactly the vectors
/// this solver reserves -- cleared ones -- so it is written once, here.
///
/// Fallible, because the far end of the only caller that matters is a browser
/// holding typed-array views into linear memory: aborting there blanks the
/// screen, and answering an error lets the host refuse the spawn instead.
pub(crate) fn try_reserve_exact<T>(
    rows: &mut Vec<T>, bound: usize,
) -> Result<(), ContactCapacityError> {
    rows.try_reserve_exact(bound.saturating_sub(rows.len()))
        .map_err(|_| ContactCapacityError::Allocation)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ContactCapacityError {
    EntityLimit,
    PairCount,
    CandidateCount,
    ResolutionCount,
    ColliderCount,
    EnergyNumerator,
    GeometryEnvelope,
    Allocation,
}

/// Every reservation bound implied by an allocated-slot high water.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactBounds {
    pub pairs: usize,
    pub candidate_bound: usize,
    pub collider_bound: usize,
}

/// Derive the bounds, or say which count refused to fit.
///
/// Everything here is comfortable at the ceiling -- 64 entities make 2,016
/// pairs, 32,256 candidates and 192 colliders -- so none of these `checked_`
/// calls can fail today. They are written anyway because the alternative is a
/// silent wrap in the one function whose entire job is to bound the solver's
/// memory, and because the ceiling is a constant somebody will eventually
/// raise.
pub fn contact_bounds(high_water: usize) -> Result<ContactBounds, ContactCapacityError> {
    if high_water > MAX_ARTICULATED_ENTITIES { return Err(ContactCapacityError::EntityLimit); }
    let pairs = match high_water {
        0 | 1 => 0,
        n => n.checked_mul(n - 1).ok_or(ContactCapacityError::PairCount)? / 2,
    };
    let candidate_bound = pairs.checked_mul(16).ok_or(ContactCapacityError::CandidateCount)?;
    let collider_bound = high_water.checked_mul(3).ok_or(ContactCapacityError::ColliderCount)?;

    // Eight groups of at most 512 rows is exactly the resolution ceiling, so
    // this is an invariant and not a live limit -- but it is an invariant that
    // ties three separate constants together, and nothing else checks it.
    let admissible = (MAX_CONTACT_GROUPS_PER_TICK as usize)
        .checked_mul(MAX_CONTACT_FACTS_PER_GROUP).ok_or(ContactCapacityError::ResolutionCount)?;
    if admissible > MAX_CONTACT_RESOLUTIONS_PER_TICK {
        return Err(ContactCapacityError::ResolutionCount);
    }

    // The energy accumulator's worst case, in the same signed `i128` it uses.
    // The velocity term stays at 4 rather than following
    // `CONTACT_COMPONENT_SPEED_LIMIT` down to 2.309 on purpose: this is a
    // headroom argument, and proving the accumulator survives three times the
    // reachable limit is worth more than proving it survives exactly it.
    let mass = Fx::from_int(8).raw() as i128;
    let speed = Fx::from_int(4).raw() as i128;
    (collider_bound as i128)
        .checked_mul(mass).ok_or(ContactCapacityError::EnergyNumerator)?
        .checked_mul(3).ok_or(ContactCapacityError::EnergyNumerator)?
        .checked_mul(speed * speed).ok_or(ContactCapacityError::EnergyNumerator)?;

    Ok(ContactBounds { pairs, candidate_bound, collider_bound })
}

/// Collect the earliest fact per contacting pair. World owns construction and
/// capacity; this function owns only the hostile matrix and its full-identity
/// ordering.
pub fn collect_contacts(colliders: &[ContactCollider]) -> Vec<ContactFact> {
    let mut scratch = ContactCollectionScratch::default();
    scan_candidates_into(colliders, &mut scratch);
    scratch.candidates.iter().map(|row| row.fact).collect()
}

pub(crate) fn scan_candidates_into(
    colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch,
) {
    // Existing callers have no response column yet, which is a proof of zero
    // rather than an invitation to manufacture exact state. Both default and
    // feature builds enter the same dispatcher; checkpoint C changes this
    // variant at the World call site when the response column lands.
    let result = scan_detector_into(DetectorInput::ZeroResponseCompatibility,
                                    colliders, scratch);
    debug_assert_eq!(result, Ok(()));
}

fn scan_compatibility_candidates_into(
    colliders: &[ContactCollider], scratch: &mut ContactCollectionScratch,
) {
    scratch.candidates.clear();
    for i in 0..colliders.len() {
        for j in i + 1..colliders.len() {
            let a = &colliders[i];
            let b = &colliders[j];
            if !a.present || !b.present { continue; }
            if a.entity == b.entity || a.faction == b.faction { continue; }
            #[allow(unused_mut)] // Mutated only by the feature-only diagnostic below.
            if let Some(mut candidate) = candidate(a, b) {
                #[cfg(feature = "cartesian-recoil")]
                { candidate.wide_toi = Some(ExactWideToiDiagnostic {
                    key: candidate.fact.key, region: candidate.fact.region,
                    primitive: ExactWidePrimitiveDiagnostic::CompatibilityFallback,
                    interval_start_raw: 0, interval_end_raw: 65_536,
                    visited_times_raw: [0; 8], safe_steps_raw: [0; 8], visit_count: 0,
                    accepted_root_raw: candidate.fact.toi.get().raw() as u32,
                    closest_feature: candidate.feature,
                    comparison: ExactWideComparisonDiagnostic::DistanceLessThanOrEqualRadiusSquared,
                }); }
                scratch.candidates.push(candidate);
            }
        }
    }
    // Unstable, and that is not a determinism hole: `sort_unstable` only
    // reorders elements its key compares equal, and one scan emits at most one
    // candidate per `(pair, kind)`, so `ContactKey` alone is already a strict
    // total order over these rows -- there are no equal keys to reorder. The
    // stable sort is what would break the contract here, because it heap
    // allocates a `len/2` buffer above about twenty elements, and at the entity
    // ceiling this list is 32,256 rows: roughly 2.7 MB of transient allocation
    // per scan, up to nine scans a tick, inside the driver that promises to
    // allocate nothing once reserved.
    scratch.candidates.sort_unstable_by_key(
        |row| (row.fact.key, row.fact.toi, row.distance_sq, row.feature));
    scratch.candidates.dedup_by_key(|row| row.fact.key);
}

#[allow(dead_code)]
#[derive(Clone, Copy)]
enum DetectorInput<'a> {
    ZeroResponseCompatibility,
    #[cfg(any(test, feature = "cartesian-recoil"))]
    Exact {
        trajectories: &'a [ExactContactTrajectory],
        owners: &'a [ExactOwnerTrajectory],
    },
    #[cfg(not(any(test, feature = "cartesian-recoil")))]
    _Lifetime(core::marker::PhantomData<&'a ()>),
}

fn scan_detector_into(
    input: DetectorInput<'_>, colliders: &[ContactCollider],
    scratch: &mut ContactCollectionScratch,
) -> Result<(), ExactScanReject> {
    match input {
        DetectorInput::ZeroResponseCompatibility => {
            scan_compatibility_candidates_into(colliders, scratch);
            Ok(())
        }
        #[cfg(any(test, feature = "cartesian-recoil"))]
        DetectorInput::Exact { trajectories, owners } => {
            let nonzero = preflight_exact_compatibility(trajectories, owners, colliders)?;
            if !nonzero {
                scan_compatibility_candidates_into(colliders, scratch);
                return Ok(());
            }
            scratch.exact_staging.clear();
            for i in 0..trajectories.len() { for j in i + 1..trajectories.len() {
                let a = &trajectories[i]; let b = &trajectories[j];
                if !a.present || !b.present || a.entity == b.entity || a.faction == b.faction {
                    continue;
                }
                let owner_a = owners.get(a.owner_index)
                    .ok_or(ExactScanReject::CompatibilityIdentity)?;
                let owner_b = owners.get(b.owner_index)
                    .ok_or(ExactScanReject::CompatibilityIdentity)?;
                // Every supported primitive is affine between the current
                // group boundary and the tick end. Its endpoint AABB is
                // therefore an exact enclosure of the whole swept volume.
                // Rejecting disjoint boxes here is more than an optimization:
                // distant high-water pairs must not spend the fixed wide
                // predicate envelope merely to prove what their first-order
                // bounds already prove.
                if exact_pair_has_swept_aabb(a, b)
                    && wide_swept_aabbs_are_disjoint(a, owner_a, b, owner_b)? {
                    continue;
                }
                let candidate = match (&a.motor, &b.motor) {
                    (MotorShape::Segment { .. }, MotorShape::Shield { .. }) =>
                        wide_sweep_segment_shield(a, owner_a, b, owner_b,
                                                  &colliders[i], &colliders[j],
                                                  &mut scratch.exact_wide)?,
                    (MotorShape::Shield { .. }, MotorShape::Segment { .. }) =>
                        wide_sweep_segment_shield(b, owner_b, a, owner_a,
                                                  &colliders[j], &colliders[i],
                                                  &mut scratch.exact_wide)?,
                    (MotorShape::Segment { .. }, MotorShape::Body { .. }) =>
                        wide_sweep_segment_body(a, owner_a, b, owner_b,
                                                &colliders[i], &colliders[j],
                                                &mut scratch.exact_wide)?,
                    (MotorShape::Body { .. }, MotorShape::Segment { .. }) =>
                        wide_sweep_segment_body(b, owner_b, a, owner_a,
                                                &colliders[j], &colliders[i],
                                                &mut scratch.exact_wide)?,
                    (MotorShape::Segment { .. }, MotorShape::Segment { .. }) if
                        (a.entity, a.slot) <= (b.entity, b.slot) =>
                        wide_sweep_segments(a, owner_a, b, owner_b,
                                            &colliders[i], &colliders[j],
                                            &mut scratch.exact_wide)?,
                    (MotorShape::Segment { .. }, MotorShape::Segment { .. }) =>
                        wide_sweep_segments(b, owner_b, a, owner_a,
                                            &colliders[j], &colliders[i],
                                            &mut scratch.exact_wide)?,
                    // Body/body separation is a distinct World phase, and
                    // body/shield plus shield/shield have never been contact
                    // primitives. The exact branch owns the same pair domain
                    // as `candidate`; a response word does not turn an ignored
                    // collider pairing into a new kind of contact.
                    _ => None,
                };
                if let Some(candidate) = candidate { scratch.exact_staging.push(candidate); }
            } }
            scratch.exact_staging.sort_unstable_by_key(
                |row| (row.fact.key, row.fact.toi, row.distance_sq, row.feature));
            scratch.exact_staging.dedup_by_key(|row| row.fact.key);
            core::mem::swap(&mut scratch.candidates, &mut scratch.exact_staging);
            Ok(())
        }
        #[cfg(not(any(test, feature = "cartesian-recoil")))]
        DetectorInput::_Lifetime(_) => unreachable!(),
    }
}

/// The temporary bridge from the rounded row grammar to checkpoint B's exact
/// detector input. It deliberately keeps the rounded rows too: velocity and
/// velocity-offset publication are part of `ContactFact`, but checkpoint A's
/// trajectory grammar contains geometry rather than those resolver words.
/// Inventing either value from an endpoint would make the adapter a second
/// authority before World owns the missing provenance.
#[cfg(any(test, feature = "cartesian-recoil"))]
#[allow(dead_code)]
pub(crate) struct ZeroResponseCompatibility {
    pub(crate) owners: Vec<ExactOwnerTrajectory>,
    pub(crate) trajectories: Vec<ExactContactTrajectory>,
}

#[allow(dead_code)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum ExactScanReject {
    ArithmeticEnvelope,
    Budget,
    CompatibilityIdentity,
    #[cfg(any(test, feature = "cartesian-recoil"))]
    Trajectory(ExactTrajectoryReject),
    UnsupportedExactSweep,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_rational(value: crate::combat::trajectory::ExactRational)
    -> Result<crate::combat::trajectory::ExactRational, ExactScanReject>
{
    if value.denominator <= 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    let shared_binary = value.numerator.unsigned_abs().trailing_zeros()
        .min((value.denominator as u128).trailing_zeros());
    let value = crate::combat::trajectory::ExactRational {
        numerator: value.numerator >> shared_binary,
        denominator: value.denominator >> shared_binary,
    };
    if value.denominator > EXACT_DENOMINATOR_LIMIT
        || value.numerator.unsigned_abs() > EXACT_NUMERATOR_LIMIT {
        return Err(ExactScanReject::ArithmeticEnvelope);
    }
    if value.numerator == 0 {
        Ok(crate::combat::trajectory::ExactRational { numerator: 0, denominator: 1 })
    } else if value.numerator % value.denominator == 0 {
        Ok(crate::combat::trajectory::ExactRational {
            numerator: value.numerator / value.denominator, denominator: 1,
        })
    } else {
        Ok(value)
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_neg(value: crate::combat::trajectory::ExactRational)
    -> Result<crate::combat::trajectory::ExactRational, ExactScanReject>
{
    exact_rational(crate::combat::trajectory::ExactRational {
        numerator: value.numerator.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?,
        denominator: value.denominator,
    })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_add(
    a: crate::combat::trajectory::ExactRational,
    b: crate::combat::trajectory::ExactRational,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let a = exact_rational(a)?; let b = exact_rational(b)?;
    let value = if a.denominator == b.denominator {
        crate::combat::trajectory::ExactRational {
            numerator: a.numerator.checked_add(b.numerator)
                .ok_or(ExactScanReject::ArithmeticEnvelope)?, denominator: a.denominator,
        }
    } else if a.denominator % b.denominator == 0 {
        crate::combat::trajectory::ExactRational {
            numerator: b.numerator.checked_mul(a.denominator / b.denominator)
                .and_then(|word| a.numerator.checked_add(word))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?, denominator: a.denominator,
        }
    } else if b.denominator % a.denominator == 0 {
        crate::combat::trajectory::ExactRational {
            numerator: a.numerator.checked_mul(b.denominator / a.denominator)
                .and_then(|word| word.checked_add(b.numerator))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?, denominator: b.denominator,
        }
    } else {
        crate::combat::trajectory::ExactRational {
            numerator: a.numerator.checked_mul(b.denominator).and_then(|left|
                b.numerator.checked_mul(a.denominator).and_then(|right| left.checked_add(right)))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?,
            denominator: a.denominator.checked_mul(b.denominator)
                .ok_or(ExactScanReject::ArithmeticEnvelope)?,
        }
    };
    exact_rational(value)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_sub(
    a: crate::combat::trajectory::ExactRational,
    b: crate::combat::trajectory::ExactRational,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    exact_add(a, exact_neg(b)?)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_mul(
    mut a: crate::combat::trajectory::ExactRational,
    mut b: crate::combat::trajectory::ExactRational,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    a = exact_rational(a)?; b = exact_rational(b)?;
    // These two exact divisibility folds are not a general reduction loop.
    // They cancel the common fixed scales produced by affine endpoint
    // evaluation before forming a wider product, and refuse everything else.
    if a.numerator % b.denominator == 0 {
        a.numerator /= b.denominator; b.denominator = 1;
    } else if b.numerator % a.denominator == 0 {
        b.numerator /= a.denominator; a.denominator = 1;
    }
    exact_rational(crate::combat::trajectory::ExactRational {
        numerator: a.numerator.checked_mul(b.numerator)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?,
        denominator: a.denominator.checked_mul(b.denominator)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?,
    })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_div(
    a: crate::combat::trajectory::ExactRational,
    b: crate::combat::trajectory::ExactRational,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let a = exact_rational(a)?; let b = exact_rational(b)?;
    if b.numerator == 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    let (numerator, denominator) = if a.denominator == b.denominator {
        // Dot products formed from one normalized pose carry the same square
        // scale. Dividing them cancels that scale structurally; no reduction
        // algorithm belongs on this authoritative path.
        (a.numerator, b.numerator)
    } else {
        (a.numerator.checked_mul(b.denominator)
             .ok_or(ExactScanReject::ArithmeticEnvelope)?,
         a.denominator.checked_mul(b.numerator)
             .ok_or(ExactScanReject::ArithmeticEnvelope)?)
    };
    if denominator < 0 {
        exact_rational(crate::combat::trajectory::ExactRational {
            numerator: numerator.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?,
            denominator: denominator.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?,
        })
    } else {
        exact_rational(crate::combat::trajectory::ExactRational { numerator, denominator })
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_cmp(
    a: crate::combat::trajectory::ExactRational,
    b: crate::combat::trajectory::ExactRational,
) -> Result<Ordering, ExactScanReject> {
    let a = exact_rational(a)?; let b = exact_rational(b)?;
    Ok(a.numerator.checked_mul(b.denominator).ok_or(ExactScanReject::ArithmeticEnvelope)?
        .cmp(&b.numerator.checked_mul(a.denominator)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_zero() -> crate::combat::trajectory::ExactRational {
    crate::combat::trajectory::ExactRational { numerator: 0, denominator: 1 }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_one() -> crate::combat::trajectory::ExactRational {
    crate::combat::trajectory::ExactRational { numerator: 1, denominator: 1 }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_vector_sub(a: ExactPoint, b: ExactPoint)
    -> Result<[crate::combat::trajectory::ExactRational; 3], ExactScanReject>
{
    Ok([exact_sub(a.0[0], b.0[0])?, exact_sub(a.0[1], b.0[1])?,
        exact_sub(a.0[2], b.0[2])?])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_dot(
    a: [crate::combat::trajectory::ExactRational; 3],
    b: [crate::combat::trajectory::ExactRational; 3],
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let mut out = exact_zero();
    for axis in 0..3 { out = exact_add(out, exact_mul(a[axis], b[axis])?)?; }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_point_at(
    origin: ExactPoint, delta: [crate::combat::trajectory::ExactRational; 3],
    parameter: crate::combat::trajectory::ExactRational,
) -> Result<ExactPoint, ExactScanReject> {
    let mut out = origin;
    for axis in 0..3 { out.0[axis] = exact_add(origin.0[axis], exact_mul(delta[axis], parameter)?)?; }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_clamp_unit(value: crate::combat::trajectory::ExactRational)
    -> Result<crate::combat::trajectory::ExactRational, ExactScanReject>
{
    if exact_cmp(value, exact_zero())? == Ordering::Less { Ok(exact_zero()) }
    else if exact_cmp(value, exact_one())? == Ordering::Greater { Ok(exact_one()) }
    else { Ok(value) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct ExactSegmentClosest {
    a: ExactPoint,
    b: ExactPoint,
    distance_sq: crate::combat::trajectory::ExactRational,
    feature: u8,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct WidePoint([WideRational4096; 3]);

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WideEvaluatedContactShape {
    Segment { hilt: Vec3, tip: Vec3 },
    Shield { corners: [Vec3; 4] },
    Body { origin: Vec3 },
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct WideSegmentClosest {
    a: WidePoint,
    b: WidePoint,
    distance_sq: WideRational4096,
    feature: u8,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Default)]
struct ExactWideScratch {
    segment_candidates: Vec<WideSegmentClosest>,
    rectangle_candidates: Vec<WideSegmentClosest>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, Default)]
struct ExactWideVisitTrace {
    times: [u32; 8], steps: [u32; 8], count: u8,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactWideVisitTrace {
    fn visit(&mut self, time: u32) {
        let at = (self.count as usize).min(7);
        if self.count >= 8 { self.times.copy_within(1..8, 0); }
        self.times[at] = time; self.count = self.count.saturating_add(1);
    }
    fn step(&mut self, step: u32) {
        let at = (self.count.saturating_sub(1) as usize).min(7);
        self.steps[at] = step;
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
impl ExactWideScratch {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.segment_candidates, 5)?;
        try_reserve_exact(&mut self.rectangle_candidates, 7)
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_rational(value: crate::combat::trajectory::ExactRational)
    -> Result<WideRational4096, ExactScanReject>
{
    WideRational4096::new(value.numerator, value.denominator)
        .ok_or(ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_point(value: ExactPoint) -> Result<WidePoint, ExactScanReject> {
    Ok(WidePoint([wide_rational(value.0[0])?, wide_rational(value.0[1])?,
                  wide_rational(value.0[2])?]))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_add(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ExactScanReject>
{ a.checked_add_divisible(b).ok_or(ExactScanReject::ArithmeticEnvelope) }

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_sub(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ExactScanReject>
{
    a.checked_add_divisible(b.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?)
        .ok_or(ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_mul(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ExactScanReject>
{ a.checked_mul(b).ok_or(ExactScanReject::ArithmeticEnvelope) }

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_div(a: WideRational4096, b: WideRational4096)
    -> Result<WideRational4096, ExactScanReject>
{ a.checked_div(b).ok_or(ExactScanReject::ArithmeticEnvelope) }

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_cmp(a: WideRational4096, b: WideRational4096)
    -> Result<Ordering, ExactScanReject>
{ a.checked_cmp(b).ok_or(ExactScanReject::ArithmeticEnvelope) }

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_vector_sub(a: WidePoint, b: WidePoint)
    -> Result<[WideRational4096; 3], ExactScanReject>
{
    Ok([wide_sub(a.0[0], b.0[0])?, wide_sub(a.0[1], b.0[1])?,
        wide_sub(a.0[2], b.0[2])?])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_vector_add(a: [WideRational4096; 3], b: [WideRational4096; 3])
    -> Result<[WideRational4096; 3], ExactScanReject>
{
    Ok([wide_add(a[0], b[0])?, wide_add(a[1], b[1])?, wide_add(a[2], b[2])?])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_cross(a: [WideRational4096; 3], b: [WideRational4096; 3])
    -> Result<[WideRational4096; 3], ExactScanReject>
{
    Ok([
        wide_sub(wide_mul(a[1], b[2])?, wide_mul(a[2], b[1])?)?,
        wide_sub(wide_mul(a[2], b[0])?, wide_mul(a[0], b[2])?)?,
        wide_sub(wide_mul(a[0], b[1])?, wide_mul(a[1], b[0])?)?,
    ])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_vector_is_zero(value: [WideRational4096; 3]) -> bool {
    value.into_iter().all(|word| word.numerator.is_zero())
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_dot(a: [WideRational4096; 3], b: [WideRational4096; 3])
    -> Result<WideRational4096, ExactScanReject>
{
    let mut out = WideRational4096::zero();
    for axis in 0..3 { out = wide_add(out, wide_mul(a[axis], b[axis])?)?; }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_point_at(origin: WidePoint, delta: [WideRational4096; 3], t: WideRational4096)
    -> Result<WidePoint, ExactScanReject>
{
    Ok(WidePoint([
        wide_add(origin.0[0], wide_mul(delta[0], t)?)?,
        wide_add(origin.0[1], wide_mul(delta[1], t)?)?,
        wide_add(origin.0[2], wide_mul(delta[2], t)?)?,
    ]))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_clamp_unit(value: WideRational4096) -> Result<WideRational4096, ExactScanReject> {
    if wide_cmp(value, WideRational4096::zero())? == Ordering::Less {
        Ok(WideRational4096::zero())
    } else if wide_cmp(value, WideRational4096::one())? == Ordering::Greater {
        Ok(WideRational4096::one())
    } else { Ok(value) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_candidate(a: WidePoint, b: WidePoint, feature: u8)
    -> Result<WideSegmentClosest, ExactScanReject>
{
    let d = wide_vector_sub(a, b)?;
    Ok(WideSegmentClosest { a, b, distance_sq: wide_dot(d, d)?, feature })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_candidate_cmp(a: WideSegmentClosest, b: WideSegmentClosest)
    -> Result<Ordering, ExactScanReject>
{
    let distance = wide_cmp(a.distance_sq, b.distance_sq)?;
    if distance != Ordering::Equal { return Ok(distance); }
    for point in 0..2 {
        let (left, right) = if point == 0 { (a.a, b.a) } else { (a.b, b.b) };
        for axis in 0..3 {
            let order = wide_cmp(left.0[axis], right.0[axis])?;
            if order != Ordering::Equal { return Ok(order); }
        }
    }
    Ok(a.feature.cmp(&b.feature))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_segment_points(a0: WidePoint, a1: WidePoint, b0: WidePoint, b1: WidePoint,
                               scratch: &mut ExactWideScratch)
    -> Result<WideSegmentClosest, ExactScanReject>
{
    // Subtracting one pair origin before the dot products removes any common
    // response translation exactly. The remaining rational operations retain
    // their scale symbolically inside the fixed word.
    wide_segment_segment_points_from_origin(a0, a1, b0, b1, a0, scratch)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_segment_points_from_origin(
    a0: WidePoint, a1: WidePoint, b0: WidePoint, b1: WidePoint, origin: WidePoint,
    scratch: &mut ExactWideScratch,
) -> Result<WideSegmentClosest, ExactScanReject> {
    let a0 = WidePoint(wide_vector_sub(a0, origin)?);
    let a1 = WidePoint(wide_vector_sub(a1, origin)?);
    let b0 = WidePoint(wide_vector_sub(b0, origin)?);
    let b1 = WidePoint(wide_vector_sub(b1, origin)?);
    let u = wide_vector_sub(a1, a0)?; let v = wide_vector_sub(b1, b0)?;
    let w = wide_vector_sub(a0, b0)?;
    let aa = wide_dot(u, u)?; let bb = wide_dot(u, v)?; let cc = wide_dot(v, v)?;
    let dd = wide_dot(u, w)?; let ee = wide_dot(v, w)?;
    scratch.segment_candidates.clear();
    if !aa.numerator.is_zero() && !cc.numerator.is_zero() {
        let determinant = wide_sub(wide_mul(aa, cc)?, wide_mul(bb, bb)?)?;
        if !determinant.numerator.is_zero() {
            let s = wide_div(wide_sub(wide_mul(bb, ee)?, wide_mul(cc, dd)?)?, determinant)?;
            let t = wide_div(wide_sub(wide_mul(aa, ee)?, wide_mul(bb, dd)?)?, determinant)?;
            if wide_cmp(s, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(s, WideRational4096::one())? != Ordering::Greater
                && wide_cmp(t, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(t, WideRational4096::one())? != Ordering::Greater {
                scratch.segment_candidates.push(wide_segment_candidate(
                    wide_point_at(a0, u, s)?, wide_point_at(b0, v, t)?, 0)?);
            }
        }
    }
    for (at, (point, base, axis, square, point_is_a)) in [
        (a0, b0, v, cc, true), (a1, b0, v, cc, true),
        (b0, a0, u, aa, false), (b1, a0, u, aa, false),
    ].into_iter().enumerate() {
        let parameter = if square.numerator.is_zero() { WideRational4096::zero() } else {
            wide_clamp_unit(wide_div(wide_dot(wide_vector_sub(point, base)?, axis)?, square)?)?
        };
        let projected = wide_point_at(base, axis, parameter)?;
        scratch.segment_candidates.push(if point_is_a {
            wide_segment_candidate(point, projected, (at + 1) as u8)?
        } else { wide_segment_candidate(projected, point, (at + 1) as u8)? });
    }
    let mut candidates = scratch.segment_candidates.iter().copied();
    let mut winner = candidates.next().ok_or(ExactScanReject::ArithmeticEnvelope)?;
    for candidate in candidates {
        if wide_candidate_cmp(candidate, winner)? == Ordering::Less { winner = candidate; }
    }
    // Restore the subtracted origin only after feature selection. Distances and
    // every tie comparison are translation invariant.
    winner.a = wide_point_at(origin, winner.a.0, WideRational4096::one())?;
    winner.b = wide_point_at(origin, winner.b.0, WideRational4096::one())?;
    Ok(winner)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_rectangle_parameters(point: WidePoint, origin: WidePoint,
    side: [WideRational4096; 3], up: [WideRational4096; 3])
    -> Result<(WideRational4096, WideRational4096), ExactScanReject>
{
    let delta = wide_vector_sub(point, origin)?;
    Ok((wide_div(wide_dot(delta, side)?, wide_dot(side, side)?)?,
        wide_div(wide_dot(delta, up)?, wide_dot(up, up)?)?))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_rectangle_points(a0: WidePoint, a1: WidePoint,
                                 rectangle: [WidePoint; 4], scratch: &mut ExactWideScratch)
    -> Result<WideSegmentClosest, ExactScanReject>
{
    // The common response can carry the shipped 92-bit denominator. Remove
    // its translation before any face product, just as segment/segment does;
    // only the final selected points need the world-space origin restored.
    let origin = rectangle[0];
    let a0 = WidePoint(wide_vector_sub(a0, origin)?);
    let a1 = WidePoint(wide_vector_sub(a1, origin)?);
    let rectangle = [WidePoint([WideRational4096::zero(); 3]),
        WidePoint(wide_vector_sub(rectangle[1], origin)?),
        WidePoint(wide_vector_sub(rectangle[2], origin)?),
        WidePoint(wide_vector_sub(rectangle[3], origin)?)];
    let side = wide_vector_sub(rectangle[1], rectangle[0])?;
    let up = wide_vector_sub(rectangle[3], rectangle[0])?;
    let normal = wide_cross(side, up)?;
    if wide_vector_is_zero(normal) { return Err(ExactScanReject::UnsupportedExactSweep); }
    let axis = wide_vector_sub(a1, a0)?;
    scratch.rectangle_candidates.clear();
    let da = wide_dot(wide_vector_sub(a0, rectangle[0])?, normal)?;
    let db = wide_dot(wide_vector_sub(a1, rectangle[0])?, normal)?;
    let crossing_den = wide_sub(da, db)?;
    if !crossing_den.numerator.is_zero() {
        let t = wide_div(da, crossing_den)?;
        if wide_cmp(t, WideRational4096::zero())? != Ordering::Less
            && wide_cmp(t, WideRational4096::one())? != Ordering::Greater {
            let point = wide_point_at(a0, axis, t)?;
            let (s, u) = wide_rectangle_parameters(point, rectangle[0], side, up)?;
            if wide_cmp(s, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(s, WideRational4096::one())? != Ordering::Greater
                && wide_cmp(u, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(u, WideRational4096::one())? != Ordering::Greater {
                scratch.rectangle_candidates.push(wide_segment_candidate(point, point, 0)?);
            }
        }
    }
    let normal_square = wide_dot(normal, normal)?;
    for (at, endpoint) in [a0, a1].into_iter().enumerate() {
        let height = wide_div(wide_dot(wide_vector_sub(endpoint, rectangle[0])?, normal)?,
                              normal_square)?;
        let projected = wide_point_at(endpoint, normal,
            height.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
        let (s, u) = wide_rectangle_parameters(projected, rectangle[0], side, up)?;
        let s = wide_clamp_unit(s)?; let u = wide_clamp_unit(u)?;
        let face = wide_point_at(wide_point_at(rectangle[0], side, s)?, up, u)?;
        scratch.rectangle_candidates.push(wide_segment_candidate(endpoint, face,
                                                                  (at + 1) as u8)?);
    }
    for (at, (b0, b1)) in [
        (rectangle[0], rectangle[3]), (rectangle[1], rectangle[2]),
        (rectangle[0], rectangle[1]), (rectangle[3], rectangle[2]),
    ].into_iter().enumerate() {
        let mut edge = wide_segment_segment_points(a0, a1, b0, b1, scratch)?;
        edge.feature = (at + 3) as u8; scratch.rectangle_candidates.push(edge);
    }
    let mut candidates = scratch.rectangle_candidates.iter().copied();
    let mut winner = candidates.next().ok_or(ExactScanReject::UnsupportedExactSweep)?;
    for candidate in candidates {
        if wide_candidate_cmp(candidate, winner)? == Ordering::Less { winner = candidate; }
    }
    winner.a = wide_point_at(origin, winner.a.0, WideRational4096::one())?;
    winner.b = wide_point_at(origin, winner.b.0, WideRational4096::one())?;
    Ok(winner)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_segment_at_pose(a0: ExactPoint, a1: ExactPoint, b0: ExactPoint, b1: ExactPoint,
                                scratch: &mut ExactWideScratch)
    -> Result<WideSegmentClosest, ExactScanReject>
{
    wide_segment_segment_points(wide_point(a0)?, wide_point(a1)?, wide_point(b0)?, wide_point(b1)?,
                                scratch)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_point_to_vec3(value: WidePoint) -> Result<Vec3, ExactScanReject> {
    let raw = [value.0[0].trunc_i128(), value.0[1].trunc_i128(), value.0[2].trunc_i128()];
    let raw = [i32::try_from(raw[0].ok_or(ExactScanReject::ArithmeticEnvelope)?)
                   .map_err(|_| ExactScanReject::ArithmeticEnvelope)?,
               i32::try_from(raw[1].ok_or(ExactScanReject::ArithmeticEnvelope)?)
                   .map_err(|_| ExactScanReject::ArithmeticEnvelope)?,
               i32::try_from(raw[2].ok_or(ExactScanReject::ArithmeticEnvelope)?)
                   .map_err(|_| ExactScanReject::ArithmeticEnvelope)?];
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_floor_nonnegative(value: WideRational4096) -> Result<u32, ExactScanReject> {
    if value.numerator.is_negative() { return Err(ExactScanReject::ArithmeticEnvelope); }
    u32::try_from(value.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)?)
        .map_err(|_| ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_abs(value: WideRational4096) -> Result<WideRational4096, ExactScanReject> {
    if value.numerator.is_negative() {
        value.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)
    } else { Ok(value) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_l1(value: [WideRational4096; 3]) -> Result<WideRational4096, ExactScanReject> {
    wide_add(wide_add(wide_abs(value[0])?, wide_abs(value[1])?)?, wide_abs(value[2])?)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_midpoint(a: WidePoint, b: WidePoint) -> Result<WidePoint, ExactScanReject> {
    let half = WideRational4096::new(1, 2).ok_or(ExactScanReject::ArithmeticEnvelope)?;
    Ok(WidePoint([
        wide_mul(wide_add(a.0[0], b.0[0])?, half)?,
        wide_mul(wide_add(a.0[1], b.0[1])?, half)?,
        wide_mul(wide_add(a.0[2], b.0[2])?, half)?,
    ]))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_radius(raw: i32) -> Result<WideRational4096, ExactScanReject> {
    if raw < 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    WideRational4096::new(raw as i128, 1).ok_or(ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_response_velocity(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory)
    -> Result<Vec3, ExactScanReject>
{
    let velocity = |affine: ExactAffine3, scale: i128, axis: usize| {
        WideRational4096::new(scale.checked_mul(affine.momentum[axis].velocity_raw as i128)
            .and_then(|word| word.checked_add(affine.momentum[axis].remainder))?, scale)
    };
    let held = row.held_index.and_then(|at| owner.held_response.get(at)).and_then(|held| *held);
    let mut raw = [0; 3];
    for axis in 0..3 {
        let mut value = velocity(owner.common_response, owner.common_scale, axis)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        if let Some(held) = held {
            value = wide_add(value, velocity(held.affine, held.affine.mass_raw as i128, axis)
                .ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
        }
        raw[axis] = i32::try_from(value.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)?)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_motor_coordinate(point: ExactMotorPoint, axis: usize, time: u32)
    -> Result<WideRational4096, ExactScanReject>
{
    if time > 65_536 { return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::TimePastTick)); }
    let start = WideRational4096::new(point.at_tick_start_raw[axis] as i128, 1)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let step = WideRational4096::new(
        (point.tick_delta_raw[axis] as i128).checked_mul(time as i128)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?, 65_536)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    wide_add(start, step)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_response_coordinate(value: ExactAffine3, scale: i128, axis: usize, time: u32)
    -> Result<WideRational4096, ExactScanReject>
{
    if scale <= 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    if time < value.group_time_raw {
        return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::DescendingTime));
    }
    if time > 65_536 { return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::TimePastTick)); }
    let position = WideRational4096::new(value.at_group[axis].raw as i128, 1)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let remainder = WideRational4096::new(value.at_group[axis].remainder,
        scale.checked_mul(65_536).ok_or(ExactScanReject::ArithmeticEnvelope)?)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let momentum = scale.checked_mul(value.momentum[axis].velocity_raw as i128)
        .and_then(|word| word.checked_add(value.momentum[axis].remainder))
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let travel = WideRational4096::new(
        momentum.checked_mul((time - value.group_time_raw) as i128)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?,
        scale.checked_mul(65_536).ok_or(ExactScanReject::ArithmeticEnvelope)?)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    wide_add(wide_add(position, remainder)?, travel)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_evaluated_point(point: ExactMotorPoint, row: &ExactContactTrajectory,
                        owner: &ExactOwnerTrajectory, time: u32)
    -> Result<WidePoint, ExactScanReject>
{
    let held = row.held_index.and_then(|at| owner.held_response.get(at))
        .and_then(|held| *held);
    let mut out = [WideRational4096::zero(); 3];
    for axis in 0..3 {
        out[axis] = wide_add(wide_motor_coordinate(point, axis, time)?,
            wide_response_coordinate(owner.common_response, owner.common_scale, axis, time)?)?;
        if let Some(held) = held {
            out[axis] = wide_add(out[axis], wide_response_coordinate(
                held.affine, held.affine.mass_raw as i128, axis, time)?)?;
        }
    }
    Ok(WidePoint(out))
}

/// Evaluate the published pose through the same wide endpoint authority used
/// by scan and frozen recomputation, then truncate each coordinate once.
#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) fn wide_evaluated_shape_quotient(
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, time: u32,
) -> Result<WideEvaluatedContactShape, ExactScanReject> {
    match row.motor {
        MotorShape::Segment { hilt, tip, .. } => Ok(WideEvaluatedContactShape::Segment {
            hilt: wide_point_to_vec3(wide_evaluated_point(hilt, row, owner, time)?)?,
            tip: wide_point_to_vec3(wide_evaluated_point(tip, row, owner, time)?)?,
        }),
        MotorShape::Shield { corners } => {
            let mut out = [Vec3::ZERO; 4];
            for at in 0..4 {
                out[at] = wide_point_to_vec3(
                    wide_evaluated_point(corners[at], row, owner, time)?)?;
            }
            Ok(WideEvaluatedContactShape::Shield { corners: out })
        }
        MotorShape::Body { origin, .. } => Ok(WideEvaluatedContactShape::Body {
            origin: wide_point_to_vec3(wide_evaluated_point(origin, row, owner, time)?)?,
        }),
    }
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn wide_evaluated_relative_anchor_words(
    body: &ExactContactTrajectory, held: &ExactContactTrajectory,
    owner: &ExactOwnerTrajectory, time: u32,
) -> Result<[i128; 39], ExactScanReject> {
    let MotorShape::Body { origin, .. } = body.motor else {
        return Err(ExactScanReject::ArithmeticEnvelope);
    };
    let MotorShape::Segment { hilt, .. } = held.motor else {
        return Err(ExactScanReject::ArithmeticEnvelope);
    };
    let origin = wide_evaluated_point(origin, body, owner, time)?;
    let hilt = wide_evaluated_point(hilt, held, owner, time)?;
    let mut out = [0; 39];
    for axis in 0..3 {
        for (base, value) in [(axis * 4, origin.0[axis]),
                              (12 + axis * 4, hilt.0[axis]),
                              (24 + axis * 4, wide_sub(hilt.0[axis], origin.0[axis])?)] {
            let (n, d) = value.as_i128_pair().ok_or(ExactScanReject::ArithmeticEnvelope)?;
            out[base..base + 4].copy_from_slice(&[n, d, n / d, n % d]);
        }
        out[36 + axis] = out[12 + axis * 4 + 2] - out[axis * 4 + 2];
    }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_position_from_scaled(numerator: i128, denominator: i128)
    -> Result<ExactPosition, ExactScanReject>
{
    Ok(ExactPosition {
        raw: i32::try_from(numerator / denominator)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?,
        remainder: numerator % denominator,
    })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn motor_end_raw(point: ExactMotorPoint, axis: usize) -> Result<i128, ExactScanReject> {
    (point.at_tick_start_raw[axis] as i128).checked_add(point.tick_delta_raw[axis] as i128)
        .ok_or(ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_gcd(mut a: i128, mut b: i128) -> i128 {
    while b != 0 { let next = a % b; a = b; b = next; }
    a.abs()
}

/// Rebase a finished owner against the integer endpoint geometry published to
/// World for the next tick. Truncation belongs to the absolute endpoint, so
/// this must be derived here rather than by independently zeroing affine
/// quotients.
#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) fn wide_rebase_owner_tick(
    trajectories: &[ExactContactTrajectory], owner: ExactOwnerTrajectory,
) -> Result<ExactOwnerTrajectory, ExactScanReject> {
    if owner.common_response.group_time_raw != 65_536
        || owner.held_response.iter().flatten()
            .any(|held| held.affine.group_time_raw != 65_536) {
        return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::DescendingTime));
    }
    let body = trajectories.iter().find(|row| row.entity == owner.entity
        && matches!(row.motor, MotorShape::Body { .. }))
        .ok_or(ExactScanReject::CompatibilityIdentity)?;
    let MotorShape::Body { origin, .. } = body.motor else { unreachable!() };
    let exact_body = wide_evaluated_point(origin, body, &owner, 65_536)?;
    let published_body = wide_point_to_vec3(exact_body)?;
    let published_body_raw = [published_body.x.raw(), published_body.y.raw(), published_body.z.raw()];
    let common_den = owner.common_scale.checked_mul(65_536)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let mut common_residual = [0i128; 3];
    let mut rebased = owner;
    for axis in 0..3 {
        let whole = motor_end_raw(origin, axis)?
            .checked_add(owner.common_response.at_group[axis].raw as i128)
            .and_then(|word| word.checked_sub(published_body_raw[axis] as i128))
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        common_residual[axis] = whole.checked_mul(common_den)
            .and_then(|word| word.checked_add(owner.common_response.at_group[axis].remainder))
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        rebased.common_response.at_group[axis] =
            exact_position_from_scaled(common_residual[axis], common_den)?;
    }
    rebased.common_response.group_time_raw = 0;

    for limb in 0..2 {
        let Some(held) = rebased.held_response[limb].as_mut() else { continue };
        let row = trajectories.iter().find(|row| row.entity == owner.entity
            && row.held_index == Some(limb)).ok_or(ExactScanReject::CompatibilityIdentity)?;
        let anchor = match row.motor {
            MotorShape::Segment { hilt, .. } => hilt,
            MotorShape::Shield { corners } => corners[0],
            MotorShape::Body { .. } => return Err(ExactScanReject::CompatibilityIdentity),
        };
        let exact = wide_evaluated_point(anchor, row, &owner, 65_536)?;
        let published = wide_point_to_vec3(exact)?;
        let published_raw = [published.x.raw(), published.y.raw(), published.z.raw()];
        let held_den = (held.affine.mass_raw as i128).checked_mul(65_536)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let gcd = exact_gcd(common_den, held_den);
        let endpoint_den = (common_den / gcd).checked_mul(held_den)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let common_factor = endpoint_den / common_den;
        let held_factor = endpoint_den / held_den;
        for axis in 0..3 {
            let whole = motor_end_raw(anchor, axis)?
                .checked_add(owner.common_response.at_group[axis].raw as i128)
                .and_then(|word| word.checked_add(
                    owner.held_response[limb].unwrap().affine.at_group[axis].raw as i128))
                .and_then(|word| word.checked_sub(published_raw[axis] as i128))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?;
            let total = whole.checked_mul(endpoint_den)
                .and_then(|word| owner.common_response.at_group[axis].remainder
                    .checked_mul(common_factor).and_then(|common| word.checked_add(common)))
                .and_then(|word| owner.held_response[limb].unwrap().affine.at_group[axis]
                    .remainder.checked_mul(held_factor).and_then(|held| word.checked_add(held)))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?;
            let held_common = common_residual[axis].checked_mul(common_factor)
                .and_then(|common| total.checked_sub(common))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?;
            if held_common % held_factor != 0 {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let held_scaled = held_common / held_factor;
            rebased.held_response[limb].as_mut().unwrap().affine.at_group[axis] = ExactPosition {
                raw: i32::try_from(held_scaled / held_den)
                    .map_err(|_| ExactScanReject::ArithmeticEnvelope)?,
                remainder: held_scaled % held_den,
            };
        }
        rebased.held_response[limb].as_mut().unwrap().affine.group_time_raw = 0;
    }
    Ok(rebased)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_at_time(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, time: u32)
    -> Result<(WidePoint, WidePoint, i32), ExactScanReject>
{
    let MotorShape::Segment { hilt, tip, radius_raw } = row.motor
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    Ok((wide_evaluated_point(hilt, row, owner, time)?,
        wide_evaluated_point(tip, row, owner, time)?, radius_raw))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_shield_at_time(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, time: u32)
    -> Result<[WidePoint; 4], ExactScanReject>
{
    let MotorShape::Shield { corners } = row.motor
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let mut out = [wide_evaluated_point(corners[0], row, owner, time)?; 4];
    for at in 1..4 { out[at] = wide_evaluated_point(corners[at], row, owner, time)?; }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_affine_rectangle_is_maintained(start: [WidePoint; 4], end: [WidePoint; 4])
    -> Result<bool, ExactScanReject>
{
    let side0 = wide_vector_sub(start[1], start[0])?;
    let up0 = wide_vector_sub(start[3], start[0])?;
    let side1 = wide_vector_sub(end[1], end[0])?;
    let up1 = wide_vector_sub(end[3], end[0])?;
    let sd = [wide_sub(side1[0], side0[0])?, wide_sub(side1[1], side0[1])?,
              wide_sub(side1[2], side0[2])?];
    let ud = [wide_sub(up1[0], up0[0])?, wide_sub(up1[1], up0[1])?,
              wide_sub(up1[2], up0[2])?];
    for points in [start, end] {
        let diagonal = wide_vector_add(wide_vector_sub(points[2], points[1])?,
                                       wide_vector_sub(points[0], points[3])?)?;
        if !wide_vector_is_zero(diagonal) { return Ok(false); }
    }
    if !wide_dot(side0, up0)?.numerator.is_zero()
        || !wide_add(wide_dot(side0, ud)?, wide_dot(sd, up0)?)?.numerator.is_zero()
        || !wide_dot(sd, ud)?.numerator.is_zero() {
        return Ok(false);
    }
    for (base, delta) in [(side0, sd), (up0, ud)] {
        if wide_vector_is_zero(base) { return Ok(false); }
        let mut root = None;
        for axis in 0..3 {
            if delta[axis].numerator.is_zero() { continue; }
            root = Some(wide_div(base[axis].checked_neg()
                .ok_or(ExactScanReject::ArithmeticEnvelope)?, delta[axis])?);
            break;
        }
        if let Some(t) = root {
            if wide_cmp(t, WideRational4096::zero())? == Ordering::Greater
                && wide_cmp(t, WideRational4096::one())? == Ordering::Less {
                let value = [wide_add(base[0], wide_mul(delta[0], t)?)?,
                             wide_add(base[1], wide_mul(delta[1], t)?)?,
                             wide_add(base[2], wide_mul(delta[2], t)?)?];
                if wide_vector_is_zero(value) { return Ok(false); }
            }
        }
    }
    Ok(!wide_vector_is_zero(side1) && !wide_vector_is_zero(up1))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_body_region_at_time(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
                            region: usize, time: u32)
    -> Result<Option<(WidePoint, WidePoint, i32)>, ExactScanReject>
{
    let MotorShape::Body { parts, .. } = row.motor
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let part = parts.get(region).ok_or(ExactScanReject::CompatibilityIdentity)?;
    if !part.present { return Ok(None); }
    Ok(Some((wide_evaluated_point(part.lower, row, owner, time)?,
             wide_evaluated_point(part.upper, row, owner, time)?, part.radius_raw)))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy)]
struct WideSweptAabbPoints {
    points: [WidePoint; AnatomyRegion::COUNT * 4],
    len: usize,
    radius_raw: i32,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
impl WideSweptAabbPoints {
    fn new() -> Self {
        Self {
            points: [WidePoint([WideRational4096::zero(); 3]); AnatomyRegion::COUNT * 4],
            len: 0,
            radius_raw: 0,
        }
    }

    fn push(&mut self, point: WidePoint) -> Result<(), ExactScanReject> {
        let slot = self.points.get_mut(self.len)
            .ok_or(ExactScanReject::CompatibilityIdentity)?;
        *slot = point;
        self.len += 1;
        Ok(())
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_pair_has_swept_aabb(a: &ExactContactTrajectory, b: &ExactContactTrajectory) -> bool {
    matches!((&a.motor, &b.motor),
        (MotorShape::Segment { .. }, MotorShape::Segment { .. })
        | (MotorShape::Segment { .. }, MotorShape::Shield { .. })
        | (MotorShape::Shield { .. }, MotorShape::Segment { .. })
        | (MotorShape::Segment { .. }, MotorShape::Body { .. })
        | (MotorShape::Body { .. }, MotorShape::Segment { .. }))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_swept_aabb_points(row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
                          start: u32, end: u32)
    -> Result<WideSweptAabbPoints, ExactScanReject>
{
    let mut out = WideSweptAabbPoints::new();
    match row.motor {
        MotorShape::Segment { radius_raw, .. } => {
            let (h0, t0, _) = wide_segment_at_time(row, owner, start)?;
            let (h1, t1, _) = wide_segment_at_time(row, owner, end)?;
            for point in [h0, t0, h1, t1] { out.push(point)?; }
            out.radius_raw = radius_raw;
        }
        MotorShape::Shield { .. } => {
            let first = wide_shield_at_time(row, owner, start)?;
            let last = wide_shield_at_time(row, owner, end)?;
            for point in first.into_iter().chain(last) { out.push(point)?; }
        }
        MotorShape::Body { parts, .. } => {
            for region in 0..AnatomyRegion::COUNT {
                if !parts[region].present { continue; }
                let Some((l0, u0, radius_raw)) =
                    wide_body_region_at_time(row, owner, region, start)? else { continue };
                let Some((l1, u1, _)) =
                    wide_body_region_at_time(row, owner, region, end)? else { continue };
                for point in [l0, u0, l1, u1] { out.push(point)?; }
                out.radius_raw = out.radius_raw.max(radius_raw);
            }
        }
    }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_aabb_points_are_disjoint(left: &WideSweptAabbPoints,
                                 right: &WideSweptAabbPoints)
    -> Result<bool, ExactScanReject>
{
    if left.len == 0 || right.len == 0 { return Ok(true); }
    let origin = left.points[0];
    let mut left_min = [WideRational4096::zero(); 3];
    let mut left_max = left_min;
    let first_right = wide_vector_sub(right.points[0], origin)?;
    let mut right_min = first_right;
    let mut right_max = first_right;
    for point in &left.points[1..left.len] {
        let relative = wide_vector_sub(*point, origin)?;
        for axis in 0..3 {
            if wide_cmp(relative[axis], left_min[axis])? == Ordering::Less {
                left_min[axis] = relative[axis];
            }
            if wide_cmp(relative[axis], left_max[axis])? == Ordering::Greater {
                left_max[axis] = relative[axis];
            }
        }
    }
    for point in &right.points[1..right.len] {
        let relative = wide_vector_sub(*point, origin)?;
        for axis in 0..3 {
            if wide_cmp(relative[axis], right_min[axis])? == Ordering::Less {
                right_min[axis] = relative[axis];
            }
            if wide_cmp(relative[axis], right_max[axis])? == Ordering::Greater {
                right_max[axis] = relative[axis];
            }
        }
    }
    let radius = wide_radius(left.radius_raw.checked_add(right.radius_raw)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
    for axis in 0..3 {
        let right_gap = wide_sub(right_min[axis], left_max[axis])?;
        if wide_cmp(right_gap, radius)? == Ordering::Greater { return Ok(true); }
        let left_gap = wide_sub(left_min[axis], right_max[axis])?;
        if wide_cmp(left_gap, radius)? == Ordering::Greater { return Ok(true); }
    }
    Ok(false)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_swept_aabbs_are_disjoint(a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
                                  b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory)
    -> Result<bool, ExactScanReject>
{
    let start = ao.common_response.group_time_raw;
    wide_swept_aabbs_are_disjoint_during(a, ao, b, bo, start, 65_536)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_swept_aabbs_are_disjoint_during(
    a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, start: u32, end: u32,
) -> Result<bool, ExactScanReject> {
    let left = wide_swept_aabb_points(a, ao, start, end)?;
    let right = wide_swept_aabb_points(b, bo, start, end)?;
    wide_aabb_points_are_disjoint(&left, &right)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_body_region_aabbs_are_disjoint_during(
    weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
    region: usize, start: u32, end: u32,
) -> Result<bool, ExactScanReject> {
    let mut segment = wide_swept_aabb_points(weapon, wo, start, end)?;
    let mut part = WideSweptAabbPoints::new();
    let Some((l0, u0, radius_raw)) =
        wide_body_region_at_time(body, bo, region, start)? else { return Ok(true) };
    let Some((l1, u1, _)) =
        wide_body_region_at_time(body, bo, region, end)? else { return Ok(true) };
    for point in [l0, u0, l1, u1] { part.push(point)?; }
    part.radius_raw = radius_raw;
    // Keep this assignment explicit: it guards against accidentally using a
    // whole-body radius when this proof is the one-region zero-step escape.
    let MotorShape::Segment { radius_raw, .. } = weapon.motor else {
        return Err(ExactScanReject::UnsupportedExactSweep)
    };
    segment.radius_raw = radius_raw;
    wide_aabb_points_are_disjoint(&segment, &part)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_body_at_time(weapon: &ExactContactTrajectory, weapon_owner: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, body_owner: &ExactOwnerTrajectory, region: usize, time: u32,
    scratch: &mut ExactWideScratch)
    -> Result<Option<(WideSegmentClosest, i32, WideRational4096)>, ExactScanReject>
{
    let (hilt, tip, wr) = wide_segment_at_time(weapon, weapon_owner, time)?;
    let Some((lower, upper, br)) = wide_body_region_at_time(body, body_owner, region, time)?
        else { return Ok(None) };
    let closest = wide_segment_segment_points(hilt, tip, lower, upper, scratch)?;
    // `closest.b` is the projection of `closest.a` onto the convex body
    // medial segment. Every point between that pair has the same projection,
    // so the midpoint's medial distance is exactly one quarter of the pair's
    // squared distance. Re-solving the already-derived rational point made
    // denominator degree grow again and crossed the fixed 4,096-bit envelope
    // on an ordinary shipped body/weapon pair.
    let medial = wide_mul(closest.distance_sq,
        WideRational4096::new(1, 4).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
    Ok(Some((closest, wr.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?, medial)))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_velocity(a: WidePoint, b: WidePoint) -> Result<[WideRational4096; 3], ExactScanReject> {
    wide_vector_sub(b, a)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_relative_bound(left: &[(WidePoint, WidePoint)], right: &[(WidePoint, WidePoint)])
    -> Result<WideRational4096, ExactScanReject>
{
    let mut maximum = WideRational4096::zero();
    for &(a0, a1) in left { for &(b0, b1) in right {
        let av = wide_velocity(a0, a1)?; let bv = wide_velocity(b0, b1)?;
        let speed = wide_l1([wide_sub(av[0], bv[0])?, wide_sub(av[1], bv[1])?,
                             wide_sub(av[2], bv[2])?])?;
        if wide_cmp(speed, maximum)? == Ordering::Greater { maximum = speed; }
    } }
    Ok(maximum)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_speed(a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
                      b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory)
    -> Result<WideRational4096, ExactScanReject>
{
    let group = ao.common_response.group_time_raw;
    let next = (group + 1).min(65_536);
    let (ah0, at0, _) = wide_segment_at_time(a, ao, group)?;
    let (ah1, at1, _) = wide_segment_at_time(a, ao, next)?;
    let (bh0, bt0, _) = wide_segment_at_time(b, bo, group)?;
    let (bh1, bt1, _) = wide_segment_at_time(b, bo, next)?;
    wide_relative_bound(&[(ah0, ah1), (at0, at1)], &[(bh0, bh1), (bt0, bt1)])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_shield_speed(segment: &ExactContactTrajectory, so: &ExactOwnerTrajectory,
                             shield: &ExactContactTrajectory, ho: &ExactOwnerTrajectory)
    -> Result<WideRational4096, ExactScanReject>
{
    let group = so.common_response.group_time_raw;
    let next = (group + 1).min(65_536);
    let (h0, t0, _) = wide_segment_at_time(segment, so, group)?;
    let (h1, t1, _) = wide_segment_at_time(segment, so, next)?;
    let r0 = wide_shield_at_time(shield, ho, group)?;
    let r1 = wide_shield_at_time(shield, ho, next)?;
    wide_relative_bound(&[(h0, h1), (t0, t1)], &[
        (r0[0], r1[0]), (r0[1], r1[1]), (r0[2], r1[2]), (r0[3], r1[3])])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_body_speed(weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, region: usize)
    -> Result<WideRational4096, ExactScanReject>
{
    let group = wo.common_response.group_time_raw; let next = (group + 1).min(65_536);
    let (h0, t0, _) = wide_segment_at_time(weapon, wo, group)?;
    let (h1, t1, _) = wide_segment_at_time(weapon, wo, next)?;
    let Some((l0, u0, _)) = wide_body_region_at_time(body, bo, region, group)? else {
        return Ok(WideRational4096::zero());
    };
    let Some((l1, u1, _)) = wide_body_region_at_time(body, bo, region, next)? else {
        return Ok(WideRational4096::zero());
    };
    wide_relative_bound(&[(h0, h1), (t0, t1)], &[(l0, l1), (u0, u1)])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_safe_step(closest: WideSegmentClosest, radius: WideRational4096,
                  speed: WideRational4096) -> Result<u32, ExactScanReject>
{
    let radius_sq = wide_mul(radius, radius)?;
    let d = wide_l1(wide_vector_sub(closest.a, closest.b)?)?;
    let step = wide_div(wide_sub(closest.distance_sq, radius_sq)?,
        wide_mul(wide_add(d, radius)?, speed)?)?;
    let tick = WideRational4096::new(65_536, 1)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    // The caller can advance no farther than the tick boundary. A certified
    // exclusion larger than that is useful proof, not a reason to demand that
    // its (possibly enormous) quotient fit the u32 time representation.
    if wide_cmp(step, tick)? != Ordering::Less { Ok(65_536) }
    else { wide_floor_nonnegative(step) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_sweep_segments(a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
    ca: &ContactCollider, cb: &ContactCollider, scratch: &mut ExactWideScratch)
    -> Result<Option<Candidate>, ExactScanReject>
{
    let speed = wide_segment_speed(a, ao, b, bo)?; let mut time = ao.common_response.group_time_raw;
    for _ in 0..96 {
        let (a0, a1, ar) = wide_segment_at_time(a, ao, time)?;
        let (b0, b1, br) = wide_segment_at_time(b, bo, time)?;
        let closest = wide_segment_segment_points(a0, a1, b0, b1, scratch)?;
        let radius = wide_radius(ar.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
        if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? != Ordering::Greater {
            let mut pa = *ca; let mut pb = *cb;
            pa.velocity += wide_response_velocity(a, ao)?; pb.velocity += wide_response_velocity(b, bo)?;
            let distance = closest.distance_sq.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)? >> 16;
            let mut candidate = make_candidate(&pa, &pb, ContactKind::WeaponWeapon,
                TimeOfImpact::new_clamped(Fx::from_raw(time as i32)), wide_point_to_vec3(closest.a)?,
                wide_point_to_vec3(closest.b)?, Fx::from_raw(i32::try_from(distance)
                    .map_err(|_| ExactScanReject::ArithmeticEnvelope)?), closest.feature, NO_REGION);
            #[cfg(feature = "cartesian-recoil")]
            { candidate.wide_toi = Some(ExactWideToiDiagnostic { key: candidate.fact.key,
                region: NO_REGION, primitive: ExactWidePrimitiveDiagnostic::SegmentSegment,
                interval_start_raw: ao.common_response.group_time_raw, interval_end_raw: 65_536,
                visited_times_raw: [0; 8], safe_steps_raw: [0; 8], visit_count: 0,
                accepted_root_raw: time, closest_feature: closest.feature,
                comparison: ExactWideComparisonDiagnostic::DistanceLessThanOrEqualRadiusSquared }); }
            return Ok(Some(candidate));
        }
        if time == 65_536 || speed.numerator.is_zero() { return Ok(None); }
        let step = wide_safe_step(closest, radius, speed)?;
        if step == 0 {
            let next = time + 1;
            let (a0, a1, ar) = wide_segment_at_time(a, ao, next)?;
            let (b0, b1, br) = wide_segment_at_time(b, bo, next)?;
            let adjacent = wide_segment_segment_points(a0, a1, b0, b1, scratch)?;
            let r = wide_radius(ar.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
            if wide_cmp(adjacent.distance_sq, wide_mul(r, r)?)? == Ordering::Greater {
                return Err(ExactScanReject::UnsupportedExactSweep);
            }
            time = next;
        } else { time += step.min(65_536 - time); }
    }
    Err(ExactScanReject::Budget)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_sweep_segment_shield(segment: &ExactContactTrajectory, so: &ExactOwnerTrajectory,
    shield: &ExactContactTrajectory, ho: &ExactOwnerTrajectory,
    cs: &ContactCollider, ch: &ContactCollider, scratch: &mut ExactWideScratch)
    -> Result<Option<Candidate>, ExactScanReject>
{
    let speed = wide_segment_shield_speed(segment, so, shield, ho)?;
    let mut time = so.common_response.group_time_raw;
    for _ in 0..96 {
        let (hilt, tip, radius_raw) = wide_segment_at_time(segment, so, time)?;
        let rectangle = wide_shield_at_time(shield, ho, time)?;
        let closest = wide_segment_rectangle_points(hilt, tip, rectangle, scratch)?;
        let radius = wide_radius(radius_raw)?;
        if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? != Ordering::Greater {
            let mut ps = *cs; let mut ph = *ch;
            ps.velocity += wide_response_velocity(segment, so)?;
            ph.velocity += wide_response_velocity(shield, ho)?;
            let distance = closest.distance_sq.trunc_i128()
                .ok_or(ExactScanReject::ArithmeticEnvelope)? >> 16;
            let mut candidate = make_candidate(&ps, &ph, ContactKind::WeaponShield,
                TimeOfImpact::new_clamped(Fx::from_raw(time as i32)),
                wide_point_to_vec3(closest.a)?, wide_point_to_vec3(closest.b)?,
                Fx::from_raw(i32::try_from(distance)
                    .map_err(|_| ExactScanReject::ArithmeticEnvelope)?),
                closest.feature, NO_REGION);
            #[cfg(feature = "cartesian-recoil")]
            { candidate.wide_toi = Some(ExactWideToiDiagnostic { key: candidate.fact.key,
                region: NO_REGION, primitive: ExactWidePrimitiveDiagnostic::SegmentShield,
                interval_start_raw: so.common_response.group_time_raw, interval_end_raw: 65_536,
                visited_times_raw: [0; 8], safe_steps_raw: [0; 8], visit_count: 0,
                accepted_root_raw: time, closest_feature: closest.feature,
                comparison: ExactWideComparisonDiagnostic::DistanceLessThanOrEqualRadiusSquared }); }
            return Ok(Some(candidate));
        }
        if time == 65_536 || speed.numerator.is_zero() { return Ok(None); }
        let step = wide_safe_step(closest, radius, speed)?;
        if step == 0 {
            let next = time + 1;
            let (hilt, tip, radius_raw) = wide_segment_at_time(segment, so, next)?;
            let adjacent = wide_segment_rectangle_points(
                hilt, tip, wide_shield_at_time(shield, ho, next)?, scratch)?;
            let radius = wide_radius(radius_raw)?;
            if wide_cmp(adjacent.distance_sq, wide_mul(radius, radius)?)? == Ordering::Greater {
                return Err(ExactScanReject::UnsupportedExactSweep);
            }
            time = next;
        } else { time += step.min(65_536 - time); }
    }
    Err(ExactScanReject::Budget)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_sweep_segment_body(weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
    cw: &ContactCollider, cb: &ContactCollider, scratch: &mut ExactWideScratch)
    -> Result<Option<Candidate>, ExactScanReject>
{
    let mut winner: Option<(u32, usize, WideSegmentClosest, WideRational4096)> = None;
    #[cfg(feature = "cartesian-recoil")]
    let mut winner_trace = ExactWideVisitTrace::default();
    for region in 0..AnatomyRegion::COUNT {
        let group = wo.common_response.group_time_raw;
        if wide_segment_body_region_aabbs_are_disjoint_during(
            weapon, wo, body, bo, region, group, 65_536)? {
            continue;
        }
        let speed = wide_segment_body_speed(weapon, wo, body, bo, region)?;
        let mut time = group; let mut found = None;
        #[cfg(feature = "cartesian-recoil")]
        let mut trace = ExactWideVisitTrace::default();
        let mut proved_separate = false;
        for _ in 0..96 {
            #[cfg(feature = "cartesian-recoil")]
            trace.visit(time);
            let Some((closest, rr, medial)) = wide_segment_body_at_time(
                weapon, wo, body, bo, region, time, scratch)?
                else { proved_separate = true; break };
            let radius = wide_radius(rr)?;
            if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? != Ordering::Greater {
                found = Some((time, closest, medial)); break;
            }
            if time == 65_536 || speed.numerator.is_zero() { proved_separate = true; break; }
            let step = wide_safe_step(closest, radius, speed)?;
            #[cfg(feature = "cartesian-recoil")]
            trace.step(step);
            if step == 0 {
                let next = time + 1;
                let Some((adjacent, rr, _)) = wide_segment_body_at_time(
                    weapon, wo, body, bo, region, next, scratch)? else { break };
                let r = wide_radius(rr)?;
                if wide_cmp(adjacent.distance_sq, wide_mul(r, r)?)? == Ordering::Greater {
                    // Endpoint separation alone cannot exclude a sub-raw
                    // enter-and-exit. The two affine swept AABBs can: if they
                    // are disjoint across this one-word interval, every point
                    // of both capsules is separated on at least one axis.
                    // Otherwise keep the named refusal -- the interval may
                    // contain a contact the integer-time detector cannot
                    // publish exactly.
                    if !wide_segment_body_region_aabbs_are_disjoint_during(
                        weapon, wo, body, bo, region, time, next)? {
                        return Err(ExactScanReject::UnsupportedExactSweep);
                    }
                }
                time = next;
            } else { time += step.min(65_536 - time); }
        }
        if found.is_none() && !proved_separate { return Err(ExactScanReject::Budget); }
        if let Some((time, closest, medial)) = found {
            let replace = match winner {
                None => true,
                Some((old_time, old_region, _, old_medial)) => time < old_time
                    || (time == old_time && (wide_cmp(medial, old_medial)? == Ordering::Less
                        || (wide_cmp(medial, old_medial)? == Ordering::Equal && region < old_region))),
            };
            if replace {
                winner = Some((time, region, closest, medial));
                #[cfg(feature = "cartesian-recoil")]
                { winner_trace = trace; }
            }
        }
    }
    let Some((time, region, closest, _)) = winner else { return Ok(None) };
    let mut pw = *cw; let mut pb = *cb;
    pw.velocity += wide_response_velocity(weapon, wo)?; pb.velocity += wide_response_velocity(body, bo)?;
    let distance = closest.distance_sq.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)? >> 16;
    let mut candidate = make_candidate(&pw, &pb, ContactKind::WeaponBody,
        TimeOfImpact::new_clamped(Fx::from_raw(time as i32)), wide_point_to_vec3(closest.a)?,
        wide_point_to_vec3(closest.b)?, Fx::from_raw(i32::try_from(distance)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?), 0, region as u8);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.wide_toi = Some(ExactWideToiDiagnostic {
        key: candidate.fact.key, region: region as u8,
        primitive: ExactWidePrimitiveDiagnostic::SegmentBodyRegion,
        interval_start_raw: wo.common_response.group_time_raw, interval_end_raw: 65_536,
        visited_times_raw: winner_trace.times, safe_steps_raw: winner_trace.steps,
        visit_count: winner_trace.count, accepted_root_raw: time,
        closest_feature: closest.feature,
        comparison: ExactWideComparisonDiagnostic::EarliestTimeThenMedialThenRegion,
    }); }
    Ok(Some(candidate))
}

#[cfg(any(test, feature = "cartesian-recoil"))]

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_candidate(a: ExactPoint, b: ExactPoint, feature: u8)
    -> Result<ExactSegmentClosest, ExactScanReject>
{
    let delta = exact_vector_sub(a, b)?;
    Ok(ExactSegmentClosest { a, b, distance_sq: exact_dot(delta, delta)?, feature })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_candidate_cmp(a: ExactSegmentClosest, b: ExactSegmentClosest)
    -> Result<Ordering, ExactScanReject>
{
    let distance = exact_cmp(a.distance_sq, b.distance_sq)?;
    if distance != Ordering::Equal { return Ok(distance); }
    for point in [0, 1] {
        let (left, right) = if point == 0 { (a.a, b.a) } else { (a.b, b.b) };
        for axis in 0..3 {
            let order = exact_cmp(left.0[axis], right.0[axis])?;
            if order != Ordering::Equal { return Ok(order); }
        }
    }
    Ok(a.feature.cmp(&b.feature))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_segment_at_pose(
    a0: ExactPoint, a1: ExactPoint, b0: ExactPoint, b1: ExactPoint,
) -> Result<ExactSegmentClosest, ExactScanReject> {
    for point in [a0, a1, b0, b1] {
        for value in point.0 { exact_rational(value)?; }
    }
    let u = exact_vector_sub(a1, a0)?; let v = exact_vector_sub(b1, b0)?;
    let w = exact_vector_sub(a0, b0)?;
    let aa = exact_dot(u, u)?; let bb = exact_dot(u, v)?; let cc = exact_dot(v, v)?;
    let dd = exact_dot(u, w)?; let ee = exact_dot(v, w)?;
    let mut candidates: [Option<ExactSegmentClosest>; 5] = [None; 5];

    if exact_cmp(aa, exact_zero())? != Ordering::Equal
        && exact_cmp(cc, exact_zero())? != Ordering::Equal {
        let determinant = exact_sub(exact_mul(aa, cc)?, exact_mul(bb, bb)?)?;
        if exact_cmp(determinant, exact_zero())? != Ordering::Equal {
            let s = exact_div(exact_sub(exact_mul(bb, ee)?, exact_mul(cc, dd)?)?, determinant)?;
            let t = exact_div(exact_sub(exact_mul(aa, ee)?, exact_mul(bb, dd)?)?, determinant)?;
            if exact_cmp(s, exact_zero())? != Ordering::Less
                && exact_cmp(s, exact_one())? != Ordering::Greater
                && exact_cmp(t, exact_zero())? != Ordering::Less
                && exact_cmp(t, exact_one())? != Ordering::Greater {
                candidates[0] = Some(exact_segment_candidate(
                    exact_point_at(a0, u, s)?, exact_point_at(b0, v, t)?, 0)?);
            }
        }
    }
    for (at, (point, origin, axis, square, point_is_a)) in [
        (a0, b0, v, cc, true), (a1, b0, v, cc, true),
        (b0, a0, u, aa, false), (b1, a0, u, aa, false),
    ].into_iter().enumerate() {
        let parameter = if exact_cmp(square, exact_zero())? == Ordering::Equal { exact_zero() }
            else { exact_clamp_unit(exact_div(exact_dot(exact_vector_sub(point, origin)?, axis)?, square)?)? };
        let projected = exact_point_at(origin, axis, parameter)?;
        candidates[at + 1] = Some(if point_is_a {
            exact_segment_candidate(point, projected, (at + 1) as u8)?
        } else {
            exact_segment_candidate(projected, point, (at + 1) as u8)?
        });
    }
    let mut candidates = candidates.into_iter().flatten();
    let mut winner = candidates.next().ok_or(ExactScanReject::ArithmeticEnvelope)?;
    for candidate in candidates {
        if exact_candidate_cmp(candidate, winner)? == Ordering::Less { winner = candidate; }
    }
    Ok(winner)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_vector_add(
    a: [crate::combat::trajectory::ExactRational; 3],
    b: [crate::combat::trajectory::ExactRational; 3],
) -> Result<[crate::combat::trajectory::ExactRational; 3], ExactScanReject> {
    Ok([exact_add(a[0], b[0])?, exact_add(a[1], b[1])?, exact_add(a[2], b[2])?])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_cross(
    a: [crate::combat::trajectory::ExactRational; 3],
    b: [crate::combat::trajectory::ExactRational; 3],
) -> Result<[crate::combat::trajectory::ExactRational; 3], ExactScanReject> {
    Ok([
        exact_sub(exact_mul(a[1], b[2])?, exact_mul(a[2], b[1])?)?,
        exact_sub(exact_mul(a[2], b[0])?, exact_mul(a[0], b[2])?)?,
        exact_sub(exact_mul(a[0], b[1])?, exact_mul(a[1], b[0])?)?,
    ])
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_vector_is_zero(value: [crate::combat::trajectory::ExactRational; 3])
    -> Result<bool, ExactScanReject>
{
    for component in value {
        if exact_cmp(component, exact_zero())? != Ordering::Equal { return Ok(false); }
    }
    Ok(true)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_rectangle_parameters(
    point: ExactPoint, origin: ExactPoint,
    side: [crate::combat::trajectory::ExactRational; 3],
    up: [crate::combat::trajectory::ExactRational; 3],
) -> Result<(crate::combat::trajectory::ExactRational,
             crate::combat::trajectory::ExactRational), ExactScanReject> {
    let delta = exact_vector_sub(point, origin)?;
    Ok((exact_div(exact_dot(delta, side)?, exact_dot(side, side)?)?,
        exact_div(exact_dot(delta, up)?, exact_dot(up, up)?)?))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_rectangle_at_pose(
    a0: ExactPoint, a1: ExactPoint, rectangle: [ExactPoint; 4],
) -> Result<ExactSegmentClosest, ExactScanReject> {
    let side = exact_vector_sub(rectangle[1], rectangle[0])?;
    let up = exact_vector_sub(rectangle[3], rectangle[0])?;
    let normal = exact_cross(side, up)?;
    if exact_vector_is_zero(normal)? { return Err(ExactScanReject::UnsupportedExactSweep); }
    let axis = exact_vector_sub(a1, a0)?;
    let mut candidates: [Option<ExactSegmentClosest>; 7] = [None; 7];
    let da = exact_dot(exact_vector_sub(a0, rectangle[0])?, normal)?;
    let db = exact_dot(exact_vector_sub(a1, rectangle[0])?, normal)?;
    let crossing_den = exact_sub(da, db)?;
    if exact_cmp(crossing_den, exact_zero())? != Ordering::Equal {
        let t = exact_div(da, crossing_den)?;
        if exact_cmp(t, exact_zero())? != Ordering::Less
            && exact_cmp(t, exact_one())? != Ordering::Greater {
            let point = exact_point_at(a0, axis, t)?;
            let (s, u) = exact_rectangle_parameters(point, rectangle[0], side, up)?;
            if exact_cmp(s, exact_zero())? != Ordering::Less
                && exact_cmp(s, exact_one())? != Ordering::Greater
                && exact_cmp(u, exact_zero())? != Ordering::Less
                && exact_cmp(u, exact_one())? != Ordering::Greater {
                candidates[0] = Some(exact_segment_candidate(point, point, 0)?);
            }
        }
    }
    let normal_square = exact_dot(normal, normal)?;
    for (at, endpoint) in [a0, a1].into_iter().enumerate() {
        let height = exact_div(exact_dot(exact_vector_sub(endpoint, rectangle[0])?, normal)?,
                               normal_square)?;
        let projected = exact_point_at(endpoint, normal, exact_neg(height)?)?;
        let (s, u) = exact_rectangle_parameters(projected, rectangle[0], side, up)?;
        let s = exact_clamp_unit(s)?; let u = exact_clamp_unit(u)?;
        let face = exact_point_at(exact_point_at(rectangle[0], side, s)?, up, u)?;
        candidates[at + 1] = Some(exact_segment_candidate(endpoint, face, (at + 1) as u8)?);
    }
    for (at, (b0, b1)) in [
        (rectangle[0], rectangle[3]), (rectangle[1], rectangle[2]),
        (rectangle[0], rectangle[1]), (rectangle[3], rectangle[2]),
    ].into_iter().enumerate() {
        let mut edge = exact_segment_segment_at_pose(a0, a1, b0, b1)?;
        edge.feature = (at + 3) as u8; candidates[at + 3] = Some(edge);
    }
    let mut candidates = candidates.into_iter().flatten();
    let mut winner = candidates.next().ok_or(ExactScanReject::UnsupportedExactSweep)?;
    for candidate in candidates {
        if exact_candidate_cmp(candidate, winner)? == Ordering::Less { winner = candidate; }
    }
    Ok(winner)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_affine_rectangle_is_maintained(
    start: [ExactPoint; 4], end: [ExactPoint; 4],
) -> Result<bool, ExactScanReject> {
    let side0 = exact_vector_sub(start[1], start[0])?;
    let up0 = exact_vector_sub(start[3], start[0])?;
    let side1 = exact_vector_sub(end[1], end[0])?;
    let up1 = exact_vector_sub(end[3], end[0])?;
    let sd = [exact_sub(side1[0], side0[0])?, exact_sub(side1[1], side0[1])?,
              exact_sub(side1[2], side0[2])?];
    let ud = [exact_sub(up1[0], up0[0])?, exact_sub(up1[1], up0[1])?,
              exact_sub(up1[2], up0[2])?];
    for points in [start, end] {
        let diagonal = exact_vector_add(exact_vector_sub(points[2], points[1])?,
                                        exact_vector_sub(points[0], points[3])?)?;
        if !exact_vector_is_zero(diagonal)? { return Ok(false); }
    }
    if exact_cmp(exact_dot(side0, up0)?, exact_zero())? != Ordering::Equal
        || exact_cmp(exact_add(exact_dot(side0, ud)?, exact_dot(sd, up0)?)?, exact_zero())?
            != Ordering::Equal
        || exact_cmp(exact_dot(sd, ud)?, exact_zero())? != Ordering::Equal {
        return Ok(false);
    }
    for (base, delta) in [(side0, sd), (up0, ud)] {
        if exact_vector_is_zero(base)? { return Ok(false); }
        let mut root = None;
        for axis in 0..3 {
            if exact_cmp(delta[axis], exact_zero())? == Ordering::Equal { continue; }
            root = Some(exact_div(exact_neg(base[axis])?, delta[axis])?); break;
        }
        if let Some(t) = root {
            if exact_cmp(t, exact_zero())? == Ordering::Greater
                && exact_cmp(t, exact_one())? == Ordering::Less {
                let value = [exact_add(base[0], exact_mul(delta[0], t)?)?,
                             exact_add(base[1], exact_mul(delta[1], t)?)?,
                             exact_add(base[2], exact_mul(delta[2], t)?)?];
                if exact_vector_is_zero(value)? { return Ok(false); }
            }
        }
    }
    Ok(!exact_vector_is_zero(side1)? && !exact_vector_is_zero(up1)?)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_abs(value: crate::combat::trajectory::ExactRational)
    -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    if exact_cmp(value, exact_zero())? == Ordering::Less { exact_neg(value) } else { Ok(value) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_l1(value: [crate::combat::trajectory::ExactRational; 3])
    -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    exact_add(exact_add(exact_abs(value[0])?, exact_abs(value[1])?)?, exact_abs(value[2])?)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_floor_nonnegative(value: crate::combat::trajectory::ExactRational)
    -> Result<u32, ExactScanReject> {
    let value = exact_rational(value)?;
    if value.numerator < 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    u32::try_from(value.numerator / value.denominator)
        .map_err(|_| ExactScanReject::ArithmeticEnvelope)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_point_to_vec3(value: ExactPoint) -> Result<Vec3, ExactScanReject> {
    let mut raw = [0; 3];
    for axis in 0..3 {
        let value = exact_rational(value.0[axis])?;
        raw[axis] = i32::try_from(value.numerator / value.denominator)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) fn exact_response_velocity(
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
) -> Result<Vec3, ExactScanReject> {
    let affine_velocity = |affine: ExactAffine3, scale: i128, axis: usize| {
        exact_rational(crate::combat::trajectory::ExactRational {
            numerator: scale.checked_mul(
                affine.momentum[axis].velocity_raw as i128)
                .and_then(|word| word.checked_add(affine.momentum[axis].remainder))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?,
            denominator: scale,
        })
    };
    let held = row.held_index.and_then(|at| owner.held_response.get(at)).and_then(|held| *held);
    let mut raw = [0; 3];
    for axis in 0..3 {
        let mut velocity = affine_velocity(owner.common_response, owner.common_scale, axis)?;
        if let Some(held) = held {
            velocity = exact_add(velocity,
                affine_velocity(held.affine, held.affine.mass_raw as i128, axis)?)?;
        }
        raw[axis] = i32::try_from(velocity.numerator / velocity.denominator)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn exact_contact_at_pose(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    compatibility: &[ContactCollider], a: usize, b: usize, time: u32,
    scratch: &mut ContactCollectionScratch,
) -> Result<Option<ContactFact>, ExactScanReject> {
    let (left, right) = (trajectories.get(a).ok_or(ExactScanReject::CompatibilityIdentity)?,
                         trajectories.get(b).ok_or(ExactScanReject::CompatibilityIdentity)?);
    let (owner_left, owner_right) = (
        owners.get(left.owner_index).ok_or(ExactScanReject::CompatibilityIdentity)?,
        owners.get(right.owner_index).ok_or(ExactScanReject::CompatibilityIdentity)?,
    );
    let toi = TimeOfImpact::new_clamped(Fx::from_raw(time as i32));
    let mut published_left = *compatibility.get(a).ok_or(ExactScanReject::CompatibilityIdentity)?;
    let mut published_right = *compatibility.get(b).ok_or(ExactScanReject::CompatibilityIdentity)?;
    published_left.velocity += wide_response_velocity(left, owner_left)?;
    published_right.velocity += wide_response_velocity(right, owner_right)?;
    let candidate = match (&left.motor, &right.motor) {
        (MotorShape::Segment { .. }, MotorShape::Body { .. }) => {
            let mut chosen = None;
            for region in 0..AnatomyRegion::COUNT {
                let Some((closest, radius_raw, medial)) = wide_segment_body_at_time(
                    left, owner_left, right, owner_right, region, time,
                    &mut scratch.exact_wide)? else { continue };
                let radius = wide_radius(radius_raw)?;
                if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)?
                    == Ordering::Greater { continue; }
                let replace = match chosen.as_ref() {
                    None => true,
                    Some((old_region, _, old_medial)) => {
                        let order = wide_cmp(medial, *old_medial)?;
                        order == Ordering::Less
                            || (order == Ordering::Equal && region < *old_region)
                    }
                };
                if replace { chosen = Some((region, closest, medial)); }
            }
            match chosen {
                None => None,
                Some((region, closest, _)) => Some(make_candidate(&published_left, &published_right,
                    ContactKind::WeaponBody, toi, wide_point_to_vec3(closest.a)?,
                    wide_point_to_vec3(closest.b)?, Fx::ZERO, 0, region as u8)),
            }
        }
        (MotorShape::Body { .. }, MotorShape::Segment { .. }) => {
            return exact_contact_at_pose(trajectories, owners, compatibility, b, a, time, scratch);
        }
        (MotorShape::Segment { .. }, MotorShape::Segment { .. }) => {
            let (a0, a1, ar) = wide_segment_at_time(left, owner_left, time)?;
            let (b0, b1, br) = wide_segment_at_time(right, owner_right, time)?;
            let closest = wide_segment_segment_points(a0, a1, b0, b1,
                                                       &mut scratch.exact_wide)?;
            let radius = wide_radius(ar.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
            if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? == Ordering::Greater {
                None
            } else { Some(make_candidate(&published_left, &published_right,
                ContactKind::WeaponWeapon, toi, wide_point_to_vec3(closest.a)?,
                wide_point_to_vec3(closest.b)?, Fx::ZERO, closest.feature, NO_REGION)) }
        }
        (MotorShape::Segment { .. }, MotorShape::Shield { .. }) => {
            let (hilt, tip, radius_raw) = wide_segment_at_time(left, owner_left, time)?;
            let closest = wide_segment_rectangle_points(
                hilt, tip, wide_shield_at_time(right, owner_right, time)?,
                &mut scratch.exact_wide)?;
            let radius = wide_radius(radius_raw)?;
            if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? == Ordering::Greater {
                None
            } else { Some(make_candidate(&published_left, &published_right,
                ContactKind::WeaponShield, toi, wide_point_to_vec3(closest.a)?,
                wide_point_to_vec3(closest.b)?, Fx::ZERO, closest.feature, NO_REGION)) }
        }
        (MotorShape::Shield { .. }, MotorShape::Segment { .. }) => {
            return exact_contact_at_pose(trajectories, owners, compatibility, b, a, time, scratch);
        }
        // Recompute has exactly the scanner's primitive domain. Body/body is
        // separated by World, while body/shield and shield/shield are not
        // contact primitives; a nonzero response must not promote any of the
        // three from an inert pair into a refusal.
        _ => None,
    };
    Ok(candidate.map(|row| row.fact))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
enum ExactPairShape {
    SegmentSegment(ExactSegmentClosest, i32),
    SegmentShield(ExactSegmentClosest, i32),
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_pair_at_time(
    a: &ExactContactTrajectory, owner_a: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, owner_b: &ExactOwnerTrajectory, time: u32,
) -> Result<ExactPairShape, ExactScanReject> {
    let a_shape = evaluate_exact(a, owner_a, time).map_err(ExactScanReject::Trajectory)?;
    let b_shape = evaluate_exact(b, owner_b, time).map_err(ExactScanReject::Trajectory)?;
    match (a_shape, b_shape) {
        (EvaluatedContactShape::Segment { hilt: ah, tip: at, radius_raw: ar },
         EvaluatedContactShape::Segment { hilt: bh, tip: bt, radius_raw: br }) =>
            Ok(ExactPairShape::SegmentSegment(exact_segment_segment_at_pose(ah, at, bh, bt)?,
                                               ar.checked_add(br)
                                                   .ok_or(ExactScanReject::ArithmeticEnvelope)?)),
        (EvaluatedContactShape::Segment { hilt, tip, radius_raw },
         EvaluatedContactShape::Shield { corners }) =>
            Ok(ExactPairShape::SegmentShield(exact_segment_rectangle_at_pose(hilt, tip, corners)?,
                                             radius_raw)),
        (EvaluatedContactShape::Shield { corners },
         EvaluatedContactShape::Segment { hilt, tip, radius_raw }) => {
            let mut closest = exact_segment_rectangle_at_pose(hilt, tip, corners)?;
            core::mem::swap(&mut closest.a, &mut closest.b);
            Ok(ExactPairShape::SegmentShield(closest, radius_raw))
        }
        _ => Err(ExactScanReject::UnsupportedExactSweep),
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_pair_closest(shape: &ExactPairShape) -> (ExactSegmentClosest, i32, ContactKind) {
    match shape {
        ExactPairShape::SegmentSegment(closest, radius) =>
            (*closest, *radius, ContactKind::WeaponWeapon),
        ExactPairShape::SegmentShield(closest, radius) =>
            (*closest, *radius, ContactKind::WeaponShield),
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_endpoint_velocities(
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
) -> Result<([crate::combat::trajectory::ExactRational; 3],
             [crate::combat::trajectory::ExactRational; 3],
             [crate::combat::trajectory::ExactRational; 3],
             [crate::combat::trajectory::ExactRational; 3]), ExactScanReject> {
    let start_time = owner.common_response.group_time_raw;
    let end_time = start_time.checked_add(1).filter(|time| *time <= 65_536)
        .unwrap_or(start_time);
    let start = evaluate_exact(row, owner, start_time).map_err(ExactScanReject::Trajectory)?;
    let end = evaluate_exact(row, owner, end_time).map_err(ExactScanReject::Trajectory)?;
    let scale = crate::combat::trajectory::ExactRational {
        numerator: (end_time - start_time).max(1) as i128, denominator: 1,
    };
    let velocity = |a: ExactPoint, b: ExactPoint| -> Result<_, ExactScanReject> {
        let delta = exact_vector_sub(b, a)?;
        Ok([exact_div(delta[0], scale)?, exact_div(delta[1], scale)?, exact_div(delta[2], scale)?])
    };
    match (start, end) {
        (EvaluatedContactShape::Segment { hilt: ah, tip: at, .. },
         EvaluatedContactShape::Segment { hilt: bh, tip: bt, .. }) => {
            let h = velocity(ah, bh)?; let t = velocity(at, bt)?; Ok((h, t, h, t))
        }
        (EvaluatedContactShape::Shield { corners: a },
         EvaluatedContactShape::Shield { corners: b }) =>
            Ok((velocity(a[0], b[0])?, velocity(a[1], b[1])?,
                velocity(a[2], b[2])?, velocity(a[3], b[3])?)),
        _ => Err(ExactScanReject::UnsupportedExactSweep),
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_relative_speed_bound(
    a: &ExactContactTrajectory, owner_a: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, owner_b: &ExactOwnerTrajectory,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let av = exact_endpoint_velocities(a, owner_a)?;
    let bv = exact_endpoint_velocities(b, owner_b)?;
    let mut maximum = exact_zero();
    for left in [av.0, av.1, av.2, av.3] { for right in [bv.0, bv.1, bv.2, bv.3] {
        let speed = exact_l1([exact_sub(left[0], right[0])?,
                              exact_sub(left[1], right[1])?,
                              exact_sub(left[2], right[2])?])?;
        if exact_cmp(speed, maximum)? == Ordering::Greater { maximum = speed; }
    } }
    Ok(maximum)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_midpoint(a: ExactPoint, b: ExactPoint) -> Result<ExactPoint, ExactScanReject> {
    let half = crate::combat::trajectory::ExactRational { numerator: 1, denominator: 2 };
    let mut out = a;
    for axis in 0..3 { out.0[axis] = exact_mul(exact_add(a.0[axis], b.0[axis])?, half)?; }
    Ok(out)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_body_region_at_time(
    weapon: &ExactContactTrajectory, weapon_owner: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, body_owner: &ExactOwnerTrajectory,
    region: usize, time: u32,
) -> Result<Option<(ExactSegmentClosest, i32)>, ExactScanReject> {
    let weapon = evaluate_exact(weapon, weapon_owner, time).map_err(ExactScanReject::Trajectory)?;
    let body = evaluate_exact(body, body_owner, time).map_err(ExactScanReject::Trajectory)?;
    let EvaluatedContactShape::Segment { hilt, tip, radius_raw: weapon_radius } = weapon
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let EvaluatedContactShape::Body { parts, .. } = body
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let part = parts.get(region).ok_or(ExactScanReject::CompatibilityIdentity)?;
    if !part.present { return Ok(None); }
    let closest = exact_segment_segment_at_pose(hilt, tip, part.lower, part.upper)?;
    Ok(Some((closest, weapon_radius.checked_add(part.radius_raw)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?)))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_body_medial(
    closest: ExactSegmentClosest, body: &ExactContactTrajectory,
    body_owner: &ExactOwnerTrajectory, region: usize, time: u32,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let body = evaluate_exact(body, body_owner, time).map_err(ExactScanReject::Trajectory)?;
    let EvaluatedContactShape::Body { parts, .. } = body
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let part = parts.get(region).ok_or(ExactScanReject::CompatibilityIdentity)?;
    if !part.present { return Err(ExactScanReject::CompatibilityIdentity); }
    let point = exact_midpoint(closest.a, closest.b)?;
    Ok(exact_segment_segment_at_pose(point, point, part.lower, part.upper)?.distance_sq)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_segment_body_region_speed(
    weapon: &ExactContactTrajectory, weapon_owner: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, body_owner: &ExactOwnerTrajectory, region: usize,
) -> Result<crate::combat::trajectory::ExactRational, ExactScanReject> {
    let group = weapon_owner.common_response.group_time_raw;
    let next = group.checked_add(1).filter(|time| *time <= 65_536).unwrap_or(group);
    let segment_at = |time| evaluate_exact(weapon, weapon_owner, time)
        .map_err(ExactScanReject::Trajectory);
    let body_at = |time| evaluate_exact(body, body_owner, time)
        .map_err(ExactScanReject::Trajectory);
    let (EvaluatedContactShape::Segment { hilt: h0, tip: t0, .. },
         EvaluatedContactShape::Segment { hilt: h1, tip: t1, .. }) =
        (segment_at(group)?, segment_at(next)?)
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    let (EvaluatedContactShape::Body { parts: p0, .. },
         EvaluatedContactShape::Body { parts: p1, .. }) =
        (body_at(group)?, body_at(next)?)
        else { return Err(ExactScanReject::UnsupportedExactSweep) };
    if !p0[region].present || !p1[region].present { return Ok(exact_zero()); }
    let scale = crate::combat::trajectory::ExactRational {
        numerator: (next - group).max(1) as i128, denominator: 1,
    };
    let velocity = |a: ExactPoint, b: ExactPoint| -> Result<_, ExactScanReject> {
        let d = exact_vector_sub(b, a)?;
        Ok([exact_div(d[0], scale)?, exact_div(d[1], scale)?, exact_div(d[2], scale)?])
    };
    let weapon_velocity = [velocity(h0, h1)?, velocity(t0, t1)?];
    let body_velocity = [velocity(p0[region].lower, p1[region].lower)?,
                         velocity(p0[region].upper, p1[region].upper)?];
    let mut maximum = exact_zero();
    for left in weapon_velocity { for right in body_velocity {
        let speed = exact_l1([exact_sub(left[0], right[0])?,
                              exact_sub(left[1], right[1])?,
                              exact_sub(left[2], right[2])?])?;
        if exact_cmp(speed, maximum)? == Ordering::Greater { maximum = speed; }
    } }
    Ok(maximum)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_sweep_segment_body_region(
    weapon: &ExactContactTrajectory, weapon_owner: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, body_owner: &ExactOwnerTrajectory, region: usize,
) -> Result<Option<(u32, ExactSegmentClosest,
                    crate::combat::trajectory::ExactRational)>, ExactScanReject> {
    let speed = exact_segment_body_region_speed(weapon, weapon_owner, body, body_owner, region)?;
    let mut time = weapon_owner.common_response.group_time_raw;
    for _ in 0..96 {
        let Some((closest, radius_raw)) = exact_segment_body_region_at_time(
            weapon, weapon_owner, body, body_owner, region, time)? else { return Ok(None) };
        if radius_raw < 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
        let radius = crate::combat::trajectory::ExactRational {
            numerator: radius_raw as i128, denominator: 1,
        };
        let radius_sq = exact_mul(radius, radius)?;
        if exact_cmp(closest.distance_sq, radius_sq)? != Ordering::Greater {
            let medial = exact_segment_body_medial(closest, body, body_owner, region, time)?;
            return Ok(Some((time, closest, medial)));
        }
        if time == 65_536 || exact_cmp(speed, exact_zero())? == Ordering::Equal { return Ok(None); }
        let d = exact_l1(exact_vector_sub(closest.a, closest.b)?)?;
        let safe = exact_div(exact_sub(closest.distance_sq, radius_sq)?,
                             exact_mul(exact_add(d, radius)?, speed)?)?;
        let step = exact_floor_nonnegative(safe)?;
        if step == 0 {
            let next = time + 1;
            let Some((adjacent, adjacent_radius)) = exact_segment_body_region_at_time(
                weapon, weapon_owner, body, body_owner, region, next)? else { return Ok(None) };
            let adjacent_radius = crate::combat::trajectory::ExactRational {
                numerator: adjacent_radius as i128, denominator: 1,
            };
            if exact_cmp(adjacent.distance_sq, exact_mul(adjacent_radius, adjacent_radius)?)?
                == Ordering::Greater { return Err(ExactScanReject::UnsupportedExactSweep); }
            time = next;
        } else {
            time = time.checked_add(step.min(65_536 - time))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        }
    }
    Err(ExactScanReject::Budget)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_sweep_segment_body(
    weapon: &ExactContactTrajectory, weapon_owner: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, body_owner: &ExactOwnerTrajectory,
    compatibility_weapon: &ContactCollider, compatibility_body: &ContactCollider,
) -> Result<Option<Candidate>, ExactScanReject> {
    let mut winner: Option<(u32, crate::combat::trajectory::ExactRational, usize,
                            ExactSegmentClosest)> = None;
    for region in 0..AnatomyRegion::COUNT {
        let Some((time, closest, medial)) = exact_sweep_segment_body_region(
            weapon, weapon_owner, body, body_owner, region)? else { continue };
        let replace = match winner {
            None => true,
            Some((chosen_time, chosen_medial, chosen_region, _)) => time < chosen_time
                || (time == chosen_time && (exact_cmp(medial, chosen_medial)? == Ordering::Less
                    || (exact_cmp(medial, chosen_medial)? == Ordering::Equal
                        && region < chosen_region))),
        };
        if replace { winner = Some((time, medial, region, closest)); }
    }
    let Some((time, _, region, closest)) = winner else { return Ok(None) };
    let mut published_weapon = *compatibility_weapon;
    let mut published_body = *compatibility_body;
    published_weapon.velocity += exact_response_velocity(weapon, weapon_owner)?;
    published_body.velocity += exact_response_velocity(body, body_owner)?;
    let distance_raw = i32::try_from(
        (closest.distance_sq.numerator / closest.distance_sq.denominator) >> 16)
        .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    Ok(Some(make_candidate(&published_weapon, &published_body, ContactKind::WeaponBody,
        TimeOfImpact::new_clamped(Fx::from_raw(time as i32)),
        exact_point_to_vec3(closest.a)?, exact_point_to_vec3(closest.b)?,
        Fx::from_raw(distance_raw), 0, region as u8)))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_sweep_pair(
    a: &ExactContactTrajectory, owner_a: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, owner_b: &ExactOwnerTrajectory,
    compatibility_a: &ContactCollider, compatibility_b: &ContactCollider,
) -> Result<Option<Candidate>, ExactScanReject> {
    let speed = exact_relative_speed_bound(a, owner_a, b, owner_b)?;
    let mut time = owner_a.common_response.group_time_raw;
    for _ in 0..96 {
        let shape = exact_pair_at_time(a, owner_a, b, owner_b, time)?;
        let (closest, radius_raw, kind) = exact_pair_closest(&shape);
        if radius_raw < 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
        let radius = crate::combat::trajectory::ExactRational {
            numerator: radius_raw as i128, denominator: 1,
        };
        let radius_sq = exact_mul(radius, radius)?;
        if exact_cmp(closest.distance_sq, radius_sq)? != Ordering::Greater {
            let toi = TimeOfImpact::new_clamped(Fx::from_raw(time as i32));
            let pa = exact_point_to_vec3(closest.a)?; let pb = exact_point_to_vec3(closest.b)?;
            let mut published_a = *compatibility_a; let mut published_b = *compatibility_b;
            published_a.velocity += exact_response_velocity(a, owner_a)?;
            published_b.velocity += exact_response_velocity(b, owner_b)?;
            return Ok(Some(make_candidate(&published_a, &published_b, kind, toi,
                                          pa, pb,
                                          Fx::from_raw(i32::try_from(
                                              (closest.distance_sq.numerator
                                               / closest.distance_sq.denominator) >> 16)
                                              .map_err(|_| ExactScanReject::ArithmeticEnvelope)?),
                                          closest.feature, NO_REGION)));
        }
        if time == 65_536 || exact_cmp(speed, exact_zero())? == Ordering::Equal { return Ok(None); }
        let delta = exact_vector_sub(closest.a, closest.b)?;
        let d = exact_l1(delta)?;
        let safe = exact_div(exact_sub(closest.distance_sq, radius_sq)?,
                             exact_mul(exact_add(d, radius)?, speed)?)?;
        let step = exact_floor_nonnegative(safe)?;
        if step == 0 {
            let next = time + 1;
            let adjacent = exact_pair_at_time(a, owner_a, b, owner_b, next)?;
            let (adjacent, adjacent_radius, _) = exact_pair_closest(&adjacent);
            let adjacent_radius = crate::combat::trajectory::ExactRational {
                numerator: adjacent_radius as i128, denominator: 1,
            };
            if exact_cmp(adjacent.distance_sq, exact_mul(adjacent_radius, adjacent_radius)?)?
                == Ordering::Greater {
                return Err(ExactScanReject::UnsupportedExactSweep);
            }
            time = next;
        } else {
            time = time.checked_add(step.min(65_536 - time))
                .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        }
    }
    Err(ExactScanReject::Budget)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[allow(dead_code)]
fn motor_point(previous: Vec3, requested: Vec3) -> ExactMotorPoint {
    let delta = requested - previous;
    ExactMotorPoint {
        at_tick_start_raw: [previous.x.raw(), previous.y.raw(), previous.z.raw()],
        tick_delta_raw: [delta.x.raw(), delta.y.raw(), delta.z.raw()],
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[allow(dead_code)]
fn zero_affine(mass_raw: i32) -> ExactAffine3 {
    ExactAffine3 {
        mass_raw, at_group: [ExactPosition::default(); 3],
        momentum: [ExactMomentum::default(); 3], group_time_raw: 0,
    }
}

/// Create the exact zero-response provenance for existing collider rows.
///
/// The spec tag is necessarily synthetic at this seam because `ContactCollider`
/// predates immutable equipment IDs. It is used only to prove that the paired
/// compatibility row has not been exchanged; checkpoint C replaces it with the
/// real World tag in the same transition that gives World exact state.
#[cfg(any(test, feature = "cartesian-recoil"))]
#[allow(dead_code)]
pub(crate) fn zero_response_compatibility(
    colliders: &[ContactCollider],
) -> Result<ZeroResponseCompatibility, ExactScanReject> {
    let mut owners: Vec<ExactOwnerTrajectory> = Vec::new();
    for row in colliders {
        if row.mass.raw() <= 0 { return Err(ExactScanReject::CompatibilityIdentity); }
        if owners.iter().any(|owner| owner.entity == row.entity) { continue; }
        let body_mass_raw = colliders.iter().find(|other| other.entity == row.entity
            && matches!(other.shape, ContactShape::Body { .. }))
            .map_or(Fx::ONE.raw(), |body| body.mass.raw());
        if body_mass_raw <= 0 { return Err(ExactScanReject::CompatibilityIdentity); }
        let mut held_response = [None; 2];
        for held in colliders.iter().filter(|other| other.entity == row.entity
            && !matches!(other.shape, ContactShape::Body { .. })) {
            let at = held.slot as usize;
            if at >= held_response.len() || held_response[at].is_some() {
                return Err(ExactScanReject::CompatibilityIdentity);
            }
            held_response[at] = Some(ExactHeldResponse {
                slot: held.slot, spec_id: held.slot as u16, affine: zero_affine(held.mass.raw()),
            });
        }
        let common_mass = held_response.iter().flatten().try_fold(body_mass_raw, |sum, held|
            sum.checked_add(held.affine.mass_raw)).ok_or(ExactScanReject::CompatibilityIdentity)?;
        owners.push(ExactOwnerTrajectory {
            entity: row.entity, body_mass_raw, common_scale: common_mass as i128,
            common_response: zero_affine(common_mass),
            held_response,
        });
    }

    let mut trajectories = Vec::with_capacity(colliders.len());
    for row in colliders {
        let owner_index = owners.iter().position(|owner| owner.entity == row.entity)
            .ok_or(ExactScanReject::CompatibilityIdentity)?;
        let (kind, held_index, equipment_spec, motor) = match row.shape {
            ContactShape::Body { previous_origin, requested_origin, parts } => {
                if row.slot != BODY_SLOT { return Err(ExactScanReject::CompatibilityIdentity); }
                let mut bounds = [ExactMotorBounds {
                    lower: motor_point(Vec3::ZERO, Vec3::ZERO),
                    upper: motor_point(Vec3::ZERO, Vec3::ZERO),
                    radius_raw: 0, present: false,
                }; AnatomyRegion::COUNT];
                for at in 0..AnatomyRegion::COUNT {
                    bounds[at] = ExactMotorBounds {
                        lower: motor_point(parts[at].previous_lower, parts[at].requested_lower),
                        upper: motor_point(parts[at].previous_upper, parts[at].requested_upper),
                        radius_raw: parts[at].radius.raw(), present: parts[at].present,
                    };
                }
                (GeneralizedKind::Body, None, None, MotorShape::Body {
                    origin: motor_point(previous_origin, requested_origin), parts: bounds,
                })
            }
            ContactShape::Segment { previous_hilt, previous_tip, requested_hilt,
                                    requested_tip, radius } => {
                let held = row.slot as usize;
                if held >= 2 { return Err(ExactScanReject::CompatibilityIdentity); }
                (GeneralizedKind::Equipment, Some(held), Some(row.slot as u16),
                 MotorShape::Segment {
                     hilt: motor_point(previous_hilt, requested_hilt),
                     tip: motor_point(previous_tip, requested_tip), radius_raw: radius.raw(),
                 })
            }
            ContactShape::Shield { previous, requested } => {
                let held = row.slot as usize;
                if held >= 2 { return Err(ExactScanReject::CompatibilityIdentity); }
                (GeneralizedKind::Equipment, Some(held), Some(row.slot as u16),
                 MotorShape::Shield { corners: [
                     motor_point(previous[0], requested[0]),
                     motor_point(previous[1], requested[1]),
                     motor_point(previous[2], requested[2]),
                     motor_point(previous[3], requested[3]),
                 ] })
            }
        };
        trajectories.push(ExactContactTrajectory {
            entity: row.entity, faction: row.faction, slot: row.slot, kind,
            mass_raw: row.mass.raw(), surface: row.surface, motor, owner_index,
            held_index, equipment_spec, present: row.present,
        });
    }
    Ok(ZeroResponseCompatibility { owners, trajectories })
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn response_is_proven_zero(owner: ExactOwnerTrajectory) -> bool {
    let affine_is_zero = |affine: ExactAffine3| affine.at_group == [ExactPosition::default(); 3]
        && affine.momentum == [ExactMomentum::default(); 3];
    affine_is_zero(owner.common_response)
        && owner.held_response.iter().flatten().all(|held| affine_is_zero(held.affine))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn zero_response_motor_point(point: ExactMotorPoint, time: u32)
    -> Result<ExactPoint, ExactScanReject>
{
    if time > 65_536 {
        return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::TimePastTick));
    }
    let mut out = [crate::combat::trajectory::ExactRational {
        numerator: 0, denominator: 65_536,
    }; 3];
    for axis in 0..3 {
        out[axis].numerator = (point.at_tick_start_raw[axis] as i128).checked_mul(65_536)
            .and_then(|word| (point.tick_delta_raw[axis] as i128)
                .checked_mul(time as i128).and_then(|step| word.checked_add(step)))
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(ExactPoint(out))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn zero_response_shape(row: &ExactContactTrajectory, time: u32)
    -> Result<EvaluatedContactShape, ExactScanReject>
{
    match row.motor {
        MotorShape::Segment { hilt, tip, radius_raw } => Ok(EvaluatedContactShape::Segment {
            hilt: zero_response_motor_point(hilt, time)?,
            tip: zero_response_motor_point(tip, time)?, radius_raw,
        }),
        MotorShape::Shield { corners } => {
            let mut out = [zero_response_motor_point(corners[0], time)?; 4];
            for at in 1..4 { out[at] = zero_response_motor_point(corners[at], time)?; }
            Ok(EvaluatedContactShape::Shield { corners: out })
        }
        MotorShape::Body { origin, parts } => {
            let origin = zero_response_motor_point(origin, time)?;
            let mut out = [crate::combat::trajectory::EvaluatedMotorBounds {
                lower: origin, upper: origin, radius_raw: 0, present: false,
            }; AnatomyRegion::COUNT];
            for at in 0..AnatomyRegion::COUNT {
                out[at] = crate::combat::trajectory::EvaluatedMotorBounds {
                    lower: zero_response_motor_point(parts[at].lower, time)?,
                    upper: zero_response_motor_point(parts[at].upper, time)?,
                    radius_raw: parts[at].radius_raw, present: parts[at].present,
                };
            }
            Ok(EvaluatedContactShape::Body { origin, parts: out })
        }
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn rational_is_raw(point: ExactPoint, value: Vec3) -> bool {
    let raw = [value.x.raw(), value.y.raw(), value.z.raw()];
    (0..3).all(|axis| point.0[axis].numerator
        == (raw[axis] as i128).checked_mul(point.0[axis].denominator).unwrap_or(i128::MIN))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn evaluated_matches(row: ContactCollider, at_start: EvaluatedContactShape,
                     at_end: EvaluatedContactShape) -> bool {
    match (row.shape, at_start, at_end) {
        (ContactShape::Segment { previous_hilt, previous_tip, requested_hilt,
          requested_tip, radius }, EvaluatedContactShape::Segment { hilt: h0, tip: t0,
          radius_raw: r0 }, EvaluatedContactShape::Segment { hilt: h1, tip: t1,
          radius_raw: r1 }) => r0 == radius.raw() && r1 == radius.raw()
            && rational_is_raw(h0, previous_hilt) && rational_is_raw(t0, previous_tip)
            && rational_is_raw(h1, requested_hilt) && rational_is_raw(t1, requested_tip),
        (ContactShape::Shield { previous, requested },
         EvaluatedContactShape::Shield { corners: a },
         EvaluatedContactShape::Shield { corners: b }) => (0..4).all(|at|
            rational_is_raw(a[at], previous[at]) && rational_is_raw(b[at], requested[at])),
        (ContactShape::Body { previous_origin, requested_origin, parts },
         EvaluatedContactShape::Body { origin: a, parts: pa },
         EvaluatedContactShape::Body { origin: b, parts: pb }) =>
            rational_is_raw(a, previous_origin) && rational_is_raw(b, requested_origin)
            && (0..AnatomyRegion::COUNT).all(|at| pa[at].radius_raw == parts[at].radius.raw()
                && pb[at].radius_raw == parts[at].radius.raw()
                && pa[at].present == parts[at].present && pb[at].present == parts[at].present
                && rational_is_raw(pa[at].lower, parts[at].previous_lower)
                && rational_is_raw(pa[at].upper, parts[at].previous_upper)
                && rational_is_raw(pb[at].lower, parts[at].requested_lower)
                && rational_is_raw(pb[at].upper, parts[at].requested_upper)),
        _ => false,
    }
}

/// Checkpoint B's sole exact-trajectory-facing detector entrypoint.
///
/// Preflight is intentionally complete before the legacy scanner clears its
/// scratch. Nonzero response belongs to the next exact CCD slice and refuses
/// here by name; it never reaches rounded interpolation.
#[cfg(any(test, feature = "cartesian-recoil"))]
#[allow(dead_code)]
pub(crate) fn scan_exact_candidates_into(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    compatibility: &[ContactCollider], scratch: &mut ContactCollectionScratch,
) -> Result<(), ExactScanReject> {
    scan_detector_into(DetectorInput::Exact { trajectories, owners }, compatibility, scratch)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn preflight_exact_compatibility(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    compatibility: &[ContactCollider],
) -> Result<bool, ExactScanReject> {
    if trajectories.len() != compatibility.len() {
        return Err(ExactScanReject::CompatibilityIdentity);
    }
    let group_time = owners.first().map_or(0, |owner| owner.common_response.group_time_raw);
    if owners.iter().any(|owner| owner.common_response.group_time_raw != group_time) {
        return Err(ExactScanReject::CompatibilityIdentity);
    }
    let mut nonzero = false;
    for (at, owner) in owners.iter().enumerate() {
        if owners[..at].iter().any(|other| other.entity == owner.entity) {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        nonzero |= !response_is_proven_zero(*owner);
    }
    for (at, (trajectory, row)) in trajectories.iter().zip(compatibility).enumerate() {
        if trajectories[..at].iter().any(|other| other.entity == trajectory.entity
            && other.slot == trajectory.slot) {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        if trajectory.entity != row.entity || trajectory.faction != row.faction
            || trajectory.slot != row.slot || trajectory.mass_raw != row.mass.raw()
            || trajectory.surface != row.surface || trajectory.present != row.present {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        if !nonzero {
            let start = zero_response_shape(trajectory, group_time)?;
            let end = zero_response_shape(trajectory, 65_536)?;
            if !evaluated_matches(*row, start, end) {
                return Err(ExactScanReject::CompatibilityIdentity);
            }
            if let (EvaluatedContactShape::Shield { corners: start },
                    EvaluatedContactShape::Shield { corners: end }) = (start, end) {
                if !exact_affine_rectangle_is_maintained(start, end)? {
                    return Err(ExactScanReject::UnsupportedExactSweep);
                }
            }
        } else if matches!(trajectory.motor, MotorShape::Shield { .. }) {
            let owner = owners.get(trajectory.owner_index)
                .ok_or(ExactScanReject::CompatibilityIdentity)?;
            let start = wide_shield_at_time(trajectory, owner, group_time)?;
            let end = wide_shield_at_time(trajectory, owner, 65_536)?;
            if !wide_affine_rectangle_is_maintained(start, end)? {
                return Err(ExactScanReject::UnsupportedExactSweep);
            }
        }
    }
    validate_exact_rows(trajectories, owners).map_err(ExactScanReject::Trajectory)?;
    Ok(nonzero)
}

/// Re-derive one pair's contact geometry at a single frozen pose.
///
/// By the time this runs the group's membership is already settled by mapped
/// time, so the open question is no longer *when* but *where*. Evaluating the
/// closest pair directly -- rather than re-sweeping a trajectory that has no
/// remaining extent -- keeps the point, normal, and velocities on the pose the
/// group actually resolves at, and it answers for a pair the conservative
/// advance left a raw unit short instead of dropping it.
///
/// `toi` is the *global* group time, which is what the normal rule is written
/// against: only a genuine tick-start overlap gets the unconditional +X.
pub(crate) fn contact_at_pose(
    a: &ContactCollider, b: &ContactCollider, toi: TimeOfImpact,
) -> Option<ContactFact> {
    let candidate = match (a.shape, b.shape) {
        (ContactShape::Segment { .. }, ContactShape::Segment { .. }) => {
            let (first, second) = if (a.entity, a.slot) <= (b.entity, b.slot) { (a, b) } else { (b, a) };
            segment_segment_at_pose(first, second, toi)
        }
        (ContactShape::Segment { .. }, ContactShape::Shield { .. }) => segment_shield_at_pose(a, b, toi),
        (ContactShape::Shield { .. }, ContactShape::Segment { .. }) => segment_shield_at_pose(b, a, toi),
        (ContactShape::Segment { .. }, ContactShape::Body { .. }) => segment_body_at_pose(a, b, toi),
        (ContactShape::Body { .. }, ContactShape::Segment { .. }) => segment_body_at_pose(b, a, toi),
        _ => None,
    }?;
    Some(candidate.fact)
}

fn segment_segment_at_pose(a: &ContactCollider, b: &ContactCollider, toi: TimeOfImpact) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt: ah, previous_tip: at, .. } = a.shape else { return None };
    let ContactShape::Segment { previous_hilt: bh, previous_tip: bt, .. } = b.shape else { return None };
    let closest = closest_points_on_segments(ah, at, bh, bt);
    Some(make_candidate(a, b, ContactKind::WeaponWeapon, toi,
                        closest.a, closest.b, closest.distance_sq, 0, NO_REGION))
}

fn segment_shield_at_pose(weapon: &ContactCollider, shield: &ContactCollider, toi: TimeOfImpact) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape else { return None };
    let ContactShape::Shield { previous, .. } = shield.shape else { return None };
    let closest = closest_points_segment_rectangle(previous_hilt, previous_tip, previous);
    Some(make_candidate(weapon, shield, ContactKind::WeaponShield, toi,
                        closest.a, closest.b, closest.distance_sq, closest.feature, NO_REGION))
}

/// Re-derive a weapon/body fact at a single frozen pose, region included.
///
/// The sweep is deliberately *not* re-run here. By this point the group's
/// membership is settled by mapped time, so re-sweeping a trajectory with no
/// remaining extent could answer `None` for a pair the conservative advance
/// left a raw unit short -- and dropping a member of a settled group is worse
/// than choosing its region by a slightly different key. So the ordering key
/// swaps its first term: the earliest time of impact becomes the smallest
/// distance at the pose, which is the same statement about the same geometry
/// once time has stopped. The other two terms are the contract's own, and the
/// `BodyPart` tail is what keeps two coincident regions from being a coin flip.
fn segment_body_at_pose(weapon: &ContactCollider, body: &ContactCollider, toi: TimeOfImpact) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape else { return None };
    let ContactShape::Body { parts, .. } = body.shape else { return None };
    let mut best: Option<((i32, i32, u8), Candidate)> = None;
    for (at, part) in parts.iter().enumerate() {
        if !part.present { continue; }
        let closest = closest_points_on_segments(
            previous_hilt, previous_tip, part.previous_lower, part.previous_upper);
        let point = midpoint(closest.a, closest.b);
        let key = (closest.distance_sq.raw(),
                   medial_distance_sq(point, part.previous_lower, part.previous_upper).raw(),
                   at as u8);
        if best.as_ref().is_some_and(|(chosen, _)| *chosen <= key) { continue; }
        best = Some((key, make_candidate(weapon, body, ContactKind::WeaponBody, toi,
                                         closest.a, closest.b, closest.distance_sq, 0, at as u8)));
    }
    best.map(|(_, candidate)| candidate)
}

fn candidate(a: &ContactCollider, b: &ContactCollider) -> Option<Candidate> {
    match (a.shape, b.shape) {
        (ContactShape::Segment { .. }, ContactShape::Segment { .. }) => {
            let ((weapon_a, shape_a), (weapon_b, shape_b)) =
                if (a.entity, a.slot) <= (b.entity, b.slot) { ((a, a.shape), (b, b.shape)) }
                else { ((b, b.shape), (a, a.shape)) };
            segment_segment_candidate(weapon_a, shape_a, weapon_b, shape_b)
        }
        (ContactShape::Segment { .. }, ContactShape::Shield { .. }) => segment_shield_candidate(a, a.shape, b, b.shape),
        (ContactShape::Shield { .. }, ContactShape::Segment { .. }) => segment_shield_candidate(b, b.shape, a, a.shape),
        (ContactShape::Segment { .. }, ContactShape::Body { .. }) => segment_body_candidate(a, a.shape, b, b.shape),
        (ContactShape::Body { .. }, ContactShape::Segment { .. }) => segment_body_candidate(b, b.shape, a, a.shape),
        _ => None,
    }
}

/// The point on a capsule's medial segment nearest `point`. A sphere is the
/// degenerate segment, so this is one rule rather than two.
pub(crate) fn medial_point(point: Vec3, lower: Vec3, upper: Vec3) -> Vec3 {
    closest_points_on_segments(point, point, lower, upper).b
}

/// Squared distance from a point to a capsule's medial segment. Surface
/// distance is deliberately not used: it would need the radius subtracted and a
/// sign, and two regions of different radius would then rank by their armour
/// rather than by where the blow landed.
fn medial_distance_sq(point: Vec3, lower: Vec3, upper: Vec3) -> Fx {
    closest_points_on_segments(point, point, lower, upper).distance_sq
}

fn segment_segment_candidate(
    a: &ContactCollider, sa: ContactShape, b: &ContactCollider, sb: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt: ah0, previous_tip: at0,
        requested_hilt: ah1, requested_tip: at1, radius: ar } = sa else { unreachable!() };
    let ContactShape::Segment { previous_hilt: bh0, previous_tip: bt0,
        requested_hilt: bh1, requested_tip: bt1, radius: br } = sb else { unreachable!() };
    let toi = swept_segment_segment(ah0, at0, ah1, at1, ar, bh0, bt0, bh1, bt1, br)?;
    let t = toi.get();
    let closest = closest_points_on_segments(
        Vec3::lerp(ah0, ah1, t), Vec3::lerp(at0, at1, t),
        Vec3::lerp(bh0, bh1, t), Vec3::lerp(bt0, bt1, t),
    );
    let mut candidate = make_candidate(a, b, ContactKind::WeaponWeapon, toi, closest.a, closest.b,
                                       closest.distance_sq, 0, NO_REGION);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.compatibility_sweep = Some(compatibility_segment_diagnostic(candidate.fact.key,
        NO_REGION, ah0, at0, ah1, at1, ar, bh0, bt0, bh1, bt1, br, toi)); }
    Some(candidate)
}

fn segment_shield_candidate(
    weapon: &ContactCollider, segment: ContactShape, shield: &ContactCollider, rectangle: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, radius } = segment else { unreachable!() };
    let ContactShape::Shield { previous, requested } = rectangle else { unreachable!() };
    let toi = swept_segment_rectangle(previous_hilt, previous_tip, requested_hilt, requested_tip,
                                      radius, previous, requested)?;
    let t = toi.get();
    let face = previous.map(|point| point); // array interpolation is deliberately written by corner.
    let face = [
        Vec3::lerp(face[0], requested[0], t), Vec3::lerp(face[1], requested[1], t),
        Vec3::lerp(face[2], requested[2], t), Vec3::lerp(face[3], requested[3], t),
    ];
    let closest = closest_points_segment_rectangle(
        Vec3::lerp(previous_hilt, requested_hilt, t),
        Vec3::lerp(previous_tip, requested_tip, t), face,
    );
    let mut candidate = make_candidate(weapon, shield, ContactKind::WeaponShield, toi,
                        closest.a, closest.b, closest.distance_sq, closest.feature, NO_REGION);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.compatibility_sweep = Some(ExactCompatibilitySweepDiagnostic {
        key: candidate.fact.key, region: NO_REGION,
        primitive: ExactCompatibilityPrimitiveDiagnostic::SweptSegmentRectangle,
        points_raw: [previous_hilt, previous_tip, requested_hilt, requested_tip,
                     previous[0], previous[1], previous[2], previous[3],
                     requested[0], requested[1], requested[2], requested[3]].map(point_raw),
        point_count: 12,
        radii_raw: [radius.raw(), 0], accepted_toi_raw: toi.get().raw() as u32,
    }); }
    Some(candidate)
}

/// One weapon against a whole body: sweep all five volumes and publish the one
/// the contract chooses.
///
/// Exactly one fact comes out however many regions the weapon reaches. That is
/// not a simplification, it is the identity rule: a `ContactKey` names a body
/// and not a region, so a second regional fact would be a duplicate key -- and
/// duplicate keys are what the driver's in-place sort has no total order over.
/// The region is carried on the fact instead, and the tie-break tail on
/// `BodyPart` is what makes two overlapping volumes answer the same way every
/// time rather than in scan order.
///
/// Every region is a general capsule rather than a vertical one, because two of
/// them are: an arm runs shoulder to hand and points wherever the actuator left
/// it. `swept_segment_segment` covers the vertical cases exactly -- with equal
/// endpoint displacement and a zero half-height its conservative advance is the
/// same sequence as the vertical form's -- so this is one primitive, not a
/// generalisation that costs the columns anything.
fn segment_body_candidate(
    weapon: &ContactCollider, segment: ContactShape, body: &ContactCollider, capsule: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, radius } = segment else { unreachable!() };
    let ContactShape::Body { parts, .. } = capsule else { unreachable!() };
    let mut best: Option<((i32, i32, u8), Candidate)> = None;
    for (at, part) in parts.iter().enumerate() {
        if !part.present { continue; }
        let Some(toi) = swept_segment_segment(
            previous_hilt, previous_tip, requested_hilt, requested_tip, radius,
            part.previous_lower, part.previous_upper,
            part.requested_lower, part.requested_upper, part.radius,
        ) else { continue };
        let t = toi.get();
        let lower = Vec3::lerp(part.previous_lower, part.requested_lower, t);
        let upper = Vec3::lerp(part.previous_upper, part.requested_upper, t);
        let closest = closest_points_on_segments(
            Vec3::lerp(previous_hilt, requested_hilt, t),
            Vec3::lerp(previous_tip, requested_tip, t),
            lower, upper,
        );
        // The contract's exact tuple. `medial_distance_sq` is measured from the
        // published contact point -- the midpoint `make_candidate` will build
        // from the same pair -- so the tie-break asks "which axis is this blow
        // nearest", not "which surface is nearest", and a fat region cannot
        // win a tie on its radius alone.
        let key = (t.raw(),
                   medial_distance_sq(midpoint(closest.a, closest.b), lower, upper).raw(),
                   at as u8);
        if best.as_ref().is_some_and(|(chosen, _)| *chosen <= key) { continue; }
        let mut candidate = make_candidate(weapon, body, ContactKind::WeaponBody, toi,
                                           closest.a, closest.b, closest.distance_sq, 0, at as u8);
        #[cfg(feature = "cartesian-recoil")]
        { candidate.compatibility_sweep = Some(compatibility_segment_diagnostic(
            candidate.fact.key, at as u8, previous_hilt, previous_tip,
            requested_hilt, requested_tip, radius, part.previous_lower, part.previous_upper,
            part.requested_lower, part.requested_upper, part.radius, toi)); }
        best = Some((key, candidate));
    }
    best.map(|(_, candidate)| candidate)
}

fn make_candidate(
    a: &ContactCollider, b: &ContactCollider, kind: ContactKind, toi: TimeOfImpact,
    point_a: Vec3, point_b: Vec3, distance_sq: Fx, feature: u8, region: u8,
) -> Candidate {
    let delta = point_b - point_a;
    let normal = if delta != Vec3::ZERO {
        delta.normalized_or_zero()
    } else if toi == TimeOfImpact::ZERO {
        Vec3::X
    } else {
        let relative = (a.velocity - b.velocity).normalized_or_zero();
        if relative == Vec3::ZERO { Vec3::X } else { relative }
    };
    Candidate {
        fact: ContactFact {
            key: ContactKey { a: a.entity, a_slot: a.slot, b: b.entity,
                              b_slot: if kind == ContactKind::WeaponBody { BODY_SLOT } else { b.slot }, kind },
            toi, region, point: midpoint(point_a, point_b), normal,
            velocity_a: a.velocity, velocity_b: b.velocity,
        },
        distance_sq,
        feature,
        #[cfg(feature = "cartesian-recoil")]
        wide_toi: None,
        #[cfg(feature = "cartesian-recoil")]
        compatibility_sweep: None,
    }
}

#[cfg(feature = "cartesian-recoil")]
fn point_raw(value: Vec3) -> [i32; 3] { [value.x.raw(), value.y.raw(), value.z.raw()] }

#[cfg(feature = "cartesian-recoil")]
fn compatibility_segment_diagnostic(key: ContactKey, region: u8,
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, ar: Fx,
    b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, br: Fx, toi: TimeOfImpact,
) -> ExactCompatibilitySweepDiagnostic {
    ExactCompatibilitySweepDiagnostic { key, region,
        primitive: ExactCompatibilityPrimitiveDiagnostic::SweptSegmentSegment,
        points_raw: [a0, a1, a2, a3, b0, b1, b2, b3,
                     Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO].map(point_raw),
        point_count: 8,
        radii_raw: [ar.raw(), br.raw()], accepted_toi_raw: toi.get().raw() as u32 }
}

fn midpoint(a: Vec3, b: Vec3) -> Vec3 {
    let component = |a: Fx, b: Fx| Fx::from_raw(((a.raw() as i64 + b.raw() as i64) / 2) as i32);
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

/// Map a local inclusive tick fraction onto the unconsumed global fraction.
///
/// This rounds down, and the pairing with geometry is the whole argument. The
/// conservative advance already answers with the first raw local step at which
/// the *truncated* poses touch -- measured over the collinear point family it
/// is never early, and it is `ceil` of the exact crossing whenever that
/// crossing is fractional. Rounding up a second time here put the group pose
/// one raw unit past the crossing: the recomputed normal flips, closing reads
/// zero, and a momentum chain chatters at 32769/32771/32773 instead of
/// transferring. Truncating composes with that answer and with
/// `interpolate_raw`'s truncation to land exactly on the certified contact.
/// The `max(1)` is what stops a positive local result from stalling the tick;
/// the near-end `g=65_535, u=1` vector is its proof, and the `min` keeps a
/// fully consumed tick from stepping past its own end.
pub fn map_local_to_global(global_raw: u32, local_raw: u32) -> u32 {
    debug_assert!(global_raw <= 65_536 && local_raw <= 65_536);
    if local_raw == 0 { return global_raw; }
    let remaining = 65_536u64 - global_raw as u64;
    global_raw + (remaining * local_raw as u64 / 65_536).max(1).min(remaining) as u32
}

pub(crate) fn write_fact(bytes: &mut Vec<u8>, fact: ContactFact) {
    put_u32(bytes, fact.key.a.index);
    put_u32(bytes, fact.key.a.generation);
    put_u32(bytes, fact.key.a_slot as u32);
    put_u32(bytes, fact.key.b.index);
    put_u32(bytes, fact.key.b.generation);
    put_u32(bytes, fact.key.b_slot as u32);
    put_u32(bytes, fact.key.kind as u32);
    put_u32(bytes, fact.toi.get().raw() as u32);
    put_u32(bytes, fact.region as u32);
    put_vec3(bytes, fact.point);
    put_vec3(bytes, fact.normal);
    put_vec3(bytes, fact.velocity_a);
    put_vec3(bytes, fact.velocity_b);
}

pub(crate) fn write_impulse(bytes: &mut Vec<u8>, impulse: ContactImpulse) {
    put_u32(bytes, impulse.key.a.index);
    put_u32(bytes, impulse.key.a.generation);
    put_u32(bytes, impulse.key.a_slot as u32);
    put_u32(bytes, impulse.key.b.index);
    put_u32(bytes, impulse.key.b.generation);
    put_u32(bytes, impulse.key.b_slot as u32);
    put_u32(bytes, impulse.key.kind as u32);
    put_vec3(bytes, impulse.on_a);
    put_vec3(bytes, impulse.on_b);
}

pub(crate) fn put_u32(bytes: &mut Vec<u8>, value: u32) { bytes.extend_from_slice(&value.to_le_bytes()); }
pub(crate) fn put_u64(bytes: &mut Vec<u8>, value: u64) { bytes.extend_from_slice(&value.to_le_bytes()); }
fn put_vec3(bytes: &mut Vec<u8>, value: Vec3) {
    put_u32(bytes, value.x.raw() as u32);
    put_u32(bytes, value.y.raw() as u32);
    put_u32(bytes, value.z.raw() as u32);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::spec::Material;

    fn surface() -> SurfaceSpec {
        SurfaceSpec { restitution: Fx::ZERO, friction: Fx::ZERO, edge_factor: Fx::ONE,
                      point_factor: Fx::ONE, material: Material::Steel }
    }

    fn segment(entity: u32, faction: Faction, from: Vec3, to: Vec3, velocity: Vec3) -> ContactCollider {
        ContactCollider { entity: EntityId::new(entity, 0), faction, slot: 1, mass: Fx::ONE,
            surface: surface(), velocity, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Segment { previous_hilt: from, previous_tip: from,
                                           requested_hilt: to, requested_tip: to, radius: Fx::ZERO } }
    }

    /// A body whose five regional volumes are the same point: overlapping in
    /// the strongest possible sense, so the region it answers is decided by the
    /// `BodyPart` tail of the tie-break and nothing else.
    fn coincident_body(entity: u32, faction: Faction, at: Vec3) -> ContactCollider {
        let part = RegionSweep {
            previous_lower: at, previous_upper: at, requested_lower: at, requested_upper: at,
            radius: Fx::ZERO, present: true,
        };
        ContactCollider {
            entity: EntityId::new(entity, 0), faction, slot: BODY_SLOT, mass: Fx::ONE,
            surface: surface(), velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Body {
                previous_origin: at, requested_origin: at,
                parts: [part; AnatomyRegion::COUNT],
            },
        }
    }

    fn candidate_bytes(scratch: &ContactCollectionScratch) -> Vec<u8> {
        let mut bytes = Vec::new();
        put_u32(&mut bytes, scratch.candidates.len() as u32);
        for row in &scratch.candidates {
            write_fact(&mut bytes, row.fact);
            put_u32(&mut bytes, row.distance_sq.raw() as u32);
            put_u32(&mut bytes, row.feature as u32);
        }
        bytes
    }

    fn exact_point(x: i128, y: i128) -> ExactPoint {
        ExactPoint([
            crate::combat::trajectory::ExactRational { numerator: x, denominator: 1 },
            crate::combat::trajectory::ExactRational { numerator: y, denominator: 1 },
            exact_zero(),
        ])
    }

    #[test]
    fn exact_rational_comparison_and_arithmetic_refuse_both_sides_of_the_envelope() {
        use crate::combat::trajectory::ExactRational;
        let half = ExactRational { numerator: 1, denominator: 2 };
        let two_fourths = ExactRational { numerator: 2, denominator: 4 };
        assert_eq!(exact_cmp(half, two_fourths), Ok(Ordering::Equal));
        assert_eq!(exact_add(half, ExactRational { numerator: -1, denominator: 3 }).unwrap(),
                   ExactRational { numerator: 1, denominator: 6 });
        assert_eq!(exact_mul(half, ExactRational { numerator: -6, denominator: 5 }).unwrap(),
                   ExactRational { numerator: -3, denominator: 5 });
        assert_eq!(exact_div(half, ExactRational { numerator: -3, denominator: 2 }).unwrap(),
                   ExactRational { numerator: -1, denominator: 3 });

        assert!(exact_rational(ExactRational {
            numerator: EXACT_NUMERATOR_LIMIT as i128, denominator: EXACT_DENOMINATOR_LIMIT,
        }).is_ok());
        assert_eq!(exact_rational(ExactRational {
            numerator: EXACT_NUMERATOR_LIMIT as i128 + 1, denominator: 1,
        }), Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(exact_rational(ExactRational {
            numerator: 1, denominator: EXACT_DENOMINATOR_LIMIT + 1,
        }), Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(exact_rational(ExactRational { numerator: 1, denominator: 0 }),
                   Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(exact_cmp(ExactRational { numerator: EXACT_NUMERATOR_LIMIT as i128 - 1,
                                             denominator: EXACT_DENOMINATOR_LIMIT },
                             ExactRational { numerator: EXACT_NUMERATOR_LIMIT as i128 - 1,
                                             denominator: EXACT_DENOMINATOR_LIMIT - 1 }),
                   Err(ExactScanReject::ArithmeticEnvelope),
                   "accepted inputs still refuse a comparison whose cross-product is too wide");
    }

    #[test]
    fn repeated_wide_denominators_are_reused_without_a_gcd_or_envelope_growth() {
        let denominator = 1i128 << 96;
        let term = WideRational4096::new(1, denominator).unwrap();
        let mut total = WideRational4096::zero();
        let terms = MAX_ARTICULATED_ENTITIES * AnatomyRegion::COUNT * 4 - 1;
        for _ in 0..terms {
            total = wide_add(total, term).unwrap();
        }
        assert_eq!(total.as_i128_pair(), Some((terms as i128, denominator)));
    }

    #[test]
    fn exact_frozen_segment_features_match_a_tiny_exhaustive_rational_oracle() {
        use crate::combat::trajectory::ExactRational;
        let mut scratch = ExactWideScratch::default(); scratch.try_reserve().unwrap();
        let directions = [(0, 0), (1, 0), (0, 1), (1, 1), (1, -1)];
        let mut segments = Vec::new();
        for x in -1..=1 { for y in -1..=1 { for (dx, dy) in directions {
            segments.push((exact_point(x, y), exact_point(x + dx, y + dy)));
        } } }
        let parameters = [
            ExactRational { numerator: 0, denominator: 1 },
            ExactRational { numerator: 1, denominator: 2 },
            ExactRational { numerator: 1, denominator: 1 },
        ];
        let mut seen_features = [false; 5];
        for &(a0, a1) in &segments { for &(b0, b1) in &segments {
            let exact = exact_segment_segment_at_pose(a0, a1, b0, b1).unwrap();
            let wide = wide_segment_segment_at_pose(a0, a1, b0, b1, &mut scratch).unwrap();
            assert_eq!(wide.feature, exact.feature);
            assert_eq!(wide_cmp(wide.distance_sq, wide_rational(exact.distance_sq).unwrap()),
                       Ok(Ordering::Equal));
            seen_features[exact.feature as usize] = true;
            let ad = exact_vector_sub(a1, a0).unwrap();
            let bd = exact_vector_sub(b1, b0).unwrap();
            let mut oracle: Option<ExactSegmentClosest> = None;
            for s in parameters { for t in parameters {
                let candidate = exact_segment_candidate(
                    exact_point_at(a0, ad, s).unwrap(),
                    exact_point_at(b0, bd, t).unwrap(), u8::MAX).unwrap();
                if oracle.is_none() || exact_candidate_cmp(candidate, oracle.unwrap()).unwrap()
                    == Ordering::Less { oracle = Some(candidate); }
            } }
            let oracle = oracle.unwrap();
            assert_eq!(exact_cmp(exact.distance_sq, oracle.distance_sq), Ok(Ordering::Equal),
                       "{a0:?}->{a1:?} against {b0:?}->{b1:?}");
        } }
        assert!(seen_features[0], "the exhaustive corpus never reached an interior solve");
        assert!(seen_features[1..].iter().any(|seen| *seen),
                "the exhaustive corpus never reached a boundary projection");
    }

    #[test]
    fn wide_segment_selection_is_invariant_to_common_origin_and_scale() {
        use crate::combat::trajectory::ExactRational;
        let mut scratch = ExactWideScratch::default(); scratch.try_reserve().unwrap();
        let scaled = |raw: i128, origin: i128, scale: i128| ExactRational {
            numerator: (raw + origin) * scale + 1, denominator: scale,
        };
        let point = |x, y, origin, scale| ExactPoint([
            scaled(x, origin, scale), scaled(y, -origin, scale), scaled(0, origin, scale),
        ]);
        let base = wide_segment_segment_at_pose(exact_point(-2, 0), exact_point(2, 0),
                                                 exact_point(0, -2), exact_point(0, 2),
                                                 &mut scratch).unwrap();
        let moved = wide_segment_segment_at_pose(
            point(-2, 0, 1_000_003, 1i128 << 92), point(2, 0, 1_000_003, 1i128 << 92),
            point(0, -2, 1_000_003, 1i128 << 92), point(0, 2, 1_000_003, 1i128 << 92),
            &mut scratch).unwrap();
        assert_eq!(moved.feature, base.feature);
        assert_eq!(wide_cmp(moved.distance_sq, base.distance_sq), Ok(Ordering::Equal));
    }

    #[test]
    fn exact_shield_face_edges_and_affine_rectangle_proof_are_independent() {
        let rectangle = [exact_point(-1, -1), exact_point(1, -1),
                         exact_point(1, 1), exact_point(-1, 1)];
        let face = exact_segment_rectangle_at_pose(exact_point(0, 0),
                                                    ExactPoint([exact_zero(), exact_zero(),
                                                        crate::combat::trajectory::ExactRational {
                                                            numerator: 1, denominator: 1 }]),
                                                    rectangle).unwrap();
        assert_eq!((face.feature, face.distance_sq), (0, exact_zero()));
        let edge = exact_segment_rectangle_at_pose(exact_point(2, -2), exact_point(2, 2),
                                                    rectangle).unwrap();
        assert_ne!(edge.feature, 0);
        assert_eq!(edge.distance_sq, exact_one());

        let rotated = [exact_point(1, -1), exact_point(1, 1),
                       exact_point(-1, 1), exact_point(-1, -1)];
        assert_eq!(exact_affine_rectangle_is_maintained(rectangle, rotated), Ok(true));
        let folded = [exact_point(1, 1), exact_point(-1, 1),
                      exact_point(-1, -1), exact_point(1, -1)];
        assert_eq!(exact_affine_rectangle_is_maintained(rectangle, folded), Ok(false),
                   "valid endpoint rectangles still fold through zero at mid-interval");
        let skewed = [exact_point(-1, -1), exact_point(1, -1),
                      exact_point(2, 1), exact_point(-1, 1)];
        assert_eq!(exact_affine_rectangle_is_maintained(rectangle, skewed), Ok(false));
    }

    #[test]
    fn wide_shield_face_edges_and_maintenance_survive_the_shipped_92_bit_lattice() {
        use crate::combat::trajectory::ExactRational;
        let scale = 1i128 << 92;
        let moved = |point: ExactPoint| {
            let origins = [1_000_003i128, -700_001, 300_007];
            let mut out = point;
            for axis in 0..3 {
                let raw = point.0[axis].numerator;
                out.0[axis] = ExactRational {
                    numerator: (raw + origins[axis]) * scale + 1,
                    denominator: scale,
                };
            }
            wide_point(out).unwrap()
        };
        let rectangle = [exact_point(-1, -1), exact_point(1, -1),
                         exact_point(1, 1), exact_point(-1, 1)];
        let wide_rectangle = rectangle.map(moved);
        let mut scratch = ExactWideScratch::default(); scratch.try_reserve().unwrap();
        let vertical = ExactPoint([exact_zero(), exact_zero(), exact_one()]);
        let face = wide_segment_rectangle_points(moved(exact_point(0, 0)), moved(vertical),
                                                  wide_rectangle, &mut scratch).unwrap();
        assert_eq!(face.feature, 0);
        assert_eq!(wide_cmp(face.distance_sq, WideRational4096::zero()), Ok(Ordering::Equal));

        let edge = wide_segment_rectangle_points(moved(exact_point(2, -2)),
                                                  moved(exact_point(2, 2)),
                                                  wide_rectangle, &mut scratch).unwrap();
        assert_ne!(edge.feature, 0);
        assert_eq!(wide_cmp(edge.distance_sq, WideRational4096::one()), Ok(Ordering::Equal));

        let rotated = [exact_point(1, -1), exact_point(1, 1),
                       exact_point(-1, 1), exact_point(-1, -1)].map(moved);
        assert_eq!(wide_affine_rectangle_is_maintained(wide_rectangle, rotated), Ok(true));
        let folded = [exact_point(1, 1), exact_point(-1, 1),
                      exact_point(-1, -1), exact_point(1, -1)].map(moved);
        assert_eq!(wide_affine_rectangle_is_maintained(wide_rectangle, folded), Ok(false));
        let skewed = [exact_point(-1, -1), exact_point(1, -1),
                      exact_point(2, 1), exact_point(-1, 1)].map(moved);
        assert_eq!(wide_affine_rectangle_is_maintained(wide_rectangle, skewed), Ok(false));
    }

    #[test]
    fn exact_segment_sweep_advances_by_certified_exclusion_to_the_first_raw_contact() {
        let rows = [
            segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
            segment(1, Faction::Monsters, Vec3::X, Vec3::X, Vec3::ZERO),
        ];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        exact.owners[0].common_response.momentum[0].velocity_raw = Fx::ONE.raw();
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(1).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates().len(), 1);
        assert_eq!(scratch.candidates()[0].fact.toi, TimeOfImpact::ONE);
        assert_eq!(scratch.candidates()[0].fact.velocity_a, Vec3::X,
                   "the exact response velocity is part of the published fact");
    }

    #[test]
    fn tick_rebase_preserves_absolute_fractional_endpoints_across_carry_and_cancellation() {
        let at = Vec3::new(Fx::from_raw(10), Fx::ZERO, Fx::ZERO);
        let rows = [coincident_body(0, Faction::Heroes, at),
                    segment(0, Faction::Heroes, at, at, Vec3::ZERO)];
        for (common_raw, common_quarters, held_quarters) in [(-1, 3, 3), (0, 3, -1)] {
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut owner = exact.owners[0];
            let common_den = owner.common_scale * 65_536;
            let held_den = owner.held_response[1].unwrap().affine.mass_raw as i128 * 65_536;
            owner.common_response.group_time_raw = 65_536;
            owner.common_response.at_group[0] = ExactPosition {
                raw: common_raw, remainder: common_den * common_quarters / 4,
            };
            owner.common_response.momentum[0] = ExactMomentum {
                velocity_raw: 7, remainder: 11,
            };
            let held = owner.held_response[1].as_mut().unwrap();
            held.affine.group_time_raw = 65_536;
            held.affine.at_group[0] = ExactPosition {
                raw: 0, remainder: held_den * held_quarters / 4,
            };
            held.affine.momentum[0] = ExactMomentum {
                velocity_raw: -5, remainder: 13,
            };

            let body = exact.trajectories.iter().find(|row|
                matches!(row.motor, MotorShape::Body { .. })).unwrap();
            let weapon = exact.trajectories.iter().find(|row|
                matches!(row.motor, MotorShape::Segment { .. })).unwrap();
            let MotorShape::Body { origin, .. } = body.motor else { unreachable!() };
            let MotorShape::Segment { hilt, .. } = weapon.motor else { unreachable!() };
            let old_body = wide_evaluated_point(origin, body, &owner, 65_536).unwrap();
            let old_hilt = wide_evaluated_point(hilt, weapon, &owner, 65_536).unwrap();
            let published_body = wide_point_to_vec3(old_body).unwrap();
            let published_hilt = wide_point_to_vec3(old_hilt).unwrap();
            let rebased = wide_rebase_owner_tick(&exact.trajectories, owner).unwrap();

            let next_point = |point: Vec3| ExactMotorPoint {
                at_tick_start_raw: [point.x.raw(), point.y.raw(), point.z.raw()],
                tick_delta_raw: [0; 3],
            };
            let mut next = exact.trajectories.clone();
            for row in &mut next {
                match &mut row.motor {
                    MotorShape::Body { origin, .. } => *origin = next_point(published_body),
                    MotorShape::Segment { hilt, tip, .. } => {
                        *hilt = next_point(published_hilt);
                        *tip = next_point(published_hilt);
                    }
                    MotorShape::Shield { .. } => unreachable!(),
                }
            }
            let next_body = next.iter().find(|row| matches!(row.motor, MotorShape::Body { .. }))
                .unwrap();
            let next_weapon = next.iter().find(|row|
                matches!(row.motor, MotorShape::Segment { .. })).unwrap();
            let MotorShape::Body { origin, .. } = next_body.motor else { unreachable!() };
            let MotorShape::Segment { hilt, .. } = next_weapon.motor else { unreachable!() };
            let new_body = wide_evaluated_point(origin, next_body, &rebased, 0).unwrap();
            let new_hilt = wide_evaluated_point(hilt, next_weapon, &rebased, 0).unwrap();
            for axis in 0..3 {
                assert_eq!(wide_cmp(old_body.0[axis], new_body.0[axis]), Ok(Ordering::Equal));
                assert_eq!(wide_cmp(old_hilt.0[axis], new_hilt.0[axis]), Ok(Ordering::Equal));
            }
            assert_eq!(rebased.common_response.momentum, owner.common_response.momentum);
            assert_eq!(rebased.held_response[1].unwrap().affine.momentum,
                       owner.held_response[1].unwrap().affine.momentum);
        }
    }

    #[test]
    fn maintained_shield_uses_the_exact_face_during_certified_advancement() {
        let weapon = elastic(segment(0, Faction::Heroes, Vec3::X, Vec3::X, Vec3::ZERO));
        let shield = shield_at_origin();
        let rows = [weapon, shield];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        exact.owners[0].common_response.momentum[0].velocity_raw = -Fx::ONE.raw();
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(1).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates().len(), 1);
        assert_eq!(scratch.candidates()[0].fact.key.kind, ContactKind::WeaponShield);
        assert_eq!(scratch.candidates()[0].fact.toi, TimeOfImpact::ONE);
    }

    #[test]
    fn subraw_enter_and_exit_refuses_without_mutating_published_candidates() {
        let rows = [
            segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
            segment(1, Faction::Monsters, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
        ];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        // -1/2 raw at word zero, then +1 raw per word: both adjacent
        // integer words are separate even though the points coincide between.
        let owner = &mut exact.owners[0];
        let held_mass = owner.held_response[1].unwrap().affine.mass_raw;
        owner.body_mass_raw = 65_536;
        owner.common_response.mass_raw = 65_536 + held_mass;
        owner.common_response.at_group[0].remainder =
            -(owner.common_scale * 65_536 / 2);
        let momentum = (owner.common_response.mass_raw as i64) * 65_536;
        owner.common_response.momentum[0].velocity_raw =
            (momentum / owner.common_response.mass_raw as i64) as i32;
        owner.common_response.momentum[0].remainder =
            momentum as i128 % owner.common_scale;
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(1).unwrap();
        scan_candidates_into(&rows, &mut scratch);
        let before = candidate_bytes(&scratch);
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                              &mut scratch),
                   Err(ExactScanReject::UnsupportedExactSweep));
        assert_eq!(candidate_bytes(&scratch), before);
    }

    #[test]
    fn certified_advancement_budget_refuses_by_name() {
        let mut sweeping = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        sweeping.shape = ContactShape::Segment {
            previous_hilt: Vec3::ZERO, previous_tip: Vec3::from_ints(10, 0, 0),
            requested_hilt: Vec3::ZERO, requested_tip: Vec3::from_ints(10, 128, 0),
            radius: Fx::ZERO,
        };
        let rows = [sweeping,
            segment(1, Faction::Monsters, -Vec3::X, -Vec3::X, Vec3::ZERO)];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        // Common Z is a floor constraint. Use a held-relative word instead so
        // the deliberately irrelevant motion selects the exact kernel.
        exact.owners[0].held_response[1].as_mut().unwrap().affine
            .at_group[2].raw = Fx::ONE.raw();
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(1).unwrap();
        // The production dispatcher now proves these distant swept boxes
        // disjoint before narrowphase. Call the primitive directly: this test
        // owns its certified-advancement budget, not dispatcher routing.
        assert!(matches!(wide_sweep_segments(
            &exact.trajectories[0], &exact.owners[0],
            &exact.trajectories[1], &exact.owners[1], &rows[0], &rows[1],
            &mut scratch.exact_wide), Err(ExactScanReject::Budget)));
    }

    #[test]
    fn detector_refuses_a_4096_bit_predicate_overflow_without_publishing_partial_rows() {
        let rows = [
            segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
            segment(1, Faction::Monsters, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
        ];
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(4).unwrap();
        scan_candidates_into(&rows, &mut scratch);
        let before = candidate_bytes(&scratch); let capacity = scratch.candidate_capacity();

        let mut coordinate = WideRational4096::new(i128::MAX, 1).unwrap();
        for _ in 0..5 { coordinate = wide_mul(coordinate, coordinate).unwrap(); }
        let far = WidePoint([coordinate, WideRational4096::zero(),
                             WideRational4096::zero()]);
        assert_eq!(wide_segment_candidate(
            far, WidePoint([WideRational4096::zero(); 3]), 0),
            Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(candidate_bytes(&scratch), before);
        assert_eq!(scratch.candidate_capacity(), capacity);
    }

    #[test]
    fn rotating_segment_and_nonzero_remainder_reach_the_body_region_boundary() {
        let mut weapon = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        weapon.shape = ContactShape::Segment {
            previous_hilt: Vec3::from_ints(-2, -1, 0),
            previous_tip: Vec3::from_ints(-2, 1, 0),
            requested_hilt: Vec3::from_ints(2, -2, 0),
            requested_tip: Vec3::from_ints(2, 2, 0), radius: Fx::EPSILON,
        };
        let rows = [weapon, coincident_body(1, Faction::Monsters, Vec3::ZERO)];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let scale = exact.owners[0].common_scale;
        exact.owners[0].common_response.at_group[0].remainder = scale * 65_536 / 2;
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(1).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates().len(), 1);
        assert_eq!(scratch.candidates()[0].fact.key.kind, ContactKind::WeaponBody);
        assert!(scratch.candidates()[0].fact.toi > TimeOfImpact::ZERO);
    }

    #[test]
    fn exact_body_region_ties_and_absence_use_medial_distance_then_region_order() {
        let rows = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
                    coincident_body(1, Faction::Monsters, Vec3::X * Fx::EPSILON)];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        exact.owners[0].held_response[1].as_mut().unwrap().affine.at_group[0].raw = 1;
        exact.owners[1].common_response.momentum[0].velocity_raw = 3;
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(1).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates()[0].fact.region, 0);
        assert_eq!(scratch.candidates()[0].fact.velocity_b.x.raw(), 3);

        let MotorShape::Body { ref mut parts, .. } = exact.trajectories[1].motor else { panic!() };
        parts[0].present = false;
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates()[0].fact.region, 1);
    }

    #[test]
    fn segment_body_subraw_crossing_refuses_atomically() {
        let rows = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
                    coincident_body(1, Faction::Monsters, Vec3::ZERO)];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let owner = &mut exact.owners[0];
        let held_mass = owner.held_response[1].unwrap().affine.mass_raw;
        owner.body_mass_raw = 65_536; owner.common_response.mass_raw = 65_536 + held_mass;
        owner.common_response.at_group[0].remainder =
            -(owner.common_scale * 65_536 / 2);
        owner.common_response.momentum[0].velocity_raw = 65_536;
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(5).unwrap();
        scan_candidates_into(&rows, &mut scratch); let before = candidate_bytes(&scratch);
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                              &mut scratch),
                   Err(ExactScanReject::UnsupportedExactSweep));
        assert_eq!(candidate_bytes(&scratch), before);
    }

    #[test]
    fn a_disjoint_one_word_segment_body_interval_closes_the_zero_step_proof() {
        let rows = [
            segment(0, Faction::Heroes, Vec3::Y * Fx::EPSILON,
                    Vec3::Y * Fx::EPSILON, Vec3::ZERO),
            coincident_body(1, Faction::Monsters, Vec3::ZERO),
        ];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        // The X response makes the L1 speed bound much larger than the one-raw
        // Y clearance, so certified advancement initially floors to zero. The
        // complete affine interval remains Y-disjoint and is therefore a
        // proof of absence, not the enter-and-exit refusal owned next door.
        exact.owners[0].common_response.momentum[0].velocity_raw = 100;
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(2).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scratch).unwrap();
        assert!(scratch.candidates().is_empty());
    }

    #[test]
    fn swept_aabb_rejects_far_misses_but_keeps_crossings_for_every_wide_primitive() {
        let base = Vec3::from_ints(20_000, 0, 0);
        let point = segment(0, Faction::Heroes, base, base, Vec3::ZERO);
        let far_point = segment(1, Faction::Monsters, base + Vec3::Y * Fx::TWO,
                                base + Vec3::Y * Fx::TWO, Vec3::ZERO);
        let crossing = segment(1, Faction::Monsters, base - Vec3::X, base + Vec3::X,
                               Vec3::X * Fx::TWO);
        let far_body = coincident_body(1, Faction::Monsters, base + Vec3::Y * Fx::TWO);
        let touching_body = coincident_body(1, Faction::Monsters, base);
        let translate = |point: Vec3| point + base;
        let make_shield = |offset: Vec3| {
            let face = shield_face().map(|point| translate(point) + offset);
            ContactCollider {
                entity: EntityId::new(1, 0), faction: Faction::Monsters, slot: 0,
                mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
                velocity_offset: Vec3::ZERO, present: true,
                shape: ContactShape::Shield { previous: face, requested: face },
            }
        };
        let pairs = [
            ([point, far_point], true),
            ([point, crossing], false),
            ([point, far_body], true),
            ([point, touching_body], false),
            ([point, make_shield(Vec3::Y * Fx::TWO)], true),
            ([point, make_shield(Vec3::ZERO)], false),
        ];
        for (rows, disjoint) in pairs {
            let mut exact = zero_response_compatibility(&rows).unwrap();
            // A common one-raw translation selects the wide branch without
            // changing the literal relative geometry.
            for owner in &mut exact.owners {
                owner.common_response.momentum[0].velocity_raw = 1;
            }
            assert_eq!(wide_swept_aabbs_are_disjoint(
                &exact.trajectories[0], &exact.owners[0],
                &exact.trajectories[1], &exact.owners[1]).unwrap(), disjoint);
            let mut scratch = ContactCollectionScratch::default();
            scratch.try_reserve(2).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut scratch).unwrap();
            assert_eq!(scratch.candidates().is_empty(), disjoint);
        }
    }

    #[test]
    fn sixty_four_body_high_water_skips_distant_wide_pairs_and_keeps_the_literal_hit() {
        let mut rows = Vec::new();
        rows.push(segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO));
        rows.push(segment(1, Faction::Monsters, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO));
        for entity in 2..MAX_ARTICULATED_ENTITIES as u32 {
            let at = Vec3::from_ints(100 + entity as i32 * 100,
                                     if entity % 2 == 0 { 100 } else { -100 }, 0);
            rows.push(segment(entity,
                if entity % 2 == 0 { Faction::Heroes } else { Faction::Monsters },
                at, at, Vec3::ZERO));
        }
        let mut exact = zero_response_compatibility(&rows).unwrap();
        for owner in &mut exact.owners {
            owner.common_response.momentum[0].velocity_raw = 1;
        }
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(MAX_ARTICULATED_ENTITIES).unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scratch).unwrap();
        assert!(!scratch.candidates().is_empty());
        assert!(scratch.candidates().iter().any(|row|
            row.fact.key.a.index == 0 && row.fact.key.b.index == 1));
    }

    #[test]
    fn zero_response_exact_scan_is_byte_equal_to_the_contact_corpus() {
        let moving = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::X, Vec3::X);
        let point = segment(1, Faction::Monsters, Vec3::new(Fx::HALF, Fx::ZERO, Fx::ZERO),
                            Vec3::new(Fx::HALF, Fx::ZERO, Fx::ZERO), Vec3::ZERO);
        let body = coincident_body(2, Faction::Monsters, Vec3::X);
        let shield = shield_at_origin();
        let corpora = [
            vec![],
            vec![moving, point],
            vec![moving, body],
            vec![elastic(moving), shield],
            vec![moving, ContactCollider { faction: Faction::Heroes, ..point }],
        ];
        for rows in corpora {
            let exact = zero_response_compatibility(&rows).unwrap();
            let mut legacy = ContactCollectionScratch::default();
            let mut compatible = ContactCollectionScratch::default();
            scan_candidates_into(&rows, &mut legacy);
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut compatible).unwrap();
            assert_eq!(candidate_bytes(&compatible), candidate_bytes(&legacy));
        }
    }

    #[test]
    fn non_candidate_pairs_stay_ignored_but_invalid_exact_identity_refuses_atomically() {
        let rows = [
            coincident_body(0, Faction::Heroes, Vec3::ZERO),
            coincident_body(1, Faction::Monsters,
                            Vec3::new(Fx::HALF, Fx::ZERO, Fx::ZERO)),
        ];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        let mut scratch = ContactCollectionScratch::default();
        scan_candidates_into(&rows, &mut scratch);
        let before = candidate_bytes(&scratch); let capacity = scratch.candidate_capacity();

        exact.owners[0].common_response.momentum[0].velocity_raw = 1;
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                              &mut scratch), Ok(()));
        assert_eq!(candidate_bytes(&scratch), before);
        assert_eq!(scratch.candidate_capacity(), capacity);

        exact.owners[0].common_response.momentum[0].velocity_raw = 0;
        exact.trajectories[1].entity = EntityId::new(1, 9);
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                              &mut scratch),
                   Err(ExactScanReject::CompatibilityIdentity));
        assert_eq!(candidate_bytes(&scratch), before);
        assert_eq!(scratch.candidate_capacity(), capacity);
    }

    #[test]
    fn retained_capacity_report_includes_exact_staging_and_wide_candidates() {
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(9).unwrap();
        let capacities = scratch.capacities();
        assert!(capacities[0] >= 9, "candidate rows were not reserved");
        assert!(capacities[1] >= 9, "exact staging was absent from retained capacity");
        assert!(capacities[2] >= 5, "segment candidates stayed on the call stack");
        assert!(capacities[3] >= 7, "rectangle candidates stayed on the call stack");
    }

    #[test]
    fn contact_keys_include_generation_and_have_one_total_order() {
        let mut keys = Vec::new();
        for generation in [1, 0] {
            for slot in [1, 0] {
                keys.push(ContactKey {
                    a: EntityId::new(0, generation), a_slot: slot,
                    b: EntityId::new(1, 0), b_slot: slot,
                    kind: ContactKind::WeaponWeapon,
                });
            }
        }
        keys.sort();
        assert_eq!(keys.iter().map(|k| (k.a.generation, k.a_slot)).collect::<Vec<_>>(),
                   vec![(0, 0), (0, 1), (1, 0), (1, 1)]);
    }

    #[test]
    fn global_time_mapping_does_not_commit_before_contact() {
        // Truncation alone would map a small local fraction onto no progress at
        // all and stall the tick; `max(1)` is what forbids that.
        assert_eq!(map_local_to_global(1, 1), 2);
        assert_eq!(map_local_to_global(32_768, 32_768), 49_152);
        // Zero stays zero: initial overlap is exactly the current global time.
        assert_eq!(map_local_to_global(16_384, 0), 16_384);
        // The vector that separates truncation from the rounding-up rule this
        // map used to carry. Every other case above agrees under both, so
        // without this one the test could not fail if the rounding reverted --
        // only the behavioral digest would notice, which is too far away.
        assert_eq!(map_local_to_global(32_768, 3), 32_769);
    }

    #[test]
    fn the_last_raw_local_step_collapses_to_tick_end() {
        assert_eq!(map_local_to_global(65_535, 1), 65_536);
        assert_eq!(map_local_to_global(65_536, 1), 65_536);
    }

    #[test]
    fn the_component_speed_limit_keeps_a_diagonal_inside_the_sweep_envelope() {
        // The derivation, as an assertion, because a raw literal with no round
        // meaning is exactly what a later reader tidies. Both halves matter:
        // the first is the soundness condition, the second says the constant
        // is not giving away speed it could keep.
        const LIMIT: i128 = CONTACT_COMPONENT_SPEED_LIMIT.raw() as i128;
        const ENVELOPE: i128 = 4 * 65_536;
        assert!(3 * LIMIT * LIMIT <= ENVELOPE * ENVELOPE, "a clamped diagonal leaves the envelope");
        assert!(3 * (LIMIT + 1) * (LIMIT + 1) > ENVELOPE * ENVELOPE, "the limit gives away raw units");

        // And the property itself, through the real sweep rather than through
        // a restatement of its bound. Both points travel at the clamp on all
        // three axes, which is the worst case it admits, and they start eight
        // units apart -- so the only answer other than `None` is the
        // fail-closed escape. At `Fx::from_int(4)` this returned a contact.
        let step = Vec3::new(CONTACT_COMPONENT_SPEED_LIMIT, CONTACT_COMPONENT_SPEED_LIMIT,
                             CONTACT_COMPONENT_SPEED_LIMIT);
        let a = Vec3::ZERO;
        let b = Vec3::from_ints(8, 0, 0);
        assert_eq!(
            swept_segment_segment(a, a, a + step, a + step, Fx::ZERO,
                                  b, b, b - step, b - step, Fx::ZERO),
            None,
            "a clamped diagonal fell out of the sweep envelope",
        );
    }

    #[test]
    fn allies_and_self_geometry_do_not_enter_contact_groups() {
        let same_faction = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
                            segment(1, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO)];
        assert!(collect_contacts(&same_faction).is_empty());
        let same_entity = [same_faction[0], ContactCollider { faction: Faction::Monsters, ..same_faction[0] }];
        assert!(collect_contacts(&same_entity).is_empty());
    }

    #[test]
    fn an_initially_separating_overlap_receives_no_attracting_impulse() {
        let quarter = Fx::from_ratio(1, 4);
        let rows = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::new(-quarter, Fx::ZERO, Fx::ZERO), -Vec3::X * quarter),
                    segment(1, Faction::Monsters, Vec3::ZERO, Vec3::new(quarter, Fx::ZERO, Fx::ZERO), Vec3::X * quarter)];
        let facts = collect_contacts(&rows);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].toi, TimeOfImpact::ZERO);
        assert_eq!(facts[0].normal, Vec3::X);
        let impulse = crate::combat::resolution::proposed_impulse(
            Fx::ONE, Fx::ONE, surface(), surface(), facts[0].velocity_a, facts[0].velocity_b, facts[0].normal,
        );
        assert_eq!(impulse, Vec3::ZERO);
    }

    #[test]
    fn a_positive_time_exact_crossing_uses_relative_velocity_for_its_normal() {
        let weapon = segment(0, Faction::Heroes, Vec3::X,
            Vec3::new(-Fx::ONE, Fx::ZERO, Fx::ZERO), Vec3::new(-Fx::TWO, Fx::ZERO, Fx::ZERO));
        let face = [
            Vec3::new(Fx::ZERO, -Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, Fx::HALF),
            Vec3::new(Fx::ZERO, -Fx::HALF, Fx::HALF),
        ];
        let shield = ContactCollider { entity: EntityId::new(1, 0), faction: Faction::Monsters,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let facts = collect_contacts(&[weapon, shield]);
        assert_eq!(facts.len(), 1);
        assert!(facts[0].toi > TimeOfImpact::ZERO);
        assert_eq!(facts[0].normal, -Vec3::X);
        let impulse = crate::combat::resolution::proposed_impulse(
            Fx::ONE, Fx::ONE, surface(), surface(), facts[0].velocity_a, facts[0].velocity_b, facts[0].normal,
        );
        assert!(impulse.x > Fx::ZERO);
    }

    /// A half-metre square face at the origin, front toward +X.
    fn shield_face() -> [Vec3; 4] {
        [
            Vec3::new(Fx::ZERO, -Fx::HALF, -Fx::HALF), Vec3::new(Fx::ZERO, Fx::HALF, -Fx::HALF),
            Vec3::new(Fx::ZERO, Fx::HALF, Fx::HALF), Vec3::new(Fx::ZERO, -Fx::HALF, Fx::HALF),
        ]
    }

    /// Steel on steel. The shield fixtures need it: at restitution zero an
    /// equal-mass exchange only halves the closing speed, and the block these
    /// two tests are about is the swing being stopped, not merely slowed.
    /// The half-thickness front offset is not re-proved here --
    /// `shield_front_corners_have_the_frozen_order_and_offset` owns it, and
    /// these rows take the resulting face as given.
    fn elastic(mut row: ContactCollider) -> ContactCollider {
        row.surface.restitution = Fx::ONE;
        row
    }

    fn shield_at_origin() -> ContactCollider {
        let face = shield_face();
        elastic(ContactCollider { entity: EntityId::new(2, 0), faction: Faction::Monsters,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: face, requested: face } })
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn compatibility_provenance_carries_every_input_to_each_production_primitive() {
        let weapon = elastic(segment(0, Faction::Heroes, Vec3::X, -Vec3::X,
                                     -Vec3::X * Fx::TWO));
        let shield = shield_at_origin();
        let shield_candidate = candidate(&weapon, &shield).expect("the fixture crosses the shield");
        let diagnostic = shield_candidate.compatibility_sweep
            .expect("the compatibility branch must publish its primitive inputs");
        let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt,
                                    requested_tip, .. } = weapon.shape else { unreachable!() };
        let ContactShape::Shield { previous, requested } = shield.shape else { unreachable!() };
        let expected = [previous_hilt, previous_tip, requested_hilt, requested_tip,
                        previous[0], previous[1], previous[2], previous[3],
                        requested[0], requested[1], requested[2], requested[3]].map(point_raw);
        assert_eq!(diagnostic.primitive,
                   ExactCompatibilityPrimitiveDiagnostic::SweptSegmentRectangle);
        assert_eq!(diagnostic.point_count, 12);
        assert_eq!(diagnostic.points_raw, expected);

        let other = elastic(segment(1, Faction::Monsters, -Vec3::X, Vec3::X,
                                    Vec3::X * Fx::TWO));
        let segment_candidate = candidate(&weapon, &other)
            .expect("the fixture's two segments cross");
        let segment_diagnostic = segment_candidate.compatibility_sweep
            .expect("the compatibility branch must publish its primitive inputs");
        assert_eq!(segment_diagnostic.primitive,
                   ExactCompatibilityPrimitiveDiagnostic::SweptSegmentSegment);
        assert_eq!(segment_diagnostic.point_count, 8);
        assert_eq!(segment_diagnostic.points_raw[8..], [[0; 3]; 4]);
    }

    /// Drive rows through the production driver; report the resolutions and
    /// every row's final X velocity.
    fn solve(mut rows: Vec<ContactCollider>) -> (Vec<ContactResolution>, Vec<Fx>) {
        use crate::combat::resolution::{
            solve_contact_tick, ContactTickScratch, IndependentPointProjector,
        };
        let high_water = rows.len();
        let pairs = if high_water < 2 { 0 } else { high_water * (high_water - 1) / 2 };
        let mut state = ContactSolverState::default();
        let mut resolutions = Vec::new();
        let mut scratch = ContactTickScratch::default();
        scratch.reserve(high_water * 3, pairs * 16);
        solve_contact_tick(&mut rows, &mut IndependentPointProjector, &mut state,
                           &mut resolutions, &mut scratch).unwrap();
        (resolutions, rows.iter().map(|row| row.velocity.x).collect())
    }

    #[test]
    fn a_body_facing_shield_blocks_only_its_surface() {
        let hit = elastic(segment(0, Faction::Heroes, Vec3::X, -Vec3::X, -Vec3::X * Fx::TWO));
        let miss = elastic(segment(1, Faction::Heroes,
            Vec3::new(Fx::ONE, Fx::from_ratio(3, 4), Fx::ZERO),
            Vec3::new(-Fx::ONE, Fx::from_ratio(3, 4), Fx::ZERO), -Vec3::X * Fx::TWO));
        let rows = [hit, miss, shield_at_origin()];

        let facts = collect_contacts(&rows);
        // The swing that passed outside the face has neither fact nor impulse.
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].key.a.index, 0);
        assert_eq!(facts[0].key.kind, ContactKind::WeaponShield);

        let (resolutions, velocities) = solve(rows.to_vec());
        assert_eq!(resolutions.len(), 1);
        assert!(resolutions[0].impulse.on_a.x > Fx::ZERO);
        assert!(velocities[0] >= Fx::ZERO, "the blocked swing is stopped or reflected");
        assert_eq!(velocities[1], -Fx::TWO, "the swing that missed kept its speed");
    }

    #[test]
    fn a_low_shield_does_not_cover_a_high_contact() {
        // The same face and the same two swings, offset in Z instead of Y. A
        // rectangle bounded in one axis and unbounded in the other would pass
        // this test's sibling and fail this one.
        let low = elastic(segment(0, Faction::Heroes, Vec3::X, -Vec3::X, -Vec3::X * Fx::TWO));
        let high = elastic(segment(1, Faction::Heroes,
            Vec3::new(Fx::ONE, Fx::ZERO, Fx::from_ratio(3, 4)),
            Vec3::new(-Fx::ONE, Fx::ZERO, Fx::from_ratio(3, 4)), -Vec3::X * Fx::TWO));
        let rows = [low, high, shield_at_origin()];

        let facts = collect_contacts(&rows);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].key.a.index, 0);
        assert_eq!(facts[0].key.kind, ContactKind::WeaponShield);
        assert!(facts[0].toi > TimeOfImpact::ZERO);

        let (resolutions, velocities) = solve(rows.to_vec());
        assert_eq!(resolutions.len(), 1);
        assert!(resolutions[0].impulse.on_a.x > Fx::ZERO);
        assert!(velocities[0] >= Fx::ZERO, "the blocked swing is stopped or reflected");
        assert_eq!(velocities[1], -Fx::TWO, "the swing over the rim kept its speed");
    }

    /// A fighter standing still at the origin, arms tucked, as five swept
    /// volumes that do not move across the tick.
    fn standing_fighter(entity: u32) -> ContactCollider {
        use crate::combat::{actuator, geometry, spec};
        let anatomy = spec::fighter_anatomy();
        let reach = Fx::from_raw(actuator::ARM_MIN_REACH_RAW);
        let hands = [0usize, 1].map(|limb| actuator::hand_position(
            &anatomy, fx::Angle::ZERO, limb, fx::Angle::ZERO, crate::CombatHeight::MID, reach));
        let volumes = geometry::body_region_volumes(
            Vec3::ZERO, &anatomy, fx::Angle::ZERO, hands, [true; AnatomyRegion::COUNT]);
        let parts = core::array::from_fn(|at| RegionSweep {
            previous_lower: volumes[at].lower, previous_upper: volumes[at].upper,
            requested_lower: volumes[at].lower, requested_upper: volumes[at].upper,
            radius: volumes[at].radius, present: volumes[at].present,
        });
        ContactCollider {
            entity: EntityId::new(entity, 0), faction: Faction::Monsters, slot: BODY_SLOT,
            mass: Fx::from_int(3), surface: surface(), velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Body {
                previous_origin: Vec3::ZERO, requested_origin: Vec3::ZERO, parts,
            },
        }
    }

    /// A zero-length weapon point driven in along -X at one height.
    fn thrust_at_height(z: Fx) -> ContactCollider {
        let from = Vec3::new(Fx::from_ratio(3, 2), Fx::ZERO, z);
        let to = Vec3::new(Fx::from_ratio(-3, 2), Fx::ZERO, z);
        segment(0, Faction::Heroes, from, to, to - from)
    }

    #[test]
    fn high_low_and_intermediate_contacts_choose_stable_regions() {
        // Chosen against the Fighter fixture's own numbers: the head sphere
        // spans 1.5..1.9 but the torso capsule's upper cap reaches 1.85, so a
        // head-only strike has to be above that, not merely above the torso's
        // medial top. The reverse mistake -- reading the medial extent as the
        // volume -- is exactly what a per-region sweep is for.
        let cases = [
            (Fx::from_ratio(187, 100), AnatomyRegion::Head),
            (Fx::from_ratio(11, 10), AnatomyRegion::Torso),
            (Fx::from_ratio(1, 5), AnatomyRegion::Legs),
        ];
        for (height, expected) in cases {
            let facts = collect_contacts(&[thrust_at_height(height), standing_fighter(1)]);
            assert_eq!(facts.len(), 1, "a body published more than one fact at z={}", height.raw());
            assert_eq!(facts[0].key.kind, ContactKind::WeaponBody);
            assert_eq!(facts[0].key.b_slot, BODY_SLOT);
            assert_eq!(facts[0].region, expected as u8,
                       "a strike at z={} chose region {}", height.raw(), facts[0].region);
        }
    }

    #[test]
    fn overlapping_regions_use_axis_distance_then_body_part_order() {
        // Five volumes at one point. Every sweep answers the same time and the
        // same medial distance, so only the `BodyPart` tail is left -- and it
        // has to answer Head every time rather than whichever row the scan
        // happened to visit first.
        let weapon = segment(0, Faction::Heroes, Vec3::from_ints(1, 0, 0), -Vec3::X, -Vec3::X * Fx::TWO);
        let facts = collect_contacts(&[weapon, coincident_body(1, Faction::Monsters, Vec3::ZERO)]);
        assert_eq!(facts.len(), 1, "coincident regions produced duplicate contact keys");
        assert_eq!(facts[0].region, AnatomyRegion::Head as u8);

        // And the middle term, isolated. Two half-radius spheres, one centred
        // on the weapon and one a little above it, both already containing it
        // at tick start -- so both answer time zero and the tuple has to fall
        // through to the medial distance. The nearer axis is the *higher*
        // `BodyPart`, which is what stops this being a second test of the tail.
        let sphere = |z: Fx| RegionSweep {
            previous_lower: Vec3::new(Fx::ZERO, Fx::ZERO, z),
            previous_upper: Vec3::new(Fx::ZERO, Fx::ZERO, z),
            requested_lower: Vec3::new(Fx::ZERO, Fx::ZERO, z),
            requested_upper: Vec3::new(Fx::ZERO, Fx::ZERO, z),
            radius: Fx::HALF, present: true,
        };
        let absent = RegionSweep { present: false, ..sphere(Fx::ZERO) };
        let parts = [absent, sphere(Fx::from_ratio(2, 5)), sphere(Fx::ZERO), absent, absent];
        let body = ContactCollider {
            shape: ContactShape::Body {
                previous_origin: Vec3::ZERO, requested_origin: Vec3::ZERO, parts,
            },
            ..coincident_body(1, Faction::Monsters, Vec3::ZERO)
        };
        let weapon = segment(0, Faction::Heroes, Vec3::ZERO, -Vec3::X, -Vec3::X);
        let ContactShape::Segment { previous_hilt, previous_tip, requested_hilt, requested_tip, radius }
            = weapon.shape else { unreachable!() };
        let toi_of = |part: RegionSweep| swept_segment_segment(
            previous_hilt, previous_tip, requested_hilt, requested_tip, radius,
            part.previous_lower, part.previous_upper,
            part.requested_lower, part.requested_upper, part.radius);
        assert_eq!((toi_of(parts[1]), toi_of(parts[2])),
                   (Some(TimeOfImpact::ZERO), Some(TimeOfImpact::ZERO)),
                   "the fixture no longer ties on time, so it cannot test the medial term");

        let facts = collect_contacts(&[weapon, body]);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].region, AnatomyRegion::LeftArm as u8,
                   "the nearer medial axis lost to the lower BodyPart");
    }

    #[test]
    fn a_severed_region_has_no_volume_left_to_hit() {
        let mut fighter = standing_fighter(1);
        let ContactShape::Body { parts, .. } = &mut fighter.shape else { unreachable!() };
        // The Fighter's tucked hands sit at mid height, so an arm covers the
        // band the torso's own cap would otherwise own; taking the torso away
        // is the clean way to prove absence rather than mere preference.
        parts[AnatomyRegion::Torso as usize].present = false;
        let facts = collect_contacts(&[thrust_at_height(Fx::from_ratio(11, 10)), fighter]);
        assert_eq!(facts.len(), 1);
        assert_ne!(facts[0].region, AnatomyRegion::Torso as u8,
                   "an absent region still answered a sweep");

        // Absent everywhere is no fact at all, not a degenerate point one.
        let mut gone = standing_fighter(1);
        let ContactShape::Body { parts, .. } = &mut gone.shape else { unreachable!() };
        for part in parts.iter_mut() { part.present = false; }
        assert!(collect_contacts(&[thrust_at_height(Fx::from_ratio(11, 10)), gone]).is_empty());

        // And a whole collider marked absent leaves the scan entirely, which is
        // how a severed limb's weapon stops swinging inside the same tick.
        let mut dropped = thrust_at_height(Fx::from_ratio(11, 10));
        dropped.present = false;
        assert!(collect_contacts(&[dropped, standing_fighter(1)]).is_empty());
    }
}
