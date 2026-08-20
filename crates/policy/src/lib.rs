//! What agents decide, and the harness that asks them.
//!
//! There is **one** seam between the simulation and the AI, and it is a single
//! method:
//!
//! ```ignore
//! fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1; // EmbodiedPolicy
//! ```
//!
//! There were **three**, and the sentence the other two are worth keeping for
//! is the general one: everything downstream of this crate -- a neural policy,
//! an evolved controller, a scripted test dummy, a human's mouse -- is the same
//! signature, and the simulation cannot tell them apart and does not try to.
//! [`sim::CombatModel::Legacy`]'s seam was `fn decide(&Observation) -> Command`,
//! and it went with the model: a legacy contact was a disc with a blade angle
//! and the decision was where to stand, where a jointed opponent is a set of
//! swept volumes and two blades and the decision is which of them to put steel
//! into. Different question, different observation, different command, different
//! entry into [`sim::World`] -- which is exactly why the seams were separate
//! traits, and why deleting one took nothing out of the others. The articulated
//! seam went the same way in session 05, and its own argument for being separate
//! is what made it separable: its command had no swing plane, so it could not
//! command an elbow.
//!
//! **A trait per model rather than one trait over an enum payload**, and the
//! argument is written down here rather than deleted with the second trait,
//! because it is what says the *next* model gets a seam instead of a match arm.
//! The tempting single seam is `fn decide(&mut self, obs: &Obs) -> SubmittedCommand`,
//! and it was rejected on three counts. It would make every policy in this crate
//! carry a match arm for a model it will never run under. It would turn "wrong
//! model" into a runtime error, which is exactly the error
//! [`sim::World::submit_embodied_v1`] already refuses at the boundary -- a
//! second refusal one layer up buys nothing. And the model is chosen once, by
//! the [`sim::Scenario`], and never mixes inside a world, so a mismatch is
//! static information: put it in the type and it is a compile error instead of
//! a silent run of bodies standing still.
//!
//! What that cost, while there were two families, is that they did not compose
//! -- there was no team wrapper running one policy per side. **That cost was
//! never really the traits', and it survives them**, which is why it is still
//! written down: the legacy wrapper worked by matching on `Observation::faction`,
//! and [`sim::ArticulatedObservation`] has no faction column. It is subject
//! scoped, and "the other side" appears in it only as
//! [`opponents`](sim::ArticulatedObservation::opponents), already selected.
//! Adding the column back so a wrapper could match on it would publish a fact no
//! fighter perceives, and looking it up from the outside means handing the
//! wrapper the world, which is the one thing this seam refuses. Per-side routing
//! therefore belongs to whoever drives the run, which does know both factions.
//!
//! **The registry is per seam rather than one shared code space, and the two
//! retired seams are why that is still worth saying.** v2-ui-05 put a fight
//! behind a browser configuration, so a policy per side arrives as an integer
//! somebody wrote down; [`EmbodiedPolicyKind`] is that registry, and the codes
//! are **append-only** because they are what a saved arena configuration or a
//! URL carries. There were three such registries, one per seam, and a shared
//! code space would now hold two retired policies' numbers: `2` was `windmill`
//! on the articulated seam and `Idle` on the legacy one, where here it is
//! `scripted-level`. A saved configuration carrying it would name either a
//! deleted policy or, worse, a live one it was never pointed at.
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
//!   control to measure against -- [`NeutralEmbodiedPolicy`] is the nearest
//!   thing and nothing races it.
//! * **That a policy instance can be reused across rollouts without one leaking
//!   into the next.** `reset` is still on the surviving trait, and
//!   `an_embodied_policy_instance_can_be_reused_without_leaking_between_runs`
//!   is what checks that [`run_embodied`] calls it -- with a policy that
//!   tires as it decides, because a pure one answers the same either way.
//!
//! What did *not* go: reproducibility from a seed and exact replay, which
//! `tests/duel.rs`'s neighbours asserted here and which
//! `crates/sim/tests/determinism.rs` asserts for the surviving model. Those are
//! properties of the simulator rather than of a runner, and this is the better
//! place for them to have left from.

#![forbid(unsafe_code)]

mod composition;
mod embodied_footwork;
mod embodied_guard;
mod embodied_script;
mod embodied_tactics;
mod neutral;
mod runner;

