use crate::genome::PolicySpec;
use crate::swing;
use crate::Policy;
use fx::{Fx, Vec2};
use sim::{Action, Contact, EntityId, Intent, Observation, Order};

/// Number of genes in the evolvable representation of [`UtilityWeights`].
pub const GENOME_LEN: usize = 8;

/// How much lateral drift a patrol takes on when it turns at a wall.
///
/// Not a gene, because it is not a preference. A patrol that retraces exactly
/// the same line back and forth sweeps a line; one that steps sideways at each
/// end sweeps a band, and a band is what finds somebody. Shared with
/// [`crate::DuelistPolicy`], which needs it for the same reason.
pub const SWEEP_LATERAL: Fx = Fx::from_ratio(6, 10);

/// How much room the ordered direction needs before a patrol turns around.
///
/// Roughly two body-lengths, so the turn happens at the wall rather than in
/// open ground where it would look like indecision.
pub const PATROL_TURN_CLEARANCE: Fx = Fx::from_int(2);

/// Which way along its standing order an agent is currently walking.
///
/// **One bit of memory, and it is what turns `Advance` into a search.** Without
/// it the rule has to be a pure function of position, and a memoryless agent at
/// a wall is stuck: whatever makes it step away from the wall stops applying the
/// moment it has stepped away, so it twitches on the spot in a band a unit and a
/// half wide. Measured on duels at the dim end of the skill range, two fighters
/// ordered to advance *at* each other cross over, arrive at opposite edges, and
/// pace two parallel lines twenty units apart for the rest of the run -- one
/// duel in six ended that way, at full health, with the clock stopped.
///
/// Remembering which way you were going costs a byte and turns that into a
/// fighter that walks back and finds the other one.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Patrol(i8);

impl Patrol {
    /// `+1` while following the order as given, `-1` on the return leg.
    #[inline]
    pub fn sign(self) -> Fx {
        if self.0 < 0 {
            -Fx::ONE
        } else {
            Fx::ONE
        }
    }

    #[inline]
    pub fn reverse(&mut self) {
        self.0 = if self.0 < 0 { 1 } else { -1 };
    }
}

/// Turns a standing heading into this tick's patrol leg, reversing at the wall.
///
/// Shared by both hand-authored policies so that "advance" means one thing.
/// Returns the direction to walk; `patrol` is updated in place when the leg
/// turns.
pub(crate) fn patrol_heading(obs: &Observation, heading: Vec2, patrol: &mut Patrol) -> Vec2 {
    if heading.is_zero() {
        return heading;
    }
    let leg = heading * patrol.sign();
    let clearance = {
        let horizontal = if leg.x.is_positive() {
            obs.wall_clearance[1]
        } else {
            obs.wall_clearance[0]
        };
        let vertical = if leg.y.is_positive() {
            obs.wall_clearance[3]
        } else {
            obs.wall_clearance[2]
        };
        horizontal * leg.x.abs() + vertical * leg.y.abs()
    };
    if clearance >= PATROL_TURN_CLEARANCE {
        return leg;
    }

    // At the end of the leg: turn, and step sideways on the way round so the
    // return sweeps new ground rather than retracing the outbound line.
    patrol.reverse();
    let along = leg.perp();
    let along = if obs.wall_clearance[3] >= obs.wall_clearance[2] {
        along
    } else {
        -along
    };
    (-leg + along * SWEEP_LATERAL).normalize()
}

/// The knobs behind the hand-authored behaviour.
///
/// Every field is exposed as a gene in `0..=1` and mapped into the range below,
/// which is what lets the lab run evolution over behaviour on day one -- no
/// autodiff, no Python, no network. The same fitness harness that ranks these
/// eight numbers will later rank a set of network weights, so the experiment
/// side of the project is exercised end to end before any learning exists.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UtilityWeights {
    /// How much nearness matters when picking a target.
    pub aggression: Fx,
    /// How much a wounded target is preferred. High values finish kills.
    pub bloodlust: Fx,
    /// How strongly the player's `Focus` order overrides its own judgement.
    pub obedience: Fx,
    /// Bonus for the target it is already fighting; discourages dithering.
    pub commitment: Fx,
    /// Health fraction below which it disengages.
    pub caution: Fx,
    /// Preferred distance to the target as a fraction of its reach. Below 1 it
    /// crowds in; near 1 it hovers at the edge of its swing.
    pub spacing: Fx,
    /// Pull toward the centre of mass of visible allies.
    pub cohesion: Fx,
    /// Preference for open ground over corners.
    pub wall_fear: Fx,
}

const LABELS: [&str; GENOME_LEN] = [
    "aggression",
    "bloodlust",
    "obedience",
    "commitment",
    "caution",
    "spacing",
    "cohesion",
    "wall_fear",
];

