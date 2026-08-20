//! Frozen inference: what a learned fighter reads, what it may say, and the
//! bytes that name the one doing the reading.
//!
//! This is the half of `crates/learn` that a *host* needs. `learn` keeps the
//! trainer -- the population, the rollouts, `std::thread::scope` -- and depends
//! on this; `lab` is unaffected and reaches everything through `learn` exactly
//! as it did; `crates/web` depends on this crate and on nothing else of the
//! learning side.
//!
//! # Why the split exists, and why it does not break the rule it looks like it breaks
//!
//! `AGENTS.md` used to say `crates/learn` must stay unreachable from `web`, and
//! the *stated premise* of that rule was that floating point is affordable here
//! because **nothing this code computes reaches authoritative state**. That
//! premise is preserved rather than traded away:
//!
//! * [`LearnedActionV1`] is a separate type from [`sim::CommandCoreV1`]
//!   and its doc comment says why in as many words. What crosses from the float
//!   side to the integer side is **five small head indices**, produced by an
//!   argmax.
//! * [`sim::World::submit`] cannot be handed one, which the
//!   doctest pair below is what says.
//! * Nothing in `fx`, `sim` or `policy` can see this crate. The arrow points one
//!   way and `the_learned_policy_is_unreachable_from_sim` in
//!   `crates/learn-core/tests/direction.rs` asks Cargo for the resolved graph to
//!   say so. **That test is the whole of the enforcement** -- the compiler never
//!   did it -- which is why it reads the graph from `cargo tree` rather than
//!   from the manifest text three ordinary spellings got past.
//!
//! What the original rule was *also* protecting, without saying so, is the
//! artifact: `std::thread::scope` and a wall clock are in the trainer, and
//! neither belongs in a `cdylib`. Those stayed in `learn`. The one place this
//! crate still touches a filesystem is [`Checkpoint::read`] and
//! [`Checkpoint::write_atomically`], and both are compiled out on a wasm target
//! -- a browser has no path to read, and a checkpoint arrives there as bytes
//! somebody fetched. See those two functions.
//!
//! **The compiler is not what keeps `learn` out of a browser, and the rule used
//! to claim it was.** `AGENTS.md` gave the reason as "`learn` uses
//! `std::thread::scope` and does not compile to `wasm32-unknown-unknown`";
//! measured on 2026-08-11 it compiles perfectly well, because `std::thread` and
//! `std::time::Instant` exist on that target and trap at *runtime*. The rule is
//! right and its reason was not, so what holds the line is the manifests and
//! `the_learned_policy_is_unreachable_from_sim`, which reads them.
//!
//! # The claim this crate makes across targets
//!
//! [`Model::forward`] argues that a frozen checkpoint's argmax is reproducible
//! on any host, and until v2-ui-08 that was a claim with no second host to check
//! it on. wasm32 is the second host, and [`learned_inference_digest`] is what
//! holds the two to the same logits rather than merely to the same decision --
//! a shared argmax hides a divergence that has not yet crossed a decision
//! boundary, which is exactly the divergence worth catching early. The pin is
//! `LEARNED_INFERENCE_DIGEST` in
//! [`crates/web/src/lib.rs`](../../../crates/web/src/lib.rs) and
//! [`tools/wasm_check.js`](../../../tools/wasm_check.js), registered in
//! [`docs/reference/hashes.md`](../../../docs/reference/hashes.md).
//!
//! # The three versioned contracts
//!
//! [`LEARN_FEATURE_LAYOUT_VERSION`] is what the network reads,
//! [`LEARN_ACTION_LAYOUT_VERSION`] is what it may say, and [`ModelShape`] is how
//! big it is. All three are recorded in a [`Checkpoint`] and all three are
//! checked on load, because weights without their layouts are not a worse
//! policy -- they are a policy reading the wrong number out of every slot and
//! still producing confident answers. See [`crate::checkpoint`].
//!
//! # Training types cannot enter authoritative state
//!
//! The seam is [`sim::World::submit`], and the fence is its
//! signature. Here is the whole path from a network to a body, working:
//!
//! ```rust
//! use learn_core::{LearnedPolicy, Model};
//! use policy::Policy;
//! use sim::{Scenario, SubmitOutcome, World};
//!
//! let scenario = Scenario::embodied_duel();
//! let mut world = World::new(&scenario, 1);
//! let mut brain = LearnedPolicy::new(Model::zeros());
//!
//! let id = world.pending_decisions()[0];
//! let obs = world.observe(id);
//! let outcome = world.submit(id, brain.decide(&obs));
//! assert!(matches!(outcome, SubmitOutcome::Stored { rejection: None, .. }));
//! ```
//!
//! And here is the same program handing the world what the *network* actually
//! produced -- the five head indices, before the action table has turned them
//! into a command:
//!
//! ```compile_fail,E0308
//! use learn_core::{LearnedPolicy, Model};
//! use policy::Policy;
//! use sim::{Scenario, SubmitOutcome, World};
//!
//! let scenario = Scenario::embodied_duel();
//! let mut world = World::new(&scenario, 1);
//! let mut brain = LearnedPolicy::new(Model::zeros());
//!
//! let id = world.pending_decisions()[0];
//! let obs = world.observe(id);
//! let outcome = world.submit(id, brain.action(&obs));
//! assert!(matches!(outcome, SubmitOutcome::Stored { rejection: None, .. }));
//! ```
//!
//! **Read those two as a pair, and the pairing is what makes the fence
//! honest.** Rustdoc only *enforces* a `compile_fail` error code on nightly, and
//! on the stable toolchain this repository pins the code is parsed and ignored
//! -- so the second block would pass on any compile error at all, including a
//! typo. What rules out the typo is that the two blocks are the same program,
//! differing in one method call. Measured on this toolchain the second emits
//! exactly one error, and it is `E0308: expected CommandV1, found
//! LearnedActionV1`.
//!
//! **The assertion is not decoration.** `submit` compiles against
//! any world and answers `NotStored(WrongModel)` when the grammar disagrees, so
//! a first block that named the wrong scenario would still build, still run and
//! store nothing -- and, without the line under it, still pass. That is the
//! exact shape session 05 kept producing, and `Stored { rejection: None }` is
//! what makes the working half a claim about a body rather than about the type
//! checker.
//!
//! **The pair moved from `submit_articulated_v1` to `submit` in
//! session 05**, and the argument is carried across rather than dropped because
//! the fence was never about which model: it is that the type the network emits
//! and the type a world accepts are different types, and no submission entry of
//! either grammar takes the former. `policy`'s `ArticulatedPolicy` doctest used
//! to be where the `compile_fail` caveat above was recorded; that trait is
//! deleted, so it is recorded here.
//!
//! The value-level half of the same claim is
//! `training_types_cannot_enter_authoritative_state` in
//! `crates/learn/tests/boundary.rs`, which drives a learned policy through the
//! recording harness and reads what was written down. It stayed with the
//! trainer because it needs one: the harness it drives is `policy`'s, but the
//! model it drives through it is a *trained* one.

