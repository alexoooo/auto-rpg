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
    compose, LearnedActionV1, LearnedEmbodiedPolicy, Model, FOOTWORK_COUNT, GUARD_HEIGHT_COUNT,
    POSTURE_COUNT, WEAPON_BEARING_COUNT, WEAPON_HEIGHT_COUNT,
};
use policy::{into_torso_frame, run_embodied, EmbodiedPolicy, RunConfig};
use sim::{
    ArticulatedObservation, CombatHeight, EmbodiedCommandV1, GripRequest, Scenario,
    SubmittedCommand,
};

/// The shipped fixture with the two bodies moved inside each other's sight.
///
/// `runner.rs`'s `duel_in_sight`, for the reason it gives: at the shipped
/// placement the two spawn 10.8 apart against a 9.6 sight range, and a test
/// about the action table would otherwise spend most of its ticks measuring the
/// blind case.
fn duel_in_sight() -> Scenario {
    let mut scenario = Scenario::embodied_duel();
    scenario.units[0].spawn = Vec2::from_ints(10, 8);
    scenario.units[1].spawn = Vec2::from_ints(14, 8);
    scenario
}

/// Keeps every observation it was shown and every command it answered with.
///
/// **What it records is the command that leaves the adapter**, in the torso
/// frame the world is actually handed, and not the world-frame command the
/// network composed. That is the whole point of the tap since the reseat: the
/// fence this file guards is around what reaches `sim`, and a recording taken
/// on the near side of `into_torso_frame` would prove the table's reach and
/// effort survived while saying nothing about the bearings.
struct Tapped {
    inner: LearnedEmbodiedPolicy,
    seen: Vec<ArticulatedObservation>,
    issued: Vec<EmbodiedCommandV1>,
}

impl EmbodiedPolicy for Tapped {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
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
        inner: LearnedEmbodiedPolicy::new(Model::random(&mut rng)),
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
    //
    // **The reconstruction goes through the frame adapter, and what that buys
    // and what it does not are worth separating.** The recording is what the
    // world was handed, on the far side of `into_torso_frame`, so the search
    // has to put the candidate row through the same function to compare at all.
    //
    // What it buys: the right-hand side is produced by `LearnedEmbodiedPolicy`
    // and not by this test, so a `decide` that did anything after composing --
    // a reach scaled by a logit, a bearing interpolated between two rows -- has
    // no row to land on and the search fails. That is the fence, and it is the
    // whole of what this test asserts.
    //
    // **What it does not buy is the conversion's sign, and an earlier comment
    // here claimed the opposite.** `into_torso_frame` is applied to both sides
    // with the same `obs`, so it cancels: an adapter that *added* `obs.body_yaw`
    // instead of subtracting it -- the exact wrong answer that function's own
    // doc warns about -- leaves every assertion below green. Measured on
    // 2026-08-19 by making that edit: all three tests in this file passed and
    // `policy`'s `the_same_plan_at_two_yaws_produces_two_torso_commands_that_
    // point_one_way` and `the_neutral_articulated_command_converts_to_the_
    // neutral_embodied_command_exactly` are the two that went red. Those are the
    // sign's guards; `a_world_vector_survives_the_round_trip` guards the other
    // half of the same function, the step rotation, and stayed green under a
    // flipped bearing.
    //
    // **And there is no version of this search that checks both**, which is why
    // the fix is this paragraph rather than a rewrite. Comparing `compose`'s
    // output against a world-frame recording sounds stronger and is strictly
    // weaker: `LearnedArticulatedPolicy::decide` *is* `compose(obs, action)`, so
    // both sides of that comparison would be this test's own call to `compose`
    // and the row search would succeed for any implementation of it. The
    // conversion cancels because the recording is on its far side, and the
    // recording is on its far side because that is where the fence is.
    let table = every_action();
    let mut checked = 0usize;
    let mut distinct = std::collections::HashSet::new();