pub use composition::{
    CommandAuthority, ComposedController, CompositionError, PartialEmbodiedSource,
};
pub use embodied_footwork::{
    Footwork, LUNGE_SPEED_RAW, MEASURE_MARGIN_RAW, MEASURE_MIN_FRACTION_RAW,
    UNWIND_TWIST_RAW,
};
pub use embodied_guard::{
    incoming_height, GuardCommand, GuardRead, GUARD_COMMIT_TICKS, GUARD_READ_DEADBAND_RAW,
};
pub use embodied_script::{
    neutral_embodied_command, scripted_embodied_command, scripted_embodied_command_with,
    EmbodiedPhase, EmbodiedScriptConfig, GroundSense, NeutralEmbodiedPolicy,
    ScriptedEmbodiedPolicy, EMBODIED_CYCLE_TICKS, EMBODIED_HEIGHT_TICKS, EMBODIED_PHASE_TICKS,
};
pub use embodied_tactics::{
    into_torso, into_torso_frame, PlanScoring, StrikeDiagnostics, StrikePlan, StrikePlanner,
    TacticalConfig, TacticalContextV1, TacticalEmbodiedPolicy, TacticalIntentV1, TacticalPhase,
    ThreatAssessmentV1, FIXED_GUARD_EMBODIED_POLICY_CODE, ROBUST_STRIKE_HEIGHT,
    ROBUST_STRIKE_TICKS, TACTICAL_EMBODIED_POLICY_CODE, TACTICAL_INTENT_COUNT,
    TACTICAL_PHASE_COUNT,
};
pub use neutral::neutral_articulated_command;
pub use runner::{run_embodied, RunConfig, RunResult};

use fx::Angle;
use sim::{ArticulatedObservation, EmbodiedCommandV1};

/// Anything that can drive an embodied body: one observation in, one
/// [`EmbodiedCommandV1`] out. **The seam**, singular, since session 05.
///
/// **It was a third trait rather than a mode of the articulated one, because
/// the return type was the whole of the difference and it was not
/// negotiable.** An embodied command carries a swing plane an articulated one
/// has no offsets for, so a policy that produced an `ArticulatedCommandV1` for
/// an embodied body would be a policy that could not command an elbow -- and
/// the adapter that wrapped it would have to invent a plane, which is inventing
/// state. That is also why the articulated seam could be deleted whole rather
/// than merged into this one: there was never an adapter between them to keep.
///
/// It takes an `ArticulatedObservation` because that is what an embodied body
/// produces: the perception was shared between the two models even though the
/// command was not. The name is a wart that outlives its model, and session 06
/// is the one that gets to fix it.
///
/// Session 08 built [`ComposedController`] with an inherent `decide` because it
/// was the only thing of its kind; this is that shape promoted to a seam now
/// that a scripted embodied policy stands beside it.
///
/// **There is no team wrapper that runs one policy per side**, and the module
/// header argues why: it is a property of the observation rather than of the
/// trait, so it did not go away when the seam it was first written about did.
///
/// # No `&World`, and the type system is what says so
///
/// A unit test can show that one policy did not read hidden state --
/// `an_embodied_policy_has_no_world_parameter` does exactly that, by
/// reproducing a whole run's commands from its observations with no world in
/// the room. Only the signature can show that *no* policy can. Here is the
/// whole surface, and a working implementation of it:
///
/// ```rust
/// use policy::{neutral_articulated_command, EmbodiedPolicy};
/// use sim::{ArticulatedObservation, EmbodiedCommandV1, Intent};
///
/// struct Lunger;
///
/// impl EmbodiedPolicy for Lunger {
///     fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
///         let mut command = EmbodiedCommandV1::new(neutral_articulated_command(obs));
///         if let Some(nearest) = obs.opponents().first() {
///             command.articulated.intent = Intent::Attack(nearest.id);
///         }
///         command
///     }
/// }
///
/// // A stale identity, a corpse and a blank observation all answer nothing in
/// // sight, so every policy has to survive one: nothing in sight, hold.
/// let mut lunger = Lunger;
/// let command = lunger.decide(&ArticulatedObservation::BLANK);
/// assert_eq!(command.articulated.intent, Intent::Hold);
/// ```
///
/// The same policy, wanting the authoritative world as well, has nowhere to put
/// it:
///
/// ```compile_fail,E0050
/// use policy::{neutral_articulated_command, EmbodiedPolicy};
/// use sim::{ArticulatedObservation, EmbodiedCommandV1, Intent, World};
///
/// struct Peeker;
///
/// impl EmbodiedPolicy for Peeker {
///     fn decide(
///         &mut self,
///         obs: &ArticulatedObservation,
///         world: &World,
///     ) -> EmbodiedCommandV1 {
///         let mut command = EmbodiedCommandV1::new(neutral_articulated_command(obs));
///         // Everything alive, not merely everything visible.
///         if let Some(&nearest) = world.alive_ids(sim::Faction::Monsters).first() {
///             command.articulated.intent = Intent::Attack(nearest);
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
/// parameter and the lines that use it. Measured on rustc 1.97.1 on
/// 2026-08-19, by compiling the second block as an ordinary integration
/// test: it emits exactly one error, and it is
/// ``E0050: method `decide` has 3 parameters but the declaration in trait
/// `decide` has 2``.
///
/// **The trait's own name is not in that sentence and the older copy of this
/// paragraph said it was** -- it read `in trait ArticulatedPolicy::decide`,
/// which this toolchain does not print. Left corrected rather than deleted,
/// because a quoted compiler message that nobody re-ran is exactly the kind of
/// number this repository asks to be measured at the moment it is needed.
///
/// **The pair was written against the articulated seam and moved here when that
/// seam was deleted**, which is the only reason a fence this old is dated this
/// year. Moving it rather than deleting it is the point: the claim was never
/// about which command came back, and the surviving trait is the one that now
/// has to be unable to see the world.
pub trait EmbodiedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1;

    /// Clears any per-run memory. The harness calls it before each run so
    /// one rollout's opinions cannot leak into the next, which is what lets
    /// a single policy instance be reused across thousands of them.
    fn reset(&mut self) {}
}

