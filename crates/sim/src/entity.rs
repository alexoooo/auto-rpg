use crate::action::{ActionKind, ActionSpec, Role};
use crate::loadout::Loadout;
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

/// A body: a size, a weight, and a stat template.
///
/// **It fights with whatever is in its hand**, which is the whole of what this
/// type used to get wrong. It was `UnitKind`, and one variant carried the body,
/// the stats, the weapon *and* the shield arc as a single indivisible fact --
/// so a Skitterer did not *carry* a knife, it *was* one, and "what does a Brute
/// with a knife play like" was a question with no representation. The weapon
/// moved out to [`ActionKind`]; what is left here is only what a body is.
///
/// The variant order is load-bearing and unchanged from `UnitKind`:
/// [`Body::hash_into`] writes it, so every recorded run in the repository
/// depends on `Fighter` still sitting where `Warrior` did.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Body {
    /// Durable melee hero.
    Fighter,
    /// Fragile, fast, sees far.
    Rogue,
    /// Slow, dim, hits like a truck.
    Brute,
    /// Weak swarm monster, quick to react.
    Skitterer,
}

impl Body {
    pub const ALL: [Body; 4] = [
        Body::Fighter,
        Body::Rogue,
        Body::Brute,
        Body::Skitterer,
    ];

    pub const fn radius(self) -> Fx {
        match self {
            Body::Fighter => Fx::from_ratio(45, 100),
            Body::Rogue => Fx::from_ratio(35, 100),
            Body::Brute => Fx::from_ratio(70, 100),
            Body::Skitterer => Fx::from_ratio(30, 100),
        }
    }

    /// How heavy this archetype is for its size, against a Fighter at `1.00`.
    ///
    /// Exists so that "big" and "heavy" are the same fact **by default** and
    /// different only on purpose. [`Body::mass`] is otherwise pure geometry,
    /// which keeps the roster honest -- you cannot quietly give something a
    /// small body and a large one's momentum -- and this is the one dial that
    /// says an archetype is built differently rather than merely scaled.
    ///
    /// A Brute is dense: it is not a large Fighter, it is meat and plate at the
    /// same volume. A Skitterer is the opposite, a light thing for its
    /// footprint, which is what makes crowding one work and standing in front
    /// of a Brute not.
    pub const fn density(self) -> Fx {
        match self {
            Body::Fighter => Fx::ONE,
            Body::Rogue => Fx::ONE,
            Body::Brute => Fx::from_ratio(115, 100),
            Body::Skitterer => Fx::from_ratio(80, 100),
        }
    }

    /// Body mass, with a Fighter as the unit.
    ///
    /// `density * radius^2`, normalised so a Fighter weighs `1.00`. Area rather
    /// than volume because the sim is two-dimensional and a mass that scaled as
    /// the cube would put a Brute at four times a Fighter and a Skitterer at a
    /// third of one -- a spread wide enough that the light archetypes stop being
    /// able to hold ground at all, which is a worse game than the one where
    /// crowding is a real tactic with a real price.
    ///
    /// | | radius | density | mass |
    /// |---|---|---|---|
    /// | Fighter | 0.45 | 1.00 | 1.00 |
    /// | Rogue | 0.35 | 1.00 | 0.60 |
    /// | Brute | 0.70 | 1.15 | 2.78 |
    /// | Skitterer | 0.30 | 0.80 | 0.36 |
    ///
    /// Deliberately **not** a stat. Stats are the difficulty ladder's knobs, and
    /// a mass that moved with them would tie every physical interaction in the
    /// game to the dial that is supposed to make a fighter better or worse at
    /// using them. A dim Brute and a sharp one weigh the same.
    pub fn mass(self) -> Fx {
        let r = self.radius();
        let reference = Body::Fighter.radius();
        fx::mul_div(r * r, self.density(), reference * reference)
    }

    /// Baseline attributes before any scenario-level scaling.
    pub const fn base_stats(self) -> Stats {
        match self {
            //                    pow agi int per vit
            Body::Fighter => Stats::new(6, 6, 8, 6, 8),
            Body::Rogue => Stats::new(4, 12, 10, 14, 4),
            Body::Brute => Stats::new(12, 2, 2, 3, 14),
            Body::Skitterer => Stats::new(3, 9, 12, 5, 2),
        }
    }

