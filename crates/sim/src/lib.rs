//! The game. All of it.
//!
//! This crate has no engine, no renderer, no window, no threads, no clock, no
//! I/O and no floating point. It is a state machine you drive by hand:
//!
//! ```text
//!     loop {
//!         for id in world.pending_decisions() {   // who is due to think
//!             let obs = world.observe(id);        // what they can perceive
//!             world.submit(id, policy(obs));      // what they chose to do
//!         }
//!         world.step();                           // advance one tick
//!     }
//! ```
//!
//! Nothing about *how* decisions get made lives here. A hand-authored utility
//! AI, a neural policy, a recorded log, or a human clicking -- they all enter
//! through [`World::submit`] and the sim cannot tell them apart. That boundary
//! is the whole architecture: it is what lets the browser build and the
//! headless experiment lab share one implementation, and what lets a recorded
//! run be replayed exactly without re-running inference.
//!
//! # Determinism
//!
//! Given the same [`Scenario`], seed, and sequence of submitted commands, every
//! tick produces byte-identical state on every platform we target. That holds
//! because:
//!
//! * All arithmetic is fixed point ([`fx`]) -- no libm, no FMA, no vectorised
//!   reduction order to worry about.
//! * [`World`] holds **no RNG state at all**. Randomness (currently only
//!   perception noise) is drawn from `Rng::from_stream(seed, tick, entity)`, so
//!   a value depends on what is being decided, never on visitation order.
//! * Every loop runs in ascending entity index, and every tie breaks on index.
//! * Deaths are applied after all attacks resolve, so simultaneous kills are
//!   symmetric rather than first-come.
//!
//! [`World::state_hash`] fingerprints the whole thing; comparing that hash
//! across native and wasm builds is the regression test that keeps the
//! guarantee honest.

#![forbid(unsafe_code)]

/// Re-exported so downstream crates can talk about world values without
/// separately depending on the math crate.
pub use fx;

mod action;
pub mod anatomy;
mod codec;
mod combat;
mod command;
mod dungeon;
mod entity;
mod event;
mod hand;
mod hash_domain;
mod loadout;
mod obs;
mod pose;
mod replay;
mod rules;
mod scenario;
mod world;

