//! What agents decide, and the harness that asks them.
//!
//! There are **two** seams between the simulation and the AI, one per surviving
//! combat model, and each one is a single method:
//!
//! ```ignore
//! fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1; // ArticulatedPolicy
//! fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1;    // EmbodiedPolicy
//! ```
//!
//! There were **three**, and the sentence the third one is worth keeping for is
//! the general one: everything downstream of this crate -- a neural policy, an
//! evolved controller, a scripted test dummy, a human's mouse -- is the same
//! signature, and the simulation cannot tell them apart and does not try to.
//! [`sim::CombatModel::Legacy`]'s seam was `fn decide(&Observation) -> Command`,
//! and it went with the model: a legacy contact was a disc with a blade angle
//! and the decision was where to stand, where a jointed opponent is a set of
//! swept volumes and two blades and the decision is which of them to put steel
//! into. Different question, different observation, different command, different
//! entry into [`sim::World`] -- which is exactly why the seams were separate
//! traits, and why deleting one took nothing out of the other two.
//!
//! **A trait per model rather than one trait over an enum payload.** The
//! tempting single seam is `fn decide(&mut self, obs: &Obs) -> SubmittedCommand`,
//! and it was rejected on three counts. It would make every policy in this crate
//! carry a match arm for a model it will never run under. It would turn "wrong
//! model" into a runtime error, which is exactly the error
//! [`sim::World::submit_articulated_v1`] and [`sim::World::submit_embodied_v1`]
//! already refuse at the boundary -- a second refusal one layer up buys nothing.
//! And the model is chosen once, by the [`sim::Scenario`], and never mixes
//! inside a world, so a mismatch is static information: put it in the type and
//! it is a compile error instead of a silent run of bodies standing still. What
//! it costs is that the families do not compose -- there is no team wrapper that
//! runs one policy per side, for the reason [`ArticulatedPolicy`] gives.
//!
//! The articulated seam ships its control condition,
//! [`NeutralArticulatedPolicy`], and two fixed scripts --
//! [`ScriptedArticulatedPolicy`] and its [`WindmillArticulatedPolicy`]
//! comparison -- and for a long time nothing named any of them by number. That
//! was deliberate rather than pending: a registry code is what a saved
//! configuration or a URL carries and is append-only, and the only thing driving
//! an articulated policy was `lab articulated`, which knew the concrete types.
//! Nothing had yet had to *choose* one by number, and inventing the code before
//! then is a promise made early.
//!
//! **Something did, and it is a registry per seam rather than one shared code
//! space.** v2-ui-05 put an articulated fight behind a browser configuration, so
//! a policy per side arrives as an integer somebody wrote down;
//! [`ArticulatedPolicyKind`] is that registry, and [`EmbodiedPolicyKind`] is its
//! sibling rather than an extension of it. One code space meaning two things is
//! what the split refuses: `2` names `windmill` on one seam and
//! `scripted-level` on the other, on a page whose whole subject is watching the
//! same fight go differently when a dropdown moves. There were **three**
//! registries under the same argument, and the deleted one is the demonstration
//! -- `2` was `Idle` there, and a code space shared with it would now have a
//! retired policy's number in it.
//!
//! # What went with the legacy seam that nothing here replaces
//!
//! Written down because a deleted test leaves no trace, and two of these are
//! claims this crate used to make and now does not:
//!
//! * **That fighting well is something a policy *does*, separately from having
//!   good stats.** `tests/duel.rs` asserted it as a win rate over ninety-six
//!   fixed seeds -- the header's own words were that a win rate is the only
//!   honest way to state it. Its fixture and both its policies are gone. The
//!   embodied corpus reports win rates and *could* carry the claim; it does not
//!   carry it today, and `tests/embodied_script.rs` asserts behaviour rather than
//!   outcome.
//! * **That a policy which acts beats one that does nothing.**
//!   `doing_something_beats_doing_nothing` was the control-condition floor: any
//!   policy that cannot clear it is not playing, and any fitness function that
//!   cannot see the difference is not measuring. There is no surviving idle
//!   control to measure against -- [`NeutralArticulatedPolicy`] is the nearest
//!   thing and nothing races it.
//! * **That a policy instance can be reused across rollouts without one leaking
//!   into the next.** `reset` is still on both surviving traits and nothing
//!   checks that a caller who forgets to call it is caught.
//!
//! What did *not* go: reproducibility from a seed and exact replay, which
//! `tests/duel.rs`'s neighbours asserted here and which
//! `crates/sim/tests/determinism.rs` asserts for the surviving model. Those are
//! properties of the simulator rather than of a runner, and this is the better
//! place for them to have left from.

