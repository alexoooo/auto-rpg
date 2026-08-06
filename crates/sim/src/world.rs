use crate::command::{Command, Intent, Objective, Order};
use crate::action::{ActionKind, ActionSpec, Role};
use crate::dungeon::{Cardinal, Dungeon};
use crate::loadout::Loadout;
use crate::entity::{EntityId, Faction, Body};
use crate::event::Event;
use crate::hand::{Hand, Swing};
use crate::obs::{Contact, Observation};
use crate::rules::{self, Stats, MAX_CONTACTS};
use crate::scenario::{Scenario, UnitSpec};
use fx::{Angle, Fx, Hash64, Rng, Vec2};

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
    tick: u32,
    /// Which ground exists. Immutable for the life of the world -- there is no
    /// mutator, and a level change is a new [`World`], not an edit to this one.
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

    /// One route field per faction. See [`Nav`].
    nav: [Nav; 2],
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

impl World {
    pub fn new(scenario: &Scenario, seed: u64) -> World {
        let n = scenario.units.len();
        let mut world = World {
            seed,
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
            nav: [Nav::default(), Nav::default()],
            nav_queue: Vec::new(),
            nav_seeds: Vec::new(),
            blows: Vec::new(),
            pierces: Vec::new(),
            impulses: Vec::new(),
            start_pos: Vec::with_capacity(n),
            blade_was: Vec::with_capacity(n),
            blade_p: Vec::with_capacity(n),
        };
        for spec in &scenario.units {
            world.spawn(spec);
        }
        world.refresh_pending();
        world.refresh_nav();
        world
    }

    pub fn spawn(&mut self, spec: &UnitSpec) -> EntityId {
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
        obs.hp_frac = self.hp_frac(i);
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

        obs
    }

    /// Records `id`'s decision and pushes its next decision tick out by its
    /// [`Stats::decision_period`]. Stale handles are ignored.
    pub fn submit(&mut self, id: EntityId, command: Command) {
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

    /// The floor plan. Read-only: a level change is a new [`World`].
    pub fn dungeon(&self) -> &Dungeon {
        &self.dungeon
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
                let frac = self.hp_frac(i);
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
        self.events.clear();
        self.expire_unanswered_decisions();
        self.regenerate();
        self.apply_movement();
        self.separate();
        self.drive_limbs();
        self.resolve_parries();
        self.resolve_swings();
        self.apply_recoil();
        self.resolve_shots();
        self.reap_dead();
        self.tick += 1;
        self.refresh_pending();
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
            self.vel[i] -= along * (slipped * recoil.signum());
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

            let mut h = Hash64::new();
            h.write_u64(self.dungeon.fingerprint());
            h.write_u8(self.objectives[side].discriminant() as u8);
            for &cell in seeds.iter() {
                h.write_u32(cell);
            }
            let key = h.finish();
            if key == self.nav[side].key && !self.nav[side].dist.is_empty() {
                continue;
            }
            self.nav[side].key = key;
            self.dungeon
                .distances(seeds, &mut self.nav[side].dist, &mut self.nav_queue);
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
        let dist = &self.nav[side].dist;
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
            total += self.max_hp[i];
            if self.alive[i] {
                current += self.hp[i].max(Fx::ZERO);
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
    /// This is the determinism test. Run the same scenario, seed and command
    /// sequence natively and in wasm; if these two numbers differ, something
    /// in the stack is not as portable as it claims.
    pub fn state_hash(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_u64(self.seed);
        h.write_u32(self.tick);
        h.write_i32(self.arena.x.raw());
        h.write_i32(self.arena.y.raw());
        // The floor plan, as its digest rather than as 1536 bytes. Written
        // **unconditionally**, including for a floor plan with nothing carved,
        // on exactly the argument the empty shot block below makes: a
        // fingerprint that only looks at the grid once something is standing
        // behind a wall cannot catch a broken tile column until it is too late
        // to say which tick broke it.
        h.write_u64(self.dungeon.fingerprint());
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

    // ---------------------------------------------------------------- internals

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
    fn hp_frac(&self, i: usize) -> Fx {
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
        let mut hp_frac = self.hp_frac(target);
        let limb = self.limb[target];
        let mut facing = self.facing[target];
        let mut limb_angle = limb.angle;
        let mut limb_spin = limb.spin;
        let mut limb_line = limb.line;
        let mut limb_left = Fx::from_int(limb.swing_left as i32);

        let mut velocity = self.vel[target];
        let mut min_strike_range = self.dead_zone(target);
        let mut threat = self.peak_damage(target) / self.max_hp[observer];
        let mut frailty = self.peak_damage(observer) / self.max_hp[target];
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
            hp: self.hp[i].max(Fx::ZERO),
            max_hp: self.max_hp[i],
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
        let b = w.resolve(brute).unwrap();
        w.hp[b] -= Fx::from_int(40);
        assert_eq!(w.timeout(), Outcome::Decision(Faction::Heroes));
        assert_eq!(w.timeout().winner(), Some(Faction::Heroes));
        assert!(!w.timeout().is_decisive());
        assert!(Outcome::HeroesWin.is_decisive());

        // ...and it swings back when the hero is the one bleeding.
        let h = w.resolve(hero).unwrap();
        w.hp[h] -= Fx::from_int(60);
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
            spawned.nav[Faction::Monsters.index()].dist,
            walked.nav[Faction::Monsters.index()].dist
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
            dungeon: Dungeon::open(24, 16),
            portal: None,
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Heroes,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(ActionKind::Bow),
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Monsters,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(defence),
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
            dungeon: Dungeon::open(24, 16),
            portal: None,
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
            dungeon: Dungeon::open(24, 16),
            portal: None,
            max_ticks: 60 * 60,
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(ActionKind::Bow),
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
        assert_eq!(w.hp_frac(h), Fx::HALF, "{} of {}", w.hp[h], w.max_hp[h]);

        // And down, which is the direction that can kill. It must not.
        stats.vitality = 1;
        assert!(w.set_stats(hero, stats));
        assert_eq!(w.max_hp[h], stats.max_hp());
        assert_eq!(w.hp_frac(h), Fx::HALF, "{} of {}", w.hp[h], w.max_hp[h]);
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
