//! A mixed fight -- one hand driven by a policy, one by a stand-in for a human
//! -- reproduces from its replay with neither of them in the room.
//!
//! That is the property [ADR 0002](../../../docs/decisions/0002-record-commands-in-replays.md)
//! exists for, and it is the reason composition happens *before* submission: what
//! the replay records is one complete command, so playback needs no controller at
//! all. A recorded half-command would need the other half to exist at playback
//! time, which is exactly the coupling the ADR refuses.

use fx::{Angle, Fx, Vec2};
use policy::{CommandAuthority, ComposedController, PartialCommandSource};
use sim::{
    ArmTarget, CommandCoreV1, Observation, CombatHeight, CommandV1,
    Faction, LimbSlot, Replay, Scenario, SubmittedCommand, World,
};

/// Stands in for the browser's input state: navigation and the main hand, driven
/// by something that is not a policy and does not exist at playback time.
struct HandOnTheControls {
    tick: u32,
}

impl PartialCommandSource for HandOnTheControls {
    fn authority(&self) -> CommandAuthority {
        CommandAuthority { navigation: true, arms: [false, true] }
    }

    fn contribute(&mut self, _obs: &Observation, into: &mut CommandV1) {
        // WASD, in the body frame session 05 gave it: `+x` is forward whatever
        // the body is facing, which is why this needs no yaw of its own.
        let forward = if self.tick % 64 < 32 { Fx::ONE } else { -Fx::ONE };
        into.core.move_dir = Vec2::new(forward, Fx::ZERO);
        into.core.body_yaw = Angle::from_raw(self.tick.wrapping_mul(211) as u16);
        into.core.arms[LimbSlot::RightArm as usize] = ArmTarget {
            bearing: Angle::from_raw(self.tick.wrapping_mul(613) as u16),
            height: CombatHeight::MID,
            reach: Fx::from_raw((self.tick as i32 * 97) % 65_537),
            effort: Fx::ONE,
        };
        // The embodied-only field, claimed by the arm that owns it. A human at a
        // mouse can steer the elbow; the policy on the other arm has no plane to
        // give and writes the neutral one, so the two hands differ here as well
        // as in bearing -- which is what makes the replay claim below a claim
        // about this column too.
        into.swing_plane[LimbSlot::RightArm as usize] =
            Angle::from_raw(self.tick.wrapping_mul(1_009) as u16);
        self.tick += 1;
    }

    fn reset(&mut self) {
        self.tick = 0;
    }
}

/// The off hand's whole command, as a function of the observation alone.
///
/// A whole command and not just the arm, so that
/// `a_controller_claiming_everything_drives_the_fight_its_policy_would_have`
/// below can submit it *directly* and compare -- which is the only way to state
/// "the composed path can replace the direct one" as a claim about a fight
/// rather than about a struct.
fn guard_the_off_hand(obs: &Observation) -> CommandCoreV1 {
    let mut command = policy::neutral_world_command(obs);
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

/// Writes out only the part of that whole command its authority names.
///
/// **This was `policy::PolicySource`, and it is four lines here instead**:
/// that adapter was generic over the `ArticulatedPolicy` trait, session 05
/// deleted the trait, and its only callers were these tests. The narrowing it
/// did is what the two tests below are about, so it lives where they can see
/// it -- including the swing plane, which an articulated command has no field
/// for and which the arm's owner therefore has to claim explicitly. Without
/// that write the plane would be the one field of the command
/// `CommandAuthority` does not divide.
struct GuardTheOffHand {
    authority: CommandAuthority,
}

impl PartialCommandSource for GuardTheOffHand {
    fn authority(&self) -> CommandAuthority {
        self.authority
    }

    fn contribute(&mut self, obs: &Observation, into: &mut CommandV1) {
        let whole = guard_the_off_hand(obs);
        if self.authority.navigation {
            into.core.move_dir = whole.move_dir;
            into.core.body_yaw = whole.body_yaw;
            into.core.intent = whole.intent;
        }
        for slot in 0..2 {
            if self.authority.arms[slot] {
                into.core.arms[slot] = whole.arms[slot];
                into.core.grips[slot] = whole.grips[slot];
                into.core.releases[slot] = whole.releases[slot];
                into.swing_plane[slot] = Angle::ZERO;
            }
        }
    }
}

fn controller() -> ComposedController {
    ComposedController::new(vec![
        Box::new(HandOnTheControls { tick: 0 }),
        Box::new(GuardTheOffHand {
            authority: CommandAuthority::arm(LimbSlot::LeftArm),
        }),
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
        let command = composed.decide(&live.observe(subject));
        replay.record_submitted(tick, subject, SubmittedCommand::Embodied(command));
        live.submit(subject, command);
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
        replayed.poses().collect::<Vec<_>>(),
        live.poses().collect::<Vec<_>>(),
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
    let mut planes = Vec::new();
    for _ in 0..TICKS {
        let command = composed.decide(&world.observe(subject));
        left_bearings.push(command.core.arms[0].bearing);
        right_bearings.push(command.core.arms[1].bearing);
        planes.push(command.swing_plane);
        world.submit(subject, command);
        world.step();
    }

    // The off hand holds one bearing for the whole fight; the main hand sweeps.
    assert!(left_bearings.windows(2).all(|pair| pair[0] == pair[1]),
            "the policy's guard did not hold");
    assert!(right_bearings.windows(2).any(|pair| pair[0] != pair[1]),
            "the human's hand did not move");
    assert_ne!(left_bearings[0], right_bearings[0]);

    // And the same split in the embodied-only field: the off hand holds the
    // neutral plane its whole-command source has no way to move, the
    // human-driven one swings.
    assert!(planes.iter().all(|pair| pair[0] == Angle::ZERO),
            "a source with no plane to give wrote one anyway");
    assert!(planes.windows(2).any(|pair| pair[0][1] != pair[1][1]),
            "the human's swing plane did not move");
}

/// The composed path must be able to replace a direct one without changing a
/// fight, or nothing above is safe to adopt.
#[test]
fn a_controller_claiming_everything_drives_the_fight_its_policy_would_have() {
    let scenario = Scenario::embodied_duel();
    let subject_of = |world: &World| world.alive_ids(Faction::Heroes)[0];

    let mut direct = World::new(&scenario, 5);
    let subject = subject_of(&direct);
    for _ in 0..TICKS {
        let command = guard_the_off_hand(&direct.observe(subject));
        direct.submit(subject, CommandV1::new(command));
        direct.step();
    }

    let mut wrapped = World::new(&scenario, 5);
    let mut composed = ComposedController::new(vec![Box::new(GuardTheOffHand {
        authority: CommandAuthority::ALL,
    })])
    .expect("total authority");
    for _ in 0..TICKS {
        let command = composed.decide(&wrapped.observe(subject));
        wrapped.submit(subject, command);
        wrapped.step();
    }

    assert_eq!(direct.state_digest().value, wrapped.state_digest().value);
}