#![forbid(unsafe_code)]

mod articulated_script;
mod articulated_tactics;
mod composition;
mod embodied_script;
mod embodied_tactics;
mod neutral;
mod runner;

pub use articulated_script::{
    script_digest, scripted_articulated_command, scripted_articulated_command_with,
    windmill_articulated_command, ArmRoles, AttackFootwork, ClosingAttackControlPolicy,
    ScriptedArticulatedPolicy, WindmillArticulatedPolicy, CYCLE_TICKS, EIGHTH_TURN,
    GUARD_LEAD_TICKS, HEIGHT_TICKS, PHASE_TICKS, SCRIPT_DIGEST_DOMAIN,
};
pub use articulated_tactics::{
    robust_strike_schedule_command, OpeningsArticulatedPolicy, PlanScoring, StrikeDiagnostics,
    StrikePlan, StrikePlanner, StrikerArticulatedPolicy,
    TacticalArticulatedPolicy, TacticalContextV1, TacticalIntentV1, TacticalPhase,
    ThreatAssessmentV1, OPENINGS_POLICY_CODE, ROBUST_STRIKE_HEIGHT, ROBUST_STRIKE_TICKS,
    TACTICAL_INTENT_COUNT, TACTICAL_PHASE_COUNT, TACTICAL_POLICY_CODE,
};
pub use composition::{
    CommandAuthority, ComposedController, CompositionError, PartialEmbodiedSource, PolicySource,
};
pub use embodied_script::{
    neutral_embodied_command, scripted_embodied_command, scripted_embodied_command_with,
    EmbodiedPhase, EmbodiedScriptConfig, GroundSense, NeutralEmbodiedPolicy,
    ScriptedEmbodiedPolicy, EMBODIED_CYCLE_TICKS, EMBODIED_HEIGHT_TICKS, EMBODIED_PHASE_TICKS,
};
pub use embodied_tactics::{
    into_torso, into_torso_frame, TacticalEmbodiedPolicy, TACTICAL_EMBODIED_POLICY_CODE,
};
pub use neutral::{neutral_articulated_command, NeutralArticulatedPolicy};
pub use runner::{run_articulated, RunConfig, RunResult};

use sim::{ArticulatedCommandV1, ArticulatedObservation, EmbodiedCommandV1};

/// Turns a subject-scoped articulated observation into a decision.
///
/// The module header argues why each seam is its own trait rather than one
/// trait over an enum payload. Object-safe on purpose, so that a
/// `Box<dyn ArticulatedPolicy>` is available to [`ArticulatedPolicyKind::build`];
/// a sibling of an object-safe trait that quietly is not object-safe is a trap
/// nobody discovers until they reach for the box.
///
/// **There is no team wrapper that runs one policy per side, and that is a
/// property of the observation.** The deleted legacy seam had one, `TeamPolicy`,
/// and it worked by matching on `Observation::faction`.
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

    /// Clears any per-run memory. The harness calls it before each run so one
    /// rollout's opinions cannot leak into the next, which is what lets a
    /// single policy instance be reused across thousands of them.
    fn reset(&mut self) {}
}

// Two forwarders, because the harness takes `impl ArticulatedPolicy` by value:
// without these a caller that wants to keep its policy after the run -- which
// is every caller reusing one instance across rollouts -- would have to clone
// it, and a `dyn` one could not be driven at all.
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

/// Anything that can drive an embodied body: one observation in, one
/// [`EmbodiedCommandV1`] out.
///
/// **A third trait rather than a mode of [`ArticulatedPolicy`], because the
/// return type is the whole of the difference and it is not negotiable.** An
/// embodied command carries a swing plane an articulated one has no offsets for,
/// so a policy that produced an `ArticulatedCommandV1` for an embodied body
/// would be a policy that could not command an elbow -- and the adapter that
/// wrapped it would have to invent a plane, which is inventing state.
///
/// It takes an `ArticulatedObservation` because that is what an embodied body
/// produces: `CombatModel::has_articulated_columns` answers true for both
/// models, so the perception is shared even though the command is not. The name
/// is a wart that outlives its model, and retiring `Articulated` is the session
/// that gets to fix it.
///
/// Session 08 built [`ComposedController`] with an inherent `decide` because it
/// was the only thing of its kind; this is that shape promoted to a seam now
/// that a scripted embodied policy stands beside it.
pub trait EmbodiedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1;

    /// Clears any per-run memory, on [`ArticulatedPolicy::reset`]'s contract
    /// exactly.
    fn reset(&mut self) {}
}