/// `(min, max)` for each gene, in field order.
const GENE_RANGES: [(Fx, Fx); GENOME_LEN] = [
    (Fx::ZERO, Fx::from_int(2)),              // aggression
    (Fx::ZERO, Fx::from_int(2)),              // bloodlust
    (Fx::ZERO, Fx::from_int(3)),              // obedience
    (Fx::ZERO, Fx::from_int(1)),              // commitment
    (Fx::ZERO, Fx::from_ratio(6, 10)),        // caution
    (Fx::from_ratio(3, 10), Fx::from_int(1)), // spacing
    (Fx::ZERO, Fx::from_int(1)),              // cohesion
    (Fx::ZERO, Fx::from_int(1)),              // wall_fear
];

const BASELINE_VALUES: [Fx; GENOME_LEN] = [
    Fx::from_ratio(10, 10),
    Fx::from_ratio(6, 10),
    Fx::from_ratio(15, 10),
    Fx::from_ratio(3, 10),
    Fx::from_ratio(2, 10),
    Fx::from_ratio(85, 100),
    Fx::from_ratio(25, 100),
    Fx::from_ratio(3, 10),
];

impl UtilityWeights {
    /// This policy's knobs, for evolution, for reporting and for the browser's
    /// sliders.
    pub const SPEC: PolicySpec = PolicySpec::new(&LABELS, &GENE_RANGES, &BASELINE_VALUES);

    /// Hand-tuned starting point. Evolution should beat this; if it cannot,
    /// something is wrong with the fitness function, not the search.
    pub const BASELINE: UtilityWeights = UtilityWeights {
        aggression: BASELINE_VALUES[0],
        bloodlust: BASELINE_VALUES[1],
        obedience: BASELINE_VALUES[2],
        commitment: BASELINE_VALUES[3],
        caution: BASELINE_VALUES[4],
        spacing: BASELINE_VALUES[5],
        cohesion: BASELINE_VALUES[6],
        wall_fear: BASELINE_VALUES[7],
    };

    /// Maps `GENOME_LEN` genes in `0..=1` onto weight ranges. Values outside
    /// `0..=1` are clamped, so a mutation operator never has to care.
    pub fn from_genome(genes: &[Fx]) -> UtilityWeights {
        let gene = |i: usize| UtilityWeights::SPEC.value(i, genes);
        UtilityWeights {
            aggression: gene(0),
            bloodlust: gene(1),
            obedience: gene(2),
            commitment: gene(3),
            caution: gene(4),
            spacing: gene(5),
            cohesion: gene(6),
            wall_fear: gene(7),
        }
    }

    /// The weights themselves, in gene order. Pairs with
    /// [`UtilityWeights::labels`] for reporting.
    pub fn values(self) -> [Fx; GENOME_LEN] {
        [
            self.aggression,
            self.bloodlust,
            self.obedience,
            self.commitment,
            self.caution,
            self.spacing,
            self.cohesion,
            self.wall_fear,
        ]
    }

    pub fn to_genome(self) -> [Fx; GENOME_LEN] {
        let fields = self.values();
        let mut genes = [Fx::ZERO; GENOME_LEN];
        for (i, value) in fields.iter().enumerate() {
            genes[i] = UtilityWeights::SPEC.gene(i, *value);
        }
        genes
    }

    pub fn labels() -> [&'static str; GENOME_LEN] {
        LABELS
    }
}

impl Default for UtilityWeights {
    fn default() -> Self {
        UtilityWeights::BASELINE
    }
}

/// Weighted-score behaviour: pick a target, choose a stance, blend in a few
/// steering urges.
///
/// Holds one scrap of memory -- the previous target, per entity -- so that
/// `commitment` can mean anything. Memory is keyed by entity index rather than
/// by iteration position, so it stays deterministic.
#[derive(Clone, Debug, Default)]
pub struct UtilityPolicy {
    pub weights: UtilityWeights,
    last_target: Vec<EntityId>,
    /// Which leg of its patrol each entity is on; see [`Patrol`].
    patrol: Vec<Patrol>,
}

impl UtilityPolicy {
    pub fn new(weights: UtilityWeights) -> UtilityPolicy {
        UtilityPolicy {
            weights,
            last_target: Vec::new(),
            patrol: Vec::new(),
        }
    }

    /// The patrol leg for `me`, growing the table on demand. Keyed by entity
    /// index like every other scrap of memory here, so it stays deterministic
    /// under any iteration order.
    fn patrol_of(&mut self, me: EntityId) -> &mut Patrol {
        let index = me.index as usize;
        if index >= self.patrol.len() {
            self.patrol.resize(index + 1, Patrol::default());
        }
        &mut self.patrol[index]
    }

    pub fn baseline() -> UtilityPolicy {
        UtilityPolicy::new(UtilityWeights::BASELINE)
    }

