//! Fighting the one you were told to, driven through a real `World`.
//!
//! `goto.rs` is the same idea about a place; this is the same idea about a
//! body, and the interesting half is what happens on arrival. A `Goto` anchors
//! on the click and the only question is whether the character gets there. A
//! `Focus` anchors on a *ring* around the quarry, sized by the weapon actually in
//! hand, so the question is where it stops -- and the answer has to be different
//! for a swordsman and for an archer while the order, the leash and the route are
//! all the same code.
//!
//! The unit tests beside `minds.rs` pin that arithmetic one decision at a time.
//! This is the half that catches a ring that is right for a decision and wrong
//! for a fight: hundreds of ticks with a quarry that moves, a body shove that
//! pushes back, and a draw that plants the feet.

use fx::{Fx, Vec2};
use policy::{DuelistPolicy, IdlePolicy, Policy, TeamPolicy};
use sim::{
    ActionKind, Body, Command, Dungeon, EntityId, Faction, Loadout, Objective, Observation, Order,
    Scenario, UnitSpec, World, OPEN, WALL,
};

/// The hover ring: how far from an anchor an ordered character is free to move.
///
/// Restated rather than imported, exactly as `goto.rs` restates it and for the
/// same reason -- `policy` keeps `LEASH_ROAM` to itself and an integration test
/// lives outside the crate, so widening a constant's visibility to satisfy one
/// assertion would be the tail wagging the dog. If it moves, this moves with it.
const RING: Fx = Fx::from_ratio(3, 2);

/// How much wider than its own preferred range a focused fighter's ring is drawn.
/// `policy`'s `FOCUS_SLACK`, restated for the reason above.
const SLACK: Fx = Fx::from_ratio(3, 2);

/// A monster whose entire plan is to leave.
///
/// Written here rather than borrowed from the roster because every policy in the
/// crate flees only on a condition -- `caution` is counted in blows and tops out
/// at 0.6 of a health bar -- and a test about *pursuit* wants a quarry that runs
/// unconditionally and from tick zero. What is being measured is the hero.
struct Fleeing;

impl Policy for Fleeing {
    fn decide(&mut self, obs: &Observation) -> Command {
        match obs.nearest_enemy() {
            Some(threat) => Command::moving(-threat.offset.normalize()),
            None => Command::HOLD,
        }
    }
}

/// One hero and one quarry, driven the way a client drives them.
///
/// Deliberately not `policy::run`, for the reason `goto.rs` gives: that loop
/// gates on `World::outcome()`, and every tick has to answer whoever is due to
/// think before it steps, because an unanswered decision still advances its
/// clock.
struct Hunt {
    world: World,
    /// Kept beside the world so a test can ask whether a body is standing
    /// somewhere a body can stand. `World` owns its own copy and does not lend it
    /// out, and rebuilding the floor plan from `wall_clearance` is the mistake
    /// `UtilityPolicy::ordered_feet` has a paragraph about.
    floor: Dungeon,
    policy: TeamPolicy<Box<dyn Policy>, Box<dyn Policy>>,
    hero: EntityId,
    quarry: EntityId,
}

impl Hunt {
    fn new(
        floor: Dungeon,
        hero: UnitSpec,
        quarry: UnitSpec,
        heroes: Box<dyn Policy>,
        monsters: Box<dyn Policy>,
    ) -> Hunt {
        let scenario = Scenario {
            name: "hunt".to_string(),
            combat_model: sim::CombatModel::Legacy,
            combat_specs: None,
            dungeon: floor.clone(),
            portal: None,
            torches: Vec::new(),
            max_ticks: u32::MAX,
            units: vec![hero, quarry],
        };
        let mut world = World::new(&scenario, 1);
        // Routing is opt-in. Without it the sim reports no route and no route is
        // -- correctly -- a stop, so the hero would stand on its spawn for the
        // whole hunt and every claim below would pass for the wrong reason.
        world.set_objective(Faction::Heroes, Objective::Order);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let quarry = world.alive_ids(Faction::Monsters)[0];
        world.set_order(Faction::Heroes, Order::Focus(quarry));
        Hunt {
            world,
            floor,
            policy: TeamPolicy::new(heroes, monsters),
            hero,
            quarry,
        }
    }

