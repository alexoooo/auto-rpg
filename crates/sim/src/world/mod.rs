//! `World`: the authoritative state, its construction, and its tick.
//!
//! This module owns the *state* -- `struct World`, the value types its columns
//! and per-tick scratch are made of, and the surface through which a host builds
//! one and submits to it. Everything that *transforms* that state during a tick
//! lives in a sibling module named for the phase group it belongs to, and the
//! order those phases run in is written once, in [`World::step_with_arm_rates`].
//!
//! The columns stay private and are read by the siblings directly, which is
//! sound because a private item in Rust is visible to its defining module **and
//! to all of that module's descendants**. Nothing here becomes `pub(crate)` to
//! make the split compile: if a field would have to, the phase reading it is in
//! the wrong file.

use crate::command::{
    validate_articulated, ArmTarget, ArticulatedCommandV1, Command, CommandReject, GripRequest,
    Intent, LimbSlot, Objective, Order, ReleaseRequest, SubmitArticulatedOutcome,
};
use crate::action::{ActionKind, ActionSpec, Role};
use crate::dungeon::{Cardinal, Door, Dungeon};
use crate::loadout::Loadout;
use crate::entity::{EntityId, Faction, Body};
use crate::event::Event;
use crate::hand::{Hand, Swing};
use crate::obs::{ArticulatedObservation, Contact, Observation, ObservedArm, ObservedOpponent,
                 ObservedOpponentStance, ObservedShield, ObservedStance,
                 MAX_ARTICULATED_OPPONENTS};
use crate::pose::{AnimationHint, ArticulatedPose, PosedArm};
use crate::rules::{self, Stats, MAX_CONTACTS};
use crate::scenario::{CommandFrame, CommandGrammar, Scenario, UnitSpec};
use crate::anatomy::{self, AnatomyState, BodyPart};
use crate::combat::spec::{ArticulatedUnitSpecV1, BodyAnatomySpec, CombatSpecError,
                          CombatSpecTableV1, resolved_equipment, volume_region,
                          BODY_VOLUME_COUNT};
use crate::combat::actuator::{self, ArmState, BodyYawState, ElbowPlaneState, GripState,
                              ShieldPose, StanceState};
use crate::combat::contact::{contact_bounds, medial_point, try_reserve_exact,
                             ContactCapacityError, ContactCollider, ContactKind,
                             ContactResolution, ContactShape,
                             ContactSolverState, RegionSweep, BODY_SLOT,
                             MAX_CONTACT_FACTS_PER_GROUP, MAX_CONTACT_RESOLUTIONS_PER_TICK};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::contact::{wide_body_origin_quotient, wide_relative_point_quotient};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::contact::wide_rebase_owner_tick;
#[cfg(all(test, feature = "cartesian-recoil"))]
use crate::combat::contact::{exact_contact_at_pose, scan_exact_candidates_into};
use crate::combat::geometry::{self, RegionVolume, SegmentPose};
use crate::combat::resolution::{self, ContactTickScratch, ContactTrialProjector,
                                GeneralizedCollider, GeneralizedKind, ResolutionError};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::resolution::{ExactContactRejectPhase, ExactContactRejectionDiagnostic};
#[cfg(feature = "cartesian-recoil")]
use crate::combat::trajectory::{ExactAffine3, ExactContactTrajectory, ExactHeldResponse,
                                ExactMotorBounds, ExactMotorPoint, ExactOwnerTrajectory,
                                ExactMomentum, ExactPosition, ExactTrajectoryReject, FloorReaction, MotorShape,
                                exact_held_velocity, normalize_momentum};
#[cfg(all(test, feature = "cartesian-recoil"))]
use crate::combat::trajectory::{advance_exact, apply_exact_group, evaluate_exact};
use crate::{EquipmentGeometry, EquipmentSpecId};
use fx::{Angle, Fx, Hash64, Rng, Vec2, Vec3};

mod query;
mod hash;
mod legacy;
mod movement;
mod navigation;
mod articulated;
mod projectile;
mod contact_phase;
mod props;
#[cfg(test)]
mod testkit;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    HeroesWin,
    MonstersWin,
    /// Everyone died on the same tick.
    MutualDestruction,
    /// The tick limit arrived with both sides standing, and the side holding
    /// more of its health took the fight on points. See [`World::timeout`].
    Decision(Faction),
    /// The tick limit arrived and the two sides were level.
    Draw,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct RecoilExternalEnergy {
    pub reason_mask: u8,
    pub dissipated_numerator: i128,
    pub supplied_numerator: i128,
}

#[cfg(feature = "cartesian-recoil")]
impl RecoilExternalEnergy {
    pub const RELEASE: u8 = 1;
    pub const REPLACEMENT: u8 = 2;
    pub const SEVERANCE: u8 = 4;
    pub const CAP: u8 = 8;
    pub const WALL: u8 = 16;
    pub const FLOOR: u8 = 32;
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactExternalEnergyRow {
    pub entity: EntityId,
    /// `0` is the body, `1` the left limb, and `2` the right limb.
    pub lane: u8,
    pub reason: u8,
    pub signed_numerator: i128,
    pub denominator: i128,
}

impl Outcome {
    pub const fn winner(self) -> Option<Faction> {
        match self {
            Outcome::HeroesWin => Some(Faction::Heroes),
            Outcome::MonstersWin => Some(Faction::Monsters),
            Outcome::Decision(faction) => Some(faction),
            _ => None,
        }
    }

    /// Whether the fight ended because somebody died rather than because the
    /// clock ran out. A decision is a win; it is not the same win.
    pub const fn is_decisive(self) -> bool {
        matches!(
            self,
            Outcome::HeroesWin | Outcome::MonstersWin | Outcome::MutualDestruction
        )
    }
}

/// The simulation.
///
/// Structure-of-arrays over a generational free list. Not an ECS: at the entity
/// counts this genre needs (tens, not tens of thousands) an archetype engine
/// would buy nothing and would cost the two properties that matter most here --
/// trivially hashable state and a tick loop you can read top to bottom.
///
/// Holds **no RNG state**. See the crate docs.
#[derive(Clone)]
pub struct World {
    seed: u64,
    combat_model: crate::CombatModel,
    combat_specs: Option<CombatSpecTableV1>,
    combat_units: Vec<ArticulatedUnitSpecV1>,
    tick: u32,
    /// Which ground exists. A level change is a new [`World`] and not an edit to
    /// this one; the single edit that *is* allowed is a door opening
    /// ([`Dungeon::open_door`]), which turns rock into floor and never the other
    /// way about.
    dungeon: Dungeon,
    /// `dungeon.extent()`, cached beside it for the same reason [`World::radius`]
    /// and [`World::mass`] are cached beside [`World::kind`]: it is read in the
    /// tick's innermost loops. Safe as a cache precisely because the floor plan
    /// above it cannot change, so the two cannot drift the way a pair of
    /// *settable* fields would.
    arena: Vec2,
    orders: [Order; 2],
    /// What each faction is trying to reach. The second input channel; see
    /// [`Objective`] for why it is an input and not something the sim works out
    /// for itself.
    objectives: [Objective; 2],

    generation: Vec<u32>,
    alive: Vec<bool>,
    kind: Vec<Body>,
    faction: Vec<Faction>,
    stats: Vec<Stats>,
    pos: Vec<Vec2>,
    /// This tick's displacement, including any shove from [`World::separate`].
    /// A real column and not a derivation, because impact speed is a *closing*
    /// speed and the shove genuinely contributed to it.
    /// Integrated velocity, world units per tick. **State**, not a measurement:
    /// it used to be recomputed each tick as `pos - start_pos` purely so a blow
    /// could read a closing speed, and a body could therefore reverse it
    /// outright between two ticks. It now carries across ticks, is bounded by
    /// [`Stats::traction`], and is what a collision or a blow actually changes.
    vel: Vec<Vec2>,
    /// The floor height under `pos`, in world units.
    ///
    /// **Derived, and stored anyway.** It is a pure function of `pos` and the
    /// dungeon, but the contact phase and the pose publication both read it and
    /// must agree; recomputing it in two places is how they would stop. It is
    /// maintained wherever `pos` changes, so the pair can never be observed
    /// disagreeing -- the same property `Dungeon`'s cached digest rests on.
    ///
    /// Zero on every flat dungeon, which is every shipped scenario, so this
    /// column costs the other two models one `Fx` and no behaviour at all.
    ground_z: Vec<Fx>,
    facing: Vec<Angle>,
    radius: Vec<Fx>,
    /// Body mass, with a Fighter as the unit. Cached beside [`World::radius`]
    /// for the same reason: it is read in the tick's innermost loops and derived
    /// from [`World::kind`]. Not fixed for the life of the entity any more --
    /// [`World::set_body`] rewrites all three together, which is why
    /// [`World::state_hash`] now writes the cached column as well as the kind it
    /// came from.
    mass: Vec<Fx>,
    hp: Vec<Fx>,
    max_hp: Vec<Fx>,
    limb: Vec<Hand>,
    /// What each unit brought. See `crate::Loadout`.
    loadout: Vec<Loadout>,
    /// Which loadout slot is in hand. Always `0` until the swap lands.
    slot: Vec<u8>,
    next_decision: Vec<u32>,
    command: Vec<Command>,
    /// Last accepted submitted command for the articulated domain. Separate
    /// from the legacy column so an inert articulated world cannot change a
    /// legacy tick or hash by merely existing.
    ///
    /// It carries the articulated *half* of an embodied command too; the
    /// embodied-only half lives in [`World::elbow_plane`]. See
    /// [`World::submit_embodied_v1`] for why the split happened where it did.
    articulated_command: Vec<Option<ArticulatedCommandV1>>,
    articulated_anatomy: Vec<Option<u16>>,
    articulated_carried: Vec<[Option<u16>; 2]>,
    articulated_equipment: Vec<[Option<u16>; 2]>,
    body_yaw: Vec<BodyYawState>,
    /// The legs, for the one model that has them. Empty otherwise, on the same
    /// terms as every other articulated column: a model that answers `false` to
    /// [`crate::CombatModel::has_stance`] allocates none of it, so a `Legacy` or
    /// `Articulated` world cannot pay for a mechanic it does not have.
    stance: Vec<StanceState>,
    /// The commanded and held elbow plane, per arm, for the one model whose
    /// command grammar carries one. Empty otherwise, on
    /// [`World::stance`]'s terms: a model answering `false` to
    /// [`crate::CombatModel::has_swing_plane`] allocates none of it.
    ///
    /// **This is the column the embodied command was always going to need**, and
    /// it is one column rather than two because commanded and held are the same
    /// fact at two times -- splitting them would put a request and a pose in
    /// different rows and let one be updated without the other.
    elbow_plane: Vec<[ElbowPlaneState; 2]>,
    arms: Vec<[ArmState; 2]>,
    grips: Vec<[GripState; 2]>,
    /// Release edge remembered independently of the submitted command, which persists.
    articulated_release_was: Vec<[ReleaseRequest; 2]>,
    /// Exact contact response, one row per allocated articulated slot. `None`
    /// is the canonical all-zero inactive row; an active row keeps immutable
    /// equipment identity beside the remainder it owns.
    #[cfg(feature = "cartesian-recoil")]
    exact_owners: Vec<Option<ExactOwnerTrajectory>>,
    shield_pose: Vec<Option<ShieldPose>>,
    move_authority: Vec<Fx>,
    turn_authority: Vec<Fx>,
    arm_authority: Vec<[Fx; 2]>,
    /// The articulated health authority, one row per allocated slot. Empty in
    /// every Legacy world, which is what keeps `hp`, `max_hp` and `regen_left`
    /// the only health there is over there.
    ///
    /// It is taken out of the world for the length of one contact solve -- see
    /// [`World::resolve_contact`] -- because the trial projector holds `&World`
    /// and the wound application needs to write. Nothing may read this column
    /// while it is out; the phase puts it back before anything can.
    wounds: Vec<AnatomyState>,
    /// `None` in every Legacy world, and that is the whole isolation argument:
    /// legacy allocates nothing, hashes nothing, and runs no contact phase
    /// because there is no state here to run one against.
    contact: Option<ContactRuntime>,
    #[cfg(test)]
    phase_trace_enabled: bool,
    #[cfg(test)]
    phase_trace: Vec<&'static str>,
    last_attacker: Vec<EntityId>,
    /// Tick of the last blow dealt or received; gates regeneration.
    last_combat: Vec<u32>,
    /// Health this unit may still regenerate this fight. See
    /// [`rules::REGEN_BUDGET`].
    regen_left: Vec<Fx>,
    damage_dealt: Vec<Fx>,

    // ---- arrows in flight.
    //
    // Their own arrays and their own free list, because a projectile is not an
    // entity: it has no health, no stats, no limb, no loadout and no decision
    // clock, and putting it through `spawn` would mean giving it all five.
    //
    // Everything a blow needs is **frozen at the release**, for the same reason
    // `Hand::line` is frozen when a cut commits: an arrow is a fact about the
    // past. Its archer may have swapped the bow away, walked off, or died, and
    // none of that may change what is already in the air.
    /// Whether this slot holds a live arrow.
    shot_alive: Vec<bool>,
    /// Position at the end of the last tick. The previous position is not a
    /// column: velocity is constant over a flight, so `resolve_shots` carries
    /// the near end of the segment in a local.
    shot_pos: Vec<Vec2>,
    /// Constant for the life of the shot, world units per tick. Nothing slows an
    /// arrow in this model -- no drag, no gravity -- so range is bounded by
    /// [`World::shot_range`] rather than by the arrow running out of speed.
    shot_vel: Vec<Vec2>,
    /// World units of flight left, from the archer's [`Stats::sight_range`].
    /// **Spent as distance rather than counted in ticks**, so a faster shot
    /// reaches further within the same budget instead of merely arriving sooner.
    shot_range: Vec<Fx>,
    /// The bow's [`ActionSpec::mass`] and the archer's [`rules::power_multiplier`],
    /// so `rules::blow_damage` can be called at impact exactly as a blade calls
    /// it -- see [`World::loose`] for why the bow's own mass is the honest term.
    shot_mass: Vec<Fx>,
    shot_power: Vec<Fx>,
    /// Who loosed it, and for whom. The faction is frozen *separately* from the
    /// owner: an arrow whose archer is already dead still must not hit its own
    /// side, and a dead owner's handle no longer resolves to a faction.
    shot_owner: Vec<EntityId>,
    shot_faction: Vec<Faction>,
    shot_free: Vec<u32>,

    // Articulated arrows are deliberately not legacy shots. The legacy hash writes
    // every shot column wholesale, while this store belongs only to ArticulatedV1.
    articulated_projectile_alive: Vec<bool>,
    articulated_projectile_generation: Vec<u32>,
    articulated_projectile_pos: Vec<Vec3>,
    articulated_projectile_vel: Vec<Vec3>,
    articulated_projectile_range: Vec<Fx>,
    articulated_projectile_radius: Vec<Fx>,
    articulated_projectile_mass: Vec<Fx>,
    articulated_projectile_owner: Vec<EntityId>,
    articulated_projectile_faction: Vec<Faction>,
    articulated_projectile_free: Vec<u32>,

    free: Vec<u32>,
    events: Vec<Event>,
    pending: Vec<EntityId>,

    /// The doorways on this level and how hard somebody is leaning on each,
    /// in the order [`Dungeon::doorways`] found them.
    ///
    /// Fixed for the life of the world in count and in position -- a door can
    /// open and nothing can make one -- so an index into this is stable and
    /// [`World::state_hash`] can write the column straight down.
    doors: Vec<DoorState>,

    /// Physical dungeon dressing. Kept outside `Dungeon`: tiles answer where
    /// ground exists, while these rows have durability and may become inert.
    /// Generated only for the shipped carved level, so flat combat fixtures
    /// allocate and hash no prop state at all.
    dungeon_props: Vec<DungeonPropState>,

    /// One route field per faction **per door capability**, indexed
    /// `[faction][opens_doors as usize]`. See [`Nav`].
    ///
    /// Two arms rather than one because a faction is not uniform: Monsters may
    /// hold a Brute that must walk around a shut door and a Rogue that walks
    /// through it, and one field cannot answer both. The arms are identical on a
    /// level with no shut door left, which is most of a level's life, so
    /// [`World::refresh_nav`] builds the second only while one is still shut
    /// *and* this side holds a living body that opens doors -- the two halves of
    /// [`World::nav_arm`]'s own test -- and [`World::nav_arm`] reads only the
    /// first otherwise.
    nav: [[Nav; 2]; 2],
    /// Scratch for [`World::refresh_nav`]: the search frontier and the cells it
    /// starts from.
    ///
    /// **Held on the world rather than allocated per rebuild, and that is not
    /// tidiness.** This crate is compiled to wasm and driven from a page that
    /// holds typed-array views into linear memory; an allocation can grow that
    /// memory, and growing it *detaches every view the page is holding*. A
    /// search that allocates is a search that can blank the screen.
    nav_queue: Vec<u32>,
    nav_seeds: Vec<u32>,

    // Per-tick scratch. Held on the world so the tick loop allocates once for
    // the life of the fight rather than once per tick. Always empty by the time
    // anything can observe the world, so neither enters `state_hash`.
    blows: Vec<Blow>,
    pierces: Vec<Pierce>,
    impulses: Vec<Impulse>,
    prop_impacts: Vec<PropImpact>,
    start_pos: Vec<Vec2>,
    /// Where each sword blade was before this tick's motion, so
    /// [`World::resolve_swings`] can sweep the segment rather than sample it.
    /// `None` for a hand that was too tucked to be a hitbox, which is also how
    /// a blade that has only just come out reports: it has no history to sweep
    /// through, so it is tested where it is.
    blade_was: Vec<Option<(Vec2, Vec2)>>,
    /// Each sword's momentum along its own travel direction at the top of the
    /// tick. Differenced against the same figure at the bottom of the tick to
    /// bill the body for the reaction; see [`World::apply_recoil`].
    blade_p: Vec<Fx>,
    /// Which doors somebody leant on this tick. One entry per door; see
    /// [`World::press_doors`] for why the two passes cannot be one.
    door_pushed: Vec<bool>,
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct ArticulatedPoseTestView {
    pub body_yaw: BodyYawState,
    pub arms: [ArmState; 2],
    pub grips: [GripState; 2],
    pub shield_pose: Option<ShieldPose>,
    pub move_authority: Fx,
    pub turn_authority: Fx,
    pub arm_authority: [Fx; 2],
}

/// A doorway and how hard somebody is leaning on it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct DoorState {
    door: Door,
    open: bool,
    /// Ticks of accumulated pressure. Decays when nobody is pushing, so a body
    /// that brushes past a door on twenty separate occasions does not eventually
    /// open it by accident.
    pressed: u16,
}

/// Stable object kinds shared with the browser's `DUNGEON_OBJECT_V1` rows.
#[repr(u32)]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum DungeonObjectKind {
    Door = 1,
    Torch = 2,
    Barrel = 3,
    Pottery = 4,
    Web = 5,
    Water = 6,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct DungeonPropState {
    identity: u32,
    kind: DungeonObjectKind,
    position: Vec2,
    yaw: Angle,
    half_extents: Vec2,
    hp: Fx,
    max_hp: Fx,
    broken: bool,
}

/// Read-only authoritative object state. Presentation may interpolate or dress
/// this row, but may never feed a transform back into the simulation.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct DungeonObjectView {
    pub kind: DungeonObjectKind,
    pub identity: u32,
    pub state_flags: u32,
    pub position: Vec2,
    pub yaw: Angle,
    pub half_extents: Vec2,
    pub hp: Fx,
    pub max_hp: Fx,
    pub progress: Fx,
    pub material_code: u32,
}

/// Tile distances from one faction's objective, and what they were built for.
///
/// **Not hashed.** A derivation of the floor plan and the objectives, both of
/// which are, and therefore in the same class as [`World::pending`] and the
/// per-tick scratch: state that can be recomputed from hashed state cannot make
/// two worlds differ without the hashed state differing first.
#[derive(Clone, Default)]
struct Nav {
    /// One entry per tile, in tiles, [`u16::MAX`] where the objective cannot be
    /// reached. Empty when there is no objective at all.
    dist: Vec<u16>,
    /// Fingerprint of the floor plan and the cells the field was grown from.
    /// The field is stale exactly when this changes, which for a walking quarry
    /// is once every twenty-odd ticks rather than every tick.
    key: u64,
}

/// The longest a sub-step of [`World::move_body`] may be.
///
/// Half a tile, because the thinnest masonry the generator produces is one tile
/// and a step shorter than half of it cannot begin and end on opposite sides of
/// one without a sub-step landing inside it.
const HALF_TILE: Fx = Fx::HALF;

/// The furthest [`World::move_body`] will carry a body in one call.
///
/// A sanity bound rather than a rule of the game: walking is 0.05 units a tick
/// and the hardest knockback in the roster is nowhere near this, so nothing
/// reaches it in play. It is here so that a future rule which *does* produce a
/// wild displacement costs four sub-steps instead of a hundred.
const MAX_STEP: Fx = Fx::TWO;

