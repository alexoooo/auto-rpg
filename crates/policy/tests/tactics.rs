//! The strike planner behind the embodied seam: the frame conversion, and the
//! four claims that are about a *fight* rather than about a function.
//!
//! The first three tests are the adapter's whole subject. `into_torso_frame` is
//! four lines and every one of them is a sign, so the tests are written to fail
//! on a sign rather than on a shape: the load-bearing assertion is always "the
//! world re-adds what this subtracted and lands back on the plan", never "the
//! two commands differ", which is true of the wrong version too.
//!
//! The remaining four are `tests/script.rs`'s claims made again for
//! this policy, and they are made again rather than shared because they are
//! claims about *this* mind: a refused submission stores the neutral command, so
//! a policy whose torso frame were wrong would produce a clean, reproducible run
//! of two bodies standing still and every other test here would pass.

use fx::{Angle, Fx, Vec2};
use policy::{
    into_torso, into_torso_frame, neutral_world_command, neutral_command,
    Policy, TacticalPolicy,
};
use sim::{
    ArmTarget, CommandCoreV1, Observation, CombatHeight, EntityId, Faction,
    GripRequest, Intent, ReleaseRequest, Replay, Scenario, SubmitOutcome,
    SubmittedCommand, World,
};

/// Long enough for both bodies to cross the gap and fight, and short enough that
/// the file stays inside a second. `tests/script.rs`'s number.
const TICKS: u32 = 1_800;

/// The forward rotation `World::world_move_dir` applies, reading a walk vector
/// in the body frame -- `crates/sim/src/world/mod.rs`, named rather than line
/// anchored because session 05 moved every line in that file.
///
/// **Written out here because the claim under test is that `into_torso` is its
/// inverse, and an inverse needs both halves in the room.** A test that called
/// `into_torso` twice with opposite yaws would agree with itself no matter which
/// sign the file carried.
fn into_world(v: Vec2, yaw: Angle) -> Vec2 {
    let (cos, sin) = (yaw.cos(), yaw.sin());
    Vec2::new(v.x * cos - v.y * sin, v.x * sin + v.y * cos)
}

/// A real observation of a real body, with one column overwritten.
///
/// `into_torso_frame` reads exactly one field, so a fabricated yaw on an
/// otherwise authentic observation is the whole input space -- and it is the
/// only way to ask the question at a yaw the spawn does not offer. The rest of
/// the observation is left as the world published it rather than blanked,
/// because a blank one has `body_yaw == Angle::ZERO` and zero is the yaw at
/// which every wrong sign is right.
fn observation_at(yaw: Angle) -> Observation {
    let scenario = Scenario::embodied_duel();
    let world = World::new(&scenario, 11);
    let mut obs = world.observe(world.alive_ids(Faction::Heroes)[0]);
    assert!(obs.present(), "the fixture must publish a live body to read a yaw off");
    obs.body_yaw = yaw;
    obs
}