    fn tick(&mut self) {
        let due = self.world.pending_decisions().to_vec();
        for id in due {
            let obs = self.world.observe(id);
            let command = self.policy.decide(&obs);
            self.world.submit(id, command);
        }
        self.world.step();
    }

    fn at(&self, id: EntityId) -> Vec2 {
        self.world.view(id).unwrap().position
    }

    /// Centre to centre, which is what every distance in the policy layer is
    /// measured in.
    fn separation(&self) -> Fx {
        self.at(self.hero).distance(self.at(self.quarry))
    }

    /// The two bodies touching. Nothing may ever be closer than this -- the sim
    /// spends `World::separate` undoing it -- so it is the floor every claim
    /// below sits on rather than a bound worth tuning.
    fn touching(&self) -> Fx {
        self.world.view(self.hero).unwrap().radius + self.world.view(self.quarry).unwrap().radius
    }

    /// **Where the quarry's own weapon stops**: both bodies plus its reach.
    ///
    /// Read out of the hero's observation rather than off the stat sheet, because
    /// this is the expression `BowMind` stands off and the point is to measure
    /// against the same one. `radius` and `action_length` arrive unblurred by
    /// perception -- facts about an object rather than about its state -- so this
    /// is exact and not a sample.
    fn quarry_reach(&self) -> Fx {
        let obs = self.world.observe(self.hero);
        let foe = obs
            .enemies()
            .iter()
            .find(|c| c.id == self.quarry)
            .copied()
            .expect("the quarry has to be in sight to measure its reach");
        obs.radius + foe.radius + foe.action_length
    }

    /// Runs `limit` ticks, watching the gap on every one of them.
    ///
    /// The minimum is the measurement this file exists for, and it has to be a
    /// minimum over the whole run rather than a final position: walking in and
    /// backing out again is exactly the failure being caught, and it is invisible
    /// at the end. Stops early when the quarry dies, because a distance to a
    /// corpse is not a spacing decision.
    fn watch(&mut self, limit: u32) -> Track {
        let mut track = Track {
            nearest: self.separation(),
            furthest: self.separation(),
            ended: self.separation(),
            ticks: 0,
            killed: false,
        };
        for _ in 0..limit {
            if !self.world.is_alive(self.quarry) {
                track.killed = true;
                break;
            }
            self.tick();
            let gap = self.separation();
            track.nearest = track.nearest.min(gap);
            track.furthest = track.furthest.max(gap);
            track.ended = gap;
            track.ticks += 1;
            assert!(
                self.floor.is_clear(self.at(self.hero), self.world.view(self.hero).unwrap().radius),
                "the hero pressed into masonry at {:?} on tick {}",
                self.at(self.hero),
                self.world.tick()
            );
        }
        track
    }
}

/// What one hunt produced.
#[derive(Clone, Copy, Debug)]
struct Track {
    /// The closest the two ever came, over every tick of the run.
    nearest: Fx,
    /// And the furthest, which is what says a pursuit did not lose its quarry.
    furthest: Fx,
    ended: Fx,
    ticks: u32,
    killed: bool,
}

/// A body, its kit and where it starts.
fn unit(kind: Body, faction: Faction, loadout: Loadout, spawn: Vec2) -> UnitSpec {
    UnitSpec {
        kind,
        faction,
        stats: kind.base_stats(),
        loadout,
        articulated: None,
        spawn,
    }
}

/// A room big enough that the two start out of sight of one another.
///
/// That is load-bearing rather than scene-setting. A hunt that begins with the
/// quarry already visible never exercises the pursuit at all -- `march` is the
/// arm where a `Focus` used to fall through to the patrol sweep, and it is only
/// reached with nothing in view. Thirty units apart against a Rogue's 12.6 of
/// sight means the hero has to walk two thirds of the way on the route alone.
fn field() -> Dungeon {
    Dungeon::open(40, 28)
}

fn hero_at() -> Vec2 {
    Vec2::from_ints(5, 14)
}

fn quarry_at() -> Vec2 {
    Vec2::from_ints(35, 14)
}

