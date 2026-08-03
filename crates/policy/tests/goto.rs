//! Arriving somewhere, driven through a real `World`.
//!
//! The unit tests beside `UtilityPolicy` pin what a single decision looks like.
//! This is the other half, and the half that catches the interesting failures:
//! the same policy in the loop for hundreds of ticks, where a steering vector
//! that reads perfectly well either converges on the click or parks a fraction
//! of a unit short of it forever.

use fx::{Fx, Vec2};
use policy::{Policy, UtilityPolicy};
use sim::{Action, EntityId, Faction, Order, Scenario, UnitKind, World};

/// One hero alone in a room, driven the way a client drives it.
///
/// Deliberately not `policy::run`: that loop gates on `World::outcome()`, which
/// reports `HeroesWin` from tick zero when there is nothing left to fight, so it
/// would return before the hero took a step. Every tick answers whoever is due
/// to think and then steps -- skipping the answering half would leave the hero
/// executing a stale action forever, because an unanswered decision still
/// advances its clock.
struct Room {
    world: World,
    policy: UtilityPolicy,
    hero: EntityId,
}

/// What one walk produced.
#[derive(Clone, Copy, Debug)]
struct Arrival {
    /// The tick the hero first came inside its own arrival deadband, or `None`
    /// if it never did.
    tick: Option<u32>,
    /// How far it ended up from the point it was actually aiming at.
    distance: Fx,
    /// Worst single-tick *increase* in that distance over the whole walk.
    backslide: Fx,
}

impl Room {
    fn new(kind: UnitKind, spawn: Vec2) -> Room {
        let mut scenario = Scenario::room();
        scenario.units[0].kind = kind;
        scenario.units[0].stats = kind.base_stats();
        scenario.units[0].spawn = spawn;
        let world = World::new(&scenario, 1);
        let hero = world.alive_ids(Faction::Heroes)[0];
        Room {
            world,
            policy: UtilityPolicy::baseline(),
            hero,
        }
    }

    /// The room exactly as the browser build opens it.
    fn warrior() -> Room {
        Room::new(UnitKind::Warrior, Scenario::room().units[0].spawn)
    }

    fn position(&self) -> Vec2 {
        self.world.view(self.hero).unwrap().position
    }

    fn radius(&self) -> Fx {
        self.world.view(self.hero).unwrap().radius
    }

    /// One tick of travel: the policy's arrival deadband.
    fn deadband(&self) -> Fx {
        self.world.view(self.hero).unwrap().stats.move_speed()
    }

    /// Where a click actually lands. Bodies are pinned to
    /// `[radius, arena - radius]`, so a point nearer a wall than that is not
    /// somewhere a character can stand, and "did it arrive" has to be asked
    /// about the reachable point rather than the click.
    fn reachable(&self, target: Vec2) -> Vec2 {
        let r = self.radius();
        target.clamp_box(
            Vec2::new(r, r),
            Vec2::new(self.world.arena().x - r, self.world.arena().y - r),
        )
    }

    fn order(&mut self, target: Vec2) {
        self.world.set_order(Faction::Heroes, Order::Goto(target));
    }

    fn tick(&mut self) {
        let due = self.world.pending_decisions().to_vec();
        for id in due {
            let obs = self.world.observe(id);
            let action = self.policy.decide(&obs);
            self.world.submit(id, action);
        }
        self.world.step();
    }

    /// Orders a walk and runs `limit` ticks of it, watching every one.
    fn walk_to(&mut self, target: Vec2, limit: u32) -> Arrival {
        self.order(target);
        let aim = self.reachable(target);
        let deadband = self.deadband();
        let mut previous = self.position().distance(aim);
        let mut arrival = Arrival {
            tick: None,
            distance: previous,
            backslide: Fx::ZERO,
        };
        for _ in 0..limit {
            self.tick();
            let distance = self.position().distance(aim);
            arrival.backslide = arrival.backslide.max(distance - previous);
            previous = distance;
            if arrival.tick.is_none() && distance <= deadband {
                arrival.tick = Some(self.world.tick());
            }
        }
        arrival.distance = previous;
        arrival
    }

    /// Ticks the hero has to spare: the straight-line time at full speed, plus
    /// the slack the brake costs. Deliberately expressed in the character's own
    /// `move_speed` rather than in a constant, so it holds for every archetype.
    fn budget(&self, from: Vec2, target: Vec2) -> u32 {
        let flat_out = from.distance(self.reachable(target)) / self.deadband();
        (flat_out * Fx::from_ratio(14, 10) + Fx::from_int(60)).round_int() as u32
    }
}

/// Distances used as assertion slack. One thousandth of a unit is roughly a
/// twentieth of a pixel on the canvas this feeds, and 54x smaller than the
/// backslide the add-then-clamp steering bug produces.
const EPS: Fx = Fx::from_ratio(1, 1000);

