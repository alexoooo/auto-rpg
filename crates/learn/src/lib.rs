//! The learning probe: one small network, its frozen checkpoint, and the
//! population that trains it.
//!
//! This crate exists to answer one question -- *does a learned articulated
//! policy beat the scripted one by enough to justify a larger roadmap* -- and
//! v2-19 draws the boundary it is allowed to answer it inside. The boundary is
//! worth restating here, because every design decision below follows from it:
//!
//! * It depends on `sim` and `policy`, and the only host that may depend on it
//!   is native `lab`. Today **nothing does**: v2-19's `lab learn-probe`
//!   subcommand has not landed, so this crate is reachable from `cargo test -p
//!   learn` and from nowhere else. What matters either way is the other half --
//!   nothing in `crates/web` can see it, so no learned weight crosses the wasm
//!   wall, and `cargo build --target wasm32-unknown-unknown -p web` never
//!   compiles a line of it.
//! * **It may use floating point**, which nothing under `crates/fx`,
//!   `crates/sim` or the deterministic parts of `crates/policy` may. That is
//!   affordable for exactly one reason: no learned type reaches [`sim::World`],
//!   [`sim::Scenario`], [`sim::SubmittedCommand`], a replay, or a hash. What
//!   reaches the world is an [`sim::ArticulatedCommandV1`] built out of a fixed
//!   table of `Fx` constants, chosen by an argmax. The `f32` stops at the
//!   argmax.
//! * No search, no browser learning host, no rollout workers, no skill catalog,
//!   no hierarchy, no workbench. Those are what an `expand` decision would
//!   authorise and this crate is what decides whether there is one.
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
//! The seam is [`sim::World::submit_articulated_v1`], and the fence is its
//! signature. Here is the whole path from a network to a body, working:
//!
//! ```rust
//! use learn::{LearnedArticulatedPolicy, Model};
//! use policy::ArticulatedPolicy;
//! use sim::{Scenario, World};
//!
//! let scenario = Scenario::articulated_duel();
//! let mut world = World::new(&scenario, 1);
//! let mut brain = LearnedArticulatedPolicy::new(Model::zeros());
//!
//! let id = world.pending_decisions()[0];
//! let obs = world.observe_articulated(id);
//! world.submit_articulated_v1(id, brain.decide(&obs));
//! ```
//!
//! And here is the same program handing the world what the *network* actually
//! produced -- the five head indices, before the action table has turned them
//! into a command:
//!
//! ```compile_fail,E0308
//! use learn::{LearnedArticulatedPolicy, Model};
//! use policy::ArticulatedPolicy;
//! use sim::{Scenario, World};
//!
//! let scenario = Scenario::articulated_duel();
//! let mut world = World::new(&scenario, 1);
//! let mut brain = LearnedArticulatedPolicy::new(Model::zeros());
//!
//! let id = world.pending_decisions()[0];
//! let obs = world.observe_articulated(id);
//! world.submit_articulated_v1(id, brain.action(&obs));
//! ```
//!
//! **Read those two as a pair, and the pairing is what makes the fence
//! honest.** `policy`'s [`ArticulatedPolicy`] doctest records the reason and it
//! applies here unchanged: rustdoc only *enforces* a `compile_fail` error code
//! on nightly, and on the stable toolchain this repository pins the code is
//! parsed and ignored -- so the second block would pass on any compile error at
//! all, including a typo. What rules out the typo is that the two blocks are the
//! same program, differing in one method call. Measured on this toolchain the
//! second emits exactly one error, and it is `E0308: expected
//! ArticulatedCommandV1, found LearnedActionV1`.
//!
//! The value-level half of the same claim is
//! `training_types_cannot_enter_authoritative_state` in
//! `crates/learn/tests/boundary.rs`, which drives a learned policy through the
//! recording harness and reads what was written down.

#![forbid(unsafe_code)]

pub mod checkpoint;
pub mod model;
pub mod probe;

pub use checkpoint::{
    hex, sha256, Checkpoint, CheckpointError, Sha256, TrainingRecord, CHECKPOINT_FORMAT_VERSION,
    CHECKPOINT_MAGIC,
};
pub use model::{
    compose, write_features, FeatureMemory, Footwork, LearnedActionV1, LearnedArticulatedPolicy,
    Model, ModelShape, Posture, FOOTWORK_COUNT, GUARD_HEIGHT_COUNT, HEAD_OFFSETS, HEAD_WIDTHS,
    HIDDEN_UNITS, LEARN_ACTION_LAYOUT_VERSION, LEARN_ACTION_LOGITS, LEARN_FEATURE_COUNT,
    LEARN_FEATURE_LAYOUT_VERSION, POSTURE_COUNT, WEAPON_BEARING_COUNT, WEAPON_HEIGHT_COUNT,
};
pub use probe::{
    band, held_out_seeds, mirrored_articulated_duel, rollout, score, shaped_return, train,
    training_seeds, Band, Baseline, Corpus, ProbeConfig, Rollout, HELD_OUT_SEED_BASE,
    RETURN_ATTRITION, RETURN_DECISION, RETURN_MUTUAL, RETURN_SURVIVAL, RETURN_TICK_DIVISOR,
    RETURN_WIN, TRAINING_SEED_BASE,
};
