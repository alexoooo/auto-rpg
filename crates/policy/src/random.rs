use crate::Policy;
use fx::{Fx, Rng};
use sim::{Command, Intent, LimbCommand, Observation};

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
    use fx::{Fx, Vec2};
    use sim::{EntityId, Faction, Order};

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
}