// The same two forwarders the other trait has, for the same reason.
impl<P: EmbodiedPolicy + ?Sized> EmbodiedPolicy for &mut P {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

impl<P: EmbodiedPolicy + ?Sized> EmbodiedPolicy for Box<P> {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
        (**self).decide(obs)
    }

    fn reset(&mut self) {
        (**self).reset();
    }
}

/// Every articulated policy that can be named from outside this crate.
///
/// Exists so a policy can be chosen by a number: an integer crosses the wasm
/// boundary and a `--policy windmill` argument parses, without either of those
/// places needing to know what a `WindmillArticulatedPolicy` is. The codes are
/// **append-only** -- they are what a saved arena configuration or a URL
/// carries -- and this registry is [`EmbodiedPolicyKind`]'s sibling rather than
/// its superset, for the reason the module header gives.
///
/// There is no genome here and no spec of named knobs. Every one of these is a
/// fixed script with no evolvable weights, so the sliders the retired legacy
/// registry grew are absent rather than empty -- an articulated fight is
/// configured by its *loadout*, which is where the forty scalars went.
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
    /// [`Tactical`] ranking its candidates by what the opponent's plate does not
    /// cover, rather than by which region centre is nearest.
    ///
    /// [`Tactical`]: ArticulatedPolicyKind::Tactical
    Openings,
}

impl ArticulatedPolicyKind {
    pub const ALL: [ArticulatedPolicyKind; 7] = [
        ArticulatedPolicyKind::Neutral,
        ArticulatedPolicyKind::Composed,
        ArticulatedPolicyKind::Windmill,
        ArticulatedPolicyKind::AttackMoves,
        ArticulatedPolicyKind::Learned,
        ArticulatedPolicyKind::Tactical,
        ArticulatedPolicyKind::Openings,
    ];

    pub const fn code(self) -> u32 {
        match self {
            ArticulatedPolicyKind::Neutral => 0,
            ArticulatedPolicyKind::Composed => 1,
            ArticulatedPolicyKind::Windmill => 2,
            ArticulatedPolicyKind::AttackMoves => 3,
            ArticulatedPolicyKind::Learned => 4,
            ArticulatedPolicyKind::Tactical => TACTICAL_POLICY_CODE,
            ArticulatedPolicyKind::Openings => OPENINGS_POLICY_CODE,
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
            OPENINGS_POLICY_CODE => Some(ArticulatedPolicyKind::Openings),
            _ => None,
        }
    }

    pub fn from_name(name: &str) -> Option<ArticulatedPolicyKind> {
        ArticulatedPolicyKind::ALL.into_iter().find(|k| k.name() == name)
    }

    /// The name the studio and `lab` label this policy with.
    ///
    /// `lab articulated`'s own `--policy` vocabulary is `composed`, `windmill`,
    /// `tactical` and `openings`, and these are those words: an arena fight and
    /// a gate corpus that ran the same script should not be describable in two
    /// vocabularies. `attack-moves` is reachable there as `--attack-moves` over
    /// the composed script rather than as a `--policy` arm, and by name through
    /// `--hero-policy`/`--monster-policy`; `neutral` is not accepted by `lab` at
    /// all, and this comment claimed for some time that it was.
    pub const fn name(self) -> &'static str {
        match self {
            ArticulatedPolicyKind::Neutral => "neutral",
            ArticulatedPolicyKind::Composed => "composed",
            ArticulatedPolicyKind::Windmill => "windmill",
            ArticulatedPolicyKind::AttackMoves => "attack-moves",
            ArticulatedPolicyKind::Learned => "learned",
            ArticulatedPolicyKind::Tactical => "tactical",
            ArticulatedPolicyKind::Openings => "openings",
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
            ArticulatedPolicyKind::Openings => Some(Box::new(OpeningsArticulatedPolicy::default())),
        }
    }
}

