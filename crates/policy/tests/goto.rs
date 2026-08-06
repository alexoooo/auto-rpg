//! Arriving somewhere, driven through a real `World`.
//!
//! The unit tests beside `UtilityPolicy` pin what a single decision looks like.
//! This is the other half, and the half that catches the interesting failures:
//! the same policy in the loop for hundreds of ticks, where a steering vector
//! that reads perfectly well either converges on the click or parks a fraction
//! of a unit short of it forever.

use fx::{Fx, Vec2};
use policy::{Policy, UtilityPolicy};
use sim::{Command, EntityId, Faction, Order, Scenario, Body, World};

/// The hover ring: how far from its destination an ordered character is free to
/// move, and so how close counts as *arrived*.
///
/// Restated rather than imported, because `policy` keeps `LEASH_ROAM` to itself
/// and an integration test lives outside the crate. Widening a constant's
/// visibility so that one assertion can read it would be the tail wagging the
/// dog; if it ever moves, this moves with it, and everything below is what says
/// so loudly.
const RING: Fx = Fx::from_ratio(3, 2);

/// One hero alone in a room, driven the way a client drives it.
///
/// Deliberately not `policy::run`: that loop gates on `World::outcome()`, which
/// reports `HeroesWin` from tick zero when there is nothing left to fight, so it
/// would return before the hero took a step. Every tick answers whoever is due
/// to think and then steps -- skipping the answering half would leave the hero
/// executing a stale command forever, because an unanswered decision still
/// advances its clock.
struct Room {
    world: World,
    policy: UtilityPolicy,
    hero: EntityId,
}

/// What one walk produced.
///
/// The measurements are of one piece, and were briefly not. There was a version
/// of this file that split them along the rim of the ring, on the argument that
/// inside it the order has let go and the character is free to shift its weight,
/// so moving away from the anchor in there is the specification rather than a
/// fault and only needs bounding. That was true of an idle drift, and the idle
/// drift is gone: nothing is in sight in this harness, so the order is the only
/// thing steering on either side of the rim and the claim is the same claim on
/// both -- never once away from the anchor, by a single raw unit, on any tick of
/// the walk. A bound sized to permit something that can no longer happen is a
/// bound with nothing left to catch, so the seam went the way the drift did.
#[derive(Clone, Copy, Debug)]
struct Arrival {
    /// The tick the hero first came inside the ring, or `None` if it never did.
    tick: Option<u32>,
    /// How far it ended up from the point it was actually aiming at.
    distance: Fx,
    /// Worst single-tick *increase* in that distance, over the whole walk.
    backslide: Fx,
}

impl Room {
    fn new(kind: Body, spawn: Vec2) -> Room {
        let mut scenario = Scenario::room();
        scenario.units[0].set_body(kind);
        scenario.units[0].stats = kind.base_stats();
        scenario.units[0].spawn = spawn;
        let mut world = World::new(&scenario, 1);
        // Routing is opt-in, and walking somewhere is what this file is about.
        // Without it the sim reports no route, and no route is -- correctly --
        // a stop: the hero would stand on its spawn for the whole walk.
        world.set_objective(Faction::Heroes, sim::Objective::Order);
        let hero = world.alive_ids(Faction::Heroes)[0];
        Room {
            world,
            policy: UtilityPolicy::baseline(),
            hero,
        }
    }

    /// The room exactly as the browser build opens it.
    fn fighter() -> Room {
        Room::new(Body::Fighter, Scenario::room().units[0].spawn)
    }

    fn position(&self) -> Vec2 {
        self.world.view(self.hero).unwrap().position
    }

    fn radius(&self) -> Fx {
        self.world.view(self.hero).unwrap().radius
    }

    /// One tick of travel. Every time budget and every drift bound in this file
    /// is stated in it rather than in a constant, so they hold for whichever
    /// archetype is walking.
    fn speed(&self) -> Fx {
        self.world.view(self.hero).unwrap().stats.move_speed()
    }

