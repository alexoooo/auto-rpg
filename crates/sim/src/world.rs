use crate::command::{
    validate_articulated, ArmTarget, ArticulatedCommandV1, Command, CommandReject, GripRequest,
    Intent, LimbSlot, Objective, Order, SubmitArticulatedOutcome,
};
use crate::action::{ActionKind, ActionSpec, Role};
use crate::dungeon::{Cardinal, Door, Dungeon};
use crate::loadout::Loadout;
use crate::entity::{EntityId, Faction, Body};
use crate::event::Event;
use crate::hand::{Hand, Swing};
use crate::obs::{ArticulatedObservation, Contact, Observation, ObservedArm, ObservedOpponent,
                 ObservedShield, MAX_ARTICULATED_OPPONENTS};
use crate::pose::{AnimationHint, ArticulatedPose, PosedArm};
use crate::rules::{self, Stats, MAX_CONTACTS};
use crate::scenario::{Scenario, UnitSpec};
use crate::anatomy::{self, AnatomyState, BodyPart};
use crate::combat::spec::{ArticulatedUnitSpecV1, BodyAnatomySpec, CombatSpecError,
                          CombatSpecTableV1, resolved_equipment};
use crate::combat::actuator::{self, ArmState, BodyYawState, GripState, ShieldPose};
use crate::combat::contact::{contact_bounds, medial_point, try_reserve_exact,
                             ContactCapacityError, ContactCollider, ContactKind,
                             ContactResolution, ContactShape,
                             ContactSolverState, RegionSweep, BODY_SLOT,
                             MAX_CONTACT_FACTS_PER_GROUP, MAX_CONTACT_RESOLUTIONS_PER_TICK};
use crate::combat::geometry;
use crate::combat::resolution::{self, ContactTickScratch, ContactTrialProjector,
                                GeneralizedCollider, GeneralizedKind, ResolutionError};
use crate::{EquipmentGeometry, EquipmentSpecId};
use fx::{Angle, Fx, Hash64, Rng, Vec2, Vec3};

/// The perception-noise stream domain for [`World::observe_articulated`]:
/// ASCII `ARTOBS1`, frozen by the articulated ABI.
///
/// It is folded into `Rng::from_stream`'s *seed* argument rather than into one
/// of the two coordinates, because both coordinates are already spoken for --
/// tick and full identity -- and the articulated stream draws at exactly the
/// same pair as the legacy one. XOR into the seed is enough: `from_stream`
/// mixes the seed in linearly and then runs the result through SplitMix64,
/// which is a bijection, so a nonzero domain can never collide with the legacy
/// stream for any (tick, entity).
const ARTICULATED_OBSERVATION_DOMAIN: u64 = 0x4152_544f_4253_31;

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
    articulated_command: Vec<Option<ArticulatedCommandV1>>,
    articulated_anatomy: Vec<Option<u16>>,
    articulated_carried: Vec<[Option<u16>; 2]>,
    articulated_equipment: Vec<[Option<u16>; 2]>,
    body_yaw: Vec<BodyYawState>,
    arms: Vec<[ArmState; 2]>,
    grips: Vec<[GripState; 2]>,
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
/// Only `state` is authoritative: ArticulatedV1 hashing writes its `cap_hits`
/// and nothing else in here. The scratch and the published resolutions are
/// evidence, which is why the whole struct sits outside `legacy_core_hash`.
///
/// Reserved once against the allocated-slot high water, for the same reason
/// `nav_queue` is held on the world rather than allocated per rebuild: this
/// crate is driven from a page holding typed-array views into linear memory,
/// and a `Vec` that grows can grow that memory and detach every one of them.
#[derive(Clone, Default)]
struct ContactRuntime {
    state: ContactSolverState,
    scratch: ContactTickScratch,
    colliders: Vec<ContactCollider>,
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
        try_reserve_exact(&mut self.resolutions, MAX_CONTACT_RESOLUTIONS_PER_TICK)?;
        try_reserve_exact(&mut self.entry, high_water)?;
        try_reserve_exact(&mut self.bodies, high_water)?;
        try_reserve_exact(&mut self.anatomy_entry, high_water)?;
        try_reserve_exact(&mut self.credit, high_water)?;
        try_reserve_exact(&mut self.deltas, high_water)?;
        try_reserve_exact(&mut self.fact_loss, MAX_CONTACT_FACTS_PER_GROUP)?;
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

/// World's coupled trial projector.
///
/// Holds `&World` and writes nothing. That is not a stylistic preference: the
/// driver calls this up to eighteen times per group looking for the largest
/// valid alpha, and seventeen of those are hypotheticals. Everything
/// authoritative is written once, afterwards, by [`World::commit_contact`] --
/// which is also why a mid-tick `ResolutionError` costs nothing to abandon.
struct ContactProjector<'a> {
    world: &'a World,
    entry: &'a [TickEntry],
    bodies: &'a mut Vec<BodyTrial>,
    /// The live anatomy, lifted out of `World` for the length of the solve.
    /// Written only by [`ContactProjector::after_group`], never by `project`:
    /// seventeen of every eighteen projections are hypotheticals, and a wound
    /// applied inside one would be a wound applied seventeen times.
    wounds: &'a mut Vec<AnatomyState>,
    credit: &'a mut Vec<Fx>,
    deltas: &'a mut Vec<AnatomyDelta>,
    fact_loss: &'a mut Vec<Fx>,
}

impl ContactTrialProjector for ContactProjector<'_> {
    /// Two passes, because equipment cannot be projected until its body has
    /// been. A body impulse drags everything that body holds, so an arm's trial
    /// velocity is its own accumulator *plus* the body's applied delta -- and
    /// the joint clamp below then asks whether the arm could have got there at
    /// all, but only of the arms that went somewhere.
    ///
    /// **A row that did not move its hand is not re-derived**, and that is the
    /// same rule -- with the same reason behind it -- that the final commit
    /// keeps. `hand_position` is not the exact inverse of `inverse_hand`, so
    /// asking the joint about a hand it already agreed to answers with the
    /// round trip's own error, which lands directly on the velocity the
    /// closure's energy is measured from. See the alpha-zero note in
    /// `resolve_group_into` for what that cost before it was recognised.
    fn project(
        &mut self,
        before: &[GeneralizedCollider],
        sums: &[[i128; 3]],
        alpha_raw: u32,
        out: &mut Vec<GeneralizedCollider>,
    ) -> Result<(), ResolutionError> {
        out.clear();
        out.extend_from_slice(before);
        self.bodies.clear();
        for (row, sum) in out.iter_mut().zip(sums) {
            // `scaled_delta` divides by this, so it is checked here rather than
            // left to a debug assertion inside it.
            if row.mass <= Fx::ZERO { return Err(ResolutionError::Mass); }
            if row.kind != GeneralizedKind::Body { continue; }
            let delta = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
            // The Z component is discarded rather than clamped: a body's
            // vertical reaction is the floor's, and v2-14 gives a body no
            // vertical degree of freedom at all. Nothing here can lift a
            // fighter, however hard it is hit from below.
            let velocity = clamp_contact_velocity(
                Vec3::new(row.velocity.x + delta.x, row.velocity.y + delta.y, Fx::ZERO));
            self.bodies.push(BodyTrial { entity: row.entity, velocity, delta: velocity - row.velocity });
            row.velocity = velocity;
        }
        for (row, sum) in out.iter_mut().zip(sums) {
            if row.kind == GeneralizedKind::Body { continue; }
            // The closure always carries the owning body of every fact
            // participant, so a missing one is a broken closure and not a case
            // to paper over with the un-translated velocity.
            let body = *self.bodies.iter().find(|body| body.entity == row.entity)
                .ok_or(ResolutionError::ColliderIndex)?;
            let own = resolution::scaled_delta(*sum, alpha_raw, row.mass.raw());
            // The velocity this row would have from riding its body alone.
            // Measured rather than assumed to be zero: a bystander collider in
            // the closure carries no accumulator of its own and still gets
            // translated, and `body.delta` is the whole of what it gets.
            //
            // `requested` keeps the three-term order it has always had rather
            // than being built from `translated`: `Fx` addition saturates, so
            // the two groupings are the same number everywhere the clamp can
            // reach and not provably the same number everywhere else.
            let translated = row.velocity + body.delta;
            let requested = clamp_contact_velocity(row.velocity + own + body.delta);
            row.velocity = if requested == translated {
                // The hand is where it was, because the translation moved body
                // and hand together and nothing else touched it. Its joint has
                // already agreed to that pose once -- the actuator or the last
                // commit built it through this very map -- so re-deriving it
                // now can only add the map's own error. At alpha zero *every*
                // row lands here, which is what makes the trial the identity
                // the alpha search assumes it is.
                translated
            } else {
                self.world.joint_clamped_velocity(
                    *row, self.entry, body.velocity, requested)?
            };
        }
        Ok(())
    }

    /// Turn one settled group into wounds.
    ///
    /// Three passes, and the order is the contract's. The first reads every
    /// fact against **one** pre-group anatomy and accumulates; the second
    /// applies the accumulators once and derives severance; the third takes the
    /// severed regions out of the geometry so the next re-sweep cannot use them.
    /// Death is not decided here at all -- it is a question for the whole tick,
    /// asked after the last group, which is what lets two fighters kill each
    /// other on one mapped time.
    fn after_group(
        &mut self,
        colliders: &mut [ContactCollider],
        rows: &mut [ContactResolution],
    ) -> Result<(), ResolutionError> {
        // Copied out of `self` so the immutable spec borrows it hands back do
        // not overlap the mutable anatomy borrows below. `&World` is `Copy`.
        let world = self.world;
        self.deltas.clear();
        self.deltas.resize(self.wounds.len(), AnatomyDelta::default());
        self.fact_loss.clear();
        self.fact_loss.resize(rows.len(), Fx::ZERO);

        // Pass one: measure. Rows arrive in `ContactKey` order and nothing here
        // writes `self.wounds`, so every fact in the group reads the same body.
        for (at, row) in rows.iter_mut().enumerate() {
            if row.fact.key.kind != ContactKind::WeaponBody { continue; }
            let Some(target) = world.resolve(row.fact.key.b) else { continue };
            let Some(part) = BodyPart::from_index(row.fact.region as usize) else { continue };
            let Some(spec) = world.anatomy_spec(target) else { continue };
            let before = self.wounds[target].parts[part as usize];
            if before.severed { continue; }

            let incoming = row.cut_raw.checked_add(row.thrust_raw)
                .ok_or(ResolutionError::EnergyNumerator)?;
            let square = anatomy::squareness(
                row.fact.velocity_a - row.fact.velocity_b,
                outward_region_normal(colliders, row.fact.key.b, part, row.fact.point,
                                      world.body_yaw[target].angle),
            );
            let ledger = anatomy::armor_transfer(incoming, spec.armor[part as usize], square);
            row.deflected_raw = ledger.deflected;

            // Clamped against the *pre-group* integrity, so two simultaneous
            // blows on one region are each measured against the body that was
            // standing when the group began. Their sum may exceed it; the apply
            // pass floors at zero and credit is split out of the health the
            // query actually lost, so nothing is double-counted downstream.
            let loss_raw = anatomy::integrity_loss_raw(ledger.penetrating)
                .min(before.integrity.raw().max(0) as u128);
            let wound_raw = anatomy::cut_share(loss_raw, row.cut_raw, incoming);
            let loss = Fx::from_raw(loss_raw as i32);
            self.fact_loss[at] = loss;
            let delta = &mut self.deltas[target];
            delta.touched = true;
            delta.parts[part as usize].integrity_loss += loss;
            delta.parts[part as usize].wound_gain += Fx::from_raw(wound_raw as i32);
            delta.integrity_loss += loss;
            if loss.is_positive() { delta.last_attacker = row.fact.key.a; }
        }

        // Pass two: apply, once, and hand out credit in `ContactKey` order
        // against what the health query actually lost.
        for target in 0..self.wounds.len() {
            if !self.deltas[target].touched { continue; }
            let Some(spec) = world.anatomy_spec(target) else { continue };
            let delta = self.deltas[target];
            let health_before = self.wounds[target].health(spec);
            let state = &mut self.wounds[target];
            let gain = anatomy::shock_gain(state, spec, delta.integrity_loss);
            state.shock += gain;
            for part in 0..BodyPart::COUNT {
                let maximum = spec.integrity_maxima[part];
                let row = &mut state.parts[part];
                row.integrity = (row.integrity - delta.parts[part].integrity_loss).max(Fx::ZERO);
                row.wound = (row.wound + delta.parts[part].wound_gain).min(maximum);
                if !row.integrity.is_positive() { row.severed = true; }
            }
            if !delta.last_attacker.is_none() { state.last_attacker = delta.last_attacker; }
            // Credit is the health the query actually lost, split between the
            // group's facts in proportion to what each of them took off and in
            // `ContactKey` order, with the last contributor taking the exact
            // remainder. Crediting the applied integrity loss directly would
            // measure the wrong thing: the torso is worth two sixths of the
            // weighted fraction, so the same loss there moves health twice as
            // far as it does on a limb, and the later bleed credit already
            // reports the query's own decrease.
            let after = self.wounds[target];
            let decrease = (health_before - after.health(spec)).max(Fx::ZERO).raw() as i64;
            let mut total = 0i64;
            let mut last = None;
            for (at, row) in rows.iter().enumerate() {
                if !self.fact_loss[at].is_positive() { continue; }
                if row.fact.key.kind != ContactKind::WeaponBody { continue; }
                if world.resolve(row.fact.key.b) != Some(target) { continue; }
                total += self.fact_loss[at].raw() as i64;
                last = Some(at);
            }
            let mut used = 0i64;
            for (at, row) in rows.iter_mut().enumerate() {
                if row.fact.key.kind != ContactKind::WeaponBody { continue; }
                if world.resolve(row.fact.key.b) != Some(target) { continue; }
                let loss = self.fact_loss[at];
                // Only a fact that took something off can have severed
                // anything. Two facts that between them empty a region are both
                // reported -- they both took part, and choosing between them by
                // whether either would have sufficed alone is an arbitrary rule
                // with no consumer -- but a fact that penetrated nothing severed
                // nothing, however the region ended up.
                if loss.is_positive() {
                    if let Some(part) = BodyPart::from_index(row.fact.region as usize) {
                        row.severed = after.parts[part as usize].severed;
                    }
                } else {
                    continue;
                }
                let share = if Some(at) == last {
                    decrease - used
                } else {
                    decrease * loss.raw() as i64 / total
                };
                // Counted as used whether or not anyone collects it. A source
                // that has died since the blow was struck pays nobody -- the
                // legacy arrow path answers the same way -- but its share is
                // still spent, or the remainder the last contributor takes
                // would hand somebody else damage that fact did.
                used += share;
                if share <= 0 { continue; }
                if let Some(source) = world.resolve(row.fact.key.a) {
                    self.credit[source] += Fx::from_raw(share as i32);
                }
            }
        }

        // Pass three: take the severed regions out of the tick they were lost in.
        for row in colliders.iter_mut() {
            let Some(owner) = world.resolve(row.entity) else { continue };
            if !self.deltas.get(owner).is_some_and(|delta| delta.touched) { continue; }
            let state = self.wounds[owner];
            match &mut row.shape {
                ContactShape::Body { parts, .. } => {
                    for part in 0..BodyPart::COUNT {
                        if state.parts[part].severed { parts[part].present = false; }
                    }
                }
                // A two-handed item answers to both arms and is owned by the
                // right one, so keying this off `row.slot` alone would leave a
                // greatsword swinging for the rest of a tick that took its
                // wielder's *left* arm off -- and `release_severed_grips` drops
                // both hands at tick end, so the two rules would disagree for
                // exactly one tick every time.
                _ => {
                    let gone = |part| !state.present(part);
                    let dropped = if world.two_handed(owner) {
                        gone(BodyPart::LeftArm) || gone(BodyPart::RightArm)
                    } else {
                        limb_body_part(row.slot).is_some_and(gone)
                    };
                    if dropped { row.present = false; }
                }
            }
        }
        Ok(())
    }
}

/// The `BodyPart` a non-body collider slot belongs to, or `None` for a slot
/// that names no limb.
/// Bit `part as u8` per severed region, in [`BodyPart`] order.
///
/// One writer for the two published masks -- the pose row's and the
/// observation's -- because two loops over the same five booleans are two
/// chances to disagree about which bit `Legs` is.
fn severed_mask_of(state: &AnatomyState) -> u8 {
    let mut mask = 0u8;
    for part in 0..BodyPart::COUNT {
        if state.parts[part].severed { mask |= 1 << part; }
    }
    mask
}

fn limb_body_part(slot: u8) -> Option<BodyPart> {
    match slot {
        s if s == LimbSlot::LeftArm as u8 => Some(BodyPart::LeftArm),
        s if s == LimbSlot::RightArm as u8 => Some(BodyPart::RightArm),
        _ => None,
    }
}

/// The outward normal of one region at the pose the group resolved on.
///
/// From the medial point to the contact, which is the direction a plate's
/// surface faces there. A contact exactly on the axis has no direction to
/// report -- a zero-radius region resolves there every time -- and the contract
/// answers body forward rather than inventing one. That is a *stable* answer,
/// not a flattering one: how square the blow then reads depends on where the
/// weapon was going, exactly as it does everywhere else, and a body struck
/// along its own facing reads square while one struck across it reads a graze.
fn outward_region_normal(
    colliders: &[ContactCollider], body: EntityId, part: BodyPart, point: Vec3, yaw: Angle,
) -> Vec3 {
    let forward = Vec3::new(yaw.cos(), yaw.sin(), Fx::ZERO);
    let Some(row) = colliders.iter().find(|row| {
        row.entity == body && matches!(row.shape, ContactShape::Body { .. })
    }) else { return forward };
    let ContactShape::Body { parts, .. } = row.shape else { return forward };
    let volume = parts[part as usize];
    let delta = point - medial_point(point, volume.previous_lower, volume.previous_upper);
    let normal = delta.normalized_or_zero();
    if normal == Vec3::ZERO { forward } else { normal }
}

/// The shifted body sweep, written once so the collider builder and the world
/// accessor cannot drift apart on the one rule that keeps positional overlap
/// correction out of contact velocity.
fn body_sweep_from(settled: Vec2, entry: &TickEntry) -> (Vec2, Vec2) {
    (settled - entry.locomotion, settled)
}

/// The componentwise entry clamp. See `CONTACT_COMPONENT_SPEED_LIMIT` for why
/// the limit is not the four a reader would expect.
fn clamp_contact_velocity(value: Vec3) -> Vec3 {
    const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
    Vec3::new(value.x.clamp(-L, L), value.y.clamp(-L, L), value.z.clamp(-L, L))
}

/// The unconsumed fraction of the tick after the last group `entity` was in, as
/// a raw numerator over 65,536.
///
/// An entity with no resolution answers a whole tick, which is exactly right
/// for the other caller: an entry clamp happens at global time zero, so the
/// pose change it makes is spread over the whole tick and its scalar speeds are
/// the difference undivided.
fn last_group_remaining(rows: &[ContactResolution], entity: EntityId) -> u32 {
    let mut latest = 0u32;
    for row in rows {
        if row.fact.key.a != entity && row.fact.key.b != entity { continue; }
        latest = latest.max(row.fact.toi.get().raw().max(0) as u32);
    }
    65_536 - latest.min(65_536)
}

/// One scalar joint difference as a per-tick rate: what contact changed,
/// divided by the fraction of the tick it had left to change it in.
///
/// Truncating toward zero, which is what Rust's integer division does and what
/// the contract asks for. A fully consumed tick has no remaining fraction to
/// divide by and reports zero rather than an unbounded rate.
fn scalar_speed(difference: i32, remaining_raw: u32) -> i32 {
    if remaining_raw == 0 { return 0; }
    let scaled = difference as i64 * 65_536 / remaining_raw as i64;
    scaled.clamp(i32::MIN as i64, i32::MAX as i64) as i32
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
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SpawnError {
    CombatSpec(CombatSpecError),
    Contact(ContactCapacityError),
}

impl From<SpawnError> for WorldBuildError {
    fn from(error: SpawnError) -> WorldBuildError {
        match error {
            SpawnError::CombatSpec(spec) => WorldBuildError::CombatSpec(spec),
            SpawnError::Contact(contact) => WorldBuildError::Contact(contact),
        }
    }
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
        if scenario.combat_model == crate::CombatModel::Articulated {
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
            arms: Vec::with_capacity(n),
            grips: Vec::with_capacity(n),
            shield_pose: Vec::with_capacity(n),
            move_authority: Vec::with_capacity(n),
            turn_authority: Vec::with_capacity(n),
            arm_authority: Vec::with_capacity(n),
            wounds: Vec::with_capacity(n),
            contact: match scenario.combat_model {
                crate::CombatModel::Legacy => None,
                crate::CombatModel::Articulated => Some(ContactRuntime::default()),
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
            nav: [
                [Nav::default(), Nav::default()],
                [Nav::default(), Nav::default()],
            ],
            nav_queue: Vec::new(),
            nav_seeds: Vec::new(),
            blows: Vec::new(),
            pierces: Vec::new(),
            impulses: Vec::new(),
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
        match self.combat_model {
            crate::CombatModel::Legacy => {
                if spec.articulated.is_some() {
                    return Err(SpawnError::CombatSpec(CombatSpecError::UnexpectedTable));
                }
            }
            crate::CombatModel::Articulated => {
                let row = spec.articulated
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::UnitPresence))?;
                let table = self.combat_specs.as_ref()
                    .ok_or(SpawnError::CombatSpec(CombatSpecError::MissingTable))?;
                crate::combat::spec::validate_rows(table, &[row], &[spec.loadout])
                    .map_err(SpawnError::CombatSpec)?;
                check_contact_envelope(self.arena, spec.spawn, table, row)
                    .map_err(SpawnError::Contact)?;
                // A reused slot raises no high water and therefore reserves
                // nothing, which is the property that makes a respawn free.
                let prospective = match self.free.last() {
                    Some(_) => self.alive.len(),
                    None => self.alive.len() + 1,
                };
                self.try_reserve_contact_slots(prospective).map_err(SpawnError::Contact)?;
            }
        }
        Ok(self.spawn_validated(spec))
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

    /// The resolutions the last solved tick completed, sorted by
    /// `(group_ordinal, ContactKey)`. Evidence and not a second authority:
    /// v2-15 consumes each group as it is produced, and nothing may rebuild
    /// state by summing these rows.
    pub fn contact_resolutions(&self) -> &[ContactResolution] {
        self.contact.as_ref().map_or(&[], |contact| contact.resolutions.as_slice())
    }

    /// How many ticks have exhausted the group cap. Hashed; zero in Legacy.
    pub fn contact_cap_hits(&self) -> u32 {
        self.contact.as_ref().map_or(0, |contact| contact.state.cap_hits)
    }

    /// How many ticks the contact solver refused outright. Not hashed; zero in
    /// Legacy, and zero on the articulated duel fixture.
    ///
    /// The companion to [`World::contact_resolutions`] rather than a second
    /// reading of it: a rejected tick publishes no rows at all, so a caller
    /// auditing the ledger those rows carry is auditing only the ticks that
    /// succeeded. Anything but zero here says the audit had a blind spot and
    /// how wide it was.
    ///
    /// The first time it was asked, on 2026-08-10, it answered 236 of every
    /// 3,600 ticks under the twelve-phase script, every one of them
    /// [`ResolutionError::Projector`] -- 6.5% of the fight computed, rejected
    /// and silently rolled back. The cause was [`ContactProjector::project`]
    /// re-deriving *every* equipment row through the joint's inexact inverse
    /// map at every alpha including zero, so the round trip's own drift read as
    /// created energy. Checkpoint B fixed it there, by recognising an unmoved
    /// hand as unmoved; the number is kept because a counter that has only ever
    /// been zero proves nothing, and this one has already paid for itself once.
    pub fn contact_solver_rejections(&self) -> u32 {
        self.contact.as_ref().map_or(0, |contact| contact.rejections)
    }

    /// Why the first refused tick was refused, if any was.
    pub fn first_contact_rejection(&self) -> Option<ResolutionError> {
        self.contact.as_ref().and_then(|contact| contact.first_rejection)
    }

    /// Every retained contact capacity, for the no-growth proofs. Capacity is
    /// not authoritative state and this deliberately is not public.
    #[cfg(test)]
    fn contact_capacities(&self) -> Vec<usize> {
        let Some(contact) = self.contact.as_ref() else { return Vec::new() };
        let mut rows = contact.scratch.capacities();
        rows.push(contact.colliders.capacity());
        rows.push(contact.resolutions.capacity());
        rows.push(contact.entry.capacity());
        rows.push(contact.bodies.capacity());
        rows.push(contact.anatomy_entry.capacity());
        rows.push(contact.credit.capacity());
        rows.push(contact.deltas.capacity());
        rows.push(contact.fact_loss.capacity());
        rows
    }

    fn spawn_validated(&mut self, spec: &UnitSpec) -> EntityId {
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
                if self.combat_model == crate::CombatModel::Articulated {
                    let arm = actuator::tucked_arm(Vec3::ZERO);
                    self.body_yaw.push(BodyYawState { angle: Angle::ZERO, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO });
                    self.arms.push([arm; 2]);
                    self.grips.push([GripState { equipment_slot: None }; 2]);
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
        if self.combat_model == crate::CombatModel::Articulated {
            self.initialize_articulated_pose(i);
        }
        self.last_attacker[i] = EntityId::NONE;
        self.last_combat[i] = self.tick;
        self.regen_left[i] = max_hp * rules::REGEN_BUDGET;
        self.damage_dealt[i] = Fx::ZERO;
        self.blade_was[i] = None;
        self.blade_p[i] = Fx::ZERO;
        self.id_of(i)
    }

    // ---------------------------------------------------------------- agent boundary

    /// Entities whose decision clock has come due. Ask each one for a command
    /// via [`World::observe`] + [`World::submit`], then [`World::step`].
    #[inline]
    pub fn pending_decisions(&self) -> &[EntityId] {
        &self.pending
    }

    /// What `id` can perceive right now.
    ///
    /// Returns a blank observation for a stale handle rather than panicking --
    /// the sim is total, and callers driving a replay may name the dead.
    pub fn observe(&self, id: EntityId) -> Observation {
        let i = match self.resolve(id) {
            Some(i) => i,
            None => {
                return Observation::blank(self.tick, id, Faction::Heroes, Vec2::ZERO, Order::Hold)
            }
        };

        let stats = self.stats[i];
        let me = self.pos[i];
        let mut obs = Observation::blank(
            self.tick,
            id,
            self.faction[i],
            me,
            self.orders[self.faction[i].index()],
        );

        let spec = self.action_of(i).spec();
        obs.hp_frac = self.health_fraction_of(i);
        obs.radius = self.radius[i];
        obs.action_length = spec.length;
        obs.action_arc = spec.arc;
        obs.min_strike_range = self.dead_zone(i);
        obs.limb = self.limb[i];
        obs.sight_range = stats.sight_range();
        // **What this body will actually settle at**, which is what
        // `apply_movement` computes and therefore what this field has always
        // claimed to be. Missing the bonus is not a shortfall in a percept, it
        // is the percept being wrong: `DuelistPolicy` divides by this in its
        // `sqrt(2*a*d)` braking law to pace a final stride, so a running fighter
        // would brake for a walk and slide straight through its own station.
        //
        // Moves nothing today -- `move_bonus` is exactly `Fx::ONE` for every row
        // that was playable before `Run` landed, and a multiply by one is
        // bit-exact -- which is what makes this safe to land ahead of the mind
        // that will use it.
        obs.move_speed = stats.move_speed() * spec.move_bonus;
        obs.traction = stats.traction();
        obs.velocity = self.vel[i];
        obs.recoil_drift = self.recoil_drift(i);
        obs.decision_period = stats.decision_period();
        // `1` only if a cut could begin this tick, and otherwise how far through
        // whatever is stopping it. A hand back at guard but not re-armed reports
        // *zero* rather than one: it is physically ready and the policy is not,
        // and that is a distinction worth being able to see.
        obs.held = self.action_of(i);
        obs.slot = self.slot[i];
        obs.stowed = self.stowed_of(i);
        obs.swap_ticks = self.swap_ticks(i);
        obs.attack_ready = {
            let limb = self.limb[i];
            match limb.swing {
                // A limb with nothing to attack with is never ready, whatever
                // phase it happens to be sitting in. `can_attack` and not
                // `is_live_capable`: a drawn bow has no blade and is very much
                // readying an attack.
                _ if !spec.role.can_attack() => Fx::ZERO,
                Swing::Guard if limb.armed => Fx::ONE,
                Swing::Guard => Fx::ZERO,
                // Capped below one so no unready phase can ever claim to be
                // ready, however close to the end of itself it is.
                _ => limb.phase_progress(self.arm(i)) * Fx::from_ratio(9, 10),
            }
        };
        // To the nearest masonry, which on a floor plan with nothing carved is
        // the arena edge and is bit-for-bit the four expressions that used to
        // be written out here. See [`Dungeon::clearance`].
        obs.wall_clearance = Cardinal::ALL.map(|dir| self.dungeon.clearance(me, dir));
        let (nav_dir, nav_distance) = self.nav_step(i);
        obs.nav_dir = nav_dir;
        obs.nav_distance = nav_distance;

        // Selection happens on ground truth (you notice what is genuinely
        // nearest); noise is applied afterwards to what was noticed. Drawing
        // noise per candidate instead would cost an RNG call per entity pair
        // and would not change the character of the mistake.
        let sight = stats.sight_range();
        let cap = stats.tracked_contacts();
        let mut enemies = Nearest::new(cap);
        let mut allies = Nearest::new(cap);
        for j in 0..self.alive.len() {
            if j == i || !self.alive[j] {
                continue;
            }
            let distance = (self.pos[j] - me).length();
            if distance > sight {
                continue;
            }
            // Rock stops eyes. Applied to allies as well as enemies: `cohesion`
            // and `ally_centre` steer toward the mean of what is in view, and a
            // body pulled toward a squadmate on the far side of a wall walks
            // into the wall for exactly the reason a body pulled toward an enemy
            // does.
            //
            // Free and bit-identical on an uncarved plan; see `Dungeon::sees`.
            if !self.dungeon.sees(me, self.pos[j]) {
                continue;
            }
            if self.faction[j] == self.faction[i] {
                allies.offer(distance, j);
            } else {
                enemies.offer(distance, j);
            }
        }

        // One stream per (seed, tick, entity): what an agent misperceives
        // depends on who it is and when, never on iteration order.
        let mut rng = Rng::from_stream(
            self.seed,
            self.tick as u64,
            ((i as u64) << 32) | self.generation[i] as u64,
        );
        let noise = stats.perception_noise();

        let mut buffer = [Contact::default(); MAX_CONTACTS];
        for (slot, &(_, j)) in enemies.items().iter().enumerate() {
            buffer[slot] = self.contact(i, j, noise, &mut rng);
        }
        obs.set_enemies(&buffer[..enemies.len()]);

        for (slot, &(_, j)) in allies.items().iter().enumerate() {
            buffer[slot] = self.contact(i, j, noise, &mut rng);
        }
        obs.set_allies(&buffer[..allies.len()]);

        obs.articulated = self.observe_articulated(id);
        obs
    }

    /// What `id` can perceive of the articulated fight.
    ///
    /// The subject-scoped twin of [`World::observe`], and total in exactly the
    /// same way: a stale identity, a corpse, or a Legacy world answers
    /// [`ArticulatedObservation::BLANK`] rather than panicking, because callers
    /// driving a replay may name the dead. Deadness is the query's own answer
    /// and not a consequence of when it was asked, for the reason
    /// [`World::articulated_pose`] gives.
    ///
    /// It is called once per [`World::observe`] and lands in
    /// [`Observation::articulated`], where it returns on the model check before
    /// touching a column. That is not free to a Legacy world: `Observation`
    /// carries the 2032-byte block by value, so every observation copies it
    /// twice and zero-fills a vector twice as wide. Measured at 6% of `lab
    /// bench`; guarding this call on the model does not recover it, because the
    /// cost is the embedding rather than the call. The separate entry point
    /// exists for the articulated policy seam, which wants the subject picture
    /// without the legacy one.
    ///
    /// **Selection is on ground truth**, exactly as the legacy contact list is:
    /// you notice what is genuinely nearest, and noise is applied afterwards to
    /// what was noticed. What differs from the legacy path is the cap --
    /// [`MAX_ARTICULATED_OPPONENTS`], not [`Stats::tracked_contacts`] -- because
    /// this block's width is a fixed wasm row stride before it is a percept, and
    /// a dim character's rows are blurred rather than fewer.
    ///
    /// Opposing faction only. There is no ally block in the articulated ABI at
    /// all, and inventing one here would be a width change rather than a
    /// selection change.
    ///
    /// [`Stats::tracked_contacts`]: crate::Stats::tracked_contacts
    pub fn observe_articulated(&self, id: EntityId) -> ArticulatedObservation {
        if self.combat_model != crate::CombatModel::Articulated {
            return ArticulatedObservation::BLANK;
        }
        let Some(i) = self.resolve(id) else { return ArticulatedObservation::BLANK };
        let Some(state) = self.wounds.get(i).copied() else { return ArticulatedObservation::BLANK };
        if state.is_dead() { return ArticulatedObservation::BLANK; }
        let Some(spec) = self.anatomy_spec(i) else { return ArticulatedObservation::BLANK };

        let me = self.pos[i];
        let body = Vec3::new(me.x, me.y, Fx::ZERO);
        let command = self.articulated_command[i].unwrap_or_else(|| self.neutral_articulated(i));
        let targets = self.articulated_targets(i, spec, &command);
        // Proprioception is free, so every column below is ground truth. The
        // rule is [`Observation::position`]'s and it does not weaken because
        // the body grew joints: a fighter knows where its own hand is however
        // dim it is.
        let arms = core::array::from_fn(|limb| {
            let arm = self.arms[i][limb];
            let part = limb_body_part(limb as u8).expect("a limb slot") as usize;
            ObservedArm {
                hand: body + arm.hand,
                target_hand: body + targets[limb],
                // Body-relative, matching `PosedArm::velocity`. See its doc for
                // why the sum is not published instead.
                velocity: arm.linear_velocity,
                fatigue: arm.fatigue,
                integrity_fraction: anatomy::part_fraction(&state, spec, part),
                severed: state.parts[part].severed,
                // What the grip actually holds, resolved through the carried
                // slot the same way `equipment_in_grip` resolves it.
                //
                // **Deliberately not subject to the one-collider ownership
                // rule**, unlike the weapon capability bits and the drawn
                // geometry beside them: a two-handed item is in both grips,
                // both grip bits are set for exactly that reason, and this
                // field answers "what is this hand holding" rather than "who
                // owns the collider". A reader wanting the owner asks the
                // weapon bit; a reader wanting the hand asks this.
                equipment: self.grips[i][limb].equipment_slot.and_then(|slot| {
                    self.articulated_carried[i].get(slot as usize).copied().flatten()
                }),
            }
        });

        let stats = self.stats[i];
        let sight = stats.sight_range();
        let mut seen = Nearest::new(MAX_ARTICULATED_OPPONENTS);
        for j in 0..self.alive.len() {
            if j == i || !self.alive[j] { continue; }
            if self.faction[j] == self.faction[i] { continue; }
            let delta = self.pos[j] - me;
            if delta.length() > sight { continue; }
            // Rock stops eyes, the same predicate and the same reason as the
            // legacy list. Free and bit-identical on an uncarved plan.
            if !self.dungeon.sees(me, self.pos[j]) { continue; }
            // An articulated body with no anatomy cannot be built into a row,
            // and construction never produces one. Filtered here rather than
            // handled below so a retained row is always a complete row -- the
            // noise stream draws per retained row, and a row that blanked
            // itself afterwards would leave a hole in the middle of the list.
            if self.anatomy_spec(j).is_none() { continue; }
            // The reference's key. `length_sq` and not `length`: it saturates
            // past ~181 units and no arena is that wide, and the two order
            // identically apart from where fixed-point rounding separates a
            // tie. The stated tie-break is (index, generation) and `Nearest`
            // breaks on the slot index, which is the same order -- a live slot
            // has exactly one generation, so generation can never be reached.
            seen.offer(delta.length_sq(), j);
        }

        // A stream of its own, and that is the entire point of the domain: this
        // draws at the same (seed, tick, entity) as the legacy observation, so
        // without a domain the two would hand the same body the same numbers
        // and a policy reading both would see one error twice. Folded into the
        // seed argument because `from_stream` has only two coordinates and both
        // are already spoken for.
        let mut rng = Rng::from_stream(
            self.seed ^ ARTICULATED_OBSERVATION_DOMAIN,
            self.tick as u64,
            ((i as u64) << 32) | self.generation[i] as u64,
        );
        let noise = stats.perception_noise();
        let mut opponents = [ObservedOpponent::BLANK; MAX_ARTICULATED_OPPONENTS];
        for (slot, &(_, j)) in seen.items().iter().enumerate() {
            opponents[slot] = self.observed_opponent(i, j, noise, &mut rng);
        }

        ArticulatedObservation {
            tick: self.tick,
            subject: id,
            capabilities: self.articulated_capabilities(i, &state),
            body_position: body,
            body_yaw: self.body_yaw[i].angle,
            body_velocity: Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO),
            arms,
            shield: match self.shield_pose[i] {
                Some(pose) => ObservedShield {
                    present: true,
                    centre: body + pose.centre,
                    normal: pose.normal,
                    half_width: pose.half_width,
                    half_height: pose.half_height,
                },
                None => ObservedShield::BLANK,
            },
            blood_fraction: anatomy::blood_fraction(&state, spec),
            shock: state.shock,
            integrity_fraction: core::array::from_fn(|part| anatomy::part_fraction(&state, spec, part)),
            wound_fraction: core::array::from_fn(|part| anatomy::part_wound_fraction(&state, spec, part)),
            severed_mask: severed_mask_of(&state),
            opponent_count: seen.len() as u8,
            opponents,
        }
    }

    /// What this body can currently do, as the reference's eight bits.
    ///
    /// Every rule is a **presence** fact -- a region is attached, a grip holds
    /// something, an item has a geometry -- and never a threshold on a
    /// continuous column, because the reference calls these bits categorical
    /// and noise-free and a bit derived from `arm_authority` would flicker as
    /// shock crossed a boundary. Each constant's doc argues its own rule and
    /// names what was rejected.
    fn articulated_capabilities(&self, i: usize, state: &AnatomyState) -> u32 {
        let mut bits = 0u32;
        if state.present(BodyPart::Legs) {
            bits |= ArticulatedObservation::MOVEMENT | ArticulatedObservation::TURNING;
        }
        let grip = [ArticulatedObservation::LEFT_GRIP, ArticulatedObservation::RIGHT_GRIP];
        let weapon = [ArticulatedObservation::LEFT_WEAPON, ArticulatedObservation::RIGHT_WEAPON];
        for limb in 0..2 {
            if self.grips[i][limb].equipment_slot.is_some() { bits |= grip[limb]; }
            let Some(item) = self.equipment_in_grip(i, limb) else { continue };
            // The pose row's ownership rule, repeated because a set bit and a
            // drawn weapon that disagreed about a two-handed item would put a
            // second sword in the fight.
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            if matches!(item.geometry, EquipmentGeometry::Segment { .. }) { bits |= weapon[limb]; }
        }
        // Read off the derived pose rather than off the grips, so one face is
        // one bit however many hands are on it.
        if self.shield_pose[i].is_some() { bits |= ArticulatedObservation::SHIELD; }
        if self.two_handed(i) { bits |= ArticulatedObservation::TWO_HANDED; }
        bits
    }

    /// One perceived opponent row, drawn against `rng` in the reference's
    /// order.
    ///
    /// **Seven draws, always seven.** Body position XYZ, body velocity XYZ,
    /// timing -- and all seven whatever this body happens to be carrying,
    /// because a row that drew fewer when a shield was missing would shift
    /// every row after it. What one fighter perceives would then depend on what
    /// somebody else is holding, which is not a perception model, it is a bug
    /// with a plausible story.
    ///
    /// Z is drawn along with X and Y even though a body has no vertical degree
    /// of freedom today. The stream is an ABI and it does not get to depend on
    /// which axes the physics currently uses; the day a body leaves the floor,
    /// nothing about the numbering moves.
    ///
    /// **The geometry is translated, never re-derived.** Every region, weapon
    /// and shield is built at the *measured* body origin, which is exactly the
    /// reference's "keeps its exact local shape and is translated by
    /// measured-minus-true". Blurring each point separately would shear a body
    /// into disconnected parts -- an arm three feet from its shoulder -- and
    /// that is not what poor eyesight does to a silhouette.
    fn observed_opponent(&self, i: usize, j: usize, noise: Fx, rng: &mut Rng) -> ObservedOpponent {
        // `Rng::signed_unit` is the reference's conversion under its own name:
        // `(draw >> 15) as i32 - 65_536`, read as an `Fx` raw, giving a
        // fraction in [-1, 1). Writing it out again here would be a second copy
        // of a formula `fx` already owns and tests.
        let mut jitter = [Fx::ZERO; 7];
        for draw in jitter.iter_mut() { *draw = rng.signed_unit(); }

        let measured = Vec3::new(
            self.pos[j].x + jitter[0] * noise,
            self.pos[j].y + jitter[1] * noise,
            jitter[2] * noise,
        );
        // A quarter of the positional error. Velocity is a difference of two
        // positions a tick apart, so an eye that misplaces a body by a stride
        // does not misjudge its heading by a stride per tick.
        let velocity = Vec3::new(
            self.vel[j].x + jitter[3] * noise / 4,
            self.vel[j].y + jitter[4] * noise / 4,
            jitter[5] * noise / 4,
        );

        let anatomy = self.anatomy_spec(j).expect("a selected opponent has an anatomy");
        let state = self.wounds.get(j).copied().unwrap_or(AnatomyState::EMPTY);
        let present: [bool; BodyPart::COUNT] =
            core::array::from_fn(|part| !state.parts[part].severed);
        let yaw = self.body_yaw[j].angle;
        let regions = geometry::body_region_volumes(
            measured, anatomy, yaw,
            [self.arms[j][0].hand, self.arms[j][1].hand], present);

        let mut weapons = [None; 2];
        for limb in 0..2 {
            let Some(item) = self.equipment_in_grip(j, limb) else { continue };
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            weapons[limb] = geometry::segment_pose(measured, self.arms[j][limb], item);
        }

        // The reference's timing formula, read off the observation's own
        // columns and in the written order. The opponent terms are the measured
        // ones and the subject's are exact, so a policy that recomputed this
        // from the published numbers gets the published answer back -- which it
        // would not if the sim quietly used ground truth here and blurred the
        // positions beside it.
        let delta_xy = Vec2::new(measured.x, measured.y) - self.pos[i];
        let distance = delta_xy.length();
        // `Vec2::normalize` is the reference's `normalized_or_zero`: same
        // function, and `fx` names it asymmetrically between two and three
        // dimensions. Adding an alias so the call site could match the prose
        // would be a duplicate for a spelling.
        let closing = (self.vel[i] - Vec2::new(velocity.x, velocity.y)).dot(delta_xy.normalize());
        let timing = if !closing.is_positive() {
            Fx::ONE
        } else {
            (distance / closing.max(Fx::from_ratio(1, 256))).clamp(Fx::ZERO, Fx::ONE)
        };

        ObservedOpponent {
            id: self.id_of(j),
            body_position: measured,
            body_velocity: velocity,
            body_yaw: yaw,
            regions,
            weapons,
            shield: match self.shield_pose[j] {
                Some(pose) => ObservedShield {
                    present: true,
                    centre: measured + pose.centre,
                    normal: pose.normal,
                    half_width: pose.half_width,
                    half_height: pose.half_height,
                },
                None => ObservedShield::BLANK,
            },
            severed_mask: severed_mask_of(&state),
            // An eighth of the positional error, and applied to both branches:
            // the "nothing is closing" one is a judgement like any other, and
            // skipping it there would make the noise term mean two things.
            contact_timing: (timing + jitter[6] * noise / 8).clamp(Fx::ZERO, Fx::ONE),
        }
    }

    /// Records `id`'s decision and pushes its next decision tick out by its
    /// [`Stats::decision_period`]. Stale handles are ignored.
    pub fn submit(&mut self, id: EntityId, command: Command) {
        if self.combat_model != crate::CombatModel::Legacy {
            return;
        }
        if let Some(i) = self.resolve(id) {
            self.command[i] = command;
            self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
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

    pub fn objective(&self, faction: Faction) -> Objective {
        self.objectives[faction.index()]
    }

    pub const fn combat_model(&self) -> crate::CombatModel {
        self.combat_model
    }

    /// Everything needed to draw one articulated body, in world space.
    ///
    /// One query rather than an accessor per column, and that is the whole
    /// design: a caller that assembled a pose out of a dozen getters would be
    /// free to mix the body-relative frame the actuator works in with the
    /// absolute frame the geometry lives in, which is precisely the mistake
    /// `combat::geometry` exists to make impossible. Here the conversion
    /// happens once, on the way out, and [`ArticulatedPose`] states the frame.
    ///
    /// `None` for a stale identity, a dead body, or a Legacy world; total for
    /// everything else. Deadness is checked here rather than left to the reap
    /// phase catching up, because "no pose for a corpse" should be a property
    /// of the query and not a property of when it happened to be called.
    ///
    /// Ground truth, with no perception noise and no visibility filtering. It
    /// is the host's job to decide who may see which row.
    pub fn articulated_pose(&self, id: EntityId) -> Option<ArticulatedPose> {
        if self.combat_model != crate::CombatModel::Articulated { return None; }
        let i = self.resolve(id)?;
        let state = *self.wounds.get(i)?;
        if state.is_dead() { return None; }
        let spec = self.anatomy_spec(i)?;
        let body = Vec3::new(self.pos[i].x, self.pos[i].y, Fx::ZERO);
        let yaw = self.body_yaw[i].angle;
        // The same substitution `drive_articulated_arms` makes, so the target
        // published is the one the arm is actually being driven toward. A slot
        // that never had a command is holding its neutral pose, not chasing
        // nothing, and a zero here would draw a reach line to the map origin.
        let command = self.articulated_command[i].unwrap_or_else(|| self.neutral_articulated(i));
        let targets = self.articulated_targets(i, spec, &command);

        let arms = core::array::from_fn(|limb| {
            let arm = self.arms[i][limb];
            PosedArm {
                hand: body + arm.hand,
                velocity: arm.linear_velocity,
                fatigue: arm.fatigue,
                target_hand: body + targets[limb],
            }
        });
        let mut weapons = [None; 2];
        for limb in 0..2 {
            let Some(item) = self.equipment_in_grip(i, limb) else { continue };
            // The collider builder's ownership rule, and it has to be the same
            // one: one item is one collider and one drawn weapon, owned by the
            // right arm.
            if item.binding == crate::GripBinding::Both && limb == LimbSlot::LeftArm as usize {
                continue;
            }
            weapons[limb] = geometry::segment_pose(body, self.arms[i][limb], item);
        }
        let shield = self.shield_pose[i]
            .map(|pose| ShieldPose { centre: body + pose.centre, ..pose });
        let severed_mask = severed_mask_of(&state);
        Some(ArticulatedPose {
            id,
            body,
            body_yaw: yaw,
            body_velocity: Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO),
            arms,
            weapons,
            shield,
            integrity_fraction: core::array::from_fn(|part| anatomy::part_fraction(&state, spec, part)),
            wound_fraction: core::array::from_fn(|part| anatomy::part_wound_fraction(&state, spec, part)),
            blood_fraction: anatomy::blood_fraction(&state, spec),
            shock: state.shock,
            severed_mask,
            // Read off the geometry above rather than off the grips, so a set
            // bit and a drawn item cannot disagree about a two-handed weapon,
            // a shield in a weapon slot, or an arm that just came off.
            equipment_mask: weapons[0].is_some() as u8
                | (weapons[1].is_some() as u8) << 1
                | (shield.is_some() as u8) << 2,
            intent: command.intent,
            hints: core::array::from_fn(|limb| self.animation_hint(i, limb, &state)),
        })
    }

    /// Every live articulated body's pose, in ascending full identity.
    ///
    /// A slot holds at most one live body, so ascending slot index *is*
    /// ascending `(index, generation)`. That is the order the browser
    /// boundary's pose buffer publishes rows in, and stating it here is what
    /// stops the host inventing a second one.
    ///
    /// An iterator and deliberately not a `Vec`: the only caller is the
    /// publication path in `crates/web`, where an allocation grows linear
    /// memory and growing linear memory detaches every typed array the page is
    /// holding. Empty on a Legacy world, where [`World::articulated_pose`]
    /// answers `None` for everything.
    pub fn articulated_poses(&self) -> impl Iterator<Item = ArticulatedPose> + '_ {
        let slots = self.alive.len();
        (0..slots).filter_map(|i| {
            if !self.alive[i] { return None; }
            self.articulated_pose(self.id_of(i))
        })
    }

    /// Where the actuator is driving each hand, in the **body-relative** frame
    /// the joint works in.
    ///
    /// Extracted so [`World::articulated_pose`] and
    /// [`World::observe_articulated`] cannot answer differently: a renderer
    /// drawing a reach line and a policy reading where its own hand is going
    /// are asking one question, and a second copy of this is a second thing to
    /// keep in step with the integrator.
    ///
    /// It repeats `integrate_arm`'s own reach clamp rather than trusting it.
    /// A published target the joint would refuse is a point the hand never
    /// reaches, so the arm reads as though it never arrived.
    fn articulated_targets(
        &self,
        i: usize,
        spec: &BodyAnatomySpec,
        command: &ArticulatedCommandV1,
    ) -> [Vec3; 2] {
        let yaw = self.body_yaw[i].angle;
        let mut targets = [Vec3::ZERO; 2];
        for limb in 0..2 {
            let arm = command.arms[limb];
            let reach = arm.reach.clamp(Fx::from_raw(actuator::ARM_MIN_REACH_RAW), Fx::ONE);
            targets[limb] = actuator::hand_position(spec, yaw, limb, arm.bearing, arm.height, reach);
        }
        if self.two_handed(i) {
            targets[0] = actuator::mirror_hand(spec, yaw, targets[1]);
        }
        targets
    }

    /// One arm's animation hint, in the reference's priority order.
    ///
    /// The order is the argument. Severance outranks everything, because a
    /// missing arm has no pose to be busy in. Both contact codes outrank both
    /// motion codes, because a tick that touched something is about the touch
    /// whatever the actuator meant to be doing. And the two contact codes are
    /// separated by whether the commit actually wrote the joint: an arm that
    /// was named in a resolution and came through it unmoved held its ground,
    /// which is a different thing to draw than one that was hauled.
    fn animation_hint(&self, i: usize, limb: usize, state: &AnatomyState) -> AnimationHint {
        let part = limb_body_part(limb as u8).expect("a limb slot");
        if state.parts[part as usize].severed { return AnimationHint::Severed; }
        let overrode = self.contact.as_ref().and_then(|contact| contact.entry.get(i))
            .is_some_and(|entry| entry.contact_overrode[limb]);
        if overrode { return AnimationHint::Recoiling; }
        let entity = self.id_of(i);
        let named = self.contact_resolutions().iter().any(|row| {
            let key = row.fact.key;
            (key.a == entity && key.a_slot as usize == limb)
                || (key.b == entity && key.b_slot as usize == limb)
        });
        if named { return AnimationHint::Contact; }
        let arm = self.arms[i][limb];
        let moving = arm.bearing_speed_turns != Fx::ZERO
            || arm.height_speed != Fx::ZERO
            || arm.reach_speed != Fx::ZERO;
        if moving { return AnimationHint::Chasing; }
        let shielded = self.equipment_in_grip(i, limb)
            .is_some_and(|item| matches!(item.geometry, EquipmentGeometry::Shield { .. }));
        if shielded { AnimationHint::Braced } else { AnimationHint::Idle }
    }

    #[cfg(test)]
    pub(crate) fn articulated_pose_test_view(&self, id: EntityId) -> Option<ArticulatedPoseTestView> {
        let i = self.resolve(id)?;
        if self.combat_model != crate::CombatModel::Articulated { return None; }
        Some(ArticulatedPoseTestView {
            body_yaw: self.body_yaw[i],
            arms: self.arms[i],
            grips: self.grips[i],
            shield_pose: self.shield_pose[i],
            move_authority: self.move_authority[i],
            turn_authority: self.turn_authority[i],
            arm_authority: self.arm_authority[i],
        })
    }

    /// The floor plan. Read-only: a level change is a new [`World`].
    pub fn dungeon(&self) -> &Dungeon {
        &self.dungeon
    }

    /// The doorways on this level and whether each stands open, in the order
    /// [`Dungeon::doorways`] found them.
    ///
    /// **The one thing the floor plan cannot answer.** A *shut* door is `DOOR`
    /// in the grid and an *open* one is `OPEN`, indistinguishable from the floor
    /// it was cut into -- so a renderer working from the tiles alone watches the
    /// doorway vanish the moment somebody walks through it, which reads as a bug
    /// rather than as a door. This is what the browser's furniture buffer is
    /// filled from (`crates/web/src/lib.rs`, `write_furniture`).
    ///
    /// Presentation only, and deliberately not `pressed`: how hard somebody is
    /// leaning on a door is simulation state that the page has no picture for,
    /// and publishing it would invite one that moved sixty times a second off a
    /// buffer that is read once a level.
    pub fn doorways(&self) -> impl ExactSizeIterator<Item = (Door, bool)> + '_ {
        self.doors.iter().map(|d| (d.door, d.open))
    }

    /// Whether a body of this radius can stand here without overlapping
    /// masonry -- or the outside, which [`Dungeon::solid`] reports as masonry
    /// too, so this covers the arena boundary without a second test.
    ///
    /// Delegates rather than reimplements, so a caller that has to place
    /// something -- the browser's spawn ring, say -- asks the same question the
    /// collision resolver answers, instead of growing a second opinion about
    /// what a legal position is.
    pub fn is_walkable(&self, p: Vec2, radius: Fx) -> bool {
        self.dungeon.is_clear(p, radius)
    }

    /// The nearest place a body of this radius can stand. Total; see
    /// [`Dungeon::nearest_clear`].
    pub fn nearest_walkable(&self, p: Vec2, radius: Fx) -> Vec2 {
        self.dungeon.nearest_clear(p, radius)
    }

    pub fn order(&self, faction: Faction) -> Order {
        self.orders[faction.index()]
    }

    /// What `id` is carrying.
    pub fn loadout(&self, id: EntityId) -> Option<Loadout> {
        self.resolve(id).map(|i| self.loadout[i])
    }

    /// Which loadout slot `id` currently has in hand, and what that is.
    pub fn held(&self, id: EntityId) -> Option<(u8, ActionKind)> {
        self.resolve(id).map(|i| (self.slot[i], self.action_of(i)))
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
        if self.combat_model == crate::CombatModel::Articulated { return false; }
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

    /// What `id`'s attributes are.
    pub fn stats(&self, id: EntityId) -> Option<Stats> {
        self.resolve(id).map(|i| self.stats[i])
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
        if self.combat_model == crate::CombatModel::Articulated { return false; }
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
        #[cfg(test)]
        if self.phase_trace_enabled { self.phase_trace.push("clear events"); }
        self.events.clear();
        #[cfg(test)]
        if self.phase_trace_enabled { self.phase_trace.push("expire decisions"); }
        self.expire_unanswered_decisions();
        match self.combat_model {
            crate::CombatModel::Legacy => {
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("regenerate"); }
                self.regenerate();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("apply movement"); }
                self.apply_movement();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("separate"); }
                self.separate();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("drive legacy limb"); }
                self.drive_limbs();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("legacy parries"); }
                self.resolve_parries();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("legacy swings"); }
                self.resolve_swings();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("recoil"); }
                self.apply_recoil();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("shots"); }
                self.resolve_shots();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("doors"); }
                self.press_doors();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("reap"); }
                self.reap_dead();
            }
            crate::CombatModel::Articulated => {
                // Traced like the legacy arm, and for one specific reason: the
                // contract freezes where contact sits relative to geometry and
                // doors, and a trace is the only way to prove an ordering
                // rather than argue it from the reading order of this match.
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("retain contact entry"); }
                self.retain_contact_entry();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("apply articulated movement"); }
                self.apply_articulated_movement();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("record contact locomotion"); }
                self.record_contact_locomotion();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("separate"); }
                self.separate();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("body yaw"); }
                self.drive_body_yaw();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("grips"); }
                self.apply_articulated_grips();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("arms"); }
                self.drive_articulated_arms();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("geometry"); }
                self.derive_articulated_geometry();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("contact"); }
                self.resolve_contact();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("anatomy"); }
                self.settle_anatomy();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("doors"); }
                self.press_doors();
                #[cfg(test)]
                if self.phase_trace_enabled { self.phase_trace.push("reap"); }
                self.reap_dead_articulated();
            }
        }
        #[cfg(test)]
        if self.phase_trace_enabled { self.phase_trace.push("increment tick"); }
        self.tick += 1;
        #[cfg(test)]
        if self.phase_trace_enabled { self.phase_trace.push("pending"); }
        self.refresh_pending();
        #[cfg(test)]
        if self.phase_trace_enabled { self.phase_trace.push("navigation"); }
        self.refresh_nav();
        &self.events
    }

    /// An agent that was offered a decision and given none keeps its standing
    /// command, but its clock still advances -- otherwise it would be re-offered
    /// every tick forever.
    fn expire_unanswered_decisions(&mut self) {
        for k in 0..self.pending.len() {
            let id = self.pending[k];
            if let Some(i) = self.resolve(id) {
                if self.next_decision[i] <= self.tick {
                    self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
                }
            }
        }
    }

    /// Out-of-combat recovery. See [`crate::rules::REGEN_PER_TICK`] for why
    /// this rule exists at all -- it is what makes retreating a tactic instead
    /// of a way to stall a fight forever.
    ///
    /// **Out of combat means out of contact, not merely out of range.** Timing
    /// it from the last blow alone was the obvious reading and it quietly
    /// undoes the difficulty range: an exchange takes a couple of seconds and
    /// [`crate::rules::REGEN_DELAY`] is three, so two fighters circling each
    /// other at arm's length heal between every trade. A bad fighter therefore
    /// could not be ground down -- it could only be caught -- and the whole
    /// bottom of the skill ladder came out as timeouts rather than defeats. It
    /// also read badly: characters visibly closing their wounds while an enemy
    /// stood four feet away, sword drawn.
    ///
    /// Breaking line of sight is a much higher bar and it is the one the rule
    /// always meant. Retreating still works, and it now has to be a real
    /// retreat.
    fn regenerate(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i] >= self.max_hp[i] {
                continue;
            }
            if self.tick < self.last_combat[i].saturating_add(crate::rules::REGEN_DELAY) {
                continue;
            }
            if self.enemy_in_sight(i) {
                continue;
            }
            // Bounded for the whole fight, not per rest: see
            // `rules::REGEN_BUDGET`. Without the budget a beaten fighter can
            // walk away, wait, and un-lose the exchange, and the fight has no
            // reason ever to end.
            let tick_heal = (self.max_hp[i] * crate::rules::REGEN_PER_TICK)
                .min(self.regen_left[i])
                .min(self.max_hp[i] - self.hp[i]);
            if !tick_heal.is_positive() {
                continue;
            }
            self.hp[i] += tick_heal;
            self.regen_left[i] -= tick_heal;
        }
    }

    /// Whether anything hostile stands inside `i`'s own sight range.
    ///
    /// Ground truth rather than perception: this is a rule about the world, not
    /// a decision the character makes, and a fighter that healed because it had
    /// failed to notice the enemy would be rewarded for its blind spot.
    fn enemy_in_sight(&self, i: usize) -> bool {
        let sight = self.stats[i].sight_range();
        for j in 0..self.alive.len() {
            if j == i || !self.alive[j] || self.faction[j] == self.faction[i] {
                continue;
            }
            if (self.pos[j] - self.pos[i]).length() <= sight {
                return true;
            }
        }
        false
    }

    /// Steers each body toward the velocity its command asked for, then moves it.
    ///
    /// The commanded direction is a request for a *velocity*, not a
    /// displacement, and [`Stats::traction`] bounds how much of the difference
    /// can be paid off in one tick. One rule covers three things that used to
    /// be free: getting up to speed, stopping, and shedding a shove -- a body
    /// with no order is asking for zero and brakes toward it at the same rate
    /// it would accelerate.
    ///
    /// What this replaces was `pos += dir * move_speed`, which is to say a body
    /// that reached full speed instantly and could reverse it in a tick. Under
    /// that rule an approach could always be recalled, so there was nothing to
    /// read: the only way to be caught out of position was to be somewhere bad
    /// *right now*, never to have committed to going there.
    fn apply_movement(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.vel[i] = Vec2::ZERO;
                continue;
            }
            self.start_pos[i] = self.pos[i];
            let dir = self.command[i].move_dir.clamp_length(Fx::ONE);
            // What is in hand can buy footspeed. `move_bonus` is exactly
            // `Fx::ONE` for every action that is not a movement one, so this
            // multiply is the identity for the whole current roster and moves no
            // hash -- it is here so that landing `Run` is a one-row edit to the
            // registry rather than a change to the movement rule.
            let want = dir * self.stats[i].move_speed() * self.action_of(i).spec().move_bonus;
            let change = (want - self.vel[i]).clamp_length(self.stats[i].traction());
            self.vel[i] += change;
            self.move_body(i, self.pos[i] + self.vel[i]);
            if !dir.is_zero() {
                // `facing` is where the feet are going, and nothing else. It is
                // not consulted by any combat rule -- blows are decided by blade
                // geometry -- so a character can back away from a fight while
                // still swinging into it.
                //
                // Read off the *order* rather than off the velocity, which now
                // differ: a body that has asked to reverse is still drifting the
                // old way for a few ticks, and pointing it backwards through
                // those would be reporting the momentum as the intention.
                self.facing[i] = dir.angle();
            }
        }
    }

    /// Steps every limb against whatever it is holding.
    ///
    /// This is also where every attack clock ticks down, which is why there is
    /// no cooldown phase in [`World::step`] any more. Putting the countdown
    /// anywhere else would let a limb be observed in a phase it had already
    /// left, or bill a blow on a windup that ran out earlier in the same tick.
    fn drive_limbs(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.blade_was[i] = None;
                self.blade_p[i] = Fx::ZERO;
                continue;
            }
            // 1. Snapshot before anything, and **against the outgoing action**.
            //
            // The body has already moved this tick but the limb has not, so
            // this pair is exactly where the blade was when the last tick
            // ended. Order matters more than it looks: a chambered blade sits
            // at `GUARD_REACH` (0.30), which is above `MIN_STRIKE_REACH`, so it
            // is a real segment that `resolve_parries` will test. Flipping the
            // slot first would sweep a club-length segment from where a knife
            // was and bill a parry on a blade that never existed.
            self.blade_was[i] = self.blade_from(i, self.start_pos[i], self.limb[i]);
            self.blade_p[i] = self.blade_momentum(i);

            // 2. Then honour a swap request, if the limb is in any state to
            //    hear one. Three ways to be refused, and all three are silent:
            //    a slot this fighter does not carry, the slot already in hand,
            //    or a limb that is mid-attack. The last is the load-bearing one
            //    -- a swap out of a committed cut would make overcommitting
            //    free, and the punish window is half the model.
            let want = self.command[i].slot as usize;
            if want != self.slot[i] as usize
                && self.limb[i].swing == Swing::Guard
                && self.loadout[i].holds(want)
            {
                // The slot flips *now*, not when the swap lands. `Swing::Swap`
                // alone carries "nothing is live", and resolving the arm
                // against the incoming action is what makes its `ready` cost
                // and its extend rate the numbers that actually run.
                self.slot[i] = want as u8;
                let incoming = self.arm(i);
                self.limb[i].begin_swap(incoming);
            }

            // 3. Then drive, against whatever is in hand now.
            let arm = self.arm(i);
            let cmd = self.command[i].limb;
            let before = self.limb[i].swing;
            self.limb[i].drive(cmd, arm);

            // 4. And if that was a release, put an arrow in the air.
            //
            // **Detected here rather than flagged on the limb.** A `Hand` is
            // pure arm physics with no idea projectiles exist, and giving it a
            // `loosed` bit would be new state, new bytes in `Hand::hash_into`,
            // and a concept living in the one type that must not know about it.
            // The edge is perfectly visible from out here, and this function
            // already runs the same snapshot-then-compare pattern for
            // `blade_was` and `blade_p` two steps above.
            if arm.spec.role == Role::Shoot
                && before == Swing::Windup
                && self.limb[i].swing == Swing::Strike
            {
                self.loose(i, arm);
            }
        }
    }

    /// Puts an arrow in the air, and bills the archer for it.
    ///
    /// Called on the one tick a [`Role::Shoot`] limb crosses from
    /// [`Swing::Windup`] into [`Swing::Strike`].
    fn loose(&mut self, i: usize, arm: rules::Arm) {
        // **Along the frozen line, not along the hand.**
        //
        // At this exact edge the hand is still back at the cocked bearing --
        // `Hand::step_attack` only just commanded it forward -- so `limb.angle`
        // points at very nearly the one direction the shot is guaranteed *not*
        // to go. `line` is the plan and the pose is the tell, which is the same
        // distinction `swing::landing` is built on.
        let heading = self.limb[i].line;
        let along = Vec2::from_angle(heading);
        let nock = self.radius[i] + arm.spec.length;
        let speed = rules::shot_speed(arm);

        // Born clear of the archer's own body, so it cannot be tested against
        // the thing that fired it on the tick it appears. `resolve_shots` skips
        // the owner by handle as well; this is the geometric half of the same
        // promise, and it is what makes the arrow visibly leave the bow.
        let from = self.pos[i] + along * nock;

        let Some(k) = self.free_shot() else {
            return; // at the ceiling: the draw is spent, the arrow is not made
        };
        self.shot_alive[k] = true;
        self.shot_pos[k] = from;
        self.shot_vel[k] = along * speed;
        self.shot_range[k] = self.stats[i].sight_range();
        self.shot_mass[k] = arm.spec.mass;
        self.shot_power[k] = rules::power_multiplier(self.stats[i].power);
        self.shot_owner[k] = self.id_of(i);
        self.shot_faction[k] = self.faction[i];

        // Newton, at the string. **Not through `apply_recoil`**, which
        // *differences* a blade's momentum across a tick and applies a traction
        // threshold because a swing's reaction is sustained over a whole arc and
        // static friction genuinely holds it. A release is a single-tick
        // momentum change -- the same case as a blade reversing off a shield --
        // and it is exactly what that threshold is meant to let through.
        let kick = fx::mul_div(
            arm.spec.mass * speed,
            rules::RECOIL_TRANSFER,
            self.mass[i].max(Fx::EPSILON),
        );
        self.vel[i] -= along * kick;

        self.events.push(Event::Loose {
            source: self.id_of(i),
            at: from,
            line: heading,
        });
    }

    /// A free arrow slot, growing the arrays if there is room left under
    /// [`rules::MAX_SHOTS`].
    fn free_shot(&mut self) -> Option<usize> {
        if let Some(k) = self.shot_free.pop() {
            return Some(k as usize);
        }
        if self.shot_alive.len() >= rules::MAX_SHOTS {
            return None;
        }
        self.shot_alive.push(false);
        self.shot_pos.push(Vec2::ZERO);
        self.shot_vel.push(Vec2::ZERO);
        self.shot_range.push(Fx::ZERO);
        self.shot_mass.push(Fx::ZERO);
        self.shot_power.push(Fx::ZERO);
        self.shot_owner.push(EntityId::NONE);
        self.shot_faction.push(Faction::Heroes);
        Some(self.shot_alive.len() - 1)
    }

    fn reap_shot(&mut self, k: usize) {
        self.shot_alive[k] = false;
        self.shot_free.push(k as u32);
    }

    /// Circle push-apart. O(n^2) and deliberately so for now: at a few dozen
    /// entities a spatial hash is slower and much easier to get subtly wrong.
    /// Revisit when a scenario needs hundreds.
    fn separate(&mut self) {
        let n = self.alive.len();
        for i in 0..n {
            if !self.alive[i] {
                continue;
            }
            for j in (i + 1)..n {
                if !self.alive[j] {
                    continue;
                }
                let delta = self.pos[j] - self.pos[i];
                let overlap = self.radius[i] + self.radius[j];
                let distance = delta.length();
                if distance >= overlap {
                    continue;
                }
                // Split by inverse mass, which is to say each body yields the
                // share of the overlap the *other* one's weight accounts for.
                // A 50/50 split was the old rule and it made a Skitterer able to
                // shoulder a Brute off its feet -- which quietly made crowding a
                // heavy weapon the strongest answer in the game, because getting
                // inside its dead zone cost nothing to hold.
                //
                // Each share is computed independently rather than one being
                // `total - other`, so a mirrored pair gets mirrored shoves. The
                // two may fail to close the last raw unit of overlap between
                // them; the old rule did not close it either, and the next tick
                // takes another bite.
                let gap = overlap - distance;
                let total = self.mass[i] + self.mass[j];
                let (share_i, share_j) = if total.is_positive() {
                    (
                        fx::mul_div(gap, self.mass[j], total),
                        fx::mul_div(gap, self.mass[i], total),
                    )
                } else {
                    (gap * Fx::HALF, gap * Fx::HALF)
                };
                let dir = if distance.is_zero() {
                    // Exactly coincident. Pick a direction from the index pair
                    // so the pair unsticks deterministically instead of
                    // freezing or needing an RNG.
                    Vec2::from_angle(Angle::from_raw(
                        (i as u32)
                            .wrapping_mul(40_503)
                            .wrapping_add((j as u32).wrapping_mul(7))
                            as u16,
                    ))
                } else {
                    delta.normalize()
                };
                self.move_body(i, self.pos[i] - dir * share_i);
                self.move_body(j, self.pos[j] + dir * share_j);

                // Un-overlapping them is not the whole of a collision. Without
                // an impulse the positional fix is undone next tick by the same
                // velocities that caused it, and two bodies grind against each
                // other at full walking speed forever -- which is also a free
                // way to hold ground you have no business holding.
                //
                // Standard normal impulse against the reduced mass. Only for a
                // pair that is *closing*: two bodies already separating have
                // been dealt with, and reflecting them again would pull them
                // back together.
                let closing = (self.vel[j] - self.vel[i]).dot(dir);
                if closing.is_positive() || !total.is_positive() {
                    continue;
                }
                let reduced = fx::mul_div(self.mass[i], self.mass[j], total);
                let impulse = -(Fx::ONE + rules::BODY_RESTITUTION) * closing * reduced;
                self.vel[i] = self.vel[i] - dir * (impulse / self.mass[i]);
                self.vel[j] = self.vel[j] + dir * (impulse / self.mass[j]);
            }
        }
    }

    /// Steel on steel. Both swings are thrown off line, neither lands.
    ///
    /// Its own pass with an `i < j` loop for the same reason
    /// [`World::separate`] has one: a pairwise interaction resolved inside a
    /// per-entity loop resolves twice, and asymmetrically.
    ///
    /// **At least one of the two blades has to be mid-cut.** Two chambered
    /// guards brushing past each other is not a parry, however fast the bodies
    /// happen to be turning -- and without that rule, a pair of fighters
    /// standing close would trade rebounds forever on blades neither of them
    /// swung. The other blade may be a guard, though, and that is the point:
    /// catching a cut on your own steel is the answer available to a fighter
    /// whose shield is on the wrong side. It is not free, because a parry ends
    /// with *both* hands recovering.
    fn resolve_parries(&mut self) {
        self.impulses.clear();
        let n = self.alive.len();
        for i in 0..n {
            if !self.alive[i] || !self.can_parry(i) {
                continue;
            }
            let (ia, ib) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            for j in (i + 1)..n {
                if !self.alive[j] || self.faction[j] == self.faction[i] || !self.can_parry(j) {
                    continue;
                }
                // Somebody has to have actually swung.
                if !self.limb[i].swing.is_live() && !self.limb[j].swing.is_live() {
                    continue;
                }
                // Two blades merely resting against each other are not a parry.
                // Without a speed floor a crossed pair would fire an event
                // every tick for as long as they stayed lined up.
                let closing = self.limb[i].spin.abs() + self.limb[j].spin.abs();
                if closing < rules::PARRY_MIN_SPIN {
                    continue;
                }
                let (ja, jb) = match self.blade(j) {
                    Some(seg) => seg,
                    None => continue,
                };
                let at = match fx::segment_segment(ia, ib, ja, jb) {
                    Some(p) => p,
                    None => continue,
                };
                // Steel on steel is the same collision a block is, with two
                // blades in it instead of a blade and a guard -- so the heavier
                // weapon wins the crossing, which is what a parry ought to be a
                // question about and previously was not.
                let (mine, theirs) =
                    self.deflect(i, j, at, rules::PARRY_RESTITUTION);
                for (e, add) in [(i, mine), (j, theirs)] {
                    self.impulses.push(Impulse {
                        entity: e,

                        scale: Fx::ONE,
                        add,
                        recover: Some(rules::PARRY_RECOVERY),
                    });
                }
                self.events.push(Event::Parry {
                    a: self.id_of(i),
                    b: self.id_of(j),
                    at,
                });
            }
        }
        self.apply_impulses();
    }

    /// Whether `i`'s blade is in any state to meet another.
    ///
    /// A recovering hand is not. That phase is the punish window, and a blade
    /// that could still swat cuts aside on its way back to guard would not be
    /// much of one.
    ///
    /// Neither is a guard, and that consequence is worth stating plainly because
    /// it is a real cost rather than a technicality: **a shield cannot parry**.
    /// A fighter behind one has no answer to a crossed blade except to take it
    /// on the arc, and no way to punish the crossing. That is what the loadout
    /// is *for* -- if a guard could do both jobs there would be nothing to
    /// choose between.
    #[inline]
    fn can_parry(&self, i: usize) -> bool {
        self.action_of(i).spec().role.is_live_capable()
            && !matches!(self.limb[i].swing, Swing::Recover | Swing::Swap)
    }

    /// Blade against body: the whole of damage.
    ///
    /// **Only a blade in [`Swing::Strike`] can hurt anybody.** That one line is
    /// what ended the windmill. Under the old model every tick of rotation was
    /// a live hitbox, so the dominant strategy -- for a hand-written policy, for
    /// evolution, and for a person with a mouse -- was to hold the blade out and
    /// spin it, and there was no instant at which an attack could be said to
    /// have *started*, which meant there was no instant at which one could be
    /// read or answered. Extension is not the gate and never was a good one: a
    /// fighter has every reason to keep a guard chambered, and a guard that
    /// cuts is a guard nobody would drop.
    ///
    /// Two passes, and the split is not tidiness. The old `resolve_attacks`
    /// wrote only health and cooldowns, which no other attacker read, so it
    /// could resolve in place. This one writes **spin**, and spin is the input
    /// to damage -- so an in-place loop would let the first attacker's rebound
    /// change the second attacker's blow, making a mutual exchange depend on
    /// entity index. Collecting the outcomes and applying them afterwards *is*
    /// the snapshot; no extra buffer is needed.
    ///
    /// [`Swing::Strike`]: crate::Swing::Strike
    fn resolve_swings(&mut self) {
        self.blows.clear();
        self.impulses.clear();

        // ---- pass 1: read-only
        for i in 0..self.alive.len() {
            if !self.alive[i] || !self.limb[i].swing.is_live() {
                continue;
            }
            let (base, tip) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            // A blade with no history is tested where it is, which is what the
            // un-swept version did for everything.
            let (was_base, was_tip) = self.blade_was[i].unwrap_or((base, tip));
            let spec = self.action_of(i).spec();
            let sweep = self.radius[i] + spec.length;
            let power = rules::power_multiplier(self.stats[i].power);
            let travelled = self.pos[i] - self.start_pos[i];
            // What this blade has to be worth here to count as a cut rather
            // than a scrape. See `rules::GRAZE_FRACTION`: below it the blade
            // passes through, which costs the swinger nothing and is the only
            // thing standing between a weapon and having every cut it throws
            // spent on the hilt end of its own arc.
            let graze = rules::graze_floor(self.arm(i), self.stats[i]);

            for j in 0..self.alive.len() {
                if i == j || !self.alive[j] || self.faction[j] == self.faction[i] {
                    continue; // no friendly fire, ever -- checked before any geometry
                }
                // Bounding circle before anything expensive. The geometry below
                // runs several integer square roots per pair and this is the
                // hot loop of the whole tick.
                //
                // Widened by the relative travel, because the two bodies were
                // somewhere else at the start of the tick: distance between two
                // linearly moving points is convex, so it is *smallest* in the
                // middle, and a bound taken at the end alone would reject the
                // exact pairs the sweep exists to catch.
                let closing = (travelled - (self.pos[j] - self.start_pos[j])).length();
                if (self.pos[j] - self.pos[i]).length() > sweep + self.radius[j] + closing {
                    continue;
                }
                let hit = match fx::swept_segment_circle(
                    was_base,
                    was_tip,
                    base,
                    tip,
                    self.start_pos[j],
                    self.pos[j],
                    self.radius[j],
                ) {
                    Some(h) => h,
                    None => continue,
                };
                // A cut that crosses masonry did not land. Measured from the
                // swinger's own centre to the point of impact, which is the
                // segment the arm actually occupies at the moment it connects.
                //
                // Belt-and-braces once sight is occluded -- nobody *aims*
                // through a wall any more -- but "cannot see it" and "cannot hit
                // it" are different claims, and only the second one stops a
                // long weapon. A Brute's `Club` reaches 2.15 from its own centre
                // (radius 0.70 plus a 1.45 blade), and a Brute and a Skitterer
                // pressed against opposite faces of a one-tile wall are
                // 0.70 + 1.00 + 0.30 = 2.00 apart. It clears the rock by 0.15,
                // so this is arithmetic and not paranoia.
                //
                // On the hit path only, which is rare, and free on a flat plan:
                // `raycast` bails on its first tile test. It is `raycast` and not
                // `sees` because the short-circuit is not wanted -- a swing is
                // already inside a `carved` check by virtue of being rare, and
                // reading the same method the arrows read (`resolve_shots`) keeps
                // one rule for "what stops a moving thing".
                if self.dungeon.carved() && self.dungeon.raycast(self.pos[i], hit.point).is_some() {
                    continue;
                }

                let impact = self.impact_speed(i, j, hit.point);
                let mut full = rules::blow_damage(spec.mass, impact, power);
                if !full.is_positive() {
                    continue; // resting, withdrawing, or merely leaning on them
                }
                if full < graze {
                    continue; // caught it with the wrong part of the blade
                }
                // A body committed to a spent swing is turned into the blow and
                // cannot give ground with it. This is the only term in the
                // damage model that depends on what the *target* is doing, and
                // it is what makes timing an attack worth more than throwing
                // one; see `rules::RECOVERY_EXPOSURE`.
                if self.limb[j].swing == Swing::Recover {
                    full *= rules::RECOVERY_EXPOSURE;
                }
                let leak = self.block_leak(j, hit.point);
                let blocked = leak.is_some();
                let amount = match leak {
                    Some(fraction) => full * fraction,
                    None => full,
                };
                self.blows.push(Blow {
                    source: i,
                    target: j,
                    amount,
                    absorbed: full - amount,
                    blocked,
                    at: hit.point,
                    shove: self.shove(i, j, hit.point, blocked),
                });

                if blocked {
                    // The swing comes back off the shield, and the shield is
                    // shoved the way the blow was travelling. That pairing is
                    // the punish window: the attacker has to pay off a reversed
                    // swing *and* the extra recovery, while the defender's guard
                    // is out of position too. Blocking is not free either.
                    //
                    // Both halves are one collision between two arms now rather
                    // than two independent fractions, so the guard that swats a
                    // knife aside is thrown wide open by an axe -- see
                    // `World::deflect`.
                    let (rebound, knock) =
                        self.deflect(i, j, hit.point, rules::BLOCK_RESTITUTION);
                    self.impulses.push(Impulse {
                        entity: i,

                        scale: Fx::ONE,
                        add: rebound,
                        recover: Some(rules::BLOCK_RECOVERY),
                    });
                    self.impulses.push(Impulse {
                        entity: j,

                        scale: Fx::ONE,
                        add: knock,
                        recover: None,
                    });
                } else {
                    // A cut that went home is spent, and the hand starts back.
                    // This is what stops one swing billing damage on every tick
                    // it spends inside a body -- the old hand refractory, now
                    // expressed as the thing it always meant.
                    self.impulses.push(Impulse {
                        entity: i,

                        scale: Fx::ONE,
                        add: Fx::ZERO,
                        recover: Some(0),
                    });
                }
            }
        }

        // ---- pass 2: apply, in ascending source order
        for k in 0..self.blows.len() {
            let blow = self.blows[k];
            let (i, j) = (blow.source, blow.target);
            let source = self.id_of(i);
            let target = self.id_of(j);

            if blow.blocked {
                self.events.push(Event::Block {
                    attacker: source,
                    defender: target,
                    absorbed: blow.absorbed,
                    at: blow.at,
                });
            }

            self.vel[j] += blow.shove;
            // Reported where it is applied, and **as a field read and nothing
            // else**. The vector was computed in pass 1 (`World::shove`); an
            // emission site that recomputed it would be a second rounding of a
            // number that is already in `vel`, which is the whole argument for
            // this variant existing rather than the page differencing velocity.
            //
            // A zero shove is not announced. `World::shove` answers zero when
            // the contact coincides with the attacker's own centre, and a shove
            // of nothing is not a thing that happened.
            if !blow.shove.is_zero() {
                self.events.push(Event::Shove {
                    entity: target,
                    shover: source,
                    impulse: blow.shove,
                    at: blow.at,
                });
            }

            let effective = blow.amount.min(self.hp[j].max(Fx::ZERO));
            self.hp[j] -= blow.amount;
            self.damage_dealt[i] += effective;
            self.last_attacker[j] = source;
            self.last_combat[i] = self.tick;
            self.last_combat[j] = self.tick;
            self.events.push(Event::Damage {
                source,
                target,
                amount: blow.amount,
                lethal: !self.hp[j].is_positive(),
                at: blow.at,
            });
        }
        self.blows.clear();
        self.apply_impulses();
    }

    /// Flies every arrow one tick, and resolves whatever it met.
    ///
    /// The twin of [`World::resolve_swings`] and deliberately shaped like it,
    /// down to the read-only first pass -- an arrow reads `vel` to work out its
    /// closing speed, so a shove written where it is computed would change what
    /// the *next* arrow's blow is worth and make a volley depend on slot order.
    ///
    /// Two things it deliberately does **not** do. It writes no
    /// [`Impulse`]: a blocked blade rebounds off a shield and pays for it, but
    /// an arrow that hits one does not travel back up the string, and there is
    /// no swing left to interrupt. And it credits `damage_dealt` only if the
    /// archer is still alive -- an arrow outlives its owner, and a slot that has
    /// been recycled belongs to somebody else now.
    fn resolve_shots(&mut self) {
        if self.shot_alive.is_empty() {
            return;
        }
        self.pierces.clear();

        // ---- pass 1: read-only
        for k in 0..self.shot_alive.len() {
            if !self.shot_alive[k] {
                continue;
            }
            let was = self.shot_pos[k];
            let step = self.shot_vel[k];
            let now = was + step;

            // Whom it met first. **Nearest along the flight**, not first by
            // index: `SegmentHit` reports where on the segment it touched, so
            // the honest answer costs nothing extra, and the entity index breaks
            // ties so the result never depends on scan order.
            let mut first: Option<(Fx, usize, Vec2)> = None;
            for j in 0..self.alive.len() {
                if !self.alive[j] || self.faction[j] == self.shot_faction[k] {
                    continue; // no friendly fire, ever -- before any geometry
                }
                if self.id_of(j) == self.shot_owner[k] {
                    continue; // and never the archer, however the flight curves back
                }
                // **The arrow's own travel is the segment**, so this is already
                // swept exactly along the flight and nothing can tunnel through
                // a body lengthwise. What it does not sweep is the *target's*
                // motion over the tick, and it does not have to: a body moves at
                // most about 0.05 units a tick against a radius of at least
                // 0.30, six times the margin `segment_circle`'s invariant asks
                // for. Pinned by `an_arrow_cannot_tunnel_through_a_body`.
                let Some(hit) = fx::segment_circle(was, now, self.pos[j], self.radius[j]) else {
                    continue;
                };
                if first.is_none_or(|(t, best, _)| (hit.t, j) < (t, best)) {
                    first = Some((hit.t, j, hit.point));
                }
            }

            // Masonry is not a target -- there is no blow to resolve and no
            // event to raise -- but it is very much something that stops an
            // arrow, and which of the two comes first is settled the same way
            // two bodies are: nearest along the flight.
            let wall = if self.dungeon.carved() {
                self.dungeon.raycast(was, now)
            } else {
                None
            };
            let struck = match first {
                Some((t, j, at)) if wall.is_none_or(|w| t <= w) => Some((j, at)),
                _ => None,
            };
            let Some((j, at)) = struck else {
                if wall.is_some() {
                    // Spent on the wall. No event, for exactly the reason a
                    // shot that leaves the room raises none: an arrow does not
                    // bounce and does not stick, it stops being in the frame.
                    self.reap_shot(k);
                }
                continue;
            };

            // Relative closing speed, and a magnitude rather than a projection
            // onto the surface normal. `impact_speed` takes the projection for
            // the *body* term of a cut and explains why the blade term must not
            // be one: a hit dead centre has the way in perpendicular to the
            // velocity, so projecting would make the cleanest possible contact
            // worth exactly nothing. An arrow has the same geometry and the same
            // answer.
            let impact = (self.shot_vel[k] - self.vel[j]).length();
            let mut full = rules::blow_damage(self.shot_mass[k], impact, self.shot_power[k]);
            if !full.is_positive() {
                continue;
            }
            // A body committed to a spent swing cannot give ground with the
            // blow, whichever direction the blow came from. Same rule, same
            // reason, same constant as a cut.
            if self.limb[j].swing == Swing::Recover {
                full *= rules::RECOVERY_EXPOSURE;
            }
            // **The same guard rule a blade meets**, deliberately, rather than a
            // second defensive mechanic that would have to be balanced against
            // the first. A planted shield leaks `BLOCK_LEAK_BRACED` of an arrow
            // and a snapped one `BLOCK_LEAK_SNAP`, so reading a draw pays and
            // flinching at it does not -- which is the whole point of a bow's
            // very long telegraph.
            let leak = self.block_leak(j, at);
            let blocked = leak.is_some();
            let amount = match leak {
                Some(fraction) => full * fraction,
                None => full,
            };
            self.pierces.push(Pierce {
                shot: k,
                target: j,
                source: self.shot_owner[k],
                amount,
                absorbed: full - amount,
                blocked,
                at,
                shove: self.shot_shove(k, j, blocked),
            });
        }

        // ---- pass 2: apply, in ascending shot order
        for p in 0..self.pierces.len() {
            let pierce = self.pierces[p];
            let j = pierce.target;
            let target = self.id_of(j);

            if pierce.blocked {
                self.events.push(Event::Block {
                    attacker: pierce.source,
                    defender: target,
                    absorbed: pierce.absorbed,
                    at: pierce.at,
                });
            }

            self.vel[j] += pierce.shove;
            // The arrow's half of the same rule, on the same terms: a field
            // read of what pass 1 computed. `shover` is the archer's handle
            // rather than an index it may no longer own -- an arrow outlives
            // the fighter that loosed it, and a listener that keys on this is
            // told so by the generation half failing to resolve.
            if !pierce.shove.is_zero() {
                self.events.push(Event::Shove {
                    entity: target,
                    shover: pierce.source,
                    impulse: pierce.shove,
                    at: pierce.at,
                });
            }

            let effective = pierce.amount.min(self.hp[j].max(Fx::ZERO));
            self.hp[j] -= pierce.amount;
            self.last_attacker[j] = pierce.source;
            self.last_combat[j] = self.tick;
            // Credit and the combat clock, **only if the archer is still there**.
            // The handle is generational, so a shot whose owner died and whose
            // slot has been refilled resolves to `None` rather than paying the
            // wrong fighter -- which is exactly why `shot_owner` is an
            // `EntityId` and not an index.
            if let Some(i) = self.resolve(pierce.source) {
                self.damage_dealt[i] += effective;
                self.last_combat[i] = self.tick;
            }
            // **The body, not the rim.** A cut has a contact point worth
            // carrying -- `blow.at` is where on the blade the two met, and where
            // on the blade decides what the blow was worth. A pierce has no such
            // point: the arrow is a point itself, and `resolve_shots` tests the
            // whole segment it travelled this tick, so `pierce.at` is merely
            // wherever along that segment the circle was first crossed. The
            // honest answer to "where did this land" is the body it stopped in.
            // `Event::Block` above keeps the rim, because a shield is struck at
            // a place and that place is the whole of what a block is about.
            self.events.push(Event::Damage {
                source: pierce.source,
                target,
                amount: pierce.amount,
                lethal: !self.hp[j].is_positive(),
                at: self.pos[j],
            });
            // Spent on what it hit, blocked or not. An arrow stopped by a shield
            // is still an arrow that has stopped.
            self.reap_shot(pierce.shot);
        }
        self.pierces.clear();

        // ---- and everything still in the air moves.
        for k in 0..self.shot_alive.len() {
            if !self.shot_alive[k] {
                continue;
            }
            let step = self.shot_vel[k];
            let now = self.shot_pos[k] + step;
            self.shot_range[k] -= step.length();
            let outside = now.x < Fx::ZERO
                || now.y < Fx::ZERO
                || now.x > self.arena.x
                || now.y > self.arena.y;
            // Range spent, or gone over the wall. An arrow does not bounce and
            // does not stick: it simply stops being in the frame, which is what
            // a miss looks like from the far side of a room.
            if outside || !self.shot_range[k].is_positive() {
                self.reap_shot(k);
                continue;
            }
            self.shot_pos[k] = now;
        }
    }

    /// Velocity an arrow adds to what it hits.
    ///
    /// **Along the flight**, which is where [`World::shove`] deliberately does
    /// *not* point -- that function's whole argument is that a cut sweeps across
    /// a body and carries it round the arc. A shot does not sweep. Same momentum
    /// law, same [`rules::KNOCKBACK_TRANSFER`], and the same
    /// [`rules::BRACE_ANCHOR`] discount for a guard that was planted to meet it.
    fn shot_shove(&self, k: usize, j: usize, blocked: bool) -> Vec2 {
        let vel = self.shot_vel[k];
        if vel.is_zero() {
            return Vec2::ZERO;
        }
        let carried = self.shot_mass[k] * vel.length() * rules::KNOCKBACK_TRANSFER;
        let taken = if blocked {
            Fx::ONE - rules::BRACE_ANCHOR * self.limb[j].brace_fraction()
        } else {
            Fx::ONE
        };
        let mass = self.mass[j].max(Fx::EPSILON);
        vel.normalize() * fx::mul_div(carried, taken, mass)
    }

    /// Applies collected impulses in ascending `(entity, hand)`.
    ///
    /// The order is fixed rather than incidental: `Fx` addition saturates, and
    /// saturating addition is commutative but not associative at the boundary,
    /// so two impulses landing on one hand must always combine the same way.
    ///
    /// An impulse carrying a recovery ends the running attack outright. Two
    /// arriving on the same hand in one tick -- a cut that is blocked by one
    /// enemy and parried by another -- take the longer of the two recoveries,
    /// which is the same "worst of" rule the old refractory used and keeps the
    /// result independent of which landed first.
    fn apply_impulses(&mut self) {
        self.impulses.sort_by_key(|im| im.entity);
        for k in 0..self.impulses.len() {
            let im = self.impulses[k];
            let arm = self.arm(im.entity);
            let ceiling = arm.cap;
            let hand = &mut self.limb[im.entity];
            hand.spin = (hand.spin * im.scale + im.add).clamp(-ceiling, ceiling);
            if let Some(extra) = im.recover {
                // Only a hand *already* recovering has a countdown worth
                // keeping. Reading `swing_left` off a live cut instead would
                // hand the attacker whatever was left of `STRIKE_TIMEOUT` as
                // its recovery, which is both far too long and backwards --
                // the earlier a cut is stopped, the longer it would be punished.
                let already = if hand.swing == Swing::Recover {
                    hand.swing_left
                } else {
                    0
                };
                hand.recover(arm, extra);
                hand.swing_left = hand.swing_left.max(already);
            }
        }
        self.impulses.clear();
    }

    /// Bills every body for the reaction to its own sword.
    ///
    /// **Your own attack moves you.** A blade is mass on the end of an arm, and
    /// getting it moving has to push the shoulder the other way; letting it go
    /// again has to haul the shoulder after it. The sim gets that for free by
    /// differencing the weapon's momentum across the tick, because whatever
    /// changed it -- the muscle, a shield, another blade -- changed it by pushing
    /// on the body through the arm.
    ///
    /// Three consequences, in rising order of how much they matter:
    ///
    /// * A swing that runs its whole arc is very nearly momentum-neutral. It
    ///   starts and ends at rest, so the impulses cancel; what does *not* cancel
    ///   is the ground covered in between, because the blade points somewhere
    ///   different at the end than it did at the start and traction is shedding
    ///   the drift the whole time.
    /// * A cut that is **stopped** is not neutral at all. A blocked blade
    ///   reverses in one tick, and the whole of that momentum change lands on the
    ///   attacker as a shove backwards along its own swing. Being blocked already
    ///   cost tempo; it now costs ground.
    /// * A fighter cannot swing and hold a position exactly. Spacing was a
    ///   decision you made with your feet and now it is one you make with the
    ///   whole body, which is the entire point of the phase.
    ///
    /// **Every role, not only a blade.** [`World::blade_momentum`] has no role
    /// gate and should not have one: what is being billed is mass on the end of
    /// an arm being accelerated, and a guard, a bow and a pair of empty hands all
    /// have that. It is why `RunMind` parks its limb rather than tucking it --
    /// a limb hauled round the compass every tick costs footing whether or not
    /// it can cut.
    ///
    /// A shot's own reaction is *not* billed here. This function differences
    /// momentum across a tick, and a release is a one-off; see [`World::loose`].
    fn apply_recoil(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                continue;
            }
            let change = self.blade_momentum(i) - self.blade_p[i];
            if change.is_zero() {
                continue;
            }
            // Newton's third law, with the ground taking the rest of it: see
            // `rules::RECOIL_TRANSFER`.
            let mass = self.mass[i].max(Fx::EPSILON);
            let recoil = fx::mul_div(change, rules::RECOIL_TRANSFER, mass);

            // What the feet hold. Static friction, and the same budget
            // `apply_movement` spends on steering, because it is the same
            // friction -- so a swing worth less than a tick of footwork does not
            // move a planted fighter at all, and one worth more does.
            //
            // Not a refinement: without it the model is unusable. A swing
            // accelerates its blade the same way for twenty or forty ticks
            // running, so every tick of recoil points *the same way* and they
            // add, while traction can only shed a fixed amount per tick. At a
            // quarter transfer that came to well over a body's top speed
            // accumulated across a single cut -- a fighter physically could not
            // close on anything while swinging at it, Rogue mirror duels stopped
            // landing blows, and 86% of them ended in a draw at full health.
            // With a threshold the smooth part of a swing is simply held, which
            // is the correct answer and the one every swordsman demonstrates.
            let slipped = recoil.abs() - self.stats[i].traction();
            if !slipped.is_positive() {
                continue;
            }
            // Along where the blade is pointing *now*: the impulse is billed at
            // the bottom of the tick, so it is billed where the blade ended up.
            let along = Vec2::from_angle(self.limb[i].angle).perp();
            // Bound rather than written inline, which is a refactor and not a
            // change: `-=` desugars to the same subtraction of the same
            // operand, evaluated once either way. The binding exists so the
            // event below can be a field read like the other two shove sites.
            let kick = along * (slipped * recoil.signum());
            self.vel[i] -= kick;
            let entity = self.id_of(i);
            let at = self.pos[i];
            // The same rule the other two sites hold: a shove of nothing is not
            // a thing that happened. `slipped` is positive by the test above,
            // but `Mul<Fx> for Vec2` truncates toward zero, so a kick barely
            // past the traction threshold can round to `(0, 0)` in both
            // components -- and shoves are nine event rows in ten, so a
            // zero-magnitude one is noise on the highest-rate channel there is.
            // Measured rather than assumed: `web`'s scripted feed
            // (`one_script_run_twice_...`) carried 929 shove rows of 1409 over
            // 2195 ticks, and two of the 929 were this.
            //
            // **The guard is around the event and not around `vel`.** The
            // subtraction above is unconditional and stays that way; it is a
            // no-op when `kick` is zero, and moving it in here would put a
            // branch on simulation state to spare an event row, which is the
            // one trade this file never makes.
            //
            // `-kick`, because `impulse` is what the body *gains* at all three
            // sites and this one is billed as a subtraction. The negation
            // cannot reach state -- it is never written back to `vel`.
            if !kick.is_zero() {
                self.events.push(Event::Shove {
                    entity,
                    // Nobody to blame. A recoil is a fighter's own swing
                    // throwing it off its feet, which is why this variant
                    // carries a shover that is allowed not to exist.
                    shover: EntityId::NONE,
                    impulse: -kick,
                    at,
                });
            }
        }
    }

    fn reap_dead(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i].is_positive() {
                continue;
            }
            let entity = self.id_of(i);
            let killer = self.last_attacker[i];
            self.alive[i] = false;
            self.generation[i] = self.generation[i].wrapping_add(1);
            self.command[i] = Command::HOLD;
            self.free.push(i as u32);
            self.events.push(Event::Death { entity, killer });
        }
    }

    /// Leans on doors, and opens whichever has been leant on long enough.
    ///
    /// Runs after movement has resolved -- so the positions it measures are the
    /// ones the tick ended at -- and before the dead are reaped, so a body that
    /// was standing on a door when the blow landed still spent that tick
    /// pushing it.
    ///
    /// **Two passes rather than one**, which is the shape
    /// [`World::resolve_swings`] uses and for the same reason: the first pass
    /// only reads and marks, the second decides. Folded into one, the answer
    /// would depend on which unit was visited first -- the door would open under
    /// whichever body happened to hold the lower index, and a second body
    /// leaning on the same door in the same tick would find it already floor.
    ///
    /// Two conditions to be leaning, and neither is sufficient alone. Being
    /// *near* a door is where every route on the level converges, so proximity
    /// alone would have a corridor's worth of traffic opening every door it
    /// walked past; asking only about the commanded direction would have a body
    /// across the room opening one by facing it.
    fn press_doors(&mut self) {
        if self.doors.is_empty() {
            return;
        }
        // Taken out and put back so the borrow checker can see that the mark
        // buffer and the columns being read are different fields; the same
        // trick `web::Sim::advance` uses on its scratch.
        let mut pushed = std::mem::take(&mut self.door_pushed);
        pushed.clear();
        pushed.resize(self.doors.len(), false);

        for i in 0..self.alive.len() {
            if !self.alive[i] || !self.kind[i].opens_doors() {
                continue;
            }
            let dir = self.command[i].move_dir.clamp_length(Fx::ONE);
            if dir.is_zero() {
                continue;
            }
            let (me, reach) = (self.pos[i], self.radius[i] + rules::DOOR_REACH);
            for (k, slot) in pushed.iter_mut().enumerate() {
                if self.doors[k].open || *slot {
                    continue;
                }
                *slot = self.doors[k].door.cells().iter().any(|&cell| {
                    let (tx, ty) = self.dungeon.tile_at(cell);
                    // Closest point on the tile block, which is the same test
                    // `Dungeon::push_out` makes -- so "near enough to lean on"
                    // and "near enough to be stopped by" are measured off one
                    // shape rather than two.
                    let closest = Vec2::new(
                        me.x.clamp(Fx::from_int(tx), Fx::from_int(tx + 1)),
                        me.y.clamp(Fx::from_int(ty), Fx::from_int(ty + 1)),
                    );
                    let to = closest - me;
                    // **The rejection that makes this loop affordable**, and it
                    // is exact rather than an approximation -- which is what
                    // lets it sit in front of a rule the state hash depends on.
                    //
                    // Every doorway on the level is measured against every body
                    // that has hands, every tick, and `Vec2::length` is
                    // `isqrt64`: a restoring bit-search, some sixty iterations
                    // of a branchy loop. A generated floor carries around
                    // seventeen doorways of three tiles each, so the honest test
                    // spends fifty of those square roots a tick discovering that
                    // all but one doorway is across the map. Measured on the
                    // carved bench that was 22% of the whole tick.
                    //
                    // A length is never shorter than either of its components:
                    // `x*x <= x*x + y*y`, and `isqrt64` floors, so it holds in
                    // raw units too. One component past `reach` therefore
                    // settles it without the root. `Fx::abs` saturates rather
                    // than wrapping at `i32::MIN`, so a subtraction that
                    // saturated is rejected rather than mistaken for zero.
                    if to.x.abs() > reach || to.y.abs() > reach {
                        return false;
                    }
                    to.length() <= reach && dir.dot(to).is_positive()
                });
            }
        }

        for (k, &leant_on) in pushed.iter().enumerate() {
            if self.doors[k].open {
                continue;
            }
            self.doors[k].pressed = if leant_on {
                self.doors[k].pressed.saturating_add(1)
            } else {
                self.doors[k].pressed.saturating_sub(1)
            };
            if self.doors[k].pressed >= rules::DOOR_TICKS {
                self.doors[k].open = true;
                // The whole run at once: a doorway is `CORRIDOR` tiles wide
                // because anything narrower plugs, and opening it a tile at a
                // time would produce exactly the gap that argument rules out.
                //
                // Nothing invalidates the route fields here and nothing needs
                // to. `refresh_nav`'s key hashes `dungeon.fingerprint()`, which
                // `open_door` has just moved, so every field rebuilds on the
                // refresh at the bottom of this tick. A second mechanism would
                // be a second thing to keep in step.
                self.dungeon.open_door(self.doors[k].door.cells());
            }
        }

        self.door_pushed = pushed;
    }

    /// Whether any door on this level is still shut. See [`World::nav_arm`].
    fn door_shut(&self) -> bool {
        self.doors.iter().any(|d| !d.open)
    }

    /// Which arm of [`World::nav`] answers for this body.
    ///
    /// The second arm exists only while something is still shut, so this is
    /// where "there is nothing to route around" and "this body could not open
    /// it anyway" become the same answer. One rule read by both the builder and
    /// the reader, so the two cannot disagree about which fields exist:
    /// [`World::refresh_nav`] builds the second arm for a side exactly when
    /// some living body on it would land here on `1`.
    ///
    /// A body that came into existence *since* the last refresh is the one gap
    /// in that pairing, and it is not reachable: [`World::refresh_pending`] and
    /// [`World::refresh_nav`] run back to back at the bottom of the same
    /// [`World::step`] over the same alive set, so nothing can be offered a
    /// decision in a tick where the field it reads was not built for it.
    fn nav_arm(&self, i: usize) -> usize {
        usize::from(self.door_shut() && self.kind[i].opens_doors())
    }

    fn refresh_pending(&mut self) {
        self.pending.clear();
        for i in 0..self.alive.len() {
            if self.alive[i] && self.next_decision[i] <= self.tick {
                self.pending.push(self.id_of(i));
            }
        }
    }

    /// Rebuilds each faction's route field, if what it was built for has moved.
    ///
    /// Sits beside [`World::refresh_pending`] and runs at the same moment for
    /// the same reason: both are derivations of the state the caller is about
    /// to observe, so computing them together is what makes an observation
    /// taken between two steps describe *one* world rather than a mix of two.
    ///
    /// Costs nothing on a world with no objective -- the seed list comes back
    /// empty, the key is stable, and no search runs. That is every scenario the
    /// lab drives.
    fn refresh_nav(&mut self) {
        // Written as one function with no `self` method calls so the borrow
        // checker can see that the scratch buffers and the columns being read
        // are different fields.
        for side in 0..2 {
            // The one thing that cannot be written that way, so it is settled
            // before the scratch buffer is in hand: `resolve` is a method on
            // the whole of `self`, and no amount of field-splitting lets that
            // sit inside a live borrow of `self.nav_seeds`.
            //
            // Both guards live here rather than beside the seeding, because
            // together they are one question -- "is there a body this side is
            // entitled to route at" -- and `None` is the same answer whichever
            // way it fails.
            let quarry = match self.orders[side] {
                Order::Focus(id) => match self.resolve(id) {
                    Some(j) if self.faction[j].index() != side => Some(j),
                    _ => None,
                },
                _ => None,
            };
            let seeds = &mut self.nav_seeds;
            seeds.clear();
            match self.objectives[side] {
                Objective::None => {}
                Objective::Order => match self.orders[side] {
                    // A destination names a place, and so does a quarry -- it
                    // just walks about, which the key below already notices.
                    // Every other order is a statement about how to fight, and
                    // routing toward an `Advance` or a `Regroup` would be
                    // inventing a meaning neither of them has.
                    Order::Goto(dest) => {
                        if let Some(cell) = self.dungeon.goal_cell(dest) {
                            seeds.push(cell);
                        }
                    }
                    // Seeding the named body's cell is the search
                    // `Objective::Hunt` runs just below, narrowed from every
                    // enemy to the one that was pointed at.
                    //
                    // Silent on a handle that does not resolve, on a corpse,
                    // and on one of your own: an empty seed list is an empty
                    // field, `nav_step` reports no route, and no route is a
                    // stop. That is already the answer a `Goto` sealed behind
                    // masonry gets, and it is the answer the policy layer is
                    // written against -- so the three ways a `Focus` can name
                    // nobody need no handling of their own anywhere above here.
                    Order::Focus(_) => {
                        if let Some(j) = quarry {
                            if let Some(cell) = self.dungeon.goal_cell(self.pos[j]) {
                                seeds.push(cell);
                            }
                        }
                    }
                    _ => {}
                },
                Objective::Hunt => {
                    for j in 0..self.alive.len() {
                        if !self.alive[j] || self.faction[j].index() == side {
                            continue;
                        }
                        if let Some(cell) = self.dungeon.goal_cell(self.pos[j]) {
                            seeds.push(cell);
                        }
                    }
                    // Canonical: two quarry in one tile must not seed it twice,
                    // and the search must not depend on which of them was
                    // spawned first.
                    seeds.sort_unstable();
                    seeds.dedup();
                }
            }

            // One arm unless something on the level is still shut. The two
            // searches differ only where a `DOOR` tile is, so on a plan with
            // none -- every duel, every skirmish, and a dungeon level once its
            // last door has been opened -- the second arm is the first one
            // computed twice, and this runs every tick.
            //
            // **And unless somebody on this side can read it**, which is the
            // other half of the same question and is written as the exact
            // mirror of [`World::nav_arm`]: that returns `1` for a body that is
            // resolvable -- so alive -- on this side and holding hands, and a
            // side with no such body never asks for the second field. Building
            // it anyway is a full search over every tile on the floor, every
            // tick, for an answer nobody collects. The shipped floor plan is
            // exactly that case: Monsters hunt, Monsters are Brutes and
            // Skitterers, and none of them opens a door. Worth 14% of a tick on
            // the carved bench with an objective set.
            //
            // The seeding above is outside this loop on purpose: what a faction
            // is trying to reach does not depend on whether it has hands.
            // The door scan first, so the roster scan is not paid on every
            // scenario that has no doors at all -- which is all of them but the
            // dungeon.
            let arms = 1 + usize::from(
                self.doors.iter().any(|d| !d.open)
                    && (0..self.alive.len()).any(|i| {
                        self.alive[i]
                            && self.faction[i].index() == side
                            && self.kind[i].opens_doors()
                    }),
            );
            for arm in 0..arms {
                let opens_doors = arm == 1;
                // **The invalidation is already correct and needs no work**,
                // which is worth saying so nobody adds a second mechanism: this
                // key hashes `dungeon.fingerprint()`, so a door that opens
                // changes the fingerprint, changes the key, and every field
                // rebuilds on its next refresh.
                //
                // The capability has to be in the key too, or the two arms
                // collide on it and the second one silently answers with the
                // first one's field.
                let mut h = Hash64::new();
                h.write_u64(self.dungeon.fingerprint());
                h.write_bool(opens_doors);
                h.write_u8(self.objectives[side].discriminant() as u8);
                for &cell in self.nav_seeds.iter() {
                    h.write_u32(cell);
                }
                let key = h.finish();
                if key == self.nav[side][arm].key && !self.nav[side][arm].dist.is_empty() {
                    continue;
                }
                self.nav[side][arm].key = key;
                self.dungeon.distances_for(
                    &self.nav_seeds,
                    opens_doors,
                    &mut self.nav[side][arm].dist,
                    &mut self.nav_queue,
                );
            }
        }
    }

    /// `at`, moved to the nearest spot a body as wide as `i` could actually
    /// stand.
    ///
    /// **The reachable point, not the raw click.** A destination inside masonry
    /// -- or merely nearer a wall than this body is wide -- is not somewhere
    /// anybody can arrive, and aiming at it leaves the character pressing into
    /// the wall forever, never satisfying an arrival test it cannot satisfy.
    /// This is the clamp the policy layer used to do for itself out of
    /// `wall_clearance`, moved to the one place that holds the floor plan and
    /// generalised from "the arena box" to "the masonry". Per body, because how
    /// close you can get depends on how wide you are.
    ///
    /// The box clamp first, and it is not redundant with the masonry step. A
    /// destination can arrive from the page as a wrapped `i32` -- tens of
    /// thousands of world units out -- and at that magnitude every `Fx`
    /// subtraction inside `nearest_clear` saturates, so its tie-break hands back
    /// whichever tile it scanned first rather than the nearest one. Bringing the
    /// point inside the arena first keeps the arithmetic in range, and the
    /// answer honest: a click off the edge of the world means the edge of the
    /// world.
    ///
    /// A living body is already inside the arena, so that first clamp is dead
    /// weight when the point came off a quarry rather than off a click. It stays
    /// anyway: one rule for both callers is cheaper to hold in the head than an
    /// argument about which of them has earned the shortcut, and the cost is a
    /// pair of comparisons.
    fn reachable_point(&self, i: usize, at: Vec2) -> Vec2 {
        let r = self.radius[i];
        let inside = at.clamp_box(
            Vec2::new(r, r),
            Vec2::new(self.arena.x - r, self.arena.y - r),
        );
        self.dungeon.nearest_clear(inside, r)
    }

    /// The place `i`'s faction is actually trying to get to, if the objective
    /// names one.
    ///
    /// Ground truth and not perception, like [`World::enemy_in_sight`]: this
    /// decides whether the straight line is *walkable*, which is a fact about
    /// the level rather than a judgement the character makes.
    fn nav_goal_point(&self, i: usize) -> Option<Vec2> {
        let side = self.faction[i].index();
        match self.objectives[side] {
            Objective::None => None,
            Objective::Order => match self.orders[side] {
                Order::Goto(dest) => Some(self.reachable_point(i, dest)),
                // A quarry is pulled out of the masonry exactly as a click is,
                // and for the same reason: a body standing in a doorway or hard
                // against a wall is not somewhere a wider hunter can arrive.
                //
                // The two guards repeat `refresh_nav`'s, and they have to. This
                // is a second, independent reading of the same order, and an
                // answer here without seeds there would hand `nav_step`'s
                // shortcut a straight line to a place the field never routed to
                // -- which is worse than either half alone, because it is a
                // route that looks walkable right up until the wall.
                Order::Focus(id) => {
                    let j = self.resolve(id)?;
                    if self.faction[j].index() == side {
                        return None;
                    }
                    Some(self.reachable_point(i, self.pos[j]))
                }
                _ => None,
            },
            // The nearest quarry by straight line, which is what the shortcut
            // below wants to know about: whether this one can simply be walked
            // at. Which quarry the *field* points to may well be another.
            Objective::Hunt => {
                let mut best: Option<(Fx, Vec2)> = None;
                for j in 0..self.alive.len() {
                    if !self.alive[j] || self.faction[j].index() == side {
                        continue;
                    }
                    let d = (self.pos[j] - self.pos[i]).length();
                    match best {
                        Some((seen, _)) if seen <= d => {}
                        _ => best = Some((d, self.pos[j])),
                    }
                }
                best.map(|(_, at)| at)
            }
        }
    }

    /// Which way `i` should walk, and how much ground is left along that route.
    ///
    /// `(Vec2::ZERO, Fx::MAX)` means there is no route -- no objective, or one
    /// sealed off behind masonry. `(Vec2::ZERO, Fx::ZERO)` means arrived.
    fn nav_step(&self, i: usize) -> (Vec2, Fx) {
        let side = self.faction[i].index();
        // A body penned behind a shut door it cannot open reads `u16::MAX` at
        // its own cell and falls out three lines below with no route -- which is
        // already what `UtilityPolicy` is written against, being the same answer
        // a `Goto` sealed behind masonry has always got. Nothing new is needed
        // to make a Skitterer wait.
        let dist = &self.nav[side][self.nav_arm(i)].dist;
        let me = self.pos[i];
        let Some(cell) = self.dungeon.cell_of(me) else {
            return (Vec2::ZERO, Fx::MAX);
        };
        let Some(&here) = dist.get(cell as usize) else {
            return (Vec2::ZERO, Fx::MAX);
        };
        if here == u16::MAX {
            return (Vec2::ZERO, Fx::MAX);
        }

        // 1. **Straight there, whenever straight there works.** Without this the
        //    field is followed tile centre to tile centre: a character crosses
        //    an open room like a chess piece, and -- worse -- an open room stops
        //    behaving the way it does today, because a tile centre is half a
        //    unit off the line the click was actually on.
        //
        //    Not gated on sight. The first version of this asked "is it in
        //    view *and* is the way clear", which quietly meant that a walk
        //    longer than sight range fell back to the grid and wandered off the
        //    straight line by up to half a tile. Clear is clear, however far
        //    away it is; and on a floor plan with nothing carved
        //    `is_walk_clear` answers yes without looking, so every scenario
        //    that is not a dungeon takes this branch every time and behaves
        //    exactly as it always did.
        //
        //    `here == 0` is the last tile, where there is nothing left to route
        //    around.
        if let Some(goal) = self.nav_goal_point(i) {
            let to = goal - me;
            if here == 0 || self.dungeon.is_walk_clear(me, goal, self.radius[i]) {
                return if to.is_zero() {
                    (Vec2::ZERO, Fx::ZERO)
                } else {
                    (to.normalize(), to.length())
                };
            }
        }

        // 2. Downhill, aiming at the neighbour's **centre** rather than along a
        //    cardinal: a unit cardinal has the body hug the wall it is
        //    following, and a corridor is exactly where that costs a corner.
        let (tx, ty) = Dungeon::tile_of(me);
        let mut best: Option<(u16, i32, i32)> = None;
        for dir in Cardinal::ALL {
            let (dx, dy) = dir.step();
            let (nx, ny) = (tx + dx, ty + dy);
            let Some(cell) = self.dungeon.cell(nx, ny) else {
                continue;
            };
            let Some(&d) = dist.get(cell as usize) else {
                continue;
            };
            if d >= here {
                continue;
            }
            // Ties keep the earlier neighbour, and `NEIGHBOURS` is a fixed
            // order, so a body in a corridor junction always picks the same way.
            match best {
                Some((seen, _, _)) if seen <= d => {}
                _ => best = Some((d, nx, ny)),
            }
        }
        let Some((d, nx, ny)) = best else {
            return (Vec2::ZERO, Fx::MAX);
        };
        let to = Dungeon::tile_centre(nx, ny) - me;
        let remaining = Fx::from_int(d as i32) + to.length();
        (to.normalize(), remaining)
    }

    // ---------------------------------------------------------------- queries

    #[inline]
    pub fn tick(&self) -> u32 {
        self.tick
    }

    #[inline]
    pub fn seed(&self) -> u64 {
        self.seed
    }

    #[inline]
    pub fn arena(&self) -> Vec2 {
        self.arena
    }

    /// `None` while both sides still stand.
    pub fn outcome(&self) -> Option<Outcome> {
        let heroes = self.alive_count(Faction::Heroes);
        let monsters = self.alive_count(Faction::Monsters);
        match (heroes, monsters) {
            (0, 0) => Some(Outcome::MutualDestruction),
            (0, _) => Some(Outcome::MonstersWin),
            (_, 0) => Some(Outcome::HeroesWin),
            _ => None,
        }
    }

    /// How a fight that reached its tick limit is scored: on points, to
    /// whichever side is holding more of the health it started with.
    ///
    /// A draw was the honest answer while the clock was the only thing that
    /// could end a fight neither side was winning. It is the wrong answer for a
    /// *difficulty* ladder, because every step down that ladder converts a loss
    /// into a timeout rather than into a defeat: measured, a Fighter slowed to a
    /// 40-tick decision period drew 12% of its fights and one slowed to 60 drew
    /// 20%, so the bottom of the range stopped being "loses" and became
    /// "wanders off". A fighter that spent two and a half minutes being carved
    /// up has lost, and saying so costs nothing and reclaims the whole bottom of
    /// the range.
    ///
    /// A genuine tie is still a [`Outcome::Draw`], and
    /// [`Outcome::is_decisive`] still tells the two apart -- a decision is a
    /// win, and it is not the same win as a kill. `lab::fitness` prices it
    /// accordingly, or evolution would learn to chip once and run out the clock.
    pub fn timeout(&self) -> Outcome {
        let heroes = self.health_fraction(Faction::Heroes);
        let monsters = self.health_fraction(Faction::Monsters);
        if heroes > monsters {
            Outcome::Decision(Faction::Heroes)
        } else if monsters > heroes {
            Outcome::Decision(Faction::Monsters)
        } else {
            Outcome::Draw
        }
    }

    pub fn alive_count(&self, faction: Faction) -> usize {
        (0..self.alive.len())
            .filter(|&i| self.alive[i] && self.faction[i] == faction)
            .count()
    }

    pub fn alive_ids(&self, faction: Faction) -> Vec<EntityId> {
        (0..self.alive.len())
            .filter(|&i| self.alive[i] && self.faction[i] == faction)
            .map(|i| self.id_of(i))
            .collect()
    }

    /// Total remaining health of a faction, as a fraction of what it started
    /// with. A fitness signal that rewards winning *cleanly*.
    pub fn health_fraction(&self, faction: Faction) -> Fx {
        let mut current = Fx::ZERO;
        let mut total = Fx::ZERO;
        for i in 0..self.alive.len() {
            if self.faction[i] != faction {
                continue;
            }
            total += self.max_health_of(i);
            if self.alive[i] {
                current += self.health_of(i).max(Fx::ZERO);
            }
        }
        if total.is_zero() {
            Fx::ZERO
        } else {
            current / total
        }
    }

    pub fn damage_dealt(&self, faction: Faction) -> Fx {
        let mut total = Fx::ZERO;
        for i in 0..self.alive.len() {
            if self.faction[i] == faction {
                total += self.damage_dealt[i];
            }
        }
        total
    }

    pub fn is_alive(&self, id: EntityId) -> bool {
        self.resolve(id).is_some()
    }

    pub fn view(&self, id: EntityId) -> Option<UnitView> {
        self.resolve(id).map(|i| self.view_at(i))
    }

    /// Everything a renderer needs, and nothing it can write back.
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            tick: self.tick,
            arena: self.arena,
            units: (0..self.alive.len())
                .filter(|&i| self.alive[i])
                .map(|i| self.view_at(i))
                .collect(),
            shots: self.shots().collect(),
        }
    }

    /// Arrows currently in the air, in ascending slot order.
    ///
    /// Borrowed and lazy so `web::write_frame` can walk it straight into the
    /// frame buffer without allocating every tick; [`World::snapshot`] collects
    /// it because a `Snapshot` owns its contents by definition.
    pub fn shots(&self) -> impl Iterator<Item = ShotView> + '_ {
        (0..self.shot_alive.len())
            .filter(move |&k| self.shot_alive[k])
            .map(move |k| ShotView {
                position: self.shot_pos[k],
                heading: self.shot_vel[k].angle(),
                speed: self.shot_vel[k].length(),
                faction: self.shot_faction[k],
            })
    }

    /// Fingerprint of the complete simulation state.
    ///
    /// The legacy-domain state value.
    ///
    /// New domain-aware code uses [`World::state_digest`]. Keeping this entry
    /// point is what preserves every existing native and browser golden, but an
    /// articulated world's returned legacy-core value has no meaningful bare
    /// `u64` comparison.
    pub fn state_hash(&self) -> u64 {
        self.legacy_core_hash()
    }

    fn apply_articulated_movement(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.vel[i] = Vec2::ZERO;
                continue;
            }
            self.start_pos[i] = self.pos[i];
            let dir = self.articulated_command[i].map_or(Vec2::ZERO, |command| command.move_dir)
                .clamp_length(Fx::ONE);
            let want = dir * self.stats[i].move_speed() * self.action_of(i).spec().move_bonus;
            let traction = actuator::movement_traction(self.stats[i], self.move_authority[i]);
            let change = (want - self.vel[i]).clamp_length(traction);
            self.vel[i] += change;
            self.move_body(i, self.pos[i] + self.vel[i]);
            if !dir.is_zero() { self.facing[i] = dir.angle(); }
        }
    }

    fn drive_body_yaw(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let target = self.articulated_command[i].map_or(self.body_yaw[i].angle, |command| command.body_yaw);
            actuator::integrate_yaw(&mut self.body_yaw[i], target, self.turn_authority[i]);
        }
    }

    /// Stores one version-1 articulated command without partially accepting a
    /// malformed request. Grip changes remain pending until the next step.
    pub fn submit_articulated_v1(
        &mut self,
        id: EntityId,
        command: ArticulatedCommandV1,
    ) -> SubmitArticulatedOutcome {
        if self.combat_model != crate::CombatModel::Articulated {
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

    /// Byte-boundary companion for a payload whose raw range validation failed
    /// before an `ArticulatedCommandV1` could be constructed.
    pub fn submit_articulated_fallback_v1(
        &mut self,
        id: EntityId,
        field: crate::CommandField,
    ) -> SubmitArticulatedOutcome {
        if self.combat_model != crate::CombatModel::Articulated {
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

    /// The pre-v2 byte writer, kept whole so both domains can reuse it without
    /// making their values comparable.
    fn legacy_core_hash(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_u64(self.seed);
        h.write_u32(self.tick);
        h.write_i32(self.arena.x.raw());
        h.write_i32(self.arena.y.raw());
        // The floor plan, as its digest rather than as 3060 bytes. Written
        // **unconditionally**, including for a floor plan with nothing carved,
        // on exactly the argument the empty shot block below makes: a
        // fingerprint that only looks at the grid once something is standing
        // behind a wall cannot catch a broken tile column until it is too late
        // to say which tick broke it.
        h.write_u64(self.dungeon.fingerprint());
        // And the doorways. Whether one is *open* is a tile value and therefore
        // already in the digest above; how hard somebody is leaning on it is
        // not, and a door one tick from opening is not the same world as an
        // untouched one. Written in ascending door index, with the length first
        // so that two worlds cannot line up one's pressures against another's.
        //
        // **Skipped entirely on a plan with no doorway in it**, which is the one
        // place this departs from the argument the empty shot block below makes
        // -- and the departure is sound because the two are not the same shape.
        // An arrow can be loosed into a world that has never held one, so a shot
        // column that is only fingerprinted once something is flying is a column
        // nothing checks until it is too late to say which tick broke it. A door
        // cannot be built: the list is read off the floor plan when the world is
        // constructed and is fixed in length for its life, so "no doors" is a
        // permanent fact about this world rather than a state it is passing
        // through. Writing a zero for it would have moved `GOLDEN_STATE_HASH`
        // and every lab golden to record that nothing had changed.
        if !self.doors.is_empty() {
            h.write_u32(self.doors.len() as u32);
            for door in &self.doors {
                h.write_u16(door.pressed);
            }
        }
        for order in self.orders {
            order.hash_into(&mut h);
        }
        // Beside the orders because it is the same kind of thing: an input the
        // page can change, and two runs that differ in it are two runs.
        for objective in self.objectives {
            objective.hash_into(&mut h);
        }
        h.write_u32(self.alive.len() as u32);
        for i in 0..self.alive.len() {
            h.write_bool(self.alive[i]);
            h.write_u32(self.generation[i]);
            h.write_i32(self.pos[i].x.raw());
            h.write_i32(self.pos[i].y.raw());
            h.write_u16(self.facing[i].raw());
            h.write_i32(self.hp[i].raw());
            h.write_i32(self.vel[i].x.raw());
            h.write_i32(self.vel[i].y.raw());
            // Every field of every hand, `phase` included. It looks like a
            // rounding residue and it is real state: two worlds differing only
            // in phase produce different angles one tick later, and a replay
            // that did not fingerprint it would diverge with nothing to point
            // at.
            self.limb[i].hash_into(&mut h);
            // The loadout and the slot are state the sim acts on, and the page
            // can change both -- so a run in which a fighter swapped and one in
            // which it did not must not fingerprint alike. The same argument
            // `Order::hash_into` makes for a destination.
            self.loadout[i].hash_into(&mut h);
            h.write_u8(self.slot[i]);
            // And so are the body and the stat sheet, for exactly the same
            // reason and only since `World::set_body` and `World::set_stats`
            // landed. While these were fixed at spawn they were a fact about the
            // *scenario*, already fingerprinted by `Scenario::fingerprint`, and
            // hashing them here would have bought nothing. They are inputs now,
            // so a run in which the page raised a fighter's vitality and one in
            // which it did not must not fingerprint alike.
            //
            // `radius`, `mass` and `max_hp` are written even though all three
            // are derived -- the first two from `kind` and the third from
            // `stats` -- because they are *cached* derivations sitting in their
            // own columns, and a mutator that updated one and forgot another is
            // precisely the half-change `UnitSpec::set_body` exists to warn
            // about. A fingerprint that cannot see the halves apart cannot catch
            // it.
            self.stats[i].hash_into(&mut h);
            self.kind[i].hash_into(&mut h);
            h.write_i32(self.radius[i].raw());
            h.write_i32(self.mass[i].raw());
            h.write_i32(self.max_hp[i].raw());
            h.write_u32(self.next_decision[i]);
            h.write_u32(self.last_combat[i]);
            h.write_i32(self.regen_left[i].raw());
            h.write_i32(self.damage_dealt[i].raw());
            self.command[i].hash_into(&mut h);
        }
        // Arrows. State the sim acts on like any other: two worlds identical but
        // for one having a shot in the air diverge the moment it arrives.
        //
        // Written **unconditionally**, including the length when there are no
        // arrows anywhere. Hashing the block only when it is non-empty would
        // have spared a golden re-record and left a fingerprint that cannot see
        // a broken projectile column until something is already flying -- which
        // is precisely when a replay is hardest to reason about.
        //
        // `shot_free` is not hashed, following `World::free`'s precedent: the
        // free list is reachable-state bookkeeping, and any two worlds with the
        // same history have the same one.
        h.write_u32(self.shot_alive.len() as u32);
        for k in 0..self.shot_alive.len() {
            h.write_bool(self.shot_alive[k]);
            h.write_i32(self.shot_pos[k].x.raw());
            h.write_i32(self.shot_pos[k].y.raw());
            h.write_i32(self.shot_vel[k].x.raw());
            h.write_i32(self.shot_vel[k].y.raw());
            h.write_i32(self.shot_range[k].raw());
            h.write_i32(self.shot_mass[k].raw());
            h.write_i32(self.shot_power[k].raw());
            h.write_u8(self.shot_faction[k].index() as u8);
            self.shot_owner[k].hash_into(&mut h);
        }
        h.finish()
    }

    /// A state fingerprint carrying the byte grammar needed to compare it.
    pub fn state_digest(&self) -> crate::StateDigest {
        match self.combat_model {
            crate::CombatModel::Legacy => crate::StateDigest {
                domain: crate::HashDomain::LegacyV1,
                schema: 1,
                value: self.legacy_core_hash(),
            },
            crate::CombatModel::Articulated => {
                let mut h = Hash64::new();
                h.write_bytes(b"ARPG-STATE");
                h.write_u16(1);
                h.write_u8(crate::CombatModel::Articulated as u8);
                // Reserved now so v2-11 can activate the submitted-command
                // grammar without changing the prefix that declares it.
                h.write_u16(1);
                h.write_u64(self.legacy_core_hash());
                h.write_u32(self.articulated_command.len() as u32);
                for command in &self.articulated_command {
                    match command {
                        None => h.write_u8(0),
                        Some(command) => {
                            h.write_u8(1);
                            h.write_u8(1);
                            h.write_bytes(&command.payload_bytes());
                        }
                    }
                }
                self.combat_specs.as_ref().expect("articulated combat specs")
                    .rows_into(&self.combat_units, &mut h);
                for i in 0..self.articulated_command.len() {
                    h.write_u16(self.articulated_anatomy[i].expect("articulated slot anatomy"));
                    for item in self.articulated_carried[i] {
                        match item {
                            None => h.write_u8(0),
                            Some(id) => { h.write_u8(1); h.write_u16(id); }
                        }
                    }
                    for item in self.articulated_equipment[i] {
                        match item {
                            None => h.write_u8(0),
                            Some(id) => { h.write_u8(1); h.write_u16(id); }
                        }
                    }
                }
                for i in 0..self.articulated_command.len() {
                    let yaw = self.body_yaw[i];
                    h.write_u16(yaw.angle.raw());
                    h.write_i32(yaw.speed_turns.raw());
                    h.write_i32(yaw.authority_residue.raw());
                    for arm in self.arms[i] {
                        h.write_u16(arm.bearing.raw());
                        h.write_i32(arm.bearing_speed_turns.raw());
                        h.write_i32(arm.height.raw());
                        h.write_i32(arm.height_speed.raw());
                        h.write_i32(arm.reach.raw());
                        h.write_i32(arm.reach_speed.raw());
                        for point in [arm.previous_hand, arm.hand, arm.linear_velocity] {
                            h.write_i32(point.x.raw()); h.write_i32(point.y.raw()); h.write_i32(point.z.raw());
                        }
                        h.write_i32(arm.fatigue.raw());
                        h.write_i32(arm.work_residue.raw());
                    }
                    for grip in self.grips[i] {
                        match grip.equipment_slot {
                            None => h.write_u8(0),
                            Some(slot) => { h.write_u8(1); h.write_u8(slot); }
                        }
                    }
                    match self.shield_pose[i] {
                        None => h.write_u8(0),
                        Some(shield) => {
                            h.write_u8(1);
                            for point in [shield.centre, shield.normal] {
                                h.write_i32(point.x.raw()); h.write_i32(point.y.raw()); h.write_i32(point.z.raw());
                            }
                            h.write_i32(shield.half_width.raw());
                            h.write_i32(shield.half_height.raw());
                            h.write_i32(shield.thickness.raw());
                        }
                    }
                    h.write_i32(self.move_authority[i].raw());
                    h.write_i32(self.turn_authority[i].raw());
                    h.write_i32(self.arm_authority[i][0].raw());
                    h.write_i32(self.arm_authority[i][1].raw());
                }
                // One global counter, after the complete actuator loop and
                // before the anatomy rows. Not per slot: the iteration cap
                // is a property of the tick, not of any entity in it, and a
                // per-slot copy would be four bytes of the same number sixty-
                // four times over. It is the only contact byte in this digest --
                // the resolutions and the scratch are evidence, and hashing
                // evidence would make an observation into authoritative state.
                h.write_u32(self.contact_cap_hits());
                // One 61-byte anatomy row per allocated slot, with no second
                // slot count: the actuator loop above has already established
                // the length, and a repeated count is a second thing that can
                // disagree. Dead slots keep their final row -- a later bleed
                // reads `last_attacker` off a body that has stopped moving, so
                // it is authoritative after death as well as before it.
                for i in 0..self.articulated_command.len() {
                    self.wounds.get(i).copied().unwrap_or(AnatomyState::EMPTY).hash_into(&mut h);
                }
                crate::StateDigest {
                    domain: crate::HashDomain::ArticulatedV1,
                    schema: 1,
                    value: h.finish(),
                }
            }
        }
    }

    // ---------------------------------------------------------------- internals

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
        }
    }

    fn initialize_articulated_pose(&mut self, i: usize) {
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        let anatomy = table.anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy");
        let yaw = self.facing[i];
        self.body_yaw[i] = BodyYawState { angle: yaw, speed_turns: Fx::ZERO, authority_residue: Fx::ZERO };
        let mut arms = [actuator::tucked_arm(Vec3::ZERO); 2];
        let mut grips = [GripState { equipment_slot: None }; 2];
        for limb in 0..2 {
            let hand = actuator::hand_position(
                anatomy, yaw, limb, Angle::ZERO, crate::CombatHeight::MID,
                Fx::from_raw(actuator::ARM_MIN_REACH_RAW),
            );
            arms[limb] = actuator::tucked_arm(hand);
            grips[limb].equipment_slot = self.articulated_equipment[i][limb].and_then(|id| {
                self.articulated_carried[i].iter().position(|item| *item == Some(id)).map(|slot| slot as u8)
            });
        }
        self.arms[i] = arms;
        self.grips[i] = grips;
        self.move_authority[i] = Fx::ONE;
        self.turn_authority[i] = Fx::ONE;
        self.arm_authority[i] = [Fx::ONE; 2];
        self.wounds[i] = AnatomyState::new(anatomy);
        self.shield_pose[i] = self.derive_shield_pose(i);
    }

    /// The once-per-tick half of anatomy: bleed, shed shock, and republish the
    /// impairment factors the next tick's actuator reads.
    ///
    /// It runs after every contact group rather than between them, and that is
    /// the contract rather than convenience: bleeding between two simultaneous
    /// facts would make the second read a body the first had already drained,
    /// which is exactly the asymmetry the group snapshot exists to prevent.
    fn settle_anatomy(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let Some(spec) = self.anatomy_spec(i).cloned() else { continue };
            let before = self.wounds[i].health(&spec);
            anatomy::bleed_and_decay(&mut self.wounds[i], &spec);
            // Credited against what the query lost, not against the blood: a
            // body whose regional fraction is already the smaller of the two
            // terms bleeds without its health moving, and crediting the blood
            // there would pay an attacker for damage nobody took.
            let lost = (before - self.wounds[i].health(&spec)).max(Fx::ZERO);
            let source = self.resolve(self.wounds[i].last_attacker);
            if let (true, Some(source)) = (lost.is_positive(), source) {
                self.damage_dealt[source] += lost;
            }
            let state = self.wounds[i];
            self.arm_authority[i] = [
                anatomy::authority(&state, &spec, BodyPart::LeftArm),
                anatomy::authority(&state, &spec, BodyPart::RightArm),
            ];
            // One factor, written twice. Translation and turning share the legs
            // and share the shock, and the contract deliberately does not give
            // them separate pools in this slice.
            let legs = anatomy::authority(&state, &spec, BodyPart::Legs);
            self.move_authority[i] = legs;
            self.turn_authority[i] = legs;
        }
    }

    /// The articulated reaper. Same removal as the legacy one -- and it has to
    /// be, because `outcome` counts the living and nothing else -- but the
    /// predicate is the anatomy query and the killer comes off the anatomy's own
    /// `last_attacker` rather than the legacy column.
    ///
    /// Positioned after every contact group and after the anatomy phase, so two
    /// fighters whose fatal blows land on one mapped time both die.
    fn reap_dead_articulated(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            if !self.wounds.get(i).is_some_and(|state| state.is_dead()) { continue; }
            let entity = self.id_of(i);
            let killer = self.wounds[i].last_attacker;
            self.alive[i] = false;
            self.generation[i] = self.generation[i].wrapping_add(1);
            self.command[i] = Command::HOLD;
            self.free.push(i as u32);
            self.events.push(Event::Death { entity, killer });
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

    fn derive_shield_pose(&self, i: usize) -> Option<ShieldPose> {
        let table = self.combat_specs.as_ref()?;
        for limb in 0..2 {
            let Some(slot) = self.grips[i][limb].equipment_slot else { continue };
            let Some(id) = self.articulated_carried[i].get(slot as usize).copied().flatten() else { continue };
            let Some(item) = table.equipment(id) else { continue };
            if let crate::EquipmentGeometry::Shield { half_width, half_height, thickness } = item.geometry {
                let yaw = self.body_yaw[i].angle;
                return Some(ShieldPose {
                    centre: self.arms[i][limb].hand,
                    normal: Vec3::new(yaw.cos(), yaw.sin(), Fx::ZERO),
                    half_width, half_height, thickness,
                });
            }
        }
        None
    }

    fn equipment_in_grip(&self, i: usize, limb: usize) -> Option<crate::EquipmentSpec> {
        let slot = self.grips[i][limb].equipment_slot?;
        let id = self.articulated_carried[i].get(slot as usize).copied().flatten()?;
        self.combat_specs.as_ref()?.equipment(id).copied()
    }

    fn resulting_grips(
        &self,
        i: usize,
        requests: [GripRequest; 2],
    ) -> Result<[Option<u8>; 2], CommandReject> {
        let limb = |arm| if arm == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm };
        let reject = |arm, slot| CommandReject::MissingEquipment { arm: limb(arm), slot };
        let mut result = [None; 2];
        for arm in 0..2 {
            result[arm] = match requests[arm] {
                GripRequest::Keep => self.grips[i][arm].equipment_slot,
                GripRequest::Release => None,
                GripRequest::EquipSlot(slot) => {
                    if self.articulated_carried[i].get(slot as usize).copied().flatten().is_none() {
                        return Err(reject(arm, slot));
                    }
                    Some(slot)
                }
            };
        }
        let table = self.combat_specs.as_ref().expect("articulated combat specs");
        let item = |slot: u8| self.articulated_carried[i].get(slot as usize).copied().flatten()
            .and_then(|id| table.equipment(id));
        match result {
            [None, None] => Ok(result),
            [Some(slot), None] => match item(slot) {
                Some(row) if row.binding == crate::GripBinding::Left => Ok(result),
                _ => Err(reject(0, slot)),
            },
            [None, Some(slot)] => match item(slot) {
                Some(row) if row.binding == crate::GripBinding::Right => Ok(result),
                _ => Err(reject(1, slot)),
            },
            [Some(left), Some(right)] if left == right => match item(left) {
                Some(row) if row.binding == crate::GripBinding::Both
                    && !matches!(row.geometry, crate::EquipmentGeometry::Shield { .. }) => Ok(result),
                _ => Err(reject(0, left)),
            },
            [Some(left), Some(right)] => {
                let Some(left_item) = item(left) else { return Err(reject(0, left)) };
                let Some(right_item) = item(right) else { return Err(reject(1, right)) };
                if left_item.binding != crate::GripBinding::Left { return Err(reject(0, left)); }
                if right_item.binding != crate::GripBinding::Right { return Err(reject(1, right)); }
                if matches!(left_item.geometry, crate::EquipmentGeometry::Shield { .. })
                    && matches!(right_item.geometry, crate::EquipmentGeometry::Shield { .. }) {
                    return Err(reject(1, right));
                }
                Ok(result)
            }
        }
    }

    fn apply_articulated_grips(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let requests = self.articulated_command[i]
                .map_or([GripRequest::Keep; 2], |command| command.grips);
            let mut pair = self.resulting_grips(i, requests)
                .expect("stored articulated grip transaction was validated");
            // An arm that is gone cannot take hold of anything, whatever the
            // stored command still asks for. Without this an `EquipSlot`
            // submitted before the severance re-acquires the weapon every tick
            // -- the contact phase drops it again at group end and no collider
            // is ever built from it, so nothing downstream sees the weapon, but
            // the grip and the shield pose are hashed state and would flip
            // twice a tick for the rest of the fight.
            for limb in 0..2 {
                let part = limb_body_part(limb as u8).expect("a limb slot");
                if self.wounds.get(i).is_some_and(|state| !state.present(part)) {
                    pair[limb] = None;
                }
            }
            self.grips[i] = pair.map(|equipment_slot| GripState { equipment_slot });
        }
    }

    fn drive_articulated_arms(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let command = self.articulated_command[i].unwrap_or_else(|| self.neutral_articulated(i));
            let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                .expect("validated articulated anatomy").clone();
            let yaw = self.body_yaw[i].angle;
            let left_item = self.equipment_in_grip(i, 0);
            let right_item = self.equipment_in_grip(i, 1);
            let both = self.grips[i][0].equipment_slot.is_some()
                && self.grips[i][0].equipment_slot == self.grips[i][1].equipment_slot
                && right_item.is_some_and(|item| item.binding == crate::GripBinding::Both);
            if both {
                self.arms[i][0].previous_hand = self.arms[i][0].hand;
                let step = actuator::integrate_arm(
                    &mut self.arms[i][1], &anatomy, yaw, 1, command.arms[1], right_item,
                    self.stats[i], self.arm_authority[i][1],
                );
                actuator::bill_fatigue(
                    &mut self.arms[i][0], actuator::equipment_inertia(right_item), command.arms[1].effort, step,
                );
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, yaw);
            } else {
                actuator::integrate_arm(
                    &mut self.arms[i][0], &anatomy, yaw, 0, command.arms[0], left_item,
                    self.stats[i], self.arm_authority[i][0],
                );
                actuator::integrate_arm(
                    &mut self.arms[i][1], &anatomy, yaw, 1, command.arms[1], right_item,
                    self.stats[i], self.arm_authority[i][1],
                );
            }
        }
    }

    fn derive_articulated_geometry(&mut self) {
        for i in 0..self.alive.len() {
            if self.alive[i] { self.shield_pose[i] = self.derive_shield_pose(i); }
        }
    }

    /// Take every slot's tick-entry pose, and clear last tick's resolutions.
    ///
    /// Dead slots are retained too. Nothing reads them, but keeping the row
    /// index equal to the slot index removes the only reason this phase would
    /// need a second mapping, and a mapping is what a reused slot breaks.
    fn retain_contact_entry(&mut self) {
        let Some(mut contact) = self.contact.take() else { return };
        contact.resolutions.clear();
        contact.entry.clear();
        for i in 0..self.alive.len() {
            contact.entry.push(TickEntry {
                pos: self.pos[i],
                locomotion: Vec2::ZERO,
                arms: self.arms[i],
                shield: self.shield_pose[i],
                yaw: self.body_yaw[i],
                grips: self.grips[i],
                // Placeholders: both are written by the contact phase itself,
                // which is the only moment "before contact touched it" means
                // anything. Seeding them from the tick-entry row keeps a slot
                // that never reaches the phase from carrying a stale pose.
                pre_contact: [ArmScalars::of(self.arms[i][0]), ArmScalars::of(self.arms[i][1])],
                clamped: [false; 2],
                contact_overrode: [false; 2],
            });
        }
        self.contact = Some(contact);
    }

    /// The second of the three planar points, taken after movement and before
    /// separation because that is the only place it exists.
    fn record_contact_locomotion(&mut self) {
        let Some(mut contact) = self.contact.take() else { return };
        for (i, entry) in contact.entry.iter_mut().enumerate() {
            entry.locomotion = self.pos[i] - entry.pos;
        }
        self.contact = Some(contact);
    }

    /// The contact phase.
    ///
    /// Positioned here rather than earlier because it reads the geometry the
    /// actuator has just derived, and doors are pressed against the pose it
    /// settles. That position is frozen by the contract, which is why it is
    /// pinned by a phase trace rather than argued from the reading order of the
    /// match above.
    ///
    /// The entry clamp runs even when nothing touches, and that is the
    /// contract's rule rather than an accident of ordering: its job is to keep
    /// the sweep inside the geometry envelope, and a row that leaves the
    /// envelope is dangerous whether or not anything was going to touch it --
    /// `fx` fails an out-of-envelope sweep *closed*, which manufactures a
    /// contact rather than dropping one.
    ///
    /// **The driver is handed scratch, never a world column.** The contract
    /// left checkpoint C to choose between advancing a copy and swapping on
    /// success, or treating any `ResolutionError` as fatal. Neither was needed:
    /// building colliders into `contact.colliders`, solving there, and
    /// committing afterwards makes the partial advance a property of scratch
    /// the world never sees. A mid-tick error therefore costs the tick its
    /// contact and nothing else -- no half-written body, no copy, and no panic
    /// on the one path whose far end is a browser holding typed-array views
    /// into linear memory.
    fn resolve_contact(&mut self) {
        if self.contact.is_none() { return; }
        self.clamp_contact_entry();
        let Some(mut contact) = self.contact.take() else { return };
        // Lifted out rather than borrowed: the projector holds `&World` for the
        // whole solve and the wound application has to write. Taking the vector
        // makes the two borrows disjoint by construction instead of by
        // argument, and the entry copy beside it is what an error rolls back to.
        let mut wounds = core::mem::take(&mut self.wounds);
        contact.anatomy_entry.clear();
        contact.anatomy_entry.extend_from_slice(&wounds);
        contact.credit.clear();
        contact.credit.resize(wounds.len(), Fx::ZERO);
        let solved = {
            let ContactRuntime { state, scratch, colliders, resolutions, entry, bodies,
                                 credit, deltas, fact_loss, .. } = &mut contact;
            self.build_contact_colliders(entry, colliders, &wounds);
            let mut projector = ContactProjector {
                world: self, entry, bodies, wounds: &mut wounds, credit, deltas, fact_loss,
            };
            resolution::solve_contact_tick(colliders, &mut projector, state, resolutions, scratch)
        };
        match solved {
            Ok(_) => {
                self.wounds = wounds;
                for i in 0..self.damage_dealt.len().min(contact.credit.len()) {
                    self.damage_dealt[i] += contact.credit[i];
                }
                self.commit_contact(&mut contact);
                self.release_severed_grips();
            }
            Err(cause) => {
                // Restored into the vector that was taken, not into the empty
                // husk `mem::take` left behind: the husk has no capacity, and
                // refilling it would allocate on the one path whose far end is
                // a browser holding views into linear memory.
                wounds.clear();
                wounds.extend_from_slice(&contact.anatomy_entry);
                self.wounds = wounds;
                contact.resolutions.clear();
                // Counted here and nowhere else, because this line is the one
                // that makes the rejection invisible from outside.
                contact.rejections = contact.rejections.saturating_add(1);
                contact.first_rejection.get_or_insert(cause);
            }
        }
        self.contact = Some(contact);
    }

    /// A severed arm drops what it was holding.
    ///
    /// The collider row already left the tick that took the arm off; this is
    /// the authoritative column catching up, and it has to be a direct write.
    /// `resulting_grips` speaks in `GripRequest`s and cannot express "this arm
    /// only" for a two-handed item -- a one-sided release of a `Both` binding is
    /// an error there -- so a severed arm holding one releases both hands.
    fn release_severed_grips(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let severed = [!self.wounds[i].present(BodyPart::LeftArm),
                           !self.wounds[i].present(BodyPart::RightArm)];
            if !(severed[0] || severed[1]) { continue; }
            let drop_both = self.two_handed(i);
            let mut released = false;
            for limb in 0..2 {
                if !(drop_both || severed[limb]) { continue; }
                if self.grips[i][limb].equipment_slot.is_none() { continue; }
                self.grips[i][limb].equipment_slot = None;
                released = true;
            }
            if released { self.shield_pose[i] = self.derive_shield_pose(i); }
        }
    }

    /// The trial velocity one equipment row would actually end up with.
    ///
    /// An impulse moves a *point*; authoritative state is a *joint pose*, and a
    /// shoulder cannot reach past its arm. So the trial goes out to the hand the
    /// velocity implies, back through the joint, and out to the velocity the
    /// clamped joint can deliver -- which is the value the energy check reads,
    /// exactly as the contract requires, because keeping the unreachable one
    /// would let a group buy energy the arm cannot supply.
    ///
    /// The hand is derived from the velocity rather than from the collider's
    /// own trajectory, and it has to be: `project` is handed no time, so a
    /// trajectory endpoint is not available to it. It costs nothing, because
    /// both halves of the identity `hand = tick-entry hand + relative velocity`
    /// are the contract's own -- an arm's velocity *is* its hand's displacement
    /// over the tick, which is also what the commit writes back.
    fn joint_clamped_velocity(
        &self,
        row: GeneralizedCollider,
        entries: &[TickEntry],
        body_velocity: Vec3,
        requested: Vec3,
    ) -> Result<Vec3, ResolutionError> {
        let limb = row.slot as usize;
        let (Some(i), true) = (self.resolve(row.entity), limb < 2) else {
            return Err(ResolutionError::ColliderIndex);
        };
        let entry = entries.get(i).ok_or(ResolutionError::ColliderIndex)?;
        let anatomy = self.combat_specs.as_ref()
            .and_then(|table| table.anatomy(self.articulated_anatomy[i]?))
            .ok_or(ResolutionError::ColliderIndex)?;
        let yaw = self.body_yaw[i].angle;
        let entry_hand = entry.arms[limb].hand;
        let trial = entry_hand + (requested - body_velocity);
        let (bearing, height, reach) =
            actuator::inverse_hand(anatomy, yaw, limb, trial, self.arms[i][limb].bearing);
        let reachable = actuator::hand_position(anatomy, yaw, limb, bearing, height, reach);
        // Clamped again on the way out. The joint bounds a hand, not a speed,
        // and a hand hauled from one side of the body to the other inside one
        // tick is a displacement the envelope still has to survive. Nothing in
        // spec reaches it -- this is the same tripwire the entry clamp is.
        Ok(clamp_contact_velocity(body_velocity + (reachable - entry_hand)))
    }

    /// Write the solved tick back onto the world's own columns.
    ///
    /// **A row is written only when it moved**, and that is not an
    /// optimisation. `inverse_hand` is not the exact inverse of
    /// `hand_position` -- the forward map goes through a sine table and the
    /// inverse through `Vec2::angle`, and the round trip is measured at up to
    /// 53 raw units of hand movement -- so re-deriving an untouched arm would
    /// drift the pose of every fighter that touched nothing, every tick, and
    /// the contract's "with no fact and no entry clamp they are the saved
    /// requested World rows byte-for-byte" would be false.
    fn commit_contact(&mut self, contact: &mut ContactRuntime) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            // The reborrow is what keeps the row's own reads immutable while
            // its answer is written back beside them. The answer is diagnostic
            // -- see `TickEntry::contact_overrode` -- so it is recorded after
            // the commit rather than during it, where an early return would
            // decide it by accident.
            let overrode = self.commit_contact_row(i, contact);
            if let Some(entry) = contact.entry.get_mut(i) { entry.contact_overrode = overrode; }
        }
    }

    /// Answers which limbs this commit wrote a joint pose for.
    fn commit_contact_row(&mut self, i: usize, contact: &ContactRuntime) -> [bool; 2] {
        let mut overrode = [false; 2];
        let entity = self.id_of(i);
        let Some(body) = contact.colliders.iter().copied().find(|row| {
            row.entity == entity && matches!(row.shape, ContactShape::Body { .. })
        }) else { return overrode };
        let ContactShape::Body { previous_origin, .. } = body.shape else { return overrode };
        let entry = contact.entry[i];
        let capped = contact.scratch.capped_entities().contains(&entity);
        let remaining = last_group_remaining(&contact.resolutions, entity);
        // The solver's own body origin, before the wall has had its say. A
        // rigid push must not drag a hand out of its socket, so the arm's
        // *relative* pose is fixed against this and the settlement below then
        // carries body and arms together.
        let origin = previous_origin;

        let mut held = [false; 2];
        for limb in 0..2 {
            let Some(row) = contact.colliders.iter().copied().find(|row| {
                row.entity == entity && row.slot as usize == limb
                    && !matches!(row.shape, ContactShape::Body { .. })
            }) else { continue };
            let Some(hand) = self.collider_hand(i, row) else { continue };
            held[limb] = true;
            let relative = hand - origin;
            if relative == self.arms[i][limb].hand && !entry.clamped[limb] && !capped { continue; }
            self.commit_arm(i, limb, relative, entry, remaining, capped);
            overrode[limb] = true;
        }

        // One commit of the body endpoint, through the path a knockback already
        // uses. `move_body` rather than `settle` alone: contact deltas are
        // bounded by the component clamp and nothing narrower, so a single
        // displacement can be longer than the one-tile walls this level plan
        // carves -- and `settle` on its own would clamp the destination without
        // ever noticing the masonry it passed through. `move_body` calls
        // `settle` once per swept sub-step, which is "the existing
        // wall-settlement path" applied once to one commit, and it degenerates
        // to exactly one `settle` on an uncarved plan.
        let solved_position = Vec2::new(previous_origin.x, previous_origin.y);
        let solved_velocity = Vec2::new(body.velocity.x, body.velocity.y);
        self.vel[i] = solved_velocity;
        if solved_position != self.pos[i] { self.move_body(i, solved_position); }
        let settled_velocity = self.vel[i];

        // The wall's share, which is dissipative, unledgered, and outside every
        // group. Zeroing the absolute component on each held collider and then
        // rebuilding the relative one is what keeps it dissipative: the body
        // lost that component too, so the difference loses it as well and the
        // closure's energy can only fall.
        if settled_velocity != solved_velocity {
            for limb in 0..2 {
                if !held[limb] { continue; }
                let mut absolute = Vec3::new(solved_velocity.x, solved_velocity.y, Fx::ZERO)
                    + self.arms[i][limb].linear_velocity;
                if settled_velocity.x != solved_velocity.x { absolute.x = Fx::ZERO; }
                if settled_velocity.y != solved_velocity.y { absolute.y = Fx::ZERO; }
                self.arms[i][limb].linear_velocity = absolute
                    - Vec3::new(settled_velocity.x, settled_velocity.y, Fx::ZERO);
            }
        }

        if held[0] || held[1] {
            if held[1] && self.two_handed(i) {
                let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                    .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                    .expect("validated articulated anatomy").clone();
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, self.body_yaw[i].angle);
                // The mirror rebuilds the left velocity from the hands, which
                // is right everywhere except here: a capped entity's owner was
                // zeroed, and the contract mirrors the zero rather than a
                // displacement the cap refused to let happen.
                if capped { self.arms[i][0].linear_velocity = Vec3::ZERO; }
                // A `Both` grip gives the left arm no collider of its own, so
                // the loop above never marks it -- but the mirror has just
                // hauled it wherever the right arm was taken. Reporting it as
                // still chasing a target would animate one arm recoiling and
                // the other reaching, off the same weapon. The mirror is a
                // no-op when the right arm was not committed, which is why the
                // right arm's answer is the whole condition.
                overrode[0] |= overrode[1];
            }
            // The shield pose is a cached derivation of the hand and the yaw,
            // and it is hashed. An arm the solver moved leaves it stale, which
            // would put the drawn and the hashed shield in two different
            // places.
            self.shield_pose[i] = self.derive_shield_pose(i);
        }
        overrode
    }

    /// One contacted arm, written back as a joint pose.
    fn commit_arm(
        &mut self, i: usize, limb: usize, hand: Vec3,
        entry: TickEntry, remaining: u32, capped: bool,
    ) {
        let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
            .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy").clone();
        let yaw = self.body_yaw[i].angle;
        let pre = entry.pre_contact[limb];
        let (bearing, height, reach) = actuator::inverse_hand(&anatomy, yaw, limb, hand, pre.bearing);
        // The *clamped* hand, not the one asked for. The joint may refuse, and
        // the state that has to be self-consistent is the pose plus the hand it
        // actually produces.
        let reachable = actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach);
        let arm = &mut self.arms[i][limb];
        arm.bearing = bearing;
        arm.height = height;
        arm.reach = reach;
        arm.hand = reachable;
        arm.previous_hand = entry.arms[limb].hand;
        if capped {
            arm.linear_velocity = Vec3::ZERO;
            arm.bearing_speed_turns = Fx::ZERO;
            arm.height_speed = Fx::ZERO;
            arm.reach_speed = Fx::ZERO;
            return;
        }
        arm.linear_velocity = reachable - arm.previous_hand;
        arm.bearing_speed_turns = Fx::from_raw(scalar_speed(bearing.delta(pre.bearing), remaining));
        arm.height_speed = Fx::from_raw(scalar_speed(height.raw() - pre.height.raw(), remaining));
        arm.reach_speed = Fx::from_raw(scalar_speed(reach.raw() - pre.reach.raw(), remaining));
    }

    /// The absolute hand a solved collider row ended on.
    fn collider_hand(&self, i: usize, row: ContactCollider) -> Option<Vec3> {
        match row.shape {
            // A held segment's hilt *is* the hand: `segment_pose` builds it as
            // the body origin plus the body-relative hand, and everything the
            // driver does afterwards translates or interpolates both endpoints
            // together.
            ContactShape::Segment { previous_hilt, .. } => Some(previous_hilt),
            // A shield publishes only its front face, so the hand comes back by
            // undoing the two offsets `shield_face` added. Both come back
            // exactly: the corners are symmetric about the front centre, and
            // the half-thickness step is the identical product run backwards.
            ContactShape::Shield { previous, .. } => {
                let pose = self.shield_pose[i]?;
                Some(midpoint3(previous[0], previous[2])
                    - pose.normal * (pose.thickness / Fx::from_int(2)))
            }
            ContactShape::Body { .. } => None,
        }
    }

    /// The articulated-only entry clamp, in the contract's exact componentwise
    /// order.
    ///
    /// The order is not cosmetic. `Ve_prime` is built from the *clamped* body
    /// velocity, so a body already at the limit does not get to carry its
    /// equipment past it, and the arm's stored velocity comes out as the
    /// difference of the two clamped absolutes rather than as its own clamp --
    /// which is what stops the body translation from being counted twice.
    fn clamp_contact_entry(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            // Before anything in this phase writes an arm: this is the pose the
            // commit measures contact's own scalar speeds against, and it stops
            // existing on the next line.
            let scalars = [ArmScalars::of(self.arms[i][0]), ArmScalars::of(self.arms[i][1])];
            if let Some(entry) = self.contact.as_mut().and_then(|c| c.entry.get_mut(i)) {
                entry.pre_contact = scalars;
                entry.clamped = [false; 2];
            }
            let body = Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO);
            let clamped_body = clamp_contact_velocity(body);
            self.vel[i] = Vec2::new(clamped_body.x, clamped_body.y);
            let anatomy = self.combat_specs.as_ref().expect("articulated combat specs")
                .anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                .expect("validated articulated anatomy").clone();
            let yaw = self.body_yaw[i].angle;
            let mut shifted = [false; 2];
            for limb in 0..2 {
                let arm = self.arms[i][limb];
                let requested = clamped_body + arm.linear_velocity;
                let clamped = clamp_contact_velocity(requested);
                let shift = clamped - requested;
                // The difference of the two clamped absolutes, not a clamp of
                // the relative velocity: the body translation is already in
                // both terms and cancels, which is the double count the
                // contract warns about. This is the value the collider that
                // gets built from this arm carries into the sweep -- the commit
                // then re-derives it from the hand that was actually reached,
                // because a joint clamp can refuse to put the hand where this
                // arithmetic asked, and the two agree only when it does not.
                self.arms[i][limb].linear_velocity = clamped - clamped_body;
                if shift == Vec3::ZERO { continue; }
                // Only the equipment's own share reaches the hand. The body's
                // share is not applied a second time here and it is not applied
                // anywhere else either: this body's sweep endpoints are the two
                // *positions* the tick produced, not an integration of
                // `World::vel`, so clamping that velocity moves no endpoint to
                // begin with. The contract writes the rule as
                // `body_requested += Db` for a model whose body sweep comes out
                // of its velocity; ours cannot, because locomotion is bounded
                // by movement rules two orders of magnitude under this clamp
                // and the separation shove is positional by construction.
                let hand = arm.hand + shift;
                let (bearing, height, reach) =
                    actuator::inverse_hand(&anatomy, yaw, limb, hand, arm.bearing);
                self.arms[i][limb].bearing = bearing;
                self.arms[i][limb].height = height;
                self.arms[i][limb].reach = reach;
                self.arms[i][limb].hand =
                    actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach);
                shifted[limb] = true;
                if let Some(entry) = self.contact.as_mut().and_then(|c| c.entry.get_mut(i)) {
                    entry.clamped[limb] = true;
                }
            }
            if shifted[1] && self.two_handed(i) {
                let right = self.arms[i][1];
                actuator::mirror_two_handed(&mut self.arms[i][0], right, &anatomy, yaw);
            }
            // The shield rides the hand, so a clamp that moved the hand leaves
            // the pose the geometry phase derived a moment ago behind it -- and
            // the shield collider is built from that pose on the next line but
            // one. Re-derived here rather than by re-running the whole geometry
            // phase, which would also re-run it for every arm the clamp did not
            // touch and re-introduce the inverse map's drift.
            if shifted[0] || shifted[1] {
                self.shield_pose[i] = self.derive_shield_pose(i);
            }
        }
    }

    /// Whether one entity's grips hold a single two-handed item, which the
    /// contract makes the right arm's to own and the left arm's to mirror.
    fn two_handed(&self, i: usize) -> bool {
        self.grips[i][0].equipment_slot.is_some()
            && self.grips[i][0].equipment_slot == self.grips[i][1].equipment_slot
            && self.equipment_in_grip(i, 1)
                .is_some_and(|item| item.binding == crate::GripBinding::Both)
    }

    /// This tick's contact collider rows: one five-region body per live entity
    /// plus whatever it is holding.
    ///
    /// Previous poses come from the retained tick-entry row and requested poses
    /// from the post-actuator row, so one sweep covers the whole tick. The body
    /// origin is the shifted sweep from [`World::contact_body_sweep`], which is
    /// the single place separation is kept out of the relative motion.
    ///
    /// A severed arm reaches this in two places at once, and both are needed:
    /// its volume is absent from the body row, and its grip is masked out
    /// before the held colliders are built. The second is not implied by the
    /// first -- a weapon is not attached to the arm's geometry, it is attached
    /// to the grip -- and a sword swinging on its own is what leaving it out
    /// looks like.
    fn build_contact_colliders(
        &self,
        entries: &[TickEntry],
        rows: &mut Vec<ContactCollider>,
        anatomy_state: &[AnatomyState],
    ) {
        rows.clear();
        let Some(table) = self.combat_specs.as_ref() else { return };
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            let Some(entry) = entries.get(i) else { continue };
            let anatomy = table.anatomy(self.articulated_anatomy[i].expect("articulated anatomy"))
                .expect("validated articulated anatomy");
            let (start, end) = body_sweep_from(self.pos[i], entry);
            let previous_origin = Vec3::new(start.x, start.y, Fx::ZERO);
            let requested_origin = Vec3::new(end.x, end.y, Fx::ZERO);
            let body_velocity = Vec3::new(self.vel[i].x, self.vel[i].y, Fx::ZERO);
            let entity = self.id_of(i);
            let faction = self.faction[i];
            let state = anatomy_state.get(i).copied().unwrap_or(AnatomyState::EMPTY);
            let present: [bool; BodyPart::COUNT] =
                core::array::from_fn(|part| !state.parts[part].severed);

            let yaw = self.body_yaw[i].angle;
            let previous = geometry::body_region_volumes(
                previous_origin, anatomy, entry.yaw.angle,
                [entry.arms[0].hand, entry.arms[1].hand], present);
            let requested = geometry::body_region_volumes(
                requested_origin, anatomy, yaw,
                [self.arms[i][0].hand, self.arms[i][1].hand], present);
            rows.push(ContactCollider {
                entity, faction, slot: BODY_SLOT, mass: self.mass[i],
                surface: anatomy.surface, velocity: body_velocity, present: true,
                shape: ContactShape::Body {
                    previous_origin, requested_origin,
                    parts: core::array::from_fn(|part| RegionSweep {
                        previous_lower: previous[part].lower,
                        previous_upper: previous[part].upper,
                        requested_lower: requested[part].lower,
                        requested_upper: requested[part].upper,
                        radius: previous[part].radius,
                        present: previous[part].present,
                    }),
                },
            });

            let mut grips = self.grips[i];
            for limb in 0..2 {
                if !present[limb_body_part(limb as u8).expect("a limb slot") as usize] {
                    grips[limb].equipment_slot = None;
                }
            }
            let equipment = |id| table.equipment(id).copied();
            let segments = geometry::held_segment_colliders(
                previous_origin, requested_origin, entry.arms, self.arms[i],
                grips, self.articulated_carried[i], equipment,
            );
            for segment in segments.into_iter().flatten() {
                let owner = segment.owner as usize;
                rows.push(ContactCollider {
                    entity, faction, slot: segment.owner as u8, mass: segment.mass,
                    surface: segment.surface, present: true,
                    velocity: body_velocity + self.arms[i][owner].linear_velocity,
                    shape: ContactShape::Segment {
                        previous_hilt: segment.previous.hilt,
                        previous_tip: segment.previous.tip,
                        requested_hilt: segment.requested.hilt,
                        requested_tip: segment.requested.tip,
                        radius: segment.previous.radius,
                    },
                });
            }

            let shield = geometry::held_shield_collider(
                previous_origin, requested_origin, entry.shield, self.shield_pose[i],
                grips, self.articulated_carried[i], equipment,
            );
            if let Some(shield) = shield {
                let owner = shield.owner as usize;
                rows.push(ContactCollider {
                    entity, faction, slot: shield.owner as u8, mass: shield.mass,
                    surface: shield.surface, present: true,
                    velocity: body_velocity + self.arms[i][owner].linear_velocity,
                    shape: ContactShape::Shield {
                        previous: shield.previous.corners,
                        requested: shield.requested.corners,
                    },
                });
            }
        }
    }


    /// The body's contact sweep for this tick, as `(start, end)`.
    ///
    /// Wall-clipped intended locomotion is what gets swept -- `locomotion` is
    /// read after `move_body` has already taken the wall's share -- while the
    /// separation shove moves both endpoints together and so contributes no
    /// relative motion. `World::vel` after separation is still the authoritative
    /// generalized velocity: the separation *impulse* belongs to the body even
    /// though its positional correction does not.
    #[cfg(test)]
    fn contact_body_sweep(&self, i: usize) -> (Vec2, Vec2) {
        match self.contact.as_ref().and_then(|contact| contact.entry.get(i)) {
            None => (self.pos[i], self.pos[i]),
            Some(entry) => body_sweep_from(self.pos[i], entry),
        }
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

    /// The hardest single blow `i` can land: tip, top spin, nothing in the way.
    ///
    /// Absolute health, so it never leaves this crate in this form -- the two
    /// places it surfaces ([`Contact::threat`], [`Contact::frailty`]) both
    /// divide it by a maximum first. Which maximum is the whole point: the same
    /// axe is a third of a Fighter and three quarters of a Skitterer, and that
    /// ratio is the thing worth perceiving.
    fn peak_damage(&self, i: usize) -> Fx {
        rules::peak_damage(self.arm(i), self.stats[i])
    }

    /// How much ground `j` loses to one clean blow from `i`, in `j`'s own body
    /// radii.
    ///
    /// [`World::peak_damage`] on the momentum side, and expressed as a
    /// **distance** for the same reason that one is expressed as a fraction of a
    /// health bar: the raw figure is meaningless without the thing it is
    /// measured against. A velocity of 0.05 says nothing; three quarters of a
    /// body of ground, shed over the dozen ticks it takes traction to pay it
    /// off, is a sentence about spacing -- and spacing is what every number
    /// around it in a [`Contact`] is for.
    ///
    /// Stopping distance rather than peak speed, `v^2 / 2a`, against the
    /// target's *own* traction: the same quantity a fighter already has to hold
    /// in mind about its own footwork ([`Observation::traction`]), so the two
    /// are directly comparable. Being light costs twice over, once in taking
    /// more speed from the blow and again in needing further to shed it, which
    /// is why the spread here is so much wider than the damage one.
    fn knockback(&self, attacker: usize, target: usize) -> Fx {
        let dv = rules::peak_impulse(self.arm(attacker)) / self.mass[target].max(Fx::EPSILON);
        self.stopping_distance(target, dv)
    }

    /// **How much ground `i`'s own hardest cut costs `i`**, in its own body
    /// radii. [`World::knockback`] turned around to face the fighter throwing
    /// the blow.
    ///
    /// The same question in the same unit as [`Contact::knockback_taken`], which
    /// is the point of computing it this way: a fighter deciding whether to
    /// commit to a cut is weighing what the cut costs it in position against
    /// what standing still costs it, and those two have to be comparable or the
    /// comparison is a units error.
    ///
    /// It is the one number a fighter cannot work out for itself from anything
    /// else in the observation. Recoil goes as `weapon_mass / body_mass`, and
    /// neither of those is a percept -- `action_length` and `radius` are the
    /// visible proxies and both lie, because balance and density are real and
    /// independent. A Skitterer's knife is the second-heaviest thing in the game
    /// for its speed on the lightest body in it.
    ///
    /// [`Contact::knockback_taken`]: crate::Contact::knockback_taken
    fn recoil_drift(&self, i: usize) -> Fx {
        let dv = rules::peak_recoil(self.arm(i)) / self.mass[i].max(Fx::EPSILON);
        self.stopping_distance(i, dv)
    }

    /// How far `i` travels shedding `dv`, in `i`'s own body radii.
    ///
    /// `v^2 / 2a` against the body's own traction, so it is directly comparable
    /// with [`Observation::traction`] -- the same quantity a fighter already has
    /// to hold in mind about its own footwork.
    ///
    /// [`Observation::traction`]: crate::Observation::traction
    fn stopping_distance(&self, i: usize, dv: Fx) -> Fx {
        let brake = self.stats[i].traction() * Fx::TWO;
        if !brake.is_positive() {
            return Fx::ZERO;
        }
        fx::mul_div(dv, dv, brake) / self.radius[i].max(Fx::EPSILON)
    }

    /// `i`'s blade as a world-space segment, base to tip, or `None` if the hand
    /// is too tucked to be a hitbox.
    ///
    /// The early out is both the semantics and the fast path: "tucked" means
    /// something mechanically, and it costs nothing to check.
    fn blade(&self, i: usize) -> Option<(Vec2, Vec2)> {
        self.blade_from(i, self.pos[i], self.limb[i])
    }

    /// [`World::blade`] for a body and hand that are not the current ones.
    ///
    /// Exists so the previous tick's segment can be reconstructed from
    /// [`World::start_pos`] and the un-stepped hand, which is the other end of
    /// the sweep in [`World::resolve_swings`].
    fn blade_from(&self, i: usize, pos: Vec2, hand: Hand) -> Option<(Vec2, Vec2)> {
        let spec = self.action_of(i).spec();
        // **A guard is not a blade.** It has a length and it is out in front of
        // the body, and neither of those makes it a hitbox. `MIN_STRIKE_REACH`
        // used to be the only thing separating "tucked" from "dangerous", which
        // was fine while every unit in the game held a sword; the role is the
        // honest separator now that some of them hold a shield.
        if !spec.role.is_live_capable() {
            return None;
        }
        // Mid-swap there is nothing in the hand yet. The tucked reach below
        // would catch this anyway, on the tick after the swap begins; saying it
        // outright means the blade vanishes on the *same* tick the fighter
        // reached for something else, which is what "nothing is live" has to
        // mean if the swap is going to be a real price.
        if hand.swing.is_dormant() {
            return None;
        }
        if hand.reach < rules::MIN_STRIKE_REACH {
            return None;
        }
        let along = Vec2::from_angle(hand.angle);
        let base = pos + along * self.radius[i];
        let tip = base + along * (spec.length * hand.reach);
        Some((base, tip))
    }

    /// How much of a blow arriving at `contact` gets past `j`'s guard, or
    /// `None` if `j` does not cover that bearing -- or is not holding a guard at
    /// all.
    ///
    /// *Whether* it covers is a pure integer comparison on binary angles -- no
    /// trigonometry, no tolerance, exact -- and the arc scales with extension,
    /// so a tucked guard covers nothing and an extended one covers its full
    /// width.
    ///
    /// *How well* it covers is a question about time rather than about geometry:
    /// a guard still swinging toward the bearing is barely in the way of
    /// anything. See [`rules::block_leak`].
    fn block_leak(&self, j: usize, contact: Vec2) -> Option<Fx> {
        let spec = self.action_of(j).spec();
        // **The one line that makes blocking a choice.**
        //
        // The arc used to come off `kind[j].weapon()`, so every character in the
        // game had one whether or not it had done anything to deserve it -- and
        // since holding it out cost nothing, every policy did, permanently. A
        // fighter blocks now only while it is holding something that blocks, and
        // it cannot swing that thing. That is the entire trade the loadout
        // exists to make.
        if !spec.role.blocks() {
            return None;
        }
        let guard = self.limb[j];
        // Reaching for the shield is not the same as holding it, and this is
        // the tick that difference is worth something to the attacker.
        if guard.swing.is_dormant() {
            return None;
        }
        if guard.reach < rules::MIN_BLOCK_REACH {
            return None;
        }
        let out = contact - self.pos[j];
        if out.is_zero() {
            return None; // struck dead centre: no bearing to cover
        }
        let arc = Fx::from_int(spec.arc as i32) * guard.reach;
        if guard.angle.delta(out.angle()).abs() > arc.round_int() {
            return None;
        }
        Some(rules::block_leak(guard.braced))
    }

    /// How hard `i`'s blade is travelling through `j`'s body at `contact`.
    ///
    /// This is the whole damage model in one function, and it is the sum of two
    /// quite different things:
    ///
    /// * **The blade's own speed through the flesh**, which is tangential to
    ///   its arc and therefore rises with distance from the shoulder. This is
    ///   the term that makes where you stand matter more than any stat, and it
    ///   is a magnitude rather than a projection because a sword sweeping
    ///   *across* someone cuts them. Projecting it onto the surface normal
    ///   instead reads as an oddly specific claim -- that only a thrust counts
    ///   -- and produces a model in which a blade buried dead centre at full
    ///   speed does nothing at all, because at that exact instant its velocity
    ///   is perpendicular to the way in.
    /// * **The closing speed of the two bodies**, which *is* a projection,
    ///   because walking has a direction and running away from a blow should
    ///   take something off it. It is small next to the first term by design:
    ///   the real answer to a swing is to not be in its arc, and that is
    ///   settled by geometry long before this function is reached.
    fn impact_speed(&self, i: usize, j: usize, contact: Vec2) -> Fx {
        let arm = contact - self.pos[i];
        let blade = fx::tangential_speed(self.limb[i].spin, arm.length());

        let out = contact - self.pos[j];
        let closing = if out.is_zero() {
            Fx::ZERO // struck dead centre: no surface normal to close along
        } else {
            (self.vel[i] - self.vel[j]).dot(-out.normalize())
        };
        blade + closing
    }

    /// Momentum of `i`'s weapon along the direction it is travelling, signed by
    /// which way the hand is turning.
    ///
    /// The weapon's mass centre sits on [`Arm::lever`] from the shoulder and is
    /// carried around by the hand's spin, so its velocity is tangential and its
    /// momentum is that times [`Weapon::mass`].
    ///
    /// **A speed and not a velocity, and that is the whole subtlety here.** A
    /// blade held at constant spin has a constant *speed* and a momentum vector
    /// that swings all the way round the compass, so differencing the vector
    /// bills the body for a centripetal reaction on every tick of every swing --
    /// which is real physics and completely swamps the model. Measured at a
    /// quarter transfer it came to a *sustained* 38% of a Rogue's top speed per
    /// tick, pushing outward from wherever its blade happened to be; Rogue mirror
    /// duels stopped being able to land a blow at all and ended 98% in draws at
    /// full health.
    ///
    /// It is the honest term to drop. Holding a weapon out against its own
    /// circle is a pull straight down the arm and into the shoulder, and leaning
    /// against that is what a stance *is* -- a hammer thrower does not get
    /// dragged sideways, they lean back. What a fighter genuinely cannot brace
    /// against is the blade changing *speed*, which is the term that survives.
    ///
    /// Extension is dropped for a duller reason: pushing a blade out moves its
    /// mass centre too, and that reaction is an order of magnitude below the
    /// swing's -- [`Arm::extend_rate`] is a fraction of a unit of *reach* per
    /// tick against a lever measured in whole units.
    ///
    /// [`Arm::lever`]: crate::Arm::lever
    /// [`Arm::extend_rate`]: crate::Arm::extend_rate
    /// [`Weapon::mass`]: crate::Weapon::mass
    fn blade_momentum(&self, i: usize) -> Fx {
        let hand = self.limb[i];
        let arm = self.arm(i);
        let speed = fx::tangential_speed(hand.spin, arm.lever(hand.reach)) * hand.spin.signum();
        speed * arm.spec.mass
    }

    /// Velocity a blow from `i` landing at `contact` adds to `j`.
    ///
    /// **Along the way the blade is travelling**, which in a top-down arc is
    /// across the target rather than through it, and that is the honest answer
    /// rather than a convenient one: a cut sweeps, and what it does to a body is
    /// carry it along the sweep. Pushing the target directly away from its
    /// attacker would be the intuitive model and it describes a thrust, which is
    /// not what any weapon in this roster is doing.
    ///
    /// The consequence is worth stating because it is the reason to want this at
    /// all. A fighter that has crowded inside a heavy weapon is not pushed back
    /// out of its dead zone -- it is dragged *around* the arc, which costs it the
    /// one thing crowding is made of, which is a position held exactly. Reach
    /// stops being decoration for the fighter who can throw people around with
    /// it.
    fn shove(&self, i: usize, j: usize, contact: Vec2, blocked: bool) -> Vec2 {
        let out = contact - self.pos[i];
        if out.is_zero() {
            return Vec2::ZERO;
        }
        let hand = self.limb[i];
        let speed = fx::tangential_speed(hand.spin, out.length()) * hand.spin.signum();
        let carried = self.action_of(i).spec().mass * speed * rules::KNOCKBACK_TRANSFER;

        // A guard that is merely in the way transmits the whole of it; one that
        // has been planted puts most of it into the ground. See
        // `rules::BRACE_ANCHOR` -- this is the second thing bracing buys, and
        // without it a fighter who could not stop the blow anyway got nothing
        // for having read it.
        let taken = if blocked {
            Fx::ONE - rules::BRACE_ANCHOR * self.limb[j].brace_fraction()
        } else {
            Fx::ONE
        };

        let mass = self.mass[j].max(Fx::EPSILON);
        let dv = fx::mul_div(carried, taken, mass);
        out.normalize().perp() * dv
    }

    /// Two arms meeting at `at`: how much spin each one gains.
    ///
    /// A real collision between two rotating bodies, resolved from both moments
    /// of inertia and a coefficient of restitution, replacing the pair of flat
    /// fractions that used to stand in for it. It is what makes a Brute's axe
    /// shrug off a guard that stops a Rogue's blade dead -- the same fact from
    /// both sides, out of one calculation, instead of two constants that had no
    /// idea the other existed.
    ///
    /// The whole thing resolves in **spin units at `i`'s contact radius**, which
    /// is the trick that keeps it to a handful of `mul_div`s. Every quantity in a
    /// collision is linear in the relative velocity, and the conversion from spin
    /// to world speed is a constant times the radius, so working in one arm's
    /// units lets the constant cancel out of every term and never appear.
    ///
    /// `align` is the cosine between the two arms, and it does two jobs at once.
    /// It projects `j`'s hand speed onto the direction `i`'s blade is travelling,
    /// and it is the moment arm by which an impulse along that direction turns
    /// `j`'s hand -- so it enters `j`'s effective inertia **squared**. At zero the
    /// blow points straight through `j`'s shoulder: infinitely stiff, nothing
    /// rotates, and the guard holds absolutely. That is not a special case in the
    /// code and it falls out correctly on its own.
    fn deflect(&self, i: usize, j: usize, at: Vec2, restitution: Fx) -> (Fx, Fx) {
        let out_i = at - self.pos[i];
        let out_j = at - self.pos[j];
        let r_i = out_i.length();
        let r_j = out_j.length();
        if !r_i.is_positive() || !r_j.is_positive() {
            // Struck dead centre on one side or the other: no lever, no torque,
            // and the divisions below would saturate.
            return (Fx::ZERO, Fx::ZERO);
        }
        let align = out_i.normalize().dot(out_j.normalize());
        let inertia_i = self.arm(i).inertia(self.limb[i].reach);
        let inertia_j = self.arm(j).inertia(self.limb[j].reach);

        // `j`'s contact speed, as the spin `i` would need to match it. Their
        // tangents point different ways, which is what `align` corrects for.
        let mirrored = fx::mul_div(self.limb[j].spin * align, r_j, r_i);
        let closing = (Fx::ONE + restitution) * (self.limb[i].spin - mirrored);

        // `j`'s arm referred to `i`'s contact radius. `inertia_j` is already in
        // those units by construction -- it is the thing being compared against.
        let referred = fx::mul_div(inertia_i * align * align, r_j * r_j, r_i * r_i);
        let total = referred + inertia_j;
        if !total.is_positive() {
            return (Fx::ZERO, Fx::ZERO);
        }
        // The share of the meeting speed each side gives up is the *other* one's
        // weight in the total, which is the whole of a collision.
        let gained = -fx::mul_div(closing, inertia_j, total);
        let thrown = fx::mul_div(closing, fx::mul_div(inertia_i * align, r_j * r_j, r_i), total);
        (gained, thrown)
    }

    fn clamp_to_arena(&self, p: Vec2, radius: Fx) -> Vec2 {
        p.clamp_box(
            Vec2::new(radius, radius),
            Vec2::new(self.arena.x - radius, self.arena.y - radius),
        )
    }

    /// Walks `i` to `to`, stopping it against whatever is in the way.
    ///
    /// Takes a **destination** rather than a point, because with masonry inside
    /// the level a displacement can be large enough to pass clean through a
    /// wall. A wall can be one tile thick where a corridor was carved up to a
    /// room's face, and while walking is 0.05 units a tick, a knockback is
    /// bounded by nothing of the sort. So the move is swept in steps no longer
    /// than half a tile.
    ///
    /// On a floor plan with nothing carved there is nothing to tunnel through
    /// and the sweep is skipped outright -- which is not an optimisation but
    /// the thing that makes every pre-existing scenario *provably* unchanged
    /// rather than argued to be.
    fn move_body(&mut self, i: usize, to: Vec2) {
        if !self.dungeon.carved() {
            self.settle(i, to);
            return;
        }
        // The ceiling is a sanity bound, not a rule: nothing in the game moves
        // a body two units in a tick, and if something ever does, four
        // sub-steps is where the cost stops growing.
        let delta = (to - self.pos[i]).clamp_length(MAX_STEP);
        let steps = 1 + (delta.length() / HALF_TILE).floor_int().clamp(0, 3);
        let stride = delta * Fx::from_ratio(1, steps);
        // **Each stride runs from where the last one ended, not from where the
        // move began.** Interpolating the original line instead is the obvious
        // spelling and it silently defeats the whole sweep: a sub-step that a
        // wall stopped is undone by the next one, which teleports the body
        // further along a line the wall was supposed to have interrupted. It
        // reads as tunnelling, which is exactly the bug being prevented.
        for _ in 0..steps {
            self.settle(i, self.pos[i] + stride);
        }
    }

    /// Puts `i` somewhere legal and takes the momentum the wall absorbed.
    ///
    /// Position alone is not enough now that velocity persists. A body walking
    /// into a wall used to stop because its *displacement* was clipped every
    /// tick; with integrated velocity it stops moving but stays convinced it is
    /// travelling at full speed, and that phantom velocity is read by
    /// [`World::impact_speed`] as a closing speed and by [`World::separate`] as
    /// something to bounce a neighbour off. A fighter pinned against a wall
    /// would shove anyone who came near it, forever, without moving an inch.
    ///
    /// Only the clipped axis is zeroed, so a body sliding *along* a wall keeps
    /// doing so.
    fn settle(&mut self, i: usize, p: Vec2) {
        let clamped = self.clamp_to_arena(p, self.radius[i]);
        if clamped.x != p.x {
            self.vel[i].x = Fx::ZERO;
        }
        if clamped.y != p.y {
            self.vel[i].y = Fx::ZERO;
        }
        self.pos[i] = clamped;
        if self.dungeon.carved() {
            self.resolve_tiles(i);
        }
    }

    /// Pushes `i` out of any masonry it is standing in.
    ///
    /// The tile span is taken from where the body arrived and not recomputed as
    /// the pushes land. At the roster's widest radius that span is three columns
    /// by three rows -- nine reads -- and a push only ever moves a body *away*
    /// from the tile that produced it, so the tile it could newly reach is one
    /// it was already being pushed toward. Anything left over is a fraction of a
    /// unit and is resolved by the next sub-step or the next tick, which is the
    /// same slack the body-versus-body pass at [`World::separate`] runs on.
    fn resolve_tiles(&mut self, i: usize) {
        let r = self.radius[i];
        let p = self.pos[i];
        let lo_x = (p.x - r).floor_int();
        let hi_x = (p.x + r).floor_int();
        let lo_y = (p.y - r).floor_int();
        let hi_y = (p.y + r).floor_int();
        for ty in lo_y..=hi_y {
            for tx in lo_x..=hi_x {
                if self.dungeon.solid(tx, ty) {
                    self.push_out_of(i, tx, ty);
                }
            }
        }
    }

    /// One body against one solid tile.
    ///
    /// The geometry belongs to [`Dungeon::push_out`] -- one implementation of
    /// "a body may not be inside masonry", shared with the placement helpers so
    /// that where a body *can* stand and where it gets *pushed to* cannot come
    /// apart. What is left here is the half that needs the body: its momentum.
    fn push_out_of(&mut self, i: usize, tx: i32, ty: i32) {
        let Some((to, n)) = self
            .dungeon
            .push_out(self.pos[i], self.radius[i], tx, ty)
        else {
            return;
        };
        self.pos[i] = to;
        // Only the component heading *into* the wall. The rest is the body
        // travelling along the face, and taking that would be a wall with
        // friction -- a different game from this one. Same argument as the
        // arena clamp zeroing only the axis it clipped.
        let along = self.vel[i].dot(n);
        if !along.is_positive() {
            self.vel[i] -= n * along;
        }
    }

    fn contact(&self, observer: usize, target: usize, noise: Fx, rng: &mut Rng) -> Contact {
        let mut offset = self.pos[target] - self.pos[observer];
        let mut hp_frac = self.health_fraction_of(target);
        let limb = self.limb[target];
        let mut facing = self.facing[target];
        let mut limb_angle = limb.angle;
        let mut limb_spin = limb.spin;
        let mut limb_line = limb.line;
        let mut limb_left = Fx::from_int(limb.swing_left as i32);

        let mut velocity = self.vel[target];
        let mut min_strike_range = self.dead_zone(target);
        let mut threat = self.peak_damage(target) / self.max_health_of(observer);
        let mut frailty = self.peak_damage(observer) / self.max_health_of(target);
        let mut knockback_taken = self.knockback(target, observer);
        let mut knockback_dealt = self.knockback(observer, target);
        let mut heft = self.mass[target] / self.mass[observer].max(Fx::EPSILON);

        // How hard someone else can swing does not get easier to judge as you
        // close, so these errors are taken from the raw stat before the range
        // scaling below touches it. Captured here because that line shadows
        // `noise`; see `Contact::min_strike_range` for the argument.
        let judgement = noise * rules::CAPABILITY_JUDGEMENT;

        // Error grows with range. A flat error is the obvious model and it is
        // wrong in a way that only shows up once aiming is geometric: half a
        // unit of uncertainty is nothing at the edge of sight and is *thirty
        // degrees* of aiming error at arm's length, where the window in which a
        // blade reaches a body is about sixteen degrees wide. Every archetype
        // stood nose to nose and missed, and the fights timed out. Scaling by
        // range says the sensible thing instead -- you can see exactly where
        // someone standing next to you is, and only roughly where someone at
        // the limit of your sight is.
        let noise = noise * (offset.length() / self.stats[observer].sight_range()).min(Fx::ONE);

        if !noise.is_zero() {
            offset += Vec2::new(rng.gaussian(noise), rng.gaussian(noise));
            hp_frac =
                (hp_frac + rng.gaussian(noise * Fx::from_ratio(1, 5))).clamp(Fx::ZERO, Fx::ONE);

            // Hand bearings blur in proportion to the same noise, scaled into
            // angle units: at `perception 0` (noise 1.5) that is a standard
            // deviation of about 25 degrees, and clean by `perception 15`. This
            // is where perception stops being a scouting stat -- a blade whose
            // bearing you cannot read is a blade you cannot block, and a spin
            // you cannot read is a recovery you cannot punish.
            //
            // Deliberately *not* applied to where the enemy is: `offset` is
            // already noised, so a policy aiming at its perceived position
            // inherits an aim error of `atan(noise / distance)` for free.
            // Blurring the bearing again on top would charge for the same
            // mistake twice.
            let bearing_noise = noise * Fx::from_int(3000);
            let blur = |a: Angle, rng: &mut Rng| -> Angle {
                a + Angle::from_raw(rng.gaussian(bearing_noise).trunc_int() as u16)
            };
            facing = blur(facing, rng);
            limb_angle = blur(limb_angle, rng);
            limb_line = blur(limb_line, rng);

            limb_spin += rng.gaussian(noise * Fx::from_int(300));

            // Where it is going, and the error is absolute rather than
            // proportional. Reading a walk is a question about a body, not
            // about a capability: a fast enemy is not harder to see moving than
            // a slow one, and scaling the error by the speed would say a
            // stationary fighter's stillness is perfectly legible while a
            // sprint is a blur. Scaled off top speed so it means the same thing
            // whatever the roster is tuned to.
            let drift = noise * self.stats[target].move_speed() * rules::VELOCITY_JUDGEMENT;
            velocity += Vec2::new(rng.gaussian(drift), rng.gaussian(drift));

            // The timing read, and the one number a dim fighter gets most
            // wrong. At `perception 0` this is a standard deviation of about
            // twelve ticks against a Brute's thirty-three-tick telegraph: not
            // enough to miss that a blow is coming, easily enough to dodge into
            // it. Clamped at zero because a negative count would read as a cut
            // that already landed.
            limb_left = (limb_left + rng.gaussian(noise * Fx::from_int(8))).max(Fx::ZERO);

            // Proportional rather than absolute: a long weapon has a long dead
            // zone and misjudging it by a fixed distance would make the biggest
            // weapons the easiest to read, which is backwards. Floored at zero
            // because a negative dead zone reads as a blade that is dangerous
            // from inside its own hilt.
            min_strike_range =
                (min_strike_range + rng.gaussian(judgement * min_strike_range)).max(Fx::ZERO);

            // Proportional for the same reason, and each has exactly one
            // unknown factor in it: `threat` is a guess about how hard the
            // other one hits, `frailty` a guess about how much it can take.
            // Own damage and own health are proprioception and arrive clean, so
            // the two are symmetric and share the error.
            threat = (threat + rng.gaussian(judgement * threat)).max(Fx::ZERO);
            frailty = (frailty + rng.gaussian(judgement * frailty)).max(Fx::ZERO);

            // The same judgement, about the same pairing, on the momentum side.
            // Drawn separately rather than sharing `threat`'s error because they
            // are separately wrong: a weapon that is heavy for its speed throws
            // people further than it wounds them, and a fighter that could infer
            // one figure from the other would be reading a correlation the roster
            // deliberately does not have.
            knockback_taken =
                (knockback_taken + rng.gaussian(judgement * knockback_taken)).max(Fx::ZERO);
            knockback_dealt =
                (knockback_dealt + rng.gaussian(judgement * knockback_dealt)).max(Fx::ZERO);

            // Sizing somebody up, which is the oldest judgement in fighting and
            // the least improved by walking closer -- so it takes `judgement`
            // like the four above rather than the range-scaled noise. Floored
            // just above zero: a heft of zero would read as an opponent with no
            // weight at all, which is a thing a policy would divide by.
            heft = (heft + rng.gaussian(judgement * heft)).max(Fx::EPSILON);
        }

        Contact {
            id: self.id_of(target),
            offset,
            distance: offset.length(),
            hp_frac,
            radius: self.radius[target],
            action_length: self.action_of(target).spec().length,
            min_strike_range,
            threat,
            frailty,
            knockback_taken,
            knockback_dealt,
            heft,
            velocity,
            facing,
            limb_angle,
            limb_reach: limb.reach,
            limb_spin,
            // Exact, unlike everything around it. A blade hauled back over a
            // shoulder is not a subtle cue; what a dim fighter gets wrong is
            // when it arrives and along which line, and both of those are
            // blurred above.
            limb_swing: limb.swing,
            limb_left,
            limb_line,
            action: self.action_of(target),
            action_arc: self.action_of(target).spec().arc,

        }
    }

    fn view_at(&self, i: usize) -> UnitView {
        UnitView {
            id: self.id_of(i),
            kind: self.kind[i],
            faction: self.faction[i],
            stats: self.stats[i],
            position: self.pos[i],
            facing: self.facing[i],
            radius: self.radius[i],
            velocity: self.vel[i],
            mass: self.mass[i],
            hp: self.health_of(i).max(Fx::ZERO),
            max_hp: self.max_health_of(i),
            intent: self.command[i].intent,
            limb: self.limb[i],
            action: self.action_of(i),
            spec: self.action_of(i).spec(),
            loadout: self.loadout[i],
            slot: self.slot[i],
        }
    }
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

/// Bounded "k nearest" accumulator: insertion sort into a fixed array, ties
/// broken by entity index so the result never depends on scan order.
struct Nearest {
    items: [(Fx, usize); MAX_CONTACTS],
    len: usize,
    cap: usize,
}

impl Nearest {
    fn new(cap: usize) -> Nearest {
        Nearest {
            items: [(Fx::ZERO, 0); MAX_CONTACTS],
            len: 0,
            cap: cap.clamp(1, MAX_CONTACTS),
        }
    }

    fn offer(&mut self, key: Fx, index: usize) {
        if self.len == self.cap && (key, index) >= self.items[self.len - 1] {
            return;
        }
        let mut p = self.len.min(self.cap - 1);
        while p > 0 && self.items[p - 1] > (key, index) {
            self.items[p] = self.items[p - 1];
            p -= 1;
        }
        self.items[p] = (key, index);
        if self.len < self.cap {
            self.len += 1;
        }
    }

    #[inline]
    fn len(&self) -> usize {
        self.len
    }

    #[inline]
    fn items(&self) -> &[(Fx, usize)] {
        &self.items[..self.len]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command::{LimbCommand, Strike};

    fn duel_world() -> World {
        World::new(&Scenario::duel(), 1)
    }

    fn articulated_command() -> ArticulatedCommandV1 {
        let arm = ArmTarget {
            bearing: Angle::QUARTER,
            height: crate::CombatHeight::MID,
            reach: Fx::ONE,
            effort: Fx::HALF,
        };
        ArticulatedCommandV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::QUARTER,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [GripRequest::Keep; 2],
        }
    }

    fn assert_actuator_hash_mutation(mutate: impl FnOnce(&mut World)) {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let legacy = base.state_hash();
        let digest = base.state_digest().value;
        let mut changed = base.clone();
        mutate(&mut changed);
        assert_eq!(changed.state_hash(), legacy, "actuator state leaked into LegacyV1");
        assert_ne!(changed.state_digest().value, digest, "actuator field was omitted from ArticulatedV1");
    }

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
        }; 2];
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
        let fresh = World::new(&scenario, 1);
        assert_eq!(world.articulated_pose_test_view(replacement).unwrap(),
            fresh.articulated_pose_test_view(EntityId::new(1, 0)).unwrap());
    }

    #[test]
    fn articulated_spawn_initializes_yaw_arms_grips_and_shield_exactly() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        let fighter = world.articulated_pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.body_yaw, BodyYawState {
            angle: Angle::ZERO,
            speed_turns: Fx::ZERO,
            authority_residue: Fx::ZERO,
        });
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: Some(1) },
            GripState { equipment_slot: Some(0) },
        ]);
        for (limb, side) in [Fx::from_ratio(1, 4), Fx::from_ratio(-1, 4)].into_iter().enumerate() {
            let hand = Vec3::new(Fx::from_ratio(3, 16), side, Fx::from_ratio(9, 10));
            assert_eq!(fighter.arms[limb], actuator::tucked_arm(hand));
        }
        assert_eq!(fighter.move_authority, Fx::ONE);
        assert_eq!(fighter.turn_authority, Fx::ONE);
        assert_eq!(fighter.arm_authority, [Fx::ONE; 2]);
        let shield = fighter.shield_pose.expect("fighter starts with the left shield");
        assert_eq!(shield.centre, fighter.arms[0].hand);
        assert_eq!(shield.normal, Vec3::X);
        assert_eq!((shield.half_width, shield.half_height, shield.thickness),
            (Fx::from_ratio(7, 20), Fx::HALF, Fx::from_ratio(1, 20)));

        let brute = world.articulated_pose_test_view(EntityId::new(1, 0)).unwrap();
        assert_eq!(brute.body_yaw.angle, Angle::HALF);
        assert_eq!(brute.grips, [
            GripState { equipment_slot: None },
            GripState { equipment_slot: Some(0) },
        ]);
        assert_eq!(brute.shield_pose, None);
        assert_eq!(brute.body_yaw, BodyYawState {
            angle: Angle::HALF,
            speed_turns: Fx::ZERO,
            authority_residue: Fx::ZERO,
        });
        for (limb, side) in [Fx::from_ratio(-3, 10), Fx::from_ratio(3, 10)].into_iter().enumerate() {
            let hand = Vec3::new(Fx::from_ratio(17, 80), side, Fx::ONE);
            assert_eq!(brute.arms[limb], actuator::tucked_arm(hand));
        }
        assert_eq!((brute.move_authority, brute.turn_authority, brute.arm_authority),
            (Fx::ONE, Fx::ONE, [Fx::ONE; 2]));
    }

    #[test]
    fn legacy_worlds_do_not_allocate_or_hash_articulated_pose() {
        let mut world = duel_world();
        let before = world.state_hash();
        let digest = world.state_digest();
        assert!(world.articulated_pose_test_view(EntityId::new(0, 0)).is_none());
        assert!(world.body_yaw.is_empty() && world.arms.is_empty() && world.grips.is_empty());
        world.step();
        assert_eq!(digest.domain, crate::HashDomain::LegacyV1);
        assert_ne!(world.state_hash(), before, "ordinary legacy stepping still advances the core hash");
        assert_eq!(world.state_hash(), world.state_digest().value);
    }

    #[test]
    fn every_actuator_field_changes_only_the_articulated_hash_domain() {
        assert_actuator_hash_mutation(|w| w.body_yaw[0].angle = Angle::from_raw(1));
        assert_actuator_hash_mutation(|w| w.body_yaw[0].speed_turns = Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.body_yaw[0].authority_residue = Fx::from_raw(1));
        // Not an actuator row, but it rides in the same digest and answers to
        // the same rule: ArticulatedV1 sees it, LegacyV1 must not.
        assert_actuator_hash_mutation(|w| {
            w.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        });
        for limb in 0..2 {
            assert_actuator_hash_mutation(|w| w.arms[0][limb].bearing = Angle::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].bearing_speed_turns = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].height = crate::CombatHeight::LOW);
            assert_actuator_hash_mutation(|w| w.arms[0][limb].height_speed = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].reach = Fx::from_raw(actuator::ARM_MIN_REACH_RAW + 1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].reach_speed = Fx::from_raw(1));
            for axis in 0..3 {
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].previous_hand.x += Fx::from_raw(1),
                    1 => w.arms[0][limb].previous_hand.y += Fx::from_raw(1),
                    _ => w.arms[0][limb].previous_hand.z += Fx::from_raw(1),
                });
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].hand.x += Fx::from_raw(1),
                    1 => w.arms[0][limb].hand.y += Fx::from_raw(1),
                    _ => w.arms[0][limb].hand.z += Fx::from_raw(1),
                });
                assert_actuator_hash_mutation(|w| match axis {
                    0 => w.arms[0][limb].linear_velocity.x = Fx::from_raw(1),
                    1 => w.arms[0][limb].linear_velocity.y = Fx::from_raw(1),
                    _ => w.arms[0][limb].linear_velocity.z = Fx::from_raw(1),
                });
            }
            assert_actuator_hash_mutation(|w| w.arms[0][limb].fatigue = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.arms[0][limb].work_residue = Fx::from_raw(1));
            assert_actuator_hash_mutation(|w| w.grips[0][limb].equipment_slot = None);
            assert_actuator_hash_mutation(|w| w.grips[0][limb].equipment_slot =
                Some(w.grips[0][limb].equipment_slot.unwrap_or(0) ^ 1));
        }
        assert_actuator_hash_mutation(|w| w.shield_pose[0] = None);
        for axis in 0..3 {
            assert_actuator_hash_mutation(|w| match axis {
                0 => w.shield_pose[0].as_mut().unwrap().centre.x += Fx::from_raw(1),
                1 => w.shield_pose[0].as_mut().unwrap().centre.y += Fx::from_raw(1),
                _ => w.shield_pose[0].as_mut().unwrap().centre.z += Fx::from_raw(1),
            });
            assert_actuator_hash_mutation(|w| match axis {
                0 => w.shield_pose[0].as_mut().unwrap().normal.x += Fx::from_raw(1),
                1 => w.shield_pose[0].as_mut().unwrap().normal.y += Fx::from_raw(1),
                _ => w.shield_pose[0].as_mut().unwrap().normal.z += Fx::from_raw(1),
            });
        }
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().half_width += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().half_height += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.shield_pose[0].as_mut().unwrap().thickness += Fx::from_raw(1));
        assert_actuator_hash_mutation(|w| w.move_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.turn_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0][0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0][1] = Fx::HALF);
    }

    #[test]
    fn move_turn_and_arm_impairment_factors_are_one_and_already_hashed() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        for id in [EntityId::new(0, 0), EntityId::new(1, 0)] {
            let pose = world.articulated_pose_test_view(id).unwrap();
            assert_eq!((pose.move_authority, pose.turn_authority, pose.arm_authority),
                (Fx::ONE, Fx::ONE, [Fx::ONE; 2]));
        }
        assert_actuator_hash_mutation(|w| w.move_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.turn_authority[0] = Fx::HALF);
        assert_actuator_hash_mutation(|w| w.arm_authority[0] = [Fx::HALF, Fx::ONE]);
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
    fn set_stats_changes_next_tick_arm_caps_without_changing_construction() {
        let scenario = Scenario::articulated_duel();
        let fighter = EntityId::new(0, 0);
        let mut slow = World::new(&scenario, 1);
        let mut fast = slow.clone();
        let construction = (fast.articulated_anatomy[0], fast.articulated_carried[0],
            fast.articulated_equipment[0], fast.grips[0]);
        assert!(slow.set_stats(fighter, Stats::new(0, 0, 0, 0, 5)));
        assert!(fast.set_stats(fighter, Stats::new(20, 20, 0, 0, 5)));
        let mut command = slow.neutral_articulated(0);
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut slow, &mut fast] {
            let _ = world.submit_articulated_v1(fighter, command);
            world.step();
        }
        assert!(fast.arms[0][1].bearing_speed_turns > slow.arms[0][1].bearing_speed_turns);
        assert!(fast.arms[0][1].height_speed > slow.arms[0][1].height_speed);
        assert_eq!((fast.articulated_anatomy[0], fast.articulated_carried[0],
            fast.articulated_equipment[0], fast.grips[0]), construction);
    }

    #[test]
    fn a_stationary_body_turns_toward_its_requested_yaw() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let at = world.view(fighter).unwrap().position;
        let mut command = articulated_command();
        command.body_yaw = Angle::QUARTER;
        assert!(matches!(world.submit_articulated_v1(fighter, command),
            SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        world.step();
        let pose = world.articulated_pose_test_view(fighter).unwrap();
        assert_eq!(world.view(fighter).unwrap().position, at);
        assert_eq!(world.view(fighter).unwrap().facing, Angle::ZERO);
        assert_eq!((pose.body_yaw.angle.raw(), pose.body_yaw.speed_turns.raw()), (91, 91));
    }

    #[test]
    fn body_yaw_obeys_acceleration_speed_and_half_turn_tie() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = articulated_command();
        command.body_yaw = Angle::HALF;
        let _ = world.submit_articulated_v1(fighter, command);
        let mut speeds = Vec::new();
        for _ in 0..6 {
            world.step();
            speeds.push(world.articulated_pose_test_view(fighter).unwrap().body_yaw.speed_turns.raw());
        }
        assert_eq!(speeds, [-91, -182, -273, -364, -455, -546]);
        assert_eq!(world.articulated_pose_test_view(fighter).unwrap().body_yaw.angle.raw(), 63_625);
    }

    #[test]
    fn body_yaw_snaps_without_overshoot_or_residual_speed() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = articulated_command();
        command.body_yaw = Angle::from_raw(100);
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (91, 91));
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (100, 0));
        world.step();
        assert_eq!((world.body_yaw[0].angle.raw(), world.body_yaw[0].speed_turns.raw()), (100, 0));
    }

    #[test]
    fn translation_and_turning_do_not_share_effort() {
        let scenario = Scenario::articulated_duel();
        let mut stationary = World::new(&scenario, 1);
        let mut moving = stationary.clone();
        let fighter = EntityId::new(0, 0);
        let mut turn = articulated_command();
        turn.body_yaw = Angle::QUARTER;
        let _ = stationary.submit_articulated_v1(fighter, turn);
        turn.move_dir = Vec2::X;
        let _ = moving.submit_articulated_v1(fighter, turn);
        for _ in 0..8 {
            stationary.step();
            moving.step();
            assert_eq!(stationary.body_yaw[0], moving.body_yaw[0]);
        }
        assert_eq!(stationary.vel[0], Vec2::ZERO);
        assert!(!moving.vel[0].is_zero());
    }

    #[test]
    fn move_authority_scales_acceleration_without_changing_requested_velocity() {
        let scenario = Scenario::articulated_duel();
        let mut full = World::new(&scenario, 1);
        let mut impaired = full.clone();
        impaired.move_authority[0] = Fx::HALF;
        let fighter = EntityId::new(0, 0);
        let mut command = articulated_command();
        command.move_dir = Vec2::X;
        let _ = full.submit_articulated_v1(fighter, command);
        let _ = impaired.submit_articulated_v1(fighter, command);
        let requested = full.stats[0].move_speed() * full.action_of(0).spec().move_bonus;
        full.step();
        impaired.step();
        assert_eq!(full.vel[0], Vec2::X * full.stats[0].traction());
        assert_eq!(impaired.vel[0], Vec2::X * (impaired.stats[0].traction() * Fx::HALF));
        assert!(requested > full.vel[0].length());
        assert!(requested > impaired.vel[0].length());
        for _ in 0..60 {
            full.step();
            impaired.step();
        }
        assert_eq!(full.vel[0], Vec2::X * requested);
        assert_eq!(impaired.vel[0], Vec2::X * requested);
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
    fn a_right_bound_shield_is_found_past_an_empty_or_nonshield_left_grip() {
        let mut scenario = Scenario::articulated_duel();
        let mut right_shield = crate::shield();
        right_shield.id = 4;
        right_shield.binding = crate::GripBinding::Right;
        scenario.combat_specs.as_mut().unwrap().equipment.push(right_shield);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(4), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
        let world = World::new(&scenario, 1);
        let fighter = world.articulated_pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: None },
            GripState { equipment_slot: Some(0) },
        ]);
        let shield = fighter.shield_pose.expect("right hand shield was skipped");
        assert_eq!(shield.centre, fighter.arms[1].hand);
        assert_eq!(shield.normal, Vec3::X);

        let mut left_sword = crate::sword();
        left_sword.id = 5;
        left_sword.binding = crate::GripBinding::Left;
        scenario.combat_specs.as_mut().unwrap().equipment.push(left_sword);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(5), Some(4)];
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        let world = World::new(&scenario, 1);
        let fighter = world.articulated_pose_test_view(EntityId::new(0, 0)).unwrap();
        assert_eq!(fighter.grips, [
            GripState { equipment_slot: Some(0) },
            GripState { equipment_slot: Some(1) },
        ]);
        let shield = fighter.shield_pose.expect("non-shield left hand stopped the shield search");
        assert_eq!(shield.centre, fighter.arms[1].hand);
        assert_eq!(shield.normal, Vec3::X);
    }

    fn release_both_hands(world: &mut World, id: EntityId) {
        let mut command = world.neutral_articulated(id.index as usize);
        command.grips = [GripRequest::Release; 2];
        assert!(matches!(world.submit_articulated_v1(id, command),
            SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        world.step();
        assert_eq!(world.grips[id.index as usize], [GripState { equipment_slot: None }; 2]);
    }

    #[test]
    fn both_arms_chase_targets_independently() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_articulated(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        command.arms[1] = ArmTarget {
            bearing: Angle::HALF, height: crate::CombatHeight::LOW,
            reach: Fx::HALF, effort: Fx::ONE,
        };
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        let arms = world.arms[0];
        assert!(arms[0].bearing_speed_turns.raw() > 0);
        assert!(arms[1].bearing_speed_turns.raw() < 0);
        assert!(arms[0].height_speed.raw() > 0);
        assert!(arms[1].height_speed.raw() < 0);
        assert!(arms[0].reach_speed.raw() > arms[1].reach_speed.raw() - 1);
        assert_ne!(arms[0].hand, arms[1].hand);
    }

    #[test]
    fn an_intermediate_height_uses_the_same_actuator() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_articulated(0);
        command.arms[0].height = crate::CombatHeight::try_from_raw(40_000).unwrap();
        command.arms[0].effort = Fx::ONE;
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        assert!(world.arms[0][0].height.raw() > crate::CombatHeight::MID.raw());
        assert!(world.arms[0][0].height.raw() < 40_000);
    }

    #[test]
    fn changing_height_and_reach_takes_more_than_one_tick() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut world, fighter);
        let mut command = world.neutral_articulated(0);
        command.arms[0].height = crate::CombatHeight::HIGH;
        command.arms[0].reach = Fx::ONE;
        command.arms[0].effort = Fx::ONE;
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        assert!(world.arms[0][0].height.raw() > crate::CombatHeight::MID.raw());
        assert!(world.arms[0][0].height.raw() <= crate::CombatHeight::MID.raw() + actuator::ARM_LINEAR_ACCEL_RAW);
        assert!(world.arms[0][0].reach > Fx::from_raw(actuator::ARM_MIN_REACH_RAW));
        assert!(world.arms[0][0].reach < Fx::ONE);
    }

    #[test]
    fn requested_effort_scales_torque_and_not_position() {
        let scenario = Scenario::articulated_duel();
        let mut low = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        release_both_hands(&mut low, fighter);
        let mut high = low.clone();
        let mut command = low.neutral_articulated(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::from_ratio(1, 4),
        };
        let _ = low.submit_articulated_v1(fighter, command);
        command.arms[0].effort = Fx::ONE;
        let _ = high.submit_articulated_v1(fighter, command);
        low.step();
        high.step();
        assert!(high.arms[0][0].bearing_speed_turns > low.arms[0][0].bearing_speed_turns);
        assert!(high.arms[0][0].height_speed > low.arms[0][0].height_speed);
        assert!(high.arms[0][0].reach_speed > low.arms[0][0].reach_speed);
        assert_eq!(low.articulated_command[0].unwrap().arms[0].bearing,
            high.articulated_command[0].unwrap().arms[0].bearing);
        assert_eq!(low.articulated_command[0].unwrap().arms[0].height,
            high.articulated_command[0].unwrap().arms[0].height);
        assert_eq!(low.articulated_command[0].unwrap().arms[0].reach,
            high.articulated_command[0].unwrap().arms[0].reach);
    }

    #[test]
    fn a_heavy_weapon_fatigues_its_arm_sooner() {
        let mut sword_scenario = Scenario::articulated_duel();
        sword_scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(1), None];
        sword_scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        let mut club_scenario = sword_scenario.clone();
        club_scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(3), None];
        club_scenario.units[0].loadout = Loadout::single(ActionKind::Club);
        let mut sword_world = World::new(&sword_scenario, 1);
        let mut club_world = World::new(&club_scenario, 1);
        let fighter = EntityId::new(0, 0);
        for tick in 0..120 {
            let outward = (tick / 20) % 2 == 0;
            let target = if outward {
                ArmTarget { bearing: Angle::HALF, height: crate::CombatHeight::HIGH, reach: Fx::ONE, effort: Fx::ONE }
            } else {
                ArmTarget { bearing: Angle::ZERO, height: crate::CombatHeight::MID,
                    reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ONE }
            };
            for world in [&mut sword_world, &mut club_world] {
                let mut command = world.neutral_articulated(0);
                command.arms[1] = target;
                let _ = world.submit_articulated_v1(fighter, command);
                world.step();
            }
        }
        assert_eq!((sword_world.arms[0][1].fatigue.raw(), sword_world.arms[0][1].work_residue.raw()), (92, 76));
        assert_eq!((club_world.arms[0][1].fatigue.raw(), club_world.arms[0][1].work_residue.raw()), (302, 138));
        assert!(club_world.arms[0][1].fatigue > sword_world.arms[0][1].fatigue);
    }

    fn both_scenario() -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        let mut both = crate::club();
        both.id = 4;
        both.binding = crate::GripBinding::Both;
        scenario.combat_specs.as_mut().unwrap().equipment.push(both);
        scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(4), None];
        scenario.units[1].loadout = Loadout::single(ActionKind::Club);
        scenario
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
    fn grip_transactions_validate_the_resulting_current_pair() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        assert_eq!(world.resulting_grips(0, [GripRequest::Keep; 2]).unwrap(), [Some(1), Some(0)]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Release; 2]).unwrap(), [None, None]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Keep, GripRequest::Release]).unwrap(), [Some(1), None]);
        assert_eq!(world.resulting_grips(0, [GripRequest::Release, GripRequest::Keep]).unwrap(), [None, Some(0)]);
        assert!(world.resulting_grips(0, [GripRequest::EquipSlot(0), GripRequest::Keep]).is_err());
        assert!(world.resulting_grips(0, [GripRequest::Keep, GripRequest::EquipSlot(1)]).is_err());

        let both_scenario = both_scenario();
        let both = World::new(&both_scenario, 1);
        assert_eq!(both.resulting_grips(1, [GripRequest::Keep; 2]).unwrap(), [Some(0), Some(0)]);
        assert!(both.resulting_grips(1, [GripRequest::Release, GripRequest::Keep]).is_err());
        assert!(both.resulting_grips(1, [GripRequest::Keep, GripRequest::Release]).is_err());
        assert_eq!(both.resulting_grips(1, [GripRequest::Release; 2]).unwrap(), [None, None]);

        let mut duplicate_single = World::new(&scenario, 1);
        assert!(duplicate_single.resulting_grips(0, [GripRequest::EquipSlot(0); 2]).is_err());
        duplicate_single.combat_specs.as_mut().unwrap().equipment[0].binding = crate::GripBinding::Both;
        assert!(duplicate_single.resulting_grips(0,
            [GripRequest::EquipSlot(0), GripRequest::EquipSlot(1)]).is_err(), "Both plus another item was accepted");
        duplicate_single.combat_specs.as_mut().unwrap().equipment[1].binding = crate::GripBinding::Both;
        assert!(duplicate_single.resulting_grips(0,
            [GripRequest::EquipSlot(0), GripRequest::EquipSlot(1)]).is_err(), "two different Both items were accepted");
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
    fn a_two_handed_target_mirrors_the_off_hand() {
        let scenario = both_scenario();
        let mut world = World::new(&scenario, 1);
        let brute = EntityId::new(1, 0);
        let old_left = world.arms[1][0].hand;
        let mut command = world.neutral_articulated(1);
        command.body_yaw = Angle::HALF;
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::LOW,
            reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ZERO,
        };
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        let _ = world.submit_articulated_v1(brute, command);
        world.step();
        let [left, right] = world.arms[1];
        assert_eq!(left.bearing.raw(), world.body_yaw[1].angle.raw().wrapping_mul(2).wrapping_sub(right.bearing.raw()));
        assert_eq!(left.bearing_speed_turns, -right.bearing_speed_turns);
        assert_eq!((left.height, left.height_speed, left.reach, left.reach_speed),
            (right.height, right.height_speed, right.reach, right.reach_speed));
        assert_eq!(left.previous_hand, old_left);
        assert_eq!(left.linear_velocity, left.hand - old_left);
        assert_eq!(left.fatigue, right.fatigue);
        assert_ne!(left.height, command.arms[0].height, "ignored left target drove the shared item");
    }

    #[test]
    fn a_two_handed_trajectory_uses_right_authority_effort_and_target_only() {
        let scenario = both_scenario();
        let brute = EntityId::new(1, 0);
        let mut full = World::new(&scenario, 1);
        let mut left_impaired = full.clone();
        let mut right_impaired = full.clone();
        left_impaired.arm_authority[1][0] = Fx::HALF;
        right_impaired.arm_authority[1][1] = Fx::HALF;
        let mut command = full.neutral_articulated(1);
        command.body_yaw = Angle::HALF;
        command.arms[1] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut full, &mut left_impaired, &mut right_impaired] {
            let _ = world.submit_articulated_v1(brute, command);
            world.step();
        }
        assert_eq!(full.arms[1], left_impaired.arms[1]);
        assert_ne!(full.arms[1], right_impaired.arms[1]);

        let mut full_effort = World::new(&scenario, 1);
        let mut low_effort = full_effort.clone();
        let mut full_command = command;
        let mut low_command = command;
        low_command.arms[1].effort = Fx::HALF;
        let _ = full_effort.submit_articulated_v1(brute, full_command);
        let _ = low_effort.submit_articulated_v1(brute, low_command);
        full_effort.step();
        low_effort.step();
        assert_ne!(full_effort.arms[1], low_effort.arms[1]);

        let mut ignored_a = World::new(&scenario, 1);
        let mut ignored_b = ignored_a.clone();
        full_command.arms[0] = ArmTarget {
            bearing: Angle::ZERO, height: crate::CombatHeight::LOW,
            reach: Fx::from_raw(actuator::ARM_MIN_REACH_RAW), effort: Fx::ZERO,
        };
        let mut changed_left = full_command;
        changed_left.arms[0] = ArmTarget {
            bearing: Angle::HALF, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        let _ = ignored_a.submit_articulated_v1(brute, full_command);
        let _ = ignored_b.submit_articulated_v1(brute, changed_left);
        ignored_a.step();
        ignored_b.step();
        assert_eq!(ignored_a.arms[1], ignored_b.arms[1]);

        let independent_scenario = Scenario::articulated_duel();
        let fighter = EntityId::new(0, 0);
        let mut independent = World::new(&independent_scenario, 1);
        let mut independent_impaired = independent.clone();
        independent_impaired.arm_authority[0][0] = Fx::HALF;
        let mut command = independent.neutral_articulated(0);
        command.arms[0] = ArmTarget {
            bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
            reach: Fx::ONE, effort: Fx::ONE,
        };
        for world in [&mut independent, &mut independent_impaired] {
            let _ = world.submit_articulated_v1(fighter, command);
            world.step();
        }
        assert!(independent.arms[0][0].bearing_speed_turns
            > independent_impaired.arms[0][0].bearing_speed_turns);
    }

    #[test]
    fn a_shield_normal_follows_body_yaw_and_cannot_orbit() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let mut command = world.neutral_articulated(0);
        command.body_yaw = Angle::QUARTER;
        command.arms[0].bearing = Angle::HALF;
        command.arms[0].effort = Fx::ONE;
        let _ = world.submit_articulated_v1(fighter, command);
        for _ in 0..100 {
            world.step();
            if world.body_yaw[0].angle == Angle::QUARTER { break; }
        }
        assert_eq!(world.body_yaw[0].angle, Angle::QUARTER);
        let shield = world.shield_pose[0].unwrap();
        assert_eq!(shield.normal, Vec3::new(Fx::ZERO, Fx::ONE, Fx::ZERO));
        assert_ne!(world.arms[0][0].bearing, world.body_yaw[0].angle);
    }

    #[test]
    fn changing_shield_height_takes_more_than_one_tick() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);
        let before = world.shield_pose[0].unwrap().centre.z;
        let mut command = world.neutral_articulated(0);
        command.arms[0].height = crate::CombatHeight::HIGH;
        command.arms[0].effort = Fx::ONE;
        let _ = world.submit_articulated_v1(fighter, command);
        world.step();
        let arm = world.arms[0][0];
        assert!(arm.height.raw() > crate::CombatHeight::MID.raw());
        assert!(arm.height.raw() <= crate::CombatHeight::MID.raw() + actuator::ARM_LINEAR_ACCEL_RAW);
        assert!(arm.height.raw() < crate::CombatHeight::HIGH.raw());
        assert!(world.shield_pose[0].unwrap().centre.z > before);
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

    #[test]
    fn legacy_commands_still_derive_facing_from_movement_and_cannot_turn_in_place() {
        let mut world = duel_world();
        let fighter = EntityId::new(0, 0);
        world.submit(fighter, Command::moving(Vec2::Y));
        world.step();
        assert_eq!(world.facing[0], Angle::QUARTER);
        world.submit(fighter, Command::HOLD);
        for _ in 0..10 { world.step(); }
        assert_eq!(world.facing[0], Angle::QUARTER);
        assert!(world.body_yaw.is_empty());
    }

    #[test]
    fn the_legacy_phase_trace_is_unchanged() {
        let mut world = duel_world();
        world.phase_trace_enabled = true;
        world.step();
        assert_eq!(world.phase_trace, [
            "clear events", "expire decisions", "regenerate", "apply movement", "separate",
            "drive legacy limb", "legacy parries", "legacy swings", "recoil", "shots", "doors",
            "reap", "increment tick", "pending", "navigation",
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
            "body yaw", "grips", "arms", "geometry", "contact", "anatomy", "doors", "reap",
            "increment tick", "pending", "navigation",
        ]);
    }

    #[test]
    fn crowded_separation_shifts_both_contact_endpoints_equally() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        // The contract's three planar points, injected rather than coaxed out of
        // real stats. What is under test is the subtraction; a fixture that had
        // to reach 3/16 by tuning agility would be testing the actuator, and
        // would stop testing this the first time a stat moved.
        let eighth = Fx::from_ratio(1, 8);
        let sixteenth = Fx::from_ratio(1, 16);
        world.pos[0] = Vec2::from_ints(8, 8);
        world.retain_contact_entry();
        world.pos[0] = Vec2::new(Fx::from_int(8) + eighth, Fx::from_int(8));
        world.record_contact_locomotion();
        world.pos[0] = Vec2::new(Fx::from_int(8) + eighth + sixteenth, Fx::from_int(8));

        let (start, end) = world.contact_body_sweep(0);
        assert_eq!(start, Vec2::new(Fx::from_int(8) + sixteenth, Fx::from_int(8)));
        assert_eq!(end, Vec2::new(Fx::from_int(8) + eighth + sixteenth, Fx::from_int(8)));
        // The swept extent is the intended locomotion and nothing else: the
        // separation shove landed in both endpoints, so it contributes no
        // relative motion and cannot manufacture a contact velocity.
        assert_eq!(end - start, Vec2::new(eighth, Fx::ZERO));
        assert_eq!(start - Vec2::from_ints(8, 8), Vec2::new(sixteenth, Fx::ZERO));
    }

    #[test]
    fn mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once() {
        const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        world.retain_contact_entry();
        world.vel[0] = Vec2::new(Fx::from_int(5), Fx::ZERO);
        world.arms[0][1].linear_velocity = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        let hand_before = world.arms[0][1].hand;

        world.clamp_contact_entry();

        // The body is clamped first and the equipment is built on the clamped
        // body, so the arm's own excess is exactly one unit however far over
        // the body was -- which is the property that keeps the two clamps from
        // compounding.
        assert_eq!(world.vel[0], Vec2::new(L, Fx::ZERO), "Db did not land the body on L");
        // The arithmetic form, `clamped - clamped_body`, which is what the
        // collider this arm builds carries into the sweep. It is *not* the
        // value the arm ends the tick holding -- see the second half below.
        assert_eq!(world.arms[0][1].linear_velocity, Vec3::ZERO,
                   "the body translation was counted twice in the arm");

        // De is -1: `Ve_prime` is `L + 1` and clamps back to `L`. The hand
        // therefore moves by exactly that and by nothing else -- the body's own
        // shift moves the origin the hand is measured from, not the hand.
        let moved = world.arms[0][1].hand - hand_before;
        assert!(moved.x < Fx::ZERO, "the shifted endpoint did not move west");
        // Not exactly `requested`: a shoulder cannot reach past its arm, so the
        // inverse map clamps and the committed hand is the clamped one. What
        // must hold is that the pose is self-consistent, which is what the
        // energy check will read.
        let anatomy = world.combat_specs.as_ref().unwrap()
            .anatomy(world.articulated_anatomy[0].unwrap()).unwrap().clone();
        let arm = world.arms[0][1];
        assert_eq!(arm.hand, actuator::hand_position(
            &anatomy, world.body_yaw[0].angle, 1, arm.bearing, arm.height, arm.reach),
            "the committed hand does not match the committed joint pose");
        assert!(arm.reach >= Fx::from_raw(actuator::ARM_MIN_REACH_RAW) && arm.reach <= Fx::ONE);

        // And the untouched arm keeps a relative velocity of zero rather than
        // inheriting the body's clamp.
        assert_eq!(world.arms[0][0].linear_velocity, Vec3::ZERO);

        // **The commit supersedes the arithmetic form**, and this half is what
        // the contract means by "an equipment entry clamp requires the same
        // commit as a contacted arm". The two agree exactly while the joint
        // clamp does not bite; here it does -- a shoulder cannot reach past its
        // arm -- so the committed velocity is the hand's own displacement and
        // the arithmetic zero above does not survive the phase. Run through the
        // whole phase rather than through `clamp_contact_entry` alone, because
        // the commit is the thing under test; the duel's pair stands ten units
        // apart, so nothing else in it resolves.
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.vel[0] = Vec2::new(Fx::from_int(5), Fx::ZERO);
        world.arms[0][1].linear_velocity = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        let entry_hand = world.arms[0][1].hand;
        world.resolve_contact();

        assert!(world.contact_resolutions().is_empty(), "the isolated fixture resolved a contact");
        let arm = world.arms[0][1];
        assert_eq!(arm.previous_hand, entry_hand, "the commit lost the tick-entry hand");
        assert_eq!(arm.linear_velocity, arm.hand - arm.previous_hand,
                   "a clamped arm kept the entry arithmetic instead of its committed hand");
        assert_ne!(arm.linear_velocity, Vec3::ZERO,
                   "the clamp moved the hand and the commit reported no motion");
        assert_eq!(world.vel[0], Vec2::new(L, Fx::ZERO), "the commit disturbed the clamped body");
    }

    /// A fighter and a brute a unit and a half apart -- inside each other's
    /// weapons -- with every named body's regions scaled down to one raw unit
    /// of integrity.
    ///
    /// The scaling is the fixture's whole point and it is not a cheat. V2-14
    /// dissipates a few thousand raw units of energy into a contact this size,
    /// and a full two-unit region absorbs that without noticing; shrinking the
    /// body is how a test asks about the wound rule rather than about how hard
    /// the solver happens to hit. `docs/reference/articulated-mechanical-gate.md`
    /// names the same trick for its severance case.
    fn fragile_scenario(fragile: &[usize]) -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        for &at in fragile {
            scenario.combat_specs.as_mut().unwrap().anatomies[at].integrity_maxima =
                [Fx::from_raw(1); BodyPart::COUNT];
        }
        scenario
    }

    /// Hold one slot's right-hand weapon straight out along its own facing.
    ///
    /// Written onto the joint pose rather than driven there by commands. The
    /// actuator would take some tens of ticks to extend an arm and would carry
    /// fatigue and a hand velocity into the answer; what these tests are about
    /// is the wound a contact makes, and the pose is the fixture, not the
    /// question.
    fn brace_weapon(world: &mut World, i: usize) {
        let spec = world.anatomy_spec(i).cloned().expect("articulated anatomy");
        let yaw = world.body_yaw[i].angle;
        let hand = actuator::hand_position(&spec, yaw, 1, yaw, crate::CombatHeight::MID, Fx::ONE);
        world.arms[i][1].bearing = yaw;
        world.arms[i][1].reach = Fx::ONE;
        world.arms[i][1].hand = hand;
        world.arms[i][1].previous_hand = hand;
    }

    /// Run the tick's contact, anatomy, and reap phases with explicit body
    /// velocities, exactly as `World::step` orders them.
    ///
    /// The velocity is written onto the column the solver reads instead of
    /// being coaxed out of a `move_dir`, for the same reason the pure fixtures
    /// in `combat::resolution` do it: a stat-driven charge tests the actuator,
    /// and would stop testing this the first time a stat moved.
    fn resolve_closing(world: &mut World, closing: &[(usize, Fx)]) {
        world.retain_contact_entry();
        world.record_contact_locomotion();
        for &(i, speed) in closing { world.vel[i] = Vec2::new(speed, Fx::ZERO); }
        world.resolve_contact();
        world.settle_anatomy();
        world.reap_dead_articulated();
    }

    /// The same phases, but with the closing bodies actually *travelling* the
    /// step rather than standing in each other and carrying a velocity.
    ///
    /// The difference is not cosmetic and it took a fixture to find. A pair that
    /// already overlaps at tick start resolves at time zero, where v2-14's
    /// normal rule has no geometry to read and answers world +X unconditionally
    /// -- so of two mirrored blows exactly one is closing and the other is
    /// separating, and a symmetric fixture built that way can never be
    /// symmetric. Giving the sweep real extent puts the contact at a positive
    /// time, where the normal comes off the geometry and both blows land.
    fn resolve_advancing(world: &mut World, closing: &[(usize, Fx)]) {
        world.retain_contact_entry();
        for &(i, speed) in closing {
            world.pos[i] += Vec2::new(speed, Fx::ZERO);
            world.vel[i] = Vec2::new(speed, Fx::ZERO);
        }
        world.record_contact_locomotion();
        world.resolve_contact();
        world.settle_anatomy();
        world.reap_dead_articulated();
    }

    /// The braced fighter, the closing brute, and the region the sword chose.
    fn braced_thrust(scenario: &Scenario) -> (World, u8) {
        let mut world = World::new(scenario, 1000);
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);
        let region = world.contact_resolutions().iter()
            .find(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .expect("the braced fixture reached no body").fact.region;
        (world, region)
    }

    #[test]
    fn immutable_armor_and_dimensions_cannot_drift_from_scenario_identity() {
        use crate::combat::spec::Material;
        let scenario = fragile_scenario(&[]);
        let base = scenario.fingerprint();
        let base_digest = World::new(&scenario, 1).state_digest().value;
        let changes: [(&str, fn(&mut crate::BodyAnatomySpec)); 7] = [
            ("coverage", |a| a.armor[BodyPart::Torso as usize].coverage = Fx::HALF),
            ("hardness", |a| a.armor[BodyPart::Torso as usize].hardness = Fx::HALF),
            ("absorption", |a| a.armor[BodyPart::Torso as usize].absorption = Fx::HALF),
            ("armor material", |a| a.armor[BodyPart::Head as usize].material = Material::Steel),
            ("integrity maximum", |a| a.integrity_maxima[BodyPart::Head as usize] += Fx::from_raw(1)),
            ("blood maximum", |a| a.blood_max += Fx::from_raw(1)),
            ("region radius", |a| a.regions[BodyPart::Legs as usize].radius += Fx::from_raw(1)),
        ];
        for (name, change) in changes {
            let mut moved = scenario.clone();
            change(&mut moved.combat_specs.as_mut().unwrap().anatomies[0]);
            assert_ne!(moved.fingerprint(), base, "{name} left scenario identity");
            assert_ne!(World::new(&moved, 1).state_digest().value, base_digest,
                       "{name} left replay construction");
        }
        // And the traffic runs one way. Armour is immutable, so changing it may
        // not move a single byte of the mutable anatomy rows -- if it did, the
        // same fact would be recorded in two places and could disagree.
        let mut armoured = scenario.clone();
        armoured.combat_specs.as_mut().unwrap().anatomies[0].armor[BodyPart::Torso as usize]
            .coverage = Fx::HALF;
        assert_eq!(anatomy_suffix_bytes(&World::new(&armoured, 1)),
                   anatomy_suffix_bytes(&World::new(&scenario, 1)),
                   "an immutable armour field reached the mutable anatomy row");
    }

    #[test]
    fn a_wounding_contact_records_its_region_shock_and_source() {
        let (world, region) = braced_thrust(&fragile_scenario(&[1]));
        let part = BodyPart::from_index(region as usize).expect("a body fact named no region");
        let brute = world.wounds[1];
        assert!(brute.parts[part as usize].severed,
                "a raw unit of integrity survived a whole contact");
        assert_eq!(brute.parts[part as usize].integrity, Fx::ZERO);
        assert_eq!(brute.last_attacker, EntityId::new(0, 0));
        assert!(brute.shock.is_positive(), "integrity loss recorded no shock");
        assert!(world.damage_dealt[0].is_positive(), "the wound was credited to nobody");
        // The severance is on the row that made it, not merely in the column.
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.region == region && row.severed),
            "the resolution that severed a region did not say so");
        // Untouched regions are untouched. One blow is one region.
        assert_eq!(brute.parts.iter().filter(|row| row.severed).count(), 1);

        // And the region is gone from the geometry, not merely flagged: the
        // next sweep against the same body cannot name it again.
        let mut world = world;
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);
        assert!(!world.contact_resolutions().is_empty(),
                "the second blow reached nothing, so the absence check is vacuous");
        assert!(world.contact_resolutions().iter().all(|row| row.fact.region != region),
                "a severed region answered a sweep");
    }

    /// Take one arm off a live articulated body, the way a group that emptied
    /// its integrity does, and run the tick that acts on it.
    ///
    /// The severance is written rather than landed, and the reason is a
    /// measurement rather than convenience: with this roster two braced weapons
    /// meet hand to hand, so a blow aimed at the arm that *holds* a weapon
    /// reaches the guard arm across the body instead. Landing one would be a
    /// fixture about aiming; that a real blow severs the region it names is
    /// `a_wounding_contact_records_its_region_shock_and_source`'s job, and this
    /// test is about what a missing arm can no longer do.
    fn sever_arm(world: &mut World, i: usize, part: BodyPart) {
        world.wounds[i].parts[part as usize].integrity = Fx::ZERO;
        world.wounds[i].parts[part as usize].severed = true;
        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.resolve_contact();
        world.settle_anatomy();
    }

    #[test]
    fn a_blow_that_does_not_empty_a_region_wounds_without_severing() {
        // The same braced thrust into a body four times too sturdy to lose the
        // region. Every other wound fixture scales its target to a raw unit so
        // one blow is decisive, which means `severed` is true on every landed
        // row in the suite and the flag proves nothing on its own. This is the
        // case that separates "took damage" from "lost the limb".
        let mut scenario = fragile_scenario(&[]);
        scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
            [Fx::from_int(8); BodyPart::COUNT];
        let (world, region) = braced_thrust(&scenario);
        let part = world.wounds[1].parts[region as usize];
        assert!(!part.severed, "a body with eight units of integrity lost a region");
        assert!(part.integrity < Fx::from_int(8), "the blow took nothing off");
        assert_eq!(part.integrity, Fx::from_int(8) - Fx::from_raw(344_064));
        assert!(world.contact_resolutions().iter().all(|row| !row.severed),
                "a wounding blow that severed nothing said it had");
        assert!(world.damage_dealt[0].is_positive(), "the wound was credited to nobody");
        assert!(world.alive[1]);
    }

    #[test]
    fn worn_plate_turns_a_blow_the_bare_body_takes() {
        use crate::combat::spec::Material;
        // The bare fixture severs the region it names; the same blow against a
        // hard full-coverage plate reaches nothing. This is the only test that
        // drives the whole armour path -- the outward region normal off the
        // medial point, the squareness of the approach, and the widened
        // transfer -- from a real contact rather than from hand-supplied
        // numbers, and without it the entire block could be deleted and
        // replaced by `penetrating = incoming` unnoticed.
        let (bare, region) = braced_thrust(&fragile_scenario(&[1]));
        assert!(bare.wounds[1].parts[region as usize].severed);
        let deflected: u64 = bare.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        assert_eq!(deflected, 0, "a bare body deflected energy");

        // Worn on the struck region only. Plating all five would pass whatever
        // index the transfer read, and the per-region lookup is exactly the
        // thing a uniform suit cannot check.
        let plate = |hardness, absorption, on: BodyPart| {
            let mut scenario = fragile_scenario(&[1]);
            scenario.combat_specs.as_mut().unwrap().anatomies[1].armor[on as usize] =
                crate::ArmorSpec { coverage: Fx::ONE, hardness, absorption,
                                   material: Material::Steel };
            braced_thrust(&scenario)
        };
        let struck = BodyPart::from_index(region as usize).expect("a body fact named no region");

        // Hard full coverage sheds most of it and not all of it, and both
        // halves of that are the wiring rather than the formula. A thrust that
        // runs along the blade still meets this region off-axis, so it is
        // partly square: `deflected > 0` says the squareness is under one, and
        // the region still going says it is over zero -- a squareness stuck at
        // zero would give `1-square = 1`, deflect the whole incident budget,
        // and leave a one-raw-unit region standing. A normal taken from
        // somewhere other than the medial point lands on one side or the other.
        // The *sign* of the approach is not under test and could not be: the
        // squareness takes an absolute value, and `anatomy.rs` says so.
        let (hard, hard_region) = plate(Fx::ONE, Fx::ZERO, struck);
        assert_eq!(hard_region, region, "the plate changed which region the blow chose");
        let incoming: u64 = hard.contact_resolutions().iter()
            .map(|row| row.cut_raw + row.thrust_raw).sum();
        let deflected: u64 = hard.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        assert_eq!((incoming, deflected), (3_584, 3_185));
        assert!(deflected < incoming, "the plate deflected the whole incident budget");
        assert!(hard.wounds[1].parts[region as usize].severed,
                "what got past the plate reached nothing");

        // Absorption is the other half of the same seam and is billed on a
        // different column: soft full coverage swallows rather than sheds, so
        // nothing is deflected and nothing gets through either.
        let (padded, _) = plate(Fx::ZERO, Fx::ONE, struck);
        assert!(padded.wounds[1].parts.iter().all(|part| !part.severed),
                "soft full coverage let a blow through");
        let deflected: u64 = padded.contact_resolutions().iter().map(|row| row.deflected_raw).sum();
        assert_eq!(deflected, 0, "padding deflected instead of absorbing");
        assert_eq!(padded.damage_dealt[0], Fx::ZERO, "a stopped blow was credited");

        // And the same padding worn anywhere else does nothing at all: armour
        // is looked up by the region the blow chose, not by the body.
        let elsewhere = BodyPart::ALL.into_iter().find(|part| *part != struck).expect("a second region");
        let (mismatched, _) = plate(Fx::ZERO, Fx::ONE, elsewhere);
        assert!(mismatched.wounds[1].parts[region as usize].severed,
                "a plate on the wrong region turned the blow");
    }

    #[test]
    fn two_blows_in_one_group_are_both_measured_against_the_pre_group_body() {
        // Two heroes, one target, both blades in it on the same mapped time.
        // Either blow alone would take the region off, so a fact-by-fact apply
        // would measure the second against a body the first had already
        // emptied and credit nobody for it. One snapshot per group is what
        // makes both of them land, and this is the only fixture that puts two
        // facts on one body in one group.
        let world = two_on_one(true, ActionKind::Sword, 1);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal, row.fact.region, row.severed))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows fell into different groups");
        assert_eq!(rows[0].2, rows[1].2, "the two blows chose different regions");
        assert!(rows.iter().all(|row| row.3), "a blow that emptied a region did not say so");
        assert_eq!(rows.iter().map(|row| row.0).collect::<Vec<_>>(), vec![0, 2]);

        // Both attackers are paid, and between them they are paid exactly what
        // the target lost -- no more, because credit is clamped to the query's
        // own decrease, and no less, because the last contributor takes the
        // remainder rather than a second rounded share.
        let spec = world.anatomy_spec(1).expect("articulated anatomy");
        let lost = anatomy::max_health(spec) - world.wounds[1].health(spec);
        assert!(world.damage_dealt[0].is_positive() && world.damage_dealt[2].is_positive(),
                "one of two simultaneous attackers went unpaid");
        assert_eq!(world.damage_dealt[0] + world.damage_dealt[2], lost);
        assert_eq!(world.damage_dealt[1], Fx::ZERO);
    }

    /// The two-hero fixture: both blades in one target on one mapped time,
    /// posed and driven with the target closing onto them.
    ///
    /// Equipment id 4 is a sword with both surface factors at zero -- a blade
    /// that carries every share into pressure and so into no anatomy at all.
    /// It is the only way to build a fact that reaches a body and applies
    /// nothing, which is a case the wound rules distinguish and no shipped
    /// item can produce.
    fn two_on_one(fragile: bool, second: ActionKind, second_id: u16) -> World {
        let mut scenario = fragile_scenario(if fragile { &[1] } else { &[] });
        if !fragile {
            scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
                [Fx::from_int(8); BodyPart::COUNT];
        }
        let mut blunt = crate::sword();
        blunt.id = 4;
        blunt.surface.edge_factor = Fx::ZERO;
        blunt.surface.point_factor = Fx::ZERO;
        scenario.combat_specs.as_mut().unwrap().equipment.push(blunt);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(1), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        // The same point as the first hero, so the two blades are collinear and
        // the pair of facts is about one region rather than two. Allies never
        // key against each other and this fixture never separates, so standing
        // them in each other costs nothing the test is about.
        scenario.units.push(UnitSpec {
            articulated: Some(ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(second_id), None] }),
            loadout: Loadout::single(second),
            ..scenario.units[0].clone()
        });
        scenario.units[1].spawn = Vec2::from_ints(12, 8);
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        brace_weapon(&mut world, 2);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);
        world
    }

    #[test]
    fn credit_for_one_group_is_split_between_its_blows_and_sums_to_the_loss() {
        // The same two-on-one group, but a target sturdy enough that neither
        // blow is clamped and armed so the two blows differ: a sword and a club
        // put unequal energy into the same region. Both halves matter --
        // without the inequality an equal split would pass, and without a
        // decrease that does not divide by the total the remainder rule would.
        let world = two_on_one(false, ActionKind::Club, 3);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal, row.fact.region))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows fell into different groups");
        assert_eq!(rows.iter().map(|row| row.0).collect::<Vec<_>>(), vec![0, 2]);
        // The regions differ here -- a club reaches further in than a sword --
        // and that is fine: credit is shared across everything one group did to
        // one body, not per region.
        assert_ne!(rows[0].2, rows[1].2);

        let spec = world.anatomy_spec(1).expect("articulated anatomy");
        let lost = anatomy::max_health(spec) - world.wounds[1].health(spec);
        let (sword, club) = (world.damage_dealt[0], world.damage_dealt[2]);
        assert!(sword.is_positive() && club.is_positive(), "one blow of two went unpaid");
        assert_ne!(sword, club, "the fixture stopped distinguishing the two blows");
        assert_eq!(sword + club, lost, "the shares did not add up to what the body lost");
        // The pair itself, pinned. Two floored proportional shares do not in
        // general add up to what they are shares of, and the last contributor
        // taking the remainder is what closes that gap -- so a change to either
        // the proportion or the remainder rule moves one of these numbers even
        // when the sum above still holds.
        assert_eq!((sword.raw(), club.raw()), (2_753_037, 392_691));
    }

    #[test]
    fn a_blow_that_penetrated_nothing_reports_no_severance() {
        // Two blades in one region, one of which carries its whole share into
        // pressure. The region comes off, and the blunt blade must not be
        // reported as having taken it: `severed` is a statement about what a
        // fact did, and every other fixture in the suite either severs on every
        // row or severs on none, so this is the one that separates the two.
        let world = two_on_one(true, ActionKind::Sword, 4);
        let rows: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.fact.region, row.cut_raw + row.thrust_raw,
                        row.severed))
            .collect();
        assert_eq!(rows.len(), 2, "the fixture stopped putting two blades in one body");
        assert_eq!(rows[0].1, rows[1].1, "the two blows chose different regions");
        assert_eq!((rows[0].0, rows[1].0), (0, 2));
        assert!(rows[0].2 > 0 && rows[1].2 == 0, "the blunt blade carried a wounding channel");
        assert_eq!((rows[0].3, rows[1].3), (true, false),
                   "severance was reported by the blade that did nothing");
        assert!(world.wounds[1].parts[rows[0].1 as usize].severed);
        assert_eq!(world.damage_dealt[2], Fx::ZERO, "the blunt blade was paid");
    }

    #[test]
    fn a_severance_leaves_the_tick_it_happened_in() {
        // A brute carrying a shield as well as its club, so the arm the braced
        // sword actually reaches is one that is holding something. Every other
        // severance fixture writes the flag before the tick, which means the
        // collider builder masks the grip and the equipment row never exists --
        // so nothing else in the suite exercises the mid-tick half of the rule,
        // and a group that severs an arm could leave its weapon swinging
        // through the rest of the same tick unnoticed.
        let mut scenario = fragile_scenario(&[1]);
        scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(3), Some(2)];
        scenario.units[1].loadout = Loadout::pair(ActionKind::Club, ActionKind::Shield);
        let mut world = World::new(&scenario, 1000);
        assert!(world.shield_pose[1].is_some(), "the fixture's brute carries no shield");
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);

        let severed: Vec<BodyPart> = BodyPart::ALL.into_iter()
            .filter(|part| !world.wounds[1].present(*part)).collect();
        assert_eq!(severed.len(), 1, "the blow did not take exactly one region");
        let contact = world.contact.as_ref().expect("articulated contact state");
        let body = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
        let ContactShape::Body { parts, .. } = body.shape else { unreachable!() };
        assert!(!parts[severed[0] as usize].present,
                "the region left the anatomy but not the tick's geometry");

        // The row the severed arm was holding, if it was holding one. Asserted
        // rather than skipped: a fixture that quietly stopped reaching an armed
        // limb would make this test pass by having nothing to check.
        let held = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && limb_body_part(row.slot) == Some(severed[0]));
        let held = held.expect("the severed arm was holding nothing, so the check is vacuous");
        assert!(!held.present, "a severed arm's equipment stayed in the tick");
        assert!(contact.colliders.iter().any(|row| row.entity == EntityId::new(1, 0)
            && row.present && !matches!(row.shape, ContactShape::Body { .. })
            || row.entity != EntityId::new(1, 0)),
            "the severance took the whole brute out of the tick");
    }

    #[test]
    fn a_two_handed_weapon_leaves_the_tick_when_either_arm_does() {
        // A two-handed item has one collider and the *right* arm owns it, so
        // keying the mid-tick drop off the collider's own slot would leave a
        // greatsword swinging for the rest of a tick that took its wielder's
        // left arm off -- while `release_severed_grips` drops both hands at
        // tick end. The two rules have to agree, and only a `Both` binding can
        // tell them apart.
        let mut scenario = both_scenario();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        scenario.combat_specs.as_mut().unwrap().anatomies[1].integrity_maxima =
            [Fx::from_raw(1); BodyPart::COUNT];
        let mut world = World::new(&scenario, 1000);
        assert!(world.two_handed(1), "the fixture's brute is not holding a two-handed item");
        brace_weapon(&mut world, 0);
        resolve_closing(&mut world, &[(1, -Fx::ONE)]);

        let severed: Vec<BodyPart> = BodyPart::ALL.into_iter()
            .filter(|part| !world.wounds[1].present(*part)).collect();
        assert_eq!(severed, vec![BodyPart::LeftArm],
                   "the fixture stopped taking the arm that does not own the weapon");
        let contact = world.contact.as_ref().expect("articulated contact state");
        let held = contact.colliders.iter().find(|row| row.entity == EntityId::new(1, 0)
            && !matches!(row.shape, ContactShape::Body { .. })).expect("a two-handed collider");
        assert_eq!(held.slot, LimbSlot::RightArm as u8, "the fixture stopped being right-owned");
        assert!(!held.present, "a two-handed weapon outlived the arm it needed");
        assert_eq!(world.grips[1], [GripState { equipment_slot: None }; 2],
                   "one hand kept hold of a two-handed weapon");
    }

    #[test]
    fn a_severed_region_stays_absent_on_the_next_tick() {
        // Legs, not an arm, and that is the point: death is head, torso, or
        // blood, so a body fights on with its legs destroyed and the volume
        // that is gone has to stay gone across the tick boundary. Rebuilding
        // the rigid regions as present -- which is the obvious way to write
        // the collider builder -- makes a destroyed region soak every low
        // strike for the rest of the fight and wound nothing.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[0].parts[BodyPart::Legs as usize].integrity = Fx::ZERO;
        world.wounds[0].parts[BodyPart::Legs as usize].severed = true;
        world.step();
        world.step();

        world.retain_contact_entry();
        world.record_contact_locomotion();
        let contact = world.contact.as_ref().expect("articulated contact state");
        let entry: Vec<TickEntry> = contact.entry.clone();
        let mut rows = Vec::new();
        world.build_contact_colliders(&entry, &mut rows, &world.wounds);
        let body = rows.iter().find(|row| row.entity == EntityId::new(0, 0)
            && matches!(row.shape, ContactShape::Body { .. })).expect("a body row");
        let ContactShape::Body { parts, .. } = body.shape else { unreachable!() };
        assert!(!parts[BodyPart::Legs as usize].present, "a severed region was rebuilt present");
        assert!(parts.iter().enumerate()
            .all(|(at, part)| at == BodyPart::Legs as usize || part.present),
            "rebuilding took a sound region with it");
        // And the impairment it implies survives the same boundary.
        assert_eq!(world.move_authority[0], Fx::ZERO);
        assert_eq!(world.turn_authority[0], Fx::ZERO);
    }

    #[test]
    fn a_severed_right_arm_cannot_drive_its_weapon() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert!(world.grips[0][LimbSlot::RightArm as usize].equipment_slot.is_some(),
                "the fixture's fighter holds no sword");
        sever_arm(&mut world, 0, BodyPart::RightArm);

        // The three consequences the contract names.
        assert_eq!(world.arm_authority[0][LimbSlot::RightArm as usize], Fx::ZERO);
        assert_eq!(world.grips[0][LimbSlot::RightArm as usize],
                   GripState { equipment_slot: None }, "a severed arm kept hold of its sword");
        assert!(world.grips[0][LimbSlot::LeftArm as usize].equipment_slot.is_some(),
                "the shield arm was released along with the sword arm");
        let contact = world.contact.as_ref().expect("articulated contact state");
        assert!(!contact.colliders.iter().any(|row| row.entity == EntityId::new(0, 0)
            && row.slot == LimbSlot::RightArm as u8),
            "a severed arm still built an equipment collider");

        // And zero authority is zero acceleration, not merely a zero column:
        // the arm is commanded hard and does not move.
        let swing = ArticulatedCommandV1 {
            move_dir: Vec2::ZERO, body_yaw: world.body_yaw[0].angle, intent: Intent::Hold,
            arms: [ArmTarget { bearing: Angle::QUARTER, height: crate::CombatHeight::HIGH,
                               reach: Fx::ONE, effort: Fx::ONE }; 2],
            grips: [GripRequest::Keep; 2],
        };
        let before = world.arms[0][1];
        world.submit_articulated_v1(world.id_of(0), swing);
        world.step();
        assert_eq!(world.arms[0][1].bearing, before.bearing,
                   "a severed arm accelerated toward a commanded bearing");
        assert_eq!(world.arms[0][1].reach, before.reach);
        // The sound arm answered the same command, which is what makes the
        // frozen one a statement about the limb rather than about the tick.
        assert_ne!(world.arms[0][0].bearing, Angle::ZERO);

        // And it cannot pick the sword back up. The command that asks for it is
        // accepted -- grip validation is about bindings, not about injuries --
        // and the grip phase refuses it anyway, on every tick, rather than
        // re-acquiring a weapon the contact phase would only drop again.
        let mut retake = world.neutral_articulated(0);
        retake.grips = [GripRequest::Keep, GripRequest::EquipSlot(0)];
        assert!(matches!(world.submit_articulated_v1(world.id_of(0), retake),
                         SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        for _ in 0..3 { world.step(); }
        assert_eq!(world.grips[0][LimbSlot::RightArm as usize],
                   GripState { equipment_slot: None }, "a severed arm took its sword back");
    }

    #[test]
    fn a_severed_left_arm_cannot_hold_its_shield() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert!(world.shield_pose[0].is_some(), "the fixture's fighter carries no shield");
        sever_arm(&mut world, 0, BodyPart::LeftArm);

        assert_eq!(world.grips[0][LimbSlot::LeftArm as usize],
                   GripState { equipment_slot: None });
        assert_eq!(world.shield_pose[0], None, "a severed arm kept a shield pose");
        assert_eq!(world.arm_authority[0][LimbSlot::LeftArm as usize], Fx::ZERO);
        // The sword arm is untouched, which is what makes this a statement
        // about one limb rather than about the body.
        assert!(world.grips[0][LimbSlot::RightArm as usize].equipment_slot.is_some());
        assert!(world.arm_authority[0][LimbSlot::RightArm as usize].is_positive());

        world.retain_contact_entry();
        world.record_contact_locomotion();
        world.resolve_contact();
        let contact = world.contact.as_ref().expect("articulated contact state");
        assert!(!contact.colliders.iter().any(|row| matches!(row.shape, ContactShape::Shield { .. })),
                "a released shield still built a collider");
        // The shield does not come back when the next command says `Keep`:
        // `Keep` reads the grip the release left behind.
        world.submit_articulated_v1(world.id_of(0), world.neutral_articulated(0));
        world.step();
        assert_eq!(world.shield_pose[0], None, "a dropped shield re-attached itself");
    }

    #[test]
    fn leg_injury_reduces_acceleration_not_requested_direction() {
        let scenario = fragile_scenario(&[]);
        let mut hurt = World::new(&scenario, 1);
        let sound = World::new(&scenario, 1);
        // Half the legs, no shock: the factor the actuator reads is exactly a
        // half, and the tick that publishes it is the anatomy phase.
        hurt.wounds[0].parts[BodyPart::Legs as usize].integrity = Fx::ONE;
        hurt.settle_anatomy();
        assert_eq!(hurt.move_authority[0], Fx::HALF);
        assert_eq!(hurt.turn_authority[0], Fx::HALF);

        let command = |dir| ArticulatedCommandV1 {
            move_dir: dir, body_yaw: Angle::QUARTER, intent: Intent::Hold,
            arms: [ArmTarget { bearing: Angle::ZERO, height: crate::CombatHeight::MID,
                               reach: Fx::from_ratio(1, 4), effort: Fx::ZERO }; 2],
            grips: [GripRequest::Keep; 2],
        };
        let mut sound = sound;
        // Along an axis first, where the arithmetic is exact and the claim can
        // be an equality rather than an inequality: half the authority is
        // exactly half the acceleration, and the acceleration is the only thing
        // it touches.
        for world in [&mut hurt, &mut sound] {
            world.submit_articulated_v1(EntityId::new(0, 0), command(Vec2::X));
            world.step();
        }
        assert_eq!(sound.vel[0], Vec2::X * sound.stats[0].traction());
        assert_eq!(hurt.vel[0], Vec2::X * (hurt.stats[0].traction() * Fx::HALF));
        // And turning: the same factor, on the angular acceleration alone.
        assert!(hurt.body_yaw[0].angle.raw() < sound.body_yaw[0].angle.raw(),
                "leg injury cost no angular acceleration");

        // The *requested* velocity is untouched -- impairment is a traction
        // term, not a steering one -- so given enough ticks the impaired body
        // arrives at exactly the same velocity on an off-axis heading, just
        // later. Three-four-five, so the request is exactly unit length and
        // survives `validate_move`'s magnitude check; a diagonal of two ones
        // does not, and is silently swapped for the neutral command.
        let diagonal = command(Vec2::new(Fx::from_ratio(3, 5), Fx::from_ratio(4, 5)));
        for _ in 0..180 {
            for world in [&mut hurt, &mut sound] {
                world.submit_articulated_v1(EntityId::new(0, 0), diagonal);
                world.step();
            }
        }
        assert_eq!(hurt.vel[0], sound.vel[0], "impairment changed the requested velocity");
        assert_eq!(hurt.body_yaw[0].angle, sound.body_yaw[0].angle,
                   "impairment changed the target yaw");
        assert_eq!(hurt.move_authority[0], Fx::HALF, "the impairment did not survive the run");
    }

    #[test]
    fn bleeding_can_end_a_fight_after_contact() {
        // A cut that will not close. The wound is written directly because the
        // braced fixture's relative motion is purely along the blade and cuts
        // nothing -- what is under test here is the bleed clock, and the blow
        // that starts it has its own test above.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].blood = Fx::from_int(1);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        assert_eq!(world.outcome(), None);

        let mut blood = world.wounds[1].blood;
        let mut ticks = 0;
        while world.outcome().is_none() {
            world.step();
            ticks += 1;
            assert!(ticks < 5_000, "a bleeding body never finished bleeding");
            if world.alive[1] {
                assert!(world.wounds[1].blood < blood, "a wounded body stopped bleeding");
                blood = world.wounds[1].blood;
            }
        }
        assert_eq!(world.outcome(), Some(Outcome::HeroesWin));
        assert_eq!(world.wounds[1].blood, Fx::ZERO);
        // 1 unit of blood at 3*18 raw a tick, and the tick it reaches zero is
        // the tick it dies on: 65,536/54 rounds up to 1,214.
        assert_eq!(ticks, 1_214);
    }

    #[test]
    fn bleeding_damage_is_credited_to_the_recorded_wound_source() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        let before = world.health_of(1);
        for _ in 0..600 { world.step(); }
        let lost = before - world.health_of(1);
        assert!(lost.is_positive(), "600 ticks of bleeding cost no health");
        // Exactly what the query lost, and to the recorded source alone.
        assert_eq!(world.damage_dealt[0], lost);
        assert_eq!(world.damage_dealt[1], Fx::ZERO);

        // `EntityId::NONE` receives no credit, and neither does a stale handle:
        // the source is an identity, not a row.
        let mut orphan = World::new(&fragile_scenario(&[]), 1);
        orphan.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        orphan.wounds[1].last_attacker = EntityId::NONE;
        for _ in 0..600 { orphan.step(); }
        assert!(orphan.health_of(1) < before, "the orphaned body stopped bleeding");
        assert_eq!(orphan.damage_dealt, vec![Fx::ZERO; orphan.alive.len()]);
    }

    #[test]
    fn last_attacker_identity_is_hashed_and_owns_later_bleed_credit() {
        let scenario = fragile_scenario(&[]);
        let mut world = World::new(&scenario, 1);
        world.wounds[1].parts[BodyPart::Torso as usize].wound = Fx::from_int(3);
        world.wounds[1].last_attacker = EntityId::new(0, 0);
        let digest = world.state_digest().value;

        // The generation is part of it. A handle naming the same row at a
        // generation that has moved on resolves to nobody, so its credit stops
        // -- which is the whole reason the identity is hashed rather than
        // treated as a diagnostic.
        let mut stale = world.clone();
        stale.wounds[1].last_attacker = EntityId::new(0, 1);
        assert_ne!(stale.state_digest().value, digest, "the generation word is not hashed");
        assert_eq!(stale.state_hash(), world.state_hash());
        for _ in 0..600 {
            world.step();
            stale.step();
        }
        assert!(world.damage_dealt[0].is_positive());
        assert_eq!(stale.damage_dealt[0], Fx::ZERO, "a stale handle collected credit");
        assert_eq!(world.health_of(1), stale.health_of(1),
                   "credit routing changed how much the body lost");
    }

    #[test]
    fn simultaneous_fatal_contacts_kill_both_fighters() {
        // Two mirrored fighters, blades level with each other's torso, both
        // facts landing in one time group off one pre-group anatomy.
        //
        // Only one of the two blows carries energy, and the reason is v2-14's
        // and worth writing down here because it is a hard constraint on any
        // future mutual-kill fixture: a pair that already overlaps at tick
        // start resolves at time zero, where there is no geometric side and the
        // normal rule answers world +X unconditionally. Closing is measured
        // along that normal, so of two mirrored blows exactly one closes and
        // the other separates. The other fighter is therefore killed by the
        // same tick's bleeding, which is the point either way: **death is
        // derived once, after everything the tick did**, so two bodies can die
        // together and neither reaping suppresses the other's blow.
        // Two mirrored fighters: the same geometry both sides, so the pair of
        // facts is symmetric, but a third anatomy row for the far one so only
        // it is scaled down. Both fragile would clamp the near one's open wound
        // to a raw unit and it could no longer bleed at all.
        let mut scenario = fragile_scenario(&[]);
        let mut fragile = crate::fighter_anatomy();
        fragile.id = 3;
        fragile.integrity_maxima = [Fx::from_raw(1); BodyPart::COUNT];
        scenario.combat_specs.as_mut().unwrap().anatomies.push(fragile);
        scenario.units[0].articulated.as_mut().unwrap().equipment = [Some(1), None];
        scenario.units[0].loadout = Loadout::single(ActionKind::Sword);
        scenario.units[0].spawn = Vec2::new(Fx::from_int(10), Fx::from_ratio(33, 4));
        scenario.units[1] = UnitSpec {
            faction: Faction::Monsters, spawn: Vec2::from_ints(11, 8),
            articulated: Some(ArticulatedUnitSpecV1 { anatomy: 3, equipment: [Some(1), None] }),
            ..scenario.units[0].clone()
        };
        let mut world = World::new(&scenario, 1000);
        brace_weapon(&mut world, 0);
        brace_weapon(&mut world, 1);
        // One raw unit of blood behind a full-depth torso wound: this tick's
        // bleed is 36 raw and empties it, so the near fighter dies of the fight
        // it is already in rather than of an injury invented for the test.
        world.wounds[0].blood = Fx::from_raw(1);
        world.wounds[0].parts[BodyPart::Torso as usize].wound = Fx::from_int(2);
        world.wounds[0].last_attacker = EntityId::new(1, 0);
        resolve_closing(&mut world, &[(0, Fx::ONE), (1, -Fx::ONE)]);

        // Both facts are in one group, and both name a body.
        let bodies: Vec<_> = world.contact_resolutions().iter()
            .filter(|row| row.fact.key.kind == ContactKind::WeaponBody)
            .map(|row| (row.fact.key.a.index, row.group_ordinal)).collect();
        assert_eq!(bodies, vec![(0, 0), (1, 0)], "the fixture stopped being simultaneous");
        assert_eq!(world.wounds[1].parts[BodyPart::Torso as usize].integrity, Fx::ZERO,
                   "the closing blow did not destroy a torso");
        assert_eq!(world.wounds[0].blood, Fx::ZERO, "the bleeding body did not empty");

        assert!(!world.alive[0] && !world.alive[1], "one of two simultaneous deaths survived");
        assert_eq!(world.outcome(), Some(Outcome::MutualDestruction));
        // Both deaths carry their killer, which is the evidence that neither
        // body was reaped before the other's fate was measured.
        let killers: Vec<_> = world.events.iter().filter_map(|event| match event {
            Event::Death { entity, killer } => Some((entity.index, killer.index)),
            _ => None,
        }).collect();
        assert_eq!(killers, vec![(0, 1), (1, 0)]);
    }

    #[test]
    fn health_observation_frame_fitness_and_outcome_share_one_derivation() {
        let (world, region) = braced_thrust(&fragile_scenario(&[1]));
        let brute = world.id_of(1);
        let expected = world.wounds[1].health(world.anatomy_spec(1).expect("articulated anatomy"));
        assert!(expected < anatomy::max_health(world.anatomy_spec(1).unwrap()),
                "the fixture wounded region {region} without changing health");

        // The published view.
        let view = world.view(brute).expect("a live brute");
        assert_eq!(view.hp, expected);
        assert_eq!(view.max_hp, anatomy::max_health(world.anatomy_spec(1).unwrap()));
        // The observation, which reports the same number as a fraction.
        let mut world = world;
        let observation = world.observe(brute);
        assert_eq!(observation.hp_frac, world.health_fraction_of(1));
        assert_eq!(observation.hp_frac, expected / view.max_hp);
        // The timeout comparison, which is the fitness input.
        assert_eq!(world.health_fraction(Faction::Monsters), observation.hp_frac);
        assert_eq!(world.health_fraction(Faction::Heroes), Fx::ONE);
        assert_eq!(world.timeout(), Outcome::Decision(Faction::Heroes));
        // And the outcome, which is the same derivation taken to zero.
        assert_eq!(world.outcome(), None);
        world.wounds[1].parts[BodyPart::Torso as usize].integrity = Fx::ZERO;
        world.reap_dead_articulated();
        assert_eq!(world.outcome(), Some(Outcome::HeroesWin));
        assert_eq!(world.health_fraction(Faction::Monsters), Fx::ZERO);
        assert!(world.view(brute).is_none());
    }

    #[test]
    fn body_body_contact_remains_planar_and_single_sourced() {
        // Two overlapping hostile articulated bodies. Body against body is
        // `World::separate`'s and only `World::separate`'s, so the solver must
        // never key a row body-to-body -- otherwise one overlap is answered
        // twice, once planar and once in three dimensions, and the two answers
        // fight each other every tick.
        //
        // The contract names this fixture as carrying no equipment. It cannot:
        // `Loadout`'s slot 0 is not an `Option` and `validate_rows` requires the
        // carried equipment and the loadout to agree slot for slot, so an
        // articulated row always holds something. Keeping the duel's equipment
        // costs the test nothing, because what it asserts is the absence of a
        // body/body *key*, not the absence of all contact.
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::from_ints(8, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_int(8) + Fx::from_ratio(1, 4), Fx::from_int(8));
        let mut world = World::new(&scenario, 1);
        assert!(world.pos[1].x - world.pos[0].x < world.radius[0] + world.radius[1],
                "the fixture did not start overlapping");

        world.step();
        assert!(world.pos[1].x - world.pos[0].x > Fx::from_ratio(1, 4),
                "planar separation did not push the pair apart");
        // Non-empty first, or the check below is a claim about an empty slice.
        // Two bodies this close are inside each other's weapons, so the solver
        // has plenty to key -- what it must never key is the pair of bodies.
        assert!(!world.contact_resolutions().is_empty(),
                "the fixture resolved nothing, so the body/body check is vacuous");
        assert!(!world.contact_resolutions().iter().any(|row| {
            row.fact.key.a_slot == crate::combat::contact::BODY_SLOT
                && row.fact.key.b_slot == crate::combat::contact::BODY_SLOT
        }), "the solver keyed a body against a body");
        assert_eq!(world.contact_cap_hits(), 0);
        // And a body has no Z degree of freedom at all in v2-14: a contact
        // delta discards its Z as floor reaction, so a body row carrying one
        // would have got it from somewhere with no right to write it. Asserted
        // on the collider rows rather than on `World::vel`, which is a `Vec2`
        // and could not hold the counterexample even if the solver produced it.
        let contact = world.contact.as_ref().expect("articulated contact state");
        for row in &contact.colliders {
            if matches!(row.shape, ContactShape::Body { .. }) {
                assert_eq!(row.velocity.z, Fx::ZERO, "a body row carried a vertical velocity");
            }
        }
    }

    /// A fighter and a brute a unit and a half apart -- inside each other's
    /// weapons -- with the reaching commands that make them touch.
    ///
    /// Not `Scenario::articulated_duel()` unmodified: that fixture stands the
    /// pair ten units apart and its spawns are pinned by
    /// `articulated_duel_v1_has_the_frozen_identity_and_placement`, so a
    /// contact fixture has to move them here.
    fn clinch_scenario() -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        scenario
    }

    fn clinch_world() -> World {
        World::new(&clinch_scenario(), 1000)
    }

    fn reaching_command(yaw: Angle, reach: Fx) -> ArticulatedCommandV1 {
        let arm = |reach| ArmTarget {
            bearing: yaw, height: crate::CombatHeight::MID, reach, effort: Fx::ONE,
        };
        ArticulatedCommandV1 {
            move_dir: Vec2::ZERO, body_yaw: yaw, intent: Intent::Hold,
            arms: [arm(Fx::from_ratio(1, 4)), arm(reach)],
            grips: [GripRequest::Keep; 2],
        }
    }

    /// Drive the clinch until it has resolved something, and answer the tick it
    /// took. Panics rather than returning, because every caller's assertions
    /// are vacuous without a fact.
    fn step_into_contact(world: &mut World) -> u32 {
        for tick in 0..60 {
            // Resolved from the live columns rather than written as `(0,0)` and
            // `(1,0)`: this is also called after a slot has been reused, and a
            // stale handle is refused rather than obeyed, which would leave the
            // brute holding a neutral command and the fixture proving nothing.
            for i in 0..world.alive.len() {
                if !world.alive[i] { continue; }
                let yaw = if i == 0 { Angle::ZERO } else { Angle::HALF };
                let reach = if i == 0 { Fx::ONE } else { Fx::from_ratio(1, 4) };
                world.submit_articulated_v1(world.id_of(i), reaching_command(yaw, reach));
            }
            world.step();
            if !world.contact_resolutions().is_empty() { return tick; }
        }
        panic!("the clinch fixture never resolved a contact");
    }

    #[test]
    fn repeated_crowded_separation_clamps_before_energy_and_sweep() {
        const L: Fx = crate::combat::contact::CONTACT_COMPONENT_SPEED_LIMIT;
        let inside = |value: Fx| value >= -L && value <= L;

        // The ordering half, stated as the defect it prevents. A body handed a
        // velocity of five per axis is 8.66 long against a sweep envelope of
        // four, and `fx` fails an out-of-envelope sweep *closed* -- it answers
        // `TimeOfImpact::ZERO`, which manufactures a contact against every
        // hostile collider in the arena however far away. Driving the phase
        // directly rather than through `World::step` is what keeps the five
        // from simply teleporting the bodies apart before contact sees it.
        let mut world = clinch_world();
        world.pos[1] = Vec2::from_ints(60, 8);
        world.retain_contact_entry();
        world.record_contact_locomotion();
        for i in 0..world.alive.len() { world.vel[i] = Vec2::from_ints(5, -5); }
        world.resolve_contact();
        for i in 0..world.alive.len() {
            assert!(inside(world.vel[i].x) && inside(world.vel[i].y),
                "the entry clamp did not run before the sweep");
        }
        assert!(world.contact_resolutions().is_empty(),
            "an out-of-envelope sweep manufactured a contact fifty units away");

        // And the repeated half: a crowd that separation has to unpick every
        // tick, with the two of them inside each other's weapons throughout.
        let mut world = clinch_world();
        for _ in 0..40 {
            world.submit_articulated_v1(EntityId::new(0, 0), reaching_command(Angle::ZERO, Fx::ONE));
            world.submit_articulated_v1(EntityId::new(1, 0), reaching_command(Angle::HALF, Fx::ONE));
            world.step();
            let contact = world.contact.as_ref().expect("articulated contact state");
            for row in &contact.colliders {
                assert!(inside(row.velocity.x) && inside(row.velocity.y) && inside(row.velocity.z),
                    "a collider left the clamp the sweep is built against");
            }
            for i in 0..world.alive.len() {
                // Separation moves both sweep endpoints together, so however
                // often it fires it contributes no relative motion for the
                // energy ledger to pay for.
                let (start, end) = world.contact_body_sweep(i);
                assert_eq!(end - start, contact.entry[i].locomotion,
                    "a separation shove leaked into the swept extent");
            }
            for row in world.contact_resolutions() {
                assert!(row.energy.after_raw <= row.energy.before_raw,
                    "a group created energy");
                assert!(row.group_alpha_raw <= 65_536);
            }
        }
    }

    #[test]
    fn a_zero_alpha_trial_answers_with_the_rows_it_was_handed() {
        // The invariant `resolve_group_into` refuses a projector for breaking,
        // proved against the projector that broke it. Alpha zero applies no
        // impulse, so the trial it builds has to be the closure it was given --
        // and it was not, because the equipment pass mapped every row out to a
        // hand and back through a joint inverse that is not exact, at every
        // alpha including this one. 6.5% of the articulated corpus was computed
        // and rolled back on that drift; the arithmetic is in the alpha-zero
        // note in `resolve_group_into`.
        //
        // The last tick's retained entry is used as it stands rather than
        // re-retained, and that is what makes the fixture sharp: contact writes
        // `previous_hand = entry hand` and `linear_velocity = hand - previous
        // hand`, so `entry_hand + relative velocity` is exactly the hand the
        // arm is holding, which is the hand the joint has already agreed to.
        let mut world = clinch_world();
        step_into_contact(&mut world);
        let contact = world.contact.take().expect("articulated contact state");

        let mut colliders = Vec::new();
        let wounds = world.wounds.clone();
        world.build_contact_colliders(&contact.entry, &mut colliders, &wounds);
        let rows: Vec<GeneralizedCollider> = colliders.iter().map(|row| GeneralizedCollider {
            entity: row.entity, slot: row.slot,
            kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body }
                  else { GeneralizedKind::Equipment },
            mass: row.mass, velocity: row.velocity,
        }).collect();
        let held = rows.iter().find(|row| row.kind == GeneralizedKind::Equipment)
            .copied().expect("the fixture built no equipment row to project");

        // The premise, written down so the proof below cannot go quietly
        // vacuous: the round trip really does move a hand the actuator itself
        // built. If it ever starts holding exactly, this fixture stops proving
        // anything and the drift argument in `project` wants re-measuring
        // rather than deleting.
        let i = world.resolve(held.entity).expect("a live equipment row");
        let limb = held.slot as usize;
        let anatomy = world.combat_specs.as_ref().expect("articulated combat specs")
            .anatomy(world.articulated_anatomy[i].expect("articulated anatomy"))
            .expect("validated articulated anatomy").clone();
        let (arm, yaw) = (world.arms[i][limb], world.body_yaw[i].angle);
        assert_eq!(contact.entry[i].arms[limb].hand + arm.linear_velocity, arm.hand,
                   "the entry hand and the arm velocity stopped naming the same hand");
        let (bearing, height, reach) =
            actuator::inverse_hand(&anatomy, yaw, limb, arm.hand, arm.bearing);
        assert_ne!(actuator::hand_position(&anatomy, yaw, limb, bearing, height, reach), arm.hand,
                   "the joint round trip became exact; this fixture no longer proves anything");

        // No accumulator and no alpha: whatever comes back, the group proposed
        // none of it.
        let sums = vec![[0i128; 3]; rows.len()];
        let (mut bodies, mut trial) = (Vec::new(), Vec::new());
        let (mut state, mut credit) = (wounds.clone(), vec![Fx::ZERO; wounds.len()]);
        let (mut deltas, mut fact_loss) = (Vec::new(), Vec::new());
        let mut projector = ContactProjector {
            world: &world, entry: &contact.entry, bodies: &mut bodies, wounds: &mut state,
            credit: &mut credit, deltas: &mut deltas, fact_loss: &mut fact_loss,
        };
        projector.project(&rows, &sums, 0, &mut trial).expect("a projectable closure");
        assert_eq!(trial.len(), rows.len(), "the trial re-indexed the closure");
        // Compared raw, and printed raw. The drift is a handful of raw units on
        // a velocity of a thousandth, so `Fx`'s four-decimal Display shows two
        // identical rows and names nothing.
        for (got, want) in trial.iter().zip(&rows) {
            let raws = |row: &GeneralizedCollider| {
                (row.velocity.x.raw(), row.velocity.y.raw(), row.velocity.z.raw())
            };
            assert_eq!(raws(got), raws(want),
                       "alpha zero moved entity {} slot {}", want.entity.index, want.slot);
        }
        assert_eq!(resolution::closure_energy(&trial).expect("bounded closure"),
                   resolution::closure_energy(&rows).expect("bounded closure"),
                   "alpha zero changed the closure's energy");
    }

    #[test]
    fn wall_settlement_never_increases_entity_closure_energy() {
        // A fighter pinned against the east wall with a brute walking its club
        // into him: the impulse is due east and has nowhere to go. Poses are
        // set on the columns rather than coaxed out of the actuator, because
        // what is under test is the settlement and a fixture that had to turn a
        // body around first would stop testing it the day a yaw rate moved.
        let mut world = clinch_world();
        let fighter = Fx::from_int(24) - world.radius[0];
        world.pos[0] = Vec2::new(fighter, Fx::from_int(8));
        // 1.8625 west, which puts the club's tip a fifth of a unit short of the
        // fighter's axis: close enough to overlap the 0.41 radius sum, far
        // enough that the tip is the closest feature and the normal is exactly
        // east.
        world.pos[1] = Vec2::new(fighter - Fx::from_ratio(149, 80),
                                 Fx::from_int(8) - Fx::from_ratio(3, 10));
        world.body_yaw[0].angle = Angle::ZERO;
        world.body_yaw[1].angle = Angle::ZERO;

        let mut walking = reaching_command(Angle::ZERO, Fx::from_ratio(1, 4));
        walking.move_dir = Vec2::X;
        walking.arms = [ArmTarget { bearing: Angle::ZERO, height: crate::CombatHeight::MID,
                                    reach: Fx::from_ratio(1, 4), effort: Fx::ZERO }; 2];
        let mut clipped = 0usize;
        for _ in 0..30 {
            world.submit_articulated_v1(EntityId::new(1, 0), walking);
            world.step();
            let contact = world.contact.as_ref().expect("articulated contact state");
            if world.contact_resolutions().is_empty() { continue; }

            // The solver's answer, and then the world it was committed onto.
            // Settlement is the only step between them that may remove energy,
            // and the contract requires that it never add any.
            let solved = |contact: &ContactRuntime| -> Vec<GeneralizedCollider> {
                contact.colliders.iter().map(|row| GeneralizedCollider {
                    entity: row.entity, slot: row.slot,
                    kind: if matches!(row.shape, ContactShape::Body { .. }) { GeneralizedKind::Body }
                          else { GeneralizedKind::Equipment },
                    mass: row.mass, velocity: row.velocity,
                }).collect()
            };
            let before = solved(contact);
            let after: Vec<GeneralizedCollider> = before.iter().map(|row| {
                let i = world.resolve(row.entity).expect("a live contact row");
                let body = Vec3::new(world.vel[i].x, world.vel[i].y, Fx::ZERO);
                GeneralizedCollider {
                    velocity: match row.kind {
                        GeneralizedKind::Body => body,
                        GeneralizedKind::Equipment => body + world.arms[i][row.slot as usize].linear_velocity,
                    },
                    ..*row
                }
            }).collect();
            let (before_energy, after_energy) = (
                crate::combat::resolution::closure_energy(&before).expect("bounded closure"),
                crate::combat::resolution::closure_energy(&after).expect("bounded closure"),
            );
            assert!(after_energy <= before_energy,
                "wall settlement added energy: {before_energy} -> {after_energy}");

            if before.iter().any(|row| row.kind == GeneralizedKind::Body
                && row.entity.index == 0 && row.velocity.x > Fx::ZERO)
                && world.vel[0].x == Fx::ZERO
            {
                clipped += 1;
                // The wall's share reaches the held colliders too, or the
                // fighter's own sword would keep travelling east through the
                // masonry its owner just stopped against.
                for limb in 0..2 {
                    assert_eq!(world.vel[0].x + world.arms[0][limb].linear_velocity.x, Fx::ZERO,
                        "a held collider kept the component the wall took");
                }
            }
        }
        assert!(clipped > 0, "the fixture never drove a contacted body into the wall");
    }

    #[test]
    fn both_has_one_right_owned_collider_and_mirrors_after_contact() {
        // The club, rebound to both hands. Nothing in the shipped table is
        // two-handed yet, and `validate_equipment` refuses a two-handed shield,
        // so a segment is the only thing this proof can be written against.
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        let table = scenario.combat_specs.as_mut().expect("articulated combat specs");
        table.equipment[2].binding = crate::GripBinding::Both;
        let mut world = World::new(&scenario, 1000);
        assert!(world.two_handed(1), "the brute is not holding the club in both hands");

        // The control: the same brute, alone, so its arms carry the actuator's
        // answer and nothing else.
        let mut alone = World::new(&scenario, 1000);
        alone.pos[0] = Vec2::from_ints(60, 8);

        for _ in 0..40 {
            for target in [&mut world, &mut alone] {
                target.submit_articulated_v1(EntityId::new(0, 0), reaching_command(Angle::ZERO, Fx::ONE));
                target.submit_articulated_v1(EntityId::new(1, 0), reaching_command(Angle::HALF, Fx::ONE));
                target.step();
            }
            let contact = world.contact.as_ref().expect("articulated contact state");
            let owned: Vec<u8> = contact.colliders.iter()
                .filter(|row| row.entity.index == 1 && !matches!(row.shape, ContactShape::Body { .. }))
                .map(|row| row.slot).collect();
            assert_eq!(owned, vec![1], "a `Both` item emitted other than one right-owned collider");
            assert!(!world.contact_resolutions().iter().any(|row| {
                (row.fact.key.a.index == 1 && row.fact.key.a_slot == 0)
                    || (row.fact.key.b.index == 1 && row.fact.key.b_slot == 0)
            }), "the mirrored left arm was keyed as a collider");
        }

        // Contact moved the owner, and the mirror followed it. The control is
        // what makes the first half of that non-vacuous: without it, "the left
        // arm mirrors the right" is equally true of a tick that resolved
        // nothing, because the actuator mirrors it too.
        assert_ne!(world.arms[1][1].hand, alone.arms[1][1].hand,
            "contact never moved the two-handed owner");
        let anatomy = world.combat_specs.as_ref().unwrap()
            .anatomy(world.articulated_anatomy[1].unwrap()).unwrap().clone();
        let mut expected = world.arms[1][0];
        actuator::mirror_two_handed(&mut expected, world.arms[1][1], &anatomy, world.body_yaw[1].angle);
        assert_eq!(world.arms[1][0], expected, "the left arm was left on its pre-contact mirror");
    }

    // ------------------------------------------------------------- published pose

    #[test]
    fn a_pose_is_refused_for_a_legacy_world_a_stale_identity_and_a_corpse() {
        let legacy = duel_world();
        assert_eq!(legacy.articulated_pose(legacy.id_of(0)), None,
                   "a Legacy world published an articulated pose out of empty columns");

        let mut world = World::new(&Scenario::articulated_duel(), 1);
        let fighter = EntityId::new(0, 0);
        assert!(world.articulated_pose(fighter).is_some(), "the fixture has no live fighter");
        assert_eq!(world.articulated_pose(EntityId::new(0, 1)), None, "a stale generation resolved");
        assert_eq!(world.articulated_pose(EntityId::new(9, 0)), None, "an unallocated slot resolved");

        // Deadness is the query's own answer and not a consequence of when it
        // was asked: a body that has bled out is a corpse on the tick it
        // happens, several phases before the reap that clears `alive`.
        world.wounds[0].blood = Fx::ZERO;
        assert!(world.wounds[0].is_dead());
        assert_eq!(world.articulated_pose(fighter), None, "an unreaped corpse published a pose");
        world.step();
        assert_eq!(world.articulated_pose(fighter), None, "a reaped slot published a pose");
    }

    #[test]
    fn a_published_pose_is_world_space_throughout() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        // Moved off both axes, so a missing translation cannot pass by landing
        // on a zero component.
        world.pos[0] = Vec2::new(Fx::from_ratio(37, 4), Fx::from_ratio(13, 8));
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let pose = world.articulated_pose(EntityId::new(0, 0)).expect("a live fighter");
        assert_eq!((pose.id, pose.body, pose.body_yaw), (EntityId::new(0, 0), body, Angle::ZERO));

        for limb in 0..2 {
            assert_eq!(pose.arms[limb].hand, body + world.arms[0][limb].hand);
            assert_eq!(pose.arms[limb].fatigue, world.arms[0][limb].fatigue);
            // The one field that is deliberately not converted, and the field
            // doc says why. Asserted rather than left implicit, because a later
            // "make it all world space" would otherwise look harmless.
            assert_eq!(pose.arms[limb].velocity, world.arms[0][limb].linear_velocity);
        }

        let stored = world.shield_pose[0].expect("the fighter carries a shield");
        let shield = pose.shield.expect("the fighter carries a shield");
        assert_eq!(shield.centre, body + stored.centre);
        assert_eq!(shield, ShieldPose { centre: shield.centre, ..stored },
                   "translating the centre disturbed the frame-independent fields");

        let sword = world.equipment_in_grip(0, 1).expect("the fighter holds a sword");
        assert_eq!(pose.weapons[1], geometry::segment_pose(body, world.arms[0][1], sword));
        assert_eq!(pose.weapons[1].expect("a drawn sword").hilt, pose.arms[1].hand,
                   "the hilt is not the hand it is held in");
        // A shield is not a segment, so the weapon slot it occupies stays empty
        // and the mask agrees with the geometry rather than with the grip.
        assert_eq!(pose.weapons[0], None);
        assert_eq!(pose.equipment_mask, 0b110);
    }

    #[test]
    fn the_target_hand_is_the_pose_the_actuator_is_chasing() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        let fighter = EntityId::new(0, 0);
        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);

        // No command has ever been accepted. The answer is the neutral command
        // the arm driver substitutes -- not a zero, which would draw a reach
        // line to the map origin, and not the current hand either.
        let neutral = world.neutral_articulated(0);
        let pose = world.articulated_pose(fighter).expect("a live fighter");
        assert_eq!(pose.intent, Intent::Hold);
        for limb in 0..2 {
            // The neutral reach is zero and comes back at the joint minimum,
            // which is the integrator's clamp repeated on this side.
            let expected = actuator::hand_position(&spec, Angle::ZERO, limb,
                neutral.arms[limb].bearing, neutral.arms[limb].height,
                Fx::from_raw(actuator::ARM_MIN_REACH_RAW));
            assert_eq!(pose.arms[limb].target_hand, body + expected);
        }

        // With a command stored it is that command's hand, at the yaw the body
        // has turned to by now -- the shoulder rotates, so a target frozen at
        // the yaw the order was given would drift off the arm.
        world.submit_articulated_v1(fighter, articulated_command());
        for _ in 0..3 { world.step(); }
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let pose = world.articulated_pose(fighter).expect("a live fighter");
        assert_eq!(pose.intent, articulated_command().intent);
        for limb in 0..2 {
            let arm = articulated_command().arms[limb];
            assert_eq!(pose.arms[limb].target_hand, body + actuator::hand_position(
                &spec, world.body_yaw[0].angle, limb, arm.bearing, arm.height, arm.reach));
            assert_ne!(pose.arms[limb].hand, pose.arms[limb].target_hand,
                       "the arm arrived, so this fixture no longer separates the two");
        }
    }

    #[test]
    fn a_two_handed_item_publishes_one_right_hand_weapon_and_a_mirrored_target() {
        let mut world = World::new(&both_scenario(), 1);
        assert!(world.two_handed(1), "the brute is not holding the club in both hands");
        world.submit_articulated_v1(EntityId::new(1, 0), reaching_command(Angle::HALF, Fx::ONE));
        world.step();

        let pose = world.articulated_pose(EntityId::new(1, 0)).expect("a live brute");
        assert_eq!(pose.weapons[0], None, "one club was drawn from both hands");
        assert!(pose.weapons[1].is_some(), "the owning arm published no club");
        assert_eq!(pose.equipment_mask, 0b010, "the mask disagreed with the drawn geometry");

        // The off hand chases nothing of its own -- the tick mirrors it off the
        // right arm -- so its published target is that same reflection.
        let spec = world.anatomy_spec(1).cloned().expect("articulated anatomy");
        let yaw = world.body_yaw[1].angle;
        let body = Vec3::new(world.pos[1].x, world.pos[1].y, Fx::ZERO);
        assert_eq!(pose.arms[0].target_hand - body,
                   actuator::mirror_hand(&spec, yaw, pose.arms[1].target_hand - body));
        assert_ne!(pose.arms[0].target_hand, pose.arms[1].target_hand,
                   "the mirror is the identity here, so it proves nothing");

        // And a one-handed pair is not mirrored: the fighter in the same world
        // answers each arm's own command.
        world.submit_articulated_v1(EntityId::new(0, 0), articulated_command());
        world.step();
        let fighter = world.articulated_pose(EntityId::new(0, 0)).expect("a live fighter");
        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let arm = articulated_command().arms[0];
        assert_eq!(fighter.arms[0].target_hand, body + actuator::hand_position(
            &spec, world.body_yaw[0].angle, 0, arm.bearing, arm.height, arm.reach));
    }

    #[test]
    fn the_severed_and_equipment_masks_name_their_own_bits() {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        let fighter = EntityId::new(0, 0);
        assert_eq!(world.articulated_pose(fighter).unwrap().equipment_mask, 0b110,
                   "a right-hand sword and a left-hand shield are not bits 1 and 2");
        assert_eq!(world.articulated_pose(fighter).unwrap().severed_mask, 0);

        // The three rigid regions, marked without emptying them: severing a head
        // or a torso outright is death, and a corpse publishes no row to read
        // the mask off.
        for part in [BodyPart::Head, BodyPart::Torso, BodyPart::Legs] {
            let mut marked = world.clone();
            marked.wounds[0].parts[part as usize].severed = true;
            assert_eq!(marked.articulated_pose(fighter).unwrap().severed_mask, 1 << part as u8);
        }

        // The arms are the case that moves both masks at once, because the grip
        // phase drops what a severed arm was holding.
        sever_arm(&mut world, 0, BodyPart::LeftArm);
        let pose = world.articulated_pose(fighter).unwrap();
        assert_eq!(pose.severed_mask, 1 << BodyPart::LeftArm as u8);
        assert_eq!(pose.equipment_mask, 0b010, "a severed shield arm kept its shield bit");
        sever_arm(&mut world, 0, BodyPart::RightArm);
        let pose = world.articulated_pose(fighter).unwrap();
        assert_eq!(pose.severed_mask,
                   (1 << BodyPart::LeftArm as u8) | (1 << BodyPart::RightArm as u8));
        assert_eq!(pose.equipment_mask, 0, "an armless body kept a weapon bit");
    }

    #[test]
    fn every_animation_hint_is_reachable() {
        // Idle and Braced. At construction every joint has arrived, so the only
        // thing separating the fighter's two arms is what they hold.
        let still = World::new(&Scenario::articulated_duel(), 1);
        assert_eq!(still.articulated_pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Idle]);
        assert_eq!(still.articulated_pose(EntityId::new(1, 0)).unwrap().hints,
                   [AnimationHint::Idle; 2], "the brute has no shield to brace behind");

        // Chasing outranks Braced: a shield arm in motion is not holding still.
        let mut chasing = World::new(&Scenario::articulated_duel(), 1);
        chasing.submit_articulated_v1(EntityId::new(0, 0), articulated_command());
        chasing.step();
        assert_eq!(chasing.articulated_pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Chasing; 2]);

        // Contact without Recoiling, which is the pair's whole distinction: a
        // braced sword resting inside a body with nothing closing resolves a
        // group that moves no hand, so the commit writes no joint.
        let mut resting = World::new(&fragile_scenario(&[]), 1000);
        brace_weapon(&mut resting, 0);
        resolve_closing(&mut resting, &[]);
        assert!(resting.contact_resolutions().iter().any(|row|
            row.fact.key.a == EntityId::new(0, 0) && row.fact.key.a_slot == 1),
            "the resting fixture keyed nothing against the sword arm");
        assert_eq!(resting.articulated_pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Contact]);

        // Recoiling: the same two bodies actually closing, where the solve
        // hauls the hand and the commit writes it back.
        let mut clinch = clinch_world();
        step_into_contact(&mut clinch);
        assert_eq!(clinch.articulated_pose(EntityId::new(0, 0)).unwrap().hints[1],
                   AnimationHint::Recoiling);

        // Severed outranks everything, on the arm that is gone and on no other.
        let mut cut = World::new(&fragile_scenario(&[]), 1);
        sever_arm(&mut cut, 0, BodyPart::RightArm);
        assert_eq!(cut.articulated_pose(EntityId::new(0, 0)).unwrap().hints,
                   [AnimationHint::Braced, AnimationHint::Severed]);
    }

    // ------------------------------------------- subject-scoped observation

    /// The fighter and the brute a step and a half apart, with the subject's
    /// eye dialled by hand.
    ///
    /// `perception 15` is the one value at which [`Stats::perception_noise`] is
    /// exactly zero, so a "sharp" world is not merely less blurred, it is
    /// ground truth -- which is what lets a noise test subtract two
    /// observations and get the error itself.
    fn eyed_world(subject: usize, perception: u8) -> World {
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.stats[subject].perception = perception;
        world
    }

    /// One hero, one ally, and seven enemies strung out to the east at 1.6
    /// units, which is exactly clear of two touching brutes.
    fn crowded_scenario() -> Scenario {
        let mut scenario = fragile_scenario(&[]);
        let monster = scenario.units[1];
        scenario.units.truncate(1);
        scenario.units[0].spawn = Vec2::from_ints(4, 8);
        for step in 0..7 {
            let mut unit = monster;
            // The nearest enemy wears the fighter's articulated row -- a shield
            // and a sword rather than the brute's single club -- so a test that
            // strips its equipment has both kinds of geometry to remove. A
            // monster in a fighter's body is legal and validated: it is the row
            // unit 0 already carries.
            if step == 0 {
                unit.articulated = scenario.units[0].articulated;
                // The loadout has to move with it: construction validates that
                // the two agree slot for slot.
                unit.loadout = scenario.units[0].loadout;
            }
            unit.spawn = Vec2::new(Fx::from_int(5) + Fx::from_ratio(16 * step, 10), Fx::from_int(8));
            scenario.units.push(unit);
        }
        // Nearer than every enemy, so a list that admitted allies would put it
        // first and could not fail quietly.
        let mut ally = scenario.units[0];
        ally.spawn = Vec2::new(Fx::from_ratio(45, 10), Fx::from_int(8));
        scenario.units.push(ally);
        scenario
    }

    #[test]
    fn an_articulated_observation_is_blank_for_a_legacy_world_a_stale_identity_and_a_corpse() {
        // The same four refusals `articulated_pose` answers `None` to, and they
        // have to be the same four: an observation is a pose with an eye in
        // front of it, and a corpse that published nothing to draw must not
        // publish something to fight.
        let legacy = duel_world();
        assert_eq!(legacy.observe_articulated(legacy.id_of(0)), ArticulatedObservation::BLANK,
                   "a Legacy world observed articulated state out of empty columns");
        // And through the public door: the legacy observation carries the block
        // anyway, blank, so the feature vector has one width.
        assert!(!legacy.observe(legacy.id_of(0)).articulated.present());

        let mut world = World::new(&Scenario::articulated_duel(), 1);
        let fighter = EntityId::new(0, 0);
        assert!(world.observe_articulated(fighter).present(), "the fixture has no live fighter");
        assert_eq!(world.observe_articulated(EntityId::new(0, 1)), ArticulatedObservation::BLANK);
        assert_eq!(world.observe_articulated(EntityId::new(9, 0)), ArticulatedObservation::BLANK);

        world.wounds[0].blood = Fx::ZERO;
        assert!(world.wounds[0].is_dead());
        assert_eq!(world.observe_articulated(fighter), ArticulatedObservation::BLANK,
                   "an unreaped corpse observed itself");
        assert!(!world.observe(fighter).articulated.present());
    }

    #[test]
    fn an_articulated_observation_is_the_subjects_own_joints_exactly() {
        let mut world = World::new(&Scenario::articulated_duel(), 1);
        // Off both axes, so a missing translation cannot pass by landing on a
        // zero component.
        world.pos[0] = Vec2::new(Fx::from_ratio(37, 4), Fx::from_ratio(13, 8));
        // The dimmest eye in the game, to prove the point: proprioception does
        // not degrade.
        world.stats[0].perception = 0;
        let fighter = EntityId::new(0, 0);
        let body = Vec3::new(world.pos[0].x, world.pos[0].y, Fx::ZERO);
        let obs = world.observe_articulated(fighter);

        assert_eq!((obs.tick, obs.subject, obs.body_position), (world.tick, fighter, body));
        assert_eq!(obs.body_yaw, world.body_yaw[0].angle);
        assert_eq!(obs.body_velocity, Vec3::new(world.vel[0].x, world.vel[0].y, Fx::ZERO));

        let spec = world.anatomy_spec(0).cloned().expect("articulated anatomy");
        let command = world.neutral_articulated(0);
        let targets = world.articulated_targets(0, &spec, &command);
        for limb in 0..2 {
            let arm = obs.arms[limb];
            assert_eq!(arm.hand, body + world.arms[0][limb].hand);
            assert_eq!(arm.target_hand, body + targets[limb]);
            // The one column that is deliberately not converted, matching
            // `PosedArm::velocity`. Asserted rather than left implicit, because
            // a later "make it all world space" would otherwise look harmless.
            assert_eq!(arm.velocity, world.arms[0][limb].linear_velocity);
            assert_eq!(arm.fatigue, world.arms[0][limb].fatigue);
            assert!(!arm.severed);
        }
        // The equipment code is the immutable **spec** row, not the carried
        // slot the grip indexes -- the two are different numbers here, which is
        // exactly why the wrong one would go unnoticed.
        assert_eq!(
            [obs.arms[0].equipment, obs.arms[1].equipment],
            [world.equipment_in_grip(0, 0).map(|item| item.id),
             world.equipment_in_grip(0, 1).map(|item| item.id)],
        );
        assert_eq!([obs.arms[0].equipment, obs.arms[1].equipment], [Some(2), Some(1)],
                   "the shield row is 2 and the sword row is 1");
        assert!(matches!(world.equipment_in_grip(0, 0).unwrap().geometry,
                         EquipmentGeometry::Shield { .. }));

        let stored = world.shield_pose[0].expect("the fighter carries a shield");
        assert_eq!(obs.shield, ObservedShield {
            present: true,
            centre: body + stored.centre,
            normal: stored.normal,
            half_width: stored.half_width,
            half_height: stored.half_height,
        });

        let state = world.wounds[0];
        assert_eq!(obs.blood_fraction, anatomy::blood_fraction(&state, &spec));
        assert_eq!(obs.shock, state.shock);
        for part in 0..BodyPart::COUNT {
            assert_eq!(obs.integrity_fraction[part], anatomy::part_fraction(&state, &spec, part));
            assert_eq!(obs.wound_fraction[part], anatomy::part_wound_fraction(&state, &spec, part));
        }
        assert_eq!(obs.severed_mask, 0);
        // The same observation through the public door, byte for byte.
        assert_eq!(world.observe(fighter).articulated, obs);
    }

    #[test]
    fn every_capability_bit_names_a_presence_fact() {
        use ArticulatedObservation as A;
        let capable = |world: &World, i: usize| world.observe_articulated(world.id_of(i)).capabilities;

        // A shield in the left hand and a sword in the right. Both grips are
        // occupied, only the sword is a weapon, and nothing binds two hands.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        assert_eq!(capable(&world, 0),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::RIGHT_WEAPON | A::SHIELD,
                   "a shield in a grip is not a weapon in it");

        // Legs are the movement pair and nothing else, and the pair moves
        // together because the model gives translation and turning one pool.
        let mut legless = world.clone();
        legless.wounds[0].parts[BodyPart::Legs as usize].severed = true;
        assert_eq!(capable(&legless, 0) & (A::MOVEMENT | A::TURNING), 0);
        assert_eq!(capable(&legless, 0) | A::MOVEMENT | A::TURNING, capable(&world, 0),
                   "severing the legs moved a bit that is not about legs");

        // A severed arm loses its grip, which is what makes an occupancy bit
        // strictly stronger than a severance bit: the shield goes with the arm.
        let mut armless = world.clone();
        sever_arm(&mut armless, 0, BodyPart::LeftArm);
        assert_eq!(capable(&armless, 0), A::MOVEMENT | A::TURNING | A::RIGHT_GRIP | A::RIGHT_WEAPON);
        sever_arm(&mut armless, 0, BodyPart::RightArm);
        assert_eq!(capable(&armless, 0), A::MOVEMENT | A::TURNING);

        // Released grips, with both arms intact: the four equipment bits are
        // about what is held and the movement pair is not.
        let mut empty = world.clone();
        let mut release = empty.neutral_articulated(0);
        release.grips = [GripRequest::Release; 2];
        let _ = empty.submit_articulated_v1(EntityId::new(0, 0), release);
        empty.step();
        assert_eq!(capable(&empty, 0), A::MOVEMENT | A::TURNING);

        // The two-handed club: one item, both grips, and the weapon bit on the
        // owning arm only -- the same ownership the pose row draws.
        let both = World::new(&both_scenario(), 1);
        assert!(both.two_handed(1));
        assert_eq!(capable(&both, 1),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::RIGHT_WEAPON | A::TWO_HANDED);
        assert_eq!(capable(&both, 1) & A::LEFT_WEAPON, 0, "one club was drawn from both hands");
        // And the one published equipment fact that deliberately does *not*
        // follow that ownership rule: both hands are on the haft, so both arms
        // report the item. Asserted here because it is the only place the grip
        // view and the collider view of the same club disagree on purpose.
        let held = both.observe_articulated(EntityId::new(1, 0));
        assert_eq!([held.arms[0].equipment, held.arms[1].equipment], [Some(4), Some(4)]);

        // And a left-hand weapon, which nothing above reaches: the fighter's
        // shield and sword swapped over.
        world.grips[0].swap(0, 1);
        world.shield_pose[0] = world.derive_shield_pose(0);
        assert_eq!(capable(&world, 0),
                   A::MOVEMENT | A::TURNING | A::LEFT_GRIP | A::RIGHT_GRIP | A::LEFT_WEAPON | A::SHIELD);

        // Every bit is a distinct power of two and none above seven is ever
        // set, which is the reference's "higher bits are zero in V1".
        let bits = [A::MOVEMENT, A::TURNING, A::LEFT_GRIP, A::RIGHT_GRIP,
                    A::LEFT_WEAPON, A::RIGHT_WEAPON, A::SHIELD, A::TWO_HANDED];
        assert_eq!(bits, core::array::from_fn(|bit| 1u32 << bit));
        for world in [&world, &both, &empty, &armless, &legless] {
            for i in 0..world.alive.len() {
                assert_eq!(world.observe_articulated(world.id_of(i)).capabilities & !0xff, 0);
            }
        }
    }

    #[test]
    fn the_articulated_opponent_list_is_the_nearest_six_enemies_in_sight() {
        let mut world = World::new(&crowded_scenario(), 1);
        let hero = EntityId::new(0, 0);
        // Far-sighted, so all seven enemies are in view and the cap is the only
        // thing that can drop one.
        world.stats[0].perception = 15;
        let obs = world.observe_articulated(hero);
        assert_eq!(obs.opponent_count as usize, MAX_ARTICULATED_OPPONENTS);
        assert_eq!(
            obs.opponents().iter().map(|foe| foe.id).collect::<Vec<_>>(),
            (1..=6).map(|i| EntityId::new(i, 0)).collect::<Vec<_>>(),
            "the six nearest enemies, nearest first"
        );
        // The ally stands nearer than any of them and is not an opponent.
        assert_eq!(world.faction[8], Faction::Heroes);
        assert!(obs.opponents().iter().all(|foe| foe.id != EntityId::new(8, 0)));
        // The seventh enemy is in sight and dropped by the cap, and its row is
        // the blank value throughout rather than a half-filled one.
        assert!((world.pos[7] - world.pos[0]).length() < world.stats[0].sight_range());

        // The cap is `MAX_ARTICULATED_OPPONENTS` and *not* the per-observer
        // `tracked_contacts` the legacy list narrows to. A dim eye holds fewer
        // legacy contacts and the same six articulated rows: the articulated
        // block's width is a fixed wasm stride, so a dim character's rows are
        // blurred rather than fewer.
        world.stats[0].perception = 3;
        assert_eq!(world.stats[0].tracked_contacts(), 3);
        let dim = world.observe(hero);
        assert_eq!(dim.enemies().len(), 3, "the legacy list stopped narrowing");
        assert_eq!(dim.articulated.opponent_count, 5,
                   "five enemies inside a 7.8 unit sight range");
        for slot in dim.articulated.opponent_count as usize..MAX_ARTICULATED_OPPONENTS {
            assert_eq!(dim.articulated.opponents[slot], ObservedOpponent::BLANK,
                       "an unused row carried something");
        }
    }

    #[test]
    fn rock_stops_the_articulated_eye_too() {
        // `a_foe_behind_one_tile_of_rock_is_not_a_contact`, asked of the
        // articulated list, because the two selections must use one predicate
        // and not two that agree today.
        //           0123456789
        let rows = ["##########",
                    "#..#.....#",
                    "#........#",
                    "##########"];
        let mut scenario = fragile_scenario(&[]);
        scenario.dungeon = crate::dungeon::parse(&rows);
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), Fx::from_ratio(15, 10));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(475, 100), Fx::from_ratio(15, 10));
        let blocked = World::new(&scenario, 1);
        assert_eq!(blocked.observe_articulated(EntityId::new(0, 0)).opponent_count, 0,
                   "an enemy behind a pillar entered the articulated list");

        // The control, on the same span of floor with the pillar removed: a
        // fixture that could not see the brute anyway proves nothing.
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), Fx::from_ratio(25, 10));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(475, 100), Fx::from_ratio(25, 10));
        let open = World::new(&scenario, 1);
        assert_eq!(open.observe_articulated(EntityId::new(0, 0)).opponent_count, 1);
    }

    #[test]
    fn poor_perception_blurs_motion_without_inventing_severance() {
        // The brute is the subject: the fighter it is looking at carries both a
        // shield and a sword, so the categorical half of this test has
        // something to be wrong about.
        let mut sharp = eyed_world(1, 15);
        // An eighth of a unit apart and closing at a quarter per tick, which
        // puts `contact_timing` at exactly a half -- inside the interval where
        // it carries information. At the fixture's own spacing the formula
        // saturates at one, and a saturated column cannot show that it was
        // blurred.
        sharp.pos[0] = sharp.pos[1] + Vec2::new(Fx::from_ratio(-1, 8), Fx::ZERO);
        // Real motion to misjudge, written onto the column the observation
        // reads rather than coaxed out of a command.
        sharp.vel[0] = Vec2::new(Fx::from_ratio(1, 4), Fx::ZERO);
        let mut dim = sharp.clone();
        dim.stats[1].perception = 0;
        assert_eq!(sharp.stats[1].perception_noise(), Fx::ZERO, "the sharp eye is not exact");
        assert!(dim.stats[1].perception_noise() > Fx::ONE, "the dim eye is not blurred");

        let brute = EntityId::new(1, 0);
        let clean = sharp.observe_articulated(brute);
        let blurred = dim.observe_articulated(brute);
        let (clean, blurred) = (clean.opponents[0], blurred.opponents[0]);

        // The sharp eye is ground truth, which is what makes every difference
        // below attributable to the noise and nothing else.
        assert_eq!(clean.body_position, Vec3::new(sharp.pos[0].x, sharp.pos[0].y, Fx::ZERO));
        assert_eq!(clean.body_velocity, Vec3::new(sharp.vel[0].x, sharp.vel[0].y, Fx::ZERO));
        assert_eq!(clean.contact_timing, Fx::HALF, "the fixture is not inside the timing interval");

        // Measured: moved, in all three components of both vectors. Z has no
        // degree of freedom in the model and is blurred anyway, because the
        // draw order is an ABI and does not get to depend on which axes the
        // physics currently uses.
        for (name, a, b) in [
            ("position x", clean.body_position.x, blurred.body_position.x),
            ("position y", clean.body_position.y, blurred.body_position.y),
            ("position z", clean.body_position.z, blurred.body_position.z),
            ("velocity x", clean.body_velocity.x, blurred.body_velocity.x),
            ("velocity y", clean.body_velocity.y, blurred.body_velocity.y),
            ("velocity z", clean.body_velocity.z, blurred.body_velocity.z),
        ] {
            assert_ne!(a, b, "{name} arrived unblurred");
        }
        assert_ne!(clean.contact_timing, blurred.contact_timing, "timing arrived unblurred");

        // The three scales, over sixty-four seeds rather than over one draw. A
        // single sample cannot tell a quarter-sized error from a small draw of
        // a full-sized one, and asserting it on one world is how a scale
        // regression survives a year.
        //
        // The fixture is the *unmoved* one on purpose. Timing is computed from
        // the measured columns rather than from ground truth -- deliberately,
        // so a policy recomputing it from the published numbers gets the
        // published answer -- which means at a range where the formula is live,
        // the timing error is the position and velocity error propagated
        // through it and is bounded by nothing in particular. Two bodies a
        // stride and a half apart and standing still saturate it at one in both
        // worlds, so what is left of the difference is the timing draw alone.
        let noise = dim.stats[1].perception_noise();
        let moved = |a: Fx, b: Fx| (a - b).abs();
        let (mut worst_position, mut worst_velocity, mut worst_timing) =
            (Fx::ZERO, Fx::ZERO, Fx::ZERO);
        for seed in 1..=64u64 {
            let mut sharp = eyed_world(1, 15);
            sharp.seed = seed;
            let mut dim = sharp.clone();
            dim.stats[1].perception = 0;
            let clean = sharp.observe_articulated(brute).opponents[0];
            let blurred = dim.observe_articulated(brute).opponents[0];
            assert_eq!(clean.contact_timing, Fx::ONE, "the saturated fixture is not saturated");
            for (a, b) in [
                (clean.body_position.x, blurred.body_position.x),
                (clean.body_position.y, blurred.body_position.y),
                (clean.body_position.z, blurred.body_position.z),
            ] {
                worst_position = worst_position.max(moved(a, b));
            }
            for (a, b) in [
                (clean.body_velocity.x, blurred.body_velocity.x),
                (clean.body_velocity.y, blurred.body_velocity.y),
                (clean.body_velocity.z, blurred.body_velocity.z),
            ] {
                worst_velocity = worst_velocity.max(moved(a, b));
            }
            worst_timing = worst_timing.max(moved(clean.contact_timing, blurred.contact_timing));
        }
        // Bounded by the documented scale, and close enough to it that a
        // quarter mistaken for a whole would show. `Fx::EPSILON` of slack for
        // the truncation in one fixed-point multiply.
        for (name, worst, bound) in [
            ("position", worst_position, noise),
            ("velocity", worst_velocity, noise / 4),
            ("timing", worst_timing, noise / 8),
        ] {
            assert!(worst <= bound + Fx::EPSILON, "{name} error {worst} exceeded {bound}");
            assert!(worst * 4 > bound * 3, "{name} error never approached {bound}: {worst}");
        }

        // Categorical: identical, and not merely close.
        assert_eq!(clean.id, blurred.id);
        assert_eq!(clean.severed_mask, blurred.severed_mask);
        assert_eq!(clean.severed_mask, 0, "the fixture has nothing severed to preserve");
        assert_eq!(clean.weapons.map(|w| w.is_some()), blurred.weapons.map(|w| w.is_some()));
        assert_eq!(clean.weapons.map(|w| w.is_some()), [false, true]);
        assert_eq!(clean.shield.present, blurred.shield.present);
        assert!(clean.shield.present, "the fixture has no shield to preserve");
        assert_eq!(clean.body_yaw, blurred.body_yaw);
        assert_eq!(
            clean.regions.map(|region| (region.present, region.radius)),
            blurred.regions.map(|region| (region.present, region.radius)),
            "a blurred body changed shape",
        );
        assert_eq!((clean.shield.half_width, clean.shield.half_height),
                   (blurred.shield.half_width, blurred.shield.half_height));

        // And the subject's own half of the observation, which is exact whatever
        // the eye is: proprioception is free.
        let clean = sharp.observe_articulated(brute);
        let blurred = dim.observe_articulated(brute);
        assert_eq!(clean.capabilities, blurred.capabilities);
        assert_eq!(clean.arms, blurred.arms);
        assert_eq!(clean.body_position, blurred.body_position);
        assert_eq!(clean.body_velocity, blurred.body_velocity);
        assert_eq!(clean.severed_mask, blurred.severed_mask);
        assert_eq!(clean.integrity_fraction, blurred.integrity_fraction);
    }

    #[test]
    fn opponent_geometry_translates_rigidly_rather_than_shearing() {
        let sharp = eyed_world(1, 15);
        let mut dim = sharp.clone();
        dim.stats[1].perception = 0;
        let brute = EntityId::new(1, 0);
        let clean = sharp.observe_articulated(brute).opponents[0];
        let blurred = dim.observe_articulated(brute).opponents[0];

        let delta = blurred.body_position - clean.body_position;
        assert_ne!(delta, Vec3::ZERO, "the dim eye measured the body exactly");
        // Every point of the body moves by the *same* displacement. A per-point
        // draw would put an arm three feet from its own shoulder, which is not
        // what bad eyesight does to a silhouette.
        for part in 0..BodyPart::COUNT {
            let (a, b) = (clean.regions[part], blurred.regions[part]);
            assert_eq!(b.lower - a.lower, delta, "region {part} lower sheared");
            assert_eq!(b.upper - a.upper, delta, "region {part} upper sheared");
            assert_eq!((a.radius, a.present), (b.radius, b.present));
        }
        let sword = (clean.weapons[1].expect("a sword"), blurred.weapons[1].expect("a sword"));
        assert_eq!(sword.1.hilt - sword.0.hilt, delta, "the hilt sheared off the hand");
        assert_eq!(sword.1.tip - sword.0.tip, delta, "the blade changed length");
        assert_eq!(sword.0.radius, sword.1.radius);
        assert_eq!(blurred.shield.centre - clean.shield.centre, delta);
        assert_eq!(blurred.shield.normal, clean.shield.normal);

        // The rigidity is a claim about the *shape*, so check one internal
        // distance survives it outright rather than only the endpoints.
        let reach = |foe: &ObservedOpponent| foe.weapons[1].unwrap().tip - foe.regions[BodyPart::Head as usize].lower;
        assert_eq!(reach(&clean), reach(&blurred), "head to blade tip changed under noise");
    }

    #[test]
    fn the_noise_stream_draws_seven_per_row_whatever_geometry_is_absent() {
        // Two worlds identical except for what the *nearest* opponent is
        // holding. If the draw count depended on the geometry present, the row
        // behind it would land somewhere else -- so what one fighter perceives
        // would depend on what somebody else is carrying.
        let mut world = World::new(&crowded_scenario(), 1);
        world.stats[0].perception = 0;
        let mut disarmed = world.clone();
        disarmed.grips[1] = [GripState { equipment_slot: None }; 2];
        disarmed.shield_pose[1] = None;

        let hero = EntityId::new(0, 0);
        let armed = world.observe_articulated(hero);
        let bare = disarmed.observe_articulated(hero);
        assert_eq!(armed.opponent_count, bare.opponent_count);
        assert!(armed.opponent_count >= 2, "one row proves nothing about the row after it");

        // The control: the fixture really did remove geometry from row zero.
        assert_ne!(armed.opponents[0].weapons, bare.opponents[0].weapons);
        assert_ne!(armed.opponents[0].shield.present, bare.opponents[0].shield.present);
        assert_eq!(armed.opponents[0].body_position, bare.opponents[0].body_position,
                   "the row whose geometry changed also moved");

        // And every row after it is untouched, which is the seven-draw promise.
        for slot in 1..armed.opponent_count as usize {
            assert_eq!(armed.opponents[slot], bare.opponents[slot],
                       "row {slot} shifted when row zero lost its equipment");
        }
    }

    #[test]
    fn the_seven_perception_draws_are_the_documented_stream_in_order() {
        // **Nothing else pins the stream.** Its order and its scales are frozen
        // by the reference, no golden hash reaches it -- an observation is not
        // authoritative state -- and no policy consumes it yet, so a swapped
        // draw or an eighth draw would sit unnoticed until the day it froze by
        // accident. This reproduces the stream from `fx` and asserts the
        // published row against it term by term.
        let mut world = World::new(&crowded_scenario(), 1);
        world.stats[0].perception = 0;
        let subject = 0usize;
        let noise = world.stats[subject].perception_noise();
        let obs = world.observe_articulated(EntityId::new(0, 0));
        assert!(obs.opponent_count >= 2, "one row cannot show where the next row starts");

        let mut rng = Rng::from_stream(
            world.seed ^ ARTICULATED_OBSERVATION_DOMAIN,
            world.tick as u64,
            ((subject as u64) << 32) | world.generation[subject] as u64,
        );
        for slot in 0..obs.opponent_count as usize {
            let mut jitter = [Fx::ZERO; 7];
            for draw in jitter.iter_mut() {
                *draw = rng.signed_unit();
            }
            // Distinct, or a permutation of the seven would be invisible here.
            for a in 0..7 {
                for b in a + 1..7 {
                    assert_ne!(jitter[a], jitter[b], "draws {a} and {b} coincided");
                }
            }
            let row = obs.opponents[slot];
            let j = row.id.index as usize;
            assert_eq!(row.body_position, Vec3::new(
                world.pos[j].x + jitter[0] * noise,
                world.pos[j].y + jitter[1] * noise,
                jitter[2] * noise,
            ), "row {slot} position is not draws 0..3 at the full scale");
            assert_eq!(row.body_velocity, Vec3::new(
                world.vel[j].x + jitter[3] * noise / 4,
                world.vel[j].y + jitter[4] * noise / 4,
                jitter[5] * noise / 4,
            ), "row {slot} velocity is not draws 3..6 at a quarter scale");
            // Nothing is moving in the fixture, so the formula answers exactly
            // one and the whole of the difference is the seventh draw.
            assert_eq!(row.contact_timing, (Fx::ONE + jitter[6] * noise / 8).clamp(Fx::ZERO, Fx::ONE),
                       "row {slot} timing is not draw 6 at an eighth scale");
        }
    }

    #[test]
    fn the_articulated_and_legacy_perception_streams_never_share_a_draw() {
        // ASCII `ARTOBS1`, which is the whole provenance of the constant.
        assert_eq!(ARTICULATED_OBSERVATION_DOMAIN.to_be_bytes(), *b"\0ARTOBS1");

        // The two streams key on the same (tick, entity) pair by construction,
        // so without the domain a body would be handed one error twice and a
        // policy reading both blocks would see a coincidence it could learn.
        for seed in [0u64, 1, 0x9E37_79B9_7F4A_7C15, u64::MAX] {
            for tick in [0u64, 1, 600] {
                for entity in [0u64, (3 << 32) | 5, u64::MAX] {
                    let mut legacy = Rng::from_stream(seed, tick, entity);
                    let mut articulated =
                        Rng::from_stream(seed ^ ARTICULATED_OBSERVATION_DOMAIN, tick, entity);
                    let left: Vec<u32> = (0..8).map(|_| legacy.next_u32()).collect();
                    let right: Vec<u32> = (0..8).map(|_| articulated.next_u32()).collect();
                    assert_ne!(left, right, "seed {seed} tick {tick} entity {entity}");
                    assert_ne!(left[0], right[0], "the two streams opened on the same draw");
                }
            }
        }

        // And through the world, where the legacy contact and the articulated
        // row describe the same body at the same tick: two independent errors,
        // not one written twice.
        let mut world = World::new(&fragile_scenario(&[]), 1);
        world.stats[1].perception = 0;
        let obs = world.observe(EntityId::new(1, 0));
        let contact = obs.enemies()[0];
        let row = obs.articulated.opponents[0];
        assert_eq!(contact.id, row.id, "the two blocks describe different bodies");
        assert_ne!(contact.offset + world.pos[1], Vec2::new(row.body_position.x, row.body_position.y),
                   "the legacy and articulated eyes misplaced the body identically");
    }

    #[test]
    fn contact_timing_is_one_unless_something_is_closing() {
        // Written on the velocity columns rather than driven by commands, for
        // the reason `resolve_closing` gives: this is about the formula, and a
        // stat-driven charge would be testing the actuator.
        let mut world = eyed_world(0, 15);
        let hero = EntityId::new(0, 0);
        let timing = |world: &World| world.observe_articulated(hero).opponents[0].contact_timing;

        // Standing still: nothing is closing, so exactly one.
        assert_eq!(timing(&world), Fx::ONE);
        // Separating: still one, and not a large number scaled down.
        world.vel[0] = Vec2::new(Fx::from_ratio(-1, 4), Fx::ZERO);
        assert_eq!(timing(&world), Fx::ONE);
        // Closing, from a unit and a half away: six ticks of approach, and the
        // clamp reads it as one. **The column saturates outside the last
        // stride** -- it is ticks-to-arrival capped at a tick, not a countdown
        // in seconds -- and pinning that here is what stops it being read as
        // the second thing.
        world.vel[0] = Vec2::new(Fx::from_ratio(1, 4), Fx::ZERO);
        assert_eq!(timing(&world), Fx::ONE);

        // Inside the last stride, where the number is informative. Eighths and
        // quarters throughout, because a tenth is not exact in 16.16 and the
        // assertion would be about rounding rather than about the formula.
        world.pos[1] = world.pos[0] + Vec2::new(Fx::from_ratio(1, 8), Fx::ZERO);
        assert_eq!(timing(&world), Fx::HALF);
        world.vel[0] = Vec2::new(Fx::HALF, Fx::ZERO);
        assert_eq!(timing(&world), Fx::from_ratio(1, 4));

        // Coincident bodies: the delta has no direction to close along, so the
        // dot product is zero and the formula answers one rather than zero.
        // The degenerate case is worth pinning because "already here" is the
        // reading somebody will expect.
        world.pos[1] = world.pos[0];
        assert_eq!(timing(&world), Fx::ONE);
    }

    /// A stand-in for a shipped policy, small enough to live here and close
    /// enough to catch a decision-level regression.
    ///
    /// `crates/sim` cannot depend on `crates/policy` -- the dependency runs the
    /// other way -- so this is how "the same observation produces the same
    /// decision" becomes an assertion in this crate rather than only a lab
    /// hash. It reads the columns a utility policy reads: the nearest enemy,
    /// its bearing, its distance, and whether a cut could start this tick.
    fn stand_in_policy(obs: &Observation) -> Command {
        let Some(foe) = obs.nearest_enemy() else { return Command::HOLD };
        let line = foe.offset.angle();
        if foe.distance > obs.full_reach() + foe.radius {
            return Command::attacking(foe.offset.normalize(), foe.id);
        }
        let limb = if obs.can_strike() {
            LimbCommand::attack(line, Strike::Nearest)
        } else {
            LimbCommand::new(line, obs.limb.reach)
        };
        Command::swinging(Vec2::ZERO, foe.id, limb)
    }

    /// The scripted legacy run the prefix pin is taken over: every feature
    /// index `0..450` of every observation, folded in decision order, and the
    /// state hash the resulting commands produce.
    fn legacy_prefix_probe() -> (u64, u64) {
        let mut world = World::new(&Scenario::skirmish(11, 2, 3), 4);
        world.set_order(Faction::Heroes, Order::Advance(Vec2::from_ints(1, 0)));
        world.set_order(Faction::Monsters, Order::Advance(Vec2::from_ints(-1, 0)));
        let mut buffer = vec![Fx::ZERO; crate::obs::FEATURE_COUNT];
        let mut prefix = Hash64::new();
        for _ in 0..600 {
            for id in world.pending_decisions().to_vec() {
                let obs = world.observe(id);
                obs.write_features(&mut buffer);
                for value in &buffer[..crate::obs::LEGACY_FEATURE_COUNT] {
                    prefix.write_i32(value.raw());
                }
                world.submit(id, stand_in_policy(&obs));
            }
            world.step();
        }
        (prefix.finish(), world.state_hash())
    }

    #[test]
    fn legacy_feature_prefix_and_policy_decisions_are_byte_identical() {
        // **Both numbers were recorded on the tree immediately before the
        // articulated block was appended**, by running this same probe against
        // `FEATURE_COUNT == 450`, and they are the evidence that indices
        // `0..450` did not move. A version bump is allowed to add columns; it
        // is not allowed to renumber one, and nothing else in the suite would
        // notice if it did.
        //
        // The state hash is the second half of the claim. Every command in the
        // run is a pure function of the observation, so an observation that
        // changed anywhere -- including in a field the vector does not carry --
        // lands here as a different fight. `cargo run --release -p lab -- hash`
        // makes the same argument with the shipped utility policy.
        assert_eq!(legacy_prefix_probe(), (0x811f_a73c_2759_1214, 0x95b0_7997_3691_3997));
    }

    #[test]
    fn the_articulated_feature_block_stays_inside_the_vectors_range() {
        // `feature_vector_has_a_stable_width` runs on an all-Legacy fixture, so
        // it asserts the `-2..=2` invariant over 472 zeros. This is the same
        // claim where the block is actually populated, with the dimmest eye in
        // the game so the noise is at its widest and the clamps are load
        // bearing rather than decorative.
        let mut world = World::new(&crowded_scenario(), 1);
        for i in 0..world.alive.len() {
            world.stats[i].perception = 0;
        }
        let mut buffer = vec![Fx::ZERO; crate::obs::FEATURE_COUNT];
        let mut populated = 0;
        for tick in 0..40 {
            for i in 0..world.alive.len() {
                if !world.alive[i] { continue; }
                let yaw = if i == 0 { Angle::ZERO } else { Angle::HALF };
                world.submit_articulated_v1(world.id_of(i), reaching_command(yaw, Fx::ONE));
            }
            world.step();
            for i in 0..world.alive.len() {
                if !world.alive[i] { continue; }
                let obs = world.observe(world.id_of(i));
                assert_eq!(obs.write_features(&mut buffer), crate::obs::FEATURE_COUNT);
                if obs.articulated.present() {
                    populated += obs.articulated.opponent_count as usize;
                }
                for (k, v) in buffer.iter().enumerate() {
                    assert!(v.abs() <= Fx::from_int(2), "feature {k} out of range at tick {tick}: {v}");
                }
            }
        }
        assert!(populated > 200, "the fixture filled {populated} opponent rows, so it proves little");
    }

    #[test]
    fn dead_and_reused_slots_keep_contact_identity_and_hash_coverage() {
        let mut world = clinch_world();
        let dead = EntityId::new(1, 0);
        step_into_contact(&mut world);
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.key.a == dead || row.fact.key.b == dead),
            "the fixture never keyed the slot about to be reused");
        let before = world.state_digest().value;

        // The test-only despawn the contract allows: v2-15 owns the public one.
        // Written the way `World::reap_dead` writes it, generation bump
        // included -- that bump is what makes the reused slot a *different*
        // entity, and a fixture that skipped it would be proving identity
        // survives reuse by never reusing an identity.
        world.alive[1] = false;
        world.generation[1] = world.generation[1].wrapping_add(1);
        world.free.push(1);
        let reborn = world.try_spawn(&clinch_scenario().units[1]).expect("respawn");
        assert_eq!(reborn, EntityId::new(1, 1), "a reused slot kept its generation");
        assert_eq!(world.alive.len(), 2, "a reused slot allocated a column");

        step_into_contact(&mut world);
        assert!(world.contact_resolutions().iter()
            .all(|row| row.fact.key.a != dead && row.fact.key.b != dead),
            "a resolution carried the identity of the slot that died");
        assert!(world.contact_resolutions().iter()
            .any(|row| row.fact.key.a == reborn || row.fact.key.b == reborn),
            "the reborn row never entered a contact group");
        // Every retained row is this tick's: the phase clears resolutions at
        // articulated tick entry, so nothing keyed to a dead generation can
        // survive into the reused slot's ledger.
        assert!(world.contact_resolutions().iter().all(|row| row.fact.key.a.generation
            == world.generation[row.fact.key.a.index as usize]));
        assert_ne!(world.state_digest().value, before,
            "the reused slot hashed identically to the one it replaced");
    }

    /// One slot's anatomy row, written out by hand in the order the reference
    /// specifies. A hand mirror rather than a call to `hash_into`, because a
    /// mirror that reused the writer would agree with a drifted writer.
    fn anatomy_row_bytes(world: &World, i: usize) -> Vec<u8> {
        let state = world.wounds[i];
        let mut bytes = Vec::new();
        for part in state.parts {
            bytes.extend_from_slice(&part.integrity.raw().to_le_bytes());
            bytes.extend_from_slice(&part.wound.raw().to_le_bytes());
            bytes.push(part.severed as u8);
        }
        bytes.extend_from_slice(&state.blood.raw().to_le_bytes());
        bytes.extend_from_slice(&state.shock.raw().to_le_bytes());
        bytes.extend_from_slice(&state.last_attacker.index.to_le_bytes());
        bytes.extend_from_slice(&state.last_attacker.generation.to_le_bytes());
        assert_eq!(bytes.len(), crate::anatomy::ANATOMY_HASH_ROW_BYTES);
        bytes
    }

    fn anatomy_suffix_bytes(world: &World) -> Vec<u8> {
        (0..world.alive.len()).flat_map(|i| anatomy_row_bytes(world, i)).collect()
    }

    #[test]
    fn contact_cap_hashes_once_after_all_actuator_rows() {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let mut bumped = base.clone();
        bumped.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        assert_eq!(bumped.state_hash(), base.state_hash(), "cap_hits leaked into LegacyV1");
        assert_ne!(bumped.state_digest().value, base.state_digest().value);

        // Where the two suffixes sit is the part worth proving rather than
        // asserting, because the positions are what the contract froze and a
        // reader cannot see them from the digest. FNV-1a multiplies by an odd
        // prime, so every step is invertible: winding a known digest back over
        // the anatomy rows and then over four counter bytes recovers exactly
        // the state the actuator loop left behind. Anything else written after
        // that loop -- a per-slot copy of the counter, a placeholder, an
        // anatomy row on the wrong side of it -- makes the two disagree.
        let prime = 0x100_0000_01b3u64;
        let mut inverse = prime;
        for _ in 0..6 {
            inverse = inverse.wrapping_mul(2u64.wrapping_sub(prime.wrapping_mul(inverse)));
        }
        assert_eq!(prime.wrapping_mul(inverse), 1, "the prime is not invertible mod 2^64");
        let unwind = |digest: u64, cap: u32, rows: &[u8]| {
            let mut state = digest;
            for byte in rows.iter().rev().copied().chain(cap.to_le_bytes().into_iter().rev()) {
                state = state.wrapping_mul(inverse) ^ u64::from(byte);
            }
            state
        };
        let rows = anatomy_suffix_bytes(&base);
        assert_eq!(rows.len(), base.alive.len() * crate::anatomy::ANATOMY_HASH_ROW_BYTES);
        let actuator_tail = unwind(base.state_digest().value, 0, &rows);
        assert_eq!(unwind(bumped.state_digest().value, 1, &rows), actuator_tail,
                   "cap_hits and the anatomy rows are not the digest's tail");

        // And the counter is one global value rather than one per slot. A third
        // allocated row changes the actuator prefix, so the recovered state
        // must differ -- but the single four-byte unwind must still reconcile
        // the pair, which it could not if the counter were written per slot.
        let mut wider = base.clone();
        wider.try_spawn(&scenario.units[1]).expect("a third row");
        let mut wider_bumped = wider.clone();
        wider_bumped.contact.as_mut().expect("articulated contact state").state.cap_hits = 1;
        let wider_rows = anatomy_suffix_bytes(&wider);
        let wider_tail = unwind(wider.state_digest().value, 0, &wider_rows);
        assert_ne!(wider_tail, actuator_tail, "a third actuator row hashed nothing");
        assert_eq!(unwind(wider_bumped.state_digest().value, 1, &wider_rows), wider_tail,
                   "cap_hits was written once per slot");
    }

    #[test]
    fn a_refused_contact_tick_is_counted_and_never_hashed() {
        // The counter exists so that "no row ever showed energy creation" can
        // be told apart from "no row was ever published". `cap_hits` sits one
        // field away and *is* hashed, so the pairing worth pinning is that the
        // two answer differently: a capped tick truncated the physics and a
        // refused one rolled it back, and only the first is state.
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        assert_eq!(base.contact_solver_rejections(), 0);
        let mut refused = base.clone();
        refused.contact.as_mut().expect("articulated contact state").rejections = 3;
        assert_eq!(refused.contact_solver_rejections(), 3);
        assert_eq!(refused.state_hash(), base.state_hash());
        assert_eq!(refused.state_digest().value, base.state_digest().value,
                   "a diagnostic counter reached the ArticulatedV1 digest");

        // A Legacy world has no contact runtime to count with and must answer
        // zero rather than reaching into an `Option` that is not there.
        let legacy = World::new(&Scenario::duel(), 1);
        assert_eq!(legacy.contact_solver_rejections(), 0);
    }

    #[test]
    fn every_mutable_anatomy_field_changes_only_articulated_hashing() {
        let scenario = Scenario::articulated_duel();
        let base = World::new(&scenario, 1);
        let mutate: [(&str, fn(&mut World)); 6] = [
            ("integrity", |w| w.wounds[0].parts[BodyPart::Torso as usize].integrity -= Fx::from_raw(1)),
            ("wound", |w| w.wounds[0].parts[BodyPart::Legs as usize].wound += Fx::from_raw(1)),
            ("severed", |w| w.wounds[0].parts[BodyPart::LeftArm as usize].severed = true),
            ("blood", |w| w.wounds[0].blood -= Fx::from_raw(1)),
            ("shock", |w| w.wounds[0].shock += Fx::from_raw(1)),
            ("last_attacker", |w| w.wounds[0].last_attacker = EntityId::new(1, 0)),
        ];
        for (name, change) in mutate {
            let mut moved = base.clone();
            change(&mut moved);
            assert_eq!(moved.state_hash(), base.state_hash(), "{name} leaked into LegacyV1");
            assert_ne!(moved.state_digest().value, base.state_digest().value,
                       "{name} is not in the ArticulatedV1 digest");
            assert_eq!(moved.state_digest().domain, crate::HashDomain::ArticulatedV1);
        }
        // Every part is hashed, not just the ones a fixture happens to wound.
        for part in 0..BodyPart::COUNT {
            let mut moved = base.clone();
            moved.wounds[1].parts[part].wound += Fx::from_raw(1);
            assert_ne!(moved.state_digest().value, base.state_digest().value,
                       "part {part} is missing from the anatomy row");
        }
        // And a dead slot keeps hashing its final row, because a later bleed
        // credit reads `last_attacker` off it.
        let mut dead = base.clone();
        dead.alive[1] = false;
        let before = dead.state_digest().value;
        dead.wounds[1].last_attacker = EntityId::new(0, 0);
        assert_ne!(dead.state_digest().value, before, "a dead slot stopped hashing its anatomy");
    }

    #[test]
    fn legacy_health_and_regeneration_are_byte_identical() {
        // The articulated query is a second derivation, not a replacement.
        //
        // The byte-identity half of this claim is not provable here and is not
        // pretended to be: it belongs to `GOLDEN_STATE_HASH` in
        // `crates/sim/tests/determinism.rs` and to the four browser fixtures,
        // all of which are untouched by this session. What *is* proved here is
        // the thing those pins cannot localise -- that a Legacy world takes the
        // legacy arm of every new routing decision, and that the phases the
        // articulated tick does not run are still the ones the legacy tick does.
        let mut world = duel_world();
        assert_eq!(world.state_digest().domain, crate::HashDomain::LegacyV1);
        assert_eq!(world.state_digest().value, world.state_hash(),
                   "a Legacy digest stopped being its own core hash");
        world.phase_trace_enabled = true;
        world.step();
        assert!(world.phase_trace.contains(&"regenerate") && world.phase_trace.contains(&"reap"),
                "the legacy tick lost a phase the articulated tick does not run");
        assert!(!world.phase_trace.contains(&"anatomy"),
                "a Legacy world ran the anatomy phase");

        world.phase_trace_enabled = false;
        let ids: Vec<EntityId> = (0..world.alive.len()).map(|i| world.id_of(i)).collect();
        for _ in 0..120 { world.step(); }
        assert!(world.wounds.is_empty(), "a legacy world allocated anatomy rows");
        for (i, id) in ids.iter().enumerate() {
            if world.resolve(*id).is_none() { continue; }
            // Routing, not arithmetic: these hold by construction *while*
            // `anatomy_spec` answers `None`, and the assertion is there to fail
            // the day something makes it answer otherwise for a Legacy slot.
            assert_eq!(world.health_of(i), world.hp[i]);
            assert_eq!(world.max_health_of(i), world.max_hp[i]);
            assert_eq!(world.health_fraction_of(i), world.legacy_hp_frac(i));
            assert!(world.anatomy_spec(i).is_none());
        }
        // Regeneration still runs, still off `regen_left`, and still only in
        // the legacy arm of the tick.
        let mut hurt = duel_world();
        let id = hurt.id_of(0);
        hurt.hp[0] = Fx::ONE;
        hurt.last_combat[0] = 0;
        for _ in 0..(crate::rules::REGEN_DELAY + 60) { hurt.step(); }
        let i = hurt.resolve(id).expect("the hero survived a duel it is not in");
        assert!(hurt.hp[i] > Fx::ONE, "legacy regeneration stopped happening");
        assert!(hurt.regen_left[i] < hurt.max_hp[i] * crate::rules::REGEN_BUDGET);
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
    fn every_articulated_command_field_changes_only_the_articulated_hash_domain() {
        let digest = |command: ArticulatedCommandV1| {
            let scenario = Scenario::articulated_duel();
            let mut world = World::new(&scenario, 1);
            assert!(matches!(
                world.submit_articulated_v1(EntityId::new(0, 0), command),
                SubmitArticulatedOutcome::Stored { rejection: None, .. }
            ));
            (world.state_hash(), world.state_digest().value)
        };
        let base = articulated_command();
        let (legacy_core, base_digest) = digest(base);
        let mut variants = Vec::new();
        let mut changed = base; changed.move_dir.x = Fx::from_raw(1); variants.push(changed);
        let mut changed = base; changed.move_dir.y = Fx::from_raw(1); variants.push(changed);
        let mut changed = base; changed.body_yaw = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.intent = Intent::Attack(EntityId::new(1, 0)); variants.push(changed);
        let mut changed = base; changed.arms[0].bearing = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.arms[0].height = crate::CombatHeight::LOW; variants.push(changed);
        let mut changed = base; changed.arms[0].reach = Fx::HALF; variants.push(changed);
        let mut changed = base; changed.arms[0].effort = Fx::ONE; variants.push(changed);
        let mut changed = base; changed.arms[1].bearing = Angle::HALF; variants.push(changed);
        let mut changed = base; changed.arms[1].height = crate::CombatHeight::HIGH; variants.push(changed);
        let mut changed = base; changed.arms[1].reach = Fx::HALF; variants.push(changed);
        let mut changed = base; changed.arms[1].effort = Fx::ONE; variants.push(changed);
        let mut changed = base; changed.grips[0] = GripRequest::EquipSlot(1); variants.push(changed);
        let mut changed = base; changed.grips[1] = GripRequest::Release; variants.push(changed);
        for changed in variants {
            let (changed_core, changed_digest) = digest(changed);
            assert_eq!(changed_core, legacy_core, "new command payload leaked into legacy core");
            assert_ne!(changed_digest, base_digest, "an articulated command field was omitted");
        }

        let mut attack = base;
        attack.intent = Intent::Attack(EntityId::new(7, 11));
        let (attack_core, attack_digest) = digest(attack);
        assert_eq!(attack_core, legacy_core);
        assert_ne!(attack_digest, base_digest, "intent tag was omitted");
        let mut changed = attack;
        changed.intent = Intent::Attack(EntityId::new(8, 11));
        let (core, value) = digest(changed);
        assert_eq!(core, legacy_core);
        assert_ne!(value, attack_digest, "intent target index was omitted");
        let mut changed = attack;
        changed.intent = Intent::Attack(EntityId::new(7, 12));
        let (core, value) = digest(changed);
        assert_eq!(core, legacy_core);
        assert_ne!(value, attack_digest, "intent target generation was omitted");

        let mut left_slot_one = base;
        left_slot_one.grips[0] = GripRequest::EquipSlot(1);
        let (_, left_one_digest) = digest(left_slot_one);
        assert_ne!(left_one_digest, base_digest, "left grip tag was omitted");

        let mut right_slot_zero = base;
        right_slot_zero.grips[1] = GripRequest::EquipSlot(0);
        let (_, right_zero_digest) = digest(right_slot_zero);
        assert_ne!(right_zero_digest, base_digest, "right grip tag was omitted");
    }

    #[test]
    fn each_equip_slot_payload_byte_reaches_the_articulated_hash_independently() {
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let legacy_core = world.state_hash();
        let mut command = articulated_command();

        command.grips[0] = GripRequest::EquipSlot(0);
        world.articulated_command[0] = Some(command);
        let left_zero = world.state_digest().value;
        command.grips[0] = GripRequest::EquipSlot(1);
        world.articulated_command[0] = Some(command);
        let left_one = world.state_digest().value;
        assert_ne!(left_zero, left_one, "left EquipSlot payload was omitted");

        command = articulated_command();
        command.grips[1] = GripRequest::EquipSlot(0);
        world.articulated_command[0] = Some(command);
        let right_zero = world.state_digest().value;
        command.grips[1] = GripRequest::EquipSlot(1);
        world.articulated_command[0] = Some(command);
        let right_one = world.state_digest().value;
        assert_ne!(right_zero, right_one, "right EquipSlot payload was omitted");
        assert_ne!(left_zero, right_zero, "left and right grip columns collided");
        assert_eq!(world.state_hash(), legacy_core);
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
    fn immutable_spec_binding_and_resolved_columns_reach_only_the_articulated_digest() {
        let base_scenario = Scenario::articulated_duel();
        let base = World::new(&base_scenario, 1);
        let legacy_core = base.state_hash();
        let digest = base.state_digest().value;

        let mut changed = base_scenario.clone();
        changed.combat_specs.as_mut().unwrap().equipment[0].mass += Fx::from_raw(1);
        let changed_world = World::new(&changed, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest);

        let mut changed = base_scenario.clone();
        changed.units[0].articulated.as_mut().unwrap().anatomy = 2;
        let changed_world = World::new(&changed, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest);

        let mut changed_world = base.clone();
        changed_world.articulated_carried[0].swap(0, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest, "carrying-slot order was omitted");
        let mut changed_world = base.clone();
        changed_world.articulated_equipment[0].swap(0, 1);
        assert_eq!(changed_world.state_hash(), legacy_core);
        assert_ne!(changed_world.state_digest().value, digest, "resolved arm order was omitted");
    }

    #[test]
    fn swapped_carrying_slots_cannot_collide_when_the_actions_and_resolved_arms_match() {
        let mut scenario = Scenario::articulated_duel();
        scenario.combat_specs.as_mut().unwrap().equipment[1].action = ActionKind::Sword;
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Sword);
        let mut first = World::new(&scenario, 1);
        let mut second = first.clone();
        let common = UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Loadout::pair(ActionKind::Sword, ActionKind::Sword),
            articulated: Some(ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] }),
            spawn: Vec2::from_ints(12, 8),
        };
        first.spawn(&common);
        let mut swapped = common;
        swapped.articulated.as_mut().unwrap().equipment.swap(0, 1);
        second.spawn(&swapped);
        assert_eq!(first.state_hash(), second.state_hash());
        assert_eq!(first.articulated_equipment[2], second.articulated_equipment[2]);
        assert_ne!(first.state_digest().value, second.state_digest().value);
    }

    #[test]
    fn everyone_wants_to_decide_on_tick_zero() {
        let w = duel_world();
        assert_eq!(w.pending_decisions().len(), 2);
        assert_eq!(w.tick(), 0);
        assert_eq!(w.outcome(), None);
    }

    #[test]
    fn decision_cadence_follows_intellect() {
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero_period = Stats::decision_period(w.view(hero).unwrap().stats) as u32;
        let brute_period = Stats::decision_period(w.view(brute).unwrap().stats) as u32;
        assert!(
            hero_period < brute_period,
            "the fighter should out-think the brute"
        );

        w.submit(hero, Command::HOLD);
        w.submit(brute, Command::HOLD);

        let mut hero_decisions = 0;
        let mut brute_decisions = 0;
        for _ in 0..600 {
            for id in w.pending_decisions().to_vec() {
                if id == hero {
                    hero_decisions += 1;
                } else {
                    brute_decisions += 1;
                }
                w.submit(id, Command::HOLD);
            }
            w.step();
        }
        assert!(
            hero_decisions > brute_decisions,
            "hero {hero_decisions} vs brute {brute_decisions}"
        );
    }

    #[test]
    fn an_unanswered_decision_does_not_spin() {
        let mut w = duel_world();
        let before = w.pending_decisions().len();
        assert!(before > 0);
        w.step(); // submit nothing at all
        assert!(
            w.pending_decisions().is_empty(),
            "entities were re-offered a decision immediately"
        );
    }

    /// Keeps one entity's sword cutting through `bearing`, forever.
    ///
    /// **Every test below that wants a blow to land goes through this**, and the
    /// four-line match is the whole contract a policy has to satisfy. It is
    /// worth reading once, because three of the four arms are mistakes waiting
    /// to happen:
    ///
    /// * Asking to attack while the hand is at guard *and armed* starts a cut.
    /// * Asking to attack during a windup or a cut **must continue** -- letting
    ///   the command lapse there cancels the windup, which is the feint, and a
    ///   test that does it by accident simply never hits anything.
    /// * Asking to attack during a recovery leaves the hand disarmed when the
    ///   recovery ends, so it throws one cut and then stands there forever.
    ///   Releasing is what re-arms it.
    fn cutting(w: &World, id: EntityId, bearing: Angle, side: Strike) -> LimbCommand {
        let sword = w.view(id).unwrap().limb;
        match sword.swing {
            Swing::Guard if sword.armed => LimbCommand::attack(bearing, side),
            Swing::Windup | Swing::Strike => LimbCommand::attack(bearing, side),
            _ => LimbCommand::new(bearing, Fx::ZERO),
        }
    }

    /// A minimum viable swordsman: hold the preferred range and keep cutting.
    fn duellist(w: &World, obs: &Observation, target: EntityId) -> Command {
        let enemy = match obs.enemies().first() {
            Some(c) => *c,
            // Nothing in sight: walk to the middle of the room and look again.
            // The duel scenario spawns the pair 12 units apart and nobody sees
            // further than 9.6, so without this they stand still forever.
            None => return Command::moving((Vec2::from_ints(12, 8) - obs.position).normalize()),
        };
        let bearing = enemy.offset.angle();
        // Stand inside the tip band rather than at the very edge of reach: at
        // maximum extension only a blade pointed almost exactly at the target
        // touches it at all.
        let ideal = obs.radius + obs.action_length * Fx::from_ratio(6, 10) + enemy.radius;
        let approach = if enemy.distance > ideal {
            enemy.offset.normalize()
        } else {
            Vec2::ZERO
        };
        Command::swinging(
            approach,
            target,
            cutting(w, obs.me, bearing, Strike::Nearest),

        )
    }

    /// Runs a duel to a conclusion with both sides attacking.
    fn fight(w: &mut World, ticks: u32) -> Option<Outcome> {
        let hero = w.alive_ids(Faction::Heroes)[0];
        let monster = w.alive_ids(Faction::Monsters)[0];
        for _ in 0..ticks {
            for id in w.pending_decisions().to_vec() {
                let target = if id == hero { monster } else { hero };
                let obs = w.observe(id);
                let command = duellist(w, &obs, target);
                w.submit(id, command);
            }
            w.step();
            if let Some(o) = w.outcome() {
                return Some(o);
            }
        }
        None
    }

    #[test]
    fn units_close_and_kill_each_other() {
        let mut w = duel_world();
        assert!(
            fight(&mut w, 60 * 180).is_some(),
            "the duel never resolved -- two swordsmen attacking each other \
             for three minutes should produce a body"
        );
    }

    #[test]
    fn a_blade_that_is_not_striking_is_furniture() {
        // The property the whole redesign was for, stated as bluntly as it can
        // be. Two Warriors nose to nose, both sweeping their blades through
        // each other as hard as the torque cap allows and never once asking to
        // attack. Under the old model this was the dominant strategy in the
        // game. It now does nothing at all.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let mut spun = Fx::ZERO;
        for tick in 0..900u32 {
            // A bearing that sweeps right round, twice a second: the fastest
            // windmill the old interface could express.
            let bearing = Angle::from_raw((tick.wrapping_mul(2184) & 0xFFFF) as u16);
            let whirl = LimbCommand::new(bearing, Fx::ONE);
            w.submit(a, Command::swinging(Vec2::ZERO, b, whirl));
            w.submit(b, Command::swinging(Vec2::ZERO, a, whirl));
            w.step();
            spun = spun.max(w.limb[a.index as usize].spin.abs());
        }
        assert!(
            spun > Fx::from_int(500),
            "the blades never got moving, so this proves nothing: {spun}"
        );
        assert_eq!(
            w.damage_dealt(Faction::Heroes),
            Fx::ZERO,
            "a windmill still draws blood"
        );
        assert_eq!(w.damage_dealt(Faction::Monsters), Fx::ZERO);
    }

    #[test]
    fn an_attack_can_be_answered_because_it_arrives_late() {
        // The dodge window, measured rather than asserted. Between the tick a
        // Brute commits and the tick its blade goes live there is a stretch of
        // real time, and it has to be long enough for a Fighter to notice on one
        // decision and act on the next.
        // Close enough that the hero can see the Brute at all: a Fighter sees
        // 9.6 units and the duel scenario spawns the pair twelve apart.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(9, 8);
        let mut w = World::new(&scenario, 1);
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let period = w.view(hero).unwrap().stats.decision_period() as u32;

        let mut announced = None;
        let mut live = None;
        for tick in 0..200u32 {
            let cmd = LimbCommand::attack(Angle::HALF, Strike::Widdershins);
            w.submit(brute, Command::swinging(Vec2::ZERO, hero, cmd));
            w.submit(hero, Command::HOLD);
            w.step();
            let swing = w.limb[brute.index as usize].swing;
            if swing == Swing::Windup && announced.is_none() {
                announced = Some(tick);
                // And the hero can see it. This is not the same claim: the
                // phase reaching the observation is what makes the window
                // usable rather than merely present.
                let seen = w.observe(hero);
                assert_eq!(
                    seen.enemies()[0].limb_swing,
                    Swing::Windup,
                    "the telegraph never reached the defender's observation"
                );
            }
            if swing == Swing::Strike && live.is_none() {
                live = Some(tick);
                break;
            }
        }
        let warning = live.expect("the cut never went live") - announced.expect("never announced");
        assert!(
            warning > period * 2,
            "a Brute gave {warning} ticks of warning to a Fighter that thinks \
             every {period} -- not enough to read and answer"
        );
    }

    #[test]
    fn friendly_fire_is_impossible() {
        // Both units placed a single unit apart, well inside a Fighter's reach,
        // and both windmilling their blades straight through each other. The
        // old version of this test submitted `Command::attacking` with tucked
        // hands, which under geometric damage passes while proving nothing:
        // no blade ever left its scabbard.
        let script = |allied: bool| -> (usize, Fx, Fx) {
            let mut scenario = Scenario::duel();
            if allied {
                scenario.units[1].faction = Faction::Heroes;
            }
            scenario.units[1].spawn = Vec2::from_ints(7, 8);
            let mut w = World::new(&scenario, 1);
            let a = w.alive_ids(Faction::Heroes)[0];
            let b = if allied {
                w.alive_ids(Faction::Heroes)[1]
            } else {
                w.alive_ids(Faction::Monsters)[0]
            };
            for _ in 0..900u32 {
                // Stop the moment somebody falls over. The hostile control
                // script draws real blood now, and `cutting` reads a live view.
                if w.outcome().is_some() {
                    break;
                }
                let cut_a = cutting(&w, a, Angle::ZERO, Strike::Nearest);
                let cut_b = cutting(&w, b, Angle::HALF, Strike::Nearest);
                w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
                w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
                w.step();
            }
            (
                w.alive.iter().filter(|&&a| a).count(),
                w.damage_dealt(Faction::Heroes),
                w.health_fraction(Faction::Heroes),
            )
        };

        // The control: the identical script across factions draws blood. Without
        // this the assertion below could pass because the geometry never
        // connected rather than because the faction check held.
        let (_, hostile_damage, _) = script(false);
        assert!(
            hostile_damage.is_positive(),
            "the script never landed a blow, so it cannot show anything about \
             friendly fire"
        );

        let (alive, damage, health) = script(true);
        assert_eq!(alive, 2, "an ally was killed");
        assert_eq!(damage, Fx::ZERO, "an ally was wounded");
        assert_eq!(health, Fx::ONE);
    }

    #[test]
    fn a_resting_blade_does_no_damage() {
        // Extended, in contact, and stationary. The whole difference between
        // this model and the old one: standing next to someone with a sword out
        // is not an attack.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let held = Command::swinging(
            Vec2::ZERO,
            b,
            LimbCommand::new(Angle::ZERO, Fx::ONE),

        );
        for _ in 0..300 {
            w.submit(a, held);
            w.submit(b, Command::HOLD);
            w.step();
        }
        // The blade is genuinely inside the target, not merely short of it.
        let view = w.view(b).unwrap();
        let reach = w.view(a).unwrap().position.x + Fx::from_ratio(45, 100) + Fx::from_ratio(95, 100);
        assert!(
            reach > view.position.x - view.radius,
            "the blade never reached the body, so this proves nothing"
        );
        assert_eq!(w.damage_dealt(Faction::Heroes), Fx::ZERO);
        assert_eq!(w.health_fraction(Faction::Monsters), Fx::ONE);
    }

    #[test]
    fn a_shove_alone_cannot_land_a_blow() {
        // Separation moves bodies, and that movement feeds impact speed. What
        // stops a crowd from mincing itself is the `Swing::Strike` gate: a
        // carried blade is not a weapon because it is not attacking.
        //
        // Worth stating because the obvious guard is *not* the one holding.
        // `rules::ENERGY_FLOOR` would not do it alone -- a Brute's axe carried
        // at a Brute's walking pace is worth 0.0023 against a floor of 0.0022,
        // and would bill a scratch every tick it touched anyone. Weight is
        // exactly what makes the energy law unable to defend this on its own.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = scenario.units[0].spawn;
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];
        for _ in 0..240 {
            // Blades out, hands still: only the shove is moving anything.
            w.submit(
                a,
                Command::swinging(Vec2::ZERO, b, LimbCommand::new(Angle::ZERO, Fx::ONE)),
            );
            w.submit(
                b,
                Command::swinging(Vec2::ZERO, a, LimbCommand::new(Angle::HALF, Fx::ONE)),
            );
            w.step();
        }
        assert_eq!(w.health_fraction(Faction::Heroes), Fx::ONE);
        assert_eq!(w.health_fraction(Faction::Monsters), Fx::ONE);
    }

    #[test]
    fn a_swing_through_a_body_lands_once() {
        // A blade crossing a body occupies it for several ticks. Without ending
        // the cut the moment it lands, it would bill damage on every one of
        // them, and a single swing would delete anything it touched.
        //
        // 1.6 units apart and deliberately not touching: a Fighter with its
        // chest against a Brute meets that body at an arm of 0.45, which is
        // inside its own dead zone and does nothing at all. That is the damage
        // model working exactly as intended, and it makes for a test that
        // measures the wrong thing.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(76, 10), Fx::from_int(8));
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Exactly one cut, start to finish. Holding the command down throws a
        // single attack, so the loop only has to run until the hand is back at
        // guard to have covered the whole of it.
        let mut blows = 0;
        let mut started = false;
        for _ in 0..300u32 {
            let sword = w.view(a).unwrap().limb;
            if started && sword.swing == Swing::Guard {
                break;
            }
            started |= sword.swing.is_attacking();
            let cmd = LimbCommand::attack(Angle::ZERO, Strike::Widdershins);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cmd));
            w.submit(b, Command::HOLD);
            for event in w.step() {
                if let Event::Damage { source, .. } = event {
                    if *source == a {
                        blows += 1;
                    }
                }
            }
        }
        assert!(started, "the attack never began");
        assert!(blows > 0, "the sweep never connected");
        assert_eq!(blows, 1, "one sweep billed {blows} separate blows");
    }

    #[test]
    fn a_shield_covers_a_direction_and_only_that_direction() {
        // Identical swing, identical geometry, one variable: where the guard
        // points.
        //
        // Note which direction wins, because it is not the obvious one. The
        // attacker stands to the *west*, but a blade sweeping in at an angle
        // first touches the body well round to the north -- an overhead swing
        // lands on top of you, not on the side facing the swordsman. Pointing a
        // shield at the enemy is therefore not the same as pointing it at the
        // blow, which is exactly the read a good policy has to make.
        let landed = |shield: Option<Angle>| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[1].set_body(Body::Fighter);
            scenario.units[1].stats = Body::Fighter.base_stats();
            // **Holding a guard, and only a guard.** Handing the defender its
            // default Sword instead measures something else entirely: a
            // chambered blade is still a segment, so it parries, and at the
            // right bearing it takes the incoming cut to zero. That is a real
            // mechanic and it is not this one.
            scenario.units[1].loadout = Loadout::single(ActionKind::Shield);
            scenario.units[1].spawn = Vec2::from_ints(7, 8);
            let mut w = World::new(&scenario, 1);
            let a = w.alive_ids(Faction::Heroes)[0];
            let b = w.alive_ids(Faction::Monsters)[0];
            let guard = match shield {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => LimbCommand::TUCKED,
            };
            // One named side, every cut. `Strike::Nearest` alternates as the
            // blade ends up on one side and then the other, which lands blows
            // on both flanks and turns a single-variable test into a test of
            // whether one guard can cover two lines. It cannot, and that is not
            // what is being asked here.
            for _ in 0..900u32 {
                let cut = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
                w.submit(a, Command::swinging(Vec2::ZERO, b, cut));
                w.submit(b, Command::swinging(Vec2::ZERO, a, guard));
                w.step();
            }
            w.damage_dealt(Faction::Heroes)
        };

        let unguarded = landed(None);
        assert!(unguarded.is_positive(), "the swing never connected");

        // Sweep the guard around and find the best and worst bearings.
        let mut best = Fx::MAX;
        let mut worst = Fx::ZERO;
        for step in 0..16 {
            let taken = landed(Some(Angle::from_raw((step * 4096) as u16)));
            best = best.min(taken);
            worst = worst.max(taken);
        }

        assert!(
            best < unguarded * Fx::HALF,
            "the best guard took {best} against {unguarded} unguarded -- \
             the shield is not covering anything"
        );
        assert!(
            best.is_positive(),
            "a shield stopped the blow completely; it is meant to leak so that \
             turtling is a discount and never an off switch"
        );
        assert!(
            worst > best * Fx::TWO,
            "guard direction barely mattered: {best} best vs {worst} worst"
        );
    }

    #[test]
    fn where_on_the_blade_you_are_struck_decides_what_it_costs() {
        // The emergent property the whole design rests on, measured end to end:
        // one Brute blow costs several times as much at the tip of its arc as
        // it does close to the hilt. Nothing encodes this -- it falls out of a
        // blade's speed rising with distance from the shoulder, and it is what
        // gives a light fighter something to do about a heavy one.
        //
        // Measured per *blow*, deliberately. Total damage over a fixed window
        // says the opposite, and the reason is worth knowing: the angular
        // window in which a blade reaches a body at the tip of its arc is a few
        // degrees wide, while close in it is tens of degrees, so a distant
        // target is hit rarely and hard and a near one often and weakly. Both
        // effects are real and they pull against each other -- which is what
        // makes choosing a range a decision rather than a lookup.
        // Both feet still and the Brute's blade swept about an exact bearing
        // rather than a perceived one. This is a test of the geometry, so its
        // aim must not be at the mercy of a Brute's eyesight.
        //
        // **The first blow, not the worst of many**, and the change is forced:
        // a blow moves a body now, so the gap this function is named after only
        // exists until one lands. Sampling 1800 ticks used to average an arc and
        // now averages a *retreat* -- the near sample drifts out of the crowd it
        // was placed in and starts reporting the very tip band the far sample is
        // there to measure, which flattened the measured ratio from 3.4 to 1.9
        // without a thing changing about where a blade is dangerous.
        let taken_at = |gap: i32| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn =
                Vec2::new(Fx::from_int(18) - Fx::from_ratio(gap, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            for _ in 0..1800u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(hero, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { amount, .. } = event {
                        return *amount;
                    }
                }
            }
            Fx::ZERO
        };

        // 2.5 units apart puts a Fighter's body in the Brute's tip band
        // (0.70 + 1.45 + 0.45 = 2.60); 1.3 is just outside the lee its blade
        // cannot reach into at all (0.845 + 0.45 = 1.295).
        //
        // The near distance used to be 1.6 and had to come in, which is worth
        // recording because it is a symptom of a real fix rather than of a
        // slipping test. A Brute's cut could not finish its arc inside the old
        // flat `STRIKE_TIMEOUT` -- it was cut off eight degrees short of its own
        // line, every time, mid-acceleration -- so the only blows it ever landed
        // were the ones it met early on the approach, and the gradient this test
        // measures was steepened by an accident of which part of the swing was
        // reachable. With the whole arc live the curve is the honest one:
        // damage grows with the square of the arm, so it rises smoothly from
        // the edge of the lee out to the tip rather than jumping.
        let at_the_tip = taken_at(25);
        let inside = taken_at(13);

        assert!(at_the_tip.is_positive(), "the tip band never connected");
        assert!(inside.is_positive(), "closing in avoided the blade entirely");
        assert!(
            at_the_tip > inside * Fx::from_int(3),
            "the worst blow at the tip was {at_the_tip} against {inside} \
             close in -- where you stand is supposed to be the whole fight"
        );
    }

    #[test]
    fn crowding_a_heavy_weapon_takes_most_of_its_bite_away() {
        // The sharpest edge of the damage model, pinned deliberately rather
        // than left to be discovered -- and it has changed *kind* twice since it
        // was first written, which is the part worth reading.
        //
        // Impact is `spin * arm` and energy is its square, so a weapon has a
        // minimum effective radius: inside it even a blade at full speed is
        // worth no more than a graze. That radius used to be 1.27 for a Brute,
        // *outside* the 1.15 at which a Fighter's body and a Brute's stop being
        // able to approach -- meaning a fighter who got close became flatly
        // immune, and a small enough one became immune and harmless at the same
        // time while the fight timed out. Dropping the old speed threshold to
        // 0.06 pulled it to 0.85 and turned the circle into a gradient; the
        // energy law put it at 0.88, which is the same answer.
        //
        // **The bound below is the one that matters, and it is the one Phase 3
        // broke.** Deriving the spin cap from grip raised a Brute's top spin
        // from 741 to 911, which pulled the dead zone to 0.687 -- *inside* its
        // own 0.70 body radius. Nothing was immune any more, which sounds
        // harmless and was not: a blow of any size ends the swing that threw it,
        // so with no harmless band left on the blade every cut a Brute threw was
        // spent on a hilt scratch worth 1-3 damage against a peak of 24.8. The
        // naive Fighter's win rate against it went from 10% to 76%. See
        // `rules::GRAZE_FRACTION`, which is what put the band back.
        //
        // This asserted the same thing before and missed it, because it derived
        // the dead zone inline from the damage law instead of asking
        // `rules::dead_zone`. Ask the sim -- the law has changed again since.
        let brute = Body::Brute;
        let arm = rules::Arm::resolve(ActionKind::Club.spec(), brute.base_stats(), brute.radius());
        let safe = rules::dead_zone(arm);
        assert!(
            safe > brute.radius(),
            "a Brute's dead zone is {safe} against a body radius of {} -- with no \
             part of the blade harmless, every cut it throws is spent on a scratch",
            brute.radius()
        );
        assert!(
            safe < brute.radius() + ActionKind::Club.spec().length,
            "the dead zone is {safe}, which swallows the blade's own span"
        );

        // And the gradient is real in a running fight, not just on paper: the
        // worst blow a Brute lands on someone pressed against it against the
        // worst it lands at the end of its arc.
        let worst_at = |gap: i32| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn =
                Vec2::new(Fx::from_int(18) - Fx::from_ratio(gap, 100), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let villain = w.alive_ids(Faction::Monsters)[0];
            let mut worst = Fx::ZERO;
            for _ in 0..1800u32 {
                if w.outcome().is_some() {
                    break;
                }
                let cut = cutting(&w, villain, Angle::HALF, Strike::Nearest);
                w.submit(villain, Command::swinging(Vec2::ZERO, hero, cut));
                // Pinned in place: this is a test of geometry, and a hero that
                // walked would be measuring its own footwork.
                w.submit(hero, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { amount, .. } = event {
                        worst = worst.max(*amount);
                    }
                }
            }
            worst
        };

        // 1.15 is body contact for this pair; 2.40 is out at the tip.
        let pressed = worst_at(115);
        let at_range = worst_at(240);
        assert!(at_range.is_positive(), "the tip band never connected");
        assert!(
            pressed * Fx::TWO < at_range,
            "crowding in took a {pressed} blow against {at_range} at range -- \
             getting inside a heavy weapon is supposed to be worth doing"
        );

        // And the floor is wired into the sim and not only into `dead_zone`:
        // whatever does get through at body contact clears `graze_floor`, so no
        // cut is ever spent on a touch worth less than that. Checked end to end
        // because the arithmetic above cannot tell whether `resolve_swings`
        // actually asks -- and for one release it did not.
        let floor = rules::graze_floor(arm, brute.base_stats());
        assert!(
            !pressed.is_positive() || pressed >= floor,
            "a blow of {pressed} landed against a graze floor of {floor}, so the \
             swing that threw it was spent on a scratch"
        );
    }

    #[test]
    fn a_fight_that_runs_out_of_clock_is_decided_on_points() {
        // A draw was the honest answer while the clock was the only thing that
        // could end a fight neither side was winning, and it is the wrong answer
        // for a difficulty ladder: every step down the ladder converts a loss
        // into a timeout rather than into a defeat, and the bottom of the range
        // stops meaning "loses" and starts meaning "wanders off".
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let brute = w.alive_ids(Faction::Monsters)[0];

        // Level: nobody has touched anybody.
        assert_eq!(w.timeout(), Outcome::Draw);

        // Hurt the Brute and the fight is the hero's on points -- but it is
        // still not a *kill*, and the two have to stay distinguishable or
        // fitness cannot price them differently.
        //
        // Taken as **fractions of each bar** rather than as flat amounts, which
        // is what these were: 40 off a Brute and 60 off a Fighter said 30% and
        // 71% while the bars were 132 and 84, and said "both sides at zero,
        // therefore level, therefore a draw" the moment they became 18 and 12.
        // `health_fraction` is a ratio and clamps at zero, so a test that feeds
        // it absolute damage is a test written in units it does not use.
        let b = w.resolve(brute).unwrap();
        w.hp[b] -= w.max_hp[b] * Fx::from_ratio(30, 100);
        assert_eq!(w.timeout(), Outcome::Decision(Faction::Heroes));
        assert_eq!(w.timeout().winner(), Some(Faction::Heroes));
        assert!(!w.timeout().is_decisive());
        assert!(Outcome::HeroesWin.is_decisive());

        // ...and it swings back when the hero is the one bleeding.
        let h = w.resolve(hero).unwrap();
        w.hp[h] -= w.max_hp[h] * Fx::from_ratio(70, 100);
        assert_eq!(w.timeout(), Outcome::Decision(Faction::Monsters));
    }

    #[test]
    fn nobody_heals_while_an_enemy_is_watching() {
        // Timing regeneration from the last blow alone is the obvious reading
        // and it quietly undoes the difficulty range: an exchange takes a couple
        // of seconds and `REGEN_DELAY` is three, so two fighters circling each
        // other at arm's length heal between every trade and a bad one can never
        // be ground down. It also reads badly -- wounds closing while an enemy
        // stands four feet away with a sword out.
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::from_ints(4, 8);
        scenario.units[1].spawn = Vec2::from_ints(8, 8);
        let mut w = World::new(&scenario, 1);
        let hero = w.resolve(w.alive_ids(Faction::Heroes)[0]).unwrap();
        w.hp[hero] -= Fx::from_int(40);
        let wounded = w.hp[hero];

        // Well past `REGEN_DELAY`, in plain sight of the Brute: nothing.
        for _ in 0..(rules::REGEN_DELAY + 300) {
            w.regenerate();
            w.tick += 1;
        }
        assert_eq!(w.hp[hero], wounded, "healed with an enemy in sight");

        // Break contact and it works exactly as before.
        w.pos[hero] = Vec2::from_ints(2, 2);
        w.pos[1] = Vec2::from_ints(200, 200);
        for _ in 0..300 {
            w.regenerate();
            w.tick += 1;
        }
        assert!(w.hp[hero] > wounded, "could not recover out of contact");
    }

    #[test]
    fn recovery_is_a_budget_and_not_a_reset() {
        // Retreating to recover is a real tactic and has to stay one. What it
        // must not be is a way to un-lose an exchange indefinitely: without a
        // budget, a beaten fighter walks off, waits, and comes back whole, and
        // the fight has no reason ever to end. One full bar over the whole
        // fight, spent however it likes.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(200, 200);
        let mut w = World::new(&scenario, 1);
        let hero = w.resolve(w.alive_ids(Faction::Heroes)[0]).unwrap();
        let full = w.max_hp[hero];
        assert_eq!(w.regen_left[hero], full * rules::REGEN_BUDGET);

        // Spend the budget in two goes, dropping to a sliver each time.
        let mut healed_total = Fx::ZERO;
        for _ in 0..4 {
            w.hp[hero] = Fx::ONE;
            let before = w.hp[hero];
            for _ in 0..3000 {
                w.regenerate();
                w.tick += 1;
            }
            healed_total += w.hp[hero] - before;
        }
        assert!(
            healed_total <= full * rules::REGEN_BUDGET + Fx::ONE,
            "healed {healed_total} against a budget of {}",
            full * rules::REGEN_BUDGET
        );
        assert!(healed_total > full * Fx::HALF, "the budget was never usable");
    }

    #[test]
    fn a_blow_into_a_recovery_hurts_more_than_the_same_blow_into_a_guard() {
        // The one term in the damage model that depends on what the *target* is
        // doing, and the reason timing an attack is worth more than throwing
        // one. Damage dealt used to be flat across every level of play measured:
        // a Brute is large, slow and never steps aside, so landing a blow was
        // never the hard part and there was nothing for a good fighter to be
        // good at on offence.
        //
        // Driven through the damage arithmetic directly rather than through a
        // staged fight, because the two runs have to differ in *exactly* one
        // thing and a live fight cannot promise that.
        let base = Fx::from_int(20);
        let punished = base * rules::RECOVERY_EXPOSURE;
        assert!(
            punished > base * Fx::from_ratio(13, 10),
            "punishing a recovery is barely worth more than trading"
        );
        assert!(
            punished < base * Fx::TWO,
            "punishing a recovery is worth so much the rest of the fight is noise"
        );

        // And the phase gate itself, in a running world: a Fighter cutting into
        // a Brute that is mid-recovery against the identical cut into one that
        // is not.
        let landed = |target_recovering: bool| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn = Vec2::from_ints(16, 8);
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 7);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let mut worst = Fx::ZERO;
            for _ in 0..600u32 {
                if w.outcome().is_some() {
                    break;
                }
                // Pin the Brute's sword into (or out of) a recovery every tick,
                // so the only thing that differs between the two runs is the
                // phase the blow arrives against.
                let b = w.resolve(brute).unwrap();
                if target_recovering {
                    w.limb[b].swing = Swing::Recover;
                    w.limb[b].swing_left = 200;
                } else {
                    w.limb[b].swing = Swing::Guard;
                }
                let cut = cutting(&w, hero, Angle::ZERO, Strike::Nearest);
                w.submit(hero, Command::swinging(Vec2::ZERO, brute, cut));
                w.submit(brute, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { target, amount, .. } = event {
                        if *target == brute {
                            worst = worst.max(*amount);
                        }
                    }
                }
            }
            worst
        };
        let into_recovery = landed(true);
        let into_guard = landed(false);
        assert!(into_guard.is_positive() && into_recovery.is_positive());
        assert!(
            into_recovery > into_guard,
            "a blow into a recovery did {into_recovery} against {into_guard} \
             into a guard -- reading the opening bought nothing"
        );
    }

    #[test]
    fn an_enemys_dead_zone_is_perceived_rather_than_known() {
        // The number that was missing, and the reason the strongest answer to a
        // heavy weapon was not derivable from an observation at all: a `Contact`
        // said how *long* an enemy's blade was but nothing about how fast it
        // could be swung, so where it stopped being dangerous could not be
        // worked out and a policy had to be told by a hand-set gene.
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::from_ints(14, 8);
        scenario.units[1].spawn = Vec2::from_ints(18, 8);

        let truth = rules::dead_zone(rules::Arm::resolve(
            ActionKind::Club.spec(),
            Body::Brute.base_stats(),
            Body::Brute.radius(),
        ));

        // A sharp eye reads it exactly...
        let sharp = {
            let mut s = scenario.clone();
            s.units[0].stats = Stats::new(6, 6, 8, 18, 8);
            let w = World::new(&s, 3);
            let hero = w.alive_ids(Faction::Heroes)[0];
            w.observe(hero).enemies()[0].min_strike_range
        };
        assert_eq!(sharp, truth, "a clean observer misjudged a fixed fact");

        // ...and a dim one does not, over any single sample or across many.
        let mut worst = Fx::ZERO;
        for seed in 0..64u64 {
            let mut s = scenario.clone();
            s.units[0].stats = Stats::new(6, 6, 8, 0, 8);
            let w = World::new(&s, seed);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let seen = w.observe(hero).enemies()[0].min_strike_range;
            assert!(seen >= Fx::ZERO, "read a negative dead zone");
            worst = worst.max((seen - truth).abs());
        }
        assert!(
            worst > truth * Fx::from_ratio(2, 10),
            "a blind observer's worst read was off by only {worst} on {truth}; \
             judging how hard someone can swing is supposed to be the skill"
        );

        // Its own is exact whatever its eyesight -- a fighter knows how hard it
        // can swing, however badly it reads anyone else.
        let mut s = scenario.clone();
        s.units[0].stats = Stats::new(6, 6, 8, 0, 8);
        let w = World::new(&s, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        assert_eq!(
            w.observe(hero).min_strike_range,
            rules::dead_zone(rules::Arm::resolve(
                ActionKind::Sword.spec(),
                Stats::new(6, 6, 8, 0, 8),
                Body::Fighter.radius(),
            ))
        );
    }

    /// A duel between two arbitrary archetypes, seen through a sharp hero's
    /// eyes. Returns the hero's read of the villain.
    fn sizing_up(hero: Body, villain: Body) -> Contact {
        let mut s = Scenario::duel();
        s.units[0].set_body(hero);
        s.units[0].stats = Stats::new(
            hero.base_stats().power,
            hero.base_stats().agility,
            hero.base_stats().intellect,
            18, // clean eyes: this is about the figure, not about the blur
            hero.base_stats().vitality,
        );
        s.units[0].spawn = Vec2::from_ints(14, 8);
        s.units[1].set_body(villain);
        s.units[1].stats = villain.base_stats();
        s.units[1].spawn = Vec2::from_ints(18, 8);
        let w = World::new(&s, 3);
        let id = w.alive_ids(Faction::Heroes)[0];
        w.observe(id).enemies()[0]
    }

    #[test]
    fn the_same_weapon_is_a_different_threat_to_a_different_body() {
        // The whole reason the field is a fraction. `power`, `weapon.weight` and
        // `max_hp` are all absolute and none of them is in an observation --
        // correctly, because an absolute number is not something one fighter can
        // read off another. What *is* readable is the ratio, and the ratio is
        // what decides whether an exchange is a scratch or a third of the fight.
        let to_warrior = sizing_up(Body::Fighter, Body::Brute).threat;
        let to_skitterer = sizing_up(Body::Skitterer, Body::Brute).threat;

        assert!(
            to_skitterer > to_warrior * Fx::TWO,
            "the same axe reads as {to_skitterer} to a Skitterer and {to_warrior} \
             to a Fighter; it should be far worse news for the smaller body"
        );
        // And a knife is not an axe, whoever is holding it.
        let knife = sizing_up(Body::Fighter, Body::Skitterer).threat;
        assert!(
            knife * Fx::TWO < to_warrior,
            "a Fighter rates a Skitterer's knife at {knife} against a Brute's \
             axe at {to_warrior}"
        );
    }

    #[test]
    fn one_fighters_threat_is_the_others_frailty() {
        // The two fields are one quantity read from opposite ends, and a policy
        // comparing "blows I can take" against "blows it can take" is relying on
        // exactly that. If they ever drift apart the comparison is nonsense.
        for (hero, villain) in [
            (Body::Fighter, Body::Brute),
            (Body::Skitterer, Body::Rogue),
            (Body::Brute, Body::Brute),
        ] {
            let ours = sizing_up(hero, villain);
            let theirs = sizing_up(villain, hero);
            assert_eq!(
                ours.threat, theirs.frailty,
                "{hero:?} vs {villain:?}: what the villain does to us and what \
                 it thinks we take from it are the same blow"
            );
            assert_eq!(ours.frailty, theirs.threat, "{hero:?} vs {villain:?}");
        }
    }

    #[test]
    fn one_fighters_knockback_dealt_is_the_others_taken() {
        // `threat`/`frailty` mirrored, on the momentum side, and it has to hold
        // for the same reason: a fighter deciding whether to trade shoves is
        // comparing the two ends of one quantity, and a pair that drifts apart
        // makes the comparison meaningless.
        for (hero, villain) in [
            (Body::Fighter, Body::Brute),
            (Body::Skitterer, Body::Rogue),
            (Body::Brute, Body::Brute),
        ] {
            let ours = sizing_up(hero, villain);
            let theirs = sizing_up(villain, hero);
            assert_eq!(
                ours.knockback_taken, theirs.knockback_dealt,
                "{hero:?} vs {villain:?}: the ground the villain takes off us \
                 and the ground it thinks it takes are the same blow"
            );
            assert_eq!(
                ours.knockback_dealt, theirs.knockback_taken,
                "{hero:?} vs {villain:?}"
            );
        }
    }

    #[test]
    fn how_heavy_someone_looks_is_the_reciprocal_of_how_heavy_you_look_to_them() {
        // `heft` is a ratio and the two ends of it are the same ratio inverted,
        // which is what makes "can I move this" and "can it move me" one
        // question rather than two. A pair that drifts apart would let both
        // fighters believe they are the heavier one, and both would charge.
        for (hero, villain) in [
            (Body::Skitterer, Body::Brute),
            (Body::Fighter, Body::Rogue),
            (Body::Brute, Body::Brute),
        ] {
            let ours = sizing_up(hero, villain).heft;
            let theirs = sizing_up(villain, hero).heft;
            assert!(
                (ours * theirs - Fx::ONE).abs() < Fx::from_ratio(1, 100),
                "{hero:?} vs {villain:?}: {ours} and {theirs} do not multiply to one"
            );
        }
        // ...and it is not readable off body size, which is the whole reason it
        // is a percept. A Brute is 15% denser than it looks and a Skitterer 20%
        // lighter, so the pairing lands well clear of the radius ratio squared.
        let seen = sizing_up(Body::Skitterer, Body::Brute).heft;
        let looks = {
            let (r, s) = (Body::Brute.radius(), Body::Skitterer.radius());
            fx::mul_div(r, r, s * s)
        };
        assert!(
            (seen - looks).abs() > Fx::from_ratio(1, 2),
            "a Brute weighs {seen} Skitterers and looks like {looks} of one -- \
             close enough that `radius` would have done the job"
        );
    }

    #[test]
    fn a_fighters_own_swing_costs_it_ground_and_it_can_see_how_much() {
        // The percept `recoil_drift` exists for, and the invariant that keeps it
        // honest: it is the same stopping-distance question as
        // `Contact::knockback_taken`, asked about your own weapon, so the two are
        // directly comparable and a policy weighing "what this cut costs me" against
        // "what standing here costs me" is comparing like with like.
        let mut s = Scenario::duel();
        s.units[0].set_body(Body::Brute);
        s.units[0].stats = Body::Brute.base_stats();
        s.units[1].set_body(Body::Skitterer);
        s.units[1].stats = Body::Skitterer.base_stats();
        let w = World::new(&s, 3);

        for i in 0..2 {
            let drift = w.recoil_drift(i);
            assert!(
                drift.is_positive() && drift < Fx::from_int(100),
                "{:?} reads its own recoil as {drift}",
                w.kind[i]
            );
        }
        // Every archetype, so nothing in the roster can go degenerate quietly,
        // and the observation carries it.
        for kind in Body::ALL {
            let obs = sizing_up_own(kind);
            assert!(obs.recoil_drift.is_positive(), "{kind:?} swings for free");
        }
    }

    /// The observation a `kind` has of itself, for the self-percept tests.
    fn sizing_up_own(kind: Body) -> crate::Observation {
        let mut s = Scenario::duel();
        s.units[0].set_body(kind);
        s.units[0].stats = kind.base_stats();
        let w = World::new(&s, 3);
        w.observe(w.id_of(0))
    }

    #[test]
    fn weight_decides_what_a_blow_moves_rather_than_what_it_costs() {
        // **The point of the whole phase, stated as a comparison**, and the
        // interesting half is which end of the exchange carries it.
        //
        // Not the weapon. Damage is bounded by the muscle -- a swing is a fixed
        // torque over a fixed arc -- and so, it turns out, is most of the
        // momentum: a Brute's axe out-shoves a Skitterer's knife by about the
        // same factor it out-wounds it, because the knife is dense and hafted
        // forward and the axe is swung slowly.
        //
        // The **target** is where the spread lives, and it is a hundredfold
        // where damage has none at all: one identical blow is one identical
        // number of points off whoever takes it, and moves a Skitterer twenty
        // times as far as it moves a Brute. Weight is a defence no stat buys and
        // no skill answers, and it is the reason both figures are in the
        // observation rather than one being inferred from the other.
        let by_axe = sizing_up(Body::Fighter, Body::Brute);
        let by_knife = sizing_up(Body::Fighter, Body::Skitterer);
        assert!(
            by_axe.knockback_taken > by_knife.knockback_taken * Fx::TWO,
            "an axe moved a Fighter {} against a knife's {} -- a weapon's weight \
             is supposed to be worth something here even if it is not worth much",
            by_axe.knockback_taken,
            by_knife.knockback_taken
        );

        let vs_brute = sizing_up(Body::Brute, Body::Fighter).knockback_taken;
        let vs_skitterer = sizing_up(Body::Skitterer, Body::Fighter).knockback_taken;
        assert!(
            vs_skitterer > vs_brute * Fx::from_int(20),
            "one Fighter blow moved a Skitterer {vs_skitterer} and a Brute \
             {vs_brute}; being heavy is supposed to be a defence no stat buys"
        );
    }

    #[test]
    fn a_blow_moves_what_it_lands_on_and_a_planted_guard_takes_less_of_it() {
        // Two claims in one fixture because they need the same setup: a landed
        // blow shoves, and bracing is worth something beyond the damage
        // discount. Before this, a fighter who could not stop a blow anyway got
        // nothing at all for having read it coming.
        // A shield bearing has to be *found* rather than guessed, and the
        // reason is the same one `a_shield_covers_a_direction_and_only_that_direction`
        // records: a blade sweeps in and first bites well round the body from
        // where its wielder is standing, so pointing a guard at the enemy is not
        // pointing it at the blow. Sixteen bearings, and the ones that actually
        // caught something are the sample.
        let shoved = |braced: bool, guard: Option<Angle>| -> (Fx, bool) {
            let mut scenario = Scenario::duel();
            // Clear of each other: the two radii sum to 1.15, and a pair that
            // starts overlapping is shoved apart by `separate`, which would put
            // a velocity on both bodies that has nothing to do with the blow.
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(165, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            // The defender is here to be blocked *through*, so it has to be
            // holding a guard rather than its default sword. `BRACE_ANCHOR` is
            // only ever charged against a limb that actually caught the blow.
            scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let h = w.resolve(hero).unwrap();
            // Enough health that the fixture survives to be measured.
            w.hp[h] = Fx::from_int(4000);
            w.max_hp[h] = Fx::from_int(4000);
            if !braced {
                w.limb[h].braced = 0;
            }
            let shield = match guard {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => LimbCommand::TUCKED,
            };
            for _ in 0..400u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(
                    hero,
                    Command::swinging(Vec2::ZERO, EntityId::NONE, shield),
                );
                if !braced {
                    w.limb[h].braced = 0;
                }
                let events = w.step();
                let landed = events.iter().any(|e| matches!(e, Event::Damage { .. }));
                let blocked = events.iter().any(|e| matches!(e, Event::Block { .. }));
                if landed {
                    return (w.vel[h].length(), blocked);
                }
            }
            (Fx::ZERO, false)
        };

        let (open, _) = shoved(false, None);
        assert!(
            open.is_positive(),
            "a blow that went home did not move the body it landed on"
        );

        let (mut snapped, mut planted) = (Fx::MAX, Fx::MAX);
        for step in 0..16u32 {
            let at = Angle::from_raw((step * 4096) as u16);
            if let (shove, true) = shoved(false, Some(at)) {
                snapped = snapped.min(shove);
            }
            if let (shove, true) = shoved(true, Some(at)) {
                planted = planted.min(shove);
            }
        }
        assert!(
            snapped < Fx::MAX && planted < Fx::MAX,
            "no bearing caught the blow at all, so this proves nothing about \
             what catching it is worth"
        );
        assert!(
            planted < snapped,
            "a shield planted for BRACE_TICKS took {planted} of shove against a \
             travelling one's {snapped}; setting your feet is supposed to be \
             worth something"
        );
        assert!(
            planted.is_positive(),
            "a braced guard cancelled the shove outright; a heavy blow is meant \
             to be felt through a shield, not switched off by one"
        );
    }

    #[test]
    fn a_heavy_blade_throws_a_guard_aside_and_a_light_one_bounces_off_it() {
        // **The inversion this phase exists to fix.** The old rule shoved a
        // blocking shield by a flat fraction of the *attacker's spin*, with no
        // mass anywhere in it -- so a Rogue's whippy 3461 disturbed a guard
        // nearly four times as hard as a Brute's 911, and the heaviest weapon in
        // the game was the one a shield had the easiest time holding.
        //
        // Both numbers come out of one collision between two arms now, so they
        // cannot contradict each other by construction: whatever the heavy blade
        // fails to give back to itself, it gave to the guard.
        let against = |attacker: Body| -> (Fx, Fx) {
            let mut s = Scenario::duel();
            s.units[0].set_body(Body::Fighter);
            s.units[0].stats = Body::Fighter.base_stats();
            s.units[0].spawn = Vec2::from_ints(14, 8);
            s.units[1].set_body(attacker);
            s.units[1].stats = attacker.base_stats();
            s.units[1].spawn = Vec2::from_ints(18, 8);
            let w = World::new(&s, 3);
            // Contact on the defender's near shoulder, about where a sweeping
            // cut first bites rather than dead on the line between them.
            let at = w.pos[0] + Vec2::new(Fx::from_ratio(30, 100), Fx::from_ratio(30, 100));
            let arm = w.arm(1);
            let mut w = w;
            w.limb[1].spin = arm.reachable_spin();
            w.limb[1].reach = Fx::ONE;
            w.limb[0].reach = Fx::ONE;
            let (rebound, knock) = w.deflect(1, 0, at, rules::BLOCK_RESTITUTION);
            // As fractions of the swing that threw it, so the two archetypes are
            // comparable despite a four-fold difference in spin.
            let spin = w.limb[1].spin;
            (rebound / spin, knock / spin)
        };

        let (brute_back, brute_knock) = against(Body::Brute);
        let (scout_back, scout_knock) = against(Body::Rogue);

        assert!(
            brute_knock.abs() > scout_knock.abs(),
            "an axe moved the guard by {brute_knock} of its own swing and a \
             short blade by {scout_knock} -- the heavy weapon is supposed to be \
             the hard one to hold off"
        );
        assert!(
            scout_back.abs() > brute_back.abs(),
            "the light blade kept {scout_back} of its swing and the heavy one \
             {brute_back}; meeting a guard is supposed to stop the small weapon \
             and barely trouble the big one"
        );
    }

    #[test]
    fn a_swing_costs_footing_only_when_something_stops_it() {
        // Recoil, and the threshold that makes it usable. A blade accelerates
        // the same way for tens of ticks running, so the reaction to a *smooth*
        // swing points one way the whole time and adds up; left unbounded it
        // came to more than a body's top speed across one cut and a fighter
        // could not close on anything it was swinging at. Static friction is the
        // answer, and it is the answer every swordsman demonstrates by not
        // sliding across the floor.
        //
        // What survives the threshold is the interesting half: a blade *stopped*
        // reverses in a single tick, and no footing holds that.
        let swing = |guard: Option<Angle>| -> Fx {
            let mut scenario = Scenario::duel();
            // Clear of each other: the two radii sum to 1.15, and a pair that
            // starts overlapping is shoved apart by `separate`, which would put
            // a velocity on both bodies that has nothing to do with the blow.
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(165, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            // What stops the cut has to be a guard: a blade in the way would
            // parry it instead, and a parry is a blade-on-blade collision with
            // its own restitution rather than the block this measures.
            scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let h = w.resolve(hero).unwrap();
            let b = w.resolve(brute).unwrap();
            w.hp[h] = Fx::from_int(4000);
            w.max_hp[h] = Fx::from_int(4000);
            // Either a Fighter standing there with a guard up, or nobody home.
            let shield = match guard {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => {
                    w.pos[h] = Vec2::from_ints(2, 2);
                    LimbCommand::TUCKED
                }
            };
            let mut worst = Fx::ZERO;
            for _ in 0..400u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(
                    hero,
                    Command::swinging(Vec2::ZERO, EntityId::NONE, shield),
                );
                w.step();
                worst = worst.max(w.vel[b].length());
            }
            worst
        };

        let free = swing(None);
        // The bearing that actually catches the cut has to be found rather than
        // assumed; see the sweep in
        // `a_blow_moves_what_it_lands_on_and_a_planted_guard_takes_less_of_it`.
        let mut stopped = Fx::ZERO;
        for step in 0..16u32 {
            stopped = stopped.max(swing(Some(Angle::from_raw((step * 4096) as u16))));
        }
        let top = Body::Brute.base_stats().move_speed();
        assert!(
            free < rules::TRACTION_BASE,
            "a Brute swinging at empty air drifted at {free} a tick against a \
             footing of {}; a planted fighter's own smooth swing is supposed to \
             be held by its feet",
            rules::TRACTION_BASE
        );
        assert!(
            stopped > free && stopped > top / Fx::from_int(8),
            "being stopped moved the attacker {stopped} against {free} for a \
             clean swing and a top speed of {top} -- a cut that meets a shield \
             is supposed to cost ground"
        );
    }

    #[test]
    fn what_a_blow_will_cost_is_judged_rather_than_known() {
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::from_ints(14, 8);
        scenario.units[1].spawn = Vec2::from_ints(18, 8);

        let truth = sizing_up(Body::Fighter, Body::Brute).threat;

        // A dim fighter does not merely dodge late -- it misprices the fight it
        // is in, which is a much more interesting way to lose. And the error is
        // proportional, so it never reads a blow as free.
        let mut worst = Fx::ZERO;
        for seed in 0..64u64 {
            let mut s = scenario.clone();
            s.units[0].stats = Stats::new(6, 6, 8, 0, 8);
            let w = World::new(&s, seed);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let seen = w.observe(hero).enemies()[0];
            assert!(seen.threat >= Fx::ZERO, "read a negative threat");
            assert!(seen.frailty >= Fx::ZERO, "read a negative frailty");
            worst = worst.max((seen.threat - truth).abs());
        }
        assert!(
            worst > truth * Fx::from_ratio(2, 10),
            "a blind observer's worst read was off by only {worst} on {truth}"
        );
    }

    #[test]
    fn crossed_blades_deflect_both_swings() {
        // Two Warriors nose to nose, blades sweeping through the same space.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Mirrored sides, so the two blades sweep *toward* each other. Matching
        // sides about opposing bearings is the subtle failure here: the pair
        // stays exactly antiparallel for the whole cut, which means the two
        // segments are parallel lines that never properly cross, and no parry
        // is ever reported however long the test runs.
        let mut parries = 0;
        let mut ended_an_attack = false;
        for _ in 0..1800u32 {
            let cut_a = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
            let cut_b = cutting(&w, b, Angle::HALF, Strike::Sunwise);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
            w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
            let mut parried_here = false;
            for event in w.step() {
                if let Event::Parry { a: x, b: y, .. } = event {
                    assert!(x.index < y.index, "a parry was reported unordered");
                    parries += 1;
                    parried_here = true;
                }
            }
            if parried_here {
                // Crossing steel does not merely deflect a swing now, it ends
                // it: both hands go to recovery, which is what makes catching a
                // cut on your own blade worth the tempo it costs.
                ended_an_attack |= w.limb[a.index as usize].swing == Swing::Recover
                    && w.limb[b.index as usize].swing == Swing::Recover;
            }
        }
        assert!(parries > 0, "blades swept through each other without meeting");
        assert!(
            ended_an_attack,
            "a parry left an attack still running on one side or the other"
        );
    }

    #[test]
    fn a_mirrored_duel_is_symmetric() {
        // Two identical fighters placed symmetrically must trade identically.
        // This is the test that catches an in-place resolution loop: resolve
        // spin changes as you go and the lower entity index quietly wins.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        // 1.7 apart, symmetric about x = 12. Two units puts each Fighter's body
        // 1.55 from the other's centre against a blade that reaches 1.40, so
        // the pair swings all day and never touches -- and a symmetry test
        // between two zeros passes without proving anything.
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(1115, 100), Fx::from_int(8));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(1285, 100), Fx::from_int(8));
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Symmetric under a half turn about the midpoint rather than under a
        // reflection, and the difference decides whether this test measures
        // anything. Reflected sides send the two blades head-on into each
        // other, so the pair parries every exchange and trades no damage at
        // all -- symmetric, and vacuous. Rotated sides keep the blades exactly
        // antiparallel, which never cross, so both cuts land and the assertion
        // has something to compare.
        //
        // The sides are named rather than left to `Strike::Nearest`, which is
        // the one command that cannot answer a perfectly symmetric situation
        // differently for the two fighters; see `Hand::begin`.
        let mut outcome = None;
        for _ in 0..1800u32 {
            let cut_a = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
            let cut_b = cutting(&w, b, Angle::HALF, Strike::Widdershins);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
            w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
            w.step();
            if let Some(o) = w.outcome() {
                outcome = Some(o);
                break;
            }
        }
        assert!(
            w.damage_dealt(Faction::Heroes).is_positive(),
            "the symmetric pair never landed anything, so this proves nothing"
        );
        // If it ended at all it has to have ended in a draw. Anything else means
        // one index resolved before the other somewhere in the tick loop.
        if let Some(o) = outcome {
            assert_eq!(
                o,
                Outcome::MutualDestruction,
                "a symmetric exchange produced a winner"
            );
        }
        assert_eq!(
            w.damage_dealt(Faction::Heroes),
            w.damage_dealt(Faction::Monsters),
            "a mirrored exchange favoured one side"
        );
        assert_eq!(
            w.health_fraction(Faction::Heroes),
            w.health_fraction(Faction::Monsters)
        );
    }

    #[test]
    fn getting_going_and_stopping_both_take_time() {
        // Momentum, at its plainest. A body used to reach full speed on the
        // tick it was told to and stop on the tick it was told to, which is
        // what made spacing a question about position rather than commitment.
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let i = hero.index as usize;
        let top = w.stats[i].move_speed();

        w.pos[i] = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.command[i] = Command::moving(Vec2::X);
        w.apply_movement();
        let after_one = w.vel[i].length();
        assert!(
            after_one < top * Fx::from_ratio(3, 10),
            "one tick got it to {after_one} of a {top} top speed"
        );

        for _ in 0..40 {
            w.apply_movement();
        }
        let cruising = w.vel[i].length();
        assert!(
            (cruising - top).abs() < Fx::from_ratio(1, 1000),
            "settled at {cruising} instead of {top}"
        );

        // And it cannot simply stop. Ordered to hold, it slides.
        w.command[i] = Command::HOLD;
        let braking_from = w.pos[i];
        for _ in 0..40 {
            w.apply_movement();
        }
        assert!(w.vel[i].length() < Fx::from_ratio(1, 1000), "never stopped");
        let slide = (w.pos[i] - braking_from).length();
        assert!(
            slide > Fx::from_ratio(25, 100),
            "stopped in {slide} units, which is no commitment at all"
        );
    }

    #[test]
    fn a_wall_takes_the_momentum_it_stops() {
        // Position used to be the only thing a wall clipped, which was harmless
        // while velocity was recomputed from displacement every tick. With
        // velocity carried across ticks it is not: a body pinned against a wall
        // stays convinced it is running at full speed, and both `impact_speed`
        // and `separate` believe it. The symptom was a 4v6 that could not
        // finish, with the survivors shoving each other off a wall forever.
        let mut w = duel_world();
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;

        // Hard against the western wall, still being told to walk west, and
        // drifting north along it.
        w.pos[i] = Vec2::new(w.radius[i], w.arena.y * Fx::HALF);
        w.command[i] = Command::moving(Vec2::new(-Fx::ONE, Fx::ONE).normalize());
        for _ in 0..30 {
            w.apply_movement();
        }

        assert_eq!(w.vel[i].x, Fx::ZERO, "the wall banked the momentum");
        assert!(w.vel[i].y.is_positive(), "sliding along a wall must still work");
        assert_eq!(w.pos[i].x, w.radius[i]);
    }

    /// A world with a floor plan carved into it and **one** body in it. `#` is
    /// masonry; see [`crate::dungeon::parse`].
    ///
    /// One body rather than a duel's two, because these tests are about a body
    /// against the level and a spare Brute standing in a corridor is not a
    /// neutral bystander -- it is a second collision rule running, and the
    /// first version of this helper produced a hero wedged between a wall and a
    /// monster that had no business being there. Tests that want an opponent
    /// add one; every caller places its body by hand anyway.
    fn carved_world(rows: &[&str]) -> World {
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(rows);
        scenario.units.truncate(1);
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        World::new(&scenario, 1)
    }

    /// The opponent the note above says to add: a monster standing at `at`.
    ///
    /// A Skitterer because it is the narrowest body on the roster, so a test
    /// that walks a hero up to it is making a claim about the route rather than
    /// about how two circles settle against one another.
    fn monster_at(w: &mut World, at: Vec2) -> EntityId {
        w.spawn(&UnitSpec {
            kind: Body::Skitterer,
            faction: Faction::Monsters,
            stats: Body::Skitterer.base_stats(),
            loadout: Body::Skitterer.default_loadout(),
            articulated: None,
            spawn: at,
        })
    }

    #[test]
    fn on_an_open_floor_plan_a_move_is_the_arena_clamp_it_always_was() {
        // The bit-identity claim, made mechanical rather than argued. Every
        // scenario in the repository but a generated one is `Dungeon::open`, so
        // if this holds then none of them moved.
        let mut w = duel_world();
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        for radius in [Fx::from_ratio(30, 100), Fx::from_ratio(45, 100), Fx::from_ratio(70, 100)] {
            w.radius[i] = radius;
            for x in [-3, 0, 1, 12, 23, 24, 27] {
                for y in [-3, 0, 1, 8, 15, 16, 19] {
                    let to = Vec2::from_ints(x, y);
                    w.pos[i] = Vec2::from_ints(12, 8);
                    w.vel[i] = Vec2::new(Fx::ONE, Fx::ONE);
                    w.move_body(i, to);

                    let want = w.clamp_to_arena(to, radius);
                    assert_eq!(w.pos[i], want, "radius {radius} to {to:?}");
                    assert_eq!(w.vel[i].x.is_zero(), want.x != to.x, "x at {to:?}");
                    assert_eq!(w.vel[i].y.is_zero(), want.y != to.y, "y at {to:?}");
                }
            }
        }
    }

    #[test]
    fn a_shove_cannot_push_a_body_through_a_wall() {
        //  A one-tile-thick wall down the middle. Under a rule that clipped the
        //  end point and nothing between, a shove of three units a tick steps
        //  clean over it and comes out the far side.
        let mut w = carved_world(&[
            "#######", //
            "#..#..#",
            "#..#..#",
            "#..#..#",
            "#######",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(25, 10), Fx::from_ratio(25, 10));
        let start = w.pos[i];
        w.vel[i] = Vec2::new(Fx::from_int(3), Fx::ZERO);
        w.move_body(i, w.pos[i] + w.vel[i]);

        assert!(
            w.is_walkable(w.pos[i], w.radius[i]),
            "ended up inside masonry at {:?}",
            w.pos[i]
        );
        assert!(
            w.pos[i].x < Fx::from_int(3),
            "tunnelled from {start:?} to {:?}",
            w.pos[i]
        );
        assert_eq!(w.vel[i].x, Fx::ZERO, "the wall banked the momentum");
    }

    #[test]
    fn a_body_slides_along_a_wall_instead_of_catching_at_a_seam() {
        // Every tile of the north wall presents a face, and adjacent tiles share
        // one down their seam. Without the internal-edge cull the body is shoved
        // out of each seam as it crosses it, which shows up as the along-wall
        // travel stalling -- or, at speed, as the body being flung south.
        let mut w = carved_world(&[
            "##########", //
            "#........#",
            "#........#",
            "##########",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        let r = w.radius[i];
        // Hard against the north wall's inner face, pressed into it and walking
        // east along it.
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::ONE + r);
        w.command[i] = Command::moving(Vec2::new(Fx::ONE, -Fx::ONE).normalize());

        let mut previous = w.pos[i].x;
        for tick in 0..120 {
            w.apply_movement();
            assert!(
                w.is_walkable(w.pos[i], r),
                "tick {tick}: pushed into the wall at {:?}",
                w.pos[i]
            );
            assert!(
                w.pos[i].y <= Fx::ONE + r + Fx::from_ratio(1, 100),
                "tick {tick}: flung off the wall to {:?}",
                w.pos[i]
            );
            // Crossing a seam must not cost the body its eastward travel.
            if tick > 4 {
                assert!(
                    w.pos[i].x > previous,
                    "tick {tick}: caught at a seam at {:?}",
                    w.pos[i]
                );
            }
            previous = w.pos[i].x;
        }
        assert!(
            w.pos[i].x > Fx::from_int(4),
            "barely moved: {:?}",
            w.pos[i]
        );
    }

    #[test]
    fn a_body_ejected_from_masonry_comes_out_the_shallow_side() {
        let mut w = carved_world(&[
            "#####", //
            "#...#",
            "#...#",
            "#####",
        ]);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        // Buried in the north wall, barely: a tenth of a unit above the face.
        w.pos[i] = Vec2::new(Fx::from_ratio(25, 10), Fx::from_ratio(9, 10));
        w.settle(i, w.pos[i]);
        assert!(w.is_walkable(w.pos[i], w.radius[i]), "still buried at {:?}", w.pos[i]);
        assert!(w.pos[i].y > Fx::ONE, "came out the wrong side: {:?}", w.pos[i]);
    }

    #[test]
    fn an_arrow_stops_at_a_wall() {
        let mut w = carved_world(&[
            "#########", //
            "#..#....#",
            "#..#....#",
            "#########",
        ]);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let i = archer.index as usize;
        let from = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.pos[i] = from;

        // The columns `loose` writes, written by hand: there is no way to put an
        // arrow in the air without a drawn bow and a phase edge, and none of
        // that is what this test is about. Due east at a whole tile a tick, so
        // the pillar column at x = 3 is met inside the first step and there is
        // nothing subtle about the arithmetic.
        let k = w.free_shot().expect("a free arrow slot");
        w.shot_alive[k] = true;
        w.shot_pos[k] = from;
        w.shot_vel[k] = Vec2::new(Fx::ONE, Fx::ZERO);
        w.shot_range[k] = Fx::from_int(20);
        w.shot_mass[k] = Fx::ONE;
        w.shot_power[k] = Fx::ONE;
        w.shot_owner[k] = archer;
        w.shot_faction[k] = Faction::Heroes;

        assert_eq!(w.shots().count(), 1);
        // Three ticks: the pillar is a tile and a half away, so the first tick
        // is honest open air and the arrow must survive it.
        w.resolve_shots();
        assert_eq!(w.shots().count(), 1, "stopped before it reached anything");
        w.resolve_shots();
        w.resolve_shots();
        assert_eq!(w.shots().count(), 0, "the arrow went through the wall");
        assert!(
            w.events.is_empty(),
            "a wall is not something to raise an event about"
        );
    }

    #[test]
    fn wall_clearance_on_an_open_floor_plan_is_the_arena_edge() {
        // Version 11 changed what this field *means*, and this is the assertion
        // that the change costs nothing anywhere it did not have to: on the
        // scenarios the lab runs, every one of these four numbers is raw for
        // raw the expression that used to be written out in `observe`.
        let mut w = duel_world();
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        for p in [
            Vec2::from_ints(12, 8),
            Vec2::new(Fx::from_ratio(1, 2), Fx::from_ratio(157, 100)),
            Vec2::new(Fx::from_ratio(2351, 100), Fx::from_ratio(1, 100)),
        ] {
            w.pos[i] = p;
            let obs = w.observe(id);
            assert_eq!(obs.wall_clearance[0], p.x.max(Fx::ZERO));
            assert_eq!(obs.wall_clearance[1], (w.arena.x - p.x).max(Fx::ZERO));
            assert_eq!(obs.wall_clearance[2], p.y.max(Fx::ZERO));
            assert_eq!(obs.wall_clearance[3], (w.arena.y - p.y).max(Fx::ZERO));
            assert_eq!(obs.nav_dir, Vec2::ZERO, "no objective, no route");
            assert_eq!(obs.nav_distance, Fx::MAX);
        }
    }

    #[test]
    fn wall_clearance_stops_at_masonry() {
        let mut w = carved_world(&[
            "#######", //
            "#..#..#",
            "#..#..#",
            "#######",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        w.pos[id.index as usize] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let obs = w.observe(id);
        // The pillar column's near face is at x = 3, not the arena's at x = 7.
        assert_eq!(obs.wall_clearance[1], Fx::from_ratio(15, 10));
        assert_eq!(obs.wall_clearance[0], Fx::from_ratio(5, 10));
    }

    #[test]
    fn the_flow_field_reaches_every_open_tile_and_only_those() {
        let d = crate::dungeon::parse(&[
            "#######", //
            "#.....#",
            "#.###.#",
            "#.....#",
            "#######",
        ]);
        let mut dist = Vec::new();
        let mut queue = Vec::new();
        let seed = d.cell(1, 1).unwrap();
        d.distances(&[seed], &mut dist, &mut queue);

        let mut reached = 0;
        for ty in 0..d.rows() as i32 {
            for tx in 0..d.cols() as i32 {
                let at = dist[d.cell(tx, ty).unwrap() as usize];
                if d.solid(tx, ty) {
                    assert_eq!(at, u16::MAX, "masonry at ({tx}, {ty}) got a distance");
                } else {
                    assert_ne!(at, u16::MAX, "open ({tx}, {ty}) was never reached");
                    reached += 1;
                }
            }
        }
        assert_eq!(reached, d.open_count());
        assert_eq!(dist[seed as usize], 0);
        // Round the ring the long way or the short way, the far corner is five
        // tiles either side of the block.
        assert_eq!(dist[d.cell(5, 1).unwrap() as usize], 4);
        assert_eq!(dist[d.cell(1, 3).unwrap() as usize], 2);
    }

    #[test]
    fn the_flow_field_does_not_depend_on_how_the_world_got_here() {
        let rows = [
            "########", //
            "#..##..#",
            "#..##..#",
            "#......#",
            "########",
        ];
        // Same floor plan, same quarry tile, arrived at two different ways: one
        // world spawned there, the other walked there.
        let build = |walk: bool| {
            let mut scenario = Scenario::duel();
            scenario.dungeon = crate::dungeon::parse(&rows);
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
            scenario.units[1].spawn = Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10));
            let mut w = World::new(&scenario, 1);
            w.set_objective(Faction::Monsters, Objective::Hunt);
            let hero = w.alive_ids(Faction::Heroes)[0].index as usize;
            let villain = w.alive_ids(Faction::Monsters)[0].index as usize;
            w.pos[villain] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(35, 10));
            w.pos[hero] = if walk {
                Vec2::new(Fx::from_ratio(45, 10), Fx::from_ratio(35, 10))
            } else {
                Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10))
            };
            if walk {
                for _ in 0..200 {
                    w.command[hero] = Command::moving(Vec2::new(Fx::ONE, -Fx::ONE).normalize());
                    w.step();
                }
            }
            w.refresh_nav();
            w
        };
        let spawned = build(false);
        let walked = build(true);
        assert_eq!(
            Dungeon::tile_of(spawned.pos[spawned.alive_ids(Faction::Heroes)[0].index as usize]),
            Dungeon::tile_of(walked.pos[walked.alive_ids(Faction::Heroes)[0].index as usize]),
            "the fixture did not put the quarry in the same tile"
        );
        assert_eq!(
            spawned.nav[Faction::Monsters.index()][0].dist,
            walked.nav[Faction::Monsters.index()][0].dist
        );
    }

    #[test]
    fn an_unreachable_objective_reports_no_heading() {
        // A sealed vault in the north-east. Nothing walks into it.
        let mut w = carved_world(&[
            "########", //
            "#....#.#",
            "#....###",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        w.pos[id.index as usize] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(
            Faction::Heroes,
            Order::Goto(Vec2::new(Fx::from_ratio(65, 10), Fx::from_ratio(15, 10))),
        );
        w.refresh_nav();

        let obs = w.observe(id);
        assert_eq!(obs.nav_dir, Vec2::ZERO);
        assert_eq!(obs.nav_distance, Fx::MAX);
    }

    // ------------------------------------------------------------------ doors

    /// Two chambers with one shut doorway between them, and `body` standing in
    /// the western one. `+` is the door; see [`crate::dungeon::parse`].
    ///
    /// Three tiles across each way, because a Brute is 1.40 wide and this
    /// fixture has to hold one -- half the point of it is that a Brute can
    /// reach a door and still not open it.
    fn door_world(body: Body) -> World {
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(&[
            "#########", // 0
            "#...#...#", // 1
            "#...+...#", // 2  the doorway, at (4, 2)
            "#...#...#", // 3
            "#########", // 4
        ]);
        scenario.units.truncate(1);
        scenario.units[0].set_body(body);
        scenario.units[0].spawn = at_tile(2, 2);
        World::new(&scenario, 1)
    }

    /// The centre of a tile, which is where these fixtures place things.
    fn at_tile(tx: i32, ty: i32) -> Vec2 {
        Dungeon::tile_centre(tx, ty)
    }

    /// Hard against the western jamb of `door_world`'s doorway, whatever the
    /// body is: its edge a tenth of a unit off the face at x = 4.
    fn against_the_jamb(w: &World, i: usize) -> Vec2 {
        Vec2::new(
            Fx::from_int(4) - w.radius[i] - Fx::from_ratio(1, 10),
            Fx::from_ratio(25, 10),
        )
    }

    const EAST: Vec2 = Vec2 {
        x: Fx::ONE,
        y: Fx::ZERO,
    };

    #[test]
    fn a_fighter_leaning_on_a_door_opens_it() {
        let mut w = door_world(Body::Fighter);
        assert_eq!(w.doors.len(), 1, "the fixture has one doorway");
        assert!(Body::Fighter.opens_doors());
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);
        w.command[i] = Command::moving(EAST);

        assert!(w.dungeon.solid(4, 2), "the door starts shut");
        for _ in 0..rules::DOOR_TICKS - 1 {
            w.press_doors();
        }
        assert!(
            w.dungeon.solid(4, 2),
            "a door opened in fewer than DOOR_TICKS: half a second is the whole \
             difference between a beat in the fight and a doorway that swings \
             open as you brush past it"
        );
        assert_eq!(w.doors[0].pressed, rules::DOOR_TICKS - 1);

        w.press_doors();
        assert!(w.doors[0].open, "the door never opened");
        assert!(!w.dungeon.solid(4, 2), "the tiles did not follow the door");
        assert_eq!(w.dungeon.open_count(), 19, "the doorway became floor");
    }

    #[test]
    fn a_brute_leaning_on_a_door_does_not() {
        // Anatomy, not intelligence, and not effort either: four times the
        // pressure that opens a door for a Fighter does nothing at all here.
        let mut w = door_world(Body::Brute);
        assert!(!Body::Brute.opens_doors());
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);
        w.command[i] = Command::moving(EAST);

        for _ in 0..rules::DOOR_TICKS * 4 {
            w.press_doors();
        }
        assert!(w.dungeon.solid(4, 2), "a Brute opened a door");
        assert_eq!(w.doors[0].pressed, 0, "and it did not even lean on it");
    }

    #[test]
    fn pressure_decays_when_nobody_is_pushing() {
        let mut w = door_world(Body::Fighter);
        let i = w.alive_ids(Faction::Heroes)[0].index as usize;
        w.pos[i] = against_the_jamb(&w, i);

        // Twenty separate brushes of ten ticks each, which is six hundred and
        // sixty ticks of contact -- twenty-two times what opens a door. None of
        // it accumulates, because the decay is symmetric with the gain and the
        // gap between brushes is as long as the brush.
        for _ in 0..20 {
            w.command[i] = Command::moving(EAST);
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 10);
            w.command[i] = Command::HOLD;
            for _ in 0..10 {
                w.press_doors();
            }
            assert_eq!(w.doors[0].pressed, 0);
        }
        assert!(w.dungeon.solid(4, 2), "a door opened by accident");

        // Standing in the doorway facing away from it is not leaning on it
        // either: proximity alone would have every route on the level opening
        // every door it converged on.
        w.command[i] = Command::moving(Vec2::new(-Fx::ONE, Fx::ZERO));
        for _ in 0..rules::DOOR_TICKS * 2 {
            w.press_doors();
        }
        assert_eq!(w.doors[0].pressed, 0);

        // And so is leaning on it from across the room.
        w.pos[i] = at_tile(1, 2);
        w.command[i] = Command::moving(EAST);
        for _ in 0..rules::DOOR_TICKS * 2 {
            w.press_doors();
        }
        assert_eq!(w.doors[0].pressed, 0);
        assert!(w.dungeon.solid(4, 2));
    }

    #[test]
    fn a_door_half_pushed_open_is_in_the_hash() {
        // `open` is a tile value and therefore already in the dungeon's digest.
        // `pressed` is not, and a door one tick from opening is not the same
        // world as an untouched one: step both on and they diverge.
        let mut a = door_world(Body::Fighter);
        let mut b = door_world(Body::Fighter);
        let i = a.alive_ids(Faction::Heroes)[0].index as usize;
        for w in [&mut a, &mut b] {
            w.pos[i] = against_the_jamb(w, i);
            w.command[i] = Command::moving(EAST);
        }
        assert_eq!(
            a.state_hash(),
            b.state_hash(),
            "two identical worlds must fingerprint alike before anything happens"
        );

        a.press_doors();
        assert_eq!(a.doors[0].pressed, 1);
        assert_eq!(b.doors[0].pressed, 0);
        assert_eq!(
            a.dungeon.fingerprint(),
            b.dungeon.fingerprint(),
            "nothing has opened yet, so the grids are still the same grid"
        );
        assert_ne!(
            a.state_hash(),
            b.state_hash(),
            "a door under pressure fingerprints like an untouched one"
        );
    }

    /// `door_world`, with a monster of `body` standing in the eastern chamber
    /// and the Heroes' Fighter in the western one. The Monsters hunt.
    fn penned_world(body: Body) -> World {
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(&[
            "#########", // 0
            "#...#...#", // 1
            "#...+...#", // 2
            "#...#...#", // 3
            "#########", // 4
        ]);
        scenario.units[0].spawn = at_tile(2, 2);
        scenario.units[1].set_body(body);
        scenario.units[1].spawn = at_tile(6, 2);
        let mut w = World::new(&scenario, 1);
        w.set_objective(Faction::Monsters, Objective::Hunt);
        w
    }

    #[test]
    fn a_skitterer_behind_a_shut_door_has_no_route_to_the_hero() {
        // The engagement the player opens. A Skitterer's field stops at the
        // door, so its own cell reads `u16::MAX`, `nav_step` reports no route,
        // and `UtilityPolicy` falls through to its open-ground drift -- which is
        // the existing, tested answer for a `Goto` sealed behind masonry.
        // Nothing new was needed to make it wait.
        let mut w = penned_world(Body::Skitterer);
        let monster = w.alive_ids(Faction::Monsters)[0];
        let m = monster.index as usize;
        assert!(!Body::Skitterer.opens_doors());
        assert_eq!(w.nav_step(m), (Vec2::ZERO, Fx::MAX));
        assert_eq!(w.observe(monster).nav_distance, Fx::MAX);

        // And it has one the moment the door is floor. Opened through the
        // world's own doorway rather than by writing tiles, so this is the same
        // edit `press_doors` makes.
        let cells = w.doors[0].door.cells().to_vec();
        w.dungeon.open_door(&cells);
        w.doors[0].open = true;
        w.refresh_nav();

        let (dir, left) = w.nav_step(m);
        assert!(left < Fx::MAX, "no route through an open doorway");
        assert!(dir.x < Fx::ZERO, "the route did not head back west: {dir:?}");
    }

    #[test]
    fn a_fighter_behind_a_shut_door_has_a_route_through_it() {
        // The other arm of `World::nav`, on the identical fixture: one field
        // cannot answer for a faction holding both of these, which is why there
        // are two.
        let mut w = penned_world(Body::Fighter);
        let m = w.alive_ids(Faction::Monsters)[0].index as usize;
        assert_eq!(w.nav_arm(m), 1, "a body that opens doors reads the second arm");

        let (dir, left) = w.nav_step(m);
        assert!(left < Fx::MAX, "a Fighter must route through a shut door");
        assert!(dir.x < Fx::ZERO, "the route did not head toward the door: {dir:?}");

        // The Skitterer standing beside it on the same tick still has none, off
        // the same world -- which is the claim "two arms" is making.
        let skitterer = w.spawn(&UnitSpec {
            kind: Body::Skitterer,
            faction: Faction::Monsters,
            stats: Body::Skitterer.base_stats(),
            loadout: Body::Skitterer.default_loadout(),
            articulated: None,
            spawn: at_tile(6, 1),
        });
        w.refresh_nav();
        let s = skitterer.index as usize;
        assert_eq!(w.nav_arm(s), 0);
        assert_eq!(w.nav_step(s), (Vec2::ZERO, Fx::MAX));
        assert!(w.nav_step(m).1 < Fx::MAX, "and the Fighter still has its own");

        // Once the door is open there is nothing to route around, so the second
        // arm stops being built and both bodies read the first.
        let cells = w.doors[0].door.cells().to_vec();
        w.dungeon.open_door(&cells);
        w.doors[0].open = true;
        w.refresh_nav();
        assert_eq!(w.nav_arm(m), 0, "there is nothing left to route around");
        assert_eq!(w.nav_arm(s), 0);
        assert!(w.nav_step(s).1 < Fx::MAX, "and the Skitterer is loose");
    }

    #[test]
    fn a_door_opens_inside_the_tick_loop() {
        // The three tests above drive `press_doors` directly, which is the only
        // way to hold a body against a jamb for exactly `DOOR_TICKS`. This one
        // is the wiring: a walk into a door, through `World::step`, opens it and
        // the route field on the far side notices.
        let mut w = penned_world(Body::Skitterer);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let i = hero.index as usize;
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(at_tile(6, 2)));
        for tick in 0..240 {
            let (dir, _) = w.nav_step(i);
            w.command[i] = Command::moving(if dir.is_zero() { EAST } else { dir });
            w.step();
            if w.doors[0].open {
                assert!(tick >= rules::DOOR_TICKS as u32, "opened in {tick} ticks");
                assert!(!w.dungeon.solid(4, 2));
                // The route field is keyed on the floor plan's digest, so the
                // rebuild is already done by the bottom of the tick that opened
                // it. Nothing invalidates it by hand and nothing should.
                let m = w.alive_ids(Faction::Monsters)[0].index as usize;
                assert!(w.nav_step(m).1 < Fx::MAX, "the Skitterer is still penned");
                return;
            }
        }
        panic!("a Fighter walked into a door for four seconds and it held");
    }

    #[test]
    fn a_route_walks_round_a_wall_rather_than_into_it() {
        //   01234567
        let mut w = carved_world(&[
            "########", // 0
            "#..#...#", // 1
            "#..#...#", // 2
            "#......#", // 3   the way round is south
            "########", // 4
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let dest = Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(dest));
        w.refresh_nav();

        // The route is honestly longer than the straight line, which is the
        // whole reason the straight-line distance could not be reused: at four
        // units of open air the character would think it was nearly there.
        let obs = w.observe(id);
        assert!(obs.nav_distance < Fx::MAX, "there is a way round");
        assert!(obs.nav_distance > (dest - w.pos[i]).length() + Fx::TWO);

        // Asserted by walking it, because that is the claim. A first step due
        // east is perfectly correct here -- the pillar is two tiles away and
        // the way round leaves from the tile next door -- so asserting on the
        // *heading* would be asserting on the shape of this particular map.
        for tick in 0..400 {
            let (dir, left) = w.nav_step(i);
            if left <= w.stats[i].move_speed() {
                assert!(tick > 40, "arrived in {tick} ticks, which is a straight line");
                return;
            }
            w.command[i] = Command::moving(dir);
            w.step();
            assert!(
                w.is_walkable(w.pos[i], w.radius[i]),
                "tick {tick}: the route walked into masonry at {:?}",
                w.pos[i]
            );
        }
        panic!("never arrived; stopped at {:?}", w.pos[i]);
    }

    #[test]
    fn a_route_across_open_ground_is_the_straight_line() {
        // The line-of-walk shortcut. Without it a character crosses a room tile
        // centre to tile centre like a chess piece.
        let mut w = carved_world(&[
            "########", //
            "#......#",
            "#......#",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let dest = Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(35, 10));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Goto(dest));
        w.refresh_nav();

        let obs = w.observe(id);
        let straight = dest - w.pos[i];
        assert_eq!(obs.nav_dir, straight.normalize());
        assert_eq!(obs.nav_distance, straight.length());
    }

    #[test]
    fn a_route_leads_to_the_quarry_a_focus_names() {
        // The same floor plan and the same walk as
        // `a_route_walks_round_a_wall_rather_than_into_it`, with a body
        // standing on the destination instead of a click sitting there. That
        // is the whole of the claim: naming a quarry names a place.
        //   01234567
        let mut w = carved_world(&[
            "########", // 0
            "#..#...#", // 1
            "#..#...#", // 2
            "#......#", // 3   the way round is south
            "########", // 4
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        w.pos[i] = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        let prey = monster_at(&mut w, Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10)));
        let q = prey.index as usize;
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Focus(prey));

        // Honestly longer than the straight line, so a hero four units of open
        // air from its quarry does not believe it is nearly there.
        let mut left = w.observe(id).nav_distance;
        assert!(left < Fx::MAX, "there is a way round");
        assert!(left > (w.pos[q] - w.pos[i]).length() + Fx::TWO);

        // Arrival is the width of the pair rather than one tick of travel,
        // because the goal point is a body and `World::separate` will not let
        // the hero stand on it.
        let touching = w.radius[i] + w.radius[q] + w.stats[i].move_speed();
        for tick in 0..400 {
            let (dir, now) = w.nav_step(i);
            if now <= touching {
                assert!(tick > 40, "arrived in {tick} ticks, which is a straight line");
                return;
            }
            // The ground left never grows. A route that grows is a route being
            // rebuilt around a quarry the hero has not actually moved toward,
            // which is how "follow that one" turns into a hero walking in
            // circles behind a wall.
            assert!(now <= left, "tick {tick}: the route got longer, {left} -> {now}");
            left = now;
            w.command[i] = Command::moving(dir);
            w.step();
            assert!(
                w.is_walkable(w.pos[i], w.radius[i]),
                "tick {tick}: the route walked into masonry at {:?}",
                w.pos[i]
            );
        }
        panic!("never reached the quarry; stopped at {:?}", w.pos[i]);
    }

    #[test]
    fn a_focus_on_a_corpse_is_no_route() {
        // Three ways for a `Focus` to name nobody -- a handle whose body has
        // been reaped, a generation that has moved on, and one of your own --
        // and one answer to all three, because they leave the seed list empty
        // by the same door. One test rather than three: what is being pinned
        // is that none of them ever reaches an index, and
        // `feature_vector_has_a_stable_width` already drives every order kind
        // onto both factions at once, so this arm is load-bearing well before
        // anything constructs a `Focus` on purpose.
        let mut w = carved_world(&[
            "########", //
            "#......#",
            "#......#",
            "#......#",
            "########",
        ]);
        let id = w.alive_ids(Faction::Heroes)[0];
        let i = id.index as usize;
        let prey = monster_at(&mut w, Vec2::new(Fx::from_ratio(55, 10), Fx::from_ratio(15, 10)));
        w.set_objective(Faction::Heroes, Objective::Order);
        w.set_order(Faction::Heroes, Order::Focus(prey));

        // The control, so that a failure below is the corpse and not the
        // fixture: while the quarry is standing there is a route to it.
        assert_ne!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "the fixture never routed to a living quarry"
        );

        w.hp[prey.index as usize] = Fx::ZERO;
        w.step();
        assert!(!w.is_alive(prey), "the quarry survived being emptied");
        w.refresh_nav();
        assert_eq!(w.nav_step(i), (Vec2::ZERO, Fx::MAX), "routed at a corpse");

        // A generation that has moved on, aimed at a slot that is very much
        // occupied -- the case a `Goto` can never produce and the one that
        // would index a stranger.
        w.set_order(
            Faction::Heroes,
            Order::Focus(EntityId::new(i as u32, w.generation[i] + 1)),
        );
        assert_eq!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "routed at a stale handle"
        );

        // And one of your own, alive and resolving perfectly well. Nothing
        // constructs this yet; `World::set_order` is a public door and the
        // sim is total behind it.
        w.set_order(Faction::Heroes, Order::Focus(id));
        assert_eq!(
            w.nav_step(i),
            (Vec2::ZERO, Fx::MAX),
            "routed at its own side"
        );
    }

    #[test]
    fn an_arrow_flies_down_an_open_corridor() {
        // The other half of the rule above: masonry stops an arrow, and open
        // ground does not stop it early.
        let mut w = carved_world(&[
            "#########", //
            "#.......#",
            "#########",
        ]);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let from = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.pos[archer.index as usize] = from;
        // Nobody to hit: the archer is the only body in the room, and a shot
        // never resolves against its own owner however the flight curves back.

        let k = w.free_shot().expect("a free arrow slot");
        w.shot_alive[k] = true;
        w.shot_pos[k] = from;
        w.shot_vel[k] = Vec2::new(Fx::from_ratio(5, 10), Fx::ZERO);
        w.shot_range[k] = Fx::from_int(20);
        w.shot_mass[k] = Fx::ONE;
        w.shot_power[k] = Fx::ONE;
        w.shot_owner[k] = archer;
        w.shot_faction[k] = Faction::Heroes;

        for _ in 0..8 {
            w.resolve_shots();
        }
        assert_eq!(w.shots().count(), 1, "stopped in mid-air");
        assert!(w.shot_pos[k].x > Fx::from_int(5));
    }

    // ------------------------------------------------------------------ sight

    /// A world on `rows` holding `bodies` exactly where they are listed, and
    /// nothing else.
    ///
    /// Every occlusion test below is a statement about *who is in whose contact
    /// list*, so the fixture has to be able to say where four or five bodies
    /// stand and which side each is on. `carved_world` deliberately carries one
    /// body and every caller places it by hand; this is the same bargain widened,
    /// and the spawn is used verbatim -- `World::spawn` does not snap a placement
    /// to clear ground, which is what lets a test press a body against a wall
    /// face on purpose.
    fn peopled_world(rows: &[&str], bodies: &[(Body, Faction, Vec2)]) -> World {
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(rows);
        scenario.units = bodies
            .iter()
            .map(|&(kind, faction, spawn)| UnitSpec {
                kind,
                faction,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                articulated: None,
                spawn,
            })
            .collect();
        World::new(&scenario, 1)
    }

    /// The contact list `observe` would have produced before rock stopped eyes:
    /// everything of `side` inside `i`'s sight range, nearest first, cut to `i`'s
    /// perception cap. `Nearest` breaks ties on the entity index, so a plain sort
    /// of `(distance, index)` reproduces its order exactly.
    fn by_distance_alone(w: &World, i: usize, side: Faction) -> Vec<EntityId> {
        let sight = w.stats[i].sight_range();
        let mut found: Vec<(Fx, usize)> = (0..w.alive.len())
            .filter(|&j| j != i && w.alive[j] && w.faction[j] == side)
            .map(|j| ((w.pos[j] - w.pos[i]).length(), j))
            .filter(|&(d, _)| d <= sight)
            .collect();
        found.sort();
        found.truncate(w.stats[i].tracked_contacts());
        found.into_iter().map(|(_, j)| w.id_of(j)).collect()
    }

    #[test]
    fn on_an_open_floor_plan_every_contact_survives() {
        // **The test that protects `LAB_HASH`**, and it makes the claim in two
        // pieces because the claim has two halves.
        //
        // The first half is that `Dungeon::open` really is the uncarved value the
        // short-circuit keys on however it was arrived at -- reached here once
        // through `Scenario::room` and once through a hand-written grid of the
        // same extent, which is the construction path `dungeon::parse` and the
        // generator both take.
        //
        // The second half is the one that would actually catch a regression, and
        // it is not a comparison between two runs of the new code: it recomputes
        // the *old* rule -- distance and the perception cap, no line of sight at
        // all -- and asserts the observation is that list, in that order, for
        // every body on the field. Every scenario in the repository but a
        // generated one is uncarved, so if this holds then none of them moved,
        // and the number the lab prints cannot have.
        let bodies = [
            (Body::Fighter, Faction::Heroes, Vec2::from_ints(10, 8)),
            (Body::Fighter, Faction::Heroes, Vec2::from_ints(12, 6)),
            (Body::Rogue, Faction::Heroes, Vec2::from_ints(4, 13)),
            (Body::Skitterer, Faction::Monsters, Vec2::from_ints(13, 9)),
            (Body::Skitterer, Faction::Monsters, Vec2::from_ints(15, 7)),
            (Body::Brute, Faction::Monsters, Vec2::from_ints(18, 12)),
        ];
        let build = |dungeon: Dungeon| {
            let mut scenario = Scenario::room();
            scenario.dungeon = dungeon;
            scenario.units = bodies
                .iter()
                .map(|&(kind, faction, spawn)| UnitSpec {
                    kind,
                    faction,
                    stats: kind.base_stats(),
                    loadout: kind.default_loadout(),
                    articulated: None,
                    spawn,
                })
                .collect();
            World::new(&scenario, 9)
        };
        let room = Scenario::room().dungeon;
        let by_hand = crate::dungeon::parse(&[".".repeat(24).as_str(); 16]);
        assert_eq!(room.extent(), by_hand.extent(), "the twins differ in size");
        assert!(!room.carved() && !by_hand.carved());
        assert_eq!(room, by_hand, "two ways of writing the same empty room");

        let a = build(room);
        let b = build(by_hand);
        let mut left = vec![Fx::ZERO; crate::obs::FEATURE_COUNT];
        let mut right = vec![Fx::ZERO; crate::obs::FEATURE_COUNT];

        let mut contacts = 0;
        for id in a.alive_ids(Faction::Heroes).into_iter().chain(a.alive_ids(Faction::Monsters)) {
            let i = id.index as usize;
            let obs = a.observe(id);

            // Field for field, against the twin. The feature vector rather than
            // the struct because it is what a mind is actually handed, it is
            // `Fx` throughout so a mismatch is a mismatch, and `Observation` has
            // no `PartialEq` to lean on.
            obs.write_features(&mut left);
            b.observe(id).write_features(&mut right);
            assert_eq!(left, right, "entity {i} observed two empty rooms differently");

            // And against the rule that was here before this change set.
            let enemy_side = match a.faction[i] {
                Faction::Heroes => Faction::Monsters,
                Faction::Monsters => Faction::Heroes,
            };
            let seen: Vec<EntityId> = obs.enemies().iter().map(|c| c.id).collect();
            assert_eq!(seen, by_distance_alone(&a, i, enemy_side), "entity {i}'s foes");
            let allied: Vec<EntityId> = obs.allies().iter().map(|c| c.id).collect();
            assert_eq!(allied, by_distance_alone(&a, i, a.faction[i]), "entity {i}'s allies");
            contacts += seen.len() + allied.len();
        }
        assert!(
            contacts > 12,
            "the fixture produced {contacts} contacts, so it proves very little"
        );
    }

    #[test]
    fn a_foe_behind_one_tile_of_rock_is_not_a_contact() {
        // **The reported bug, as a fixture.** A Fighter (radius 0.45) and a
        // Skitterer (0.30) pressed against opposite faces of a single tile of
        // masonry are 0.45 + 1.00 + 0.30 = 1.75 apart -- well inside the dimmest
        // sight range in the game -- and used to appear in each other's contact
        // list, which is what took both policies out of `march` and into
        // `engage` and left them swinging at a wall forever.
        //
        //   0123456789
        let rows = [
            "##########", // 0
            "#..#.....#", // 1  a pillar at (3, 1)
            "#........#", // 2  and the same span of floor, uninterrupted
            "##########", // 3
        ];
        // Hard against the two faces of column 3, to a hundredth: `overlaps`
        // compares strictly, so a body exactly touching a face still fits, and
        // both of these are legal standing room.
        let west = Fx::from_ratio(255, 100);
        let east = Fx::from_ratio(430, 100);
        let apart = Fx::from_ratio(175, 100);

        for (row, blocked) in [(1, true), (2, false)] {
            let y = Fx::from_int(row) + Fx::HALF;
            let w = peopled_world(
                &rows,
                &[
                    (Body::Fighter, Faction::Heroes, Vec2::new(west, y)),
                    (Body::Skitterer, Faction::Monsters, Vec2::new(east, y)),
                ],
            );
            let hero = w.alive_ids(Faction::Heroes)[0];
            let foe = w.alive_ids(Faction::Monsters)[0];

            // The premises, so that a failure below is about sight and not about
            // arithmetic drifting out from under the test.
            assert_eq!(
                (w.pos[foe.index as usize] - w.pos[hero.index as usize]).length(),
                apart,
                "row {row}: the fixture is not 1.75 apart"
            );
            for id in [hero, foe] {
                let i = id.index as usize;
                assert!(
                    w.dungeon.is_clear(w.pos[i], w.radius[i]),
                    "row {row}: entity {i} is standing in the rock"
                );
                assert!(
                    apart <= w.stats[i].sight_range(),
                    "row {row}: entity {i} could not see that far in any case"
                );
            }

            let hero_sees = w.observe(hero);
            let foe_sees = w.observe(foe);
            if blocked {
                assert!(
                    hero_sees.enemies().is_empty(),
                    "the hero saw through a wall: {:?}",
                    hero_sees.enemies()
                );
                assert!(
                    foe_sees.enemies().is_empty(),
                    "the monster saw through a wall: {:?}",
                    foe_sees.enemies()
                );
            } else {
                // The same distance, the same bodies, the same carved level --
                // only the tile between them is gone. If this half ever fails,
                // the ray is not permissive, it is broken.
                assert_eq!(
                    hero_sees.enemies().iter().map(|c| c.id).collect::<Vec<_>>(),
                    vec![foe],
                    "the corridor is open and the hero still saw nothing"
                );
                assert_eq!(
                    foe_sees.enemies().iter().map(|c| c.id).collect::<Vec<_>>(),
                    vec![hero]
                );
            }
        }
    }

    #[test]
    fn occlusion_applies_to_allies_too() {
        // Why `sees` is asked about allies and not only about enemies:
        // `cohesion` and `ally_centre` steer a body toward the mean of the
        // friends it can see, so a squadmate on the far side of a wall walks the
        // formation into the wall exactly as a target on the far side of one
        // walks the fight into it.
        //
        //   0123456
        let w = peopled_world(
            &[
                "#######", // 0
                "#..#..#", // 1
                "#.....#", // 2
                "#######", // 3
            ],
            &[
                (Body::Fighter, Faction::Heroes, Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10))),
                (Body::Fighter, Faction::Heroes, Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(25, 10))),
                (Body::Fighter, Faction::Heroes, Vec2::new(Fx::from_ratio(45, 10), Fx::from_ratio(15, 10))),
            ],
        );
        let ids = w.alive_ids(Faction::Heroes);
        let (me, beside, behind) = (ids[0], ids[1], ids[2]);
        let i = me.index as usize;

        // Both allies are in range, and the perception cap has room for both, so
        // neither of those can be the reason one of them is missing.
        assert!(w.stats[i].tracked_contacts() >= 2);
        for other in [beside, behind] {
            let d = (w.pos[other.index as usize] - w.pos[i]).length();
            assert!(d <= w.stats[i].sight_range(), "{other:?} is out of range at {d}");
        }

        let obs = w.observe(me);
        assert_eq!(
            obs.allies().iter().map(|c| c.id).collect::<Vec<_>>(),
            vec![beside],
            "the ally behind the pillar is still being steered toward"
        );
    }

    #[test]
    fn occlusion_is_applied_before_the_perception_cap() {
        // The placement of the one line, asserted rather than argued. A dim
        // observer holds two contacts in mind; four foes are inside its 6.0 of
        // sight, and the *two nearest* are behind rock. Spend the budget on the
        // nearest and the observation comes back full of masonry and the body
        // never learns about the pair it can actually see -- which is why the ray
        // fires before `Nearest::offer` and not after it.
        //
        //   012345678901
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(&[
            "############", // 0
            "#..#.......#", // 1
            "#..#.......#", // 2
            "#..#.......#", // 3
            "#..#.......#", // 4
            "#..........#", // 5   the way round, at the bottom
            "############", // 6
        ]);
        let place = |x, y| Vec2::new(Fx::from_ratio(x, 10), Fx::from_ratio(y, 10));
        let hidden = [place(45, 15), place(45, 25)];
        let visible = [place(15, 55), place(25, 55)];
        scenario.units = std::iter::once((Body::Fighter, Faction::Heroes, place(15, 15)))
            .chain(
                hidden
                    .iter()
                    .chain(visible.iter())
                    .map(|&at| (Body::Skitterer, Faction::Monsters, at)),
            )
            .map(|(kind, faction, spawn)| UnitSpec {
                kind,
                faction,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                articulated: None,
                spawn,
            })
            .collect();
        // Half blind: `tracked_contacts` is 2 and `sight_range` is 6.0.
        scenario.units[0].stats.perception = 0;
        let w = World::new(&scenario, 1);

        let me = w.alive_ids(Faction::Heroes)[0];
        let i = me.index as usize;
        assert_eq!(w.stats[i].tracked_contacts(), 2);
        let foes = w.alive_ids(Faction::Monsters);

        // The premise: all four are in range, and the two behind the wall are
        // the two the old rule would have picked.
        let mut ranked: Vec<(Fx, EntityId)> = foes
            .iter()
            .map(|&id| ((w.pos[id.index as usize] - w.pos[i]).length(), id))
            .collect();
        for &(d, id) in &ranked {
            assert!(d <= w.stats[i].sight_range(), "{id:?} is out of range at {d}");
        }
        ranked.sort();
        assert_eq!(
            ranked[..2].iter().map(|&(_, id)| id).collect::<Vec<_>>(),
            foes[..2].to_vec(),
            "the fixture did not put the hidden pair nearest"
        );

        let obs = w.observe(me);
        assert_eq!(
            obs.enemies().iter().map(|c| c.id).collect::<Vec<_>>(),
            foes[2..].to_vec(),
            "the budget was spent on the foes behind the wall"
        );
    }

    /// Puts the roster's longest weapon in a Fighter's hand, points it due east
    /// at a Skitterer 1.75 away, and resolves one tick of swing. Answers what the
    /// Skitterer lost.
    ///
    /// `Club` because it is the 1.45 row -- the Brute's axe, and the only thing
    /// in the game long enough to make this a live question. A Fighter's 0.45
    /// plus 1.45 of haft plus a Skitterer's 0.30 is 2.20 of pair reach against
    /// the 1.75 that two bodies pressed on opposite faces of one tile of masonry
    /// are apart, so the geometry overlaps by 0.45 and the only thing that can
    /// stop the blow is the rule under test.
    ///
    /// No sweep: `blade_was` is left `None`, so the blade is tested where it is
    /// -- which is what the un-swept version did for everything and is all this
    /// needs. What it does need is spin, because a resting blade does no damage
    /// however squarely it overlaps a body.
    fn one_long_swing(rows: &[&str], row: i32) -> (World, Fx, Fx) {
        let y = Fx::from_int(row) + Fx::HALF;
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(rows);
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), y);
        scenario.units[0].loadout = Loadout::single(ActionKind::Club);
        scenario.units[1].kind = Body::Skitterer;
        scenario.units[1].stats = Body::Skitterer.base_stats();
        scenario.units[1].loadout = Loadout::single(ActionKind::Knife);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(430, 100), y);
        let mut w = World::new(&scenario, 1);

        let (i, j) = (
            w.alive_ids(Faction::Heroes)[0].index as usize,
            w.alive_ids(Faction::Monsters)[0].index as usize,
        );
        let before = w.hp[j];
        w.limb[i].angle = Angle::ZERO; // due east, straight at the Skitterer
        w.limb[i].reach = Fx::ONE;
        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);

        // The geometry, before the floor plan gets a say: the blade genuinely
        // crosses the body. Without this a passing test proves only that
        // something else missed.
        let (base, tip) = w.blade(i).expect("the blade is out");
        assert!(
            fx::segment_circle(base, tip, w.pos[j], w.radius[j]).is_some(),
            "premise: the blade does not reach the body at all"
        );

        w.resolve_swings();
        let lost = before - w.hp[j];
        (w, before, lost)
    }

    #[test]
    fn a_blade_cannot_cut_through_a_one_tile_wall() {
        //   0123456789
        let (w, before, lost) = one_long_swing(
            &[
                "##########", // 0
                "#..#.....#", // 1  a pillar at (3, 1)
                "#........#", // 2
                "##########", // 3
            ],
            1,
        );
        assert_eq!(lost, Fx::ZERO, "the axe cut through a tile of masonry");
        assert_eq!(w.damage_dealt(Faction::Heroes), Fx::ZERO);
        // No event either, which is the same treatment an arrow that meets rock
        // gets: the blow did not happen, so there is nothing to report.
        assert!(
            w.events.is_empty(),
            "a wall is not something to raise an event about: {:?}",
            w.events
        );
        assert!(before.is_positive(), "premise: there was health to take");
    }

    #[test]
    fn a_blade_still_cuts_what_it_can_see() {
        // The masonry test must not be a blanket refusal, and the level here is
        // still `carved` -- so `raycast` really runs and really answers "nothing
        // in the way". The only difference from the test above is which row the
        // pair stands in.
        let (w, _, lost) = one_long_swing(
            &[
                "##########", // 0
                "#..#.....#", // 1
                "#........#", // 2  the same span of floor, uninterrupted
                "##########", // 3
            ],
            2,
        );
        assert!(w.dungeon.carved(), "premise: the plan has rock in it");
        assert!(lost.is_positive(), "the axe stopped at open air");
    }

    #[test]
    fn charging_a_heavier_body_costs_the_charger_more() {
        // Barging is now a decision with a price, and the price scales with who
        // you barge. Both are thrown, and the light one is thrown further.
        let mut w = World::new(&Scenario::duel_of(Body::Skitterer, Body::Brute, 1), 1);
        let light = w.alive_ids(Faction::Heroes)[0].index as usize;
        let heavy = w.alive_ids(Faction::Monsters)[0].index as usize;

        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[light] = middle;
        w.pos[heavy] = middle + Vec2::new(w.radius[light] + w.radius[heavy], Fx::ZERO);
        // Both walking into each other at their own top speeds.
        w.vel[light] = Vec2::new(w.stats[light].move_speed(), Fx::ZERO);
        w.vel[heavy] = Vec2::new(-w.stats[heavy].move_speed(), Fx::ZERO);
        // Just overlapping, so `separate` engages.
        w.pos[heavy] -= Vec2::new(Fx::from_ratio(1, 100), Fx::ZERO);

        w.separate();

        assert!(
            !w.vel[light].x.is_positive(),
            "the Skitterer kept driving through a Brute at {}",
            w.vel[light].x
        );
        // Momentum is conserved along the normal: what one side loses the other
        // gains, in proportion to mass.
        let before = w.stats[light].move_speed() * w.mass[light]
            - w.stats[heavy].move_speed() * w.mass[heavy];
        let after = w.vel[light].x * w.mass[light] + w.vel[heavy].x * w.mass[heavy];
        assert!(
            (before - after).abs() < Fx::from_ratio(1, 1000),
            "momentum along the normal went from {before} to {after}"
        );
    }

    #[test]
    fn the_lighter_body_gives_more_ground() {
        // Crowding a heavy weapon is the strongest answer to one, and it used
        // to be free to hold: the overlap was split down the middle, so a
        // Skitterer pressed against a Brute shoved exactly as hard as it was
        // shoved. Now the ground each yields is the *other* one's weight.
        let mut w = World::new(&Scenario::duel_of(Body::Skitterer, Body::Brute, 1), 1);
        let light = w.alive_ids(Faction::Heroes)[0].index as usize;
        let heavy = w.alive_ids(Faction::Monsters)[0].index as usize;
        assert!(w.mass[heavy] > w.mass[light], "premise");

        // Overlapping by a quarter of a unit, along the x axis so the shove is
        // one component and the arena walls are nowhere near.
        let touching = w.radius[light] + w.radius[heavy];
        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[light] = middle;
        w.pos[heavy] = middle + Vec2::new(touching - Fx::from_ratio(25, 100), Fx::ZERO);
        let (was_light, was_heavy) = (w.pos[light], w.pos[heavy]);

        w.separate();

        let moved_light = (w.pos[light] - was_light).length();
        let moved_heavy = (w.pos[heavy] - was_heavy).length();
        assert!(moved_light.is_positive() && moved_heavy.is_positive());
        assert!(
            moved_light > moved_heavy * Fx::TWO,
            "the Skitterer gave {moved_light} and the Brute {moved_heavy}"
        );
        // Momentum, in the only sense a positional correction has one: the
        // shoves are in inverse proportion to the masses, so mass times
        // displacement matches on both sides.
        let a = moved_light * w.mass[light];
        let b = moved_heavy * w.mass[heavy];
        assert!(
            (a - b).abs() < Fx::from_ratio(1, 1000),
            "mass-weighted displacement did not balance: {a} vs {b}"
        );
    }

    #[test]
    fn equal_bodies_still_split_a_shove_evenly() {
        // The mirror case the old rule got right and the new one must not
        // break: two identical fighters must each give exactly half, or a
        // symmetric duel picks a winner out of the collision solver.
        let mut w = World::new(&Scenario::duel_of(Body::Fighter, Body::Fighter, 1), 1);
        let (a, b) = (
            w.alive_ids(Faction::Heroes)[0].index as usize,
            w.alive_ids(Faction::Monsters)[0].index as usize,
        );
        let middle = Vec2::new(w.arena.x * Fx::HALF, w.arena.y * Fx::HALF);
        w.pos[a] = middle;
        w.pos[b] = middle + Vec2::new(Fx::from_ratio(60, 100), Fx::ZERO);
        let (was_a, was_b) = (w.pos[a], w.pos[b]);

        w.separate();

        assert_eq!((w.pos[a] - was_a).length(), (w.pos[b] - was_b).length());
    }

    #[test]
    fn a_blade_that_crosses_a_body_inside_one_tick_still_bills_a_blow() {
        // The sweep, end to end.
        //
        // A hand turning fast enough can put its tip on the far side of a body
        // between two samples, and a closest-approach test then sees a blade
        // that was never near anyone. It used to be held off by capping how
        // fast a hand may turn -- a *physics* limit imposed by a hit test,
        // which is exactly backwards, and a cap that has to go the moment a
        // blow can throw a body faster than it walks.
        let mut w = duel_world();
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let (i, j) = (brute.index as usize, hero.index as usize);

        // Hero two units due east of the brute, well inside its 2.15 of reach.
        // Nobody is walking, so the only motion in the tick is the arm's.
        w.pos[i] = w.pos[j] - Vec2::new(Fx::TWO, Fx::ZERO);
        w.start_pos[i] = w.pos[i];
        w.start_pos[j] = w.pos[j];
        w.limb[i].reach = Fx::ONE;
        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);

        // A quarter turn in one tick: 22.5 degrees short of the hero to 22.5
        // degrees past it. The blade is clear of the body at *both* ends and
        // squarely through it in the middle.
        w.limb[i].angle = Angle::from_raw(61_440);
        let before = w.blade(i).expect("the blade is out");
        w.limb[i].angle = Angle::from_raw(4_096);
        let after = w.blade(i).expect("the blade is out");

        for (label, (base, tip)) in [("before", before), ("after", after)] {
            assert!(
                fx::segment_circle(base, tip, w.pos[j], w.radius[j]).is_none(),
                "premise: the {label} sample should miss, or this proves nothing"
            );
        }

        // Health, and not `self.blows`, because pass 2 drains that buffer
        // before it returns -- asserting on it would pass for both outcomes.
        let full = w.hp[j];

        // A blade with no history is tested where it is, and misses. This is
        // precisely what the old code did on every tick of every fight.
        w.blade_was[i] = None;
        w.resolve_swings();
        assert_eq!(w.hp[j], full, "premise: nothing to sweep, nothing to hit");

        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);
        w.blade_was[i] = Some(before);
        w.resolve_swings();
        assert!(w.hp[j] < full, "the blade passed clean through a body");
    }

    #[test]
    fn impact_is_the_blade_plus_the_closing_and_backing_off_helps() {
        // The two terms, separated. Spin does not care which way it turns --
        // a blade cuts on the backswing too -- but the bodies' closing speed is
        // signed, so retreating from a blow takes something off it.
        let mut w = duel_world();
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let (i, j) = (brute.index as usize, hero.index as usize);
        w.limb[i].reach = Fx::ONE;
        // Brute two units east of the hero; contact on the hero's eastern
        // surface, which is the side the blow is coming from. "Away" is then
        // due west, and the sign of the closing term is unambiguous.
        w.pos[i] = w.pos[j] + Vec2::new(Fx::TWO, Fx::ZERO);
        let contact = w.pos[j] + Vec2::new(w.radius[j], Fx::ZERO);

        w.limb[i].spin = Fx::from_int(900);
        let clockwise = w.impact_speed(i, j, contact);
        w.limb[i].spin = Fx::from_int(-900);
        let widdershins = w.impact_speed(i, j, contact);
        assert!(clockwise.is_positive(), "a moving blade registered nothing");
        assert_eq!(clockwise, widdershins, "the backswing is not a cut");

        // Now give the defender some motion. Away from the contact is worth
        // less damage; into it is worth more.
        let away = Vec2::new(-Fx::from_ratio(6, 100), Fx::ZERO);
        w.vel[j] = away;
        let retreating = w.impact_speed(i, j, contact);
        w.vel[j] = -away;
        let charging = w.impact_speed(i, j, contact);
        assert!(
            retreating < widdershins && widdershins < charging,
            "closing speed did not register: {retreating} / {widdershins} / {charging}"
        );
    }

    #[test]
    fn bodies_are_pushed_apart_and_stay_in_the_arena() {
        let mut scenario = Scenario::duel();
        // Spawn both units on the exact same spot: the degenerate case.
        scenario.units[1].spawn = scenario.units[0].spawn;
        let mut w = World::new(&scenario, 1);
        for _ in 0..120 {
            w.step();
        }
        let snap = w.snapshot();
        let a = snap.units[0].position;
        let b = snap.units[1].position;
        let separation = (a - b).length();
        assert!(
            separation > Fx::ZERO,
            "coincident units never separated: {a:?} {b:?}"
        );
        for u in &snap.units {
            assert!(u.position.x >= Fx::ZERO && u.position.x <= w.arena().x);
            assert!(u.position.y >= Fx::ZERO && u.position.y <= w.arena().y);
        }
    }

    #[test]
    fn perception_noise_makes_a_dim_unit_see_wrong_but_a_sharp_one_see_true() {
        let mut scenario = Scenario::duel();
        scenario.units[0].stats.perception = 20; // perfect
        scenario.units[1].stats.perception = 0; // half blind
                                                // Close enough that even 6.0 units of sight reaches.
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::from_ints(14, 8);
        let w = World::new(&scenario, 99);
        let sharp = w.alive_ids(Faction::Heroes)[0];
        let dim = w.alive_ids(Faction::Monsters)[0];

        let sharp_truth = w.view(dim).unwrap().position - w.view(sharp).unwrap().position;
        let dim_truth = -sharp_truth;

        assert_eq!(
            w.observe(sharp).nearest_enemy().unwrap().offset,
            sharp_truth,
            "perfect perception should be exact"
        );
        assert_ne!(
            w.observe(dim).nearest_enemy().unwrap().offset,
            dim_truth,
            "zero perception should be noisy"
        );
    }

    #[test]
    fn observation_is_a_pure_function_of_state() {
        let w = World::new(&Scenario::skirmish(3, 3, 4), 77);
        for id in w.pending_decisions() {
            let a = w.observe(*id);
            let b = w.observe(*id);
            assert_eq!(a.hp_frac, b.hp_frac);
            assert_eq!(a.enemies().len(), b.enemies().len());
            for (x, y) in a.enemies().iter().zip(b.enemies()) {
                assert_eq!(x, y, "observation noise was not reproducible");
            }
        }
    }

    #[test]
    fn perception_caps_how_much_of_the_field_is_visible() {
        let mut scenario = Scenario::skirmish(5, 1, 8);
        // Put a dim hero in the middle of the swarm.
        scenario.units[0].stats.perception = 0;
        let middle = scenario.arena() * Fx::HALF;
        scenario.units[0].spawn = middle;
        for u in scenario.units.iter_mut().skip(1) {
            u.spawn = middle + Vec2::from_ints(1, 1);
        }
        let w = World::new(&scenario, 5);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let obs = w.observe(hero);
        assert_eq!(
            obs.enemies().len(),
            Stats::tracked_contacts(w.view(hero).unwrap().stats),
            "a dim unit tracked more contacts than its perception allows"
        );
    }

    #[test]
    fn feature_vector_has_a_stable_width() {
        let mut w = World::new(&Scenario::skirmish(11, 2, 3), 4);
        let mut buffer = vec![Fx::ZERO; crate::obs::FEATURE_COUNT];
        // Every order kind, because the order slot is the one part of the
        // layout whose value depends on which variant is standing. The `Goto`
        // destination sits far outside the arena on purpose: it is the case
        // where an unclamped world-space point would leave the range.
        for order in [
            Order::Hold,
            Order::Advance(Vec2::from_ints(30, -40)),
            Order::Regroup,
            Order::Focus(EntityId::NONE),
            Order::Goto(Vec2::from_ints(400, -400)),
        ] {
            w.set_order(Faction::Heroes, order);
            w.set_order(Faction::Monsters, order);
            for id in w.pending_decisions() {
                let written = w.observe(*id).write_features(&mut buffer);
                assert_eq!(written, crate::obs::FEATURE_COUNT);
                for (k, v) in buffer.iter().enumerate() {
                    assert!(
                        v.abs() <= Fx::from_int(2),
                        "feature {k} out of range under {order:?}: {v}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_character_knows_its_own_reaction_speed() {
        let w = World::new(&Scenario::room(), 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        assert_eq!(
            w.observe(hero).decision_period,
            Stats::decision_period(w.view(hero).unwrap().stats)
        );
    }

    #[test]
    fn nearest_keeps_the_closest_in_order() {
        let mut n = Nearest::new(3);
        for (d, i) in [(5, 0), (1, 1), (9, 2), (3, 3), (1, 4)] {
            n.offer(Fx::from_int(d), i);
        }
        let got: Vec<usize> = n.items().iter().map(|&(_, i)| i).collect();
        // 1@1 and 1@4 tie on distance; the lower index wins.
        assert_eq!(got, vec![1, 4, 3]);
    }

    // ---------------------------------------------------------------- the swap

    /// A Fighter at striking distance carrying sword-and-shield, and an attacker
    /// of `body` pressing **one** cut into it. Returns whether that cut was
    /// blocked.
    ///
    /// The defender reaches for its shield the first time it *notices* a windup,
    /// and it only notices on its own decision ticks -- every
    /// `Stats::decision_period`, which for a Fighter is 12. That latency is not
    /// a handicap invented for the test; it is the whole of what `intellect`
    /// buys in this game, and a fighter that reacted on the exact tick a blade
    /// moved would not be a fighter.
    ///
    /// Worth knowing, because the naive arithmetic is wrong in a way that
    /// flatters the defender: the budget is **not** just the telegraph. A cut
    /// also has to travel, and contact happens some way into the strike phase,
    /// so the true window is windup plus part of the swing. Reaching at tick
    /// zero, a Fighter can get a shield up inside even a knife. It is reaction
    /// latency that makes a fast weapon unanswerable, not the telegraph alone --
    /// which is a better fact than the one the tuning was designed around, and
    /// it is why this is measured through a live world instead of on paper.
    fn answered_by_a_swap(attacker: Body, guard_at: Angle) -> bool {
        let mut scenario = Scenario::duel();
        scenario.units[0].set_body(Body::Fighter);
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        scenario.units[0].spawn = Vec2::from_ints(17, 8);
        scenario.units[1].set_body(attacker);
        scenario.units[1].spawn = Vec2::from_ints(18, 8);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let foe = w.alive_ids(Faction::Monsters)[0];
        // Enough health to survive being measured.
        let h = w.resolve(hero).unwrap();
        w.hp[h] = Fx::from_int(4000);
        w.max_hp[h] = Fx::from_int(4000);

        let period = Body::Fighter.base_stats().decision_period() as u32;
        let mut reaching = false;
        let mut committed = false;
        let mut saw_windup_at: Option<u32> = None;
        for tick in 0..400u32 {
            let cut = cutting(&w, foe, Angle::HALF, Strike::Nearest);
            w.submit(foe, Command::swinging(Vec2::ZERO, hero, cut));

            // The read, on this fighter's own clock. It sees the blade cocked,
            // and acts on it at its next decision.
            let phase = w.view(foe).unwrap().limb.swing;
            if phase == Swing::Windup && saw_windup_at.is_none() {
                saw_windup_at = Some(tick);
            }
            if let Some(seen) = saw_windup_at {
                if tick >= seen + period {
                    reaching = true;
                }
            }
            if phase.is_attacking() {
                committed = true;
            }
            let mut answer = Command::swinging(
                Vec2::ZERO,
                EntityId::NONE,
                LimbCommand::new(guard_at, Fx::ONE),
            );
            answer.slot = if reaching { 1 } else { 0 };
            w.submit(hero, answer);

            if w.step().iter().any(|e| matches!(e, Event::Block { .. })) {
                return true;
            }
            // **Measure exactly one cut.** Left running, the defender ends up
            // standing behind a shield it drew during the first telegraph and
            // blocks the fifth attack -- which says nothing about whether the
            // telegraph could be answered, and would let a knife pass this by
            // being thrown repeatedly.
            if committed && w.view(foe).unwrap().limb.swing == Swing::Guard {
                return false;
            }
        }
        false
    }

    /// **Constraint 1 of the swap tuning, through a live world.**
    ///
    /// A club announces for 33 ticks on the Brute that carries one, and a
    /// Fighter draws a shield in 9 plus two of extension. Reading the telegraph
    /// and reaching for the guard is therefore a real answer to a heavy weapon,
    /// and it is the play the whole loadout exists to make possible.
    #[test]
    fn a_club_can_be_answered_by_swapping_to_a_guard() {
        // The bearing a cut first bites on is not the bearing the attacker
        // stands at -- see `a_shield_covers_a_direction_and_only_that_direction`
        // -- so the guard has to be swept for rather than guessed.
        let caught = (0..16u32).any(|step| {
            answered_by_a_swap(Body::Brute, Angle::from_raw((step * 4096) as u16))
        });
        assert!(
            caught,
            "no bearing answered a club by swapping to a shield; a heavy weapon \
             is supposed to be slow enough to read, and if it is not then the \
             guard is a slot nobody would ever spend"
        );
    }

    /// **Constraint 2, and it holds by construction rather than by tuning.**
    ///
    /// A knife announces for 7 ticks. The fastest shield draw in the game is 9
    /// on a Fighter and 7 on a Rogue, before the two ticks of extension it takes
    /// to cover anything -- so no amount of reading beats it, at any bearing,
    /// with zero reaction latency. That is what makes a fast weapon worth
    /// holding, and it is the other half of the ladder the club test opens.
    #[test]
    fn a_knife_cannot_be_answered_by_swapping_to_a_guard() {
        let caught = (0..16u32).any(|step| {
            answered_by_a_swap(Body::Skitterer, Angle::from_raw((step * 4096) as u16))
        });
        assert!(
            !caught,
            "a knife was blocked by a fighter that started reaching only when \
             the telegraph began; fast weapons are supposed to be unanswerable \
             and that is the whole reason to carry one"
        );
    }

    #[test]
    fn a_swap_is_refused_unless_the_limb_is_at_guard() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        // Throw a cut, and ask to swap on every tick once it is under way. The
        // request must be ignored for as long as the attack is running -- a
        // swap out of a committed cut would make overcommitting free.
        //
        // The slot request is withheld until the blade is actually moving,
        // because at guard it would simply be granted and there would be no
        // attack left to refuse it during.
        let mut refused_during = 0u32;
        for _ in 0..200u32 {
            let mut cmd = Command::swinging(
                Vec2::ZERO,
                EntityId::NONE,
                LimbCommand::attack(Angle::ZERO, Strike::Nearest),
            );
            cmd.slot = if w.limb[h].swing == Swing::Guard && refused_during == 0 {
                0
            } else {
                1
            };
            w.submit(hero, cmd);
            w.step();
            if matches!(
                w.limb[h].swing,
                Swing::Windup | Swing::Strike | Swing::Recover
            ) {
                refused_during += 1;
                assert_eq!(
                    w.slot[h], 0,
                    "the slot changed while the limb was mid-{}",
                    w.limb[h].swing.name()
                );
            }
            if w.limb[h].swing.is_dormant() {
                break;
            }
        }
        assert!(
            refused_during > 5,
            "the attack never ran, so nothing was actually refused"
        );
        assert_eq!(w.slot[h], 1, "the swap was never honoured at all");
    }

    /// An archer at `apart` units, facing a defender holding `defence`.
    ///
    /// Its own scenario rather than `Scenario::duel`, whose twelve units of
    /// separation is further than some bodies can see and therefore further than
    /// their arrows carry.
    fn archery_range(apart: i32, defence: ActionKind) -> (World, EntityId, EntityId) {
        let scenario = Scenario {
            name: "archery".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Heroes,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(ActionKind::Bow),
                    articulated: None,
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Monsters,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(defence),
                    articulated: None,
                    spawn: Vec2::from_ints(6 + apart, 8),
                },
            ],
        };
        let w = World::new(&scenario, 1);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let target = w.alive_ids(Faction::Monsters)[0];
        (w, archer, target)
    }

    /// Holds both fighters still and makes the archer shoot down +x, returning
    /// every event the fight produced.
    ///
    /// Everyone else stands their ground with the limb held out **back down the
    /// line the arrows are coming along** -- 180 degrees, because the archer is
    /// at lower `x` and a blow arriving from it touches the far side of the
    /// body. That is the command a defender would actually give, and it is load
    /// bearing for anything holding a guard: `block_leak` refuses a limb under
    /// `MIN_BLOCK_REACH`, so a shield sent `Command::HOLD` is tucked, covers
    /// nothing, and would make "a shield stops an arrow" fail for a reason that
    /// has nothing to do with arrows.
    fn shoot_for(w: &mut World, archer: EntityId, ticks: u32) -> Vec<Event> {
        let mut seen = Vec::new();
        for _ in 0..ticks {
            for id in w.pending_decisions().to_vec() {
                let cmd = if id == archer {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    )
                } else {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::new(Angle::from_degrees(180), Fx::ONE),
                    )
                };
                w.submit(id, cmd);
            }
            seen.extend_from_slice(w.step());
        }
        seen
    }

    /// The numbers a bow is priced on, printed rather than asserted.
    ///
    /// `cargo test -p sim the_bow_numbers -- --nocapture`. Every figure here is
    /// derived, so this is the table to read before touching the row.
    #[test]
    fn the_bow_numbers() {
        for body in Body::ALL {
            let stats = body.base_stats();
            let arm = rules::Arm::resolve(ActionKind::Bow.spec(), stats, body.radius());
            let speed = rules::shot_speed(arm);
            let damage = rules::blow_damage(
                arm.spec.mass,
                speed,
                rules::power_multiplier(stats.power),
            );
            let sword = rules::Arm::resolve(ActionKind::Sword.spec(), stats, body.radius());
            let cycle = rules::phase_ticks(arm.spec.windup, arm.agility)
                + rules::SHOT_RELEASE_TICKS
                + rules::phase_ticks(arm.spec.recovery, arm.agility);
            println!(
                "{:<10} arrow {:>7.4}/tick  dmg {:>6.2} ({:>4.1}% of {:.0} hp)  \
                 cycle {:>3}t  dps {:>5.2}  | sword peak {:>6.2}",
                body.name(),
                speed.to_f32(),
                damage.to_f32(),
                100.0 * damage.to_f32() / stats.max_hp().to_f32(),
                stats.max_hp().to_f32(),
                cycle,
                damage.to_f32() * 60.0 / cycle as f32,
                rules::peak_damage(sword, stats).to_f32(),
            );
        }
    }

    /// **The bow's whole claim**: it reaches somewhere no blade in the game can.
    ///
    /// Eight units apart is more than five times a Fighter's total reach, so a
    /// blow landing at all here cannot have been a cut -- there is no geometry
    /// by which a sword arrives, and the assertion needs no epsilon to say so.
    #[test]
    fn a_bow_puts_an_arrow_in_the_air_and_the_arrow_carries_the_blow() {
        let (mut w, archer, target) = archery_range(8, ActionKind::Punch);
        let a = w.resolve(archer).unwrap();
        let t = w.resolve(target).unwrap();
        let reach = w.radius[a] + ActionKind::Sword.spec().length + w.radius[t];
        assert!(
            (w.pos[t] - w.pos[a]).length() > reach * Fx::TWO,
            "the harness put them inside a blade's length of each other"
        );

        let events = shoot_for(&mut w, archer, 200);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, Event::Loose { source, .. } if *source == archer)),
            "the bow never loosed"
        );
        let hits: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                Event::Damage { target: to, amount, .. } if *to == target => Some(*amount),
                _ => None,
            })
            .collect();
        assert!(!hits.is_empty(), "every arrow missed a stationary target");
        assert!(
            hits.iter().all(|d| d.is_positive()),
            "an arrow landed for nothing: {hits:?}"
        );
        assert!(w.hp[t] < w.max_hp[t], "the target took no damage");
    }

    /// An arrow is spent on the first thing it meets, and never on its own side.
    #[test]
    fn an_arrow_does_not_hit_its_own_side() {
        let mut scenario = Scenario {
            name: "crossfire".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![],
        };
        for (n, (faction, x)) in [
            (Faction::Heroes, 6),  // the archer
            (Faction::Heroes, 10), // a friend directly on the line
            (Faction::Monsters, 14),
        ]
        .into_iter()
        .enumerate()
        {
            scenario.units.push(UnitSpec {
                kind: Body::Fighter,
                faction,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(if n == 0 {
                    ActionKind::Bow
                } else {
                    ActionKind::Punch
                }),
                articulated: None,
                spawn: Vec2::from_ints(x, 8),
            });
        }
        let mut w = World::new(&scenario, 1);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let friend = w.alive_ids(Faction::Heroes)[1];
        let f = w.resolve(friend).unwrap();
        let before = w.hp[f];

        let events = shoot_for(&mut w, archer, 200);
        assert!(
            events.iter().any(|e| matches!(e, Event::Loose { .. })),
            "the bow never loosed"
        );
        assert_eq!(w.hp[f], before, "an arrow went through a friend");
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, Event::Damage { target, .. } if *target == friend)),
            "a friend was billed for a blow"
        );
    }

    /// **The same guard rule a blade meets**, which is the reason `resolve_shots`
    /// calls `block_leak` rather than growing a second defensive mechanic.
    #[test]
    fn a_shield_stops_an_arrow() {
        fn taken(defence: ActionKind) -> (Fx, usize) {
            let (mut w, archer, target) = archery_range(8, defence);
            let t = w.resolve(target).unwrap();
            let before = w.hp[t];
            let events = shoot_for(&mut w, archer, 300);
            let blocks = events
                .iter()
                .filter(|e| matches!(e, Event::Block { defender, .. } if *defender == target))
                .count();
            (before - w.hp[t], blocks)
        }

        let (bare, no_blocks) = taken(ActionKind::Punch);
        let (behind_shield, blocks) = taken(ActionKind::Shield);
        assert_eq!(no_blocks, 0, "a fist blocked something");
        assert!(blocks > 0, "a shield never registered stopping an arrow");
        assert!(bare.is_positive(), "the unguarded control took nothing");
        assert!(
            behind_shield < bare,
            "a shield let through {behind_shield:?} of the {bare:?} it faced bare"
        );
    }

    /// An arrow that meets nobody stops being in the world, rather than
    /// accumulating forever at the far wall.
    #[test]
    fn an_arrow_expires_rather_than_flying_forever() {
        let scenario = Scenario {
            name: "empty range".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(ActionKind::Bow),
                articulated: None,
                spawn: Vec2::from_ints(4, 8),
            }],
        };
        let mut w = World::new(&scenario, 1);
        let archer = w.alive_ids(Faction::Heroes)[0];

        let mut peak = 0usize;
        for _ in 0..900 {
            for id in w.pending_decisions().to_vec() {
                w.submit(
                    id,
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    ),
                );
            }
            w.step();
            peak = peak.max(w.shots().count());
        }
        assert!(peak > 0, "fifteen seconds of shooting produced no arrow");
        // One archer, one arrow: the draw-release-recover cycle is longer than
        // the flight, which is the argument `rules::MAX_SHOTS` is sized on.
        assert!(peak <= 2, "{peak} arrows up at once from a single bow");
        assert!(
            w.shot_alive.len() <= rules::MAX_SHOTS,
            "the arrow pool grew past its ceiling"
        );
    }

    /// An arrow is a fact about the past: it outlives the archer, keeps the
    /// faction it was loosed for, and credits nobody once its owner is gone.
    #[test]
    fn an_arrow_outlives_the_fighter_that_loosed_it() {
        let (mut w, archer, _target) = archery_range(10, ActionKind::Punch);
        let a = w.resolve(archer).unwrap();

        // Fly one arrow, then kill the archer while it is still crossing.
        let mut launched = false;
        for _ in 0..300 {
            for id in w.pending_decisions().to_vec() {
                let cmd = if id == archer {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    )
                } else {
                    Command::HOLD
                };
                w.submit(id, cmd);
            }
            if w.step().iter().any(|e| matches!(e, Event::Loose { .. })) {
                launched = true;
                break;
            }
        }
        assert!(launched, "the bow never loosed");
        assert_eq!(w.shots().count(), 1, "expected exactly one arrow up");

        w.hp[a] = Fx::ZERO;
        w.step(); // reaps the archer
        assert!(!w.alive[a], "the archer survived being emptied");
        assert_eq!(
            w.shots().count(),
            1,
            "the arrow died with the hand that threw it"
        );

        // And it still arrives, still billed to a handle that no longer resolves.
        let mut landed = false;
        for _ in 0..300 {
            for id in w.pending_decisions().to_vec() {
                w.submit(id, Command::HOLD);
            }
            if w
                .step()
                .iter()
                .any(|e| matches!(e, Event::Damage { source, .. } if *source == archer))
            {
                landed = true;
                break;
            }
        }
        assert!(landed, "a dead archer's arrow evaporated");
        assert!(w.resolve(archer).is_none(), "the handle still resolves");
    }

    /// `segment_circle` is a closest-approach test and is exact only while the
    /// *circle* does not cross itself between samples. The arrow's own travel is
    /// the segment and so is swept exactly; what has to hold is the margin on
    /// the body it is tested against.
    #[test]
    fn an_arrow_cannot_tunnel_through_a_body() {
        for body in Body::ALL {
            let arm = rules::Arm::resolve(
                ActionKind::Bow.spec(),
                body.base_stats(),
                body.radius(),
            );
            let speed = rules::shot_speed(arm);
            let smallest = Body::ALL
                .iter()
                .map(|b| b.radius())
                .fold(Fx::MAX, |a, b| if b < a { b } else { a });
            // The test that matters is the *body's* per-tick travel against its
            // own radius, not the arrow's -- but an arrow that outran the sweep
            // entirely would be the louder bug, so both are stated.
            let walk = body.base_stats().move_speed();
            assert!(
                walk * Fx::TWO < smallest,
                "{} covers {walk:?} a tick against a {smallest:?} body",
                body.name()
            );
            assert!(
                speed.is_positive(),
                "{}'s arrow does not move",
                body.name()
            );
        }
    }

    /// **The whole of what `Run` buys**, measured through a live world rather
    /// than read off the registry -- `move_bonus` has been multiplied into
    /// `apply_movement` since before there was a row that used it, and a
    /// multiply by one proves nothing about a multiply by 1.35.
    #[test]
    fn a_running_fighter_actually_runs_faster() {
        fn ground_covered(action: ActionKind) -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].loadout = Loadout::single(action);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let h = w.resolve(hero).unwrap();
            let from = w.pos[h];
            // Straight down +y, away from the other fighter rather than along
            // the line the two are placed on. Ninety ticks and not more: the
            // hero spawns at y=8 in a 16-deep arena, so a runner reaches the
            // wall around tick 105 and `move_body` would quietly cap the very
            // measurement this test exists to take.
            for _ in 0..90 {
                w.submit(hero, Command::moving(Vec2::Y));
                w.step();
            }
            (w.pos[h] - from).length()
        }

        let walked = ground_covered(ActionKind::Sword);
        let ran = ground_covered(ActionKind::Run);
        assert!(walked.is_positive(), "the walker never set off");
        // The row is 1.35; traction has to pay for the extra speed on the way up
        // to it, so the ratio over a fixed window is a little under the ceiling.
        assert!(
            ran > walked * Fx::from_ratio(13, 10),
            "run covered {ran:?} against a walk's {walked:?}"
        );
    }

    /// A fighter has to be able to see its own footspeed, or the braking law in
    /// `DuelistPolicy` paces a run as though it were a walk and slides straight
    /// through whatever mark it aimed at.
    #[test]
    fn a_runner_knows_its_own_footspeed() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::single(ActionKind::Run);
        let w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();
        let base = w.stats[h].move_speed();

        assert_eq!(
            w.observe(hero).move_speed,
            base * ActionKind::Run.spec().move_bonus,
            "a runner reported a walker's speed"
        );

        // And the other rows are untouched, which is what made this safe to land
        // without moving a hash.
        let mut plain = Scenario::duel();
        plain.units[0].loadout = Loadout::single(ActionKind::Sword);
        let w = World::new(&plain, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        assert_eq!(w.observe(hero).move_speed, base);
    }

    /// Legs are not a weapon and not a guard, and the price of holding them is
    /// that they are neither. The twin of
    /// `a_swapping_limb_neither_cuts_nor_blocks_nor_parries`, for a limb that is
    /// helpless by loadout rather than by phase.
    #[test]
    fn a_run_limb_neither_cuts_nor_blocks_nor_parries() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::single(ActionKind::Run);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        for tick in 0..60 {
            // Asking for everything a blade could be asked for, every tick.
            w.submit(
                hero,
                Command::swinging(
                    Vec2::ZERO,
                    EntityId::NONE,
                    LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                ),
            );
            w.step();
            assert!(w.blade(h).is_none(), "legs were a blade on tick {tick}");
            assert!(
                w.block_leak(h, w.pos[h] + Vec2::X).is_none(),
                "legs covered a bearing on tick {tick}"
            );
            assert!(!w.can_parry(h), "legs could parry on tick {tick}");
            assert_eq!(
                w.limb[h].swing,
                Swing::Guard,
                "legs entered {} on tick {tick}",
                w.limb[h].swing.name()
            );
        }
    }

    #[test]
    fn a_swapping_limb_neither_cuts_nor_blocks_nor_parries() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Club);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        let mut cmd = Command::swinging(
            Vec2::ZERO,
            EntityId::NONE,
            LimbCommand::new(Angle::ZERO, Fx::ONE),
        );
        cmd.slot = 1;
        w.submit(hero, cmd);
        w.step();
        assert!(w.limb[h].swing.is_dormant(), "the swap never began");

        let mut ticks = 0u32;
        while w.limb[h].swing.is_dormant() {
            assert!(
                w.blade(h).is_none(),
                "a swapping limb was still a blade on tick {ticks}"
            );
            assert!(
                w.block_leak(h, w.pos[h] + Vec2::X).is_none(),
                "a swapping limb still covered a bearing on tick {ticks}"
            );
            assert!(
                !w.can_parry(h),
                "a swapping limb could still parry on tick {ticks}"
            );
            w.submit(hero, cmd);
            w.step();
            ticks += 1;
            assert!(ticks < 200, "the swap never finished");
        }
        // And on the far side it is a club, not a sword.
        assert_eq!(w.action_of(h), ActionKind::Club);
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

    #[test]
    fn two_worlds_differing_only_in_stats_do_not_fingerprint_alike() {
        let base = duel_world();
        let hero = base.alive_ids(Faction::Heroes)[0];

        // A single point of power moves nothing else at all -- not the bar, not
        // the body, not a position -- so this is the narrowest the claim gets.
        let mut sharper = base.clone();
        let mut stats = sharper.stats(hero).unwrap();
        stats.power += 1;
        assert!(sharper.set_stats(hero, stats));
        assert_ne!(
            base.state_hash(),
            sharper.state_hash(),
            "a fighter given a point of power fingerprints as the fighter it was"
        );

        let mut promoted = base.clone();
        assert!(promoted.set_body(hero, Body::Rogue));
        assert_ne!(base.state_hash(), promoted.state_hash());
        assert_ne!(sharper.state_hash(), promoted.state_hash());

        // The other half of the claim: a rewrite that changes nothing must move
        // no fingerprint either, or every one of these is merely noise.
        let mut same = base.clone();
        assert!(same.set_stats(hero, base.stats(hero).unwrap()));
        assert_eq!(base.state_hash(), same.state_hash());
    }
}
