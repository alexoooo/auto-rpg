# Smart AI 07 -- let learning choose tactics, not joint flailing

**Status:** complete -- the V2 contract and opt-in native probe path are present;
the unsuffixed V1 checkpoint, browser runtime, and inference digest remain unchanged.

**Goal:** define a v2 learned action as a tactical intent executed by the proven
fixed-point controller. Do not replace the shipped checkpoint or browser policy yet.

The v1 model at [`crates/learn-core/src/model.rs#L75`](../../crates/learn-core/src/model.rs#L75)
has 41 inputs and, at [`model.rs#L484`](../../crates/learn-core/src/model.rs#L484),
five independent low-level heads. Preserve those 41 columns and 18 logits in place.
Append 18 inputs and one eight-way head:

```rust
pub enum TacticalIntentV1 {
    Close,
    StrikeBest,
    StrikeWeaponArm,
    StrikeShieldArm,
    Guard,
    EvadeLeft,
    EvadeRight,
    Disengage,
}

pub const LEARN_V2_FEATURE_LAYOUT_VERSION: u32 = 2;
pub const LEARN_V2_FEATURE_COUNT: usize = 59;
pub const LEARN_V2_ACTION_LAYOUT_VERSION: u32 = 2;
pub const TACTICAL_INTENT_COUNT: usize = 8;
pub const LEARN_V2_ACTION_LOGITS: usize = 26;
```

The appended inputs are ten region scalars (body-frame bearing and nearest-surface
range for Head, Torso, LeftArm, RightArm, Legs), three threat scalars (closing speed,
ticks-to-crossing, crossing height), and a five-value one-hot `TacticalPhase`. Clamp
and normalize with named constants whose provenance is the session-02 corpus.

`LearnedActionV2` argmaxes logits 18..26 and hands the intent to the session-06
controller. Chamber/commit/recover remain controller-owned and cannot be contradicted
on the following tick. Keep `LearnedActionV1` as the decoder for layout-1 tests and
recordings; checkpoint loading refuses a layout/shape mismatch by name.

## Tests

```rust
#[test]
fn version_two_appends_without_repointing_a_version_one_feature() {}
#[test]
fn version_two_appends_intents_after_all_eighteen_old_logits() {}
#[test]
fn one_intent_runs_to_a_motor_boundary_before_the_next_is_sampled() {}
#[test]
fn mirrored_tactical_features_have_only_the_documented_sign_changes() {}
#[test]
fn a_version_one_checkpoint_is_refused_by_the_version_two_runtime() {}
#[test]
fn frozen_tactical_inference_allocates_nothing_after_warmup() {}
```

Break an old-column index and an intent offset to show the first two fail. Extend the
allocation counter in `crates/learn/tests/allocation.rs`; do not add another unsafe
exception.

This session adds `ModelV2`, `CheckpointV2`, and the native probe path behind an
explicit `--action-layout tactical-v2`. The existing unsuffixed exports, default, and
browser remain v1, so the current
`LEARNED_INFERENCE_DIGEST` and every simulation pin must remain unchanged. If the
current model types share implementation, keep separate fixed-size V1/V2 wrappers and
checkpoint validation; do not move the digest early.

## Verification

```powershell
cargo test -p learn-core
cargo test -p learn
cargo test -p lab
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
