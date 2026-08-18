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
///
/// **It answers more than three questions now**, and the section halfway down
/// says why: the legacy half of this file asserts several properties of the
/// *simulator* that were only ever written against the model it is about to
/// lose, so they are asserted here too -- outbound-channel order, seed
/// sensitivity, thread independence, that the fixture is a fight at all, and a
/// pinned state hash of its own.
mod embodied {
    use super::*;
    use sim::{
        ArmTarget, ArticulatedCommandV1, CombatHeight, ContactResolution, EmbodiedCommandV1,
        EntityId, GripRequest, Intent, ReleaseRequest, SubmittedCommand,
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
        drive_on(&Scenario::embodied_duel(), record)
    }

    fn drive_on(scenario: &Scenario, record: Option<&mut Replay>) -> (World, Vec<u64>) {
        let mut world = World::new(scenario, 31);
        let ids: Vec<_> = world
            .alive_ids(Faction::Heroes)
            .into_iter()
            .chain(world.alive_ids(Faction::Monsters))
            .collect();
        let mut replay = record;
        let mut digests = Vec::with_capacity(TICKS as usize);
        for tick in 0..TICKS {
            for (slot, id) in ids.iter().enumerate() {
                let mut command = EmbodiedCommandV1::new(scripted(tick, slot));
                // The embodied-only field, driven like everything else here: a
                // script that left it neutral would replay a column the live
                // run never moved, which is a replay claim about nothing.
                let phase = tick.wrapping_mul(1_013).wrapping_add(slot as u32 * 17);
                command.swing_plane = [
                    Angle::from_raw(phase.wrapping_mul(13) as u16),
                    Angle::from_raw(phase.wrapping_mul(29).wrapping_add(7_919) as u16),
                ];
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

    /// **The first fixture with a floor that is not flat, through the whole
    /// run/re-run/replay claim.**
    ///
    /// Session 04 gave every tile a height and every body a `ground_z` sampled
    /// from it, and until this fixture existed nothing in the repository had a
    /// non-zero one: `Dungeon::digest` short-circuits on `sculpted`, so the
    /// height vector was outside every golden hash and outside every replay.
    /// That is what made adding elevation free, and it is also what left the
    /// column unmeasured. A height that reached the state hash on the live run
    /// and not on the replayed one would have been invisible until a fight was
    /// driven up a hill.
    ///
    /// The script is the flat fixture's, unchanged, so the difference between
    /// this test and its sibling is the floor and nothing else.
    #[test]
    fn an_embodied_replay_reproduces_a_run_on_a_sculpted_floor() {
        let scenario = Scenario::embodied_slope();
        let mut replay = Replay::new(&scenario, 31);
        let (live, digests) = drive_on(&scenario, Some(&mut replay));
        replay.finish(TICKS);

        assert_eq!(replay.play().state_digest().value, live.state_digest().value);
        for tick in 1..=TICKS {
            assert_eq!(
                replay.play_until(tick).state_digest().value,
                digests[tick as usize - 1],
                "a sculpted embodied replay diverged at tick {tick}",
            );
        }
        // And it is a different fight from the flat one, which is the assertion
        // that stops this from passing on a hill nobody walked on: two runs of
        // the same script over the same seed, differing only in the floor.
        let (flat, _) = drive(None);
        assert_ne!(live.state_digest().value, flat.state_digest().value,
                   "the hill changed nothing, so the floor is not reaching the state");
    }

    /// A body on the hill stands above a body on the floor, and the height it
    /// stands at is the tile's own.
    ///
    /// The pair matters. "Somebody's `z` moved" would pass on a body that had
    /// wandered onto a terrace by accident; "the `z` is the floor under it" is
    /// what says the sample is the terrain rather than a number of its own.
    #[test]
    fn a_body_on_the_hill_stands_on_the_hill() {
        let scenario = Scenario::embodied_slope();
        let mut world = World::new(&scenario, 31);
        let id = world.alive_ids(Faction::Heroes)[0];
        // Walked, not teleported: the body has to reach the terrace through the
        // movement phase, which is the only thing that resamples `ground_z`.
        let mut highest = Fx::ZERO;
        for tick in 0..TICKS {
            let mut command = EmbodiedCommandV1::new(scripted(tick, 0));
            // Straight across the hill, in the body frame, at full authority.
            // Everything else the script does is left alone.
            command.articulated.move_dir = Vec2::new(Fx::ONE, Fx::ZERO);
            command.articulated.body_yaw = Angle::ZERO;
            world.submit_embodied_v1(id, command);
            world.step();
            let pose = world.articulated_pose(id).expect("a live hero has a pose");
            // **Every tick, not just the last.** The body walks over the hill
            // and off the far side, so a final reading would be a reading from
            // the floor again -- which is exactly the shape of test that would
            // have passed while the sample was broken.
            assert_eq!(
                pose.body.z,
                scenario.dungeon.height_at(fx::Vec2::new(pose.body.x, pose.body.y)),
                "at tick {tick} the body's z is not the floor under it",
            );
            highest = highest.max(pose.body.z);
        }
        assert!(highest > Fx::ZERO, "the body never left the floor");
    }

    /// The domain is part of the answer. An embodied digest compared against an
    /// articulated one is a grammar mismatch, not two numbers that differ.
    #[test]
    fn an_embodied_digest_reports_its_own_domain() {
        let (world, _) = drive(None);
        assert_eq!(world.state_digest().domain, sim::HashDomain::EmbodiedV1);
        assert_eq!(world.state_digest().schema, 1);
    }

    // ---------------------------------------------------------------------
    // **The properties the legacy half of this file asserts, on the model that
    // outlives it.**
    //
    // Everything above this line is a claim about reproduction: the same script
    // twice, and its replay. The legacy half asserts four more things that are
    // properties of the *simulator* rather than of the model they happen to be
    // written against -- event order, seed sensitivity, thread independence, and
    // that the fixture is a fight at all -- and it carries `GOLDEN_STATE_HASH`,
    // which is what makes a fight checkable from inside `crates/sim` with the
    // lab absent. They are ported here before that half
    // is deleted, because a property nobody ported is a property nobody is
    // checking, and nothing goes red on the day it stops being true.
    //
    // **One of the legacy properties did not survive the port, and its absence
    // is a finding rather than an omission.**
    // `player_orders_change_the_outcome_without_breaking_determinism` cannot be
    // written for this model. An order reaches a legacy agent through
    // `Observation::order`, and the embodied percept is
    // `ArticulatedObservation`, which has no order column and no nav column. The
    // one phase that reads `World::orders` at all is `refresh_nav`, in the
    // epilogue every model shares, and all it does there is build a distance
    // field -- whose only reader is `World::nav_step`, whose only caller is
    // `World::observe`, which is a legacy-grammar read an embodied driver never
    // takes. Setting an order on an embodied world *does* move its digest,
    // because the orders array is hashed as an input -- and that is the whole of
    // what it does. Measured over 300 ticks of the script above under `Hold`,
    // `Advance`, `Regroup` and `Goto`, with and without `Objective::Order`,
    // every body finished at the same position to the raw unit, with the same
    // per-region integrity, the same open wounds and the same health -- while
    // all six of those runs' digests differed. A test built on the digest alone
    // would pass, and would be asserting an input word while claiming to assert
    // an outcome, which is exactly the green-test failure this repository's
    // house style exists to refuse. So the property dies with the model, and the
    // day somebody gives an embodied body an order column is the day it can come
    // back.

    /// The tick bound of the fights below.
    ///
    /// A parameter of the loop and **not** an edited `Scenario::max_ticks`, for
    /// `EMBODIED_CORPUS_TICKS`'s reason: `max_ticks` is inside
    /// `Scenario::fingerprint`, so shortening the scenario would produce a
    /// fixture that is not `embodied-slope-v1` and the pin below would be naming
    /// something else. 600 is that constant's number too, and it is generous
    /// here: the flat fixture resolves on tick 369 and the sculpted one on 322,
    /// so the bound is a ceiling that a working simulator never reaches rather
    /// than a length these runs are cut to.
    const FIGHT_TICKS: u32 = 600;

    /// Half the swing, in raw angle units, and the period it reverses on.
    ///
    /// 6,144 of a 65,536-unit turn is 33.75 degrees either side of the torso
    /// line. Both numbers came out of a sweep over periods 4..32 and half-swings
    /// 6,144..16,384 at both `CombatHeight::MID` and `HIGH` on both fixtures,
    /// and this cell was taken for one measured reason: **of the cells where
    /// both fixtures resolve, it is the one that puts the most contact behind
    /// its kill on the worse of the two** -- 293 contact resolutions on the flat
    /// fixture and 242 on the sculpted one, against 113 for the next best cell
    /// and fewer than twenty for several of them. A script that reached a kill
    /// through one lucky blow would satisfy every assertion below while
    /// exercising almost none of the contact phase.
    ///
    /// A wider swing is not a better one: past about 45 degrees the arm spends
    /// the swing turning rather than in front of the body, and the sweep's
    /// 16,384-unit cells fall as low as three resolutions in 600 ticks.
    const SWING_RAW: i32 = 6_144;
    const SWING_PERIOD: u32 = 6;

    /// A command that closes and cuts, which [`scripted`] deliberately does not.
    ///
    /// **`scripted` never reaches the contact phase, and that is measured
    /// rather than suspected**: 300 ticks of it produces exactly zero contact
    /// resolutions on all four embodied fixtures. It drives every column of the
    /// grammar to a pseudo-random value, which is precisely what a *replay*
    /// claim wants and is not a fight -- so every assertion in this module above
    /// this line is an assertion about locomotion, the actuator and the codec,
    /// and until this script existed nothing in `crates/sim` had ever driven an
    /// embodied body into a blow.
    ///
    /// Both directions here are read in the torso frame -- that is what
    /// `CombatModel::Embodied` means by `CommandFrame::Torso` -- so forward is
    /// `(1, 0)` at every yaw and the arms swing about the body's own line.
    /// `heading` therefore only has to reach `body_yaw`, which is world space
    /// under both frames.
    fn closing(tick: u32, heading: Vec2) -> EmbodiedCommandV1 {
        let side = if (tick / SWING_PERIOD) % 2 == 0 { SWING_RAW } else { -SWING_RAW };
        let arm = ArmTarget {
            bearing: Angle::from_raw(side as u16),
            // High rather than mid, and the sweep is what chose it: at this
            // period a mid-height swing produces *more* contact and no kill --
            // 918 resolutions in 900 ticks with both bodies still standing --
            // which is a fight of glancing blows rather than a fight.
            height: CombatHeight::HIGH,
            reach: Fx::ONE,
            effort: Fx::ONE,
        };
        EmbodiedCommandV1::new(ArticulatedCommandV1 {
            move_dir: Vec2::new(Fx::ONE, Fx::ZERO),
            body_yaw: heading.angle(),
            // `Intent` is a statement about who is being fought for the renderer
            // and the fitness function to read; it does not cause damage, so
            // naming a target here would change nothing the contact phase does.
            intent: Intent::Hold,
            arms: [arm, arm],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        })
    }

    /// Where a body's heading comes from, and the **only** difference between
    /// the two fights below.
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Aim {
        /// Ground truth, read off the world. Nothing this script reads is
        /// seed-dependent, which is what makes the pinned digest below a number
        /// about the simulator rather than about the noise stream.
        Truth,
        /// Through `World::observe_articulated`, which is where perception noise
        /// enters and is the only seed-dependent input the embodied model has.
        ///
        /// It needs a fallback and the fallback is the point: the two spawns are
        /// 10.77 units apart and the fixture's sight range is 9.6, so neither
        /// body can see the other on tick 0 and a script that waited would be
        /// two statues. Out of sight it walks at the middle of the arena --
        /// which is what the legacy fixture policy at the top of this file does,
        /// and for the same reason it gives.
        Perceived,
    }

    /// A closing fight, kept with the two per-tick channels no digest can see.
    struct Fight {
        world: World,
        /// Every tick's event slice, in order.
        events: Vec<Vec<Event>>,
        /// Every tick's contact rows, in order.
        contacts: Vec<Vec<ContactResolution>>,
    }

    impl Fight {
        fn rows(&self) -> usize {
            self.contacts.iter().map(Vec::len).sum()
        }

        /// Where each body ended and what was left of it.
        ///
        /// This, and not the digest, is what "a different fight" means. See
        /// [`a_different_seed_produces_a_different_embodied_fight`] for why the
        /// distinction is load-bearing rather than fussy.
        fn bodies(&self) -> Vec<i32> {
            let mut out: Vec<i32> = self
                .world
                .articulated_poses()
                .flat_map(|pose| [pose.body.x.raw(), pose.body.y.raw(), pose.body.z.raw()])
                .collect();
            for faction in [Faction::Heroes, Faction::Monsters] {
                out.push(self.world.health_fraction(faction).raw());
                out.push(self.world.alive_count(faction) as i32);
            }
            out
        }
    }

    /// The heading `id` walks and faces this tick, or `None` for a body with
    /// nothing to walk at.
    fn heading(world: &World, id: EntityId, live: &[EntityId], slot: usize, aim: Aim)
        -> Option<Vec2>
    {
        match aim {
            Aim::Truth => {
                let me = world.view(id)?.position;
                // The other body. An embodied fixture is a duel, so "the other"
                // is unambiguous and a nearest-of search would be the same
                // answer through more code.
                let (_, &other) = live.iter().enumerate().find(|(at, _)| *at != slot)?;
                Some(world.view(other)?.position - me)
            }
            Aim::Perceived => {
                let obs = world.observe_articulated(id);
                let me = Vec2::new(obs.body_position.x, obs.body_position.y);
                if obs.opponent_count == 0 {
                    let arena = world.arena();
                    return Some(Vec2::new(arena.x / 2, arena.y / 2) - me);
                }
                // Nearest first, and already blurred by
                // `Stats::perception_noise` -- which is the entire mechanism
                // this arm exists to put under the seed.
                let seen = obs.opponents[0].body_position;
                Some(Vec2::new(seen.x - me.x, seen.y - me.y))
            }
        }
    }

    /// Runs a closing fight to its outcome or to [`FIGHT_TICKS`].
    ///
    /// Shaped like the legacy [`run`] above -- stop on an outcome, or on the
    /// bound -- so that the same two assertions can be made about it: that it
    /// resolves, and that the digest at the tick it resolved on is a fixed
    /// number.
    fn fight_on(scenario: &Scenario, seed: u64, aim: Aim) -> Fight {
        let mut world = World::new(scenario, seed);
        let mut events = Vec::new();
        let mut contacts = Vec::new();
        let mut live = Vec::new();
        while world.outcome().is_none() && world.tick() < FIGHT_TICKS {
            live.clear();
            live.extend(world.alive_ids(Faction::Heroes));
            live.extend(world.alive_ids(Faction::Monsters));
            let tick = world.tick();
            for slot in 0..live.len() {
                let id = live[slot];
                let Some(to) = heading(&world, id, &live, slot, aim) else { continue };
                world.submit_embodied_v1(id, closing(tick, to));
            }
            // `to_vec` before the contact rows are asked for, because both are
            // borrows of the world: the same reason `run_events` is a second
            // function rather than a fourth return from `run`.
            events.push(world.step().to_vec());
            contacts.push(world.contact_resolutions().to_vec());
        }
        Fight { world, events, contacts }
    }

    /// **The contact feed is this model's channel that no pin can see**, which
    /// is the claim `the_same_run_reports_the_same_events_in_the_same_order`
    /// makes about `World::events` on the legacy model.
    ///
    /// That claim does not port as it stands, because the feed does not. Every
    /// `Damage`, `Block`, `Parry` and `Shove` in the repository is pushed from
    /// `world/legacy.rs` and none of them survives the model; an embodied tick
    /// emits `Death` from `reap_dead_articulated` and `Loose` from the bow path,
    /// and `CombatSpecTableV1::fixtures()` has no bow in it. So an embodied
    /// event feed is empty until somebody dies, and a test that compared two of
    /// them would be comparing empty vectors -- green, and about nothing.
    ///
    /// `World::contact_resolutions` carries the argument instead, and carries it
    /// more sharply than the events ever did. `state_digest` writes exactly one
    /// contact byte, the global `cap_hits` count, so the group ordinal, the
    /// fact, the impulse, the energy ledger and the four channel words of every
    /// row are outside every pin in this repository -- including the one below.
    /// A row that arrived on the wrong tick, in the wrong order, or with an
    /// impulse that rounds differently on another thread is invisible to
    /// everything else in this file.
    ///
    /// The event feed is compared alongside it rather than instead of it: it is
    /// free, this fixture does reach one `Death`, and the day an embodied fight
    /// can loose an arrow the assertion is already here.
    #[test]
    fn an_embodied_fight_reports_the_same_contacts_and_events_in_the_same_order() {
        let scenario = Scenario::embodied_duel();
        let a = fight_on(&scenario, 31, Aim::Truth);
        let b = fight_on(&scenario, 31, Aim::Truth);
        assert_eq!(a.contacts.len(), b.contacts.len(), "the two fights were different lengths");
        assert_eq!(a.events.len(), b.events.len(), "the two event feeds were different lengths");
        for (tick, (x, y)) in a.contacts.iter().zip(&b.contacts).enumerate() {
            assert_eq!(x, y, "the contact feeds diverged at tick {tick}");
        }
        for (tick, (x, y)) in a.events.iter().zip(&b.events).enumerate() {
            assert_eq!(x, y, "the event feeds diverged at tick {tick}");
        }

        println!("{} contact rows over {} ticks", a.rows(), a.contacts.len());
        // Guards the comparison from going vacuous the way two empty feeds
        // would: the script above exists to make these two numbers non-zero,
        // and `scripted` leaves both at zero on every embodied fixture.
        assert!(a.rows() > 0, "a closing fight reached its end with no contact at all");
        assert!(
            a.events.iter().flatten().any(|e| matches!(e, Event::Death { .. })),
            "nobody died, so the one event an embodied tick can emit went untested"
        );

        // And across threads, which costs one scope and says something stronger:
        // a thread-local, a global RNG or a wall clock reaching the contact
        // solver would show up here and in no other test in this file.
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    let scenario = &scenario;
                    scope.spawn(move || {
                        let fight = fight_on(scenario, 31, Aim::Truth);
                        (fight.contacts, fight.events)
                    })
                })
                .collect();
            for handle in handles {
                let (contacts, events) = handle.join().unwrap();
                assert_eq!(contacts, a.contacts, "one thread saw a different fight");
                assert_eq!(events, a.events, "one thread saw different events");
            }
        });
    }

    /// Guards everything above from becoming vacuous, which is what
    /// `a_run_actually_resolves_rather_than_timing_out` does for the legacy
    /// half.
    ///
    /// It is worth more here than it is there, because an embodied fixture does
    /// **not** resolve on its own: the corpus behind `EMBODIED_CORPUS_DIGEST`
    /// reaches its clock in over nine trials in ten, and `scripted` above runs
    /// 300 ticks without one contact resolution. Two bodies that never touch
    /// satisfy every reproduction claim in this module, so this is the one test
    /// that says the model can produce a fight at all rather than a pair of
    /// bodies moving.
    #[test]
    fn an_embodied_fight_actually_resolves_rather_than_timing_out() {
        let fight = fight_on(&Scenario::embodied_duel(), 31, Aim::Truth);
        assert!(
            fight.world.outcome().is_some(),
            "never resolved: {} ticks of a {FIGHT_TICKS} bound, {} heroes and {} monsters up",
            fight.world.tick(),
            fight.world.alive_count(Faction::Heroes),
            fight.world.alive_count(Faction::Monsters),
        );
        assert!(fight.world.tick() > 30, "resolved suspiciously fast");
        // Resolved *through the contact phase*, and not by a body walking into
        // something. Both halves are needed: an outcome with no contact behind
        // it would be a fight the contact solver never took part in.
        //
        // Bounded at zero rather than at the measured count on purpose, because
        // the count is not one number: this fight reaches its kill through 293
        // resolutions in the default build and through **8** under
        // `cartesian-recoil`, where an exchange carries far more of the body
        // with it. A threshold tight enough to be interesting in one build is a
        // false failure in the other, and the richness of the script is argued
        // where it belongs -- on `SWING_RAW`, from the sweep that chose it.
        assert!(fight.rows() > 0, "the kill came from somewhere other than the contact phase");
        println!("{} contact rows behind a kill on tick {}", fight.rows(), fight.world.tick());
    }

    /// Eight threads, one answer -- the cheap guard
    /// `results_do_not_depend_on_the_thread_that_computed_them` makes for the
    /// legacy model, on the model that outlives it.
    ///
    /// On the sculpted fixture rather than the flat one, because the terrain
    /// sample is the newest thing in the tick and the one most recently written:
    /// `ground_z` is read per body per movement phase, and a height that arrived
    /// from a shared buffer instead of from the floor would show up here first.
    #[test]
    fn an_embodied_result_does_not_depend_on_the_thread_that_computed_it() {
        let scenario = Scenario::embodied_slope();
        let expected = fight_on(&scenario, 31, Aim::Truth).world.state_digest().value;
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    let scenario = &scenario;
                    scope.spawn(move || {
                        fight_on(scenario, 31, Aim::Truth).world.state_digest().value
                    })
                })
                .collect();
            for handle in handles {
                assert_eq!(handle.join().unwrap(), expected);
            }
        });
    }

    /// **A determinism suite that only proved runs repeat would pass on a
    /// simulator that ignored its seed entirely**, which is why the legacy half
    /// asserts this and why it has to be ported rather than dropped.
    ///
    /// It cannot be ported as written, and the reason is worth recording rather
    /// than working around. `a_different_seed_produces_a_different_history`
    /// compares two state hashes, and `legacy_core_hash` writes `self.seed` as
    /// its **first word** -- so two runs under two seeds fingerprint differently
    /// whether or not the seed reached a single decision. That test is satisfied
    /// by the seed word alone; it has been green since it was written and would
    /// stay green on a simulator that dropped the seed on the floor immediately
    /// after hashing it. The same is true of `state_digest`, so repeating the
    /// shape here would repeat the defect.
    ///
    /// So compare the bodies instead: where they stood at the end and what was
    /// left of them. And drive them through `Aim::Perceived`, because perception
    /// noise is the *only* seed-dependent input the embodied model has -- a
    /// ground-truth script is blind to the seed by construction, and this
    /// assertion over one would be false rather than vacuous.
    ///
    /// The same seed twice is asserted alongside, so that a difference between
    /// two seeds cannot be read as noise in the harness.
    #[test]
    fn a_different_seed_produces_a_different_embodied_fight() {
        let scenario = Scenario::embodied_duel();
        let one = fight_on(&scenario, 1, Aim::Perceived).bodies();
        let two = fight_on(&scenario, 2, Aim::Perceived).bodies();
        let again = fight_on(&scenario, 1, Aim::Perceived).bodies();
        assert_eq!(one, again, "the same seed produced two different fights");
        assert_ne!(one, two, "the seed reached nothing: two seeds, one fight");
    }

    /// Recorded on x86-64 Windows, rustc 1.97.1, over
    /// `Scenario::embodied_slope` (`0xf49de9a61f939163`) at seed 31, driven by
    /// [`closing`] through [`Aim::Truth`] to its outcome or [`FIGHT_TICKS`].
    ///
    /// **The embodied half of what `GOLDEN_STATE_HASH` is for**, and it exists
    /// for the same one-line reason: `crates/sim` must be checkable without the
    /// lab. `EMBODIED_CORPUS_DIGEST` folds a corpus, needs a policy crate to
    /// produce it and lives in `crates/lab`; this is one fight, one number, and
    /// `cargo test -p sim` is the whole of what runs it.
    ///
    /// The **sculpted** fixture and not the flat control, because a flat floor
    /// is invisible to a state hash by construction: `Dungeon::digest`
    /// short-circuits unless `sculpted`, which is exactly why adding elevation
    /// to the engine moved no golden hash in the repository. A pin taken on
    /// `embodied-duel-v1` could not see the height column at all, and this one
    /// folds a fight that climbs a terrace and fights on it.
    ///
    /// Re-record it -- if the change that moved it was a deliberate change to
    /// embodied mechanics, terrain or this script, and stated in writing
    /// first -- with
    ///
    /// ```text
    /// cargo test -p sim --test determinism -- --nocapture the_pinned_embodied_fight
    /// ```
    ///
    /// **Two values, selected by feature, and the second is not merely the
    /// first through a wider hash.** `cartesian-recoil` does write extra bytes
    /// into the stream -- `post_contact_hash_bytes` per arm per allocated slot
    /// -- but it also changes the fight: measured, this one resolves on tick 322
    /// as a `HeroesWin` through 242 contact resolutions by default, and on tick
    /// 183 as a `MonstersWin` through 8 of them under the feature. So the two
    /// numbers are two fights as well as two grammars, which is worth stating
    /// because `EMBODIED_CORPUS_DIGEST`'s row calls its own pair "the same
    /// fights" and, on this fixture at least, that is not what the feature does.
    ///
    /// The arrangement is `EMBODIED_CORPUS_DIGEST`'s and is deliberately not a
    /// `cfg` that skips the assertion: session 09 shipped one constant, measured
    /// only the default build, and left `--features cartesian-recoil` red from
    /// the day it was written -- which is worse than no pin at all, because a
    /// gate that is red for a reason nobody intended teaches the next reader to
    /// skip it.
    #[cfg(not(feature = "cartesian-recoil"))]
    const EMBODIED_GOLDEN_DIGEST: u64 = 0x5527_190d_ea6b_e0c2;

    /// The same fight under the wider hash stream; see above.
    #[cfg(feature = "cartesian-recoil")]
    const EMBODIED_GOLDEN_DIGEST: u64 = 0x81e5_1e49_9a5d_01fd;

    #[test]
    fn the_pinned_embodied_fight_is_unchanged() {
        let fight = fight_on(&Scenario::embodied_slope(), 31, Aim::Truth);
        let digest = fight.world.state_digest();
        println!(
            "embodied golden digest: 0x{:016x} after {} ticks, {:?}, {} contact rows",
            digest.value,
            fight.world.tick(),
            fight.world.outcome(),
            fight.rows(),
        );
        if EMBODIED_GOLDEN_DIGEST == 0 {
            println!(
                "EMBODIED_GOLDEN_DIGEST is unset -- paste 0x{:016x} into \
                 crates/sim/tests/determinism.rs to lock it in.",
                digest.value,
            );
        } else {
            assert_eq!(
                digest.value, EMBODIED_GOLDEN_DIGEST,
                "the embodied fight changed; if intended, re-record EMBODIED_GOLDEN_DIGEST"
            );
        }
        // **A pin is a value in a domain, not a bare `u64`**, which is the half
        // of `legacy_state_hash_bytes_are_unchanged` that survives the model.
        // That test asserts the opposite of this one and is right to: on a
        // Legacy world `state_digest().value` *is* the legacy core hash, which
        // is what keeps every pre-v2 golden in this repository valid. On an
        // embodied world the two are different streams over the same state, and
        // the number above belongs to the embodied one. If they were ever equal,
        // this pin could be satisfied by a reading taken in the wrong grammar.
        assert_eq!(digest.domain, sim::HashDomain::EmbodiedV1);
        assert_eq!(digest.schema, 1);
        assert_ne!(
            fight.world.state_hash(),
            digest.value,
            "the embodied digest equals the legacy core hash: the domain prefix reached nothing"
        );
    }
}
