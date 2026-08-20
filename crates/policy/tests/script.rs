//! The scripted embodied policy against a world, which is the half its unit
//! tests cannot reach.
//!
//! Everything in `script.rs`'s own test module states a situation
//! exactly and asks what the script says about it. Four claims cannot be made
//! that way, because each of them is about a *fight*:
//!
//! * the elevation term is inert on flat ground and live on a hill, which is
//!   what makes the next session's A/B a measurement of the term rather than of
//!   two policies;
//! * no command it produces is one the world refuses, which is the failure that
//!   does not look like a failure -- a refused submission stores the neutral
//!   command, so the run silently becomes a run by a body standing still;
//! * a fight driven by it reproduces from its own record; and
//! * the two bodies actually reach each other, which is the difference between a
//!   corpus and two fighters walking in circles.

use fx::Fx;
use policy::{Policy, ScriptConfig, ScriptedPolicy};
use sim::{
    EntityId, Faction, Replay, Scenario, SubmitOutcome, SubmittedCommand, World,
};

/// Long enough for both bodies to cross a 10.8-unit gap, climb two terraces and
/// fight, and short enough that the whole file stays inside a second.
const TICKS: u32 = 1_800;

struct Driven {
    world: World,
    refused: u32,
    resolutions: u64,
}

/// Both bodies under their own instance of the script.
///
/// **One policy per body and not one shared between them**, because
/// [`ScriptedPolicy`] carries a row of ground memory and that row is a
/// fact about the body standing on the ground. A shared instance would have each
/// fighter reading the other's floor, which is the one bug this harness could
/// hide and the corpus could not.
fn drive(scenario: &Scenario, seed: u64, config: ScriptConfig) -> Driven {
    let mut world = World::new(scenario, seed);
    let mut minds: Vec<(EntityId, ScriptedPolicy)> = world
        .alive_ids(Faction::Heroes)
        .into_iter()
        .chain(world.alive_ids(Faction::Monsters))
        .map(|id| (id, ScriptedPolicy::new(config)))
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

/// **The elevation term cannot change a flat fight, and that is what makes the
/// measurement it exists for a measurement of the term.**
///
/// `GroundSense` sets no drift until the floor has fallen a height step and no
/// climb until it has risen a terrace, and neither ever happens on a dungeon
/// whose every tile is level -- so the subject and the control emit the same
/// bytes on `embodied_duel`, tick for tick. If this ever fails, the difference
/// the next session measures on the sculpted corpus is partly a difference the
/// flat corpus would show too, and the number stops meaning "the high ground".
#[test]
fn the_two_configurations_agree_on_flat_ground() {
    for seed in [1, 11, 97] {
        let seeking = drive(&Scenario::embodied_duel(), seed, ScriptConfig::SEEKING);
        let level = drive(&Scenario::embodied_duel(), seed, ScriptConfig::LEVEL);
        assert_eq!(
            seeking.world.state_digest().value, level.world.state_digest().value,
            "the elevation term moved a fight on ground that has no elevation (seed {seed})",
        );
    }
}

/// The other half, and it is the one that would make the A/B pointless if it
/// failed the other way: on a fixture with a hill in it, the term has to
/// actually do something.
#[test]
fn the_two_configurations_diverge_on_a_hill() {
    let seeking = drive(&Scenario::embodied_slope(), 11, ScriptConfig::SEEKING);
    let level = drive(&Scenario::embodied_slope(), 11, ScriptConfig::LEVEL);
    assert_ne!(
        seeking.world.state_digest().value, level.world.state_digest().value,
        "the elevation term changed nothing on a hill, so there is nothing to measure",
    );
}

/// A refused submission is not a slow fighter: the world stores the **neutral**
/// command in place of the one the policy asked for, so the whole run silently
/// becomes a different run and every number taken off it describes a body
/// standing still. `APPROACH_SPEED` is fifteen sixteenths because of this.
#[test]
fn the_script_never_submits_a_command_the_world_refuses() {
    for scenario in [Scenario::embodied_duel(), Scenario::embodied_slope()] {
        for config in [ScriptConfig::SEEKING, ScriptConfig::LEVEL] {
            let driven = drive(&scenario, 11, config);
            assert_eq!(
                driven.refused, 0,
                "{} refused a command under high_ground={}",
                scenario.name, config.high_ground,
            );
        }
    }
}

/// The corpus this policy exists to make possible has to be a corpus of
/// *fights*. Two bodies that never close would produce a clean, reproducible,
/// completely uninformative 1,800 ticks -- which is exactly what the articulated
/// gate's first checkpoint measured before anybody noticed.
#[test]
fn two_scripted_bodies_reach_each_other_and_make_contact() {
    for scenario in [Scenario::embodied_duel(), Scenario::embodied_slope()] {
        let driven = drive(&scenario, 11, ScriptConfig::SEEKING);
        assert!(
            driven.resolutions > 0,
            "{}: nobody touched anybody in {TICKS} ticks", scenario.name,
        );
        let hurt = driven.world.health_fraction(Faction::Heroes) < Fx::ONE
            || driven.world.health_fraction(Faction::Monsters) < Fx::ONE;
        assert!(hurt, "{}: contact happened and cost nobody anything", scenario.name);
    }
}

/// The property ADR 0002 exists for, on this seam: what a replay records is the
/// stored command, so playback needs no policy, no ground memory and no floor.
#[test]
fn a_scripted_embodied_fight_replays_exactly() {
    let scenario = Scenario::embodied_slope();
    let mut world = World::new(&scenario, 11);
    let mut replay = Replay::new(&scenario, 11);
    let mut minds: Vec<(EntityId, ScriptedPolicy)> = world
        .alive_ids(Faction::Heroes)
        .into_iter()
        .chain(world.alive_ids(Faction::Monsters))
        .map(|id| (id, ScriptedPolicy::default()))
        .collect();
    let mut due: Vec<EntityId> = Vec::new();

    let ticks = 600;
    while world.tick() < ticks && world.outcome().is_none() {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let observation = world.observe(id);
            let Some(mind) = minds.iter_mut().find(|(who, _)| *who == id) else { continue };
            let command = mind.1.decide(&observation);
            // Recorded before submission and at the tick it was made on, which is
            // the contract `Replay::record_submitted` reads.
            replay.record_submitted(world.tick(), id, SubmittedCommand::Embodied(command));
            world.submit(id, command);
        }
        world.step();
    }
    let played = world.tick();
    replay.finish(played);

    // Nothing that decided anything is in the room for this line.
    let replayed = replay.play();
    assert_eq!(replayed.tick(), world.tick());
    assert_eq!(
        replayed.state_digest().value, world.state_digest().value,
        "a scripted embodied fight did not reproduce from its own record",
    );
}

/// A policy instance reused across rollouts must not carry one fight's floor
/// into the next. `reset` is what the harness calls, and this is the property it
/// is called for.
#[test]
fn a_policy_reused_across_runs_drives_the_same_fight_twice() {
    let scenario = Scenario::embodied_slope();
    let run = |mind: &mut ScriptedPolicy, other: &mut ScriptedPolicy| {
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

    let mut hero = ScriptedPolicy::default();
    let mut monster = ScriptedPolicy::default();
    let first = run(&mut hero, &mut monster);
    let second = run(&mut hero, &mut monster);
    assert_eq!(first, second, "a reused policy carried a hill into the next fight");
}
