//! Stable contact evidence and ordering for articulated combat.
//!
//! Collection owns geometry, but resolution owns no geometry at all: this file
//! is the narrow byte-stable handoff between the two.  Keeping the rows plain
//! also lets replay, wasm, and the mechanical proof inspect the same result.

use crate::{EntityId, Faction};
use crate::combat::spec::{SurfaceSpec, BODY_VOLUME_COUNT};
// Anatomy is a fixture vocabulary here and nowhere else: production code in this
// file names swept volumes, and the day it names a region again is the day this
// import stops being test-only.
#[cfg(test)]
use crate::combat::spec::AnatomyRegion;
#[cfg(feature = "cartesian-recoil")]
use crate::combat::spec::EquipmentSpecId;
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
#[cfg(all(test, feature = "cartesian-recoil"))]
use core::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::wide::{checked_cmp_positive_into, PositiveRationalCmpWork};
#[cfg(any(test, feature = "cartesian-recoil"))]
use crate::combat::wide::{WideRational4096, WideRationalCopy};

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

/// The volume byte a fact that is not against a body carries. Weapon/weapon and
/// weapon/shield have no body to name, and `0xff` is outside every
/// [`BODY_VOLUME_COUNT`] index rather than aliasing one of them.
///
/// **Named for the volume rather than the region, which is the narrower and now
/// the true statement.** It was `NO_REGION` while the two numberings were the
/// same list; a fact carries the swept volume the solver chose, and
/// [`crate::volume_region`] is what turns that into anatomy.
pub const NO_VOLUME: u8 = 0xff;

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
pub enum ContactKind {
    WeaponWeapon = 0, WeaponShield = 1, WeaponBody = 2, ProjectileBody = 3,
}

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

/// The exact pair whose ordinary scan branch returned the tick's first error.
/// Diagnostic only: copied from the already-running pair loop before its
/// `Err` is propagated, never consulted by contact selection or resolution.
#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactScanPairRejectionDiagnostic {
    pub a_index: usize, pub b_index: usize,
    pub a_entity: EntityId, pub b_entity: EntityId,
    pub a_slot: u8, pub b_slot: u8,
    pub a_shape: ExactScanShapeDiagnostic, pub b_shape: ExactScanShapeDiagnostic,
    pub a_present: bool, pub b_present: bool,
    pub a_owner: usize, pub b_owner: usize,
    pub group_time_raw: u32,
    pub aabb_supported: bool, pub aabb_disjoint: Option<bool>,
    pub branch: ExactScanBranchDiagnostic,
    pub reject: ExactScanRejectDiagnostic,
    pub segment_body: Option<ExactSegmentBodyProgressDiagnostic>,
}