/// A duellist hero with `kit` in hand and a Brute standing still to be hunted.
///
/// The quarry is idle on purpose. A charging opponent would close the gap itself
/// and a claim about where the *hero* chose to stop would be a claim about
/// whoever moved last; a standing one makes every unit of the separation the
/// hero's decision. `a_quarry_that_runs_is_followed` is where a moving one earns
/// its keep.
fn hunt_with(kit: Loadout) -> Hunt {
    Hunt::new(
        field(),
        unit(Body::Rogue, Faction::Heroes, kit, hero_at()),
        unit(
            Body::Brute,
            Faction::Monsters,
            Body::Brute.default_loadout(),
            quarry_at(),
        ),
        Box::new(DuelistPolicy::baseline()),
        Box::new(IdlePolicy),
    )
}

/// **The test this session is for.**
///
/// A bow in hand and a Brute named. The archer has to cross thirty units to get
/// there -- so the order is doing real work, and a ring anchored on the body
/// instead of around it would walk it straight onto the club -- and then it has
/// to *stop*, outside the reach of the thing it was sent at.
///
/// The claim is on the **minimum separation over the whole run**, not on where it
/// ended up. Walking in and backing out again is the failure being caught, and by
/// the last tick there is nothing left to see: the archer would be standing at
/// bow range either way, having taken a club to the head on the way through. A
/// final-position assertion would have passed the whole time.
///
/// What makes this fail rather than pass vacuously is the approach. Without the
/// ring the pull does not relax until the hero is standing on the quarry's own
/// tile, and `BowMind`'s station -- which pushes back out at `LEASH_LANE` against
/// a full-strength order -- loses that argument three to one.
#[test]
fn an_archer_stops_at_bow_range_and_never_closes() {
    let mut hunt = hunt_with(Loadout::pair(ActionKind::Bow, ActionKind::Sword));
    let track = hunt.watch(900);
    let club = hunt.quarry_reach();
    println!(
        "archer: nearest {}, ended {}, {} ticks, club reaches {club}, killed {}",
        track.nearest, track.ended, track.ticks, track.killed
    );

    assert!(
        track.nearest > club,
        "the archer came within {} of a Brute whose club reaches {club}",
        track.nearest
    );
    // ...and it did come. An archer that never left its spawn would satisfy the
    // line above trivially, so this is the half that makes it a test of the ring
    // rather than of a hero standing still: thirty units out at the start, and
    // inside its own ring plus the hover at the end.
    assert!(
        track.ended < club * SLACK + RING,
        "never closed on the quarry at all; ended {} away",
        track.ended
    );
}

/// The other side of the same mechanism, and the contrast that gives the test
/// above its meaning.
///
/// The same hero, the same quarry, the same order -- a sword instead of a bow.
/// `BladeMind`'s standoff is inside the Brute's own reach, because a swordsman
/// that will not come inside a club cannot fight with a sword, so this one closes
/// where the archer stopped. Neither mind knows anything about orders; the ring
/// is whatever the thing in hand says it is.
///
/// And it stops at a body rather than in one. Two bodies cannot occupy the same
/// ground -- `World::separate` spends every tick undoing it -- so a fighter that
/// drives at the centre grinds along that impulse for the whole fight, which is
/// what a ring of zero looks like from the outside.
#[test]
fn a_blade_closes_to_its_preferred_range_and_holds() {
    let mut hunt = hunt_with(Loadout::pair(ActionKind::Sword, ActionKind::Shield));
    let touching = hunt.touching();
    let track = hunt.watch(900);
    let club = hunt.quarry_reach();
    println!(
        "blade: nearest {}, ended {}, {} ticks, touching at {touching}, club reaches {club}",
        track.nearest, track.ended, track.ticks
    );

    assert!(
        track.nearest < club,
        "a swordsman refused to come inside a club: closest was {}",
        track.nearest
    );
    // **Up to the body and not into it**, which is a claim about the policy and
    // not about `World::separate`. Measured against a ring of zero, the same hero
    // over the same nine hundred ticks sits at exactly `touching` on every one of
    // them, minimum and final alike -- pressed against the Brute and held off it
    // by the collision impulse alone, with its own footwork outvoted three to one
    // the whole time. That is what a fighter standing on its mark looks like, and
    // it is the shape this session exists to stop.
    assert!(
        track.nearest > touching,
        "drove into the body rather than up to it: {} against {touching}",
        track.nearest
    );
    assert!(
        track.ended > touching && track.ended < club,
        "did not settle at a sword fight's distance: ended {}, bodies touch at \
         {touching}, the club reaches {club}",
        track.ended
    );
}