#![forbid(unsafe_code)]

pub mod checkpoint;
pub mod digest;
pub mod model;

pub use checkpoint::{
    hex, sha256, Checkpoint, CheckpointError, CheckpointV2, CheckpointV2Error, Sha256,
    TrainingRecord, CHECKPOINT_FORMAT_VERSION, CHECKPOINT_MAGIC,
};
pub use digest::{
    learned_inference_case, learned_inference_digest, LEARNED_INFERENCE_CASES,
    LEARNED_INFERENCE_DIGEST_DOMAIN,
};
pub use model::{
    compose, write_features, write_features_v2, FeatureMemory, Footwork, LearnedActionV1,
    LearnedActionV2, LearnedCorePolicy, LearnedPolicy,
    LearnedTacticalPolicyV2, LearnedTacticalCorePolicyV2, Model, ModelShape,
    ModelShapeV2, ModelV2, Posture, CYCLE_TICKS, FOOTWORK_COUNT, GUARD_HEIGHT_COUNT, HEAD_OFFSETS,
    HEAD_WIDTHS, HIDDEN_UNITS, LEARN_ACTION_LAYOUT_VERSION, LEARN_ACTION_LOGITS,
    LEARN_FEATURE_COUNT, LEARN_FEATURE_LAYOUT_VERSION, LEARN_V2_ACTION_LAYOUT_VERSION,
    LEARN_V2_ACTION_LOGITS, LEARN_V2_FEATURE_COUNT, LEARN_V2_FEATURE_LAYOUT_VERSION,
    POSTURE_COUNT, WEAPON_BEARING_COUNT, WEAPON_HEIGHT_COUNT,
};
