use crate::rules::{Stats, Weapon};
use fx::Fx;

/// A generational handle into the world's entity arrays.
///
/// The generation counter is what makes stale references safe: an [`Intent`]
/// recorded in a replay can name an entity that has since died and had its
/// slot reused, and the sim will simply fail to resolve it instead of
/// attacking whatever moved in.
///
/// [`Intent`]: crate::Intent
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct EntityId {
    pub index: u32,
    pub generation: u32,
}

impl EntityId {
    /// A handle that never resolves.
    pub const NONE: EntityId = EntityId {
        index: u32::MAX,
        generation: u32::MAX,
    };

    pub const fn new(index: u32, generation: u32) -> EntityId {
        EntityId { index, generation }
    }

    pub const fn is_none(self) -> bool {
        self.index == u32::MAX
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u32(self.index);
        h.write_u32(self.generation);
    }
}

impl Default for EntityId {
    fn default() -> Self {
        EntityId::NONE
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Faction {
    Heroes,
    Monsters,
}

impl Faction {
    pub const fn opposing(self) -> Faction {
        match self {
            Faction::Heroes => Faction::Monsters,
            Faction::Monsters => Faction::Heroes,
        }
    }

    pub const fn index(self) -> usize {
        match self {
            Faction::Heroes => 0,
            Faction::Monsters => 1,
        }
    }
}

/// Unit archetypes: a body size, a stat template, and a weapon.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum UnitKind {
    /// Durable melee hero.
    Warrior,
    /// Fragile, fast, sees far.
    Scout,
    /// Slow, dim, hits like a truck.
    Brute,
    /// Weak swarm monster, quick to react.
    Skitterer,
}

impl UnitKind {
    pub const ALL: [UnitKind; 4] = [
        UnitKind::Warrior,
        UnitKind::Scout,
        UnitKind::Brute,
        UnitKind::Skitterer,
    ];

    pub const fn radius(self) -> Fx {
        match self {
            UnitKind::Warrior => Fx::from_ratio(45, 100),
            UnitKind::Scout => Fx::from_ratio(35, 100),
            UnitKind::Brute => Fx::from_ratio(70, 100),
            UnitKind::Skitterer => Fx::from_ratio(30, 100),
        }
    }

    /// How heavy this archetype is for its size, against a Warrior at `1.00`.
    ///
    /// Exists so that "big" and "heavy" are the same fact **by default** and
    /// different only on purpose. [`UnitKind::mass`] is otherwise pure geometry,
    /// which keeps the roster honest -- you cannot quietly give something a
    /// small body and a large one's momentum -- and this is the one dial that
    /// says an archetype is built differently rather than merely scaled.
    ///
    /// A Brute is dense: it is not a large Warrior, it is meat and plate at the
    /// same volume. A Skitterer is the opposite, a light thing for its
    /// footprint, which is what makes crowding one work and standing in front
    /// of a Brute not.
    pub const fn density(self) -> Fx {
        match self {
            UnitKind::Warrior => Fx::ONE,
            UnitKind::Scout => Fx::ONE,
            UnitKind::Brute => Fx::from_ratio(115, 100),
            UnitKind::Skitterer => Fx::from_ratio(80, 100),
        }
    }

    /// Body mass, with a Warrior as the unit.
    ///
    /// `density * radius^2`, normalised so a Warrior weighs `1.00`. Area rather
    /// than volume because the sim is two-dimensional and a mass that scaled as
    /// the cube would put a Brute at four times a Warrior and a Skitterer at a
    /// third of one -- a spread wide enough that the light archetypes stop being
    /// able to hold ground at all, which is a worse game than the one where
    /// crowding is a real tactic with a real price.
    ///
    /// | | radius | density | mass |
    /// |---|---|---|---|
    /// | Warrior | 0.45 | 1.00 | 1.00 |
    /// | Scout | 0.35 | 1.00 | 0.60 |
    /// | Brute | 0.70 | 1.15 | 2.78 |
    /// | Skitterer | 0.30 | 0.80 | 0.36 |
    ///
    /// Deliberately **not** a stat. Stats are the difficulty ladder's knobs, and
    /// a mass that moved with them would tie every physical interaction in the
    /// game to the dial that is supposed to make a fighter better or worse at
    /// using them. A dim Brute and a sharp one weigh the same.
    pub fn mass(self) -> Fx {
        let r = self.radius();
        let reference = UnitKind::Warrior.radius();
        fx::mul_div(r * r, self.density(), reference * reference)
    }