/// A quarry that runs is followed.
///
/// The bound is on the *widest* the gap ever got rather than on where it finished,
/// because a pursuit that loses its quarry and then happens to meet it again at
/// the far wall is not a pursuit. A Brute is the slowest thing on the roster, so a
/// hero that keeps its feet pointed the right way closes on it; one that had gone
/// back to picking its own targets, or that had let the leash relax at the wrong
/// distance, would fall behind and stay behind.
#[test]
fn a_quarry_that_runs_is_followed() {
    let mut hunt = Hunt::new(
        field(),
        unit(
            Body::Rogue,
            Faction::Heroes,
            Loadout::pair(ActionKind::Sword, ActionKind::Shield),
            Vec2::from_ints(6, 14),
        ),
        unit(
            Body::Brute,
            Faction::Monsters,
            Body::Brute.default_loadout(),
            Vec2::from_ints(14, 14),
        ),
        Box::new(DuelistPolicy::baseline()),
        Box::new(Fleeing),
    );
    let start = hunt.separation();
    let track = hunt.watch(900);
    println!(
        "chase: started {start}, furthest {}, ended {}, {} ticks",
        track.furthest, track.ended, track.ticks
    );

    assert!(
        track.furthest <= start + Fx::TWO,
        "lost the quarry: opened up to {} from {start}",
        track.furthest
    );
    assert!(
        track.ended < start,
        "gave up the chase: ended {} away having started {start} away",
        track.ended
    );
}

/// A wall between the two, and a way round it.
///
/// This is session 2's routing seen from the policy side: the hero has no line of
/// sight and no straight line, so everything it has is the flow field the sim
/// seeds from the quarry's tile. `Hunt::watch` asserts on every tick that the
/// hero is standing somewhere a body can stand, so pressing into the masonry
/// fails at the tick it happens rather than at the end.
///
/// The floor is a Y-shaped room: a spur down the middle with open ground below
/// it, so the only route is south and back up.
#[test]
fn a_quarry_behind_a_wall_is_routed_around() {
    let plan = [
        "############",
        "#####..#####",
        "#....##....#",
        "#....##....#",
        "#....##....#",
        "#..........#",
        "#..........#",
        "############",
    ];
    let mut tiles = Vec::with_capacity(plan.len() * plan[0].len());
    for row in plan {
        for cell in row.chars() {
            tiles.push(if cell == '#' { WALL } else { OPEN });
        }
    }
    let floor = Dungeon::from_tiles(plan[0].len() as u16, plan.len() as u16, tiles);

    let mut hunt = Hunt::new(
        floor,
        unit(
            Body::Rogue,
            Faction::Heroes,
            Loadout::pair(ActionKind::Sword, ActionKind::Shield),
            Vec2::new(Fx::from_ratio(25, 10), Fx::from_ratio(35, 10)),
        ),
        unit(
            Body::Skitterer,
            Faction::Monsters,
            Body::Skitterer.default_loadout(),
            Vec2::new(Fx::from_ratio(95, 10), Fx::from_ratio(35, 10)),
        ),
        Box::new(DuelistPolicy::baseline()),
        Box::new(IdlePolicy),
    );
    let start = hunt.separation();
    let track = hunt.watch(600);
    println!(
        "round the wall: started {start}, nearest {}, ended {}, {} ticks, killed {}",
        track.nearest, track.ended, track.ticks, track.killed
    );

    // Reached, which across this floor plan means it went south, along and back
    // up. The straight line is through four tiles of masonry.
    assert!(
        track.nearest <= hunt.touching() + Fx::ONE,
        "never got round the wall; closest approach was {}",
        track.nearest
    );
}