    /// What this body walks in with.
    ///
    /// A **default**, not an identity -- that is the whole difference between
    /// this and the `weapon()` it replaced. A scenario, the spawn panel or the
    /// player may hand any body any loadout, and the interesting matchups are
    /// mostly the ones this table does not list.
    ///
    /// The four rows are meant to be four *problems*, not four difficulties. A
    /// Brute reaches 1.45 units past its own considerable body and hits like
    /// nothing else, but announces every cut for more than half a second; a
    /// Skitterer has a quarter of the reach and throws three attacks inside one
    /// of those. A Fighter is the only one that walks in with a guard, and it
    /// pays for that by having to put the sword away to use it.
    ///
    /// An action's phase columns are where difficulty actually lives, and they
    /// are best read against the *opponent's* [`Stats::decision_period`] rather
    /// than against each other. A Club's 33-tick telegraph gives a Fighter
    /// (period 12) two or three chances to answer and a Skitterer (period 8)
    /// four; a Knife's 7 gives a Brute (period 18) *none at all*. That asymmetry
    /// is deliberate and it is the whole skill gradient: what a fighter can
    /// answer is decided by how often it is allowed to think, so the same policy
    /// on a sharper character is a genuinely better swordsman rather than a
    /// faster one.
    ///
    /// [`Stats::decision_period`]: crate::rules::Stats::decision_period
    pub const fn default_loadout(self) -> Loadout {
        match self {
            // The only body that walks in able to defend, and the only one for
            // which the loadout is a genuine dilemma every exchange.
            Body::Fighter => Loadout::pair(ActionKind::Sword, ActionKind::Shield),
            // Half the reach and a third of the mass, twice the cadence. The
            // Rogue's old hilt-heavy shortblade retired into `Knife`; what it
            // keeps is the body that swings one fastest -- and, because it both
            // thinks and draws quicker than anything else, the only body for
            // which reaching for a guard mid-exchange is reliably a good bet.
            // Giving it a fist instead would be handing the quick body the one
            // trick it is best at and then taking it away.
            Body::Rogue => Loadout::pair(ActionKind::Shortsword, ActionKind::Shield),
            // Long, slow, and with nothing to hide behind. A Brute that wants a
            // guard has to be given one.
            Body::Brute => Loadout::pair(ActionKind::Club, ActionKind::Punch),
            Body::Skitterer => Loadout::pair(ActionKind::Knife, ActionKind::Punch),
        }
    }

    /// The action this body walks in holding.
    #[inline]
    pub const fn default_action(self) -> ActionKind {
        self.default_loadout().primary
    }

    /// **Scaffolding. Deleted when the world grows a loadout column.**
    ///
    /// The retired `UnitKind::weapon()` table, verbatim, returned as an
    /// [`ActionSpec`] so the rest of the sim can be ported to the new type
    /// before it is ported to the new *model*. It exists for exactly one step,
    /// and its whole job is to keep every recorded hash in the repository
    /// bit-identical across the rename -- which is what makes a hash that moves
    /// later a fact about the model rather than about a find-and-replace.
    ///
    /// Do not read this for anything real. Two things here are wrong on purpose
    /// and are what the next step fixes: the Rogue's hilt-heavy shortblade has
    /// no row in [`crate::ACTIONS`] because it retires into
    /// [`ActionKind::Knife`], and the `arc` column is a *shield* arc sitting on
    /// a *weapon*, which is the misfiling this whole change exists to undo.
    pub const fn legacy_weapon(self) -> ActionSpec {
        let (length, mass, balance, arc, windup, recovery) = match self {
            Body::Brute => (145, 223, 61, 4_096, 26, 34),
            Body::Fighter => (95, 124, 55, 11_264, 14, 16),
            Body::Rogue => (55, 86, 50, 8_192, 8, 9),
            Body::Skitterer => (40, 125, 75, 3_072, 7, 8),
        };
        ActionSpec {
            role: Role::Strike,
            length: Fx::from_ratio(length, 100),
            mass: Fx::from_ratio(mass, 100),
            balance: Fx::from_ratio(balance, 100),
            arc,
            windup,
            recovery,
            ready: 0,
            move_bonus: Fx::ONE,
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Body::Fighter => "fighter",
            Body::Rogue => "rogue",
            Body::Brute => "brute",
            Body::Skitterer => "skitterer",
        }
    }

    pub(crate) fn hash_into(self, h: &mut fx::Hash64) {
        h.write_u8(match self {
            Body::Fighter => 0,
            Body::Rogue => 1,
            Body::Brute => 2,
            Body::Skitterer => 3,
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
        let smallest = Body::ALL
            .iter()
            .map(|k| k.radius())
            .fold(Fx::MAX, Fx::min);
        let budget = smallest * Fx::TWO;

        let mut worst = Fx::ZERO;
        for kind in Body::ALL {
            let weapon = kind.legacy_weapon();
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
        assert_eq!(Body::Fighter.mass(), Fx::ONE);

        // Doubling the radius quadruples the mass at equal density, which is
        // the whole claim the derivation makes.
        let rogue = Body::Rogue.mass();
        let expected = Fx::from_ratio(35 * 35, 45 * 45);
        assert!((rogue - expected).abs() < Fx::from_ratio(1, 1000), "{rogue}");

        // The spread the physics is built on, in order and with room between.
        let mut ordered = Body::ALL;
        ordered.sort_by_key(|k| k.mass());
        assert_eq!(
            ordered,
            [
                Body::Skitterer,
                Body::Rogue,
                Body::Fighter,
                Body::Brute
            ]
        );
        let ratio = Body::Brute.mass() / Body::Skitterer.mass();
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
        for kind in Body::ALL {
            assert!(kind.mass().is_positive(), "{} weighs nothing", kind.name());
            assert!(kind.density().is_positive(), "{}", kind.name());
        }
    }

    #[test]
    fn every_archetype_reaches_further_than_it_is_wide() {
        // A weapon shorter than its wielder's body could never be brought to
        // bear on anything, because bodies separate before blades meet.
        for kind in Body::ALL {
            assert!(
                kind.legacy_weapon().length > kind.radius() * Fx::HALF,
                "{} cannot reach past its own shoulders",
                kind.name()
            );
        }
    }
}
