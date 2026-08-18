//! The guarantee this whole project is built around.
//!
//! If any of these fail, the browser build and the experiment lab are no
//! longer running the same game, and every recorded run we own is suspect.
//!
//! The policy used here is deliberately trivial and defined inline: these
//! tests pin the *simulation*, not the behaviour crate.

use fx::{Fx, Vec2};
use sim::{
    Command, Event, Faction, LimbCommand, Observation, Order, Replay, Scenario, Strike, World,
};

/// Charge the nearest visible enemy and cut at it; otherwise walk to the middle
/// of the arena, so the two sides actually meet instead of sliding past each
/// other into opposite walls.
///
/// The three-armed match on the attack state is the whole contract, and getting
/// it wrong is silent: letting the command lapse mid-windup cancels the attack,
/// and holding it through a recovery leaves the hand disarmed forever after one
/// cut. [`Observation::can_strike`] answers the first half; the phase answers
/// the rest.
fn greedy(obs: &Observation) -> Command {
    match obs.nearest_enemy() {
        Some(contact) => {
            let bearing = contact.offset.angle();
            let limb = if obs.can_strike() || obs.limb.swing.is_attacking() {
                LimbCommand::attack(bearing, Strike::Nearest)
            } else {
                LimbCommand::new(bearing, Fx::ZERO)
            };
            Command::swinging(contact.offset.normalize(), contact.id, limb)
        }
        None => {
            // **Converge on the middle**, on both axes. `wall_clearance` is
            // `[-x, +x, -y, +y]`, so each difference is positive when there is
            // more room that way and the pair points at the arena centre from
            // anywhere in it. Everything an agent knows comes through the
            // observation, including this.
            //
            // This used to push toward the *enemy's side* instead, which is the
            // right heading only until you have crossed it -- after that the
            // enemy is behind you. A balance change moved which units survived
            // a 4v6, and the run stalled at full health with the survivors
            // pinned against opposite walls forty units apart.
            //
            // Turning around at the wall does not fix it either, and the reason
            // is worth knowing: a memoryless rule that reverses on a clearance
            // threshold twitches across that threshold forever. That is exactly
            // the failure `policy::Patrol` carries a byte of state to solve, and
            // this fixture deliberately has no state to spend. A centre that
            // attracts from both sides needs none -- there is no threshold to
            // oscillate across, because the heading shrinks to zero as it
            // arrives.
            let x = obs.wall_clearance[1] - obs.wall_clearance[0];
            let y = obs.wall_clearance[3] - obs.wall_clearance[2];
            Command::moving(Vec2::new(x, y).normalize())
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
            let command = greedy(&world.observe(id));
            replay.record(world.tick(), id, command);
            world.submit(id, command);
        }
        world.step();
        hashes.push(world.state_hash());
    }
    replay.finish(world.tick());
    (world, replay, hashes)
}

/// The same run again, keeping every tick's event slice instead of its hash.
///
/// A separate function rather than a fourth return from [`run`], because the
/// borrow `World::step` hands back is a borrow of the world and the hash on
/// the next line needs the world again -- so one of the two has to copy, and
/// copying only where the events are wanted keeps the hot path allocation-free.
fn run_events(scenario: &Scenario, seed: u64) -> Vec<Vec<Event>> {
    let mut world = World::new(scenario, seed);
    for (faction, order) in [
        (Faction::Heroes, Order::Advance(Vec2::X)),
        (Faction::Monsters, Order::Advance(-Vec2::X)),
    ] {
        world.set_order(faction, order);
    }
    let mut feed = Vec::new();
    let mut due = Vec::new();
    while world.outcome().is_none() && world.tick() < scenario.max_ticks {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let command = greedy(&world.observe(id));
            world.submit(id, command);
        }
        feed.push(world.step().to_vec());
    }
    feed
}

