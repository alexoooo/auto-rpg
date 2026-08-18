//! A mixed fight -- one hand driven by a policy, one by a stand-in for a human
//! -- reproduces from its replay with neither of them in the room.
//!
//! That is the property [ADR 0002](../../../docs/decisions/0002-record-commands-in-replays.md)
//! exists for, and it is the reason composition happens *before* submission: what
//! the replay records is one complete command, so playback needs no controller at
//! all. A recorded half-command would need the other half to exist at playback
//! time, which is exactly the coupling the ADR refuses.

use fx::{Angle, Fx, Vec2};
use policy::{
    ArticulatedPolicy, CommandAuthority, ComposedController, PartialEmbodiedSource, PolicySource,
};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, EmbodiedCommandV1,
    Faction, LimbSlot, Replay, Scenario, SubmittedCommand, World,
};

/// Stands in for the browser's input state: navigation and the main hand, driven
/// by something that is not a policy and does not exist at playback time.
struct HandOnTheControls {
    tick: u32,
}

impl PartialEmbodiedSource for HandOnTheControls {
    fn authority(&self) -> CommandAuthority {
        CommandAuthority { navigation: true, arms: [false, true] }
    }

    fn contribute(&mut self, _obs: &ArticulatedObservation, into: &mut EmbodiedCommandV1) {
        // WASD, in the body frame session 05 gave it: `+x` is forward whatever
        // the body is facing, which is why this needs no yaw of its own.
        let forward = if self.tick % 64 < 32 { Fx::ONE } else { -Fx::ONE };
        into.articulated.move_dir = Vec2::new(forward, Fx::ZERO);
        into.articulated.body_yaw = Angle::from_raw(self.tick.wrapping_mul(211) as u16);
        into.articulated.arms[LimbSlot::RightArm as usize] = ArmTarget {
            bearing: Angle::from_raw(self.tick.wrapping_mul(613) as u16),
            height: CombatHeight::MID,
            reach: Fx::from_raw((self.tick as i32 * 97) % 65_537),
            effort: Fx::ONE,
        };
        self.tick += 1;
    }

    fn reset(&mut self) {
        self.tick = 0;
    }
}

/// The off hand: a policy that only ever gets to write one arm.
struct GuardTheOffHand;

impl ArticulatedPolicy for GuardTheOffHand {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        let mut command = policy::neutral_articulated_command(obs);
        command.arms[LimbSlot::LeftArm as usize] = ArmTarget {
            // Across the body, in the torso frame: a guard that stays where the
            // fighter put it however the fighter turns.
            bearing: Angle::from_raw(8_192),
            height: CombatHeight::HIGH,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        command
    }
}

fn controller() -> ComposedController {
    ComposedController::new(vec![
        Box::new(HandOnTheControls { tick: 0 }),
        Box::new(PolicySource::new(
            GuardTheOffHand,
            CommandAuthority::arm(LimbSlot::LeftArm),
        )),
    ])
    .expect("navigation and both arms claimed exactly once")
}

const TICKS: u32 = 240;

#[test]
fn a_replay_of_a_composed_fight_needs_neither_the_human_nor_the_policy() {
    let scenario = Scenario::embodied_duel();
    let mut live = World::new(&scenario, 11);
    let mut replay = Replay::new(&scenario, 11);
    let mut composed = controller();

    let subject = live.alive_ids(Faction::Heroes)[0];
    for tick in 0..TICKS {
        let command = composed.decide(&live.observe_articulated(subject));
        replay.record_submitted(tick, subject, SubmittedCommand::Embodied(command));
        live.submit_embodied_v1(subject, command);
        live.step();
    }
    replay.finish(TICKS);

    // Nothing that decided anything is in the room for this line.
    let replayed = replay.play();

    assert_eq!(replayed.tick(), live.tick());
    assert_eq!(
        replayed.state_digest().value,
        live.state_digest().value,
        "a composed fight did not reproduce from its own record",
    );
    assert_eq!(
        replayed.articulated_poses().collect::<Vec<_>>(),
        live.articulated_poses().collect::<Vec<_>>(),
    );
}

/// The half that makes the test above mean something: the fight has to be one
/// the two sources actually disagree about. If both hands did the same thing, a
/// replay that dropped one of them would still reproduce it.
#[test]
fn the_two_hands_of_a_composed_fight_are_visibly_driven_by_different_things() {
    let scenario = Scenario::embodied_duel();
    let mut world = World::new(&scenario, 11);
    let mut composed = controller();
    let subject = world.alive_ids(Faction::Heroes)[0];

    let mut left_bearings = Vec::new();
    let mut right_bearings = Vec::new();
    for _ in 0..TICKS {
        let command = composed.decide(&world.observe_articulated(subject));
        left_bearings.push(command.articulated.arms[0].bearing);
        right_bearings.push(command.articulated.arms[1].bearing);
        world.submit_embodied_v1(subject, command);
        world.step();
    }

    // The off hand holds one bearing for the whole fight; the main hand sweeps.
    assert!(left_bearings.windows(2).all(|pair| pair[0] == pair[1]),
            "the policy's guard did not hold");
    assert!(right_bearings.windows(2).any(|pair| pair[0] != pair[1]),
            "the human's hand did not move");
    assert_ne!(left_bearings[0], right_bearings[0]);
}

/// The composed path must be able to replace a direct one without changing a
/// fight, or nothing above is safe to adopt.
#[test]
fn a_controller_claiming_everything_drives_the_fight_its_policy_would_have() {
    let scenario = Scenario::embodied_duel();
    let subject_of = |world: &World| world.alive_ids(Faction::Heroes)[0];

    let mut direct = World::new(&scenario, 5);
    let mut policy = GuardTheOffHand;
    let subject = subject_of(&direct);
    for _ in 0..TICKS {
        let command = policy.decide(&direct.observe_articulated(subject));
        direct.submit_embodied_v1(subject, EmbodiedCommandV1::new(command));
        direct.step();
    }

    let mut wrapped = World::new(&scenario, 5);
    let mut composed = ComposedController::new(vec![Box::new(PolicySource::new(
        GuardTheOffHand,
        CommandAuthority::ALL,
    ))])
    .expect("total authority");
    for _ in 0..TICKS {
        let command = composed.decide(&wrapped.observe_articulated(subject));
        wrapped.submit_embodied_v1(subject, command);
        wrapped.step();
    }

    assert_eq!(direct.state_digest().value, wrapped.state_digest().value);
}