    for seed in 0..3u64 {
        let mut policy = tapped(seed * 31 + 5);
        let config = RunConfig {
            max_ticks: Some(600),
            ..RunConfig::default()
        };
        let result = run_embodied(&duel_in_sight(), seed, &mut policy, &config);
        // A refused command is stored as the *neutral* one, and a neutral
        // command is not in this table -- so a run with rejections would be
        // asserting about a fight the policy did not drive.
        assert_eq!(result.rejected, 0, "seed {seed}");
        assert!(!policy.issued.is_empty());

        for (obs, command) in policy.seen.iter().zip(&policy.issued) {
            let found = table
                .iter()
                .find(|&&action| into_torso_frame(obs, compose(obs, action)) == *command);
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
            // some column did. Through `.articulated`, which is where all four
            // of these columns live: the embodied command adds a swing plane per
            // arm and nothing else, and the plane is asserted one block down
            // because the action table has no head for it.
            assert_eq!(command.swing_plane, [Angle::ZERO; 2]);
            assert_eq!(command.articulated.grips, [GripRequest::Keep; 2]);
            for arm in command.articulated.arms {
                assert!(
                    [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH]
                        .contains(&arm.height),
                    "an arm height outside the three the table names"
                );
                assert!(arm.reach >= Fx::ZERO && arm.reach <= Fx::ONE);
                assert!(arm.effort >= Fx::ZERO && arm.effort <= Fx::ONE);
            }
            // **The tolerance is four raw units and was two**, and the two
            // extra are the frame rotation rather than slack anybody wanted.
            // `into_torso` is a pair of 16.16 multiply-adds against a `cos` and
            // a `sin` that are themselves table lookups, so a rotated vector's
            // length is the original's plus a rounding error. **Measured on this
            // corpus rather than reasoned about: the worst deviation is exactly
            // three raw units** -- a bound of 2 fails at a step of 0.4999 and a
            // bound of 3 passes -- and four is that with one unit of margin, so
            // this is not a bound sitting on its own worst case.
            //
            // It is still an equality-with-a-named-error and not a range: the
            // three magnitudes are 0, 1/2 and 15/16, which are 32,768 and 28,672
            // raw apart, so a step that had been *scaled* by a logit would miss
            // by four orders of magnitude more than this admits.
            let speed = command.articulated.move_dir.length();
            assert!(
                speed == Fx::ZERO
                    || (speed - Fx::from_ratio(15, 16)).abs() <= Fx::from_raw(4)
                    || (speed - Fx::HALF).abs() <= Fx::from_raw(4),
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
    //   1. Every stored command is an `Embodied` one that round-trips through
    //      the frozen payload. So nothing the network computed escaped into the
    //      world except as a value the command ABI can express -- there is no
    //      `f32` anywhere in that payload, and a policy that had smuggled one
    //      out would fail to encode.
    //   2. The replay records at all. This used to assert that it carried no
    //      *legacy* command vector, which was the half of "exactly one command
    //      vector is active" the recorder owned; there is one vector now.
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
    let mut policy = LearnedEmbodiedPolicy::new(Model::random(&mut rng));
    let result = run_embodied(&scenario, 11, &mut policy, &config);
    assert_eq!(result.rejected, 0);

    let replay = result.replay.as_ref().expect("recording was requested");
    assert!(!replay.submitted_entries.is_empty());
    for record in &replay.submitted_entries {
        let SubmittedCommand::Embodied(command) = record.command else {
            panic!("a learned run must record embodied commands");
        };
        let payload = command.payload_bytes();
        assert_eq!(EmbodiedCommandV1::from_payload_bytes(&payload), Ok(command));
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
    let mut policy = LearnedEmbodiedPolicy::new(Model::zeros());
    let blank = ArticulatedObservation {
        body_yaw: Angle::from_degrees(45),
        ..ArticulatedObservation::BLANK
    };
    let command = policy.decide(&blank);
    assert_eq!(command, into_torso_frame(&blank, compose(&blank, LearnedActionV1::default())));
    assert_ne!(command.articulated.move_dir, Vec2::ZERO);
    // **The 45-degree yaw is doing work and is not decoration.** The adapter
    // subtracts `obs.body_yaw` from every bearing and rotates the step into the
    // torso frame, so a fixture facing due east would satisfy the line above
    // with a conversion that did nothing at all. Off-axis, the two commands are
    // different values and the equality is a claim about the rotation.
    assert_ne!(
        command.articulated.move_dir,
        compose(&blank, LearnedActionV1::default()).move_dir,
        "the torso conversion was the identity, so nothing above tested it",
    );

    let config = RunConfig {
        max_ticks: Some(600),
        ..RunConfig::default()
    };
    let result = run_embodied(&Scenario::embodied_duel(), 1, &mut policy, &config);
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