/// A landed blow, collected during the read-only pass and applied afterwards.
#[derive(Clone, Copy)]
struct Blow {
    source: usize,
    target: usize,
    amount: Fx,
    absorbed: Fx,
    blocked: bool,
    at: Vec2,
    /// Velocity the blow adds to the target, world units per tick. Carried on
    /// the blow rather than applied where it is computed because the first pass
    /// is read-only: [`World::impact_speed`] reads `vel`, so a shove written
    /// there would change what the *next* attacker's blow is worth and make a
    /// mutual exchange depend on entity index.
    shove: Vec2,
}

/// A landed arrow, collected during the read-only pass and applied afterwards.
///
/// [`Blow`]'s twin, and a separate type rather than a reuse because the source
/// is a **handle** and not an index. An arrow outlives the archer that loosed
/// it, so by the time it lands there may be no entity left to credit -- and the
/// slot that owner occupied may belong to somebody else entirely.
#[derive(Clone, Copy)]
struct Pierce {
    shot: usize,
    target: usize,
    source: EntityId,
    amount: Fx,
    absorbed: Fx,
    blocked: bool,
    at: Vec2,
    shove: Vec2,
}

/// A prop hit collected against the tick-start snapshot and applied in a
/// canonical order. Time of impact is first so simultaneous weapons cannot
/// make destruction depend on entity allocation order.
#[derive(Clone, Copy)]
struct PropImpact {
    toi: Fx,
    prop: usize,
    attacker: EntityId,
    amount: Fx,
}

fn sort_prop_impacts(impacts: &mut [PropImpact], props: &[DungeonPropState]) {
    impacts.sort_by_key(|impact|
        (impact.toi, props[impact.prop].identity, impact.attacker));
}

/// A change to a hand's motion, likewise deferred.
#[derive(Clone, Copy)]
struct Impulse {
    entity: usize,

    /// Multiplies the existing spin. Negative values reverse the swing.
    scale: Fx,
    /// Added after scaling, in raw angle units per tick.
    add: Fx,
    /// Extra recovery ticks to end the running attack with, if this impulse
    /// ends one at all. `None` leaves the phase machine alone -- which is what
    /// a shoved *shield* wants, having no attack to interrupt.
    recover: Option<u16>,
}

/// Retained contact state for an Articulated world.
///
/// `state` and the feature-only exact external-energy rows are authoritative:
/// ArticulatedV1 hashing writes `cap_hits` and those reconciliation rows. The
/// remaining scratch and published resolutions are evidence, which is why the
/// whole struct sits outside `legacy_core_hash`.
///
/// Reserved once against the allocated-slot high water, for the same reason
/// `nav_queue` is held on the world rather than allocated per rebuild: this
/// crate is driven from a page holding typed-array views into linear memory,
/// and a `Vec` that grows can grow that memory and detach every one of them.
#[derive(Default)]
struct ContactRuntime {
    state: ContactSolverState,
    scratch: ContactTickScratch,
    colliders: Vec<ContactCollider>,
    /// `colliders` as the builder left them, before the driver advanced any of
    /// them.
    ///
    /// It exists because `colliders` is the driver's working set and not a
    /// record of the question: `advance_to` walks the rows forward to each
    /// group's mapped time in place, and `finish_all` lands them on the answer.
    /// A reader who wants the sweep the solver was asked about therefore cannot
    /// have it from `colliders` at any time after the solve -- previous and
    /// requested have collapsed onto the same pose, and a limb severed mid-tick
    /// reads `present: false` as though it had never been swept at all. That
    /// copy is what [`World::swept_weapon`] and [`World::swept_regions`]
    /// publish, and it is the only reason this vector exists: nothing in the
    /// tick reads it.
    swept: Vec<ContactCollider>,
    resolutions: Vec<ContactResolution>,
    entry: Vec<TickEntry>,
    /// One row per body in the trial closure, so an equipment row can read the
    /// delta that translates it. Retained rather than built inside `project`,
    /// which the greedy alpha search calls up to eighteen times a group.
    bodies: Vec<BodyTrial>,
    /// The anatomy as the tick found it, so a mid-tick `ResolutionError` can put
    /// the world back exactly as it was. The rest of the phase already has that
    /// property for free -- it solves in scratch and commits afterwards -- but
    /// wounds are applied group by group inside the driver, which is the one
    /// place that argument does not reach.
    anatomy_entry: Vec<AnatomyState>,
    /// Damage this tick's wounds credited, per slot, folded into the hashed
    /// `damage_dealt` column when the phase ends. Scratch rather than state:
    /// it is cleared at the top of every tick.
    credit: Vec<Fx>,
    /// One accumulator per slot for the group currently being applied.
    deltas: Vec<AnatomyDelta>,
    /// The integrity loss each row of the current group applied, so credit is
    /// per fact rather than per region -- two blows on one arm are two sources.
    fact_loss: Vec<Fx>,
    #[cfg(feature = "cartesian-recoil")]
    exact_trajectories: Vec<ExactContactTrajectory>,
    #[cfg(feature = "cartesian-recoil")]
    exact_owners: Vec<ExactOwnerTrajectory>,
    /// Transaction entry rows retained on the runtime. Keeping these on the
    /// heap avoids putting the exact owner's wide words on the wasm stack.
    #[cfg(feature = "cartesian-recoil")]
    exact_owner_entry: Vec<ExactOwnerTrajectory>,
    #[cfg(feature = "cartesian-recoil")]
    exact_trajectory_entry: Vec<ExactContactTrajectory>,
    #[cfg(feature = "cartesian-recoil")]
    exact_commit: Vec<ExactCommitRow>,
    #[cfg(feature = "cartesian-recoil")]
    recoil_external: Vec<[RecoilExternalEnergy; 2]>,
    #[cfg(feature = "cartesian-recoil")]
    floor_reactions: Vec<FloorReaction>,
    /// This tick's exact external reconciliation. Unlike contact resolutions,
    /// these rows explain authoritative state replaced by a lifecycle or
    /// boundary constraint, so replay comparison and the feature hash own them.
    #[cfg(feature = "cartesian-recoil")]
    exact_external_energy: Vec<ExactExternalEnergyRow>,
    /// How many ticks the solver refused, cumulative.
    ///
    /// **The only external witness that a group was rejected**, and it exists
    /// because there is no other. The error arm below clears
    /// `resolutions`, so a reader outside this crate cannot tell a tick whose
    /// contact phase was abandoned from a tick where nothing touched -- which
    /// made `lab articulated`'s "max energy excess" field unfalsifiable: the
    /// one condition it looks for, `after > before`, is exactly the condition
    /// that deletes the rows it would have looked at.
    ///
    /// A diagnostic and not authoritative state: it is deliberately in
    /// `ContactRuntime` rather than in `state`, because nothing here reaches
    /// the digest except `state.cap_hits`, and this must not. `cap_hits` is
    /// hashed because a capped tick is a tick whose *physics* was truncated;
    /// a rejected tick left the world exactly as it found it.
    rejections: u32,
    /// The first rejection's cause, on `RunResult::first_rejection`'s
    /// precedent: a count says how wide the blind spot is and names nothing to
    /// go and look at, and by the time anybody reads the count the tick that
    /// would have said is thousands of ticks gone.
    first_rejection: Option<ResolutionError>,
    /// Feature-only evidence for the first exact refusal.  It is deliberately
    /// beside the unhashed counter rather than in `ContactSolverState`.
    #[cfg(feature = "cartesian-recoil")]
    first_exact_rejection: Option<ExactContactRejectionDiagnostic>,
    /// The high water every vector above is reserved for. A request at or below
    /// it is a no-op, which is exactly what makes reusing a dead slot free.
    high_water: usize,
}

impl ContactRuntime {
    fn reserve(&mut self, high_water: usize) -> Result<(), ContactCapacityError> {
        if high_water <= self.high_water { return Ok(()); }
        let bounds = contact_bounds(high_water)?;
        self.scratch.try_reserve(bounds.collider_bound, bounds.candidate_bound)?;
        try_reserve_exact(&mut self.colliders, bounds.collider_bound)?;
        try_reserve_exact(&mut self.swept, bounds.collider_bound)?;
        try_reserve_exact(&mut self.resolutions, MAX_CONTACT_RESOLUTIONS_PER_TICK)?;
        try_reserve_exact(&mut self.entry, high_water)?;
        try_reserve_exact(&mut self.bodies, high_water)?;
        try_reserve_exact(&mut self.anatomy_entry, high_water)?;
        try_reserve_exact(&mut self.credit, high_water)?;
        try_reserve_exact(&mut self.deltas, high_water)?;
        try_reserve_exact(&mut self.fact_loss, MAX_CONTACT_FACTS_PER_GROUP)?;
        #[cfg(feature = "cartesian-recoil")]
        try_reserve_exact(&mut self.recoil_external, high_water)?;
        #[cfg(feature = "cartesian-recoil")]
        {
            try_reserve_exact(&mut self.floor_reactions, MAX_CONTACT_RESOLUTIONS_PER_TICK)?;
            try_reserve_exact(&mut self.exact_external_energy, MAX_CONTACT_RESOLUTIONS_PER_TICK)?;
            try_reserve_exact(&mut self.exact_trajectories, bounds.collider_bound)?;
            try_reserve_exact(&mut self.exact_owners, high_water + rules::MAX_SHOTS)?;
            try_reserve_exact(&mut self.exact_owner_entry, high_water + rules::MAX_SHOTS)?;
            try_reserve_exact(&mut self.exact_trajectory_entry, bounds.collider_bound)?;
            try_reserve_exact(&mut self.exact_commit, high_water)?;
        }
        self.high_water = high_water;
        Ok(())
    }
}

/// What one resolved group does to one body, accumulated before any of it is
/// applied.
///
/// The whole reason this exists is mutual kills. Every fact in a group reads
/// one pre-group anatomy, so two fighters who land lethal blows on the same
/// mapped time both land them: neither is dead when the other's blow is
/// measured. Applying fact by fact would make the earlier `ContactKey` win a
/// fight that has no winner.
#[derive(Clone, Copy)]
struct AnatomyDelta {
    parts: [PartDelta; BodyPart::COUNT],
    /// The group's whole integrity loss on this body, which is what shock reads.
    integrity_loss: Fx,
    /// The source of the last fact in `ContactKey` order that wounded this body.
    last_attacker: EntityId,
    touched: bool,
}

#[derive(Clone, Copy)]
struct PartDelta {
    integrity_loss: Fx,
    wound_gain: Fx,
}

impl Default for AnatomyDelta {
    fn default() -> AnatomyDelta {
        AnatomyDelta {
            parts: [PartDelta { integrity_loss: Fx::ZERO, wound_gain: Fx::ZERO }; BodyPart::COUNT],
            integrity_loss: Fx::ZERO,
            last_attacker: EntityId::NONE,
            touched: false,
        }
    }
}

/// One body's trial outcome inside a single projection.
///
/// The body row is what couples a group: its delta translates every collider
/// its entity holds, so the equipment pass has to read a value the body pass
/// produced rather than its own accumulator alone.
#[derive(Clone, Copy)]
struct BodyTrial {
    entity: EntityId,
    /// The trial body velocity, which is also the origin every held collider's
    /// relative hand is measured against.
    velocity: Vec3,
    /// What the accumulator and the clamp between them actually moved.
    delta: Vec3,
}

fn limb_body_part(slot: u8) -> Option<BodyPart> {
    match slot {
        s if s == LimbSlot::LeftArm as u8 => Some(BodyPart::LeftArm),
        s if s == LimbSlot::RightArm as u8 => Some(BodyPart::RightArm),
        _ => None,
    }
}

/// The componentwise midpoint, added in `i64` so that two large coordinates
/// cannot saturate before the divide.
fn midpoint3(a: Vec3, b: Vec3) -> Vec3 {
    let component = |a: Fx, b: Fx| Fx::from_raw(((a.raw() as i64 + b.raw() as i64) / 2) as i32);
    Vec3::new(component(a.x, b.x), component(a.y, b.y), component(a.z, b.z))
}

/// One slot's authoritative pose as the articulated tick found it.
///
/// Contact sweeps from where the tick began rather than from where the actuator
/// finished, so these rows must be taken before the first phase writes a column.
/// `locomotion` is the odd one out: it can only be taken *between* movement and
/// separation, because that is the one moment the intended step exists on its
/// own. Subtracting it back off the settled position is what shifts both sweep
/// endpoints equally, and that is what stops `World::separate`'s positional
/// overlap correction from manufacturing contact speed out of nothing.
#[derive(Clone, Copy)]
struct TickEntry {
    pos: Vec2,
    locomotion: Vec2,
    arms: [ArmState; 2],
    /// Each arm's elbow as the tick began, body-relative, or `None` for a
    /// one-link arm and for a hand the links cannot reach.
    ///
    /// **Retained rather than re-derived, and that is the whole reason it is a
    /// column here.** The contact phase sweeps from the tick-entry pose to the
    /// settled one, so it needs the elbow at *both* ends -- and the entry end is
    /// a function of the entry hand and the plane the body was holding then.
    /// Solving it at collider-build time would apply this tick's plane, already
    /// chased by up to `ELBOW_PLANE_MAX_SPEED_RAW`, to last tick's hand: an arm
    /// that swung its elbow across the body would sweep a forearm from a joint it
    /// never occupied, and hand the solver a closing speed nothing produced.
    ///
    /// It sits beside `arms` because it is the same kind of fact -- where the
    /// limb was -- and because this buffer's lifetime is already exactly one
    /// tick's contact evidence.
    elbows: [Option<Vec3>; 2],
    shield: Option<ShieldPose>,
    /// Retained because the contract's retention list says to. The commit turned
    /// out not to read either: an arm's inverse map and the `Both` mirror both
    /// want the yaw and the grips the tick *ended* on -- the yaw phase and the
    /// grip phase have already run by the time contact does, and mapping a hand
    /// back through a stale shoulder would put the pose somewhere the body is
    /// no longer facing. They stay captured rather than being deleted because
    /// v2-15 reads the entry pose to attribute a wound to the limb that was
    /// holding the weapon when the tick began, and the retention phase is the
    /// only place those rows still exist.
    #[allow(dead_code)]
    yaw: BodyYawState,
    #[allow(dead_code)]
    grips: [GripState; 2],
    /// The scalar joint pose the contact phase found, before its own entry
    /// clamp or its solve wrote one.
    ///
    /// Contact's scalar speeds are what *it* changed over the fraction of the
    /// tick it had left, so they are measured from here and not from `arms`
    /// above: the actuator's own motion this tick is already billed, and
    /// re-billing it would report a swing's speed as the block's.
    pre_contact: [ArmScalars; 2],
    /// Whether the entry clamp moved that hand. Such a row's collider was built
    /// *after* the clamp, so its solved endpoint equals its requested one and
    /// nothing downstream can tell it apart from an untouched arm -- but the
    /// contract still owes it the same commit a contacted arm gets, and this
    /// is the only surviving evidence that it is owed.
    clamped: [bool; 2],
    /// Whether the commit wrote that limb's joint pose -- the solve moved the
    /// hand, the entry clamp did, or the group cap zeroed it.
    ///
    /// Evidence for [`World::articulated_pose`]'s `Recoiling` hint and nothing
    /// else. It is **not** `clamped` above, which is the velocity-envelope
    /// tripwire alone and is close to unreachable in specified play; the
    /// question an animation asks is whether the arm ended the tick somewhere
    /// the actuator did not put it, and only the commit knows that. Retained
    /// here rather than in a world column because this is already the buffer
    /// whose lifetime is exactly one tick's contact evidence -- the same
    /// lifetime as `contact_resolutions()` -- and because nothing in
    /// `ContactRuntime` is hashed except `state.cap_hits`, so a diagnostic
    /// cannot leak into the digest by being written down in the wrong place.
    contact_overrode: [bool; 2],
}

/// The three scalars a joint pose is, without the derived hand or the speeds.
#[derive(Clone, Copy)]
struct ArmScalars {
    bearing: Angle,
    height: crate::CombatHeight,
    reach: Fx,
}