/// Every embodied policy that can be named from outside this crate.
///
/// [`ArticulatedPolicyKind`]'s sibling under [`sim::CombatModel::Embodied`], and
/// a second enum rather than three more codes on that one -- see the module
/// header. The codes are **append-only** for the same reason its are: they are
/// what a saved configuration or a URL carries.
///
/// **[`EmbodiedPolicyKind::build`] returns a policy and not an `Option`, which
/// is where this one deliberately differs.** `ArticulatedPolicyKind` answers
/// `None` for its learned code because a trained fighter is a kind *plus fifteen
/// kilobytes of weights* and nothing keyed by an integer has anywhere to put a
/// checkpoint. Nothing here is a checkpoint. Session 09 measured the learning
/// boundary and deferred widening the network's input, so an embodied `Learned`
/// code would be a promise made before the session that owes it exists -- and
/// reserving one now would be predicting exactly the thing the plan declined to
/// predict. The day one arrives, the return type gains an `Option` and every
/// call site is told so by the compiler.
///
/// [`ComposedController`] is not a kind either, for the checkpoint argument's
/// shape rather than its subject: it is a *set of sources*, one of which is a
/// human hand, and an integer has nowhere to put a person.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default)]
pub enum EmbodiedPolicyKind {
    /// Stands there, arms slack. The control condition.
    #[default]
    Neutral,
    /// The scripted embodied policy: close, guard, circle, unwind, take the
    /// ground.
    Scripted,
    /// [`Scripted`] with the elevation term switched off -- the policy for which
    /// all ground is level.
    ///
    /// **It is a registry entry rather than a test-only constructor because it
    /// is what the measurement runs against**, and that comparison has to be
    /// reachable from a command line and named per side. It is mirrored and
    /// side-swapped rather than *bracketed*: a win rate over a fixed seed set is
    /// a pure function of the two policies and the fixture, so repeating it
    /// inside a round would report the same number twice and imply a variance
    /// that does not exist. What the repetitions cancel is the arena and the
    /// anatomy, not noise.
    ///
    /// On a flat fixture it is byte for byte [`Scripted`], which is what makes a
    /// difference measured on a sculpted corpus attributable to the term.
    ///
    /// [`Scripted`]: EmbodiedPolicyKind::Scripted
    ScriptedLevel,
    /// The strike planner behind the embodied seam: it names a region, prices
    /// the sweep that would cross it, and spends a commit on the best one.
    ///
    /// The first embodied policy that *aims*. The other three answer the
    /// question "what should a body be doing" without ever asking where the
    /// opponent is soft; this one picks a `BodyPart` and buys a sweep that
    /// crosses it. What it does not know is that the body it drives has hips --
    /// see [`TacticalEmbodiedPolicy`].
    Tactical,
}

impl EmbodiedPolicyKind {
    pub const ALL: [EmbodiedPolicyKind; 4] = [
        EmbodiedPolicyKind::Neutral,
        EmbodiedPolicyKind::Scripted,
        EmbodiedPolicyKind::ScriptedLevel,
        EmbodiedPolicyKind::Tactical,
    ];

    pub const fn code(self) -> u32 {
        match self {
            EmbodiedPolicyKind::Neutral => 0,
            EmbodiedPolicyKind::Scripted => 1,
            EmbodiedPolicyKind::ScriptedLevel => 2,
            EmbodiedPolicyKind::Tactical => TACTICAL_EMBODIED_POLICY_CODE,
        }
    }

    pub const fn from_code(code: u32) -> Option<EmbodiedPolicyKind> {
        match code {
            0 => Some(EmbodiedPolicyKind::Neutral),
            1 => Some(EmbodiedPolicyKind::Scripted),
            2 => Some(EmbodiedPolicyKind::ScriptedLevel),
            TACTICAL_EMBODIED_POLICY_CODE => Some(EmbodiedPolicyKind::Tactical),
            _ => None,
        }
    }

    pub fn from_name(name: &str) -> Option<EmbodiedPolicyKind> {
        EmbodiedPolicyKind::ALL.into_iter().find(|k| k.name() == name)
    }