/// A world-frame command with nothing symmetric in it.
///
/// Every column is distinct from every other, and no bearing is zero, a quarter
/// or a half turn: a plan built out of round angles is one a sign error can land
/// on by accident.
fn world_plan() -> CommandCoreV1 {
    CommandCoreV1 {
        move_dir: Vec2::new(Fx::from_ratio(3, 5), Fx::from_ratio(-1, 4)),
        body_yaw: Angle::from_degrees(211),
        intent: Intent::Hold,
        arms: [
            ArmTarget {
                bearing: Angle::from_degrees(37),
                height: CombatHeight::MID,
                reach: Fx::from_ratio(3, 4),
                effort: Fx::from_ratio(1, 2),
            },
            ArmTarget {
                bearing: Angle::from_degrees(298),
                height: CombatHeight::HIGH,
                reach: Fx::from_ratio(1, 3),
                effort: Fx::from_ratio(7, 8),
            },
        ],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

fn assert_near(measured: Vec2, expected: Vec2, tolerance: i32, what: &str) {
    let dx = (measured.x.raw() - expected.x.raw()).abs();
    let dy = (measured.y.raw() - expected.y.raw()).abs();
    assert!(
        dx <= tolerance && dy <= tolerance,
        "{what}: {measured:?} is {dx},{dy} raw units from {expected:?}, over {tolerance}",
    );
}

/// **The rotation is a rotation, and it turns the way the world turns back.**
///
/// Exact equality is not available and is not what the property is: a 16.16
/// vector rotated through a table-interpolated sine and rotated back cannot
/// return the same bits, and demanding it would be demanding infinite precision
/// from a fixed-point cosine. Four raw units is `6e-5` world units, which is
/// three orders of magnitude below the arm's reach quantisation, and the bound
/// is stated from **both** sides: the round trip must land inside it, and the
/// half-way point must land outside it, or the test would be satisfied by
/// `into_torso` returning its argument.
#[test]
fn a_world_vector_survives_the_round_trip() {
    let vectors = [
        Vec2::new(Fx::ONE, Fx::ZERO),
        Vec2::new(Fx::ZERO, -Fx::ONE),
        Vec2::new(Fx::from_ratio(3, 5), Fx::from_ratio(-1, 4)),
        Vec2::new(Fx::from_ratio(-7, 16), Fx::from_ratio(11, 16)),
    ];
    for degrees in [7, 37, 90, 151, 211, 298, 359] {
        let yaw = Angle::from_degrees(degrees);
        for v in vectors {
            let torso = into_torso(v, yaw);
            assert_near(into_world(torso, yaw), v, 4, &format!("round trip at {degrees}deg"));
            // The half-way point: a torso vector that equalled its world vector
            // would make the round trip pass for free.
            let dx = (torso.x.raw() - v.x.raw()).abs();
            let dy = (torso.y.raw() - v.y.raw()).abs();
            assert!(
                dx > 4 || dy > 4,
                "into_torso left {v:?} where it was at {degrees}deg, so the round trip proves nothing",
            );
        }
    }
    // And the one yaw at which it must be the identity, which is what says the
    // rotation is measured from the body's facing and not from something else.
    for v in vectors {
        assert_eq!(into_torso(v, Angle::ZERO), v, "a body facing east is already in world space");
    }
}

/// The cheapest check on the sign: `neutral_world_command` writes
/// `bearing: obs.body_yaw` and `neutral_command` writes `Angle::ZERO`,
/// so subtracting `obs.body_yaw` maps one onto the other to the bit.
///
/// **This test passes under the wrong subtrahend, and that is why the next one
/// has to exist.** The wrong version of the adapter reads
/// `CommandCoreV1::body_yaw` -- the yaw the command *requests* -- instead
/// of `Observation::body_yaw`, the yaw the body is holding when the
/// world re-adds it. A neutral command sets `body_yaw: obs.body_yaw`, so the two
/// subtrahends are the same number here and no fixture built out of neutral
/// commands can ever separate them. What separates them is a command that asks
/// for a *turn*, which is what `the_same_plan_at_two_yaws...` supplies. Nobody
/// should read this test as cover for the sign.
///
/// Demonstrated rather than argued, on 2026-08-18: with `let facing =
/// world.body_yaw;` in `into_torso_frame`, this test passes and
/// `the_same_plan_at_two_yaws...` fails on its very first assertion -- the two
/// yaws produce the *same* torso bearing, because the subtrahend no longer
/// depends on the observation at all.
#[test]
fn the_neutral_articulated_command_converts_to_the_neutral_embodied_command_exactly() {
    for degrees in [0, 7, 90, 211, 359] {
        let obs = observation_at(Angle::from_degrees(degrees));
        assert_eq!(
            into_torso_frame(&obs, neutral_world_command(&obs)).payload_bytes(),
            neutral_command(&obs).payload_bytes(),
            "the neutral round trip is not exact at {degrees}deg",
        );
    }
}

/// **The test that carries the session.**
///
/// `the_same_situation_at_two_yaws_produces_one_command` asserts the opposite
/// shape of the same fact for the script: a torso-relative policy answering one
/// command at two yaws. Here the input is one *world* plan and the output must be
/// two **different** torso commands that name the **same** world bearing, which
/// is what says the subtraction happened in the right place and with the right
/// sign.
///
/// The assertion that carries it is the re-add, not the difference. Two torso
/// commands differ under `+ facing` as readily as under `- facing` -- they differ
/// by twice the yaw gap and in the opposite direction, which is invisible to an
/// `assert_ne!` -- so the difference is asserted only to rule out an adapter that
/// subtracts nothing at all.
///
/// The plan asks for a turn: `world_plan().body_yaw` is 211 degrees and neither
/// observation is holding it, which is the situation an adapter reading the
/// *commanded* yaw gets wrong and the neutral fixture cannot produce.
#[test]
fn the_same_plan_at_two_yaws_produces_two_torso_commands_that_point_one_way() {
    let plan = world_plan();
    let a = observation_at(Angle::from_degrees(20));
    let b = observation_at(Angle::from_degrees(155));
    assert_ne!(a.body_yaw, plan.body_yaw, "the plan must be asking for a turn");
    assert_ne!(b.body_yaw, plan.body_yaw, "the plan must be asking for a turn");

    let ta = into_torso_frame(&a, plan).core;
    let tb = into_torso_frame(&b, plan).core;

    for arm in 0..2 {
        assert_ne!(
            ta.arms[arm].bearing, tb.arms[arm].bearing,
            "arm {arm} named the same torso bearing at two yaws, so nothing was subtracted",
        );
        // What `World::world_arm_target` does with a torso bearing, at
        // `crates/sim/src/world/mod.rs:1799`: it adds the yaw the body is
        // holding. Landing back on the plan is the whole property.
        assert_eq!(
            ta.arms[arm].bearing + a.body_yaw, plan.arms[arm].bearing,
            "arm {arm} at 20deg does not point where the plan aimed it",
        );
        assert_eq!(
            tb.arms[arm].bearing + b.body_yaw, plan.arms[arm].bearing,
            "arm {arm} at 155deg does not point where the plan aimed it",
        );
        // The columns the frame does not touch are untouched, which is what
        // makes the two bearings above the only thing this function did.
        assert_eq!(ta.arms[arm].height, plan.arms[arm].height);
        assert_eq!(ta.arms[arm].reach, plan.arms[arm].reach);
        assert_eq!(ta.arms[arm].effort, plan.arms[arm].effort);
    }

    assert_ne!(ta.move_dir, tb.move_dir, "the feet named one torso vector at two yaws");
    assert_near(into_world(ta.move_dir, a.body_yaw), plan.move_dir, 4, "the feet at 20deg");
    assert_near(into_world(tb.move_dir, b.body_yaw), plan.move_dir, 4, "the feet at 155deg");

    // `body_yaw` is the one column that is absolute under both frames -- it is
    // what the actuator chases, not something read relative to where the chase
    // has got to -- so it is copied through and must not have followed either
    // rotation.
    assert_eq!(ta.body_yaw, plan.body_yaw);
    assert_eq!(tb.body_yaw, plan.body_yaw);
    assert_eq!(into_torso_frame(&a, plan).swing_plane, [Angle::ZERO; 2]);
}

struct Driven {
    world: World,
    refused: u32,
    resolutions: u64,
}

/// Both bodies under their own instance of the policy.
///
/// One planner per body and not one shared between them: [`StrikePlanner`]
/// carries a one-observation history keyed by subject, and a shared instance
/// would have each fighter reading the other's previous frame.
///
/// [`StrikePlanner`]: policy::StrikePlanner
fn drive(scenario: &Scenario, seed: u64) -> Driven {
    let mut world = World::new(scenario, seed);
    let mut minds: Vec<(EntityId, TacticalPolicy)> = world
        .alive_ids(Faction::Heroes)
        .into_iter()
        .chain(world.alive_ids(Faction::Monsters))
        .map(|id| (id, TacticalPolicy::default()))
        .collect();
    let mut refused = 0u32;
    let mut resolutions = 0u64;
    let mut due: Vec<EntityId> = Vec::new();

    while world.tick() < TICKS && world.outcome().is_none() {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let observation = world.observe(id);
            let Some(mind) = minds.iter_mut().find(|(who, _)| *who == id) else { continue };
            let command = mind.1.decide(&observation);
            match world.submit(id, command) {
                SubmitOutcome::Stored { rejection: None, .. } => {}
                _ => refused += 1,
            }
        }
        world.step();
        resolutions += world.contact_resolutions().len() as u64;
    }
    Driven { world, refused, resolutions }
}

/// **A refused submission is not a slow fighter.** The world stores the neutral
/// command in place of the one the policy asked for, so a rejection turns the
/// run into a run by a body standing still and every reproducibility claim in
/// this file goes on passing.
///
/// The specific hazard the adapter introduces is the move vector:
/// `into_torso` is a rotation and rotations are only length-preserving up to the
/// cosine table, so a planner walking at fifteen sixteenths could in principle
/// come out the other side over `MoveMagnitude`'s unit disc. This is where that
/// would show.
#[test]
fn the_tactical_policy_never_submits_a_command_the_world_refuses() {
    for scenario in [Scenario::embodied_duel(), Scenario::embodied_slope()] {
        for seed in [3, 11, 97] {
            let driven = drive(&scenario, seed);
            assert_eq!(
                driven.refused, 0,
                "{} refused a tactical command at seed {seed}", scenario.name,
            );
        }
    }
}

/// The property ADR 0002 exists for, on this seam: what a replay records is the
/// stored command, so playback needs no planner and no observation.
#[test]
fn a_tactical_embodied_fight_replays_exactly() {
    let scenario = Scenario::embodied_slope();
    let mut world = World::new(&scenario, 11);
    let mut replay = Replay::new(&scenario, 11);
    let mut minds: Vec<(EntityId, TacticalPolicy)> = world
        .alive_ids(Faction::Heroes)
        .into_iter()
        .chain(world.alive_ids(Faction::Monsters))
        .map(|id| (id, TacticalPolicy::default()))
        .collect();
    let mut due: Vec<EntityId> = Vec::new();

    while world.tick() < 600 && world.outcome().is_none() {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let observation = world.observe(id);
            let Some(mind) = minds.iter_mut().find(|(who, _)| *who == id) else { continue };
            let command = mind.1.decide(&observation);
            // Recorded before submission and at the tick it was made on, which
            // is the contract `Replay::record_submitted` reads.
            replay.record_submitted(world.tick(), id, SubmittedCommand::Embodied(command));
            world.submit(id, command);
        }
        world.step();
    }
    let played = world.tick();
    replay.finish(played);

    let replayed = replay.play();
    assert_eq!(replayed.tick(), world.tick());
    assert_eq!(
        replayed.state_digest().value, world.state_digest().value,
        "a tactical embodied fight did not reproduce from its own record",
    );
}