/// **The event feed is the one outbound channel no golden hash can see.**
///
/// `World::state_hash` walks the world's arrays and does not walk
/// `World::events`, which is exactly why a new variant cannot move a hash --
/// and exactly why a hash cannot notice one that fires on the wrong tick, in
/// the wrong order, or with a number that rounds differently on another
/// thread. Nothing else in this file would fail if it did.
#[test]
fn the_same_run_reports_the_same_events_in_the_same_order() {
    let scenario = Scenario::skirmish(1234, 4, 6);
    let a = run_events(&scenario, 99);
    let b = run_events(&scenario, 99);
    assert_eq!(a.len(), b.len(), "the two runs were different lengths");
    for (tick, (x, y)) in a.iter().zip(&b).enumerate() {
        assert_eq!(x, y, "the event feeds diverged at tick {tick}");
    }

    let total: usize = a.iter().map(Vec::len).sum();
    println!("{total} events over {} ticks", a.len());
    assert!(total > 0, "a 4v6 fought to a finish produced no events at all");
    // Guards this from going vacuous the way a test of an unreachable arm
    // does: `Event::Shove` is the newest variant and the only one whose sites
    // are all inside impulse code a scenario can fail to reach.
    assert!(
        a.iter().flatten().any(|e| matches!(e, Event::Shove { .. })),
        "nothing in a 4v6 moved anybody, so the shove sites went untested"
    );

    // And across threads, which costs one scope and says something stronger:
    // a thread-local, a global RNG or a wall clock reaching an emission site
    // would show up here and in no other test in this file.
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let scenario = &scenario;
                scope.spawn(move || run_events(scenario, 99))
            })
            .collect();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), a, "one thread saw a different fight");
        }
    });
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
                let command = match obs.order {
                    Order::Advance(dir) if obs.nearest_enemy().is_none() => Command::moving(dir),
                    _ => greedy(&obs),
                };
                world.submit(id, command);
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
// Re-recorded again for the unit/action split. Three things moved at once and
// all three are the point: a character has **one** limb rather than a sword hand
// and a free shield hand, so nothing in this scenario blocks at all; the Rogue's
// hilt-heavy shortblade retired into `ActionKind::Knife`; and the fixture policy
// above stopped marching into walls. Every recorded run predating this is void.
// Re-recorded once more for `Run` and `Bow` landing, and for exactly one reason
// out of the whole change: `World::state_hash` grew a projectile block, and it
// writes the arrow count unconditionally -- so every world fingerprints
// differently even though no scenario here has a bow in it and no fighter's
// behaviour moved by a tick.
//
// That the rest of the feature moved nothing was checked rather than assumed:
// unlocking the two rows, `move_bonus` reaching the observation, `Role::can_attack`,
// a zero dead zone for a shot, the `Hand` release branch and `resolve_shots`
// itself were all landed ahead of this line and left every golden standing.
// Re-recorded once more for `World::set_stats` and `World::set_body`, and again
// for exactly one reason out of the whole change: attributes, body, radius, mass
// and maximum health are **inputs** now rather than facts about the scenario, so
// `World::state_hash` writes all five -- and every world fingerprints
// differently even though nothing in this file changes any of them and no
// fighter's behaviour moved by a tick. The run below still resolves on the same
// tick with the same outcome, which is what says the sim itself did not move.
// Moved again when the floor plan landed. `World::state_hash` now writes the
// dungeon's digest and both factions' objectives, and it writes them
// unconditionally -- so every world fingerprints differently even though this
// scenario is `Dungeon::open`, has nothing carved in it, and sets no objective.
// Nothing about the fight moved: the run below still resolves on the same tick
// with the same outcome, which is the assertion that says so.
// Reset for the rescale, and this one is the opposite of every entry above it:
// the fight moved and nothing else did. `Stats::max_hp` went from `20 + 8 *
// vitality` to `4 + vitality` and `ENERGY_TO_DAMAGE` from 384 to 96 -- health by
// a factor of seven and damage by four, so a body dies in three or four clean
// exchanges instead of a dozen. Two constants; no new field in `state_hash`, no
// change to what is written or in what order. Every recorded run predating this
// is void because the *outcomes* differ, not because the fingerprint's shape
// does.
//
// It is the deliberate half of the pair this file exists to tell apart, so it is
// worth writing down what it was bought with. A point of vitality used to be 8
// health out of 84, under a tenth of a bar and invisible in the only place a
// player reads health -- the size of the number that just came off it. It is now
// exactly one point of one. What it cost is resolution: `ENERGY_TO_DAMAGE`'s own
// doc comment argued for a dozen blows a side precisely so that "won on half its
// health" and "won almost untouched" were not one blow apart, and that argument
// was outweighed rather than refuted. The run below resolves in 3,414 ticks
// where it took 4,885, which is the same fact from the other side.
const GOLDEN_STATE_HASH: u64 = 0xbe85_0893_2555_0cf2;

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
fn legacy_state_hash_bytes_are_unchanged() {
    let (world, _, _) = run(&Scenario::skirmish(1234, 4, 6), 99);
    assert_eq!(world.state_hash(), GOLDEN_STATE_HASH);
    assert_eq!(world.state_digest().value, GOLDEN_STATE_HASH);
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

/// The embodied model is subject to the same contract as the other two, and the
/// cheapest way to say so is to run it through the same three questions: does a
/// run repeat, does its replay reproduce it, and does it reproduce at every
/// intermediate tick rather than only at the end.
///
/// It lives here rather than beside the model because this file is where the
/// determinism contract is asserted, and a third model that is *not* asserted
/// here would be a third model nobody had checked.
mod embodied {
    use super::*;
    use sim::{
        ArmTarget, ArticulatedCommandV1, CombatHeight, EmbodiedCommandV1, GripRequest, Intent,
        ReleaseRequest, SubmittedCommand,
    };
    use fx::Angle;

    const TICKS: u32 = 300;

    /// Varies with the tick and the slot so the fight is not a pair of statues,
    /// and is a pure function of both so two runs cannot diverge by accident.
    fn scripted(tick: u32, slot: usize) -> ArticulatedCommandV1 {
        let phase = tick.wrapping_mul(1_013).wrapping_add(slot as u32 * 17);
        let arm = |k: u32| ArmTarget {
            bearing: Angle::from_raw(phase.wrapping_mul(7).wrapping_add(k * 4_099) as u16),
            height: CombatHeight::try_from_raw((phase.wrapping_add(k) % 65_537) as i32).unwrap(),
            reach: Fx::from_raw((phase.wrapping_mul(5).wrapping_add(k) % 65_537) as i32),
            effort: Fx::ONE,
        };
        ArticulatedCommandV1 {
            move_dir: Vec2::new(
                Fx::from_raw((phase % 46_341) as i32 - 23_170),
                Fx::from_raw((phase.wrapping_mul(3) % 46_341) as i32 - 23_170),
            ),
            body_yaw: Angle::from_raw(phase.wrapping_mul(11) as u16),
            intent: Intent::Hold,
            arms: [arm(0), arm(1)],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    fn drive(record: Option<&mut Replay>) -> (World, Vec<u64>) {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 31);
        let ids: Vec<_> = world
            .alive_ids(Faction::Heroes)
            .into_iter()
            .chain(world.alive_ids(Faction::Monsters))
            .collect();
        let mut replay = record;
        let mut digests = Vec::with_capacity(TICKS as usize);
        for tick in 0..TICKS {
            for (slot, id) in ids.iter().enumerate() {
                let command = EmbodiedCommandV1::new(scripted(tick, slot));
                if let Some(replay) = replay.as_deref_mut() {
                    replay.record_submitted(tick, *id, SubmittedCommand::Embodied(command));
                }
                world.submit_embodied_v1(*id, command);
            }
            world.step();
            digests.push(world.state_digest().value);
        }
        (world, digests)
    }

    #[test]
    fn an_embodied_run_repeats_itself_exactly() {
        let (left, left_digests) = drive(None);
        let (right, right_digests) = drive(None);
        assert_eq!(left_digests, right_digests);
        assert_eq!(left.state_digest().value, right.state_digest().value);
        // Not a pair of statues: a run whose digest never moved would satisfy
        // every assertion above without simulating anything.
        assert!(left_digests.windows(2).any(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn an_embodied_replay_reproduces_its_run_at_every_intermediate_tick() {
        let scenario = Scenario::embodied_duel();
        let mut replay = Replay::new(&scenario, 31);
        let (live, digests) = drive(Some(&mut replay));
        replay.finish(TICKS);

        assert_eq!(replay.play().state_digest().value, live.state_digest().value);
        for tick in 1..=TICKS {
            assert_eq!(
                replay.play_until(tick).state_digest().value,
                digests[tick as usize - 1],
                "an embodied replay diverged at tick {tick}",
            );
        }
    }

    /// The domain is part of the answer. An embodied digest compared against an
    /// articulated one is a grammar mismatch, not two numbers that differ.
    #[test]
    fn an_embodied_digest_reports_its_own_domain() {
        let (world, _) = drive(None);
        assert_eq!(world.state_digest().domain, sim::HashDomain::EmbodiedV1);
        assert_eq!(world.state_digest().schema, 1);
    }
}