    /// The name a report or a dropdown labels this policy with. Hyphenated like
    /// `attack-moves`, so one vocabulary describes a fight wherever it is run.
    pub const fn name(self) -> &'static str {
        match self {
            EmbodiedPolicyKind::Neutral => "neutral",
            EmbodiedPolicyKind::Scripted => "scripted",
            EmbodiedPolicyKind::ScriptedLevel => "scripted-level",
            EmbodiedPolicyKind::Tactical => "tactical",
        }
    }

    pub fn build(self) -> Box<dyn EmbodiedPolicy> {
        match self {
            EmbodiedPolicyKind::Neutral => Box::new(NeutralEmbodiedPolicy),
            EmbodiedPolicyKind::Scripted => {
                Box::new(ScriptedEmbodiedPolicy::new(EmbodiedScriptConfig::SEEKING))
            }
            EmbodiedPolicyKind::ScriptedLevel => {
                Box::new(ScriptedEmbodiedPolicy::new(EmbodiedScriptConfig::LEVEL))
            }
            EmbodiedPolicyKind::Tactical => Box::new(TacticalEmbodiedPolicy::default()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Fx;

    #[test]
    fn articulated_policy_codes_are_append_only_and_reserve_the_learned_one() {
        // These numbers are what a saved configuration carries. Reordering the
        // enum must not silently repoint anyone's saved choice at a different
        // policy. Plus the claim specific to this registry: code 4 is *named*
        // and refused rather than absent, so that the session which landed it
        // needed no edit here at all.
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
        assert_eq!(ArticulatedPolicyKind::Openings.code(), 6);
        assert_eq!(ArticulatedPolicyKind::from_code(5), Some(ArticulatedPolicyKind::Tactical));
        assert_eq!(ArticulatedPolicyKind::from_code(6), Some(ArticulatedPolicyKind::Openings));
        assert_eq!(ArticulatedPolicyKind::from_code(7), None);
        for kind in ArticulatedPolicyKind::ALL {
            assert_eq!(ArticulatedPolicyKind::from_code(kind.code()), Some(kind));
            assert_eq!(ArticulatedPolicyKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(ArticulatedPolicyKind::from_name("nonesuch"), None);
        assert!(ArticulatedPolicyKind::Learned.build().is_none());
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
    fn embodied_policy_codes_are_append_only() {
        // The same claim the other registry makes, and it is worth making twice
        // rather than once generically: these numbers are what a saved
        // configuration carries, and a generic helper over both enums would be
        // one place for both to be wrong together.
        assert_eq!(EmbodiedPolicyKind::Neutral.code(), 0);
        assert_eq!(EmbodiedPolicyKind::Scripted.code(), 1);
        assert_eq!(EmbodiedPolicyKind::ScriptedLevel.code(), 2);
        assert_eq!(EmbodiedPolicyKind::Tactical.code(), 3);
        // One past the registry, which is the refusal a `from_code` written as a
        // range check gets wrong. The number moves every time the vocabulary
        // grows, and `tools/wasm_check.js` writes it down a second time because
        // it is checking the *wasm* export rather than this function -- so when
        // this line moves, that one does too.
        assert_eq!(EmbodiedPolicyKind::from_code(4), None);
        for kind in EmbodiedPolicyKind::ALL {
            assert_eq!(EmbodiedPolicyKind::from_code(kind.code()), Some(kind));
            assert_eq!(EmbodiedPolicyKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(EmbodiedPolicyKind::from_name("nonesuch"), None);
    }

    #[test]
    fn every_embodied_kind_builds_and_decides() {
        let obs = sim::ArticulatedObservation::BLANK;
        for kind in EmbodiedPolicyKind::ALL {
            let mut policy = kind.build();
            let command = policy.decide(&obs);
            assert!(
                command.articulated.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                "{} produced an over-long move", kind.name()
            );
            policy.reset();
        }
    }

    /// The two registries do not share a code space, which is the whole reason
    /// there are two of them. The same integer names a different policy on each
    /// seam, so nothing may cross between them by number -- and `2` is the code
    /// that proves it, because both define one.
    ///
    /// **There were three, and the retired one is why this is worth keeping.**
    /// The legacy registry's `2` was `idle`; had the seams shared a code space,
    /// a saved configuration carrying it would now name either a deleted policy
    /// or, worse, a live one it was never pointed at.
    #[test]
    fn the_two_policy_registries_do_not_share_a_code_space() {
        assert_eq!(
            ArticulatedPolicyKind::from_code(2).map(ArticulatedPolicyKind::name),
            Some("windmill"),
        );
        assert_eq!(
            EmbodiedPolicyKind::from_code(2).map(EmbodiedPolicyKind::name),
            Some("scripted-level"),
        );
    }
}
