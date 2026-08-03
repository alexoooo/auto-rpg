//! The guarantee this whole project is built around.
//!
//! If any of these fail, the browser build and the experiment lab are no
//! longer running the same game, and every recorded run we own is suspect.
//!
//! The policy used here is deliberately trivial and defined inline: these
//! tests pin the *simulation*, not the behaviour crate.

use fx::{Fx, Vec2};
use sim::{Action, Faction, HandCommand, Observation, Order, Replay, Scenario, Strike, World};

/// Charge the nearest visible enemy and cut at it; otherwise advance toward the
/// enemy side while drifting to the arena's centre line, so the two sides
/// actually meet instead of sliding past each other into opposite walls.
///
/// The three-armed match on the attack state is the whole contract, and getting
/// it wrong is silent: letting the command lapse mid-windup cancels the attack,
/// and holding it through a recovery leaves the hand disarmed forever after one
/// cut. [`Observation::can_strike`] answers the first half; the phase answers
/// the rest.
fn greedy(obs: &Observation) -> Action {
    match obs.nearest_enemy() {
        Some(contact) => {
            let bearing = contact.offset.angle();
            let sword = if obs.can_strike() || obs.sword().swing.is_attacking() {
                HandCommand::attack(bearing, Strike::Nearest)
            } else {
                HandCommand::new(bearing, Fx::ZERO)
            };
            Action::swinging(
                contact.offset.normalize(),
                contact.id,
                sword,
                HandCommand::new(bearing, Fx::ONE),
            )
        }
        None => {
            let forward = match obs.faction {
                Faction::Heroes => Fx::ONE,
                Faction::Monsters => -Fx::ONE,
            };
            // wall_clearance is [-x, +x, -y, +y]; the difference points to the
            // middle. Everything an agent knows comes through the observation,
            // including this.
            let centring = obs.wall_clearance[3] - obs.wall_clearance[2];
            Action::moving(Vec2::new(forward, centring).normalize())
        }
    }
}

/// Runs a scenario to completion, returning the final world, a replay of it,
/// and the state hash after every tick.
fn run(scenario: &Scenario, seed: u64) -> (World, Replay, Vec<u64>) {
    let mut world = World::new(scenario, seed);
    let mut replay = Replay::new(scenario, seed);

    // Standing orders are player input, so they belong in the replay alongside
    // agent decisions. Recording only half the inputs reproduces only half the
    // run -- and since orders are part of world state, the divergence shows up
    // as a hash mismatch even when every entity is in exactly the right place.
    for (faction, order) in [
        (Faction::Heroes, Order::Advance(Vec2::X)),
        (Faction::Monsters, Order::Advance(-Vec2::X)),
    ] {
        world.set_order(faction, order);
        replay.record_order(0, faction, order);
    }

    let mut hashes = vec![world.state_hash()];
    let mut due = Vec::new();

    while world.outcome().is_none() && world.tick() < scenario.max_ticks {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let action = greedy(&world.observe(id));
            replay.record(world.tick(), id, action);
            world.submit(id, action);
        }
        world.step();
        hashes.push(world.state_hash());
    }
    replay.finish(world.tick());
    (world, replay, hashes)
}

fn scenarios() -> Vec<Scenario> {
    vec![
        Scenario::duel(),
        Scenario::skirmish(1, 3, 4),
        Scenario::skirmish(77, 6, 9),
    ]
}

#[test]
fn the_same_inputs_produce_the_same_history() {
    for scenario in scenarios() {
        let (_, _, a) = run(&scenario, 42);
        let (_, _, b) = run(&scenario, 42);
        assert_eq!(
            a.len(),
            b.len(),
            "{} ran for different lengths",
            scenario.name
        );
        for (tick, (x, y)) in a.iter().zip(&b).enumerate() {
            assert_eq!(x, y, "{} diverged at tick {tick}", scenario.name);
        }
    }
}

#[test]
fn a_different_seed_produces_a_different_history() {
    // Perception noise is the only seed-dependent input, so this also proves
    // the seed actually reaches the agents.
    let scenario = Scenario::skirmish(5, 4, 6);
    let (_, _, a) = run(&scenario, 1);
    let (_, _, b) = run(&scenario, 2);
    assert_ne!(a.last(), b.last(), "the seed had no effect on the run");
}

#[test]
fn a_replay_reproduces_the_run_it_recorded() {
    for scenario in scenarios() {
        let (world, replay, _) = run(&scenario, 7);
        assert!(replay.is_intact());
        let played = replay.play();
        assert_eq!(played.tick(), world.tick(), "{}", scenario.name);
        assert_eq!(
            played.state_hash(),
            world.state_hash(),
            "{} did not replay exactly",
            scenario.name
        );
        assert_eq!(played.outcome(), world.outcome());
    }
}