pub use action::{ActionKind, ActionSpec, Role, ACTIONS};
pub use anatomy::{AnatomyState, BodyPart, PartWoundState};
pub use codec::{
    ReplayDecodeError, ReplayEncodeError, ReplayEnvelope, ReplayField, ReplayLimit,
    ReplayPlayError, ReplayStream, ReplayValidationError, ARTICULATED_COMMAND_SCHEMA_RESERVED,
    LEGACY_COMMAND_SCHEMA, REPLAY_CODEC_VERSION,
};
pub use command::{
    ArmTarget, ArticulatedCommandV1, ArticulatedPayloadError, CombatHeight, Command,
    CommandField, CommandReject, GripRequest, Intent, LimbCommand, LimbSlot, Objective, Order,
    Strike, SubmitArticulatedOutcome, SubmittedCommand, ARTICULATED_PAYLOAD_BYTES,
    SUBMITTED_COMMAND_LAYOUT_VERSION,
};
pub use combat::spec::{
    club, fighter_anatomy, shield, sword, AnatomyRegion, AnatomyRegionSpec, AnatomySpecId,
    ArmorSpec, ArticulatedUnitSpecV1, BodyAnatomySpec, CombatSpecError, CombatSpecTableV1,
    EquipmentGeometry, EquipmentSpec, EquipmentSpecId, GripBinding, Material, SurfaceSpec,
    BODY_ANATOMY_SPEC_V1_BYTES, COMBAT_SPEC_SCHEMA_V1, MAX_ANATOMY_SPECS,
    MAX_EQUIPMENT_SPECS, SEGMENT_EQUIPMENT_SPEC_V1_BYTES, SHIELD_EQUIPMENT_SPEC_V1_BYTES,
};
/// The runtime duel description, and nothing else out of `arena`. The builder
/// itself is an `impl Scenario` block and needs no re-export: a caller who has
/// a [`Scenario`] already has [`Scenario::duel_from`].
pub use combat::arena::{AnatomyChoice, DuelConfigV1, DuelFighterV1, HandItemV1};
pub use combat::actuator::{
    ArmState, BodyYawState, GripState, ShieldPose, ARM_BEARING_ACCEL_RAW,
    ARM_BEARING_MAX_SPEED_RAW, ARM_LINEAR_ACCEL_RAW, ARM_LINEAR_MAX_SPEED_RAW,
    ARM_MIN_REACH_RAW, BODY_YAW_ACCEL_RAW, BODY_YAW_MAX_SPEED_RAW,
    FATIGUE_RECOVERY_RAW, FATIGUE_WORK_SCALE_RAW,
};
#[cfg(feature = "lab-calibration")]
pub use combat::actuator::{ArmCalibration, PRODUCTION_ARM_CALIBRATION};
/// The behavioral contact proof, and only it. The collector, the resolver and
/// the collider rows stay private: this is the one thing outside `sim` that has
/// a reason to reach the contact solver before v2-15, and it is the browser
/// boundary re-running the corpus so `tools/wasm_check.js` can compare the two
/// targets byte for byte.
///
/// [`CONTACT_ENERGY_FLOOR`] joins it because a diagnostic that draws the line
/// the physics is being judged against must read the line rather than write it
/// down again. v2-17's ledger leaves the floor open -- a sweep from 144 to 0
/// moved grazes by 69x and region-taking blows not at all -- so the number is
/// expected to move, and the failure mode of a second copy in a viewer is a
/// picture that keeps agreeing with an argument the code stopped making.
pub use combat::resolution::{contact_behavior_corpus, ResolutionError, CONTACT_ENERGY_FLOOR};
/// The contact capacity vocabulary, which the browser needs even though the
/// solver stays private: the host reserves the high water before it hands the
/// page a pointer, and has to be able to say which count refused.
///
/// [`ContactKind`], [`BODY_SLOT`] and [`NO_REGION`] come with it because the
/// host mirrors a resolution row word for word: the kind is a published
/// column, and the two sentinels are the difference between "the body itself"
/// and "slot zero" and between "no anatomy here" and "the head". A second copy
/// of either number on the far side of the wall is a mis-read waiting to
/// happen.
pub use combat::contact::{
    ContactCapacityError, ContactKind, ContactResolution, BODY_SLOT,
    MAX_ARTICULATED_ENTITIES, NO_REGION,
};
/// The two published shapes out of `geometry`, and nothing else. The pose row
/// draws exactly a [`SegmentPose`] and the subject-scoped observation carries
/// exactly a [`RegionVolume`] per region; a parallel struct carrying the same
/// fields would be a second thing to keep in step with the collider builder.
/// The collider rows themselves stay private -- those are the contact phase's
/// business.
pub use combat::geometry::{body_region_volumes, RegionVolume, SegmentPose};
pub use dungeon::{Cardinal, Door, Dungeon, Level, Rect, Torch, CORRIDOR, DOOR, OPEN, WALL};
pub use entity::{EntityId, Faction, Body};
pub use event::Event;
pub use hand::{Hand, Swing};
pub use hash_domain::{DigestCompareError, HashDomain, StateDigest};
pub use loadout::Loadout;
pub use obs::{
    ArticulatedObservation, Contact, Observation, ObservedArm, ObservedOpponent, ObservedShield,
    ARTICULATED_FEATURE_COUNT, ARTICULATED_OPPONENT_FEATURES, ARTICULATED_SELF_FEATURES,
    FEATURE_COUNT, FEATURE_LAYOUT_VERSION, LEGACY_FEATURE_COUNT, MAX_ARTICULATED_OPPONENTS,
};
pub use pose::{AnimationHint, ArticulatedPose, PosedArm};
pub use replay::{CommandRecord, ObjectiveRecord, OrderRecord, Replay, SubmittedCommandRecord};
pub use rules::{
    agility_multiplier, block_leak, blow_damage, dead_zone, peak_damage, peak_impulse, peak_recoil,
    phase_ticks, power_multiplier, strike_ticks, Arm, Stats, ARM_INERTIA, BLOCK_LEAK_BRACED,
    BLOCK_LEAK_SNAP, BLOCK_RECOVERY, BLOCK_RESTITUTION, BODY_RESTITUTION, BRACE_ANCHOR, BRACE_SPIN,
    BRACE_TICKS, CAPABILITY_JUDGEMENT, DIM_INTELLECT, DIM_PERCEPTION, DOOR_REACH, DOOR_TICKS, DT,
    ENERGY_FLOOR,
    ENERGY_TO_DAMAGE, FOLLOW_THROUGH, IMPACT_THRESHOLD, KNOCKBACK_TRANSFER, MAX_CONTACTS,
    MAX_SHOTS, PARRY_RESTITUTION, RECOIL_TRANSFER, RECOVERY_EXPOSURE, STRIKE_SLACK, STRIKE_SPENT_ARC,
    STRIKE_TIMEOUT, TICKS_PER_SECOND, TRACTION_BASE, TRACTION_TICKS, VELOCITY_JUDGEMENT,
    WHIFF_RECOVERY, WINDUP_ARC,
};
pub use scenario::{
    CombatModel, Scenario, ScenarioFingerprintError, UnitSpec, DUNGEON_COLS, DUNGEON_ROWS,
};
pub use world::{Outcome, ShotView, Snapshot, SpawnError, UnitView, World, WorldBuildError};
