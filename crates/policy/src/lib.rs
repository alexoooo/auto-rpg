//! What agents decide, and the harness that asks them.
//!
//! There are **two** seams between the simulation and the AI, one per combat
//! model, and each one is a single method:
//!
//! ```ignore
//! fn decide(&mut self, obs: &Observation)            -> Command;              // Policy
//! fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1; // ArticulatedPolicy
//! ```
//!
//! This file used to say [`Policy`] was *the entire* seam, and the half of that
//! sentence still worth keeping is the important half: everything downstream of
//! this crate -- a neural policy, an evolved controller, a scripted test dummy,
//! a human's mouse -- is the same signature, and the simulation cannot tell them
//! apart and does not try to. What changed is that [`sim::CombatModel`] grew a
//! second arm, and a body with joints is not asked the same question. A legacy
//! contact is a disc with a blade angle and the decision is where to stand; an
//! articulated opponent is five volumes and two blades and the decision is which
//! of them to put steel into. Different question, different observation,
//! different command, different entry into [`sim::World`].
//!
//! **Two traits rather than one trait over an enum payload.** The tempting
//! single seam is `fn decide(&mut self, obs: &Obs) -> SubmittedCommand`, and it
//! was rejected on three counts. It would make every policy in this crate carry
//! a match arm for a model it will never run under. It would turn "wrong model"
//! into a runtime error, which is exactly the error [`sim::World::submit`] and
//! [`sim::World::submit_articulated_v1`] already refuse at the boundary -- a
//! second refusal one layer up buys nothing. And the model is chosen once, by
//! the [`sim::Scenario`], and never mixes inside a world, so a mismatch is
//! static information: put it in the type and it is a compile error instead of a
//! silent run of bodies standing still. What it costs is that the two families
//! do not compose -- there is no [`TeamPolicy`] on the articulated side, for the
//! reason [`ArticulatedPolicy`] gives.
//!
//! Milestone 1 ships one real implementation *of the legacy seam*,
//! [`UtilityPolicy`], whose behaviour is a handful of weighted scores. That is
//! not a placeholder for a network so much as the thing a network has to beat:
//! its weights are exposed as a genome, so the experiment lab can evolve it
//! today, and whatever the evolved weights look like becomes the baseline
//! fitness a learned policy is measured against.
//!
//! The articulated seam ships its control condition,
//! [`NeutralArticulatedPolicy`], and two fixed scripts --
//! [`ScriptedArticulatedPolicy`] and its [`WindmillArticulatedPolicy`]
//! comparison -- and [`PolicyKind`] names none of the three. That is deliberate
//! rather than pending: a registry code is what a saved configuration or a URL
//! carries and is append-only, and the only thing driving an articulated policy
//! is `lab articulated`, which knows the concrete types. Nothing has yet had to
//! *choose* one by number, and inventing the code before then is a promise made
//! early.
//!
//! **Something now has, and it is a second enum rather than four more
//! `PolicyKind` codes.** v2-ui-05 puts an articulated fight behind a browser
//! configuration, so a policy per side arrives as an integer somebody wrote
//! down. [`ArticulatedPolicyKind`] is that registry. Extending `PolicyKind`
//! instead would have made one code space mean two things -- `2` is `Idle` on
//! the legacy seam and `windmill` here -- on a page whose whole subject is
//! watching the same fight go differently when the dropdown moves. The
//! paragraph above still holds for `PolicyKind` and is the reason this is a
//! sibling of it and not an extension: the two seams do not compose, so their
//! registries must not either.

#![forbid(unsafe_code)]

mod articulated_script;
mod articulated_tactics;
mod duelist;
mod genome;
mod minds;
mod random;
mod runner;
mod swing;
mod utility;

