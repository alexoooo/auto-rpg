//! The learning probe: the population that trains one small network, and the
//! measurements that say whether it learned anything.
//!
//! This crate exists to answer one question -- *does a learned policy beat the
//! scripted one by enough to justify a larger roadmap* -- and v2-19 draws the
//! boundary it is allowed to answer it inside. The boundary is worth restating
//! here, because every design decision below follows from it:
//!
//! * **It may use floating point**, which nothing under `crates/fx`,
//!   `crates/sim` or the deterministic parts of `crates/policy` may. That is
//!   affordable for exactly one reason: no learned type reaches [`sim::World`],
//!   [`sim::Scenario`], [`sim::SubmittedCommand`], a replay, or a hash. What
//!   reaches the world is an [`sim::CommandV1`] built out of a fixed
//!   table of `Fx` constants, chosen by an argmax and then rotated into the
//!   torso frame by `policy::into_torso_frame`. The `f32` stops at the argmax --
//!   the rotation is `Fx` arithmetic on a table entry, which is why the frame
//!   adapter did not widen this boundary. [`learn_core`] carries that argument
//!   in full, because it owns the types it is about.
//! * No search, no browser learning host, no rollout workers, no skill catalog,
//!   no hierarchy, no workbench. Those are what an `expand` decision would
//!   authorise and this crate is what decides whether there is one.
//!
//! # What is here and what moved
//!
//! v2-ui-08 split the *inference* half out into [`learn_core`]: the feature
//! slice, the network, the action table and the checkpoint codec. What stayed
//! is the trainer -- [`probe`]'s `(mu + lambda)` population, its rollouts, its
//! scoring corpora and the `std::thread::scope` that drives them.
//!
//! **The split is an artifact boundary and not a rename**, and the direction is
//! the architecture. `learn_core` is `crates/web`'s dependency, so a trained
//! checkpoint can drive a body in the browser. This crate must not be: a trainer
//! needs threads, a clock and a filesystem, and a `cdylib` needs none of the
//! three. **`lab` is still its one host** -- through `lab learn-probe` and `lab
//! trace --policy learned` -- and everything `learn_core` exports is re-exported
//! below so that `lab` names one crate rather than two.
//!
//! **Nothing in the compiler enforces that**, and the sentence that said
//! otherwise was wrong. `AGENTS.md` gave the reason as "it does not compile to
//! `wasm32-unknown-unknown`"; measured on 2026-08-11, `cargo build --target
//! wasm32-unknown-unknown -p learn` **succeeds** -- `std::thread::scope` and
//! `std::time::Instant` compile for that target and trap at runtime instead. So
//! the boundary is the manifests and the test that walks them, and the reason to
//! keep it is what belongs in a browser artifact rather than what the linker
//! will let through.
//!
//! The standing instruction *if a second host for the learning crate ever
//! appears, check first that it is not `web`* was discharged for `learn_core` by
//! v2-ui-08: the check was made and the answer is that `web` may see `learn_core`
//! and may not see this crate. It stands unchanged for this one. `AGENTS.md`
//! carried both until 2026-08-18; `docs/architecture/learning.md`, under "The
//! boundary, which did not move", is where the rule and the answer live now.
//!
//! # The three versioned contracts
//!
//! [`LEARN_FEATURE_LAYOUT_VERSION`] is what the network reads,
//! [`LEARN_ACTION_LAYOUT_VERSION`] is what it may say, and [`ModelShape`] is how
//! big it is. All three are recorded in a [`Checkpoint`] and all three are
//! checked on load. They live in [`learn_core`] with the code they describe; the
//! trainer writes them into every artifact it produces.

#![forbid(unsafe_code)]

pub mod probe;

// The inference half, re-exported under its old names so that `lab` -- which is
// this crate's one host -- names one crate rather than two, and so that the
// split is invisible to every caller that did not need to know about it. Not a
// facade for its own sake: `probe` genuinely uses all of it, and a host that
// trains a model and then scores it would otherwise have to depend on both.
pub use learn_core::{checkpoint, digest, model};
pub use learn_core::{
    compose, hex, learned_inference_case, learned_inference_digest, sha256, write_features,
    write_features_v2, Checkpoint, CheckpointError, CheckpointV2, CheckpointV2Error,
    FeatureMemory, Footwork, LearnedActionV1, LearnedActionV2, LearnedCorePolicy,
    LearnedPolicy, LearnedTacticalPolicyV2, LearnedTacticalCorePolicyV2, Model,
    ModelShape, ModelShapeV2, ModelV2, Posture, Sha256,
    TrainingRecord,
    CHECKPOINT_FORMAT_VERSION, CHECKPOINT_MAGIC, CYCLE_TICKS, FOOTWORK_COUNT, GUARD_HEIGHT_COUNT,
    HEAD_OFFSETS,
    HEAD_WIDTHS, HIDDEN_UNITS, LEARNED_INFERENCE_CASES, LEARNED_INFERENCE_DIGEST_DOMAIN,
    LEARN_ACTION_LAYOUT_VERSION, LEARN_ACTION_LOGITS, LEARN_FEATURE_COUNT,
    LEARN_FEATURE_LAYOUT_VERSION, LEARN_V2_ACTION_LAYOUT_VERSION, LEARN_V2_ACTION_LOGITS,
    LEARN_V2_FEATURE_COUNT, LEARN_V2_FEATURE_LAYOUT_VERSION, POSTURE_COUNT,
    WEAPON_BEARING_COUNT, WEAPON_HEIGHT_COUNT,
};
pub use probe::{
    band, held_out_seeds, mirrored_embodied_duel, phase_offset, rollout, rollout_with, score,
    score_v2, shaped_return, train, train_v2, train_with, train_with_v2, training_seeds, Band,
    Corpus, Mechanics, Opponent,
    PhaseShiftedScript, ProbeConfig, Recorders, Rollout, HELD_OUT_SEED_BASE, RETURN_ATTRITION,
    RETURN_DECISION, RETURN_MUTUAL, RETURN_SURVIVAL, RETURN_TICK_DIVISOR, RETURN_WIN,
    SCRIPT_PERIOD_TICKS, TRAINING_SEED_BASE,
};
