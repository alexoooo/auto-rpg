use crate::dungeon::Dungeon;
use crate::entity::{Body, Faction};
use crate::loadout::Loadout;
use crate::rules::Stats;
use fx::{Fx, Hash64, Rng, Vec2};

/// One unit's starting condition. Spawn positions are explicit, never rolled
/// at world-construction time: a [`Scenario`] is a complete, inspectable
/// description of a starting state, so [`World::new`] is a pure function of it.
///
/// [`World::new`]: crate::World::new
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UnitSpec {
    pub kind: Body,
    pub faction: Faction,
    pub stats: Stats,
    /// What this unit brings to the fight, and which of it starts in hand
    /// (always the primary). A body no longer implies a weapon, so this is the
    /// other half of what used to be a single `kind`.
    pub loadout: Loadout,
    pub spawn: Vec2,
}

impl UnitSpec {
    /// Swaps in a different body, taking its stat sheet and its default loadout
    /// with it.
    ///
    /// Exists because `spec.kind = other` is a **half-change** now, and a quiet
    /// one. A body carries no weapon any more, so a bare assignment leaves the
    /// new body holding whatever the old one brought -- which is a legal thing
    /// to want and a terrible thing to get by accident. The first test that
    /// tried it put a Fighter's sword in a Skitterer's hand and then asserted
    /// things about "a Skitterer's knife".
    ///
    /// Override `stats` or `loadout` afterwards when that is the point.
    pub fn set_body(&mut self, body: Body) {
        self.kind = body;
        self.stats = body.base_stats();
        self.loadout = body.default_loadout();
    }
}

/// A generated level, in tiles and therefore in world units.
///
/// Four times the area of the 24x16 sandbox room, which at eleven world units
/// of camera height is about three screens across and two down -- big enough
/// that the far side is somewhere you go rather than somewhere you can see, and
/// small enough that crossing it is not the game.
pub const DUNGEON_COLS: u16 = 48;
pub const DUNGEON_ROWS: u16 = 32;

/// How much opposition a level carries: this many, plus one per floor, up to a
/// cap.
const MONSTERS_BASE: usize = 3;
const MONSTERS_PER_DEPTH_CAP: usize = 5;

/// RNG domain tag for who stands in the level, kept apart from the tag the
/// floor plan uses so that tuning one cannot move the other.
const ROSTER_STREAM: u64 = 1 << 61;

/// A fully specified match setup.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Scenario {
    pub name: String,
    /// Which ground exists. The playable area is `(0,0)..dungeon.extent()`, and
    /// on a [`Dungeon::open`] floor plan that is the whole rectangle -- which is
    /// what every scenario here but a generated one uses.
    pub dungeon: Dungeon,
    pub units: Vec<UnitSpec>,
    /// Where the way out stands, if this scenario has one.
    ///
    /// Carried but never acted on: the sim has no concept of a level, a depth
    /// or a run, and giving it one would put progression inside the fight
    /// simulator the lab drives headlessly. The generator is the only thing
    /// that knows which room is furthest from the start, so this is where that
    /// knowledge is written down; deciding what walking into it *means* belongs
    /// to whoever is driving. It reaches [`Scenario::fingerprint`] and
    /// deliberately never reaches `World::state_hash`.
    pub portal: Option<Vec2>,
    /// Runs longer than this are declared a draw. Part of the scenario rather
    /// than the runner so a replay reproduces the same cutoff.
    pub max_ticks: u32,
}

impl Scenario {
    /// The playable extent.
    ///
    /// A method and not a field, because a field beside `dungeon` is exactly the
    /// half-change [`UnitSpec::set_body`] exists to warn about: two places that
    /// can disagree about how big the room is, and nothing that notices when
    /// they do.
    pub fn arena(&self) -> Vec2 {
        self.dungeon.extent()
    }