/// One opt-in segment/body pair to observe during the next exact contact tick.
/// Diagnostic only: matching this value never changes pair membership or ordering.
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyDiagnosticTarget {
    pub key: crate::combat::resolution::ExactContactKeyDiagnostic,
    pub a_index: usize, pub b_index: usize,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactSegmentBodyOrientationDiagnostic { SegmentBody, BodySegment }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactSegmentBodyPairResultDiagnostic {
    PairAabbDisjoint, Candidate, NoCandidate, Reject(ExactScanRejectDiagnostic),
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactSegmentBodyRegionTerminalDiagnostic {
    AabbDisjoint, ProvedSeparate, Candidate, Reject(ExactScanRejectDiagnostic),
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyRegionDiagnostic {
    pub region: u8, pub aabb_disjoint: Option<bool>,
    pub speed: Option<(i128, i128)>,
    pub visit_start: usize, pub visit_count: u8,
    pub terminal: ExactSegmentBodyRegionTerminalDiagnostic,
    pub accepted_time_raw: Option<u32>, pub accepted_feature: Option<u8>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyVisitDiagnostic {
    pub region: u8, pub ordinal: u8, pub time_raw: u32,
    pub safe_step_raw: Option<u32>,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactWideWordDiagnostic {
    pub negative: bool, pub used: u8, pub limbs: [u32; 128],
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactWideRationalDiagnostic {
    pub numerator: ExactWideWordDiagnostic,
    pub denominator: ExactWideWordDiagnostic,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbSideDiagnostic { A, B }

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbPointSourceDiagnostic {
    SegmentHilt, SegmentTip, BodyLower, BodyUpper,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbEndpointDiagnostic { Start, End }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPairAabbPointDiagnostic {
    pub side: ExactPairAabbSideDiagnostic, pub ordinal: u8,
    pub source: ExactPairAabbPointSourceDiagnostic, pub region: Option<u8>,
    pub endpoint: ExactPairAabbEndpointDiagnostic,
    pub coordinate: [ExactWideRationalDiagnostic; 3],
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbAxisDiagnostic { X, Y, Z }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbComparisonDiagnostic { Less, Equal, Greater }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPairAabbBoundRowDiagnostic {
    pub axis: ExactPairAabbAxisDiagnostic,
    pub left_min: ExactWideRationalDiagnostic, pub left_max: ExactWideRationalDiagnostic,
    pub right_min: ExactWideRationalDiagnostic, pub right_max: ExactWideRationalDiagnostic,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPairAabbGapRowDiagnostic {
    pub axis: ExactPairAabbAxisDiagnostic,
    pub right_gap: ExactWideRationalDiagnostic,
    pub right_comparison: ExactPairAabbComparisonDiagnostic,
    pub left_gap: Option<ExactWideRationalDiagnostic>,
    pub left_comparison: Option<ExactPairAabbComparisonDiagnostic>,
    pub disjoint: bool,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbTerminalDiagnostic {
    Overlap, Disjoint, Reject(ExactScanRejectDiagnostic),
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPairAabbRecorderInvalidDiagnostic {
    Capacity, Cardinality, Lifecycle, Overflow, WordCopy,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXEventRoleDiagnostic { OperandCandidate, DerivedWitness, Terminal }

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXEventScopeDiagnostic { Motor, Common, Combine, Held, Final }

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXEventFieldDiagnostic {
    StartRaw, DeltaRaw, StepNumerator, Value, Scale, AtGroupRaw,
    AtGroupRemainder, RemainderDenominator, VelocityRaw, ScaledVelocity,
    MomentumRemainder, Momentum, TravelTimeRaw, TravelNumerator,
    TravelDenominator, MassRaw, Terminal,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXEventStageDiagnostic {
    Input, Cast, Subtract, CheckedProduct, CheckedAdd, RationalStart,
    RationalStep, RationalPosition, RationalRemainder, RationalTravel,
    AddStartStep, AddPositionRemainder, AddTravel, AddMotorCommon,
    AddAfterCommonHeld, Terminal,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXEventAtomDiagnostic {
    I32(i32), U32(u32), I128(i128), Wide(ExactWideRationalDiagnostic),
    TerminalSuccess, TerminalReject(ExactScanRejectDiagnostic),
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPointXEventDiagnostic {
    pub ordinal: u8, pub role: ExactPointXEventRoleDiagnostic,
    pub scope: ExactPointXEventScopeDiagnostic,
    pub field: ExactPointXEventFieldDiagnostic,
    pub stage: ExactPointXEventStageDiagnostic,
    pub atom: ExactPointXEventAtomDiagnostic,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPointXAdmissionDiagnostic {
    pub side: ExactPairAabbSideDiagnostic, pub ordinal: u8,
    pub source: ExactPairAabbPointSourceDiagnostic, pub region: Option<u8>,
    pub endpoint: ExactPairAabbEndpointDiagnostic, pub axis: ExactPairAabbAxisDiagnostic,
    pub row_entity: EntityId, pub row_slot: u8, pub owner_index: usize,
    pub held_index: usize, pub held_slot: u8, pub held_spec: EquipmentSpecId,
    pub time_raw: u32, pub common_group_time_raw: u32, pub held_group_time_raw: u32,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactPointXRecorderInvalidDiagnostic {
    Capacity, Cardinality, Lifecycle, Overflow, WordCopy,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentHiltStartXDiagnostic<'a> {
    pub admission: ExactPointXAdmissionDiagnostic,
    pub events: &'a [ExactPointXEventDiagnostic],
    pub recorder_invalid: Option<ExactPointXRecorderInvalidDiagnostic>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentHiltStartXTargetDiagnostic<'a> {
    pub target: ExactSegmentBodyDiagnosticTarget, pub encounter_count: u32,
    pub pair: Option<ExactSegmentBodyPairDiagnostic<'a>>,
    pub point_x: Option<ExactSegmentHiltStartXDiagnostic<'a>>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactPairAabbDiagnostic<'a> {
    pub start_raw: u32, pub end_raw: u32,
    pub a_radius_raw: Option<i32>, pub b_radius_raw: Option<i32>,
    pub combined_radius: Option<ExactWideRationalDiagnostic>,
    pub terminal: ExactPairAabbTerminalDiagnostic,
    pub recorder_invalid: Option<ExactPairAabbRecorderInvalidDiagnostic>,
    pub points: &'a [ExactPairAabbPointDiagnostic],
    pub bounds: &'a [ExactPairAabbBoundRowDiagnostic],
    pub gaps: &'a [ExactPairAabbGapRowDiagnostic],
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyPairDiagnostic<'a> {
    pub a_entity: EntityId, pub b_entity: EntityId,
    pub a_slot: u8, pub b_slot: u8,
    pub a_owner: usize, pub b_owner: usize,
    pub a_shape: ExactScanShapeDiagnostic, pub b_shape: ExactScanShapeDiagnostic,
    pub kind: ContactKind, pub orientation: ExactSegmentBodyOrientationDiagnostic,
    pub group_time_raw: u32,
    pub pair_aabb_supported: bool, pub pair_aabb_disjoint: Option<bool>,
    pub result: ExactSegmentBodyPairResultDiagnostic,
    pub regions: &'a [ExactSegmentBodyRegionDiagnostic],
    pub visits: &'a [ExactSegmentBodyVisitDiagnostic],
    pub pair_aabb: Option<ExactPairAabbDiagnostic<'a>>,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyTargetDiagnostic<'a> {
    pub target: ExactSegmentBodyDiagnosticTarget,
    pub encounter_count: u32,
    pub pair: Option<ExactSegmentBodyPairDiagnostic<'a>>,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactSegmentBodyProgressDiagnostic {
    pub region: u8, pub visit: u8, pub time_raw: u32,
    pub speed: Option<(i128, i128)>,
    pub closest_a: [Option<(i128, i128)>; 3],
    pub closest_b: [Option<(i128, i128)>; 3],
    pub closest_feature: u8,
    pub distance_sq: Option<(i128, i128)>,
    pub radius: Option<(i128, i128)>, pub radius_sq: Option<(i128, i128)>,
    pub separation: Option<(i128, i128)>, pub l1_delta: Option<(i128, i128)>,
    pub safe_denominator: Option<(i128, i128)>,
    pub safe_quotient: Option<(i128, i128)>,
    pub floor_step: u32, pub applied_advance: u32,
    pub adjacent_time_raw: u32,
    pub adjacent_distance_sq: Option<(i128, i128)>,
    pub adjacent_radius: Option<(i128, i128)>,
    pub adjacent_radius_sq: Option<(i128, i128)>,
    pub current_separated: bool, pub adjacent_separated: bool,
    pub interval_aabb_disjoint: bool,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactScanShapeDiagnostic { Body, Segment, Shield, Projectile }

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactScanBranchDiagnostic {
    SweptAabb, SegmentSegment, SegmentShield, SegmentBody, ProjectileBody,
}


#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactScanRejectDiagnostic {
    ArithmeticEnvelope, Budget, CompatibilityIdentity, Trajectory,
    UnsupportedExactSweep,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ContactFact {
    pub key: ContactKey,
    pub toi: TimeOfImpact,
    /// The **swept volume** the selection tuple chose, in `0..BODY_VOLUME_COUNT`,
    /// or [`NO_VOLUME`] for a fact with no body on either side.
    ///
    /// **Not a region, and the name is the whole safety argument.** It was
    /// `region` while a body presented exactly one volume per anatomy region, so
    /// every reader that wanted anatomy could index a five-wide array with it and
    /// be right by coincidence. A jointed arm presents two volumes for one
    /// region, so `5` and `6` are now legal values that `BodyPart::from_index`
    /// answers `None` for -- and a reader that kept the old spelling would drop a
    /// forearm wound in silence rather than fail. [`crate::volume_region`] is the
    /// one bridge; there is no other correct way to turn this byte into anatomy.
    pub volume: u8,
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
    /// Blunt energy, and the third column that wounds. `pressure_raw` is what
    /// is left after all three, and still wounds nothing.
    pub crush_raw: u64,
    pub pressure_raw: u64,
    pub deflected_raw: u64,
    pub severed: bool,
}

/// One swept volume's capsule for the whole tick.
///
/// [`BODY_VOLUME_COUNT`] of these are a body, and that is seven rather than five
/// because a jointed arm is two capsules answering for one region. They are
/// absolute rather than body-relative because four of them -- the arms and the
/// forearms -- are not rigid against the origin, so there is no one offset that
/// could carry them.
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
    Projectile {
        previous: Vec3, requested: Vec3, radius: Fx,
        /// A plate whose sweep clipped this row. Its own body is occluded even
        /// where the arm capsule overlaps the plate's deliberately thin proxy.
        shielded_body: EntityId,
    },
    Segment {
        previous_hilt: Vec3, previous_tip: Vec3,
        requested_hilt: Vec3, requested_tip: Vec3,
        radius: Fx,
    },
    Shield { previous: [Vec3; 4], requested: [Vec3; 4] },
    /// A body is its [`BODY_VOLUME_COUNT`] swept volumes plus the planar origin
    /// they were built from. The origin is carried rather than recovered from a
    /// volume, because the commit needs the body's own settled point and every
    /// volume is offset from it by something the spec chose.
    ///
    /// The list is seven wide on every body, including the single-link ones
    /// whose last two rows are always absent. A width that varied by model would
    /// have to be a `Vec` in a `Copy` row the solver keeps on the stack, and
    /// every loop over it would have to ask which model it was looking at; two
    /// absent rows cost two skipped presence tests and nothing else.
    Body {
        previous_origin: Vec3,
        requested_origin: Vec3,
        parts: [RegionSweep; BODY_VOLUME_COUNT],
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
    wide_medial: Option<WideRational4096>,
    #[cfg(feature = "cartesian-recoil")]
    pub(crate) compatibility_sweep: Option<ExactCompatibilitySweepDiagnostic>,
}
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct CertifiedSelection { time_raw: u32, key: ContactKey, region: u8,
                            medial: WideRational4096 }
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct CertifiedProvenance { key: ContactKey, time_raw: u32,
                             wide_toi: ExactWideToiDiagnostic,
                             compatibility_sweep: Option<ExactCompatibilitySweepDiagnostic> }

#[cfg(feature = "cartesian-recoil")]
const EXACT_SEGMENT_BODY_VISIT_CAP: usize = BODY_VOLUME_COUNT * 96;
#[cfg(feature = "cartesian-recoil")]
const EXACT_PAIR_AABB_POINT_CAP: usize = BODY_VOLUME_COUNT * 4 + 4;
#[cfg(feature = "cartesian-recoil")]
const EXACT_PAIR_AABB_AXIS_CAP: usize = 3;
#[cfg(feature = "cartesian-recoil")]
const EXACT_POINT_X_EVENT_CAP: usize = 42;
#[cfg(all(test, feature = "cartesian-recoil"))]
static EXACT_DIAGNOSTIC_MUTATION_RECEIPT: AtomicU64 = AtomicU64::new(1);

// This opt-in recorder lives only in reusable contact scratch. It cannot enter
// authoritative state, replay, selection, or resolution; every registered pin
// therefore has a movement budget of zero for this diagnostic stage.

#[cfg(all(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum ExactSegmentBodyTestMutation {
    #[default]
    None,
    RetainAcrossTick,
    DropVisit,
    SwapVisits,
    DuplicateEncounter,
    RefuseCapacity,
    RouteRecorderIntoResult,
    ClearActiveOnRequest,
    RefuseOccupiedActive,
    AllowSecondPending,
    PendingReplacesActive,
    RetainOldActiveDespitePending,
    AabbRecorderCapacity,
    RouteAabbRecorderIntoResult,
    PointXRecorderCapacity,
    RoutePointXRecorderIntoResult,
    PointXCorruptEvent(u8),
    PointXDropEvent,
    PointXSwapEvents,
    PointXWrongAdmission,
    PointXRejectMotorGuard,
    PointXRejectCommonScale,
    PointXRejectCommonDescending,
    PointXRejectHeldScale,
    PointXRejectHeldDescending,
    PointXRejectFinalAdd,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq)]
enum ExactTargetMode { SegmentBody, PairAabb, SegmentHiltStartX }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Default)]
struct ExactPointXState {
    admission: Option<ExactPointXAdmissionDiagnostic>,
    events: Vec<ExactPointXEventDiagnostic>,
    recorder_invalid: Option<ExactPointXRecorderInvalidDiagnostic>,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactPointXState {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.events, EXACT_POINT_X_EVENT_CAP)
    }

    fn clear(&mut self) {
        self.admission = None; self.events.clear(); self.recorder_invalid = None;
    }

    fn diagnostic(&self) -> Option<ExactSegmentHiltStartXDiagnostic<'_>> {
        Some(ExactSegmentHiltStartXDiagnostic { admission: self.admission?,
            events: &self.events, recorder_invalid: self.recorder_invalid })
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Default)]
struct ExactPairAabbState {
    start_raw: u32, end_raw: u32,
    a_radius_raw: Option<i32>, b_radius_raw: Option<i32>,
    combined_radius: Option<ExactWideRationalDiagnostic>,
    terminal: Option<ExactPairAabbTerminalDiagnostic>,
    recorder_invalid: Option<ExactPairAabbRecorderInvalidDiagnostic>,
    points: Vec<ExactPairAabbPointDiagnostic>,
    bounds: Vec<ExactPairAabbBoundRowDiagnostic>,
    gaps: Vec<ExactPairAabbGapRowDiagnostic>,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactPairAabbState {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.points, EXACT_PAIR_AABB_POINT_CAP)?;
        try_reserve_exact(&mut self.bounds, EXACT_PAIR_AABB_AXIS_CAP)?;
        try_reserve_exact(&mut self.gaps, EXACT_PAIR_AABB_AXIS_CAP)
    }

    fn clear(&mut self) {
        self.start_raw = 0; self.end_raw = 0;
        self.a_radius_raw = None; self.b_radius_raw = None;
        self.combined_radius = None; self.terminal = None; self.recorder_invalid = None;
        self.points.clear(); self.bounds.clear(); self.gaps.clear();
    }

    fn diagnostic(&self) -> Option<ExactPairAabbDiagnostic<'_>> {
        Some(ExactPairAabbDiagnostic { start_raw: self.start_raw, end_raw: self.end_raw,
            a_radius_raw: self.a_radius_raw, b_radius_raw: self.b_radius_raw,
            combined_radius: self.combined_radius, terminal: self.terminal?,
            recorder_invalid: self.recorder_invalid, points: &self.points,
            bounds: &self.bounds, gaps: &self.gaps })
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_wide_rational_diagnostic(value: WideRational4096) -> ExactWideRationalDiagnostic {
    let WideRationalCopy { numerator, denominator } = value.copy_words();
    ExactWideRationalDiagnostic {
        numerator: ExactWideWordDiagnostic { negative: numerator.negative,
            used: numerator.used, limbs: numerator.limbs },
        denominator: ExactWideWordDiagnostic { negative: denominator.negative,
            used: denominator.used, limbs: denominator.limbs },
    }
}

#[cfg(feature = "cartesian-recoil")]
struct ExactPointXRecorder<'a> {
    state: &'a mut ExactPointXState,
    #[cfg(test)] test_mutation: ExactSegmentBodyTestMutation,
    #[cfg(test)] test_mutation_receipt: u64,
    #[cfg(test)] test_mutation_fired: &'a mut u64,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactPointXRecorder<'_> {
    fn invalidate(&mut self, invalid: ExactPointXRecorderInvalidDiagnostic) {
        if self.state.recorder_invalid.is_none() { self.state.recorder_invalid = Some(invalid); }
    }

    #[allow(unused_mut)]
    fn begin(&mut self, mut admission: ExactPointXAdmissionDiagnostic) {
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::PointXWrongAdmission {
            *self.test_mutation_fired = self.test_mutation_receipt;
            admission.axis = ExactPairAabbAxisDiagnostic::Y;
        }
        if self.state.admission.replace(admission).is_some() || !self.state.events.is_empty() {
            self.invalidate(ExactPointXRecorderInvalidDiagnostic::Lifecycle);
        }
    }

    fn event(&mut self, role: ExactPointXEventRoleDiagnostic,
             scope: ExactPointXEventScopeDiagnostic, field: ExactPointXEventFieldDiagnostic,
             stage: ExactPointXEventStageDiagnostic, atom: ExactPointXEventAtomDiagnostic) {
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::PointXRecorderCapacity {
            *self.test_mutation_fired = self.test_mutation_receipt;
            self.invalidate(ExactPointXRecorderInvalidDiagnostic::Capacity); return
        }
        if self.state.events.len() >= EXACT_POINT_X_EVENT_CAP {
            self.invalidate(ExactPointXRecorderInvalidDiagnostic::Capacity); return
        }
        let Ok(ordinal) = u8::try_from(self.state.events.len()) else {
            self.invalidate(ExactPointXRecorderInvalidDiagnostic::Overflow); return
        };
        let derived_role = if stage == ExactPointXEventStageDiagnostic::Terminal {
            ExactPointXEventRoleDiagnostic::Terminal
        } else if matches!(ordinal, 0 | 2 | 6 | 7 | 9 | 12 | 14 | 23 | 25 | 27 | 30 | 32) {
            ExactPointXEventRoleDiagnostic::OperandCandidate
        } else { ExactPointXEventRoleDiagnostic::DerivedWitness };
        if role != derived_role {
            self.invalidate(ExactPointXRecorderInvalidDiagnostic::Cardinality);
        }
        self.state.events.push(ExactPointXEventDiagnostic {
            ordinal, role: derived_role, scope, field, stage, atom,
        });
    }

    fn terminal(&mut self, result: &Result<WideRational4096, ExactScanReject>) {
        self.event(ExactPointXEventRoleDiagnostic::Terminal,
            ExactPointXEventScopeDiagnostic::Final, ExactPointXEventFieldDiagnostic::Terminal,
            ExactPointXEventStageDiagnostic::Terminal, match result {
                Ok(_) => ExactPointXEventAtomDiagnostic::TerminalSuccess,
                Err(reject) => ExactPointXEventAtomDiagnostic::TerminalReject(
                    scan_reject_diagnostic(*reject)),
            });
        #[cfg(test)]
        match self.test_mutation {
            ExactSegmentBodyTestMutation::PointXCorruptEvent(at) => {
                if let Some(row) = self.state.events.get_mut(at as usize) {
                    *self.test_mutation_fired = self.test_mutation_receipt;
                    row.atom = match row.atom {
                        ExactPointXEventAtomDiagnostic::I32(value) =>
                            ExactPointXEventAtomDiagnostic::I32(value.wrapping_add(1)),
                        ExactPointXEventAtomDiagnostic::U32(value) =>
                            ExactPointXEventAtomDiagnostic::U32(value.wrapping_add(1)),
                        ExactPointXEventAtomDiagnostic::I128(value) =>
                            ExactPointXEventAtomDiagnostic::I128(value.wrapping_add(1)),
                        ExactPointXEventAtomDiagnostic::Wide(mut value) => {
                            value.numerator.negative = !value.numerator.negative;
                            ExactPointXEventAtomDiagnostic::Wide(value)
                        }
                        terminal => terminal,
                    };
                }
            }
            ExactSegmentBodyTestMutation::PointXDropEvent => {
                if self.state.events.len() > 1 {
                    *self.test_mutation_fired = self.test_mutation_receipt;
                    self.state.events.remove(1);
                }
            }
            ExactSegmentBodyTestMutation::PointXSwapEvents => {
                if self.state.events.len() > 2 {
                    *self.test_mutation_fired = self.test_mutation_receipt;
                    self.state.events.swap(1, 2);
                }
            }
            _ => {}
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
struct ExactPairAabbRecorder<'a> {
    state: &'a mut ExactPairAabbState,
    point_x: Option<ExactPointXRecorder<'a>>,
    #[cfg(test)]
    test_mutation: ExactSegmentBodyTestMutation,
    #[cfg(test)]
    test_mutation_receipt: u64,
    #[cfg(test)]
    test_mutation_fired: &'a mut u64,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactPairAabbRecorder<'_> {
    fn invalidate(&mut self, invalid: ExactPairAabbRecorderInvalidDiagnostic) {
        if self.state.recorder_invalid.is_none() { self.state.recorder_invalid = Some(invalid); }
    }

    fn begin(&mut self, start_raw: u32, end_raw: u32) {
        self.state.start_raw = start_raw; self.state.end_raw = end_raw;
    }

    fn point(&mut self, side: ExactPairAabbSideDiagnostic,
             source: ExactPairAabbPointSourceDiagnostic, region: Option<u8>,
             endpoint: ExactPairAabbEndpointDiagnostic, point: WidePoint) {
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::AabbRecorderCapacity {
            *self.test_mutation_fired = self.test_mutation_receipt;
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Capacity); return
        }
        if self.state.points.len() >= EXACT_PAIR_AABB_POINT_CAP {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Capacity); return
        }
        let ordinal = self.state.points.iter().filter(|row| row.side == side).count();
        let Ok(ordinal) = u8::try_from(ordinal) else {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Overflow); return
        };
        self.state.points.push(ExactPairAabbPointDiagnostic { side, ordinal, source, region,
            endpoint, coordinate: point.0.map(exact_wide_rational_diagnostic) });
    }

    fn radius(&mut self, side: ExactPairAabbSideDiagnostic, radius_raw: i32) {
        match side {
            ExactPairAabbSideDiagnostic::A => self.state.a_radius_raw = Some(radius_raw),
            ExactPairAabbSideDiagnostic::B => self.state.b_radius_raw = Some(radius_raw),
        }
    }

    fn bounds(&mut self, left_min: [WideRational4096; 3], left_max: [WideRational4096; 3],
              right_min: [WideRational4096; 3], right_max: [WideRational4096; 3]) {
        for axis in 0..3 {
            if self.state.bounds.len() >= EXACT_PAIR_AABB_AXIS_CAP {
                self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Capacity); return
            }
            self.state.bounds.push(ExactPairAabbBoundRowDiagnostic {
                axis: exact_pair_aabb_axis(axis),
                left_min: exact_wide_rational_diagnostic(left_min[axis]),
                left_max: exact_wide_rational_diagnostic(left_max[axis]),
                right_min: exact_wide_rational_diagnostic(right_min[axis]),
                right_max: exact_wide_rational_diagnostic(right_max[axis]),
            });
        }
    }

    fn combined_radius(&mut self, radius: WideRational4096) {
        self.state.combined_radius = Some(exact_wide_rational_diagnostic(radius));
    }

    fn gap(&mut self, axis: usize, right_gap: WideRational4096,
           right_comparison: Ordering, left: Option<(WideRational4096, Ordering)>,
           disjoint: bool) {
        if self.state.gaps.len() >= EXACT_PAIR_AABB_AXIS_CAP {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Capacity); return
        }
        self.state.gaps.push(ExactPairAabbGapRowDiagnostic { axis: exact_pair_aabb_axis(axis),
            right_gap: exact_wide_rational_diagnostic(right_gap),
            right_comparison: exact_pair_aabb_comparison(right_comparison),
            left_gap: left.map(|row| exact_wide_rational_diagnostic(row.0)),
            left_comparison: left.map(|row| exact_pair_aabb_comparison(row.1)), disjoint });
    }

    fn finish_left_gap(&mut self, axis: usize, left_gap: WideRational4096,
                       left_comparison: Ordering, disjoint: bool) {
        let Some(row) = self.state.gaps.last_mut() else {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Lifecycle); return
        };
        if row.axis != exact_pair_aabb_axis(axis) || row.left_gap.is_some() {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Lifecycle); return
        }
        row.left_gap = Some(exact_wide_rational_diagnostic(left_gap));
        row.left_comparison = Some(exact_pair_aabb_comparison(left_comparison));
        row.disjoint = disjoint;
    }

    fn terminal(&mut self, terminal: ExactPairAabbTerminalDiagnostic) {
        if self.state.terminal.replace(terminal).is_some() {
            self.invalidate(ExactPairAabbRecorderInvalidDiagnostic::Lifecycle);
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn exact_pair_aabb_axis(axis: usize) -> ExactPairAabbAxisDiagnostic {
    [ExactPairAabbAxisDiagnostic::X, ExactPairAabbAxisDiagnostic::Y,
     ExactPairAabbAxisDiagnostic::Z][axis]
}

#[cfg(feature = "cartesian-recoil")]
fn exact_pair_aabb_comparison(order: Ordering) -> ExactPairAabbComparisonDiagnostic {
    match order { Ordering::Less => ExactPairAabbComparisonDiagnostic::Less,
        Ordering::Equal => ExactPairAabbComparisonDiagnostic::Equal,
        Ordering::Greater => ExactPairAabbComparisonDiagnostic::Greater }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone)]
struct ExactSegmentBodyPairHeader {
    a_entity: EntityId, b_entity: EntityId, a_slot: u8, b_slot: u8,
    a_owner: usize, b_owner: usize,
    a_shape: ExactScanShapeDiagnostic, b_shape: ExactScanShapeDiagnostic,
    kind: ContactKind, orientation: ExactSegmentBodyOrientationDiagnostic,
    group_time_raw: u32, pair_aabb_supported: bool,
    pair_aabb_disjoint: Option<bool>, result: ExactSegmentBodyPairResultDiagnostic,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Default)]
struct ExactSegmentBodyTargetState {
    requested_mode: Option<ExactTargetMode>,
    requested_target: Option<ExactSegmentBodyDiagnosticTarget>,
    active_mode: Option<ExactTargetMode>,
    active_target: Option<ExactSegmentBodyDiagnosticTarget>,
    encounter_count: u32,
    pair: Option<ExactSegmentBodyPairHeader>,
    regions: Vec<ExactSegmentBodyRegionDiagnostic>,
    visits: Vec<ExactSegmentBodyVisitDiagnostic>,
    pair_aabb: ExactPairAabbState,
    point_x: ExactPointXState,
    invalid: bool,
    #[cfg(test)]
    test_mutation: ExactSegmentBodyTestMutation,
    #[cfg(test)]
    test_mutation_receipt: u64,
    #[cfg(test)]
    test_mutation_fired: u64,
    #[cfg(test)]
    point_x_test_mutation_fired: u64,
}

#[cfg(feature = "cartesian-recoil")]
impl Clone for ExactSegmentBodyTargetState {
    fn clone(&self) -> Self {
        let mut cloned = Self {
            requested_mode: self.requested_mode, requested_target: self.requested_target,
            active_mode: self.active_mode, active_target: self.active_target,
            encounter_count: self.encounter_count, pair: self.pair.clone(),
            regions: self.regions.clone(), visits: self.visits.clone(),
            pair_aabb: self.pair_aabb.clone(), point_x: self.point_x.clone(),
            invalid: self.invalid,
            #[cfg(test)]
            test_mutation: self.test_mutation,
            #[cfg(test)]
            test_mutation_receipt: self.test_mutation_receipt,
            #[cfg(test)]
            test_mutation_fired: self.test_mutation_fired,
            #[cfg(test)]
            point_x_test_mutation_fired: self.point_x_test_mutation_fired,
        };
        cloned.try_reserve().expect("cloning already-reserved diagnostic scratch");
        cloned
    }
}

#[cfg(feature = "cartesian-recoil")]
impl ExactSegmentBodyTargetState {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.regions, BODY_VOLUME_COUNT)?;
        try_reserve_exact(&mut self.visits, EXACT_SEGMENT_BODY_VISIT_CAP)?;
        self.pair_aabb.try_reserve()?; self.point_x.try_reserve()
    }

    fn request(&mut self, mode: ExactTargetMode,
               target: ExactSegmentBodyDiagnosticTarget) -> bool {
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::RefuseCapacity {
            self.test_mutation_fired = self.test_mutation_receipt; return false
        }
        #[cfg(test)]
        if self.active_mode.is_some()
            && self.test_mutation == ExactSegmentBodyTestMutation::RefuseOccupiedActive {
            self.test_mutation_fired = self.test_mutation_receipt; return false
        }
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::ClearActiveOnRequest {
            self.test_mutation_fired = self.test_mutation_receipt;
            self.active_mode = None; self.active_target = None;
        }
        let occupied = self.requested_mode.is_some();
        #[cfg(test)]
        let occupied = if occupied
            && self.test_mutation == ExactSegmentBodyTestMutation::AllowSecondPending {
            self.test_mutation_fired = self.test_mutation_receipt; false
        } else { occupied };
        if occupied || self.regions.capacity() < BODY_VOLUME_COUNT
            || self.visits.capacity() < EXACT_SEGMENT_BODY_VISIT_CAP
            || self.pair_aabb.points.capacity() < EXACT_PAIR_AABB_POINT_CAP
            || self.pair_aabb.bounds.capacity() < EXACT_PAIR_AABB_AXIS_CAP
            || self.pair_aabb.gaps.capacity() < EXACT_PAIR_AABB_AXIS_CAP
            || self.point_x.events.capacity() < EXACT_POINT_X_EVENT_CAP { return false; }
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::PendingReplacesActive {
            self.test_mutation_fired = self.test_mutation_receipt;
            self.active_mode = Some(mode); self.active_target = Some(target);
        }
        self.requested_mode = Some(mode); self.requested_target = Some(target); true
    }

    fn begin_tick(&mut self) {
        #[cfg(test)]
        if self.requested_mode.is_none()
            && self.test_mutation == ExactSegmentBodyTestMutation::RetainAcrossTick {
            self.test_mutation_fired = self.test_mutation_receipt; return
        }
        #[cfg(test)]
        if self.requested_mode.is_some()
            && self.test_mutation == ExactSegmentBodyTestMutation::RetainOldActiveDespitePending {
            self.test_mutation_fired = self.test_mutation_receipt;
            self.requested_mode = None; self.requested_target = None; return
        }
        self.active_mode = self.requested_mode.take();
        self.active_target = self.requested_target.take();
        self.encounter_count = 0; self.pair = None;
        self.regions.clear(); self.visits.clear(); self.pair_aabb.clear(); self.point_x.clear();
        self.invalid = false;
    }

    #[cfg(test)]
    fn set_test_mutation(&mut self, mutation: ExactSegmentBodyTestMutation) {
        self.test_mutation = mutation;
        self.test_mutation_receipt = EXACT_DIAGNOSTIC_MUTATION_RECEIPT
            .fetch_add(1, AtomicOrdering::Relaxed);
        self.test_mutation_fired = 0; self.point_x_test_mutation_fired = 0;
    }

    fn diagnostic(&self, mode: ExactTargetMode) -> Option<ExactSegmentBodyTargetDiagnostic<'_>> {
        if self.active_mode != Some(mode) { return None }
        let target = self.active_target?;
        let ranges_valid = self.regions.iter().all(|row|
            row.visit_start.checked_add(row.visit_count as usize)
                .is_some_and(|end| end <= self.visits.len()));
        let pair = (!self.invalid && ranges_valid).then_some(()).and(self.pair.as_ref())
            .map(|header| ExactSegmentBodyPairDiagnostic {
            a_entity: header.a_entity, b_entity: header.b_entity,
            a_slot: header.a_slot, b_slot: header.b_slot,
            a_owner: header.a_owner, b_owner: header.b_owner,
            a_shape: header.a_shape, b_shape: header.b_shape,
            kind: header.kind, orientation: header.orientation,
            group_time_raw: header.group_time_raw,
            pair_aabb_supported: header.pair_aabb_supported,
            pair_aabb_disjoint: header.pair_aabb_disjoint,
            result: header.result, regions: &self.regions, visits: &self.visits,
            pair_aabb: (mode != ExactTargetMode::SegmentBody)
                .then(|| self.pair_aabb.diagnostic()).flatten(),
        });
        Some(ExactSegmentBodyTargetDiagnostic { target, encounter_count: self.encounter_count,
                                                pair })
    }

    fn point_x_diagnostic(&self) -> Option<ExactSegmentHiltStartXTargetDiagnostic<'_>> {
        if self.active_mode != Some(ExactTargetMode::SegmentHiltStartX) { return None }
        let containing = self.diagnostic(ExactTargetMode::SegmentHiltStartX)?;
        Some(ExactSegmentHiltStartXTargetDiagnostic { target: containing.target,
            encounter_count: containing.encounter_count, pair: containing.pair,
            point_x: self.point_x.diagnostic() })
    }
}

#[cfg(feature = "cartesian-recoil")]
struct ExactSegmentBodyTargetRows<'a> {
    regions: &'a mut Vec<ExactSegmentBodyRegionDiagnostic>,
    visits: &'a mut Vec<ExactSegmentBodyVisitDiagnostic>,
    invalid: &'a mut bool,
    #[cfg(test)]
    test_mutation: ExactSegmentBodyTestMutation,
    #[cfg(test)]
    test_mutation_receipt: u64,
    #[cfg(test)]
    test_mutation_fired: &'a mut u64,
}

#[cfg(feature = "cartesian-recoil")]
impl ExactSegmentBodyTargetRows<'_> {
    fn push_region(&mut self, row: ExactSegmentBodyRegionDiagnostic) -> Option<usize> {
        if self.regions.len() == BODY_VOLUME_COUNT { *self.invalid = true; return None }
        let at = self.regions.len(); self.regions.push(row); Some(at)
    }

    fn push_visit(&mut self, row: ExactSegmentBodyVisitDiagnostic) -> Option<usize> {
        #[cfg(test)]
        if self.test_mutation == ExactSegmentBodyTestMutation::DropVisit
            && self.visits.len() == 8 {
            *self.test_mutation_fired = self.test_mutation_receipt; return None
        }
        if self.visits.len() == EXACT_SEGMENT_BODY_VISIT_CAP {
            *self.invalid = true; return None
        }
        let at = self.visits.len(); self.visits.push(row); Some(at)
    }
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
    #[cfg(feature = "cartesian-recoil")]
    certified_selections: Vec<CertifiedSelection>,
    #[cfg(feature = "cartesian-recoil")]
    certified_provenance: Vec<CertifiedProvenance>,
    #[cfg(any(test, feature = "cartesian-recoil"))]
    exact_wide: ExactWideScratch,
    #[cfg(feature = "cartesian-recoil")]
    first_pair_rejection: Option<ExactScanPairRejectionDiagnostic>,
    #[cfg(feature = "cartesian-recoil")]
    segment_body_target: ExactSegmentBodyTargetState,
}

impl ContactCollectionScratch {
    pub fn try_reserve(&mut self, candidate_bound: usize) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.candidates, candidate_bound)?;
        #[cfg(any(test, feature = "cartesian-recoil"))]
        try_reserve_exact(&mut self.exact_staging, candidate_bound)?;
        #[cfg(feature = "cartesian-recoil")]
        { try_reserve_exact(&mut self.certified_selections, candidate_bound)?;
          try_reserve_exact(&mut self.certified_provenance, candidate_bound)?;
          self.segment_body_target.try_reserve()?; }
        #[cfg(any(test, feature = "cartesian-recoil"))]
        self.exact_wide.try_reserve()?;
        Ok(())
    }

    pub(crate) fn candidates(&self) -> &[Candidate] { &self.candidates }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn first_pair_rejection(&self) -> Option<ExactScanPairRejectionDiagnostic> {
        self.first_pair_rejection
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn request_segment_body_target(&mut self,
        target: ExactSegmentBodyDiagnosticTarget) -> bool
    { self.segment_body_target.request(ExactTargetMode::SegmentBody, target) }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn request_segment_body_pair_aabb_target(&mut self,
        target: ExactSegmentBodyDiagnosticTarget) -> bool
    { self.segment_body_target.request(ExactTargetMode::PairAabb, target) }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn request_segment_hilt_start_x_target(&mut self,
        target: ExactSegmentBodyDiagnosticTarget) -> bool
    { self.segment_body_target.request(ExactTargetMode::SegmentHiltStartX, target) }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn begin_segment_body_target_tick(&mut self) {
        self.segment_body_target.begin_tick();
    }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn segment_body_target_diagnostic(&self)
        -> Option<ExactSegmentBodyTargetDiagnostic<'_>>
    { self.segment_body_target.diagnostic(ExactTargetMode::SegmentBody) }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn segment_body_pair_aabb_diagnostic(&self)
        -> Option<ExactSegmentBodyTargetDiagnostic<'_>>
    { self.segment_body_target.diagnostic(ExactTargetMode::PairAabb) }

    #[cfg(feature = "cartesian-recoil")]
    pub(crate) fn segment_hilt_start_x_diagnostic(&self)
        -> Option<ExactSegmentHiltStartXTargetDiagnostic<'_>>
    { self.segment_body_target.point_x_diagnostic() }

    #[cfg(all(test, feature = "cartesian-recoil"))]
    pub(crate) fn set_segment_body_test_mutation(&mut self,
        mutation: ExactSegmentBodyTestMutation) {
        self.segment_body_target.set_test_mutation(mutation);
    }

    #[cfg(all(test, feature = "cartesian-recoil"))]
    pub(crate) fn segment_body_test_mutation_fired(&self) -> bool {
        self.segment_body_target.test_mutation_receipt != 0
            && (self.segment_body_target.test_mutation_fired
                    == self.segment_body_target.test_mutation_receipt
                || self.segment_body_target.point_x_test_mutation_fired
                    == self.segment_body_target.test_mutation_receipt)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn begin_segment_body_target_pair(&mut self, i: usize, j: usize,
        a: &ExactContactTrajectory, owner_a: &ExactOwnerTrajectory,
        b: &ExactContactTrajectory) -> bool
    {
        let Some((key, orientation)) = segment_body_target_key(a, b) else { return false };
        let Some(target) = self.segment_body_target.active_target else { return false };
        if target.a_index != i || target.b_index != j
            || target.key.a != key.a || target.key.a_slot != key.a_slot
            || target.key.b != key.b || target.key.b_slot != key.b_slot
            || target.key.kind != key.kind { return false }
        let Some(count) = self.segment_body_target.encounter_count.checked_add(1) else {
            self.segment_body_target.invalid = true; return false
        };
        self.segment_body_target.encounter_count = count;
        if count != 1 {
            #[cfg(test)]
            if self.segment_body_target.test_mutation
                == ExactSegmentBodyTestMutation::DuplicateEncounter {
                self.segment_body_target.test_mutation_fired =
                    self.segment_body_target.test_mutation_receipt;
            } else { return false }
            #[cfg(not(test))]
            return false
        }
        self.segment_body_target.pair = Some(ExactSegmentBodyPairHeader {
            a_entity: a.entity, b_entity: b.entity, a_slot: a.slot, b_slot: b.slot,
            a_owner: a.owner_index, b_owner: b.owner_index,
            a_shape: scan_shape_diagnostic(&a.motor), b_shape: scan_shape_diagnostic(&b.motor),
            kind: ContactKind::WeaponBody, orientation,
            group_time_raw: owner_a.common_response.group_time_raw,
            pair_aabb_supported: false, pair_aabb_disjoint: None,
            result: ExactSegmentBodyPairResultDiagnostic::NoCandidate,
        });
        true
    }

    #[cfg(feature = "cartesian-recoil")]
    fn finish_segment_body_target_pair(&mut self, claimed: bool, supported: bool,
        disjoint: Option<bool>, result: ExactSegmentBodyPairResultDiagnostic)
    {
        if !claimed { return }
        let header = self.segment_body_target.pair.as_mut()
            .expect("the first target encounter owns its header");
        header.pair_aabb_supported = supported;
        header.pair_aabb_disjoint = disjoint;
        header.result = result;
        #[cfg(test)]
        if self.segment_body_target.test_mutation == ExactSegmentBodyTestMutation::SwapVisits
            && self.segment_body_target.visits.len() > 8 {
            self.segment_body_target.visits.swap(7, 8);
            self.segment_body_target.test_mutation_fired =
                self.segment_body_target.test_mutation_receipt;
        }
    }


    #[cfg(test)]
    pub(crate) fn candidate_capacity(&self) -> usize { self.candidates.capacity() }

    #[cfg(all(test, feature = "cartesian-recoil"))]
    pub(crate) fn capacities(&self) -> Vec<usize> {
        vec![self.candidates.capacity(), self.exact_staging.capacity(),
             self.certified_selections.capacity(), self.certified_provenance.capacity(),
             self.exact_wide.segment.arithmetic.capacity(),
             self.exact_wide.segment.scalar.capacity(),
             self.exact_wide.segment.point.capacity(),
             self.exact_wide.segment.vector.capacity(),
             self.exact_wide.segment.candidate.capacity(),
             self.exact_wide.segment.committed.capacity(),
             self.exact_wide.rectangle_candidates.capacity(),
             self.exact_wide.aabb_left.capacity(), self.exact_wide.aabb_right.capacity(),
             self.exact_wide.segment_body_separation.nodes.capacity(),
             self.exact_wide.segment_body_separation.points.capacity(),
             self.exact_wide.segment_body_separation.corners.capacity(),
             self.exact_wide.segment_body_separation.axes.capacity(),
             self.exact_wide.segment_body_separation.scalar.capacity(),
             self.segment_body_target.regions.capacity(),
             self.segment_body_target.visits.capacity(),
             self.segment_body_target.pair_aabb.points.capacity(),
             self.segment_body_target.pair_aabb.bounds.capacity(),
             self.segment_body_target.pair_aabb.gaps.capacity(),
             self.segment_body_target.point_x.events.capacity()]
    }

    #[cfg(all(test, not(feature = "cartesian-recoil")))]
    pub(crate) fn capacities(&self) -> Vec<usize> {
        vec![self.candidates.capacity(), self.exact_staging.capacity(),
             self.exact_wide.segment.arithmetic.capacity(),
             self.exact_wide.segment.scalar.capacity(),
             self.exact_wide.segment.point.capacity(),
             self.exact_wide.segment.vector.capacity(),
             self.exact_wide.segment.candidate.capacity(),
             self.exact_wide.segment.committed.capacity(),
             self.exact_wide.rectangle_candidates.capacity(),
             self.exact_wide.aabb_left.capacity(), self.exact_wide.aabb_right.capacity()]
    }
}

#[cfg(feature = "cartesian-recoil")]
fn segment_body_target_key(a: &ExactContactTrajectory, b: &ExactContactTrajectory)
    -> Option<(ContactKey, ExactSegmentBodyOrientationDiagnostic)>
{
    match (&a.motor, &b.motor) {
        (MotorShape::Segment { .. }, MotorShape::Body { .. }) => Some((ContactKey {
            a: a.entity, a_slot: a.slot, b: b.entity, b_slot: BODY_SLOT,
            kind: ContactKind::WeaponBody,
        }, ExactSegmentBodyOrientationDiagnostic::SegmentBody)),
        (MotorShape::Body { .. }, MotorShape::Segment { .. }) => Some((ContactKey {
            a: b.entity, a_slot: b.slot, b: a.entity, b_slot: BODY_SLOT,
            kind: ContactKind::WeaponBody,
        }, ExactSegmentBodyOrientationDiagnostic::BodySegment)),
        _ => None,
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
/// Everything here is comfortable at the ceiling -- 64 entities and 32
/// projectile rows make 2,016 entity pairs, 34,304 candidates and 224
/// colliders -- so none of these `checked_`
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
    let candidate_bound = pairs.checked_mul(16).ok_or(ContactCapacityError::CandidateCount)?
        .checked_add(high_water.checked_mul(crate::rules::MAX_SHOTS)
            .ok_or(ContactCapacityError::CandidateCount)?)
        .ok_or(ContactCapacityError::CandidateCount)?;
    let collider_bound = high_water.checked_mul(3).ok_or(ContactCapacityError::ColliderCount)?
        .checked_add(crate::rules::MAX_SHOTS).ok_or(ContactCapacityError::ColliderCount)?;

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
                    key: candidate.fact.key, region: candidate.fact.volume,
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
            #[cfg(feature = "cartesian-recoil")]
            { scratch.first_pair_rejection = None; }
            #[cfg(not(feature = "cartesian-recoil"))]
            {
                let nonzero = preflight_exact_compatibility(trajectories, owners, colliders)?;
                if !nonzero {
                    scan_compatibility_candidates_into(colliders, scratch);
                    return Ok(());
                }
            }
            #[cfg(feature = "cartesian-recoil")]
            preflight_exact_compatibility(trajectories, owners, colliders)?;
            #[cfg(feature = "cartesian-recoil")]
            {
                let pairs = trajectories.len().checked_mul(trajectories.len().saturating_sub(1))
                    .and_then(|value| value.checked_div(2))
                    .ok_or(ExactScanReject::CompatibilityIdentity)?;
                if scratch.candidates.capacity() < pairs || scratch.exact_staging.capacity() < pairs
                    || scratch.certified_selections.capacity() < pairs
                    || scratch.certified_provenance.capacity() < pairs
                    || scratch.exact_wide.segment.arithmetic.len() != SEGMENT_ARITHMETIC_CAP
                    || scratch.exact_wide.segment.scalar.len() != SEGMENT_SCALAR_CAP
                    || scratch.exact_wide.segment.point.len() != SEGMENT_POINT_CAP
                    || scratch.exact_wide.segment.vector.len() != SEGMENT_VECTOR_CAP
                    || scratch.exact_wide.segment.candidate.len() != SEGMENT_CANDIDATE_CAP
                    || scratch.exact_wide.segment.committed.len() != 1
                    || scratch.exact_wide.rectangle_candidates.capacity() < 7
                    || scratch.exact_wide.aabb_left.capacity() < BODY_VOLUME_COUNT * 4
                    || scratch.exact_wide.aabb_right.capacity() < BODY_VOLUME_COUNT * 4 {
                    return Err(ExactScanReject::CompatibilityIdentity);
                }
                scratch.certified_selections.clear();
                scratch.certified_provenance.clear();
                // This scan contributes optional diagnostic history only.
                // Exact trajectory pairs below own membership and ordering:
                // an accepted response can create a later contact absent from
                // this rounded compatibility witness set.
                scan_compatibility_candidates_into(colliders, scratch);
            }
            scratch.exact_staging.clear();
            for i in 0..trajectories.len() { for j in i + 1..trajectories.len() {
                let a = &trajectories[i]; let b = &trajectories[j];
                if !a.present || !b.present || a.entity == b.entity || a.faction == b.faction {
                    continue;
                }
                let shield_occludes_pair = match (&a.motor, &b.motor) {
                    (MotorShape::Projectile { .. }, MotorShape::Body { .. }) =>
                        matches!(colliders[i].shape,
                            ContactShape::Projectile { shielded_body, .. }
                                if shielded_body == b.entity),
                    (MotorShape::Body { .. }, MotorShape::Projectile { .. }) =>
                        matches!(colliders[j].shape,
                            ContactShape::Projectile { shielded_body, .. }
                                if shielded_body == a.entity),
                    _ => false,
                };
                if shield_occludes_pair { continue; }
                let owner_a = owners.get(a.owner_index)
                    .ok_or(ExactScanReject::CompatibilityIdentity)?;
                let owner_b = owners.get(b.owner_index)
                    .ok_or(ExactScanReject::CompatibilityIdentity)?;
                #[cfg(feature = "cartesian-recoil")]
                let target_claimed = scratch.begin_segment_body_target_pair(i, j, a, owner_a, b);
                // Every supported primitive is affine between the current
                // group boundary and the tick end. Its endpoint AABB is
                // therefore an exact enclosure of the whole swept volume.
                // Rejecting disjoint boxes here is more than an optimization:
                // distant high-water pairs must not spend the fixed wide
                // predicate envelope merely to prove what their first-order
                // bounds already prove.
                let aabb_supported = exact_pair_has_swept_aabb(a, b);
                let aabb_disjoint = if aabb_supported {
                    #[cfg(feature = "cartesian-recoil")]
                    let active_mode = scratch.segment_body_target.active_mode;
                    #[cfg(feature = "cartesian-recoil")]
                    let mut aabb_recorder = (target_claimed
                        && active_mode != Some(ExactTargetMode::SegmentBody)).then(|| {
                        let target = &mut scratch.segment_body_target;
                        ExactPairAabbRecorder {
                            state: &mut target.pair_aabb,
                            point_x: (active_mode == Some(ExactTargetMode::SegmentHiltStartX))
                                .then(|| ExactPointXRecorder { state: &mut target.point_x,
                                    #[cfg(test)] test_mutation: target.test_mutation,
                                    #[cfg(test)] test_mutation_receipt: target.test_mutation_receipt,
                                    #[cfg(test)] test_mutation_fired:
                                        &mut target.point_x_test_mutation_fired }),
                            #[cfg(test)] test_mutation: target.test_mutation,
                            #[cfg(test)] test_mutation_receipt: target.test_mutation_receipt,
                            #[cfg(test)] test_mutation_fired: &mut target.test_mutation_fired,
                        }
                    });
                    #[allow(unused_mut)]
                    let mut aabb_result = wide_swept_aabbs_are_disjoint(
                        a, owner_a, b, owner_b, &mut scratch.exact_wide,
                        #[cfg(feature = "cartesian-recoil")] aabb_recorder.as_mut(),
                    );
                    #[cfg(all(test, feature = "cartesian-recoil"))]
                    { drop(aabb_recorder);
                      if target_claimed && scratch.segment_body_target.test_mutation
                          == ExactSegmentBodyTestMutation::RouteAabbRecorderIntoResult {
                          scratch.segment_body_target.test_mutation_fired =
                              scratch.segment_body_target.test_mutation_receipt;
                          aabb_result = Err(ExactScanReject::CompatibilityIdentity);
                      } else if target_claimed && scratch.segment_body_target.test_mutation
                          == ExactSegmentBodyTestMutation::RoutePointXRecorderIntoResult {
                          scratch.segment_body_target.point_x_test_mutation_fired =
                              scratch.segment_body_target.test_mutation_receipt;
                          aabb_result = Err(ExactScanReject::CompatibilityIdentity);
                      } }
                    match aabb_result {
                        Ok(disjoint) => Some(disjoint),
                        Err(reject) => {
                            #[cfg(feature = "cartesian-recoil")]
                            { scratch.finish_segment_body_target_pair(target_claimed,
                                aabb_supported, None,
                                ExactSegmentBodyPairResultDiagnostic::Reject(
                                    scan_reject_diagnostic(reject)));
                              scratch.first_pair_rejection = Some(ExactScanPairRejectionDiagnostic {
                                a_index: i, b_index: j, a_entity: a.entity, b_entity: b.entity,
                                a_slot: a.slot, b_slot: b.slot,
                                a_shape: scan_shape_diagnostic(&a.motor),
                                b_shape: scan_shape_diagnostic(&b.motor),
                                a_present: a.present, b_present: b.present,
                                a_owner: a.owner_index, b_owner: b.owner_index,
                                group_time_raw: owner_a.common_response.group_time_raw,
                                aabb_supported, aabb_disjoint: None,
                                branch: ExactScanBranchDiagnostic::SweptAabb,
                                reject: scan_reject_diagnostic(reject),
                                segment_body: None,
                            }); }
                            return Err(reject);
                        }
                    }
                } else { None };
                if aabb_disjoint == Some(true) {
                    #[cfg(feature = "cartesian-recoil")]
                    scratch.finish_segment_body_target_pair(target_claimed, aabb_supported,
                        aabb_disjoint, ExactSegmentBodyPairResultDiagnostic::PairAabbDisjoint);
                    continue;
                }
                let (branch, candidate) = match (&a.motor, &b.motor) {
                    (MotorShape::Projectile { .. }, MotorShape::Body { .. }) =>
                        (ExactScanBranchDiagnostic::ProjectileBody,
                        wide_sweep_segment_body(a, owner_a, b, owner_b,
                                                &colliders[i], &colliders[j],
                                                &mut scratch.exact_wide,
                                                #[cfg(feature = "cartesian-recoil")]
                                                None)),
                    (MotorShape::Body { .. }, MotorShape::Projectile { .. }) =>
                        (ExactScanBranchDiagnostic::ProjectileBody,
                        wide_sweep_segment_body(b, owner_b, a, owner_a,
                                                &colliders[j], &colliders[i],
                                                &mut scratch.exact_wide,
                                                #[cfg(feature = "cartesian-recoil")]
                                                None)),
                    (MotorShape::Segment { .. }, MotorShape::Shield { .. }) =>
                        (ExactScanBranchDiagnostic::SegmentShield,
                        wide_sweep_segment_shield(a, owner_a, b, owner_b,
                                                  &colliders[i], &colliders[j],
                                                  &mut scratch.exact_wide)),
                    (MotorShape::Shield { .. }, MotorShape::Segment { .. }) =>
                        (ExactScanBranchDiagnostic::SegmentShield,
                        wide_sweep_segment_shield(b, owner_b, a, owner_a,
                                                  &colliders[j], &colliders[i],
                                                  &mut scratch.exact_wide)),
                    (MotorShape::Segment { .. }, MotorShape::Body { .. }) =>
                        {
                            #[cfg(feature = "cartesian-recoil")]
                            let rows = target_claimed.then(|| ExactSegmentBodyTargetRows {
                                regions: &mut scratch.segment_body_target.regions,
                                visits: &mut scratch.segment_body_target.visits,
                                invalid: &mut scratch.segment_body_target.invalid,
                                #[cfg(test)]
                                test_mutation: scratch.segment_body_target.test_mutation,
                                #[cfg(test)]
                                test_mutation_receipt:
                                    scratch.segment_body_target.test_mutation_receipt,
                                #[cfg(test)]
                                test_mutation_fired:
                                    &mut scratch.segment_body_target.test_mutation_fired,
                            });
                            (ExactScanBranchDiagnostic::SegmentBody,
                            wide_sweep_segment_body(a, owner_a, b, owner_b,
                                                    &colliders[i], &colliders[j],
                                                    &mut scratch.exact_wide,
                                                    #[cfg(feature = "cartesian-recoil")] rows))
                        },
                    (MotorShape::Body { .. }, MotorShape::Segment { .. }) =>
                        {
                            #[cfg(feature = "cartesian-recoil")]
                            let rows = target_claimed.then(|| ExactSegmentBodyTargetRows {
                                regions: &mut scratch.segment_body_target.regions,
                                visits: &mut scratch.segment_body_target.visits,
                                invalid: &mut scratch.segment_body_target.invalid,
                                #[cfg(test)]
                                test_mutation: scratch.segment_body_target.test_mutation,
                                #[cfg(test)]
                                test_mutation_receipt:
                                    scratch.segment_body_target.test_mutation_receipt,
                                #[cfg(test)]
                                test_mutation_fired:
                                    &mut scratch.segment_body_target.test_mutation_fired,
                            });
                            (ExactScanBranchDiagnostic::SegmentBody,
                            wide_sweep_segment_body(b, owner_b, a, owner_a,
                                                    &colliders[j], &colliders[i],
                                                    &mut scratch.exact_wide,
                                                    #[cfg(feature = "cartesian-recoil")] rows))
                        },
                    (MotorShape::Segment { .. }, MotorShape::Segment { .. }) if
                        (a.entity, a.slot) <= (b.entity, b.slot) =>
                        (ExactScanBranchDiagnostic::SegmentSegment,
                        wide_sweep_segments(a, owner_a, b, owner_b,
                                            &colliders[i], &colliders[j],
                                            &mut scratch.exact_wide)),
                    (MotorShape::Segment { .. }, MotorShape::Segment { .. }) =>
                        (ExactScanBranchDiagnostic::SegmentSegment,
                        wide_sweep_segments(b, owner_b, a, owner_a,
                                            &colliders[j], &colliders[i],
                                            &mut scratch.exact_wide)),
                    // Body/body separation is a distinct World phase, and
                    // body/shield plus shield/shield have never been contact
                    // primitives. The exact branch owns the same pair domain
                    // as `candidate`; a response word does not turn an ignored
                    // collider pairing into a new kind of contact.
                    _ => continue,
                };
                let candidate = match candidate {
                    Ok(candidate) => candidate,
                    Err(reject) => {
                        #[cfg(feature = "cartesian-recoil")]
                        { scratch.finish_segment_body_target_pair(target_claimed, aabb_supported,
                            aabb_disjoint, ExactSegmentBodyPairResultDiagnostic::Reject(
                                scan_reject_diagnostic(reject)));
                          scratch.first_pair_rejection = Some(ExactScanPairRejectionDiagnostic {
                            a_index: i, b_index: j, a_entity: a.entity, b_entity: b.entity,
                            a_slot: a.slot, b_slot: b.slot,
                            a_shape: scan_shape_diagnostic(&a.motor),
                            b_shape: scan_shape_diagnostic(&b.motor),
                            a_present: a.present, b_present: b.present,
                            a_owner: a.owner_index, b_owner: b.owner_index,
                            group_time_raw: owner_a.common_response.group_time_raw,
                            aabb_supported, aabb_disjoint,
                            branch, reject: scan_reject_diagnostic(reject),
                            segment_body: scratch.exact_wide.segment_body_rejection,
                        }); }
                        return Err(reject);
                    }
                };
                #[cfg(all(test, feature = "cartesian-recoil"))]
                let candidate = if target_claimed && scratch.segment_body_target.test_mutation
                    == ExactSegmentBodyTestMutation::RouteRecorderIntoResult {
                    scratch.segment_body_target.test_mutation_fired =
                        scratch.segment_body_target.test_mutation_receipt; None
                } else { candidate };
                #[cfg(feature = "cartesian-recoil")]
                scratch.finish_segment_body_target_pair(target_claimed, aabb_supported,
                    aabb_disjoint, if candidate.is_some() {
                        ExactSegmentBodyPairResultDiagnostic::Candidate
                    } else { ExactSegmentBodyPairResultDiagnostic::NoCandidate });
                if let Some(candidate) = candidate { scratch.exact_staging.push(candidate); }
            } }
            scratch.exact_staging.sort_unstable_by_key(
                |row| (row.fact.key, row.fact.toi, row.distance_sq, row.feature));
            scratch.exact_staging.dedup_by_key(|row| row.fact.key);
            #[cfg(feature = "cartesian-recoil")]
            {
                for candidate in &scratch.exact_staging {
                    let time_raw = candidate.fact.toi.get().raw() as u32;
                    let wide_toi = candidate.wide_toi
                        .ok_or(ExactScanReject::CompatibilityIdentity)?;
                    let compatibility_sweep = scratch.candidates.iter()
                        .find(|row| row.fact.key == candidate.fact.key)
                        .and_then(|row| row.compatibility_sweep);
                    scratch.certified_selections.push(CertifiedSelection { time_raw,
                        key: candidate.fact.key, region: candidate.fact.volume,
                        medial: candidate.wide_medial.unwrap_or_else(WideRational4096::zero) });
                    scratch.certified_provenance.push(CertifiedProvenance { time_raw,
                        key: candidate.fact.key, wide_toi, compatibility_sweep });
                }
                scratch.certified_selections.sort_unstable_by_key(|row| (row.time_raw, row.key));
                scratch.certified_provenance.sort_unstable_by_key(|row| (row.time_raw, row.key));
                if scratch.certified_selections.len() != scratch.certified_provenance.len()
                    || scratch.certified_selections.iter().zip(&scratch.certified_provenance)
                        .any(|(selection, evidence)| (selection.key, selection.time_raw)
                            != (evidence.key, evidence.time_raw)) {
                    return Err(ExactScanReject::CompatibilityIdentity);
                }
                scratch.candidates.clear();
                for at in 0..scratch.certified_selections.len() {
                    let selection = scratch.certified_selections[at];
                    let evidence = scratch.certified_provenance[at];
                    let _medial_is_selection_authority = selection.medial;
                    let identity = |row: &ContactCollider| (row.entity,
                        if matches!(row.shape, ContactShape::Body { .. }) { BODY_SLOT }
                        else { row.slot });
                    let a = colliders.iter().position(|row|
                        identity(row) == (selection.key.a, selection.key.a_slot))
                        .ok_or(ExactScanReject::CompatibilityIdentity)?;
                    let b = colliders.iter().position(|row|
                        identity(row) == (selection.key.b, selection.key.b_slot))
                        .ok_or(ExactScanReject::CompatibilityIdentity)?;
                    let fact = exact_contact_at_pose(trajectories, owners, colliders,
                        a, b, selection.time_raw, scratch)?
                        .ok_or(ExactScanReject::CompatibilityIdentity)?;
                    // A projectile's exact swept volume chooses the first body
                    // envelope it reaches, while the anatomy projector names
                    // the nearest medial part at that certified instant.  The
                    // part is damage metadata, not contact identity: requiring
                    // the envelope's region here would reject the same valid
                    // projectile/body key before the shared solver can project
                    // it onto anatomy.
                    if fact.key != selection.key || (fact.volume != selection.region
                            && selection.key.kind != ContactKind::ProjectileBody) {
                        return Err(ExactScanReject::CompatibilityIdentity);
                    }
                    scratch.candidates.push(Candidate { fact,
                        distance_sq: Fx::ZERO, feature: 0, wide_toi: Some(evidence.wide_toi),
                        wide_medial: Some(selection.medial),
                        compatibility_sweep: evidence.compatibility_sweep });
                }
                return Ok(());
            }
            #[cfg(not(feature = "cartesian-recoil"))]
            {
                core::mem::swap(&mut scratch.candidates, &mut scratch.exact_staging);
                Ok(())
            }
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
fn scan_shape_diagnostic(shape: &MotorShape) -> ExactScanShapeDiagnostic {
    match shape {
        MotorShape::Projectile { .. } => ExactScanShapeDiagnostic::Projectile,
        MotorShape::Body { .. } => ExactScanShapeDiagnostic::Body,
        MotorShape::Segment { .. } => ExactScanShapeDiagnostic::Segment,
        MotorShape::Shield { .. } => ExactScanShapeDiagnostic::Shield,
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn scan_reject_diagnostic(reject: ExactScanReject) -> ExactScanRejectDiagnostic {
    match reject {
        ExactScanReject::ArithmeticEnvelope => ExactScanRejectDiagnostic::ArithmeticEnvelope,
        ExactScanReject::Budget => ExactScanRejectDiagnostic::Budget,
        ExactScanReject::CompatibilityIdentity => ExactScanRejectDiagnostic::CompatibilityIdentity,
        ExactScanReject::Trajectory(_) => ExactScanRejectDiagnostic::Trajectory,
        ExactScanReject::UnsupportedExactSweep => ExactScanRejectDiagnostic::UnsupportedExactSweep,
    }
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
    Projectile { point: Vec3 },
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
const SEGMENT_ARITHMETIC_CAP: usize = 8;
#[cfg(any(test, feature = "cartesian-recoil"))]
const SEGMENT_SCALAR_CAP: usize = 16;
#[cfg(any(test, feature = "cartesian-recoil"))]
const SEGMENT_POINT_CAP: usize = 10;
#[cfg(any(test, feature = "cartesian-recoil"))]
const SEGMENT_VECTOR_CAP: usize = 3;
#[cfg(any(test, feature = "cartesian-recoil"))]
const SEGMENT_CANDIDATE_CAP: usize = 5;

#[cfg(any(test, feature = "cartesian-recoil"))]
fn segment_arithmetic(rows: &mut Vec<WideRational4096>)
    -> &mut [WideRational4096; SEGMENT_ARITHMETIC_CAP]
{
    rows.as_mut_slice().try_into().unwrap()
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Default)]
struct SegmentWorkState {
    arithmetic: Vec<WideRational4096>,
    scalar: Vec<WideRational4096>,
    point: Vec<WidePoint>,
    vector: Vec<[WideRational4096; 3]>,
    candidate: Vec<WideSegmentClosest>,
    committed: Vec<WideSegmentClosest>,
    candidate_count: u8,
    winner: u8,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
impl SegmentWorkState {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.arithmetic, SEGMENT_ARITHMETIC_CAP)?;
        try_reserve_exact(&mut self.scalar, SEGMENT_SCALAR_CAP)?;
        try_reserve_exact(&mut self.point, SEGMENT_POINT_CAP)?;
        try_reserve_exact(&mut self.vector, SEGMENT_VECTOR_CAP)?;
        try_reserve_exact(&mut self.candidate, SEGMENT_CANDIDATE_CAP)?;
        try_reserve_exact(&mut self.committed, 1)?;
        let zero = WideRational4096::zero();
        self.arithmetic.resize(SEGMENT_ARITHMETIC_CAP, zero);
        self.scalar.resize(SEGMENT_SCALAR_CAP, zero);
        self.point.resize(SEGMENT_POINT_CAP, WidePoint([zero; 3]));
        self.vector.resize(SEGMENT_VECTOR_CAP, [zero; 3]);
        let row = WideSegmentClosest { a: WidePoint([zero; 3]), b: WidePoint([zero; 3]),
                                      distance_sq: zero, feature: 255 };
        self.candidate.resize(SEGMENT_CANDIDATE_CAP, row);
        self.committed.resize(1, row);
        Ok(())
    }

    fn sub_point_into(&mut self, source: &WidePoint, origin: &WidePoint, output: usize)
        -> Result<(), ExactScanReject>
    {
        for axis in 0..3 {
            if !origin.0[axis].checked_neg_into(
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[13]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            if !source.0[axis].checked_add_divisible_into(&self.scalar[13],
                    segment_arithmetic(&mut self.arithmetic), &mut self.point[output].0[axis]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
        }
        Ok(())
    }

    fn vector_sub_into(&mut self, left: usize, right: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        for axis in 0..3 {
            if !self.point[right].0[axis].checked_neg_into(
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[13]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            if !self.point[left].0[axis].checked_add_divisible_into(&self.scalar[13],
                    segment_arithmetic(&mut self.arithmetic), &mut self.vector[output][axis]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
        }
        Ok(())
    }

    fn dot_into(&mut self, left: usize, right: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        self.scalar[output] = WideRational4096::zero();
        for axis in 0..3 {
            if !self.vector[left][axis].checked_mul_into(&self.vector[right][axis],
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[14]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (input, result) = self.scalar.split_at_mut(15);
            if !input[output].checked_add_divisible_into(&input[14],
                    segment_arithmetic(&mut self.arithmetic), &mut result[0]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            input[output] = result[0];
        }
        Ok(())
    }

    fn mul_scalar(&mut self, left: usize, right: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        let (before, after) = self.scalar.split_at_mut(output);
        let (out, tail) = after.split_first_mut().unwrap();
        let left_ref = if left < output { &before[left] } else { &tail[left - output - 1] };
        let right_ref = if right < output { &before[right] } else { &tail[right - output - 1] };
        if !left_ref.checked_mul_into(right_ref, segment_arithmetic(&mut self.arithmetic), out) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        Ok(())
    }

    fn scalar_sub_into(&mut self, left: usize, right: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        let right_value = self.scalar[right];
        if !right_value.checked_neg_into(
                segment_arithmetic(&mut self.arithmetic), &mut self.scalar[13]) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        let left_value = self.scalar[left];
        let negated = self.scalar[13];
        if !left_value.checked_add_divisible_into(
                &negated, segment_arithmetic(&mut self.arithmetic), &mut self.scalar[output]) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        Ok(())
    }

    fn scalar_div_into(&mut self, left: usize, right: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        let left_value = self.scalar[left];
        let right_value = self.scalar[right];
        if !left_value.checked_div_into(&right_value,
                segment_arithmetic(&mut self.arithmetic), &mut self.scalar[output]) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        Ok(())
    }

    fn point_at_into(&mut self, base: usize, vector: usize, parameter: usize, output: usize)
        -> Result<(), ExactScanReject>
    {
        for axis in 0..3 {
            let parameter_value = self.scalar[parameter];
            if !self.vector[vector][axis].checked_mul_into(&parameter_value,
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[14]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (input, staged) = self.point.split_at_mut(output);
            if !input[base].0[axis].checked_add_divisible_into(&self.scalar[14],
                    segment_arithmetic(&mut self.arithmetic), &mut staged[0].0[axis]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
        }
        Ok(())
    }

    fn candidate_into(&mut self, a: usize, b: usize, slot: usize, feature: u8)
        -> Result<(), ExactScanReject>
    {
        self.scalar[9] = WideRational4096::zero();
        for axis in 0..3 {
            if !self.point[b].0[axis].checked_neg_into(
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[13]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (difference, negated) = self.scalar.split_at_mut(13);
            if !self.point[a].0[axis].checked_add_divisible_into(&negated[0],
                    segment_arithmetic(&mut self.arithmetic), &mut difference[12]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (difference, product) = self.scalar.split_at_mut(14);
            if !difference[12].checked_mul_into(&difference[12],
                    segment_arithmetic(&mut self.arithmetic), &mut product[0]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (input, result) = self.scalar.split_at_mut(15);
            if !input[9].checked_add_divisible_into(&input[14],
                    segment_arithmetic(&mut self.arithmetic), &mut result[0]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            input[9] = result[0];
        }
        for axis in 0..3 {
            self.candidate[slot].a.0[axis] = self.point[a].0[axis];
            self.candidate[slot].b.0[axis] = self.point[b].0[axis];
        }
        self.candidate[slot].distance_sq = self.scalar[9];
        self.candidate[slot].feature = feature;
        self.candidate_count = (slot + 1) as u8;
        Ok(())
    }

    fn candidate_cmp(&mut self, left: u8, right: u8, out: &mut Ordering)
        -> Result<(), ExactScanReject>
    {
        let rows = &self.candidate;
        if !rows[left as usize].distance_sq.checked_cmp_into(
                &rows[right as usize].distance_sq,
                segment_arithmetic(&mut self.arithmetic), out) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        if *out != Ordering::Equal { return Ok(()); }
        for axis in 0..3 {
            if !rows[left as usize].a.0[axis].checked_cmp_into(
                    &rows[right as usize].a.0[axis],
                    segment_arithmetic(&mut self.arithmetic), out) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            if *out != Ordering::Equal { return Ok(()); }
        }
        for axis in 0..3 {
            if !rows[left as usize].b.0[axis].checked_cmp_into(
                    &rows[right as usize].b.0[axis],
                    segment_arithmetic(&mut self.arithmetic), out) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            if *out != Ordering::Equal { return Ok(()); }
        }
        *out = rows[left as usize].feature.cmp(&rows[right as usize].feature);
        Ok(())
    }

    #[inline(always)]
    fn project_endpoint(&mut self, point: usize, base: usize, vector: usize,
                        square: usize, feature: u8, point_is_a: bool)
        -> Result<(), ExactScanReject>
    {
        self.vector_sub_into(point, base, 2)?;
        self.dot_into(2, vector, 10)?;
        if self.scalar[square].numerator.is_zero() {
            self.scalar[11] = WideRational4096::zero();
        } else { self.scalar_div_into(10, square, 11)?; }
        let mut order = Ordering::Equal;
        if !self.scalar[11].checked_cmp_into(&WideRational4096::zero(),
                segment_arithmetic(&mut self.arithmetic), &mut order) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        if order == Ordering::Less { self.scalar[11] = WideRational4096::zero(); }
        if !self.scalar[11].checked_cmp_into(&WideRational4096::one(),
                segment_arithmetic(&mut self.arithmetic), &mut order) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        if order == Ordering::Greater { self.scalar[11] = WideRational4096::one(); }
        self.point_at_into(base, vector, 11, 9)?;
        let slot = self.candidate_count as usize;
        let (a, b) = if point_is_a { (point, 9) } else { (9, point) };
        self.scalar[9] = WideRational4096::zero();
        for axis in 0..3 {
            if !self.point[b].0[axis].checked_neg_into(
                    segment_arithmetic(&mut self.arithmetic), &mut self.scalar[13]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (difference, negated) = self.scalar.split_at_mut(13);
            if !self.point[a].0[axis].checked_add_divisible_into(
                    &negated[0], segment_arithmetic(&mut self.arithmetic), &mut difference[12]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (difference, product) = self.scalar.split_at_mut(14);
            if !difference[12].checked_mul_into(
                    &difference[12], segment_arithmetic(&mut self.arithmetic), &mut product[0]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            let (input, result) = self.scalar.split_at_mut(15);
            if !input[9].checked_add_divisible_into(
                    &input[14], segment_arithmetic(&mut self.arithmetic), &mut result[0]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            input[9] = result[0];
        }
        for axis in 0..3 {
            self.candidate[slot].a.0[axis] = self.point[a].0[axis];
            self.candidate[slot].b.0[axis] = self.point[b].0[axis];
        }
        self.candidate[slot].distance_sq = self.scalar[9];
        self.candidate[slot].feature = feature;
        self.candidate_count = (slot + 1) as u8;
        Ok(())
    }

    #[inline(never)]
    fn segment_work_points_into(&mut self, a0: &WidePoint, a1: &WidePoint,
                                b0: &WidePoint, b1: &WidePoint)
        -> Result<(), ExactScanReject>
    {
        if self.arithmetic.len() != SEGMENT_ARITHMETIC_CAP
            || self.scalar.len() != SEGMENT_SCALAR_CAP
            || self.point.len() != SEGMENT_POINT_CAP
            || self.vector.len() != SEGMENT_VECTOR_CAP
            || self.candidate.len() != SEGMENT_CANDIDATE_CAP
            || self.committed.len() != 1 {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        self.sub_point_into(a0, a0, 0)?;
        self.sub_point_into(a1, a0, 1)?;
        self.sub_point_into(b0, a0, 2)?;
        self.sub_point_into(b1, a0, 3)?;
        self.vector_sub_into(1, 0, 0)?;
        self.vector_sub_into(3, 2, 1)?;
        self.vector_sub_into(0, 2, 2)?;
        self.dot_into(0, 0, 0)?;
        self.dot_into(0, 1, 1)?;
        self.dot_into(1, 1, 2)?;
        self.dot_into(0, 2, 3)?;
        self.dot_into(1, 2, 4)?;
        self.candidate_count = 0;
        if !self.scalar[0].numerator.is_zero() && !self.scalar[2].numerator.is_zero() {
            self.mul_scalar(0, 2, 10)?;
            self.mul_scalar(1, 1, 11)?;
            self.scalar_sub_into(10, 11, 5)?;
            if !self.scalar[5].numerator.is_zero() {
                self.mul_scalar(1, 4, 10)?;
                self.mul_scalar(2, 3, 11)?;
                self.scalar_sub_into(10, 11, 12)?;
                self.scalar_div_into(12, 5, 6)?;
                self.mul_scalar(0, 4, 10)?;
                self.mul_scalar(1, 3, 11)?;
                self.scalar_sub_into(10, 11, 12)?;
                self.scalar_div_into(12, 5, 7)?;
                let mut order = Ordering::Equal;
                let mut interior = true;
                self.scalar[14] = WideRational4096::zero();
                self.scalar[15] = WideRational4096::one();
                for parameter in [6, 7] {
                    if !self.scalar[parameter].checked_cmp_into(&self.scalar[14],
                            segment_arithmetic(&mut self.arithmetic), &mut order) {
                        return Err(ExactScanReject::ArithmeticEnvelope);
                    }
                    interior &= order != Ordering::Less;
                    if !self.scalar[parameter].checked_cmp_into(&self.scalar[15],
                            segment_arithmetic(&mut self.arithmetic), &mut order) {
                        return Err(ExactScanReject::ArithmeticEnvelope);
                    }
                    interior &= order != Ordering::Greater;
                }
                if interior {
                    self.point_at_into(0, 0, 6, 8)?;
                    self.point_at_into(2, 1, 7, 9)?;
                    self.candidate_into(8, 9, 0, 0)?;
                }
            }
        }
        self.project_endpoint(0, 2, 1, 2, 1, true)?;
        self.project_endpoint(1, 2, 1, 2, 2, true)?;
        self.project_endpoint(2, 0, 0, 0, 3, false)?;
        self.project_endpoint(3, 0, 0, 0, 4, false)?;
        let mut winner = 0u8;
        for at in 1..self.candidate_count {
            let mut order = Ordering::Equal;
            self.candidate_cmp(at, winner, &mut order)?;
            if order == Ordering::Less { winner = at; }
        }
        self.winner = winner;
        for axis in 0..3 {
            if !a0.0[axis].checked_add_divisible_into(
                    &self.candidate[winner as usize].a.0[axis],
                    segment_arithmetic(&mut self.arithmetic), &mut self.point[8].0[axis]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
            if !a0.0[axis].checked_add_divisible_into(
                    &self.candidate[winner as usize].b.0[axis],
                    segment_arithmetic(&mut self.arithmetic), &mut self.point[9].0[axis]) {
                return Err(ExactScanReject::ArithmeticEnvelope);
            }
        }
        for axis in 0..3 {
            self.committed[0].a.0[axis] = self.point[8].0[axis];
            self.committed[0].b.0[axis] = self.point[9].0[axis];
        }
        self.committed[0].distance_sq = self.candidate[winner as usize].distance_sq;
        self.committed[0].feature = self.candidate[winner as usize].feature;
        Ok(())
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Default)]
struct ExactWideScratch {
    segment: SegmentWorkState,
    #[cfg(feature = "cartesian-recoil")]
    segment_body_separation: SegmentBodySeparationWork,
    rectangle_candidates: Vec<WideSegmentClosest>,
    aabb_left: Vec<WidePoint>,
    aabb_right: Vec<WidePoint>,
    #[cfg(feature = "cartesian-recoil")]
    segment_body_rejection: Option<ExactSegmentBodyProgressDiagnostic>,
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
        self.segment.try_reserve()?;
        try_reserve_exact(&mut self.rectangle_candidates, 7)?;
        try_reserve_exact(&mut self.aabb_left, BODY_VOLUME_COUNT * 4)?;
        try_reserve_exact(&mut self.aabb_right, BODY_VOLUME_COUNT * 4)?;
        #[cfg(feature = "cartesian-recoil")]
        self.segment_body_separation.try_reserve()?;
        Ok(())
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct SeparationNode { lo: u32, hi: u32, depth: u8 }

#[cfg(feature = "cartesian-recoil")]
#[derive(Default)]
struct SegmentBodySeparationWork {
    nodes: Vec<SeparationNode>,
    points: Vec<WidePoint>,
    corners: Vec<[WideRational4096; 3]>,
    axes: Vec<[WideRational4096; 3]>,
    scalar: Vec<WideRational4096>,
    positive_cmp: PositiveRationalCmpWork,
}

#[cfg(feature = "cartesian-recoil")]
impl Clone for SegmentBodySeparationWork {
    fn clone(&self) -> Self {
        // Scratch has no semantic state. In particular, cloning an empty Vec
        // normally loses its spare capacity, so a derived Clone would make the
        // first certified interval after a World snapshot allocate again.
        let mut cloned = Self::default();
        cloned.try_reserve().expect("the source already owns the fixed certificate bounds");
        cloned
    }
}

#[cfg(feature = "cartesian-recoil")]
impl SegmentBodySeparationWork {
    fn try_reserve(&mut self) -> Result<(), ContactCapacityError> {
        try_reserve_exact(&mut self.nodes, 17)?;
        try_reserve_exact(&mut self.points, 8)?;
        try_reserve_exact(&mut self.corners, 8)?;
        try_reserve_exact(&mut self.axes, 4)?;
        try_reserve_exact(&mut self.scalar, 32)?;
        let zero = WideRational4096::zero();
        self.points.resize(8, WidePoint([zero; 3]));
        self.corners.resize(8, [zero; 3]);
        self.scalar.resize(32, zero);
        self.nodes.clear(); self.axes.clear();
        Ok(())
    }

    fn clear_stages(&mut self) { self.nodes.clear(); self.axes.clear(); }
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
fn wide_segment_segment_points_into(a0: &WidePoint, a1: &WidePoint,
                                    b0: &WidePoint, b1: &WidePoint,
                                    scratch: &mut ExactWideScratch)
    -> Result<(), ExactScanReject>
{
    scratch.segment.segment_work_points_into(a0, a1, b0, b1)
}

#[cfg(test)]
fn wide_segment_segment_points(a0: WidePoint, a1: WidePoint, b0: WidePoint, b1: WidePoint,
                               scratch: &mut ExactWideScratch)
    -> Result<WideSegmentClosest, ExactScanReject>
{
    wide_segment_segment_points_into(&a0, &a1, &b0, &b1, scratch)?;
    Ok(scratch.segment.committed[0])
}

#[cfg(test)]
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
    let mut candidates = Vec::with_capacity(5);
    if !aa.numerator.is_zero() && !cc.numerator.is_zero() {
        let determinant = wide_sub(wide_mul(aa, cc)?, wide_mul(bb, bb)?)?;
        if !determinant.numerator.is_zero() {
            let s = wide_div(wide_sub(wide_mul(bb, ee)?, wide_mul(cc, dd)?)?, determinant)?;
            let t = wide_div(wide_sub(wide_mul(aa, ee)?, wide_mul(bb, dd)?)?, determinant)?;
            if wide_cmp(s, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(s, WideRational4096::one())? != Ordering::Greater
                && wide_cmp(t, WideRational4096::zero())? != Ordering::Less
                && wide_cmp(t, WideRational4096::one())? != Ordering::Greater {
                candidates.push(wide_segment_candidate(
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
        candidates.push(if point_is_a {
            wide_segment_candidate(point, projected, (at + 1) as u8)?
        } else { wide_segment_candidate(projected, point, (at + 1) as u8)? });
    }
    let mut rows = candidates.into_iter();
    let mut winner = rows.next().ok_or(ExactScanReject::ArithmeticEnvelope)?;
    for candidate in rows {
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
        wide_segment_segment_points_into(&a0, &a1, &b0, &b1, scratch)?;
        let mut edge = scratch.segment.committed[0];
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
    let (a0, a1, b0, b1) = (wide_point(a0)?, wide_point(a1)?, wide_point(b0)?, wide_point(b1)?);
    wide_segment_segment_points_into(&a0, &a1, &b0, &b1, scratch)?;
    Ok(scratch.segment.committed[0])
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
fn wide_owner_motor_frame(
    trajectories: &[ExactContactTrajectory], canonical_a: &ExactContactTrajectory,
) -> Result<[i32; 3], ExactScanReject> {
    for row in trajectories {
        if (row.owner_index == canonical_a.owner_index && row.entity != canonical_a.entity)
            || (row.entity == canonical_a.entity && row.owner_index != canonical_a.owner_index) {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
    }

    let mut canonical = None;
    let mut body_origin = None;
    let mut owned_rows = 0usize;
    for row in trajectories.iter().filter(|row| row.owner_index == canonical_a.owner_index) {
        owned_rows += 1;
        if row.entity == canonical_a.entity && row.slot == canonical_a.slot {
            if canonical.is_some() { return Err(ExactScanReject::CompatibilityIdentity); }
            canonical = Some(row);
        }
        match row.motor {
            MotorShape::Projectile { .. } => {
                if row.kind != GeneralizedKind::Projectile || row.slot == BODY_SLOT
                    || row.held_index.is_some() || row.equipment_spec.is_some() {
                    return Err(ExactScanReject::CompatibilityIdentity);
                }
            }
            MotorShape::Body { origin, .. } => {
                if body_origin.is_some() || row.kind != GeneralizedKind::Body
                    || row.slot != BODY_SLOT || row.held_index.is_some()
                    || row.equipment_spec.is_some() || !row.present {
                    return Err(ExactScanReject::CompatibilityIdentity);
                }
                body_origin = Some(origin.at_tick_start_raw);
            }
            MotorShape::Segment { .. } | MotorShape::Shield { .. } => {
                if row.kind != GeneralizedKind::Equipment || row.slot >= 2
                    || row.held_index != Some(row.slot as usize)
                    || row.equipment_spec.is_none() {
                    return Err(ExactScanReject::CompatibilityIdentity);
                }
            }
        }
    }
    let canonical = canonical.ok_or(ExactScanReject::CompatibilityIdentity)?;
    if let MotorShape::Projectile { point, .. } = canonical.motor {
        if canonical.kind != GeneralizedKind::Projectile || !canonical.present
            || owned_rows != 1 {
            return Err(ExactScanReject::CompatibilityIdentity);
        }
        return Ok(point.at_tick_start_raw);
    }
    let MotorShape::Segment { hilt, .. } = canonical.motor else {
        return Err(ExactScanReject::CompatibilityIdentity);
    };
    if canonical.kind != GeneralizedKind::Equipment || canonical.slot >= 2
        || canonical.held_index != Some(canonical.slot as usize)
        || canonical.equipment_spec.is_none() || !canonical.present {
        return Err(ExactScanReject::CompatibilityIdentity);
    }
    if let Some(origin) = body_origin { return Ok(origin); }
    if owned_rows != 1 { return Err(ExactScanReject::CompatibilityIdentity); }
    Ok(hilt.at_tick_start_raw)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_point_in_frame(point: &WidePoint, frame_raw: [i32; 3])
    -> Result<Vec3, ExactScanReject>
{
    let mut raw = [0; 3];
    for axis in 0..3 {
        let frame = WideRational4096::new(frame_raw[axis] as i128, 1)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let offset = wide_sub(point.0[axis], frame)?
            .trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)?;
        raw[axis] = i32::try_from((frame_raw[axis] as i128).checked_add(offset)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_midpoint_in_frame(a: &WidePoint, b: &WidePoint, frame_raw: [i32; 3])
    -> Result<Vec3, ExactScanReject>
{
    let half = WideRational4096::new(2, 1).ok_or(ExactScanReject::ArithmeticEnvelope)?;
    let mut raw = [0; 3];
    for axis in 0..3 {
        let frame = WideRational4096::new(frame_raw[axis] as i128, 1)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let relative = wide_div(wide_add(wide_sub(a.0[axis], frame)?,
                                         wide_sub(b.0[axis], frame)?)?, half)?;
        let offset = relative.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)?;
        raw[axis] = i32::try_from((frame_raw[axis] as i128).checked_add(offset)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn make_wide_candidate(
    a: &ContactCollider, b: &ContactCollider, kind: ContactKind, toi: TimeOfImpact,
    point_a: &WidePoint, point_b: &WidePoint, frame_raw: [i32; 3],
    distance_sq: Fx, feature: u8, volume: u8,
) -> Result<Candidate, ExactScanReject> {
    let mut candidate = make_candidate(a, b, kind, toi,
        wide_point_in_frame(point_a, frame_raw)?, wide_point_in_frame(point_b, frame_raw)?,
        distance_sq, feature, volume);
    candidate.fact.point = wide_midpoint_in_frame(point_a, point_b, frame_raw)?;
    Ok(candidate)
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
    wide_motor_coordinate_core(point, axis, time, &mut ())
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_response_coordinate(value: ExactAffine3, scale: i128, axis: usize, time: u32)
    -> Result<WideRational4096, ExactScanReject>
{
    wide_response_coordinate_core(value, scale, axis, time,
        ExactPointXEventScopeDiagnostic::Common, &mut ())
}

#[cfg(any(test, feature = "cartesian-recoil"))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum ExactPointXRejectSeam {
    MotorGuard, CommonScale, CommonDescending, HeldScale, HeldDescending, FinalAdd,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
trait ExactPointXObserver {
    fn event(&mut self, role: ExactPointXEventRoleDiagnostic,
             scope: ExactPointXEventScopeDiagnostic, field: ExactPointXEventFieldDiagnostic,
             stage: ExactPointXEventStageDiagnostic, atom: ExactPointXEventAtomDiagnostic);
    fn reject(&mut self, _seam: ExactPointXRejectSeam) -> Result<(), ExactScanReject> { Ok(()) }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
impl ExactPointXObserver for () {
    fn event(&mut self, _role: ExactPointXEventRoleDiagnostic,
             _scope: ExactPointXEventScopeDiagnostic, _field: ExactPointXEventFieldDiagnostic,
             _stage: ExactPointXEventStageDiagnostic, _atom: ExactPointXEventAtomDiagnostic) {}
}

#[cfg(feature = "cartesian-recoil")]
impl ExactPointXObserver for ExactPointXRecorder<'_> {
    fn event(&mut self, role: ExactPointXEventRoleDiagnostic,
             scope: ExactPointXEventScopeDiagnostic, field: ExactPointXEventFieldDiagnostic,
             stage: ExactPointXEventStageDiagnostic, atom: ExactPointXEventAtomDiagnostic) {
        ExactPointXRecorder::event(self, role, scope, field, stage, atom)
    }

    fn reject(&mut self, seam: ExactPointXRejectSeam) -> Result<(), ExactScanReject> {
        #[cfg(not(test))]
        let _ = seam;
        #[cfg(test)]
        {
            let mutation = match seam {
                ExactPointXRejectSeam::MotorGuard =>
                    ExactSegmentBodyTestMutation::PointXRejectMotorGuard,
                ExactPointXRejectSeam::CommonScale =>
                    ExactSegmentBodyTestMutation::PointXRejectCommonScale,
                ExactPointXRejectSeam::CommonDescending =>
                    ExactSegmentBodyTestMutation::PointXRejectCommonDescending,
                ExactPointXRejectSeam::HeldScale =>
                    ExactSegmentBodyTestMutation::PointXRejectHeldScale,
                ExactPointXRejectSeam::HeldDescending =>
                    ExactSegmentBodyTestMutation::PointXRejectHeldDescending,
                ExactPointXRejectSeam::FinalAdd =>
                    ExactSegmentBodyTestMutation::PointXRejectFinalAdd,
            };
            if self.test_mutation == mutation {
                *self.test_mutation_fired = self.test_mutation_receipt;
                return Err(ExactScanReject::ArithmeticEnvelope)
            }
        }
        Ok(())
    }
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_motor_coordinate_core<O: ExactPointXObserver>(point: ExactMotorPoint, axis: usize,
    time: u32, recorder: &mut O)
    -> Result<WideRational4096, ExactScanReject>
{
    recorder.reject(ExactPointXRejectSeam::MotorGuard)?;
    if time > 65_536 { return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::TimePastTick)); }
    let start_raw = point.at_tick_start_raw[axis];
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::StartRaw,
        ExactPointXEventStageDiagnostic::Input, ExactPointXEventAtomDiagnostic::I32(start_raw));
    let start = WideRational4096::new(start_raw as i128, 1)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::RationalStart,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(start)));
    let delta_raw = point.tick_delta_raw[axis];
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::DeltaRaw,
        ExactPointXEventStageDiagnostic::Input, ExactPointXEventAtomDiagnostic::I32(delta_raw));
    let step_numerator = (delta_raw as i128).checked_mul(time as i128)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::StepNumerator,
        ExactPointXEventStageDiagnostic::CheckedProduct,
        ExactPointXEventAtomDiagnostic::I128(step_numerator));
    let step = WideRational4096::new(step_numerator, 65_536)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::RationalStep,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(step)));
    let value = wide_add(start, step)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Motor, ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::AddStartStep,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(value)));
    Ok(value)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_response_coordinate_core<O: ExactPointXObserver>(value: ExactAffine3, scale: i128,
    axis: usize, time: u32, scope: ExactPointXEventScopeDiagnostic, recorder: &mut O)
    -> Result<WideRational4096, ExactScanReject>
{
    if scope == ExactPointXEventScopeDiagnostic::Common {
        recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate, scope,
            ExactPointXEventFieldDiagnostic::Scale, ExactPointXEventStageDiagnostic::Input,
            ExactPointXEventAtomDiagnostic::I128(scale));
    }
    recorder.reject(if scope == ExactPointXEventScopeDiagnostic::Common {
        ExactPointXRejectSeam::CommonScale } else { ExactPointXRejectSeam::HeldScale })?;
    if scale <= 0 { return Err(ExactScanReject::ArithmeticEnvelope); }
    recorder.reject(if scope == ExactPointXEventScopeDiagnostic::Common {
        ExactPointXRejectSeam::CommonDescending } else {
        ExactPointXRejectSeam::HeldDescending })?;
    if time < value.group_time_raw {
        return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::DescendingTime));
    }
    if time > 65_536 { return Err(ExactScanReject::Trajectory(ExactTrajectoryReject::TimePastTick)); }
    let at_group_raw = value.at_group[axis].raw;
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate, scope,
        ExactPointXEventFieldDiagnostic::AtGroupRaw, ExactPointXEventStageDiagnostic::Input,
        ExactPointXEventAtomDiagnostic::I32(at_group_raw));
    let position = WideRational4096::new(at_group_raw as i128, 1)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Value, ExactPointXEventStageDiagnostic::RationalPosition,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(position)));
    let at_group_remainder = value.at_group[axis].remainder;
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate, scope,
        ExactPointXEventFieldDiagnostic::AtGroupRemainder, ExactPointXEventStageDiagnostic::Input,
        ExactPointXEventAtomDiagnostic::I128(at_group_remainder));
    let remainder_denominator = scale.checked_mul(65_536)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::RemainderDenominator,
        ExactPointXEventStageDiagnostic::CheckedProduct,
        ExactPointXEventAtomDiagnostic::I128(remainder_denominator));
    let remainder = WideRational4096::new(at_group_remainder, remainder_denominator)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Value, ExactPointXEventStageDiagnostic::RationalRemainder,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(remainder)));
    let velocity_raw = value.momentum[axis].velocity_raw;
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate, scope,
        ExactPointXEventFieldDiagnostic::VelocityRaw, ExactPointXEventStageDiagnostic::Input,
        ExactPointXEventAtomDiagnostic::I32(velocity_raw));
    let scaled_velocity = scale.checked_mul(velocity_raw as i128)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::ScaledVelocity,
        ExactPointXEventStageDiagnostic::CheckedProduct,
        ExactPointXEventAtomDiagnostic::I128(scaled_velocity));
    let momentum_remainder = value.momentum[axis].remainder;
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate, scope,
        ExactPointXEventFieldDiagnostic::MomentumRemainder, ExactPointXEventStageDiagnostic::Input,
        ExactPointXEventAtomDiagnostic::I128(momentum_remainder));
    let momentum = scaled_velocity.checked_add(momentum_remainder)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Momentum, ExactPointXEventStageDiagnostic::CheckedAdd,
        ExactPointXEventAtomDiagnostic::I128(momentum));
    let travel_time_raw = time - value.group_time_raw;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::TravelTimeRaw, ExactPointXEventStageDiagnostic::Subtract,
        ExactPointXEventAtomDiagnostic::U32(travel_time_raw));
    let travel_numerator = momentum.checked_mul(travel_time_raw as i128)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::TravelNumerator,
        ExactPointXEventStageDiagnostic::CheckedProduct,
        ExactPointXEventAtomDiagnostic::I128(travel_numerator));
    let travel_denominator = scale.checked_mul(65_536)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::TravelDenominator,
        ExactPointXEventStageDiagnostic::CheckedProduct,
        ExactPointXEventAtomDiagnostic::I128(travel_denominator));
    let travel = WideRational4096::new(travel_numerator, travel_denominator)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Value, ExactPointXEventStageDiagnostic::RationalTravel,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(travel)));
    let position_remainder = wide_add(position, remainder)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::AddPositionRemainder,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(position_remainder)));
    let result = wide_add(position_remainder, travel)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness, scope,
        ExactPointXEventFieldDiagnostic::Value, ExactPointXEventStageDiagnostic::AddTravel,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(result)));
    Ok(result)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_evaluated_coordinate_core<O: ExactPointXObserver>(point: ExactMotorPoint,
    owner: &ExactOwnerTrajectory, held: Option<ExactHeldResponse>, axis: usize, time: u32,
    recorder: &mut O) -> Result<WideRational4096, ExactScanReject>
{
    let motor = wide_motor_coordinate_core(point, axis, time, recorder)?;
    let common = wide_response_coordinate_core(owner.common_response,
        owner.common_scale, axis, time, ExactPointXEventScopeDiagnostic::Common, recorder)?;
    let after_common = wide_add(motor, common)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Combine, ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::AddMotorCommon,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(after_common)));
    let Some(held) = held else { return Ok(after_common) };
    recorder.event(ExactPointXEventRoleDiagnostic::OperandCandidate,
        ExactPointXEventScopeDiagnostic::Held, ExactPointXEventFieldDiagnostic::MassRaw,
        ExactPointXEventStageDiagnostic::Input,
        ExactPointXEventAtomDiagnostic::I32(held.affine.mass_raw));
    let held_scale = held.affine.mass_raw as i128;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Held, ExactPointXEventFieldDiagnostic::Scale,
        ExactPointXEventStageDiagnostic::Cast, ExactPointXEventAtomDiagnostic::I128(held_scale));
    let held_value = wide_response_coordinate_core(held.affine, held_scale, axis, time,
        ExactPointXEventScopeDiagnostic::Held, recorder)?;
    recorder.reject(ExactPointXRejectSeam::FinalAdd)?;
    let result = wide_add(after_common, held_value)?;
    recorder.event(ExactPointXEventRoleDiagnostic::DerivedWitness,
        ExactPointXEventScopeDiagnostic::Final, ExactPointXEventFieldDiagnostic::Value,
        ExactPointXEventStageDiagnostic::AddAfterCommonHeld,
        ExactPointXEventAtomDiagnostic::Wide(exact_wide_rational_diagnostic(result)));
    Ok(result)
}

#[cfg(feature = "cartesian-recoil")]
fn wide_evaluated_point_recording_hilt_start_x(point: ExactMotorPoint,
    row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory, time: u32,
    recorder: &mut ExactPointXRecorder<'_>) -> Result<WidePoint, ExactScanReject>
{
    let Some(held_index) = row.held_index else {
        recorder.invalidate(ExactPointXRecorderInvalidDiagnostic::Cardinality);
        return wide_evaluated_point(point, row, owner, time)
    };
    let Some(held) = owner.held_response.get(held_index).and_then(|held| *held) else {
        recorder.invalidate(ExactPointXRecorderInvalidDiagnostic::Cardinality);
        return wide_evaluated_point(point, row, owner, time)
    };
    recorder.begin(ExactPointXAdmissionDiagnostic {
        side: ExactPairAabbSideDiagnostic::A, ordinal: 0,
        source: ExactPairAabbPointSourceDiagnostic::SegmentHilt, region: None,
        endpoint: ExactPairAabbEndpointDiagnostic::Start, axis: ExactPairAabbAxisDiagnostic::X,
        row_entity: row.entity, row_slot: row.slot, owner_index: row.owner_index,
        held_index, held_slot: held.slot, held_spec: held.spec_id, time_raw: time,
        common_group_time_raw: owner.common_response.group_time_raw,
        held_group_time_raw: held.affine.group_time_raw,
    });
    let x = wide_evaluated_coordinate_core(point, owner, Some(held), 0, time, recorder);
    recorder.terminal(&x);
    let x = x?;
    let mut out = [x; 3];
    for axis in 1..3 {
        out[axis] = wide_evaluated_coordinate_core(point, owner, Some(held), axis, time, &mut ())?;
    }
    Ok(WidePoint(out))
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
        out[axis] = wide_evaluated_coordinate_core(point, owner, held, axis, time, &mut ())?;
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
        MotorShape::Projectile { point, .. } => Ok(WideEvaluatedContactShape::Projectile {
            point: wide_point_to_vec3(wide_evaluated_point(point, row, owner, time)?)?,
        }),
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

/// Publish an integral body motor in its own affine reflection frame. The
/// common response is the only non-integral term here; quantizing it before
/// translation makes the signed remainder odd under reflection.
#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) fn wide_body_origin_quotient(
    body: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
) -> Result<Vec3, ExactScanReject> {
    if body.entity != owner.entity || body.held_index.is_some() {
        return Err(ExactScanReject::CompatibilityIdentity);
    }
    let MotorShape::Body { origin, .. } = body.motor else {
        return Err(ExactScanReject::CompatibilityIdentity);
    };
    let mut raw = [0; 3];
    for axis in 0..3 {
        let motor = motor_end_raw(origin, axis)?;
        let response = wide_response_coordinate(
            owner.common_response, owner.common_scale, axis, 65_536)?
            .trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)?;
        raw[axis] = i32::try_from(motor.checked_add(response)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?;
    }
    Ok(Vec3::new(Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2])))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) fn wide_relative_point_quotient(
    held_point: ExactMotorPoint, held_row: &ExactContactTrajectory,
    body_origin: ExactMotorPoint, body_row: &ExactContactTrajectory,
    owner: &ExactOwnerTrajectory, time: u32,
) -> Result<Vec3, ExactScanReject> {
    let held = wide_evaluated_point(held_point, held_row, owner, time)?;
    let body = wide_evaluated_point(body_origin, body_row, owner, time)?;
    let mut relative = [WideRational4096::zero(); 3];
    for axis in 0..3 { relative[axis] = wide_sub(held.0[axis], body.0[axis])?; }
    wide_point_to_vec3(WidePoint(relative))
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

/// Rebase a finished owner against the same motor-frame body word and relative
/// held geometry published to World for the next tick.
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
    let published_body = wide_body_origin_quotient(body, &owner)?;
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
            MotorShape::Projectile { .. } =>
                return Err(ExactScanReject::CompatibilityIdentity),
            MotorShape::Segment { hilt, .. } => hilt,
            MotorShape::Shield { corners } => corners[0],
            MotorShape::Body { .. } => return Err(ExactScanReject::CompatibilityIdentity),
        };
        let relative = wide_relative_point_quotient(
            anchor, row, origin, body, &owner, 65_536)?;
        let checked_axis = |body: Fx, relative: Fx| i32::try_from(
            (body.raw() as i128).checked_add(relative.raw() as i128)
                .ok_or(ExactScanReject::ArithmeticEnvelope)?)
            .map(Fx::from_raw).map_err(|_| ExactScanReject::ArithmeticEnvelope);
        let published = Vec3::new(
            checked_axis(published_body.x, relative.x)?,
            checked_axis(published_body.y, relative.y)?,
            checked_axis(published_body.z, relative.z)?);
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
    let (hilt, tip, radius_raw) = match row.motor {
        MotorShape::Segment { hilt, tip, radius_raw } => (hilt, tip, radius_raw),
        MotorShape::Projectile { point, radius_raw } => (point, point, radius_raw),
        _ => return Err(ExactScanReject::UnsupportedExactSweep),
    };
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
struct WideSweptAabbView<'a> {
    points: &'a [WidePoint],
    radius_raw: i32,
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn push_wide_aabb_point(out: &mut Vec<WidePoint>, point: WidePoint)
    -> Result<(), ExactScanReject>
{
    if out.len() == BODY_VOLUME_COUNT * 4 || out.len() == out.capacity() {
        return Err(ExactScanReject::CompatibilityIdentity);
    }
    out.push(point);
    Ok(())
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn exact_pair_has_swept_aabb(a: &ExactContactTrajectory, b: &ExactContactTrajectory) -> bool {
    matches!((&a.motor, &b.motor),
        (MotorShape::Segment { .. }, MotorShape::Segment { .. })
        | (MotorShape::Segment { .. }, MotorShape::Shield { .. })
        | (MotorShape::Shield { .. }, MotorShape::Segment { .. })
        | (MotorShape::Segment { .. }, MotorShape::Body { .. })
        | (MotorShape::Body { .. }, MotorShape::Segment { .. })
        | (MotorShape::Projectile { .. }, MotorShape::Body { .. })
        | (MotorShape::Body { .. }, MotorShape::Projectile { .. }))
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn fill_wide_swept_aabb_points(
    out: &mut Vec<WidePoint>, row: &ExactContactTrajectory, owner: &ExactOwnerTrajectory,
    start: u32, end: u32,
    #[cfg(feature = "cartesian-recoil")] side: ExactPairAabbSideDiagnostic,
    #[cfg(feature = "cartesian-recoil")] mut recorder: Option<&mut ExactPairAabbRecorder<'_>>,
) -> Result<i32, ExactScanReject>
{
    out.clear();
    let mut maximum_radius_raw = 0;
    match row.motor {
        MotorShape::Projectile { point, radius_raw } => {
            push_wide_aabb_point(out, wide_evaluated_point(point, row, owner, start)?)?;
            push_wide_aabb_point(out, wide_evaluated_point(point, row, owner, end)?)?;
            maximum_radius_raw = radius_raw;
        }
        MotorShape::Segment { hilt, tip, radius_raw } => {
            #[cfg(feature = "cartesian-recoil")]
            let h0 = if side == ExactPairAabbSideDiagnostic::A {
                if let Some(point_x) = recorder.as_deref_mut()
                    .and_then(|rows| rows.point_x.as_mut()) {
                    wide_evaluated_point_recording_hilt_start_x(
                        hilt, row, owner, start, point_x)?
                } else { wide_evaluated_point(hilt, row, owner, start)? }
            } else { wide_evaluated_point(hilt, row, owner, start)? };
            #[cfg(not(feature = "cartesian-recoil"))]
            let h0 = wide_evaluated_point(hilt, row, owner, start)?;
            let t0 = wide_evaluated_point(tip, row, owner, start)?;
            let (h1, t1, _) = wide_segment_at_time(row, owner, end)?;
            for (point, source, endpoint) in [
                (h0, ExactPairAabbPointSourceDiagnostic::SegmentHilt,
                    ExactPairAabbEndpointDiagnostic::Start),
                (t0, ExactPairAabbPointSourceDiagnostic::SegmentTip,
                    ExactPairAabbEndpointDiagnostic::Start),
                (h1, ExactPairAabbPointSourceDiagnostic::SegmentHilt,
                    ExactPairAabbEndpointDiagnostic::End),
                (t1, ExactPairAabbPointSourceDiagnostic::SegmentTip,
                    ExactPairAabbEndpointDiagnostic::End)] {
                push_wide_aabb_point(out, point)?;
                #[cfg(feature = "cartesian-recoil")]
                if let Some(rows) = recorder.as_deref_mut() {
                    rows.point(side, source, None, endpoint, point);
                }
            }
            maximum_radius_raw = radius_raw;
        }
        MotorShape::Shield { .. } => {
            let first = wide_shield_at_time(row, owner, start)?;
            let last = wide_shield_at_time(row, owner, end)?;
            for point in first.into_iter().chain(last) {
                push_wide_aabb_point(out, point)?;
            }
        }
        MotorShape::Body { parts, .. } => {
            for region in 0..BODY_VOLUME_COUNT {
                if !parts[region].present { continue; }
                let Some((l0, u0, radius_raw)) =
                    wide_body_region_at_time(row, owner, region, start)? else { continue };
                let Some((l1, u1, _)) =
                    wide_body_region_at_time(row, owner, region, end)? else { continue };
                for (point, source, endpoint) in [
                    (l0, ExactPairAabbPointSourceDiagnostic::BodyLower,
                        ExactPairAabbEndpointDiagnostic::Start),
                    (u0, ExactPairAabbPointSourceDiagnostic::BodyUpper,
                        ExactPairAabbEndpointDiagnostic::Start),
                    (l1, ExactPairAabbPointSourceDiagnostic::BodyLower,
                        ExactPairAabbEndpointDiagnostic::End),
                    (u1, ExactPairAabbPointSourceDiagnostic::BodyUpper,
                        ExactPairAabbEndpointDiagnostic::End)] {
                    push_wide_aabb_point(out, point)?;
                    #[cfg(feature = "cartesian-recoil")]
                    if let Some(rows) = recorder.as_deref_mut() {
                        rows.point(side, source, Some(region as u8), endpoint, point);
                    }
                }
                maximum_radius_raw = maximum_radius_raw.max(radius_raw);
            }
        }
    }
    Ok(maximum_radius_raw)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_aabb_points_are_disjoint(left: WideSweptAabbView<'_>,
                                 right: WideSweptAabbView<'_>,
                                 #[cfg(feature = "cartesian-recoil")]
                                 mut recorder: Option<&mut ExactPairAabbRecorder<'_>>)
    -> Result<bool, ExactScanReject>
{
    if left.points.is_empty() || right.points.is_empty() { return Ok(true); }
    let origin = left.points[0];
    let mut left_min = [WideRational4096::zero(); 3];
    let mut left_max = left_min;
    let first_right = wide_vector_sub(right.points[0], origin)?;
    let mut right_min = first_right;
    let mut right_max = first_right;
    for point in &left.points[1..] {
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
    for point in &right.points[1..] {
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
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() {
        rows.bounds(left_min, left_max, right_min, right_max);
    }
    let radius = wide_radius(left.radius_raw.checked_add(right.radius_raw)
        .ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() { rows.combined_radius(radius); }
    for axis in 0..3 {
        let right_gap = wide_sub(right_min[axis], left_max[axis])?;
        let right_comparison = wide_cmp(right_gap, radius)?;
        if right_comparison == Ordering::Greater {
            #[cfg(feature = "cartesian-recoil")]
            if let Some(rows) = recorder.as_deref_mut() {
                rows.gap(axis, right_gap, right_comparison, None, true);
            }
            return Ok(true)
        }
        #[cfg(feature = "cartesian-recoil")]
        if let Some(rows) = recorder.as_deref_mut() {
            rows.gap(axis, right_gap, right_comparison, None, false);
        }
        let left_gap = wide_sub(left_min[axis], right_max[axis])?;
        let left_comparison = wide_cmp(left_gap, radius)?;
        let disjoint = left_comparison == Ordering::Greater;
        #[cfg(feature = "cartesian-recoil")]
        if let Some(rows) = recorder.as_deref_mut() {
            rows.finish_left_gap(axis, left_gap, left_comparison, disjoint);
        }
        if disjoint { return Ok(true); }
    }
    Ok(false)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_swept_aabbs_are_disjoint(a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
                                  b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
                                  scratch: &mut ExactWideScratch,
                                  #[cfg(feature = "cartesian-recoil")]
                                  recorder: Option<&mut ExactPairAabbRecorder<'_>>)
    -> Result<bool, ExactScanReject>
{
    let start = ao.common_response.group_time_raw;
    wide_swept_aabbs_are_disjoint_during(a, ao, b, bo, start, 65_536, scratch,
        #[cfg(feature = "cartesian-recoil")] recorder)
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_swept_aabbs_are_disjoint_during(
    a: &ExactContactTrajectory, ao: &ExactOwnerTrajectory,
    b: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, start: u32, end: u32,
    scratch: &mut ExactWideScratch,
    #[cfg(feature = "cartesian-recoil")]
    mut recorder: Option<&mut ExactPairAabbRecorder<'_>>,
) -> Result<bool, ExactScanReject> {
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() { rows.begin(start, end); }
    let ExactWideScratch { aabb_left: left, aabb_right: right, .. } = scratch;
    let result = (|| {
    let left_radius = fill_wide_swept_aabb_points(left, a, ao, start, end,
        #[cfg(feature = "cartesian-recoil")] ExactPairAabbSideDiagnostic::A,
        #[cfg(feature = "cartesian-recoil")] recorder.as_deref_mut())?;
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() {
        rows.radius(ExactPairAabbSideDiagnostic::A, left_radius);
    }
    let right_radius = fill_wide_swept_aabb_points(right, b, bo, start, end,
        #[cfg(feature = "cartesian-recoil")] ExactPairAabbSideDiagnostic::B,
        #[cfg(feature = "cartesian-recoil")] recorder.as_deref_mut())?;
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() {
        rows.radius(ExactPairAabbSideDiagnostic::B, right_radius);
    }
    wide_aabb_points_are_disjoint(
        WideSweptAabbView { points: left.as_slice(), radius_raw: left_radius },
        WideSweptAabbView { points: right.as_slice(), radius_raw: right_radius },
        #[cfg(feature = "cartesian-recoil")] recorder.as_deref_mut())
    })();
    #[cfg(feature = "cartesian-recoil")]
    if let Some(rows) = recorder.as_deref_mut() {
        rows.terminal(match result { Ok(true) => ExactPairAabbTerminalDiagnostic::Disjoint,
            Ok(false) => ExactPairAabbTerminalDiagnostic::Overlap,
            Err(reject) => ExactPairAabbTerminalDiagnostic::Reject(
                scan_reject_diagnostic(reject)) });
    }
    result
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_segment_body_region_aabbs_are_disjoint_during(
    weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
    region: usize, start: u32, end: u32, scratch: &mut ExactWideScratch,
) -> Result<bool, ExactScanReject> {
    let ExactWideScratch { aabb_left: segment, aabb_right: part, .. } = scratch;
    let segment_radius = fill_wide_swept_aabb_points(segment, weapon, wo, start, end,
        #[cfg(feature = "cartesian-recoil")] ExactPairAabbSideDiagnostic::A,
        #[cfg(feature = "cartesian-recoil")] None)?;
    part.clear();
    let Some((l0, u0, body_radius_raw)) =
        wide_body_region_at_time(body, bo, region, start)? else { return Ok(true) };
    let Some((l1, u1, _)) =
        wide_body_region_at_time(body, bo, region, end)? else { return Ok(true) };
    for point in [l0, u0, l1, u1] { push_wide_aabb_point(part, point)?; }
    // Keep this assignment explicit: it guards against accidentally using a
    // whole-body radius when this proof is the one-region zero-step escape.
    let segment_radius_raw = match weapon.motor {
        MotorShape::Segment { radius_raw, .. }
        | MotorShape::Projectile { radius_raw, .. } => radius_raw,
        _ => return Err(ExactScanReject::UnsupportedExactSweep),
    };
    debug_assert_eq!(segment_radius, segment_radius_raw);
    wide_aabb_points_are_disjoint(
        WideSweptAabbView { points: segment.as_slice(), radius_raw: segment_radius_raw },
        WideSweptAabbView { points: part.as_slice(), radius_raw: body_radius_raw },
        #[cfg(feature = "cartesian-recoil")] None,
    )
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
    wide_segment_segment_points_into(&hilt, &tip, &lower, &upper, scratch)?;
    let closest = scratch.segment.committed[0];
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
        wide_segment_segment_points_into(&a0, &a1, &b0, &b1, scratch)?;
        let closest = scratch.segment.committed[0];
        let radius = wide_radius(ar.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
        if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? != Ordering::Greater {
            let mut pa = *ca; let mut pb = *cb;
            pa.velocity += wide_response_velocity(a, ao)?; pb.velocity += wide_response_velocity(b, bo)?;
            let distance = closest.distance_sq.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)? >> 16;
            let mut candidate = make_candidate(&pa, &pb, ContactKind::WeaponWeapon,
                TimeOfImpact::new_clamped(Fx::from_raw(time as i32)), wide_point_to_vec3(closest.a)?,
                wide_point_to_vec3(closest.b)?, Fx::from_raw(i32::try_from(distance)
                    .map_err(|_| ExactScanReject::ArithmeticEnvelope)?), closest.feature, NO_VOLUME);
            #[cfg(feature = "cartesian-recoil")]
            { candidate.wide_toi = Some(ExactWideToiDiagnostic { key: candidate.fact.key,
                region: NO_VOLUME, primitive: ExactWidePrimitiveDiagnostic::SegmentSegment,
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
            wide_segment_segment_points_into(&a0, &a1, &b0, &b1, scratch)?;
            let adjacent = scratch.segment.committed[0];
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
        let radius_sq = wide_mul(radius, radius)?;
        let current_order = wide_cmp(closest.distance_sq, radius_sq)?;
        if current_order != Ordering::Greater {
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
                closest.feature, NO_VOLUME);
            #[cfg(feature = "cartesian-recoil")]
            { candidate.wide_toi = Some(ExactWideToiDiagnostic { key: candidate.fact.key,
                region: NO_VOLUME, primitive: ExactWidePrimitiveDiagnostic::SegmentShield,
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
            let radius_sq = wide_mul(radius, radius)?;
            if wide_cmp(adjacent.distance_sq, radius_sq)? == Ordering::Greater {
                return Err(ExactScanReject::UnsupportedExactSweep);
            }
            time = next;
        } else { time += step.min(65_536 - time); }
    }
    Err(ExactScanReject::Budget)
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SegmentBodySeparation { Separated, Unresolved }

#[cfg(feature = "cartesian-recoil")]
fn wide_lerp_point(a: WidePoint, b: WidePoint, u: WideRational4096)
    -> Result<WidePoint, ExactScanReject>
{
    Ok(WidePoint([
        wide_add(a.0[0], wide_mul(wide_sub(b.0[0], a.0[0])?, u)?)?,
        wide_add(a.0[1], wide_mul(wide_sub(b.0[1], a.0[1])?, u)?)?,
        wide_add(a.0[2], wide_mul(wide_sub(b.0[2], a.0[2])?, u)?)?,
    ]))
}

#[cfg(feature = "cartesian-recoil")]
fn separation_axis_sign(mut axis: [WideRational4096; 3])
    -> Result<Option<[WideRational4096; 3]>, ExactScanReject>
{
    for word in axis {
        match wide_cmp(word, WideRational4096::zero())? {
            Ordering::Less => {
                for value in &mut axis {
                    *value = value.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?;
                }
                return Ok(Some(axis));
            }
            Ordering::Greater => return Ok(Some(axis)),
            Ordering::Equal => {}
        }
    }
    Ok(None)
}

#[cfg(feature = "cartesian-recoil")]
fn segment_body_separation_node(
    weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, region: usize,
    time: u32, node: SeparationNode, segment: &mut SegmentWorkState,
    work: &mut SegmentBodySeparationWork, radius_sq: WideRational4096,
) -> Result<bool, ExactScanReject> {
    work.axes.clear();
    let (sh, st, _) = wide_segment_at_time(weapon, wo, time)?;
    let (fh, ft, _) = wide_segment_at_time(weapon, wo, time + 1)?;
    let Some((sl, su, _)) = wide_body_region_at_time(body, bo, region, time)? else { return Ok(true) };
    let Some((fl, fu, _)) = wide_body_region_at_time(body, bo, region, time + 1)? else { return Ok(true) };
    for endpoint in 0..2 {
        let numerator = if endpoint == 0 { node.lo } else { node.hi };
        let u = WideRational4096::new(numerator as i128, 1i128 << node.depth)
            .ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let base = endpoint * 4;
        work.points[base] = wide_lerp_point(sh, fh, u)?;
        work.points[base + 1] = wide_lerp_point(st, ft, u)?;
        work.points[base + 2] = wide_lerp_point(sl, fl, u)?;
        work.points[base + 3] = wide_lerp_point(su, fu, u)?;
        segment.segment_work_points_into(&work.points[base], &work.points[base + 1],
            &work.points[base + 2], &work.points[base + 3])?;
        let closest = segment.committed[0];
        let separation = match wide_vector_sub(closest.a, closest.b)
            .and_then(separation_axis_sign) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        let weapon_axis = wide_vector_sub(work.points[base + 1], work.points[base])?;
        let body_axis = wide_vector_sub(work.points[base + 3], work.points[base + 2])?;
        let cross = match wide_cross(weapon_axis, body_axis).and_then(separation_axis_sign) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        for axis in [separation, cross].into_iter().flatten() {
            if !work.axes.contains(&axis) {
                if work.axes.len() == 4 { return Err(ExactScanReject::ArithmeticEnvelope); }
                work.axes.push(axis);
            }
        }
    }
    let mut corner = 0;
    for endpoint in 0..2 {
        let base = endpoint * 4;
        for weapon_at in 0..2 { for body_at in 2..4 {
            work.corners[corner] = match wide_vector_sub(
                work.points[base + weapon_at], work.points[base + body_at]) {
                Ok(value) => value,
                Err(reject) => return Err(reject),
            };
            corner += 1;
        } }
    }
    for axis_at in 0..work.axes.len() {
        let axis = work.axes[axis_at];
        let mut positive = true; let mut negative = true;
        let mut least: Option<WideRational4096> = None;
        for corner_at in 0..8 {
            let projection = match wide_dot(work.corners[corner_at], axis) {
                Ok(value) => value,
                Err(reject) => return Err(reject),
            };
            let order = match wide_cmp(projection, WideRational4096::zero()) {
                Ok(value) => value,
                Err(reject) => return Err(reject),
            };
            positive &= order == Ordering::Greater; negative &= order == Ordering::Less;
            let absolute = if order == Ordering::Less {
                projection.checked_neg().ok_or(ExactScanReject::ArithmeticEnvelope)?
            } else { projection };
            let is_least = if let Some(old) = least {
                match wide_cmp(absolute, old) {
                    Ok(order) => order == Ordering::Less,
                    Err(reject) => return Err(reject),
                }
            } else { true };
            if is_least {
                least = Some(absolute);
            }
        }
        if !(positive || negative) { continue; }
        let p = least.ok_or(ExactScanReject::ArithmeticEnvelope)?;
        let left = match wide_mul(p, p) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        let axis_sq = match wide_dot(axis, axis) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        let right = match wide_mul(radius_sq, axis_sq) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        let mut margin = Ordering::Equal;
        if wide_cmp(right, WideRational4096::zero())? == Ordering::Equal {
            margin = wide_cmp(left, right)?;
        } else if !checked_cmp_positive_into(
            &left, &right, &mut work.positive_cmp, &mut margin,
        ) {
            return Err(ExactScanReject::ArithmeticEnvelope);
        }
        if margin == Ordering::Greater { return Ok(true); }
    }
    Ok(false)
}

#[cfg(feature = "cartesian-recoil")]
fn segment_body_separation_inner(
    weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, region: usize,
    time: u32, radius: WideRational4096, scratch: &mut ExactWideScratch,
) -> Result<SegmentBodySeparation, ExactScanReject> {
    let ExactWideScratch { segment, segment_body_separation: work, .. } = scratch;
    if work.nodes.capacity() < 17 || work.points.len() != 8 || work.corners.len() != 8
        || work.axes.capacity() < 4 || work.scalar.len() != 32 {
        return Err(ExactScanReject::ArithmeticEnvelope);
    }
    work.nodes.push(SeparationNode { lo: 0, hi: 1, depth: 0 });
    let radius_sq = wide_mul(radius, radius)?;
    let mut visited = 0u32;
    while let Some(node) = work.nodes.pop() {
        visited += 1;
        if visited > 131_071 { return Ok(SegmentBodySeparation::Unresolved); }
        let separated = match segment_body_separation_node(weapon, wo, body, bo, region, time,
            node, segment, work, radius_sq) {
            Ok(value) => value,
            Err(reject) => return Err(reject),
        };
        if separated { continue; }
        if node.depth == 16 { return Ok(SegmentBodySeparation::Unresolved); }
        let middle = node.lo + node.hi;
        if work.nodes.len() + 2 > 17 { return Err(ExactScanReject::ArithmeticEnvelope); }
        work.nodes.push(SeparationNode { lo: middle, hi: node.hi * 2, depth: node.depth + 1 });
        work.nodes.push(SeparationNode { lo: node.lo * 2, hi: middle, depth: node.depth + 1 });
    }
    Ok(SegmentBodySeparation::Separated)
}

#[cfg(feature = "cartesian-recoil")]
fn segment_body_separation(
    weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory, region: usize,
    time: u32, radius: WideRational4096, scratch: &mut ExactWideScratch,
) -> Result<SegmentBodySeparation, ExactScanReject> {
    scratch.segment_body_separation.clear_stages();
    let answer = segment_body_separation_inner(
        weapon, wo, body, bo, region, time, radius, scratch);
    scratch.segment_body_separation.clear_stages();
    answer
}

#[cfg(any(test, feature = "cartesian-recoil"))]
fn wide_sweep_segment_body(weapon: &ExactContactTrajectory, wo: &ExactOwnerTrajectory,
    body: &ExactContactTrajectory, bo: &ExactOwnerTrajectory,
    cw: &ContactCollider, cb: &ContactCollider, scratch: &mut ExactWideScratch,
    #[cfg(feature = "cartesian-recoil")] mut diagnostic: Option<ExactSegmentBodyTargetRows<'_>>)
    -> Result<Option<Candidate>, ExactScanReject>
{
    #[cfg(feature = "cartesian-recoil")]
    { scratch.segment_body_rejection = None; }
    #[cfg(feature = "cartesian-recoil")]
    macro_rules! target_try {
        ($expression:expr, $region_at:expr) => {
            match $expression {
                Ok(value) => value,
                Err(reject) => {
                    if let (Some(rows), Some(at)) = (diagnostic.as_mut(), $region_at) {
                        rows.regions[at].terminal =
                            ExactSegmentBodyRegionTerminalDiagnostic::Reject(
                                scan_reject_diagnostic(reject));
                    }
                    return Err(reject);
                }
            }
        };
    }
    #[cfg(not(feature = "cartesian-recoil"))]
    macro_rules! target_try {
        ($expression:expr, $region_at:expr) => { $expression? };
    }
    let mut winner: Option<(u32, usize, WideSegmentClosest, WideRational4096)> = None;
    #[cfg(feature = "cartesian-recoil")]
    let mut winner_trace = ExactWideVisitTrace::default();
    for region in 0..BODY_VOLUME_COUNT {
        let group = wo.common_response.group_time_raw;
        #[cfg(feature = "cartesian-recoil")]
        let region_at = diagnostic.as_mut().and_then(|rows| rows.push_region(
            ExactSegmentBodyRegionDiagnostic {
                region: region as u8, aabb_disjoint: None, speed: None,
                visit_start: rows.visits.len(), visit_count: 0,
                terminal: ExactSegmentBodyRegionTerminalDiagnostic::ProvedSeparate,
                accepted_time_raw: None, accepted_feature: None,
            }));
        #[cfg(not(feature = "cartesian-recoil"))]
        let region_at: Option<usize> = None;
        let aabb_disjoint = target_try!(wide_segment_body_region_aabbs_are_disjoint_during(
            weapon, wo, body, bo, region, group, 65_536, scratch), region_at);
        #[cfg(feature = "cartesian-recoil")]
        if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
            rows.regions[at].aabb_disjoint = Some(aabb_disjoint);
        }
        if aabb_disjoint {
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                rows.regions[at].terminal = ExactSegmentBodyRegionTerminalDiagnostic::AabbDisjoint;
            }
            continue;
        }
        let speed = target_try!(wide_segment_body_speed(weapon, wo, body, bo, region), region_at);
        #[cfg(feature = "cartesian-recoil")]
        if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
            rows.regions[at].speed = speed.as_i128_pair();
        }
        let mut time = group; let mut found = None;
        #[cfg(feature = "cartesian-recoil")]
        let mut trace = ExactWideVisitTrace::default();
        let mut proved_separate = false;
        for visit in 0..96 {
            #[cfg(feature = "cartesian-recoil")]
            let visit_at = diagnostic.as_mut().and_then(|rows| rows.push_visit(
                ExactSegmentBodyVisitDiagnostic { region: region as u8,
                    ordinal: visit as u8, time_raw: time, safe_step_raw: None }));
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                rows.regions[at].visit_count = rows.visits.len()
                    .saturating_sub(rows.regions[at].visit_start) as u8;
            }
            #[cfg(feature = "cartesian-recoil")]
            trace.visit(time);
            let Some((closest, rr, medial)) = target_try!(wide_segment_body_at_time(
                weapon, wo, body, bo, region, time, scratch), region_at)
                else { proved_separate = true; break };
            let radius = target_try!(wide_radius(rr), region_at);
            let radius_sq = target_try!(wide_mul(radius, radius), region_at);
            if target_try!(wide_cmp(closest.distance_sq, radius_sq), region_at)
                != Ordering::Greater {
                found = Some((time, closest, medial)); break;
            }
            if time == 65_536 || speed.numerator.is_zero() { proved_separate = true; break; }
            let step = target_try!(wide_safe_step(closest, radius, speed), region_at);
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), visit_at) {
                rows.visits[at].safe_step_raw = Some(step);
            }
            #[cfg(feature = "cartesian-recoil")]
            trace.step(step);
            if step == 0 {
                let next = time + 1;
                let Some((adjacent, rr, _)) = target_try!(wide_segment_body_at_time(
                    weapon, wo, body, bo, region, next, scratch), region_at) else { break };
                let r = target_try!(wide_radius(rr), region_at);
                let adjacent_radius_sq = target_try!(wide_mul(r, r), region_at);
                if target_try!(wide_cmp(adjacent.distance_sq, adjacent_radius_sq), region_at)
                    == Ordering::Greater {
                    // Endpoint separation alone cannot exclude a sub-raw
                    // enter-and-exit. The two affine swept AABBs can: if they
                    // are disjoint across this one-word interval, every point
                    // of both capsules is separated on at least one axis.
                    // Otherwise keep the named refusal -- the interval may
                    // contain a contact the integer-time detector cannot
                    // publish exactly.
                    let interval_disjoint = target_try!(
                        wide_segment_body_region_aabbs_are_disjoint_during(
                            weapon, wo, body, bo, region, time, next, scratch), region_at);
                    if !interval_disjoint {
                        #[cfg(feature = "cartesian-recoil")]
                        if target_try!(segment_body_separation(
                            weapon, wo, body, bo, region, time, radius, scratch), region_at)
                            == SegmentBodySeparation::Separated {
                            time = next;
                            continue;
                        }
                        #[cfg(feature = "cartesian-recoil")]
                        {
                            let delta = wide_vector_sub(closest.a, closest.b).ok();
                            let d = delta.and_then(|word| wide_l1(word).ok());
                            let separation = wide_sub(closest.distance_sq, radius_sq).ok();
                            let safe_denominator = d.and_then(|d| wide_add(d, radius).ok())
                                .and_then(|sum| wide_mul(sum, speed).ok());
                            let safe_quotient = separation.zip(safe_denominator)
                                .and_then(|(n, d)| wide_div(n, d).ok());
                            let point_words = |point: WidePoint| [
                                point.0[0].as_i128_pair(), point.0[1].as_i128_pair(),
                                point.0[2].as_i128_pair(),
                            ];
                            scratch.segment_body_rejection = Some(
                                ExactSegmentBodyProgressDiagnostic {
                                    region: region as u8, visit: visit as u8, time_raw: time,
                                    speed: speed.as_i128_pair(), closest_a: point_words(closest.a),
                                    closest_b: point_words(closest.b),
                                    closest_feature: closest.feature,
                                    distance_sq: closest.distance_sq.as_i128_pair(),
                                    radius: radius.as_i128_pair(),
                                    radius_sq: radius_sq.as_i128_pair(),
                                    separation: separation.and_then(|v| v.as_i128_pair()),
                                    l1_delta: d.and_then(|v| v.as_i128_pair()),
                                    safe_denominator: safe_denominator.and_then(|v| v.as_i128_pair()),
                                    safe_quotient: safe_quotient.and_then(|v| v.as_i128_pair()),
                                    floor_step: step,
                                    applied_advance: step.min(65_536 - time),
                                    adjacent_time_raw: next,
                                    adjacent_distance_sq: adjacent.distance_sq.as_i128_pair(),
                                    adjacent_radius: r.as_i128_pair(),
                                    adjacent_radius_sq: adjacent_radius_sq.as_i128_pair(),
                                    current_separated: true, adjacent_separated: true,
                                    interval_aabb_disjoint: interval_disjoint,
                                });
                        }
                        #[cfg(feature = "cartesian-recoil")]
                        if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                            rows.regions[at].terminal =
                                ExactSegmentBodyRegionTerminalDiagnostic::Reject(
                                    ExactScanRejectDiagnostic::UnsupportedExactSweep);
                        }
                        return Err(ExactScanReject::UnsupportedExactSweep);
                    }
                }
                time = next;
            } else { time += step.min(65_536 - time); }
        }
        if found.is_none() && !proved_separate {
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                rows.regions[at].terminal = ExactSegmentBodyRegionTerminalDiagnostic::Reject(
                    ExactScanRejectDiagnostic::Budget);
            }
            return Err(ExactScanReject::Budget);
        }
        if let Some((time, closest, medial)) = found {
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                rows.regions[at].terminal = ExactSegmentBodyRegionTerminalDiagnostic::Candidate;
                rows.regions[at].accepted_time_raw = Some(time);
                rows.regions[at].accepted_feature = Some(closest.feature);
            }
            let replace = match winner {
                None => true,
                Some((old_time, old_region, _, old_medial)) => time < old_time
                    || (time == old_time && (target_try!(wide_cmp(medial, old_medial), region_at)
                        == Ordering::Less || (target_try!(wide_cmp(medial, old_medial), region_at)
                            == Ordering::Equal && region < old_region))),
            };
            if replace {
                winner = Some((time, region, closest, medial));
                #[cfg(feature = "cartesian-recoil")]
                { winner_trace = trace; }
            }
        } else if proved_separate {
            #[cfg(feature = "cartesian-recoil")]
            if let (Some(rows), Some(at)) = (diagnostic.as_mut(), region_at) {
                rows.regions[at].terminal = ExactSegmentBodyRegionTerminalDiagnostic::ProvedSeparate;
            }
        }
    }
    let Some((time, region, closest, medial)) = winner else { return Ok(None) };
    let mut pw = *cw; let mut pb = *cb;
    pw.velocity += wide_response_velocity(weapon, wo)?; pb.velocity += wide_response_velocity(body, bo)?;
    let distance = closest.distance_sq.trunc_i128().ok_or(ExactScanReject::ArithmeticEnvelope)? >> 16;
    let kind = if matches!(weapon.motor, MotorShape::Projectile { .. }) {
        ContactKind::ProjectileBody
    } else { ContactKind::WeaponBody };
    let mut candidate = make_candidate(&pw, &pb, kind,
        TimeOfImpact::new_clamped(Fx::from_raw(time as i32)), wide_point_to_vec3(closest.a)?,
        wide_point_to_vec3(closest.b)?, Fx::from_raw(i32::try_from(distance)
            .map_err(|_| ExactScanReject::ArithmeticEnvelope)?), 0, region as u8);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.wide_medial = Some(medial);
      candidate.wide_toi = Some(ExactWideToiDiagnostic {
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
        (MotorShape::Segment { .. } | MotorShape::Projectile { .. },
         MotorShape::Body { .. }) => {
            let projectile = matches!(left.motor, MotorShape::Projectile { .. });
            let mut chosen = None;
            for region in 0..BODY_VOLUME_COUNT {
                let Some((closest, radius_raw, medial)) = wide_segment_body_at_time(
                    left, owner_left, right, owner_right, region, time,
                    &mut scratch.exact_wide)? else { continue };
                let radius = wide_radius(radius_raw)?;
                // Membership was already settled by the sweep. The ordinary
                // driver chooses a projectile's anatomy region by nearest
                // medial axis at the frozen group pose, even when a fatter
                // overlapping region is the one whose radius admitted the
                // pair first. Exact recomputation must answer that same
                // question; the region is not part of ContactKey identity.
                if !projectile && wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)?
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
                Some((region, closest, _)) => Some(make_wide_candidate(
                    &published_left, &published_right,
                    if projectile {
                        ContactKind::ProjectileBody
                    } else { ContactKind::WeaponBody }, toi,
                    &closest.a, &closest.b, wide_owner_motor_frame(trajectories, left)?,
                    Fx::ZERO, 0, region as u8)?),
            }
        }
        (MotorShape::Body { .. },
         MotorShape::Segment { .. } | MotorShape::Projectile { .. }) => {
            return exact_contact_at_pose(trajectories, owners, compatibility, b, a, time, scratch);
        }
        (MotorShape::Segment { .. }, MotorShape::Segment { .. }) => {
            if (right.entity, right.slot) < (left.entity, left.slot) {
                return exact_contact_at_pose(
                    trajectories, owners, compatibility, b, a, time, scratch);
            }
            let (a0, a1, ar) = wide_segment_at_time(left, owner_left, time)?;
            let (b0, b1, br) = wide_segment_at_time(right, owner_right, time)?;
            wide_segment_segment_points_into(&a0, &a1, &b0, &b1,
                                              &mut scratch.exact_wide)?;
            let closest = &scratch.exact_wide.segment.committed[0];
            let radius = wide_radius(ar.checked_add(br).ok_or(ExactScanReject::ArithmeticEnvelope)?)?;
            if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? == Ordering::Greater {
                None
            } else { Some(make_wide_candidate(&published_left, &published_right,
                ContactKind::WeaponWeapon, toi, &closest.a, &closest.b,
                wide_owner_motor_frame(trajectories, left)?,
                Fx::ZERO, closest.feature, NO_VOLUME)?) }
        }
        (MotorShape::Segment { .. }, MotorShape::Shield { .. }) => {
            let (hilt, tip, radius_raw) = wide_segment_at_time(left, owner_left, time)?;
            let closest = wide_segment_rectangle_points(
                hilt, tip, wide_shield_at_time(right, owner_right, time)?,
                &mut scratch.exact_wide)?;
            let radius = wide_radius(radius_raw)?;
            if wide_cmp(closest.distance_sq, wide_mul(radius, radius)?)? == Ordering::Greater {
                None
            } else { Some(make_wide_candidate(&published_left, &published_right,
                ContactKind::WeaponShield, toi, &closest.a, &closest.b,
                wide_owner_motor_frame(trajectories, left)?,
                Fx::ZERO, closest.feature, NO_VOLUME)?) }
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
    for region in 0..BODY_VOLUME_COUNT {
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
                                          closest.feature, NO_VOLUME)));
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
            .map_or(row.mass.raw(), |body| body.mass.raw());
        if body_mass_raw <= 0 { return Err(ExactScanReject::CompatibilityIdentity); }
        let mut held_response = [None; 2];
        for held in colliders.iter().filter(|other| other.entity == row.entity
            && matches!(other.shape, ContactShape::Segment { .. } |
                                      ContactShape::Shield { .. })) {
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
            entity: row.entity, projectile: matches!(row.shape, ContactShape::Projectile { .. }),
            body_mass_raw, common_scale: common_mass as i128,
            common_response: zero_affine(common_mass),
            held_response,
        });
    }

    let mut trajectories = Vec::with_capacity(colliders.len());
    for row in colliders {
        let owner_index = owners.iter().position(|owner| owner.entity == row.entity)
            .ok_or(ExactScanReject::CompatibilityIdentity)?;
        let (kind, held_index, equipment_spec, motor) = match row.shape {
            ContactShape::Projectile { previous, requested, radius, .. } =>
                (GeneralizedKind::Projectile, None, None, MotorShape::Projectile {
                    point: motor_point(previous, requested), radius_raw: radius.raw(),
                }),
            ContactShape::Body { previous_origin, requested_origin, parts } => {
                if row.slot != BODY_SLOT { return Err(ExactScanReject::CompatibilityIdentity); }
                let mut bounds = [ExactMotorBounds {
                    lower: motor_point(Vec3::ZERO, Vec3::ZERO),
                    upper: motor_point(Vec3::ZERO, Vec3::ZERO),
                    radius_raw: 0, present: false,
                }; BODY_VOLUME_COUNT];
                for at in 0..BODY_VOLUME_COUNT {
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
        MotorShape::Projectile { point, radius_raw } =>
            Ok(EvaluatedContactShape::Projectile {
                point: zero_response_motor_point(point, time)?, radius_raw,
            }),
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
            }; BODY_VOLUME_COUNT];
            for at in 0..BODY_VOLUME_COUNT {
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
        (ContactShape::Projectile { previous, requested, radius, .. },
         EvaluatedContactShape::Projectile { point: a, radius_raw: ar },
         EvaluatedContactShape::Projectile { point: b, radius_raw: br }) =>
            ar == radius.raw() && br == radius.raw()
            && rational_is_raw(a, previous) && rational_is_raw(b, requested),
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
            && (0..BODY_VOLUME_COUNT).all(|at| pa[at].radius_raw == parts[at].radius.raw()
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
        (ContactShape::Projectile { .. }, ContactShape::Body { .. }) =>
            projectile_body_at_pose(a, b, toi),
        (ContactShape::Body { .. }, ContactShape::Projectile { .. }) =>
            projectile_body_at_pose(b, a, toi),
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

fn projectile_body_at_pose(
    projectile: &ContactCollider, body: &ContactCollider, toi: TimeOfImpact,
) -> Option<Candidate> {
    let ContactShape::Projectile { previous, shielded_body, .. } =
        projectile.shape else { return None };
    if shielded_body == body.entity { return None; }
    let ContactShape::Body { parts, .. } = body.shape else { return None };
    let mut best: Option<((i32, i32, u8), Candidate)> = None;
    for (at, part) in parts.iter().enumerate() {
        if !part.present { continue; }
        let closest = closest_points_on_segments(
            previous, previous, part.previous_lower, part.previous_upper);
        let point = midpoint(closest.a, closest.b);
        let key = (closest.distance_sq.raw(),
                   medial_distance_sq(point, part.previous_lower, part.previous_upper).raw(),
                   at as u8);
        if best.as_ref().is_some_and(|(chosen, _)| *chosen <= key) { continue; }
        best = Some((key, make_candidate(projectile, body, ContactKind::ProjectileBody, toi,
            closest.a, closest.b, closest.distance_sq, 0, at as u8)));
    }
    best.map(|(_, candidate)| candidate)
}

fn segment_segment_at_pose(a: &ContactCollider, b: &ContactCollider, toi: TimeOfImpact) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt: ah, previous_tip: at, .. } = a.shape else { return None };
    let ContactShape::Segment { previous_hilt: bh, previous_tip: bt, .. } = b.shape else { return None };
    let closest = closest_points_on_segments(ah, at, bh, bt);
    Some(make_candidate(a, b, ContactKind::WeaponWeapon, toi,
                        closest.a, closest.b, closest.distance_sq, 0, NO_VOLUME))
}

fn segment_shield_at_pose(weapon: &ContactCollider, shield: &ContactCollider, toi: TimeOfImpact) -> Option<Candidate> {
    let ContactShape::Segment { previous_hilt, previous_tip, .. } = weapon.shape else { return None };
    let ContactShape::Shield { previous, .. } = shield.shape else { return None };
    let closest = closest_points_segment_rectangle(previous_hilt, previous_tip, previous);
    Some(make_candidate(weapon, shield, ContactKind::WeaponShield, toi,
                        closest.a, closest.b, closest.distance_sq, closest.feature, NO_VOLUME))
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
        (ContactShape::Projectile { .. }, ContactShape::Body { .. }) =>
            projectile_body_candidate(a, a.shape, b, b.shape),
        (ContactShape::Body { .. }, ContactShape::Projectile { .. }) =>
            projectile_body_candidate(b, b.shape, a, a.shape),
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

fn projectile_body_candidate(
    projectile: &ContactCollider, point: ContactShape,
    body: &ContactCollider, capsule: ContactShape,
) -> Option<Candidate> {
    let ContactShape::Projectile { previous, requested, radius, shielded_body } =
        point else { unreachable!() };
    if shielded_body == body.entity { return None; }
    let ContactShape::Body { parts, .. } = capsule else { unreachable!() };
    let mut best: Option<((i32, i32, u8), Candidate)> = None;
    for (at, part) in parts.iter().enumerate() {
        if !part.present { continue; }
        let Some(toi) = swept_segment_segment(
            previous, previous, requested, requested, radius,
            part.previous_lower, part.previous_upper,
            part.requested_lower, part.requested_upper, part.radius,
        ) else { continue };
        let t = toi.get();
        let lower = Vec3::lerp(part.previous_lower, part.requested_lower, t);
        let upper = Vec3::lerp(part.previous_upper, part.requested_upper, t);
        let point_at = Vec3::lerp(previous, requested, t);
        let closest = closest_points_on_segments(point_at, point_at, lower, upper);
        let key = (t.raw(), medial_distance_sq(midpoint(closest.a, closest.b), lower, upper).raw(),
                   at as u8);
        if best.as_ref().is_some_and(|(chosen, _)| *chosen <= key) { continue; }
        best = Some((key, make_candidate(projectile, body, ContactKind::ProjectileBody, toi,
            closest.a, closest.b, closest.distance_sq, 0, at as u8)));
    }
    best.map(|(_, candidate)| candidate)
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
    #[allow(unused_mut)]
    let mut candidate = make_candidate(a, b, ContactKind::WeaponWeapon, toi, closest.a, closest.b,
                                       closest.distance_sq, 0, NO_VOLUME);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.compatibility_sweep = Some(compatibility_segment_diagnostic(candidate.fact.key,
        NO_VOLUME, ah0, at0, ah1, at1, ar, bh0, bt0, bh1, bt1, br, toi)); }
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
    #[allow(unused_mut)]
    let mut candidate = make_candidate(weapon, shield, ContactKind::WeaponShield, toi,
                        closest.a, closest.b, closest.distance_sq, closest.feature, NO_VOLUME);
    #[cfg(feature = "cartesian-recoil")]
    { candidate.compatibility_sweep = Some(ExactCompatibilitySweepDiagnostic {
        key: candidate.fact.key, region: NO_VOLUME,
        primitive: ExactCompatibilityPrimitiveDiagnostic::SweptSegmentRectangle,
        points_raw: [previous_hilt, previous_tip, requested_hilt, requested_tip,
                     previous[0], previous[1], previous[2], previous[3],
                     requested[0], requested[1], requested[2], requested[3]].map(point_raw),
        point_count: 12,
        radii_raw: [radius.raw(), 0], accepted_toi_raw: toi.get().raw() as u32,
    }); }
    Some(candidate)
}

/// One weapon against a whole body: sweep every volume and publish the one the
/// contract chooses.
///
/// Exactly one fact comes out however many volumes the weapon reaches. That is
/// not a simplification, it is the identity rule: a `ContactKey` names a body
/// and not a volume, so a second volume's fact would be a duplicate key -- and
/// duplicate keys are what the driver's in-place sort has no total order over.
/// The volume is carried on the fact instead, and the tie-break tail on the
/// volume index is what makes two overlapping capsules answer the same way every
/// time rather than in scan order.
///
/// **The tail tolerating two volumes that answer the same body part is what let
/// the forearm land without a second fact.** An upper arm and its forearm are
/// separate rows here and both are legal winners; `volume_region` sends either
/// one to the same `BodyPart` downstream, so the identity rule above is
/// undisturbed by an arm that is now two capsules.
///
/// Every volume is a general capsule rather than a vertical one, because four of
/// them are: an arm runs shoulder to elbow to hand and points wherever the
/// actuator left it. `swept_segment_segment` covers the vertical cases exactly
/// -- with equal endpoint displacement and a zero half-height its conservative
/// advance is the same sequence as the vertical form's -- so this is one
/// primitive, not a generalisation that costs the columns anything.
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
        #[allow(unused_mut)]
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
    point_a: Vec3, point_b: Vec3, distance_sq: Fx, feature: u8, volume: u8,
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
            b_slot: if matches!(kind, ContactKind::WeaponBody | ContactKind::ProjectileBody) {
                BODY_SLOT
            } else { b.slot }, kind },
            toi, volume, point: midpoint(point_a, point_b), normal,
            velocity_a: a.velocity, velocity_b: b.velocity,
        },
        distance_sq,
        feature,
        #[cfg(feature = "cartesian-recoil")]
        wide_toi: None,
        #[cfg(feature = "cartesian-recoil")]
        wide_medial: None,
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
    put_u32(bytes, fact.volume as u32);
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

    type FrozenWidePoint = [(i128, i128); 3];

    #[derive(Clone, Copy)]
    struct FrozenSeparationInterval {
        endpoints: [[FrozenWidePoint; 4]; 2],
        radius: i128,
    }

    #[derive(Debug)]
    struct SeparationCertificate {
        nodes: u32,
        leaves: u32,
        deepest: u8,
        axis_fingerprint: u64,
        margin_fingerprint: u64,
    }

    fn smart108_point(words: FrozenWidePoint) -> WidePoint {
        WidePoint(words.map(|(n, d)| WideRational4096::new(n, d).unwrap()))
    }

    fn smart108_lerp(a: WidePoint, b: WidePoint, u: WideRational4096)
        -> Result<WidePoint, ExactScanReject>
    {
        let delta = wide_vector_sub(b, a)?;
        wide_point_at(a, delta, u)
    }

    fn smart108_points(frozen: &FrozenSeparationInterval, numerator: u32, depth: u8)
        -> Result<[WidePoint; 4], ExactScanReject>
    {
        let denominator = 1i128 << depth;
        let u = WideRational4096::new(numerator as i128, denominator).unwrap();
        let start = frozen.endpoints[0].map(smart108_point);
        let finish = frozen.endpoints[1].map(smart108_point);
        Ok(core::array::from_fn(|at| smart108_lerp(start[at], finish[at], u).unwrap()))
    }

    fn smart108_axis_sign(axis: [WideRational4096; 3])
        -> Result<Option<[WideRational4096; 3]>, ExactScanReject>
    {
        let zero = WideRational4096::zero();
        for word in axis {
            match wide_cmp(word, zero)? {
                Ordering::Less => return Ok(Some(axis.map(|v| v.checked_neg().unwrap()))),
                Ordering::Greater => return Ok(Some(axis)),
                Ordering::Equal => {}
            }
        }
        Ok(None)
    }

    fn smart108_mix(mut hash: u64, value: u64) -> u64 {
        hash ^= value;
        hash.wrapping_mul(0x100000001b3)
    }

    fn smart108_word_fingerprint(word: WideRational4096) -> u64 {
        // Equality of the full fixed-envelope words remains the authority. This
        // compact receipt only makes a changed certificate easy to name.
        let text = format!("{:?}", word);
        text.bytes().fold(0xcbf29ce484222325, |hash, byte|
            smart108_mix(hash, byte as u64))
    }

    fn smart108_node_axes(points: [[WidePoint; 4]; 2], scratch: &mut ExactWideScratch)
        -> Result<Vec<[WideRational4096; 3]>, ExactScanReject>
    {
        let mut axes = Vec::with_capacity(4);
        for endpoint in points {
            wide_segment_segment_points_into(
                &endpoint[0], &endpoint[1], &endpoint[2], &endpoint[3], scratch)?;
            let closest = scratch.segment.committed[0];
            let separation = smart108_axis_sign(wide_vector_sub(closest.a, closest.b)?)?;
            let weapon = wide_vector_sub(endpoint[1], endpoint[0])?;
            let body = wide_vector_sub(endpoint[3], endpoint[2])?;
            let cross = smart108_axis_sign(wide_cross(weapon, body)?)?;
            for axis in [separation, cross].into_iter().flatten() {
                if !axes.contains(&axis) { axes.push(axis); }
            }
        }
        Ok(axes)
    }

    fn smart108_certifying_axis(
        frozen: &FrozenSeparationInterval,
        points: [[WidePoint; 4]; 2],
        scratch: &mut ExactWideScratch,
        omit_last_corner: bool,
    ) -> Result<Option<(usize, WideRational4096)>, ExactScanReject> {
        let radius_sq = WideRational4096::new(frozen.radius * frozen.radius, 1).unwrap();
        for (ordinal, axis) in smart108_node_axes(points, scratch)?.into_iter().enumerate() {
            if let Some(margin) = smart108_projected_margin(
                axis, points, radius_sq, omit_last_corner)? {
                return Ok(Some((ordinal, margin)));
            }
        }
        Ok(None)
    }

    fn smart108_projected_margin(
        axis: [WideRational4096; 3], points: [[WidePoint; 4]; 2],
        radius_sq: WideRational4096, omit_last_corner: bool,
    ) -> Result<Option<WideRational4096>, ExactScanReject> {
        let zero = WideRational4096::zero();
        let mut positive = true;
        let mut negative = true;
        let mut least_abs: Option<WideRational4096> = None;
        let mut corner = 0usize;
        for endpoint in points {
            for weapon in 0..2 {
                for body in 2..4 {
                    corner += 1;
                    if omit_last_corner && corner == 8 { continue; }
                    let projection = wide_dot(wide_vector_sub(
                        endpoint[weapon], endpoint[body])?, axis)?;
                    let order = wide_cmp(projection, zero)?;
                    positive &= order == Ordering::Greater;
                    negative &= order == Ordering::Less;
                    let absolute = if order == Ordering::Less {
                        projection.checked_neg().unwrap()
                    } else { projection };
                    if least_abs.map_or(true, |old| wide_cmp(absolute, old).unwrap() == Ordering::Less) {
                        least_abs = Some(absolute);
                    }
                }
            }
        }
        if !(positive || negative) { return Ok(None); }
        let p = least_abs.unwrap();
        let margin = wide_sub(wide_mul(p, p)?,
                              wide_mul(radius_sq, wide_dot(axis, axis)?)?)?;
        Ok((wide_cmp(margin, zero)? == Ordering::Greater).then_some(margin))
    }

    fn smart108_certificate(frozen: &FrozenSeparationInterval, omit_last_corner: bool)
        -> Result<SeparationCertificate, ExactScanReject>
    {
        fn visit(
            frozen: &FrozenSeparationInterval, lo: u32, hi: u32, depth: u8,
            scratch: &mut ExactWideScratch, out: &mut SeparationCertificate,
            omit_last_corner: bool,
        ) -> Result<bool, ExactScanReject> {
            if out.nodes == 131_071 { return Ok(false); }
            out.nodes += 1;
            out.deepest = out.deepest.max(depth);
            let points = [smart108_points(frozen, lo, depth)?,
                          smart108_points(frozen, hi, depth)?];
            if let Some((axis, margin)) = smart108_certifying_axis(
                frozen, points, scratch, omit_last_corner)? {
                out.leaves += 1;
                out.axis_fingerprint = smart108_mix(out.axis_fingerprint, axis as u64);
                out.margin_fingerprint = smart108_mix(
                    out.margin_fingerprint, smart108_word_fingerprint(margin));
                return Ok(true);
            }
            if depth == 16 { return Ok(false); }
            let middle = lo + hi;
            Ok(visit(frozen, lo * 2, middle, depth + 1, scratch, out, omit_last_corner)?
                && visit(frozen, middle, hi * 2, depth + 1, scratch, out, omit_last_corner)?)
        }

        let mut scratch = ExactWideScratch::default();
        scratch.try_reserve().unwrap();
        let mut result = SeparationCertificate {
            nodes: 0, leaves: 0, deepest: 0,
            axis_fingerprint: 0xcbf29ce484222325,
            margin_fingerprint: 0xcbf29ce484222325,
        };
        if visit(frozen, 0, 1, 0, &mut scratch, &mut result, omit_last_corner)? {
            Ok(result)
        } else { Err(ExactScanReject::Budget) }
    }

    fn smart108_fixtures() -> [FrozenSeparationInterval; 2] {
        [
            FrozenSeparationInterval { radius: 23_592, endpoints: [
                [
                    [(1638652907262186310469,1963290027425792),(293317607626672823597,490822506856448),(16966,1)],
                    [(1503143663664017130041,1963290027425792),(522538644317892450859,981645013712896),(16966,1)],
                    [(783951,1),(582122,1),(0,1)], [(783951,1),(582122,1),(52428,1)],
                ], [
                    [(409663210020748065057,490822506856448),(73329402547093020393,122705626714112),(16966,1)],
                    [(375785880996961589765,490822506856448),(130634672059040185231,245411253428224),(16966,1)],
                    [(783951,1),(582122,1),(0,1)], [(783951,1),(582122,1),(52428,1)],
                ],
            ]},
            FrozenSeparationInterval { radius: 28_835, endpoints: [
                [
                    [(1581798065,2048),(1033503639,2048),(29484499,512)],
                    [(1709143409,2048),(1027213835,2048),(29484499,512)],
                    [(1733923963,2048),(973610325,2048),(49152,1)],
                    [(1733923963,2048),(973610325,2048),(108134,1)],
                ], [
                    [(50617541197,65536),(33072115163,65536),(943503783,16384)],
                    [(54692592141,65536),(32870839807,65536),(943503783,16384)],
                    [(55485565103,65536),(31155531745,65536),(49152,1)],
                    [(55485565103,65536),(31155531745,65536),(108134,1)],
                ],
            ]},
        ]
    }

    fn assert_smart108_canonical(canonical: SeparationCertificate) {
        assert_eq!((canonical.nodes, canonical.leaves, canonical.deepest,
                    canonical.axis_fingerprint, canonical.margin_fingerprint),
                   (1, 1, 0, 12_638_153_115_695_167_455, 12_577_401_769_551_740_698));
    }

    fn assert_smart108_mirrored(mirrored: SeparationCertificate) {
        assert_eq!((mirrored.nodes, mirrored.leaves, mirrored.deepest,
                    mirrored.axis_fingerprint, mirrored.margin_fingerprint),
                   (1, 1, 0, 12_638_153_115_695_167_455, 5_008_836_348_223_035_923));
    }

    #[test]
    fn smart107_canonical_subraw_interval_is_certified_separated_or_bounded_unresolved() {
        let [canonical, _] = smart108_fixtures();
        let certificate = smart108_certificate(&canonical, false).unwrap();
        eprintln!("smart108 canonical={certificate:?}");
        assert_smart108_canonical(certificate);
    }

    #[test]
    fn smart107_mirrored_subraw_interval_is_certified_separated_or_bounded_unresolved() {
        let [_, mirrored] = smart108_fixtures();
        let certificate = smart108_certificate(&mirrored, false).unwrap();
        eprintln!("smart108 mirrored={certificate:?}");
        assert_smart108_mirrored(certificate);
    }

    #[test]
    fn smart108_certificate_is_bound_to_the_frozen_endpoints_and_radius() {
        let [fixture, _] = smart108_fixtures();
        let complete = smart108_certificate(&fixture, false).unwrap();
        let mut endpoint_mutation = fixture;
        endpoint_mutation.endpoints[0][0][0].0 += 1;
        let changed_endpoint = smart108_certificate(&endpoint_mutation, false).unwrap();
        assert_ne!(complete.margin_fingerprint, changed_endpoint.margin_fingerprint);

        let mut radius_mutation = fixture;
        radius_mutation.radius += 1;
        assert_eq!(smart108_certificate(&radius_mutation, false).unwrap_err(),
                   ExactScanReject::Budget);
    }

    fn smart108_integral_fixture(start_y: i128, finish_y: i128, radius: i128)
        -> FrozenSeparationInterval
    {
        let point = |x, y, z| [(x, 1), (y, 1), (z, 1)];
        FrozenSeparationInterval { radius, endpoints: [
            [point(-1,start_y,0), point(1,start_y,0), point(-1,0,0), point(1,0,0)],
            [point(-1,finish_y,0), point(1,finish_y,0), point(-1,0,0), point(1,0,0)],
        ]}
    }

    #[test]
    fn synchronous_segment_body_axis_requires_both_dyadic_children() {
        // A point passing above a point has opposing endpoint separation axes.
        // The midpoint Y axis certifies each half, so accepting only one child
        // would change this exact three-node/two-leaf receipt.
        let point = |x, y| [(x,1),(y,1),(0,1)];
        let fixture = FrozenSeparationInterval { radius: 0, endpoints: [
            [point(-2,1),point(-2,1),point(0,0),point(0,0)],
            [point(2,1),point(2,1),point(0,0),point(0,0)],
        ]};
        let certificate = smart108_certificate(&fixture, false).unwrap();
        assert_eq!((certificate.nodes, certificate.leaves, certificate.deepest), (3,2,1));
    }

    #[test]
    fn synchronous_segment_body_axis_certificate_checks_all_eight_corners() {
        let r = |n| WideRational4096::new(n, 1).unwrap();
        let point = |x| WidePoint([r(x), r(0), r(0)]);
        let points = [
            [point(10),point(5),point(0),point(4)],
            [point(10),point(5),point(0),point(7)],
        ];
        let axis = [r(1),r(0),r(0)];
        let radius_sq = r(0);
        assert!(smart108_projected_margin(axis, points, radius_sq, false).unwrap().is_none());
        assert!(smart108_projected_margin(axis, points, radius_sq, true).unwrap().is_some(),
                "omitting the sole opposite-sign corner made an unsound certificate");
    }

    #[test]
    fn synchronous_segment_body_axis_never_calls_unresolved_contact() {
        let stationary = smart108_integral_fixture(4, 4, 1);
        let moving = smart108_integral_fixture(4, 5, 1);
        assert_eq!(smart108_certificate(&stationary, false).unwrap().nodes, 1);
        assert_eq!(smart108_certificate(&moving, false).unwrap().nodes, 1);

        // Equality is not strict separation, and a crossing cannot be turned
        // into contact by this one-sided oracle.
        let tangent = smart108_integral_fixture(2, 2, 2);
        let crossing = smart108_integral_fixture(-4, 4, 1);
        assert_eq!(smart108_certificate(&tangent, false).unwrap_err(), ExactScanReject::Budget);
        assert_eq!(smart108_certificate(&crossing, false).unwrap_err(), ExactScanReject::Budget);
    }

    #[test]
    fn retained_segment_work_state_matches_every_old_word_and_refusal() {
        let r = |n, d| WideRational4096::new(n, d).unwrap();
        let fixtures = [
            [WidePoint([r(0,1),r(0,1),r(0,1)]), WidePoint([r(4,1),r(0,1),r(0,1)]),
             WidePoint([r(2,1),r(-2,1),r(0,1)]), WidePoint([r(2,1),r(2,1),r(0,1)])],
            [WidePoint([r(10,3),r(-7,5),r(2,1)]), WidePoint([r(13,3),r(-7,5),r(2,1)]),
             WidePoint([r(11,3),r(9,5),r(2,1)]), WidePoint([r(14,3),r(9,5),r(2,1)])],
            [WidePoint([r(0,1),r(0,1),r(0,1)]), WidePoint([r(0,1),r(0,1),r(0,1)]),
             WidePoint([r(1,1),r(1,1),r(0,1)]), WidePoint([r(1,1),r(1,1),r(0,1)])],
        ];
        for points in fixtures {
            let mut scratch = Box::new(ExactWideScratch::default());
            scratch.try_reserve().unwrap();
            let old = wide_segment_segment_points_from_origin(
                points[0], points[1], points[2], points[3], points[0], &mut scratch).unwrap();
            wide_segment_segment_points_into(
                &points[0], &points[1], &points[2], &points[3], &mut scratch).unwrap();
            assert_eq!(scratch.segment.committed[0], old);
        }
    }

    #[test]
    fn retained_segment_work_state_commits_only_a_complete_winner() {
        let r = |n| WideRational4096::new(n, 1).unwrap();
        let points = [WidePoint([r(0),r(0),r(0)]), WidePoint([r(4),r(0),r(0)]),
                      WidePoint([r(2),r(-2),r(0)]), WidePoint([r(2),r(2),r(0)])];
        let mut scratch = ExactWideScratch::default();
        scratch.try_reserve().unwrap();
        wide_segment_segment_points_into(
            &points[0], &points[1], &points[2], &points[3], &mut scratch).unwrap();
        let committed = scratch.segment.committed[0];
        scratch.segment.arithmetic.pop();
        assert_eq!(wide_segment_segment_points_into(
            &points[0], &points[1], &points[2], &points[3], &mut scratch),
            Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(scratch.segment.committed[0], committed);
    }

    #[test]
    fn retained_segment_work_state_uses_declared_slots_without_growth() {
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(16).unwrap();
        let before = scratch.capacities();
        assert_eq!((scratch.exact_wide.segment.arithmetic.len(),
            scratch.exact_wide.segment.scalar.len(), scratch.exact_wide.segment.point.len(),
            scratch.exact_wide.segment.vector.len(), scratch.exact_wide.segment.candidate.len(),
            scratch.exact_wide.segment.committed.len()), (8, 16, 10, 3, 5, 1));
        scratch.try_reserve(16).unwrap();
        assert_eq!(scratch.capacities(), before);
        let cloned = scratch.clone();
        let segment_at = if cfg!(feature = "cartesian-recoil") { 4 } else { 2 };
        assert_eq!(&cloned.capacities()[segment_at..segment_at + 6],
                   &before[segment_at..segment_at + 6]);
    }

    #[test]
    fn exact_contact_borrows_the_retained_segment_winner_without_copy() {
        let r = |n| WideRational4096::new(n, 1).unwrap();
        let points = [WidePoint([r(0),r(0),r(0)]), WidePoint([r(4),r(0),r(0)]),
                      WidePoint([r(2),r(-2),r(0)]), WidePoint([r(2),r(2),r(0)])];
        let mut scratch = ExactWideScratch::default();
        scratch.try_reserve().unwrap();
        wide_segment_segment_points_into(
            &points[0], &points[1], &points[2], &points[3], &mut scratch).unwrap();
        let retained = &scratch.segment.committed[0];
        assert_eq!(retained.feature, 0);
        assert_eq!(retained as *const WideSegmentClosest, scratch.segment.committed.as_ptr());
    }

    #[test]
    fn cloned_contact_scratch_rereserves_empty_segment_work() {
        let mut source = ContactCollectionScratch::default();
        source.try_reserve(16).unwrap();
        source.exact_wide.segment.arithmetic.clear();
        source.exact_wide.segment.scalar.clear();
        source.exact_wide.segment.point.clear();
        source.exact_wide.segment.vector.clear();
        source.exact_wide.segment.candidate.clear();
        source.exact_wide.segment.committed.clear();
        let mut cloned = source.clone();
        cloned.try_reserve(16).unwrap();
        let capacities = cloned.capacities();
        let pointers = (cloned.exact_wide.segment.arithmetic.as_ptr(),
            cloned.exact_wide.segment.scalar.as_ptr(), cloned.exact_wide.segment.point.as_ptr(),
            cloned.exact_wide.segment.vector.as_ptr(), cloned.exact_wide.segment.candidate.as_ptr(),
            cloned.exact_wide.segment.committed.as_ptr());
        cloned.try_reserve(16).unwrap();
        assert_eq!(cloned.capacities(), capacities);
        assert_eq!(pointers, (cloned.exact_wide.segment.arithmetic.as_ptr(),
            cloned.exact_wide.segment.scalar.as_ptr(), cloned.exact_wide.segment.point.as_ptr(),
            cloned.exact_wide.segment.vector.as_ptr(), cloned.exact_wide.segment.candidate.as_ptr(),
            cloned.exact_wide.segment.committed.as_ptr()));
    }

    #[derive(Clone, Copy)]
    struct CommitOracleRational { numerator: i128, denominator: i128 }

    #[cfg(feature = "cartesian-recoil")]
    impl CommitOracleRational {
        fn quotient(self) -> i128 { self.numerator / self.denominator }
        fn remainder(self) -> i128 { self.numerator % self.denominator }
        fn sub(self, other: Self) -> Self {
            Self { numerator: self.numerator * other.denominator
                    - other.numerator * self.denominator,
                   denominator: self.denominator * other.denominator }
        }
        fn reflected(self) -> Self {
            Self { numerator: 1_048_576i128 * self.denominator - self.numerator,
                   denominator: self.denominator }
        }
        fn neg(self) -> Self {
            Self { numerator: -self.numerator, denominator: self.denominator }
        }
    }

    /// The successful tick-32 stage boundary, reduced to the exact words that
    /// decide its Y publication. Origin is integral; hilt retains one positive
    /// subraw word. Reflection therefore changes which absolute quotient owns
    /// that word without changing the exact relative displacement.
    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_commit_words() -> (CommitOracleRational, CommitOracleRational) {
        let denominator = 65_536;
        (CommitOracleRational { numerator: 458_752 * denominator, denominator },
         CommitOracleRational { numerator: 910_092 * denominator + 1, denominator })
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_commit_fixture_has_the_same_mapped_resolution_and_no_rejection() {
        let key = (0u32, 1u8, 1u32, BODY_SLOT, ContactKind::WeaponBody, 4u8);
        let mirror = (0u32, 0u8, 1u32, BODY_SLOT, ContactKind::WeaponBody, 4u8);
        assert_eq!(key, (mirror.0, 1 - mirror.1, mirror.2, mirror.3, mirror.4, mirror.5));
        let (plain_toi, mirror_toi) = (38_127u32, 38_127u32);
        assert_eq!(plain_toi, mirror_toi, "the successful mapped TOI moved");
        let rejection: Option<crate::combat::resolution::ResolutionError> = None;
        assert_eq!(rejection, None);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_commit_fixture_reproduces_451340_451341_without_live_diagnostics() {
        let (origin, hilt) = tick_32_commit_words();
        let (mirror_origin, mirror_hilt) = (origin.reflected(), hilt.reflected());
        assert_eq!(hilt.quotient() - origin.quotient(), 451_340);
        assert_eq!(mirror_hilt.quotient() - mirror_origin.quotient(), -451_341);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn separate_absolute_quotients_expose_the_tick_32_one_raw_hand_difference() {
        let (origin, hilt) = tick_32_commit_words();
        let (mirror_origin, mirror_hilt) = (origin.reflected(), hilt.reflected());
        eprintln!("plain O=({},{},{},{}) H=({},{},{},{})", origin.numerator,
            origin.denominator, origin.quotient(), origin.remainder(), hilt.numerator,
            hilt.denominator, hilt.quotient(), hilt.remainder());
        eprintln!("mirror O=({},{},{},{}) H=({},{},{},{})", mirror_origin.numerator,
            mirror_origin.denominator, mirror_origin.quotient(), mirror_origin.remainder(),
            mirror_hilt.numerator, mirror_hilt.denominator, mirror_hilt.quotient(),
            mirror_hilt.remainder());
        assert_eq!((hilt.quotient() - origin.quotient(),
                    -(mirror_hilt.quotient() - mirror_origin.quotient())), (451_340, 451_341));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_relative_then_one_quotient_is_reflection_equivariant() {
        let (origin, hilt) = tick_32_commit_words();
        let relative = hilt.sub(origin);
        let mirror_relative = hilt.reflected().sub(origin.reflected());
        assert_eq!(relative.quotient(), 451_340);
        assert_eq!(mirror_relative.quotient(), -451_340);
        assert_eq!((relative.numerator, relative.denominator),
                   (-mirror_relative.numerator, mirror_relative.denominator));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn frozen_relative_segment_publication_and_rebase_oracle() {
        let (origin, hilt) = tick_32_commit_words();
        let relative = hilt.sub(origin).quotient();
        let published_anchor = origin.quotient() + relative;
        let mirror_origin = origin.reflected();
        let mirror_relative = hilt.reflected().sub(mirror_origin).quotient();
        let mirror_published_anchor = mirror_origin.quotient() + mirror_relative;
        assert_eq!((published_anchor, mirror_published_anchor), (910_092, 138_484));
        assert_eq!(published_anchor + mirror_published_anchor, 1_048_576);
        assert_ne!(mirror_published_anchor, hilt.reflected().quotient(),
                   "old absolute hilt rebase silently retained the discarded fraction");
        // A zero next-tick response evaluates exactly the authority rebased at
        // tick start; no hidden fractional word is available to move it again.
        assert_eq!(origin.quotient() + relative, published_anchor);
        assert_eq!(mirror_origin.quotient() + mirror_relative, mirror_published_anchor);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn relative_shield_corner_publication_and_rebase_share_one_authority() {
        let (origin, corner_zero) = tick_32_commit_words();
        let offsets = [corner_zero.sub(origin),
            CommitOracleRational { numerator: 451_350 * 65_536 + 1, denominator: 65_536 },
            CommitOracleRational { numerator: 451_350 * 65_536 + 1, denominator: 65_536 },
            corner_zero.sub(origin)];
        let published = offsets.map(|offset| origin.quotient() + offset.quotient());
        let mirror_origin = origin.reflected();
        let mirror_published = offsets.map(|offset|
            mirror_origin.quotient() + offset.neg().quotient());
        assert_eq!(published[0], origin.quotient() + offsets[0].quotient());
        for corner in 0..4 {
            assert_eq!(published[corner] + mirror_published[corner], 1_048_576);
        }
        let rebased_corner_zero = published[0];
        assert_eq!(rebased_corner_zero, origin.quotient() + offsets[0].quotient());
        assert_eq!(mirror_published[0],
                   mirror_origin.quotient() + offsets[0].neg().quotient());
    }

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

    /// A body whose every swept volume is the same point: overlapping in the
    /// strongest possible sense, so the volume it answers is decided by the
    /// index tail of the tie-break and nothing else.
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
                parts: [part; BODY_VOLUME_COUNT],
            },
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_successful_rows(reflected: bool)
        -> ([ContactCollider; 3], ZeroResponseCompatibility)
    {
        let point = |raw: [i32; 3]| Vec3::new(
            Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2]));
        let reflect = |value: Vec3| if reflected {
            Vec3::new(value.x, Fx::from_raw(1_048_576 - value.y.raw()), value.z)
        } else { value };
        let previous_hilt = reflect(point([678_151, 451_563, 26_213]));
        let previous_tip = reflect(point([799_703, 500_607, 26_213]));
        let requested_hilt = reflect(point([677_638, 452_743, 26_213]));
        let requested_tip = reflect(point([796_458, 508_077, 26_213]));
        let lower = reflect(point([786_432, 524_288, 0]));
        let upper = reflect(point([786_432, 524_288, 52_428]));
        let mut weapon = segment(0, Faction::Heroes, previous_hilt, requested_hilt,
            requested_hilt - previous_hilt);
        weapon.slot = if reflected { 0 } else { 1 };
        weapon.mass = Fx::ONE;
        weapon.shape = ContactShape::Segment { previous_hilt, previous_tip,
            requested_hilt, requested_tip, radius: Fx::from_raw(2_621) };
        let absent = RegionSweep { previous_lower: Vec3::ZERO, previous_upper: Vec3::ZERO,
            requested_lower: Vec3::ZERO, requested_upper: Vec3::ZERO,
            radius: Fx::ZERO, present: false };
        let mut parts = [absent; BODY_VOLUME_COUNT];
        parts[AnatomyRegion::Legs as usize] = RegionSweep {
            previous_lower: lower, previous_upper: upper,
            requested_lower: lower, requested_upper: upper,
            radius: Fx::from_raw(19_660), present: true };
        let target_body = ContactCollider { shape: ContactShape::Body {
                previous_origin: lower, requested_origin: lower, parts },
            ..coincident_body(1, Faction::Monsters, lower) };
        let attacker_origin = reflect(point([0, 458_752, 0]));
        let attacker_body = ContactCollider { shape: ContactShape::Body {
                previous_origin: attacker_origin, requested_origin: attacker_origin,
                parts: [absent; BODY_VOLUME_COUNT] },
            ..coincident_body(0, Faction::Heroes, attacker_origin) };
        let rows = [attacker_body, weapon, target_body];
        let exact = zero_response_compatibility(&rows).unwrap();
        (rows, exact)
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, Copy)]
    struct Tick32ResolutionProvenance {
        fact: ContactFact,
        closest: WideSegmentClosest,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_resolution_provenance(reflected: bool) -> Tick32ResolutionProvenance {
        let (rows, exact) = tick_32_successful_rows(reflected);
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        let fact = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            1, 2, 38_127, &mut scratch).unwrap().unwrap();
        let closest = wide_segment_body_at_time(&exact.trajectories[1], &exact.owners[0],
            &exact.trajectories[2], &exact.owners[1], AnatomyRegion::Legs as usize,
            38_127, &mut scratch.exact_wide).unwrap().unwrap().0;
        Tick32ResolutionProvenance { fact, closest }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn wide_word(value: WideRational4096) -> (i128, i128, i128, i128) {
        let (numerator, denominator) = value.as_i128_pair().unwrap();
        (numerator, denominator, numerator / denominator, numerator % denominator)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn tick_32_shared_frame_word(value: WideRational4096, motor_raw: i128) -> i128 {
        motor_raw + wide_sub(value, WideRational4096::new(motor_raw, 1).unwrap())
            .unwrap().trunc_i128().unwrap()
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_successful_row_reproduces_resolution_point_514088_514089() {
        let plain = tick_32_resolution_provenance(false).fact;
        let mirror = tick_32_resolution_provenance(true).fact;
        eprintln!("literal point={} | {} normal={:?} | {:?}", plain.point.y.raw(),
            mirror.point.y.raw(), plain.normal, mirror.normal);
        assert_eq!((plain.toi.get().raw(), mirror.toi.get().raw()), (38_127, 38_127));
        assert_eq!((plain.volume, mirror.volume),
                   (AnatomyRegion::Legs as u8, AnatomyRegion::Legs as u8));
        assert_eq!((plain.point.y.raw(), mirror.point.y.raw(),
                    1_048_576 - mirror.point.y.raw()),
                   (514_088, 534_488, 514_088));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_resolution_words_other_than_point_map_exactly() {
        let plain = tick_32_resolution_provenance(false).fact;
        let mirror = tick_32_resolution_provenance(true).fact;
        assert_eq!((plain.key.a, plain.key.a_slot, plain.key.b, plain.key.b_slot,
                    plain.key.kind, plain.toi, plain.volume),
                   (mirror.key.a, 1 - mirror.key.a_slot, mirror.key.b, mirror.key.b_slot,
                    mirror.key.kind, mirror.toi, mirror.volume));
        assert_eq!((plain.velocity_a.x, plain.velocity_a.y, plain.velocity_a.z),
                   (mirror.velocity_a.x, -mirror.velocity_a.y, mirror.velocity_a.z));
        assert_eq!(plain.velocity_b, mirror.velocity_b);
        // Resolution decoration is downstream of this identical fact identity;
        // the lifted row copies ordinal/alpha, impulse, energy and channels.
        assert_eq!((plain.toi.get().raw(), plain.volume), (38_127, 4));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn reflected_resolution_point_provenance_names_its_first_unequal_word() {
        let plain = tick_32_resolution_provenance(false);
        let mirror = tick_32_resolution_provenance(true);
        for axis in [0, 2] {
            assert_eq!(wide_word(plain.closest.a.0[axis]), wide_word(mirror.closest.a.0[axis]));
            assert_eq!(wide_word(plain.closest.b.0[axis]), wide_word(mirror.closest.b.0[axis]));
        }
        let pa = wide_word(plain.closest.a.0[1]);
        let ma = wide_word(mirror.closest.a.0[1]);
        eprintln!("closest A.y plain={pa:?} mirror={ma:?}");
        assert_eq!((pa.2, 1_048_576 - ma.2), (503_889, 503_890));
        assert_eq!((plain.fact.point.y.raw(), 1_048_576 - mirror.fact.point.y.raw()),
                   (514_088, 514_088));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_recompute_closest_a_and_b_expose_both_absolute_quotients() {
        let plain = tick_32_resolution_provenance(false).closest;
        let mirror = tick_32_resolution_provenance(true).closest;
        assert_eq!(wide_word(plain.a.0[1]),
            (52_291_122_109_816_685_043_510_180_080_016_864_147,
             103_775_061_921_195_370_460_915_180_666_880, 503_889,
             9_933_407_471_017_330_090_608_963_367_827));
        assert_eq!(wide_word(mirror.a.0[1]),
            (56_524_917_219_262_671_732_914_416_402_937_498_733,
             103_775_061_921_195_370_460_915_180_666_880, 544_686,
             93_841_654_450_178_040_370_306_217_299_053));
        assert_eq!((wide_word(plain.b.0[1]), wide_word(mirror.b.0[1])),
                   ((524_288, 1, 524_288, 0), (524_288, 1, 524_288, 0)));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn integer_midpoint_of_quotiented_endpoints_exposes_the_third_boundary() {
        let plain = tick_32_resolution_provenance(false);
        let mirror = tick_32_resolution_provenance(true);
        let endpoint_midpoint = |row: Tick32ResolutionProvenance| {
            (wide_word(row.closest.a.0[1]).2 + wide_word(row.closest.b.0[1]).2) / 2
        };
        assert_eq!((endpoint_midpoint(plain), 1_048_576 - endpoint_midpoint(mirror)),
                   (514_088, 514_089));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_midpoint_relative_to_key_a_motor_origin_maps_exactly() {
        let plain = tick_32_resolution_provenance(false).closest;
        let mirror = tick_32_resolution_provenance(true).closest;
        let point = |row: WideSegmentClosest, motor| tick_32_shared_frame_word(
            wide_midpoint(row.a, row.b).unwrap().0[1], motor);
        let p = point(plain, 458_752); let m = point(mirror, 589_824);
        assert_eq!((p, m, p + m),
                   (514_088, 534_488, 1_048_576));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn closest_endpoints_relative_to_one_motor_origin_make_normal_map_exactly() {
        let plain = tick_32_resolution_provenance(false).closest;
        let mirror = tick_32_resolution_provenance(true).closest;
        let endpoints = |row: WideSegmentClosest, motor| [
            tick_32_shared_frame_word(row.a.0[1], motor),
            tick_32_shared_frame_word(row.b.0[1], motor)];
        let p = endpoints(plain, 458_752); let m = endpoints(mirror, 589_824);
        assert_eq!((p, m), ([503_889, 524_288], [544_687, 524_288]));
        assert_eq!((p[1] - p[0]), -(m[1] - m[0]));
        assert_eq!((p[0] + m[0], p[1] + m[1]), (1_048_576, 1_048_576));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_exact_recompute_publishes_point_in_key_a_motor_frame() {
        let plain = tick_32_resolution_provenance(false).fact;
        let mirror = tick_32_resolution_provenance(true).fact;
        assert_eq!((plain.point.y.raw(), mirror.point.y.raw(),
                    plain.point.y.raw() + mirror.point.y.raw()),
                   (514_088, 534_488, 1_048_576));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_32_exact_recompute_publishes_normal_endpoints_in_the_same_frame() {
        let plain = tick_32_resolution_provenance(false).fact;
        let mirror = tick_32_resolution_provenance(true).fact;
        assert_eq!((plain.normal.x, plain.normal.z), (mirror.normal.x, mirror.normal.z));
        assert_eq!(plain.normal.y, -mirror.normal.y);
        let p = tick_32_resolution_provenance(false).closest;
        let m = tick_32_resolution_provenance(true).closest;
        let plain_rows = tick_32_successful_rows(false).1;
        let mirror_rows = tick_32_successful_rows(true).1;
        assert_eq!((wide_point_in_frame(&p.a, wide_owner_motor_frame(
                &plain_rows.trajectories, &plain_rows.trajectories[1]).unwrap()).unwrap().y.raw(),
                    wide_point_in_frame(&m.a, wide_owner_motor_frame(
                &mirror_rows.trajectories, &mirror_rows.trajectories[1]).unwrap()).unwrap().y.raw()),
                   (503_889, 544_687));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_point_publication_does_not_change_toi_region_distance_or_key() {
        let plain = tick_32_resolution_provenance(false);
        assert_eq!((plain.fact.toi.get().raw(), plain.fact.volume, plain.closest.feature),
                   (38_127, AnatomyRegion::Legs as u8, 0));
        assert_eq!((plain.fact.key.a, plain.fact.key.a_slot, plain.fact.key.b,
                    plain.fact.key.b_slot, plain.fact.key.kind),
                   (EntityId::new(0, 0), 1, EntityId::new(1, 0), BODY_SLOT,
                    ContactKind::WeaponBody));
        assert!(wide_cmp(plain.closest.distance_sq,
            wide_mul(wide_radius(2_621 + 19_660).unwrap(),
                     wide_radius(2_621 + 19_660).unwrap()).unwrap()).unwrap()
            != Ordering::Greater);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn weapon_weapon_and_weapon_shield_use_the_final_key_a_owner_frame() {
        let absent_body = |entity, faction, at| {
            let mut body = coincident_body(entity, faction, at);
            let ContactShape::Body { parts, .. } = &mut body.shape else { unreachable!() };
            for part in parts { part.present = false; }
            body
        };
        let at = Vec3::new(Fx::from_raw(700_000), Fx::from_raw(300_000), Fx::ZERO);
        let left_body = absent_body(0, Faction::Heroes,
            Vec3::new(Fx::ZERO, Fx::from_raw(100_000), Fx::ZERO));
        let left_weapon = segment(0, Faction::Heroes, at, at, Vec3::ZERO);
        let right_body = absent_body(1, Faction::Monsters,
            Vec3::new(Fx::ZERO, Fx::from_raw(600_000), Fx::ZERO));
        let right_weapon = segment(1, Faction::Monsters, at, at, Vec3::ZERO);
        let ww = [left_body, left_weapon, right_body, right_weapon];
        let exact = zero_response_compatibility(&ww).unwrap();
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(4).unwrap();
        let forward = exact_contact_at_pose(&exact.trajectories, &exact.owners, &ww,
            1, 3, 0, &mut scratch).unwrap().unwrap();
        let reverse = exact_contact_at_pose(&exact.trajectories, &exact.owners, &ww,
            3, 1, 0, &mut scratch).unwrap().unwrap();
        assert_eq!(forward, reverse);
        assert_eq!((forward.key.a, forward.point), (left_weapon.entity, at));

        let face = shield_face().map(|offset| at + offset);
        let shield = ContactCollider { entity: right_body.entity, faction: right_body.faction,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let ws = [left_body, left_weapon, right_body, shield];
        let exact = zero_response_compatibility(&ws).unwrap();
        let forward = exact_contact_at_pose(&exact.trajectories, &exact.owners, &ws,
            1, 3, 0, &mut scratch).unwrap().unwrap();
        let reverse = exact_contact_at_pose(&exact.trajectories, &exact.owners, &ws,
            3, 1, 0, &mut scratch).unwrap().unwrap();
        assert_eq!(forward, reverse);
        assert_eq!(forward.key.a, left_weapon.entity);
    }

    #[cfg(feature = "cartesian-recoil")]
    fn equipment_only_weapon_rows() -> [ContactCollider; 2] {
        let quarter = Fx::from_raw(16_384);
        [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::new(quarter, Fx::ZERO, Fx::ZERO),
                 Vec3::new(quarter, Fx::ZERO, Fx::ZERO)),
         segment(1, Faction::Monsters, Vec3::ZERO, Vec3::new(-quarter, Fx::ZERO, Fx::ZERO),
                 Vec3::new(-quarter, Fx::ZERO, Fx::ZERO))]
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equipment_only_weapon_pair_uses_canonical_a_tick_start_hilt_frame() {
        let rows = equipment_only_weapon_rows();
        let exact = zero_response_compatibility(&rows).unwrap();
        assert_eq!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[0]).unwrap(),
                   [0; 3]);
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        let fact = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, 0, &mut scratch).unwrap().unwrap();
        assert_eq!(fact, contact_at_pose(&rows[0], &rows[1], TimeOfImpact::ZERO).unwrap());
        assert_eq!((fact.point, fact.normal, fact.velocity_a.x.raw(), fact.velocity_b.x.raw()),
                   (Vec3::ZERO, Vec3::X, 16_384, -16_384));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equipment_only_weapon_shield_uses_segment_a_not_shield_b_frame() {
        let weapon = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let face = shield_face();
        let shield = ContactCollider { entity: EntityId::new(1, 0), faction: Faction::Monsters,
            slot: 0, mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let rows = [weapon, shield];
        let exact = zero_response_compatibility(&rows).unwrap();
        assert_eq!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[0]).unwrap(),
                   [0; 3]);
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        let fact = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, 0, &mut scratch).unwrap().unwrap();
        assert_eq!(fact.key.kind, ContactKind::WeaponShield);
        assert_eq!(fact.key.a, weapon.entity);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equipment_only_weapon_body_uses_segment_a_not_body_b_frame() {
        let weapon = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let mut body = coincident_body(1, Faction::Monsters, Vec3::ZERO);
        let ContactShape::Body { previous_origin, requested_origin, .. } = &mut body.shape
            else { unreachable!() };
        *previous_origin = Vec3::new(Fx::from_raw(700_000), Fx::ZERO, Fx::ZERO);
        *requested_origin = *previous_origin;
        let rows = [weapon, body];
        let exact = zero_response_compatibility(&rows).unwrap();
        assert_eq!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[0]).unwrap(),
                   [0; 3]);
        assert_ne!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[0]).unwrap(),
                   [700_000, 0, 0]);
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        let fact = exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, 0, &mut scratch).unwrap().unwrap();
        assert_eq!((fact.key.kind, fact.key.a, fact.key.b),
                   (ContactKind::WeaponBody, weapon.entity, body.entity));
        assert_eq!(fact.point, Vec3::ZERO);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn world_weapon_pair_prefers_the_canonical_owner_body_frame() {
        let body_at = Vec3::new(Fx::from_raw(41), Fx::from_raw(-73), Fx::from_raw(9));
        let hilt_at = Vec3::new(Fx::from_raw(400), Fx::from_raw(500), Fx::from_raw(600));
        let body = coincident_body(0, Faction::Heroes, body_at);
        let weapon = segment(0, Faction::Heroes, hilt_at, hilt_at, Vec3::ZERO);
        let rows = [body, weapon];
        let exact = zero_response_compatibility(&rows).unwrap();
        assert_eq!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[1]).unwrap(),
                   [41, -73, 9]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn world_body_frame_allows_well_formed_additional_held_rows() {
        let body = coincident_body(0, Faction::Heroes, Vec3::new(Fx::from_raw(7), Fx::ZERO, Fx::ZERO));
        let weapon = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let face = shield_face();
        let shield = ContactCollider { entity: body.entity, faction: body.faction, slot: 0,
            mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: face, requested: face } };
        let rows = [body, weapon, shield];
        let exact = zero_response_compatibility(&rows).unwrap();
        assert_eq!(wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[1]).unwrap(),
                   [7, 0, 0]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn body_row_order_cannot_change_the_selected_contact_frame() {
        let body = coincident_body(0, Faction::Heroes,
            Vec3::new(Fx::from_raw(7), Fx::from_raw(11), Fx::from_raw(13)));
        let weapon = segment(0, Faction::Heroes,
            Vec3::new(Fx::from_raw(101), Fx::from_raw(103), Fx::from_raw(107)),
            Vec3::new(Fx::from_raw(101), Fx::from_raw(103), Fx::from_raw(107)), Vec3::ZERO);
        for rows in [[body, weapon], [weapon, body]] {
            let exact = zero_response_compatibility(&rows).unwrap();
            let weapon_at = exact.trajectories.iter().position(|row| row.slot == 1).unwrap();
            assert_eq!(wide_owner_motor_frame(&exact.trajectories,
                &exact.trajectories[weapon_at]).unwrap(), [7, 11, 13]);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn malformed_or_ambiguous_owner_grammar_never_takes_the_fallback() {
        let rows = equipment_only_weapon_rows();
        let exact = zero_response_compatibility(&rows).unwrap();
        let canonical = exact.trajectories[0];
        let rejected = |owned: Vec<ExactContactTrajectory>|
            assert_eq!(wide_owner_motor_frame(&owned, &canonical),
                       Err(ExactScanReject::CompatibilityIdentity));

        rejected(vec![canonical, canonical]);
        let mut wrong_entity = canonical; wrong_entity.entity = EntityId::new(9, 0);
        rejected(vec![canonical, wrong_entity]);
        let mut wrong_owner = canonical; wrong_owner.owner_index = 1;
        rejected(vec![canonical, wrong_owner]);
        let mut wrong_slot = canonical; wrong_slot.slot = 2;
        rejected(vec![wrong_slot]);
        let mut wrong_held = canonical; wrong_held.held_index = Some(0);
        rejected(vec![wrong_held]);
        let mut missing_spec = canonical; missing_spec.equipment_spec = None;
        rejected(vec![missing_spec]);
        let mut absent = canonical; absent.present = false;
        rejected(vec![absent]);
        let mut second = canonical; second.slot = 0; second.held_index = Some(0);
        second.equipment_spec = Some(0);
        rejected(vec![canonical, second]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equipment_only_second_held_row_refuses_the_fallback() {
        let rows = equipment_only_weapon_rows();
        let exact = zero_response_compatibility(&rows).unwrap();
        let canonical = exact.trajectories[0];
        let mut second = canonical;
        second.slot = 0;
        second.held_index = Some(0);
        second.equipment_spec = Some(0);
        assert_eq!(wide_owner_motor_frame(&[canonical, second], &canonical),
                   Err(ExactScanReject::CompatibilityIdentity));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn equipment_only_frame_translates_and_reflects_every_published_word() {
        let rows = equipment_only_weapon_rows();
        let exact = zero_response_compatibility(&rows).unwrap();
        let frame = wide_owner_motor_frame(&exact.trajectories, &exact.trajectories[0]).unwrap();
        let translation = [31, -47, 5];
        let transform = |mut row: ExactContactTrajectory, reflect: bool| {
            let MotorShape::Segment { hilt, tip, radius_raw } = row.motor else { unreachable!() };
            let point = |mut p: ExactMotorPoint| {
                for axis in 0..3 {
                    p.at_tick_start_raw[axis] += translation[axis];
                }
                if reflect {
                    p.at_tick_start_raw[0] = 1_000 - p.at_tick_start_raw[0];
                    p.at_tick_start_raw[1] = -p.at_tick_start_raw[1];
                    p.tick_delta_raw[0] = -p.tick_delta_raw[0];
                    p.tick_delta_raw[1] = -p.tick_delta_raw[1];
                }
                p
            };
            row.motor = MotorShape::Segment { hilt: point(hilt), tip: point(tip), radius_raw };
            row
        };
        let translated: Vec<_> = exact.trajectories.iter().copied()
            .map(|row| transform(row, false)).collect();
        assert_eq!(wide_owner_motor_frame(&translated, &translated[0]).unwrap(),
                   [frame[0] + 31, frame[1] - 47, frame[2] + 5]);
        let reflected: Vec<_> = exact.trajectories.iter().copied()
            .map(|row| transform(row, true)).collect();
        assert_eq!(wide_owner_motor_frame(&reflected, &reflected[0]).unwrap(),
                   [1_000 - (frame[0] + 31), -(frame[1] - 47), frame[2] + 5]);
        let restored: Vec<_> = reflected.iter().copied().map(|mut row| {
            let MotorShape::Segment { mut hilt, mut tip, radius_raw } = row.motor else { unreachable!() };
            for point in [&mut hilt, &mut tip] {
                point.at_tick_start_raw[0] = 1_000 - point.at_tick_start_raw[0];
                point.at_tick_start_raw[1] = -point.at_tick_start_raw[1];
                point.tick_delta_raw[0] = -point.tick_delta_raw[0];
                point.tick_delta_raw[1] = -point.tick_delta_raw[1];
            }
            row.motor = MotorShape::Segment { hilt, tip, radius_raw }; row
        }).collect();
        assert_eq!(restored, translated);
    }

    #[cfg(feature = "cartesian-recoil")]
    fn replay_tick_79_weapon_body_rows() -> ([ContactCollider; 2], ZeroResponseCompatibility) {
        let point = |raw: [i32; 3]| Vec3::new(
            Fx::from_raw(raw[0]), Fx::from_raw(raw[1]), Fx::from_raw(raw[2]));
        let hilt = point([704_359, 9_233, 58_982]);
        let tip = point([835_023, -1_099, 58_982]);
        let requested_hilt = hilt + point([135, 2_569, 0]);
        let requested_tip = tip + point([495, 9_421, 0]);
        let weapon = ContactCollider {
            entity: EntityId::new(0, 0), faction: Faction::Heroes, slot: 1,
            mass: Fx::ONE, surface: surface(), velocity: requested_hilt - hilt,
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Segment { previous_hilt: hilt, previous_tip: tip,
                requested_hilt, requested_tip, radius: Fx::from_raw(2_621) },
        };
        let absent = RegionSweep { previous_lower: Vec3::ZERO, previous_upper: Vec3::ZERO,
            requested_lower: Vec3::ZERO, requested_upper: Vec3::ZERO,
            radius: Fx::ZERO, present: false };
        let mut parts = [absent; BODY_VOLUME_COUNT];
        let lower = point([827_064, 13_107, 91_750]);
        let upper = point([814_776, 13_107, 58_982]);
        parts[AnatomyRegion::Legs as usize] = RegionSweep {
            previous_lower: lower, previous_upper: upper,
            requested_lower: lower, requested_upper: upper,
            radius: Fx::from_raw(9_830), present: true,
        };
        let body = ContactCollider {
            entity: EntityId::new(1, 0), faction: Faction::Monsters, slot: BODY_SLOT,
            mass: Fx::ONE, surface: surface(), velocity: Vec3::ZERO,
            velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Body { previous_origin: lower, requested_origin: lower, parts },
        };
        let rows = [weapon, body];
        let exact = zero_response_compatibility(&rows).unwrap();
        (rows, exact)
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn replay_tick_79_freezes_the_single_weapon_body_recompute_drop() {
        let (rows, exact) = replay_tick_79_weapon_body_rows();
        let mut compatibility = ContactCollectionScratch::default();
        scan_candidates_into(&rows, &mut compatibility);
        let selected: Vec<_> = compatibility.candidates().iter().filter(|row|
            row.fact.key == ContactKey { a: rows[0].entity, a_slot: 1,
                b: rows[1].entity, b_slot: BODY_SLOT, kind: ContactKind::WeaponBody })
            .collect();
        assert_eq!(selected.len(), 1);
        assert_eq!((selected[0].fact.toi.get().raw(), selected[0].fact.volume),
                   (902, AnatomyRegion::Legs as u8));
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        assert_eq!(exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, 902, &mut scratch).unwrap(), None);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn replay_tick_79_exact_boundary_is_greater_at_904_and_less_at_905() {
        let (rows, exact) = replay_tick_79_weapon_body_rows();
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        let compare = |time, scratch: &mut ContactCollectionScratch| {
            let (closest, radius_raw, _) = wide_segment_body_at_time(
                &exact.trajectories[0], &exact.owners[0], &exact.trajectories[1],
                &exact.owners[1], AnatomyRegion::Legs as usize, time,
                &mut scratch.exact_wide).unwrap().unwrap();
            let radius = wide_radius(radius_raw).unwrap();
            (closest, wide_cmp(closest.distance_sq, wide_mul(radius, radius).unwrap()).unwrap())
        };
        let (at_904, order_904) = compare(904, &mut scratch);
        let (at_905, order_905) = compare(905, &mut scratch);
        assert_eq!((order_904, order_905), (Ordering::Greater, Ordering::Less));
        let (at_902, _) = compare(902, &mut scratch);
        assert_eq!(wide_point_to_vec3(at_902.a).unwrap(),
                   Vec3::new(Fx::from_raw(813_803), Fx::from_raw(693), Fx::from_raw(58_982)));
        assert_eq!(wide_point_to_vec3(at_902.b).unwrap(),
                   Vec3::new(Fx::from_raw(814_776), Fx::from_raw(13_107), Fx::from_raw(58_982)));
        assert_eq!(2_621 + 9_830, 12_451);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn replay_tick_79_drop_occurs_before_owner_frame_publication() {
        let (rows, mut exact) = replay_tick_79_weapon_body_rows();
        exact.trajectories[0].equipment_spec = None;
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        assert_eq!(exact_contact_at_pose(&exact.trajectories, &exact.owners, &rows,
            0, 1, 902, &mut scratch).unwrap(), None,
            "a publication-frame identity defect was evaluated before the separating predicate");
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart131_rows(x_delta: i32, y_delta: i32)
        -> ([ContactCollider; 2], ZeroResponseCompatibility)
    {
        let (mut rows, _) = replay_tick_79_weapon_body_rows();
        if let ContactShape::Segment { previous_hilt, requested_hilt,
            requested_tip, .. } = &mut rows[0].shape {
            requested_hilt.x += Fx::from_raw(x_delta);
            requested_tip.x += Fx::from_raw(x_delta);
            rows[0].velocity = *requested_hilt - *previous_hilt;
        }
        if let ContactShape::Body { previous_origin, requested_origin, parts } = &mut rows[1].shape {
            previous_origin.y += Fx::from_raw(y_delta);
            requested_origin.y += Fx::from_raw(y_delta);
            for part in parts { if part.present {
                part.previous_lower.y += Fx::from_raw(y_delta);
                part.previous_upper.y += Fx::from_raw(y_delta);
                part.requested_lower.y += Fx::from_raw(y_delta);
                part.requested_upper.y += Fx::from_raw(y_delta);
            } }
        }
        let exact = zero_response_compatibility(&rows).unwrap();
        (rows, exact)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart131_target(rows: &[ContactCollider; 2]) -> ExactSegmentBodyDiagnosticTarget {
        ExactSegmentBodyDiagnosticTarget {
            key: crate::combat::resolution::ExactContactKeyDiagnostic {
                a: rows[0].entity, a_slot: rows[0].slot, b: rows[1].entity,
                b_slot: BODY_SLOT, kind: ContactKind::WeaponBody,
            }, a_index: 0, b_index: 1,
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart131_scan(rows: &[ContactCollider; 2], exact: &ZeroResponseCompatibility,
        requested: bool, mutation: ExactSegmentBodyTestMutation)
        -> (Result<(), ExactScanReject>, ContactCollectionScratch)
    {
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        scratch.set_segment_body_test_mutation(mutation);
        if requested { assert!(scratch.request_segment_body_target(smart131_target(rows))); }
        scratch.begin_segment_body_target_tick();
        let result = scan_exact_candidates_into(&exact.trajectories, &exact.owners, rows,
                                                &mut scratch);
        (result, scratch)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart132_scan(rows: &[ContactCollider; 2], exact: &ZeroResponseCompatibility,
        mutation: ExactSegmentBodyTestMutation)
        -> (Result<(), ExactScanReject>, ContactCollectionScratch)
    {
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        scratch.set_segment_body_test_mutation(mutation);
        assert!(scratch.request_segment_body_pair_aabb_target(smart131_target(rows)));
        scratch.begin_segment_body_target_tick();
        let result = scan_exact_candidates_into(&exact.trajectories, &exact.owners, rows,
                                                &mut scratch);
        (result, scratch)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart133_scan(rows: &[ContactCollider; 2], exact: &ZeroResponseCompatibility,
        mutation: ExactSegmentBodyTestMutation)
        -> (Result<(), ExactScanReject>, ContactCollectionScratch)
    {
        let mut scratch = ContactCollectionScratch::default(); scratch.try_reserve(2).unwrap();
        scratch.set_segment_body_test_mutation(mutation);
        assert!(scratch.request_segment_hilt_start_x_target(smart131_target(rows)));
        scratch.begin_segment_body_target_tick();
        let result = scan_exact_candidates_into(&exact.trajectories, &exact.owners, rows,
                                                &mut scratch);
        (result, scratch)
    }

    #[cfg(feature = "cartesian-recoil")]
    fn point_x_success_is_valid(diagnostic: ExactSegmentHiltStartXDiagnostic<'_>) -> Option<()> {
        use ExactPointXEventAtomDiagnostic as Atom;
        use ExactPointXEventFieldDiagnostic as Field;
        use ExactPointXEventRoleDiagnostic as Role;
        use ExactPointXEventScopeDiagnostic as Scope;
        use ExactPointXEventStageDiagnostic as Stage;
        let expected = [
            (Role::OperandCandidate, Scope::Motor, Field::StartRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Motor, Field::Value, Stage::RationalStart),
            (Role::OperandCandidate, Scope::Motor, Field::DeltaRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Motor, Field::StepNumerator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Motor, Field::Value, Stage::RationalStep),
            (Role::DerivedWitness, Scope::Motor, Field::Value, Stage::AddStartStep),
            (Role::OperandCandidate, Scope::Common, Field::Scale, Stage::Input),
            (Role::OperandCandidate, Scope::Common, Field::AtGroupRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Common, Field::Value, Stage::RationalPosition),
            (Role::OperandCandidate, Scope::Common, Field::AtGroupRemainder, Stage::Input),
            (Role::DerivedWitness, Scope::Common, Field::RemainderDenominator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Common, Field::Value, Stage::RationalRemainder),
            (Role::OperandCandidate, Scope::Common, Field::VelocityRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Common, Field::ScaledVelocity, Stage::CheckedProduct),
            (Role::OperandCandidate, Scope::Common, Field::MomentumRemainder, Stage::Input),
            (Role::DerivedWitness, Scope::Common, Field::Momentum, Stage::CheckedAdd),
            (Role::DerivedWitness, Scope::Common, Field::TravelTimeRaw, Stage::Subtract),
            (Role::DerivedWitness, Scope::Common, Field::TravelNumerator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Common, Field::TravelDenominator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Common, Field::Value, Stage::RationalTravel),
            (Role::DerivedWitness, Scope::Common, Field::Value, Stage::AddPositionRemainder),
            (Role::DerivedWitness, Scope::Common, Field::Value, Stage::AddTravel),
            (Role::DerivedWitness, Scope::Combine, Field::Value, Stage::AddMotorCommon),
            (Role::OperandCandidate, Scope::Held, Field::MassRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Held, Field::Scale, Stage::Cast),
            (Role::OperandCandidate, Scope::Held, Field::AtGroupRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Held, Field::Value, Stage::RationalPosition),
            (Role::OperandCandidate, Scope::Held, Field::AtGroupRemainder, Stage::Input),
            (Role::DerivedWitness, Scope::Held, Field::RemainderDenominator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Held, Field::Value, Stage::RationalRemainder),
            (Role::OperandCandidate, Scope::Held, Field::VelocityRaw, Stage::Input),
            (Role::DerivedWitness, Scope::Held, Field::ScaledVelocity, Stage::CheckedProduct),
            (Role::OperandCandidate, Scope::Held, Field::MomentumRemainder, Stage::Input),
            (Role::DerivedWitness, Scope::Held, Field::Momentum, Stage::CheckedAdd),
            (Role::DerivedWitness, Scope::Held, Field::TravelTimeRaw, Stage::Subtract),
            (Role::DerivedWitness, Scope::Held, Field::TravelNumerator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Held, Field::TravelDenominator, Stage::CheckedProduct),
            (Role::DerivedWitness, Scope::Held, Field::Value, Stage::RationalTravel),
            (Role::DerivedWitness, Scope::Held, Field::Value, Stage::AddPositionRemainder),
            (Role::DerivedWitness, Scope::Held, Field::Value, Stage::AddTravel),
            (Role::DerivedWitness, Scope::Final, Field::Value, Stage::AddAfterCommonHeld),
            (Role::Terminal, Scope::Final, Field::Terminal, Stage::Terminal),
        ];
        if diagnostic.admission.side != ExactPairAabbSideDiagnostic::A
            || diagnostic.admission.ordinal != 0
            || diagnostic.admission.source != ExactPairAabbPointSourceDiagnostic::SegmentHilt
            || diagnostic.admission.region.is_some()
            || diagnostic.admission.endpoint != ExactPairAabbEndpointDiagnostic::Start
            || diagnostic.admission.axis != ExactPairAabbAxisDiagnostic::X
            || diagnostic.admission.row_slot as usize != diagnostic.admission.held_index
            || diagnostic.admission.held_slot as usize != diagnostic.admission.held_index
            || diagnostic.recorder_invalid.is_some() || diagnostic.events.len() != expected.len()
            || diagnostic.events.iter().zip(expected).enumerate().any(|(at, (row, tuple))|
                row.ordinal as usize != at
                    || (row.role, row.scope, row.field, row.stage) != tuple)
            || diagnostic.events[41].atom != Atom::TerminalSuccess { return None }
        let i32_at = |at: usize| match diagnostic.events[at].atom {
            Atom::I32(value) => Some(value), _ => None };
        let i128_at = |at: usize| match diagnostic.events[at].atom {
            Atom::I128(value) => Some(value), _ => None };
        let wide = |value| Atom::Wide(exact_wide_rational_diagnostic(value));
        let time = diagnostic.admission.time_raw;
        let start = WideRational4096::new(i32_at(0)? as i128, 1)?;
        if diagnostic.events[1].atom != wide(start) { return None }
        let step_numerator = (i32_at(2)? as i128).checked_mul(time as i128)?;
        if diagnostic.events[3].atom != Atom::I128(step_numerator) { return None }
        let step = WideRational4096::new(step_numerator, 65_536)?;
        if diagnostic.events[4].atom != wide(step) { return None }
        let motor = wide_add(start, step).ok()?;
        if diagnostic.events[5].atom != wide(motor) { return None }
        let response = |base: usize, scale: i128, group_time: u32|
            -> Option<WideRational4096> {
            let position = WideRational4096::new(i32_at(base)? as i128, 1)?;
            if diagnostic.events[base + 1].atom != wide(position) { return None }
            let remainder_denominator = scale.checked_mul(65_536)?;
            if diagnostic.events[base + 3].atom != Atom::I128(remainder_denominator) { return None }
            let remainder = WideRational4096::new(i128_at(base + 2)?, remainder_denominator)?;
            if diagnostic.events[base + 4].atom != wide(remainder) { return None }
            let scaled_velocity = scale.checked_mul(i32_at(base + 5)? as i128)?;
            if diagnostic.events[base + 6].atom != Atom::I128(scaled_velocity) { return None }
            let momentum = scaled_velocity.checked_add(i128_at(base + 7)?)?;
            if diagnostic.events[base + 8].atom != Atom::I128(momentum) { return None }
            let travel_time = time.checked_sub(group_time)?;
            if diagnostic.events[base + 9].atom != Atom::U32(travel_time) { return None }
            let travel_numerator = momentum.checked_mul(travel_time as i128)?;
            if diagnostic.events[base + 10].atom != Atom::I128(travel_numerator) { return None }
            if diagnostic.events[base + 11].atom != Atom::I128(remainder_denominator) { return None }
            let travel = WideRational4096::new(travel_numerator, remainder_denominator)?;
            if diagnostic.events[base + 12].atom != wide(travel) { return None }
            let position_remainder = wide_add(position, remainder).ok()?;
            if diagnostic.events[base + 13].atom != wide(position_remainder) { return None }
            let value = wide_add(position_remainder, travel).ok()?;
            if diagnostic.events[base + 14].atom != wide(value) { return None }
            Some(value)
        };
        let common = response(7, i128_at(6)?, diagnostic.admission.common_group_time_raw)?;
        let after_common = wide_add(motor, common).ok()?;
        if diagnostic.events[22].atom != wide(after_common) { return None }
        let held_scale = i32_at(23)? as i128;
        if diagnostic.events[24].atom != Atom::I128(held_scale) { return None }
        let held = response(25, held_scale, diagnostic.admission.held_group_time_raw)?;
        let final_value = wide_add(after_common, held).ok()?;
        (diagnostic.events[40].atom == wide(final_value)).then_some(())
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_segment_hilt_start_x_target_records_the_actual_operand_chain() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (_, scratch) = smart133_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let target = scratch.segment_hilt_start_x_diagnostic().unwrap();
        assert_eq!(target.encounter_count, 1);
        let point_x = target.point_x.unwrap();
        assert_eq!((point_x.admission.side, point_x.admission.ordinal,
            point_x.admission.source, point_x.admission.region, point_x.admission.endpoint,
            point_x.admission.axis), (ExactPairAabbSideDiagnostic::A, 0,
            ExactPairAabbPointSourceDiagnostic::SegmentHilt, None,
            ExactPairAabbEndpointDiagnostic::Start, ExactPairAabbAxisDiagnostic::X));
        point_x_success_is_valid(point_x).expect("all witnesses recompute from the inputs");
        let candidate_ordinals = point_x.events.iter().filter(|row|
            row.role == ExactPointXEventRoleDiagnostic::OperandCandidate)
            .map(|row| row.ordinal).collect::<Vec<_>>();
        assert_eq!(candidate_ordinals, vec![0, 2, 6, 7, 9, 12, 14, 23, 25, 27, 30, 32]);

        for at in candidate_ordinals {
            let (_, changed) = smart133_scan(&rows, &exact,
                ExactSegmentBodyTestMutation::PointXCorruptEvent(at));
            assert!(changed.segment_body_test_mutation_fired(), "candidate mutation {at} did not fire");
            assert_ne!(changed.segment_hilt_start_x_diagnostic().unwrap().point_x.unwrap()
                .events[at as usize].atom, point_x.events[at as usize].atom);
        }

        for at in [1, 3, 4, 5, 8, 10, 11, 13, 15, 16, 17, 18, 19, 20, 21, 22,
                   24, 26, 28, 29, 31, 33, 34, 35, 36, 37, 38, 39, 40] {
            let (_, changed) = smart133_scan(&rows, &exact,
                ExactSegmentBodyTestMutation::PointXCorruptEvent(at));
            assert!(changed.segment_body_test_mutation_fired(), "derived mutation {at} did not fire");
            assert!(point_x_success_is_valid(changed.segment_hilt_start_x_diagnostic()
                .unwrap().point_x.unwrap()).is_none(), "derived mutation {at} stayed valid");
        }
        for mutation in [ExactSegmentBodyTestMutation::PointXDropEvent,
                         ExactSegmentBodyTestMutation::PointXSwapEvents] {
            let (_, changed) = smart133_scan(&rows, &exact, mutation);
            assert!(changed.segment_body_test_mutation_fired());
            assert!(point_x_success_is_valid(changed.segment_hilt_start_x_diagnostic()
                .unwrap().point_x.unwrap()).is_none());
        }
        let (_, wrong) = smart133_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::PointXWrongAdmission);
        assert!(wrong.segment_body_test_mutation_fired());
        assert_eq!(wrong.segment_hilt_start_x_diagnostic().unwrap().point_x.unwrap()
            .admission.axis, ExactPairAabbAxisDiagnostic::Y);
        assert!(point_x_success_is_valid(wrong.segment_hilt_start_x_diagnostic()
            .unwrap().point_x.unwrap()).is_none());

        let mut owner = exact.owners[0];
        owner.common_response.at_group[0] = ExactPosition { raw: 7, remainder: 11 };
        owner.common_response.momentum[0] = ExactMomentum { velocity_raw: 3, remainder: 13 };
        owner.common_response.group_time_raw = 17;
        let held_index = exact.trajectories[0].held_index.unwrap();
        let mut held = owner.held_response[held_index].unwrap();
        held.affine.at_group[0] = ExactPosition { raw: -5, remainder: -19 };
        held.affine.momentum[0] = ExactMomentum { velocity_raw: -2, remainder: -23 };
        held.affine.group_time_raw = 29;
        owner.held_response[held_index] = Some(held);
        let MotorShape::Segment { hilt, .. } = exact.trajectories[0].motor else { unreachable!() };
        let mut state = ExactPointXState::default(); state.try_reserve().unwrap();
        let mut fired = 0;
        let mut recorder = ExactPointXRecorder { state: &mut state,
            test_mutation: ExactSegmentBodyTestMutation::None,
            test_mutation_receipt: 1, test_mutation_fired: &mut fired };
        wide_evaluated_point_recording_hilt_start_x(hilt, &exact.trajectories[0],
            &owner, 1_234, &mut recorder).unwrap();
        point_x_success_is_valid(state.diagnostic().unwrap())
            .expect("nonzero motor, common and held witnesses recompute independently");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_segment_hilt_start_x_final_word_equals_the_pair_aabb_point_word() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (_, scratch) = smart133_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let target = scratch.segment_hilt_start_x_diagnostic().unwrap();
        let pair = target.pair.unwrap();
        let aabb = pair.pair_aabb.unwrap();
        let point_x = target.point_x.unwrap();
        assert_eq!(point_x.events[40].atom,
            ExactPointXEventAtomDiagnostic::Wide(aabb.points[0].coordinate[0]));
        assert_eq!(point_x.events[41].atom, ExactPointXEventAtomDiagnostic::TerminalSuccess);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn an_operand_recorder_failure_does_not_change_the_authoritative_scan_result() {
        let (rows, mut exact) = smart131_rows(100_000, 500);
        exact.owners[0].common_scale = 0;
        let MotorShape::Segment { hilt, .. } = exact.trajectories[0].motor else { unreachable!() };
        let mut state = ExactPointXState::default(); state.try_reserve().unwrap();
        let mut fired = 0;
        let mut recorder = ExactPointXRecorder { state: &mut state,
            test_mutation: ExactSegmentBodyTestMutation::None,
            test_mutation_receipt: 1, test_mutation_fired: &mut fired };
        let result = wide_evaluated_point_recording_hilt_start_x(hilt,
            &exact.trajectories[0], &exact.owners[0], 0, &mut recorder);
        assert_eq!(result, Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(state.events.len(), 8);
        assert_eq!(state.events[6].atom, ExactPointXEventAtomDiagnostic::I128(0));
        assert_eq!(state.events[7].atom, ExactPointXEventAtomDiagnostic::TerminalReject(
            ExactScanRejectDiagnostic::ArithmeticEnvelope));
        assert_eq!(state.events[7].ordinal, 7);

        let mut denominator_owner = exact.owners[0];
        denominator_owner.common_scale = i128::MAX;
        let mut denominator_state = ExactPointXState::default(); denominator_state.try_reserve().unwrap();
        let mut denominator_fired = 0;
        let mut denominator_recorder = ExactPointXRecorder { state: &mut denominator_state,
            test_mutation: ExactSegmentBodyTestMutation::None,
            test_mutation_receipt: 2, test_mutation_fired: &mut denominator_fired };
        let denominator_result = wide_evaluated_point_recording_hilt_start_x(hilt,
            &exact.trajectories[0], &denominator_owner, 0, &mut denominator_recorder);
        assert_eq!(denominator_result, Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(denominator_state.events.len(), 11);
        assert_eq!(denominator_state.events[10].atom,
            ExactPointXEventAtomDiagnostic::TerminalReject(
                ExactScanRejectDiagnostic::ArithmeticEnvelope));

        let mut held_owner = exact.owners[0];
        let held_index = exact.trajectories[0].held_index.unwrap();
        held_owner.held_response[held_index].as_mut().unwrap().affine.mass_raw = 0;
        held_owner.common_scale = 1;
        let mut held_state = ExactPointXState::default(); held_state.try_reserve().unwrap();
        let mut held_fired = 0;
        let mut held_recorder = ExactPointXRecorder { state: &mut held_state,
            test_mutation: ExactSegmentBodyTestMutation::None,
            test_mutation_receipt: 3, test_mutation_fired: &mut held_fired };
        let held_result = wide_evaluated_point_recording_hilt_start_x(hilt,
            &exact.trajectories[0], &held_owner, 0, &mut held_recorder);
        assert_eq!(held_result, Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(held_state.events.len(), 26);
        assert_eq!(held_state.events[25].atom,
            ExactPointXEventAtomDiagnostic::TerminalReject(
                ExactScanRejectDiagnostic::ArithmeticEnvelope));

        struct RejectAt<'a, O> { inner: &'a mut O, seam: ExactPointXRejectSeam, fired: bool }
        impl<O: ExactPointXObserver> ExactPointXObserver for RejectAt<'_, O> {
            fn event(&mut self, role: ExactPointXEventRoleDiagnostic,
                     scope: ExactPointXEventScopeDiagnostic,
                     field: ExactPointXEventFieldDiagnostic,
                     stage: ExactPointXEventStageDiagnostic,
                     atom: ExactPointXEventAtomDiagnostic) {
                self.inner.event(role, scope, field, stage, atom)
            }
            fn reject(&mut self, seam: ExactPointXRejectSeam)
                -> Result<(), ExactScanReject>
            {
                if seam == self.seam { self.fired = true;
                    Err(ExactScanReject::ArithmeticEnvelope) } else { Ok(()) }
            }
        }
        let exact = zero_response_compatibility(&rows).unwrap();
        let owner = &exact.owners[0];
        let held = owner.held_response[exact.trajectories[0].held_index.unwrap()];
        let MotorShape::Segment { hilt, .. } = exact.trajectories[0].motor else { unreachable!() };
        for (mutation, seam, expected_len) in [
            (ExactSegmentBodyTestMutation::PointXRejectMotorGuard,
             ExactPointXRejectSeam::MotorGuard, 1),
            (ExactSegmentBodyTestMutation::PointXRejectCommonScale,
             ExactPointXRejectSeam::CommonScale, 8),
            (ExactSegmentBodyTestMutation::PointXRejectCommonDescending,
             ExactPointXRejectSeam::CommonDescending, 8),
            (ExactSegmentBodyTestMutation::PointXRejectHeldScale,
             ExactPointXRejectSeam::HeldScale, 26),
            (ExactSegmentBodyTestMutation::PointXRejectHeldDescending,
             ExactPointXRejectSeam::HeldDescending, 26),
            (ExactSegmentBodyTestMutation::PointXRejectFinalAdd,
             ExactPointXRejectSeam::FinalAdd, 41),
        ] {
            let mut ordinary_sink = ();
            let mut ordinary = RejectAt { inner: &mut ordinary_sink, seam, fired: false };
            let ordinary_result = wide_evaluated_coordinate_core(hilt, owner, held, 0, 0,
                                                                  &mut ordinary);
            assert!(ordinary.fired);
            let mut state = ExactPointXState::default(); state.try_reserve().unwrap();
            let receipt = EXACT_DIAGNOSTIC_MUTATION_RECEIPT.fetch_add(1,
                std::sync::atomic::Ordering::SeqCst);
            let mut fired = 0;
            let mut recorder = ExactPointXRecorder { state: &mut state,
                test_mutation: mutation, test_mutation_receipt: receipt,
                test_mutation_fired: &mut fired };
            let recorded_result = wide_evaluated_point_recording_hilt_start_x(hilt,
                &exact.trajectories[0], owner, 0, &mut recorder).map(|point| point.0[0]);
            assert_eq!(recorded_result, ordinary_result,
                "the recorder and ordinary wrapper must observe the same authoritative reject");
            assert_eq!(fired, receipt); assert_eq!(state.events.len(), expected_len);
            assert_eq!(state.events.last().unwrap().ordinal as usize, expected_len - 1);
            assert!(matches!(state.events.last().unwrap().atom,
                ExactPointXEventAtomDiagnostic::TerminalReject(
                    ExactScanRejectDiagnostic::ArithmeticEnvelope)));
            assert_eq!(state.events.iter().filter(|row| row.role
                == ExactPointXEventRoleDiagnostic::Terminal).count(), 1);
        }

        let (plain_result, plain) = smart133_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::None);
        let (capacity_result, capacity) = smart133_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::PointXRecorderCapacity);
        assert!(capacity.segment_body_test_mutation_fired());
        assert_eq!((capacity_result, candidate_bytes(&capacity), capacity.first_pair_rejection),
                   (plain_result, candidate_bytes(&plain), plain.first_pair_rejection));
        assert_eq!(smart131_owned(capacity.segment_hilt_start_x_diagnostic().unwrap()
            .pair.map(|pair| ExactSegmentBodyTargetDiagnostic {
                target: capacity.segment_hilt_start_x_diagnostic().unwrap().target,
                encounter_count: capacity.segment_hilt_start_x_diagnostic().unwrap().encounter_count,
                pair: Some(pair) }).unwrap()),
            smart131_owned(plain.segment_hilt_start_x_diagnostic().unwrap()
            .pair.map(|pair| ExactSegmentBodyTargetDiagnostic {
                target: plain.segment_hilt_start_x_diagnostic().unwrap().target,
                encounter_count: plain.segment_hilt_start_x_diagnostic().unwrap().encounter_count,
                pair: Some(pair) }).unwrap()));
        assert_eq!(capacity.segment_hilt_start_x_diagnostic().unwrap().point_x.unwrap()
            .recorder_invalid, Some(ExactPointXRecorderInvalidDiagnostic::Capacity));

        let (routed_result, routed) = smart133_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::RoutePointXRecorderIntoResult);
        assert!(routed.segment_body_test_mutation_fired());
        assert_ne!(routed_result, plain_result,
            "routing recorder presence into the authoritative result must make inertness red");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_segment_hilt_start_x_target_is_tick_local_bounded_and_inert() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (aabb_result, aabb) = smart132_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::None);
        let (point_result, mut point) = smart133_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::None);
        assert_eq!(point_result, aabb_result);
        assert_eq!(candidate_bytes(&point), candidate_bytes(&aabb));
        assert_eq!(point.first_pair_rejection, aabb.first_pair_rejection);
        assert_eq!(point.exact_wide.segment_body_rejection,
                   aabb.exact_wide.segment_body_rejection);
        let point_view = point.segment_hilt_start_x_diagnostic().unwrap();
        let aabb_view = aabb.segment_body_pair_aabb_diagnostic().unwrap();
        assert_eq!(smart131_owned(ExactSegmentBodyTargetDiagnostic { target: point_view.target,
            encounter_count: point_view.encounter_count, pair: point_view.pair }),
            smart131_owned(aabb_view));
        assert_eq!(point_view.pair.unwrap().pair_aabb, aabb_view.pair.unwrap().pair_aabb);
        let capacities = point.capacities(); assert!(capacities[23] >= EXACT_POINT_X_EVENT_CAP);
        let before_request = point.capacities();
        assert!(point.request_segment_hilt_start_x_target(smart131_target(&rows)));
        assert_eq!(point.capacities(), before_request);
        assert!(point.segment_hilt_start_x_diagnostic().is_some());
        assert!(!point.request_segment_body_pair_aabb_target(smart131_target(&rows)));
        let cloned = point.clone();
        assert_eq!(cloned.segment_hilt_start_x_diagnostic(), point.segment_hilt_start_x_diagnostic());
        point.begin_segment_body_target_tick();
        assert!(point.segment_hilt_start_x_diagnostic().is_some());
        point.begin_segment_body_target_tick();
        assert_eq!(point.segment_hilt_start_x_diagnostic(), None);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn a_completed_segment_hilt_start_x_view_can_coexist_with_one_pending_request() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (_, mut scratch) = smart133_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let completed = scratch.segment_hilt_start_x_diagnostic().unwrap();
        let completed_events = completed.point_x.unwrap().events.to_vec();
        assert!(scratch.request_segment_body_target(smart131_target(&rows)));
        assert_eq!(scratch.segment_hilt_start_x_diagnostic().unwrap()
            .point_x.unwrap().events, completed_events);
        assert!(!scratch.request_segment_body_pair_aabb_target(smart131_target(&rows)));
        assert!(!scratch.request_segment_hilt_start_x_target(smart131_target(&rows)));
        let cloned = scratch.clone();
        assert_eq!(cloned.segment_hilt_start_x_diagnostic(),
                   scratch.segment_hilt_start_x_diagnostic());
        scratch.begin_segment_body_target_tick();
        assert!(scratch.segment_body_target_diagnostic().is_some());
        assert_eq!(scratch.segment_hilt_start_x_diagnostic(), None);

        for first in [ExactTargetMode::SegmentBody, ExactTargetMode::PairAabb,
                      ExactTargetMode::SegmentHiltStartX] {
            for second in [ExactTargetMode::SegmentBody, ExactTargetMode::PairAabb,
                           ExactTargetMode::SegmentHiltStartX] {
                let mut pending = ContactCollectionScratch::default(); pending.try_reserve(2).unwrap();
                let request = |scratch: &mut ContactCollectionScratch, mode| match mode {
                    ExactTargetMode::SegmentBody =>
                        scratch.request_segment_body_target(smart131_target(&rows)),
                    ExactTargetMode::PairAabb =>
                        scratch.request_segment_body_pair_aabb_target(smart131_target(&rows)),
                    ExactTargetMode::SegmentHiltStartX =>
                        scratch.request_segment_hilt_start_x_target(smart131_target(&rows)),
                };
                assert!(request(&mut pending, first));
                assert!(!request(&mut pending, second));
            }
        }

        let make_active = |mode| -> ContactCollectionScratch { match mode {
            ExactTargetMode::SegmentBody => smart131_scan(&rows, &exact, true,
                ExactSegmentBodyTestMutation::None).1,
            ExactTargetMode::PairAabb => smart132_scan(&rows, &exact,
                ExactSegmentBodyTestMutation::None).1,
            ExactTargetMode::SegmentHiltStartX => smart133_scan(&rows, &exact,
                ExactSegmentBodyTestMutation::None).1,
        } };
        let request = |scratch: &mut ContactCollectionScratch, mode| match mode {
            ExactTargetMode::SegmentBody =>
                scratch.request_segment_body_target(smart131_target(&rows)),
            ExactTargetMode::PairAabb =>
                scratch.request_segment_body_pair_aabb_target(smart131_target(&rows)),
            ExactTargetMode::SegmentHiltStartX =>
                scratch.request_segment_hilt_start_x_target(smart131_target(&rows)),
        };
        let signature = |scratch: &ContactCollectionScratch| (
            scratch.segment_body_target_diagnostic().is_some(),
            scratch.segment_body_pair_aabb_diagnostic().is_some(),
            scratch.segment_hilt_start_x_diagnostic().is_some());
        let modes = [ExactTargetMode::SegmentBody, ExactTargetMode::PairAabb,
                     ExactTargetMode::SegmentHiltStartX];
        for active in modes { for pending in modes { if active != pending {
            let second = modes.into_iter().find(|mode| *mode != active && *mode != pending).unwrap();
            for mutation in [ExactSegmentBodyTestMutation::ClearActiveOnRequest,
                             ExactSegmentBodyTestMutation::RefuseOccupiedActive,
                             ExactSegmentBodyTestMutation::AllowSecondPending,
                             ExactSegmentBodyTestMutation::PendingReplacesActive,
                             ExactSegmentBodyTestMutation::RetainOldActiveDespitePending] {
                let mut baseline = make_active(active);
                let baseline_first = request(&mut baseline, pending);
                let baseline_second = request(&mut baseline, second);
                let baseline_before = signature(&baseline);
                baseline.begin_segment_body_target_tick();
                let baseline_after = signature(&baseline);

                let mut changed = make_active(active);
                changed.set_segment_body_test_mutation(mutation);
                let changed_first = request(&mut changed, pending);
                let changed_second = request(&mut changed, second);
                let changed_before = signature(&changed);
                changed.begin_segment_body_target_tick();
                let changed_after = signature(&changed);
                assert!(changed.segment_body_test_mutation_fired(),
                    "every ordered cross-mode lifecycle mutation must fire");
                assert_ne!((changed_first, changed_second, changed_before, changed_after),
                           (baseline_first, baseline_second, baseline_before, baseline_after),
                    "every ordered cross-mode lifecycle mutation must make the proof red");
            }
        } } }

        let mut consecutive = ContactCollectionScratch::default(); consecutive.try_reserve(2).unwrap();
        assert!(consecutive.request_segment_hilt_start_x_target(smart131_target(&rows)));
        consecutive.begin_segment_body_target_tick();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut consecutive).unwrap();
        assert_eq!(consecutive.segment_hilt_start_x_diagnostic().unwrap()
            .point_x.unwrap().events.len(), EXACT_POINT_X_EVENT_CAP);
        assert!(consecutive.request_segment_hilt_start_x_target(smart131_target(&rows)));
        consecutive.begin_segment_body_target_tick();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut consecutive).unwrap();
        assert_eq!(consecutive.segment_hilt_start_x_diagnostic().unwrap()
            .point_x.unwrap().events.len(), EXACT_POINT_X_EVENT_CAP);
        consecutive.begin_segment_body_target_tick();
        assert_eq!(consecutive.segment_hilt_start_x_diagnostic(), None);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_pair_aabb_target_records_points_bounds_and_the_actual_early_exit() {
        let mut saw_right_exit = false; let mut saw_left_exit = false;
        for (y, expected) in [(500, ExactPairAabbTerminalDiagnostic::Overlap),
                              (500_000, ExactPairAabbTerminalDiagnostic::Disjoint),
                              (-500_000, ExactPairAabbTerminalDiagnostic::Disjoint)] {
            let (rows, exact) = smart131_rows(100_000, y);
            let (_, scratch) = smart132_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
            let target = scratch.segment_body_pair_aabb_diagnostic().unwrap();
            assert_eq!(target.encounter_count, 1);
            let aabb = target.pair.unwrap().pair_aabb.unwrap();
            assert_eq!(aabb.terminal, expected); assert_eq!(aabb.recorder_invalid, None);
            let body_points = match rows[1].shape { ContactShape::Body { parts, .. } =>
                parts.iter().filter(|part| part.present).count() * 4, _ => unreachable!() };
            assert_eq!(aabb.points.len(), 4 + body_points); assert_eq!(aabb.bounds.len(), 3);
            assert!(!aabb.gaps.is_empty() && aabb.gaps.len() <= 3);
            for (at, gap) in aabb.gaps.iter().enumerate() {
                assert_eq!(gap.axis, exact_pair_aabb_axis(at));
                assert_eq!(gap.left_gap.is_none(),
                           gap.right_comparison == ExactPairAabbComparisonDiagnostic::Greater);
                assert_eq!(gap.left_comparison.is_none(), gap.left_gap.is_none());
            }
            assert_eq!(aabb.points[0].source, ExactPairAabbPointSourceDiagnostic::SegmentHilt);
            assert_eq!(aabb.points[1].source, ExactPairAabbPointSourceDiagnostic::SegmentTip);
            assert_eq!(aabb.points[2].endpoint, ExactPairAabbEndpointDiagnostic::End);
            assert_eq!(aabb.points[4].source, ExactPairAabbPointSourceDiagnostic::BodyLower);
            for region in aabb.points[4..].chunks_exact(4) {
                assert_eq!(region.iter().map(|row| (row.source, row.endpoint)).collect::<Vec<_>>(),
                    vec![(ExactPairAabbPointSourceDiagnostic::BodyLower,
                          ExactPairAabbEndpointDiagnostic::Start),
                         (ExactPairAabbPointSourceDiagnostic::BodyUpper,
                          ExactPairAabbEndpointDiagnostic::Start),
                         (ExactPairAabbPointSourceDiagnostic::BodyLower,
                          ExactPairAabbEndpointDiagnostic::End),
                         (ExactPairAabbPointSourceDiagnostic::BodyUpper,
                          ExactPairAabbEndpointDiagnostic::End)]);
            }
            if expected == ExactPairAabbTerminalDiagnostic::Overlap {
                assert_eq!(aabb.gaps.len(), 3);
                assert!(aabb.gaps.iter().all(|row| !row.disjoint));
            } else {
                assert!(aabb.gaps[..aabb.gaps.len() - 1].iter().all(|row|
                    !row.disjoint
                        && row.right_comparison != ExactPairAabbComparisonDiagnostic::Greater
                        && row.left_comparison != Some(ExactPairAabbComparisonDiagnostic::Greater)));
                let last = aabb.gaps.last().unwrap(); assert!(last.disjoint);
                if last.right_comparison == ExactPairAabbComparisonDiagnostic::Greater {
                    saw_right_exit = true;
                    assert_eq!((last.left_gap, last.left_comparison), (None, None));
                } else { saw_left_exit = true;
                    assert_eq!(last.left_comparison,
                               Some(ExactPairAabbComparisonDiagnostic::Greater)); }
            }
        }
        assert!(saw_right_exit && saw_left_exit);

        let (mut rows, _) = smart131_rows(100_000, 500);
        if let ContactShape::Body { parts, .. } = &mut rows[1].shape {
            for part in parts { part.present = false; }
        }
        let exact = zero_response_compatibility(&rows).unwrap();
        let (_, scratch) = smart132_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let aabb = scratch.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap();
        assert_eq!(aabb.terminal, ExactPairAabbTerminalDiagnostic::Disjoint);
        assert_eq!((aabb.points.len(), aabb.bounds.len(), aabb.gaps.len()), (4, 0, 0));
        assert_eq!(aabb.combined_radius, None);

        let segment_row = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::X, Vec3::X);
        let mut body_row = coincident_body(1, Faction::Monsters, Vec3::ZERO);
        let absent = BODY_VOLUME_COUNT / 2;
        if let ContactShape::Body { parts, .. } = &mut body_row.shape {
            for part in parts.iter_mut() { part.present = true; }
            parts[absent].present = false;
        }
        let labelled_rows = [segment_row, body_row];
        let labelled_exact = zero_response_compatibility(&labelled_rows).unwrap();
        let (_, labelled) = smart132_scan(&labelled_rows, &labelled_exact,
                                          ExactSegmentBodyTestMutation::None);
        let points = labelled.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap().points;
        let mut expected = vec![
            (ExactPairAabbSideDiagnostic::A, 0,
             ExactPairAabbPointSourceDiagnostic::SegmentHilt, None,
             ExactPairAabbEndpointDiagnostic::Start),
            (ExactPairAabbSideDiagnostic::A, 1,
             ExactPairAabbPointSourceDiagnostic::SegmentTip, None,
             ExactPairAabbEndpointDiagnostic::Start),
            (ExactPairAabbSideDiagnostic::A, 2,
             ExactPairAabbPointSourceDiagnostic::SegmentHilt, None,
             ExactPairAabbEndpointDiagnostic::End),
            (ExactPairAabbSideDiagnostic::A, 3,
             ExactPairAabbPointSourceDiagnostic::SegmentTip, None,
             ExactPairAabbEndpointDiagnostic::End),
        ];
        let mut ordinal = 0u8;
        for region in 0..BODY_VOLUME_COUNT { if region != absent {
            for (source, endpoint) in [
                (ExactPairAabbPointSourceDiagnostic::BodyLower,
                 ExactPairAabbEndpointDiagnostic::Start),
                (ExactPairAabbPointSourceDiagnostic::BodyUpper,
                 ExactPairAabbEndpointDiagnostic::Start),
                (ExactPairAabbPointSourceDiagnostic::BodyLower,
                 ExactPairAabbEndpointDiagnostic::End),
                (ExactPairAabbPointSourceDiagnostic::BodyUpper,
                 ExactPairAabbEndpointDiagnostic::End)] {
                expected.push((ExactPairAabbSideDiagnostic::B, ordinal, source,
                               Some(region as u8), endpoint));
                ordinal += 1;
            }
        } }
        assert_eq!(points.iter().map(|row| (row.side, row.ordinal, row.source,
            row.region, row.endpoint)).collect::<Vec<_>>(), expected);

        let (rows, exact) = smart131_rows(100_000, 500_000);
        let (_, mut owned) = smart132_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let first = owned.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap().points.to_vec();
        let reversed_rows = [rows[1], rows[0]];
        let reversed_trajectories = [exact.trajectories[1], exact.trajectories[0]];
        scan_exact_candidates_into(&reversed_trajectories, &exact.owners, &reversed_rows,
                                   &mut owned).unwrap();
        let duplicate = owned.segment_body_pair_aabb_diagnostic().unwrap();
        assert_eq!(duplicate.encounter_count, 2);
        assert_eq!(duplicate.pair.unwrap().pair_aabb.unwrap().points, first);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_pair_aabb_target_is_tick_local_bounded_and_inert() {
        let (rows, exact) = smart131_rows(100_000, 500_000);
        let (plain_result, plain) = smart131_scan(&rows, &exact, true,
                                                  ExactSegmentBodyTestMutation::None);
        let (recorded_result, recorded) = smart132_scan(&rows, &exact,
                                                        ExactSegmentBodyTestMutation::None);
        assert_eq!(plain_result, recorded_result);
        assert_eq!(candidate_bytes(&plain), candidate_bytes(&recorded));
        assert_eq!(plain.first_pair_rejection, recorded.first_pair_rejection);
        assert_eq!(plain.exact_wide.segment_body_rejection,
                   recorded.exact_wide.segment_body_rejection);
        let baseline = smart131_owned(plain.segment_body_target_diagnostic().unwrap());
        assert_eq!(smart131_owned(recorded.segment_body_pair_aabb_diagnostic().unwrap()), baseline);
        let capacities = recorded.capacities();
        assert!(capacities[20] >= 24 && capacities[21] >= 3 && capacities[22] >= 3);
        let cloned = recorded.clone();
        assert_eq!(cloned.segment_body_pair_aabb_diagnostic(),
                   recorded.segment_body_pair_aabb_diagnostic());
        let recorded_terminal = recorded.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap().terminal;

        let mut bounded = ContactCollectionScratch::default(); bounded.try_reserve(2).unwrap();
        let before_step = bounded.capacities();
        assert!(bounded.request_segment_body_pair_aabb_target(smart131_target(&rows)));
        bounded.begin_segment_body_target_tick();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut bounded).unwrap();
        assert_eq!(bounded.capacities(), before_step,
                   "the reserved recorder must not grow during the authoritative step");

        let (mutated_result, mutated) = smart132_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::RouteAabbRecorderIntoResult);
        assert!(mutated.segment_body_test_mutation_fired());
        assert_ne!((mutated_result, candidate_bytes(&mutated), mutated.first_pair_rejection,
                    smart131_owned(mutated.segment_body_pair_aabb_diagnostic().unwrap())),
                   (plain_result, candidate_bytes(&plain), plain.first_pair_rejection,
                    baseline.clone()),
                   "routing recorder presence into the result must make inertness red");

        let (capacity_result, capacity) = smart132_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::AabbRecorderCapacity);
        assert!(capacity.segment_body_test_mutation_fired());
        assert_eq!((capacity_result, candidate_bytes(&capacity)),
                   (plain_result, candidate_bytes(&plain)));
        assert_eq!(capacity.first_pair_rejection, plain.first_pair_rejection);
        assert_eq!(capacity.exact_wide.segment_body_rejection,
                   plain.exact_wide.segment_body_rejection);
        assert_eq!(smart131_owned(capacity.segment_body_pair_aabb_diagnostic().unwrap()), baseline);
        let aabb = capacity.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap();
        assert_eq!(aabb.terminal, recorded_terminal);
        assert_eq!(aabb.recorder_invalid, Some(ExactPairAabbRecorderInvalidDiagnostic::Capacity));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn a_completed_pair_aabb_view_can_coexist_with_one_pending_next_tick_request() {
        let (rows, exact) = smart131_rows(100_000, 500_000);
        let (_, mut scratch) = smart132_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
        let completed = scratch.segment_body_pair_aabb_diagnostic().unwrap();
        let completed_owned = (completed.target, completed.encounter_count,
            completed.pair.unwrap().pair_aabb.unwrap().points.to_vec());
        let capacities_before_request = scratch.capacities();
        assert!(scratch.request_segment_body_target(smart131_target(&rows)));
        assert_eq!(scratch.capacities(), capacities_before_request,
                   "requesting immediately before a step must allocate nothing");
        let still_active = scratch.segment_body_pair_aabb_diagnostic().unwrap();
        assert_eq!((still_active.target, still_active.encounter_count,
                    still_active.pair.unwrap().pair_aabb.unwrap().points.to_vec()), completed_owned);
        assert_eq!(scratch.segment_body_target_diagnostic(), None);
        let cloned = scratch.clone();
        assert_eq!(cloned.segment_body_pair_aabb_diagnostic(),
                   scratch.segment_body_pair_aabb_diagnostic());
        assert!(!scratch.request_segment_body_pair_aabb_target(smart131_target(&rows)));
        scratch.begin_segment_body_target_tick();
        assert!(scratch.segment_body_target_diagnostic().is_some());
        assert_eq!(scratch.segment_body_pair_aabb_diagnostic(), None);
        assert!(scratch.request_segment_body_pair_aabb_target(smart131_target(&rows)));
        assert!(!scratch.request_segment_body_target(smart131_target(&rows)));
        scratch.begin_segment_body_target_tick();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scratch).unwrap();
        assert!(scratch.segment_body_pair_aabb_diagnostic().unwrap().pair.is_some());

        for mutation in [ExactSegmentBodyTestMutation::ClearActiveOnRequest,
                         ExactSegmentBodyTestMutation::RefuseOccupiedActive,
                         ExactSegmentBodyTestMutation::AllowSecondPending,
                         ExactSegmentBodyTestMutation::PendingReplacesActive] {
            let (_, mut changed) = smart132_scan(&rows, &exact, ExactSegmentBodyTestMutation::None);
            changed.set_segment_body_test_mutation(mutation);
            let first = changed.request_segment_body_target(smart131_target(&rows));
            let second = changed.request_segment_body_pair_aabb_target(smart131_target(&rows));
            assert!(changed.segment_body_test_mutation_fired());
            let lifecycle_ok = changed.segment_body_pair_aabb_diagnostic().is_some()
                && first && !second;
            assert!(!lifecycle_ok, "each requested/active mutation must make lifecycle red");
        }

        let target = smart131_target(&rows);
        let mut owner = crate::combat::resolution::ContactTickScratch::default();
        owner.reserve(2, 2);
        assert!(owner.request_exact_segment_body_pair_aabb_target(target));
        owner.begin_exact_diagnostics(10);
        assert!(owner.exact_segment_body_pair_aabb_diagnostic().is_some());
        assert!(owner.request_exact_segment_body_target(target));
        assert!(owner.exact_segment_body_pair_aabb_diagnostic().is_some());
        assert_eq!(owner.exact_segment_body_target_diagnostic(), None);
        assert!(!owner.request_exact_segment_body_pair_aabb_target(target));
        let mut owner_clone = owner.clone();
        assert_eq!(owner_clone.exact_segment_body_pair_aabb_diagnostic(),
                   owner.exact_segment_body_pair_aabb_diagnostic());
        owner.begin_exact_diagnostics(11); owner_clone.begin_exact_diagnostics(11);
        assert_eq!(owner_clone.exact_segment_body_target_diagnostic(),
                   owner.exact_segment_body_target_diagnostic());
        assert!(owner.exact_segment_body_target_diagnostic().is_some());
        assert!(owner.request_exact_segment_body_pair_aabb_target(target));
        assert!(!owner.request_exact_segment_body_target(target));
        owner.begin_exact_diagnostics(12);
        assert!(owner.exact_segment_body_pair_aabb_diagnostic().is_some());
        owner.begin_exact_diagnostics(13);
        assert_eq!(owner.exact_segment_body_pair_aabb_diagnostic(), None,
                   "a tick with no pending request expires the old active view");

        let mut retained = crate::combat::resolution::ContactTickScratch::default();
        retained.reserve(2, 2);
        assert!(retained.request_exact_segment_body_pair_aabb_target(target));
        retained.begin_exact_diagnostics(20);
        retained.set_segment_body_test_mutation(
            ExactSegmentBodyTestMutation::RetainOldActiveDespitePending);
        assert!(retained.request_exact_segment_body_target(target));
        retained.begin_exact_diagnostics(21);
        assert!(retained.segment_body_test_mutation_fired());
        assert!(retained.exact_segment_body_pair_aabb_diagnostic().is_some());
        assert_eq!(retained.exact_segment_body_target_diagnostic(), None,
            "retaining old active despite a pending replacement must make lifecycle red");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_pair_aabb_words_round_trip_without_truncation() {
        let mut value = WideRational4096::one();
        for _ in 0..160 { value = wide_add(value, value).unwrap(); }
        let copied = exact_wide_rational_diagnostic(value);
        assert!(copied.numerator.used > 4);
        assert_ne!(copied.numerator.limbs[5], 0);
        assert_eq!(copied.denominator.used, 1);
        assert_eq!(copied.denominator.limbs[0], 1);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn an_authoritative_pair_aabb_reject_is_not_a_recorder_failure() {
        let (rows, mut exact) = smart131_rows(100_000, 500);
        let MotorShape::Segment { ref mut radius_raw, .. } = exact.trajectories[0].motor else {
            panic!("fixture segment changed")
        };
        *radius_raw = i32::MAX;
        let mut scratch = ExactWideScratch::default(); scratch.try_reserve().unwrap();
        let mut state = ExactPairAabbState::default(); state.try_reserve().unwrap();
        let mut fired = 0;
        let mut recorder = ExactPairAabbRecorder { state: &mut state, point_x: None,
            test_mutation: ExactSegmentBodyTestMutation::None,
            test_mutation_receipt: 1,
            test_mutation_fired: &mut fired };
        let result = wide_swept_aabbs_are_disjoint(&exact.trajectories[0], &exact.owners[0],
            &exact.trajectories[1], &exact.owners[1], &mut scratch, Some(&mut recorder));
        assert_eq!(result, Err(ExactScanReject::ArithmeticEnvelope));
        assert_eq!(state.terminal, Some(ExactPairAabbTerminalDiagnostic::Reject(
            ExactScanRejectDiagnostic::ArithmeticEnvelope)));
        assert_eq!(state.recorder_invalid, None);

        let exact = zero_response_compatibility(&rows).unwrap();
        let (result, recorded) = smart132_scan(&rows, &exact,
            ExactSegmentBodyTestMutation::AabbRecorderCapacity);
        assert!(result.is_ok());
        let aabb = recorded.segment_body_pair_aabb_diagnostic().unwrap()
            .pair.unwrap().pair_aabb.unwrap();
        assert!(matches!(aabb.terminal, ExactPairAabbTerminalDiagnostic::Overlap
            | ExactPairAabbTerminalDiagnostic::Disjoint));
        assert_eq!(aabb.recorder_invalid, Some(ExactPairAabbRecorderInvalidDiagnostic::Capacity));
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart131_trace_is_complete(diagnostic: ExactSegmentBodyTargetDiagnostic<'_>) -> bool {
        let Some(pair) = diagnostic.pair else { return diagnostic.encounter_count == 0 };
        pair.regions.len() <= BODY_VOLUME_COUNT
            && pair.visits.len() <= EXACT_SEGMENT_BODY_VISIT_CAP
            && pair.regions.iter().all(|region| {
                let end = region.visit_start + region.visit_count as usize;
                end <= pair.visits.len()
                    && (region.terminal != ExactSegmentBodyRegionTerminalDiagnostic::Reject(
                            ExactScanRejectDiagnostic::Budget) || region.visit_count == 96)
                    && pair.visits[region.visit_start..end].iter().enumerate().all(|(at, visit)|
                        visit.region == region.region && visit.ordinal as usize == at)
            })
    }

    #[cfg(feature = "cartesian-recoil")]
    #[derive(Clone, PartialEq, Eq, Debug)]
    struct Smart131OwnedEvidence {
        target: ExactSegmentBodyDiagnosticTarget,
        encounter_count: u32,
        identity: Option<(EntityId, EntityId, u8, u8, usize, usize,
            ExactScanShapeDiagnostic, ExactScanShapeDiagnostic, ContactKind,
            ExactSegmentBodyOrientationDiagnostic)>,
        control: Option<(u32, bool, Option<bool>, ExactSegmentBodyPairResultDiagnostic)>,
        regions: Vec<ExactSegmentBodyRegionDiagnostic>,
        visits: Vec<ExactSegmentBodyVisitDiagnostic>,
    }

    #[cfg(feature = "cartesian-recoil")]
    fn smart131_owned(diagnostic: ExactSegmentBodyTargetDiagnostic<'_>) -> Smart131OwnedEvidence {
        let identity = diagnostic.pair.map(|pair| (pair.a_entity, pair.b_entity,
            pair.a_slot, pair.b_slot, pair.a_owner, pair.b_owner, pair.a_shape, pair.b_shape,
            pair.kind, pair.orientation));
        let control = diagnostic.pair.map(|pair| (pair.group_time_raw,
            pair.pair_aabb_supported, pair.pair_aabb_disjoint, pair.result));
        Smart131OwnedEvidence { target: diagnostic.target,
            encounter_count: diagnostic.encounter_count, identity, control,
            regions: diagnostic.pair.map_or_else(Vec::new, |pair| pair.regions.to_vec()),
            visits: diagnostic.pair.map_or_else(Vec::new, |pair| pair.visits.to_vec()) }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_requested_segment_body_pair_trace_is_tick_local_and_bounded() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (_, mut scratch) = smart131_scan(&rows, &exact, true,
                                             ExactSegmentBodyTestMutation::None);
        let first = scratch.segment_body_target_diagnostic().unwrap();
        assert_eq!(first.encounter_count, 1); assert!(smart131_trace_is_complete(first));
        let first_pair = first.pair.unwrap();
        let first_identity = (first_pair.a_entity, first_pair.b_entity,
            first_pair.a_slot, first_pair.b_slot, first_pair.a_owner, first_pair.b_owner,
            first_pair.a_shape, first_pair.b_shape, first_pair.kind, first_pair.orientation);
        let first_result = (first_pair.group_time_raw, first_pair.pair_aabb_supported,
                            first_pair.pair_aabb_disjoint, first_pair.result);
        let first_regions = first_pair.regions.to_vec();
        let first_visits = first_pair.visits.to_vec();
        let cloned = scratch.clone();
        assert_eq!(cloned.segment_body_target_diagnostic(),
                   scratch.segment_body_target_diagnostic());
        let cloned_capacities = cloned.capacities();
        assert!(cloned_capacities[18] >= BODY_VOLUME_COUNT);
        assert!(cloned_capacities[19] >= EXACT_SEGMENT_BODY_VISIT_CAP);
        assert!(cloned_capacities[20] >= EXACT_PAIR_AABB_POINT_CAP);
        assert!(cloned_capacities[21] >= EXACT_PAIR_AABB_AXIS_CAP);
        assert!(cloned_capacities[22] >= EXACT_PAIR_AABB_AXIS_CAP);

        let mut pending = ContactCollectionScratch::default(); pending.try_reserve(2).unwrap();
        assert!(pending.request_segment_body_target(smart131_target(&rows)));
        let mut pending_clone = pending.clone();
        pending.begin_segment_body_target_tick(); pending_clone.begin_segment_body_target_tick();
        assert_eq!(pending.segment_body_target_diagnostic(),
                   pending_clone.segment_body_target_diagnostic());
        assert!(scratch.request_segment_body_target(smart131_target(&rows)));
        assert!(!scratch.request_segment_body_target(smart131_target(&rows)));
        scratch.begin_segment_body_target_tick();
        assert_eq!(scratch.segment_body_target_diagnostic().unwrap().encounter_count, 0);
        scratch.begin_segment_body_target_tick();
        assert_eq!(scratch.segment_body_target_diagnostic(), None);

        let mut wrong = smart131_target(&rows); wrong.a_index = 1;
        let mut unencountered = ContactCollectionScratch::default();
        unencountered.try_reserve(2).unwrap();
        assert!(unencountered.request_segment_body_target(wrong));
        unencountered.begin_segment_body_target_tick();
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                               &mut unencountered), Ok(()));
        let missing = unencountered.segment_body_target_diagnostic().unwrap();
        assert_eq!((missing.encounter_count, missing.pair), (0, None));
        unencountered.begin_segment_body_target_tick();
        assert_eq!(unencountered.segment_body_target_diagnostic(), None);

        let mut owner = crate::combat::resolution::ContactTickScratch::default();
        owner.reserve(2, 2);
        assert!(owner.request_exact_segment_body_target(smart131_target(&rows)));
        owner.begin_exact_diagnostics(45);
        assert_eq!(owner.exact_segment_body_target_diagnostic().unwrap().encounter_count, 0);
        owner.begin_exact_diagnostics(46);
        assert_eq!(owner.exact_segment_body_target_diagnostic(), None);
        owner.set_segment_body_test_mutation(ExactSegmentBodyTestMutation::RetainAcrossTick);
        assert!(owner.request_exact_segment_body_target(smart131_target(&rows)));
        owner.begin_exact_diagnostics(47); owner.begin_exact_diagnostics(48);
        assert!(owner.segment_body_test_mutation_fired());
        assert!(owner.exact_segment_body_target_diagnostic().is_some(),
            "bypassing the owning tick reset must make the lifecycle proof red");

        let mut duplicate = ContactCollectionScratch::default(); duplicate.try_reserve(2).unwrap();
        assert!(duplicate.request_segment_body_target(smart131_target(&rows)));
        duplicate.begin_segment_body_target_tick();
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                               &mut duplicate), Ok(()));
        let second_rows = [rows[1], rows[0]];
        let second_trajectories = [exact.trajectories[1], exact.trajectories[0]];
        assert_eq!(scan_exact_candidates_into(&second_trajectories, &exact.owners, &second_rows,
                                               &mut duplicate), Ok(()));
        let duplicate_row = duplicate.segment_body_target_diagnostic().unwrap();
        assert_eq!(duplicate_row.encounter_count, 2);
        let duplicate_pair = duplicate_row.pair.unwrap();
        assert_eq!((duplicate_pair.a_entity, duplicate_pair.b_entity,
            duplicate_pair.a_slot, duplicate_pair.b_slot,
            duplicate_pair.a_owner, duplicate_pair.b_owner,
            duplicate_pair.a_shape, duplicate_pair.b_shape,
            duplicate_pair.kind, duplicate_pair.orientation), first_identity);
        assert_eq!((duplicate_pair.group_time_raw, duplicate_pair.pair_aabb_supported,
                    duplicate_pair.pair_aabb_disjoint, duplicate_pair.result), first_result);
        assert_eq!(duplicate_pair.regions, first_regions);
        assert_eq!(duplicate_pair.visits, first_visits);

        let mut overwritten = ContactCollectionScratch::default();
        overwritten.try_reserve(2).unwrap();
        overwritten.set_segment_body_test_mutation(
            ExactSegmentBodyTestMutation::DuplicateEncounter);
        assert!(overwritten.request_segment_body_target(smart131_target(&rows)));
        overwritten.begin_segment_body_target_tick();
        assert_eq!(scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                               &mut overwritten), Ok(()));
        assert_eq!(scan_exact_candidates_into(&second_trajectories, &exact.owners, &second_rows,
                                               &mut overwritten), Ok(()));
        assert!(overwritten.segment_body_test_mutation_fired());
        assert!(overwritten.segment_body_target_diagnostic().unwrap().pair.is_none(),
            "letting a genuine second encounter overwrite/append must make ownership red");

        let (_, retained) = smart131_scan(&rows, &exact, true,
                                          ExactSegmentBodyTestMutation::RetainAcrossTick);
        let mut retained = retained;
        retained.begin_segment_body_target_tick();
        assert!(retained.segment_body_test_mutation_fired());
        assert!(retained.segment_body_target_diagnostic().is_some(),
                "the deliberate retention mutation must make the tick-local guard red");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn a_budget_exhaustion_records_its_region_and_all_visits() {
        let (rows, exact) = smart131_rows(500_000, 8_000);
        let (result, scratch) = smart131_scan(&rows, &exact, true,
                                              ExactSegmentBodyTestMutation::None);
        assert_eq!(result, Err(ExactScanReject::Budget));
        let diagnostic = scratch.segment_body_target_diagnostic().unwrap();
        assert!(smart131_trace_is_complete(diagnostic));
        let pair = diagnostic.pair.unwrap();
        assert_eq!(pair.result, ExactSegmentBodyPairResultDiagnostic::Reject(
            ExactScanRejectDiagnostic::Budget));
        assert_eq!(pair.visits.len(), 96);
        let budget = pair.regions.iter().find(|row| row.terminal
            == ExactSegmentBodyRegionTerminalDiagnostic::Reject(
                ExactScanRejectDiagnostic::Budget)).unwrap();
        assert_eq!(budget.visit_count, 96);
        assert_eq!(pair.visits[budget.visit_start].ordinal, 0);
        assert_eq!(pair.visits[budget.visit_start + 95].ordinal, 95);

        for mutation in [ExactSegmentBodyTestMutation::DropVisit,
                         ExactSegmentBodyTestMutation::SwapVisits] {
            let (_, changed) = smart131_scan(&rows, &exact, true, mutation);
            assert!(changed.segment_body_test_mutation_fired());
            assert!(!smart131_trace_is_complete(
                changed.segment_body_target_diagnostic().unwrap()),
                "dropping or reordering one real retained visit must make the proof red");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn recording_a_segment_body_trace_does_not_change_the_scan_result() {
        let (rows, exact) = smart131_rows(100_000, 500);
        let (plain_result, plain) = smart131_scan(&rows, &exact, false,
                                                  ExactSegmentBodyTestMutation::None);
        let (recorded_result, recorded) = smart131_scan(&rows, &exact, true,
                                                        ExactSegmentBodyTestMutation::None);
        let evidence = |scratch: &ContactCollectionScratch| (candidate_bytes(scratch),
            scratch.first_pair_rejection, scratch.exact_wide.segment_body_rejection);
        assert_eq!(plain_result, recorded_result);
        assert_eq!(evidence(&plain), evidence(&recorded));

        let mut refused = ContactCollectionScratch::default(); refused.try_reserve(2).unwrap();
        refused.set_segment_body_test_mutation(ExactSegmentBodyTestMutation::RefuseCapacity);
        assert!(!refused.request_segment_body_target(smart131_target(&rows)));
        assert!(refused.segment_body_test_mutation_fired());
        refused.begin_segment_body_target_tick();
        let refused_result = scan_exact_candidates_into(&exact.trajectories, &exact.owners,
                                                        &rows, &mut refused);
        assert_eq!((refused_result, evidence(&refused)), (plain_result, evidence(&plain)));

        let (routed_result, routed) = smart131_scan(&rows, &exact, true,
            ExactSegmentBodyTestMutation::RouteRecorderIntoResult);
        assert!(routed.segment_body_test_mutation_fired());
        assert_ne!((routed_result, evidence(&routed)), (plain_result, evidence(&plain)),
            "routing recorder state into selection must make the inertness proof red");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn wide_candidate_zero_delta_preserves_both_fallback_normals() {
        let row = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let mut other = segment(1, Faction::Monsters, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let point = WidePoint([WideRational4096::zero(); 3]);
        let zero = make_wide_candidate(&row, &other, ContactKind::WeaponWeapon,
            TimeOfImpact::ZERO, &point, &point, [0; 3], Fx::ZERO, 0, NO_VOLUME).unwrap();
        assert_eq!(zero.fact.normal, Vec3::X);
        other.velocity = -Vec3::Y;
        let moving = make_wide_candidate(&row, &other, ContactKind::WeaponWeapon,
            TimeOfImpact::ONE, &point, &point, [0; 3], Fx::ZERO, 0, NO_VOLUME).unwrap();
        assert_eq!(moving.fact.normal, Vec3::Y);
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
        let terms = MAX_ARTICULATED_ENTITIES * BODY_VOLUME_COUNT * 4 - 1;
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
    fn relative_segment_publication_and_rebase_advance_identically_next_tick() {
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
            let published_body = wide_body_origin_quotient(body, &owner).unwrap();
            let published_hilt = published_body + wide_relative_point_quotient(
                hilt, weapon, origin, body, &owner, 65_536).unwrap();
            let rebased = wide_rebase_owner_tick(&exact.trajectories, owner).unwrap();

            let next_point = |point: Vec3| ExactMotorPoint {
                at_tick_start_raw: [point.x.raw(), point.y.raw(), point.z.raw()],
                tick_delta_raw: [0; 3],
            };
            let mut next = exact.trajectories.clone();
            for row in &mut next {
                match &mut row.motor {
                    MotorShape::Projectile { .. } => unreachable!(),
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
        assert_eq!(scratch.candidates()[0].fact.volume, 0);
        assert_eq!(scratch.candidates()[0].fact.velocity_b.x.raw(), 3);

        let MotorShape::Body { ref mut parts, .. } = exact.trajectories[1].motor else { panic!() };
        parts[0].present = false;
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows, &mut scratch).unwrap();
        assert_eq!(scratch.candidates()[0].fact.volume, 1);
    }

    #[test]
    fn unresolved_swept_separation_keeps_the_original_unsupported_refusal() {
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
    fn segment_body_scan_uses_a_complete_certificate_only_after_zero_advance() {
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

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_certificate_work_is_bounded_stable_and_clone_safe() {
        let rows = [
            segment(0, Faction::Heroes, Vec3::Y * Fx::EPSILON,
                    Vec3::Y * Fx::EPSILON, Vec3::ZERO),
            coincident_body(1, Faction::Monsters, Vec3::ZERO),
        ];
        let mut exact = zero_response_compatibility(&rows).unwrap();
        exact.owners[0].common_response.momentum[0].velocity_raw = 100;
        let mut scratch = ContactCollectionScratch::default();
        scratch.try_reserve(2).unwrap();
        let capacities = scratch.capacities();
        let pointers = {
            let work = &scratch.exact_wide.segment_body_separation;
            (work.nodes.as_ptr(), work.points.as_ptr(), work.corners.as_ptr(),
             work.axes.as_ptr(), work.scalar.as_ptr())
        };
        for _ in 0..2 {
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut scratch).unwrap();
            assert!(scratch.candidates().is_empty());
            assert_eq!(scratch.capacities(), capacities);
            let work = &scratch.exact_wide.segment_body_separation;
            assert_eq!((work.nodes.as_ptr(), work.points.as_ptr(), work.corners.as_ptr(),
                        work.axes.as_ptr(), work.scalar.as_ptr()), pointers);
            assert!(work.nodes.is_empty() && work.axes.is_empty());
        }

        let cloned = scratch.clone();
        let work = &cloned.exact_wide.segment_body_separation;
        assert_eq!((work.nodes.capacity(), work.points.capacity(), work.corners.capacity(),
                    work.axes.capacity(), work.scalar.capacity()), (17, 8, 8, 4, 32));
        assert_eq!((work.points.len(), work.corners.len(), work.scalar.len()), (8, 8, 32));
        assert!(work.nodes.is_empty() && work.axes.is_empty());
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
            let mut wide_scratch = ExactWideScratch::default();
            wide_scratch.try_reserve().unwrap();
            // A common one-raw translation selects the wide branch without
            // changing the literal relative geometry.
            for owner in &mut exact.owners {
                owner.common_response.momentum[0].velocity_raw = 1;
            }
            assert_eq!(wide_swept_aabbs_are_disjoint(
                &exact.trajectories[0], &exact.owners[0],
                &exact.trajectories[1], &exact.owners[1], &mut wide_scratch,
                #[cfg(feature = "cartesian-recoil")] None).unwrap(), disjoint);
            let mut scratch = ContactCollectionScratch::default();
            scratch.try_reserve(2).unwrap();
            scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                       &mut scratch).unwrap();
            assert_eq!(scratch.candidates().is_empty(), disjoint);
        }
    }

    #[test]
    /// Four points a swept volume, both sides. Written as the arithmetic rather
    /// than as the 20 that stood here, because the twenty was five regions times
    /// four and the five became [`BODY_VOLUME_COUNT`].
    fn wide_aabb_scratch_reserves_two_exact_per_volume_buffers() {
        let mut scratch = ExactWideScratch::default();
        scratch.try_reserve().unwrap();
        assert_eq!((scratch.aabb_left.len(), scratch.aabb_right.len()), (0, 0));
        assert!(scratch.aabb_left.capacity() >= BODY_VOLUME_COUNT * 4
                && scratch.aabb_right.capacity() >= BODY_VOLUME_COUNT * 4);
    }

    #[test]
    fn wide_aabb_fill_uses_four_eight_and_one_pair_per_volume_in_frozen_order() {
        let segment_row = segment(0, Faction::Heroes, Vec3::ZERO, Vec3::X, Vec3::X);
        let shield_row = ContactCollider { entity: EntityId::new(0, 0),
            faction: Faction::Heroes, slot: 0, mass: Fx::ONE, surface: surface(),
            velocity: Vec3::ZERO, velocity_offset: Vec3::ZERO, present: true,
            shape: ContactShape::Shield { previous: shield_face(),
                requested: shield_face().map(|point| point + Vec3::X) } };
        let body_row = coincident_body(0, Faction::Heroes, Vec3::ZERO);
        // A body contributes four points per **present** volume, and
        // `coincident_body` presents all of them, so the count is the volume
        // count and not the region count. It was 20 while a body was five
        // capsules.
        for (row, count) in [(segment_row, 4), (shield_row, 8),
                             (body_row, BODY_VOLUME_COUNT * 4)] {
            let exact = zero_response_compatibility(&[row]).unwrap();
            let mut points = Vec::new();
            try_reserve_exact(&mut points, BODY_VOLUME_COUNT * 4).unwrap();
            fill_wide_swept_aabb_points(
                &mut points, &exact.trajectories[0], &exact.owners[0], 0, 65_536,
                #[cfg(feature = "cartesian-recoil")] ExactPairAabbSideDiagnostic::A,
                #[cfg(feature = "cartesian-recoil")] None,
            ).unwrap();
            assert_eq!(points.len(), count);
            if count == 4 {
                let (h0, t0, _) = wide_segment_at_time(
                    &exact.trajectories[0], &exact.owners[0], 0).unwrap();
                let (h1, t1, _) = wide_segment_at_time(
                    &exact.trajectories[0], &exact.owners[0], 65_536).unwrap();
                assert_eq!(points.as_slice(), &[h0, t0, h1, t1]);
            }
        }
    }

    #[test]
    fn repeated_pairs_and_regions_reuse_buffers_without_growth() {
        let rows = [segment(0, Faction::Heroes, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO),
                    coincident_body(1, Faction::Monsters, Vec3::ZERO)];
        let exact = zero_response_compatibility(&rows).unwrap();
        let mut scratch = ExactWideScratch::default(); scratch.try_reserve().unwrap();
        let capacities = (scratch.aabb_left.capacity(), scratch.aabb_right.capacity());
        for region in 0..BODY_VOLUME_COUNT {
            let _ = wide_segment_body_region_aabbs_are_disjoint_during(
                &exact.trajectories[0], &exact.owners[0], &exact.trajectories[1],
                &exact.owners[1], region, 0, 65_536, &mut scratch).unwrap();
            assert_eq!((scratch.aabb_left.capacity(), scratch.aabb_right.capacity()), capacities);
            assert_eq!((scratch.aabb_left.len(), scratch.aabb_right.len()), (4, 4));
        }
    }

    #[test]
    /// One past four points a volume refuses, and refuses *before* the push --
    /// which is what keeps the buffer's capacity an argument about the worst
    /// case rather than a place a reallocation can hide.
    ///
    /// The buffer is reserved one row wider than the cap on purpose, so that the
    /// cap is what refuses and not `out.len() == out.capacity()`. The twenty this
    /// was written against did both at once, and could not have told them apart.
    fn a_point_past_the_body_volume_cap_refuses_before_push() {
        let cap = BODY_VOLUME_COUNT * 4;
        let mut points = Vec::new(); try_reserve_exact(&mut points, cap + 1).unwrap();
        for _ in 0..cap {
            push_wide_aabb_point(&mut points,
                WidePoint([WideRational4096::zero(); 3])).unwrap();
        }
        let capacity = points.capacity();
        assert!(capacity > cap, "the cap and the capacity refuse together");
        assert_eq!(push_wide_aabb_point(&mut points,
            WidePoint([WideRational4096::zero(); 3])),
            Err(ExactScanReject::CompatibilityIdentity));
        assert_eq!((points.len(), points.capacity()), (cap, capacity));
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
        scratch.try_reserve(contact_bounds(MAX_ARTICULATED_ENTITIES).unwrap().candidate_bound)
            .unwrap();
        scan_exact_candidates_into(&exact.trajectories, &exact.owners, &rows,
                                   &mut scratch).unwrap();
        assert!(!scratch.candidates().is_empty());
        assert!(scratch.candidates().iter().any(|row|
            row.fact.key.a.index == 0 && row.fact.key.b.index == 1));
    }

    #[cfg(not(feature = "cartesian-recoil"))]
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
        scratch.try_reserve(contact_bounds(2).unwrap().candidate_bound).unwrap();
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
            assert_eq!(facts[0].volume, expected as u8,
                       "a strike at z={} chose region {}", height.raw(), facts[0].volume);
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
        assert_eq!(facts[0].volume, AnatomyRegion::Head as u8);

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
        // Written as a fill plus two writes rather than as a literal list, so
        // that a body growing an eighth volume is a compile error in one place
        // instead of a silently short array here. The five-element literal this
        // replaced is exactly what the forearm session had to find.
        let mut parts = [absent; BODY_VOLUME_COUNT];
        parts[AnatomyRegion::Torso as usize] = sphere(Fx::from_ratio(2, 5));
        parts[AnatomyRegion::LeftArm as usize] = sphere(Fx::ZERO);
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
        assert_eq!(facts[0].volume, AnatomyRegion::LeftArm as u8,
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
        assert_ne!(facts[0].volume, AnatomyRegion::Torso as u8,
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
