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
    /// nothing else, but takes the better part of a second to bring its blade
    /// around and guards a mere 22.5 degrees of arc; a Scout has half the reach
    /// and a third of the mass but can change its mind four times inside one of
    /// those swings. Beating a Brute is a matter of standing somewhere its tip
    /// is not, and that is a decision its opponent gets to make about fifty
    /// times per swing.
    pub const fn weapon(self) -> Weapon {
        match self {
            UnitKind::Warrior => Weapon {
                length: Fx::from_ratio(95, 100),
                torque: Fx::from_int(190),
                max_spin: Fx::from_int(2000),
                extend_rate: Fx::from_ratio(100, 1000),
                weight: Fx::from_ratio(125, 100),
                shield_arc: 11_264, // +/- 61.9 deg
            },
            UnitKind::Scout => Weapon {
                length: Fx::from_ratio(55, 100),
                torque: Fx::from_int(400),
                max_spin: Fx::from_int(3000),
                extend_rate: Fx::from_ratio(140, 1000),
                weight: Fx::from_ratio(85, 100),
                shield_arc: 8_192, // +/- 45.0 deg
            },
            UnitKind::Brute => Weapon {
                length: Fx::from_ratio(145, 100),
                torque: Fx::from_int(48),
                max_spin: Fx::from_int(950),
                extend_rate: Fx::from_ratio(55, 1000),
                weight: Fx::from_ratio(330, 100),
                shield_arc: 4_096, // +/- 22.5 deg
            },
            UnitKind::Skitterer => Weapon {
                length: Fx::from_ratio(40, 100),
                torque: Fx::from_int(330),
                max_spin: Fx::from_int(2600),
                extend_rate: Fx::from_ratio(130, 1000),
                weight: Fx::from_ratio(120, 100),
                shield_arc: 3_072, // +/- 16.9 deg
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
    use crate::rules::agility_multiplier;

    /// The invariant that licenses closest-approach hit detection.
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
            let arm = kind.radius() + weapon.length;
            for agility in 0..=255u8 {
                let ceiling = weapon.max_spin * agility_multiplier(agility);
                let travel = fx::tangential_speed(ceiling, arm);
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