/// **A focus on a corpse steers nothing.**
///
/// The quarry dies and the order stops meaning anything: `refresh_nav` seeds
/// nothing from a handle that does not resolve, `nav_step` reports no route, and
/// no route is a stop. So the hero holds the ground it was standing on -- not
/// free will, and not the next enemy along.
///
/// Asserted to the raw unit, because "stands still" is what `Command::HOLD`
/// produces and anything else is a hero that found something to steer at. Session
/// 4 turns this into an explicit `Goto` at the hero's own feet; until then the
/// silence is doing the same job, and this is the test that says so.
#[test]
fn a_focus_on_a_corpse_steers_nothing() {
    let mut hunt = Hunt::new(
        field(),
        unit(
            Body::Rogue,
            Faction::Heroes,
            Loadout::pair(ActionKind::Sword, ActionKind::Shield),
            Vec2::from_ints(12, 14),
        ),
        // A Brute with the constitution of a Skitterer. The point of this test is
        // what happens *after* the kill, and a full-fat Brute spends thousands of
        // ticks getting there -- which would be a measurement of how long a duel
        // takes wearing the costume of a test about orders.
        {
            let mut frail = unit(
                Body::Brute,
                Faction::Monsters,
                Body::Brute.default_loadout(),
                Vec2::from_ints(15, 14),
            );
            frail.stats.vitality = 0;
            frail
        },
        Box::new(DuelistPolicy::baseline()),
        Box::new(IdlePolicy),
    );

    let mut fell = None;
    for tick in 0..3000 {
        hunt.tick();
        if !hunt.world.is_alive(hunt.quarry) {
            fell = Some(tick);
            break;
        }
    }
    let fell = fell.expect("the quarry outlived the test rather than the other way round");

    // A few ticks for the last command to expire; a decision already submitted
    // goes on being executed until its period runs out, and that is the sim's
    // business rather than the order's.
    for _ in 0..30 {
        hunt.tick();
    }
    let held = hunt.at(hunt.hero);
    for _ in 0..400 {
        hunt.tick();
    }
    let after = hunt.at(hunt.hero);
    println!("the quarry fell on tick {fell}; the hero held {held:?}");
    assert_eq!(
        (after.x.raw(), after.y.raw()),
        (held.x.raw(), held.y.raw()),
        "wandered off after the kill instead of holding the ground"
    );
}

/// The whole battery as one number: every kit hunted with, hashed at the end.
fn battery_hash() -> u64 {
    let mut hash = 0u64;
    for (i, kit) in [
        Loadout::pair(ActionKind::Bow, ActionKind::Sword),
        Loadout::pair(ActionKind::Sword, ActionKind::Shield),
        Loadout::single(ActionKind::Sword),
        Loadout::pair(ActionKind::Run, ActionKind::Sword),
    ]
    .into_iter()
    .enumerate()
    {
        let mut hunt = hunt_with(kit);
        hunt.watch(400);
        hash ^= hunt.world.state_hash().rotate_left(i as u32 * 7);
    }
    // And one chase, because a moving quarry rebuilds the flow field every time
    // it crosses a tile boundary and that is the half of the routing a standing
    // one never exercises.
    let mut chase = Hunt::new(
        field(),
        unit(
            Body::Rogue,
            Faction::Heroes,
            Loadout::pair(ActionKind::Sword, ActionKind::Shield),
            Vec2::from_ints(6, 14),
        ),
        unit(
            Body::Brute,
            Faction::Monsters,
            Body::Brute.default_loadout(),
            Vec2::from_ints(14, 14),
        ),
        Box::new(DuelistPolicy::baseline()),
        Box::new(Fleeing),
    );
    chase.watch(400);
    hash ^= chase.world.state_hash().rotate_left(31);
    hash
}

#[test]
fn the_battery_produces_the_same_number_twice() {
    assert_eq!(battery_hash(), battery_hash());
}

#[test]
fn results_do_not_depend_on_the_thread_that_computed_them() {
    // Mirrors the sim's own eight-thread check and `goto.rs`'s. A pursuit reads
    // the flow field, the contact list and its own stats and nothing else, but
    // "nothing else" is a claim worth testing rather than asserting -- and this
    // battery drives four different minds through the same order, which is
    // exactly where a shared `Box<dyn ActionMind>` would show up if one were ever
    // hoisted out of the per-decision path.
    let expected = battery_hash();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8).map(|_| scope.spawn(battery_hash)).collect();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), expected);
        }
    });
}