    /// Where a click actually lands. A point a body cannot stand on -- inside
    /// masonry, or nearer a wall than its own radius -- is not somewhere it can
    /// arrive, so "did it arrive" has to be asked about the reachable point
    /// rather than about the click.
    ///
    /// Asks the world rather than rebuilding the clamp box, which is what this
    /// used to do and which was a third copy of a rule that now has exactly one
    /// home.
    fn reachable(&self, target: Vec2) -> Vec2 {
        self.world.nearest_walkable(target, self.radius())
    }

    fn order(&mut self, target: Vec2) {
        self.world.set_order(Faction::Heroes, Order::Goto(target));
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

    /// Orders a walk and runs `limit` ticks of it, watching every one.
    fn walk_to(&mut self, target: Vec2, limit: u32) -> Arrival {
        self.order(target);
        let aim = self.reachable(target);
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
            if arrival.tick.is_none() && distance <= RING {
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
        let flat_out = from.distance(self.reachable(target)) / self.speed();
        (flat_out * Fx::from_ratio(14, 10) + Fx::from_int(60)).round_int() as u32
    }
}

/// Distances used as assertion slack. One thousandth of a unit is roughly a
/// twentieth of a pixel on the canvas this feeds, and 54x smaller than the
/// backslide the add-then-clamp steering bug produces.
const EPS: Fx = Fx::from_ratio(1, 1000);

/// How close a walk actually gets in the time it is given.
///
/// Not a deadband, because there is no deadband any more, and not a fixed point
/// either. Inside the ring the pull tapers as the square of what is left and the
/// brake tapers with the distance too, so the last stretch closes as the *cube*
/// of the gap: always inward, never past, and never quite finished. What a
/// budget buys is therefore a distance rather than an arrival, and this is that
/// distance -- a fifth of `RING`, which every walk below clears. The worst of
/// them is a Brute, whose long stride buys it the least braking resolution, at
/// 0.229 out; the rest end nearer 0.11.
///
/// Read the printouts before touching this number. Creeping up means the taper
/// has got softer; a jump means the character stalled short of the mark, which
/// is a different fault entirely and the one the whole file exists to catch.
const SETTLE: Fx = Fx::from_ratio(3, 10);

/// **The two claims of arriving, and the second is the new one.**
///
/// A walk closes to inside the ring, and then it never comes back out. The
/// second half is what no arrangement of the old code could pass: the deadband
/// was one tick of travel, so any shove at all -- knockback, `World::separate`'s
/// body shove, a wall slide -- re-armed the order and walked the character back
/// to the mark with its own footwork switched off.
///
/// Alone in a room there is nothing to shove it, and that is what lets the
/// second claim be put much more strongly than "stayed inside the ring". With
/// the order the only thing steering, staying inside a ring a unit and a half
/// wide is not something a walk could plausibly fail; never moving away from the
/// anchor *at all*, on any of eight hundred ticks, is. The weaker statement is a
/// corollary of the stronger one, so the stronger one is the one written down.
#[test]
fn a_click_on_open_ground_is_arrived_at_and_stayed_at() {
    let mut room = Room::fighter();
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 800);
    println!(
        "open ground: arrived {:?}, {} raw from the click, backslide {} raw, at {:?}",
        arrival.tick,
        arrival.distance.raw(),
        arrival.backslide.raw(),
        room.position()
    );
    assert!(
        arrival.tick.is_some(),
        "never arrived; ended {} away",
        arrival.distance
    );
    assert!(
        arrival.distance <= SETTLE,
        "stopped {} short of the click",
        arrival.distance
    );
    assert!(
        arrival.backslide < EPS,
        "left the click again after arriving, by {} on some tick",
        arrival.backslide
    );
}

#[test]
fn the_approach_is_monotone_because_the_stride_is_braked() {
    // The test with teeth. A steering term added before `clamp_length` -- an
    // `open_ground` bias, say -- balances the brake instead of shrinking with
    // it, and the character oscillates about a fixed point short of the click.
    // That shows up here immediately, as a per-tick backslide of one tick of
    // travel -- 0.054 units, against a measured backslide of exactly zero.
    //
    // Zero on every tick of the walk, and not merely on the stretch outside the
    // ring. That distinction had to be drawn while an idle drift was blended in
    // near the anchor, because a constant bias pushing against a pull that has
    // relaxed *is* a step away from the mark and the bound had to allow for it.
    // Nothing is in sight here, so nothing is blended, so there is nothing left
    // that could take a step outward and no reason to make an allowance for one.
    let mut room = Room::fighter();
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 400);
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
    //
    // The leash cannot loosen that. With nothing in sight it is handed no
    // footwork to blend, so the only vector left is the route's, and the route
    // across an empty room is the straight line. It is the wall *sweep* that
    // this is about, and the sweep would put a lateral component on the walk
    // whatever else was or was not steering.
    let mut room = Room::fighter();
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
        if arrived.is_none() && room.position().distance(aim) <= RING {
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
    // The two corners settle as exact mirror images of one another -- 9518 raw
    // along x and 6245 along y, out of the corner in both cases -- and that is
    // worth a printout rather than an assertion of its own. Nothing is pinned
    // against the boundary any more: the character brakes to a crawl before it
    // gets there, so what these two measure is the tail of the approach and not
    // the arithmetic of the last step into a wall. The day they stop mirroring
    // is a day something changed in `Fx`.
    for click in [
        Vec2::new(Fx::from_ratio(1, 10), Fx::from_ratio(1, 10)),
        Vec2::new(Fx::from_ratio(239, 10), Fx::from_ratio(159, 10)),
    ] {
        let mut room = Room::fighter();
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
            arrival.distance <= SETTLE,
            "{click:?} settled {} from the closest reachable point",
            arrival.distance
        );
        assert!(arrival.backslide < EPS, "backslid {}", arrival.backslide);
    }
}

