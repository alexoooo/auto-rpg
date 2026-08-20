//! The control condition, and the one command every seam falls back to.
//!
//! **Was `random.rs`, and the rename is the point.** The module was named for
//! `RandomPolicy`, a fuzzer that flailed a legacy limb, and it also held
//! `IdlePolicy` -- the do-nothing control that evolution measured candidates
//! against. Both drove the legacy seam and both went with it: the fuzzer's
//! subject was `Command::limb` and `Command::slot`, neither of which exists on a
//! body whose arms are driven by an actuator, and the control's subject was a
//! genome search that is also gone. What is left is the thing they were filed
//! beside: the neutral command, which is not a control at all but the answer the
//! sim itself substitutes for a submission it refuses.
//!
//! A fuzzer for the surviving seam would be worth having and is not this one.
//! It would have to produce an `EmbodiedCommandV1` -- a bearing, a height, a
//! reach, an effort and a plane per arm -- and the interesting state transitions
//! it should hammer are the contact solver's refusals, not a swing phase.
//! Nothing in the repository does that today.

use fx::{Fx, Vec2};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, GripRequest,
    Intent, ReleaseRequest,
};

/// The command the sim substitutes for a submission it refuses, rebuilt from
/// the one column of the observation it depends on.
///
/// **This is not a second definition of "neutral".** `World::neutral_articulated`
/// is private and takes a slot index, so no policy can call it; what it builds
/// is "stand still, hold, keep both grips, and point both arms along the body's
/// current yaw at mid height with no reach and no effort", and the only world
/// state in that sentence is the yaw. That is
/// [`ArticulatedObservation::body_yaw`], published exact and unblurred because
/// proprioception is free. So the two are derivable from each other rather than
/// merely similar, and `the_neutral_command_is_the_one_the_world_substitutes`
/// pins them together by making the world refuse a command and comparing what
/// it stored against what this returns.
///
/// A blank observation answers `Angle::ZERO`, which is harmless: the only way
/// to get one is a stale identity, a corpse or a Legacy world, and
/// [`sim::World::submit_articulated_v1`] stores nothing for any of the three.
///
/// **It is a function and no longer also a policy, and the argument the policy
/// carried belongs here.** `NeutralArticulatedPolicy` wrapped this in an
/// `ArticulatedPolicy` impl and died with that trait in session 05; what it was
/// worth saying is that the legacy `IdlePolicy` it replaced returned
/// `Command::HOLD`, a *constant*, and this is not one -- it has to name the yaw
/// the body is already holding or the actuator reads a request to spin to
/// north. So the smallest possible decision on this seam still reads its
/// observation, which is why every composed command starts from this one.
pub fn neutral_articulated_command(obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
    let arm = ArmTarget {
        bearing: obs.body_yaw,
        height: CombatHeight::MID,
        reach: Fx::ZERO,
        effort: Fx::ZERO,
    };
    ArticulatedCommandV1 {
        move_dir: Vec2::ZERO,
        body_yaw: obs.body_yaw,
        intent: Intent::Hold,
        arms: [arm; 2],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::{Angle, Fx, Vec2};
    use sim::{EntityId, Scenario, SubmitArticulatedOutcome, World};

    #[test]
    fn the_neutral_command_is_the_one_the_world_substitutes() {
        // `World::neutral_articulated` is private, so the only way to see it is
        // to make the world refuse a submission: a range failure stores the
        // neutral command atomically and hands the reason back. If the two
        // definitions ever drift, this is where it shows.
        let scenario = Scenario::articulated_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);

        // Turn first, and only part of the way. A body still facing east would
        // let a neutral that hardcoded `Angle::ZERO` pass, and a body that had
        // finished turning would let one that echoed the *requested* yaw pass;
        // caught mid-turn, only the authoritative yaw matches.
        let mut turning = neutral_articulated_command(&world.observe_articulated(fighter));
        turning.body_yaw = Angle::QUARTER;
        let _ = world.submit_articulated_v1(fighter, turning);
        world.step();
        world.step();
        let mid_turn = world.observe_articulated(fighter).body_yaw;
        assert!(mid_turn != Angle::ZERO && mid_turn != Angle::QUARTER, "the body should be mid-turn");

        let mut illegal = neutral_articulated_command(&world.observe_articulated(fighter));
        illegal.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        let SubmitArticulatedOutcome::Stored { command: stored, rejection: Some(_) } =
            world.submit_articulated_v1(fighter, illegal)
        else {
            panic!("an over-long reach must be refused and replaced");
        };
        assert_eq!(stored, neutral_articulated_command(&world.observe_articulated(fighter)));
    }

    #[test]
    fn the_neutral_command_holds_every_channel_it_can() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        let obs = world.observe_articulated(EntityId::new(0, 0));
        assert!(obs.present());
        let command = neutral_articulated_command(&obs);
        assert_eq!(command.move_dir, Vec2::ZERO);
        assert_eq!(command.intent, Intent::Hold);
        assert_eq!(command.grips, [GripRequest::Keep; 2]);
        for arm in command.arms {
            assert_eq!(arm.reach, Fx::ZERO);
            assert_eq!(arm.effort, Fx::ZERO);
            assert_eq!(arm.height, CombatHeight::MID);
            // An arm bearing is a *world* angle -- `hand_position` takes its
            // cosine and sine in world space -- so "neutral" is the body's own
            // facing, arms straight ahead, and not `Angle::ZERO`, arms east.
            assert_eq!(arm.bearing, obs.body_yaw);
        }
    }
}
