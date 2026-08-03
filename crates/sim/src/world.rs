use crate::action::{Action, Intent, Order};
use crate::entity::{EntityId, Faction, UnitKind};
use crate::event::Event;
use crate::obs::{Contact, Observation};
use crate::rules::{Stats, MAX_CONTACTS};
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
    facing: Vec<Angle>,
    radius: Vec<Fx>,
    hp: Vec<Fx>,
    max_hp: Vec<Fx>,
    attack_cd: Vec<u16>,
    next_decision: Vec<u32>,
    action: Vec<Action>,
    last_attacker: Vec<EntityId>,
    /// Tick of the last blow dealt or received; gates regeneration.
    last_combat: Vec<u32>,
    damage_dealt: Vec<Fx>,

    free: Vec<u32>,
    events: Vec<Event>,
    pending: Vec<EntityId>,
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
            facing: Vec::with_capacity(n),
            radius: Vec::with_capacity(n),
            hp: Vec::with_capacity(n),
            max_hp: Vec::with_capacity(n),
            attack_cd: Vec::with_capacity(n),
            next_decision: Vec::with_capacity(n),
            action: Vec::with_capacity(n),
            last_attacker: Vec::with_capacity(n),
            last_combat: Vec::with_capacity(n),
            damage_dealt: Vec::with_capacity(n),
            free: Vec::new(),
            events: Vec::new(),
            pending: Vec::with_capacity(n),
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
                self.facing.push(Angle::ZERO);
                self.radius.push(spec.kind.radius());
                self.hp.push(max_hp);
                self.max_hp.push(max_hp);
                self.attack_cd.push(0);
                self.next_decision.push(0);
                self.action.push(Action::HOLD);
                self.last_attacker.push(EntityId::NONE);
                self.last_combat.push(0);
                self.damage_dealt.push(Fx::ZERO);
                self.generation.len() - 1
            }
        };
        self.alive[i] = true;
        self.kind[i] = spec.kind;
        self.faction[i] = spec.faction;
        self.stats[i] = spec.stats;
        self.pos[i] = spec.spawn;
        self.facing[i] = match spec.faction {
            Faction::Heroes => Angle::ZERO,
            Faction::Monsters => Angle::HALF,
        };
        self.radius[i] = spec.kind.radius();
        self.hp[i] = max_hp;
        self.max_hp[i] = max_hp;
        self.attack_cd[i] = 0;
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

        obs.hp_frac = self.hp_frac(i);
        obs.radius = self.radius[i];
        obs.attack_range = stats.attack_range();
        obs.sight_range = stats.sight_range();
        obs.move_speed = stats.move_speed();
        obs.decision_period = stats.decision_period();
        obs.attack_ready = if self.attack_cd[i] == 0 {
            Fx::ONE
        } else {
            let period = stats.attack_period();
            let remaining = Fx::from_ratio(self.attack_cd[i] as i32, period as i32);
            (Fx::ONE - remaining).clamp(Fx::ZERO, Fx::ONE)
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
    /// Phase order is fixed and load-bearing. In particular deaths are applied
    /// *after* every attack resolves, so two units that kill each other on the
    /// same tick both die -- the alternative makes the outcome depend on entity
    /// index, which is exactly the kind of asymmetry that makes a mirror match
    /// unfair and a replay fragile.
    pub fn step(&mut self) -> &[Event] {
        self.events.clear();
        self.expire_unanswered_decisions();
        self.tick_cooldowns();
        self.regenerate();
        self.apply_movement();
        self.separate();
        self.resolve_attacks();
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
            if self.alive[i] {
                self.attack_cd[i] = self.attack_cd[i].saturating_sub(1);
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
            let dir = self.action[i].move_dir.clamp_length(Fx::ONE);
            if dir.is_zero() {
                continue;
            }
            let step = dir * self.stats[i].move_speed();
            self.pos[i] = self.clamp_to_arena(self.pos[i] + step, self.radius[i]);
            self.facing[i] = dir.angle();
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

    fn resolve_attacks(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.attack_cd[i] > 0 {
                continue;
            }
            let target = match self.action[i].intent {
                Intent::Attack(target) => target,
                _ => continue,
            };
            let t = match self.resolve(target) {
                Some(t) => t,
                None => continue,
            };
            if self.faction[t] == self.faction[i] {
                continue; // no friendly fire, ever
            }
            let reach = self.radius[i] + self.radius[t] + self.stats[i].attack_range();
            let delta = self.pos[t] - self.pos[i];
            if delta.length() > reach {
                continue;
            }

            let amount = self.stats[i].damage();
            let effective = amount.min(self.hp[t].max(Fx::ZERO));
            self.hp[t] -= amount;
            self.damage_dealt[i] += effective;
            self.attack_cd[i] = self.stats[i].attack_period();
            self.last_attacker[t] = self.id_of(i);
            self.last_combat[i] = self.tick;
            self.last_combat[t] = self.tick;
            if !delta.is_zero() {
                self.facing[i] = delta.angle();
            }
            self.events.push(Event::Damage {
                source: self.id_of(i),
                target,
                amount,
                lethal: !self.hp[t].is_positive(),
            });
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
            h.write_u16(self.attack_cd[i]);
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

    fn clamp_to_arena(&self, p: Vec2, radius: Fx) -> Vec2 {
        p.clamp_box(
            Vec2::new(radius, radius),
            Vec2::new(self.arena.x - radius, self.arena.y - radius),
        )
    }

    fn contact(&self, observer: usize, target: usize, noise: Fx, rng: &mut Rng) -> Contact {
        let mut offset = self.pos[target] - self.pos[observer];
        let mut hp_frac = self.hp_frac(target);
        if !noise.is_zero() {
            offset += Vec2::new(rng.gaussian(noise), rng.gaussian(noise));
            hp_frac =
                (hp_frac + rng.gaussian(noise * Fx::from_ratio(1, 5))).clamp(Fx::ZERO, Fx::ONE);
        }
        Contact {
            id: self.id_of(target),
            offset,
            distance: offset.length(),
            hp_frac,
            radius: self.radius[target],
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

    #[test]
    fn units_close_and_kill_each_other() {
        let mut w = duel_world();
        let hero = w.alive_ids(Faction::Heroes)[0];
        let monster = w.alive_ids(Faction::Monsters)[0];

        let mut outcome = None;
        for _ in 0..(60 * 120) {
            for id in w.pending_decisions().to_vec() {
                let target = if id == hero { monster } else { hero };
                let obs = w.observe(id);
                let dir = match obs.enemies().first() {
                    Some(c) => c.offset.normalize(),
                    None => (Vec2::from_ints(12, 8) - obs.position).normalize(),
                };
                w.submit(id, Action::attacking(dir, target));
            }
            w.step();
            if let Some(o) = w.outcome() {
                outcome = Some(o);
                break;
            }
        }
        assert!(outcome.is_some(), "the duel never resolved");
    }

    #[test]
    fn friendly_fire_is_impossible() {
        let mut scenario = Scenario::duel();
        scenario.units[1].faction = Faction::Heroes;
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let ids = w.alive_ids(Faction::Heroes);
        let (a, b) = (ids[0], ids[1]);
        for _ in 0..300 {
            w.submit(a, Action::attacking(Vec2::ZERO, b));
            w.submit(b, Action::attacking(Vec2::ZERO, a));
            w.step();
        }
        assert_eq!(w.alive_count(Faction::Heroes), 2);
        assert_eq!(w.health_fraction(Faction::Heroes), Fx::ONE);
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