impl ArmScalars {
    fn of(arm: ArmState) -> ArmScalars {
        ArmScalars { bearing: arm.bearing, height: arm.height, reach: arm.reach }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorldBuildError {
    CombatSpec(CombatSpecError),
    Contact(ContactCapacityError),
    #[cfg(feature = "cartesian-recoil")]
    ExactLattice(ExactLatticeEnvelope),
}

impl Clone for ContactRuntime {
    fn clone(&self) -> Self {
        let mut cloned = Self::default();
        cloned.state = self.state.clone();
        cloned.scratch = self.scratch.clone();
        // `Vec::clone` keeps length, not spare capacity. Reserve only after all
        // nested retained scratch has been copied, while the clone's high-water
        // mark is still zero, or an empty runtime clone would silently skip it.
        cloned.reserve(self.high_water)
            .expect("an existing contact runtime's retained bounds remain valid");
        cloned.colliders.extend_from_slice(&self.colliders);
        cloned.swept.extend_from_slice(&self.swept);
        cloned.resolutions.extend_from_slice(&self.resolutions);
        cloned.entry.extend_from_slice(&self.entry);
        cloned.bodies.extend_from_slice(&self.bodies);
        cloned.anatomy_entry.extend_from_slice(&self.anatomy_entry);
        cloned.credit.extend_from_slice(&self.credit);
        cloned.deltas.extend_from_slice(&self.deltas);
        cloned.fact_loss.extend_from_slice(&self.fact_loss);
        #[cfg(feature = "cartesian-recoil")]
        {
            cloned.exact_trajectories.extend_from_slice(&self.exact_trajectories);
            cloned.exact_owners.extend_from_slice(&self.exact_owners);
            cloned.exact_owner_entry.extend_from_slice(&self.exact_owner_entry);
            cloned.exact_trajectory_entry.extend_from_slice(&self.exact_trajectory_entry);
            cloned.exact_commit.extend_from_slice(&self.exact_commit);
            cloned.recoil_external.extend_from_slice(&self.recoil_external);
            cloned.floor_reactions.extend_from_slice(&self.floor_reactions);
            cloned.exact_external_energy.extend_from_slice(&self.exact_external_energy);
            cloned.first_exact_rejection = self.first_exact_rejection.clone();
        }
        cloned.rejections = self.rejections;
        cloned.first_rejection = self.first_rejection;
        cloned.high_water = self.high_water;
        cloned
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SpawnError {
    CombatSpec(CombatSpecError),
    Contact(ContactCapacityError),
    #[cfg(feature = "cartesian-recoil")]
    ExactLattice(ExactLatticeEnvelope),
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactLatticeEnvelope { Arithmetic, EndpointDenominator }

impl From<SpawnError> for WorldBuildError {
    fn from(error: SpawnError) -> WorldBuildError {
        match error {
            SpawnError::CombatSpec(spec) => WorldBuildError::CombatSpec(spec),
            SpawnError::Contact(contact) => WorldBuildError::Contact(contact),
            #[cfg(feature = "cartesian-recoil")]
            SpawnError::ExactLattice(exact) => WorldBuildError::ExactLattice(exact),
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct ExactLattice { common_scale: i128, endpoint_denominator_bits: u32 }

#[cfg(feature = "cartesian-recoil")]
fn exact_lattice_from_masses(
    common_masses: &[i32], held_masses: &[i32],
) -> Result<ExactLattice, ExactLatticeEnvelope> {
    let gcd = |mut a: i128, mut b: i128| {
        while b != 0 { let next = a % b; a = b; b = next; }
        a.abs()
    };
    let lcm = |a: i128, b: i128| -> Result<i128, ExactLatticeEnvelope> {
        if a <= 0 || b <= 0 { return Err(ExactLatticeEnvelope::Arithmetic); }
        (a / gcd(a, b)).checked_mul(b).ok_or(ExactLatticeEnvelope::Arithmetic)
    };
    let mut common_scale = 1i128;
    for &mass in common_masses {
        common_scale = lcm(common_scale, mass as i128)?;
    }
    let mut widest = common_scale.checked_mul(65_536)
        .ok_or(ExactLatticeEnvelope::Arithmetic)?;
    for &mass in held_masses {
        widest = widest.max(lcm(common_scale, mass as i128)?
            .checked_mul(65_536).ok_or(ExactLatticeEnvelope::Arithmetic)?);
    }
    let bits = 128 - (widest as u128).leading_zeros();
    if bits > 96 { return Err(ExactLatticeEnvelope::EndpointDenominator); }
    Ok(ExactLattice { common_scale, endpoint_denominator_bits: bits })
}

fn canonical_grip_pair(
    table: &CombatSpecTableV1, carried: [Option<EquipmentSpecId>; 2],
    pair: [Option<u8>; 2],
) -> Result<[Option<crate::EquipmentSpec>; 2], (usize, u8)> {
    let item = |slot: u8| carried.get(slot as usize).copied().flatten()
        .and_then(|id| table.equipment(id)).copied();
    match pair {
        [None, None] => Ok([None, None]),
        [Some(slot), None] => item(slot).filter(|row| row.binding == crate::GripBinding::Left)
            .map(|row| [Some(row), None]).ok_or((0, slot)),
        [None, Some(slot)] => item(slot).filter(|row| row.binding == crate::GripBinding::Right)
            .map(|row| [None, Some(row)]).ok_or((1, slot)),
        [Some(left), Some(right)] if left == right => item(right)
            .filter(|row| row.binding == crate::GripBinding::Both
                && !matches!(row.geometry, crate::EquipmentGeometry::Shield { .. }))
            .map(|row| [None, Some(row)]).ok_or((0, left)),
        [Some(left), Some(right)] => {
            let left_item = item(left).ok_or((0, left))?;
            let right_item = item(right).ok_or((1, right))?;
            if left_item.binding != crate::GripBinding::Left { return Err((0, left)); }
            if right_item.binding != crate::GripBinding::Right { return Err((1, right)); }
            if matches!(left_item.geometry, crate::EquipmentGeometry::Shield { .. })
                && matches!(right_item.geometry, crate::EquipmentGeometry::Shield { .. }) {
                return Err((1, right));
            }
            Ok([Some(left_item), Some(right_item)])
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn exact_lattice_for_unit(
    body_mass_raw: i32, table: &CombatSpecTableV1, unit: ArticulatedUnitSpecV1,
) -> Result<ExactLattice, ExactLatticeEnvelope> {
    let choices = [None, Some(0), Some(1)];
    let mut common = [0; 9]; let mut common_len = 0;
    let mut held = [0; 18]; let mut held_len = 0;
    for left in choices {
        for right in choices {
            let Ok(owners) = canonical_grip_pair(table, unit.equipment, [left, right]) else {
                continue;
            };
            let mut total = body_mass_raw;
            for item in owners.into_iter().flatten() {
                total = total.checked_add(item.mass.raw()).ok_or(ExactLatticeEnvelope::Arithmetic)?;
                held[held_len] = item.mass.raw(); held_len += 1;
            }
            common[common_len] = total; common_len += 1;
        }
    }
    exact_lattice_from_masses(&common[..common_len], &held[..held_len])
}

/// The absolute coordinate envelope every constructible combat point must stay
/// inside, mirroring `combat-geometry`'s validation bound.
///
/// Checked at construction rather than trusted, because a point outside it does
/// not merely fail to collide: `fx` fails an out-of-contract sweep *closed*, by
/// answering `TimeOfImpact::ZERO`, so one out-of-envelope row manufactures a
/// contact with every hostile collider in the arena.
const CONTACT_COORDINATE_LIMIT: Fx = Fx::from_int(256);

/// How far past its body origin one construction can put a collider point, as
/// `(horizontal, vertical)`. Equipment is measured from the hand, so the two
/// held items are maximised independently -- a sword in one hand and a shield
/// in the other reach differently and only the further one bounds anything.
fn construction_reach(
    table: &CombatSpecTableV1,
    row: ArticulatedUnitSpecV1,
) -> Result<(Fx, Fx), ContactCapacityError> {
    let anatomy = table.anatomy(row.anatomy).ok_or(ContactCapacityError::GeometryEnvelope)?;
    let mut held = Fx::ZERO;
    let mut lift = Fx::ZERO;
    for id in row.equipment.into_iter().flatten() {
        let item = equipment_of(table, id)?;
        let (out, up) = match item {
            EquipmentGeometry::Segment { length, radius } => (length, radius),
            EquipmentGeometry::Shield { half_width, half_height, thickness } =>
                (half_width + thickness / Fx::from_int(2), half_height),
        };
        held = held.max(out);
        lift = lift.max(up);
    }
    let region = anatomy.regions.iter().map(|region| region.radius).max().unwrap_or(Fx::ZERO);
    let arm = anatomy.shoulder_half_width + anatomy.arm_length + held;
    let vertical = (anatomy.standing_height + lift)
        .max(anatomy.standing_height / Fx::from_int(2) + region);
    Ok((region.max(arm), vertical))
}

fn equipment_of(
    table: &CombatSpecTableV1,
    id: EquipmentSpecId,
) -> Result<EquipmentGeometry, ContactCapacityError> {
    table.equipment(id).map(|item| item.geometry).ok_or(ContactCapacityError::GeometryEnvelope)
}

/// Reject a construction whose reach can leave the sweep envelope.
///
/// Two independent checks, and both are load-bearing. The arena one bounds what
/// the dungeon can ever produce, because a body settles against a far wall
/// rather than staying where it spawned. The spawn one bounds the row exactly
/// as handed over, which is what catches an `Fx::MIN` passed straight to the
/// typed API -- a coordinate that arena settling would later have clamped, and
/// therefore one the arena check alone waves through.
fn check_contact_envelope(
    arena: Vec2,
    spawn: Vec2,
    table: &CombatSpecTableV1,
    row: ArticulatedUnitSpecV1,
) -> Result<(), ContactCapacityError> {
    let (horizontal, vertical) = construction_reach(table, row)?;
    let limit = CONTACT_COORDINATE_LIMIT;
    if vertical > limit || arena.x.max(arena.y) + horizontal > limit {
        return Err(ContactCapacityError::GeometryEnvelope);
    }
    // `Fx::abs` saturates `Fx::MIN` to `Fx::MAX`, so the extremes fail here
    // rather than wrapping into something that looks in range.
    if spawn.x.abs() > limit || spawn.y.abs() > limit
        || spawn.x.abs() + horizontal > limit || spawn.y.abs() + horizontal > limit {
        return Err(ContactCapacityError::GeometryEnvelope);
    }
    Ok(())
}

/// Deterministic dressing placement, deliberately independent of the dungeon
/// generator's RNG stream. Adding a prop therefore cannot move a wall, door,
/// spawn, or subsequent floor. A candidate has a complete open 3x3
/// neighbourhood, so a blocking prop always has a route around it.
fn generate_dungeon_props(scenario: &Scenario, seed: u64) -> Vec<DungeonPropState> {
    // The one `CombatModel` question in this crate that none of the three
    // predicates answers: dressing is part of the legacy dungeon feature set.
    // Written as an exhaustive match rather than `!= Legacy` so a third model
    // has to decide rather than inherit an answer from a comparison.
    let dressed = match scenario.combat_model {
        crate::CombatModel::Legacy => true,
        crate::CombatModel::Articulated | crate::CombatModel::Embodied => false,
    };
    if !dressed
        || !scenario.dungeon.carved()
        || scenario.dungeon.cols() != crate::DUNGEON_COLS
        || scenario.dungeon.rows() != crate::DUNGEON_ROWS
    {
        return Vec::new();
    }
    let mut props = Vec::with_capacity(40);
    let mut identity = 0u32;
    'rows: for ty in 1..scenario.dungeon.rows() as i32 - 1 {
        for tx in 1..scenario.dungeon.cols() as i32 - 1 {
            if props.len() == 40 { break 'rows; }
            let mut clear = true;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    clear &= scenario.dungeon.tile(tx + dx, ty + dy) == crate::OPEN;
                }
            }
            if !clear { continue; }
            let centre = Dungeon::tile_centre(tx, ty);
            if scenario.units.iter().any(|unit| (unit.spawn - centre).length() < Fx::from_int(3)) {
                continue;
            }
            let mut z = scenario.dungeon.fingerprint()
                ^ seed.rotate_left(17)
                ^ (tx as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15)
                ^ (ty as u64).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z ^= z >> 30;
            z = z.wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z ^= z >> 27;
            z = z.wrapping_mul(0x94d0_49bb_1331_11eb);
            z ^= z >> 31;
            if z % 31 != 0 { continue; }
            let kind = match (z >> 8) & 15 {
                0..=3 => DungeonObjectKind::Barrel,
                4..=7 => DungeonObjectKind::Pottery,
                8..=11 => DungeonObjectKind::Web,
                _ => DungeonObjectKind::Water,
            };
            let (half, hp) = match kind {
                DungeonObjectKind::Barrel => (Fx::from_ratio(38, 100), Fx::from_int(3)),
                DungeonObjectKind::Pottery => (Fx::from_ratio(22, 100), Fx::ONE),
                DungeonObjectKind::Web => (Fx::from_ratio(65, 100), Fx::from_int(2)),
                DungeonObjectKind::Water => (Fx::from_ratio(90, 100), Fx::ZERO),
                _ => continue,
            };
            let ox = Fx::from_ratio(((z >> 16) as i32 & 255) - 128, 1024);
            let oy = Fx::from_ratio(((z >> 24) as i32 & 255) - 128, 1024);
            props.push(DungeonPropState {
                identity,
                kind,
                position: centre + Vec2::new(ox, oy),
                yaw: Angle::from_raw((z >> 32) as u16),
                half_extents: Vec2::new(half, half),
                hp,
                max_hp: hp,
                broken: false,
            });
            identity += 1;
        }
    }
    props
}

/// One embodied body's legs, as a reader sees them.
///
/// `twist` is signed raw angle units and is **derived** from the two angles it
/// sits between rather than stored, so it cannot be published disagreeing with
/// them. `pelvis` is a fraction of standing height, not a world-space z: what a
/// renderer wants is how far the body has sunk relative to its own size.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StanceView {
    pub id: EntityId,
    pub hip_yaw: Angle,
    pub pelvis: Fx,
    pub twist_raw: i32,
    pub step_left: u8,
}

/// A read-only frame for renderers and debug tooling.
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub tick: u32,
    pub arena: Vec2,
    pub units: Vec<UnitView>,
    /// Arrows in the air. Not units: they have no health and nothing to decide.
    pub shots: Vec<ShotView>,
}

/// One arrow, as much of it as a renderer needs.
///
/// Four fields and no owner, deliberately. Nothing on screen keys on who loosed
/// a shot -- and by the time one lands that fighter may be dead, so a view
/// carrying the handle would be inviting a lookup that returns `None`.
#[derive(Clone, Copy, Debug)]
pub struct ShotView {
    pub position: Vec2,
    pub heading: Angle,
    pub speed: Fx,
    pub faction: Faction,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArticulatedProjectileView {
    pub slot: u32,
    pub generation: u32,
    pub owner: EntityId,
    pub position: Vec3,
    pub velocity: Vec3,
    pub radius: Fx,
    pub remaining_range: Fx,
}

#[derive(Clone, Copy, Debug)]
pub struct UnitView {
    pub id: EntityId,
    pub kind: Body,
    pub faction: Faction,
    pub stats: Stats,
    pub position: Vec2,
    pub facing: Angle,
    pub radius: Fx,
    /// Integrated velocity, world units per tick. Already state and already
    /// hashed (`World::state_hash`); the view simply stops hiding it.
    ///
    /// A renderer needs it for three things at once and none of them can be had
    /// by differencing positions across frames: a walk cycle's clock, the lean
    /// a body carries into a turn, and the difference between "stopped" and
    /// "walking into a wall". Frames are not ticks, so a page-side difference
    /// samples this at whatever rate the browser felt like.
    pub velocity: Vec2,
    /// What this body weighs. Likewise already state and already hashed.
    ///
    /// **Published rather than re-derived**, and that is the whole reason it is
    /// here. `Body::mass` is geometry *unless stated otherwise*, so a renderer
    /// that wrote `mass = f(radius)` would be describing a body that can change
    /// underneath it -- which is exactly the mirrored-formula bug `sight_range`
    /// was moved into the frame to kill.
    pub mass: Fx,
    pub hp: Fx,
    pub max_hp: Fx,
    pub intent: Intent,
    /// The limb, so a renderer can draw the swordplay rather than infer it.
    pub limb: Hand,
    /// What is in hand, and its resolved numbers. Both, because a renderer wants
    /// the name and the geometry and neither implies the other cheaply.
    pub action: ActionKind,
    pub spec: ActionSpec,
    /// What this unit is carrying, and which slot is up. Enough for a page to
    /// show a loadout without keeping a second copy of one that can go stale.
    pub loadout: Loadout,
    pub slot: u8,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy)]
struct ExactArmCommit {
    hand: Vec3,
    linear_velocity: Vec3,
    post_contact_com_velocity: Vec3,
    replace_recoil: bool,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy)]
struct ExactCommitRow {
    entity: EntityId,
    owner: ExactOwnerTrajectory,
    position: Vec2,
    velocity: Vec2,
    body_moved: bool,
    arms: [Option<ExactArmCommit>; 2],
}

// ---------------------------------------------------------------- the schedule

/// The two rates an arm driver needs for one tick.
///
/// Threaded as a parameter rather than stashed on `World` for the duration of a
/// step, because a scratch column is authoritative state that then has to be
/// hashed or argued out of the hash, and a parameter is neither.
#[derive(Clone, Copy)]
struct ArmRates {
    bearing_max_speed_raw: i32,
    bearing_accel_raw: i32,
}

/// A phase is its name and its body.
///
/// The name is what the `#[cfg(test)]` trace records, and it is read off this
/// table rather than written a second time beside the call, because the pair
/// that can disagree is the pair that will. Before this table there were thirty
/// hand-written literals and four phases that ran without one at all --
/// `resolve_dungeon_prop_swings` under `legacy swings`, and the two projectile
/// phases plus `resolve_contact` all under a single `contact` -- so a trace
/// could pass while naming the wrong thing.
///
/// **This is determinism-safe and it is worth saying why rather than assuming
/// it.** The tables are `const` slices iterated front to back; no pointer is
/// hashed, no map is iterated, and the call order is fixed at compile time. The
/// rule the determinism contract protects -- no unstable iteration into
/// authoritative state -- is not in contact with a `&'static [T]`.
type Phase = (&'static str, fn(&mut World, ArmRates));

/// Shared by every model, and shared *by construction* rather than by three
/// copies that a fourth model would have to remember to make a fifth of.
const PROLOGUE: &[Phase] = &[
    ("clear events",     |w, _| w.events.clear()),
    ("expire decisions", |w, _| w.expire_unanswered_decisions()),
];

const EPILOGUE: &[Phase] = &[
    ("increment tick", |w, _| w.tick += 1),
    ("pending",        |w, _| w.refresh_pending()),
    ("navigation",     |w, _| w.refresh_nav()),
];

/// The order [`World::step`]'s doc comment argues for, in the order it argues.
const LEGACY_PHASES: &[Phase] = &[
    ("regenerate",       |w, _| w.regenerate()),
    ("apply movement",   |w, _| w.apply_movement()),
    ("separate",         |w, _| w.separate()),
    ("drive legacy limb", |w, _| w.drive_limbs()),
    ("legacy parries",   |w, _| w.resolve_parries()),
    ("legacy swings",    |w, _| w.resolve_swings()),
    ("prop swings",      |w, _| w.resolve_dungeon_prop_swings()),
    ("recoil",           |w, _| w.apply_recoil()),
    ("shots",            |w, _| w.resolve_shots()),
    ("doors",            |w, _| w.press_doors()),
    ("reap",             |w, _| w.reap_dead()),
];

// The rows the two body models share, each written **once** and listed twice
// below. Two hand-typed tables would recreate exactly the hazard the table
// removed -- a second place to forget `press_doors` -- while a single aliased
// table cannot express the one row that genuinely differs. Naming the rows is
// what buys both: a divergence is a substituted name in a list, and an omission
// is a missing name rather than a missing closure.
const P_RETAIN_CONTACT: Phase = ("retain contact entry", |w, _| w.retain_contact_entry());
const P_MOVEMENT: Phase = ("apply articulated movement", |w, _| w.apply_articulated_movement());
const P_LOCOMOTION: Phase = ("record contact locomotion", |w, _| w.record_contact_locomotion());
const P_SEPARATE: Phase = ("separate", |w, _| w.separate());
const P_BODY_YAW: Phase = ("body yaw", |w, _| w.drive_body_yaw());
const P_STANCE: Phase = ("stance", |w, _| w.drive_stance());
const P_GRIPS: Phase = ("grips", |w, _| w.apply_articulated_grips());
const P_ARMS: Phase = ("arms", |w, r| {
    w.drive_articulated_arms(r.bearing_max_speed_raw, r.bearing_accel_raw)
});
const P_GEOMETRY: Phase = ("geometry", |w, _| w.derive_articulated_geometry());
const P_LOOSE: Phase = ("loose projectiles", |w, _| w.loose_articulated_projectiles());
const P_CONTACT: Phase = ("contact", |w, _| w.resolve_contact());
const P_RESOLVE_PROJECTILES: Phase = ("resolve projectiles", |w, _| w.resolve_articulated_projectiles());
const P_ANATOMY: Phase = ("anatomy", |w, _| w.settle_anatomy());
const P_DOORS: Phase = ("doors", |w, _| w.press_doors());
const P_REAP_ARTICULATED: Phase = ("reap", |w, _| w.reap_dead_articulated());

/// Traced like the legacy arm, and for one specific reason: the contract freezes
/// where contact sits relative to geometry and doors, and a trace is the only
/// way to prove an ordering rather than argue it from a reading order.
const ARTICULATED_PHASES: &[Phase] = &[
    P_RETAIN_CONTACT,
    P_MOVEMENT,
    P_LOCOMOTION,
    P_SEPARATE,
    P_BODY_YAW,
    P_GRIPS,
    P_ARMS,
    P_GEOMETRY,
    P_LOOSE,
    P_CONTACT,
    P_RESOLVE_PROJECTILES,
    P_ANATOMY,
    P_DOORS,
    P_REAP_ARTICULATED,
];

/// The same tick with **one row substituted**: an embodied body's torso is
/// turned by its hips rather than freely, so `stance` stands where `body yaw`
/// stands and does both jobs in the order they constrain each other.
///
/// It sits in the same slot deliberately. Everything after it -- grips, arms,
/// geometry, contact -- reads a settled torso, and moving the row would change
/// what those four see rather than what the hips do.
const EMBODIED_PHASES: &[Phase] = &[
    P_RETAIN_CONTACT,
    P_MOVEMENT,
    P_LOCOMOTION,
    P_SEPARATE,
    P_STANCE,
    P_GRIPS,
    P_ARMS,
    P_GEOMETRY,
    P_LOOSE,
    P_CONTACT,
    P_RESOLVE_PROJECTILES,
    P_ANATOMY,
    P_DOORS,
    P_REAP_ARTICULATED,
];

/// A free function rather than a method so the schedule borrows nothing: the
/// loop in [`World::step_with_arm_rates`] has to hand `&mut self` to each body.
const fn model_phases(model: crate::CombatModel) -> &'static [Phase] {
    match model {
        crate::CombatModel::Legacy => LEGACY_PHASES,
        crate::CombatModel::Articulated => ARTICULATED_PHASES,
        crate::CombatModel::Embodied => EMBODIED_PHASES,
    }
}

impl World {
    /// Panicking constructor, kept source-compatible. It validates through the
    /// typed form and so still refuses before allocating anything.
    pub fn new(scenario: &Scenario, seed: u64) -> World {
        World::try_new(scenario, seed).expect("invalid combat construction")
    }

    /// The typed constructor. Validates combat construction, the geometry
    /// envelope, and every contact count before a single world column exists.
    pub fn try_new(scenario: &Scenario, seed: u64) -> Result<World, WorldBuildError> {
        crate::combat::spec::validate_construction(
            scenario.combat_model,
            scenario.combat_specs.as_ref(),
            &scenario.units,
        ).map_err(WorldBuildError::CombatSpec)?;
        let n = scenario.units.len();
        if scenario.combat_model.has_articulated_columns() {
            // `validate_construction` has already proved the table and every
            // row present, so these two lookups cannot fail; they are written
            // as `?` rather than `expect` because the envelope check below is
            // the one place a malformed reference would be caught silently.
            let table = scenario.combat_specs.as_ref()
                .ok_or(WorldBuildError::CombatSpec(CombatSpecError::MissingTable))?;
            let arena = scenario.arena();
            for unit in &scenario.units {
                let row = unit.articulated
                    .ok_or(WorldBuildError::CombatSpec(CombatSpecError::UnitPresence))?;
                check_contact_envelope(arena, unit.spawn, table, row)
                    .map_err(WorldBuildError::Contact)?;
                #[cfg(feature = "cartesian-recoil")]
                exact_lattice_for_unit(unit.kind.mass().raw(), table, row)
                    .map_err(WorldBuildError::ExactLattice)?;
            }
            contact_bounds(n).map_err(WorldBuildError::Contact)?;
        }
        let mut world = World {
            seed,
            combat_model: scenario.combat_model,
            combat_specs: scenario.combat_specs.clone(),
            combat_units: scenario.units.iter().filter_map(|unit| unit.articulated).collect(),
            tick: 0,
            arena: scenario.arena(),
            dungeon: scenario.dungeon.clone(),
            orders: [Order::Hold; 2],
            objectives: [Objective::None; 2],
            generation: Vec::with_capacity(n),
            alive: Vec::with_capacity(n),
            kind: Vec::with_capacity(n),
            faction: Vec::with_capacity(n),
            stats: Vec::with_capacity(n),
            pos: Vec::with_capacity(n),
            vel: Vec::with_capacity(n),
            ground_z: Vec::with_capacity(n),
            facing: Vec::with_capacity(n),
            radius: Vec::with_capacity(n),
            mass: Vec::with_capacity(n),
            hp: Vec::with_capacity(n),
            max_hp: Vec::with_capacity(n),
            limb: Vec::with_capacity(n),
            loadout: Vec::with_capacity(n),
            slot: Vec::with_capacity(n),
            next_decision: Vec::with_capacity(n),
            command: Vec::with_capacity(n),
            articulated_command: Vec::with_capacity(n),
            articulated_anatomy: Vec::with_capacity(n),
            articulated_carried: Vec::with_capacity(n),
            articulated_equipment: Vec::with_capacity(n),
            body_yaw: Vec::with_capacity(n),
            stance: Vec::with_capacity(n),
            elbow_plane: Vec::with_capacity(n),
            arms: Vec::with_capacity(n),
            grips: Vec::with_capacity(n),
            articulated_release_was: Vec::with_capacity(n),
            #[cfg(feature = "cartesian-recoil")]
            exact_owners: if scenario.combat_model.has_articulated_columns() {
                Vec::with_capacity(n)
            } else {
                Vec::new()
            },
            shield_pose: Vec::with_capacity(n),
            move_authority: Vec::with_capacity(n),
            turn_authority: Vec::with_capacity(n),
            arm_authority: Vec::with_capacity(n),
            wounds: Vec::with_capacity(n),
            contact: if scenario.combat_model.uses_contact_solver() {
                Some(ContactRuntime::default())
            } else {
                None
            },
            #[cfg(test)]
            phase_trace_enabled: false,
            #[cfg(test)]
            phase_trace: Vec::new(),
            last_attacker: Vec::with_capacity(n),
            last_combat: Vec::with_capacity(n),
            regen_left: Vec::with_capacity(n),
            damage_dealt: Vec::with_capacity(n),
            shot_alive: Vec::new(),
            shot_pos: Vec::new(),
            shot_vel: Vec::new(),
            shot_range: Vec::new(),
            shot_mass: Vec::new(),
            shot_power: Vec::new(),
            shot_owner: Vec::new(),
            shot_faction: Vec::new(),
            shot_free: Vec::new(),
            articulated_projectile_alive: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_generation: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_pos: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_vel: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_range: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_radius: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_mass: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_owner: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_faction: Vec::with_capacity(rules::MAX_SHOTS),
            articulated_projectile_free: Vec::with_capacity(rules::MAX_SHOTS),
            free: Vec::new(),
            events: Vec::new(),
            pending: Vec::with_capacity(n),
            // Read off the floor plan rather than carried alongside it, which
            // is what keeps "where are the doorways" one question with one
            // answer: `Dungeon::doorways` is the same grouping the generator
            // used to fill `Level::doors`. It can only be asked while the doors
            // are shut, and this is that moment.
            doors: scenario
                .dungeon
                .doorways()
                .into_iter()
                .map(|door| DoorState {
                    door,
                    open: false,
                    pressed: 0,
                })
                .collect(),
            dungeon_props: generate_dungeon_props(scenario, seed),
            nav: [
                [Nav::default(), Nav::default()],
                [Nav::default(), Nav::default()],
            ],
            nav_queue: Vec::new(),
            nav_seeds: Vec::new(),
            blows: Vec::new(),
            pierces: Vec::new(),
            impulses: Vec::new(),
            prop_impacts: Vec::with_capacity(64),
            start_pos: Vec::with_capacity(n),
            blade_was: Vec::with_capacity(n),
            blade_p: Vec::with_capacity(n),
            door_pushed: Vec::new(),
        };
        world.door_pushed.resize(world.doors.len(), false);
        // Once, for the whole roster, so the per-row reservations below are all
        // no-ops. Splitting it the other way would work and would allocate n
        // times for the same final capacity.
        world.try_reserve_contact_slots(n).map_err(WorldBuildError::Contact)?;
        for spec in &scenario.units {
            world.try_spawn(spec)?;
        }
        world.refresh_pending();
        world.refresh_nav();
        Ok(world)
    }

    /// Panicking spawn, kept source-compatible. Like [`World::new`] it refuses
    /// through the typed form, so it still cannot half-mutate a world.
    pub fn spawn(&mut self, spec: &UnitSpec) -> EntityId {
        self.try_spawn(spec).expect("invalid articulated spawn construction")
    }

    /// The typed spawn. Validates the row, checks the envelope, computes the
    /// prospective high water and reserves every contact vector for it, and
    /// only then touches a world column -- so a refused spawn leaves the world
    /// exactly as it found it.
    pub fn try_spawn(&mut self, spec: &UnitSpec) -> Result<EntityId, SpawnError> {
        #[cfg(feature = "cartesian-recoil")]
        let mut exact_scale = 0i128;
        match self.combat_model {
            crate::CombatModel::Legacy => {
                if spec.articulated.is_some() {
                    return Err(SpawnError::CombatSpec(CombatSpecError::UnexpectedTable));
                }
            }
            crate::CombatModel::Articulated | crate::CombatModel::Embodied => {
                let row = spec.articulated
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::UnitPresence))?;
                let table = self.combat_specs.as_ref()
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::MissingTable))?;
                crate::combat::spec::validate_rows(table, &[row], &[spec.loadout])
                    .map_err(SpawnError::CombatSpec)?;
                check_contact_envelope(self.arena, spec.spawn, table, row)
                    .map_err(SpawnError::Contact)?;
                #[cfg(feature = "cartesian-recoil")]
                { exact_scale = exact_lattice_for_unit(spec.kind.mass().raw(), table, row)
                    .map_err(SpawnError::ExactLattice)?.common_scale; }
                // A reused slot raises no high water and therefore reserves
                // nothing, which is the property that makes a respawn free.
                let prospective = match self.free.last() {
                    Some(_) => self.alive.len(),
                    None => self.alive.len() + 1,
                };
                self.try_reserve_contact_slots(prospective).map_err(SpawnError::Contact)?;
            }
        }
        Ok(self.spawn_validated(spec,
            #[cfg(feature = "cartesian-recoil")]
            exact_scale))
    }

    /// Reserve every contact vector for `high_water` allocated slots.
    ///
    /// An exact `Ok(())` no-op on a Legacy world, which owns no contact state.
    /// On Articulated it never shrinks, and a request at or below what is
    /// already reserved does nothing.
    ///
    /// Capacity is not atomic across the sequence: an early vector may already
    /// have grown when a later one fails. That is deliberate, and it is safe
    /// because no capacity in here is authoritative state -- on the error path
    /// no world column, solver counter, or resolution row has moved. A test may
    /// not read these capacities back as if they were.
    pub fn try_reserve_contact_slots(
        &mut self,
        high_water: usize,
    ) -> Result<(), ContactCapacityError> {
        match self.contact.as_mut() {
            None => Ok(()),
            Some(contact) => contact.reserve(high_water),
        }
    }

    /// Every retained contact capacity, for the no-growth proofs. Capacity is
    /// not authoritative state and this deliberately is not public.
    #[cfg(test)]
    fn contact_capacities(&self) -> Vec<usize> {
        let Some(contact) = self.contact.as_ref() else { return Vec::new() };
        let mut rows = contact.scratch.capacities();
        rows.push(contact.colliders.capacity());
        rows.push(contact.swept.capacity());
        rows.push(contact.resolutions.capacity());
        rows.push(contact.entry.capacity());
        rows.push(contact.bodies.capacity());
        rows.push(contact.anatomy_entry.capacity());
        rows.push(contact.credit.capacity());
        rows.push(contact.deltas.capacity());
        rows.push(contact.fact_loss.capacity());
        #[cfg(feature = "cartesian-recoil")]
        rows.extend([
            contact.exact_trajectories.capacity(), contact.exact_owners.capacity(),
            contact.exact_owner_entry.capacity(), contact.exact_trajectory_entry.capacity(),
            contact.exact_commit.capacity(), contact.recoil_external.capacity(),
            contact.floor_reactions.capacity(), contact.exact_external_energy.capacity(),
        ]);
        rows
    }

    fn spawn_validated(&mut self, spec: &UnitSpec,
        #[cfg(feature = "cartesian-recoil")] exact_scale: i128,
    ) -> EntityId {
        let max_hp = spec.stats.max_hp();
        let slot = self.free.pop();
        let i = match slot {
            Some(i) => i as usize,
            None => {
                self.generation.push(0);
                self.alive.push(false);
                self.kind.push(spec.kind);
                self.faction.push(spec.faction);
                self.stats.push(spec.stats);
                self.pos.push(Vec2::ZERO);
                self.vel.push(Vec2::ZERO);
                self.ground_z.push(Fx::ZERO);
                self.facing.push(Angle::ZERO);
                self.radius.push(spec.kind.radius());
                self.mass.push(spec.kind.mass());
                self.hp.push(max_hp);
                self.max_hp.push(max_hp);
                self.limb.push(Hand::default());
                self.loadout.push(Loadout::single(ActionKind::Punch));
                self.slot.push(0);
                self.next_decision.push(0);
                self.command.push(Command::HOLD);
                self.articulated_command.push(None);
                self.articulated_anatomy.push(None);
                self.articulated_carried.push([None; 2]);
                self.articulated_equipment.push([None; 2]);
                if self.combat_model.has_articulated_columns() {
                    let arm = actuator::tucked_arm(Vec3::ZERO);
                    self.body_yaw.push(BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO });
                    if self.combat_model.has_stance() {
                        self.stance.push(StanceState::squared(Angle::ZERO));
                    }
                    if self.combat_model.has_swing_plane() {
                        self.elbow_plane.push([ElbowPlaneState::NEUTRAL; 2]);
                    }
                    self.arms.push([arm; 2]);
                    self.grips.push([GripState { equipment_slot: None }; 2]);
                    self.articulated_release_was.push([ReleaseRequest::Keep; 2]);
                    #[cfg(feature = "cartesian-recoil")]
                    self.exact_owners.push(None);
                    self.shield_pose.push(None);
                    self.move_authority.push(Fx::ONE);
                    self.turn_authority.push(Fx::ONE);
                    self.arm_authority.push([Fx::ONE; 2]);
                    self.wounds.push(AnatomyState::EMPTY);
                }
                self.last_attacker.push(EntityId::NONE);
                self.last_combat.push(0);
                self.regen_left.push(Fx::ZERO);
                self.damage_dealt.push(Fx::ZERO);
                self.start_pos.push(Vec2::ZERO);
                self.blade_was.push(None);
                self.blade_p.push(Fx::ZERO);
                self.generation.len() - 1
            }
        };
        self.alive[i] = true;
        self.kind[i] = spec.kind;
        self.faction[i] = spec.faction;
        self.stats[i] = spec.stats;
        self.pos[i] = spec.spawn;
        self.vel[i] = Vec2::ZERO;
        // Sampled here as well as in `move_body`, because a body that never
        // moves must still be standing on its own floor -- and the first thing
        // anything reads about a fresh world is its published pose.
        self.ground_z[i] = self.dungeon.height_at(spec.spawn);
        self.start_pos[i] = spec.spawn;
        let bearing = match spec.faction {
            Faction::Heroes => Angle::ZERO,
            Faction::Monsters => Angle::HALF,
        };
        self.facing[i] = bearing;
        // Both hands start at rest along the body's bearing, so a fresh
        // character is on guard rather than mid-swing -- and a Hero and a
        // Monster start mirrored, which is the same asymmetry `facing` has.
        self.limb[i] = Hand::resting(bearing);
        self.loadout[i] = spec.loadout;
        self.slot[i] = 0;
        self.radius[i] = spec.kind.radius();
        self.mass[i] = spec.kind.mass();
        self.hp[i] = max_hp;
        self.max_hp[i] = max_hp;
        self.next_decision[i] = self.tick;
        self.command[i] = Command::HOLD;
        self.articulated_command[i] = None;
        self.articulated_anatomy[i] = spec.articulated.map(|row| row.anatomy);
        self.articulated_carried[i] = spec.articulated.map_or([None; 2], |row| row.equipment);
        self.articulated_equipment[i] = match (self.combat_specs.as_ref(), spec.articulated) {
            (Some(table), Some(row)) => resolved_equipment(table, row).expect("validated combat construction"),
            _ => [None; 2],
        };
        if self.combat_model.has_articulated_columns() {
            self.initialize_articulated_pose(i);
            #[cfg(feature = "cartesian-recoil")]
            {
                self.exact_owners[i] = Some(self.initial_exact_owner(i, exact_scale));
            }
        }
        self.last_attacker[i] = EntityId::NONE;
        self.last_combat[i] = self.tick;
        self.regen_left[i] = max_hp * rules::REGEN_BUDGET;
        self.damage_dealt[i] = Fx::ZERO;
        self.blade_was[i] = None;
        self.blade_p[i] = Fx::ZERO;
        self.id_of(i)
    }

    /// Records `id`'s decision and pushes its next decision tick out by its
    /// [`Stats::decision_period`]. Stale handles are ignored.
    pub fn submit(&mut self, id: EntityId, command: Command) {
        if self.combat_model.command_grammar() != CommandGrammar::Legacy {
            return;
        }
        if let Some(i) = self.resolve(id) {
            self.command[i] = command;
            self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        }
    }

    /// Turns one live legacy body without translating it.
    ///
    /// This is the narrow host-control counterpart to World::submit. It does
    /// not invent a second command or enter replay serialization: the web host
    /// integrates its held turn input at the fixed simulation cadence, then
    /// records the resulting legacy facing in the same authoritative column
    /// movement already writes. Articulated worlds and stale handles refuse it,
    /// so this cannot bypass their body-yaw actuator.
    pub fn face_legacy(&mut self, id: EntityId, facing: Angle) {
        if self.combat_model.command_grammar() != CommandGrammar::Legacy {
            return;
        }
        if let Some(i) = self.resolve(id).filter(|&i| self.alive[i]) {
            self.facing[i] = facing;
        }
    }

    /// Sets a faction's standing order. This is the player's whole input
    /// channel; it lands in every observation of that faction from the next
    /// decision onward.
    pub fn set_order(&mut self, faction: Faction, order: Order) {
        self.orders[faction.index()] = order;
        // The route is part of what an order *means* now, so it has to be
        // current by the time anybody observes -- and an order arrives between
        // two steps, which is exactly when the per-tick refresh is not running.
        // Without this the faction spends its first decision after every new
        // destination reading a field built for the previous one, which reads
        // as the character taking a moment to notice the click.
        self.refresh_nav();
    }

    /// Sets what a faction is trying to reach. Shaped exactly like
    /// [`World::set_order`] because it is the same kind of thing: an input the
    /// sim carries and does not second-guess. See [`Objective`].
    pub fn set_objective(&mut self, faction: Faction, objective: Objective) {
        self.objectives[faction.index()] = objective;
        // Current before anybody observes; see [`World::set_order`].
        self.refresh_nav();
    }

    pub const fn combat_model(&self) -> crate::CombatModel {
        self.combat_model
    }

    /// Rewrites what `id` is carrying.
    ///
    /// Input bookkeeping, exactly as [`World::set_order`] is: the page owns a
    /// character's kit and the sim only carries it. Answers `false` for a handle
    /// that no longer resolves.
    ///
    /// The slot is **not** reset. Rewriting the stowed slot leaves a fighter
    /// holding what it was holding, which is the whole point of being able to do
    /// it mid-fight; rewriting the held slot changes the thing in its hand on
    /// the spot, and it is the caller's business whether that is fair.
    pub fn set_loadout(&mut self, id: EntityId, loadout: Loadout) -> bool {
        if self.combat_model.command_grammar() != CommandGrammar::Legacy { return false; }
        match self.resolve(id) {
            Some(i) => {
                self.loadout[i] = loadout;
                if !loadout.holds(self.slot[i] as usize) {
                    self.slot[i] = 0;
                }
                true
            }
            None => false,
        }
    }

    /// Rewrites `id`'s attributes.
    ///
    /// Input bookkeeping, exactly as [`World::set_loadout`] is: the page owns a
    /// character's attributes and the sim only fights with them. Answers `false`
    /// for a handle that no longer resolves.
    ///
    /// Health is rescaled to hold the **fraction**, not the absolute value.
    /// Vitality is the only stat that moves the bar's length, and either of the
    /// two obvious alternatives is a rule rather than an input: keeping the
    /// absolute health gifts a full bar to anyone who raises vitality mid-fight,
    /// and would kill outright anyone who lowers it. A fighter at half health is
    /// a fighter at half health whatever body it is wearing.
    ///
    /// The decision clock is deliberately left alone. [`World::submit`]
    /// re-derives it from the new [`Stats::decision_period`] at the very next
    /// decision, so a character made sharper starts thinking faster one beat
    /// later -- which is the correct lag, and a reset here would hand a free
    /// out-of-turn decision to anyone touching the intellect dial mid-swing.
    pub fn set_stats(&mut self, id: EntityId, stats: Stats) -> bool {
        match self.resolve(id) {
            Some(i) => {
                // Read before the write, and clamped: `hp` runs negative for one
                // phase between a lethal blow and `reap_dead`, and a negative
                // fraction rescaled into a larger bar is a corpse getting
                // *deader* the more vitality it is given.
                let frac = self.legacy_hp_frac(i);
                let max_hp = stats.max_hp();
                self.stats[i] = stats;
                self.max_hp[i] = max_hp;
                self.hp[i] = max_hp * frac;
                true
            }
            None => false,
        }
    }

    /// Rewrites `id`'s archetype.
    ///
    /// The live counterpart of [`UnitSpec::set_body`], and it exists for the
    /// same reason that one does: a bare `kind` write is a **half-change**. A
    /// body is a size, a weight and a stat sheet, and none of the three is
    /// derivable from the others once they are separate columns -- so this takes
    /// the whole archetype, its default loadout included, and a caller wanting a
    /// Brute holding a bow says so afterwards with [`World::set_loadout`].
    ///
    /// Both halves that already have a home go through it: the stat sheet
    /// through [`World::set_stats`], so the health fraction survives a change of
    /// body and the rescale lives in exactly one place, and the kit through
    /// [`World::set_loadout`], so a slot the new default cannot fill is put back
    /// to the primary rather than left dangling.
    ///
    /// Finishes by putting the body back inside the arena. A Skitterer (radius
    /// 0.30) standing against a wall and promoted to a Brute (0.70) is otherwise
    /// left with four tenths of itself inside the masonry, and `move_body` also
    /// zeroes the clipped velocity axis -- which is what stops a wall-pinned
    /// body shoving everything that comes near it.
    pub fn set_body(&mut self, id: EntityId, body: Body) -> bool {
        if self.combat_model.command_grammar() != CommandGrammar::Legacy { return false; }
        match self.resolve(id) {
            Some(i) => {
                self.kind[i] = body;
                self.radius[i] = body.radius();
                self.mass[i] = body.mass();
                self.set_stats(id, body.base_stats());
                self.set_loadout(id, body.default_loadout());
                self.move_body(i, self.pos[i]);
                true
            }
            None => false,
        }
    }

    // ---------------------------------------------------------------- the tick

    /// Advances one tick and returns everything that happened during it.
    ///
    /// Phase order is fixed and load-bearing:
    ///
    /// * **Deaths are applied after every blow resolves**, so two units that
    ///   kill each other on the same tick both die. The alternative makes the
    ///   outcome depend on entity index, which is exactly the kind of asymmetry
    ///   that makes a mirror match unfair and a replay fragile.
    /// * **Hands are driven after bodies have settled**, not before. A hand is
    ///   rigidly attached to a body, so its world geometry has to be computed
    ///   against the position that body actually ends the tick in. A push-apart
    ///   in [`World::separate`] can exceed a blade tip's per-tick travel for
    ///   most archetypes, so driving hands first produces blows that visibly
    ///   did not connect.
    /// * **Parries resolve before blows.** A parry is the event that *prevents*
    ///   a blow, so it has to be able to change a swing's spin before the
    ///   damage pass reads it.
    /// * **Arrows fly after recoil and before the dead are reaped.** After,
    ///   because `apply_recoil` differences a blade's momentum and an arrow
    ///   changes no limb's speed, so that phase keeps its claim to be billed
    ///   last over everything that could. Before, because an arrow and a cut
    ///   landing on the same tick must both count -- which is the very first
    ///   thing this list insists on.
    /// * **Recoil is billed last**, after everything that can change a blade's
    ///   speed has changed it. A swing's reaction on its own wielder is the
    ///   difference between the blade's momentum at the top of the tick and at
    ///   the bottom, and a parry or a block moves that as surely as the muscle
    ///   does -- so taking the difference any earlier would charge a fighter for
    ///   the swing it meant to throw rather than the one it got.
    pub fn step(&mut self) -> &[Event] {
        self.step_with_arm_rates(
            actuator::ARM_BEARING_MAX_SPEED_RAW,
            actuator::ARM_BEARING_ACCEL_RAW,
        )
    }

    /// Drive one experimental Lab tick without putting the candidate rates in
    /// scenario, replay, or authoritative state. The ordinary [`World::step`]
    /// path cannot observe this seam and always supplies the production pair.
    #[cfg(feature = "lab-calibration")]
    pub fn step_with_arm_calibration(
        &mut self, calibration: crate::ArmCalibration,
    ) -> &[Event] {
        self.step_with_arm_rates(
            calibration.bearing_max_speed_raw,
            calibration.bearing_accel_raw,
        )
    }

    // `pub(crate)` rather than private because a frozen fixture is not always
    // in this file: `exact_diagnostics` and `replay`'s exact tests capture a
    // configuration too, and each of them has to pin the arm rate it was
    // measured at for the same reason `CAPTURED_ARM_RATES` gives below.
    pub(crate) fn step_with_arm_rates(
        &mut self, bearing_max_speed_raw: i32, bearing_accel_raw: i32,
    ) -> &[Event] {
        let rates = ArmRates { bearing_max_speed_raw, bearing_accel_raw };
        // Read the model out before the loop so the iterator borrows nothing but
        // `&'static` tables and the body is free to take `&mut self`.
        let model = self.combat_model;
        for &(name, body) in PROLOGUE.iter().chain(model_phases(model)).chain(EPILOGUE) {
            #[cfg(test)]
            if self.phase_trace_enabled { self.phase_trace.push(name); }
            #[cfg(not(test))]
            let _ = name;
            body(self, rates);
        }
        &self.events
    }

    /// Stores one version-1 articulated command without partially accepting a
    /// malformed request. Grip changes remain pending until the next step.
    pub fn submit_articulated_v1(
        &mut self,
        id: EntityId,
        command: ArticulatedCommandV1,
    ) -> SubmitArticulatedOutcome {
        if self.combat_model.command_grammar() != CommandGrammar::Articulated {
            return SubmitArticulatedOutcome::NotStored(CommandReject::WrongModel);
        }
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitArticulatedOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = validate_articulated(command)
            .err()
            .map(CommandReject::OutOfRange)
            .or_else(|| self.resulting_grips(i, command.grips).err());
        let stored = match rejection {
            None => command,
            Some(_) => self.neutral_articulated(i),
        };
        self.articulated_command[i] = Some(stored);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitArticulatedOutcome::Stored { command: stored, rejection }
    }

    /// The arm target the actuator integrates towards, as a **world** bearing.
    ///
    /// The two models read `ArmTarget::bearing` in different frames and this is
    /// the one place in the tick where that difference exists. The stored
    /// `ArmState` keeps a world bearing under both, because that is what the
    /// geometry, the contact phase and the pose publication all read; storing a
    /// relative angle would make the published hand depend on a yaw every
    /// reader had to re-apply.
    ///
    /// The command is relative, the state is absolute, and the conversion
    /// happens once on the way in -- the same shape as the pose module's
    /// world-space conversion on the way out, and for the same reason.
    fn world_arm_target(&self, i: usize, limb: usize, target: ArmTarget) -> ArmTarget {
        match self.combat_model.command_frame() {
            CommandFrame::World => target,
            CommandFrame::Torso => {
                let turned = ArmTarget {
                    bearing: self.body_yaw[i].angle + target.bearing,
                    ..target
                };
                self.reachable_arm_target(i, limb, turned)
            }
        }
    }

    /// The nearest target the arm can actually hold.
    ///
    /// **Applied before integration, and that is the whole of why it is here.**
    /// Clamping the arm's *result* would leave the actuator converging forever on
    /// a pose it cannot reach and sitting at the limit with a permanent error;
    /// clamping the target makes it chase something it can hold and stop. It is
    /// the same argument the twist budget makes one joint up, and the same shape
    /// of fix.
    ///
    /// The round trip through `inverse_hand` is exact enough to be safe: the
    /// clamped point is on the annulus, and `hand_position` and `inverse_hand`
    /// are inverses on the coordinates they share, so re-deriving the target from
    /// the clamped hand cannot push it back outside.
    fn reachable_arm_target(&self, i: usize, _limb: usize, target: ArmTarget) -> ArmTarget {
        let anatomy = self.posed_anatomy(i);
        let elbow = crate::combat::limb::Elbow::of(&anatomy);
        let (height, reach) =
            crate::combat::limb::reachable_extent(&anatomy, target.height, target.reach, elbow);
        ArmTarget { height, reach, ..target }
    }

    /// The move authority a body actually has this tick.
    ///
    /// The column [`World::move_authority`] holds is the anatomy's -- what the
    /// legs are still capable of after injury -- and it is rewritten every tick
    /// by `settle_anatomy`. A forced step is a *transient* claim on the same
    /// budget, so it is applied here, at the point of use, rather than written
    /// into a column that the anatomy pass would overwrite before movement read
    /// it. Reading it anywhere else would get the anatomy's number and silently
    /// make a step free.
    fn moving_authority(&self, i: usize) -> Fx {
        let anatomy = self.move_authority[i];
        match self.stance.get(i) {
            Some(stance) if stance.step_left > 0 => {
                anatomy * Fx::from_raw(actuator::STANCE_STEP_MOVE_AUTHORITY_RAW)
            }
            _ => anatomy,
        }
    }

    /// The requested movement direction, in world space.
    ///
    /// Under [`CommandFrame::Torso`] the vector is read in the body frame, so
    /// `W` is `(1, 0)` at every yaw and the client stops needing to know which
    /// way the body faces in order to drive it. The rotation is the ordinary
    /// one: forward is `(cos yaw, sin yaw)` and left is `(-sin yaw, cos yaw)`.
    fn world_move_dir(&self, i: usize, requested: Vec2) -> Vec2 {
        match self.combat_model.command_frame() {
            CommandFrame::World => requested,
            CommandFrame::Torso => {
                let yaw = self.body_yaw[i].angle;
                let (cos, sin) = (yaw.cos(), yaw.sin());
                Vec2::new(
                    requested.x * cos - requested.y * sin,
                    requested.x * sin + requested.y * cos,
                )
            }
        }
    }

    /// Stores one version-1 embodied command, on the same terms.
    ///
    /// **The column is split, and this is the session that split it.** The doc
    /// comment that stood here predicted the shape of the day exactly: the six
    /// articulated fields still go into [`World::articulated_command`], because
    /// they are the same six fields the same phases read and a second copy of
    /// them would be a second thing to keep in step; the swing plane -- the first
    /// field an embodied command carries that an articulated one has no offsets
    /// for -- goes into [`World::elbow_plane`], because there was nowhere else it
    /// could have gone. What the fork bought is unchanged and is still the point:
    /// `ARTICULATED_PAYLOAD_BYTES` did not move, so the three digests taken over
    /// it did not either.
    ///
    /// Only `commanded` is written here. `held` is the actuator's, chased toward
    /// this at a bounded rate in the arms phase, so a submission is a request and
    /// never a teleport.
    pub fn submit_embodied_v1(
        &mut self,
        id: EntityId,
        command: crate::EmbodiedCommandV1,
    ) -> crate::SubmitEmbodiedOutcome {
        use crate::{EmbodiedCommandV1, SubmitEmbodiedOutcome};
        if self.combat_model.command_grammar() != CommandGrammar::Embodied {
            return SubmitEmbodiedOutcome::NotStored(CommandReject::WrongModel);
        }
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitEmbodiedOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = validate_articulated(command.articulated)
            .err()
            .map(CommandReject::OutOfRange)
            .or_else(|| self.resulting_grips(i, command.articulated.grips).err());
        let stored = match rejection {
            // `new` gives the neutral plane, which is `Angle::ZERO` -- the plane
            // `elbow_point` already defaults to. So a refusal parks the elbow
            // where it was instead of swinging the arm to a plane nobody asked
            // for, which is the same atomicity the rest of the command gets: no
            // field of a rejected request survives, and none of the substitute
            // moves the body either.
            None => command,
            Some(_) => EmbodiedCommandV1::new(self.neutral_articulated(i)),
        };
        self.articulated_command[i] = Some(stored.articulated);
        self.write_commanded_plane(i, stored.swing_plane);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitEmbodiedOutcome::Stored { command: stored, rejection }
    }

    /// Byte-boundary companion for a payload whose raw range validation failed
    /// before an `EmbodiedCommandV1` could be constructed.
    pub fn submit_embodied_fallback_v1(
        &mut self,
        id: EntityId,
        field: crate::CommandField,
    ) -> crate::SubmitEmbodiedOutcome {
        use crate::{EmbodiedCommandV1, SubmitEmbodiedOutcome};
        if self.combat_model.command_grammar() != CommandGrammar::Embodied {
            return SubmitEmbodiedOutcome::NotStored(CommandReject::WrongModel);
        }
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitEmbodiedOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = CommandReject::OutOfRange(field);
        let stored = EmbodiedCommandV1::new(self.neutral_articulated(i));
        self.articulated_command[i] = Some(stored.articulated);
        // The neutral plane too, and through the same writer: a fallback that
        // wrote the articulated half and left the plane alone would let a
        // refused command's *previous* plane keep steering the elbow, which is
        // exactly the partial acceptance this path exists to prevent.
        self.write_commanded_plane(i, stored.swing_plane);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitEmbodiedOutcome::Stored { command: stored, rejection: Some(rejection) }
    }

    /// Byte-boundary companion for a payload whose raw range validation failed
    /// before an `ArticulatedCommandV1` could be constructed.
    pub fn submit_articulated_fallback_v1(
        &mut self,
        id: EntityId,
        field: crate::CommandField,
    ) -> SubmitArticulatedOutcome {
        if self.combat_model.command_grammar() != CommandGrammar::Articulated {
            return SubmitArticulatedOutcome::NotStored(CommandReject::WrongModel);
        }
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitArticulatedOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = CommandReject::OutOfRange(field);
        let stored = self.neutral_articulated(i);
        self.articulated_command[i] = Some(stored);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitArticulatedOutcome::Stored { command: stored, rejection: Some(rejection) }
    }

    // ---------------------------------------------------------------- internals

    /// Records what each arm asked its elbow plane to be, leaving `held` alone.
    ///
    /// Guarded on the column rather than on the model, because the guard's job
    /// is to keep an unallocated column unindexed and `elbow_plane` is empty for
    /// exactly the models that do not have one. Both submission paths go through
    /// here so there is one place the request lands.
    fn write_commanded_plane(&mut self, i: usize, plane: [Angle; 2]) {
        if !self.combat_model.has_swing_plane() { return; }
        for slot in 0..2 {
            self.elbow_plane[i][slot].commanded = plane[slot];
        }
    }

    fn neutral_articulated(&self, i: usize) -> ArticulatedCommandV1 {
        let bearing = self.body_yaw[i].angle;
        let arm = ArmTarget {
            bearing,
            height: crate::CombatHeight::MID,
            reach: Fx::ZERO,
            effort: Fx::ZERO,
        };
        ArticulatedCommandV1 {
            move_dir: Vec2::ZERO,
            body_yaw: bearing,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [GripRequest::Keep; 2],
            // A neutral command holds; it does not loose. This is what a slot
            // falls back to when nobody has submitted a command, so a `Loose`
            // here would fire on behalf of every silent policy.
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    /// The immutable anatomy a slot was constructed with. `None` in every
    /// Legacy world, which is what routes the health query back to `hp`.
    fn anatomy_spec(&self, i: usize) -> Option<&BodyAnatomySpec> {
        self.combat_specs.as_ref()?.anatomy((*self.articulated_anatomy.get(i)?)?)
    }

    /// Current health, in whichever domain this world's model owns.
    ///
    /// Every consumer goes through here -- observation, the published view, the
    /// timeout comparison, and damage credit -- because the articulated model
    /// deliberately has no HP column to fall out of step with. Legacy answers
    /// its own `hp` byte for byte.
    fn health_of(&self, i: usize) -> Fx {
        match (self.anatomy_spec(i), self.wounds.get(i)) {
            (Some(spec), Some(state)) => state.health(spec),
            _ => self.hp[i],
        }
    }

    fn max_health_of(&self, i: usize) -> Fx {
        match self.anatomy_spec(i) {
            Some(spec) => anatomy::max_health(spec),
            None => self.max_hp[i],
        }
    }

    fn health_fraction_of(&self, i: usize) -> Fx {
        let maximum = self.max_health_of(i);
        if !maximum.is_positive() { return Fx::ZERO; }
        (self.health_of(i) / maximum).clamp(Fx::ZERO, Fx::ONE)
    }

    fn equipment_in_grip(&self, i: usize, limb: usize) -> Option<crate::EquipmentSpec> {
        let slot = self.grips[i][limb].equipment_slot?;
        let id = self.articulated_carried[i].get(slot as usize).copied().flatten()?;
        self.combat_specs.as_ref()?.equipment(id).copied()
    }

    /// Whether one entity's grips hold a single two-handed item, which the
    /// contract makes the right arm's to own and the left arm's to mirror.
    fn two_handed(&self, i: usize) -> bool {
        self.grips[i][0].equipment_slot.is_some()
            && self.grips[i][0].equipment_slot == self.grips[i][1].equipment_slot
            && self.equipment_in_grip(i, 1)
                .is_some_and(|item| item.binding == crate::GripBinding::Both)
    }

    #[inline]
    fn resolve(&self, id: EntityId) -> Option<usize> {
        let i = id.index as usize;
        if i < self.alive.len() && self.alive[i] && self.generation[i] == id.generation {
            Some(i)
        } else {
            None
        }
    }

    #[inline]
    fn id_of(&self, i: usize) -> EntityId {
        EntityId::new(i as u32, self.generation[i])
    }

    #[inline]
    fn legacy_hp_frac(&self, i: usize) -> Fx {
        (self.hp[i] / self.max_hp[i]).clamp(Fx::ZERO, Fx::ONE)
    }

    /// The radius inside which no swing of `i`'s weapon is worth more than a
    /// graze, however hard it is thrown.
    ///
    /// Impact is linear in the arm and energy is its square, so the whole curve
    /// is fixed by one point on it: whatever the blade carries at one unit of
    /// reach scales by `r^2`. Inverting that gives the dead zone.
    ///
    /// Reported to its owner exactly ([`Observation::min_strike_range`] -- a
    /// fighter knows how hard it can swing) and to everyone else blurred
    /// ([`Contact::min_strike_range`] -- judging someone else's is the skill).
    fn dead_zone(&self, i: usize) -> Fx {
        rules::dead_zone(self.arm(i))
    }

    /// **What `i` is holding.**
    ///
    /// The single lookup that replaced `kind.weapon()`. Everything that used to
    /// ask a unit's archetype what it fights with asks this instead, and the
    /// answer can now change mid-fight.
    ///
    /// Falls back to the primary for a slot that is somehow empty. That cannot
    /// happen -- a slot is only ever set to one the loadout holds -- but this is
    /// on the path a corrupt replay takes, and the sim is total by policy: a
    /// nonsense slot produces a fighter holding its main weapon rather than a
    /// panic three frames into playback.
    #[inline]
    fn action_of(&self, i: usize) -> ActionKind {
        self.loadout[i]
            .slot(self.slot[i] as usize)
            .unwrap_or(self.loadout[i].primary)
    }

    /// What `i` has in its other slot, if it has one.
    #[inline]
    fn stowed_of(&self, i: usize) -> Option<ActionKind> {
        let other = 1 - self.slot[i].min(1);
        self.loadout[i].slot(other as usize)
    }

    /// Ticks it would cost `i` to bring its stowed action out, resolved against
    /// its agility. Zero when there is nothing to swap to.
    ///
    /// Charged against the *incoming* action rather than the outgoing one: you
    /// drop what you are holding instantly and pay for what you are drawing,
    /// which is why a club is slow to bring up and quick to abandon.
    fn swap_ticks(&self, i: usize) -> u16 {
        match self.stowed_of(i) {
            Some(next) => rules::phase_ticks(
                next.spec().ready,
                rules::agility_multiplier(self.stats[i].agility),
            ),
            None => 0,
        }
    }

    /// `i`'s action resolved against `i`'s body and stats.
    ///
    /// Cheap enough to build per call -- four multiplies -- and building it per
    /// call is what keeps it impossible to hold a stale one. That mattered when
    /// it was derived from three separate arrays; it matters more now that one
    /// of them is a slot a fighter can change while the arm is being used.
    fn arm(&self, i: usize) -> rules::Arm {
        rules::Arm::resolve(self.action_of(i).spec(), self.stats[i], self.radius[i])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[test]
    fn articulated_columns_follow_every_allocated_and_reused_slot() {
        let legacy = duel_world();
        assert!(legacy.body_yaw.is_empty());
        assert!(legacy.arms.is_empty());
        assert!(legacy.grips.is_empty());
        assert!(legacy.shield_pose.is_empty());
        assert!(legacy.move_authority.is_empty());
        assert!(legacy.turn_authority.is_empty());
        assert!(legacy.arm_authority.is_empty());

        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let assert_lengths = |world: &World, len| {
            assert_eq!(world.body_yaw.len(), len);
            assert_eq!(world.arms.len(), len);
            assert_eq!(world.grips.len(), len);
            assert_eq!(world.shield_pose.len(), len);
            assert_eq!(world.move_authority.len(), len);
            assert_eq!(world.turn_authority.len(), len);
            assert_eq!(world.arm_authority.len(), len);
            assert_eq!(world.alive.len(), len);
        };
        assert_lengths(&world, 2);
        let added = world.spawn(&scenario.units[0]);
        assert_eq!(added.index, 2);
        assert_lengths(&world, 3);
        world.body_yaw[2] = BodyYawState {
            angle: Angle::QUARTER,
            speed_turns: Fx::from_raw(7),
            authority_residue: Fx::from_raw(8),
        };
        world.arms[2] = [ArmState {
            bearing: Angle::QUARTER,
            bearing_speed_turns: Fx::from_raw(1),
            height: crate::CombatHeight::HIGH,
            height_speed: Fx::from_raw(2),
            reach: Fx::ONE,
            reach_speed: Fx::from_raw(3),
            previous_hand: Vec3::new(Fx::from_raw(4), Fx::from_raw(5), Fx::from_raw(6)),
            hand: Vec3::new(Fx::from_raw(7), Fx::from_raw(8), Fx::from_raw(9)),
            linear_velocity: Vec3::new(Fx::from_raw(10), Fx::from_raw(11), Fx::from_raw(12)),
            fatigue: Fx::HALF,
            work_residue: Fx::from_raw(13),
            #[cfg(feature = "cartesian-recoil")]
            post_contact_com_velocity: Vec3::ZERO,
            #[cfg(feature = "cartesian-recoil")]
            post_contact_active: false,
        }; 2];
        #[cfg(feature = "cartesian-recoil")]
        for (limb, words) in [[1, 2, 3], [-4, 5, -6]].into_iter().enumerate() {
            world.arms[2][limb].post_contact_active = true;
            world.arms[2][limb].post_contact_com_velocity = Vec3::new(
                Fx::from_raw(words[0]), Fx::from_raw(words[1]), Fx::from_raw(words[2]));
        }
        world.grips[2] = [
            GripState { equipment_slot: Some(0) },
            GripState { equipment_slot: Some(1) },
        ];
        world.shield_pose[2] = Some(ShieldPose {
            centre: Vec3::new(Fx::from_raw(14), Fx::from_raw(15), Fx::from_raw(16)),
            normal: Vec3::new(Fx::from_raw(17), Fx::from_raw(18), Fx::from_raw(19)),
            half_width: Fx::from_raw(20),
            half_height: Fx::from_raw(21),
            thickness: Fx::from_raw(22),
        });
        world.move_authority[2] = Fx::HALF;
        world.turn_authority[2] = Fx::HALF;
        world.arm_authority[2] = [Fx::HALF; 2];
        world.hp[2] = Fx::ZERO;
        world.reap_dead();
        let replacement = world.spawn(&scenario.units[1]);
        assert_eq!(replacement, EntityId::new(2, 1));
        assert_lengths(&world, 3);
        #[cfg(feature = "cartesian-recoil")]
        for arm in world.arms[2] {
            assert_eq!((arm.post_contact_active, arm.post_contact_com_velocity),
                       (false, Vec3::ZERO), "a reused slot inherited Cartesian recoil");
        }
        let fresh = World::new(&scenario, 1);
        #[cfg(feature = "cartesian-recoil")]
        for arms in &fresh.arms {
            for arm in arms {
                assert_eq!((arm.post_contact_active, arm.post_contact_com_velocity),
                           (false, Vec3::ZERO), "fresh Cartesian recoil was not canonical");
            }
        }
        assert_eq!(world.articulated_pose_test_view(replacement).unwrap(),
            fresh.articulated_pose_test_view(EntityId::new(1, 0)).unwrap());
    }

    #[test]
    fn articulated_mutation_apis_preserve_immutable_construction() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let construction = (world.kind[0], world.loadout[0], world.articulated_anatomy[0],
            world.articulated_carried[0], world.articulated_equipment[0], world.grips[0]);
        let before = world.state_digest().value;
        assert!(!world.set_body(fighter, Body::Brute));
        assert!(!world.set_loadout(fighter, Loadout::single(ActionKind::Club)));
        assert_eq!(world.state_digest().value, before);
        let changed_stats = Stats::new(1, 2, 3, 4, 5);
        assert!(world.set_stats(fighter, changed_stats));
        assert_eq!(world.stats[0], changed_stats);
        assert_ne!(world.state_digest().value, before);
        assert_eq!((world.kind[0], world.loadout[0], world.articulated_anatomy[0],
            world.articulated_carried[0], world.articulated_equipment[0], world.grips[0]), construction);
    }

    #[test]
    fn neutral_fallback_uses_authoritative_body_yaw_after_stationary_divergence() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = articulated_command();
        command.body_yaw = Angle::QUARTER;
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        assert_eq!(world.facing[0], Angle::ZERO);
        assert_eq!(world.body_yaw[0].angle, Angle::from_raw(91));
        let outcome = world.submit_articulated_fallback_v1(fighter, crate::CommandField::LeftReach);
        let stored = match outcome {
            SubmitArticulatedOutcome::Stored { command, rejection: Some(CommandReject::OutOfRange(_)) } => command,
            other => panic!("unexpected fallback outcome: {other:?}"),
        };
        assert_eq!(stored.body_yaw, Angle::from_raw(91));
        assert_eq!(stored.arms[0].bearing, Angle::from_raw(91));
        assert_eq!(stored.arms[1].bearing, Angle::from_raw(91));
    }

    #[test]
    fn a_two_handed_club_is_expressible_from_a_duel_config() {
        // The whole point of combat-arms-01: everything `both_scenario()` hand
        // writes into the spec table is reachable from `DuelConfigV1`, so a
        // browser picker and `lab trace` can build the fighter the fixture
        // proves. The claims are the fixture's own: right limb ownership, no
        // left collider, one segment, and the world's `two_handed` answer.
        let mut config = crate::DuelConfigV1::shipped();
        config.fighters[1].two_handed = true;
        let scenario = Scenario::duel_from(&config).expect("a two-handed club");
        let table = scenario.combat_specs.as_ref().expect("a table");
        assert_eq!(
            table.equipment.iter().map(|row| (row.action, row.binding)).collect::<Vec<_>>(),
            [
                (ActionKind::Sword, crate::GripBinding::Right),
                (ActionKind::Shield, crate::GripBinding::Left),
                (ActionKind::Club, crate::GripBinding::Both),
            ],
            "only the club's binding moved, and it moved to Both"
        );

        let world = World::try_new(&scenario, 3).expect("a world the config opens");
        assert!(world.two_handed(1), "the Brute did not spawn two-handed");
        assert!(!world.two_handed(0), "the flag leaked onto the other fighter");
        // Both grips name the club's single carrying slot, right arm owning.
        assert_eq!(world.grips[1], [GripState { equipment_slot: Some(0) }; 2]);
        assert_eq!(
            world.equipment_in_grip(1, 1).map(|item| item.binding),
            Some(crate::GripBinding::Both)
        );
        // One collider and one segment: the left arm carries neither, exactly
        // as the geometry phase's `Both` skip promises.
        let carried = scenario.units[1].articulated.expect("an articulated row").equipment;
        let colliders = geometry::held_segment_colliders(
            Vec3::ZERO, Vec3::ZERO, world.arms[1], world.arms[1], world.grips[1], carried,
            |id| table.equipment(id).copied(),
        );
        assert!(colliders[0].is_none(), "the mirrored left arm grew its own collider");
        let right = colliders[1].expect("the right arm sweeps the club");
        assert_eq!(right.owner, crate::LimbSlot::RightArm);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn shipped_exact_lattices_pin_scale_and_endpoint_denominator_bits() {
        let scenario = Scenario::articulated_duel();
        let table = scenario.combat_specs.as_ref().unwrap();
        let hero = exact_lattice_for_unit(scenario.units[0].kind.mass().raw(), table,
            scenario.units[0].articulated.unwrap()).unwrap();
        let brute = exact_lattice_for_unit(scenario.units[1].kind.mass().raw(), table,
            scenario.units[1].articulated.unwrap()).unwrap();
        assert_eq!((hero.common_scale, hero.endpoint_denominator_bits),
                   (1_283_938_665_662_054_400, 92));
        assert_eq!((brute.common_scale, brute.endpoint_denominator_bits),
                   (59_914_856_794, 69));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_lattice_accepts_ninety_six_bits_and_refuses_ninety_seven() {
        let common = [999_983, 999_979, 999_961];
        assert_eq!(exact_lattice_from_masses(&common, &[999_953]).unwrap()
            .endpoint_denominator_bits, 96);
        assert_eq!(exact_lattice_from_masses(&common, &[1_999_993]),
                   Err(ExactLatticeEnvelope::EndpointDenominator));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn adversarial_coprime_spawn_refuses_before_any_world_authority_moves() {
        let mut scenario = Scenario::articulated_duel();
        let table = scenario.combat_specs.as_mut().unwrap();
        let mut left = table.equipment[0];
        left.id = table.equipment.last().unwrap().id + 1;
        left.binding = crate::GripBinding::Left;
        left.mass = Fx::from_raw(499_979);
        let mut right = table.equipment[1];
        right.id = left.id + 1;
        right.binding = crate::GripBinding::Right;
        right.mass = Fx::from_raw(499_957);
        table.equipment.push(left); table.equipment.push(right);
        let mut world = World::try_new(&scenario, 1).unwrap();
        let mut spec = scenario.units[0].clone();
        spec.articulated.as_mut().unwrap().equipment = [Some(left.id), Some(right.id)];
        spec.loadout = Loadout::pair(left.action, right.action);
        let before_capacities = world.contact_capacities();
        let before = world.clone();
        assert_eq!(world.try_spawn(&spec),
                   Err(SpawnError::ExactLattice(ExactLatticeEnvelope::EndpointDenominator)));
        assert_eq!((&world.generation, &world.alive, &world.free, &world.exact_owners),
                   (&before.generation, &before.alive, &before.free, &before.exact_owners));
        assert_eq!(world.contact_capacities(), before_capacities,
                   "exact lattice refusal reached contact reservation");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn contact_runtime_clone_rereserves_empty_exact_work_before_early_return() {
        let mut runtime = ContactRuntime::default();
        runtime.reserve(crate::combat::contact::MAX_ARTICULATED_ENTITIES).unwrap();
        let source_caps = (runtime.exact_owner_entry.capacity(),
            runtime.exact_trajectory_entry.capacity(), runtime.exact_owners.capacity(),
            runtime.exact_trajectories.capacity(), runtime.scratch.capacities());
        let cloned = runtime.clone();
        assert_eq!(cloned.high_water, runtime.high_water);
        assert_eq!((cloned.exact_owner_entry.capacity(),
            cloned.exact_trajectory_entry.capacity(), cloned.exact_owners.capacity(),
            cloned.exact_trajectories.capacity(), cloned.scratch.capacities()), source_caps);
    }

    #[test]
    fn grip_requests_apply_atomically_or_not_at_all() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let initial = world.grips[0];
        let mut invalid = world.neutral_articulated(0);
        invalid.grips = [GripRequest::Release, GripRequest::EquipSlot(1)];
        assert!(matches!(world.submit_articulated_v1(fighter, invalid),
            SubmitArticulatedOutcome::Stored { command, rejection: Some(CommandReject::MissingEquipment { .. }) }
                if command.grips == [GripRequest::Keep; 2]));
        assert_eq!(world.grips[0], initial, "submission changed one arm before the step");
        world.step();
        assert_eq!(world.grips[0], initial, "fallback did not preserve the complete pair");

        let mut release = world.neutral_articulated(0);
        release.grips = [GripRequest::Release; 2];
        let _ = world.submit_articulated_v1(fighter, release);
        assert_eq!(world.grips[0], initial, "accepted transaction applied before step");
        world.step();
        assert_eq!(world.grips[0], [GripState { equipment_slot: None }; 2]);
    }

    #[test]
    fn a_two_handed_grip_cannot_bind_a_shield() {
        let mut scenario = Scenario::articulated_duel();
        let mut shield = crate::shield();
        shield.id = 4;
        shield.action = ActionKind::Club;
        shield.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(shield);
        scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(4), None];
        assert_eq!(crate::combat::spec::validate_construction(
            scenario.combat_model, scenario.combat_specs.as_ref(), &scenario.units,
        ), Err(crate::CombatSpecError::GripConflict));

        let mut scenario = Scenario::articulated_duel();
        let mut left = crate::shield();
        left.id = 4;
        left.action = ActionKind::Sword;
        let mut right = left;
        right.id = 5;
        right.action = ActionKind::Club;
        right.binding = crate::GripBinding::Right;
        scenario.combat_specs.as_mut().unwrap().equipment.extend([left, right]);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(4), Some(5)];
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Club);
        assert_eq!(crate::combat::spec::validate_construction(
            scenario.combat_model, scenario.combat_specs.as_ref(), &scenario.units,
        ), Err(crate::CombatSpecError::GripConflict));
    }

    #[test]
    fn articulated_actuation_cannot_create_healing_damage_death_recoil_or_shots() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        world.hp[0] -= Fx::ONE;
        world.hp[1] = Fx::ZERO;
        let hp = world.hp.clone();
        let limbs = world.limb.clone();
        let mut command = world.neutral_articulated(0);
        command.arms[0] = ArmTarget { bearing: Angle::HALF, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE };
        command.arms[1] = command.arms[0];
        let _ = world.submit_articulated_v1(fighter, command);
        let _ = world.submit_articulated_v1(brute, command);
        for _ in 0..180 {
            assert!(world.step().is_empty());
        }
        assert_eq!(world.hp, hp);
        assert_eq!(world.alive, [true, true]);
        assert_eq!(world.limb, limbs);
        assert!(world.shot_alive.is_empty());
    }

    // The two literals below gained `prop swings`, `loose projectiles` and
    // `resolve projectiles` when the schedule became a table. **No phase moved
    // and none was added**: those three bodies always ran here, in this order,
    // and simply had no trace name of their own -- `resolve_dungeon_prop_swings`
    // rode under `legacy swings`, and the two projectile phases rode with
    // `resolve_contact` under `contact`. Reading the name off the table is what
    // made that impossible to write. The golden hashes are the evidence that the
    // order itself did not change, and none of them moved.

    #[test]
    fn the_legacy_phase_trace_is_unchanged() {
        let mut world = duel_world();
        world.phase_trace_enabled = true;
        world.step();
        assert_eq!(world.phase_trace, [
            "clear events", "expire decisions", "regenerate", "apply movement", "separate",
            "drive legacy limb", "legacy parries", "legacy swings", "prop swings", "recoil",
            "shots", "doors", "reap", "increment tick", "pending", "navigation",
        ]);
    }

    #[test]
    fn articulated_contact_runs_after_geometry_and_before_doors() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        world.phase_trace_enabled = true;
        world.step();
        assert_eq!(world.phase_trace, [
            "clear events", "expire decisions", "retain contact entry",
            "apply articulated movement", "record contact locomotion", "separate",
            "body yaw", "grips", "arms", "geometry", "loose projectiles", "contact",
            "resolve projectiles", "anatomy", "doors", "reap",
            "increment tick", "pending", "navigation",
        ]);
    }