// Two forwarders, because the harness takes `impl EmbodiedPolicy` by value:
// without these a caller that wants to keep its policy after the run -- which
// is every caller reusing one instance across rollouts -- would have to clone
// it, and a `dyn` one could not be driven at all.
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

/// An eighth of a turn, raw.
///
/// Spelled out because [`Angle`] names [`Angle::QUARTER`] and [`Angle::HALF`]
/// and stops there, and the cut chamber offset is half a quarter. Written as a
/// constant rather than `Angle::QUARTER` halved so that the number in the
/// reference table and the number here are the same literal.
///
/// **Here rather than in a script, because it outlives every script.** It was
/// declared in `articulated_script.rs` and declared a second time, privately and
/// identically, in `articulated_tactics.rs`; session 05 deleted both files and
/// the number survived them -- the strike arcs either side of a bearing are an
/// eighth, the scripted guard arc is an eighth, and
/// `learn_core::model::BEARING_OFFSETS` is an eighth each way. That last one is
/// why the two copies were a hazard rather than a duplication:
/// `the_action_table_is_the_scripts_own_vocabulary` pins the learned action
/// table against *this* constant, so a private second copy that drifted would
/// move an action decode without moving the test that watches it.
pub const EIGHTH_TURN: Angle = Angle::from_raw(8_192);

/// Which arm guards and which arm strikes.
///
/// Both are read out of the capability mask and the published grips rather than
/// out of the scenario, because a policy has no scenario -- and because the
/// answer changes mid-fight when an arm comes off.
///
/// **Public because a measurement of this script cannot attribute a height
/// without it.** `lab articulated` reports the joint distribution of (attacker
/// weapon height, defender guard height), and "which of the two commanded arms
/// is the weapon" is a fact about the script rather than about the fixture: it
/// moves when an arm is severed, so a lab that re-derived it from the
/// capability mask would be a second copy of the rule below, free to drift from
/// it exactly when a fight got interesting.
///
/// **Beside the seam trait since session 05, because the paragraph above is
/// not really about a script.** The rule reads an
/// [`ArticulatedObservation`], which is what the seam takes, and what it
/// answers -- the right hand when both are armed, the live one when the right
/// came off -- is a fact about a *body*. The file it was written in has since
/// been deleted, and `embodied_script.rs`, `embodied_guard.rs` and the strike
/// planner all still ask it the same question about bodies that have no
/// script at all.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArmRoles {
    pub guard: usize,
    pub weapon: usize,
}

