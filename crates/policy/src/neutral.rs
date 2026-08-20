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

/// The neutral command in *world* terms: the base every composed command on this
/// seam starts from, rebuilt from the one column of the observation it depends
/// on.
///
/// **This is not a second definition of "neutral".** The world builds its own
/// and keeps it private, taking a slot index rather than an observation, so no
/// policy can call it; what it builds is "stand still, hold, keep both grips,
/// and point both arms at mid height with no reach and no effort", and the only
/// world state in that sentence is the body's yaw. That is
/// [`ArticulatedObservation::body_yaw`], published exact and unblurred because
/// proprioception is free. So the two are derivable from each other rather than
/// merely similar, and `the_neutral_command_is_the_one_the_world_substitutes`
/// pins them together by making the world refuse a command and comparing what
/// it stored against what this returns.
///
/// **The derivation is now one conversion long rather than an identity, and
/// that is the whole trace the deleted model left here.** This function writes
/// the body's yaw into `ArmTarget::bearing`, which was the world's own answer
/// while an arm bearing was an absolute angle. The surviving grammar measures an
/// arm bearing from the torso, so the world substitutes `Angle::ZERO` there and
/// it is [`crate::neutral_embodied_command`] that matches it column for column.
/// That test therefore compares the stored command against both: against the
/// embodied neutral directly, and against *this* one put through
/// [`crate::into_torso_frame`]. Two links instead of one, and neither may drift.
///
/// A blank observation answers `Angle::ZERO`, which is harmless: the only way
/// to get one is a stale identity or a corpse, and
/// [`sim::World::submit_embodied_v1`] stores nothing for either.
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
    use crate::{into_torso_frame, neutral_embodied_command};
    use fx::{Angle, Fx, Vec2};
    use sim::{EntityId, Scenario, SubmitEmbodiedOutcome, World};

    #[test]
    fn the_neutral_command_is_the_one_the_world_substitutes() {
        // The world's neutral is private, so the only way to see it is to make
        // the world refuse a submission: a range failure stores the neutral
        // command atomically and hands the reason back. If the definitions ever
        // drift, this is where it shows.
        //
        // **It was `Scenario::articulated_duel` through
        // `World::submit_articulated_v1` until session 05, and the reseat cost
        // the test one link rather than its subject.** An arm bearing was an
        // absolute angle under the deleted grammar, so the world's substitute
        // was `neutral_articulated_command` to the bit; it is measured from the
        // torso under the surviving one, so the world's substitute is
        // `neutral_embodied_command` and this file's function is one
        // `into_torso_frame` away from it. Both halves are asserted below,
        // because dropping either would leave a definition nothing compares.
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let fighter = EntityId::new(0, 0);

        // Turn first, and only part of the way. A body still facing east would
        // let a neutral that hardcoded `Angle::ZERO` in `body_yaw` pass, and a
        // body that had finished turning would let one that echoed the
        // *requested* yaw pass; caught mid-turn, only the authoritative yaw
        // matches.
        let mut turning = neutral_embodied_command(&world.observe_articulated(fighter));
        turning.articulated.body_yaw = Angle::QUARTER;
        let _ = world.submit_embodied_v1(fighter, turning);
        world.step();
        world.step();
        let mid_turn = world.observe_articulated(fighter).body_yaw;
        assert!(mid_turn != Angle::ZERO && mid_turn != Angle::QUARTER, "the body should be mid-turn");

        let mut illegal = neutral_embodied_command(&world.observe_articulated(fighter));
        illegal.articulated.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        let SubmitEmbodiedOutcome::Stored { command: stored, rejection: Some(_) } =
            world.submit_embodied_v1(fighter, illegal)
        else {
            panic!("an over-long reach must be refused and replaced");
        };
        let obs = world.observe_articulated(fighter);
        assert_eq!(stored.payload_bytes(), neutral_embodied_command(&obs).payload_bytes());
        // The second link, and the reason this test still belongs beside this
        // function: the world-frame neutral is what every composed command in
        // this crate starts from, and it is only the world's answer through the
        // one adapter.
        assert_eq!(
            stored.payload_bytes(),
            into_torso_frame(&obs, neutral_articulated_command(&obs)).payload_bytes(),
        );
    }

    #[test]
    fn the_neutral_command_holds_every_channel_it_can() {
        let scenario = Scenario::embodied_duel();
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
            // This command's arm bearing is a *world* angle -- it was written
            // for a grammar where `hand_position` took its cosine and sine in
            // world space -- so "neutral" here is the body's own facing, arms
            // straight ahead, and not `Angle::ZERO`, arms east. The surviving
            // grammar's answer to the same question is `Angle::ZERO`, which is
            // what the conversion above exists to say.
            assert_eq!(arm.bearing, obs.body_yaw);
        }
    }
}
