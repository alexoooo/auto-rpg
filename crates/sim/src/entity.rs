use crate::rules::Stats;
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

/// Unit archetypes. Milestone 1 keeps these to a body size and a stat
/// template; abilities and equipment come later.
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
