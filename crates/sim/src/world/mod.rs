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
    validate_core, ArmTarget, CommandCoreV1, CommandReject, GripRequest,
    Intent, LimbSlot, Objective, Order, ReleaseRequest,
};
use crate::action::{ActionKind, ActionSpec};
use crate::dungeon::{Door, Dungeon};
use crate::loadout::Loadout;
use crate::entity::{EntityId, Faction, Body};
use crate::event::Event;
use crate::hand::Hand;
use crate::obs::{Observation, ObservedArm, ObservedOpponent,
                 ObservedOpponentStance, ObservedShield, ObservedStance,
                 MAX_OPPONENTS};
use crate::pose::{AnimationHint, Pose, PosedArm};
use crate::rules::{self, Stats, MAX_CONTACTS};
use crate::scenario::{Scenario, UnitSpec};
use crate::anatomy::{self, AnatomyState, BodyPart};
use crate::combat::spec::{UnitSpecV1, BodyAnatomySpec, CombatSpecError,
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
                                exact_held_velocity, normalize_momentum,
                                normalize_position};
#[cfg(all(test, feature = "cartesian-recoil"))]
use crate::combat::trajectory::{advance_exact, apply_exact_group, evaluate_exact};
use crate::{EquipmentGeometry, EquipmentSpecId};
use fx::{Angle, Fx, Hash64, Rng, Vec2, Vec3};

