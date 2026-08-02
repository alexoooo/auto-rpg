//! What agents decide, and the harness that asks them.
//!
//! The [`Policy`] trait is the entire seam between the simulation and the AI:
//!
//! ```ignore
//! fn decide(&mut self, obs: &Observation) -> Action
//! ```
//!
//! Everything downstream of this crate -- a neural policy, an evolved
//! controller, a scripted test dummy, a human's mouse -- is the same signature.
//! The simulation cannot tell them apart and does not try to.
//!
//! Milestone 1 ships one real implementation, [`UtilityPolicy`], whose
//! behaviour is a handful of weighted scores. That is not a placeholder for a
//! network so much as the thing a network has to beat: its weights are exposed
//! as a genome, so the experiment lab can evolve it today, and whatever the
//! evolved weights look like becomes the baseline fitness a learned policy is
//! measured against.

#![forbid(unsafe_code)]

mod random;
mod runner;
mod utility;

pub use random::{IdlePolicy, RandomPolicy};
pub use runner::{run, RunConfig, RunResult};
pub use utility::{UtilityPolicy, UtilityWeights, GENOME_LEN};

use sim::{Action, Faction, Observation};

/// Turns an observation into a decision.
pub trait Policy {
    fn decide(&mut self, obs: &Observation) -> Action;

    /// Clears any per-run memory. The harness calls this before each run so a
    /// policy instance can be reused across thousands of rollouts without one
    /// leaking into the next.
    fn reset(&mut self) {}
}

/// Runs a different policy for each side. The obvious use is evolution:
/// candidate on one side, incumbent on the other.
pub struct TeamPolicy<H, M> {
    pub heroes: H,
    pub monsters: M,
}

impl<H: Policy, M: Policy> TeamPolicy<H, M> {
    pub fn new(heroes: H, monsters: M) -> TeamPolicy<H, M> {
        TeamPolicy { heroes, monsters }
    }
}

impl<H: Policy, M: Policy> Policy for TeamPolicy<H, M> {
    fn decide(&mut self, obs: &Observation) -> Action {
        match obs.faction {
            Faction::Heroes => self.heroes.decide(obs),
            Faction::Monsters => self.monsters.decide(obs),
        }
    }

    fn reset(&mut self) {
        self.heroes.reset();
        self.monsters.reset();
    }
}

impl<P: Policy + ?Sized> Policy for &mut P {
    fn decide(&mut self, obs: &Observation) -> Action {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

impl<P: Policy + ?Sized> Policy for Box<P> {
    fn decide(&mut self, obs: &Observation) -> Action {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}