/// A corpus has to be a corpus of *fights*. Two bodies that never close would
/// produce a clean, reproducible, completely uninformative run -- and that is
/// exactly what a wrong torso frame looks like from every other test here,
/// because a fighter swinging at the map's north is still a fighter obeying a
/// legal command.
#[test]
fn two_tactical_bodies_reach_each_other_and_make_contact() {
    for scenario in [Scenario::embodied_duel(), Scenario::embodied_slope()] {
        let driven = drive(&scenario, 11);
        assert!(
            driven.resolutions > 0,
            "{}: nobody touched anybody in {TICKS} ticks", scenario.name,
        );
        let hurt = driven.world.health_fraction(Faction::Heroes) < Fx::ONE
            || driven.world.health_fraction(Faction::Monsters) < Fx::ONE;
        assert!(hurt, "{}: contact happened and cost nobody anything", scenario.name);
    }
}

/// A policy instance reused across rollouts must not carry one fight into the
/// next. `reset` is what the corpus runner calls between seeds, and this is the
/// property it is called for: [`StrikePlanner`] holds a phase, a committed plan
/// and a previous observation, and any one of the three surviving a reset would
/// open the second fight mid-swing.
///
/// [`StrikePlanner`]: policy::StrikePlanner
#[test]
fn a_policy_reused_across_runs_drives_the_same_fight_twice() {
    let scenario = Scenario::embodied_slope();
    let run = |mind: &mut TacticalPolicy, other: &mut TacticalPolicy| {
        mind.reset();
        other.reset();
        let mut world = World::new(&scenario, 11);
        let heroes = world.alive_ids(Faction::Heroes);
        let mut due: Vec<EntityId> = Vec::new();
        while world.tick() < 400 && world.outcome().is_none() {
            due.clear();
            due.extend_from_slice(world.pending_decisions());
            for &id in &due {
                let observation = world.observe(id);
                let command = if heroes.contains(&id) {
                    mind.decide(&observation)
                } else {
                    other.decide(&observation)
                };
                world.submit(id, command);
            }
            world.step();
        }
        world.state_digest().value
    };

    let mut hero = TacticalPolicy::default();
    let mut monster = TacticalPolicy::default();
    let first = run(&mut hero, &mut monster);
    let second = run(&mut hero, &mut monster);
    assert_eq!(first, second, "a reused planner carried one fight into the next");
}
