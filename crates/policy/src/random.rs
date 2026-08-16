//! The control conditions, one per seam, plus the fuzzer.
//!
//! Named for [`RandomPolicy`], which is the only thing in here with any
//! machinery, but what the module actually holds is the policies that exist so
//! that something else can be measured against them.

use crate::{ArticulatedPolicy, Policy};
use fx::{Fx, Rng, Vec2};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, Command, GripRequest,
    ReleaseRequest,
    Intent, LimbCommand, Observation,
};

/// Does nothing. The control condition: any evolved policy that cannot beat
/// this is not learning, and any fitness function that cannot tell them apart
/// is not measuring.
#[derive(Clone, Copy, Debug, Default)]
pub struct IdlePolicy;

impl Policy for IdlePolicy {
    fn decide(&mut self, _obs: &Observation) -> Command {
        Command::HOLD
    }
}

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

/// Stands there, arms tucked. [`IdlePolicy`]'s articulated twin and the same
/// control condition -- with one extra job the legacy one does not have.
///
/// [`Command::HOLD`] is a constant; the neutral articulated command is not,
/// because it has to name the yaw the body is already holding or the actuator
/// reads a request to spin to north. So this is also the smallest exercise of
/// the seam that reads its observation at all, which is what makes it the
/// policy the runner's own tests are written against.
#[derive(Clone, Copy, Debug, Default)]
pub struct NeutralArticulatedPolicy;

impl ArticulatedPolicy for NeutralArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        neutral_articulated_command(obs)
    }
}

/// Flails. Useful as a noise floor and as a fuzzer -- a run against random
/// commands exercises state transitions a sensible policy never reaches.
#[derive(Clone, Debug)]
pub struct RandomPolicy {
    rng: Rng,
}

impl RandomPolicy {
    pub fn new(seed: u64) -> RandomPolicy {
        RandomPolicy {
            rng: Rng::new(seed),
        }
    }
}

impl Policy for RandomPolicy {
    fn decide(&mut self, obs: &Observation) -> Command {
        let move_dir = self.rng.unit_vec();
        let enemies = obs.enemies();
        let intent = if enemies.is_empty() || self.rng.chance(1, 4) {
            Intent::Hold
        } else {
            Intent::Attack(enemies[self.rng.below(enemies.len() as u32) as usize].id)
        };
        // The limb flails too. A fuzzer that left it tucked would never exercise
        // the swing, parry or block paths at all, which are most of the
        // interesting state transitions in the sim.
        let limb = LimbCommand::new(self.rng.angle(), self.rng.range(Fx::ZERO, Fx::ONE));
        Command {
            move_dir,
            intent,
            // Rolls a slot too. The swap gate is the newest state machine in the
            // sim and this is the only thing in the crate that will hammer it
            // from illegal phases on purpose.
            slot: self.rng.below(2) as u8,
            limb,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::{Angle, Fx, Vec2};
    use sim::{EntityId, Faction, Order, Scenario, SubmitArticulatedOutcome, World};

    #[test]
    fn random_policy_is_reproducible_from_its_seed() {
        let obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::ZERO,
            Order::Hold,
        );
        let mut a = RandomPolicy::new(1234);
        let mut b = RandomPolicy::new(1234);
        for _ in 0..100 {
            assert_eq!(a.decide(&obs), b.decide(&obs));
        }
    }

    #[test]
    fn idle_policy_never_moves() {
        let obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::ZERO,
            Order::Hold,
        );
        let command = IdlePolicy.decide(&obs);
        assert_eq!(command.move_dir.length(), Fx::ZERO);
        assert_eq!(command.intent, Intent::Hold);
    }

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
        assert_eq!(
            stored,
            NeutralArticulatedPolicy.decide(&world.observe_articulated(fighter))
        );
    }

    #[test]
    fn the_neutral_articulated_policy_holds_every_channel_it_can() {
        let scenario = Scenario::articulated_duel();
        let world = World::new(&scenario, 1);
        let obs = world.observe_articulated(EntityId::new(0, 0));
        assert!(obs.present());
        let command = NeutralArticulatedPolicy.decide(&obs);
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