#[test]
fn the_far_corner_and_the_walk_between_the_corners_both_terminate() {
    let corner = Vec2::new(Fx::from_ratio(45, 100), Fx::from_ratio(45, 100));
    let mut room = Room::fighter();
    let near = room.walk_to(corner, 400);
    println!(
        "to the corner: arrived {:?}, {} raw away",
        near.tick,
        near.distance.raw()
    );
    assert!(near.tick.is_some(), "never reached the near corner");
    assert!(
        near.distance <= SETTLE,
        "stopped {} short of the near corner",
        near.distance
    );
    assert!(near.backslide < EPS, "backslid {}", near.backslide);

    let opposite = Vec2::new(Fx::from_ratio(2355, 100), Fx::from_ratio(1555, 100));
    let before = room.world.tick();
    let far = room.walk_to(opposite, 800);
    println!(
        "corner to corner: ordered at {before}, arrived {:?}, {} raw away",
        far.tick,
        far.distance.raw()
    );
    assert!(far.tick.is_some(), "never crossed the room");
    // The bound has to be a real one rather than the walk's own limit. This read
    // `crossing <= 800` against a `walk_to(opposite, 800)`, which is to say it
    // asserted the same thing `far.tick.is_some()` had already asserted on the
    // line above: unfalsifiable, and it had been so since the day it was
    // written. 27.6 units of room, less the ring's own unit and a half, is 26.1
    // to cover at 0.0537 a tick -- a floor of 486, measured at 498. The brake
    // costs the last stride and not a multiple of the journey, and twelve ticks
    // is what "the last stride" is worth.
    let crossing = far.tick.unwrap() - before;
    assert!(crossing <= 560, "the crossing took {crossing} ticks");
    assert!(
        far.distance <= SETTLE,
        "stopped {} short of the far corner",
        far.distance
    );
    assert!(far.backslide < EPS, "backslid {}", far.backslide);
}

