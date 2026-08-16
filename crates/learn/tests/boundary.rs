//! What a learned policy is allowed to say, and where the saying stops.
//!
//! Two claims, and they are the two halves of the same fence. One is that every
//! command the network produces is a row of the versioned action table and not
//! a number it invented; the other is that nothing on the training side of the
//! table reaches authoritative state at all. The type-level half of the second
//! is the `compile_fail` doctest pair on `learn_core`'s crate root -- it moved
//! there with the types it is about when v2-ui-08 split the crate; this file is
//! the value-level half, which is the one that can be read off a recording.

#![forbid(unsafe_code)]

use fx::{Angle, Fx, Rng, Vec2};
use learn::{
    compose, LearnedActionV1, LearnedArticulatedPolicy, Model, FOOTWORK_COUNT, GUARD_HEIGHT_COUNT,
    POSTURE_COUNT, WEAPON_BEARING_COUNT, WEAPON_HEIGHT_COUNT,
};
use policy::{run_articulated, ArticulatedPolicy, RunConfig};
use sim::{
    ArticulatedCommandV1, ArticulatedObservation, CombatHeight, GripRequest, Scenario,
    SubmittedCommand,
};

/// The shipped fixture with the two bodies moved inside each other's sight.
///
/// `runner.rs`'s `duel_in_sight`, for the reason it gives: at the shipped
/// placement the two spawn 10.8 apart against a 9.6 sight range, and a test
/// about the action table would otherwise spend most of its ticks measuring the
/// blind case.
fn duel_in_sight() -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    scenario.units[0].spawn = Vec2::from_ints(10, 8);
    scenario.units[1].spawn = Vec2::from_ints(14, 8);
    scenario
}

/// Keeps every observation it was shown and every command it answered with.
struct Tapped {
    inner: LearnedArticulatedPolicy,
    seen: Vec<ArticulatedObservation>,
    issued: Vec<ArticulatedCommandV1>,
}

impl ArticulatedPolicy for Tapped {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        let command = self.inner.decide(obs);
        self.seen.push(*obs);
        self.issued.push(command);
        command
    }

    fn reset(&mut self) {
        self.inner.reset();
        self.seen.clear();
        self.issued.clear();
    }
}

fn tapped(seed: u64) -> Tapped {
    let mut rng = Rng::new(seed);
    Tapped {
        inner: LearnedArticulatedPolicy::new(Model::random(&mut rng)),
        seen: Vec::new(),
        issued: Vec::new(),
    }
}

/// Every action the five heads can express, in index order.
fn every_action() -> Vec<LearnedActionV1> {
    let mut all = Vec::with_capacity(540);
    for footwork in 0..FOOTWORK_COUNT as u8 {
        for weapon_height in 0..WEAPON_HEIGHT_COUNT as u8 {
            for weapon_bearing in 0..WEAPON_BEARING_COUNT as u8 {
                for posture in 0..POSTURE_COUNT as u8 {
                    for guard_height in 0..GUARD_HEIGHT_COUNT as u8 {
                        all.push(LearnedActionV1 {
                            footwork,
                            weapon_height,
                            weapon_bearing,
                            posture,
                            guard_height,
                        });
                    }
                }
            }
        }
    }
    all
}

#[test]
fn learned_output_uses_only_the_versioned_action_table() {
    // The claim: nothing the network emits is a value it computed. Checked by
    // brute force rather than by inspecting the command's fields, because the
    // fields are exactly where a leak would hide -- a bearing interpolated
    // between two table entries, or a reach scaled by a logit, would still look
    // like a plausible `ArmTarget`. Reproducing the command from the table is
    // the only check that rules that out.
    //
    // Random weights and not trained ones, on the argument the action table is
    // under test rather than the training: an untrained network exercises the
    // heads far more evenly than a converged one, which is likely to sit on one
    // row of the table for the whole fight.
    let table = every_action();
    let mut checked = 0usize;
    let mut distinct = std::collections::HashSet::new();

    for seed in 0..3u64 {
        let mut policy = tapped(seed * 31 + 5);
        let config = RunConfig {
            max_ticks: Some(600),
            ..RunConfig::default()
        };
        let result = run_articulated(&duel_in_sight(), seed, &mut policy, &config);
        // A refused command is stored as the *neutral* one, and a neutral
        // command is not in this table -- so a run with rejections would be
        // asserting about a fight the policy did not drive.
        assert_eq!(result.rejected, 0, "seed {seed}");
        assert!(!policy.issued.is_empty());

        for (obs, command) in policy.seen.iter().zip(&policy.issued) {
            let found = table
                .iter()
                .find(|&&action| compose(obs, action) == *command);
            let action = found.unwrap_or_else(|| {
                panic!("tick {}: {command:?} is not any row of the action table", obs.tick)
            });
            distinct.insert((
                action.footwork,
                action.weapon_height,
                action.weapon_bearing,
                action.posture,
                action.guard_height,
            ));
            checked += 1;

            // And the same claim read off the command directly, so that a
            // failure says which column left the table rather than only that
            // some column did.
            assert_eq!(command.grips, [GripRequest::Keep; 2]);
            for arm in command.arms {
                assert!(
                    [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH]
                        .contains(&arm.height),
                    "an arm height outside the three the table names"
                );
                assert!(arm.reach >= Fx::ZERO && arm.reach <= Fx::ONE);
                assert!(arm.effort >= Fx::ZERO && arm.effort <= Fx::ONE);
            }
            let speed = command.move_dir.length();
            assert!(
                speed == Fx::ZERO
                    || (speed - Fx::from_ratio(15, 16)).abs() <= Fx::from_raw(2)
                    || (speed - Fx::HALF).abs() <= Fx::from_raw(2),
                "a step of {speed}, which is not one of the table's three magnitudes"
            );
        }
    }

    assert!(checked > 100, "only {checked} commands were checked");
    // Three untrained networks are expected to land on more than one row. If
    // this ever collapses to one, the reconstruction above is passing
    // vacuously.
    assert!(distinct.len() > 1, "every command reconstructed to the same action");
}