mod query;
mod hash;
mod movement;
mod navigation;
mod articulated;
mod self_collision;
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
    pub const ANATOMICAL_CONSTRAINT: u8 = 64;
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
    combat_specs: Option<CombatSpecTableV1>,
    combat_units: Vec<UnitSpecV1>,
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
    limb: Vec<Hand>,
    /// What each unit brought. See `crate::Loadout`.
    loadout: Vec<Loadout>,
    /// Which loadout slot is in hand. Always `0` until the swap lands.
    slot: Vec<u8>,
    next_decision: Vec<u32>,
    /// The last accepted submitted command, and now the only one a body has.
    ///
    /// It used to sit beside a legacy `command` column and was deliberately
    /// separate from it, so that an inert articulated world could not change a
    /// legacy tick or hash by merely existing. That column is gone: nothing
    /// could write it once the legacy grammar and `submit` went, so it held
    /// `Command::HOLD` for every body of every fight and hashed it every tick.
    /// The isolation argument retired with the thing it isolated from.
    ///
    /// It carries the articulated *half* of an embodied command too; the
    /// embodied-only half lives in [`World::elbow_plane`]. See
    /// [`World::submit`] for why the split happened where it did.
    command_core: Vec<Option<CommandCoreV1>>,
    body_anatomy: Vec<Option<u16>>,
    body_carried: Vec<[Option<u16>; 2]>,
    body_equipment: Vec<[Option<u16>; 2]>,
    body_yaw: Vec<BodyYawState>,
    /// The legs.
    ///
    /// One row per allocated slot, allocated unconditionally now that there is
    /// one body model. It was empty for the two models without hips, and the
    /// guard that emptied it is gone with them -- what the guard bought was that
    /// a model could not pay for a mechanic it did not have, and there is no
    /// longer a model that does not have this one.
    stance: Vec<StanceState>,
    /// The commanded and held elbow plane, per arm.
    ///
    /// Allocated on [`World::stance`]'s terms and for its reason.
    ///
    /// **This is the column the embodied command was always going to need**, and
    /// it is one column rather than two because commanded and held are the same
    /// fact at two times -- splitting them would put a request and a pose in
    /// different rows and let one be updated without the other.
    elbow_plane: Vec<[ElbowPlaneState; 2]>,
    arms: Vec<[ArmState; 2]>,
    /// Last attempted owner constraint, excluded from every authoritative hash.
    self_collision_attempt: Vec<Option<crate::diagnostics::SelfCollisionAttemptDiagnostic>>,
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
    /// The health authority, one row per allocated slot, and since `hp` and
    /// `max_hp` went there is no other. This used to say "empty in every Legacy
    /// world, which is what keeps `hp`, `max_hp` and `regen_left` the only
    /// health there is over there": there is no over there any more, and the
    /// two columns that sentence pointed at are gone. `regen_left` survives
    /// them because it is a *budget* that the hashed stream carries, not a
    /// second answer to how hurt a body is.
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
    //
    // **There were two of these stores and the elder one held nothing.** Nine
    // `shot_*` columns outlived the grammar that loosed into them, so they were
    // allocated empty and stayed empty, while `legacy_core_hash` wrote their
    // length word unconditionally on every tick of every fight -- a fingerprint
    // over a table nothing could put an arrow in. Nothing outside that hash read
    // them. They are gone; the store below, which is what an
    // `ARTICULATED_PROJECTILE` row publishes from, is the one that has been
    // carrying the arrows.
    projectile_alive: Vec<bool>,
    projectile_generation: Vec<u32>,
    projectile_pos: Vec<Vec3>,
    projectile_vel: Vec<Vec3>,
    projectile_range: Vec<Fx>,
    projectile_radius: Vec<Fx>,
    projectile_mass: Vec<Fx>,
    projectile_owner: Vec<EntityId>,
    projectile_faction: Vec<Faction>,
    projectile_free: Vec<u32>,

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

    // **The navigation flow field stood here and is gone.** `nav` was one route
    // field per faction per door capability, `nav_queue` and `nav_seeds` were
    // its search scratch, and `refresh_nav` rebuilt all of it in the epilogue of
    // every tick of every fight. Its four readers -- `nav_arm`,
    // `reachable_point`, `nav_goal_point` and `nav_step` -- had no production
    // caller: the two policy adapters that consumed a heading went with the
    // legacy seam, `Observation` has no navigation column, and
    // `crates/web`'s `set_goto`, `set_focus` and `clear_order` exports were
    // already deleted, so nothing left in the repository could ask for a route.
    // It cost a full breadth-first search over the floor, per faction, per tick,
    // for an answer nobody collected.
    //
    // Deleting it moved no pin, and that is a property of where it sat rather
    // than luck: the field was **not hashed** (see the note that stood on `Nav`,
    // reproduced by `World::set_order`), being a derivation of the floor plan
    // and the objectives, both of which are. `orders` and `objectives` stay --
    // they are inputs a host sets and the state stream carries.

    // Per-tick scratch. Held on the world so the tick loop allocates once for
    // the life of the fight rather than once per tick. Always empty by the time
    // anything can observe the world, so none of it enters `state_hash`.
    //
    // Four more rows stood here -- `blows`, `pierces`, `impulses` and
    // `prop_impacts` -- with the four deferred-event types they carried. The
    // collect-then-apply arrangement they existed for was the legacy swing
    // resolver's, and the contact solver defers its own writes through
    // `ContactRuntime`, so nothing had pushed to any of the four for some time.
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
pub(crate) struct PoseTestView {
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

/// Retained contact state for an Articulated world.
///
/// `state` and the feature-only exact external-energy rows are authoritative:
/// ArticulatedV1 hashing writes `cap_hits` and those reconciliation rows. The
/// remaining scratch and published resolutions are evidence, which is why the
/// whole struct sits outside `legacy_core_hash`.
///
/// Reserved once against the allocated-slot high water, and the reason is the
/// one this crate holds everywhere: it is driven from a page holding typed-array
/// views into linear memory, and a `Vec` that grows can grow that memory and
/// detach every one of them. The navigation search's `nav_queue` was the other
/// column held for that reason, and went with the flow field.
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
    /// Evidence for [`World::pose`]'s `Recoiling` hint and nothing
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
    InitialSelfOverlap,
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
    InitialSelfOverlap,
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
            SpawnError::InitialSelfOverlap => WorldBuildError::InitialSelfOverlap,
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
    body_mass_raw: i32, table: &CombatSpecTableV1, unit: UnitSpecV1,
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
    row: UnitSpecV1,
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
    row: UnitSpecV1,
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
    // Dressing was part of the legacy dungeon feature set, and this was the one
    // model question in the crate that none of the predicates answered. The
    // predicates are gone; the question was never theirs, so it is still here.
    //
    // **Nothing is dressed now, and that is a measured gap rather than a
    // decision.** Of the three things a prop does, one dies with the legacy
    // model and two do not. Breaking one was a sweep of the *legacy* blade
    // against a prop circle and has no successor. But barrel and pottery
    // collision runs for any body, through `World::settle`, and web and water
    // slowing is model-independent code that only the legacy movement phase
    // happened to call. So generating props here would stand unbreakable
    // furniture on the floor, and not generating them costs two behaviours that
    // work. `world/props.rs` carries the whole argument; ungating this is one
    // line on the day a prop is a collider the contact solver sweeps.
    let dressed = false;
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
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ProjectileView {
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
type ArmRates = actuator::ArmRateProfile;

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

// A third row, `("navigation", |w, _| w.refresh_nav())`, stood here and every
// model scheduled it unconditionally. It rebuilt a route field nothing read; the
// note where the `nav` columns were declared has the argument.
const EPILOGUE: &[Phase] = &[
    ("increment tick", |w, _| w.tick += 1),
    ("pending",        |w, _| w.refresh_pending()),
];

/// The body of the tick, in order.
///
/// **This was two tables assembled out of fifteen named `P_` aliases, and the
/// aliases were the price of having two.** `ARTICULATED_PHASES` and
/// `EMBODIED_PHASES` differed in exactly one row -- `stance` where `body yaw`
/// stood -- so the rows were written once and listed twice: a divergence was
/// then a substituted name in a list and an omission a missing name rather than
/// a missing closure. With one model there is nothing to substitute and nothing
/// to diverge from, so the rows are written out once, here, which is what the
/// comment that stood here said would happen.
///
/// `stance` sits where `body yaw` sat, and the slot is not free: everything
/// after it -- grips, arms, geometry, contact -- reads a settled torso, and
/// moving the row would change what those four see rather than what the hips do.
/// `drive_stance` turns the hips and the torso in the order they constrain each
/// other.
///
/// Traced like the legacy arm, and for one specific reason: the contract freezes
/// where contact sits relative to geometry and doors, and a trace is the only
/// way to prove an ordering rather than argue it from a reading order. Naming
/// each row here is what makes a phase without a trace entry unwritable -- the
/// loop dispatches on the same string it records -- and
/// `contact_runs_after_geometry_and_before_doors` spells every name below out as
/// a literal, which is the assertion that would have caught a row lost in the
/// collapse.
const EMBODIED_PHASES: &[Phase] = &[
    ("retain contact entry", |w, _| w.retain_contact_entry()),
    ("apply articulated movement", |w, _| w.apply_movement()),
    ("record contact locomotion", |w, _| w.record_contact_locomotion()),
    ("separate", |w, _| w.separate()),
    ("stance", |w, _| w.drive_stance()),
    ("grips", |w, _| w.apply_grips()),
    ("arms", |w, r| {
        w.drive_arms(r)
    }),
    ("geometry", |w, _| w.derive_geometry()),
    ("loose projectiles", |w, _| w.loose_projectiles()),
    ("contact", |w, _| w.resolve_contact()),
    ("resolve projectiles", |w, _| w.resolve_projectiles()),
    ("anatomy", |w, _| w.settle_anatomy()),
    ("doors", |w, _| w.press_doors()),
    ("reap", |w, _| w.reap_dead_bodies()),
];

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
            scenario.combat_specs.as_ref(),
            &scenario.units,
        ).map_err(WorldBuildError::CombatSpec)?;
        let n = scenario.units.len();
        // `validate_construction` has already proved the table and every row
        // present, so these two lookups cannot fail; they are written as `?`
        // rather than `expect` because the envelope check below is the one place
        // a malformed reference would be caught silently.
        let table = scenario.combat_specs.as_ref()
            .ok_or(WorldBuildError::CombatSpec(CombatSpecError::MissingTable))?;
        let arena = scenario.arena();
        for unit in &scenario.units {
            let row = unit.combat_spec
                .ok_or(WorldBuildError::CombatSpec(CombatSpecError::UnitPresence))?;
            check_contact_envelope(arena, unit.spawn, table, row)
                .map_err(WorldBuildError::Contact)?;
            let facing = match unit.faction {
                Faction::Heroes => Angle::ZERO,
                Faction::Monsters => Angle::HALF,
            };
            if crate::combat::spec::initial_pose_has_forbidden_overlap(table, row, facing)
                .map_err(WorldBuildError::CombatSpec)?
            {
                return Err(WorldBuildError::InitialSelfOverlap);
            }
            #[cfg(feature = "cartesian-recoil")]
            exact_lattice_for_unit(unit.kind.mass().raw(), table, row)
                .map_err(WorldBuildError::ExactLattice)?;
        }
        contact_bounds(n).map_err(WorldBuildError::Contact)?;
        let mut world = World {
            seed,
            combat_specs: scenario.combat_specs.clone(),
            combat_units: scenario.units.iter().filter_map(|unit| unit.combat_spec).collect(),
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
            limb: Vec::with_capacity(n),
            loadout: Vec::with_capacity(n),
            slot: Vec::with_capacity(n),
            next_decision: Vec::with_capacity(n),
            command_core: Vec::with_capacity(n),
            body_anatomy: Vec::with_capacity(n),
            body_carried: Vec::with_capacity(n),
            body_equipment: Vec::with_capacity(n),
            body_yaw: Vec::with_capacity(n),
            stance: Vec::with_capacity(n),
            elbow_plane: Vec::with_capacity(n),
            arms: Vec::with_capacity(n),
            self_collision_attempt: Vec::with_capacity(n),
            grips: Vec::with_capacity(n),
            articulated_release_was: Vec::with_capacity(n),
            #[cfg(feature = "cartesian-recoil")]
            exact_owners: Vec::with_capacity(n),
            shield_pose: Vec::with_capacity(n),
            move_authority: Vec::with_capacity(n),
            turn_authority: Vec::with_capacity(n),
            arm_authority: Vec::with_capacity(n),
            wounds: Vec::with_capacity(n),
            // `Option` rather than a bare runtime, because `resolve_contact`
            // takes the runtime out of the world for the duration of the phase
            // and puts it back -- the empty slot is a borrow, not a model.
            contact: Some(ContactRuntime::default()),
            #[cfg(test)]
            phase_trace_enabled: false,
            #[cfg(test)]
            phase_trace: Vec::new(),
            last_attacker: Vec::with_capacity(n),
            last_combat: Vec::with_capacity(n),
            regen_left: Vec::with_capacity(n),
            damage_dealt: Vec::with_capacity(n),
            projectile_alive: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_generation: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_pos: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_vel: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_range: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_radius: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_mass: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_owner: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_faction: Vec::with_capacity(rules::MAX_SHOTS),
            projectile_free: Vec::with_capacity(rules::MAX_SHOTS),
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
        let exact_scale;
        {
            {
                let row = spec.combat_spec
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::UnitPresence))?;
                let table = self.combat_specs.as_ref()
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::MissingTable))?;
                crate::combat::spec::validate_rows(table, &[row], &[spec.loadout])
                    .map_err(SpawnError::CombatSpec)?;
                let facing = match spec.faction {
                    Faction::Heroes => Angle::ZERO,
                    Faction::Monsters => Angle::HALF,
                };
                if crate::combat::spec::initial_pose_has_forbidden_overlap(table, row, facing)
                    .map_err(SpawnError::CombatSpec)?
                {
                    return Err(SpawnError::InitialSelfOverlap);
                }
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
                self.limb.push(Hand::default());
                self.loadout.push(Loadout::single(ActionKind::Punch));
                self.slot.push(0);
                self.next_decision.push(0);
                self.command_core.push(None);
                self.body_anatomy.push(None);
                self.body_carried.push([None; 2]);
                self.body_equipment.push([None; 2]);
                // Three nested model guards stood here -- articulated columns,
                // then legs, then the elbow plane -- and every one of them now
                // answers the same way for every world that can be built. They
                // are gone rather than left as always-true tests: a guard that
                // cannot be false reads as a column somebody might not have.
                let arm = actuator::tucked_arm(Vec3::ZERO);
                self.body_yaw.push(BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO });
                self.stance.push(StanceState::squared(Angle::ZERO));
                self.elbow_plane.push([ElbowPlaneState::NEUTRAL; 2]);
                self.arms.push([arm; 2]);
                self.self_collision_attempt.push(None);
                self.grips.push([GripState { equipment_slot: None }; 2]);
                self.articulated_release_was.push([ReleaseRequest::Keep; 2]);
                #[cfg(feature = "cartesian-recoil")]
                self.exact_owners.push(None);
                self.shield_pose.push(None);
                self.move_authority.push(Fx::ONE);
                self.turn_authority.push(Fx::ONE);
                self.arm_authority.push([Fx::ONE; 2]);
                self.wounds.push(AnatomyState::EMPTY);
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
        self.next_decision[i] = self.tick;
        self.command_core[i] = None;
        self.body_anatomy[i] = spec.combat_spec.map(|row| row.anatomy);
        self.body_carried[i] = spec.combat_spec.map_or([None; 2], |row| row.equipment);
        self.body_equipment[i] = match (self.combat_specs.as_ref(), spec.combat_spec) {
            (Some(table), Some(row)) => resolved_equipment(table, row).expect("validated combat construction"),
            _ => [None; 2],
        };
        self.self_collision_attempt[i] = None;
        self.initialize_pose(i);
        #[cfg(feature = "cartesian-recoil")]
        {
            self.exact_owners[i] = Some(self.initial_exact_owner(i, exact_scale));
        }
        self.last_attacker[i] = EntityId::NONE;
        self.last_combat[i] = self.tick;
        self.regen_left[i] = max_hp * rules::REGEN_BUDGET;
        self.damage_dealt[i] = Fx::ZERO;
        self.blade_was[i] = None;
        self.blade_p[i] = Fx::ZERO;
        self.id_of(i)
    }

    /// Sets a faction's standing order.
    ///
    /// **Ordered movement is not implemented for the surviving model, and this
    /// is the door that says so.** The order lands in `World::orders`, it is
    /// hashed as an input, and it is recorded in a replay -- and then nothing
    /// consumes it. Two things used to: the legacy observation carried
    /// `nav_dir` and `nav_distance`, and `World::refresh_nav` built the flow
    /// field those two were read off. The observation went with
    /// `CombatModel::Legacy`; the flow field went in this session, because it
    /// was a breadth-first search over the whole floor, per faction, per tick,
    /// for an answer whose last reader had already been deleted.
    ///
    /// So this is an input the simulation carries and no body can perceive, and
    /// it is a capability loss rather than a tidy-up. Giving it a reader again
    /// takes three things, in this order: a navigation column on
    /// [`Observation`] (which is a mechanic -- somebody has to decide
    /// what a jointed body *knows* about a route it has not walked); a route
    /// source to fill it, which means restoring a flow field or replacing it
    /// with something that answers the same question; and a policy that steers
    /// on it. `docs/design/navigation-visibility.md` records what the deleted
    /// field did and what the browser half of the channel looked like before it
    /// was removed, so none of it has to be rediscovered.
    ///
    /// The order channel itself stays because it is an input a host owns: this
    /// method and [`World::set_objective`] are public, the two columns are in
    /// the state stream, and a replay round-trips them.
    pub fn set_order(&mut self, faction: Faction, order: Order) {
        self.orders[faction.index()] = order;
    }

    /// Sets what a faction is trying to reach. Shaped exactly like
    /// [`World::set_order`] because it is the same kind of thing: an input the
    /// sim carries and does not second-guess -- and, like an order, one nothing
    /// currently reads. See [`Objective`] and the note above.
    pub fn set_objective(&mut self, faction: Faction, objective: Objective) {
        self.objectives[faction.index()] = objective;
    }

    /// Rewrites `id`'s attributes.
    ///
    /// Input bookkeeping: the page owns a character's attributes and the sim
    /// only fights with them. Answers `false` for a handle that no longer
    /// resolves, and the `bool` is load-bearing -- `crates/web` calls this from
    /// the attribute dials and the refusal is the half a caller acts on.
    ///
    /// **This used to rescale health to hold the fraction, and the argument for
    /// it is kept because it is still the right answer to the question it was
    /// asked.** It ran: vitality is the only stat that moves the bar's length,
    /// and either obvious alternative is a rule rather than an input -- keeping
    /// the absolute health gifts a full bar to anyone who raises vitality
    /// mid-fight and kills outright anyone who lowers it, while a fighter at
    /// half health is a fighter at half health whatever body it is wearing.
    ///
    /// What retired it is that the bar it rescaled is gone rather than that the
    /// reasoning was wrong. Health is `anatomy::max_health(spec)` scaled by a
    /// regional fraction, and that maximum sums
    /// [`BodyAnatomySpec::integrity_maxima`] and reads no [`Stats`] field at
    /// all -- so vitality does not move the denominator, there is no fraction to
    /// hold, and the rescale was already the identity for every body this model
    /// can construct. Only the writes to `hp` and `max_hp` have gone with the
    /// columns.
    ///
    /// The decision clock is deliberately left alone.
    /// [`World::submit_articulated_v1`] re-derives it from the new
    /// [`Stats::decision_period`] at the very next decision, so a character made
    /// sharper starts thinking faster one beat later -- which is the correct
    /// lag, and a reset here would hand a free out-of-turn decision to anyone
    /// touching the intellect dial mid-swing.
    pub fn set_stats(&mut self, id: EntityId, stats: Stats) -> bool {
        match self.resolve(id) {
            Some(i) => {
                self.stats[i] = stats;
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
        self.step_with_arm_rate_profile(actuator::ArmRateProfile::CURRENT)
    }

    // `pub(crate)` rather than private because a frozen fixture is not always
    // in this file: `exact_diagnostics` and `replay`'s exact tests capture a
    // configuration too, and each of them has to pin the arm rate it was
    // measured at for the same reason `CAPTURED_ARM_RATES` gives below.
    #[allow(dead_code)]
    pub(crate) fn step_with_arm_rates(
        &mut self, bearing_max_speed_raw: i32, bearing_accel_raw: i32,
    ) -> &[Event] {
        self.step_with_arm_rate_profile(actuator::ArmRateProfile {
            bearing_max_speed_raw, bearing_accel_raw, ..actuator::ArmRateProfile::CURRENT
        })
    }

    /// One diagnostic step with a complete arm-rate row.
    ///
    /// Lab uses this only to compare a frozen command transcript against the
    /// current row. The older two-rate seam cannot observe linear or elbow-plane
    /// reachability. This is deliberately absent from every host ABI.
    #[doc(hidden)]
    pub fn step_with_arm_rate_profile(
        &mut self, rates: actuator::ArmRateProfile,
    ) -> &[Event] {
        // The iterator borrows nothing but `&'static` tables, so the body is
        // free to take `&mut self`. It chose the middle table off the world's
        // model until there was one; the property that made that safe is why the
        // schedule is still three `&'static` slices rather than a method.
        for &(name, body) in PROLOGUE.iter().chain(EMBODIED_PHASES).chain(EPILOGUE) {
            #[cfg(test)]
            if self.phase_trace_enabled { self.phase_trace.push(name); }
            #[cfg(not(test))]
            let _ = name;
            body(self, rates);
        }
        &self.events
    }

    /// The arm target the actuator integrates towards, as a **world** bearing.
    ///
    /// A submitted `ArmTarget::bearing` is measured from the torso and this is
    /// one of the two places in the tick that knows it -- `world_move_dir` below
    /// is the other. The stored `ArmState` keeps a world bearing, because that
    /// is what the geometry, the contact phase and the pose publication all
    /// read; storing a relative angle would make the published hand depend on a
    /// yaw every reader had to re-apply.
    ///
    /// The command is relative, the state is absolute, and the conversion
    /// happens once on the way in -- the same shape as the pose module's
    /// world-space conversion on the way out, and for the same reason. The
    /// retired model read the bearing absolutely and took neither branch;
    /// [`crate::CommandV1`] carries what that choice cost and bought.
    fn world_arm_target(&self, i: usize, limb: usize, target: ArmTarget) -> ArmTarget {
        let turned = ArmTarget {
            bearing: self.body_yaw[i].angle + target.bearing,
            ..target
        };
        self.reachable_arm_target(i, limb, turned)
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
        let bearing = crate::combat::limb::rear_limited_bearing(
            self.body_yaw[i].angle,
            target.bearing,
        );
        ArmTarget { bearing, height, reach, ..target }
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
    /// The vector arrives in the body frame, so `W` is `(1, 0)` at every yaw and
    /// the client stops needing to know which way the body faces in order to
    /// drive it. The rotation is the ordinary one: forward is
    /// `(cos yaw, sin yaw)` and left is `(-sin yaw, cos yaw)`.
    fn world_move_dir(&self, i: usize, requested: Vec2) -> Vec2 {
        let yaw = self.body_yaw[i].angle;
        let (cos, sin) = (yaw.cos(), yaw.sin());
        Vec2::new(
            requested.x * cos - requested.y * sin,
            requested.x * sin + requested.y * cos,
        )
    }

    /// Stores one version-1 embodied command, on the same terms.
    ///
    /// **The column is split, and this is the session that split it.** The doc
    /// comment that stood here predicted the shape of the day exactly: the six
    /// articulated fields still go into [`World::command_core`], because
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
    pub fn submit(
        &mut self,
        id: EntityId,
        command: crate::CommandV1,
    ) -> crate::SubmitOutcome {
        use crate::{CommandV1, SubmitOutcome};
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = validate_core(command.core)
            .err()
            .map(CommandReject::OutOfRange)
            .or_else(|| self.resulting_grips(i, command.core.grips).err());
        let stored = match rejection {
            // `new` gives the neutral plane, which is `Angle::ZERO` -- the plane
            // `elbow_point` already defaults to. So a refusal parks the elbow
            // where it was instead of swinging the arm to a plane nobody asked
            // for, which is the same atomicity the rest of the command gets: no
            // field of a rejected request survives, and none of the substitute
            // moves the body either.
            None => command,
            Some(_) => CommandV1::new(self.neutral_core(i)),
        };
        self.command_core[i] = Some(stored.core);
        self.write_commanded_plane(i, stored.swing_plane);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitOutcome::Stored { command: stored, rejection }
    }

    /// Byte-boundary companion for a payload whose raw range validation failed
    /// before an `CommandV1` could be constructed.
    pub fn submit_fallback(
        &mut self,
        id: EntityId,
        field: crate::CommandField,
    ) -> crate::SubmitOutcome {
        use crate::{CommandV1, SubmitOutcome};
        let i = match self.resolve(id) {
            Some(i) => i,
            None => return SubmitOutcome::NotStored(CommandReject::StaleEntity),
        };
        let rejection = CommandReject::OutOfRange(field);
        let stored = CommandV1::new(self.neutral_core(i));
        self.command_core[i] = Some(stored.core);
        // The neutral plane too, and through the same writer: a fallback that
        // wrote the articulated half and left the plane alone would let a
        // refused command's *previous* plane keep steering the elbow, which is
        // exactly the partial acceptance this path exists to prevent.
        self.write_commanded_plane(i, stored.swing_plane);
        self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        SubmitOutcome::Stored { command: stored, rejection: Some(rejection) }
    }

    // ---------------------------------------------------------------- internals

    /// Records what each arm asked its elbow plane to be, leaving `held` alone.
    ///
    /// Both submission paths go through here so there is one place the request
    /// lands. It was guarded against a model with no plane column; every world
    /// that can be built now allocates one, so the guard is gone rather than
    /// left as a test that cannot fail.
    fn write_commanded_plane(&mut self, i: usize, plane: [Angle; 2]) {
        for slot in 0..2 {
            self.elbow_plane[i][slot].commanded = plane[slot];
        }
    }

    /// The command a slot falls back to: no step, no reach, no effort, and the
    /// torso where it already is.
    ///
    /// **"Ahead" is not one number, and this wrote the wrong one.** An arm
    /// bearing is measured *from* the torso and `World::world_arm_target` adds
    /// the yaw back on the way in, so storing `body_yaw` in the bearing asked a
    /// neutral arm for twice it. It was inert, because a neutral command carries
    /// zero effort and the actuator moves nothing without authority, and it was
    /// not invisible: `commanded_targets` publishes the pose this command
    /// names, and a slot nobody had commanded published a target hand a whole
    /// turn off. The retired absolute frame is where the yaw belonged, and it
    /// went with the frame.
    fn neutral_core(&self, i: usize) -> CommandCoreV1 {
        let yaw = self.body_yaw[i].angle;
        let arm = ArmTarget {
            bearing: Angle::ZERO,
            height: crate::CombatHeight::MID,
            reach: Fx::ZERO,
            effort: Fx::ZERO,
        };
        CommandCoreV1 {
            move_dir: Vec2::ZERO,
            // The torso's own world yaw -- a torso measured relative to itself
            // would say nothing -- so this one keeps the yaw where the arm
            // bearing above stopped taking it.
            body_yaw: yaw,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [GripRequest::Keep; 2],
            // A neutral command holds; it does not loose. This is what a slot
            // falls back to when nobody has submitted a command, so a `Loose`
            // here would fire on behalf of every silent policy.
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    /// The immutable anatomy a slot was constructed with.
    ///
    /// `None` used to mean "a Legacy world", which is what routed the health
    /// query back to `hp`. Both are gone: construction ties every body to an
    /// anatomy row, so `None` here now means a slot no validated spawn can
    /// produce, and [`World::health_of`]'s standing `debug_assert!` is what
    /// says so.
    fn anatomy_spec(&self, i: usize) -> Option<&BodyAnatomySpec> {
        self.combat_specs.as_ref()?.anatomy((*self.body_anatomy.get(i)?)?)
    }

    /// The same row, by handle, for a host that keeps its own copy.
    ///
    /// `crates/web` caches one anatomy per published slot because the region
    /// writer reads it sixty times a second and `combat_specs` is behind two
    /// `Option`s and a table lookup. That cache is a second copy of this, and a
    /// second copy is only safe if there is one call that fills it -- **which
    /// there was not**: the host built its table from the scenario's units, so a
    /// body that arrived through `try_spawn` afterwards had no row, and its
    /// capsules were dropped from the region section every frame while its pose
    /// and stance rows published normally. Measured on the browser's own floor:
    /// three spawns took the pose count from 7 to 10 and left `region_len` at 49
    /// with `regions_dropped` climbing 0, 7, 14, 21.
    ///
    /// Keyed by [`EntityId`] rather than by index because a host holding a stale
    /// handle would otherwise read the row of whoever took the slot; `resolve`
    /// checks the generation.
    pub fn body_anatomy(&self, id: EntityId) -> Option<&BodyAnatomySpec> {
        self.anatomy_spec(self.resolve(id)?)
    }

    /// Current health, and the anatomy is the whole of it.
    ///
    /// Every consumer goes through here -- observation, the published view, the
    /// timeout comparison, and damage credit -- because the one thing worse than
    /// one health column is two. There was a second: `hp`, which this fell
    /// through to for a body carrying no anatomy row. It is gone, and the
    /// `debug_assert!` standing in its place is what keeps it gone.
    ///
    /// **The arm was measured unreachable rather than argued unreachable.** The
    /// assertion was armed on this fallback and on [`World::max_health_of`]'s,
    /// and the whole test suite plus sixteen full-length embodied duel trials
    /// were run against it in the dev profile, where `debug-assertions` is on.
    /// Neither fired. There is a reason it cannot -- construction ties every
    /// loadout slot to an equipment row and therefore every body to an anatomy,
    /// and `Scenario::fingerprint` runs that check before it hashes -- but the
    /// reason is an argument and the run is the evidence, which is why the
    /// assertion stays as a standing guard instead of leaving with the column it
    /// was measuring.
    ///
    /// [`Fx::ZERO`] rather than a panic on the release path, because the sim is
    /// total by policy: the one way here is a body that construction refuses, so
    /// a corrupt replay produces a fighter at no health rather than a crash
    /// three frames into playback.
    fn health_of(&self, i: usize) -> Fx {
        match (self.anatomy_spec(i), self.wounds.get(i)) {
            (Some(spec), Some(state)) => state.health(spec),
            _ => {
                debug_assert!(false, "a body with no anatomy row reached health_of");
                Fx::ZERO
            }
        }
    }

    /// The maximum [`World::health_of`] is a fraction of. Same shape, same
    /// standing guard, and the same measurement behind it.
    ///
    /// Zero is the safe constant here and not merely the quiet one: every
    /// division by this value tests the denominator first --
    /// [`World::health_fraction`] answers zero for a side that sums to nothing,
    /// and the per-body fraction beside it does the same -- so even a reached
    /// arm could not produce a division by what it answered.
    fn max_health_of(&self, i: usize) -> Fx {
        match self.anatomy_spec(i) {
            Some(spec) => anatomy::max_health(spec),
            None => {
                debug_assert!(false, "a body with no anatomy row reached max_health_of");
                Fx::ZERO
            }
        }
    }

    fn equipment_in_grip(&self, i: usize, limb: usize) -> Option<crate::EquipmentSpec> {
        let slot = self.grips[i][limb].equipment_slot?;
        let id = self.body_carried[i].get(slot as usize).copied().flatten()?;
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

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::testkit::*;

    #[test]
    fn articulated_columns_follow_every_allocated_and_reused_slot() {
        // **The control that used to open this test is gone.** It built a
        // Legacy world and asserted every articulated column was *empty* -- the
        // strongest form of "these columns follow the model", because it was a
        // world where they were never allocated at all. There is no model left
        // that leaves them empty, so what remains below is the other half: that
        // on a world which does allocate them, every allocated and reused slot
        // carries one.

        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let assert_lengths = |world: &World, len| {
            assert_eq!(world.body_yaw.len(), len);
            // **The stance and the elbow plane are on this list because the
            // test that carried the claim is gone.**
            // `an_articulated_body_has_no_stance_row` was half an assertion
            // about a model that no longer exists; the half that survives it is
            // that an embodied body has one row of each per allocated slot, and
            // this is the list that says so.
            assert_eq!(world.stance.len(), len);
            assert_eq!(world.elbow_plane.len(), len);
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
        // Dirtied, not merely read afterwards: a reuse check whose slot was
        // already canonical is the shape of green guard that asserts nothing.
        world.stance[2] = StanceState::squared(Angle::QUARTER);
        world.stance[2].step_left = 9;
        world.elbow_plane[2] =
            [ElbowPlaneState { commanded: Angle::QUARTER, held: Angle::QUARTER }; 2];
        world.wounds[2].blood = Fx::ZERO;
        world.reap_dead_bodies();
        let replacement = world.spawn(&scenario.units[1]);
        assert_eq!(replacement, EntityId::new(2, 1));
        assert_lengths(&world, 3);
        // Squared on the *new* occupant's bearing -- the row is a Monster, which
        // spawns facing half a turn round -- and the plane back to neutral. A
        // body that inherited either would start its fight mid-step.
        assert_eq!(world.stance[2], StanceState::squared(Angle::HALF),
                   "a reused slot inherited a stance");
        assert_eq!(world.elbow_plane[2], [ElbowPlaneState::NEUTRAL; 2],
                   "a reused slot inherited an elbow plane");
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
        assert_eq!(world.pose_test_view(replacement).unwrap(),
            fresh.pose_test_view(EntityId::new(1, 0)).unwrap());
    }

    #[test]
    fn articulated_mutation_apis_preserve_immutable_construction() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let construction = (world.kind[0], world.loadout[0], world.body_anatomy[0],
            world.body_carried[0], world.body_equipment[0], world.grips[0]);
        // **Two of the three refusals this checked are now absences.**
        // `World::set_body` and `World::set_loadout` returned `false` on a world
        // with articulated columns, because a jointed body's kit and frame are
        // construction rather than state -- the equipment rows are in the spec
        // table and hashed into the digest, and the grip actuator holds an item
        // by spec id. Session 10 deleted both methods, so the claim is enforced
        // by the type system and no longer needs an assertion. What is still
        // worth asserting is the *other* half: that the one mutator which does
        // survive, `set_stats`, reaches the digest.
        let before = world.state_digest().value;
        let changed_stats = Stats::new(1, 2, 3, 4, 5);
        assert!(world.set_stats(fighter, changed_stats));
        assert_eq!(world.stats[0], changed_stats);
        assert_ne!(world.state_digest().value, before);
        assert_eq!((world.kind[0], world.loadout[0], world.body_anatomy[0],
            world.body_carried[0], world.body_equipment[0], world.grips[0]), construction);
    }

    #[test]
    fn neutral_fallback_uses_authoritative_body_yaw_after_stationary_divergence() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = command_core();
        command.body_yaw = Angle::QUARTER;
        let _ = world.submit(fighter, crate::CommandV1::new(command));
        world.step();
        assert_eq!(world.facing[0], Angle::ZERO);
        assert_eq!(world.body_yaw[0].angle, Angle::from_raw(91));
        let outcome = world.submit_fallback(fighter, crate::CommandField::LeftReach);
        let stored = match outcome {
            crate::SubmitOutcome::Stored {
                command, rejection: Some(CommandReject::OutOfRange(_)),
            } => command,
            other => panic!("unexpected fallback outcome: {other:?}"),
        };
        // The divergence is the whole test: `facing` is still zero and the
        // authoritative yaw is not, so a fallback reading the wrong column
        // stores the wrong number rather than nothing.
        assert_eq!(stored.core.body_yaw, Angle::from_raw(91));
        // **The arms read zero and that is the same claim, not a weaker one.**
        // An embodied bearing is measured from the torso, so "ahead" is the
        // offset zero; `World::world_arm_target` adds the body yaw back on the
        // way in, and storing the yaw here would ask a neutral arm for twice it.
        // `World::neutral_core` records that correction in full.
        assert_eq!(stored.core.arms[0].bearing, Angle::ZERO);
        assert_eq!(stored.core.arms[1].bearing, Angle::ZERO);
        // And the plane the fallback substitutes is the neutral one rather than
        // whatever the refused command's predecessor left behind.
        assert_eq!(stored.swing_plane, [Angle::ZERO; 2]);
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
        let carried = scenario.units[1].combat_spec.expect("an articulated row").equipment;
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
        let scenario = Scenario::embodied_duel();
        let table = scenario.combat_specs.as_ref().unwrap();
        let hero = exact_lattice_for_unit(scenario.units[0].kind.mass().raw(), table,
            scenario.units[0].combat_spec.unwrap()).unwrap();
        let brute = exact_lattice_for_unit(scenario.units[1].kind.mass().raw(), table,
            scenario.units[1].combat_spec.unwrap()).unwrap();
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
        let mut scenario = Scenario::embodied_duel();
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
        spec.combat_spec.as_mut().unwrap().equipment = [Some(left.id), Some(right.id)];
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
        runtime.reserve(crate::combat::contact::MAX_ENTITIES).unwrap();
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
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let initial = world.grips[0];
        let mut invalid = world.neutral_core(0);
        invalid.grips = [GripRequest::Release, GripRequest::EquipSlot(1)];
        assert!(matches!(world.submit(fighter, crate::CommandV1::new(invalid)),
            crate::SubmitOutcome::Stored { command, rejection: Some(CommandReject::MissingEquipment { .. }) }
                if command.core.grips == [GripRequest::Keep; 2]));
        assert_eq!(world.grips[0], initial, "submission changed one arm before the step");
        world.step();
        assert_eq!(world.grips[0], initial, "fallback did not preserve the complete pair");

        let mut release = world.neutral_core(0);
        release.grips = [GripRequest::Release; 2];
        assert!(matches!(
            world.submit(fighter, crate::CommandV1::new(release)),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "the release transaction was refused, so the step below proves nothing");
        assert_eq!(world.grips[0], initial, "accepted transaction applied before step");
        world.step();
        assert_eq!(world.grips[0], [GripState { equipment_slot: None }; 2]);
    }

    #[test]
    fn a_two_handed_grip_cannot_bind_a_shield() {
        let mut scenario = Scenario::embodied_duel();
        let mut shield = crate::shield();
        shield.id = 4;
        shield.action = ActionKind::Club;
        shield.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(shield);
        scenario.units[1].combat_spec.as_mut().unwrap().equipment = [Some(4), None];
        assert_eq!(crate::combat::spec::validate_construction(
            scenario.combat_specs.as_ref(), &scenario.units,
        ), Err(crate::CombatSpecError::GripConflict));

        let mut scenario = Scenario::embodied_duel();
        let mut left = crate::shield();
        left.id = 4;
        left.action = ActionKind::Sword;
        let mut right = left;
        right.id = 5;
        right.action = ActionKind::Club;
        right.binding = crate::GripBinding::Right;
        scenario.combat_specs.as_mut().unwrap().equipment.extend([left, right]);
        scenario.units[0].combat_spec.as_mut().unwrap().equipment = [Some(4), Some(5)];
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Club);
        assert_eq!(crate::combat::spec::validate_construction(
            scenario.combat_specs.as_ref(), &scenario.units,
        ), Err(crate::CombatSpecError::GripConflict));
    }

    #[test]
    fn articulated_actuation_cannot_create_healing_damage_death_recoil_or_shots() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        // **Both bodies start away from full**, or "the health did not move" is
        // a claim a heal could not have falsified. Blood and not integrity:
        // integrity is what the actuator reads its authority from, and this is a
        // test about a body that is only moving its arms. Blood decays only
        // against an open wound, of which there are none here, so an unchanged
        // anatomy column is the whole assertion -- healing, damage and the
        // bleed clock all have to write it.
        world.wounds[0].blood -= Fx::ONE;
        world.wounds[1].blood -= Fx::TWO;
        let wounds = world.wounds.clone();
        let limbs = world.limb.clone();
        let mut command = world.neutral_core(0);
        command.arms[0] = ArmTarget { bearing: Angle::HALF, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE };
        command.arms[1] = command.arms[0];
        for id in [fighter, brute] {
            assert!(matches!(
                world.submit(id, crate::CommandV1::new(command)),
                crate::SubmitOutcome::Stored { rejection: None, .. }),
                "a refused command would leave both bodies standing still");
        }
        for _ in 0..180 {
            assert!(world.step().is_empty());
        }
        assert_eq!(world.wounds, wounds);
        assert_eq!(world.alive, [true, true]);
        assert_eq!(world.limb, limbs);
        assert!(world.projectile_alive.is_empty());
    }

    // The literal below gained `prop swings`, `loose projectiles` and
    // `resolve projectiles` when the schedule became a table. **No phase moved
    // and none was added**: those three bodies always ran here, in this order,
    // and simply had no trace name of their own -- `resolve_dungeon_prop_swings`
    // rode under `legacy swings`, and the two projectile phases rode with
    // `resolve_contact` under `contact`. Reading the name off the table is what
    // made that impossible to write. The golden hashes are the evidence that the
    // order itself did not change, and none of them moved.
    //
    // **This said "the two literals below" and had been wrong since 2026-08-18.**
    // The second was `the_legacy_phase_trace_is_unchanged`, which went with
    // `CombatModel::Legacy` -- and the sentence about `legacy swings` above is
    // kept anyway, because it is the argument for reading a phase name off the
    // table and that argument outlived the schedule it was learnt on.

    #[test]
    fn contact_runs_after_geometry_and_before_doors() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        world.phase_trace_enabled = true;
        world.step();
        assert_eq!(world.phase_trace, [
            "clear events", "expire decisions", "retain contact entry",
            "apply articulated movement", "record contact locomotion", "separate",
            // `"stance"` stands where `"body yaw"` stood, which is the one row
            // the two schedules ever differed by; the articulated schedule and
            // the literal that named it went with the model.
            "stance", "grips", "arms", "geometry", "loose projectiles", "contact",
            "resolve projectiles", "anatomy", "doors", "reap",
            // A `"navigation"` row closed this list until the flow field was
            // deleted, and that is what the table exists to make visible: a
            // phase leaving is a name leaving a list, not a silence. It read
            // "the only edit to this literal" until the articulated model went
            // and `"stance"` replaced `"body yaw"` above -- a substitution, and
            // visible in the list for the same reason.
            "increment tick", "pending",
        ]);
    }

    /// Drives one embodied body under a held command and hands back the world.
    ///
    /// Takes the yaw and the movement separately because every stance claim is
    /// about the interaction of the two -- a body turning while planted and a
    /// body turning while walking are the two cases the model distinguishes.
    fn stanced(yaw: Angle, move_dir: Vec2, ticks: u32) -> World {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let id = world.alive_ids(Faction::Heroes)[0];
        let command = CommandCoreV1 {
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
            world.submit(id, crate::CommandV1::new(command));
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

    /// The asymmetry that makes footwork a decision, raced against **the same
    /// target**.
    ///
    /// Translation selects the moving hip rate and never a second target. Both
    /// bodies therefore chase the same achieved torso yaw -- an eighth of a
    /// turn, comfortably inside the budget -- and the only difference is
    /// whether they are translating.
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
            // hip target is `eighth` in both runs. Translation changes only the
            // actuator rate below; direction cannot steer this race.
            world.body_yaw[0].angle = eighth;
            world.stance[0] = StanceState::squared(Angle::ZERO);
            let command = CommandCoreV1 {
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
                world.submit(id, crate::CommandV1::new(command));
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

        // Never commanded: no field of `CommandV1` names it, and the
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
        let held = ArmTarget {
            bearing: Angle::from_raw(9_000),
            height: crate::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        // **The control was an articulated world reading the same bearing
        // absolutely, and it went with the model.** What replaces it is the
        // sweep's own first entry: at a yaw of zero the two readings coincide,
        // so a conversion that had stopped adding the yaw would pass there and
        // fail at every other yaw in the list -- including one raw unit, which
        // is smaller than any rounding this arithmetic does.
        for yaw_raw in [0u16, 1, 16_384, 32_768, 49_152, 65_535] {
            let yaw = Angle::from_raw(yaw_raw);
            embodied.body_yaw[0].angle = yaw;
            assert_eq!(embodied.world_arm_target(0, 1, held).bearing, yaw + held.bearing);
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
        let forward = Vec2::new(Fx::ONE, Fx::ZERO);
        let left = Vec2::new(Fx::ZERO, Fx::ONE);

        embodied.body_yaw[0].angle = Angle::ZERO;
        assert_eq!(embodied.world_move_dir(0, forward), forward);
        assert_eq!(embodied.world_move_dir(0, left), left);

        // A quarter turn takes body-forward to world-left, exactly.
        embodied.body_yaw[0].angle = Angle::QUARTER;
        assert_eq!(embodied.world_move_dir(0, forward), Vec2::new(Fx::ZERO, Fx::ONE));
        assert_eq!(embodied.world_move_dir(0, left), Vec2::new(-Fx::ONE, Fx::ZERO));

        // **The articulated control that closed this went with the model.** The
        // zero-yaw pair above is what is left holding the other side, and it
        // does hold it: a rotation applied twice, or applied the wrong way
        // round, is still the identity at zero and is not at a quarter, so the
        // two cases together bound the conversion rather than either alone.
    }

    /// The whole point of the session, measured through the actual tick rather
    /// than through the conversion: hold one bearing, turn the body a quarter,
    /// and the hand comes round with it.
    ///
    /// Bounded from **both** sides, and after the articulated model went both
    /// bounds are about the same body. The torso must arrive within a sixteenth
    /// of a turn of the yaw it asked for, so a body that never turned fails; and
    /// the arm must arrive within a sixteenth **of the torso** rather than of
    /// where it started, so an arm that held its world bearing -- which is
    /// exactly what the deleted articulated control did on purpose -- fails too.
    /// The two targets are a quarter turn apart, which is what stops one
    /// assertion from being satisfied by the other's answer.
    #[test]
    fn turning_the_body_carries_the_hand_with_it_at_a_held_bearing() {
        let held = ArmTarget {
            bearing: Angle::ZERO,
            height: crate::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let id = world.alive_ids(Faction::Heroes)[0];
        let command = crate::CommandV1::new(CommandCoreV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::QUARTER,
            intent: Intent::Hold,
            arms: [held; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        });
        for _ in 0..400 {
            assert!(matches!(world.submit(id, command),
                crate::SubmitOutcome::Stored { rejection: None, .. }),
                "a refused command would leave the body facing where it started");
            world.step();
        }
        let (yaw, arm) = (world.body_yaw[0].angle, world.arms[0][1].bearing);

        let sixteenth = 4_096i32;
        assert!(yaw.delta(Angle::QUARTER).abs() < sixteenth,
                "the body did not reach its commanded yaw: {yaw:?}");
        assert!(arm.delta(Angle::QUARTER).abs() < sixteenth,
                "the arm did not follow the torso: {arm:?}");
    }

    /// The 2026-08-16 shield-normal amendment survives the frame change: the
    /// plate's facing follows the **arm that carries it**, and after this
    /// session that arm is one the torso can turn.
    #[test]
    fn the_shield_normal_still_follows_the_arm_that_carries_it() {
        let mut world = World::new(&Scenario::embodied_duel(), 1);
        let id = world.alive_ids(Faction::Heroes)[0];
        let command = crate::CommandV1::new(CommandCoreV1 {
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
        });
        for _ in 0..120 {
            assert!(matches!(world.submit(id, command),
                crate::SubmitOutcome::Stored { rejection: None, .. }));
            world.step();
        }
        // `expect` rather than the `else { continue }` this had while it looped
        // over two fixtures: with one world left, a fighter carrying no plate is
        // a fixture that proves nothing rather than an arm of the loop to skip.
        let shield = world.shield_pose[0].expect("the fighter carries a plate");
        let carrying = world.arms[0][0].bearing;
        assert_eq!(shield.normal,
                   Vec3::new(carrying.cos(), carrying.sin(), Fx::ZERO),
                   "the plate stopped facing where its arm points");
        // And the arm turned, or the equality above is a claim about a plate
        // that never moved.
        assert_ne!(carrying, Angle::ZERO, "the carrying arm never left its bearing");
    }

    /// The property the table exists for: a phase that runs without a trace
    /// entry cannot be written, because the loop dispatches on the same string
    /// it records. Asserting it against `phases()` rather than against a third
    /// literal is the point -- a third literal could drift like the first two.
    #[test]
    fn the_phase_table_and_the_phase_trace_cannot_disagree() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let expected: Vec<&'static str> = PROLOGUE.iter()
            .chain(EMBODIED_PHASES)
            .chain(EPILOGUE)
            .map(|&(name, _)| name)
            .collect();
        assert!(!expected.is_empty(), "an empty schedule would satisfy this vacuously");
        world.phase_trace_enabled = true;
        world.step();
        assert_eq!(world.phase_trace, expected, "{}", scenario.name);
        // Twice, because the trace accumulates: a second tick must append a
        // second identical run rather than a shorter or a reordered one.
        world.step();
        assert_eq!(world.phase_trace.len(), expected.len() * 2, "{}", scenario.name);
        assert_eq!(&world.phase_trace[expected.len()..], &expected[..], "{}", scenario.name);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn rejected_grip_transaction_preserves_recoil_byte_exact() {
        let mut world = World::new(&Scenario::embodied_duel(), 0);
        world.arms[0][0].post_contact_active = true;
        world.arms[0][0].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(5), Fx::from_raw(7), Fx::from_raw(-11));
        world.arms[0][1].post_contact_active = true;
        world.arms[0][1].post_contact_com_velocity = Vec3::new(
            Fx::from_raw(2), Fx::from_raw(-1), Fx::from_raw(3));
        let before = world.arms[0]; let grips = world.grips[0];
        let mut invalid = world.neutral_core(0);
        invalid.grips = [GripRequest::Release, GripRequest::EquipSlot(1)];
        assert!(matches!(
            world.submit(world.id_of(0), crate::CommandV1::new(invalid)),
            crate::SubmitOutcome::Stored { rejection: Some(_), .. }));
        world.apply_grips();
        assert_eq!((world.arms[0], world.grips[0]), (before, grips));
    }

    #[test]
    fn contact_scratch_grows_only_with_allocated_high_water() {
        let scenario = Scenario::embodied_duel();
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
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let row = scenario.units[1];
        for _ in world.alive.len()..crate::MAX_ENTITIES {
            world.try_spawn(&row).expect("a row inside the ceiling");
        }
        assert_eq!(world.alive.len(), crate::MAX_ENTITIES);

        let digest = world.state_digest().value;
        let capacities = world.contact_capacities();
        let resolutions = world.contact_resolutions().len();
        assert_eq!(world.try_spawn(&row).unwrap_err(),
                   SpawnError::Contact(ContactCapacityError::EntityLimit));
        // Nothing authoritative moved. Capacity is not on that list -- the
        // reservation sequence is not atomic and the contract says so -- but
        // here the refusal happens before any reserve, so it did not move
        // either.
        assert_eq!(world.alive.len(), crate::MAX_ENTITIES);
        assert_eq!(world.state_digest().value, digest);
        assert_eq!(world.contact_capacities(), capacities);
        assert_eq!(world.contact_resolutions().len(), resolutions);
    }

    #[test]
    fn geometry_envelope_rejects_before_world_or_spawn_mutation() {
        // `Fx::MIN` is the case the arena bound alone would wave through: arena
        // settling would later have clamped it, so only checking the row as
        // handed over catches it.
        let mut scenario = Scenario::embodied_duel();
        scenario.units[0].spawn = Vec2::new(Fx::MIN, Fx::ZERO);
        // `.err()` rather than `unwrap_err()`: `World` is deliberately not
        // `Debug`, and the failure is the whole point of this call anyway.
        assert_eq!(World::try_new(&scenario, 1).err(),
                   Some(WorldBuildError::Contact(ContactCapacityError::GeometryEnvelope)));

        // And the reach, not just the origin: 256 is inside the envelope on its
        // own and outside it once the body's own arm is added.
        let scenario = Scenario::embodied_duel();
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
    fn an_initial_item_overlap_refuses_identity_build_and_spawn_before_mutation() {
        let mut invalid = Scenario::embodied_duel();
        let table = invalid.combat_specs.as_mut().unwrap();
        let EquipmentGeometry::Shield { thickness, .. } =
            table.equipment[1].geometry else { unreachable!() };
        table.equipment[1].geometry = EquipmentGeometry::Shield {
            half_width: Fx::from_int(2), half_height: Fx::from_int(2), thickness,
        };
        assert_eq!(invalid.try_fingerprint(), Err(crate::ScenarioFingerprintError::InitialSelfOverlap));
        assert_eq!(World::try_new(&invalid, 1).err(), Some(WorldBuildError::InitialSelfOverlap));

        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        world.combat_specs = invalid.combat_specs.clone();
        let digest = world.state_digest().value;
        let lengths = (world.alive.len(), world.generation.len(), world.free.len());
        assert_eq!(world.try_spawn(&invalid.units[0]), Err(SpawnError::InitialSelfOverlap));
        assert_eq!((world.alive.len(), world.generation.len(), world.free.len()), lengths);
        assert_eq!(world.state_digest().value, digest);
    }

    /// A subject whose generation no longer resolves is refused **and leaves no
    /// trace** -- neither a stored command nor a moved decision clock, both of
    /// which the digest would show.
    ///
    /// **This was `wrong_model_and_stale_subjects_are_not_stored_or_recorded`
    /// and it has lost half its subject with the articulated model.** The other
    /// half handed a command of the wrong grammar to a world that had no column
    /// to store it in -- first a Legacy world, then an embodied one refusing an
    /// articulated payload -- and with one grammar left there is no wrong model
    /// to be refused for. The name went with the half it named: a guard whose
    /// name claims a check it no longer makes is a defect this repository has
    /// shipped repeatedly.
    #[test]
    fn a_stale_subject_is_not_stored_or_recorded() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let before = world.state_digest().value;
        assert_eq!(
            world.submit(EntityId::new(0, 9), embodied_command()),
            crate::SubmitOutcome::NotStored(CommandReject::StaleEntity)
        );
        assert_eq!(world.state_digest().value, before);

        // The control, without which "nothing moved" is a sentence a submission
        // path that refused *everything* would also satisfy -- which is the
        // exact failure this session's reseats are guarding against.
        assert!(matches!(
            world.submit(EntityId::new(0, 0), embodied_command()),
            crate::SubmitOutcome::Stored { rejection: None, .. }
        ));
        assert_ne!(world.state_digest().value, before);
    }

    #[test]
    fn invalid_range_or_equipment_replaces_the_whole_command_atomically() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let hero = EntityId::new(0, 0);
        let mut bad = command_core();
        bad.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        match world.submit(hero, crate::CommandV1::new(bad)) {
            crate::SubmitOutcome::Stored { command, rejection } => {
                assert_eq!(rejection, Some(CommandReject::OutOfRange(crate::CommandField::LeftReach)));
                assert_eq!(command.core, world.neutral_core(0));
                // The plane is part of "the whole command": a substitute that
                // kept the refused request's plane would be a partial accept.
                assert_eq!(command.swing_plane, [Angle::ZERO; 2]);
            }
            other => panic!("invalid live command was not replaced: {other:?}"),
        }

        let mut equip = command_core();
        equip.grips = [GripRequest::EquipSlot(1), GripRequest::Keep];
        assert!(matches!(
            world.submit(hero, crate::CommandV1::new(equip)),
            crate::SubmitOutcome::Stored { command, rejection: None }
                if command.core == equip
        ));

        let mut twice_bad = command_core();
        twice_bad.move_dir.x = Fx::from_raw(Fx::ONE.raw() + 1);
        twice_bad.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        assert!(matches!(
            world.submit(hero, crate::CommandV1::new(twice_bad)),
            crate::SubmitOutcome::Stored {
                rejection: Some(CommandReject::OutOfRange(crate::CommandField::MoveX)), ..
            }
        ));
        equip.grips[0] = GripRequest::EquipSlot(7);
        assert!(matches!(
            world.submit(hero, crate::CommandV1::new(equip)),
            crate::SubmitOutcome::Stored {
                rejection: Some(CommandReject::MissingEquipment { arm: LimbSlot::LeftArm, slot: 7 }), ..
            }
        ));
    }

    #[test]
    fn immutable_bindings_accept_only_the_arm_that_physically_holds_the_item() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        for (id, grips) in [
            (fighter, [GripRequest::Keep, GripRequest::EquipSlot(0)]),
            (fighter, [GripRequest::EquipSlot(1), GripRequest::Keep]),
            (brute, [GripRequest::Keep, GripRequest::EquipSlot(0)]),
        ] {
            let mut command = command_core();
            command.grips = grips;
            assert!(matches!(
                world.submit(id, crate::CommandV1::new(command)),
                crate::SubmitOutcome::Stored { command: stored, rejection: None }
                    if stored.core == command));
        }
        for (id, grips, arm, slot) in [
            (fighter, [GripRequest::EquipSlot(0), GripRequest::Keep], LimbSlot::LeftArm, 0),
            (fighter, [GripRequest::Keep, GripRequest::EquipSlot(1)], LimbSlot::LeftArm, 1),
            (brute, [GripRequest::EquipSlot(0), GripRequest::Keep], LimbSlot::LeftArm, 0),
        ] {
            let mut command = command_core();
            command.grips = grips;
            assert!(matches!(
                world.submit(id, crate::CommandV1::new(command)),
                crate::SubmitOutcome::Stored {
                    command: stored,
                    rejection: Some(CommandReject::MissingEquipment { arm: rejected_arm, slot: rejected_slot }),
                } if stored.core == world.neutral_core(id.index as usize)
                    && rejected_arm == arm && rejected_slot == slot));
        }
    }

    #[test]
    fn a_test_only_both_binding_requires_matching_same_slot_requests() {
        let mut scenario = Scenario::embodied_duel();
        let mut both = crate::club();
        both.id = 4;
        both.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(both);
        scenario.units[1].combat_spec.as_mut().unwrap().equipment = [Some(4), None];
        let mut world = World::new(&scenario, 1);
        let brute = EntityId::new(1, 0);
        let mut command = command_core();
        command.grips = [GripRequest::EquipSlot(0); 2];
        assert!(matches!(
            world.submit(brute, crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored { rejection: None, .. }));
        command.grips = [GripRequest::Release, GripRequest::Keep];
        assert!(matches!(
            world.submit(brute, crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored {
                rejection: Some(CommandReject::MissingEquipment { arm: LimbSlot::RightArm, slot: 0 }), ..
            }));
    }

    #[test]
    fn a_stationary_body_can_store_a_turn_request() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let command = embodied_command();
        let before = world.state_digest().value;
        assert!(matches!(
            world.submit(EntityId::new(0, 0), command),
            crate::SubmitOutcome::Stored { command: stored, rejection: None } if stored == command
        ));
        assert_ne!(world.state_digest().value, before);
        assert_eq!(world.view(EntityId::new(0, 0)).unwrap().facing, Angle::ZERO);
    }

    #[test]
    fn dead_allocated_slots_retain_their_articulated_command() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let command = command_core();
        assert!(matches!(
            world.submit(EntityId::new(0, 0), crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored { rejection: None, .. }),
            "nothing was stored, so the retention below would be vacuous");
        world.wounds[0].blood = Fx::ZERO;
        world.reap_dead_bodies();
        assert!(!world.alive[0]);
        assert_eq!(world.command_core[0], Some(command));
        let retained = world.state_digest().value;
        world.command_core[0] = None;
        assert_ne!(world.state_digest().value, retained, "a dead slot's retained bytes were not hashed");
        world.command_core[0] = Some(command);
        let replacement = world.spawn(&scenario.units[0]);
        assert_eq!(replacement, EntityId::new(0, 1));
        assert_eq!(world.command_core[0], None);
    }

    #[test]
    fn set_stats_writes_the_attributes_and_cannot_move_the_health() {
        // **This was `set_stats_preserves_the_health_fraction`**, and the
        // property it named went with the bar it was about rather than with a
        // change of mind: `anatomy::max_health` sums the anatomy spec and reads
        // no `Stats` field, so vitality cannot lengthen or shorten what a body
        // has to lose. What is still worth checking is the *outcome* the rescale
        // existed to produce -- that turning the dial in either direction is
        // inert on the health -- rather than the rescale itself.
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        // Away from full, so a heal would have somewhere to show.
        w.wounds[h].blood = w.wounds[h].blood * Fx::HALF;
        let (health, maximum) = (w.health_of(h), w.max_health_of(h));
        assert!(health.is_positive() && health < maximum,
                "the fixture is at full health, so this proves nothing");

        // Up. The stat sheet still moves -- the page reads `Stats::max_hp` and
        // is entitled to -- and nothing in the world does.
        let mut stats = w.stats(hero).unwrap();
        stats.vitality += 10;
        assert!(stats.max_hp() > Body::Fighter.base_stats().max_hp(),
                "vitality bought nothing, so this proves nothing");
        assert!(w.set_stats(hero, stats));
        assert_eq!(w.stats(hero), Some(stats), "the attributes were not written");
        assert_eq!((w.health_of(h), w.max_health_of(h)), (health, maximum));

        // And down, which is the direction that could kill. It must not.
        stats.vitality = 1;
        assert!(w.set_stats(hero, stats));
        assert_eq!((w.health_of(h), w.max_health_of(h)), (health, maximum));
        assert!(w.is_alive(hero), "lowering vitality killed a fighter");

        // The decision clock is left where it was; `submit`
        // re-derives it from the new period on the next decision, and that one
        // beat of lag is the point rather than an oversight.
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

        // **Bled out, because there is nothing else left to zero.** This used
        // to note that writing the legacy `hp` column to zero left a fighter in
        // perfect health and the reaper untroubled, since `World::health_of`
        // routes a body with an anatomy row through `anatomy::max_health`. That
        // column is gone; the blood is the health.
        w.wounds[h].blood = Fx::ZERO;
        w.step();
        assert!(!w.is_alive(hero), "the fighter survived being bled out");

        assert_eq!(w.stats(hero), None);
        assert!(
            !w.set_stats(hero, Body::Brute.base_stats()),
            "a dead handle rewrote the attributes of whoever inherits its slot"
        );
        assert!(!w.set_stats(EntityId::NONE, Body::Brute.base_stats()));
        // Nothing leaked into the slot the corpse left behind.
        assert_eq!(w.stats[h], Body::Rogue.base_stats());
    }

}
