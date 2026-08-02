use crate::Policy;
use fx::{Fx, Vec2};
use sim::{Action, Contact, EntityId, Intent, Observation, Order};

/// Number of genes in the evolvable representation of [`UtilityWeights`].
pub const GENOME_LEN: usize = 8;

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

impl UtilityWeights {
    /// Hand-tuned starting point. Evolution should beat this; if it cannot,
    /// something is wrong with the fitness function, not the search.
    pub const BASELINE: UtilityWeights = UtilityWeights {
        aggression: Fx::from_ratio(10, 10),
        bloodlust: Fx::from_ratio(6, 10),
        obedience: Fx::from_ratio(15, 10),
        commitment: Fx::from_ratio(3, 10),
        caution: Fx::from_ratio(2, 10),
        spacing: Fx::from_ratio(85, 100),
        cohesion: Fx::from_ratio(25, 100),
        wall_fear: Fx::from_ratio(3, 10),
    };

    /// Maps `GENOME_LEN` genes in `0..=1` onto weight ranges. Values outside
    /// `0..=1` are clamped, so a mutation operator never has to care.
    pub fn from_genome(genes: &[Fx]) -> UtilityWeights {
        let gene = |i: usize| -> Fx {
            let (lo, hi) = GENE_RANGES[i];
            let t = genes.get(i).copied().unwrap_or(Fx::HALF);
            lo + (hi - lo) * t.clamp(Fx::ZERO, Fx::ONE)
        };
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
            let (lo, hi) = GENE_RANGES[i];
            genes[i] = ((*value - lo) / (hi - lo)).clamp(Fx::ZERO, Fx::ONE);
        }
        genes
    }

    pub fn labels() -> [&'static str; GENOME_LEN] {
        [
            "aggression",
            "bloodlust",
            "obedience",
            "commitment",
            "caution",
            "spacing",
            "cohesion",
            "wall_fear",
        ]
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
}

impl UtilityPolicy {
    pub fn new(weights: UtilityWeights) -> UtilityPolicy {
        UtilityPolicy {
            weights,
            last_target: Vec::new(),
        }
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

    /// How much room is left in `direction` before the arena edge.
    fn clearance_toward(&self, obs: &Observation, direction: Vec2) -> Fx {
        let horizontal = if direction.x.is_positive() {
            obs.wall_clearance[1]
        } else {
            obs.wall_clearance[0]
        };
        let vertical = if direction.y.is_positive() {
            obs.wall_clearance[3]
        } else {
            obs.wall_clearance[2]
        };
        horizontal * direction.x.abs() + vertical * direction.y.abs()
    }

    /// Nothing in sight: do what the player asked.
    fn march(&self, obs: &Observation) -> Action {
        let heading = match obs.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Regroup => self.ally_centre(obs).normalize(),
            Order::Hold | Order::Focus(_) => Vec2::ZERO,
        };

        // Once the ordered direction runs into a wall, sweep along it instead
        // of grinding into it. This is the difference between a fight and a
        // timeout: without it, the last survivors of each side push to opposite
        // edges, stand there, and the run ends in a draw -- which is both bad
        // to watch and useless as a fitness signal. Sweeping toward whichever
        // side has more room turns it into a patrol that eventually finds
        // whatever is left alive.
        let heading = if !heading.is_zero() && self.clearance_toward(obs, heading) < Fx::from_int(2)
        {
            let along = heading.perp();
            if obs.wall_clearance[3] >= obs.wall_clearance[2] {
                along
            } else {
                -along
            }
        } else {
            heading
        };

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
        }
    }

    fn engage(&self, obs: &Observation) -> Action {
        let target = self.pick_target(obs);
        // The agent knows its own reach exactly: its stats plus both bodies.
        let reach = obs.radius + target.radius + obs.attack_range;
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
        }
    }
}

impl Policy for UtilityPolicy {
    fn decide(&mut self, obs: &Observation) -> Action {
        let action = if obs.enemies().is_empty() {
            self.march(obs)
        } else if obs.hp_frac < self.weights.caution {
            self.disengage(obs)
        } else {
            self.engage(obs)
        };
        if let Intent::Attack(target) = action.intent {
            self.remember(obs.me, target);
        }
        action
    }

    fn reset(&mut self) {
        self.last_target.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::Faction;

    fn contact(index: u32, x: i32, y: i32, hp: Fx) -> Contact {
        Contact {
            id: EntityId::new(index, 0),
            offset: Vec2::from_ints(x, y),
            distance: Vec2::from_ints(x, y).length(),
            hp_frac: hp,
            radius: Fx::from_ratio(4, 10),
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
        obs.attack_range = Fx::from_ratio(9, 10);
        obs.sight_range = Fx::from_int(10);
        obs.move_speed = Fx::from_ratio(5, 100);
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