#[test]
fn a_click_on_open_ground_is_walked_to_and_not_merely_approached() {
    let mut room = Room::warrior();
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 200);
    println!(
        "open ground: arrived {:?}, {} raw from the click, at {:?}",
        arrival.tick,
        arrival.distance.raw(),
        room.position()
    );
    assert!(
        arrival.tick.is_some(),
        "never arrived; ended {} away",
        arrival.distance
    );
    assert!(
        arrival.distance <= Fx::from_ratio(55, 1000),
        "stopped {} short of the click",
        arrival.distance
    );
}

#[test]
fn the_approach_is_monotone_because_the_stride_is_braked() {
    // The test with teeth. A steering term added before `clamp_length` -- an
    // `open_ground` bias, say -- balances the brake instead of shrinking with
    // it, and the character oscillates about a fixed point short of the click.
    // That shows up here immediately, as a per-tick backslide of one tick of
    // travel -- 0.054 units, against a measured backslide of exactly zero.
    let mut room = Room::warrior();
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 200);
    println!("worst backslide: {} raw", arrival.backslide.raw());
    assert!(
        arrival.backslide < EPS,
        "the hero moved away from the click by {} on some tick",
        arrival.backslide
    );
}

#[test]
fn a_click_by_a_wall_is_walked_to_straight_rather_than_swept_past() {
    // The regression guard for the wall sweep. An `Advance` toward this wall
    // gives up on the heading a couple of units out and patrols along the wall
    // instead; a `Goto` must hold the line, which here means never leaving
    // y = 8 at all -- not "roughly", but not by a single raw unit.
    let mut room = Room::warrior();
    let target = Vec2::from_ints(1, 8);
    let line = room.position().y;
    let aim = room.reachable(target);
    room.order(target);

    let mut arrived = None;
    for _ in 0..400 {
        room.tick();
        assert_eq!(
            room.position().y,
            line,
            "swept off the line at tick {}",
            room.world.tick()
        );
        if arrived.is_none() && room.position().distance(aim) <= room.deadband() {
            arrived = Some(room.world.tick());
        }
    }
    println!("near wall: arrived {arrived:?} at {:?}", room.position());
    assert!(arrived.is_some(), "never reached the wall");
}

#[test]
fn a_click_inside_a_wall_arrives_as_close_as_a_body_can_get() {
    // A click within one body radius of a wall names a point no character can
    // occupy. Without the reachability clamp the hero presses into the wall and
    // never satisfies its own arrival test, so this is the case that decides
    // whether clicking a corner is a stall.
    //
    // The two corners do not settle identically, and the asymmetry is real
    // rather than noise: `Fx` multiplication floors, which *lengthens* a step
    // with negative components and shortens a positive one. Walking down and
    // left the body therefore overshoots and `clamp_to_arena` pins it exactly on
    // the boundary; walking up and right it stops a handful of raw units short.
    // A handful of raw units is 1e-4 of a world unit -- a twentieth of a pixel.
    for click in [
        Vec2::new(Fx::from_ratio(1, 10), Fx::from_ratio(1, 10)),
        Vec2::new(Fx::from_ratio(239, 10), Fx::from_ratio(159, 10)),
    ] {
        let mut room = Room::warrior();
        let budget = room.budget(room.position(), click);
        let arrival = room.walk_to(click, budget);
        let (at, aim) = (room.position(), room.reachable(click));
        println!(
            "unreachable {click:?}: arrived {:?} of {budget}, ended ({}, {}) aiming ({}, {})",
            arrival.tick,
            at.x.raw(),
            at.y.raw(),
            aim.x.raw(),
            aim.y.raw()
        );
        assert!(arrival.tick.is_some(), "never arrived at {click:?}");
        assert!(
            arrival.distance < EPS,
            "{click:?} settled {} from the closest reachable point",
            arrival.distance
        );
        assert!(arrival.backslide < EPS, "backslid {}", arrival.backslide);
    }
}

#[test]
fn the_far_corner_and_the_walk_between_the_corners_both_terminate() {
    let corner = Vec2::new(Fx::from_ratio(45, 100), Fx::from_ratio(45, 100));
    let mut room = Room::warrior();
    let near = room.walk_to(corner, 400);
    println!(
        "to the corner: arrived {:?}, {} raw away",
        near.tick,
        near.distance.raw()
    );
    assert!(near.tick.is_some(), "never reached the near corner");

    let opposite = Vec2::new(Fx::from_ratio(2355, 100), Fx::from_ratio(1555, 100));
    let before = room.world.tick();
    let far = room.walk_to(opposite, 800);
    println!(
        "corner to corner: ordered at {before}, arrived {:?}, {} raw away",
        far.tick,
        far.distance.raw()
    );
    assert!(far.tick.is_some(), "never crossed the room");
    // 27.6 units at 0.0537 a tick is a floor of 515; the brake costs the last
    // stride, not a multiple of the journey.
    let crossing = far.tick.unwrap() - before;
    assert!(crossing <= 800, "the crossing took {crossing} ticks");
    assert!(far.backslide < EPS, "backslid {}", far.backslide);
}