    /// A fixed, hand-placed one-on-one. No randomness at all -- this is the
    /// scenario tests use when they need to reason about exact positions.
    pub fn duel() -> Scenario {
        Scenario {
            name: "duel".to_string(),
            dungeon: Dungeon::open(24, 16),
            portal: None,
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Heroes,
                    stats: Body::Fighter.base_stats(),
                    loadout: Body::Fighter.default_loadout(),
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: Body::Brute,
                    faction: Faction::Monsters,
                    stats: Body::Brute.base_stats(),
                    loadout: Body::Brute.default_loadout(),
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
    pub fn duel_of(hero: Body, villain: Body, seed: u64) -> Scenario {
        let dungeon = Dungeon::open(24, 16);
        let centre = dungeon.extent() * Fx::HALF;
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
            dungeon,
            portal: None,
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
                    loadout: hero.default_loadout(),
                    spawn: centre - apart,
                },
                UnitSpec {
                    kind: villain,
                    faction: Faction::Monsters,
                    stats: villain.base_stats(),
                    loadout: villain.default_loadout(),
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
            dungeon: Dungeon::open(24, 16),
            portal: None,
            max_ticks: u32::MAX,
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Body::Fighter.default_loadout(),
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
        let dungeon = Dungeon::open(40, 28);
        let arena = dungeon.extent();
        let mut rng = Rng::new(seed);
        let mut units = Vec::with_capacity((heroes + monsters) as usize);

        for _ in 0..heroes {
            let kind = if rng.chance(1, 3) {
                Body::Rogue
            } else {
                Body::Fighter
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Heroes,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                spawn: Vec2::new(
                    rng.range(Fx::from_int(3), Fx::from_int(12)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        for _ in 0..monsters {
            let kind = if rng.chance(1, 4) {
                Body::Brute
            } else {
                Body::Skitterer
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Monsters,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                spawn: Vec2::new(
                    rng.range(arena.x - Fx::from_int(12), arena.x - Fx::from_int(3)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        Scenario {
            name: format!("skirmish-{heroes}v{monsters}"),
            dungeon,
            portal: None,
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

    /// A generated dungeon, one level deep.
    ///
    /// Four times the area of [`Scenario::room`] and carved into rooms and
    /// corridors, with the opposition already standing in it and a way out at
    /// the far end. `depth` is the level number: it seeds the layout alongside
    /// `seed`, so descending is a new floor plan rather than the same one
    /// again, and it is what the difficulty below reads.
    ///
    /// `hero` arrives whole -- body, stats and loadout -- because the point of
    /// a descent is that the character persists across it. Only its faction and
    /// its spawn are overwritten.
    ///
    /// `max_ticks` is unbounded for the reason [`Scenario::room`] gives: this
    /// is somewhere a player stands around in, not a fight on a clock. Nothing
    /// the lab iterates should be pointed at it.
    pub fn dungeon(seed: u64, depth: u32, hero: UnitSpec) -> Scenario {
        let count = MONSTERS_BASE + (depth as usize).min(MONSTERS_PER_DEPTH_CAP);
        let level = Dungeon::generate(
            DUNGEON_COLS,
            DUNGEON_ROWS,
            seed,
            depth,
            count,
            // The widest body in the roster, whatever is actually placed: the
            // guarantee worth having is "anything can stand here".
            Body::Brute.radius(),
        );

        // A stream of its own, so tuning the roster cannot move the floor plan
        // and re-carving the floor plan cannot move the roster.
        let mut rng = Rng::from_stream(seed, depth as u64, ROSTER_STREAM);
        let mut units = Vec::with_capacity(1 + level.monsters.len());
        let mut hero = hero;
        hero.faction = Faction::Heroes;
        hero.spawn = level.hero;
        units.push(hero);

        for at in &level.monsters {
            // Sixths rather than a branch on depth, so the draw happens either
            // way and the stream position does not depend on how deep you are.
            // The first floor is all Skitterers -- fast, fragile, and the right
            // thing to learn the controls against.
            let brutes = match depth {
                0 => 0,
                1 | 2 => 1,
                _ => 2,
            };
            let kind = if rng.chance(brutes, 6) {
                Body::Brute
            } else {
                Body::Skitterer
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Monsters,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                spawn: *at,
            });
        }

        Scenario {
            name: format!("dungeon-{depth}"),
            dungeon: level.dungeon,
            portal: Some(level.portal),
            units,
            max_ticks: u32::MAX,
        }
    }

    /// Fingerprint, so a replay can refuse to play against a scenario that has
    /// been edited underneath it.
    pub fn fingerprint(&self) -> u64 {
        let mut h = Hash64::new();
        h.write_bytes(self.name.as_bytes());
        h.write_u16(self.dungeon.cols());
        h.write_u16(self.dungeon.rows());
        h.write_u64(self.dungeon.fingerprint());
        h.write_u32(self.max_ticks);
        // A scenario whose way out has moved is a different scenario, and a
        // replay played against it would be walking somewhere else.
        match self.portal {
            None => h.write_u8(0),
            Some(at) => {
                h.write_u8(1);
                h.write_i32(at.x.raw());
                h.write_i32(at.y.raw());
            }
        }
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
        let a = Scenario::duel_of(Body::Rogue, Body::Brute, 1);
        let b = Scenario::duel_of(Body::Rogue, Body::Brute, 2);
        assert_ne!(
            a.units[0].spawn, b.units[0].spawn,
            "the seed must change the geometry, not only the noise"
        );
        assert_eq!(a, Scenario::duel_of(Body::Rogue, Body::Brute, 1));

        for s in [&a, &b] {
            assert_eq!(s.count(Faction::Heroes), 1);
            assert_eq!(s.count(Faction::Monsters), 1);
            for u in &s.units {
                assert!(u.spawn.x > Fx::ONE && u.spawn.x < s.arena().x - Fx::ONE);
                assert!(u.spawn.y > Fx::ONE && u.spawn.y < s.arena().y - Fx::ONE);
            }
            // Opposite each other, and inside the shortest sight range in the
            // game, so a duel starts as a duel rather than as a search.
            let gap = (s.units[0].spawn - s.units[1].spawn).length();
            assert!((gap - Fx::from_int(6)).abs() < Fx::ONE, "gap {gap}");
            let shortest = Body::ALL
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
        assert!(hero.spawn.x > Fx::ZERO && hero.spawn.x < s.arena().x);
        assert!(hero.spawn.y > Fx::ZERO && hero.spawn.y < s.arena().y);
    }

    fn descending_hero() -> UnitSpec {
        UnitSpec {
            kind: Body::Rogue,
            faction: Faction::Heroes,
            stats: Body::Rogue.base_stats(),
            loadout: Body::Rogue.default_loadout(),
            spawn: Vec2::ZERO,
        }
    }

    #[test]
    fn a_dungeon_is_a_pure_function_of_its_seed_and_its_depth() {
        let h = descending_hero();
        assert_eq!(Scenario::dungeon(9, 2, h), Scenario::dungeon(9, 2, h));
        assert_ne!(Scenario::dungeon(9, 2, h), Scenario::dungeon(10, 2, h));
        assert_ne!(Scenario::dungeon(9, 2, h), Scenario::dungeon(9, 3, h));
        assert_eq!(
            Scenario::dungeon(9, 2, h).fingerprint(),
            Scenario::dungeon(9, 2, h).fingerprint()
        );
    }

    #[test]
    fn a_dungeon_carries_the_hero_it_was_handed() {
        // The whole point of a descent: the character persists, and only where
        // it stands is decided by the level.
        let mut hero = descending_hero();
        hero.stats.vitality = 7;
        let s = Scenario::dungeon(4, 1, hero);
        assert_eq!(s.count(Faction::Heroes), 1);
        let arrived = s.units[0];
        assert_eq!(arrived.kind, Body::Rogue);
        assert_eq!(arrived.stats, hero.stats);
        assert_eq!(arrived.loadout, hero.loadout);
        assert_ne!(arrived.spawn, Vec2::ZERO, "left standing at the origin");
    }

    #[test]
    fn a_dungeon_stands_everybody_on_ground_they_fit_on() {
        for depth in 0..4 {
            let s = Scenario::dungeon(11, depth, descending_hero());
            assert_eq!(s.arena(), Vec2::from_ints(48, 32));
            assert!(s.count(Faction::Monsters) >= 3);
            for u in &s.units {
                assert!(
                    s.dungeon.is_clear(u.spawn, Body::Brute.radius()),
                    "depth {depth}: {:?} at {:?} is in the wall",
                    u.kind,
                    u.spawn
                );
            }
            let portal = s.portal.expect("a dungeon has a way out");
            assert!(s.dungeon.is_clear(portal, Body::Brute.radius()));
        }
    }

    #[test]
    fn the_first_floor_is_all_skitterers_and_later_ones_are_not() {
        assert!(Scenario::dungeon(3, 0, descending_hero())
            .units
            .iter()
            .filter(|u| u.faction == Faction::Monsters)
            .all(|u| u.kind == Body::Skitterer));
        // Deeper down a Brute turns up eventually. Asked across seeds rather
        // than pinned to one, because which seed rolls the first Brute is not a
        // fact worth freezing.
        assert!((0..40u64).any(|seed| Scenario::dungeon(seed, 6, descending_hero())
            .units
            .iter()
            .any(|u| u.kind == Body::Brute)));
    }

    #[test]
    fn skirmish_spawns_the_requested_units_inside_the_arena() {
        let s = Scenario::skirmish(7, 4, 9);
        assert_eq!(s.count(Faction::Heroes), 4);
        assert_eq!(s.count(Faction::Monsters), 9);
        for u in &s.units {
            assert!(
                u.spawn.x > Fx::ZERO && u.spawn.x < s.arena().x,
                "{:?}",
                u.spawn
            );
            assert!(
                u.spawn.y > Fx::ZERO && u.spawn.y < s.arena().y,
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
