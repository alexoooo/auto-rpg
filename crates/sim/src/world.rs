use crate::action::{Action, Intent, Order};
use crate::entity::{EntityId, Faction, UnitKind};
use crate::event::Event;
use crate::hand::{Hand, HANDS, SHIELD, SWORD};
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
    /// Hit the scenario's tick limit with both sides standing.
    Draw,
}

impl Outcome {
    pub const fn winner(self) -> Option<Faction> {
        match self {
            Outcome::HeroesWin => Some(Faction::Heroes),
            Outcome::MonstersWin => Some(Faction::Monsters),
            _ => None,
        }
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
    vel: Vec<Vec2>,
    facing: Vec<Angle>,
    radius: Vec<Fx>,
    hp: Vec<Fx>,
    max_hp: Vec<Fx>,
    hands: Vec<[Hand; HANDS]>,
    next_decision: Vec<u32>,
    action: Vec<Action>,
    last_attacker: Vec<EntityId>,
    /// Tick of the last blow dealt or received; gates regeneration.
    last_combat: Vec<u32>,
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
    refractory: u16,
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
            hp: Vec::with_capacity(n),
            max_hp: Vec::with_capacity(n),
            hands: Vec::with_capacity(n),
            next_decision: Vec::with_capacity(n),
            action: Vec::with_capacity(n),
            last_attacker: Vec::with_capacity(n),
            last_combat: Vec::with_capacity(n),
            damage_dealt: Vec::with_capacity(n),
            free: Vec::new(),
            events: Vec::new(),
            pending: Vec::with_capacity(n),
            blows: Vec::new(),
            impulses: Vec::new(),
            start_pos: Vec::with_capacity(n),
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
                self.hp.push(max_hp);
                self.max_hp.push(max_hp);
                self.hands.push([Hand::default(); HANDS]);
                self.next_decision.push(0);
                self.action.push(Action::HOLD);
                self.last_attacker.push(EntityId::NONE);
                self.last_combat.push(0);
                self.damage_dealt.push(Fx::ZERO);
                self.start_pos.push(Vec2::ZERO);
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
        self.hp[i] = max_hp;
        self.max_hp[i] = max_hp;
        self.next_decision[i] = self.tick;
        self.action[i] = Action::HOLD;
        self.last_attacker[i] = EntityId::NONE;
        self.last_combat[i] = self.tick;
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
        // Impact is linear in the arm, so the whole speed curve is fixed by one
        // point on it: whatever the blade manages at one unit of reach scales
        // exactly. Inverting that gives the radius inside which no swing of
        // this weapon can reach the threshold at all.
        obs.min_strike_range = {
            let ceiling = weapon.max_spin * rules::agility_multiplier(stats.agility);
            let at_one_unit = fx::tangential_speed(ceiling, Fx::ONE);
            if at_one_unit.is_positive() {
                rules::IMPACT_THRESHOLD / at_one_unit
            } else {
                Fx::MAX
            }
        };
        obs.hands = self.hands[i];
        obs.sight_range = stats.sight_range();
        obs.move_speed = stats.move_speed();
        obs.decision_period = stats.decision_period();
        obs.attack_ready = {
            let left = self.hands[i][SWORD].refractory;
            if left == 0 {
                Fx::ONE
            } else {
                let full = rules::BLOCK_REFRACTORY.max(rules::HAND_REFRACTORY);
                (Fx::ONE - Fx::from_ratio(left as i32, full as i32)).clamp(Fx::ZERO, Fx::ONE)
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
        self.tick_cooldowns();
        self.regenerate();
        self.apply_movement();
        self.separate();
        self.record_velocity();
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

    fn tick_cooldowns(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                continue;
            }
            for hand in &mut self.hands[i] {
                hand.refractory = hand.refractory.saturating_sub(1);
            }
        }
    }

    /// Out-of-combat recovery. See [`crate::rules::REGEN_PER_TICK`] for why
    /// this rule exists at all -- it is what makes retreating a tactic instead
    /// of a way to stall a fight forever.
    fn regenerate(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i] >= self.max_hp[i] {
                continue;
            }
            if self.tick < self.last_combat[i].saturating_add(crate::rules::REGEN_DELAY) {
                continue;
            }
            let healed = self.hp[i] + self.max_hp[i] * crate::rules::REGEN_PER_TICK;
            self.hp[i] = healed.min(self.max_hp[i]);
        }
    }

    fn apply_movement(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                continue;
            }
            self.start_pos[i] = self.pos[i];
            let dir = self.action[i].move_dir.clamp_length(Fx::ONE);
            if dir.is_zero() {
                continue;
            }
            let step = dir * self.stats[i].move_speed();
            self.pos[i] = self.clamp_to_arena(self.pos[i] + step, self.radius[i]);
            // `facing` is where the feet are going, and nothing else. It is not
            // consulted by any combat rule -- blows are decided by blade
            // geometry -- so a character can back away from a fight while still
            // swinging into it.
            self.facing[i] = dir.angle();
        }
    }

    /// What each body actually covered this tick, shove included.
    ///
    /// Separation counts on purpose: being barged into a blade genuinely hurts
    /// more than standing next to one. It is also the only way a crowd can
    /// produce a blow nobody swung, which is why [`rules::IMPACT_THRESHOLD`]
    /// sits above every archetype's walking speed.
    fn record_velocity(&mut self) {
        for i in 0..self.alive.len() {
            self.vel[i] = if self.alive[i] {
                self.pos[i] - self.start_pos[i]
            } else {
                Vec2::ZERO
            };
        }
    }

    fn drive_hands(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                continue;
            }
            let weapon = self.kind[i].weapon();
            let agility = rules::agility_multiplier(self.stats[i].agility);
            let commands = self.action[i].hands;
            for (hand, command) in self.hands[i].iter_mut().zip(commands) {
                hand.drive(command, weapon, agility);
            }
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
                let push = (overlap - distance) * Fx::HALF;
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
                let shove = dir * push;
                self.pos[i] = self.clamp_to_arena(self.pos[i] - shove, self.radius[i]);
                self.pos[j] = self.clamp_to_arena(self.pos[j] + shove, self.radius[j]);
            }
        }
    }

    /// Steel on steel. Both swings are thrown off line, neither lands.
    ///
    /// Its own pass with an `i < j` loop for the same reason
    /// [`World::separate`] has one: a pairwise interaction resolved inside a
    /// per-entity loop resolves twice, and asymmetrically.
    fn resolve_parries(&mut self) {
        self.impulses.clear();
        let n = self.alive.len();
        for i in 0..n {
            if !self.alive[i] || self.hands[i][SWORD].refractory > 0 {
                continue;
            }
            let (ia, ib) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            for j in (i + 1)..n {
                if !self.alive[j]
                    || self.faction[j] == self.faction[i]
                    || self.hands[j][SWORD].refractory > 0
                {
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
                        refractory: rules::PARRY_REFRACTORY,
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

    /// Blade against body: the whole of damage.
    ///
    /// Two passes, and the split is not tidiness. The old `resolve_attacks`
    /// wrote only health and cooldowns, which no other attacker read, so it
    /// could resolve in place. This one writes **spin**, and spin is the input
    /// to damage -- so an in-place loop would let the first attacker's rebound
    /// change the second attacker's blow, making a mutual exchange depend on
    /// entity index. Collecting the outcomes and applying them afterwards *is*
    /// the snapshot; no extra buffer is needed.
    fn resolve_swings(&mut self) {
        self.blows.clear();
        self.impulses.clear();

        // ---- pass 1: read-only
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hands[i][SWORD].refractory > 0 {
                continue;
            }
            let (base, tip) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            let weapon = self.kind[i].weapon();
            let sweep = self.radius[i] + weapon.length;
            let power = rules::power_multiplier(self.stats[i].power);

            for j in 0..self.alive.len() {
                if i == j || !self.alive[j] || self.faction[j] == self.faction[i] {
                    continue; // no friendly fire, ever -- checked before any geometry
                }
                // Bounding circle before anything expensive. The geometry below
                // runs several integer square roots per pair and this is the
                // hot loop of the whole tick.
                if (self.pos[j] - self.pos[i]).length() > sweep + self.radius[j] {
                    continue;
                }
                let hit = match fx::segment_circle(base, tip, self.pos[j], self.radius[j]) {
                    Some(h) => h,
                    None => continue,
                };

                let over = self.impact_speed(i, j, hit.point) - rules::IMPACT_THRESHOLD;
                if !over.is_positive() {
                    continue; // resting, withdrawing, or merely leaning on them
                }

                let full = weapon.weight * over * rules::IMPACT_TO_DAMAGE * power;
                let blocked = self.blocks(j, hit.point);
                let amount = if blocked { full * rules::BLOCK_LEAK } else { full };
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
                    // swing while the defender's guard is out of position too.
                    self.impulses.push(Impulse {
                        entity: i,
                        hand: SWORD,
                        scale: -rules::BLOCK_REBOUND,
                        add: Fx::ZERO,
                        refractory: rules::BLOCK_REFRACTORY,
                    });
                    self.impulses.push(Impulse {
                        entity: j,
                        hand: SHIELD,
                        scale: Fx::ONE,
                        add: self.hands[i][SWORD].spin * rules::BLOCK_SHIELD_KNOCK,
                        refractory: 0,
                    });
                } else {
                    self.impulses.push(Impulse {
                        entity: i,
                        hand: SWORD,
                        scale: Fx::ONE,
                        add: Fx::ZERO,
                        refractory: rules::HAND_REFRACTORY,
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
    fn apply_impulses(&mut self) {
        self.impulses.sort_by_key(|im| (im.entity, im.hand));
        for k in 0..self.impulses.len() {
            let im = self.impulses[k];
            let ceiling = self.kind[im.entity].weapon().max_spin
                * rules::agility_multiplier(self.stats[im.entity].agility);
            let hand = &mut self.hands[im.entity][im.hand];
            hand.spin = (hand.spin * im.scale + im.add).clamp(-ceiling, ceiling);
            hand.refractory = hand.refractory.max(im.refractory);
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

    /// `i`'s blade as a world-space segment, base to tip, or `None` if the hand
    /// is too tucked to be a hitbox.
    ///
    /// The early out is both the semantics and the fast path: "tucked" means
    /// something mechanically, and it costs nothing to check.
    fn blade(&self, i: usize) -> Option<(Vec2, Vec2)> {
        let hand = self.hands[i][SWORD];
        if hand.reach < rules::MIN_STRIKE_REACH {
            return None;
        }
        let along = Vec2::from_angle(hand.angle);
        let base = self.pos[i] + along * self.radius[i];
        let tip = base + along * (self.kind[i].weapon().length * hand.reach);
        Some((base, tip))
    }

    /// Whether `j`'s shield covers the bearing `contact` arrives from.
    ///
    /// Pure integer comparison on binary angles -- no trigonometry, no
    /// tolerance, exact. The arc scales with extension, so a tucked shield
    /// covers nothing and a braced one covers its weapon's full width.
    fn blocks(&self, j: usize, contact: Vec2) -> bool {
        let shield = self.hands[j][SHIELD];
        if shield.reach < rules::MIN_BLOCK_REACH {
            return false;
        }
        let out = contact - self.pos[j];
        if out.is_zero() {
            return false; // struck dead centre: no bearing to cover
        }
        let arc = Fx::from_int(self.kind[j].weapon().shield_arc as i32) * shield.reach;
        shield.angle.delta(out.angle()).abs() <= arc.round_int()
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

    fn contact(&self, observer: usize, target: usize, noise: Fx, rng: &mut Rng) -> Contact {
        let mut offset = self.pos[target] - self.pos[observer];
        let mut hp_frac = self.hp_frac(target);
        let hands = self.hands[target];
        let mut facing = self.facing[target];
        let mut sword_angle = hands[SWORD].angle;
        let mut sword_spin = hands[SWORD].spin;
        let mut shield_angle = hands[SHIELD].angle;

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
            shield_angle = blur(shield_angle, rng);
            sword_spin += rng.gaussian(noise * Fx::from_int(300));
        }

        Contact {
            id: self.id_of(target),
            offset,
            distance: offset.length(),
            hp_frac,
            radius: self.radius[target],
            weapon_length: self.kind[target].weapon().length,
            facing,
            sword_angle,
            sword_reach: hands[SWORD].reach,
            sword_spin,
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
    use crate::action::HandCommand;

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

    /// How far past a target these tests aim, in raw angle units (67.5 deg).
    const OVERSHOOT: i32 = 12_288;

    fn swept(side: i32, about: Angle) -> HandCommand {
        HandCommand::new(about + Angle::from_raw((side * OVERSHOOT) as u16), Fx::ONE)
    }

    /// The minimum viable swordsman: drive the blade *past* the enemy so it
    /// crosses at speed, flipping side once it has gone by.
    ///
    /// Every test below that wants a fight to actually happen goes through
    /// this, because a blade commanded straight at someone arrives at rest and
    /// does nothing. Keeping it in one place means the tests exercise the same
    /// shape a real policy has to use.
    fn windmill(obs: &Observation, target: EntityId, side: &mut i32) -> Action {
        let enemy = match obs.enemies().first() {
            Some(c) => *c,
            // Nothing in sight: walk to the middle of the room and look again.
            // The duel scenario spawns the pair 12 units apart and nobody sees
            // further than 9.6, so without this they stand still forever.
            None => return Action::moving((Vec2::from_ints(12, 8) - obs.position).normalize()),
        };
        let bearing = enemy.offset.angle();
        // Reverse only once the blade has actually reached the far end of its
        // arc -- not merely once it has crossed the target. Flipping on the
        // crossing looks right and is the classic way to build a swordsman that
        // never hurts anyone: decisions arrive every several ticks, so the
        // command reverses again mid-return and the blade dithers around the
        // target at walking pace forever.
        if obs.sword().angle.delta(bearing) * *side > OVERSHOOT * 3 / 4 {
            *side = -*side;
        }
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
            swept(*side, bearing),
            HandCommand::new(bearing, Fx::ONE),
        )
    }

    /// Runs a duel to a conclusion with both sides windmilling.
    fn fight(w: &mut World, ticks: u32) -> Option<Outcome> {
        let hero = w.alive_ids(Faction::Heroes)[0];
        let monster = w.alive_ids(Faction::Monsters)[0];
        let mut sides = [1i32, -1];
        for _ in 0..ticks {
            for id in w.pending_decisions().to_vec() {
                let (target, slot) = if id == hero {
                    (monster, 0)
                } else {
                    (hero, 1)
                };
                let obs = w.observe(id);
                let action = windmill(&obs, target, &mut sides[slot]);
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
            fight(&mut w, 60 * 120).is_some(),
            "the duel never resolved -- two swordsmen swinging at each other \
             for two minutes should produce a body"
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
            let mut side = 1;
            for tick in 0..600u32 {
                if tick % 24 == 0 {
                    side = -side;
                }
                w.submit(
                    a,
                    Action::swinging(
                        Vec2::ZERO,
                        b,
                        swept(side, Angle::ZERO),
                        HandCommand::TUCKED,
                    ),
                );
                w.submit(
                    b,
                    Action::swinging(
                        Vec2::ZERO,
                        a,
                        swept(side, Angle::HALF),
                        HandCommand::TUCKED,
                    ),
                );
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
        // A blade crossing a body occupies it for several ticks. Without the
        // hand refractory it would bill damage on every one of them, and a
        // single swing would delete anything it touched.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Wind up well clear of the target, then sweep once through it.
        let mut blows = 0;
        for tick in 0..40u32 {
            let cmd = if tick < 20 {
                swept(-1, Angle::ZERO)
            } else {
                swept(1, Angle::ZERO)
            };
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
        assert!(blows > 0, "the sweep never connected");
        assert!(blows <= 2, "one sweep billed {blows} separate blows");
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
            let mut side = 1;
            for tick in 0..600u32 {
                if tick % 30 == 0 {
                    side = -side;
                }
                w.submit(
                    a,
                    Action::swinging(Vec2::ZERO, b, swept(side, Angle::ZERO), HandCommand::TUCKED),
                );
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
        for step in 0..8 {
            let taken = landed(Some(Angle::from_raw((step * 8192) as u16)));
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
            let mut side = 1;
            let mut worst = Fx::ZERO;
            for tick in 0..900u32 {
                if tick % 60 == 0 {
                    side = -side;
                }
                w.submit(
                    brute,
                    Action::swinging(
                        Vec2::ZERO,
                        hero,
                        swept(side, Angle::HALF),
                        HandCommand::TUCKED,
                    ),
                );
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
        // (0.70 + 1.45 + 0.45 = 2.60); 1.6 is close inside it.
        let at_the_tip = taken_at(25);
        let inside = taken_at(16);

        assert!(at_the_tip.is_positive(), "the tip band never connected");
        assert!(inside.is_positive(), "closing in avoided the blade entirely");
        assert!(
            at_the_tip > inside * Fx::TWO,
            "the worst blow at the tip was {at_the_tip} against {inside} \
             close in -- where you stand is supposed to be the whole fight"
        );
    }

    #[test]
    fn hugging_a_heavy_weapon_disarms_it_completely() {
        // The sharpest edge of the damage model, pinned deliberately rather
        // than left to be discovered.
        //
        // Impact is `spin * arm`, so a weapon has a *minimum* effective radius:
        // inside it, even a blade at full speed cannot reach
        // `IMPACT_THRESHOLD`. A Brute tops out at 741 angle units per tick, so
        // its blade is harmless within about 1.27 units of its own shoulder --
        // it simply has no room to build speed. Getting inside that circle and
        // staying there is the single strongest answer to a heavy weapon in the
        // game, and it is meant to be: it costs a light fighter every scrap of
        // safety margin to hold that distance against something that only has
        // to take one step back.
        let brute = UnitKind::Brute;
        let ceiling = brute.weapon().max_spin * rules::agility_multiplier(brute.base_stats().agility);
        let mut safe = Fx::ZERO;
        let mut step = Fx::from_ratio(1, 100);
        while step < Fx::from_int(3) {
            if fx::tangential_speed(ceiling, step) < rules::IMPACT_THRESHOLD {
                safe = step;
            }
            step += Fx::from_ratio(1, 100);
        }
        assert!(
            safe > brute.radius() && safe < brute.radius() + brute.weapon().length,
            "the dead zone is {safe}, which is not inside the blade's own span"
        );

        // And it really is a dead zone in a running fight, not just on paper.
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(1710, 100), Fx::from_int(8));
        scenario.units[1].spawn = Vec2::from_ints(18, 8);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let villain = w.alive_ids(Faction::Monsters)[0];
        let mut side = 1;
        for tick in 0..900u32 {
            if tick % 60 == 0 {
                side = -side;
            }
            w.submit(
                villain,
                Action::swinging(Vec2::ZERO, hero, swept(side, Angle::HALF), HandCommand::TUCKED),
            );
            w.submit(hero, Action::HOLD);
            w.step();
        }
        assert_eq!(w.damage_dealt(Faction::Monsters), Fx::ZERO);
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

        let mut parries = 0;
        let mut side = 1;
        for tick in 0..600u32 {
            if tick % 26 == 0 {
                side = -side;
            }
            w.submit(
                a,
                Action::swinging(Vec2::ZERO, b, swept(side, Angle::ZERO), HandCommand::TUCKED),
            );
            // `-side` about the opposite bearing, so the two blades sweep
            // *toward* each other. Matching signs about opposing bearings point
            // them apart, and they never meet at all.
            w.submit(
                b,
                Action::swinging(Vec2::ZERO, a, swept(-side, Angle::HALF), HandCommand::TUCKED),
            );
            for event in w.step() {
                if let Event::Parry { a: x, b: y, .. } = event {
                    assert!(x.index < y.index, "a parry was reported unordered");
                    parries += 1;
                }
            }
        }
        assert!(parries > 0, "blades swept through each other without meeting");
    }

    #[test]
    fn a_mirrored_duel_is_symmetric() {
        // Two identical fighters placed symmetrically must trade identically.
        // This is the test that catches an in-place resolution loop: resolve
        // spin changes as you go and the lower entity index quietly wins.
        let mut scenario = Scenario::duel();
        scenario.units[1].kind = UnitKind::Warrior;
        scenario.units[1].stats = UnitKind::Warrior.base_stats();
        scenario.units[0].spawn = Vec2::from_ints(11, 8);
        scenario.units[1].spawn = Vec2::from_ints(13, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let mut side = 1;
        for tick in 0..900u32 {
            if tick % 22 == 0 {
                side = -side;
            }
            // Mirrored through the vertical axis: `a` swings from +side about
            // east, `b` from -side about west.
            w.submit(
                a,
                Action::swinging(Vec2::ZERO, b, swept(side, Angle::ZERO), HandCommand::TUCKED),
            );
            w.submit(
                b,
                Action::swinging(Vec2::ZERO, a, swept(-side, Angle::HALF), HandCommand::TUCKED),
            );
            w.step();
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