    /// A command that varies with the tick and the slot, so a run exercises
    /// movement, turning, reach and effort rather than standing still.
    ///
    /// Deterministic and cheap on purpose: the point is a long identical pair
    /// of fights, not a realistic one.
    fn scripted_embodied(tick: u32, slot: usize) -> ArticulatedCommandV1 {
        let phase = tick.wrapping_mul(977).wrapping_add(slot as u32 * 31);
        let arm = |k: u32| ArmTarget {
            bearing: Angle::from_raw(phase.wrapping_mul(13).wrapping_add(k * 7_001) as u16),
            height: crate::CombatHeight::try_from_raw(
                (phase.wrapping_add(k * 3) % 65_537) as i32).unwrap(),
            reach: Fx::from_raw((phase.wrapping_add(k * 11) % 65_537) as i32),
            effort: Fx::from_raw((phase.wrapping_mul(3).wrapping_add(k) % 65_537) as i32),
        };
        ArticulatedCommandV1 {
            // Both zero, and both load-bearing. Zero yaw is the one bearing at
            // which a torso-relative reading and an absolute one agree; zero
            // movement is what keeps the hips from turning for free and the
            // pelvis from sinking, neither of which an articulated body does.
            move_dir: Vec2::ZERO,
            body_yaw: Angle::ZERO,
            intent: Intent::Hold,
            arms: [arm(0), arm(1)],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    /// An embodied fight is an articulated fight **while its stance is inert and
    /// its arms are inside the annulus**, tick for tick.
    ///
    /// The condition has been narrowed three times and every narrowing is the
    /// measurement rather than a weakening:
    ///
    /// - session 03 asserted it unconditionally;
    /// - session 05 made an embodied bearing torso-relative, so the two readings
    ///   coincide only at zero yaw;
    /// - session 06 gave the body hips and a pelvis, which coincide with a free
    ///   torso only while it is also not translating;
    /// - session 07 gave the arm a length it cannot exceed, so the two agree only
    ///   on a pose an articulated arm would also have held;
    /// - session 07's second half gave the embodied arm an **elbow**, which is a
    ///   published column the articulated arm does not have and never will.
    ///
    /// The fourth is a different kind of narrowing from the first three and it is
    /// worth separating. The others restricted the *conditions* under which the
    /// two agree; this one carves one column out of the comparison permanently,
    /// because the whole point of the session that added it is that an embodied
    /// arm bends and an articulated one does not. So the column is excluded and
    /// then asserted **from both sides** -- every articulated elbow `None`, every
    /// embodied one `Some` -- which is what stops "exclude the difference" from
    /// degenerating into "stop looking". A one-sided exclusion would be satisfied
    /// by an embodied body that had quietly stopped solving its elbow at all.
    ///
    /// The annulus condition is not a range this test can assume, so it **finds**
    /// one: it searches the command space for a target the clamp leaves
    /// untouched, and fails if there is none. Everything else -- grips, contact,
    /// anatomy, projectiles, doors, the whole rest of the tick -- is still
    /// asserted identical, which is what a session changing one of those for
    /// `Embodied` alone would be caught by.
    ///
    /// **It is not a claim that the two fights are still the same fight once
    /// something is hit.** An embodied body presents seven swept volumes and an
    /// articulated one five, so a blow that lands on a bent forearm has no
    /// articulated counterpart. This script never brings the two bodies into
    /// contact, which is why the equality survives at all; the guard that the
    /// *articulated* corpus did not move is `lab articulated`, not this.
    #[test]
    fn an_embodied_duel_equals_the_articulated_duel_while_its_stance_is_inert() {
        let mut articulated = World::new(&Scenario::articulated_duel(), 7);
        let mut embodied = World::new(&Scenario::embodied_duel(), 7);
        let roster = |world: &World| -> Vec<EntityId> {
            world.alive_ids(Faction::Heroes).into_iter()
                .chain(world.alive_ids(Faction::Monsters))
                .collect()
        };
        let ids = roster(&articulated);
        assert_eq!(ids, roster(&embodied), "the two fixtures spawned different rosters");
        assert!(!ids.is_empty());

        // The fixture spawns its two bodies facing each other, so one of them
        // starts at half a turn. Zero both, identically, and square the hips with
        // them: a squared torso over unmoved feet is a body wound to its limit,
        // which is the opposite of the inert stance this test is establishing.
        for world in [&mut articulated, &mut embodied] {
            for slot in 0..ids.len() {
                world.body_yaw[slot].angle = Angle::ZERO;
                world.body_yaw[slot].speed_turns = Fx::ZERO;
                if slot < world.stance.len() {
                    world.stance[slot] = StanceState::squared(Angle::ZERO);
                }
            }
        }

        // Find a pose both arms can hold. Searched rather than assumed, because
        // the annulus depends on two anatomies and a pelvis, and a hard-coded
        // pair would quietly stop being reachable the day any of them moved.
        let reachable = |world: &World| {
            for height_raw in (0..=Fx::ONE.raw()).step_by(2_048) {
                for reach_raw in (0..=Fx::ONE.raw()).step_by(2_048) {
                    let target = ArmTarget {
                        bearing: Angle::ZERO,
                        height: crate::CombatHeight::try_from_raw(height_raw).unwrap(),
                        reach: Fx::from_raw(reach_raw),
                        effort: Fx::ONE,
                    };
                    let holds = (0..ids.len()).all(|slot| {
                        (0..2).all(|limb| world.reachable_arm_target(slot, limb, target) == target)
                    });
                    if holds { return Some(target); }
                }
            }
            None
        };
        let held = reachable(&embodied).expect("no arm pose in the whole command space is reachable");

        let mut moved = false;
        for tick in 0..600u32 {
            for (slot, id) in ids.iter().enumerate() {
                let mut command = scripted_embodied(tick, slot);
                command.arms = [held; 2];
                assert!(matches!(
                    articulated.submit_articulated_v1(*id, command),
                    SubmitArticulatedOutcome::Stored { rejection: None, .. }));
                assert!(matches!(
                    embodied.submit_embodied_v1(*id, crate::EmbodiedCommandV1::new(command)),
                    crate::SubmitEmbodiedOutcome::Stored { rejection: None, .. }));
            }
            articulated.step();
            embodied.step();
            let left: Vec<_> = articulated.articulated_poses().collect();
            let right: Vec<_> = embodied.articulated_poses().collect();
            // The elbow column, out of the comparison and then asserted from
            // both sides. See the doc comment: excluding it one-sidedly would be
            // satisfied by an embodied body that stopped solving a joint.
            assert!(left.iter().all(|pose| pose.arms.iter().all(|arm| arm.elbow.is_none())),
                    "an articulated arm grew an elbow at tick {tick}");
            assert!(right.iter().all(|pose| pose.arms.iter().all(|arm| arm.elbow.is_some())),
                    "an embodied arm lost its elbow at tick {tick}");
            let straightened = |poses: &[ArticulatedPose]| -> Vec<ArticulatedPose> {
                poses.iter().map(|pose| {
                    let mut pose = *pose;
                    for arm in &mut pose.arms { arm.elbow = None; }
                    pose
                }).collect()
            };
            assert_eq!(straightened(&left), straightened(&right),
                       "poses diverged at tick {tick}");
            for pose in &right {
                assert_eq!(pose.body_yaw, Angle::ZERO,
                           "the equality's own condition failed at tick {tick}");
            }
            for slot in 0..ids.len() {
                assert_eq!(embodied.stance[slot], StanceState::squared(Angle::ZERO),
                           "the stance stopped being inert at tick {tick}");
            }
            moved |= left.iter().any(|pose| pose.arms[1].hand != Vec3::ZERO);
        }
        assert!(moved, "600 ticks of an identical script moved neither fighter's hand");
    }

    /// Drives one embodied body under a held command and hands back the world.
    ///
    /// Takes the yaw and the movement separately because every stance claim is
    /// about the interaction of the two -- a body turning while planted and a
    /// body turning while walking are the two cases the model distinguishes.
    fn stanced(yaw: Angle, move_dir: Vec2, ticks: u32) -> World {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let id = world.alive_ids(Faction::Heroes)[0];
        let command = ArticulatedCommandV1 {
            move_dir,
            body_yaw: yaw,
            intent: Intent::Hold,
            arms: [ArmTarget {
                bearing: Angle::ZERO,
                height: crate::CombatHeight::MID,
                reach: Fx::HALF,
                effort: Fx::HALF,
            }; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        };
        for _ in 0..ticks {
            world.submit_embodied_v1(id, crate::EmbodiedCommandV1::new(command));
            world.step();
        }
        world
    }

    #[test]
    fn a_torso_cannot_turn_past_its_hips_by_more_than_the_twist_budget() {
        let limit = actuator::STANCE_TWIST_LIMIT_RAW;
        // Half a turn requested, which is four and a half budgets away.
        let world = stanced(Angle::HALF, Vec2::ZERO, 400);
        for slot in 0..world.stance.len() {
            let twist = world.stance[slot].twist(world.body_yaw[slot].angle);
            assert!(twist.abs() <= limit,
                    "slot {slot} wound to {twist} raw, past a budget of {limit}");
        }
    }

    #[test]
    fn a_saturated_twist_forces_a_step_and_the_step_recovers_it() {
        // One tick is enough to arm it: the request is refused immediately.
        let armed = stanced(Angle::HALF, Vec2::ZERO, 1);
        assert!(armed.stance[0].step_left > 0, "a refused turn armed no step");

        // And the step gets the body there: the hips follow at the full rate
        // while it runs, so the torso ends up facing where it asked.
        let settled = stanced(Angle::HALF, Vec2::ZERO, 600);
        let reached = settled.body_yaw[0].angle.delta(Angle::HALF).abs();
        assert!(reached < 2_048,
                "the body never reached its commanded yaw: {reached} raw short");
        let twist = settled.stance[0].twist(settled.body_yaw[0].angle);
        assert!(twist.abs() < actuator::STANCE_TWIST_LIMIT_RAW,
                "the body arrived still wound to its limit");
    }

    /// **The hole session 02 recorded, closed.** An embodied hand can never be
    /// further from its shoulder than the arm is long, at any bearing, any
    /// height, any reach, any yaw, and at either pelvis height.
    ///
    /// Swept over the whole commanded range rather than sampled at the corners,
    /// because the failure it replaces was not at a corner: `hand_position` put
    /// the hand at `reach` horizontally and then *overwrote* `z`, so the excess
    /// grew with both axes at once and every one-axis sweep missed it.
    #[test]
    fn a_hand_can_never_be_further_from_its_shoulder_than_the_arm_is_long() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        for slot in 0..world.alive.len() {
            for pelvis_raw in [actuator::PELVIS_HEIGHT_RAW,
                               actuator::PELVIS_HEIGHT_RAW - actuator::PELVIS_SPEED_DROP_RAW] {
                world.stance[slot].pelvis = Fx::from_raw(pelvis_raw);
                let anatomy = world.posed_anatomy(slot);
                let (inner, outer) = crate::combat::limb::Elbow::of(&anatomy).reach_bounds();
                for yaw_raw in [0u16, 9_000, 32_768, 58_000] {
                    world.body_yaw[slot].angle = Angle::from_raw(yaw_raw);
                    let yaw = world.body_yaw[slot].angle;
                    for limb in 0..2 {
                        let shoulder = crate::combat::limb::shoulder(&anatomy, yaw, limb);
                        for bearing_raw in (0..=65_535u32).step_by(4_096) {
                            for height_raw in (0..=Fx::ONE.raw()).step_by(8_192) {
                                for reach_raw in (0..=Fx::ONE.raw()).step_by(8_192) {
                                    let target = ArmTarget {
                                        bearing: Angle::from_raw(bearing_raw as u16),
                                        height: crate::CombatHeight::try_from_raw(height_raw).unwrap(),
                                        reach: Fx::from_raw(reach_raw),
                                        effort: Fx::ONE,
                                    };
                                    let held = world.world_arm_target(slot, limb, target);
                                    let hand = actuator::hand_position(
                                        &anatomy, yaw, limb, held.bearing, held.height, held.reach);
                                    let reach = (hand - shoulder).length();
                                    // **Both bounds carry the exact slack that
                                    // was measured**, not a round number chosen
                                    // to make the test pass: one raw unit over
                                    // the outer bound and three inside the inner
                                    // one, across the whole sweep. That is
                                    // 1.5e-5 and 4.6e-5 world units, and it is
                                    // three truncations -- the height's
                                    // quantisation, the reach's, and `length`'s
                                    // own square root -- each of at most one raw
                                    // unit and not all in the same direction.
                                    // Pinning the measured maxima rather than a
                                    // generous epsilon is what makes this catch
                                    // a regression instead of absorbing one.
                                    assert!(reach <= outer + Fx::from_raw(1),
                                            "slot {slot} limb {limb} reached {reach:?} past {outer:?}");
                                    assert!(reach + Fx::from_raw(3) >= inner,
                                            "slot {slot} limb {limb} folded to {reach:?} inside {inner:?}");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// The articulated arm is **not** clamped, and that is the guard: closing the
    /// hole for one model must not close it for the other, or every articulated
    /// corpus would move.
    #[test]
    fn an_articulated_arm_target_is_still_unclamped() {
        let world = World::new(&Scenario::articulated_duel(), 1);
        let anatomy = world.posed_anatomy(0);
        let outer = crate::combat::limb::Elbow::of(&anatomy).reach_bounds().1;
        let reaching = ArmTarget {
            bearing: Angle::ZERO,
            height: crate::CombatHeight::HIGH,
            reach: Fx::ONE,
            effort: Fx::ONE,
        };
        assert_eq!(world.world_arm_target(0, 1, reaching), reaching);
        let hand = actuator::hand_position(
            &anatomy, Angle::ZERO, 1, reaching.bearing, reaching.height, reaching.reach);
        let shoulder = crate::combat::limb::shoulder(&anatomy, Angle::ZERO, 1);
        assert!((hand - shoulder).length() > outer,
                "the articulated arm was clamped, and its corpora are about to move");
    }

    /// The asymmetry that makes footwork a decision, raced against **the same
    /// target**.
    ///
    /// The obvious form of this test does not work and the reason is worth
    /// keeping: `move_dir` is torso-relative, so "walk forward" names a
    /// direction that turns with the body, and a walking body's hips chase a
    /// moving target while a planted one's chase a fixed one. Comparing the two
    /// measures the target, not the rate. So both bodies here are given the same
    /// hip target -- an eighth of a turn, comfortably inside the budget -- and
    /// the only difference is whether they are translating.
    ///
    /// Bounded from **both** sides: the moving body must turn strictly further,
    /// and the standing one must turn at all. A standing rate of zero would
    /// satisfy the first half and delete the mechanic.
    #[test]
    fn a_moving_body_turns_its_hips_faster_than_a_standing_one() {
        let eighth = Angle::from_raw(8_192);
        let race = |move_dir: Vec2| -> i32 {
            let mut world = World::new(&Scenario::embodied_duel(), 1);
            let id = world.alive_ids(Faction::Heroes)[0];
            // Torso already where it is going, hips an eighth behind it, so the
            // hip target is `eighth` in both runs: for the planted body because
            // the hips chase the torso, and for the walking one because
            // body-forward at a yaw of `eighth` *is* `eighth` in world space.
            world.body_yaw[0].angle = eighth;
            world.stance[0] = StanceState::squared(Angle::ZERO);
            let command = ArticulatedCommandV1 {
                move_dir,
                body_yaw: eighth,
                intent: Intent::Hold,
                arms: [ArmTarget {
                    bearing: Angle::ZERO,
                    height: crate::CombatHeight::MID,
                    reach: Fx::HALF,
                    effort: Fx::HALF,
                }; 2],
                grips: [GripRequest::Keep; 2],
                releases: [ReleaseRequest::Keep; 2],
            };
            for _ in 0..8 {
                world.submit_embodied_v1(id, crate::EmbodiedCommandV1::new(command));
                world.step();
            }
            world.stance[0].hip_yaw.delta(Angle::ZERO).abs()
        };

        let planted = race(Vec2::ZERO);
        let walking = race(Vec2::new(Fx::ONE, Fx::ZERO));
        assert!(walking > planted, "walking {walking} vs planted {planted}");
        assert!(planted > 0, "a planted body's hips did not turn at all");
    }

    #[test]
    fn pelvis_height_falls_with_speed_and_with_twist_and_is_never_commanded() {
        let base = Fx::from_raw(actuator::PELVIS_HEIGHT_RAW);
        let still = stanced(Angle::ZERO, Vec2::ZERO, 60);
        assert_eq!(still.stance[0].pelvis, base, "a squared, standing body is not at full height");

        let running = stanced(Angle::ZERO, Vec2::new(Fx::ONE, Fx::ZERO), 60);
        assert!(running.stance[0].pelvis < base, "speed did not lower the pelvis");

        let wound = stanced(Angle::HALF, Vec2::ZERO, 3);
        assert!(wound.stance[0].pelvis < base, "twist did not lower the pelvis");

        // Never commanded: no field of `EmbodiedCommandV1` names it, and the
        // proof is that two commands differing in every field a policy *can*
        // set leave the same pelvis when speed and twist agree.
        assert_eq!(still.stance[1].pelvis, base);
    }

    #[test]
    fn a_forced_step_reduces_move_authority_for_exactly_its_duration() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let anatomy = world.move_authority[0];
        assert_eq!(world.moving_authority(0), anatomy, "a settled body is already paying");

        world.stance[0].step_left = 1;
        let stepping = world.moving_authority(0);
        assert!(stepping < anatomy, "a forced step cost nothing");
        assert!(stepping > Fx::ZERO, "a forced step is a stun, not a cost");

        world.stance[0].step_left = 0;
        assert_eq!(world.moving_authority(0), anatomy, "the cost outlived the step");
    }

    /// The chain the plan is about: pelvis moves the shoulder, and the shoulder
    /// moves the hand and the arm capsule with it. Asserted through
    /// `posed_anatomy`, which is the one door all three read.
    #[test]
    fn the_shoulder_follows_the_pelvis_and_the_arm_follows_the_shoulder() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let tall = world.posed_anatomy(0);
        assert_eq!(world.stance[0].pelvis, Fx::from_raw(actuator::PELVIS_HEIGHT_RAW));

        // Sink the pelvis by a tenth of standing height and read the shoulder.
        world.stance[0].pelvis = world.stance[0].pelvis - Fx::from_ratio(1, 10);
        let crouched = world.posed_anatomy(0);
        assert!(crouched.shoulder_height < tall.shoulder_height, "the shoulder did not sink");
        assert!(crouched.standing_height < tall.standing_height, "the hand height did not sink");
        assert_eq!(
            tall.shoulder_height - crouched.shoulder_height,
            tall.standing_height - crouched.standing_height,
            "the shoulder and the hand sank by different amounts",
        );

        // And the arm the contact phase sweeps follows, because it is built from
        // the same spec.
        let tall_arm =
            crate::combat::limb::arm_polyline(&tall, Angle::ZERO, 1, Vec3::ZERO, None);
        let low_arm =
            crate::combat::limb::arm_polyline(&crouched, Angle::ZERO, 1, Vec3::ZERO, None);
        assert!(low_arm.shoulder().z < tall_arm.shoulder().z);
    }

    /// An articulated body allocates no stance at all, which is what keeps a
    /// mechanic it does not have from reaching its digest.
    #[test]
    fn an_articulated_body_has_no_stance_row() {
        let articulated = World::new(&Scenario::articulated_duel(), 1);
        let legacy = duel_world();
        assert!(articulated.stance.is_empty());
        assert!(legacy.stance.is_empty());
        assert!(!articulated.combat_model.has_stance());
        assert!(!legacy.combat_model.has_stance());

        let embodied = World::new(&Scenario::embodied_duel(), 1);
        assert_eq!(embodied.stance.len(), embodied.alive.len());
        assert!(embodied.combat_model.has_stance());
    }

    /// **Bounded from both sides**, and from the decision rather than from a
    /// sweep -- the sweep it owes is named on the constant. A one-sided bound is
    /// satisfied by a range wider than the decision and this repository has
    /// shipped two of those.
    #[test]
    fn the_twist_limit_is_bounded_from_both_sides() {
        let full_turn = 65_536;
        let limit = actuator::STANCE_TWIST_LIMIT_RAW;
        assert!(limit > full_turn / 10,
                "a budget under a tenth of a turn taxes every guard change");
        assert!(limit < full_turn / 4,
                "a budget of a quarter turn or more covers both flanks without a step");
    }

    #[test]
    fn the_standing_hip_rate_is_bounded_from_both_sides() {
        let standing = actuator::STANCE_HIP_STANDING_SPEED_RAW;
        let moving = actuator::STANCE_HIP_MOVING_SPEED_RAW;
        assert!(standing > 0, "a planted body could never reorient at all");
        assert!(standing < moving, "standing and moving cost the same, so footwork is free");
    }

    #[test]
    fn the_step_authority_is_bounded_from_both_sides() {
        let during = Fx::from_raw(actuator::STANCE_STEP_MOVE_AUTHORITY_RAW);
        assert!(during > Fx::ZERO, "a forced step is a stun rather than a cost");
        assert!(during < Fx::ONE, "a forced step is free");
    }

    /// The elbow-plane rate, bounded from both sides by the claim it encodes.
    ///
    /// The upper bound is the whole derivation: an elbow rotating about the
    /// shoulder-to-hand axis is the shoulder swinging the entire arm about that
    /// axis, and nothing in this model lets an arm turn faster than
    /// `ARM_BEARING_MAX_SPEED_RAW`, so a plane that outran it would be an elbow
    /// overtaking the shoulder carrying it. The lower bound is the other failure:
    /// a rate of zero is an elbow that cannot be steered, which is the state the
    /// command was added to end.
    ///
    /// Written as an inequality rather than as `assert_eq!` against the constant
    /// it is defined from, which would restate the definition and pass whatever
    /// either number became.
    #[test]
    fn the_elbow_plane_rate_is_bounded_from_both_sides() {
        let plane = actuator::ELBOW_PLANE_MAX_SPEED_RAW;
        assert!(plane > 0, "a commanded elbow plane that can never be reached");
        assert!(plane <= actuator::ARM_BEARING_MAX_SPEED_RAW,
                "the elbow outruns the shoulder that carries it");
        // And it is slow enough to matter: crossing the worst case must take
        // more than one tick, which is the property the swept forearm needs.
        assert!(32_768 / plane > 1, "half a turn of plane change costs one tick");
    }

    /// The step has to be long enough for the hips to actually arrive, or it
    /// re-arms the moment it expires and the body stutters instead of stepping.
    #[test]
    fn a_forced_step_outlasts_the_turn_it_exists_to_make() {
        let ticks_to_cross_the_budget =
            actuator::STANCE_TWIST_LIMIT_RAW / actuator::STANCE_HIP_MOVING_SPEED_RAW;
        assert!(i32::from(actuator::STANCE_STEP_TICKS) > ticks_to_cross_the_budget,
                "a {}-tick step cannot cross a {ticks_to_cross_the_budget}-tick budget",
                actuator::STANCE_STEP_TICKS);
        assert!(i32::from(actuator::STANCE_STEP_TICKS) < 60,
                "a step longer than a second commits a fighter for a visible age");
    }

    /// The frame conversion, tested where it lives rather than through six
    /// hundred ticks of settling: `world_arm_target` and `world_move_dir` are
    /// pure functions of the model and the body yaw.
    #[test]
    fn an_embodied_arm_bearing_is_measured_from_the_body_and_not_from_the_world() {
        let mut embodied = World::new(&Scenario::embodied_duel(), 1);
        let mut articulated = World::new(&Scenario::articulated_duel(), 1);
        let held = ArmTarget {
            bearing: Angle::from_raw(9_000),
            height: crate::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        for yaw_raw in [0u16, 1, 16_384, 32_768, 49_152, 65_535] {
            let yaw = Angle::from_raw(yaw_raw);
            embodied.body_yaw[0].angle = yaw;
            articulated.body_yaw[0].angle = yaw;
            assert_eq!(embodied.world_arm_target(0, 1, held).bearing, yaw + held.bearing);
            assert_eq!(articulated.world_arm_target(0, 1, held).bearing, held.bearing,
                       "an articulated bearing stopped being absolute");
            // Everything except the bearing is carried through untouched.
            let converted = embodied.world_arm_target(0, 1, held);
            assert_eq!((converted.height, converted.reach, converted.effort),
                       (held.height, held.reach, held.effort));
        }
    }

    #[test]
    fn a_zero_bearing_command_holds_the_arm_directly_ahead_at_every_yaw() {
        let mut embodied = World::new(&Scenario::embodied_duel(), 1);
        let ahead = ArmTarget {
            bearing: Angle::ZERO,
            height: crate::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        for yaw_raw in [0u16, 4_096, 16_384, 40_000, 65_535] {
            embodied.body_yaw[0].angle = Angle::from_raw(yaw_raw);
            assert_eq!(embodied.world_arm_target(0, 1, ahead).bearing, Angle::from_raw(yaw_raw));
        }
    }

    #[test]
    fn embodied_movement_is_expressed_in_the_body_frame() {
        let mut embodied = World::new(&Scenario::embodied_duel(), 1);
        let mut articulated = World::new(&Scenario::articulated_duel(), 1);
        let forward = Vec2::new(Fx::ONE, Fx::ZERO);
        let left = Vec2::new(Fx::ZERO, Fx::ONE);

        embodied.body_yaw[0].angle = Angle::ZERO;
        assert_eq!(embodied.world_move_dir(0, forward), forward);
        assert_eq!(embodied.world_move_dir(0, left), left);

        // A quarter turn takes body-forward to world-left, exactly.
        embodied.body_yaw[0].angle = Angle::QUARTER;
        assert_eq!(embodied.world_move_dir(0, forward), Vec2::new(Fx::ZERO, Fx::ONE));
        assert_eq!(embodied.world_move_dir(0, left), Vec2::new(-Fx::ONE, Fx::ZERO));

        // The articulated reading is unchanged at every yaw, which is the guard.
        for yaw_raw in [0u16, 16_384, 32_768, 49_152] {
            articulated.body_yaw[0].angle = Angle::from_raw(yaw_raw);
            assert_eq!(articulated.world_move_dir(0, forward), forward);
            assert_eq!(articulated.world_move_dir(0, left), left);
        }
    }

    /// The whole point of the session, measured through the actual tick rather
    /// than through the conversion: hold one bearing, turn the body a quarter,
    /// and the embodied arm comes round with it while the articulated one does
    /// not.
    ///
    /// Bounded from **both** sides. The embodied arm must arrive within a
    /// sixteenth of a turn of the torso and the articulated one must stay within
    /// a sixteenth of where it started, so neither a body that failed to turn
    /// nor an arm that spun freely could pass.
    #[test]
    fn turning_the_body_carries_the_hand_with_it_at_a_held_bearing() {
        let held = ArmTarget {
            bearing: Angle::ZERO,
            height: crate::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        let drive = |scenario: Scenario| -> (Angle, Angle) {
            let mut world = World::new(&scenario, 1);
            let id = world.alive_ids(Faction::Heroes)[0];
            let command = ArticulatedCommandV1 {
                move_dir: Vec2::ZERO,
                body_yaw: Angle::QUARTER,
                intent: Intent::Hold,
                arms: [held; 2],
                grips: [GripRequest::Keep; 2],
                releases: [ReleaseRequest::Keep; 2],
            };
            for _ in 0..400 {
                match world.combat_model.command_grammar() {
                    CommandGrammar::Embodied => {
                        world.submit_embodied_v1(id, crate::EmbodiedCommandV1::new(command));
                    }
                    _ => {
                        world.submit_articulated_v1(id, command);
                    }
                }
                world.step();
            }
            (world.body_yaw[0].angle, world.arms[0][1].bearing)
        };

        let sixteenth = 4_096i32;
        let (embodied_yaw, embodied_arm) = drive(Scenario::embodied_duel());
        let (articulated_yaw, articulated_arm) = drive(Scenario::articulated_duel());

        assert!(embodied_yaw.delta(Angle::QUARTER).abs() < sixteenth,
                "the embodied body did not reach its commanded yaw: {embodied_yaw:?}");
        assert!(articulated_yaw.delta(Angle::QUARTER).abs() < sixteenth,
                "the articulated body did not reach its commanded yaw: {articulated_yaw:?}");

        assert!(embodied_arm.delta(Angle::QUARTER).abs() < sixteenth,
                "the embodied arm did not follow the torso: {embodied_arm:?}");
        assert!(articulated_arm.delta(Angle::ZERO).abs() < sixteenth,
                "the articulated arm followed the torso, and it must not: {articulated_arm:?}");
    }

    /// The 2026-08-16 shield-normal amendment survives the frame change: the
    /// plate's facing follows the **arm that carries it**, and after this
    /// session that arm is one the torso can turn.
    #[test]
    fn the_shield_normal_still_follows_the_arm_that_carries_it() {
        for scenario in [Scenario::articulated_duel(), Scenario::embodied_duel()] {
            let mut world = World::new(&scenario, 1);
            let id = world.alive_ids(Faction::Heroes)[0];
            for _ in 0..120 {
                let command = ArticulatedCommandV1 {
                    move_dir: Vec2::ZERO,
                    body_yaw: Angle::QUARTER,
                    intent: Intent::Hold,
                    arms: [ArmTarget {
                        bearing: Angle::ZERO,
                        height: crate::CombatHeight::MID,
                        reach: Fx::HALF,
                        effort: Fx::ONE,
                    }; 2],
                    grips: [GripRequest::Keep; 2],
                    releases: [ReleaseRequest::Keep; 2],
                };
                match world.combat_model.command_grammar() {
                    CommandGrammar::Embodied => {
                        world.submit_embodied_v1(id, crate::EmbodiedCommandV1::new(command));
                    }
                    _ => {
                        world.submit_articulated_v1(id, command);
                    }
                }
                world.step();
            }
            let Some(shield) = world.shield_pose[0] else { continue };
            let carrying = world.arms[0][0].bearing;
            assert_eq!(shield.normal,
                       Vec3::new(carrying.cos(), carrying.sin(), Fx::ZERO),
                       "{}: the plate stopped facing where its arm points", scenario.name);
        }
    }

    /// The two digests must **not** agree, and the reason is the point: one
    /// carries `CombatModel::Embodied` in its prefix and reports the
    /// `EmbodiedV1` domain, so comparing them is a grammar mismatch rather than
    /// two numbers that happen to differ.
    #[test]
    fn an_embodied_digest_is_not_an_articulated_one_even_on_an_identical_fight() {
        let articulated = World::new(&Scenario::articulated_duel(), 7);
        let embodied = World::new(&Scenario::embodied_duel(), 7);
        assert_eq!(articulated.state_digest().domain, crate::HashDomain::ArticulatedV1);
        assert_eq!(embodied.state_digest().domain, crate::HashDomain::EmbodiedV1);
        assert_ne!(articulated.state_digest().value, embodied.state_digest().value);
    }

    /// A control that cannot honour a request refuses it **by name** and
    /// returns the refusal, so a test can assert the sentence rather than read
    /// a log for it.
    #[test]
    fn an_articulated_world_refuses_submit_embodied_by_name() {
        let mut articulated = World::new(&Scenario::articulated_duel(), 1);
        let id = articulated.alive_ids(Faction::Heroes)[0];
        let command = crate::EmbodiedCommandV1::new(scripted_embodied(0, 0));
        assert_eq!(
            articulated.submit_embodied_v1(id, command),
            crate::SubmitEmbodiedOutcome::NotStored(CommandReject::WrongModel),
        );
        assert!(articulated.articulated_command[0].is_none(), "a refused command was stored");
    }

    #[test]
    fn an_embodied_world_refuses_submit_articulated_by_name() {
        let mut embodied = World::new(&Scenario::embodied_duel(), 1);
        let id = embodied.alive_ids(Faction::Heroes)[0];
        assert_eq!(
            embodied.submit_articulated_v1(id, scripted_embodied(0, 0)),
            SubmitArticulatedOutcome::NotStored(CommandReject::WrongModel),
        );
        assert!(embodied.articulated_command[0].is_none(), "a refused command was stored");
    }

    /// The legacy surface stays legacy-only, and an embodied world is refused
    /// by the same predicate that refuses an articulated one.
    #[test]
    fn an_embodied_world_refuses_every_legacy_mutator() {
        let mut embodied = World::new(&Scenario::embodied_duel(), 1);
        let id = embodied.alive_ids(Faction::Heroes)[0];
        let before = embodied.state_digest().value;
        embodied.submit(id, Command::HOLD);
        embodied.face_legacy(id, Angle::QUARTER);
        assert!(!embodied.set_loadout(id, crate::Loadout::single(ActionKind::Punch)));
        assert!(!embodied.set_body(id, Body::Brute));
        assert_eq!(embodied.state_digest().value, before);
    }

    /// The fingerprint separates the two fixtures, and by **two** things rather
    /// than one: the name bytes and the model word. The plan that proposed this
    /// session said the model was not in the fingerprint. It is, and this is
    /// what measures that rather than restating it.
    #[test]
    fn the_embodied_fixture_fingerprints_apart_from_the_articulated_one() {
        let articulated = Scenario::articulated_duel();
        let embodied = Scenario::embodied_duel();
        assert_ne!(articulated.fingerprint(), embodied.fingerprint());

        let mut renamed = articulated.clone();
        renamed.name = embodied.name.clone();
        assert_ne!(renamed.fingerprint(), embodied.fingerprint(),
                   "the model word is not in the fingerprint after all");

        let mut remodelled = articulated.clone();
        remodelled.combat_model = crate::CombatModel::Embodied;
        assert_ne!(remodelled.fingerprint(), embodied.fingerprint(),
                   "the name bytes are not in the fingerprint after all");
    }

    /// A predicate is only worth having if it agrees with the columns it names,
    /// so both of these assert it against a **built world** rather than against
    /// the enum. Asserting `Legacy.has_articulated_columns() == false` would
    /// restate the function body; asserting that the world it built left those
    /// columns empty is the claim.
    #[test]
    fn a_legacy_world_answers_no_to_every_articulated_column_predicate() {
        let world = duel_world();
        let model = world.combat_model();
        assert!(!model.has_articulated_columns());
        assert!(!model.uses_contact_solver());
        assert_eq!(model.command_grammar(), CommandGrammar::Legacy);

        assert!(!world.alive.is_empty(), "an empty world would satisfy this vacuously");
        assert!(world.contact.is_none(), "no contact runtime");
        for (name, len) in [
            ("body_yaw", world.body_yaw.len()), ("arms", world.arms.len()),
            ("grips", world.grips.len()), ("shield_pose", world.shield_pose.len()),
            ("move_authority", world.move_authority.len()),
            ("turn_authority", world.turn_authority.len()),
            ("arm_authority", world.arm_authority.len()), ("wounds", world.wounds.len()),
        ] {
            assert_eq!(len, 0, "a legacy world allocated `{name}`");
        }
    }

    #[test]
    fn an_articulated_world_answers_yes_to_every_articulated_column_predicate() {
        let world = World::new(&Scenario::articulated_duel(), 1);
        let model = world.combat_model();
        assert!(model.has_articulated_columns());
        assert!(model.uses_contact_solver());
        assert_eq!(model.command_grammar(), CommandGrammar::Articulated);

        let bodies = world.alive.len();
        assert!(bodies > 0, "an empty world would satisfy this vacuously");
        assert!(world.contact.is_some(), "no contact runtime");
        for (name, len) in [
            ("body_yaw", world.body_yaw.len()), ("arms", world.arms.len()),
            ("grips", world.grips.len()), ("shield_pose", world.shield_pose.len()),
            ("move_authority", world.move_authority.len()),
            ("turn_authority", world.turn_authority.len()),
            ("arm_authority", world.arm_authority.len()), ("wounds", world.wounds.len()),
        ] {
            assert_eq!(len, bodies, "an articulated world is missing `{name}`");
        }
    }

    /// The property the table exists for: a phase that runs without a trace
    /// entry cannot be written, because the loop dispatches on the same string
    /// it records. Asserting it against `phases()` rather than against a third
    /// literal is the point -- a third literal could drift like the first two.
    #[test]
    fn the_phase_table_and_the_phase_trace_cannot_disagree() {
        for scenario in [Scenario::duel(), Scenario::articulated_duel()] {
            let mut world = World::new(&scenario, 1);
            let expected: Vec<&'static str> = PROLOGUE.iter()
                .chain(model_phases(world.combat_model))
                .chain(EPILOGUE)
                .map(|&(name, _)| name)
                .collect();
            world.phase_trace_enabled = true;
            world.step();
            assert_eq!(world.phase_trace, expected, "{}", scenario.name);
            // Twice, because the trace accumulates: a second tick must append a
            // second identical run rather than a shorter or a reordered one.
            world.step();
            assert_eq!(world.phase_trace.len(), expected.len() * 2, "{}", scenario.name);
            assert_eq!(&world.phase_trace[expected.len()..], &expected[..], "{}", scenario.name);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn rejected_grip_transaction_preserves_recoil_byte_exact() {
        let mut world = World::new(&Scenario::articulated_duel(), 0);
        world.arms[0][0].post_contact_active = true;
        world.arms[0][0].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(5), Fx::from_raw(7), Fx::from_raw(-11));
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3));
        let before = world.arms[0]; let grips = world.grips[0];
        let mut invalid = world.neutral_articulated(0);
        invalid.grips = [GripRequest::Release, GripRequest::EquipSlot(1)];
        assert!(matches!(world.submit_articulated_v1(world.id_of(0), invalid),
            SubmitArticulatedOutcome::Stored { rejection: Some(_), .. }));
        world.apply_articulated_grips();
        assert_eq!((world.arms[0], world.grips[0]), (before, grips));
    }

    #[test]
    fn legacy_worlds_have_no_contact_state_or_schedule_phase() {
        let mut world = duel_world();
        assert!(world.contact.is_none(), "a legacy world allocated contact state");
        assert!(world.contact_resolutions().is_empty());
        assert_eq!(world.contact_cap_hits(), 0);
        // Reserving is an exact no-op here, and deliberately so even past the
        // articulated ceiling: a legacy world has nothing to reserve, so it has
        // nothing to refuse either, and a host that reserves unconditionally
        // must not have to know which model it is holding.
        assert_eq!(world.try_reserve_contact_slots(4_096), Ok(()));
        assert!(world.contact.is_none());
        world.phase_trace_enabled = true;
        world.step();
        assert!(!world.phase_trace.iter().any(|phase| phase.contains("contact")),
                "a legacy tick scheduled a contact phase");
        assert!(world.contact.is_none(), "a legacy tick created contact state");
    }

    #[test]
    fn contact_scratch_grows_only_with_allocated_high_water() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let reserved = world.contact_capacities();
        assert!(reserved.iter().all(|capacity| *capacity > 0), "construction reserved nothing");

        world.step();
        assert_eq!(world.contact_capacities(), reserved, "a tick grew contact scratch");

        // Reusing a dead slot raises no high water, so it must reserve nothing.
        // That is the property the free list buys and the one a browser holding
        // typed-array views is relying on.
        world.alive[1] = false;
        world.free.push(1);
        let respawn = scenario.units[1];
        world.try_spawn(&respawn).expect("respawn into the dead slot");
        assert_eq!(world.alive.len(), 2, "a reused slot allocated a column");
        assert_eq!(world.contact_capacities(), reserved, "a reused slot grew contact scratch");

        // A genuinely new slot is the one thing allowed to grow them.
        world.try_spawn(&respawn).expect("spawn a third row");
        assert_eq!(world.alive.len(), 3);
        assert_ne!(world.contact_capacities(), reserved, "a new high water reserved nothing");
    }

    #[test]
    fn invalid_dynamic_contact_capacity_fails_before_spawn_mutates() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let row = scenario.units[1];
        for _ in world.alive.len()..crate::MAX_ARTICULATED_ENTITIES {
            world.try_spawn(&row).expect("a row inside the ceiling");
        }
        assert_eq!(world.alive.len(), crate::MAX_ARTICULATED_ENTITIES);

        let digest = world.state_digest().value;
        let capacities = world.contact_capacities();
        let resolutions = world.contact_resolutions().len();
        assert_eq!(world.try_spawn(&row).unwrap_err(),
                   SpawnError::Contact(ContactCapacityError::EntityLimit));
        // Nothing authoritative moved. Capacity is not on that list -- the
        // reservation sequence is not atomic and the contract says so -- but
        // here the refusal happens before any reserve, so it did not move
        // either.
        assert_eq!(world.alive.len(), crate::MAX_ARTICULATED_ENTITIES);
        assert_eq!(world.state_digest().value, digest);
        assert_eq!(world.contact_capacities(), capacities);
        assert_eq!(world.contact_resolutions().len(), resolutions);
    }

    #[test]
    fn geometry_envelope_rejects_before_world_or_spawn_mutation() {
        // `Fx::MIN` is the case the arena bound alone would wave through: arena
        // settling would later have clamped it, so only checking the row as
        // handed over catches it.
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::new(Fx::MIN, Fx::ZERO);
        // `.err()` rather than `unwrap_err()`: `World` is deliberately not
        // `Debug`, and the failure is the whole point of this call anyway.
        assert_eq!(World::try_new(&scenario, 1).err(),
                   Some(WorldBuildError::Contact(ContactCapacityError::GeometryEnvelope)));

        // And the reach, not just the origin: 256 is inside the envelope on its
        // own and outside it once the body's own arm is added.
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let mut row = scenario.units[1];
        row.spawn = Vec2::from_ints(256, 0);
        let digest = world.state_digest().value;
        assert_eq!(world.try_spawn(&row).unwrap_err(),
                   SpawnError::Contact(ContactCapacityError::GeometryEnvelope));
        assert_eq!(world.alive.len(), 2, "a refused spawn allocated a column");
        assert_eq!(world.state_digest().value, digest);
    }

    #[test]
    fn wrong_model_and_stale_subjects_are_not_stored_or_recorded() {
        let mut legacy = duel_world();
        let before = legacy.state_hash();
        assert_eq!(
            legacy.submit_articulated_v1(EntityId::new(0, 0), articulated_command()),
            SubmitArticulatedOutcome::NotStored(CommandReject::WrongModel)
        );
        assert_eq!(legacy.state_hash(), before);

        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let before = world.state_digest().value;
        assert_eq!(
            world.submit_articulated_v1(EntityId::new(0, 9), articulated_command()),
            SubmitArticulatedOutcome::NotStored(CommandReject::StaleEntity)
        );
        assert_eq!(world.state_digest().value, before);
    }

    #[test]
    fn legacy_policy_command_and_submission_shapes_remain_unchanged() {
        let mut legacy = duel_world();
        let id = EntityId::new(0, 0);
        let command = Command::moving(Vec2::X);
        legacy.submit(id, command);
        assert_eq!(legacy.command[0], command);

        let scenario = Scenario::articulated_duel();
        let mut articulated = World::new(&scenario, 1);
        articulated.submit(id, command);
        assert_eq!(articulated.command[0], Command::HOLD);
        assert_eq!(articulated.articulated_command[0], None);
    }

    #[test]
    fn invalid_range_or_equipment_replaces_the_whole_command_atomically() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let hero = EntityId::new(0, 0);
        let mut bad = articulated_command();
        bad.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        match world.submit_articulated_v1(hero, bad) {
            SubmitArticulatedOutcome::Stored { command, rejection } => {
                assert_eq!(rejection, Some(CommandReject::OutOfRange(crate::CommandField::LeftReach)));
                assert_eq!(command, world.neutral_articulated(0));
            }
            other => panic!("invalid live command was not replaced: {other:?}"),
        }

        let mut equip = articulated_command();
        equip.grips = [GripRequest::EquipSlot(1), GripRequest::Keep];
        assert!(matches!(
            world.submit_articulated_v1(hero, equip),
            SubmitArticulatedOutcome::Stored { command, rejection: None } if command == equip
        ));

        let mut twice_bad = articulated_command();
        twice_bad.move_dir.x = Fx::from_raw(Fx::ONE.raw() + 1);
        twice_bad.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        assert!(matches!(
            world.submit_articulated_v1(hero, twice_bad),
            SubmitArticulatedOutcome::Stored {
                rejection: Some(CommandReject::OutOfRange(crate::CommandField::MoveX)), ..
            }
        ));
        equip.grips[0] = GripRequest::EquipSlot(7);
        assert!(matches!(
            world.submit_articulated_v1(hero, equip),
            SubmitArticulatedOutcome::Stored {
                rejection: Some(CommandReject::MissingEquipment { arm: LimbSlot::LeftArm, slot: 7 }), ..
            }
        ));
    }

    #[test]
    fn immutable_bindings_accept_only_the_arm_that_physically_holds_the_item() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        for (id, grips) in [
            (fighter, [GripRequest::Keep, GripRequest::EquipSlot(0)]),
            (fighter, [GripRequest::EquipSlot(1), GripRequest::Keep]),
            (brute, [GripRequest::Keep, GripRequest::EquipSlot(0)]),
        ] {
            let mut command = articulated_command();
            command.grips = grips;
            assert!(matches!(world.submit_articulated_v1(id, command),
                SubmitArticulatedOutcome::Stored { command: stored, rejection: None } if stored == command));
        }
        for (id, grips, arm, slot) in [
            (fighter, [GripRequest::EquipSlot(0), GripRequest::Keep], LimbSlot::LeftArm, 0),
            (fighter, [GripRequest::Keep, GripRequest::EquipSlot(1)], LimbSlot::LeftArm, 1),
            (brute, [GripRequest::EquipSlot(0), GripRequest::Keep], LimbSlot::LeftArm, 0),
        ] {
            let mut command = articulated_command();
            command.grips = grips;
            assert!(matches!(world.submit_articulated_v1(id, command),
                SubmitArticulatedOutcome::Stored {
                    command: stored,
                    rejection: Some(CommandReject::MissingEquipment { arm: rejected_arm, slot: rejected_slot }),
                } if stored == world.neutral_articulated(id.index as usize) && rejected_arm == arm && rejected_slot == slot));
        }
    }

    #[test]
    fn a_test_only_both_binding_requires_matching_same_slot_requests() {
        let mut scenario = Scenario::articulated_duel();
        let mut both = crate::club();
        both.id = 4;
        both.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(both);
        scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(4), None];
        let mut world = World::new(&scenario, 1);
        let brute = EntityId::new(1, 0);
        let mut command = articulated_command();
        command.grips = [GripRequest::EquipSlot(0); 2];
        assert!(matches!(world.submit_articulated_v1(brute, command), SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        command.grips = [GripRequest::Release, GripRequest::Keep];
        assert!(matches!(world.submit_articulated_v1(brute, command), SubmitArticulatedOutcome::Stored {
            rejection: Some(CommandReject::MissingEquipment { arm: LimbSlot::RightArm, slot: 0 }), ..
        }));
    }

    #[test]
    fn a_stationary_articulated_body_can_store_a_turn_request() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let command = articulated_command();
        let before = world.state_digest().value;
        assert!(matches!(
            world.submit_articulated_v1(EntityId::new(0, 0), command),
            SubmitArticulatedOutcome::Stored { command: stored, rejection: None } if stored == command
        ));
        assert_ne!(world.state_digest().value, before);
        assert_eq!(world.view(EntityId::new(0, 0)).unwrap().facing, Angle::ZERO);
    }

    #[test]
    fn dead_allocated_slots_retain_their_articulated_command() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let command = articulated_command();
        let _ = world.submit_articulated_v1(EntityId::new(0, 0), command);
        world.hp[0] = Fx::ZERO;
        world.reap_dead();
        assert!(!world.alive[0]);
        assert_eq!(world.articulated_command[0], Some(command));
        let retained = world.state_digest().value;
        world.articulated_command[0] = None;
        assert_ne!(world.state_digest().value, retained, "a dead slot's retained bytes were not hashed");
        world.articulated_command[0] = Some(command);
        let replacement = world.spawn(&scenario.units[0]);
        assert_eq!(replacement, EntityId::new(0, 1));
        assert_eq!(world.articulated_command[0], None);
    }

    #[test]
    fn set_stats_preserves_the_health_fraction() {
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        w.hp[h] = w.max_hp[h] * Fx::HALF;

        // Up. The bar gets longer and the fighter does not get healthier: a
        // vitality dial that handed out a full bar would be a heal button
        // wearing an attribute's name.
        let mut stats = w.stats(hero).unwrap();
        stats.vitality += 10;
        assert!(w.set_stats(hero, stats));
        assert_eq!(w.max_hp[h], stats.max_hp(), "the bar did not follow vitality");
        assert!(
            w.max_hp[h] > Body::Fighter.base_stats().max_hp(),
            "the bar never grew, so this proves nothing"
        );
        assert_eq!(w.legacy_hp_frac(h), Fx::HALF, "{} of {}", w.hp[h], w.max_hp[h]);

        // And down, which is the direction that can kill. It must not.
        stats.vitality = 1;
        assert!(w.set_stats(hero, stats));
        assert_eq!(w.max_hp[h], stats.max_hp());
        assert_eq!(w.legacy_hp_frac(h), Fx::HALF, "{} of {}", w.hp[h], w.max_hp[h]);
        assert!(w.hp[h].is_positive(), "lowering vitality killed a fighter");
        assert!(w.is_alive(hero));

        // The decision clock is left where it was; `submit` re-derives it from
        // the new period on the next decision, and that one beat of lag is the
        // point rather than an oversight.
        stats.intellect = 19;
        let before = w.next_decision[h];
        assert!(w.set_stats(hero, stats));
        assert_eq!(w.next_decision[h], before, "set_stats moved the clock");
    }

    #[test]
    fn set_stats_is_refused_for_a_stale_handle() {
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        // The control: while the handle resolves, both are honoured.
        assert!(w.set_stats(hero, Body::Rogue.base_stats()));
        assert!(w.set_body(hero, Body::Rogue));

        w.hp[h] = Fx::ZERO;
        w.step();
        assert!(!w.is_alive(hero), "the fighter survived being zeroed");

        assert_eq!(w.stats(hero), None);
        assert!(
            !w.set_stats(hero, Body::Brute.base_stats()),
            "a dead handle rewrote the attributes of whoever inherits its slot"
        );
        assert!(!w.set_body(hero, Body::Brute));
        assert!(!w.set_stats(EntityId::NONE, Body::Brute.base_stats()));
        assert!(!w.set_body(EntityId::NONE, Body::Brute));
        // Nothing leaked into the slot the corpse left behind.
        assert_eq!(w.stats[h], Body::Rogue.base_stats());
    }

    #[test]
    fn set_body_moves_a_grown_body_out_of_the_wall() {
        // Hard against the west wall at exactly its own radius, which is where
        // `move_body` would have left it and therefore a legal place to stand.
        let mut scenario = Scenario::duel();
        scenario.units[0].set_body(Body::Skitterer);
        scenario.units[0].spawn = Vec2::new(Body::Skitterer.radius(), Fx::from_int(8));
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        assert!(
            w.pos[h].x < Body::Brute.radius(),
            "the body did not start inside the Brute it is about to become, \
             so nothing here is being tested"
        );

        assert!(w.set_body(hero, Body::Brute));
        let r = w.radius[h];
        assert_eq!(r, Body::Brute.radius());
        assert!(
            w.pos[h].x >= r && w.pos[h].x <= w.arena.x - r,
            "a promoted body was left in the masonry at {:?}",
            w.pos[h]
        );
        assert!(w.pos[h].y >= r && w.pos[h].y <= w.arena.y - r, "{:?}", w.pos[h]);
    }

    #[test]
    fn set_body_resets_the_loadout() {
        // The half-change `UnitSpec::set_body` warns about, through a live
        // world: promote the archer and it is holding a Brute's kit, not a
        // Skitterer's bow on the end of a Brute's arm.
        let mut scenario = Scenario::duel();
        scenario.units[0].set_body(Body::Skitterer);
        scenario.units[0].loadout = Loadout::single(ActionKind::Bow);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        assert_eq!(w.held(hero), Some((0, ActionKind::Bow)));

        assert!(w.set_body(hero, Body::Brute));
        assert_eq!(w.loadout(hero), Some(Body::Brute.default_loadout()));
        assert_eq!(w.held(hero), Some((0, Body::Brute.default_action())));
        assert_eq!(w.stats(hero), Some(Body::Brute.base_stats()));
        // And the cached halves moved with it. A `kind` that walked off on its
        // own is exactly the failure this method exists to make impossible.
        assert_eq!(w.kind[h], Body::Brute);
        assert_eq!(w.radius[h], Body::Brute.radius());
        assert_eq!(w.mass[h], Body::Brute.mass());
        assert_eq!(w.max_hp[h], Body::Brute.base_stats().max_hp());
    }
}