pub use articulated_script::{
    script_digest, scripted_articulated_command, scripted_articulated_command_with,
    windmill_articulated_command, ArmRoles, AttackFootwork, ClosingAttackControlPolicy,
    ScriptedArticulatedPolicy, WindmillArticulatedPolicy, CYCLE_TICKS, EIGHTH_TURN,
    GUARD_LEAD_TICKS, HEIGHT_TICKS, PHASE_TICKS, SCRIPT_DIGEST_DOMAIN,
};
pub use articulated_tactics::{
    robust_strike_schedule_command, StrikeDiagnostics, StrikePlan, StrikePlanner, StrikerArticulatedPolicy,
    TacticalArticulatedPolicy, TacticalContextV1, TacticalIntentV1, TacticalPhase,
    ThreatAssessmentV1, ROBUST_STRIKE_HEIGHT, ROBUST_STRIKE_TICKS,
    TACTICAL_INTENT_COUNT, TACTICAL_PHASE_COUNT, TACTICAL_POLICY_CODE,
};
pub use duelist::{DuelistPolicy, DuelistWeights, Stance, DUELIST_GENOME_LEN};
pub use genome::{PolicySpec, MAX_GENOME_LEN};
pub use random::{neutral_articulated_command, IdlePolicy, NeutralArticulatedPolicy, RandomPolicy};
pub use runner::{run, run_articulated, RunConfig, RunResult};
pub use swing::{
    blade_bearing_in, blade_tip_in, feint, guard, incoming, open_side, overcommitted, press,
    shield_free_side,
};
pub use utility::{UtilityPolicy, UtilityWeights, GENOME_LEN};

use fx::Fx;
use sim::{ArticulatedCommandV1, ArticulatedObservation, Command, Faction, Observation};

/// Turns an observation into a decision.
pub trait Policy {
    fn decide(&mut self, obs: &Observation) -> Command;

    /// Clears any per-run memory. The harness calls this before each run so a
    /// policy instance can be reused across thousands of rollouts without one
    /// leaking into the next.
    fn reset(&mut self) {}
}

