use crate::Policy;
use fx::{Fx, Rng};
use sim::{Action, HandCommand, Intent, Observation, HANDS};

/// Does nothing. The control condition: any evolved policy that cannot beat
/// this is not learning, and any fitness function that cannot tell them apart
/// is not measuring.
#[derive(Clone, Copy, Debug, Default)]
pub struct IdlePolicy;

impl Policy for IdlePolicy {
    fn decide(&mut self, _obs: &Observation) -> Action {
        Action::HOLD
    }
}

/// Flails. Useful as a noise floor and as a fuzzer -- a run against random
/// actions exercises state transitions a sensible policy never reaches.
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
    fn decide(&mut self, obs: &Observation) -> Action {
        let move_dir = self.rng.unit_vec();
        let enemies = obs.enemies();
        let intent = if enemies.is_empty() || self.rng.chance(1, 4) {
            Intent::Hold
        } else {
            Intent::Attack(enemies[self.rng.below(enemies.len() as u32) as usize].id)
        };
        // Hands flail too. A fuzzer that left them tucked would never exercise
        // the swing, parry or block paths at all, which are now most of the
        // interesting state transitions in the sim.
        let mut hands = [HandCommand::TUCKED; HANDS];
        for hand in &mut hands {
            *hand = HandCommand::new(self.rng.angle(), self.rng.range(Fx::ZERO, Fx::ONE));
        }
        Action {
            move_dir,
            intent,
            hands,
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
        let action = IdlePolicy.decide(&obs);
        assert_eq!(action.move_dir.length(), Fx::ZERO);
        assert_eq!(action.intent, Intent::Hold);
    }
}