#[test]
fn a_replay_matches_the_original_at_every_intermediate_tick() {
    let scenario = Scenario::skirmish(11, 5, 5);
    let (_, replay, hashes) = run(&scenario, 3);
    // Spot-check rather than every tick: play_until restarts each time.
    for tick in [0, 1, 2, 17, 60, 150] {
        if tick as usize >= hashes.len() {
            break;
        }
        assert_eq!(
            replay.play_until(tick).state_hash(),
            hashes[tick as usize],
            "replay diverged by tick {tick}"
        );
    }
}

#[test]
fn results_do_not_depend_on_the_thread_that_computed_them() {
    // Cheap guard against anything sneaking a thread-local, a global RNG or a
    // wall clock into the sim: eight threads, one answer.
    let scenario = Scenario::skirmish(21, 4, 7);
    let expected = run(&scenario, 9).0.state_hash();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let scenario = &scenario;
                scope.spawn(move || run(scenario, 9).0.state_hash())
            })
            .collect();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), expected);
        }
    });
}

#[test]
fn player_orders_change_the_outcome_without_breaking_determinism() {
    let scenario = Scenario::skirmish(31, 4, 4);
    let mut hashes = Vec::new();
    for order in [Order::Hold, Order::Advance(Vec2::X), Order::Regroup] {
        let mut world = World::new(&scenario, 5);
        world.set_order(Faction::Heroes, order);
        let mut due = Vec::new();
        for _ in 0..300 {
            due.clear();
            due.extend_from_slice(world.pending_decisions());
            for &id in &due {
                let obs = world.observe(id);
                // Interpret the order, so it actually influences the run.
                let action = match obs.order {
                    Order::Advance(dir) if obs.nearest_enemy().is_none() => Action::moving(dir),
                    _ => greedy(&obs),
                };
                world.submit(id, action);
            }
            world.step();
        }
        hashes.push(world.state_hash());
    }
    // Orders reached the agents...
    assert_ne!(hashes[0], hashes[1]);
    // ...and each one is still reproducible.
    let mut repeat = World::new(&scenario, 5);
    repeat.set_order(Faction::Heroes, Order::Hold);
    assert_eq!(repeat.order(Faction::Heroes), Order::Hold);
}

/// Recorded on x86-64 Windows, rustc 1.97.1.
///
/// The same number must come back from a wasm build and from every other
/// architecture. A change here is either a deliberate rules change -- in which
/// case re-record it with
///
/// ```text
/// cargo test -p sim --test determinism -- --nocapture golden
/// ```
///
/// -- or a portability bug, in which case do not.
// Reset a second time, for the difficulty-range work: `strike_ticks` lets a
// heavy weapon finish its swing, a shield has to be braced before it blocks
// well, a whiffed cut and a punished recovery both cost, regeneration is
// budgeted, and `Advance` is a patrol rather than a march into a wall. Every
// recorded run predating that is void, so this is a fresh number rather than a
// corrected one.
const GOLDEN_STATE_HASH: u64 = 0x1d8c_9607_975f_d859;

#[test]
fn golden_hash() {
    let (world, _, hashes) = run(&Scenario::skirmish(1234, 4, 6), 99);
    let hash = world.state_hash();
    println!(
        "golden state hash: 0x{hash:016x} after {} ticks",
        world.tick()
    );
    println!("tick 1 hash:       0x{:016x}", hashes[1]);
    if GOLDEN_STATE_HASH == 0 {
        println!(
            "GOLDEN_STATE_HASH is unset -- paste 0x{hash:016x} into \
             crates/sim/tests/determinism.rs to lock it in."
        );
    } else {
        assert_eq!(
            hash, GOLDEN_STATE_HASH,
            "simulation results changed; if that was intentional, update GOLDEN_STATE_HASH"
        );
    }
}

#[test]
fn a_run_actually_resolves_rather_than_timing_out() {
    // Guards the tests above from becoming vacuous: if every scenario ended in
    // a stalemate at tick 0, most of this file would still pass.
    let scenario = Scenario::skirmish(1234, 4, 6);
    let (world, replay, _) = run(&scenario, 99);
    assert!(
        world.outcome().is_some(),
        "the fight never resolved: {} ticks of a {} limit, {} heroes and {} monsters still up",
        world.tick(),
        scenario.max_ticks,
        world.alive_ids(Faction::Heroes).len(),
        world.alive_ids(Faction::Monsters).len(),
    );
    assert!(world.tick() > 30, "resolved suspiciously fast");
    assert!(replay.len() > 50, "hardly any decisions were made");
}