impl ArmRoles {
    pub fn of(obs: &ArticulatedObservation) -> ArmRoles {
        let weapon_bit = [
            ArticulatedObservation::LEFT_WEAPON,
            ArticulatedObservation::RIGHT_WEAPON,
        ];
        // The right hand when both are armed. That is the sim's own ownership
        // rule -- a two-handed item fills the right slot and clears the left
        // weapon bit -- so following it here keeps "the weapon arm" meaning the
        // arm that owns the collider.
        //
        // **A disarmed body still has to name one**, because the script is total
        // and the four attack phases have to point somewhere. The reference does
        // not cover this cell at all, so the fallback is a resolution: the right
        // arm, unless the right arm is the one that came off. A Fighter that has
        // lost its sword arm would otherwise spend a third of every cycle
        // swinging a stump *and* tucking the live shield the tuck rule takes
        // away from it -- defenceless and harmless at once -- which cannot be
        // what the table means by "the weapon arm" on a body that has none.
        //
        // Half of that stopped being true on 2026-08-10: the off arm now holds
        // [`off_hand`] rather than the tuck, so the wrong answer here would
        // leave that Fighter guarded and merely harmless instead of both. The
        // resolution does not change -- swinging a stump for a third of every
        // cycle is still the thing being avoided -- but the second clause of
        // the argument for it is gone and should not be quoted.
        let weapon = if obs.can(weapon_bit[1]) {
            1
        } else if obs.can(weapon_bit[0]) {
            0
        } else if obs.arms[1].severed && !obs.arms[0].severed {
            0
        } else {
            1
        };
        // The occupied hand that is not holding a weapon, which is the shield
        // hand without needing to know which side the shield binds to. Reading
        // `SHIELD` alone would not say *where* it is, and reading the equipment
        // id alone would need the spec table this side of the seam cannot see.
        let shield = if obs.can(ArticulatedObservation::SHIELD) {
            (0..2).find(|&i| obs.arms[i].equipment.is_some() && !obs.can(weapon_bit[i]))
        } else {
            None
        };
        ArmRoles {
            guard: shield.unwrap_or(weapon),
            weapon,
        }
    }
}

/// Every embodied policy that can be named from outside this crate.
///
/// The last of three, one per seam, and never a superset of the other two --
/// see the module header for why a code space is not shared. The codes are
/// **append-only**: they are what a saved configuration or a URL carries.
///
/// **[`EmbodiedPolicyKind::build`] returns a policy and not an `Option`, which
/// is where this one deliberately differed from its articulated sibling.**
/// That registry answered
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
    /// [`Tactical`] with the guard read switched off -- the policy whose plate
    /// goes where the body faces and never where the blade is.
    ///
    /// **A registry entry rather than a test-only constructor**, on
    /// [`ScriptedLevel`]'s argument exactly: it is what the guard measurement
    /// runs against, and that comparison has to be reachable from a command line
    /// and nameable per side. The control still *holds* a guard -- same arm,
    /// same reach, same effort, on the body's own centre line -- so the measured
    /// difference is the read and not "one of them has an arm up".
    ///
    /// [`Tactical`]: EmbodiedPolicyKind::Tactical
    /// [`ScriptedLevel`]: EmbodiedPolicyKind::ScriptedLevel
    TacticalFixedGuard,
}

impl EmbodiedPolicyKind {
    pub const ALL: [EmbodiedPolicyKind; 5] = [
        EmbodiedPolicyKind::Neutral,
        EmbodiedPolicyKind::Scripted,
        EmbodiedPolicyKind::ScriptedLevel,
        EmbodiedPolicyKind::Tactical,
        EmbodiedPolicyKind::TacticalFixedGuard,
    ];

    pub const fn code(self) -> u32 {
        match self {
            EmbodiedPolicyKind::Neutral => 0,
            EmbodiedPolicyKind::Scripted => 1,
            EmbodiedPolicyKind::ScriptedLevel => 2,
            EmbodiedPolicyKind::Tactical => TACTICAL_EMBODIED_POLICY_CODE,
            EmbodiedPolicyKind::TacticalFixedGuard => FIXED_GUARD_EMBODIED_POLICY_CODE,
        }
    }