    /// Baseline attributes before any scenario-level scaling.
    pub const fn base_stats(self) -> Stats {
        match self {
            //                    pow agi int per vit
            UnitKind::Warrior => Stats::new(6, 6, 8, 6, 8),
            UnitKind::Scout => Stats::new(4, 12, 10, 14, 4),
            UnitKind::Brute => Stats::new(12, 2, 2, 3, 14),
            UnitKind::Skitterer => Stats::new(3, 9, 12, 5, 2),
        }
    }

    /// What this archetype fights with.
    ///
    /// The four rows are meant to be four *problems*, not four difficulties.
    /// A Brute reaches 1.45 units past its own considerable body and hits like
    /// nothing else, but announces every cut for more than half a second and
    /// guards a mere 22.5 degrees of arc; a Scout has half the reach and a third
    /// of the mass but throws three attacks inside one of those.
    ///
    /// The two phase columns are where an archetype's difficulty actually
    /// lives, and they are best read against the *opponent's*
    /// [`Stats::decision_period`] rather than against each other. A Brute's
    /// 33-tick telegraph gives a Warrior (period 12) two or three chances to
    /// answer and a Skitterer (period 8) four; a Scout's 7-tick telegraph gives
    /// a Brute (period 18) *none at all*. That asymmetry is deliberate and it is
    /// the whole skill gradient: what a fighter can answer is decided by how
    /// often it is allowed to think, so the same policy on a sharper character
    /// is a genuinely better swordsman rather than a faster one.
    ///
    /// [`Stats::decision_period`]: crate::rules::Stats::decision_period
    pub const fn weapon(self) -> Weapon {
        match self {
            // A long two-handed axe, tip-heavy, with everything that follows
            // from it. Six times a Warrior's blade inertia, so it accelerates
            // at a quarter the rate and takes 91 ticks to get through a cut --
            // and its wielder can only hold it at 911 raw units of spin against
            // a Warrior's 1880, because you cannot keep that much mass on that
            // long a lever going any faster. See `rules::grip_limit`.
            //
            // What it does *not* do is hit harder for being heavy. Mass cancels
            // out of the damage law exactly (see `rules::blow_damage`); the axe
            // hits hardest because it is long, and 2.15 units of arm squared is
            // what a `1/2 m v^2` law rewards. Weight buys the shove instead.
            UnitKind::Brute => Weapon {
                length: Fx::from_ratio(145, 100),
                mass: Fx::from_ratio(223, 100),
                balance: Fx::from_ratio(61, 100),
                shield_arc: 4_096, // +/- 22.5 deg
                windup: 26,
                recovery: 34,
            },
            UnitKind::Warrior => Weapon {
                length: Fx::from_ratio(95, 100),
                mass: Fx::from_ratio(124, 100),
                balance: Fx::from_ratio(55, 100),
                shield_arc: 11_264, // +/- 61.9 deg
                windup: 14,
                recovery: 16,
            },
            // Hilt-heavy and short: the lowest inertia in the roster, so it is
            // the one weapon that gets to the arm's ceiling early and coasts.
            // Speed limited, and therefore the lightest hitter of the three
            // that carry a real blade.
            UnitKind::Scout => Weapon {
                length: Fx::from_ratio(55, 100),
                mass: Fx::from_ratio(86, 100),
                balance: Fx::from_ratio(50, 100),
                shield_arc: 8_192, // +/- 45.0 deg
                windup: 8,
                recovery: 9,
            },
            // Dense for its size and hafted well forward, which is what keeps a
            // knife on a very short arm worth anything at all.
            UnitKind::Skitterer => Weapon {
                length: Fx::from_ratio(40, 100),
                mass: Fx::from_ratio(125, 100),
                balance: Fx::from_ratio(75, 100),
                shield_arc: 3_072, // +/- 16.9 deg
                windup: 7,
                recovery: 8,
            },
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            UnitKind::Warrior => "warrior",
            UnitKind::Scout => "scout",
            UnitKind::Brute => "brute",
            UnitKind::Skitterer => "skitterer",
        }
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u8(match self {
            UnitKind::Warrior => 0,
            UnitKind::Scout => 1,
            UnitKind::Brute => 2,
            UnitKind::Skitterer => 3,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::Arm;

    /// Once the invariant that licensed closest-approach hit detection; now a
    /// **cost** guard rather than a correctness one.
    ///
    /// `fx::swept_segment_circle` is correct at any speed, so a blade outrunning
    /// a body no longer passes through it. What the bound still buys is the
    /// sub-step count: one sub-step per body-radius of relative travel, so a
    /// roster staying under a body-diameter per tick keeps the hot loop at one
    /// or two samples per pair instead of walking toward
    /// `fx::SWEEP_SUBSTEPS_MAX`. Worth keeping, worth breaking on purpose.
    ///
    /// `segment_circle` asks where a blade *is*, not where it has *been*, so it
    /// is correct only while no tip can cross a whole body between two ticks.
    /// The smallest body in the game is a Skitterer at radius 0.30, giving a
    /// budget of 0.60 units of tip travel per tick. Agility is a `u8` that no
    /// archetype bounds, so this sweeps all of it: the clamp inside
    /// `agility_multiplier` is the only thing holding the invariant up, and a
    /// comment would not have caught someone widening it.
    #[test]
    fn no_blade_can_outrun_the_smallest_body() {
        let smallest = UnitKind::ALL
            .iter()
            .map(|k| k.radius())
            .fold(Fx::MAX, Fx::min);
        let budget = smallest * Fx::TWO;

        let mut worst = Fx::ZERO;
        for kind in UnitKind::ALL {
            let weapon = kind.weapon();
            let tip = kind.radius() + weapon.length;
            for agility in 0..=255u8 {
                let mut stats = kind.base_stats();
                stats.agility = agility;
                let arm = Arm::resolve(weapon, stats, kind.radius());
                let travel = fx::tangential_speed(arm.reachable_spin(), tip);
                assert!(
                    travel < budget,
                    "{} at agility {agility} moves its tip {travel} per tick, \
                     past the {budget} budget -- closest-approach detection \
                     would tunnel through a body",
                    kind.name()
                );
                worst = worst.max(travel);
            }
        }
        // Not merely under budget but with room to spare, so a modest tuning
        // change to the weapon table does not silently land on the edge.
        assert!(worst < budget * Fx::from_ratio(9, 10), "worst case {worst}");
    }

    #[test]
    fn mass_is_the_body_squared_and_a_warrior_is_the_unit() {
        assert_eq!(UnitKind::Warrior.mass(), Fx::ONE);

        // Doubling the radius quadruples the mass at equal density, which is
        // the whole claim the derivation makes.
        let scout = UnitKind::Scout.mass();
        let expected = Fx::from_ratio(35 * 35, 45 * 45);
        assert!((scout - expected).abs() < Fx::from_ratio(1, 1000), "{scout}");

        // The spread the physics is built on, in order and with room between.
        let mut ordered = UnitKind::ALL;
        ordered.sort_by_key(|k| k.mass());
        assert_eq!(
            ordered,
            [
                UnitKind::Skitterer,
                UnitKind::Scout,
                UnitKind::Warrior,
                UnitKind::Brute
            ]
        );
        let ratio = UnitKind::Brute.mass() / UnitKind::Skitterer.mass();
        assert!(
            ratio > Fx::from_int(5) && ratio < Fx::from_int(10),
            "a Brute is {ratio} Skitterers -- the spread has drifted"
        );
    }

    #[test]
    fn no_archetype_is_weightless() {
        // Every mass is a divisor somewhere in the impulse model. A zero here
        // is a saturated velocity there, and the sim would rather fail in this
        // assertion than in a fight.
        for kind in UnitKind::ALL {
            assert!(kind.mass().is_positive(), "{} weighs nothing", kind.name());
            assert!(kind.density().is_positive(), "{}", kind.name());
        }
    }

    #[test]
    fn every_archetype_reaches_further_than_it_is_wide() {
        // A weapon shorter than its wielder's body could never be brought to
        // bear on anything, because bodies separate before blades meet.
        for kind in UnitKind::ALL {
            assert!(
                kind.weapon().length > kind.radius() * Fx::HALF,
                "{} cannot reach past its own shoulders",
                kind.name()
            );
        }
    }
}