#[test]
fn a_click_where_the_hero_already_stands_holds_it_perfectly_still() {
    let mut room = Room::warrior();
    let spot = room.position();
    room.order(spot);

    let obs = room.world.observe(room.hero);
    let action = room.policy.decide(&obs);
    assert_eq!(action, Action::HOLD, "fidgeted instead of standing");

    for _ in 0..600 {
        room.tick();
    }
    let after = room.position();
    assert_eq!(
        (after.x.raw(), after.y.raw()),
        (spot.x.raw(), spot.y.raw()),
        "drifted while standing on its destination"
    );
}

#[test]
fn the_hero_stays_put_once_it_has_arrived() {
    let mut room = Room::warrior();
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 200);
    assert!(arrival.tick.is_some());
    let settled = room.position();
    for _ in 0..600 {
        room.tick();
    }
    let after = room.position();
    assert_eq!(
        (after.x.raw(), after.y.raw()),
        (settled.x.raw(), settled.y.raw()),
        "crept after arriving; the deadband is not holding"
    );
}

/// A fixed grid over the arena, kept a comfortable distance inside the walls so
/// every point is genuinely reachable and the test measures navigation rather
/// than clamping.
fn grid() -> Vec<Vec2> {
    let mut targets = Vec::with_capacity(16);
    for x in [2, 8, 16, 22] {
        for y in [2, 6, 10, 14] {
            targets.push(Vec2::from_ints(x, y));
        }
    }
    targets
}

#[test]
fn every_point_on_a_grid_across_the_arena_is_reached_in_proportionate_time() {
    for target in grid() {
        let mut room = Room::warrior();
        let budget = room.budget(room.position(), target);
        let arrival = room.walk_to(target, budget);
        println!(
            "grid {target:?}: arrived {:?} of {budget}, {} raw away, backslide {} raw",
            arrival.tick,
            arrival.distance.raw(),
            arrival.backslide.raw()
        );
        assert!(
            arrival.tick.is_some(),
            "{target:?} not reached within {budget} ticks; ended {} away",
            arrival.distance
        );
        assert!(
            arrival.backslide < EPS,
            "{target:?} backslid {}",
            arrival.backslide
        );
    }
}

#[test]
fn every_archetype_arrives_on_its_own_schedule() {
    // A hard-coded stride would pass every test above and fail exactly here: a
    // Brute thinks once every 18 ticks and a Skitterer every 8, so the ground
    // each commits to before its next thought differs by 70%.
    for kind in UnitKind::ALL {
        let mut room = Room::new(kind, Vec2::from_ints(12, 8));
        let target = Vec2::from_ints(20, 12);
        let budget = room.budget(room.position(), target);
        let arrival = room.walk_to(target, budget);
        println!(
            "{}: stride {}, arrived {:?} of {budget}, {} raw away, backslide {} raw",
            kind.name(),
            room.deadband() * (kind.base_stats().decision_period() as i32),
            arrival.tick,
            arrival.distance.raw(),
            arrival.backslide.raw()
        );
        assert!(
            arrival.tick.is_some(),
            "the {} never arrived; ended {} away",
            kind.name(),
            arrival.distance
        );
        assert!(
            arrival.backslide < EPS,
            "the {} backslid {}",
            kind.name(),
            arrival.backslide
        );
    }
}

/// The whole battery as one number: every archetype walked over every grid
/// point, hashed at the end of each walk.
fn battery_hash() -> u64 {
    let mut hash = 0u64;
    for kind in UnitKind::ALL {
        let mut room = Room::new(kind, Vec2::from_ints(12, 8));
        for target in grid() {
            room.walk_to(target, 200);
            hash ^= room
                .world
                .state_hash()
                .rotate_left((target.x.raw() % 61) as u32);
        }
    }
    hash
}

#[test]
fn the_battery_produces_the_same_number_twice() {
    assert_eq!(battery_hash(), battery_hash());
}

#[test]
fn results_do_not_depend_on_the_thread_that_computed_them() {
    // Mirrors the sim's own eight-thread check. Navigation reads
    // `wall_clearance` and its own stats and nothing else, but "nothing else"
    // is a claim worth testing rather than asserting.
    let expected = battery_hash();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8).map(|_| scope.spawn(battery_hash)).collect();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), expected);
        }
    });
}