    pub const fn from_code(code: u32) -> Option<EmbodiedPolicyKind> {
        match code {
            0 => Some(EmbodiedPolicyKind::Neutral),
            1 => Some(EmbodiedPolicyKind::Scripted),
            2 => Some(EmbodiedPolicyKind::ScriptedLevel),
            TACTICAL_EMBODIED_POLICY_CODE => Some(EmbodiedPolicyKind::Tactical),
            FIXED_GUARD_EMBODIED_POLICY_CODE => Some(EmbodiedPolicyKind::TacticalFixedGuard),
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
            EmbodiedPolicyKind::TacticalFixedGuard => "tactical-fixed-guard",
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
            EmbodiedPolicyKind::Tactical => {
                Box::new(TacticalEmbodiedPolicy::new(TacticalConfig::READING))
            }
            EmbodiedPolicyKind::TacticalFixedGuard => {
                Box::new(TacticalEmbodiedPolicy::new(TacticalConfig::FIXED_GUARD))
            }
        }
    }

    /// The same entry with its planner's feet told `footwork`, or `None` for an
    /// entry that has no planner to tell.
    ///
    /// **`None` rather than the entry built unchanged**, so that a caller
    /// handed a footwork row it cannot spend has to say so out loud. That is
    /// the shape of the bug two reviews of this repository found ten instances
    /// of: a flag accepted an input it could not act on and said nothing.
    /// `lab embodied --footwork` refuses the run by name when
    /// [`EmbodiedPolicyKind::reads_footwork`] is false on both sides.
    ///
    /// Nothing in the shipped registry goes through here. It exists so that
    /// **every sweep table in `docs/performance/embodied-tactical-policy.md` is
    /// reproducible from a command this repository ships** rather than from an
    /// edit to a constant and a rebuild, which is how session 04 produced them
    /// and why the review that followed could not check one of them.
    pub fn build_with_footwork(self, footwork: Footwork) -> Option<Box<dyn EmbodiedPolicy>> {
        let config = match self {
            EmbodiedPolicyKind::Tactical => TacticalConfig::READING,
            EmbodiedPolicyKind::TacticalFixedGuard => TacticalConfig::FIXED_GUARD,
            EmbodiedPolicyKind::Neutral
            | EmbodiedPolicyKind::Scripted
            | EmbodiedPolicyKind::ScriptedLevel => return None,
        };
        Some(Box::new(TacticalEmbodiedPolicy::with_footwork(config, footwork)))
    }

    /// Whether this entry drives a [`StrikePlanner`] and can therefore be
    /// handed a [`Footwork`] row at all.
    ///
    /// Written as its own arm rather than as `build_with_footwork(..).is_some()`
    /// because the caller that needs it is deciding whether to *refuse a run*,
    /// and building a policy to find out would be allocating a fighter in order
    /// to throw it away.
    pub const fn reads_footwork(self) -> bool {
        matches!(
            self,
            EmbodiedPolicyKind::Tactical | EmbodiedPolicyKind::TacticalFixedGuard
        )
    }

