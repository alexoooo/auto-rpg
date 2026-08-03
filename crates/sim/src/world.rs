use crate::action::{Action, Intent, Order};
use crate::entity::{EntityId, Faction, UnitKind};
use crate::event::Event;
use crate::hand::{Hand, Swing, HANDS, SHIELD, SWORD};
use crate::obs::{Contact, Observation};
use crate::rules::{self, Stats, Weapon, MAX_CONTACTS};
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
    arena: Vec2,
    orders: [Order; 2],

    generation: Vec<u32>,
    alive: Vec<bool>,
    kind: Vec<UnitKind>,
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
    /// Body mass, with a Warrior as the unit. Cached beside [`World::radius`]
    /// for the same reason: it is fixed for the life of the entity and read in
    /// the tick's innermost loops. Derived from [`World::kind`], so it is not
    /// hashed -- what is hashed is the kind it came from.
    mass: Vec<Fx>,
    hp: Vec<Fx>,
    max_hp: Vec<Fx>,
    hands: Vec<[Hand; HANDS]>,
    next_decision: Vec<u32>,
    action: Vec<Action>,
    last_attacker: Vec<EntityId>,
    /// Tick of the last blow dealt or received; gates regeneration.
    last_combat: Vec<u32>,
    /// Health this unit may still regenerate this fight. See
    /// [`rules::REGEN_BUDGET`].
    regen_left: Vec<Fx>,
    damage_dealt: Vec<Fx>,

    free: Vec<u32>,
    events: Vec<Event>,
    pending: Vec<EntityId>,

    // Per-tick scratch. Held on the world so the tick loop allocates once for
    // the life of the fight rather than once per tick. Always empty by the time
    // anything can observe the world, so neither enters `state_hash`.
    blows: Vec<Blow>,
    impulses: Vec<Impulse>,
    start_pos: Vec<Vec2>,
    /// Where each sword blade was before this tick's motion, so
    /// [`World::resolve_swings`] can sweep the segment rather than sample it.
    /// `None` for a hand that was too tucked to be a hitbox, which is also how
    /// a blade that has only just come out reports: it has no history to sweep
    /// through, so it is tested where it is.
    blade_was: Vec<Option<(Vec2, Vec2)>>,
}

/// A landed blow, collected during the read-only pass and applied afterwards.
#[derive(Clone, Copy)]
struct Blow {
    source: usize,
    target: usize,
    amount: Fx,
    absorbed: Fx,
    blocked: bool,
    at: Vec2,
}