    pub fn from_genome(genes: &[Fx]) -> UtilityPolicy {
        UtilityPolicy::new(UtilityWeights::from_genome(genes))
    }

    fn recall(&self, me: EntityId) -> EntityId {
        self.last_target
            .get(me.index as usize)
            .copied()
            .unwrap_or(EntityId::NONE)
    }

    fn remember(&mut self, me: EntityId, target: EntityId) {
        let index = me.index as usize;
        if index >= self.last_target.len() {
            self.last_target.resize(index + 1, EntityId::NONE);
        }
        self.last_target[index] = target;
    }

    fn pick_target<'a>(&self, obs: &'a Observation) -> &'a Contact {
        let previous = self.recall(obs.me);
        let mut best: Option<(&Contact, Fx)> = None;
        for contact in obs.enemies() {
            let closeness = Fx::ONE - (contact.distance / obs.sight_range).clamp(Fx::ZERO, Fx::ONE);
            let mut score = self.weights.aggression * closeness
                + self.weights.bloodlust * (Fx::ONE - contact.hp_frac);
            if obs.order.focus() == Some(contact.id) {
                score += self.weights.obedience;
            }
            if contact.id == previous {
                score += self.weights.commitment;
            }
            // Ties keep the earlier candidate, and contacts arrive nearest
            // first, so equal scores resolve to the closer enemy.
            match best {
                Some((_, existing)) if existing >= score => {}
                _ => best = Some((contact, score)),
            }
        }
        // Callers only reach this with a non-empty contact list.
        best.expect("pick_target called with no visible enemies").0
    }

    /// Walk toward open ground. Doubles as wall avoidance and as a gentle pull
    /// to the middle of the arena, which is what stops two advancing lines from
    /// sliding past each other and stalemating in opposite corners.
    fn open_ground(&self, obs: &Observation) -> Vec2 {
        let bias = Vec2::new(
            obs.wall_clearance[1] - obs.wall_clearance[0],
            obs.wall_clearance[3] - obs.wall_clearance[2],
        );
        let scaled = bias * (self.weights.wall_fear / obs.sight_range.max(Fx::ONE));
        scaled.clamp_length(self.weights.wall_fear)
    }

    fn ally_centre(&self, obs: &Observation) -> Vec2 {
        let allies = obs.allies();
        if allies.is_empty() {
            return Vec2::ZERO;
        }
        let mut sum = Vec2::ZERO;
        for ally in allies {
            sum += ally.offset;
        }
        sum * Fx::from_ratio(1, allies.len() as i32)
    }

    fn cohesion(&self, obs: &Observation) -> Vec2 {
        let centre = self.ally_centre(obs);
        if centre.length() > Fx::from_int(3) {
            centre.normalize() * self.weights.cohesion
        } else {
            Vec2::ZERO
        }
    }

    /// Nothing in sight: do what the player asked.
    fn march(&self, obs: &Observation, patrol: &mut Patrol) -> Action {
        let heading = match obs.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Regroup => self.ally_centre(obs).normalize(),

            // Arriving somewhere is not a variation on marching, and both of
            // the steering behaviours below are actively wrong for it, which is
            // why this arm returns before reaching either of them.
            //
            // The wall sweep exists to stop an advancing line grinding into a
            // wall; applied to a destination near an edge it walks straight
            // past the click. And `open_ground` is a *search* urge for an agent
            // with nowhere in particular to be -- against an explicit
            // destination it is by construction fighting the player. It cannot
            // be tapered back in either: added before `clamp_length`, which
            // only ever shortens, a short sum passes through untouched, so the
            // bias never shrinks as the brake does and the two balance at a
            // stable fixed point `wall_fear * stride` short of the target --
            // 0.193 units short of every click at baseline, anywhere in the
            // arena. At the top of `wall_fear`'s evolvable range it is worse:
            // magnitude 1.0 exactly cancels the unit heading and the character
            // stops dead mid-room.
            Order::Goto(dest) => {
                // `wall_clearance` is un-noised ground truth, so the reachable
                // box is exactly recoverable: the world pins bodies to
                // `[radius, arena - radius]`, which makes a click within one
                // body radius of a wall unreachable. Without this the character
                // presses into the wall and never satisfies its own arrival
                // test.
                let wc = obs.wall_clearance;
                let lo = Vec2::new(
                    obs.position.x - wc[0] + obs.radius,
                    obs.position.y - wc[2] + obs.radius,
                );
                let hi = Vec2::new(
                    obs.position.x + wc[1] - obs.radius,
                    obs.position.y + wc[3] - obs.radius,
                );
                let to = dest.clamp_box(lo, hi) - obs.position;
                let distance = to.length();

                // Arrival deadband: one tick of travel. It scales itself with
                // agility instead of being a magic constant, and it clears by
                // some 400x the hard floor below which a direction component is
                // too small to move the body at all -- a deadband under that
                // floor never terminates. Stopping via `Action::HOLD` matters
                // too: below one tick of travel the sim would still turn the
                // character to face a step that moves nothing, leaving it
                // spinning on the spot, whereas a zero direction freezes the
                // arrival facing.
                if distance <= obs.move_speed {
                    return Action::HOLD;
                }

                // An action persists until the next decision, so pace the
                // stride by how much ground gets covered before the next
                // thought. This is the intellect stat as navigation: a dim
                // character commits to a longer stride and creeps in, a sharp
                // one lands it. The brake is load-bearing rather than polish --
                // without it the character ping-pongs across the destination
                // forever at an amplitude of one tick of travel.
                let stride = obs.move_speed * (obs.decision_period.max(1) as i32);
                let brake = (distance / stride).min(Fx::ONE);
                // Normalise first, *then* scale, so the brake is the whole
                // magnitude. The trailing clamp is defensive: `normalize`
                // truncates component-wise and can come back marginally over
                // one, and `decisions_never_exceed_unit_movement` should hold
                // unconditionally.
                return Action::moving((to.normalize() * brake).clamp_length(Fx::ONE));
            }

            Order::Hold | Order::Focus(_) => Vec2::ZERO,
        };

        // Once the ordered direction runs out of arena, turn and come back
        // rather than grinding into the wall. This is the difference between a
        // fight and a timeout: without it, the last survivors of each side push
        // to opposite edges, stand there, and the run ends in a draw -- which is
        // both bad to watch and useless as a fitness signal.
        let heading = patrol_heading(obs, heading, patrol);

        Action::moving((heading + self.open_ground(obs)).clamp_length(Fx::ONE))
    }

    fn disengage(&self, obs: &Observation) -> Action {
        let away = match obs.nearest_enemy() {
            Some(threat) => -threat.offset.normalize(),
            None => Vec2::ZERO,
        };
        Action {
            move_dir: (away + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
            intent: Intent::Flee,
            // Overwritten by `hands` before this leaves `decide`.
            ..Action::HOLD
        }
    }

    /// Where to put both hands, given everything else is already decided.
    ///
    /// Called last and applied over the top of whatever the movement logic
    /// produced, so adding swordplay to this policy did not move a single
    /// footstep -- `march_behaviour_is_byte_identical` is the proof, and it is
    /// worth keeping that way.
    ///
    /// **This is the naive swordsman, and it is meant to be beaten.** It attacks
    /// whenever it is able to, at whatever is nearest, from whichever side is
    /// nearest, and holds its guard at the enemy. Every one of those is a
    /// mistake a better fighter gets to punish:
    ///
    /// * It never chooses *not* to attack, so it spends its life in windups and
    ///   recoveries and can be hit at leisure by anyone who waits for one.
    /// * It cuts from the nearest side rather than the open one, so its blows
    ///   arrive wherever the geometry happens to put them.
    /// * It guards at the swordsman rather than at the blow, and a cut arriving
    ///   at an angle lands well round the body from where its wielder stands.
    ///
    /// Before the sword became a phase machine this was a windmill, and the
    /// list of what it did wrong was one item long, because there was only one
    /// thing to do.
    fn hands(&self, obs: &Observation, action: &mut Action) {
        let threat = match obs.nearest_enemy() {
            Some(c) => c,
            None => return, // nothing about: both hands stay tucked
        };
        let bearing = threat.offset.angle();
        action.hands[sim::SWORD] = swing::press(obs, bearing, sim::Strike::Nearest);
        action.hands[sim::SHIELD] = sim::HandCommand::new(bearing, Fx::ONE);
    }

    fn engage(&self, obs: &Observation) -> Action {
        let target = self.pick_target(obs);
        // The agent knows its own reach exactly: its weapon plus both bodies.
        let reach = obs.full_reach() + target.radius;
        let ideal = reach * self.weights.spacing;
        let toward = target.offset.normalize();

        let approach = if target.distance > ideal {
            toward
        } else if target.distance < ideal * Fx::from_ratio(7, 10) {
            -toward
        } else {
            Vec2::ZERO
        };

        Action {
            move_dir: (approach + self.cohesion(obs) + self.open_ground(obs)).clamp_length(Fx::ONE),
            intent: Intent::Attack(target.id),
            ..Action::HOLD
        }
    }
}

