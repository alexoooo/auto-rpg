use crate::entity::{Faction, UnitKind};
use crate::rules::Stats;
use fx::{Fx, Hash64, Rng, Vec2};

/// One unit's starting condition. Spawn positions are explicit, never rolled
/// at world-construction time: a [`Scenario`] is a complete, inspectable
/// description of a starting state, so [`World::new`] is a pure function of it.
///
/// [`World::new`]: crate::World::new
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UnitSpec {
    pub kind: UnitKind,
    pub faction: Faction,
    pub stats: Stats,
    pub spawn: Vec2,
}

/// A fully specified match setup.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Scenario {
    pub name: String,
    /// Arena extent; the playable area is `(0,0)..arena`.
    pub arena: Vec2,
    pub units: Vec<UnitSpec>,
    /// Runs longer than this are declared a draw. Part of the scenario rather
    /// than the runner so a replay reproduces the same cutoff.
    pub max_ticks: u32,
}

impl Scenario {
    /// A fixed, hand-placed one-on-one. No randomness at all -- this is the
    /// scenario tests use when they need to reason about exact positions.
    pub fn duel() -> Scenario {
        Scenario {
            name: "duel".to_string(),
            arena: Vec2::from_ints(24, 16),
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: UnitKind::Warrior,
                    faction: Faction::Heroes,
                    stats: UnitKind::Warrior.base_stats(),
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: UnitKind::Brute,
                    faction: Faction::Monsters,
                    stats: UnitKind::Brute.base_stats(),
                    spawn: Vec2::from_ints(18, 8),
                },
            ],
        }
    }

    /// A seeded one-on-one between two chosen archetypes.
    ///
    /// The pair is placed on a ring about the arena centre at a rolled bearing,
    /// diametrically opposite each other. That the *bearing* is what the seed
    /// changes is the whole point: with a fixed east-west placement every duel
    /// of the same matchup is the same fight, differing only in perception
    /// noise, so a win rate measured over a thousand seeds is really one sample
    /// repeated a thousand times. Rotating the engagement gives the approach,
    /// the walls and the swing geometry something to vary.
    ///
    /// [`Scenario::duel`] stays as it is -- fixed and hand-placed -- because
    /// tests that reason about exact positions need it to be.
    pub fn duel_of(hero: UnitKind, villain: UnitKind, seed: u64) -> Scenario {
        let arena = Vec2::from_ints(24, 16);
        let centre = arena * Fx::HALF;
        let mut rng = Rng::new(seed);
        let bearing = rng.angle();
        // Six units apart, which is inside the *shortest* sight range in the
        // game (a Brute's 7.8), so both fighters see each other on the first
        // tick. That is deliberate and it is what makes this a duel harness:
        // spawn them further apart and the pair spends the run failing to find
        // each other, because the standing order that would bring them together
        // points along a fixed axis while this placement is rotated. Search is
        // a real and unsolved problem, and measuring it by accident inside a
        // swordsmanship measurement is how you end up tuning combat to fix
        // navigation.
        let apart = Vec2::from_angle(bearing) * Fx::from_int(3);

        Scenario {
            name: format!("duel-{}-vs-{}", hero.name(), villain.name()),
            arena,
            // Two and a half minutes, up from ninety seconds, for the same
            // reason `skirmish` needed it: a duel is roughly a dozen landed
            // blows a side now rather than three or four, so it takes about
            // twice as long. At the old limit the tail of slow fights was being
            // cut off mid-exchange, and because a disengaged fighter heals back
            // to full, those came back as *ties* -- 20% of the dim end of the
            // skill range was two fully-healed characters standing in opposite
            // corners with the clock stopped.
            max_ticks: 150 * 60,
            units: vec![
                UnitSpec {
                    kind: hero,
                    faction: Faction::Heroes,
                    stats: hero.base_stats(),
                    spawn: centre - apart,
                },
                UnitSpec {
                    kind: villain,
                    faction: Faction::Monsters,
                    stats: villain.base_stats(),
                    spawn: centre + apart,
                },
            ],
        }
    }

    /// An empty room with a single hero. No opposition, no time limit: the
    /// sandbox the browser build opens with, and the scenario the navigation
    /// tests use.
    ///
    /// `max_ticks` is effectively unbounded because there is no fight here to
    /// time out -- nothing multiplies it, and [`Scenario::fingerprint`] only
    /// hashes it. Nothing the lab iterates should be pointed at this: the
    /// fitness function and the runner both assume two populated sides.
    pub fn room() -> Scenario {
        Scenario {
            name: "room".to_string(),
            arena: Vec2::from_ints(24, 16),
            max_ticks: u32::MAX,
            units: vec![UnitSpec {
                kind: UnitKind::Warrior,
                faction: Faction::Heroes,
                stats: UnitKind::Warrior.base_stats(),
                spawn: Vec2::from_ints(12, 8),
            }],
        }
    }

    /// A seeded skirmish: heroes spawn in the left third, monsters in the
    /// right third, both jittered.
    ///
    /// The vertical band is deliberately narrower than the arena. Sight range
    /// is around 10 units and the arena is 28 tall, so spawning across the full
    /// height produces fights where the two sides walk straight past each other
    /// and time out. Search behaviour is a real design problem, but it is not
    /// this milestone's, and an experiment harness whose runs mostly end in
    /// "nobody found anybody" measures nothing.
    ///
    /// The RNG is consumed here and then discarded -- the scenario it produces
    /// is a plain value. Two runs of the same seed are identical because the
    /// *setup* is identical, not because the world re-rolls the same numbers.
    pub fn skirmish(seed: u64, heroes: u32, monsters: u32) -> Scenario {
        let arena = Vec2::from_ints(40, 28);
        let mut rng = Rng::new(seed);
        let mut units = Vec::with_capacity((heroes + monsters) as usize);

        for _ in 0..heroes {
            let kind = if rng.chance(1, 3) {
                UnitKind::Scout
            } else {
                UnitKind::Warrior
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Heroes,
                stats: kind.base_stats(),
                spawn: Vec2::new(
                    rng.range(Fx::from_int(3), Fx::from_int(12)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        for _ in 0..monsters {
            let kind = if rng.chance(1, 4) {
                UnitKind::Brute
            } else {
                UnitKind::Skitterer
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Monsters,
                stats: kind.base_stats(),
                spawn: Vec2::new(
                    rng.range(arena.x - Fx::from_int(12), arena.x - Fx::from_int(3)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        Scenario {
            name: format!("skirmish-{heroes}v{monsters}"),
            arena,
            units,
            // Two and a half minutes, up from ninety seconds. A phased attack is
            // a windup, a cut and a recovery where a windmill was a blow every
            // nine ticks, so a fight of this size takes about twice as long as
            // it used to and a fifth of them were timing out with both sides
            // still standing. A draw scores zero, teaches evolution nothing and
            // costs a full limit of compute -- it is the most expensive possible
            // way to learn nothing, and buying the extra time back is cheap.
            max_ticks: 150 * 60,
        }
    }

    /// Fingerprint, so a replay can refuse to play against a scenario that has
    /// been edited underneath it.
    pub fn fingerprint(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_bytes(self.name.as_bytes());
        h.write_i32(self.arena.x.raw());
        h.write_i32(self.arena.y.raw());
        h.write_u32(self.max_ticks);
        h.write_u32(self.units.len() as u32);
        for u in &self.units {
            u.kind.hash_into(&mut h);
            h.write_u8(u.faction.index() as u8);
            u.stats.hash_into(&mut h);
            h.write_i32(u.spawn.x.raw());
            h.write_i32(u.spawn.y.raw());
        }
        h.finish()
    }

    pub fn count(&self, faction: Faction) -> usize {
        self.units.iter().filter(|u| u.faction == faction).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skirmish_is_a_pure_function_of_its_seed() {
        assert_eq!(Scenario::skirmish(42, 3, 5), Scenario::skirmish(42, 3, 5));
        assert_ne!(Scenario::skirmish(42, 3, 5), Scenario::skirmish(43, 3, 5));
        assert_eq!(
            Scenario::skirmish(42, 3, 5).fingerprint(),
            Scenario::skirmish(42, 3, 5).fingerprint()
        );
    }

    #[test]
    fn a_seeded_duel_rotates_the_engagement() {
        let a = Scenario::duel_of(UnitKind::Scout, UnitKind::Brute, 1);
        let b = Scenario::duel_of(UnitKind::Scout, UnitKind::Brute, 2);
        assert_ne!(
            a.units[0].spawn, b.units[0].spawn,
            "the seed must change the geometry, not only the noise"
        );
        assert_eq!(a, Scenario::duel_of(UnitKind::Scout, UnitKind::Brute, 1));

        for s in [&a, &b] {
            assert_eq!(s.count(Faction::Heroes), 1);
            assert_eq!(s.count(Faction::Monsters), 1);
            for u in &s.units {
                assert!(u.spawn.x > Fx::ONE && u.spawn.x < s.arena.x - Fx::ONE);
                assert!(u.spawn.y > Fx::ONE && u.spawn.y < s.arena.y - Fx::ONE);
            }
            // Opposite each other, and inside the shortest sight range in the
            // game, so a duel starts as a duel rather than as a search.
            let gap = (s.units[0].spawn - s.units[1].spawn).length();
            assert!((gap - Fx::from_int(6)).abs() < Fx::ONE, "gap {gap}");
            let shortest = UnitKind::ALL
                .iter()
                .map(|k| k.base_stats().sight_range())
                .fold(Fx::MAX, Fx::min);
            assert!(gap < shortest, "gap {gap} exceeds the shortest sight {shortest}");
        }
    }

    #[test]
    fn the_room_is_one_hero_alone_inside_the_arena() {
        let s = Scenario::room();
        assert_eq!(s.count(Faction::Heroes), 1);
        assert_eq!(s.count(Faction::Monsters), 0);
        let hero = s.units[0];
        assert!(hero.spawn.x > Fx::ZERO && hero.spawn.x < s.arena.x);
        assert!(hero.spawn.y > Fx::ZERO && hero.spawn.y < s.arena.y);
    }

    #[test]
    fn skirmish_spawns_the_requested_units_inside_the_arena() {
        let s = Scenario::skirmish(7, 4, 9);
        assert_eq!(s.count(Faction::Heroes), 4);
        assert_eq!(s.count(Faction::Monsters), 9);
        for u in &s.units {
            assert!(
                u.spawn.x > Fx::ZERO && u.spawn.x < s.arena.x,
                "{:?}",
                u.spawn
            );
            assert!(
                u.spawn.y > Fx::ZERO && u.spawn.y < s.arena.y,
                "{:?}",
                u.spawn
            );
        }
        // Factions start apart, so a run begins with an approach phase.
        let hero_max_x = s
            .units
            .iter()
            .filter(|u| u.faction == Faction::Heroes)
            .map(|u| u.spawn.x)
            .max()
            .unwrap();
        let monster_min_x = s
            .units
            .iter()
            .filter(|u| u.faction == Faction::Monsters)
            .map(|u| u.spawn.x)
            .min()
            .unwrap();
        assert!(hero_max_x < monster_min_x);
    }
}