/// A change to a hand's motion, likewise deferred.
#[derive(Clone, Copy)]
struct Impulse {
    entity: usize,
    hand: usize,
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
            arena: scenario.arena,
            orders: [Order::Hold; 2],
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
            hands: Vec::with_capacity(n),
            next_decision: Vec::with_capacity(n),
            action: Vec::with_capacity(n),
            last_attacker: Vec::with_capacity(n),
            last_combat: Vec::with_capacity(n),
            regen_left: Vec::with_capacity(n),
            damage_dealt: Vec::with_capacity(n),
            free: Vec::new(),
            events: Vec::new(),
            pending: Vec::with_capacity(n),
            blows: Vec::new(),
            impulses: Vec::new(),
            start_pos: Vec::with_capacity(n),
            blade_was: Vec::with_capacity(n),
        };
        for spec in &scenario.units {
            world.spawn(spec);
        }
        world.refresh_pending();
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
                self.hands.push([Hand::default(); HANDS]);
                self.next_decision.push(0);
                self.action.push(Action::HOLD);
                self.last_attacker.push(EntityId::NONE);
                self.last_combat.push(0);
                self.regen_left.push(Fx::ZERO);
                self.damage_dealt.push(Fx::ZERO);
                self.start_pos.push(Vec2::ZERO);
                self.blade_was.push(None);
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
        self.hands[i] = [Hand::resting(bearing); HANDS];
        self.radius[i] = spec.kind.radius();
        self.mass[i] = spec.kind.mass();
        self.hp[i] = max_hp;
        self.max_hp[i] = max_hp;
        self.next_decision[i] = self.tick;
        self.action[i] = Action::HOLD;
        self.last_attacker[i] = EntityId::NONE;
        self.last_combat[i] = self.tick;
        self.regen_left[i] = max_hp * rules::REGEN_BUDGET;
        self.damage_dealt[i] = Fx::ZERO;
        self.id_of(i)
    }

    // ---------------------------------------------------------------- agent boundary

    /// Entities whose decision clock has come due. Ask each one for an action
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

        let weapon = self.kind[i].weapon();
        obs.hp_frac = self.hp_frac(i);
        obs.radius = self.radius[i];
        obs.weapon_length = weapon.length;
        obs.shield_arc = weapon.shield_arc;
        obs.min_strike_range = self.dead_zone(i);
        obs.hands = self.hands[i];
        obs.sight_range = stats.sight_range();
        obs.move_speed = stats.move_speed();
        obs.traction = stats.traction();
        obs.velocity = self.vel[i];
        obs.decision_period = stats.decision_period();
        // `1` only if a cut could begin this tick, and otherwise how far through
        // whatever is stopping it. A hand back at guard but not re-armed reports
        // *zero* rather than one: it is physically ready and the policy is not,
        // and that is a distinction worth being able to see.
        obs.attack_ready = {
            let sword = self.hands[i][SWORD];
            match sword.swing {
                Swing::Guard if sword.armed => Fx::ONE,
                Swing::Guard => Fx::ZERO,
                // Capped below one so no unready phase can ever claim to be
                // ready, however close to the end of itself it is.
                _ => sword.phase_progress(self.arm(i)) * Fx::from_ratio(9, 10),
            }
        };
        obs.wall_clearance = [
            me.x.max(Fx::ZERO),
            (self.arena.x - me.x).max(Fx::ZERO),
            me.y.max(Fx::ZERO),
            (self.arena.y - me.y).max(Fx::ZERO),
        ];

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
    pub fn submit(&mut self, id: EntityId, action: Action) {
        if let Some(i) = self.resolve(id) {
            self.action[i] = action;
            self.next_decision[i] = self.tick + self.stats[i].decision_period() as u32;
        }
    }

    /// Sets a faction's standing order. This is the player's whole input
    /// channel; it lands in every observation of that faction from the next
    /// decision onward.
    pub fn set_order(&mut self, faction: Faction, order: Order) {
        self.orders[faction.index()] = order;
    }

    pub fn order(&self, faction: Faction) -> Order {
        self.orders[faction.index()]
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
    pub fn step(&mut self) -> &[Event] {
        self.events.clear();
        self.expire_unanswered_decisions();
        self.regenerate();
        self.apply_movement();
        self.separate();
        self.drive_hands();
        self.resolve_parries();
        self.resolve_swings();
        self.reap_dead();
        self.tick += 1;
        self.refresh_pending();
        &self.events
    }

    /// An agent that was offered a decision and given none keeps its standing
    /// action, but its clock still advances -- otherwise it would be re-offered
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

    /// Steers each body toward the velocity its action asked for, then moves it.
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
            let dir = self.action[i].move_dir.clamp_length(Fx::ONE);
            let want = dir * self.stats[i].move_speed();
            let change = (want - self.vel[i]).clamp_length(self.stats[i].traction());
            self.vel[i] += change;
            self.clamp_body(i, self.pos[i] + self.vel[i]);
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

    /// Steps both hands: the sword through its attack phases, the shield
    /// straight at whatever bearing it was pointed.
    ///
    /// This is also where every attack clock ticks down, which is why there is
    /// no cooldown phase in [`World::step`] any more. Putting the countdown
    /// anywhere else would let a hand be observed in a phase it had already
    /// left, or bill a blow on a windup that ran out earlier in the same tick.
    fn drive_hands(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.blade_was[i] = None;
                continue;
            }
            // Snapshot before stepping: the body has already moved this tick but
            // the hand has not, so this pair is exactly where the blade was when
            // the last tick ended.
            self.blade_was[i] = self.blade_from(i, self.start_pos[i], self.hands[i][SWORD]);
            let arm = self.arm(i);
            let commands = self.action[i].hands;
            self.hands[i][SWORD].wield(commands[SWORD], arm);
            self.hands[i][SHIELD].brace(commands[SHIELD], arm);
        }
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
                self.clamp_body(i, self.pos[i] - dir * share_i);
                self.clamp_body(j, self.pos[j] + dir * share_j);

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
                if !self.hands[i][SWORD].swing.is_live() && !self.hands[j][SWORD].swing.is_live() {
                    continue;
                }
                // Two blades merely resting against each other are not a parry.
                // Without a speed floor a crossed pair would fire an event
                // every tick for as long as they stayed lined up.
                let closing = self.hands[i][SWORD].spin.abs() + self.hands[j][SWORD].spin.abs();
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
                for e in [i, j] {
                    self.impulses.push(Impulse {
                        entity: e,
                        hand: SWORD,
                        scale: -rules::PARRY_REBOUND,
                        add: Fx::ZERO,
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
    #[inline]
    fn can_parry(&self, i: usize) -> bool {
        self.hands[i][SWORD].swing != Swing::Recover
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
            if !self.alive[i] || !self.hands[i][SWORD].swing.is_live() {
                continue;
            }
            let (base, tip) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            // A blade with no history is tested where it is, which is what the
            // un-swept version did for everything.
            let (was_base, was_tip) = self.blade_was[i].unwrap_or((base, tip));
            let weapon = self.kind[i].weapon();
            let sweep = self.radius[i] + weapon.length;
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

                let over = self.impact_speed(i, j, hit.point) - rules::IMPACT_THRESHOLD;
                if !over.is_positive() {
                    continue; // resting, withdrawing, or merely leaning on them
                }

                let mut full = weapon.mass * over * rules::IMPACT_TO_DAMAGE * power;
                if full < graze {
                    continue; // caught it with the wrong part of the blade
                }
                // A body committed to a spent swing is turned into the blow and
                // cannot give ground with it. This is the only term in the
                // damage model that depends on what the *target* is doing, and
                // it is what makes timing an attack worth more than throwing
                // one; see `rules::RECOVERY_EXPOSURE`.
                if self.hands[j][SWORD].swing == Swing::Recover {
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
                });

                if blocked {
                    // The swing comes back off the shield, and the shield is
                    // shoved the way the blow was travelling. That pairing is
                    // the punish window: the attacker has to pay off a reversed
                    // swing *and* the extra recovery, while the defender's guard
                    // is out of position too. Blocking is not free either.
                    self.impulses.push(Impulse {
                        entity: i,
                        hand: SWORD,
                        scale: -rules::BLOCK_REBOUND,
                        add: Fx::ZERO,
                        recover: Some(rules::BLOCK_RECOVERY),
                    });
                    self.impulses.push(Impulse {
                        entity: j,
                        hand: SHIELD,
                        scale: Fx::ONE,
                        add: self.hands[i][SWORD].spin * rules::BLOCK_SHIELD_KNOCK,
                        recover: None,
                    });
                } else {
                    // A cut that went home is spent, and the hand starts back.
                    // This is what stops one swing billing damage on every tick
                    // it spends inside a body -- the old hand refractory, now
                    // expressed as the thing it always meant.
                    self.impulses.push(Impulse {
                        entity: i,
                        hand: SWORD,
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
            });
        }
        self.blows.clear();
        self.apply_impulses();
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
        self.impulses.sort_by_key(|im| (im.entity, im.hand));
        for k in 0..self.impulses.len() {
            let im = self.impulses[k];
            let arm = self.arm(im.entity);
            let ceiling = arm.cap;
            let hand = &mut self.hands[im.entity][im.hand];
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

    fn reap_dead(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i].is_positive() {
                continue;
            }
            let entity = self.id_of(i);
            let killer = self.last_attacker[i];
            self.alive[i] = false;
            self.generation[i] = self.generation[i].wrapping_add(1);
            self.action[i] = Action::HOLD;
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
    /// into a timeout rather than into a defeat: measured, a Warrior slowed to a
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
        }
    }

    /// Fingerprint of the complete simulation state.
    ///
    /// This is the determinism test. Run the same scenario, seed and action
    /// sequence natively and in wasm; if these two numbers differ, something
    /// in the stack is not as portable as it claims.
    pub fn state_hash(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_u64(self.seed);
        h.write_u32(self.tick);
        h.write_i32(self.arena.x.raw());
        h.write_i32(self.arena.y.raw());
        for order in self.orders {
            order.hash_into(&mut h);
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
            for hand in self.hands[i] {
                hand.hash_into(&mut h);
            }
            h.write_u32(self.next_decision[i]);
            h.write_u32(self.last_combat[i]);
            h.write_i32(self.regen_left[i].raw());
            h.write_i32(self.damage_dealt[i].raw());
            self.action[i].hash_into(&mut h);
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

    /// The radius inside which no swing of `i`'s weapon can reach
    /// [`rules::IMPACT_THRESHOLD`], however hard it is thrown.
    ///
    /// Impact is linear in the arm, so the whole speed curve is fixed by one
    /// point on it: whatever the blade manages at one unit of reach scales
    /// exactly. Inverting that gives the dead zone.
    ///
    /// Reported to its owner exactly ([`Observation::min_strike_range`] -- a
    /// fighter knows how hard it can swing) and to everyone else blurred
    /// ([`Contact::min_strike_range`] -- judging someone else's is the skill).
    fn dead_zone(&self, i: usize) -> Fx {
        rules::dead_zone(self.arm(i))
    }

    /// `i`'s weapon resolved against `i`'s body and stats.
    ///
    /// Cheap enough to build per call -- four multiplies -- and building it per
    /// call is what keeps it impossible to hold a stale one, which matters
    /// because it is derived from three separate arrays.
    fn arm(&self, i: usize) -> rules::Arm {
        rules::Arm::resolve(self.kind[i].weapon(), self.stats[i], self.radius[i])
    }

    /// The hardest single blow `i` can land: tip, top spin, nothing in the way.
    ///
    /// Absolute health, so it never leaves this crate in this form -- the two
    /// places it surfaces ([`Contact::threat`], [`Contact::frailty`]) both
    /// divide it by a maximum first. Which maximum is the whole point: the same
    /// axe is a third of a Warrior and three quarters of a Skitterer, and that
    /// ratio is the thing worth perceiving.
    fn peak_damage(&self, i: usize) -> Fx {
        rules::peak_damage(self.arm(i), self.stats[i])
    }

    /// `i`'s blade as a world-space segment, base to tip, or `None` if the hand
    /// is too tucked to be a hitbox.
    ///
    /// The early out is both the semantics and the fast path: "tucked" means
    /// something mechanically, and it costs nothing to check.
    fn blade(&self, i: usize) -> Option<(Vec2, Vec2)> {
        self.blade_from(i, self.pos[i], self.hands[i][SWORD])
    }

    /// [`World::blade`] for a body and hand that are not the current ones.
    ///
    /// Exists so the previous tick's segment can be reconstructed from
    /// [`World::start_pos`] and the un-stepped hand, which is the other end of
    /// the sweep in [`World::resolve_swings`].
    fn blade_from(&self, i: usize, pos: Vec2, hand: Hand) -> Option<(Vec2, Vec2)> {
        if hand.reach < rules::MIN_STRIKE_REACH {
            return None;
        }
        let along = Vec2::from_angle(hand.angle);
        let base = pos + along * self.radius[i];
        let tip = base + along * (self.kind[i].weapon().length * hand.reach);
        Some((base, tip))
    }

    /// How much of a blow arriving at `contact` gets past `j`'s guard, or
    /// `None` if the shield does not cover that bearing at all.
    ///
    /// *Whether* it covers is a pure integer comparison on binary angles -- no
    /// trigonometry, no tolerance, exact -- and the arc scales with extension,
    /// so a tucked shield covers nothing and an extended one covers its
    /// weapon's full width.
    ///
    /// *How well* it covers is the newer half, and it is a question about time
    /// rather than about geometry: a shield still swinging toward the bearing
    /// is barely in the way of anything. See [`rules::block_leak`].
    fn block_leak(&self, j: usize, contact: Vec2) -> Option<Fx> {
        let shield = self.hands[j][SHIELD];
        if shield.reach < rules::MIN_BLOCK_REACH {
            return None;
        }
        let out = contact - self.pos[j];
        if out.is_zero() {
            return None; // struck dead centre: no bearing to cover
        }
        let arc = Fx::from_int(self.kind[j].weapon().shield_arc as i32) * shield.reach;
        if shield.angle.delta(out.angle()).abs() > arc.round_int() {
            return None;
        }
        Some(rules::block_leak(shield.braced))
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
        let blade = fx::tangential_speed(self.hands[i][SWORD].spin, arm.length());

        let out = contact - self.pos[j];
        let closing = if out.is_zero() {
            Fx::ZERO // struck dead centre: no surface normal to close along
        } else {
            (self.vel[i] - self.vel[j]).dot(-out.normalize())
        };
        blade + closing
    }

    fn clamp_to_arena(&self, p: Vec2, radius: Fx) -> Vec2 {
        p.clamp_box(
            Vec2::new(radius, radius),
            Vec2::new(self.arena.x - radius, self.arena.y - radius),
        )
    }

    /// Puts `i` inside the arena and takes the momentum the wall absorbed.
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
    fn clamp_body(&mut self, i: usize, p: Vec2) {
        let clamped = self.clamp_to_arena(p, self.radius[i]);
        if clamped.x != p.x {
            self.vel[i].x = Fx::ZERO;
        }
        if clamped.y != p.y {
            self.vel[i].y = Fx::ZERO;
        }
        self.pos[i] = clamped;
    }

    fn contact(&self, observer: usize, target: usize, noise: Fx, rng: &mut Rng) -> Contact {
        let mut offset = self.pos[target] - self.pos[observer];
        let mut hp_frac = self.hp_frac(target);
        let hands = self.hands[target];
        let mut facing = self.facing[target];
        let mut sword_angle = hands[SWORD].angle;
        let mut sword_spin = hands[SWORD].spin;
        let mut sword_line = hands[SWORD].line;
        let mut sword_left = Fx::from_int(hands[SWORD].swing_left as i32);
        let mut shield_angle = hands[SHIELD].angle;
        let mut velocity = self.vel[target];
        let mut min_strike_range = self.dead_zone(target);
        let mut threat = self.peak_damage(target) / self.max_hp[observer];
        let mut frailty = self.peak_damage(observer) / self.max_hp[target];

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
            sword_angle = blur(sword_angle, rng);
            sword_line = blur(sword_line, rng);
            shield_angle = blur(shield_angle, rng);
            sword_spin += rng.gaussian(noise * Fx::from_int(300));

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
            sword_left = (sword_left + rng.gaussian(noise * Fx::from_int(8))).max(Fx::ZERO);

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
        }

        Contact {
            id: self.id_of(target),
            offset,
            distance: offset.length(),
            hp_frac,
            radius: self.radius[target],
            weapon_length: self.kind[target].weapon().length,
            min_strike_range,
            threat,
            frailty,
            velocity,
            facing,
            sword_angle,
            sword_reach: hands[SWORD].reach,
            sword_spin,
            // Exact, unlike everything around it. A blade hauled back over a
            // shoulder is not a subtle cue; what a dim fighter gets wrong is
            // when it arrives and along which line, and both of those are
            // blurred above.
            sword_swing: hands[SWORD].swing,
            sword_left,
            sword_line,
            shield_angle,
            shield_reach: hands[SHIELD].reach,
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
            intent: self.action[i].intent,
            hands: self.hands[i],
            weapon: self.kind[i].weapon(),
        }
    }
}

/// A read-only frame for renderers and debug tooling.
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub tick: u32,
    pub arena: Vec2,
    pub units: Vec<UnitView>,
}

#[derive(Clone, Copy, Debug)]
pub struct UnitView {
    pub id: EntityId,
    pub kind: UnitKind,
    pub faction: Faction,
    pub stats: Stats,
    pub position: Vec2,
    pub facing: Angle,
    pub radius: Fx,
    pub hp: Fx,
    pub max_hp: Fx,
    pub intent: Intent,
    /// Both hands, so a renderer can draw the swordplay rather than infer it.
    pub hands: [Hand; HANDS],
    pub weapon: Weapon,
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
    use crate::action::{HandCommand, Strike};

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
            "the warrior should out-think the brute"
        );

        w.submit(hero, Action::HOLD);
        w.submit(brute, Action::HOLD);

        let mut hero_decisions = 0;
        let mut brute_decisions = 0;
        for _ in 0..600 {
            for id in w.pending_decisions().to_vec() {
                if id == hero {
                    hero_decisions += 1;
                } else {
                    brute_decisions += 1;
                }
                w.submit(id, Action::HOLD);
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
    fn cutting(w: &World, id: EntityId, bearing: Angle, side: Strike) -> HandCommand {
        let sword = w.view(id).unwrap().hands[SWORD];
        match sword.swing {
            Swing::Guard if sword.armed => HandCommand::attack(bearing, side),
            Swing::Windup | Swing::Strike => HandCommand::attack(bearing, side),
            _ => HandCommand::new(bearing, Fx::ZERO),
        }
    }

    /// A minimum viable swordsman: hold the preferred range and keep cutting.
    fn duellist(w: &World, obs: &Observation, target: EntityId) -> Action {
        let enemy = match obs.enemies().first() {
            Some(c) => *c,
            // Nothing in sight: walk to the middle of the room and look again.
            // The duel scenario spawns the pair 12 units apart and nobody sees
            // further than 9.6, so without this they stand still forever.
            None => return Action::moving((Vec2::from_ints(12, 8) - obs.position).normalize()),
        };
        let bearing = enemy.offset.angle();
        // Stand inside the tip band rather than at the very edge of reach: at
        // maximum extension only a blade pointed almost exactly at the target
        // touches it at all.
        let ideal = obs.radius + obs.weapon_length * Fx::from_ratio(6, 10) + enemy.radius;
        let approach = if enemy.distance > ideal {
            enemy.offset.normalize()
        } else {
            Vec2::ZERO
        };
        Action::swinging(
            approach,
            target,
            cutting(w, obs.me, bearing, Strike::Nearest),
            HandCommand::new(bearing, Fx::ONE),
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
                let action = duellist(w, &obs, target);
                w.submit(id, action);
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
        scenario.units[1].kind = UnitKind::Warrior;
        scenario.units[1].stats = UnitKind::Warrior.base_stats();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let mut spun = Fx::ZERO;
        for tick in 0..900u32 {
            // A bearing that sweeps right round, twice a second: the fastest
            // windmill the old interface could express.
            let bearing = Angle::from_raw((tick.wrapping_mul(2184) & 0xFFFF) as u16);
            let whirl = HandCommand::new(bearing, Fx::ONE);
            w.submit(a, Action::swinging(Vec2::ZERO, b, whirl, HandCommand::TUCKED));
            w.submit(b, Action::swinging(Vec2::ZERO, a, whirl, HandCommand::TUCKED));
            w.step();
            spun = spun.max(w.hands[a.index as usize][SWORD].spin.abs());
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
        // real time, and it has to be long enough for a Warrior to notice on one
        // decision and act on the next.
        // Close enough that the hero can see the Brute at all: a Warrior sees
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
            let cmd = HandCommand::attack(Angle::HALF, Strike::Widdershins);
            w.submit(brute, Action::swinging(Vec2::ZERO, hero, cmd, HandCommand::TUCKED));
            w.submit(hero, Action::HOLD);
            w.step();
            let swing = w.hands[brute.index as usize][SWORD].swing;
            if swing == Swing::Windup && announced.is_none() {
                announced = Some(tick);
                // And the hero can see it. This is not the same claim: the
                // phase reaching the observation is what makes the window
                // usable rather than merely present.
                let seen = w.observe(hero);
                assert_eq!(
                    seen.enemies()[0].sword_swing,
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
            "a Brute gave {warning} ticks of warning to a Warrior that thinks \
             every {period} -- not enough to read and answer"
        );
    }

    #[test]
    fn friendly_fire_is_impossible() {
        // Both units placed a single unit apart, well inside a Warrior's reach,
        // and both windmilling their blades straight through each other. The
        // old version of this test submitted `Action::attacking` with tucked
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
                w.submit(a, Action::swinging(Vec2::ZERO, b, cut_a, HandCommand::TUCKED));
                w.submit(b, Action::swinging(Vec2::ZERO, a, cut_b, HandCommand::TUCKED));
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

        let held = Action::swinging(
            Vec2::ZERO,
            b,
            HandCommand::new(Angle::ZERO, Fx::ONE),
            HandCommand::TUCKED,
        );
        for _ in 0..300 {
            w.submit(a, held);
            w.submit(b, Action::HOLD);
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
        // Separation moves bodies, and that movement feeds impact speed. The
        // only thing stopping a crowd from mincing itself is that
        // `IMPACT_THRESHOLD` sits above every archetype's walking speed.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = scenario.units[0].spawn;
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];
        for _ in 0..240 {
            // Blades out, hands still: only the shove is moving anything.
            w.submit(
                a,
                Action::swinging(Vec2::ZERO, b, HandCommand::new(Angle::ZERO, Fx::ONE), HandCommand::TUCKED),
            );
            w.submit(
                b,
                Action::swinging(Vec2::ZERO, a, HandCommand::new(Angle::HALF, Fx::ONE), HandCommand::TUCKED),
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
        // 1.6 units apart and deliberately not touching: a Warrior with its
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
            let sword = w.view(a).unwrap().hands[SWORD];
            if started && sword.swing == Swing::Guard {
                break;
            }
            started |= sword.swing.is_attacking();
            let cmd = HandCommand::attack(Angle::ZERO, Strike::Widdershins);
            w.submit(a, Action::swinging(Vec2::ZERO, b, cmd, HandCommand::TUCKED));
            w.submit(b, Action::HOLD);
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
            scenario.units[1].kind = UnitKind::Warrior;
            scenario.units[1].stats = UnitKind::Warrior.base_stats();
            scenario.units[1].spawn = Vec2::from_ints(7, 8);
            let mut w = World::new(&scenario, 1);
            let a = w.alive_ids(Faction::Heroes)[0];
            let b = w.alive_ids(Faction::Monsters)[0];
            let guard = match shield {
                Some(at) => HandCommand::new(at, Fx::ONE),
                None => HandCommand::TUCKED,
            };
            // One named side, every cut. `Strike::Nearest` alternates as the
            // blade ends up on one side and then the other, which lands blows
            // on both flanks and turns a single-variable test into a test of
            // whether one guard can cover two lines. It cannot, and that is not
            // what is being asked here.
            for _ in 0..900u32 {
                let cut = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
                w.submit(a, Action::swinging(Vec2::ZERO, b, cut, HandCommand::TUCKED));
                w.submit(b, Action::swinging(Vec2::ZERO, a, HandCommand::TUCKED, guard));
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
        // Both feet pinned and the Brute's blade swept about an exact bearing
        // rather than a perceived one. This is a test of the geometry, so its
        // aim must not be at the mercy of a Brute's eyesight.
        let taken_at = |gap: i32| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn =
                Vec2::new(Fx::from_int(18) - Fx::from_ratio(gap, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let mut worst = Fx::ZERO;
            for _ in 0..1800u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Action::swinging(Vec2::ZERO, hero, cut, HandCommand::TUCKED));
                w.submit(hero, Action::HOLD);
                for event in w.step() {
                    if let Event::Damage { amount, .. } = event {
                        worst = worst.max(*amount);
                    }
                }
            }
            worst
        };

        // 2.5 units apart puts a Warrior's body in the Brute's tip band
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
        // damage is linear in the arm, so it rises smoothly from the edge of the
        // lee out to the tip rather than jumping.
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
        // Impact is `spin * arm`, so a weapon has a minimum effective radius:
        // inside it even a blade at full speed is worth no more than a graze.
        // That radius used to be 1.27 for a Brute, *outside* the 1.15 at which a
        // Warrior's body and a Brute's stop being able to approach -- meaning a
        // fighter who got close became flatly immune, and a small enough one
        // became immune and harmless at the same time while the fight timed out.
        // Dropping `IMPACT_THRESHOLD` to 0.06 pulled it to 0.85 and turned the
        // circle into a gradient.
        //
        // **The bound below is the one that matters, and it is the one Phase 3
        // broke.** Deriving the spin cap from grip raised a Brute's top spin
        // from 741 to 911, which pulled the dead zone to 0.687 -- *inside* its
        // own 0.70 body radius. Nothing was immune any more, which sounds
        // harmless and was not: a blow of any size ends the swing that threw it,
        // so with no harmless band left on the blade every cut a Brute threw was
        // spent on a hilt scratch worth 1-3 damage against a peak of 24.8. The
        // naive Warrior's win rate against it went from 10% to 76%. See
        // `rules::GRAZE_FRACTION`, which is what put the band back.
        //
        // This asserted the same thing before and missed it, because it derived
        // the dead zone inline from `IMPACT_THRESHOLD` instead of asking
        // `rules::dead_zone`. Ask the sim.
        let brute = UnitKind::Brute;
        let arm = rules::Arm::resolve(brute.weapon(), brute.base_stats(), brute.radius());
        let safe = rules::dead_zone(arm);
        assert!(
            safe > brute.radius(),
            "a Brute's dead zone is {safe} against a body radius of {} -- with no \
             part of the blade harmless, every cut it throws is spent on a scratch",
            brute.radius()
        );
        assert!(
            safe < brute.radius() + brute.weapon().length,
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
                w.submit(villain, Action::swinging(Vec2::ZERO, hero, cut, HandCommand::TUCKED));
                // Pinned in place: this is a test of geometry, and a hero that
                // walked would be measuring its own footwork.
                w.submit(hero, Action::HOLD);
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

        // And the phase gate itself, in a running world: a Warrior cutting into
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
                    w.hands[b][SWORD].swing = Swing::Recover;
                    w.hands[b][SWORD].swing_left = 200;
                } else {
                    w.hands[b][SWORD].swing = Swing::Guard;
                }
                let cut = cutting(&w, hero, Angle::ZERO, Strike::Nearest);
                w.submit(hero, Action::swinging(Vec2::ZERO, brute, cut, HandCommand::TUCKED));
                w.submit(brute, Action::HOLD);
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
            UnitKind::Brute.weapon(),
            UnitKind::Brute.base_stats(),
            UnitKind::Brute.radius(),
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
                UnitKind::Warrior.weapon(),
                Stats::new(6, 6, 8, 0, 8),
                UnitKind::Warrior.radius(),
            ))
        );
    }

    /// A duel between two arbitrary archetypes, seen through a sharp hero's
    /// eyes. Returns the hero's read of the villain.
    fn sizing_up(hero: UnitKind, villain: UnitKind) -> Contact {
        let mut s = Scenario::duel();
        s.units[0].kind = hero;
        s.units[0].stats = Stats::new(
            hero.base_stats().power,
            hero.base_stats().agility,
            hero.base_stats().intellect,
            18, // clean eyes: this is about the figure, not about the blur
            hero.base_stats().vitality,
        );
        s.units[0].spawn = Vec2::from_ints(14, 8);
        s.units[1].kind = villain;
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
        let to_warrior = sizing_up(UnitKind::Warrior, UnitKind::Brute).threat;
        let to_skitterer = sizing_up(UnitKind::Skitterer, UnitKind::Brute).threat;

        assert!(
            to_skitterer > to_warrior * Fx::TWO,
            "the same axe reads as {to_skitterer} to a Skitterer and {to_warrior} \
             to a Warrior; it should be far worse news for the smaller body"
        );
        // And a knife is not an axe, whoever is holding it.
        let knife = sizing_up(UnitKind::Warrior, UnitKind::Skitterer).threat;
        assert!(
            knife * Fx::TWO < to_warrior,
            "a Warrior rates a Skitterer's knife at {knife} against a Brute's \
             axe at {to_warrior}"
        );
    }

    #[test]
    fn one_fighters_threat_is_the_others_frailty() {
        // The two fields are one quantity read from opposite ends, and a policy
        // comparing "blows I can take" against "blows it can take" is relying on
        // exactly that. If they ever drift apart the comparison is nonsense.
        for (hero, villain) in [
            (UnitKind::Warrior, UnitKind::Brute),
            (UnitKind::Skitterer, UnitKind::Scout),
            (UnitKind::Brute, UnitKind::Brute),
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
    fn what_a_blow_will_cost_is_judged_rather_than_known() {
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::from_ints(14, 8);
        scenario.units[1].spawn = Vec2::from_ints(18, 8);

        let truth = sizing_up(UnitKind::Warrior, UnitKind::Brute).threat;

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
        scenario.units[1].kind = UnitKind::Warrior;
        scenario.units[1].stats = UnitKind::Warrior.base_stats();
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
            w.submit(a, Action::swinging(Vec2::ZERO, b, cut_a, HandCommand::TUCKED));
            w.submit(b, Action::swinging(Vec2::ZERO, a, cut_b, HandCommand::TUCKED));
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
                ended_an_attack |= w.hands[a.index as usize][SWORD].swing == Swing::Recover
                    && w.hands[b.index as usize][SWORD].swing == Swing::Recover;
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
        scenario.units[1].kind = UnitKind::Warrior;
        scenario.units[1].stats = UnitKind::Warrior.base_stats();
        // 1.7 apart, symmetric about x = 12. Two units puts each Warrior's body
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
            w.submit(a, Action::swinging(Vec2::ZERO, b, cut_a, HandCommand::TUCKED));
            w.submit(b, Action::swinging(Vec2::ZERO, a, cut_b, HandCommand::TUCKED));
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
        w.action[i] = Action::moving(Vec2::X);
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
        w.action[i] = Action::HOLD;
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
        w.action[i] = Action::moving(Vec2::new(-Fx::ONE, Fx::ONE).normalize());
        for _ in 0..30 {
            w.apply_movement();
        }

        assert_eq!(w.vel[i].x, Fx::ZERO, "the wall banked the momentum");
        assert!(w.vel[i].y.is_positive(), "sliding along a wall must still work");
        assert_eq!(w.pos[i].x, w.radius[i]);
    }

    #[test]
    fn charging_a_heavier_body_costs_the_charger_more() {
        // Barging is now a decision with a price, and the price scales with who
        // you barge. Both are thrown, and the light one is thrown further.
        let mut w = World::new(&Scenario::duel_of(UnitKind::Skitterer, UnitKind::Brute, 1), 1);
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
        let mut w = World::new(&Scenario::duel_of(UnitKind::Skitterer, UnitKind::Brute, 1), 1);
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
        let mut w = World::new(&Scenario::duel_of(UnitKind::Warrior, UnitKind::Warrior, 1), 1);
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
        w.hands[i][SWORD].reach = Fx::ONE;
        w.hands[i][SWORD].swing = Swing::Strike;
        w.hands[i][SWORD].spin = Fx::from_int(4_000);

        // A quarter turn in one tick: 22.5 degrees short of the hero to 22.5
        // degrees past it. The blade is clear of the body at *both* ends and
        // squarely through it in the middle.
        w.hands[i][SWORD].angle = Angle::from_raw(61_440);
        let before = w.blade(i).expect("the blade is out");
        w.hands[i][SWORD].angle = Angle::from_raw(4_096);
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

        w.hands[i][SWORD].swing = Swing::Strike;
        w.hands[i][SWORD].spin = Fx::from_int(4_000);
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
        w.hands[i][SWORD].reach = Fx::ONE;
        // Brute two units east of the hero; contact on the hero's eastern
        // surface, which is the side the blow is coming from. "Away" is then
        // due west, and the sign of the closing term is unambiguous.
        w.pos[i] = w.pos[j] + Vec2::new(Fx::TWO, Fx::ZERO);
        let contact = w.pos[j] + Vec2::new(w.radius[j], Fx::ZERO);

        w.hands[i][SWORD].spin = Fx::from_int(900);
        let clockwise = w.impact_speed(i, j, contact);
        w.hands[i][SWORD].spin = Fx::from_int(-900);
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
        scenario.units[0].spawn = scenario.arena * Fx::HALF;
        for u in scenario.units.iter_mut().skip(1) {
            u.spawn = scenario.arena * Fx::HALF + Vec2::from_ints(1, 1);
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
}