impl Policy for UtilityPolicy {
    fn decide(&mut self, obs: &Observation) -> Action {
        let mut action = if obs.enemies().is_empty() {
            let mut patrol = *self.patrol_of(obs.me);
            let action = self.march(obs, &mut patrol);
            *self.patrol_of(obs.me) = patrol;
            action
        } else if obs.hp_frac < self.weights.caution {
            self.disengage(obs)
        } else {
            self.engage(obs)
        };
        self.hands(obs, &mut action);
        if let Intent::Attack(target) = action.intent {
            self.remember(obs.me, target);
        }
        action
    }

    fn reset(&mut self) {
        self.last_target.clear();
        self.patrol.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{Faction, Scenario, Stats, World};

    fn contact(index: u32, x: i32, y: i32, hp: Fx) -> Contact {
        Contact {
            id: EntityId::new(index, 0),
            offset: Vec2::from_ints(x, y),
            distance: Vec2::from_ints(x, y).length(),
            hp_frac: hp,
            radius: Fx::from_ratio(4, 10),
            weapon_length: Fx::from_ratio(9, 10),
            min_strike_range: Fx::from_ratio(5, 10),
            // An even trade, since nothing in `UtilityPolicy` reads these and a
            // lopsided fixture would only invite someone to assert on it.
            threat: Fx::from_ratio(25, 100),
            frailty: Fx::from_ratio(25, 100),
            facing: fx::Angle::ZERO,
            sword_angle: fx::Angle::ZERO,
            sword_reach: Fx::ZERO,
            sword_spin: Fx::ZERO,
            sword_swing: sim::Swing::Guard,
            sword_left: Fx::ZERO,
            sword_line: fx::Angle::ZERO,
            shield_angle: fx::Angle::ZERO,
            shield_reach: Fx::ZERO,
        }
    }

    /// An agent standing in the middle of a 40x28 arena.
    fn situation(enemies: &[Contact]) -> Observation {
        let mut obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::from_ints(20, 14),
            Order::Hold,
        );
        obs.hp_frac = Fx::ONE;
        obs.attack_ready = Fx::ONE;
        obs.radius = Fx::from_ratio(45, 100);
        obs.weapon_length = Fx::from_ratio(9, 10);
        obs.sight_range = Fx::from_int(10);
        obs.move_speed = Fx::from_ratio(5, 100);
        // A Warrior's reaction speed. Set explicitly because `blank` defaults
        // it to 1, and a fixture left on that default would quietly test a
        // character that re-plans every tick -- which is not the character any
        // of these numbers were chosen for. Stride is 12 x 0.05 = 0.6 units.
        obs.decision_period = 12;
        obs.wall_clearance = [
            Fx::from_int(20),
            Fx::from_int(20),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        obs.set_enemies(enemies);
        obs
    }

    #[test]
    fn genome_round_trips() {
        let genes = UtilityWeights::BASELINE.to_genome();
        let restored = UtilityWeights::from_genome(&genes);
        // Range mapping is lossy at the last bit or two; each weight should
        // land within a thousandth of where it started.
        for (a, b) in [
            (restored.aggression, UtilityWeights::BASELINE.aggression),
            (restored.bloodlust, UtilityWeights::BASELINE.bloodlust),
            (restored.obedience, UtilityWeights::BASELINE.obedience),
            (restored.commitment, UtilityWeights::BASELINE.commitment),
            (restored.caution, UtilityWeights::BASELINE.caution),
            (restored.spacing, UtilityWeights::BASELINE.spacing),
            (restored.cohesion, UtilityWeights::BASELINE.cohesion),
            (restored.wall_fear, UtilityWeights::BASELINE.wall_fear),
        ] {
            assert!((a - b).abs() < Fx::from_ratio(1, 1000), "{a} vs {b}");
        }
    }

    #[test]
    fn genes_outside_the_unit_interval_are_clamped() {
        let wild = [Fx::from_int(-5); GENOME_LEN];
        let w = UtilityWeights::from_genome(&wild);
        assert_eq!(w.aggression, Fx::ZERO);
        assert_eq!(w.spacing, Fx::from_ratio(3, 10));
        let wild = [Fx::from_int(9); GENOME_LEN];
        let w = UtilityWeights::from_genome(&wild);
        assert_eq!(w.aggression, Fx::from_int(2));
        assert_eq!(w.spacing, Fx::ONE);
    }

    #[test]
    fn a_short_genome_is_tolerated() {
        let w = UtilityWeights::from_genome(&[Fx::ZERO]);
        assert_eq!(w.aggression, Fx::ZERO);
        // Missing genes default to the middle of their range.
        assert_eq!(w.bloodlust, Fx::ONE);
    }

    #[test]
    fn aggression_picks_the_near_enemy_and_bloodlust_picks_the_wounded_one() {
        let near_healthy = contact(1, 2, 0, Fx::ONE);
        let far_wounded = contact(2, 8, 0, Fx::from_ratio(1, 10));
        let obs = situation(&[near_healthy, far_wounded]);

        let mut brawler = UtilityPolicy::new(UtilityWeights {
            aggression: Fx::from_int(2),
            bloodlust: Fx::ZERO,
            commitment: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            brawler.decide(&obs).intent,
            Intent::Attack(near_healthy.id),
            "an aggressive agent should take what is in front of it"
        );

        let mut vulture = UtilityPolicy::new(UtilityWeights {
            aggression: Fx::ZERO,
            bloodlust: Fx::from_int(2),
            commitment: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            vulture.decide(&obs).intent,
            Intent::Attack(far_wounded.id),
            "a bloodthirsty agent should chase the kill"
        );
    }

    #[test]
    fn an_obedient_agent_follows_a_focus_order_against_its_own_judgement() {
        let near = contact(1, 2, 0, Fx::ONE);
        let far = contact(2, 9, 0, Fx::ONE);
        let mut obs = situation(&[near, far]);

        let mut wilful = UtilityPolicy::new(UtilityWeights {
            obedience: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(wilful.decide(&obs).intent, Intent::Attack(near.id));

        obs.order = Order::Focus(far.id);
        let mut obedient = UtilityPolicy::new(UtilityWeights {
            obedience: Fx::from_int(3),
            ..UtilityWeights::BASELINE
        });
        assert_eq!(
            obedient.decide(&obs).intent,
            Intent::Attack(far.id),
            "the player's order was ignored"
        );

        // ...and a wilful agent under the same order still does as it pleases.
        assert_eq!(wilful.decide(&obs).intent, Intent::Attack(near.id));
    }

    #[test]
    fn commitment_stops_an_agent_dithering_between_equal_targets() {
        let left = contact(1, -3, 0, Fx::ONE);
        let right = contact(2, 3, 0, Fx::ONE);
        // Equidistant, equally healthy: only memory can break the tie.
        let obs = situation(&[left, right]);

        let mut steady = UtilityPolicy::new(UtilityWeights {
            commitment: Fx::from_ratio(9, 10),
            ..UtilityWeights::BASELINE
        });
        let first = steady.decide(&obs).intent;
        for _ in 0..10 {
            assert_eq!(steady.decide(&obs).intent, first, "the agent dithered");
        }

        // Reset clears the memory but the tie still resolves the same way,
        // because ties fall to the nearer (earlier) contact.
        steady.reset();
        assert_eq!(steady.decide(&obs).intent, first);
    }

    #[test]
    fn a_cautious_agent_disengages_when_hurt_and_a_reckless_one_does_not() {
        let enemy = contact(1, 2, 0, Fx::ONE);
        let mut obs = situation(&[enemy]);
        obs.hp_frac = Fx::from_ratio(1, 10);

        let mut cautious = UtilityPolicy::new(UtilityWeights {
            caution: Fx::from_ratio(5, 10),
            ..UtilityWeights::BASELINE
        });
        let fleeing = cautious.decide(&obs);
        assert_eq!(fleeing.intent, Intent::Flee);
        assert!(
            fleeing.move_dir.x < Fx::ZERO,
            "fled toward the enemy: {:?}",
            fleeing.move_dir
        );

        let mut reckless = UtilityPolicy::new(UtilityWeights {
            caution: Fx::ZERO,
            ..UtilityWeights::BASELINE
        });
        assert_eq!(reckless.decide(&obs).intent, Intent::Attack(enemy.id));
    }

    #[test]
    fn an_agent_closes_when_out_of_reach_and_stops_closing_once_inside_it() {
        let mut policy = UtilityPolicy::baseline();

        let distant = contact(1, 6, 0, Fx::ONE);
        let closing = policy.decide(&situation(&[distant])).move_dir;
        assert!(closing.x > Fx::ZERO, "did not advance: {closing:?}");

        // Reach is radius 0.45 + 0.4 + range 0.9 = 1.75, so at 1.0 away this
        // agent is already inside its swing and has no reason to keep walking
        // into the target.
        let adjacent = contact(1, 1, 0, Fx::ONE);
        let holding = policy.decide(&situation(&[adjacent])).move_dir;
        assert!(
            holding.x <= Fx::ZERO,
            "kept crowding a target already in reach: {holding:?}"
        );
    }

    #[test]
    fn nothing_in_sight_means_following_the_standing_order() {
        let mut policy = UtilityPolicy::baseline();

        let mut obs = situation(&[]);
        obs.order = Order::Hold;
        let held = policy.decide(&obs);
        assert_eq!(held.intent, Intent::Hold);
        assert!(
            held.move_dir.length() < Fx::from_ratio(1, 100),
            "hold moved"
        );

        obs.order = Order::Advance(Vec2::X);
        let advancing = policy.decide(&obs);
        assert_eq!(advancing.intent, Intent::Hold);
        assert!(advancing.move_dir.x > Fx::from_ratio(5, 10));
    }

    #[test]
    fn wall_fear_steers_away_from_a_corner() {
        let mut obs = situation(&[]);
        obs.order = Order::Hold;
        // Jammed into the bottom-left corner.
        obs.wall_clearance = [
            Fx::from_ratio(5, 10),
            Fx::from_int(39),
            Fx::from_ratio(5, 10),
            Fx::from_int(27),
        ];
        let mut policy = UtilityPolicy::new(UtilityWeights {
            wall_fear: Fx::ONE,
            ..UtilityWeights::BASELINE
        });
        let escape = policy.decide(&obs).move_dir;
        assert!(
            escape.x > Fx::ZERO && escape.y > Fx::ZERO,
            "did not leave the corner: {escape:?}"
        );
    }

    /// A `Goto` order for a point `offset` away from where the agent stands.
    fn heading_for(offset: Vec2) -> Observation {
        let mut obs = situation(&[]);
        obs.order = Order::Goto(obs.position + offset);
        obs
    }

    #[test]
    fn goto_brakes_instead_of_overshooting() {
        // Half a stride out. An action persists for `decision_period` ticks, so
        // the quantity that must not exceed the remaining distance is the whole
        // committed walk, not one tick of it.
        let target = Fx::from_ratio(3, 10);
        let obs = heading_for(Vec2::new(target, Fx::ZERO));
        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;

        let committed = moved.length() * obs.move_speed * (obs.decision_period as i32);
        assert!(
            committed <= target + Fx::from_ratio(1, 1000),
            "committed to walking {committed} to cover {target}"
        );
        assert!(committed.is_positive(), "braked to a standstill: {moved:?}");
    }

    #[test]
    fn goto_holds_inside_the_deadband() {
        let obs = heading_for(Vec2::ZERO);
        let action = UtilityPolicy::baseline().decide(&obs);
        // Exactly `Action::HOLD`, not merely a short step: below one tick of
        // travel the sim still turns a character to face a step that moves it
        // nowhere, so anything but a zero direction leaves it spinning.
        assert_eq!(action.move_dir, Vec2::ZERO, "fidgeted on arrival");
        assert_eq!(action.intent, Intent::Hold);
    }

    #[test]
    fn goto_runs_flat_out_when_far() {
        let obs = heading_for(Vec2::from_ints(10, 0));
        let moved = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            (moved.length() - Fx::ONE).abs() < Fx::from_ratio(1, 1000),
            "dawdled sixteen strides from the target: {moved:?}"
        );
    }

    #[test]
    fn goto_ignores_the_wall_sweep() {
        // The agent stands 0.5 from the left wall -- close enough that an
        // `Advance` in that direction sweeps along the wall instead of grinding
        // into it. A `Goto` past the same wall must not: the sweep would walk
        // the character sideways past the click.
        let near_wall = [
            Fx::from_ratio(5, 10),
            Fx::from_int(39),
            Fx::from_int(14),
            Fx::from_int(14),
        ];

        let mut obs = situation(&[]);
        obs.wall_clearance = near_wall;
        obs.order = Order::Goto(Vec2::from_ints(10, 14));
        // The click is past the wall, so it clamps to the reachable box and
        // leaves only clearance minus radius = 0.05 of travel -- a whisker over
        // the 0.049988 deadband, which is the whole point: the character should
        // still take that whisker rather than sweep.
        let arriving = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            arriving.x < Fx::ZERO,
            "did not head for the click: {arriving:?}"
        );
        assert_eq!(
            arriving.y,
            Fx::ZERO,
            "swept along the wall on the way to a destination: {arriving:?}"
        );

        // ...whereas an `Advance` that has run out of arena turns the patrol
        // round and comes back, with a lateral step so the return leg sweeps
        // new ground instead of retracing the outbound line.
        obs.order = Order::Advance(-Vec2::X);
        let turning = UtilityPolicy::baseline().decide(&obs).move_dir;
        assert!(
            turning.x > Fx::ZERO,
            "an advance into the wall kept pushing into it: {turning:?}"
        );
        assert!(
            turning.y.abs() > Fx::ZERO,
            "the turn took no lateral step, so the return leg retraces: {turning:?}"
        );
        assert!(
            turning.x.abs() > turning.y.abs(),
            "the turn was more sideways than backwards: {turning:?}"
        );
    }

    #[test]
    fn a_patrol_turns_at_the_wall_and_comes_back() {
        // The one bit of memory in this policy, and what it is for. Two sides
        // ordered to advance *at* each other cross over, reach opposite edges,
        // and -- without a patrol leg to remember -- pace two parallel lines
        // twenty units apart until the clock runs out. Measured at the dim end
        // of the skill range that was one duel in six, both fighters at full
        // health, scored a draw because by then it was one.
        let mut policy = UtilityPolicy::baseline();
        let mut obs = situation(&[]);
        obs.order = Order::Advance(Vec2::X);

        // Open ground: follow the order as given.
        assert!(policy.decide(&obs).move_dir.x > Fx::ZERO);

        // Up against the far wall: turn.
        obs.wall_clearance = [
            Fx::from_int(39),
            Fx::from_ratio(5, 10),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        assert!(
            policy.decide(&obs).move_dir.x < Fx::ZERO,
            "ground into the wall instead of turning"
        );

        // ...and it *stays* turned once it is back in open ground, which is the
        // whole point of remembering. A rule that is a pure function of position
        // flips back the moment the wall is no longer close, and the character
        // twitches on the spot in a band a unit and a half wide.
        obs.wall_clearance = [
            Fx::from_int(20),
            Fx::from_int(20),
            Fx::from_int(14),
            Fx::from_int(14),
        ];
        for _ in 0..8 {
            assert!(
                policy.decide(&obs).move_dir.x < Fx::ZERO,
                "forgot which way it was walking as soon as it left the wall"
            );
        }

        // A fresh run starts a fresh patrol.
        policy.reset();
        assert!(policy.decide(&obs).move_dir.x > Fx::ZERO);
    }

    #[test]
    fn march_behaviour_is_byte_identical() {
        // `Goto` shares `march` with every order that came before it, and the
        // four of them are what every recorded run and every evolved genome in
        // the repository was measured on. Pinned raw values rather than a state
        // hash three crates away, so a regression fails at the line that moved.
        // Recorded from `march` as it stood before `Goto` was navigable.
        let mut policy = UtilityPolicy::baseline();
        let focus = Order::Focus(EntityId::new(1, 0));

        // Dead centre: the wall clearances cancel, so these are the steering
        // terms with `open_ground` contributing nothing.
        for (order, x, y) in [
            (Order::Hold, 0, 0),
            (Order::Advance(Vec2::X), 65536, 0),
            (Order::Regroup, 0, 0),
            (focus, 0, 0),
        ] {
            let mut obs = situation(&[]);
            obs.order = order;
            let moved = policy.decide(&obs).move_dir;
            assert_eq!((moved.x.raw(), moved.y.raw()), (x, y), "{order:?} moved");
        }

        // Jammed into the bottom-left corner with an ally behind it, so that
        // `open_ground`, the patrol turn and `ally_centre` all contribute.
        //
        // Two rows moved, and both moved on purpose: `Advance(-X)` and
        // `Regroup` are the two headings that run into the corner here, and a
        // heading that has run out of arena used to sweep along the wall and now
        // turns the patrol round. `Hold`, `Focus` and the advance *away* from
        // the corner are untouched, which is the claim this test exists to
        // make -- giving `march` a memory was not allowed to disturb the cases
        // that did not need one.
        for (order, x, y) in [
            (Order::Hold, 16194, 11146),
            (Order::Advance(Vec2::X), 64935, 8855),
            (Order::Advance(-Vec2::X), 62565, -19507),
            (Order::Regroup, 62067, 21039),
            (focus, 16194, 11146),
        ] {
            let mut policy = UtilityPolicy::baseline();
            let mut obs = situation(&[]);
            obs.order = order;
            obs.wall_clearance = [
                Fx::from_ratio(5, 10),
                Fx::from_int(39),
                Fx::from_ratio(5, 10),
                Fx::from_int(27),
            ];
            obs.set_allies(&[contact(9, -6, -6, Fx::ONE)]);
            let moved = policy.decide(&obs).move_dir;
            assert_eq!((moved.x.raw(), moved.y.raw()), (x, y), "{order:?} moved");
        }
    }

    #[test]
    fn decision_period_reaches_the_policy() {
        // The brake is paced by this number, and `Observation::blank` defaults
        // it to 1. If the world ever stopped filling it in, every `Goto` would
        // silently commit to a stride twelve times too short and the failure
        // would look like sluggishness, not like a bug.
        let world = World::new(&Scenario::room(), 1);
        let hero = world.alive_ids(Faction::Heroes)[0];
        assert_eq!(world.observe(hero).decision_period, 12);
        assert_eq!(
            world.observe(hero).decision_period,
            Stats::decision_period(world.view(hero).unwrap().stats)
        );
    }

    #[test]
    fn decisions_never_exceed_unit_movement() {
        // The sim clamps anyway, but a policy handing back a 4-long vector is
        // a bug that would silently become "runs at full speed diagonally".
        let mut policy = UtilityPolicy::baseline();
        let enemies = [
            contact(1, 3, 1, Fx::ONE),
            contact(2, -2, 4, Fx::from_ratio(3, 10)),
        ];
        for order in [Order::Hold, Order::Advance(Vec2::X), Order::Regroup] {
            let mut obs = situation(&enemies);
            obs.order = order;
            obs.set_allies(&[contact(9, -6, -6, Fx::ONE)]);
            let action = policy.decide(&obs);
            assert!(
                action.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "{order:?} produced {:?}",
                action.move_dir
            );
        }
    }
}
