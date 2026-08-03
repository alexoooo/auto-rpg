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

mod duelist;
mod genome;
mod random;
mod runner;
mod swing;
mod utility;

pub use duelist::{DuelistPolicy, DuelistWeights, Stance, DUELIST_GENOME_LEN};
pub use genome::{PolicySpec, MAX_GENOME_LEN};
pub use random::{IdlePolicy, RandomPolicy};
pub use runner::{run, RunConfig, RunResult};
pub use swing::OVERSHOOT;
pub use utility::{UtilityPolicy, UtilityWeights, GENOME_LEN};

use fx::Fx;
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

/// Every policy that can be named from outside this crate.
///
/// Exists so a policy can be chosen by a number: an integer crosses the wasm
/// boundary and a `--policy duelist` argument parses, without either of those
/// places needing to know what a `DuelistPolicy` is. The codes are
/// **append-only** -- they are what a saved configuration or a URL would carry.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default)]
pub enum PolicyKind {
    /// The hand-tuned weighted-score baseline: pick a target, walk at it, swing.
    #[default]
    Utility,
    /// Stance-based swordplay: block, evade, circle, punish, feint.
    Duelist,
    /// Does nothing at all. The control condition.
    Idle,
    /// Flails. A fuzzer, not an opponent.
    Random,
}

impl PolicyKind {
    pub const ALL: [PolicyKind; 4] = [
        PolicyKind::Utility,
        PolicyKind::Duelist,
        PolicyKind::Idle,
        PolicyKind::Random,
    ];

    pub const fn code(self) -> u32 {
        match self {
            PolicyKind::Utility => 0,
            PolicyKind::Duelist => 1,
            PolicyKind::Idle => 2,
            PolicyKind::Random => 3,
        }
    }

    pub const fn from_code(code: u32) -> Option<PolicyKind> {
        match code {
            0 => Some(PolicyKind::Utility),
            1 => Some(PolicyKind::Duelist),
            2 => Some(PolicyKind::Idle),
            3 => Some(PolicyKind::Random),
            _ => None,
        }
    }

    pub fn from_name(name: &str) -> Option<PolicyKind> {
        PolicyKind::ALL.into_iter().find(|k| k.name() == name)
    }

    pub const fn name(self) -> &'static str {
        match self {
            PolicyKind::Utility => "utility",
            PolicyKind::Duelist => "duelist",
            PolicyKind::Idle => "idle",
            PolicyKind::Random => "random",
        }
    }

    /// This policy's evolvable knobs, or an empty spec for the ones that have
    /// none. An empty spec is not a special case for a caller: it produces zero
    /// sliders and a zero-length genome, which is exactly right.
    pub fn spec(self) -> PolicySpec {
        match self {
            PolicyKind::Utility => UtilityWeights::SPEC,
            PolicyKind::Duelist => DuelistWeights::SPEC,
            PolicyKind::Idle | PolicyKind::Random => PolicySpec::new(&[], &[], &[]),
        }
    }

    /// Builds an instance from a genome. Genes outside `0..=1` clamp and a
    /// short genome fills from the middle of each range, so this cannot fail.
    pub fn build(self, genes: &[Fx]) -> Box<dyn Policy> {
        match self {
            PolicyKind::Utility => Box::new(UtilityPolicy::from_genome(genes)),
            PolicyKind::Duelist => Box::new(DuelistPolicy::from_genome(genes)),
            PolicyKind::Idle => Box::new(IdlePolicy),
            // Seeded from the genome so two `Random` opponents built the same
            // way flail the same way, which a fuzzer needs and a coin flip
            // cannot give.
            PolicyKind::Random => Box::new(RandomPolicy::new(
                genes.first().copied().unwrap_or(Fx::HALF).raw() as u64,
            )),
        }
    }

    /// The hand-tuned instance.
    pub fn baseline(self) -> Box<dyn Policy> {
        self.build(&self.spec().baseline_genome())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_codes_are_append_only() {
        // These numbers are what a saved configuration carries. Reordering the
        // enum must not silently repoint anyone's saved choice at a different
        // policy.
        assert_eq!(PolicyKind::Utility.code(), 0);
        assert_eq!(PolicyKind::Duelist.code(), 1);
        assert_eq!(PolicyKind::Idle.code(), 2);
        assert_eq!(PolicyKind::Random.code(), 3);
        assert_eq!(PolicyKind::from_code(4), None);
        for kind in PolicyKind::ALL {
            assert_eq!(PolicyKind::from_code(kind.code()), Some(kind));
            assert_eq!(PolicyKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(PolicyKind::from_name("nonesuch"), None);
    }

    #[test]
    fn every_kind_builds_and_decides() {
        let obs = sim::Observation::blank(
            0,
            sim::EntityId::new(0, 0),
            Faction::Heroes,
            fx::Vec2::ZERO,
            sim::Order::Hold,
        );
        for kind in PolicyKind::ALL {
            let mut policy = kind.baseline();
            let action = policy.decide(&obs);
            assert!(
                action.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "{} produced an over-long move", kind.name()
            );
            policy.reset();
        }
    }

    #[test]
    fn a_spec_describes_exactly_as_many_knobs_as_its_policy_has() {
        assert_eq!(PolicyKind::Utility.spec().len(), GENOME_LEN);
        assert_eq!(PolicyKind::Duelist.spec().len(), DUELIST_GENOME_LEN);
        assert!(PolicyKind::Idle.spec().is_empty());
        for kind in PolicyKind::ALL {
            let spec = kind.spec();
            for i in 0..spec.len() {
                assert!(!spec.label(i).is_empty(), "{} knob {i} is unnamed", kind.name());
                let (lo, hi) = spec.range(i);
                assert!(lo < hi, "{} knob {i} has an empty range", kind.name());
            }
        }
    }
}