#[test]
fn training_types_cannot_enter_authoritative_state() {
    // The value-level twin of the `compile_fail` doctest on `learn`'s crate
    // root. The type system says a `LearnedActionV1` cannot be submitted; this
    // says what actually was, by reading the recording rather than the source.
    //
    // Three things are checked and they are three different claims:
    //
    //   1. Every stored command is an `Articulated` one that round-trips
    //      through the frozen 51-byte payload. So nothing the network computed
    //      escaped into the world except as a value the command ABI can
    //      express -- there is no `f32` anywhere in that payload, and a policy
    //      that had smuggled one out would fail to encode.
    //   2. The replay carries no legacy command vector, which is the half of
    //      "exactly one command vector is active" that the recorder owns.
    //   3. **The replay reproduces the run without the model.** `Replay::play`
    //      takes no policy and cannot load a checkpoint; it feeds stored
    //      commands back through the same entry. If any part of the fight had
    //      depended on a learned quantity that was not in the command stream,
    //      this is where the state hash would part company.
    let scenario = duel_in_sight();
    let config = RunConfig {
        max_ticks: Some(600),
        record: true,
        ..RunConfig::default()
    };
    let mut rng = Rng::new(4242);
    let mut policy = LearnedArticulatedPolicy::new(Model::random(&mut rng));
    let result = run_articulated(&scenario, 11, &mut policy, &config);
    assert_eq!(result.rejected, 0);

    let replay = result.replay.as_ref().expect("recording was requested");
    assert!(replay.entries.is_empty(), "the legacy command vector must stay empty");
    assert!(!replay.submitted_entries.is_empty());
    for record in &replay.submitted_entries {
        let SubmittedCommand::Articulated(command) = record.command else {
            panic!("a learned run must record articulated commands");
        };
        let payload = command.payload_bytes();
        assert_eq!(ArticulatedCommandV1::from_payload_bytes(&payload), Ok(command));
    }

    let played = replay.play();
    assert_eq!(played.state_hash(), result.state_hash);
    assert_eq!(played.tick(), result.ticks);
}

#[test]
fn a_zeroed_network_is_a_fighter_and_not_a_statue() {
    // The floor test for the composition step. A network of all zeros ties
    // every head and therefore picks index zero everywhere -- Advance, LOW,
    // straight down the line, Chamber, guard LOW -- and that has to be a
    // command the world takes and a body that closes. If the lowest-index
    // action were a degenerate one, generation zero of every training run would
    // be a population of statues and the first few generations would be
    // measuring nothing.
    let mut policy = LearnedArticulatedPolicy::new(Model::zeros());
    let blank = ArticulatedObservation {
        body_yaw: Angle::from_degrees(45),
        ..ArticulatedObservation::BLANK
    };
    let command = policy.decide(&blank);
    assert_eq!(command, compose(&blank, LearnedActionV1::default()));
    assert_ne!(command.move_dir, Vec2::ZERO);

    let config = RunConfig {
        max_ticks: Some(600),
        ..RunConfig::default()
    };
    let result = run_articulated(&Scenario::articulated_duel(), 1, &mut policy, &config);
    assert_eq!(result.rejected, 0);
    // **"Not a statue" is the claim, and both laws now answer it the same way:
    // the fight runs its 600-tick clock.**
    //
    // The two disagreed for one day. Session 04 freed the guard bearing and took
    // the plate's normal from the arm carrying it, which changed what a zeroed
    // network's LOW guard intercepts and ended the exact-law fight on a body at
    // 148. Combat-arms-05 then gave blunt force a wounding channel, and the
    // exact-law fight went back to its clock -- not because less damage happens
    // but because more does: a severed region leaves the geometry, so changing
    // *which* regions come off and *when* changes every sweep after it. Damage
    // is not a passive readout of this simulation, and a fight ending later is
    // not evidence of a weaker blow.
    //
    // Still pinned exactly rather than loosened to `<= 600`, because a fight
    // that stopped in its opening ticks would satisfy an inequality and is
    // exactly the degenerate generation-zero this test exists to catch. The
    // lower bound is the part that says so independently of the pin.
    assert!(result.ticks > 64, "a zeroed network stopped fighting almost at once");
    assert_eq!(result.ticks, 600, "the fight should have run its clock");
}
