# Hierarchical AI 02 -- choose the pair before the encounter

**Status:** proposed; blocked until session 01 demonstrates option headroom.

**Goal:** train a meta-policy that selects one complete `(loadout, strategy)` pair
before `World` construction, then holds that choice for the entire fight.

Add `MetaModelV1` and `MetaCheckpointV1` in
`crates/learn-core/src/hierarchy.rs`. Its inputs are a versioned vector of declared
encounter facts available to the host before construction: own anatomy, opponent
anatomy, opponent disclosed loadout, spawn separation bucket, and opponent-script
class in experimental corpora. Run and score two regimes separately:

- **blind:** unavailable opponent fields are zero with explicit presence bits;
- **disclosed:** only facts the encounter configuration actually exposes are set.

Never infer a missing field from scenario name, seed, entity id, or fixture order.
The output is an argmax over the checkpoint's ordered option-id list. The selected
loadout is applied while building `DuelConfigV1`; after construction, only that
option's strategy executes.

Add training to `crates/learn/src/hierarchy.rs` and expose it only through
`lab hierarchy train|evaluate` in `crates/lab/src/hierarchy.rs`. Reuse the repository's
population/holdout discipline, but store population, optimizer generation, evaluation
schedule, and RNG state in a resumable training artifact; the champion-only probe
checkpoint is not a resume format.

This is the contextual-bandit baseline for later hierarchy. It gets one choice and no
mid-fight switch, which separates the value of loadout/matchup selection from temporal
credit assignment.

## Tests and gate

```rust
#[test]
fn a_meta_checkpoint_pins_catalog_version_and_ordered_option_ids() {}
#[test]
fn absent_encounter_facts_have_presence_bits_and_cannot_leak_from_the_fixture() {}
#[test]
fn encounter_selection_happens_before_world_construction_exactly_once() {}
#[test]
fn interrupted_training_resumes_population_schedule_and_rng_byte_for_byte() {}
#[test]
fn selector_evaluation_is_paired_with_every_fixed_option() {}
```

On untouched held-out seeds, require the selector-minus-best-fixed paired 95% lower
bound to be positive and report blind and disclosed regimes independently. Also report
selection entropy and per-context option counts; a constant selector that happens to
win is a better fixed option, not evidence for hierarchy. Failure closes the session
`revise` and does not authorize temporal switching.

## Verification

```powershell
cargo test -p learn-core hierarchy
cargo test -p learn hierarchy
cargo test -p lab hierarchy
cargo run --release -p lab -- hierarchy train --level encounter
cargo run --release -p lab -- hierarchy evaluate --level encounter --seeds 400 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node --test tools/check_deps.test.js
node tools/check_docs.js
git diff --check
```

This native-only session moves no registered hash and installs no browser checkpoint.