    /// Whether a constant offset added to `obs.tick` is a different fighter, or
    /// the same one.
    ///
    /// **The question is here because a control nobody can honour turns into the
    /// identity without saying so.** `learn::PhaseShiftedScript` shifts the tick
    /// its delegate reads and touches nothing else, so an entry whose behaviour
    /// does not depend on the absolute tick comes back byte for byte unchanged.
    /// What that costs is not a crash: `lab learn-probe` scores a second board
    /// against the phase-randomised opponent, labels it the control, and the
    /// verdict ladder then reasons about what phase randomisation cost over a
    /// difference that is structurally zero -- at twice the wall clock. So the
    /// registry answers the question and the commands refuse by name.
    ///
    /// **[`Tactical`] is the trap, and its answer is `false`.** It reads
    /// `obs.tick` in five places and every one of them is a *difference* --
    /// `obs.tick - self.phase_started` for the phase clock,
    /// `obs.tick - previous.tick` for the threat estimate -- so a constant
    /// offset cancels out of all of them. Grepping for `obs.tick` gets this
    /// entry wrong; only the fight settles it, which is why
    /// `learn`'s `the_registry_knows_which_opponent_a_phase_shift_can_move`
    /// runs one per entry and compares state hashes rather than trusting this
    /// paragraph.
    ///
    /// An exhaustive `match` rather than [`reads_footwork`]'s `matches!`, and
    /// the difference is the whole point: `matches!` carries a silent `false`
    /// arm, so an appended entry would inherit "no clock" without anybody
    /// having measured it. Here it fails to compile until somebody answers.
    ///
    /// [`Tactical`]: EmbodiedPolicyKind::Tactical
    /// [`reads_footwork`]: EmbodiedPolicyKind::reads_footwork
    pub const fn reads_the_clock(self) -> bool {
        match self {
            EmbodiedPolicyKind::Scripted | EmbodiedPolicyKind::ScriptedLevel => true,
            EmbodiedPolicyKind::Neutral
            | EmbodiedPolicyKind::Tactical
            | EmbodiedPolicyKind::TacticalFixedGuard => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Fx;

    #[test]
    fn embodied_policy_codes_are_append_only() {
        // These numbers are what a saved configuration carries. Reordering the
        // enum must not silently repoint anyone's saved choice at a different
        // policy.
        //
        // **There were three registries and this is the last, so nothing can
        // cross between code spaces by number any more -- which is why the
        // test that watched for it is gone rather than reseated.**
        // `the_two_policy_registries_do_not_share_a_code_space` asserted that
        // `2` named `windmill` on the articulated seam and `scripted-level`
        // here; with one registry left it had nothing to compare against and
        // would have been a green test asserting nothing. The claim it was
        // protecting is now a property of the tree rather than of a run: a
        // second seam that appends codes to *this* enum instead of declaring
        // its own is the regression, and no unit test can see it.
        assert_eq!(EmbodiedPolicyKind::Neutral.code(), 0);
        assert_eq!(EmbodiedPolicyKind::Scripted.code(), 1);
        assert_eq!(EmbodiedPolicyKind::ScriptedLevel.code(), 2);
        assert_eq!(EmbodiedPolicyKind::Tactical.code(), 3);
        assert_eq!(EmbodiedPolicyKind::TacticalFixedGuard.code(), 4);
        // One past the registry, which is the refusal a `from_code` written as a
        // range check gets wrong. The number moves every time the vocabulary
        // grows -- it was 4 until `tactical-fixed-guard` was appended -- and
        // `tools/wasm_check.js` writes it down a second time because it is
        // checking the *wasm* export rather than this function, so when this
        // line moves, that one does too.
        assert_eq!(EmbodiedPolicyKind::from_code(5), None);
        for kind in EmbodiedPolicyKind::ALL {
            assert_eq!(EmbodiedPolicyKind::from_code(kind.code()), Some(kind));
            assert_eq!(EmbodiedPolicyKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(EmbodiedPolicyKind::from_name("nonesuch"), None);
    }

    /// Only the two entries with a [`StrikePlanner`] behind them can be handed
    /// a footwork row, and the predicate that says so and the constructor that
    /// does it agree on which those are.
    ///
    /// **Both halves, so that neither can quietly widen.** A
    /// `build_with_footwork` that answered `Some` for the script would run a
    /// corpus under a policy nobody selected; a `reads_footwork` that answered
    /// `true` for it would make `lab embodied --footwork --policy scripted`
    /// accept a row it then silently drops, which is the refusal
    /// `AGENTS.md` names by name.
    #[test]
    fn only_a_kind_with_a_planner_can_be_handed_a_footwork_row() {
        let mut with_feet = 0;
        for kind in EmbodiedPolicyKind::ALL {
            let built = kind.build_with_footwork(Footwork::ARTICULATED);
            assert_eq!(
                built.is_some(), kind.reads_footwork(),
                "{} disagrees with itself about whether it has feet to tell", kind.name()
            );
            if let Some(mut policy) = built {
                with_feet += 1;
                let command = policy.decide(&sim::ArticulatedObservation::BLANK);
                assert!(
                    command.articulated.move_dir.length() <= Fx::ONE + Fx::from_ratio(1, 1000),
                    "{} produced an over-long move", kind.name()
                );
            }
        }
        assert_eq!(with_feet, 2, "the registry's planner-driven entries are tactical and its control");
        assert!(!EmbodiedPolicyKind::Scripted.reads_footwork(),
                "the frozen control grew feet a flag can move");
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
}