/// **Still perfectly still, and for a reason rather than by luck.**
///
/// The leash hands an arrived character its own footwork back, so the obvious
/// worry is that this test now measures a fidget. It does not, and it does not
/// need the ring's help to say so: a click on the spot the hero is standing on
/// gives the sim nowhere to route to, so `nav_step` reports no route and
/// `ordered_feet` never runs at all. Nothing is in sight either, so the footwork
/// handed to the leash would have been a zero in any case -- which is the whole
/// of why there is one reason here now and not the two an idle drift needed.
/// Standing on your own destination has to be a `HOLD`: a direction too short to
/// move the body still turns the character to face it, which is a hero spinning
/// on the spot in front of the player.
#[test]
fn a_click_where_the_hero_already_stands_holds_it_perfectly_still() {
    let mut room = Room::fighter();
    let spot = room.position();
    room.order(spot);

    let obs = room.world.observe(room.hero);
    let command = room.policy.decide(&obs);
    assert_eq!(command, Command::HOLD, "fidgeted instead of standing");

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

/// **What the last stretch of a walk looks like: a crawl inward, never an
/// orbit.**
///
/// Two claims, and the second is the sharper one. The hero is inside the ring
/// and near the mark within its budget; then, watched for six hundred ticks
/// more, it does not once move away from the mark and ends measurably nearer it
/// than it started. Both halves matter. Never outward is what distinguishes a
/// leash from the add-then-clamp bug this file was written against, which
/// reaches a fixed point short of the click and then oscillates about it forever
/// at a tick of travel a time. Ending nearer is what distinguishes it from a
/// character that has *stalled* -- the failure a purely one-sided bound would
/// wave through, and the one to expect if the taper is ever made steeper or the
/// arithmetic underneath it loses a bit.
///
/// There was a version of this that asserted the hero holds its arrival spot
/// exactly, to the raw unit. That was true only while an idle drift was balancing
/// the pull at a fixed point, and it was the drift's tell rather than the
/// leash's: with the order the only thing steering, there is nothing for it to
/// come to rest *against*, so it closes on the anchor as the cube of the gap and
/// keeps closing for as long as anyone watches.
#[test]
fn the_last_of_the_walk_is_a_crawl_inward_and_never_an_orbit() {
    let mut room = Room::fighter();
    let aim = room.reachable(Vec2::from_ints(20, 12));
    let arrival = room.walk_to(Vec2::from_ints(20, 12), 400);
    assert!(arrival.tick.is_some(), "never arrived");
    let settled = room.position().distance(aim);
    assert!(
        settled <= SETTLE,
        "arrived {settled} from the click, which is short of the mark rather than near it"
    );

    let mut previous = settled;
    for _ in 0..600 {
        room.tick();
        let distance = room.position().distance(aim);
        assert!(
            distance <= previous,
            "moved {} back from the mark at tick {}; the leash has found an orbit",
            distance - previous,
            room.world.tick()
        );
        previous = distance;
    }
    println!(
        "settled {} raw from the click, {} raw six hundred ticks later",
        settled.raw(),
        previous.raw()
    );
    assert!(
        previous < settled,
        "stalled {settled} from the click instead of closing on it"
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
        let mut room = Room::fighter();
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
            arrival.distance <= SETTLE,
            "{target:?} ended {} away, which is inside the ring but not near the mark",
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
    for kind in Body::ALL {
        let mut room = Room::new(kind, Vec2::from_ints(12, 8));
        let target = Vec2::from_ints(20, 12);
        let budget = room.budget(room.position(), target);
        let arrival = room.walk_to(target, budget);
        println!(
            "{}: stride {}, arrived {:?} of {budget}, {} raw away, backslide {} raw",
            kind.name(),
            room.speed() * (kind.base_stats().decision_period() as i32),
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
        // The bound every archetype has to clear on its own schedule, and the
        // one that pins `SETTLE`: the Brute's stride is the longest and its
        // braking resolution the coarsest, so it ends furthest out of the four.
        assert!(
            arrival.distance <= SETTLE,
            "the {} ended {} away, inside the ring but not near the mark",
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
    for kind in Body::ALL {
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