/// Turns a subject-scoped articulated observation into a decision.
///
/// [`Policy`]'s twin under [`sim::CombatModel::Articulated`], and the module
/// header argues why the two are separate traits rather than one trait over an
/// enum. Object-safe on purpose, so that a `Box<dyn ArticulatedPolicy>` remains
/// available the day the articulated side needs its own `PolicyKind::build`; a
/// sibling of an object-safe trait that quietly is not object-safe is a trap
/// nobody discovers until they reach for the box.
///
/// **There is no articulated [`TeamPolicy`], and that is a property of the
/// observation.** `TeamPolicy` routes on `Observation::faction`, and
/// [`sim::ArticulatedObservation`] has no faction column -- it is subject
/// scoped, and "the other side" appears in it only as
/// [`opponents`](sim::ArticulatedObservation::opponents), already selected.
/// Adding the column back so a wrapper could match on it would publish a fact
/// no fighter perceives, and looking it up from the outside means handing the
/// wrapper the world, which is the one thing this seam refuses. Per-side
/// routing therefore belongs to whoever drives the run, which does know both
/// factions, and not to a trait wrapper.
///
/// # No `&World`, and the type system is what says so
///
/// A unit test can show that one policy did not read hidden state --
/// `an_articulated_policy_has_no_world_parameter` does exactly that, by
/// reproducing a whole run's commands from its observations with no world in
/// the room. Only the signature can show that *no* policy can. Here is the
/// whole surface, and a working implementation of it:
///
/// ```rust
/// use policy::{neutral_articulated_command, ArticulatedPolicy};
/// use sim::{ArticulatedCommandV1, ArticulatedObservation, Intent};
///
/// struct Lunger;
///
/// impl ArticulatedPolicy for Lunger {
///     fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
///         let mut command = neutral_articulated_command(obs);
///         if let Some(nearest) = obs.opponents().first() {
///             command.intent = Intent::Attack(nearest.id);
///         }
///         command
///     }
/// }
///
/// // A stale identity, a corpse and a Legacy world all answer the blank
/// // observation, so every policy has to survive one: nothing in sight, hold.
/// let mut lunger = Lunger;
/// assert_eq!(lunger.decide(&ArticulatedObservation::BLANK).intent, Intent::Hold);
/// ```
///
/// The same policy, wanting the authoritative world as well, has nowhere to put
/// it:
///
/// ```compile_fail,E0050
/// use policy::{neutral_articulated_command, ArticulatedPolicy};
/// use sim::{ArticulatedCommandV1, ArticulatedObservation, Intent, World};
///
/// struct Peeker;
///
/// impl ArticulatedPolicy for Peeker {
///     fn decide(
///         &mut self,
///         obs: &ArticulatedObservation,
///         world: &World,
///     ) -> ArticulatedCommandV1 {
///         let mut command = neutral_articulated_command(obs);
///         // Everything alive, not merely everything visible.
///         if let Some(&nearest) = world.alive_ids(sim::Faction::Monsters).first() {
///             command.intent = Intent::Attack(nearest);
///         }
///         command
///     }
/// }
/// ```
///
/// **Read those two as a pair, because on this toolchain the pairing is what
/// makes the fence honest.** rustdoc only *enforces* a `compile_fail` error code
/// on a nightly build; on the stable toolchain this repository pins, the code is
/// parsed and ignored, so the block would pass on any compile error at all --
/// including a typo of mine. Pinning it is still worth doing, because it
/// documents which failure is intended and it does become a gate on nightly. But
/// what rules out the typo here is that the two blocks are the same policy: the
/// first one compiles, and the second differs from it only by the `&World`
/// parameter and the lines that use it. Measured on rustc 1.97.1, the second
/// emits exactly one error, and it is
/// `E0050: method decide has 3 parameters but the declaration in trait
/// ArticulatedPolicy::decide has 2`.
pub trait ArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;

    /// Clears any per-run memory, on [`Policy::reset`]'s contract exactly: the
    /// harness calls it before each run so one rollout's opinions cannot leak
    /// into the next.
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
    fn decide(&mut self, obs: &Observation) -> Command {
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
    fn decide(&mut self, obs: &Observation) -> Command {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

impl<P: Policy + ?Sized> Policy for Box<P> {
    fn decide(&mut self, obs: &Observation) -> Command {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

// The same two forwarders [`Policy`] has, for the same reason: the harness
// takes `impl ArticulatedPolicy` by value, and without these a caller that
// wants to keep its policy after the run -- which is every caller reusing one
// instance across rollouts -- would have to clone it, and a `dyn` one could not
// be driven at all.
impl<P: ArticulatedPolicy + ?Sized> ArticulatedPolicy for &mut P {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

impl<P: ArticulatedPolicy + ?Sized> ArticulatedPolicy for Box<P> {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
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

/// Every articulated policy that can be named from outside this crate.
///
/// [`PolicyKind`]'s sibling under [`sim::CombatModel::Articulated`], and
/// deliberately a second enum rather than four more codes on the first -- see
/// the module header. The codes are **append-only** for the same reason
/// `PolicyKind`'s are: they are what a saved arena configuration or a URL
/// carries.
///
/// There is no genome here and no [`PolicySpec`]. Every one of these is a fixed
/// script with no evolvable knobs, so the sliders `PolicyKind` grew are absent
/// rather than empty -- an articulated fight is configured by its *loadout*,
/// which is where the forty scalars went.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default)]
pub enum ArticulatedPolicyKind {
    /// Stands there, arms tucked. The control condition.
    #[default]
    Neutral,
    /// The twelve-phase composed script: guard, wind, cut, recover.
    Composed,
    /// The composed script's control, swinging on a fixed clock.
    Windmill,
    /// The composed script with closing footwork.
    AttackMoves,
    /// The evolved network, and **the one entry [`ArticulatedPolicyKind::build`]
    /// answers `None` for.**
    ///
    /// Named here rather than omitted, so that a caller can tell "this build has
    /// an entry for that and cannot make you one" from "that is a number nobody
    /// recognises" -- the difference between an option a reader can be told
    /// about and one that silently does nothing. `v2-ui-08` landed it and needed
    /// no rework here, which is what the reservation was for.
    ///
    /// **`build` still answers `None`, permanently, and that is not a gap.** Two
    /// reasons, and the second is the one that would survive the first being
    /// fixed:
    ///
    /// * This crate is in `tools/check_deps.js`'s deterministic set and must not
    ///   gain a float dependency. `learn-core` is where the floating point
    ///   lives, and it depends on *this* crate -- so the arrow already points
    ///   the wrong way for this function to construct one.
    /// * A learned fighter is not a kind, it is a kind **plus fifteen kilobytes
    ///   of weights**. Nothing in a registry keyed by an integer has anywhere to
    ///   put a checkpoint, and inventing a global for one would put a host asset
    ///   inside a library that has no host.
    ///
    /// So the dispatch belongs to whoever holds the checkpoint. That is
    /// `crates/web`'s `build_articulated_policy` in the browser and
    /// `crates/lab`'s `--checkpoint` flag natively, and both hand the network in
    /// rather than asking for one. An `Option` here and not a fallback to
    /// [`ArticulatedPolicyKind::Neutral`] keeps the refusal legible: a caller
    /// that asked for the evolved network and silently got a body standing still
    /// would be watching a fight it would reasonably describe wrongly.
    Learned,
    /// The observation-driven seek, defence and region-targeted strike controller.
    Tactical,
}

impl ArticulatedPolicyKind {
    pub const ALL: [ArticulatedPolicyKind; 6] = [
        ArticulatedPolicyKind::Neutral,
        ArticulatedPolicyKind::Composed,
        ArticulatedPolicyKind::Windmill,
        ArticulatedPolicyKind::AttackMoves,
        ArticulatedPolicyKind::Learned,
        ArticulatedPolicyKind::Tactical,
    ];

    pub const fn code(self) -> u32 {
        match self {
            ArticulatedPolicyKind::Neutral => 0,
            ArticulatedPolicyKind::Composed => 1,
            ArticulatedPolicyKind::Windmill => 2,
            ArticulatedPolicyKind::AttackMoves => 3,
            ArticulatedPolicyKind::Learned => 4,
            ArticulatedPolicyKind::Tactical => TACTICAL_POLICY_CODE,
        }
    }

    pub const fn from_code(code: u32) -> Option<ArticulatedPolicyKind> {
        match code {
            0 => Some(ArticulatedPolicyKind::Neutral),
            1 => Some(ArticulatedPolicyKind::Composed),
            2 => Some(ArticulatedPolicyKind::Windmill),
            3 => Some(ArticulatedPolicyKind::AttackMoves),
            4 => Some(ArticulatedPolicyKind::Learned),
            TACTICAL_POLICY_CODE => Some(ArticulatedPolicyKind::Tactical),
            _ => None,
        }
    }

    pub fn from_name(name: &str) -> Option<ArticulatedPolicyKind> {
        ArticulatedPolicyKind::ALL.into_iter().find(|k| k.name() == name)
    }

    /// The name the studio and `lab` label this policy with.
    ///
    /// `lab articulated`'s own `--policy` vocabulary is `composed`, `windmill`
    /// and `neutral`, and these are those words: an arena fight and a gate
    /// corpus that ran the same script should not be describable in two
    /// vocabularies.
    pub const fn name(self) -> &'static str {
        match self {
            ArticulatedPolicyKind::Neutral => "neutral",
            ArticulatedPolicyKind::Composed => "composed",
            ArticulatedPolicyKind::Windmill => "windmill",
            ArticulatedPolicyKind::AttackMoves => "attack-moves",
            ArticulatedPolicyKind::Learned => "learned",
            ArticulatedPolicyKind::Tactical => "tactical",
        }
    }

    /// An instance, or `None` for a kind this crate cannot build.
    ///
    /// An `Option` and not a fallback to `Neutral`: a caller that asked for the
    /// evolved network and silently got a body standing still would be watching
    /// a fight it would reasonably describe wrongly. The refusal belongs to the
    /// caller, by name.
    pub fn build(self) -> Option<Box<dyn ArticulatedPolicy>> {
        match self {
            ArticulatedPolicyKind::Neutral => Some(Box::new(NeutralArticulatedPolicy)),
            ArticulatedPolicyKind::Composed => Some(Box::new(ScriptedArticulatedPolicy)),
            ArticulatedPolicyKind::Windmill => Some(Box::new(WindmillArticulatedPolicy)),
            ArticulatedPolicyKind::AttackMoves => Some(Box::new(ClosingAttackControlPolicy)),
            ArticulatedPolicyKind::Learned => None,
            ArticulatedPolicyKind::Tactical => Some(Box::new(TacticalArticulatedPolicy::default())),
        }
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
    fn articulated_policy_codes_are_append_only_and_reserve_the_learned_one() {
        // The same claim `policy_codes_are_append_only` makes about the legacy
        // registry, plus the one that is specific to this one: code 4 is
        // *named* and refused rather than absent, so that the session which
        // landed it needed no edit here at all.
        //
        // **`build` answering `None` for `Learned` is the contract and not a
        // stub**, and v2-ui-08 landing the policy is what makes that worth
        // asserting rather than assuming: the network runs in the browser now,
        // and it still is not built from here. See the variant's doc comment for
        // the two reasons, of which "a checkpoint is fifteen kilobytes of host
        // asset" is the one that outlives the dependency argument.
        assert_eq!(ArticulatedPolicyKind::Neutral.code(), 0);
        assert_eq!(ArticulatedPolicyKind::Composed.code(), 1);
        assert_eq!(ArticulatedPolicyKind::Windmill.code(), 2);
        assert_eq!(ArticulatedPolicyKind::AttackMoves.code(), 3);
        assert_eq!(ArticulatedPolicyKind::Learned.code(), 4);
        assert_eq!(ArticulatedPolicyKind::Tactical.code(), 5);
        assert_eq!(ArticulatedPolicyKind::from_code(5), Some(ArticulatedPolicyKind::Tactical));
        assert_eq!(ArticulatedPolicyKind::from_code(6), None);
        for kind in ArticulatedPolicyKind::ALL {
            assert_eq!(ArticulatedPolicyKind::from_code(kind.code()), Some(kind));
            assert_eq!(ArticulatedPolicyKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(ArticulatedPolicyKind::from_name("nonesuch"), None);
        assert!(ArticulatedPolicyKind::Learned.build().is_none());

        // And the two registries do not share a code space, which is the whole
        // reason there are two of them: the same integer names different things
        // on each seam, so nothing may cross between them by number.
        assert_eq!(PolicyKind::from_code(2).map(PolicyKind::name), Some("idle"));
        assert_eq!(
            ArticulatedPolicyKind::from_code(2).map(ArticulatedPolicyKind::name),
            Some("windmill"),
        );
    }

    #[test]
    fn every_articulated_kind_but_the_reserved_one_builds_and_decides() {
        let obs = sim::ArticulatedObservation::BLANK;
        for kind in ArticulatedPolicyKind::ALL {
            let Some(mut policy) = kind.build() else {
                assert_eq!(kind, ArticulatedPolicyKind::Learned);
                continue;
            };
            let command = policy.decide(&obs);
            assert!(
                command.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "{} produced an over-long move", kind.name()
            );
            policy.reset();
        }
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
            let command = policy.decide(&obs);
            assert!(
                command.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
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
